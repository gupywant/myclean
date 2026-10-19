use serde::{Deserialize, Serialize};
use sysinfo::{Disks, System};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskMetric {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub usage_percentage: f64,
    pub file_system: String,
    pub is_removable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryMetric {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub usage_percentage: f64,
    pub total_swap_bytes: u64,
    pub used_swap_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSummary {
    pub host_name: String,
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub cpu_brand: String,
    pub cpu_count: usize,
    pub architecture: String,
    pub primary_disk: Option<DiskMetric>,
    pub all_disks: Vec<DiskMetric>,
    pub memory: MemoryMetric,
    pub trash_bytes: u64,
    pub trash_item_count: usize,
}

pub struct SystemTelemetry;

impl SystemTelemetry {
    pub fn get_system_summary() -> SystemSummary {
        let mut sys = System::new();
        sys.refresh_memory();
        sys.refresh_cpu_all();

        let disks = Disks::new_with_refreshed_list();

        let mut disk_metrics = Vec::new();
        let mut primary_disk = None;

        for disk in &disks {
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);
            let usage_pct = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };

            let mount_str = disk.mount_point().to_string_lossy().to_string();
            let metric = DiskMetric {
                name: disk.name().to_string_lossy().to_string(),
                mount_point: mount_str.clone(),
                total_bytes: total,
                available_bytes: available,
                used_bytes: used,
                usage_percentage: (usage_pct * 10.0).round() / 10.0,
                file_system: disk.file_system().to_string_lossy().to_string(),
                is_removable: disk.is_removable(),
            };

            if mount_str == "/" {
                primary_disk = Some(metric.clone());
            }

            disk_metrics.push(metric);
        }

        if primary_disk.is_none() && !disk_metrics.is_empty() {
            primary_disk = Some(disk_metrics[0].clone());
        }

        let total_mem = sys.total_memory();
        let used_mem = sys.used_memory();
        let free_mem = sys.free_memory();
        let mem_usage_pct = if total_mem > 0 {
            (used_mem as f64 / total_mem as f64) * 100.0
        } else {
            0.0
        };

        let memory = MemoryMetric {
            total_bytes: total_mem,
            used_bytes: used_mem,
            free_bytes: free_mem,
            usage_percentage: (mem_usage_pct * 10.0).round() / 10.0,
            total_swap_bytes: sys.total_swap(),
            used_swap_bytes: sys.used_swap(),
        };

        let cpu_brand = sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Apple Silicon / Core".to_string());

        let (trash_bytes, trash_item_count) = Self::get_trash_metrics();

        SystemSummary {
            host_name: System::host_name().unwrap_or_else(|| "Mac".to_string()),
            os_name: System::name().unwrap_or_else(|| "macOS".to_string()),
            os_version: System::os_version().unwrap_or_else(|| "14.x".to_string()),
            kernel_version: System::kernel_version().unwrap_or_else(|| "Darwin".to_string()),
            cpu_brand,
            cpu_count: sys.cpus().len(),
            architecture: std::env::consts::ARCH.to_string(),
            primary_disk,
            all_disks: disk_metrics,
            memory,
            trash_bytes,
            trash_item_count,
        }
    }

    /// Calculates the size and item count of the macOS user Trash and mounted volume Trashes.
    pub fn get_trash_metrics() -> (u64, usize) {
        let mut total_bytes = 0u64;
        let mut item_count = 0usize;
        let mut accessed_user_trash = false;

        // 1. Primary user Trash: ~/.Trash
        if let Some(home) = dirs::home_dir() {
            let user_trash = home.join(".Trash");
            if user_trash.exists() {
                if let Ok(entries) = std::fs::read_dir(&user_trash) {
                    accessed_user_trash = true;
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let (bytes, count) = crate::scanner::Scanner::measure_path(&path);
                        total_bytes += bytes;
                        item_count += count.max(1);
                    }
                }
            }
        }

        // 2. Mounted volume Trashes: /Volumes/*/.Trashes/<uid>
        #[cfg(target_os = "macos")]
        {
            let uid = unsafe { libc::getuid() };
            if let Ok(entries) = std::fs::read_dir("/Volumes") {
                for entry in entries.flatten() {
                    let vol_path = entry.path();
                    let vol_trash = vol_path.join(".Trashes").join(uid.to_string());
                    if vol_trash.exists() {
                        if let Ok(trash_entries) = std::fs::read_dir(&vol_trash) {
                            for te in trash_entries.flatten() {
                                let path = te.path();
                                let (bytes, count) = crate::scanner::Scanner::measure_path(&path);
                                total_bytes += bytes;
                                item_count += count.max(1);
                            }
                        }
                    }
                }
            }
        }

        // 3. Fallback: If macOS TCC prevented reading ~/.Trash directly, estimate from SQLite audit history
        if !accessed_user_trash && total_bytes == 0 {
            if let Ok(db) = crate::db::Database::new() {
                if let Ok(analytics) = db.get_cleanup_analytics() {
                    total_bytes = analytics.total_bytes_moved_to_trash;
                    item_count = analytics.total_files_moved_to_trash;
                }
            }
        }

        (total_bytes, item_count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_summary_gathering() {
        let summary = SystemTelemetry::get_system_summary();
        assert!(!summary.architecture.is_empty());
        assert!(summary.memory.total_bytes > 0);
        assert!(summary.primary_disk.is_some());
        println!(
            "Detected CPU: {} ({} cores)",
            summary.cpu_brand, summary.cpu_count
        );
        println!(
            "Memory: {} GB total",
            summary.memory.total_bytes / (1024 * 1024 * 1024)
        );
        println!(
            "Trash Metrics: {} bytes, {} items",
            summary.trash_bytes, summary.trash_item_count
        );
    }

    #[test]
    fn test_trash_metrics_gathering() {
        let (bytes, count) = SystemTelemetry::get_trash_metrics();
        println!("get_trash_metrics returned {} bytes, {} items", bytes, count);
        let _ = bytes;
        let _ = count;
    }
}
