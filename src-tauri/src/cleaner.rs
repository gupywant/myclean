use crate::db::{CleanupRecord, Database};
use crate::safety::SafetyGuard;
use crate::scanner::Scanner;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanRequest {
    pub paths: Vec<String>,
    pub method: String, // "trash" or "permanent"
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
    pub items_deleted: usize,
    pub errors: Vec<CleanErrorItem>,
    pub duration_ms: u64,
}

pub struct Cleaner;

impl Cleaner {
    pub fn clean_items(
        req: CleanRequest,
        db: &Database,
    ) -> Result<CleanResult, String> {
        let start = Instant::now();

        if !req.confirmed && !req.dry_run {
            return Err("Execution rejected: Cleanup confirmation was not explicitly provided.".to_string());
        }

        let mut bytes_freed = 0u64;
        let mut items_deleted = 0usize;
        let mut errors = Vec::new();
        let mut deleted_paths = Vec::new();

        for path_str in &req.paths {
            let p = PathBuf::from(path_str);

            if !p.exists() {
                errors.push(CleanErrorItem {
                    path: path_str.clone(),
                    error_message: "Path no longer exists on filesystem".into(),
                });
                continue;
            }

            // Check Whitelist
            if db.is_whitelisted(&p) {
                errors.push(CleanErrorItem {
                    path: path_str.clone(),
                    error_message: "Path is whitelisted by user rules; skipped".into(),
                });
                continue;
            }

            // Check Safety Guard
            if let Err(e) = SafetyGuard::validate_for_cleaning(&p) {
                errors.push(CleanErrorItem {
                    path: path_str.clone(),
                    error_message: format!("Safety violation: {}", e),
                });
                continue;
            }

            // Measure size before deletion
            let (size, count) = Scanner::measure_path(&p);

            if req.dry_run {
                bytes_freed += size;
                items_deleted += count.max(1);
                continue;
            }

            // Execute deletion
            let delete_result = if req.method == "permanent" {
                if p.is_dir() {
                    std::fs::remove_dir_all(&p)
                } else {
                    std::fs::remove_file(&p)
                }
            } else {
                // Default: macOS Recoverable Trash
                trash::delete(&p).map_err(|e| std::io::Error::other(e.to_string()))
            };

            match delete_result {
                Ok(_) => {
                    bytes_freed += size;
                    items_deleted += count.max(1);
                    deleted_paths.push(path_str.clone());
                }
                Err(e) => {
                    errors.push(CleanErrorItem {
                        path: path_str.clone(),
                        error_message: format!("Failed to delete: {}", e),
                    });
                }
            }
        }

        // Record audit trail in SQLite if not dry_run and items were cleaned
        if !req.dry_run && items_deleted > 0 {
            let record = CleanupRecord {
                id: None,
                timestamp: chrono::Utc::now().to_rfc3339(),
                bytes_freed,
                items_deleted,
                method: req.method.clone(),
                details_json: serde_json::to_string(&deleted_paths).unwrap_or_else(|_| "[]".into()),
            };
            let _ = db.insert_cleanup_record(&record);
        }

        Ok(CleanResult {
            success: errors.is_empty(),
            dry_run: req.dry_run,
            bytes_freed,
            items_deleted,
            errors,
            duration_ms: start.elapsed().as_millis() as u64,
        })
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
        let temp = std::env::temp_dir().join("myclean_clean_test");
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();

        let dummy_file = temp.join("test.cache");
        let mut f = File::create(&dummy_file).unwrap();
        f.write_all(b"sample cache data to clean").unwrap();

        let req = CleanRequest {
            paths: vec![dummy_file.to_string_lossy().to_string()],
            method: "trash".into(),
            dry_run: true,
            confirmed: true,
        };

        let res = Cleaner::clean_items(req, &db).unwrap();
        assert!(res.dry_run);
        assert!(res.bytes_freed > 0);
        assert!(dummy_file.exists()); // Dry run must NOT delete

        let _ = std::fs::remove_dir_all(&temp);
    }
}
