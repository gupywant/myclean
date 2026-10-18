use crate::safety::SafetyGuard;
use crate::scanner::{RiskClassification, SkippedPath};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use sysinfo::Disks;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageNodeType {
    Directory,
    File,
    Symlink,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileTypeCategory {
    Developer,
    Media,
    Archives,
    Documents,
    SystemCaches,
    Other,
}

impl FileTypeCategory {
    pub fn display_name(&self) -> &'static str {
        match self {
            FileTypeCategory::Developer => "Developer & Code",
            FileTypeCategory::Media => "Audio, Video & Photos",
            FileTypeCategory::Archives => "Archives & Disk Images",
            FileTypeCategory::Documents => "Documents & Office",
            FileTypeCategory::SystemCaches => "Caches, Logs & Temp",
            FileTypeCategory::Other => "Other File Types",
        }
    }

    pub fn from_extension(ext: &str) -> Self {
        let e = ext.to_ascii_lowercase();
        match e.as_str() {
            "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "swift" | "c" | "cpp" | "h" | "hpp"
            | "go" | "java" | "rb" | "php" | "json" | "yaml" | "yml" | "toml" | "lock"
            | "o" | "a" | "dylib" | "sh" | "zsh" | "bash" | "html" | "css" | "scss" => {
                FileTypeCategory::Developer
            }
            "mp4" | "mov" | "m4v" | "mkv" | "avi" | "mp3" | "wav" | "flac" | "aac"
            | "png" | "jpg" | "jpeg" | "gif" | "heic" | "webp" | "svg" | "psd" | "ai"
            | "tiff" | "bmp" => FileTypeCategory::Media,
            "zip" | "tar" | "gz" | "tgz" | "bz2" | "7z" | "dmg" | "pkg" | "iso" | "xz"
            | "rar" => FileTypeCategory::Archives,
            "pdf" | "doc" | "docx" | "pages" | "xls" | "xlsx" | "numbers" | "ppt" | "pptx"
            | "key" | "txt" | "md" | "csv" | "rtf" | "epub" => FileTypeCategory::Documents,
            "cache" | "log" | "tmp" | "temp" | "bak" | "swp" | "ds_store" => {
                FileTypeCategory::SystemCaches
            }
            _ => FileTypeCategory::Other,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTypeBreakdown {
    pub category: FileTypeCategory,
    pub display_name: String,
    pub total_allocated_bytes: u64,
    pub total_logical_bytes: u64,
    pub file_count: usize,
    pub percentage: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub node_type: StorageNodeType,
    pub allocated_bytes: u64,
    pub logical_bytes: u64,
    pub file_count: usize,
    pub file_type: Option<FileTypeCategory>,
    pub children: Vec<StorageNode>,
    pub classification: RiskClassification,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LargestItem {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub allocated_bytes: u64,
    pub logical_bytes: u64,
    pub file_count: usize,
    pub file_type: Option<FileTypeCategory>,
    pub classification: RiskClassification,
    pub modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeInfo {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub file_system: String,
    pub is_removable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageAnalysisCoverage {
    pub analyzed_allocated_bytes: u64,
    pub analyzed_logical_bytes: u64,
    pub total_files_analyzed: usize,
    pub total_dirs_analyzed: usize,
    pub inaccessible_paths_count: usize,
    pub inaccessible_paths: Vec<SkippedPath>,
    pub volume_total_bytes: u64,
    pub volume_available_bytes: u64,
    pub coverage_percentage: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageAnalysisResult {
    pub root_path: String,
    pub duration_ms: u64,
    pub volume: Option<VolumeInfo>,
    pub root_node: StorageNode,
    pub largest_files: Vec<LargestItem>,
    pub largest_folders: Vec<LargestItem>,
    pub file_type_distribution: Vec<FileTypeBreakdown>,
    pub coverage: StorageAnalysisCoverage,
    pub was_cancelled: bool,
}

pub struct StorageAnalyzer;

impl StorageAnalyzer {
    /// Detects the mounted filesystem volume for a given path using sysinfo
    pub fn detect_volume_for_path(path: &Path) -> Option<VolumeInfo> {
        let disks = Disks::new_with_refreshed_list();
        let target_canon = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

        // Find the disk mount point with the longest matching prefix
        let mut best_match: Option<VolumeInfo> = None;
        let mut longest_prefix = 0;

        for disk in &disks {
            let mount = disk.mount_point();
            if target_canon.starts_with(mount) {
                let len = mount.as_os_str().len();
                if len >= longest_prefix {
                    longest_prefix = len;
                    let total = disk.total_space();
                    let avail = disk.available_space();
                    let used = total.saturating_sub(avail);

                    best_match = Some(VolumeInfo {
                        name: disk.name().to_string_lossy().to_string(),
                        mount_point: mount.to_string_lossy().to_string(),
                        total_bytes: total,
                        available_bytes: avail,
                        used_bytes: used,
                        file_system: disk.file_system().to_string_lossy().to_string(),
                        is_removable: disk.is_removable(),
                    });
                }
            }
        }

        best_match
    }

    /// Performs a comprehensive storage analysis of `root_path`
    pub fn analyze<P: AsRef<Path>>(
        root_path: P,
        max_tree_depth: usize,
        cancel_token: Arc<AtomicBool>,
    ) -> Result<StorageAnalysisResult, String> {
        let start = Instant::now();
        let p = root_path.as_ref();

        if !p.exists() {
            return Err(format!("Specified target path does not exist: {}", p.display()));
        }

        let canonical = p.canonicalize().map_err(|e| e.to_string())?;

        // Guard against analyzing prohibited SIP roots
        if SafetyGuard::is_system_protected(&canonical) {
            return Err("Target path is inside a protected macOS system location (SIP).".into());
        }

        let volume = Self::detect_volume_for_path(&canonical);
        let root_meta = canonical.symlink_metadata().map_err(|e| e.to_string())?;
        let root_dev = root_meta.dev();

        let mut visited_inodes: HashSet<(u64, u64)> = HashSet::new();
        let mut inaccessible_paths: Vec<SkippedPath> = Vec::new();
        let mut largest_files: Vec<LargestItem> = Vec::new();
        let mut largest_folders: Vec<LargestItem> = Vec::new();
        let mut type_stats: HashMap<FileTypeCategory, (u64, u64, usize)> = HashMap::new(); // (allocated, logical, count)

        let mut total_files_analyzed = 0usize;
        let mut total_dirs_analyzed = 0usize;

        let root_node = Self::walk_node(
            &canonical,
            root_dev,
            0,
            max_tree_depth,
            &mut visited_inodes,
            &mut inaccessible_paths,
            &mut largest_files,
            &mut largest_folders,
            &mut type_stats,
            &mut total_files_analyzed,
            &mut total_dirs_analyzed,
            &cancel_token,
        );

        let was_cancelled = cancel_token.load(Ordering::Relaxed);

        // Sort largest items descending by allocated bytes
        largest_files.sort_by_key(|a| std::cmp::Reverse(a.allocated_bytes));
        largest_files.truncate(50);

        largest_folders.sort_by_key(|a| std::cmp::Reverse(a.allocated_bytes));
        largest_folders.truncate(25);

        // Compute file type distribution
        let total_analyzed_alloc = root_node.allocated_bytes;
        let mut file_type_distribution = Vec::new();
        let all_categories = [
            FileTypeCategory::Developer,
            FileTypeCategory::Media,
            FileTypeCategory::Archives,
            FileTypeCategory::Documents,
            FileTypeCategory::SystemCaches,
            FileTypeCategory::Other,
        ];

        for cat in all_categories {
            if let Some(&(alloc, logical, count)) = type_stats.get(&cat) {
                let pct = if total_analyzed_alloc > 0 {
                    (alloc as f32 / total_analyzed_alloc as f32) * 100.0
                } else {
                    0.0
                };

                file_type_distribution.push(FileTypeBreakdown {
                    category: cat,
                    display_name: cat.display_name().to_string(),
                    total_allocated_bytes: alloc,
                    total_logical_bytes: logical,
                    file_count: count,
                    percentage: pct,
                });
            }
        }

        // Sort file types by allocated size descending
        file_type_distribution.sort_by_key(|a| std::cmp::Reverse(a.total_allocated_bytes));

        let vol_total = volume.as_ref().map(|v| v.total_bytes).unwrap_or(0);
        let vol_avail = volume.as_ref().map(|v| v.available_bytes).unwrap_or(0);
        let coverage_pct = if vol_total > 0 {
            (total_analyzed_alloc as f32 / vol_total as f32) * 100.0
        } else {
            0.0
        };

        let coverage = StorageAnalysisCoverage {
            analyzed_allocated_bytes: total_analyzed_alloc,
            analyzed_logical_bytes: root_node.logical_bytes,
            total_files_analyzed,
            total_dirs_analyzed,
            inaccessible_paths_count: inaccessible_paths.len(),
            inaccessible_paths,
            volume_total_bytes: vol_total,
            volume_available_bytes: vol_avail,
            coverage_percentage: coverage_pct,
        };

        Ok(StorageAnalysisResult {
            root_path: canonical.to_string_lossy().to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
            volume,
            root_node,
            largest_files,
            largest_folders,
            file_type_distribution,
            coverage,
            was_cancelled,
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn walk_node(
        path: &Path,
        root_dev: u64,
        current_depth: usize,
        max_tree_depth: usize,
        visited_inodes: &mut HashSet<(u64, u64)>,
        inaccessible_paths: &mut Vec<SkippedPath>,
        largest_files: &mut Vec<LargestItem>,
        largest_folders: &mut Vec<LargestItem>,
        type_stats: &mut HashMap<FileTypeCategory, (u64, u64, usize)>,
        total_files_analyzed: &mut usize,
        total_dirs_analyzed: &mut usize,
        cancel_token: &AtomicBool,
    ) -> StorageNode {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());
        let path_str = path.to_string_lossy().to_string();

        let meta = match path.symlink_metadata() {
            Ok(m) => m,
            Err(e) => {
                inaccessible_paths.push(SkippedPath {
                    path: path_str.clone(),
                    reason: e.to_string(),
                });
                return StorageNode {
                    id: path_str.clone(),
                    name,
                    path: path_str,
                    node_type: StorageNodeType::File,
                    allocated_bytes: 0,
                    logical_bytes: 0,
                    file_count: 0,
                    file_type: None,
                    children: Vec::new(),
                    classification: RiskClassification::Protected,
                };
            }
        };

        // Classify node risk
        let classification = if path_str.contains("/Library/Caches") || path_str.contains("/.Trash") {
            RiskClassification::SafeToClean
        } else if SafetyGuard::is_mandatory_exclusion(path) {
            RiskClassification::Protected
        } else {
            RiskClassification::ReviewRequired
        };

        // If it's a symlink, record link size and do not follow
        if meta.file_type().is_symlink() {
            let logical = meta.len();
            let allocated = meta.blocks() * 512;
            return StorageNode {
                id: path_str.clone(),
                name,
                path: path_str,
                node_type: StorageNodeType::Symlink,
                allocated_bytes: allocated,
                logical_bytes: logical,
                file_count: 1,
                file_type: None,
                children: Vec::new(),
                classification,
            };
        }

        // If it's a regular file
        if meta.is_file() {
            *total_files_analyzed += 1;
            let dev = meta.dev();
            let ino = meta.ino();
            let nlink = meta.nlink();

            let logical = meta.len();
            let allocated = meta.blocks() * 512;

            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            let file_cat = FileTypeCategory::from_extension(ext);

            // Hard link deduplication
            let count_bytes = if nlink > 1 {
                visited_inodes.insert((dev, ino))
            } else {
                true
            };

            let alloc_to_add = if count_bytes { allocated } else { 0 };
            let logical_to_add = if count_bytes { logical } else { 0 };

            if count_bytes {
                let stat = type_stats.entry(file_cat).or_insert((0, 0, 0));
                stat.0 += alloc_to_add;
                stat.1 += logical_to_add;
                stat.2 += 1;

                let modified_at = meta.modified().ok().map(|t| {
                    chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()
                });

                largest_files.push(LargestItem {
                    path: path_str.clone(),
                    name: name.clone(),
                    is_dir: false,
                    allocated_bytes: alloc_to_add,
                    logical_bytes: logical_to_add,
                    file_count: 1,
                    file_type: Some(file_cat),
                    classification,
                    modified_at,
                });
            }

            return StorageNode {
                id: path_str.clone(),
                name,
                path: path_str,
                node_type: StorageNodeType::File,
                allocated_bytes: alloc_to_add,
                logical_bytes: logical_to_add,
                file_count: 1,
                file_type: Some(file_cat),
                children: Vec::new(),
                classification,
            };
        }

        // It's a directory
        *total_dirs_analyzed += 1;
        let mut dir_allocated = 0u64;
        let mut dir_logical = 0u64;
        let mut dir_file_count = 0usize;
        let mut children = Vec::new();

        if cancel_token.load(Ordering::Relaxed) {
            return StorageNode {
                id: path_str.clone(),
                name,
                path: path_str,
                node_type: StorageNodeType::Directory,
                allocated_bytes: 0,
                logical_bytes: 0,
                file_count: 0,
                file_type: None,
                children: Vec::new(),
                classification,
            };
        }

        match fs::read_dir(path) {
            Ok(entries) => {
                for entry in entries.flatten() {
                    if cancel_token.load(Ordering::Relaxed) {
                        break;
                    }

                    let child_path = entry.path();

                    // Check filesystem boundary
                    if let Ok(m) = child_path.symlink_metadata() {
                        if m.dev() != root_dev {
                            continue;
                        }
                    }

                    // Prune excluded git internals
                    if child_path.file_name().map(|n| n == ".git").unwrap_or(false) {
                        continue;
                    }

                    let child_node = Self::walk_node(
                        &child_path,
                        root_dev,
                        current_depth + 1,
                        max_tree_depth,
                        visited_inodes,
                        inaccessible_paths,
                        largest_files,
                        largest_folders,
                        type_stats,
                        total_files_analyzed,
                        total_dirs_analyzed,
                        cancel_token,
                    );

                    dir_allocated += child_node.allocated_bytes;
                    dir_logical += child_node.logical_bytes;
                    dir_file_count += child_node.file_count;

                    // Only preserve children in tree structure up to max_tree_depth to optimize memory
                    if current_depth < max_tree_depth {
                        children.push(child_node);
                    }
                }
            }
            Err(e) => {
                inaccessible_paths.push(SkippedPath {
                    path: path_str.clone(),
                    reason: e.to_string(),
                });
            }
        }

        // Sort children descending by allocated bytes for treemap rendering
        children.sort_by_key(|c| std::cmp::Reverse(c.allocated_bytes));

        if dir_allocated > 0 {
            largest_folders.push(LargestItem {
                path: path_str.clone(),
                name: name.clone(),
                is_dir: true,
                allocated_bytes: dir_allocated,
                logical_bytes: dir_logical,
                file_count: dir_file_count,
                file_type: None,
                classification,
                modified_at: None,
            });
        }

        StorageNode {
            id: path_str.clone(),
            name,
            path: path_str,
            node_type: StorageNodeType::Directory,
            allocated_bytes: dir_allocated,
            logical_bytes: dir_logical,
            file_count: dir_file_count,
            file_type: None,
            children,
            classification,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_type_categorization() {
        assert_eq!(FileTypeCategory::from_extension("rs"), FileTypeCategory::Developer);
        assert_eq!(FileTypeCategory::from_extension("TSX"), FileTypeCategory::Developer);
        assert_eq!(FileTypeCategory::from_extension("mp4"), FileTypeCategory::Media);
        assert_eq!(FileTypeCategory::from_extension("dmg"), FileTypeCategory::Archives);
        assert_eq!(FileTypeCategory::from_extension("pdf"), FileTypeCategory::Documents);
        assert_eq!(FileTypeCategory::from_extension("log"), FileTypeCategory::SystemCaches);
        assert_eq!(FileTypeCategory::from_extension("unknown_ext_xyz"), FileTypeCategory::Other);
    }

    #[test]
    fn test_storage_analyzer_on_temp_dir() {
        let temp_dir = std::env::temp_dir().join("myclean_storage_test");
        let _ = std::fs::remove_dir_all(&temp_dir);
        let _ = std::fs::create_dir_all(&temp_dir);

        let sub = temp_dir.join("subfolder");
        let _ = std::fs::create_dir_all(&sub);

        let f1 = sub.join("code.rs");
        std::fs::write(&f1, vec![0u8; 2048]).unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let res = StorageAnalyzer::analyze(&temp_dir, 3, cancel).unwrap();

        assert_eq!(res.root_node.file_count, 1);
        assert!(res.root_node.allocated_bytes > 0);
        assert!(res.coverage.total_files_analyzed >= 1);
        assert_eq!(res.file_type_distribution.len(), 1);
        assert_eq!(res.file_type_distribution[0].category, FileTypeCategory::Developer);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_storage_analyzer_hardlink_deduplication() {
        let temp_dir = std::env::temp_dir().join("myclean_storage_hardlink_test");
        let _ = std::fs::remove_dir_all(&temp_dir);
        let _ = std::fs::create_dir_all(&temp_dir);

        let f1 = temp_dir.join("f1.bin");
        std::fs::write(&f1, vec![0u8; 4096]).unwrap();

        let f2 = temp_dir.join("f2.bin");
        std::fs::hard_link(&f1, &f2).unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let res = StorageAnalyzer::analyze(&temp_dir, 2, cancel).unwrap();

        // 2 file entries, but allocated bytes should only be counted once
        assert_eq!(res.root_node.file_count, 2);
        assert_eq!(res.coverage.total_files_analyzed, 2);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_storage_analyzer_symlink_avoidance() {
        let temp_dir = std::env::temp_dir().join("myclean_storage_symlink_avoidance");
        let outside_dir = std::env::temp_dir().join("myclean_storage_outside_dir");

        let _ = std::fs::remove_dir_all(&temp_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
        let _ = std::fs::create_dir_all(&temp_dir);
        let _ = std::fs::create_dir_all(&outside_dir);

        // Outside directory has a file
        let outside_file = outside_dir.join("outside.bin");
        std::fs::write(&outside_file, vec![0u8; 8192]).unwrap();

        // Inside directory has a symlink pointing to the outside directory
        let symlink_path = temp_dir.join("link_to_outside");
        std::os::unix::fs::symlink(&outside_dir, &symlink_path).unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let res = StorageAnalyzer::analyze(&temp_dir, 3, cancel).unwrap();

        // The symlink must be recognized as Symlink and must not traverse into outside.bin
        assert_eq!(res.root_node.children.len(), 1);
        assert_eq!(res.root_node.children[0].node_type, StorageNodeType::Symlink);
        assert_eq!(res.root_node.children[0].children.len(), 0);

        let _ = std::fs::remove_dir_all(&temp_dir);
        let _ = std::fs::remove_dir_all(&outside_dir);
    }

    #[test]
    fn test_storage_analyzer_cancellation_deep_tree() {
        let temp_dir = std::env::temp_dir().join("myclean_storage_cancel_deep");
        let _ = std::fs::remove_dir_all(&temp_dir);

        // Build deep folder hierarchy
        let mut cur = temp_dir.clone();
        for i in 0..10 {
            cur = cur.join(format!("level_{}", i));
            let _ = std::fs::create_dir_all(&cur);
            let _ = std::fs::write(cur.join("data.txt"), b"sample content");
        }

        let cancel = Arc::new(AtomicBool::new(true)); // Pre-cancelled
        let res = StorageAnalyzer::analyze(&temp_dir, 10, cancel).unwrap();
        assert!(res.was_cancelled);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
