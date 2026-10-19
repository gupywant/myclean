use crate::cleaner::{CleanErrorItem, CleanResult, CleanupAuditDetail};
use crate::db::{CleanupRecord, Database};
use crate::safety::SafetyGuard;
use crate::scanner::Scanner;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use sysinfo::ProcessesToUpdate;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ConfidenceLevel {
    High,
    ReviewRequired,
    Protected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppArtifact {
    pub path: String,
    pub kind: String, // "Application Bundle", "Application Support", "Caches", "Preferences", "Saved State", "HTTPStorages", "WebKit", "Logs", "Containers"
    pub size_bytes: u64,
    pub allocated_bytes: u64,
    pub confidence: ConfidenceLevel,
    pub is_database_or_persistent: bool,
    pub explanation: String,
    pub is_selected_by_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub name: String,
    pub bundle_id: String,
    pub version: String,
    pub publisher: Option<String>,
    pub app_path: String,
    pub icon_data_url: Option<String>,
    pub installation_source: String, // "Mac App Store", "Homebrew Cask", "User Installed", "System Application"
    pub is_system_app: bool,
    pub is_running: bool,
    pub running_pids: Vec<u32>,
    pub last_modified: Option<String>,
    pub total_size_bytes: u64,
    pub allocated_size_bytes: u64,
    pub binary_size_bytes: u64,
    pub binary_allocated_bytes: u64,
    pub artifacts: Vec<AppArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrphanedAppArtifact {
    pub path: String,
    pub bundle_id: String,
    pub kind: String,
    pub size_bytes: u64,
    pub allocated_bytes: u64,
    pub confidence: ConfidenceLevel,
    pub explanation: String,
    pub last_modified: Option<String>,
    pub is_eligible_for_cleanup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrphanedScanResult {
    pub total_items: usize,
    pub total_bytes: u64,
    pub total_allocated_bytes: u64,
    pub items: Vec<OrphanedAppArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallAppRequest {
    pub app_path: String,
    pub bundle_id: String,
    pub paths_to_delete: Vec<String>,
    pub dry_run: bool,
    pub confirmed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanOrphanedRequest {
    pub paths: Vec<String>,
    pub dry_run: bool,
    pub confirmed: bool,
}

#[derive(Debug, Default, Clone)]
pub struct ParsedAppPlist {
    pub bundle_id: Option<String>,
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub version: Option<String>,
    pub publisher: Option<String>,
    pub icon_file: Option<String>,
}

pub struct AppInspector;

impl AppInspector {
    /// Pure Rust Base64 encoder (zero external dependencies)
    pub fn base64_encode(data: &[u8]) -> String {
        const TABLE: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
        for chunk in data.chunks(3) {
            let b0 = chunk[0];
            let b1 = chunk.get(1).copied().unwrap_or(0);
            let b2 = chunk.get(2).copied().unwrap_or(0);
            out.push(TABLE[(b0 >> 2) as usize] as char);
            out.push(TABLE[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
            if chunk.len() > 1 {
                out.push(TABLE[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
            } else {
                out.push('=');
            }
            if chunk.len() > 2 {
                out.push(TABLE[(b2 & 0x3F) as usize] as char);
            } else {
                out.push('=');
            }
        }
        out
    }

    /// Extract a string field from Info.plist XML text (fallback parser)
    pub fn extract_plist_key(content: &str, key: &str) -> Option<String> {
        let pattern = format!("<key>{}</key>", key);
        if let Some(pos) = content.find(&pattern) {
            let rest = &content[pos + pattern.len()..];
            if let Some(string_start) = rest.find("<string>") {
                let val_start = string_start + "<string>".len();
                if let Some(string_end) = rest[val_start..].find("</string>") {
                    return Some(rest[val_start..val_start + string_end].trim().to_string());
                }
            }
        }
        None
    }

    /// Robust Info.plist parser supporting both binary and XML plists via `plutil` with XML text fallback
    pub fn read_info_plist(info_plist_path: &Path) -> ParsedAppPlist {
        // Attempt native plutil JSON conversion first (handles binary bplist and XML)
        if let Ok(output) = std::process::Command::new("plutil")
            .args([
                "-convert",
                "json",
                "-o",
                "-",
                &info_plist_path.to_string_lossy(),
            ])
            .output()
        {
            if output.status.success() {
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                    let bid = v["CFBundleIdentifier"].as_str().map(|s| s.to_string());
                    let bname = v["CFBundleName"].as_str().map(|s| s.to_string());
                    let dname = v["CFBundleDisplayName"].as_str().map(|s| s.to_string());
                    let ver = v["CFBundleShortVersionString"]
                        .as_str()
                        .or_else(|| v["CFBundleVersion"].as_str())
                        .map(|s| s.to_string());
                    let publ = v["NSHumanReadableCopyright"]
                        .as_str()
                        .or_else(|| v["CFBundleGetInfoString"].as_str())
                        .map(|s| s.to_string());
                    let icon = v["CFBundleIconFile"]
                        .as_str()
                        .or_else(|| v["CFBundleIconName"].as_str())
                        .map(|s| s.to_string());
                    return ParsedAppPlist {
                        bundle_id: bid,
                        name: bname,
                        display_name: dname,
                        version: ver,
                        publisher: publ,
                        icon_file: icon,
                    };
                }
            }
        }

        // Fallback: XML string extraction
        if let Ok(content) = fs::read_to_string(info_plist_path) {
            let bid = Self::extract_plist_key(&content, "CFBundleIdentifier");
            let bname = Self::extract_plist_key(&content, "CFBundleName");
            let dname = Self::extract_plist_key(&content, "CFBundleDisplayName");
            let ver = Self::extract_plist_key(&content, "CFBundleShortVersionString")
                .or_else(|| Self::extract_plist_key(&content, "CFBundleVersion"));
            let publ = Self::extract_plist_key(&content, "NSHumanReadableCopyright")
                .or_else(|| Self::extract_plist_key(&content, "CFBundleGetInfoString"));
            let icon = Self::extract_plist_key(&content, "CFBundleIconFile")
                .or_else(|| Self::extract_plist_key(&content, "CFBundleIconName"));
            return ParsedAppPlist {
                bundle_id: bid,
                name: bname,
                display_name: dname,
                version: ver,
                publisher: publ,
                icon_file: icon,
            };
        }

        ParsedAppPlist::default()
    }

    /// Extract native macOS application icon to a crisp base64 PNG data URL using `sips`
    pub fn extract_icon_base64(
        app_path: &Path,
        icon_name: Option<&str>,
        bundle_id: &str,
    ) -> Option<String> {
        let resources = app_path.join("Contents/Resources");
        if !resources.exists() {
            return None;
        }

        let mut candidate_icns: Option<PathBuf> = None;
        if let Some(name) = icon_name {
            let p1 = resources.join(name);
            let p2 = resources.join(format!("{}.icns", name));
            if p2.exists() {
                candidate_icns = Some(p2);
            } else if p1.exists() {
                candidate_icns = Some(p1);
            }
        }

        if candidate_icns.is_none() {
            if let Ok(entries) = fs::read_dir(&resources) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().map(|e| e == "icns").unwrap_or(false) {
                        candidate_icns = Some(p);
                        break;
                    }
                }
            }
        }

        let icns_path = candidate_icns?;
        let home = dirs::home_dir()?;
        let cache_dir = home.join("Library/Caches/com.myclean.app/icons");
        let _ = fs::create_dir_all(&cache_dir);

        let safe_bid = bundle_id
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '.' { c } else { '_' })
            .collect::<String>();
        let cached_png = cache_dir.join(format!("{}.png", safe_bid));

        if !cached_png.exists() {
            let _ = std::process::Command::new("sips")
                .args([
                    "-s",
                    "format",
                    "png",
                    &icns_path.to_string_lossy(),
                    "--out",
                    &cached_png.to_string_lossy(),
                    "-z",
                    "64",
                    "64",
                ])
                .output();
        }

        if let Ok(bytes) = fs::read(&cached_png) {
            if !bytes.is_empty() {
                return Some(format!(
                    "data:image/png;base64,{}",
                    Self::base64_encode(&bytes)
                ));
            }
        }
        None
    }

    /// Check if an application bundle or any of its bundled helper processes is currently running on macOS
    pub fn check_app_running_status(app_path: &Path) -> (bool, Vec<u32>) {
        let canonical = match app_path.canonicalize() {
            Ok(c) => c,
            Err(_) => app_path.to_path_buf(),
        };

        let mut system = sysinfo::System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);

        let mut pids = Vec::new();
        let app_str = canonical.to_string_lossy();
        let app_stem = canonical
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        for (pid, proc) in system.processes() {
            if let Some(exe) = proc.exe() {
                if exe.starts_with(&canonical) {
                    pids.push(pid.as_u32());
                    continue;
                }
            }

            let name = proc.name().to_string_lossy();
            if !app_stem.is_empty() && name.eq_ignore_ascii_case(&app_stem) {
                if let Some(exe) = proc.exe() {
                    if exe.to_string_lossy().starts_with(&*app_str) {
                        pids.push(pid.as_u32());
                    }
                }
            }
        }

        let is_running = !pids.is_empty();
        (is_running, pids)
    }

    /// Check whether an application is a protected Apple system application (SIP/Core)
    pub fn is_system_application(app_path: &Path) -> bool {
        let path_str = app_path.to_string_lossy();
        path_str.starts_with("/System")
            || path_str.starts_with("/Library/Apple")
            || path_str.starts_with("/System/Applications")
            || path_str.starts_with("/System/Library")
    }

    /// Discover installed applications and all related artifacts across standard and user-selected locations
    pub fn scan_applications(custom_dirs: Option<Vec<String>>) -> Vec<InstalledApp> {
        let mut apps = Vec::new();
        let mut search_dirs = vec![
            PathBuf::from("/Applications"),
            PathBuf::from("/Applications/Utilities"),
        ];

        if let Some(home) = dirs::home_dir() {
            let user_apps = home.join("Applications");
            if user_apps.exists() {
                search_dirs.push(user_apps);
            }
        }

        if let Some(extra_dirs) = custom_dirs {
            for dir_str in extra_dirs {
                let p = PathBuf::from(dir_str);
                if p.exists() && p.is_dir() && !search_dirs.contains(&p) {
                    search_dirs.push(p);
                }
            }
        }

        let mut visited_app_paths = HashSet::new();

        for dir in search_dirs {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() && path.extension().map(|e| e == "app").unwrap_or(false) {
                        let canonical = match path.canonicalize() {
                            Ok(c) => c,
                            Err(_) => path.clone(),
                        };

                        if visited_app_paths.insert(canonical.clone()) {
                            if let Some(app) = Self::inspect_app_bundle(&canonical) {
                                apps.push(app);
                            }
                        }
                    }
                }
            }
        }

        apps.sort_by_key(|a| std::cmp::Reverse(a.total_size_bytes));
        apps
    }

    /// Inspect a single `.app` bundle, resolving its metadata, running status, and related Library artifacts
    pub fn inspect_app_bundle(app_path: &Path) -> Option<InstalledApp> {
        let info_plist_path = app_path.join("Contents/Info.plist");
        let app_stem = app_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown App".to_string());

        let parsed = if info_plist_path.exists() {
            Self::read_info_plist(&info_plist_path)
        } else {
            ParsedAppPlist::default()
        };

        let bundle_id = parsed.bundle_id.unwrap_or_else(|| app_stem.clone());
        let name = parsed
            .display_name
            .or(parsed.name)
            .unwrap_or_else(|| app_stem.clone());
        let version = parsed.version.unwrap_or_else(|| "1.0".to_string());
        let publisher = parsed.publisher;
        let icon_file = parsed.icon_file;

        let is_system_app = Self::is_system_application(app_path);

        let installation_source = if is_system_app {
            "System Application".to_string()
        } else if app_path.join("Contents/_MASReceipt/receipt").exists() {
            "Mac App Store".to_string()
        } else if app_path.to_string_lossy().contains("Caskroom") {
            "Homebrew Cask".to_string()
        } else {
            "User Installed".to_string()
        };

        let last_modified = fs::metadata(app_path)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        // Measure application binary footprint
        let mut visited_inodes = HashSet::new();
        let mut skipped = Vec::new();
        let cancel = AtomicBool::new(false);
        let (binary_alloc, binary_size, _) = Scanner::measure_path_detailed(
            app_path,
            &mut visited_inodes,
            &mut skipped,
            &[],
            &cancel,
        );

        let icon_data_url = Self::extract_icon_base64(app_path, icon_file.as_deref(), &bundle_id);
        let (is_running, running_pids) = Self::check_app_running_status(app_path);

        let mut artifacts = vec![AppArtifact {
            path: app_path.to_string_lossy().to_string(),
            kind: "Application Bundle".into(),
            size_bytes: binary_size,
            allocated_bytes: binary_alloc,
            confidence: ConfidenceLevel::High,
            is_database_or_persistent: false,
            explanation: "Core macOS executable bundle".into(),
            is_selected_by_default: true,
        }];

        // Inspect related user data across approved Library directories
        if let Some(home) = dirs::home_dir() {
            // 1. Caches (~/Library/Caches/<bundle_id>)
            let cache_path = home.join("Library/Caches").join(&bundle_id);
            if cache_path.exists() {
                let (alloc, logical, _) = Scanner::measure_path_detailed(
                    &cache_path,
                    &mut visited_inodes,
                    &mut skipped,
                    &[],
                    &cancel,
                );
                if logical > 0 || alloc > 0 {
                    artifacts.push(AppArtifact {
                        path: cache_path.to_string_lossy().to_string(),
                        kind: "Caches".into(),
                        size_bytes: logical,
                        allocated_bytes: alloc,
                        confidence: ConfidenceLevel::High,
                        is_database_or_persistent: false,
                        explanation: "Disposable runtime cache files".into(),
                        is_selected_by_default: true,
                    });
                }
            }

            // 2. Preferences (~/Library/Preferences/<bundle_id>.plist)
            let pref_path = home
                .join("Library/Preferences")
                .join(format!("{}.plist", bundle_id));
            if pref_path.exists() {
                let (alloc, logical, _) = Scanner::measure_path_detailed(
                    &pref_path,
                    &mut visited_inodes,
                    &mut skipped,
                    &[],
                    &cancel,
                );
                if logical > 0 || alloc > 0 {
                    artifacts.push(AppArtifact {
                        path: pref_path.to_string_lossy().to_string(),
                        kind: "Preferences".into(),
                        size_bytes: logical,
                        allocated_bytes: alloc,
                        confidence: ConfidenceLevel::High,
                        is_database_or_persistent: false,
                        explanation: "User configuration preferences".into(),
                        is_selected_by_default: true,
                    });
                }
            }

            // 3. Saved Application State (~/Library/Saved Application State/<bundle_id>.savedState)
            let state_path = home
                .join("Library/Saved Application State")
                .join(format!("{}.savedState", bundle_id));
            if state_path.exists() {
                let (alloc, logical, _) = Scanner::measure_path_detailed(
                    &state_path,
                    &mut visited_inodes,
                    &mut skipped,
                    &[],
                    &cancel,
                );
                if logical > 0 || alloc > 0 {
                    artifacts.push(AppArtifact {
                        path: state_path.to_string_lossy().to_string(),
                        kind: "Saved State".into(),
                        size_bytes: logical,
                        allocated_bytes: alloc,
                        confidence: ConfidenceLevel::High,
                        is_database_or_persistent: false,
                        explanation: "Window and UI restoration state".into(),
                        is_selected_by_default: true,
                    });
                }
            }

            // 4. HTTPStorages (~/Library/HTTPStorages/<bundle_id>)
            let http_path = home.join("Library/HTTPStorages").join(&bundle_id);
            if http_path.exists() {
                let (alloc, logical, _) = Scanner::measure_path_detailed(
                    &http_path,
                    &mut visited_inodes,
                    &mut skipped,
                    &[],
                    &cancel,
                );
                if logical > 0 || alloc > 0 {
                    artifacts.push(AppArtifact {
                        path: http_path.to_string_lossy().to_string(),
                        kind: "HTTPStorages".into(),
                        size_bytes: logical,
                        allocated_bytes: alloc,
                        confidence: ConfidenceLevel::High,
                        is_database_or_persistent: false,
                        explanation: "Network HTTP response caches".into(),
                        is_selected_by_default: true,
                    });
                }
            }

            // 5. WebKit data (~/Library/WebKit/<bundle_id>)
            let webkit_path = home.join("Library/WebKit").join(&bundle_id);
            if webkit_path.exists() {
                let (alloc, logical, _) = Scanner::measure_path_detailed(
                    &webkit_path,
                    &mut visited_inodes,
                    &mut skipped,
                    &[],
                    &cancel,
                );
                if logical > 0 || alloc > 0 {
                    artifacts.push(AppArtifact {
                        path: webkit_path.to_string_lossy().to_string(),
                        kind: "WebKit".into(),
                        size_bytes: logical,
                        allocated_bytes: alloc,
                        confidence: ConfidenceLevel::High,
                        is_database_or_persistent: false,
                        explanation: "WebKit web storage and cache data".into(),
                        is_selected_by_default: true,
                    });
                }
            }

            // 6. Logs (~/Library/Logs/<bundle_id> or <name>)
            for log_cand in &[
                home.join("Library/Logs").join(&bundle_id),
                home.join("Library/Logs").join(&name),
            ] {
                if log_cand.exists() {
                    let (alloc, logical, _) = Scanner::measure_path_detailed(
                        log_cand,
                        &mut visited_inodes,
                        &mut skipped,
                        &[],
                        &cancel,
                    );
                    if logical > 0 || alloc > 0 {
                        artifacts.push(AppArtifact {
                            path: log_cand.to_string_lossy().to_string(),
                            kind: "Logs".into(),
                            size_bytes: logical,
                            allocated_bytes: alloc,
                            confidence: ConfidenceLevel::High,
                            is_database_or_persistent: false,
                            explanation: "Historical application execution logs".into(),
                            is_selected_by_default: true,
                        });
                    }
                }
            }

            // 7. Sandboxed Containers (~/Library/Containers/<bundle_id>)
            let container_path = home.join("Library/Containers").join(&bundle_id);
            if container_path.exists() {
                let (alloc, logical, _) = Scanner::measure_path_detailed(
                    &container_path,
                    &mut visited_inodes,
                    &mut skipped,
                    &[],
                    &cancel,
                );
                if logical > 0 || alloc > 0 {
                    let has_db = SafetyGuard::is_database_or_persistent_state(&container_path);
                    artifacts.push(AppArtifact {
                        path: container_path.to_string_lossy().to_string(),
                        kind: "Containers".into(),
                        size_bytes: logical,
                        allocated_bytes: alloc,
                        confidence: if has_db {
                            ConfidenceLevel::ReviewRequired
                        } else {
                            ConfidenceLevel::High
                        },
                        is_database_or_persistent: has_db,
                        explanation: if has_db {
                            "Sandboxed app container with user data or databases (Review Recommended)".into()
                        } else {
                            "Sandboxed application container".into()
                        },
                        is_selected_by_default: !has_db,
                    });
                }
            }

            // 8. Application Support (~/Library/Application Support/<bundle_id> and <name>)
            let mut checked_app_support = HashSet::new();
            for sup_cand in &[
                home.join("Library/Application Support").join(&bundle_id),
                home.join("Library/Application Support").join(&name),
            ] {
                if sup_cand.exists() && checked_app_support.insert(sup_cand.clone()) {
                    let (alloc, logical, _) = Scanner::measure_path_detailed(
                        sup_cand,
                        &mut visited_inodes,
                        &mut skipped,
                        &[],
                        &cancel,
                    );
                    if logical > 0 || alloc > 0 {
                        let has_db = SafetyGuard::is_database_or_persistent_state(sup_cand);
                        artifacts.push(AppArtifact {
                            path: sup_cand.to_string_lossy().to_string(),
                            kind: "Application Support".into(),
                            size_bytes: logical,
                            allocated_bytes: alloc,
                            confidence: if has_db {
                                ConfidenceLevel::Protected
                            } else {
                                ConfidenceLevel::ReviewRequired
                            },
                            is_database_or_persistent: has_db,
                            explanation: if has_db {
                                "Contains persistent application database or user profile (Preserved by default)".into()
                            } else {
                                "Application runtime support and plugin files".into()
                            },
                            is_selected_by_default: !has_db,
                        });
                    }
                }
            }
        }

        let total_size: u64 = artifacts.iter().map(|a| a.size_bytes).sum();
        let total_alloc: u64 = artifacts.iter().map(|a| a.allocated_bytes).sum();

        Some(InstalledApp {
            name,
            bundle_id,
            version,
            publisher,
            app_path: app_path.to_string_lossy().to_string(),
            icon_data_url,
            installation_source,
            is_system_app,
            is_running,
            running_pids,
            last_modified,
            total_size_bytes: total_size,
            allocated_size_bytes: total_alloc,
            binary_size_bytes: binary_size,
            binary_allocated_bytes: binary_alloc,
            artifacts,
        })
    }

    /// Inspect a dropped `.app` bundle from Drag-and-Drop
    pub fn inspect_dropped_app(path: &Path) -> Result<InstalledApp, String> {
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Invalid bundle path: {}", e))?;

        if !canonical.is_dir() || canonical.extension().map(|e| e != "app").unwrap_or(true) {
            return Err("Dropped item is not a macOS .app application bundle.".to_string());
        }

        if SafetyGuard::is_system_protected(&canonical) || Self::is_system_application(&canonical) {
            return Err(
                "Protected macOS system applications cannot be modified or uninstalled."
                    .to_string(),
            );
        }

        let info_plist = canonical.join("Contents/Info.plist");
        if !info_plist.exists() {
            return Err("Malformed application bundle: missing Contents/Info.plist".to_string());
        }

        Self::inspect_app_bundle(&canonical)
            .ok_or_else(|| "Failed to inspect application bundle metadata.".to_string())
    }

    /// Discover leftover application data from apps that are no longer installed on macOS
    pub fn scan_orphaned_data() -> OrphanedScanResult {
        let mut items = Vec::new();
        let home = match dirs::home_dir() {
            Some(h) => h,
            None => {
                return OrphanedScanResult {
                    total_items: 0,
                    total_bytes: 0,
                    total_allocated_bytes: 0,
                    items: Vec::new(),
                }
            }
        };

        // 1. Gather all currently installed bundle identifiers and application names
        let installed = Self::scan_applications(None);
        let mut installed_bids: HashSet<String> = installed
            .iter()
            .map(|a| a.bundle_id.to_lowercase())
            .collect();
        let mut installed_names: HashSet<String> =
            installed.iter().map(|a| a.name.to_lowercase()).collect();

        // Also add system applications to avoid false positives
        for sys_dir in &["/System/Applications", "/System/Library/CoreServices/Applications"] {
            let p = Path::new(sys_dir);
            if let Ok(entries) = fs::read_dir(p) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if ep.extension().map(|e| e == "app").unwrap_or(false) {
                        let stem = ep
                            .file_stem()
                            .map(|s| s.to_string_lossy().to_lowercase())
                            .unwrap_or_default();
                        installed_names.insert(stem);
                        let plist = ep.join("Contents/Info.plist");
                        if plist.exists() {
                            let parsed = Self::read_info_plist(&plist);
                            if let Some(b) = parsed.bundle_id {
                                installed_bids.insert(b.to_lowercase());
                            }
                        }
                    }
                }
            }
        }

        let mut visited_inodes = HashSet::new();
        let mut skipped = Vec::new();
        let cancel = AtomicBool::new(false);

        // Helper to check if a string looks like a reverse-DNS bundle identifier (e.g. com.foo.bar)
        let is_bundle_id_pattern = |name: &str| -> bool {
            let parts: Vec<&str> = name.split('.').collect();
            parts.len() >= 3
                && (parts[0] == "com"
                    || parts[0] == "org"
                    || parts[0] == "io"
                    || parts[0] == "net"
                    || parts[0] == "app"
                    || parts[0] == "dev")
        };

        // Helper to check if modified time can be retrieved
        let get_mod_time = |p: &Path| -> Option<String> {
            fs::metadata(p)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
        };

        // 2. Scan ~/Library/Caches
        let caches_dir = home.join("Library/Caches");
        if let Ok(entries) = fs::read_dir(&caches_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let fname = path
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let lower = fname.to_lowercase();

                if is_bundle_id_pattern(&lower)
                    && !lower.starts_with("com.apple.")
                    && !installed_bids.contains(&lower)
                    && !installed_names.contains(&lower)
                {
                    let (alloc, logical, _) = Scanner::measure_path_detailed(
                        &path,
                        &mut visited_inodes,
                        &mut skipped,
                        &[],
                        &cancel,
                    );
                    if logical > 0 || alloc > 0 {
                        items.push(OrphanedAppArtifact {
                            path: path.to_string_lossy().to_string(),
                            bundle_id: fname.clone(),
                            kind: "Caches".into(),
                            size_bytes: logical,
                            allocated_bytes: alloc,
                            confidence: ConfidenceLevel::High,
                            explanation: format!(
                                "Residual cache from uninstalled application '{}'",
                                fname
                            ),
                            last_modified: get_mod_time(&path),
                            is_eligible_for_cleanup: true,
                        });
                    }
                }
            }
        }

        // 3. Scan ~/Library/Saved Application State
        let state_dir = home.join("Library/Saved Application State");
        if let Ok(entries) = fs::read_dir(&state_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let fname = path
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                if fname.ends_with(".savedState") {
                    let bid = fname.trim_end_matches(".savedState").to_string();
                    let lower = bid.to_lowercase();

                    if !lower.starts_with("com.apple.")
                        && !installed_bids.contains(&lower)
                        && !installed_names.contains(&lower)
                    {
                        let (alloc, logical, _) = Scanner::measure_path_detailed(
                            &path,
                            &mut visited_inodes,
                            &mut skipped,
                            &[],
                            &cancel,
                        );
                        if logical > 0 || alloc > 0 {
                            items.push(OrphanedAppArtifact {
                                path: path.to_string_lossy().to_string(),
                                bundle_id: bid.clone(),
                                kind: "Saved State".into(),
                                size_bytes: logical,
                                allocated_bytes: alloc,
                                confidence: ConfidenceLevel::High,
                                explanation: format!(
                                    "Residual saved state from uninstalled application '{}'",
                                    bid
                                ),
                                last_modified: get_mod_time(&path),
                                is_eligible_for_cleanup: true,
                            });
                        }
                    }
                }
            }
        }

        // 4. Scan ~/Library/HTTPStorages
        let http_dir = home.join("Library/HTTPStorages");
        if let Ok(entries) = fs::read_dir(&http_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let fname = path
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let lower = fname.to_lowercase();

                if is_bundle_id_pattern(&lower)
                    && !lower.starts_with("com.apple.")
                    && !installed_bids.contains(&lower)
                    && !installed_names.contains(&lower)
                {
                    let (alloc, logical, _) = Scanner::measure_path_detailed(
                        &path,
                        &mut visited_inodes,
                        &mut skipped,
                        &[],
                        &cancel,
                    );
                    if logical > 0 || alloc > 0 {
                        items.push(OrphanedAppArtifact {
                            path: path.to_string_lossy().to_string(),
                            bundle_id: fname.clone(),
                            kind: "HTTPStorages".into(),
                            size_bytes: logical,
                            allocated_bytes: alloc,
                            confidence: ConfidenceLevel::High,
                            explanation: format!(
                                "Residual network cache from uninstalled application '{}'",
                                fname
                            ),
                            last_modified: get_mod_time(&path),
                            is_eligible_for_cleanup: true,
                        });
                    }
                }
            }
        }

        // 5. Scan ~/Library/WebKit
        let webkit_dir = home.join("Library/WebKit");
        if let Ok(entries) = fs::read_dir(&webkit_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let fname = path
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let lower = fname.to_lowercase();

                if is_bundle_id_pattern(&lower)
                    && !lower.starts_with("com.apple.")
                    && !installed_bids.contains(&lower)
                    && !installed_names.contains(&lower)
                {
                    let (alloc, logical, _) = Scanner::measure_path_detailed(
                        &path,
                        &mut visited_inodes,
                        &mut skipped,
                        &[],
                        &cancel,
                    );
                    if logical > 0 || alloc > 0 {
                        items.push(OrphanedAppArtifact {
                            path: path.to_string_lossy().to_string(),
                            bundle_id: fname.clone(),
                            kind: "WebKit".into(),
                            size_bytes: logical,
                            allocated_bytes: alloc,
                            confidence: ConfidenceLevel::High,
                            explanation: format!(
                                "Residual WebKit storage from uninstalled application '{}'",
                                fname
                            ),
                            last_modified: get_mod_time(&path),
                            is_eligible_for_cleanup: true,
                        });
                    }
                }
            }
        }

        // 6. Scan ~/Library/Preferences
        let pref_dir = home.join("Library/Preferences");
        if let Ok(entries) = fs::read_dir(&pref_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let fname = path
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                if fname.ends_with(".plist") {
                    let bid = fname.trim_end_matches(".plist").to_string();
                    let lower = bid.to_lowercase();

                    if is_bundle_id_pattern(&lower)
                        && !lower.starts_with("com.apple.")
                        && !installed_bids.contains(&lower)
                        && !installed_names.contains(&lower)
                    {
                        let (alloc, logical, _) = Scanner::measure_path_detailed(
                            &path,
                            &mut visited_inodes,
                            &mut skipped,
                            &[],
                            &cancel,
                        );
                        if logical > 0 || alloc > 0 {
                            items.push(OrphanedAppArtifact {
                                path: path.to_string_lossy().to_string(),
                                bundle_id: bid.clone(),
                                kind: "Preferences".into(),
                                size_bytes: logical,
                                allocated_bytes: alloc,
                                confidence: ConfidenceLevel::ReviewRequired,
                                explanation: format!(
                                    "Residual preference file from uninstalled application '{}'",
                                    bid
                                ),
                                last_modified: get_mod_time(&path),
                                is_eligible_for_cleanup: true,
                            });
                        }
                    }
                }
            }
        }

        let total_bytes: u64 = items.iter().map(|i| i.size_bytes).sum();
        let total_alloc: u64 = items.iter().map(|i| i.allocated_bytes).sum();
        let count = items.len();

        OrphanedScanResult {
            total_items: count,
            total_bytes,
            total_allocated_bytes: total_alloc,
            items,
        }
    }

    /// Execute safe uninstallation of a single application and its selected related data
    pub fn uninstall_application(
        request: UninstallAppRequest,
        db: &Database,
    ) -> Result<CleanResult, String> {
        let start = std::time::Instant::now();

        if !request.confirmed {
            return Err("Unconfirmed uninstallation request rejected by safety guardrail.".into());
        }

        let app_path = PathBuf::from(&request.app_path);
        let canonical_app = app_path
            .canonicalize()
            .map_err(|e| format!("Application path error: {}", e))?;

        if !canonical_app.is_dir()
            || canonical_app
                .extension()
                .map(|e| e != "app")
                .unwrap_or(true)
        {
            return Err("Target path is not a valid macOS application bundle.".into());
        }

        if SafetyGuard::is_system_protected(&canonical_app)
            || Self::is_system_application(&canonical_app)
        {
            return Err(
                "Protected macOS system applications cannot be modified or uninstalled.".into(),
            );
        }

        // Strict process running check: block uninstall if app or helper is actively running
        let (is_running, pids) = Self::check_app_running_status(&canonical_app);
        if is_running {
            let app_name = canonical_app
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Target application".to_string());
            return Err(format!(
                "Cannot uninstall '{}': application is currently running (PIDs: {:?}). Please quit the application and try again.",
                app_name, pids
            ));
        }

        let mut validated_targets = Vec::new();

        for target_str in &request.paths_to_delete {
            let p = PathBuf::from(target_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.clone(),
            };

            // Safety validations
            if SafetyGuard::is_system_protected(&canonical) {
                return Err(format!(
                    "Safety violation: path is system-protected: {}",
                    canonical.display()
                ));
            }

            if SafetyGuard::is_user_data_protected(&canonical) {
                return Err(format!(
                    "Safety violation: path is inside protected user documents: {}",
                    canonical.display()
                ));
            }

            // Must be the app bundle itself or within user Library
            let is_bundle = canonical == canonical_app;
            let in_library = if let Some(home) = dirs::home_dir() {
                canonical.starts_with(home.join("Library"))
            } else {
                false
            };

            if !is_bundle && !in_library {
                return Err(format!(
                    "Safety violation: target path is not within approved application or Library scope: {}",
                    canonical.display()
                ));
            }

            if p.exists() {
                validated_targets.push(canonical);
            }
        }

        let mut bytes_freed: u64 = 0;
        let mut items_deleted: usize = 0;
        let mut items_skipped: usize = 0;
        let mut items_failed: usize = 0;
        let mut errors = Vec::new();

        if request.dry_run {
            for target in &validated_targets {
                let (alloc, _, _) = Scanner::measure_path_detailed(
                    target,
                    &mut HashSet::new(),
                    &mut Vec::new(),
                    &[],
                    &AtomicBool::new(false),
                );
                bytes_freed += alloc;
                items_deleted += 1;
            }

            return Ok(CleanResult {
                success: true,
                dry_run: true,
                bytes_freed,
                bytes_moved_to_trash: 0,
                items_deleted,
                items_skipped: 0,
                items_failed: 0,
                errors: Vec::new(),
                duration_ms: start.elapsed().as_millis() as u64,
                was_cancelled: false,
            });
        }

        // Perform actual recoverable deletion via native macOS Trash
        for target in &validated_targets {
            // Recheck running status immediately before deletion
            let (still_running, _) = Self::check_app_running_status(&canonical_app);
            if still_running {
                items_skipped += 1;
                errors.push(CleanErrorItem {
                    path: target.to_string_lossy().to_string(),
                    error_message: "Application launched during cleanup operation. Aborted.".into(),
                });
                break;
            }

            let snapshot = match SafetyGuard::capture_snapshot(target) {
                Ok(s) => s,
                Err(e) => {
                    items_failed += 1;
                    errors.push(CleanErrorItem {
                        path: target.to_string_lossy().to_string(),
                        error_message: format!("Failed to capture file metadata snapshot: {}", e),
                    });
                    continue;
                }
            };

            let (alloc, _, _) = Scanner::measure_path_detailed(
                target,
                &mut HashSet::new(),
                &mut Vec::new(),
                &[],
                &AtomicBool::new(false),
            );

            // Anti-TOCTOU & Symlink Substitution Revalidation immediately prior to deletion
            if let Err(e) = SafetyGuard::verify_unaltered(target, &snapshot) {
                items_failed += 1;
                errors.push(CleanErrorItem {
                    path: target.to_string_lossy().to_string(),
                    error_message: format!("Security violation during pre-clean verification: {}", e),
                });
                continue;
            }

            match trash::delete(target) {
                Ok(_) => {
                    if !target.exists() {
                        bytes_freed += alloc;
                        items_deleted += 1;
                    } else {
                        items_failed += 1;
                        errors.push(CleanErrorItem {
                            path: target.to_string_lossy().to_string(),
                            error_message: "File was reported trashed but still exists on filesystem."
                                .into(),
                        });
                    }
                }
                Err(e) => {
                    items_failed += 1;
                    errors.push(CleanErrorItem {
                        path: target.to_string_lossy().to_string(),
                        error_message: format!("macOS Trash error: {}", e),
                    });
                }
            }
        }

        // Record cleanup audit log in SQLite
        let audit = CleanupAuditDetail {
            dry_run: false,
            items_deleted,
            items_skipped,
            items_failed,
            bytes_moved_to_trash: bytes_freed,
            deleted_paths: validated_targets
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect(),
            errors: errors.clone(),
        };

        let record = CleanupRecord {
            id: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            bytes_freed,
            items_deleted,
            method: "Trash".into(),
            details_json: serde_json::to_string(&audit).unwrap_or_else(|_| "{}".into()),
        };
        let _ = db.insert_cleanup_record(&record);

        Ok(CleanResult {
            success: items_failed == 0,
            dry_run: false,
            bytes_freed,
            bytes_moved_to_trash: bytes_freed,
            items_deleted,
            items_skipped,
            items_failed,
            errors,
            duration_ms: start.elapsed().as_millis() as u64,
            was_cancelled: false,
        })
    }

    /// Clean verified orphaned leftover application caches and data via native macOS Trash
    pub fn clean_orphaned_data(
        request: CleanOrphanedRequest,
        db: &Database,
    ) -> Result<CleanResult, String> {
        let start = std::time::Instant::now();

        if !request.confirmed {
            return Err("Unconfirmed orphaned cleanup request rejected.".into());
        }

        let home = dirs::home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
        let user_library = home.join("Library");

        let mut validated_targets = Vec::new();

        for target_str in &request.paths {
            let p = PathBuf::from(target_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.clone(),
            };

            if SafetyGuard::is_system_protected(&canonical) {
                return Err(format!(
                    "Safety violation: path is system protected: {}",
                    canonical.display()
                ));
            }

            if SafetyGuard::is_user_data_protected(&canonical) {
                return Err(format!(
                    "Safety violation: path is in user documents: {}",
                    canonical.display()
                ));
            }

            if !canonical.starts_with(&user_library) {
                return Err(format!(
                    "Safety violation: orphaned item is outside ~/Library: {}",
                    canonical.display()
                ));
            }

            // Protect persistent databases unless explicitly overridden
            if SafetyGuard::is_database_or_persistent_state(&canonical) {
                return Err(format!(
                    "Safety violation: path contains persistent database or user data: {}",
                    canonical.display()
                ));
            }

            if p.exists() {
                validated_targets.push(canonical);
            }
        }

        let mut bytes_freed: u64 = 0;
        let mut items_deleted: usize = 0;
        let mut items_failed: usize = 0;
        let mut errors = Vec::new();

        if request.dry_run {
            for target in &validated_targets {
                let (alloc, _, _) = Scanner::measure_path_detailed(
                    target,
                    &mut HashSet::new(),
                    &mut Vec::new(),
                    &[],
                    &AtomicBool::new(false),
                );
                bytes_freed += alloc;
                items_deleted += 1;
            }

            return Ok(CleanResult {
                success: true,
                dry_run: true,
                bytes_freed,
                bytes_moved_to_trash: 0,
                items_deleted,
                items_skipped: 0,
                items_failed: 0,
                errors: Vec::new(),
                duration_ms: start.elapsed().as_millis() as u64,
                was_cancelled: false,
            });
        }

        for target in &validated_targets {
            let snapshot = match SafetyGuard::capture_snapshot(target) {
                Ok(s) => s,
                Err(e) => {
                    items_failed += 1;
                    errors.push(CleanErrorItem {
                        path: target.to_string_lossy().to_string(),
                        error_message: format!("Failed to capture file metadata snapshot: {}", e),
                    });
                    continue;
                }
            };

            let (alloc, _, _) = Scanner::measure_path_detailed(
                target,
                &mut HashSet::new(),
                &mut Vec::new(),
                &[],
                &AtomicBool::new(false),
            );

            // Anti-TOCTOU & Symlink Substitution Revalidation immediately prior to deletion
            if let Err(e) = SafetyGuard::verify_unaltered(target, &snapshot) {
                items_failed += 1;
                errors.push(CleanErrorItem {
                    path: target.to_string_lossy().to_string(),
                    error_message: format!("Security violation during pre-clean verification: {}", e),
                });
                continue;
            }

            match trash::delete(target) {
                Ok(_) => {
                    if !target.exists() {
                        bytes_freed += alloc;
                        items_deleted += 1;
                    } else {
                        items_failed += 1;
                        errors.push(CleanErrorItem {
                            path: target.to_string_lossy().to_string(),
                            error_message: "Item still exists after trashing.".into(),
                        });
                    }
                }
                Err(e) => {
                    items_failed += 1;
                    errors.push(CleanErrorItem {
                        path: target.to_string_lossy().to_string(),
                        error_message: format!("macOS Trash error: {}", e),
                    });
                }
            }
        }

        let audit = CleanupAuditDetail {
            dry_run: false,
            items_deleted,
            items_skipped: 0,
            items_failed,
            bytes_moved_to_trash: bytes_freed,
            deleted_paths: validated_targets
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect(),
            errors: errors.clone(),
        };

        let record = CleanupRecord {
            id: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            bytes_freed,
            items_deleted,
            method: "Trash".into(),
            details_json: serde_json::to_string(&audit).unwrap_or_else(|_| "{}".into()),
        };
        let _ = db.insert_cleanup_record(&record);

        Ok(CleanResult {
            success: items_failed == 0,
            dry_run: false,
            bytes_freed,
            bytes_moved_to_trash: bytes_freed,
            items_deleted,
            items_skipped: 0,
            items_failed,
            errors,
            duration_ms: start.elapsed().as_millis() as u64,
            was_cancelled: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_plist_key() {
        let sample = r#"<?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0">
        <dict>
            <key>CFBundleIdentifier</key>
            <string>com.example.TestApp</string>
            <key>CFBundleName</key>
            <string>TestApp</string>
            <key>CFBundleShortVersionString</key>
            <string>2.4.1</string>
            <key>NSHumanReadableCopyright</key>
            <string>Copyright 2026 Test Studio</string>
        </dict>
        </plist>"#;

        assert_eq!(
            AppInspector::extract_plist_key(sample, "CFBundleIdentifier"),
            Some("com.example.TestApp".to_string())
        );
        assert_eq!(
            AppInspector::extract_plist_key(sample, "CFBundleName"),
            Some("TestApp".to_string())
        );
        assert_eq!(
            AppInspector::extract_plist_key(sample, "CFBundleShortVersionString"),
            Some("2.4.1".to_string())
        );
        assert_eq!(
            AppInspector::extract_plist_key(sample, "NSHumanReadableCopyright"),
            Some("Copyright 2026 Test Studio".to_string())
        );
    }

    #[test]
    fn test_inspect_valid_app_bundle() {
        let temp = std::env::temp_dir().join(format!(
            "myclean_test_valid_app_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let bundle = temp.join("MockSample.app");
        let contents = bundle.join("Contents");
        let macos = contents.join("MacOS");
        fs::create_dir_all(&macos).unwrap();

        fs::write(
            contents.join("Info.plist"),
            r#"<?xml version="1.0" encoding="UTF-8"?>
            <plist version="1.0">
            <dict>
                <key>CFBundleIdentifier</key>
                <string>com.myclean.mockapp</string>
                <key>CFBundleName</key>
                <string>MockSample</string>
                <key>CFBundleShortVersionString</key>
                <string>3.0.0</string>
            </dict>
            </plist>"#,
        )
        .unwrap();

        fs::write(macos.join("MockSample"), b"fake binary executable").unwrap();

        let app = AppInspector::inspect_app_bundle(&bundle).expect("Must inspect valid bundle");
        assert_eq!(app.name, "MockSample");
        assert_eq!(app.bundle_id, "com.myclean.mockapp");
        assert_eq!(app.version, "3.0.0");
        assert!(app.binary_size_bytes > 0);
        assert!(!app.is_system_app);
        assert!(!app.is_running);

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_inspect_dropped_app_rejection() {
        // Test non-existent bundle
        let non_existent = Path::new("/tmp/does_not_exist_xyz.app");
        assert!(AppInspector::inspect_dropped_app(non_existent).is_err());

        // Test file that is not a directory ending with .app
        let temp_file = std::env::temp_dir().join("not_an_app.txt");
        fs::write(&temp_file, b"plain text").unwrap();
        assert!(AppInspector::inspect_dropped_app(&temp_file).is_err());
        let _ = fs::remove_file(&temp_file);

        // Test system app rejection
        let sys_app = Path::new("/System/Applications/Calculator.app");
        if sys_app.exists() {
            assert!(AppInspector::inspect_dropped_app(sys_app).is_err());
        }
    }

    #[test]
    fn test_base64_encode() {
        assert_eq!(AppInspector::base64_encode(b"hello world"), "aGVsbG8gd29ybGQ=");
        assert_eq!(AppInspector::base64_encode(b"myclean"), "bXljbGVhbg==");
        assert_eq!(AppInspector::base64_encode(b""), "");
    }
}
