use crate::apps::{AppInspector, InstalledApp};
use crate::cleaner::{ActiveAppWarning, CleanRequest, CleanResult, Cleaner};
use crate::db::{CleanupRecord, Database, ScanRecord, WhitelistEntry};
use crate::duplicates::{CleanDuplicatesRequest, DuplicateScanProgress, DuplicateScanResult, DuplicateScanner};
use crate::scanner::{ScanProgress, ScanResult, ScanScopeConfig, Scanner};
use crate::storage::{StorageAnalysisResult, StorageAnalyzer};
use crate::system::{SystemSummary, SystemTelemetry};
use std::path::PathBuf;
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
    let scan_config = config.unwrap_or_default();

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
    tokio::task::spawn_blocking(move || Cleaner::clean_items(request, &db, cancel))
        .await
        .map_err(|e| e.to_string())?
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

    let target = target_path
        .map(PathBuf::from)
        .or_else(dirs::download_dir)
        .unwrap_or_else(|| PathBuf::from("/"));

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
pub async fn scan_applications() -> Result<Vec<InstalledApp>, String> {
    tokio::task::spawn_blocking(AppInspector::scan_applications)
        .await
        .map_err(|e| e.to_string())
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
pub async fn analyze_storage(
    state: State<'_, AppState>,
    path: Option<String>,
    max_depth: Option<usize>,
) -> Result<StorageAnalysisResult, String> {
    state.storage_cancel_token.store(false, Ordering::Relaxed);
    let cancel = state.storage_cancel_token.clone();

    let target_path = path
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("/"));

    let depth = max_depth.unwrap_or(4);

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
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open in Finder: {}", e))?;
    Ok(())
}

