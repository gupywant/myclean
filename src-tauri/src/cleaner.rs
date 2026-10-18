use crate::db::{CleanupRecord, Database};
use crate::safety::SafetyGuard;
use crate::scanner::Scanner;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanItemTarget {
    pub path: String,
    pub expected_modified_at: Option<String>,
    pub expected_size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanRequest {
    pub paths: Vec<String>,
    #[serde(default)]
    pub targets: Option<Vec<CleanItemTarget>>,
    pub method: String, // "trash" (permanent is disabled by safety guardrail)
    pub dry_run: bool,
    pub confirmed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanErrorItem {
    pub path: String,
    pub error_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanResult {
    pub success: bool,
    pub dry_run: bool,
    pub bytes_freed: u64,
    pub bytes_moved_to_trash: u64,
    pub items_deleted: usize,
    pub items_skipped: usize,
    pub items_failed: usize,
    pub errors: Vec<CleanErrorItem>,
    pub duration_ms: u64,
    pub was_cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveAppWarning {
    pub app_name: String,
    pub affected_paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CleanupAuditDetail {
    dry_run: bool,
    items_deleted: usize,
    items_skipped: usize,
    items_failed: usize,
    bytes_moved_to_trash: u64,
    deleted_paths: Vec<String>,
    errors: Vec<CleanErrorItem>,
}

pub struct Cleaner;

impl Cleaner {
    pub fn clean_items(
        req: CleanRequest,
        db: &Database,
        cancel_token: Arc<AtomicBool>,
    ) -> Result<CleanResult, String> {
        let start = Instant::now();

        // Safety Guardrail: Permanent deletion is strictly disabled
        if req.method == "permanent" {
            return Err("Permanent deletion is disabled by safety policy. All cleanups are strictly routed through macOS Recoverable Trash.".to_string());
        }

        if !req.confirmed && !req.dry_run {
            return Err("Execution rejected: Cleanup confirmation was not explicitly provided.".to_string());
        }

        let mut bytes_freed = 0u64;
        let mut bytes_moved_to_trash = 0u64;
        let mut items_deleted = 0usize;
        let mut items_skipped = 0usize;
        let mut items_failed = 0usize;
        let mut errors = Vec::new();
        let mut deleted_paths = Vec::new();
        let mut was_cancelled = false;

        // Map targets for quick lookup if provided
        let targets_map: std::collections::HashMap<String, &CleanItemTarget> = req
            .targets
            .as_ref()
            .map(|t| t.iter().map(|item| (item.path.clone(), item)).collect())
            .unwrap_or_default();

        for path_str in &req.paths {
            if cancel_token.load(Ordering::Relaxed) {
                was_cancelled = true;
                break;
            }

            let p = PathBuf::from(path_str);

            if !p.exists() {
                errors.push(CleanErrorItem {
                    path: path_str.clone(),
                    error_message: "Path no longer exists on filesystem".into(),
                });
                items_skipped += 1;
                continue;
            }

            // Check Whitelist
            if db.is_whitelisted(&p) {
                errors.push(CleanErrorItem {
                    path: path_str.clone(),
                    error_message: "Path is whitelisted by user rules; skipped".into(),
                });
                items_skipped += 1;
                continue;
            }

            // Safety Guard: Re-validate path and resolve canonical form to prevent race conditions & symlink swaps
            let canonical = match SafetyGuard::validate_for_cleaning(&p) {
                Ok(c) => c,
                Err(e) => {
                    errors.push(CleanErrorItem {
                        path: path_str.clone(),
                        error_message: format!("Safety violation: {}", e),
                    });
                    items_failed += 1;
                    continue;
                }
            };

            // Active Application Detection guardrail
            if let Some(app_name) = SafetyGuard::detect_running_application(&canonical) {
                errors.push(CleanErrorItem {
                    path: path_str.clone(),
                    error_message: format!(
                        "Associated application '{}' is currently running. Please close the application before cleaning its cache.",
                        app_name
                    ),
                });
                items_skipped += 1;
                continue;
            }

            // Race condition check: Verify if metadata changed significantly since scan if expected target metadata is supplied
            if let Some(target_info) = targets_map.get(path_str) {
                if let (Some(expected_mod), Ok(meta)) = (&target_info.expected_modified_at, fs::metadata(&canonical)) {
                    if let Ok(actual_mod) = meta.modified() {
                        let actual_mod_str = chrono::DateTime::<chrono::Utc>::from(actual_mod).to_rfc3339();
                        // If file was modified after scan, flag as modified and skip for safety
                        if actual_mod_str > *expected_mod {
                            errors.push(CleanErrorItem {
                                path: path_str.clone(),
                                error_message: "File was modified after scanning completed. Skipping to prevent race condition. Please rescan.".into(),
                            });
                            items_skipped += 1;
                            continue;
                        }
                    }
                }
            }

            // Measure size before deletion
            let (size, count) = Scanner::measure_path(&canonical);

            if req.dry_run {
                bytes_freed += size;
                items_deleted += count.max(1);
                continue;
            }

            // Execute deletion: Strictly via macOS Trash for 100% recoverability
            match trash::delete(&canonical).map_err(|e| std::io::Error::other(e.to_string())) {
                Ok(_) => {
                    // Verify the file was indeed moved and no longer exists at original location
                    if canonical.exists() {
                        errors.push(CleanErrorItem {
                            path: path_str.clone(),
                            error_message: "Trash verification failed: Path still exists after deletion attempt.".into(),
                        });
                        items_failed += 1;
                    } else {
                        bytes_freed += size;
                        bytes_moved_to_trash += size;
                        items_deleted += count.max(1);
                        deleted_paths.push(path_str.clone());
                    }
                }
                Err(e) => {
                    errors.push(CleanErrorItem {
                        path: path_str.clone(),
                        error_message: format!("Failed to move to Trash: {}", e),
                    });
                    items_failed += 1;
                }
            }
        }

        // Record audit trail in SQLite if not dry_run and items were cleaned
        if !req.dry_run && items_deleted > 0 {
            let audit_detail = CleanupAuditDetail {
                dry_run: req.dry_run,
                items_deleted,
                items_skipped,
                items_failed,
                bytes_moved_to_trash,
                deleted_paths,
                errors: errors.clone(),
            };
            let record = CleanupRecord {
                id: None,
                timestamp: chrono::Utc::now().to_rfc3339(),
                bytes_freed,
                items_deleted,
                method: "trash".to_string(),
                details_json: serde_json::to_string(&audit_detail).unwrap_or_else(|_| "{}".into()),
            };
            let _ = db.insert_cleanup_record(&record);
        }

        Ok(CleanResult {
            success: errors.is_empty(),
            dry_run: req.dry_run,
            bytes_freed,
            bytes_moved_to_trash,
            items_deleted,
            items_skipped,
            items_failed,
            errors,
            duration_ms: start.elapsed().as_millis() as u64,
            was_cancelled,
        })
    }

    /// Check which active applications are associated with candidate paths
    pub fn check_active_applications(paths: &[String]) -> Vec<ActiveAppWarning> {
        let mut warnings_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
        for p_str in paths {
            let p = std::path::Path::new(p_str);
            if let Some(app_name) = SafetyGuard::detect_running_application(p) {
                warnings_map.entry(app_name).or_default().push(p_str.clone());
            }
        }
        warnings_map
            .into_iter()
            .map(|(app_name, affected_paths)| ActiveAppWarning {
                app_name,
                affected_paths,
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn test_cleaner_dry_run_and_safety() {
        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let temp = std::env::temp_dir().join("myclean_clean_test");
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();

        let dummy_file = temp.join("test.cache");
        let mut f = File::create(&dummy_file).unwrap();
        f.write_all(b"sample cache data to clean").unwrap();

        let req = CleanRequest {
            paths: vec![dummy_file.to_string_lossy().to_string()],
            targets: None,
            method: "trash".into(),
            dry_run: true,
            confirmed: true,
        };

        let res = Cleaner::clean_items(req, &db, cancel).unwrap();
        assert!(res.dry_run);
        assert!(res.bytes_freed > 0);
        assert!(dummy_file.exists()); // Dry run must NOT delete

        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_permanent_deletion_strictly_disabled() {
        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let req = CleanRequest {
            paths: vec!["/tmp/dummy".into()],
            targets: None,
            method: "permanent".into(),
            dry_run: false,
            confirmed: true,
        };
        let res = Cleaner::clean_items(req, &db, cancel);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Permanent deletion is disabled"));
    }

    #[test]
    fn test_cleaner_unconfirmed_rejected() {
        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let req = CleanRequest {
            paths: vec!["/tmp/dummy".into()],
            targets: None,
            method: "trash".into(),
            dry_run: false,
            confirmed: false,
        };
        let res = Cleaner::clean_items(req, &db, cancel);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("confirmation was not explicitly provided"));
    }

    #[test]
    fn test_cleaner_cancellation() {
        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(true)); // pre-cancelled
        let req = CleanRequest {
            paths: vec!["/tmp/dummy1".into(), "/tmp/dummy2".into()],
            targets: None,
            method: "trash".into(),
            dry_run: true,
            confirmed: true,
        };
        let res = Cleaner::clean_items(req, &db, cancel).unwrap();
        assert!(res.was_cancelled);
        assert_eq!(res.items_deleted, 0);
    }

    #[test]
    fn test_cleaner_rejects_persistent_database() {
        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let temp = std::env::temp_dir().join("myclean_db_clean_test");
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();

        let db_file = temp.join("state.sqlite");
        std::fs::write(&db_file, b"sqlite database content").unwrap();

        let req = CleanRequest {
            paths: vec![db_file.to_string_lossy().to_string()],
            targets: None,
            method: "trash".into(),
            dry_run: false,
            confirmed: true,
        };
        let res = Cleaner::clean_items(req, &db, cancel).unwrap();
        assert!(!res.success);
        assert_eq!(res.items_failed, 1);
        assert!(res.errors[0].error_message.to_lowercase().contains("persistent database") || res.errors[0].error_message.to_lowercase().contains("database"));
        assert!(db_file.exists()); // Must remain intact

        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_cleaner_detects_modified_files_race_condition() {
        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let temp = std::env::temp_dir().join("myclean_race_test");
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();

        let target_file = temp.join("volatile.cache");
        std::fs::write(&target_file, b"volatile data").unwrap();

        // Target specifies that file was last scanned with timestamp in year 2020
        let req = CleanRequest {
            paths: vec![target_file.to_string_lossy().to_string()],
            targets: Some(vec![CleanItemTarget {
                path: target_file.to_string_lossy().to_string(),
                expected_modified_at: Some("2020-01-01T00:00:00+00:00".to_string()),
                expected_size_bytes: Some(13),
            }]),
            method: "trash".into(),
            dry_run: false,
            confirmed: true,
        };

        let res = Cleaner::clean_items(req, &db, cancel).unwrap();
        assert!(!res.success);
        assert_eq!(res.items_skipped, 1);
        assert!(res.errors[0].error_message.contains("File was modified after scanning completed"));
        assert!(target_file.exists()); // Must NOT have been deleted

        let _ = std::fs::remove_dir_all(&temp);
    }
}
