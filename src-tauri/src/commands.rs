use crate::apps::{
    AppInspector, CleanOrphanedRequest, InstalledApp, OrphanedScanResult, UninstallAppRequest,
};
use crate::cleaner::{ActiveAppWarning, CleanRequest, CleanResult, Cleaner};
use crate::db::{
    AppPreferences, CleanupAnalyticsSummary, CleanupRecord, Database, DatabaseHealthReport,
    ExclusionDescriptor, HistoryQueryRequest, HistoryQueryResponse, ScanRecord, WhitelistEntry,
};
use crate::developer::{
    DeveloperArtifactItem, DeveloperCleanRequest, DeveloperEngine, DeveloperScanResult,
};
use crate::docker::{
    DockerCleanRequest, DockerCleanResult, DockerManager, DockerScanResult,
};
use crate::duplicates::{CleanDuplicatesRequest, DuplicateScanProgress, DuplicateScanResult, DuplicateScanner};
use crate::notifications::NotificationManager;
use crate::safety::SafetyGuard;
use crate::scanner::{ScanProgress, ScanResult, ScanScopeConfig, Scanner};
use crate::storage::{StorageAnalysisResult, StorageAnalyzer};
use crate::system::{SystemSummary, SystemTelemetry};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub db: Arc<Database>,
    pub scan_cancel_token: Arc<AtomicBool>,
    pub clean_cancel_token: Arc<AtomicBool>,
    pub duplicate_cancel_token: Arc<AtomicBool>,
    pub duplicate_clean_cancel_token: Arc<AtomicBool>,
    pub storage_cancel_token: Arc<AtomicBool>,
    pub developer_cancel_token: Arc<AtomicBool>,
}

#[tauri::command]
pub async fn get_system_metrics() -> Result<SystemSummary, String> {
    tokio::task::spawn_blocking(SystemTelemetry::get_system_summary)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    config: Option<ScanScopeConfig>,
) -> Result<ScanResult, String> {
    state.scan_cancel_token.store(false, Ordering::Relaxed);
    let cancel = state.scan_cancel_token.clone();
    let db = state.db.clone();
    let mut scan_config = config.unwrap_or_default();

    // Invariant: Merge all exclusions from SQLite so custom exclusions are always honored
    let stored_exclusions = db.get_all_exclusion_paths();
    for excl in stored_exclusions {
        if !scan_config.user_exclusions.contains(&excl) {
            scan_config.user_exclusions.push(excl);
        }
    }

    let result = tokio::task::spawn_blocking(move || {
        let app_handle = app.clone();
        let res = Scanner::scan_with_config(scan_config, cancel, move |prog: ScanProgress| {
            let _ = app_handle.emit("scan:progress", &prog);
        });

        // Save scan record to SQLite if scan found results and wasn't cancelled early
        if !res.was_cancelled {
            let record = ScanRecord {
                id: None,
                timestamp: chrono::Utc::now().to_rfc3339(),
                duration_ms: res.duration_ms,
                total_bytes_found: res.total_bytes,
                total_items_found: res.total_items,
                category_breakdown_json: serde_json::to_string(&res.categories).unwrap_or_else(|_| "[]".into()),
            };
            let _ = db.insert_scan_record(&record);

            // Dispatch notification if enabled in preferences
            if let Ok(prefs) = db.get_preferences() {
                if prefs.notify_scan_complete {
                    let msg = format!(
                        "Scan complete: {} items analyzed ({:.1} MB).",
                        res.total_items,
                        res.total_bytes as f64 / 1_048_576.0
                    );
                    let _ = NotificationManager::send("myclean", Some("Smart Scan"), &msg);
                }
            }
        }

        res
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(result)
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) -> bool {
    state.scan_cancel_token.store(true, Ordering::Relaxed);
    true
}

#[tauri::command]
pub async fn clean_items(
    state: State<'_, AppState>,
    request: CleanRequest,
) -> Result<CleanResult, String> {
    state.clean_cancel_token.store(false, Ordering::Relaxed);
    let cancel = state.clean_cancel_token.clone();
    let db = state.db.clone();
    let res = tokio::task::spawn_blocking(move || Cleaner::clean_items(request, &db, cancel))
        .await
        .map_err(|e| e.to_string())??;

    // Dispatch notification if configured in user preferences
    if let Ok(prefs) = state.db.get_preferences() {
        if prefs.notify_clean_complete && res.success {
            let msg = if res.dry_run {
                format!("Simulation complete: {} items evaluated.", res.items_deleted)
            } else {
                format!("Cleaned {} items. Moved to macOS Trash.", res.items_deleted)
            };
            let _ = NotificationManager::send("myclean", Some("Cleanup Complete"), &msg);
        } else if prefs.notify_clean_failure && !res.success {
            let _ = NotificationManager::send("myclean", Some("Cleanup Notice"), "Some items could not be moved to Trash.");
        }
    }

    Ok(res)
}

#[tauri::command]
pub fn cancel_clean(state: State<'_, AppState>) -> bool {
    state.clean_cancel_token.store(true, Ordering::Relaxed);
    true
}

#[tauri::command]
pub fn check_active_applications(paths: Vec<String>) -> Result<Vec<ActiveAppWarning>, String> {
    Ok(Cleaner::check_active_applications(&paths))
}

#[tauri::command]
pub async fn scan_duplicates(
    app: AppHandle,
    state: State<'_, AppState>,
    target_path: Option<String>,
    min_size_bytes: Option<u64>,
) -> Result<DuplicateScanResult, String> {
    state.duplicate_cancel_token.store(false, Ordering::Relaxed);
    let cancel = state.duplicate_cancel_token.clone();

    let target = if let Some(p_str) = target_path {
        let trimmed = p_str.trim();
        if trimmed.is_empty() || trimmed.contains('\0') {
            return Err("Duplicate scan path cannot be empty or contain null bytes".into());
        }
        SafetyGuard::check_path_traversal(trimmed).map_err(|e| e.to_string())?;
        let p = PathBuf::from(trimmed);
        if !p.is_dir() {
            return Err(format!("Duplicate scan target is not a valid directory: {}", trimmed));
        }
        if SafetyGuard::is_system_protected(&p) {
            return Err(format!("Duplicate scan rejected: '{}' is a protected macOS system location.", trimmed));
        }
        p.canonicalize().map_err(|e| e.to_string())?
    } else {
        dirs::download_dir().unwrap_or_else(|| PathBuf::from("/"))
    };

    let min_bytes = min_size_bytes.unwrap_or(1024 * 1024); // default 1MB

    tokio::task::spawn_blocking(move || {
        let app_handle = app.clone();
        DuplicateScanner::scan_duplicates_advanced(target, min_bytes, cancel, move |prog: DuplicateScanProgress| {
            let _ = app_handle.emit("duplicate:progress", &prog);
        })
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_duplicate_scan(state: State<'_, AppState>) -> bool {
    state.duplicate_cancel_token.store(true, Ordering::Relaxed);
    true
}

#[tauri::command]
pub async fn clean_duplicates(
    state: State<'_, AppState>,
    request: CleanDuplicatesRequest,
) -> Result<CleanResult, String> {
    state.duplicate_clean_cancel_token.store(false, Ordering::Relaxed);
    let cancel = state.duplicate_clean_cancel_token.clone();
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || DuplicateScanner::clean_duplicate_groups(request, &db, cancel))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_duplicate_clean(state: State<'_, AppState>) -> bool {
    state.duplicate_clean_cancel_token.store(true, Ordering::Relaxed);
    true
}

#[tauri::command]
pub async fn scan_applications(
    custom_dirs: Option<Vec<String>>,
) -> Result<Vec<InstalledApp>, String> {
    tokio::task::spawn_blocking(move || AppInspector::scan_applications(custom_dirs))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn scan_orphaned_data() -> Result<OrphanedScanResult, String> {
    tokio::task::spawn_blocking(AppInspector::scan_orphaned_data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn inspect_dropped_app(path: String) -> Result<InstalledApp, String> {
    tokio::task::spawn_blocking(move || AppInspector::inspect_dropped_app(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn uninstall_application(
    state: State<'_, AppState>,
    request: UninstallAppRequest,
) -> Result<CleanResult, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || AppInspector::uninstall_application(request, &db))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clean_orphaned_data(
    state: State<'_, AppState>,
    request: CleanOrphanedRequest,
) -> Result<CleanResult, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || AppInspector::clean_orphaned_data(request, &db))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_scan_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<ScanRecord>, String> {
    state
        .db
        .get_scan_history(limit.unwrap_or(20))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_cleanup_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<CleanupRecord>, String> {
    state
        .db
        .get_cleanup_history(limit.unwrap_or(30))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_whitelist(state: State<'_, AppState>) -> Result<Vec<WhitelistEntry>, String> {
    state.db.get_whitelist().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_to_whitelist(
    state: State<'_, AppState>,
    path: String,
    reason: String,
) -> Result<(), String> {
    state.db.add_whitelist(&path, &reason).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_from_whitelist(
    state: State<'_, AppState>,
    path: String,
) -> Result<bool, String> {
    state.db.remove_whitelist(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_app_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    state.db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_app_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    state.db.set_setting(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_preferences(state: State<'_, AppState>) -> Result<AppPreferences, String> {
    state.db.get_preferences().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_preferences(
    state: State<'_, AppState>,
    preferences: AppPreferences,
) -> Result<AppPreferences, String> {
    state.db.update_preferences(preferences).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_exclusions(state: State<'_, AppState>) -> Result<Vec<ExclusionDescriptor>, String> {
    state.db.get_all_exclusions().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_custom_exclusion(
    state: State<'_, AppState>,
    path: String,
    reason: String,
) -> Result<ExclusionDescriptor, String> {
    state.db.add_custom_exclusion(&path, &reason)
}

#[tauri::command]
pub fn remove_custom_exclusion(
    state: State<'_, AppState>,
    path: String,
) -> Result<bool, String> {
    state.db.remove_custom_exclusion(&path)
}

#[tauri::command]
pub fn query_cleanup_history(
    state: State<'_, AppState>,
    request: HistoryQueryRequest,
) -> Result<HistoryQueryResponse, String> {
    state.db.query_cleanup_history(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_cleanup_analytics(
    state: State<'_, AppState>,
) -> Result<CleanupAnalyticsSummary, String> {
    state.db.get_cleanup_analytics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_database_integrity(
    state: State<'_, AppState>,
) -> Result<DatabaseHealthReport, String> {
    state.db.check_database_integrity().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prune_history_by_retention(
    state: State<'_, AppState>,
    retention_days: u64,
) -> Result<usize, String> {
    state.db.prune_history(retention_days).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_cleanup_history(
    state: State<'_, AppState>,
    confirmed: bool,
) -> Result<(), String> {
    state.db.clear_cleanup_history(confirmed)
}

#[tauri::command]
pub fn clear_scan_history(
    state: State<'_, AppState>,
    confirmed: bool,
) -> Result<(), String> {
    state.db.clear_scan_history(confirmed)
}

#[tauri::command]
pub fn send_test_notification() -> Result<(), String> {
    NotificationManager::send(
        "myclean",
        Some("Preferences Check"),
        "Notifications are functioning normally. All safety guardrails active.",
    )
}

#[tauri::command]
pub async fn analyze_storage(
    state: State<'_, AppState>,
    path: Option<String>,
    max_depth: Option<usize>,
) -> Result<StorageAnalysisResult, String> {
    state.storage_cancel_token.store(false, Ordering::Relaxed);
    let cancel = state.storage_cancel_token.clone();

    let target_path = if let Some(p_str) = path {
        let trimmed = p_str.trim();
        if trimmed.is_empty() || trimmed.contains('\0') {
            return Err("Storage analysis path cannot be empty or contain null bytes".into());
        }
        SafetyGuard::check_path_traversal(trimmed).map_err(|e| e.to_string())?;
        let p = PathBuf::from(trimmed);
        if !p.exists() {
            return Err(format!("Storage analysis path does not exist: {}", trimmed));
        }
        if SafetyGuard::is_system_protected(&p) {
            return Err(format!("Storage analysis rejected: '{}' is a protected macOS system location.", trimmed));
        }
        p.canonicalize().map_err(|e| e.to_string())?
    } else {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
    };

    let depth = max_depth.unwrap_or(4).min(8);

    tokio::task::spawn_blocking(move || {
        StorageAnalyzer::analyze(target_path, depth, cancel)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_storage_analysis(state: State<'_, AppState>) -> bool {
    state.storage_cancel_token.store(true, Ordering::Relaxed);
    true
}

#[tauri::command]
pub fn open_in_finder(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') || trimmed.contains('\0') {
        return Err("Invalid path parameter".into());
    }
    SafetyGuard::check_path_traversal(trimmed).map_err(|e| e.to_string())?;

    let p = std::path::Path::new(trimmed);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", trimmed));
    }

    let canonical = p.canonicalize().map_err(|e| format!("Cannot resolve path: {}", e))?;

    std::process::Command::new("open")
        .arg("-R")
        .arg("--")
        .arg(&canonical)
        .spawn()
        .map_err(|e| format!("Failed to open in Finder: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn scan_developer_spaces(
    state: State<'_, AppState>,
    workspaces: Option<Vec<String>>,
) -> Result<DeveloperScanResult, String> {
    state.developer_cancel_token.store(false, Ordering::Relaxed);
    let cancel = state.developer_cancel_token.clone();
    tokio::task::spawn_blocking(move || DeveloperEngine::scan_all(workspaces, &cancel))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_developer_scan(state: State<'_, AppState>) -> bool {
    state.developer_cancel_token.store(true, Ordering::Relaxed);
    true
}

#[tauri::command]
pub async fn inspect_developer_workspace(
    workspace_path: String,
) -> Result<Vec<DeveloperArtifactItem>, String> {
    let trimmed = workspace_path.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err("Workspace path cannot be empty or contain null bytes".into());
    }
    SafetyGuard::check_path_traversal(trimmed).map_err(|e| e.to_string())?;

    let p = PathBuf::from(trimmed);
    if !p.is_dir() {
        return Err(format!("Workspace path '{}' is not a valid directory", trimmed));
    }
    if SafetyGuard::is_system_protected(&p) {
        return Err(format!("Cannot inspect system-protected directory: {}", trimmed));
    }

    let canonical = p.canonicalize().map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        DeveloperEngine::inspect_single_workspace(&canonical)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clean_developer_artifacts(
    state: State<'_, AppState>,
    request: DeveloperCleanRequest,
    workspaces: Option<Vec<String>>,
) -> Result<CleanResult, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || DeveloperEngine::clean_artifacts(request, workspaces, &db))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn inspect_docker() -> Result<DockerScanResult, String> {
    tokio::task::spawn_blocking(DockerManager::inspect)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clean_docker_resources(
    state: State<'_, AppState>,
    request: DockerCleanRequest,
) -> Result<DockerCleanResult, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || DockerManager::clean(request, &db))
        .await
        .map_err(|e| e.to_string())?
}


