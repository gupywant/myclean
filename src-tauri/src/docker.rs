use crate::cleaner::CleanErrorItem;
use crate::db::{CleanupRecord, Database};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerStatus {
    pub cli_available: bool,
    pub cli_path: Option<String>,
    pub cli_version: Option<String>,
    pub daemon_running: bool,
    pub daemon_version: Option<String>,
    pub daemon_error: Option<String>,
    pub health_warning: Option<String>,
    pub can_cleanup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerStorageSummary {
    pub images_size_bytes: u64,
    pub images_reclaimable_bytes: u64,
    pub images_count: usize,
    pub containers_size_bytes: u64,
    pub containers_reclaimable_bytes: u64,
    pub containers_count: usize,
    pub volumes_size_bytes: u64,
    pub volumes_count: usize,
    pub build_cache_size_bytes: u64,
    pub build_cache_reclaimable_bytes: u64,
    pub build_cache_count: usize,
    pub total_size_bytes: u64,
    pub total_reclaimable_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DockerResourceType {
    DanglingImage,
    UnusedImage,
    StoppedContainer,
    BuildCache,
    UnusedNetwork,
    Volume,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerResource {
    pub id: String,
    pub name: String,
    pub resource_type: DockerResourceType,
    pub size_bytes: u64,
    pub reclaimable: bool,
    pub created_at: String,
    pub status: String,
    pub explanation: String,
    pub dependencies: Vec<String>,
    pub is_protected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerScanResult {
    pub status: DockerStatus,
    pub summary: DockerStorageSummary,
    pub resources: Vec<DockerResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerCleanRequest {
    pub resource_ids: Vec<String>,
    pub resource_types: Vec<String>,
    pub dry_run: bool,
    pub confirmed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerCleanResult {
    pub success: bool,
    pub dry_run: bool,
    pub bytes_freed: u64,
    pub items_deleted: usize,
    pub errors: Vec<CleanErrorItem>,
    pub details: Vec<String>,
    pub disclaimer: String,
}

pub struct DockerManager;

impl DockerManager {
    /// Detects the full path of the Docker CLI executable
    pub fn find_docker_cli() -> Option<String> {
        let candidates = [
            "/usr/local/bin/docker",
            "/opt/homebrew/bin/docker",
            "/usr/bin/docker",
        ];
        for c in &candidates {
            if Path::new(c).is_file() {
                return Some(c.to_string());
            }
        }

        // Try standard PATH lookup
        if let Ok(output) = Command::new("which").arg("docker").output() {
            if output.status.success() {
                let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !p.is_empty() && Path::new(&p).is_file() {
                    return Some(p);
                }
            }
        }
        None
    }

    /// Parses human-readable Docker byte strings (e.g. "1.5GB", "500MB", "24.5kB", "0B", "1.2GB (50%)")
    pub fn parse_docker_size(s: &str) -> u64 {
        let trimmed = s.trim();
        if trimmed.is_empty() || trimmed == "0B" || trimmed == "0" {
            return 0;
        }

        let clean = if let Some(idx) = trimmed.find('(') {
            trimmed[..idx].trim()
        } else {
            trimmed
        };

        let mut num_str = String::new();
        let mut unit_str = String::new();
        for c in clean.chars() {
            if c.is_ascii_digit() || c == '.' {
                num_str.push(c);
            } else if !c.is_whitespace() {
                unit_str.push(c.to_ascii_uppercase());
            }
        }

        let num: f64 = match num_str.parse() {
            Ok(n) => n,
            Err(_) => return 0,
        };

        let multiplier: f64 = match unit_str.as_str() {
            "B" => 1.0,
            "KB" | "KIB" | "K" => 1_000.0,
            "MB" | "MIB" | "M" => 1_000_000.0,
            "GB" | "GIB" | "G" => 1_000_000_000.0,
            "TB" | "TIB" | "T" => 1_000_000_000_000.0,
            _ => 1.0,
        };

        (num * multiplier) as u64
    }

    /// Verifies that a resource ID matches safe alphanumeric characters
    pub fn validate_resource_id(id: &str) -> Result<(), String> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err("Empty Docker resource ID".into());
        }
        for c in trimmed.chars() {
            if !c.is_alphanumeric() && c != '_' && c != '-' && c != '.' && c != ':' && c != '/' {
                return Err(format!(
                    "Unsafe Docker resource ID '{}': contains illegal character '{}'",
                    id, c
                ));
            }
        }
        Ok(())
    }

    /// Inspects Docker CLI and daemon health
    pub fn check_status() -> DockerStatus {
        let cli_path = Self::find_docker_cli();
        if cli_path.is_none() {
            return DockerStatus {
                cli_available: false,
                cli_path: None,
                cli_version: None,
                daemon_running: false,
                daemon_version: None,
                daemon_error: Some("Docker CLI executable was not found on your system.".into()),
                health_warning: None,
                can_cleanup: false,
            };
        }

        let cli = cli_path.unwrap();

        // 1. Check version & client info
        let version_output = Command::new(&cli)
            .args(["version", "--format", "{{json .}}"])
            .output();

        let mut cli_ver = None;
        let mut daemon_ver = None;
        let mut daemon_err = None;
        let mut daemon_running = false;

        if let Ok(out) = version_output {
            let stdout_str = String::from_utf8_lossy(&out.stdout);
            let stderr_str = String::from_utf8_lossy(&out.stderr);

            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&stdout_str) {
                cli_ver = v["Client"]["Version"].as_str().map(|s| s.to_string());
                if let Some(server_ver) = v["Server"]["Version"].as_str() {
                    daemon_ver = Some(server_ver.to_string());
                    daemon_running = true;
                }
            }

            if !daemon_running {
                let combined_err = format!("{}\n{}", stdout_str, stderr_str);
                if combined_err.contains("connect: no such file or directory")
                    || combined_err.contains("docker.sock")
                    || combined_err.contains("connection refused")
                {
                    daemon_err = Some("Docker Desktop daemon is stopped or Docker socket is unreachable.".into());
                } else if !stderr_str.trim().is_empty() {
                    daemon_err = Some(stderr_str.trim().to_string());
                } else {
                    daemon_err = Some("Docker daemon is offline.".into());
                }
            }
        } else {
            daemon_err = Some("Failed to execute Docker command.".into());
        }

        // 2. Health check (if daemon is responding, check for storage corruption or I/O warnings)
        let mut health_warning = None;
        if daemon_running {
            if let Ok(info_out) = Command::new(&cli).args(["info", "--format", "{{json .}}"]).output() {
                let info_str = String::from_utf8_lossy(&info_out.stdout);
                if info_str.contains("corrupt") || info_str.contains("I/O error") || info_str.contains("inconsistent metadata") {
                    health_warning = Some("Docker reported filesystem or metadata health warnings. Cleanup is disabled to prevent data corruption.".into());
                }
            }
        }

        let can_cleanup = daemon_running && health_warning.is_none();

        DockerStatus {
            cli_available: true,
            cli_path: Some(cli),
            cli_version: cli_ver,
            daemon_running,
            daemon_version: daemon_ver,
            daemon_error: daemon_err,
            health_warning,
            can_cleanup,
        }
    }

    /// Full inspection of Docker storage and individual resources
    pub fn inspect() -> Result<DockerScanResult, String> {
        let status = Self::check_status();
        if !status.cli_available || !status.daemon_running {
            return Ok(DockerScanResult {
                status,
                summary: DockerStorageSummary {
                    images_size_bytes: 0,
                    images_reclaimable_bytes: 0,
                    images_count: 0,
                    containers_size_bytes: 0,
                    containers_reclaimable_bytes: 0,
                    containers_count: 0,
                    volumes_size_bytes: 0,
                    volumes_count: 0,
                    build_cache_size_bytes: 0,
                    build_cache_reclaimable_bytes: 0,
                    build_cache_count: 0,
                    total_size_bytes: 0,
                    total_reclaimable_bytes: 0,
                },
                resources: Vec::new(),
            });
        }

        let cli = status.cli_path.as_deref().unwrap_or("docker");

        // 1. High-level storage stats via `docker system df --format '{{json .}}'`
        let mut summary = DockerStorageSummary {
            images_size_bytes: 0,
            images_reclaimable_bytes: 0,
            images_count: 0,
            containers_size_bytes: 0,
            containers_reclaimable_bytes: 0,
            containers_count: 0,
            volumes_size_bytes: 0,
            volumes_count: 0,
            build_cache_size_bytes: 0,
            build_cache_reclaimable_bytes: 0,
            build_cache_count: 0,
            total_size_bytes: 0,
            total_reclaimable_bytes: 0,
        };

        if let Ok(df_out) = Command::new(cli)
            .args(["system", "df", "--format", "{{json .}}"])
            .output()
        {
            let lines = String::from_utf8_lossy(&df_out.stdout);
            for line in lines.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    let rtype = v["Type"].as_str().unwrap_or_default();
                    let size = v["Size"].as_str().map(Self::parse_docker_size).unwrap_or(0);
                    let rec = v["Reclaimable"].as_str().map(Self::parse_docker_size).unwrap_or(0);
                    let count = v["TotalCount"]
                        .as_str()
                        .and_then(|s| s.parse::<usize>().ok())
                        .or_else(|| v["TotalCount"].as_u64().map(|n| n as usize))
                        .unwrap_or(0);

                    match rtype {
                        "Images" => {
                            summary.images_size_bytes = size;
                            summary.images_reclaimable_bytes = rec;
                            summary.images_count = count;
                        }
                        "Containers" => {
                            summary.containers_size_bytes = size;
                            summary.containers_reclaimable_bytes = rec;
                            summary.containers_count = count;
                        }
                        "Local Volumes" | "Volumes" => {
                            summary.volumes_size_bytes = size;
                            summary.volumes_count = count;
                        }
                        "Build Cache" => {
                            summary.build_cache_size_bytes = size;
                            summary.build_cache_reclaimable_bytes = rec;
                            summary.build_cache_count = count;
                        }
                        _ => {}
                    }
                }
            }
            summary.total_size_bytes = summary.images_size_bytes
                + summary.containers_size_bytes
                + summary.volumes_size_bytes
                + summary.build_cache_size_bytes;
            summary.total_reclaimable_bytes = summary.images_reclaimable_bytes
                + summary.containers_reclaimable_bytes
                + summary.build_cache_reclaimable_bytes;
        }

        let mut resources = Vec::new();

        // 2. Stopped Containers via `docker ps -a --format '{{json .}}'`
        let mut running_image_ids = HashSet::new();
        if let Ok(ps_out) = Command::new(cli)
            .args(["ps", "-a", "--format", "{{json .}}"])
            .output()
        {
            let lines = String::from_utf8_lossy(&ps_out.stdout);
            for line in lines.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    let id = v["ID"].as_str().unwrap_or_default().to_string();
                    let names = v["Names"].as_str().unwrap_or("unnamed").to_string();
                    let image = v["Image"].as_str().unwrap_or_default().to_string();
                    let status = v["Status"].as_str().unwrap_or_default().to_string();
                    let state = v["State"].as_str().unwrap_or_default().to_lowercase();
                    let created = v["CreatedAt"].as_str().unwrap_or_default().to_string();
                    let size_str = v["Size"].as_str().unwrap_or("0B");
                    let size = Self::parse_docker_size(size_str);

                    let is_running = state == "running" || status.to_lowercase().starts_with("up");
                    if is_running {
                        running_image_ids.insert(image.clone());
                    } else {
                        // Stopped / exited container
                        resources.push(DockerResource {
                            id: id.clone(),
                            name: format!("Container: {}", names),
                            resource_type: DockerResourceType::StoppedContainer,
                            size_bytes: size,
                            reclaimable: true,
                            created_at: created,
                            status: status.clone(),
                            explanation: format!(
                                "Stopped container '{}' (status: {}). Safely removable.",
                                names, status
                            ),
                            dependencies: vec![format!("Image: {}", image)],
                            is_protected: false,
                        });
                    }
                }
            }
        }

        // 3. Images via `docker image ls -a --format '{{json .}}'`
        if let Ok(img_out) = Command::new(cli)
            .args(["image", "ls", "-a", "--format", "{{json .}}"])
            .output()
        {
            let lines = String::from_utf8_lossy(&img_out.stdout);
            for line in lines.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    let id = v["ID"].as_str().unwrap_or_default().to_string();
                    let repo = v["Repository"].as_str().unwrap_or("<none>").to_string();
                    let tag = v["Tag"].as_str().unwrap_or("<none>").to_string();
                    let created = v["CreatedAt"].as_str().unwrap_or_default().to_string();
                    let size_str = v["Size"].as_str().unwrap_or("0B");
                    let size = Self::parse_docker_size(size_str);
                    let containers_used = v["Containers"].as_str().unwrap_or("0");

                    let is_dangling = repo == "<none>" || tag == "<none>";
                    let is_running = running_image_ids.contains(&id)
                        || running_image_ids.contains(&repo)
                        || running_image_ids.contains(&format!("{}:{}", repo, tag));

                    if is_dangling {
                        resources.push(DockerResource {
                            id: id.clone(),
                            name: format!("Dangling Image <none> ({})", &id[..8.min(id.len())]),
                            resource_type: DockerResourceType::DanglingImage,
                            size_bytes: size,
                            reclaimable: !is_running,
                            created_at: created,
                            status: "Dangling Layer".into(),
                            explanation: "Untagged image layer resulting from intermediate builds. Safe to prune.".into(),
                            dependencies: Vec::new(),
                            is_protected: is_running,
                        });
                    } else if containers_used == "0" && !is_running {
                        resources.push(DockerResource {
                            id: id.clone(),
                            name: format!("{}:{}", repo, tag),
                            resource_type: DockerResourceType::UnusedImage,
                            size_bytes: size,
                            reclaimable: true,
                            created_at: created,
                            status: "Unused Image".into(),
                            explanation: format!(
                                "Image '{}:{}' is not referenced by any running or stopped container.",
                                repo, tag
                            ),
                            dependencies: Vec::new(),
                            is_protected: false,
                        });
                    }
                }
            }
        }

        // 4. Build Cache Resource
        if summary.build_cache_size_bytes > 0 {
            resources.push(DockerResource {
                id: "docker_build_cache".into(),
                name: "Docker Build Cache & Layers".into(),
                resource_type: DockerResourceType::BuildCache,
                size_bytes: summary.build_cache_size_bytes,
                reclaimable: true,
                created_at: "Dynamic".into(),
                status: "Disposable Cache".into(),
                explanation: "BuildKit intermediate compiler layers and build caches. Recreated on subsequent 'docker build'.".into(),
                dependencies: Vec::new(),
                is_protected: false,
            });
        }

        // 5. Unused Custom Networks
        if let Ok(net_out) = Command::new(cli)
            .args(["network", "ls", "--format", "{{json .}}"])
            .output()
        {
            let lines = String::from_utf8_lossy(&net_out.stdout);
            for line in lines.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    let id = v["ID"].as_str().unwrap_or_default().to_string();
                    let name = v["Name"].as_str().unwrap_or_default().to_string();
                    let driver = v["Driver"].as_str().unwrap_or_default().to_string();

                    // Ignore built-in networks
                    if name == "bridge" || name == "host" || name == "none" {
                        continue;
                    }

                    resources.push(DockerResource {
                        id: id.clone(),
                        name: format!("Network: {}", name),
                        resource_type: DockerResourceType::UnusedNetwork,
                        size_bytes: 0,
                        reclaimable: true,
                        created_at: "Network".into(),
                        status: format!("Driver: {}", driver),
                        explanation: format!("Custom Docker bridge network '{}'. Safe to prune if not in active use.", name),
                        dependencies: Vec::new(),
                        is_protected: false,
                    });
                }
            }
        }

        // 6. Volumes (Read-only analysis; strictly protected by design!)
        if let Ok(vol_out) = Command::new(cli)
            .args(["volume", "ls", "--format", "{{json .}}"])
            .output()
        {
            let lines = String::from_utf8_lossy(&vol_out.stdout);
            for line in lines.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    let name = v["Name"].as_str().unwrap_or_default().to_string();
                    let driver = v["Driver"].as_str().unwrap_or_default().to_string();
                    let size_str = v["Size"].as_str().unwrap_or("0B");
                    let size = Self::parse_docker_size(size_str);

                    resources.push(DockerResource {
                        id: format!("vol_{}", name),
                        name: format!("Volume: {}", name),
                        resource_type: DockerResourceType::Volume,
                        size_bytes: size,
                        reclaimable: false,
                        created_at: "Persistent".into(),
                        status: format!("Driver: {} (Protected)", driver),
                        explanation: "Docker volumes contain persistent database and application state. Protected by default from automated deletion.".into(),
                        dependencies: Vec::new(),
                        is_protected: true,
                    });
                }
            }
        }

        Ok(DockerScanResult {
            status,
            summary,
            resources,
        })
    }

    /// Safe selective cleanup of Docker resources
    pub fn clean(req: DockerCleanRequest, db: &Database) -> Result<DockerCleanResult, String> {
        if !req.confirmed {
            return Err("Unconfirmed Docker cleanup request rejected. Confirmation is required.".into());
        }

        // 1. Immediate Security & Input Validation:
        // Enforce Volume protection and command injection prevention before any daemon communication
        for (id, rtype) in req.resource_ids.iter().zip(req.resource_types.iter()) {
            if rtype == "volume" {
                return Err(format!(
                    "Security Violation: Target '{}' is a Docker Volume. Volumes are protected by safety policy and cannot be deleted.",
                    id
                ));
            }
            if let Err(e) = Self::validate_resource_id(id) {
                return Err(format!("Command Injection Rejection: {}", e));
            }
        }

        let status = Self::check_status();
        if !status.cli_available {
            return Err("Docker CLI is not installed.".into());
        }
        if !status.daemon_running {
            return Err("Docker daemon is offline. Cleanup cannot be performed.".into());
        }
        if !status.can_cleanup {
            return Err(status.health_warning.unwrap_or_else(|| "Docker cleanup is disabled due to health warnings.".into()));
        }

        let cli = status.cli_path.as_deref().unwrap_or("docker");

        let mut bytes_freed: u64 = 0;
        let mut items_deleted: usize = 0;
        let mut errors: Vec<CleanErrorItem> = Vec::new();
        let mut details: Vec<String> = Vec::new();

        // 2. Perform selective cleanup
        for (id, rtype) in req.resource_ids.iter().zip(req.resource_types.iter()) {
            match rtype.as_str() {
                "stopped_container" => {
                    if req.dry_run {
                        items_deleted += 1;
                        details.push(format!("[Dry Run] Would remove stopped container '{}'", id));
                    } else {
                        // Anti-race condition check: Inspect container state immediately before issuing removal
                        let inspect_out = Command::new(cli)
                            .args(["inspect", "-f", "{{.State.Running}}", id])
                            .output();

                        let is_running = match inspect_out {
                            Ok(out) if out.status.success() => {
                                String::from_utf8_lossy(&out.stdout).trim().eq_ignore_ascii_case("true")
                            }
                            _ => false,
                        };

                        if is_running {
                            errors.push(CleanErrorItem {
                                path: format!("docker:container:{}", id),
                                error_message: format!(
                                    "Container '{}' was started after scanning and is actively running. Removal aborted for safety.",
                                    id
                                ),
                            });
                            continue;
                        }

                        let res = Command::new(cli).args(["rm", id]).output();
                        match res {
                            Ok(out) if out.status.success() => {
                                items_deleted += 1;
                                details.push(format!("Removed container '{}'", id));
                            }
                            Ok(out) => {
                                let err_msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
                                errors.push(CleanErrorItem {
                                    path: format!("docker:container:{}", id),
                                    error_message: err_msg,
                                });
                            }
                            Err(e) => {
                                errors.push(CleanErrorItem {
                                    path: format!("docker:container:{}", id),
                                    error_message: e.to_string(),
                                });
                            }
                        }
                    }
                }
                "dangling_image" | "unused_image" => {
                    if req.dry_run {
                        items_deleted += 1;
                        details.push(format!("[Dry Run] Would remove image '{}'", id));
                    } else {
                        let res = Command::new(cli).args(["image", "rm", id]).output();
                        match res {
                            Ok(out) if out.status.success() => {
                                items_deleted += 1;
                                details.push(format!("Removed image '{}'", id));
                            }
                            Ok(out) => {
                                let err_msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
                                errors.push(CleanErrorItem {
                                    path: format!("docker:image:{}", id),
                                    error_message: err_msg,
                                });
                            }
                            Err(e) => {
                                errors.push(CleanErrorItem {
                                    path: format!("docker:image:{}", id),
                                    error_message: e.to_string(),
                                });
                            }
                        }
                    }
                }
                "build_cache" => {
                    if req.dry_run {
                        items_deleted += 1;
                        details.push("[Dry Run] Would prune Docker build cache".into());
                    } else {
                        let res = Command::new(cli).args(["builder", "prune", "-f"]).output();
                        match res {
                            Ok(out) if out.status.success() => {
                                items_deleted += 1;
                                let stdout = String::from_utf8_lossy(&out.stdout);
                                // Parse Total reclaimed space if reported
                                if let Some(pos) = stdout.find("Total reclaimed space:") {
                                    let sub = &stdout[pos + 22..];
                                    let space_str = sub.split_whitespace().next().unwrap_or_default();
                                    bytes_freed += Self::parse_docker_size(space_str);
                                }
                                details.push("Pruned Docker builder cache".into());
                            }
                            Ok(out) => {
                                errors.push(CleanErrorItem {
                                    path: "docker:builder_cache".into(),
                                    error_message: String::from_utf8_lossy(&out.stderr).trim().to_string(),
                                });
                            }
                            Err(e) => {
                                errors.push(CleanErrorItem {
                                    path: "docker:builder_cache".into(),
                                    error_message: e.to_string(),
                                });
                            }
                        }
                    }
                }
                "unused_network" => {
                    if req.dry_run {
                        items_deleted += 1;
                        details.push(format!("[Dry Run] Would prune unused network '{}'", id));
                    } else {
                        let res = Command::new(cli).args(["network", "rm", id]).output();
                        match res {
                            Ok(out) if out.status.success() => {
                                items_deleted += 1;
                                details.push(format!("Pruned network '{}'", id));
                            }
                            Ok(out) => {
                                errors.push(CleanErrorItem {
                                    path: format!("docker:network:{}", id),
                                    error_message: String::from_utf8_lossy(&out.stderr).trim().to_string(),
                                });
                            }
                            Err(e) => {
                                errors.push(CleanErrorItem {
                                    path: format!("docker:network:{}", id),
                                    error_message: e.to_string(),
                                });
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // Persist audit record in SQLite
        let details_json = serde_json::json!({
            "dry_run": req.dry_run,
            "items_deleted": items_deleted,
            "bytes_freed": bytes_freed,
            "errors": errors,
            "details": details,
        })
        .to_string();

        let record = CleanupRecord {
            id: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            bytes_freed,
            items_deleted,
            method: if req.dry_run { "docker_dry_run".into() } else { "docker_prune".into() },
            details_json,
        };

        let _ = db.insert_cleanup_record(&record);

        Ok(DockerCleanResult {
            success: errors.is_empty(),
            dry_run: req.dry_run,
            bytes_freed,
            items_deleted,
            errors,
            details,
            disclaimer: "Docker resources were pruned via native CLI. Host APFS disk reclamation occurs progressively as Docker Desktop compacts its virtual disk.".into(),
        })
    }
}
