use crate::cleaner::{CleanErrorItem, CleanResult};
use crate::db::{CleanupRecord, Database};
use crate::safety::SafetyGuard;
use crate::scanner::{Scanner, SkippedPath};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateFile {
    pub path: String,
    pub name: String,
    pub file_size: u64,
    pub allocated_bytes: u64,
    pub modified_at: Option<String>,
    pub is_selected_for_removal: bool,
    pub inode: u64,
    pub device: u64,
    pub nlink: u64,
    pub is_hardlink_copy: bool,
    pub is_suggested_original: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub file_size: u64,
    pub allocated_bytes: u64,
    pub wasted_bytes: u64,
    pub reclaimable_bytes: u64,
    pub has_hardlinks: bool,
    pub files: Vec<DuplicateFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateScanProgress {
    pub phase: String,
    pub files_scanned: usize,
    pub candidate_files: usize,
    pub candidate_groups: usize,
    pub bytes_hashed: u64,
    pub current_file: String,
    pub percent_complete: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateScanResult {
    pub duration_ms: u64,
    pub total_duplicate_groups: usize,
    pub total_duplicate_files: usize,
    pub total_wasted_bytes: u64,
    pub total_reclaimable_bytes: u64,
    pub groups: Vec<DuplicateGroup>,
    pub skipped_paths: Vec<SkippedPath>,
    pub was_cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroupCleanSelection {
    pub group_hash: String,
    pub original_path: String,
    pub paths_to_delete: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanDuplicatesRequest {
    pub groups: Vec<DuplicateGroupCleanSelection>,
    pub dry_run: bool,
    pub confirmed: bool,
}

pub struct DuplicateScanner;

impl DuplicateScanner {
    /// Reads up to 16KB from head and 16KB from tail to compute a rapid pre-filter BLAKE3 hash
    pub fn compute_quick_hash<P: AsRef<Path>>(path: P) -> std::io::Result<String> {
        let p = path.as_ref();
        let mut file = File::open(p)?;
        let meta = file.metadata()?;
        let len = meta.len();
        let initial_mod = meta.modified().ok();

        let mut hasher = blake3::Hasher::new();
        let chunk_size = 16384; // 16KB
        let mut buf = vec![0u8; chunk_size];

        // Read prefix
        let bytes_read = file.read(&mut buf)?;
        hasher.update(&buf[..bytes_read]);

        // If file is larger than 32KB, read suffix
        if len > (chunk_size as u64 * 2) {
            file.seek(SeekFrom::End(-(chunk_size as i64)))?;
            let bytes_read = file.read(&mut buf)?;
            hasher.update(&buf[..bytes_read]);
        }

        // Recheck file modification to detect concurrent edits during hashing
        if let (Some(init), Ok(later)) = (initial_mod, file.metadata().and_then(|m| m.modified())) {
            if init != later {
                return Err(std::io::Error::other("File modified during partial hashing"));
            }
        }

        Ok(hasher.finalize().to_hex().to_string())
    }

    /// Computes full BLAKE3 hash by streaming file contents in 64KB chunks with bounded memory
    pub fn compute_full_hash<P: AsRef<Path>>(path: P) -> std::io::Result<String> {
        let p = path.as_ref();
        let mut file = File::open(p)?;
        let initial_meta = file.metadata()?;
        let initial_mod = initial_meta.modified().ok();
        let initial_len = initial_meta.len();

        let mut hasher = blake3::Hasher::new();
        let mut buffer = [0u8; 65536]; // Bounded 64KB chunk buffer
        let mut total_read = 0u64;

        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
            total_read += bytes_read as u64;
        }

        // Verify total bytes read matches metadata length
        if total_read != initial_len {
            return Err(std::io::Error::other("File size changed during streaming hash"));
        }

        // Verify modification timestamp didn't change during read
        if let (Some(init), Ok(later)) = (initial_mod, file.metadata().and_then(|m| m.modified())) {
            if init != later {
                return Err(std::io::Error::other("File modified during full hashing"));
            }
        }

        Ok(hasher.finalize().to_hex().to_string())
    }

    /// Scan directory for exact duplicates using tiered size -> quick hash -> full hash approach
    pub fn scan_duplicates<P: AsRef<Path>>(
        directory: P,
        min_size_bytes: u64,
        cancel_token: Arc<AtomicBool>,
    ) -> DuplicateScanResult {
        Self::scan_duplicates_advanced(directory, min_size_bytes, cancel_token, |_| {})
    }

    /// Advanced parallel duplicate scanner with streaming progress, hard-link awareness, and safety exclusion
    pub fn scan_duplicates_advanced<P: AsRef<Path>, F>(
        directory: P,
        min_size_bytes: u64,
        cancel_token: Arc<AtomicBool>,
        progress_cb: F,
    ) -> DuplicateScanResult
    where
        F: Fn(DuplicateScanProgress) + Send + Sync,
    {
        let start = Instant::now();
        let root = directory.as_ref();

        if !root.exists() {
            return DuplicateScanResult {
                duration_ms: 0,
                total_duplicate_groups: 0,
                total_duplicate_files: 0,
                total_wasted_bytes: 0,
                total_reclaimable_bytes: 0,
                groups: Vec::new(),
                skipped_paths: Vec::new(),
                was_cancelled: false,
            };
        }

        // System protection and mandatory exclusion guardrails
        if SafetyGuard::is_system_protected(root) || SafetyGuard::is_mandatory_exclusion(root) {
            return DuplicateScanResult {
                duration_ms: 0,
                total_duplicate_groups: 0,
                total_duplicate_files: 0,
                total_wasted_bytes: 0,
                total_reclaimable_bytes: 0,
                groups: Vec::new(),
                skipped_paths: vec![SkippedPath {
                    path: root.to_string_lossy().to_string(),
                    reason: "Target directory is in a system-protected or excluded scope".into(),
                }],
                was_cancelled: false,
            };
        }

        let root_meta = match root.symlink_metadata() {
            Ok(m) => m,
            Err(e) => {
                return DuplicateScanResult {
                    duration_ms: 0,
                    total_duplicate_groups: 0,
                    total_duplicate_files: 0,
                    total_wasted_bytes: 0,
                    total_reclaimable_bytes: 0,
                    groups: Vec::new(),
                    skipped_paths: vec![SkippedPath {
                        path: root.to_string_lossy().to_string(),
                        reason: e.to_string(),
                    }],
                    was_cancelled: false,
                };
            }
        };
        let root_dev = root_meta.dev();

        #[derive(Debug, Clone)]
        struct CandidateFileMeta {
            path: PathBuf,
            len: u64,
            alloc_bytes: u64,
            dev: u64,
            ino: u64,
            nlink: u64,
            modified_at: Option<String>,
        }

        // Phase 1: Bucket files by exact file size
        let mut size_buckets: HashMap<u64, Vec<CandidateFileMeta>> = HashMap::new();
        let mut skipped_paths = Vec::new();
        let mut total_files_scanned = 0usize;

        progress_cb(DuplicateScanProgress {
            phase: "Discovering candidate files...".into(),
            files_scanned: 0,
            candidate_files: 0,
            candidate_groups: 0,
            bytes_hashed: 0,
            current_file: root.to_string_lossy().to_string(),
            percent_complete: 5.0,
        });

        for entry_res in WalkDir::new(root)
            .follow_links(false)
            .into_iter()
        {
            if cancel_token.load(Ordering::Relaxed) {
                return DuplicateScanResult {
                    duration_ms: start.elapsed().as_millis() as u64,
                    total_duplicate_groups: 0,
                    total_duplicate_files: 0,
                    total_wasted_bytes: 0,
                    total_reclaimable_bytes: 0,
                    groups: Vec::new(),
                    skipped_paths,
                    was_cancelled: true,
                };
            }

            let entry = match entry_res {
                Ok(e) => e,
                Err(err) => {
                    let p = err.path().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
                    skipped_paths.push(SkippedPath {
                        path: p,
                        reason: err.to_string(),
                    });
                    continue;
                }
            };

            // Symlink safety: Never follow or hash symlinks as duplicate candidates
            if entry.path_is_symlink() {
                continue;
            }

            let path = entry.path();
            if SafetyGuard::is_mandatory_exclusion(path) || SafetyGuard::is_database_or_persistent_state(path) {
                continue;
            }

            if entry.file_type().is_file() {
                total_files_scanned += 1;
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(e) => {
                        skipped_paths.push(SkippedPath {
                            path: path.to_string_lossy().to_string(),
                            reason: e.to_string(),
                        });
                        continue;
                    }
                };

                // Filesystem boundary check
                if meta.dev() != root_dev {
                    continue;
                }

                let len = meta.len();
                // Empty files (0 bytes) do not consume physical disk space and are excluded
                if len >= min_size_bytes && len > 0 {
                    let alloc_bytes = meta.blocks() * 512;
                    let modified_at = meta
                        .modified()
                        .ok()
                        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

                    size_buckets.entry(len).or_default().push(CandidateFileMeta {
                        path: path.to_path_buf(),
                        len,
                        alloc_bytes,
                        dev: meta.dev(),
                        ino: meta.ino(),
                        nlink: meta.nlink(),
                        modified_at,
                    });
                }
            }
        }

        // Filter out unique file sizes
        let candidate_sizes: Vec<(u64, Vec<CandidateFileMeta>)> = size_buckets
            .into_iter()
            .filter(|(_, files)| files.len() > 1)
            .collect();

        let total_candidate_files: usize = candidate_sizes.iter().map(|(_, files)| files.len()).sum();

        progress_cb(DuplicateScanProgress {
            phase: format!("Filtering {} candidate files by partial hash...", total_candidate_files),
            files_scanned: total_files_scanned,
            candidate_files: total_candidate_files,
            candidate_groups: candidate_sizes.len(),
            bytes_hashed: 0,
            current_file: String::new(),
            percent_complete: 30.0,
        });

        // Phase 2: Compute quick hash for candidates in parallel
        let partial_hash_candidates: Arc<Mutex<Vec<Vec<CandidateFileMeta>>>> = Arc::new(Mutex::new(Vec::new()));
        let skipped_collector: Arc<Mutex<Vec<SkippedPath>>> = Arc::new(Mutex::new(skipped_paths));

        candidate_sizes.into_par_iter().for_each(|(_size, files)| {
            if cancel_token.load(Ordering::Relaxed) {
                return;
            }

            let mut quick_buckets: HashMap<String, Vec<CandidateFileMeta>> = HashMap::new();
            for f in files {
                match Self::compute_quick_hash(&f.path) {
                    Ok(qh) => {
                        quick_buckets.entry(qh).or_default().push(f);
                    }
                    Err(e) => {
                        skipped_collector.lock().unwrap().push(SkippedPath {
                            path: f.path.to_string_lossy().to_string(),
                            reason: e.to_string(),
                        });
                    }
                }
            }

            for (_, matching_files) in quick_buckets {
                if matching_files.len() > 1 {
                    partial_hash_candidates.lock().unwrap().push(matching_files);
                }
            }
        });

        if cancel_token.load(Ordering::Relaxed) {
            return DuplicateScanResult {
                duration_ms: start.elapsed().as_millis() as u64,
                total_duplicate_groups: 0,
                total_duplicate_files: 0,
                total_wasted_bytes: 0,
                total_reclaimable_bytes: 0,
                groups: Vec::new(),
                skipped_paths: Arc::try_unwrap(skipped_collector).unwrap().into_inner().unwrap(),
                was_cancelled: true,
            };
        }

        let full_hash_input = Arc::try_unwrap(partial_hash_candidates).unwrap().into_inner().unwrap();
        let total_groups_to_verify = full_hash_input.len();

        progress_cb(DuplicateScanProgress {
            phase: format!("Verifying {} duplicate groups via streaming BLAKE3...", total_groups_to_verify),
            files_scanned: total_files_scanned,
            candidate_files: full_hash_input.iter().map(|g| g.len()).sum(),
            candidate_groups: total_groups_to_verify,
            bytes_hashed: 0,
            current_file: String::new(),
            percent_complete: 60.0,
        });

        // Phase 3: For quick hash collisions, compute full streaming BLAKE3 hash
        let confirmed_groups: Arc<Mutex<Vec<DuplicateGroup>>> = Arc::new(Mutex::new(Vec::new()));

        full_hash_input.into_par_iter().for_each(|files| {
            if cancel_token.load(Ordering::Relaxed) {
                return;
            }

            let mut full_buckets: HashMap<String, Vec<CandidateFileMeta>> = HashMap::new();
            for f in files {
                match Self::compute_full_hash(&f.path) {
                    Ok(fh) => {
                        full_buckets.entry(fh).or_default().push(f);
                    }
                    Err(e) => {
                        skipped_collector.lock().unwrap().push(SkippedPath {
                            path: f.path.to_string_lossy().to_string(),
                            reason: e.to_string(),
                        });
                    }
                }
            }

            for (full_hash, mut matching_files) in full_buckets {
                if matching_files.len() > 1 {
                    // Sort matching files by modified date ascending (oldest first)
                    matching_files.sort_by(|a, b| a.modified_at.cmp(&b.modified_at));

                    let file_size = matching_files[0].len;
                    let alloc_size = matching_files[0].alloc_bytes.max(file_size);

                    let mut seen_inodes: HashSet<(u64, u64)> = HashSet::new();
                    let mut duplicate_files = Vec::new();
                    let mut has_hardlinks = false;

                    for (idx, mf) in matching_files.iter().enumerate() {
                        let is_hardlink = !seen_inodes.insert((mf.dev, mf.ino));
                        if is_hardlink {
                            has_hardlinks = true;
                        }

                        let name = mf.path.file_name().unwrap_or_default().to_string_lossy().to_string();

                        duplicate_files.push(DuplicateFile {
                            path: mf.path.to_string_lossy().to_string(),
                            name,
                            file_size: mf.len,
                            allocated_bytes: mf.alloc_bytes,
                            modified_at: mf.modified_at.clone(),
                            is_selected_for_removal: false, // Invariant: Default to NO files preselected
                            inode: mf.ino,
                            device: mf.dev,
                            nlink: mf.nlink,
                            is_hardlink_copy: is_hardlink,
                            is_suggested_original: idx == 0, // Suggest oldest as default original
                        });
                    }

                    // Wasted bytes: total duplicate copies * alloc_size
                    let wasted_bytes = (matching_files.len() - 1) as u64 * alloc_size;

                    // Reclaimable bytes: only distinct inodes beyond the 1st free physical APFS blocks
                    let unique_inodes_count = seen_inodes.len();
                    let reclaimable_bytes = if unique_inodes_count > 1 {
                        (unique_inodes_count - 1) as u64 * alloc_size
                    } else {
                        0 // Hard-link copies share the same physical inode
                    };

                    let group = DuplicateGroup {
                        hash: full_hash,
                        file_size,
                        allocated_bytes: alloc_size,
                        wasted_bytes,
                        reclaimable_bytes,
                        has_hardlinks,
                        files: duplicate_files,
                    };

                    confirmed_groups.lock().unwrap().push(group);
                }
            }
        });

        let mut groups = Arc::try_unwrap(confirmed_groups).unwrap().into_inner().unwrap();
        // Sort groups by reclaimable bytes descending
        groups.sort_by_key(|a| std::cmp::Reverse(a.reclaimable_bytes));

        let total_wasted_bytes: u64 = groups.iter().map(|g| g.wasted_bytes).sum();
        let total_reclaimable_bytes: u64 = groups.iter().map(|g| g.reclaimable_bytes).sum();
        let total_duplicate_files: usize = groups.iter().map(|g| g.files.len()).sum();
        let total_duplicate_groups = groups.len();
        let final_skipped = Arc::try_unwrap(skipped_collector).unwrap().into_inner().unwrap();

        progress_cb(DuplicateScanProgress {
            phase: format!("Duplicate detection complete. Found {} groups.", total_duplicate_groups),
            files_scanned: total_files_scanned,
            candidate_files: total_duplicate_files,
            candidate_groups: total_duplicate_groups,
            bytes_hashed: 0,
            current_file: String::new(),
            percent_complete: 100.0,
        });

        DuplicateScanResult {
            duration_ms: start.elapsed().as_millis() as u64,
            total_duplicate_groups,
            total_duplicate_files,
            total_wasted_bytes,
            total_reclaimable_bytes,
            groups,
            skipped_paths: final_skipped,
            was_cancelled: cancel_token.load(Ordering::Relaxed),
        }
    }

    /// Cleans selected duplicates with strict Rust-side Original Preservation enforcement
    pub fn clean_duplicate_groups(
        req: CleanDuplicatesRequest,
        db: &Database,
        cancel_token: Arc<AtomicBool>,
    ) -> Result<CleanResult, String> {
        let start = Instant::now();

        if !req.confirmed && !req.dry_run {
            return Err("Execution rejected: Duplicate cleanup confirmation was not explicitly provided.".to_string());
        }

        if req.groups.is_empty() {
            return Ok(CleanResult {
                success: true,
                dry_run: req.dry_run,
                bytes_freed: 0,
                bytes_moved_to_trash: 0,
                items_deleted: 0,
                items_skipped: 0,
                items_failed: 0,
                errors: Vec::new(),
                duration_ms: 0,
                was_cancelled: false,
            });
        }

        let mut bytes_freed = 0u64;
        let mut bytes_moved_to_trash = 0u64;
        let mut items_deleted = 0usize;
        let mut items_skipped = 0usize;
        let mut items_failed = 0usize;
        let mut errors = Vec::new();
        let mut deleted_paths = Vec::new();
        let mut was_cancelled = false;

        for group_sel in &req.groups {
            if cancel_token.load(Ordering::Relaxed) {
                was_cancelled = true;
                break;
            }

            // CRITICAL INVARIANT: Original Preservation Enforcement
            // 1. Verify an original copy is designated
            if group_sel.original_path.trim().is_empty() {
                return Err(format!(
                    "Original preservation violation: Duplicate group '{}' has no preserved original designated.",
                    group_sel.group_hash
                ));
            }

            // 2. Reject if paths_to_delete contains original_path
            if group_sel.paths_to_delete.iter().any(|p| p == &group_sel.original_path) {
                return Err(format!(
                    "Original preservation violation: Attempted to delete the designated original copy '{}' in group '{}'.",
                    group_sel.original_path, group_sel.group_hash
                ));
            }

            // 3. Verify original_path exists on filesystem
            let orig_path = PathBuf::from(&group_sel.original_path);
            if !orig_path.exists() {
                return Err(format!(
                    "Original preservation violation: The designated original file '{}' no longer exists on filesystem. Aborting deletion of duplicates to protect against data loss.",
                    group_sel.original_path
                ));
            }

            // 4. Verify original_path still matches the group hash
            let current_orig_hash = match Self::compute_full_hash(&orig_path) {
                Ok(h) => h,
                Err(e) => {
                    return Err(format!(
                        "Original preservation error: Failed to verify original file '{}': {}. Aborting group cleanup.",
                        group_sel.original_path, e
                    ));
                }
            };
            if current_orig_hash != group_sel.group_hash {
                return Err(format!(
                    "Original preservation violation: Original file '{}' was modified after scan (hash mismatch). Aborting to prevent data loss.",
                    group_sel.original_path
                ));
            }

            // Clean each duplicate candidate in paths_to_delete
            for target_str in &group_sel.paths_to_delete {
                if cancel_token.load(Ordering::Relaxed) {
                    was_cancelled = true;
                    break;
                }

                let target_path = PathBuf::from(target_str);
                if !target_path.exists() {
                    errors.push(CleanErrorItem {
                        path: target_str.clone(),
                        error_message: "File no longer exists".into(),
                    });
                    items_skipped += 1;
                    continue;
                }

                // Check whitelist
                if db.is_whitelisted(&target_path) {
                    errors.push(CleanErrorItem {
                        path: target_str.clone(),
                        error_message: "File is whitelisted by user configuration; skipped".into(),
                    });
                    items_skipped += 1;
                    continue;
                }

                // Safety validation: must pass SafetyGuard
                let canonical = match SafetyGuard::validate_for_cleaning(&target_path) {
                    Ok(c) => c,
                    Err(e) => {
                        errors.push(CleanErrorItem {
                            path: target_str.clone(),
                            error_message: format!("Safety violation: {}", e),
                        });
                        items_failed += 1;
                        continue;
                    }
                };

                // Re-verify that the target duplicate still matches the group hash (anti-race condition)
                let current_target_hash = match Self::compute_full_hash(&canonical) {
                    Ok(h) => h,
                    Err(e) => {
                        errors.push(CleanErrorItem {
                            path: target_str.clone(),
                            error_message: format!("Could not verify file hash: {}", e),
                        });
                        items_skipped += 1;
                        continue;
                    }
                };

                if current_target_hash != group_sel.group_hash {
                    errors.push(CleanErrorItem {
                        path: target_str.clone(),
                        error_message: "File content was modified after scanning completed. Skipping to prevent race condition.".into(),
                    });
                    items_skipped += 1;
                    continue;
                }

                // Capture identity snapshot
                let snapshot = match SafetyGuard::capture_snapshot(&canonical) {
                    Ok(s) => s,
                    Err(e) => {
                        errors.push(CleanErrorItem {
                            path: target_str.clone(),
                            error_message: format!("Failed to capture file metadata snapshot: {}", e),
                        });
                        items_failed += 1;
                        continue;
                    }
                };

                // Measure size
                let (size, count) = Scanner::measure_path(&canonical);

                if req.dry_run {
                    bytes_freed += size;
                    items_deleted += count.max(1);
                    continue;
                }

                // Anti-TOCTOU & Symlink Substitution Revalidation immediately prior to deletion
                if let Err(e) = SafetyGuard::verify_unaltered(&canonical, &snapshot) {
                    errors.push(CleanErrorItem {
                        path: target_str.clone(),
                        error_message: format!("Security violation during pre-clean verification: {}", e),
                    });
                    items_failed += 1;
                    continue;
                }

                // Safe deletion strictly via macOS Trash
                match trash::delete(&canonical).map_err(|e| std::io::Error::other(e.to_string())) {
                    Ok(_) => {
                        if canonical.exists() {
                            errors.push(CleanErrorItem {
                                path: target_str.clone(),
                                error_message: "Trash verification failed: File still exists after deletion attempt.".into(),
                            });
                            items_failed += 1;
                        } else {
                            bytes_freed += size;
                            bytes_moved_to_trash += size;
                            items_deleted += count.max(1);
                            deleted_paths.push(target_str.clone());
                        }
                    }
                    Err(e) => {
                        errors.push(CleanErrorItem {
                            path: target_str.clone(),
                            error_message: format!("Failed to move to Trash: {}", e),
                        });
                        items_failed += 1;
                    }
                }
            }
        }

        // Record in SQLite audit log
        if !req.dry_run && items_deleted > 0 {
            let record = CleanupRecord {
                id: None,
                timestamp: chrono::Utc::now().to_rfc3339(),
                bytes_freed,
                items_deleted,
                method: "trash (duplicates)".to_string(),
                details_json: serde_json::to_string(&deleted_paths).unwrap_or_else(|_| "[]".into()),
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_duplicate_detection_flow() {
        let temp_dir = std::env::temp_dir().join("myclean_test_dups_flow");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let file_a = temp_dir.join("file_a.bin");
        let file_b = temp_dir.join("file_b.bin");
        let file_c = temp_dir.join("file_c.bin");

        let content = b"MYCLEAN_TEST_CONTENT_IDENTICAL_BYTES_FOR_DUPLICATE_CHECK_1234567890";
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
        // Invariant: No files preselected for deletion
        assert!(!res.groups[0].files[0].is_selected_for_removal);
        assert!(!res.groups[0].files[1].is_selected_for_removal);
        assert!(res.groups[0].files[0].is_suggested_original);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_duplicates_different_content_same_size() {
        let temp_dir = std::env::temp_dir().join("myclean_test_same_size");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let file1 = temp_dir.join("file1.bin");
        let file2 = temp_dir.join("file2.bin");

        let content1 = b"AAAA_SAME_LENGTH_CONTENT_12345678901234567890";
        let content2 = b"BBBB_SAME_LENGTH_CONTENT_12345678901234567890";
        assert_eq!(content1.len(), content2.len());

        std::fs::write(&file1, content1).unwrap();
        std::fs::write(&file2, content2).unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let res = DuplicateScanner::scan_duplicates(&temp_dir, 10, cancel);

        assert_eq!(res.total_duplicate_groups, 0);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_duplicates_empty_files_excluded() {
        let temp_dir = std::env::temp_dir().join("myclean_test_empty_files");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let empty1 = temp_dir.join("empty1.txt");
        let empty2 = temp_dir.join("empty2.txt");

        std::fs::write(&empty1, b"").unwrap();
        std::fs::write(&empty2, b"").unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let res = DuplicateScanner::scan_duplicates(&temp_dir, 0, cancel);

        assert_eq!(res.total_duplicate_groups, 0);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_duplicates_partial_hash_collision_distinguished() {
        let temp_dir = std::env::temp_dir().join("myclean_test_partial_collision");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        // Create 2 files >32KB with identical 16KB head and 16KB tail, but differing in the middle
        let head = vec![0x41u8; 16384];
        let tail = vec![0x42u8; 16384];

        let mut mid1 = vec![0x31u8; 1000];
        let mut mid2 = vec![0x32u8; 1000];

        let mut file1_bytes = head.clone();
        file1_bytes.append(&mut mid1);
        file1_bytes.extend_from_slice(&tail);

        let mut file2_bytes = head;
        file2_bytes.append(&mut mid2);
        file2_bytes.extend_from_slice(&tail);

        assert_eq!(file1_bytes.len(), file2_bytes.len());

        let path1 = temp_dir.join("collision1.bin");
        let path2 = temp_dir.join("collision2.bin");

        std::fs::write(&path1, &file1_bytes).unwrap();
        std::fs::write(&path2, &file2_bytes).unwrap();

        // Quick hash should match (identical 16KB head & tail)
        let qh1 = DuplicateScanner::compute_quick_hash(&path1).unwrap();
        let qh2 = DuplicateScanner::compute_quick_hash(&path2).unwrap();
        assert_eq!(qh1, qh2);

        // Full hash must differ!
        let fh1 = DuplicateScanner::compute_full_hash(&path1).unwrap();
        let fh2 = DuplicateScanner::compute_full_hash(&path2).unwrap();
        assert_ne!(fh1, fh2);

        // Scanner must NOT group them as duplicates!
        let cancel = Arc::new(AtomicBool::new(false));
        let res = DuplicateScanner::scan_duplicates(&temp_dir, 10, cancel);
        assert_eq!(res.total_duplicate_groups, 0);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_duplicates_hardlink_detection_and_reclaimable_space() {
        let temp_dir = std::env::temp_dir().join("myclean_test_hardlink_dups");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let orig = temp_dir.join("orig.bin");
        let hl = temp_dir.join("hardlink.bin");

        let content = b"IDENTICAL_CONTENT_BETWEEN_HARDLINKS_1234567890";
        std::fs::write(&orig, content).unwrap();
        std::fs::hard_link(&orig, &hl).unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let res = DuplicateScanner::scan_duplicates(&temp_dir, 10, cancel);

        assert_eq!(res.total_duplicate_groups, 1);
        let group = &res.groups[0];
        assert_eq!(group.files.len(), 2);
        assert!(group.has_hardlinks);
        // Since both files share the same inode on disk, reclaimable bytes is 0
        assert_eq!(group.reclaimable_bytes, 0);

        // Check file flags
        let hardlinked_copy = group.files.iter().find(|f| f.is_hardlink_copy);
        assert!(hardlinked_copy.is_some());
        assert_eq!(hardlinked_copy.unwrap().nlink, 2);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_duplicates_symlinks_ignored() {
        let temp_dir = std::env::temp_dir().join("myclean_test_symlink_dups");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let orig = temp_dir.join("real_file.bin");
        let sym = temp_dir.join("symlink_file.bin");

        std::fs::write(&orig, b"UNIQUE_CONTENT_FOR_SYMLINK_TEST").unwrap();
        std::os::unix::fs::symlink(&orig, &sym).unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let res = DuplicateScanner::scan_duplicates(&temp_dir, 10, cancel);

        // Symlink must not create a duplicate group with the target
        assert_eq!(res.total_duplicate_groups, 0);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_duplicates_cancellation() {
        let cancel = Arc::new(AtomicBool::new(true)); // Pre-cancelled
        let temp = std::env::temp_dir();
        let res = DuplicateScanner::scan_duplicates(&temp, 1024, cancel);
        assert!(res.was_cancelled);
        assert_eq!(res.total_duplicate_groups, 0);
    }

    #[test]
    fn test_duplicates_original_preservation_enforced() {
        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let temp_dir = std::env::temp_dir().join("myclean_test_orig_preserv");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let orig = temp_dir.join("original.txt");
        let dup = temp_dir.join("dup.txt");
        let content = b"SAME_CONTENT_ORIGINAL_PRESERVATION";
        std::fs::write(&orig, content).unwrap();
        std::fs::write(&dup, content).unwrap();

        let hash = DuplicateScanner::compute_full_hash(&orig).unwrap();

        // 1. Violation: Attempting to delete the original itself
        let bad_req_1 = CleanDuplicatesRequest {
            groups: vec![DuplicateGroupCleanSelection {
                group_hash: hash.clone(),
                original_path: orig.to_string_lossy().to_string(),
                paths_to_delete: vec![orig.to_string_lossy().to_string()], // Violates: deleting original
            }],
            dry_run: false,
            confirmed: true,
        };
        let res1 = DuplicateScanner::clean_duplicate_groups(bad_req_1, &db, cancel.clone());
        assert!(res1.is_err());
        assert!(res1.unwrap_err().contains("Original preservation violation"));

        // 2. Violation: Attempting to clean without specifying an original path
        let bad_req_2 = CleanDuplicatesRequest {
            groups: vec![DuplicateGroupCleanSelection {
                group_hash: hash.clone(),
                original_path: String::new(),
                paths_to_delete: vec![dup.to_string_lossy().to_string()],
            }],
            dry_run: false,
            confirmed: true,
        };
        let res2 = DuplicateScanner::clean_duplicate_groups(bad_req_2, &db, cancel.clone());
        assert!(res2.is_err());
        assert!(res2.unwrap_err().contains("Original preservation violation"));

        // 3. Valid: Original preserved, duplicate deleted
        let valid_req = CleanDuplicatesRequest {
            groups: vec![DuplicateGroupCleanSelection {
                group_hash: hash,
                original_path: orig.to_string_lossy().to_string(),
                paths_to_delete: vec![dup.to_string_lossy().to_string()],
            }],
            dry_run: true,
            confirmed: true,
        };
        let res3 = DuplicateScanner::clean_duplicate_groups(valid_req, &db, cancel);
        assert!(res3.is_ok());
        let clean_res = res3.unwrap();
        assert!(clean_res.dry_run);
        assert_eq!(clean_res.items_deleted, 1);
        assert!(orig.exists());
        assert!(dup.exists()); // Dry run

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_duplicates_anti_race_condition_check() {
        let db = Database::in_memory().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let temp_dir = std::env::temp_dir().join("myclean_test_race_dup");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let orig = temp_dir.join("orig.txt");
        let dup = temp_dir.join("dup.txt");
        std::fs::write(&orig, b"INITIAL_IDENTICAL_CONTENT").unwrap();
        std::fs::write(&dup, b"INITIAL_IDENTICAL_CONTENT").unwrap();

        let initial_hash = DuplicateScanner::compute_full_hash(&orig).unwrap();

        // Simulate file modification between scan and clean:
        std::fs::write(&dup, b"MODIFIED_AFTER_SCAN_CONTENT").unwrap();

        let req = CleanDuplicatesRequest {
            groups: vec![DuplicateGroupCleanSelection {
                group_hash: initial_hash,
                original_path: orig.to_string_lossy().to_string(),
                paths_to_delete: vec![dup.to_string_lossy().to_string()],
            }],
            dry_run: false,
            confirmed: true,
        };

        let res = DuplicateScanner::clean_duplicate_groups(req, &db, cancel).unwrap();
        assert!(!res.success);
        assert_eq!(res.items_skipped, 1);
        assert!(res.errors[0].error_message.contains("modified after scanning completed"));
        assert!(dup.exists()); // File must NOT be deleted due to race condition

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
