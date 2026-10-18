use crate::safety::SafetyGuard;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateFile {
    pub path: String,
    pub name: String,
    pub modified_at: Option<String>,
    pub is_selected_for_removal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub file_size: u64,
    pub wasted_bytes: u64,
    pub files: Vec<DuplicateFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateScanResult {
    pub duration_ms: u64,
    pub total_duplicate_groups: usize,
    pub total_wasted_bytes: u64,
    pub groups: Vec<DuplicateGroup>,
    pub was_cancelled: bool,
}

pub struct DuplicateScanner;

impl DuplicateScanner {
    /// Reads up to 4KB from start and 4KB from end to compute a rapid pre-filter BLAKE3 hash
    fn compute_quick_hash<P: AsRef<Path>>(path: P) -> std::io::Result<String> {
        let mut file = File::open(path)?;
        let len = file.metadata()?.len();
        let mut hasher = blake3::Hasher::new();

        let chunk_size = 4096;
        let mut buf = vec![0u8; chunk_size];

        // Read prefix
        let bytes_read = file.read(&mut buf)?;
        hasher.update(&buf[..bytes_read]);

        // If file is larger than 8KB, read suffix
        if len > (chunk_size as u64 * 2) {
            file.seek(SeekFrom::End(-(chunk_size as i64)))?;
            let bytes_read = file.read(&mut buf)?;
            hasher.update(&buf[..bytes_read]);
        }

        Ok(hasher.finalize().to_hex().to_string())
    }

    /// Computes full BLAKE3 hash by streaming file contents in 64KB chunks
    fn compute_full_hash<P: AsRef<Path>>(path: P) -> std::io::Result<String> {
        let mut file = File::open(path)?;
        let mut hasher = blake3::Hasher::new();
        let mut buffer = [0u8; 65536];

        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        Ok(hasher.finalize().to_hex().to_string())
    }

    /// Scan directory for exact duplicates using tiered size -> quick hash -> full hash approach
    pub fn scan_duplicates<P: AsRef<Path>>(
        directory: P,
        min_size_bytes: u64,
        cancel_token: Arc<AtomicBool>,
    ) -> DuplicateScanResult {
        let start = Instant::now();
        let root = directory.as_ref();

        if !root.exists() || SafetyGuard::is_system_protected(root) {
            return DuplicateScanResult {
                duration_ms: 0,
                total_duplicate_groups: 0,
                total_wasted_bytes: 0,
                groups: Vec::new(),
                was_cancelled: false,
            };
        }

        // Phase 1: Bucket files by exact file size
        let mut size_buckets: HashMap<u64, Vec<PathBuf>> = HashMap::new();

        for entry in WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if cancel_token.load(Ordering::Relaxed) {
                return DuplicateScanResult {
                    duration_ms: start.elapsed().as_millis() as u64,
                    total_duplicate_groups: 0,
                    total_wasted_bytes: 0,
                    groups: Vec::new(),
                    was_cancelled: true,
                };
            }

            let path = entry.path();
            if path.is_file() {
                if let Ok(meta) = path.metadata() {
                    let len = meta.len();
                    if len >= min_size_bytes {
                        size_buckets.entry(len).or_default().push(path.to_path_buf());
                    }
                }
            }
        }

        // Filter out unique file sizes
        let candidate_sizes: Vec<(u64, Vec<PathBuf>)> = size_buckets
            .into_iter()
            .filter(|(_, files)| files.len() > 1)
            .collect();

        // Phase 2: Compute quick hash for candidates in parallel
        let confirmed_groups: Arc<Mutex<Vec<DuplicateGroup>>> = Arc::new(Mutex::new(Vec::new()));

        candidate_sizes.into_par_iter().for_each(|(size, paths)| {
            if cancel_token.load(Ordering::Relaxed) {
                return;
            }

            // Sub-bucket by quick hash
            let mut quick_buckets: HashMap<String, Vec<PathBuf>> = HashMap::new();
            for p in &paths {
                if let Ok(qh) = Self::compute_quick_hash(p) {
                    quick_buckets.entry(qh).or_default().push(p.clone());
                }
            }

            // Phase 3: For quick hash collisions, compute full BLAKE3 hash
            for (_, qpaths) in quick_buckets {
                if qpaths.len() <= 1 {
                    continue;
                }

                let mut full_buckets: HashMap<String, Vec<PathBuf>> = HashMap::new();
                for qp in qpaths {
                    if let Ok(fh) = Self::compute_full_hash(&qp) {
                        full_buckets.entry(fh).or_default().push(qp);
                    }
                }

                for (full_hash, matches) in full_buckets {
                    if matches.len() > 1 {
                        let wasted = (matches.len() - 1) as u64 * size;
                        let mut duplicate_files = Vec::new();

                        for (idx, m) in matches.iter().enumerate() {
                            let name = m.file_name().unwrap_or_default().to_string_lossy().to_string();
                            let modified_at = m
                                .metadata()
                                .ok()
                                .and_then(|meta| meta.modified().ok())
                                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

                            // Default auto-select: keep the first file (idx 0), select rest for removal
                            duplicate_files.push(DuplicateFile {
                                path: m.to_string_lossy().to_string(),
                                name,
                                modified_at,
                                is_selected_for_removal: idx > 0,
                            });
                        }

                        let group = DuplicateGroup {
                            hash: full_hash,
                            file_size: size,
                            wasted_bytes: wasted,
                            files: duplicate_files,
                        };

                        confirmed_groups.lock().unwrap().push(group);
                    }
                }
            }
        });

        let mut groups = Arc::try_unwrap(confirmed_groups).unwrap().into_inner().unwrap();
        // Sort groups by wasted bytes descending
        groups.sort_by_key(|a| std::cmp::Reverse(a.wasted_bytes));

        let total_wasted_bytes = groups.iter().map(|g| g.wasted_bytes).sum();
        let total_groups = groups.len();

        DuplicateScanResult {
            duration_ms: start.elapsed().as_millis() as u64,
            total_duplicate_groups: total_groups,
            total_wasted_bytes,
            groups,
            was_cancelled: cancel_token.load(Ordering::Relaxed),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_duplicate_detection_flow() {
        let temp_dir = std::env::temp_dir().join("myclean_test_dups");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let file_a = temp_dir.join("file_a.bin");
        let file_b = temp_dir.join("file_b.bin");
        let file_c = temp_dir.join("file_c.bin");

        let content = b"FLUX_TEST_CONTENT_IDENTICAL_BYTES_FOR_DUPLICATE_CHECK_1234567890";
        let mut fa = File::create(&file_a).unwrap();
        fa.write_all(content).unwrap();
        let mut fb = File::create(&file_b).unwrap();
        fb.write_all(content).unwrap();

        let mut fc = File::create(&file_c).unwrap();
        fc.write_all(b"DIFFERENT_CONTENT_HERE_XYZ").unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let res = DuplicateScanner::scan_duplicates(&temp_dir, 10, cancel);

        assert_eq!(res.total_duplicate_groups, 1);
        assert_eq!(res.groups[0].files.len(), 2);
        assert!(res.total_wasted_bytes > 0);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
