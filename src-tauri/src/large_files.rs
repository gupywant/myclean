use crate::safety::SafetyGuard;
use serde::{Deserialize, Serialize};
use std::os::unix::fs::MetadataExt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Instant, SystemTime};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LargeFileItem {
    pub id: String,
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub allocated_bytes: u64,
    pub modified_at: Option<String>,
    pub days_old: u64,
    pub extension: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LargeFilesScanResult {
    pub target_path: String,
    pub min_size_bytes: u64,
    pub min_days_old: u64,
    pub total_bytes: u64,
    pub total_files: usize,
    pub duration_ms: u64,
    pub items: Vec<LargeFileItem>,
    pub was_cancelled: bool,
}

pub struct LargeFilesScanner;

impl LargeFilesScanner {
    pub fn classify_extension(ext: &str) -> &'static str {
        match ext.to_ascii_lowercase().as_str() {
            "zip" | "tar" | "gz" | "tgz" | "bz2" | "7z" | "xz" | "rar" => "archive",
            "dmg" | "iso" => "disk_image",
            "pkg" => "package",
            "mp4" | "mov" | "m4v" | "mkv" | "avi" | "mp3" | "wav" | "flac" | "aac" | "heic"
            | "jpg" | "jpeg" | "png" | "psd" | "ai" | "tiff" => "media",
            "pdf" | "doc" | "docx" | "pages" | "xls" | "xlsx" | "numbers" | "ppt" | "pptx"
            | "key" | "txt" | "md" | "csv" | "rtf" => "document",
            "sqlite" | "db" | "sqlite3" => "database",
            _ => "other",
        }
    }

    pub fn scan(
        target_path: PathBuf,
        min_size_bytes: u64,
        min_days_old: u64,
        cancel_token: Arc<AtomicBool>,
    ) -> Result<LargeFilesScanResult, String> {
        let start = Instant::now();

        if !target_path.exists() {
            return Err(format!(
                "Specified target path does not exist: {}",
                target_path.display()
            ));
        }

        SafetyGuard::check_path_traversal(&target_path).map_err(|e| e.to_string())?;

        let canonical = target_path
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize path: {}", e))?;

        if SafetyGuard::is_system_protected(&canonical) {
            return Err("Target path is inside a protected macOS system location (SIP).".into());
        }

        let mut items = Vec::new();
        let now = SystemTime::now();

        for entry_res in WalkDir::new(&canonical)
            .follow_links(false)
            .max_depth(6)
            .into_iter()
        {
            if cancel_token.load(Ordering::Relaxed) {
                break;
            }

            let entry = match entry_res {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();

            // Skip hidden git internals
            if path.file_name().map(|n| n == ".git").unwrap_or(false) {
                continue;
            }

            // Skip protected paths
            if SafetyGuard::is_mandatory_exclusion(path) {
                continue;
            }

            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            if !meta.is_file() {
                continue;
            }

            let size_bytes = meta.len();
            if size_bytes < min_size_bytes {
                continue;
            }

            let allocated_bytes = meta.blocks() * 512;

            let mod_time = meta.modified().unwrap_or(now);
            let days_old = now
                .duration_since(mod_time)
                .map(|d| d.as_secs() / 86400)
                .unwrap_or(0);

            if days_old < min_days_old {
                continue;
            }

            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();

            let category = Self::classify_extension(&ext).to_string();

            let modified_at = meta
                .modified()
                .ok()
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

            items.push(LargeFileItem {
                id: path.to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                name,
                size_bytes,
                allocated_bytes,
                modified_at,
                days_old,
                extension: ext,
                category,
            });
        }

        let was_cancelled = cancel_token.load(Ordering::Relaxed);

        // Sort descending by size
        items.sort_by_key(|i| std::cmp::Reverse(i.size_bytes));
        items.truncate(300);

        let total_bytes = items.iter().map(|i| i.size_bytes).sum();
        let total_files = items.len();

        Ok(LargeFilesScanResult {
            target_path: canonical.to_string_lossy().to_string(),
            min_size_bytes,
            min_days_old,
            total_bytes,
            total_files,
            duration_ms: start.elapsed().as_millis() as u64,
            items,
            was_cancelled,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    fn test_classify_extension() {
        assert_eq!(LargeFilesScanner::classify_extension("dmg"), "disk_image");
        assert_eq!(LargeFilesScanner::classify_extension("zip"), "archive");
        assert_eq!(LargeFilesScanner::classify_extension("mp4"), "media");
        assert_eq!(LargeFilesScanner::classify_extension("pdf"), "document");
        assert_eq!(LargeFilesScanner::classify_extension("pkg"), "package");
        assert_eq!(LargeFilesScanner::classify_extension("xyz"), "other");
    }

    #[test]
    fn test_large_files_scan_on_temp_dir() {
        let temp_dir = std::env::temp_dir().join("myclean_test_large_files");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        // Create a 2MB file and a 500KB file
        let big_file = temp_dir.join("test_big.dmg");
        let mut f = fs::File::create(&big_file).unwrap();
        f.write_all(&vec![0u8; 2 * 1024 * 1024]).unwrap();

        let small_file = temp_dir.join("test_small.txt");
        let mut f2 = fs::File::create(&small_file).unwrap();
        f2.write_all(&vec![0u8; 500 * 1024]).unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        // Threshold: 1MB
        let res = LargeFilesScanner::scan(temp_dir.clone(), 1024 * 1024, 0, cancel).unwrap();

        assert_eq!(res.total_files, 1);
        assert_eq!(res.items[0].name, "test_big.dmg");
        assert_eq!(res.items[0].category, "disk_image");
        assert!(res.items[0].size_bytes >= 2 * 1024 * 1024);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
