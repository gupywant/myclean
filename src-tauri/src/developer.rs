use crate::cleaner::{CleanErrorItem, CleanResult};
use crate::db::{CleanupRecord, Database};
use crate::safety::{SafetyError, SafetyGuard};
use crate::scanner::Scanner;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeveloperRiskLevel {
    Safe,
    ReviewRequired,
    Protected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskExplanation {
    pub level: DeveloperRiskLevel,
    pub title: String,
    pub reason: String,
    pub rebuild_instructions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeveloperArtifactItem {
    pub id: String,
    pub provider_id: String,
    pub provider_name: String,
    pub category: String, // "xcode", "homebrew", "cargo", "npm", "pnpm", "yarn", "gradle", "swiftpm", "workspace"
    pub display_name: String,
    pub path: String,
    pub size_bytes: u64,
    pub allocated_bytes: u64,
    pub item_count: usize,
    pub modified_at: Option<String>,
    pub risk: RiskExplanation,
    pub is_selected: bool,
    pub is_eligible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeveloperScanResult {
    pub total_bytes: u64,
    pub total_allocated_bytes: u64,
    pub items: Vec<DeveloperArtifactItem>,
    pub detected_providers: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeveloperCleanRequest {
    pub paths: Vec<String>,
    pub dry_run: bool,
    pub confirmed: bool,
}

/// Common trait for all modular developer cleanup providers
pub trait DeveloperProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn category(&self) -> &'static str;
    fn detect(&self) -> bool;
    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String>;
    fn estimate(&self) -> Result<u64, String>;
    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError>;
    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String>;
    fn explain_risk(&self) -> RiskExplanation;
}

// ---------------------------------------------------------------------------
// 1. Xcode DerivedData Provider
// ---------------------------------------------------------------------------
pub struct XcodeDerivedDataProvider;

impl DeveloperProvider for XcodeDerivedDataProvider {
    fn id(&self) -> &'static str {
        "xcode_derived_data"
    }

    fn name(&self) -> &'static str {
        "Xcode DerivedData"
    }

    fn category(&self) -> &'static str {
        "xcode"
    }

    fn detect(&self) -> bool {
        if let Some(home) = dirs::home_dir() {
            home.join("Library/Developer/Xcode/DerivedData").is_dir()
        } else {
            false
        }
    }

    fn explain_risk(&self) -> RiskExplanation {
        RiskExplanation {
            level: DeveloperRiskLevel::Safe,
            title: "Safe Build Cache".into(),
            reason: "Intermediate compiler artifacts, indexing symbols, and module maps. Safe to purge; Xcode regenerates them on next project build.".into(),
            rebuild_instructions: Some("Open the project in Xcode and press Cmd+B to rebuild.".into()),
        }
    }

    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let derived_data = home.join("Library/Developer/Xcode/DerivedData");
        if !derived_data.is_dir() {
            return Ok(Vec::new());
        }

        let mut items = Vec::new();
        let entries = match fs::read_dir(&derived_data) {
            Ok(e) => e,
            Err(e) => return Err(format!("Failed to read DerivedData: {}", e)),
        };

        for entry in entries.flatten() {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Unknown Target".to_string());

            let mut visited = HashSet::new();
            let mut skipped = Vec::new();
            let (alloc, logical, count) =
                Scanner::measure_path_detailed(&path, &mut visited, &mut skipped, &[], cancel);

            let mod_time = fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

            items.push(DeveloperArtifactItem {
                id: format!("xcode_{}", name),
                provider_id: self.id().to_string(),
                provider_name: self.name().to_string(),
                category: self.category().to_string(),
                display_name: format!("Xcode DerivedData — {}", name),
                path: path.to_string_lossy().to_string(),
                size_bytes: logical,
                allocated_bytes: alloc,
                item_count: count,
                modified_at: mod_time,
                risk: self.explain_risk(),
                is_selected: true,
                is_eligible: true,
            });
        }

        Ok(items)
    }

    fn estimate(&self) -> Result<u64, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let derived_data = home.join("Library/Developer/Xcode/DerivedData");
        if !derived_data.is_dir() {
            return Ok(0);
        }
        let (size, _) = Scanner::measure_path(&derived_data);
        Ok(size)
    }

    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError> {
        let home = dirs::home_dir().ok_or(SafetyError::NotFound("Home not found".into()))?;
        let derived_root = home.join("Library/Developer/Xcode/DerivedData");
        let derived_canonical = derived_root
            .canonicalize()
            .unwrap_or_else(|_| derived_root.clone());

        let mut validated = Vec::new();
        for p_str in paths {
            SafetyGuard::check_path_traversal(p_str)?;
            let p = Path::new(p_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.to_path_buf(),
            };

            if SafetyGuard::is_system_protected(&canonical) {
                return Err(SafetyError::SystemProtected(
                    canonical.to_string_lossy().to_string(),
                ));
            }

            if !canonical.starts_with(&derived_canonical) && !canonical.starts_with(&derived_root) {
                return Err(SafetyError::SymlinkEscape(format!(
                    "Path '{}' is outside Xcode DerivedData directory",
                    p_str
                )));
            }
            validated.push(canonical);
        }
        Ok(validated)
    }

    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String> {
        execute_developer_cleanup(self.id(), paths, dry_run, confirmed, db, |p| {
            self.validate(p)
        })
    }
}

// ---------------------------------------------------------------------------
// 2. Homebrew Cache Provider
// ---------------------------------------------------------------------------
pub struct HomebrewCacheProvider;

impl DeveloperProvider for HomebrewCacheProvider {
    fn id(&self) -> &'static str {
        "homebrew_cache"
    }

    fn name(&self) -> &'static str {
        "Homebrew Bottle Caches"
    }

    fn category(&self) -> &'static str {
        "homebrew"
    }

    fn detect(&self) -> bool {
        if let Some(home) = dirs::home_dir() {
            home.join("Library/Caches/Homebrew").is_dir()
        } else {
            false
        }
    }

    fn explain_risk(&self) -> RiskExplanation {
        RiskExplanation {
            level: DeveloperRiskLevel::Safe,
            title: "Safe Package Cache".into(),
            reason: "Downloaded pre-compiled bottle archives and formula downloads. Homebrew automatically re-downloads packages when needed.".into(),
            rebuild_instructions: Some("Homebrew automatically fetches bottles when running 'brew install' or 'brew upgrade'.".into()),
        }
    }

    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let brew_cache = home.join("Library/Caches/Homebrew");
        if !brew_cache.is_dir() {
            return Ok(Vec::new());
        }

        let mut items = Vec::new();
        let mut visited = HashSet::new();
        let mut skipped = Vec::new();

        // 1. downloads directory
        let downloads = brew_cache.join("downloads");
        if downloads.is_dir() {
            let (alloc, logical, count) =
                Scanner::measure_path_detailed(&downloads, &mut visited, &mut skipped, &[], cancel);
            if logical > 0 {
                items.push(DeveloperArtifactItem {
                    id: "homebrew_downloads".into(),
                    provider_id: self.id().to_string(),
                    provider_name: self.name().to_string(),
                    category: self.category().to_string(),
                    display_name: "Homebrew Downloaded Bottles".into(),
                    path: downloads.to_string_lossy().to_string(),
                    size_bytes: logical,
                    allocated_bytes: alloc,
                    item_count: count,
                    modified_at: fs::metadata(&downloads)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                    risk: self.explain_risk(),
                    is_selected: true,
                    is_eligible: true,
                });
            }
        }

        // 2. root bottle tarballs
        if let Ok(entries) = fs::read_dir(&brew_cache) {
            for entry in entries.flatten() {
                if cancel.load(Ordering::Relaxed) {
                    break;
                }
                let path = entry.path();
                if path.is_file() {
                    let ext = path.extension().map(|s| s.to_string_lossy().to_string());
                    if ext.as_deref() == Some("tar")
                        || ext.as_deref() == Some("gz")
                        || ext.as_deref() == Some("bottle")
                        || path.to_string_lossy().contains(".bottle.")
                    {
                        let meta = match fs::metadata(&path) {
                            Ok(m) => m,
                            Err(_) => continue,
                        };
                        items.push(DeveloperArtifactItem {
                            id: format!(
                                "brew_{}",
                                path.file_name().unwrap_or_default().to_string_lossy()
                            ),
                            provider_id: self.id().to_string(),
                            provider_name: self.name().to_string(),
                            category: self.category().to_string(),
                            display_name: format!(
                                "Homebrew Archive — {}",
                                path.file_name().unwrap_or_default().to_string_lossy()
                            ),
                            path: path.to_string_lossy().to_string(),
                            size_bytes: meta.len(),
                            allocated_bytes: meta.len(),
                            item_count: 1,
                            modified_at: meta
                                .modified()
                                .ok()
                                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                            risk: self.explain_risk(),
                            is_selected: true,
                            is_eligible: true,
                        });
                    }
                }
            }
        }

        Ok(items)
    }

    fn estimate(&self) -> Result<u64, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let brew_cache = home.join("Library/Caches/Homebrew");
        if !brew_cache.is_dir() {
            return Ok(0);
        }
        let (size, _) = Scanner::measure_path(&brew_cache);
        Ok(size)
    }

    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError> {
        let home = dirs::home_dir().ok_or(SafetyError::NotFound("Home not found".into()))?;
        let brew_root = home.join("Library/Caches/Homebrew");
        let brew_canonical = brew_root
            .canonicalize()
            .unwrap_or_else(|_| brew_root.clone());

        let mut validated = Vec::new();
        for p_str in paths {
            SafetyGuard::check_path_traversal(p_str)?;
            let p = Path::new(p_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.to_path_buf(),
            };

            if SafetyGuard::is_system_protected(&canonical) {
                return Err(SafetyError::SystemProtected(
                    canonical.to_string_lossy().to_string(),
                ));
            }

            if !canonical.starts_with(&brew_canonical) && !canonical.starts_with(&brew_root) {
                return Err(SafetyError::SymlinkEscape(format!(
                    "Path '{}' is outside Homebrew cache directory",
                    p_str
                )));
            }
            validated.push(canonical);
        }
        Ok(validated)
    }

    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String> {
        execute_developer_cleanup(self.id(), paths, dry_run, confirmed, db, |p| {
            self.validate(p)
        })
    }
}

// ---------------------------------------------------------------------------
// 3. Cargo Cache Provider
// ---------------------------------------------------------------------------
pub struct CargoCacheProvider;

impl DeveloperProvider for CargoCacheProvider {
    fn id(&self) -> &'static str {
        "cargo_cache"
    }

    fn name(&self) -> &'static str {
        "Cargo Registry & Git Cache"
    }

    fn category(&self) -> &'static str {
        "cargo"
    }

    fn detect(&self) -> bool {
        if let Some(home) = dirs::home_dir() {
            home.join(".cargo/registry/cache").is_dir() || home.join(".cargo/git/db").is_dir()
        } else {
            false
        }
    }

    fn explain_risk(&self) -> RiskExplanation {
        RiskExplanation {
            level: DeveloperRiskLevel::Safe,
            title: "Safe Crate Archives".into(),
            reason: "Downloaded .crate tarballs and git checkout caches. Cargo re-downloads crates on demand during 'cargo build'.".into(),
            rebuild_instructions: Some("Cargo automatically downloads dependencies during 'cargo build' or 'cargo check'.".into()),
        }
    }

    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let mut items = Vec::new();

        let targets = [
            (".cargo/registry/cache", "Cargo Registry .crate Cache"),
            (".cargo/registry/src", "Cargo Unpacked Sources"),
            (".cargo/git/db", "Cargo Git Dependency Clones"),
        ];

        for (subpath, title) in targets {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let target_path = home.join(subpath);
            if !target_path.is_dir() {
                continue;
            }

            let mut visited = HashSet::new();
            let mut skipped = Vec::new();
            let (alloc, logical, count) = Scanner::measure_path_detailed(
                &target_path,
                &mut visited,
                &mut skipped,
                &[],
                cancel,
            );

            if logical > 0 {
                items.push(DeveloperArtifactItem {
                    id: format!("cargo_{}", subpath.replace('/', "_")),
                    provider_id: self.id().to_string(),
                    provider_name: self.name().to_string(),
                    category: self.category().to_string(),
                    display_name: title.to_string(),
                    path: target_path.to_string_lossy().to_string(),
                    size_bytes: logical,
                    allocated_bytes: alloc,
                    item_count: count,
                    modified_at: fs::metadata(&target_path)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                    risk: self.explain_risk(),
                    is_selected: true,
                    is_eligible: true,
                });
            }
        }

        Ok(items)
    }

    fn estimate(&self) -> Result<u64, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let mut total = 0;
        for subpath in &[
            ".cargo/registry/cache",
            ".cargo/registry/src",
            ".cargo/git/db",
        ] {
            let p = home.join(subpath);
            if p.is_dir() {
                let (size, _) = Scanner::measure_path(&p);
                total += size;
            }
        }
        Ok(total)
    }

    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError> {
        let home = dirs::home_dir().ok_or(SafetyError::NotFound("Home not found".into()))?;
        let cargo_root = home.join(".cargo");

        let mut validated = Vec::new();
        for p_str in paths {
            SafetyGuard::check_path_traversal(p_str)?;
            let p = Path::new(p_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.to_path_buf(),
            };

            if SafetyGuard::is_system_protected(&canonical) {
                return Err(SafetyError::SystemProtected(
                    canonical.to_string_lossy().to_string(),
                ));
            }

            // CRITICAL GUARDRAIL: Never allow deleting .cargo/bin, .cargo/config.toml, credentials.toml, or root .cargo
            let canon_str = canonical.to_string_lossy();
            if canon_str.contains("/.cargo/bin")
                || canon_str.ends_with("/.cargo/config.toml")
                || canon_str.ends_with("/.cargo/credentials.toml")
                || canon_str.ends_with("/.cargo/env")
                || canonical == cargo_root
            {
                return Err(SafetyError::UserProtected(format!(
                    "Path '{}' contains essential Cargo binary or credentials configuration",
                    p_str
                )));
            }

            // Must be within registry/cache, registry/src, or git/db
            let allowed_subpaths = [
                cargo_root.join("registry/cache"),
                cargo_root.join("registry/src"),
                cargo_root.join("git/db"),
            ];

            let is_allowed = allowed_subpaths.iter().any(|allowed| {
                if let Ok(c) = allowed.canonicalize() {
                    canonical.starts_with(&c)
                } else {
                    canonical.starts_with(allowed)
                }
            });

            if !is_allowed {
                return Err(SafetyError::SymlinkEscape(format!(
                    "Path '{}' is not within disposable Cargo cache subdirectories",
                    p_str
                )));
            }

            validated.push(canonical);
        }
        Ok(validated)
    }

    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String> {
        execute_developer_cleanup(self.id(), paths, dry_run, confirmed, db, |p| {
            self.validate(p)
        })
    }
}

// ---------------------------------------------------------------------------
// 4. npm Cache Provider
// ---------------------------------------------------------------------------
pub struct NpmCacheProvider;

impl DeveloperProvider for NpmCacheProvider {
    fn id(&self) -> &'static str {
        "npm_cache"
    }

    fn name(&self) -> &'static str {
        "npm Package Cache"
    }

    fn category(&self) -> &'static str {
        "npm"
    }

    fn detect(&self) -> bool {
        if let Some(home) = dirs::home_dir() {
            home.join(".npm/_cacache").is_dir()
        } else {
            false
        }
    }

    fn explain_risk(&self) -> RiskExplanation {
        RiskExplanation {
            level: DeveloperRiskLevel::Safe,
            title: "Safe Package Cache".into(),
            reason: "npm content-addressable package archive. npm automatically re-downloads tarballs from the registry when needed.".into(),
            rebuild_instructions: Some("npm automatically fetches packages during 'npm install'.".into()),
        }
    }

    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let cacache = home.join(".npm/_cacache");
        if !cacache.is_dir() {
            return Ok(Vec::new());
        }

        let mut visited = HashSet::new();
        let mut skipped = Vec::new();
        let (alloc, logical, count) =
            Scanner::measure_path_detailed(&cacache, &mut visited, &mut skipped, &[], cancel);

        if logical == 0 {
            return Ok(Vec::new());
        }

        Ok(vec![DeveloperArtifactItem {
            id: "npm_cacache".into(),
            provider_id: self.id().to_string(),
            provider_name: self.name().to_string(),
            category: self.category().to_string(),
            display_name: "npm Global Package Cache (_cacache)".into(),
            path: cacache.to_string_lossy().to_string(),
            size_bytes: logical,
            allocated_bytes: alloc,
            item_count: count,
            modified_at: fs::metadata(&cacache)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
            risk: self.explain_risk(),
            is_selected: true,
            is_eligible: true,
        }])
    }

    fn estimate(&self) -> Result<u64, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let cacache = home.join(".npm/_cacache");
        if !cacache.is_dir() {
            return Ok(0);
        }
        let (size, _) = Scanner::measure_path(&cacache);
        Ok(size)
    }

    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError> {
        let home = dirs::home_dir().ok_or(SafetyError::NotFound("Home not found".into()))?;
        let cacache = home.join(".npm/_cacache");
        let cacache_canonical = cacache.canonicalize().unwrap_or_else(|_| cacache.clone());

        let mut validated = Vec::new();
        for p_str in paths {
            SafetyGuard::check_path_traversal(p_str)?;
            let p = Path::new(p_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.to_path_buf(),
            };

            if SafetyGuard::is_system_protected(&canonical) {
                return Err(SafetyError::SystemProtected(
                    canonical.to_string_lossy().to_string(),
                ));
            }

            // CRITICAL: Only allow paths inside .npm/_cacache. Never touch root ~/.npm or ~/.npmrc
            if !canonical.starts_with(&cacache_canonical) && !canonical.starts_with(&cacache) {
                return Err(SafetyError::SymlinkEscape(format!(
                    "Path '{}' is outside the safe npm _cacache directory",
                    p_str
                )));
            }
            validated.push(canonical);
        }
        Ok(validated)
    }

    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String> {
        execute_developer_cleanup(self.id(), paths, dry_run, confirmed, db, |p| {
            self.validate(p)
        })
    }
}

// ---------------------------------------------------------------------------
// 5. pnpm Store & Cache Provider
// ---------------------------------------------------------------------------
pub struct PnpmCacheProvider;

impl DeveloperProvider for PnpmCacheProvider {
    fn id(&self) -> &'static str {
        "pnpm_cache"
    }

    fn name(&self) -> &'static str {
        "pnpm Store & Cache"
    }

    fn category(&self) -> &'static str {
        "pnpm"
    }

    fn detect(&self) -> bool {
        if let Some(home) = dirs::home_dir() {
            home.join("Library/Caches/pnpm").is_dir() || home.join(".cache/pnpm").is_dir()
        } else {
            false
        }
    }

    fn explain_risk(&self) -> RiskExplanation {
        RiskExplanation {
            level: DeveloperRiskLevel::ReviewRequired,
            title: "Shared Dependency Store".into(),
            reason: "pnpm content-addressable dependency store. Purging requires re-downloading packages across projects during subsequent pnpm installs.".into(),
            rebuild_instructions: Some("Run 'pnpm install' in active projects to restore dependencies.".into()),
        }
    }

    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let mut items = Vec::new();

        let candidates = [
            ("Library/Caches/pnpm", "pnpm macOS Cache"),
            (".cache/pnpm", "pnpm Local Cache"),
        ];

        for (sub, name) in candidates {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let target = home.join(sub);
            if !target.is_dir() {
                continue;
            }

            let mut visited = HashSet::new();
            let mut skipped = Vec::new();
            let (alloc, logical, count) =
                Scanner::measure_path_detailed(&target, &mut visited, &mut skipped, &[], cancel);

            if logical > 0 {
                items.push(DeveloperArtifactItem {
                    id: format!("pnpm_{}", sub.replace('/', "_")),
                    provider_id: self.id().to_string(),
                    provider_name: self.name().to_string(),
                    category: self.category().to_string(),
                    display_name: name.to_string(),
                    path: target.to_string_lossy().to_string(),
                    size_bytes: logical,
                    allocated_bytes: alloc,
                    item_count: count,
                    modified_at: fs::metadata(&target)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                    risk: self.explain_risk(),
                    is_selected: false, // Review required by default
                    is_eligible: true,
                });
            }
        }

        Ok(items)
    }

    fn estimate(&self) -> Result<u64, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let mut total = 0;
        for sub in &["Library/Caches/pnpm", ".cache/pnpm"] {
            let p = home.join(sub);
            if p.is_dir() {
                let (size, _) = Scanner::measure_path(&p);
                total += size;
            }
        }
        Ok(total)
    }

    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError> {
        let home = dirs::home_dir().ok_or(SafetyError::NotFound("Home not found".into()))?;
        let allowed = [home.join("Library/Caches/pnpm"), home.join(".cache/pnpm")];

        let mut validated = Vec::new();
        for p_str in paths {
            SafetyGuard::check_path_traversal(p_str)?;
            let p = Path::new(p_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.to_path_buf(),
            };

            if SafetyGuard::is_system_protected(&canonical) {
                return Err(SafetyError::SystemProtected(
                    canonical.to_string_lossy().to_string(),
                ));
            }

            let is_in_allowed = allowed.iter().any(|a| {
                if let Ok(c) = a.canonicalize() {
                    canonical.starts_with(&c)
                } else {
                    canonical.starts_with(a)
                }
            });

            if !is_in_allowed {
                return Err(SafetyError::SymlinkEscape(format!(
                    "Path '{}' is outside pnpm cache directories",
                    p_str
                )));
            }

            validated.push(canonical);
        }
        Ok(validated)
    }

    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String> {
        execute_developer_cleanup(self.id(), paths, dry_run, confirmed, db, |p| {
            self.validate(p)
        })
    }
}

// ---------------------------------------------------------------------------
// 6. Yarn Cache Provider
// ---------------------------------------------------------------------------
pub struct YarnCacheProvider;

impl DeveloperProvider for YarnCacheProvider {
    fn id(&self) -> &'static str {
        "yarn_cache"
    }

    fn name(&self) -> &'static str {
        "Yarn Package Cache"
    }

    fn category(&self) -> &'static str {
        "yarn"
    }

    fn detect(&self) -> bool {
        if let Some(home) = dirs::home_dir() {
            home.join("Library/Caches/Yarn").is_dir() || home.join(".yarn/cache").is_dir()
        } else {
            false
        }
    }

    fn explain_risk(&self) -> RiskExplanation {
        RiskExplanation {
            level: DeveloperRiskLevel::Safe,
            title: "Safe Package Cache".into(),
            reason: "Downloaded tarball cache for Yarn v1 and Berry. Packages are automatically re-fetched during 'yarn install'.".into(),
            rebuild_instructions: Some("Run 'yarn install' in your project to restore packages.".into()),
        }
    }

    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let mut items = Vec::new();

        let targets = [
            ("Library/Caches/Yarn", "Yarn Global Cache"),
            (".yarn/cache", "Yarn Berry Shared Cache"),
        ];

        for (sub, name) in targets {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let target = home.join(sub);
            if !target.is_dir() {
                continue;
            }

            let mut visited = HashSet::new();
            let mut skipped = Vec::new();
            let (alloc, logical, count) =
                Scanner::measure_path_detailed(&target, &mut visited, &mut skipped, &[], cancel);

            if logical > 0 {
                items.push(DeveloperArtifactItem {
                    id: format!("yarn_{}", sub.replace('/', "_")),
                    provider_id: self.id().to_string(),
                    provider_name: self.name().to_string(),
                    category: self.category().to_string(),
                    display_name: name.to_string(),
                    path: target.to_string_lossy().to_string(),
                    size_bytes: logical,
                    allocated_bytes: alloc,
                    item_count: count,
                    modified_at: fs::metadata(&target)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                    risk: self.explain_risk(),
                    is_selected: true,
                    is_eligible: true,
                });
            }
        }

        Ok(items)
    }

    fn estimate(&self) -> Result<u64, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let mut total = 0;
        for sub in &["Library/Caches/Yarn", ".yarn/cache"] {
            let p = home.join(sub);
            if p.is_dir() {
                let (size, _) = Scanner::measure_path(&p);
                total += size;
            }
        }
        Ok(total)
    }

    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError> {
        let home = dirs::home_dir().ok_or(SafetyError::NotFound("Home not found".into()))?;
        let allowed = [home.join("Library/Caches/Yarn"), home.join(".yarn/cache")];

        let mut validated = Vec::new();
        for p_str in paths {
            SafetyGuard::check_path_traversal(p_str)?;
            let p = Path::new(p_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.to_path_buf(),
            };

            if SafetyGuard::is_system_protected(&canonical) {
                return Err(SafetyError::SystemProtected(
                    canonical.to_string_lossy().to_string(),
                ));
            }

            let is_in_allowed = allowed.iter().any(|a| {
                if let Ok(c) = a.canonicalize() {
                    canonical.starts_with(&c)
                } else {
                    canonical.starts_with(a)
                }
            });

            if !is_in_allowed {
                return Err(SafetyError::SymlinkEscape(format!(
                    "Path '{}' is outside Yarn cache directories",
                    p_str
                )));
            }

            validated.push(canonical);
        }
        Ok(validated)
    }

    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String> {
        execute_developer_cleanup(self.id(), paths, dry_run, confirmed, db, |p| {
            self.validate(p)
        })
    }
}

// ---------------------------------------------------------------------------
// 7. Gradle Cache Provider
// ---------------------------------------------------------------------------
pub struct GradleCacheProvider;

impl DeveloperProvider for GradleCacheProvider {
    fn id(&self) -> &'static str {
        "gradle_cache"
    }

    fn name(&self) -> &'static str {
        "Gradle Artifact Caches"
    }

    fn category(&self) -> &'static str {
        "gradle"
    }

    fn detect(&self) -> bool {
        if let Some(home) = dirs::home_dir() {
            home.join(".gradle/caches").is_dir()
        } else {
            false
        }
    }

    fn explain_risk(&self) -> RiskExplanation {
        RiskExplanation {
            level: DeveloperRiskLevel::Safe,
            title: "Safe Build Cache".into(),
            reason: "Downloaded dependency jars, build transforms, and metadata hashes. Gradle automatically re-downloads dependencies during compilation.".into(),
            rebuild_instructions: Some("Run './gradlew build' or 'gradle build' to re-fetch required dependencies.".into()),
        }
    }

    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let caches = home.join(".gradle/caches");
        if !caches.is_dir() {
            return Ok(Vec::new());
        }

        let mut visited = HashSet::new();
        let mut skipped = Vec::new();
        let (alloc, logical, count) =
            Scanner::measure_path_detailed(&caches, &mut visited, &mut skipped, &[], cancel);

        if logical == 0 {
            return Ok(Vec::new());
        }

        Ok(vec![DeveloperArtifactItem {
            id: "gradle_caches".into(),
            provider_id: self.id().to_string(),
            provider_name: self.name().to_string(),
            category: self.category().to_string(),
            display_name: "Gradle Dependency Caches (.gradle/caches)".into(),
            path: caches.to_string_lossy().to_string(),
            size_bytes: logical,
            allocated_bytes: alloc,
            item_count: count,
            modified_at: fs::metadata(&caches)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
            risk: self.explain_risk(),
            is_selected: true,
            is_eligible: true,
        }])
    }

    fn estimate(&self) -> Result<u64, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let caches = home.join(".gradle/caches");
        if !caches.is_dir() {
            return Ok(0);
        }
        let (size, _) = Scanner::measure_path(&caches);
        Ok(size)
    }

    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError> {
        let home = dirs::home_dir().ok_or(SafetyError::NotFound("Home not found".into()))?;
        let gradle_caches = home.join(".gradle/caches");
        let caches_canonical = gradle_caches
            .canonicalize()
            .unwrap_or_else(|_| gradle_caches.clone());

        let mut validated = Vec::new();
        for p_str in paths {
            SafetyGuard::check_path_traversal(p_str)?;
            let p = Path::new(p_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.to_path_buf(),
            };

            if SafetyGuard::is_system_protected(&canonical) {
                return Err(SafetyError::SystemProtected(
                    canonical.to_string_lossy().to_string(),
                ));
            }

            // CRITICAL GUARDRAIL: Never touch wrapper, gradle.properties, or keystores
            let canon_str = canonical.to_string_lossy();
            if canon_str.contains("/.gradle/wrapper")
                || canon_str.ends_with("/.gradle/gradle.properties")
            {
                return Err(SafetyError::UserProtected(format!(
                    "Path '{}' contains essential Gradle wrapper or property files",
                    p_str
                )));
            }

            if !canonical.starts_with(&caches_canonical) {
                return Err(SafetyError::SymlinkEscape(format!(
                    "Path '{}' is outside the safe .gradle/caches directory",
                    p_str
                )));
            }

            validated.push(canonical);
        }
        Ok(validated)
    }

    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String> {
        execute_developer_cleanup(self.id(), paths, dry_run, confirmed, db, |p| {
            self.validate(p)
        })
    }
}

// ---------------------------------------------------------------------------
// 8. Swift Package Manager Cache Provider
// ---------------------------------------------------------------------------
pub struct SwiftPmCacheProvider;

impl DeveloperProvider for SwiftPmCacheProvider {
    fn id(&self) -> &'static str {
        "swiftpm_cache"
    }

    fn name(&self) -> &'static str {
        "Swift Package Manager Cache"
    }

    fn category(&self) -> &'static str {
        "swiftpm"
    }

    fn detect(&self) -> bool {
        if let Some(home) = dirs::home_dir() {
            home.join("Library/Caches/org.swift.swiftpm").is_dir()
        } else {
            false
        }
    }

    fn explain_risk(&self) -> RiskExplanation {
        RiskExplanation {
            level: DeveloperRiskLevel::Safe,
            title: "Safe Package Cache".into(),
            reason: "Swift Package Manager git repositories and build manifests. Xcode and 'swift build' automatically re-fetch dependencies.".into(),
            rebuild_instructions: Some("Run 'swift package resolve' or build in Xcode to restore packages.".into()),
        }
    }

    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let spm_cache = home.join("Library/Caches/org.swift.swiftpm");
        if !spm_cache.is_dir() {
            return Ok(Vec::new());
        }

        let mut visited = HashSet::new();
        let mut skipped = Vec::new();
        let (alloc, logical, count) =
            Scanner::measure_path_detailed(&spm_cache, &mut visited, &mut skipped, &[], cancel);

        if logical == 0 {
            return Ok(Vec::new());
        }

        Ok(vec![DeveloperArtifactItem {
            id: "swiftpm_cache".into(),
            provider_id: self.id().to_string(),
            provider_name: self.name().to_string(),
            category: self.category().to_string(),
            display_name: "SwiftPM Global Package Cache".into(),
            path: spm_cache.to_string_lossy().to_string(),
            size_bytes: logical,
            allocated_bytes: alloc,
            item_count: count,
            modified_at: fs::metadata(&spm_cache)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
            risk: self.explain_risk(),
            is_selected: true,
            is_eligible: true,
        }])
    }

    fn estimate(&self) -> Result<u64, String> {
        let home = dirs::home_dir().ok_or("Cannot determine user home directory")?;
        let spm_cache = home.join("Library/Caches/org.swift.swiftpm");
        if !spm_cache.is_dir() {
            return Ok(0);
        }
        let (size, _) = Scanner::measure_path(&spm_cache);
        Ok(size)
    }

    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError> {
        let home = dirs::home_dir().ok_or(SafetyError::NotFound("Home not found".into()))?;
        let spm_root = home.join("Library/Caches/org.swift.swiftpm");
        let spm_canonical = spm_root.canonicalize().unwrap_or_else(|_| spm_root.clone());

        let mut validated = Vec::new();
        for p_str in paths {
            SafetyGuard::check_path_traversal(p_str)?;
            let p = Path::new(p_str);
            let canonical = match p.canonicalize() {
                Ok(c) => c,
                Err(_) => p.to_path_buf(),
            };

            if SafetyGuard::is_system_protected(&canonical) {
                return Err(SafetyError::SystemProtected(
                    canonical.to_string_lossy().to_string(),
                ));
            }

            if !canonical.starts_with(&spm_canonical) {
                return Err(SafetyError::SymlinkEscape(format!(
                    "Path '{}' is outside SwiftPM cache directory",
                    p_str
                )));
            }

            validated.push(canonical);
        }
        Ok(validated)
    }

    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String> {
        execute_developer_cleanup(self.id(), paths, dry_run, confirmed, db, |p| {
            self.validate(p)
        })
    }
}

// ---------------------------------------------------------------------------
// 9. Workspace Project Artifacts Provider (Rust target & Node.js node_modules)
// ---------------------------------------------------------------------------
pub struct WorkspaceArtifactsProvider {
    pub workspaces: Vec<PathBuf>,
}

impl WorkspaceArtifactsProvider {
    pub fn new(workspaces: Vec<PathBuf>) -> Self {
        Self { workspaces }
    }

    /// Verifies that a target path is an authentic Rust `target` or Node `node_modules`
    /// backed by an authentic parent manifest (Cargo.toml or package.json)
    pub fn verify_workspace_artifact(
        artifact_path: &Path,
    ) -> Result<(&'static str, PathBuf), SafetyError> {
        SafetyGuard::check_path_traversal(artifact_path)?;

        let canonical = match artifact_path.canonicalize() {
            Ok(c) => c,
            Err(e) => return Err(SafetyError::Io(e)),
        };

        if SafetyGuard::is_system_protected(&canonical) {
            return Err(SafetyError::SystemProtected(
                canonical.to_string_lossy().to_string(),
            ));
        }

        let parent = canonical
            .parent()
            .ok_or_else(|| SafetyError::UserProtected("Cannot clean root directory".into()))?;

        // Protect root home or top-level personal document folders without project manifests
        if let Some(home) = dirs::home_dir() {
            if parent == home {
                return Err(SafetyError::UserProtected(
                    "Cannot target artifact directly inside home directory root".into(),
                ));
            }
        }

        let name = canonical
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        if name == "target" {
            let cargo_toml = parent.join("Cargo.toml");
            if !cargo_toml.is_file() {
                return Err(SafetyError::UserProtected(format!(
                    "Folder '{}' does not have a valid parent Cargo.toml manifest. Rejection prevents false positives.",
                    canonical.to_string_lossy()
                )));
            }
            Ok(("rust_target", canonical))
        } else if name == "node_modules" {
            let pkg_json = parent.join("package.json");
            if !pkg_json.is_file() {
                return Err(SafetyError::UserProtected(format!(
                    "Folder '{}' does not have a valid parent package.json manifest. Rejection prevents false positives.",
                    canonical.to_string_lossy()
                )));
            }
            Ok(("node_modules", canonical))
        } else {
            Err(SafetyError::UserProtected(format!(
                "Artifact '{}' is neither a recognized 'target' nor 'node_modules' build directory",
                canonical.to_string_lossy()
            )))
        }
    }
}

impl DeveloperProvider for WorkspaceArtifactsProvider {
    fn id(&self) -> &'static str {
        "workspace_artifacts"
    }

    fn name(&self) -> &'static str {
        "Project Workspace Artifacts"
    }

    fn category(&self) -> &'static str {
        "workspace"
    }

    fn detect(&self) -> bool {
        !self.workspaces.is_empty()
    }

    fn explain_risk(&self) -> RiskExplanation {
        RiskExplanation {
            level: DeveloperRiskLevel::ReviewRequired,
            title: "Project Build Artifacts".into(),
            reason: "Compiled binaries, object code, or local package dependencies. Rebuilding requires running build commands or package installers in the project.".into(),
            rebuild_instructions: Some("Run 'cargo build' for Rust targets, or 'npm install' for node_modules.".into()),
        }
    }

    fn inspect(&self, cancel: &AtomicBool) -> Result<Vec<DeveloperArtifactItem>, String> {
        let mut items = Vec::new();

        for ws in &self.workspaces {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            if !ws.is_dir() {
                continue;
            }

            let project_name = ws
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Project".to_string());

            // 1. Check for Rust target/
            let target_path = ws.join("target");
            if target_path.is_dir() && ws.join("Cargo.toml").is_file() {
                let mut visited = HashSet::new();
                let mut skipped = Vec::new();
                let (alloc, logical, count) = Scanner::measure_path_detailed(
                    &target_path,
                    &mut visited,
                    &mut skipped,
                    &[],
                    cancel,
                );

                if logical > 0 {
                    items.push(DeveloperArtifactItem {
                        id: format!("ws_rust_{}", target_path.to_string_lossy().replace('/', "_")),
                        provider_id: self.id().to_string(),
                        provider_name: self.name().to_string(),
                        category: "rust_target".into(),
                        display_name: format!("{} — target/ (Rust)", project_name),
                        path: target_path.to_string_lossy().to_string(),
                        size_bytes: logical,
                        allocated_bytes: alloc,
                        item_count: count,
                        modified_at: fs::metadata(&target_path)
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                        risk: RiskExplanation {
                            level: DeveloperRiskLevel::ReviewRequired,
                            title: "Rust Build Output".into(),
                            reason: "Compiled binary artifacts, incremental caches, and compiler objects. Rebuilt via 'cargo build'.".into(),
                            rebuild_instructions: Some(format!("cd {} && cargo build", ws.to_string_lossy())),
                        },
                        is_selected: false,
                        is_eligible: true,
                    });
                }
            }

            // 2. Check for Node.js node_modules/
            let nm_path = ws.join("node_modules");
            if nm_path.is_dir() && ws.join("package.json").is_file() {
                let mut visited = HashSet::new();
                let mut skipped = Vec::new();
                let (alloc, logical, count) = Scanner::measure_path_detailed(
                    &nm_path,
                    &mut visited,
                    &mut skipped,
                    &[],
                    cancel,
                );

                if logical > 0 {
                    items.push(DeveloperArtifactItem {
                        id: format!("ws_node_{}", nm_path.to_string_lossy().replace('/', "_")),
                        provider_id: self.id().to_string(),
                        provider_name: self.name().to_string(),
                        category: "node_modules".into(),
                        display_name: format!("{} — node_modules/", project_name),
                        path: nm_path.to_string_lossy().to_string(),
                        size_bytes: logical,
                        allocated_bytes: alloc,
                        item_count: count,
                        modified_at: fs::metadata(&nm_path)
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                        risk: RiskExplanation {
                            level: DeveloperRiskLevel::ReviewRequired,
                            title: "Node.js Dependencies".into(),
                            reason: "Locally installed dependencies and CLI binaries. Reinstalled with 'npm install' or 'pnpm install'.".into(),
                            rebuild_instructions: Some(format!("cd {} && npm install", ws.to_string_lossy())),
                        },
                        is_selected: false,
                        is_eligible: true,
                    });
                }
            }
        }

        Ok(items)
    }

    fn estimate(&self) -> Result<u64, String> {
        let mut total = 0;
        for ws in &self.workspaces {
            let t = ws.join("target");
            if t.is_dir() && ws.join("Cargo.toml").is_file() {
                let (s, _) = Scanner::measure_path(&t);
                total += s;
            }
            let nm = ws.join("node_modules");
            if nm.is_dir() && ws.join("package.json").is_file() {
                let (s, _) = Scanner::measure_path(&nm);
                total += s;
            }
        }
        Ok(total)
    }

    fn validate(&self, paths: &[String]) -> Result<Vec<PathBuf>, SafetyError> {
        let mut validated = Vec::new();
        for p_str in paths {
            let path = Path::new(p_str);
            let (_, canon) = Self::verify_workspace_artifact(path)?;
            validated.push(canon);
        }
        Ok(validated)
    }

    fn cleanup(
        &self,
        paths: &[String],
        dry_run: bool,
        confirmed: bool,
        db: &Database,
    ) -> Result<CleanResult, String> {
        execute_developer_cleanup(self.id(), paths, dry_run, confirmed, db, |p| {
            self.validate(p)
        })
    }
}

// ---------------------------------------------------------------------------
// Shared Deletion Helper for Developer Providers
// ---------------------------------------------------------------------------
fn execute_developer_cleanup<F>(
    provider_id: &str,
    paths: &[String],
    dry_run: bool,
    confirmed: bool,
    db: &Database,
    validator: F,
) -> Result<CleanResult, String>
where
    F: Fn(&[String]) -> Result<Vec<PathBuf>, SafetyError>,
{
    if !confirmed {
        return Err("Unconfirmed cleanup request rejected. User confirmation is mandatory.".into());
    }

    let start = std::time::Instant::now();
    let validated_paths = validator(paths).map_err(|e| e.to_string())?;

    let mut bytes_freed: u64 = 0;
    let mut items_deleted: usize = 0;
    let mut items_failed: usize = 0;
    let mut errors: Vec<CleanErrorItem> = Vec::new();
    let mut deleted_strings: Vec<String> = Vec::new();

    for path in validated_paths {
        if !path.exists() {
            continue;
        }

        // Capture identity snapshot
        let snapshot = match SafetyGuard::capture_snapshot(&path) {
            Ok(s) => s,
            Err(e) => {
                items_failed += 1;
                errors.push(CleanErrorItem {
                    path: path.to_string_lossy().to_string(),
                    error_message: format!("Failed to capture file metadata snapshot: {}", e),
                });
                continue;
            }
        };

        let (size, _) = Scanner::measure_path(&path);

        if dry_run {
            bytes_freed += size;
            items_deleted += 1;
            deleted_strings.push(path.to_string_lossy().to_string());
        } else {
            // Anti-TOCTOU & Symlink Substitution Revalidation immediately prior to deletion
            if let Err(e) = SafetyGuard::verify_unaltered(&path, &snapshot) {
                items_failed += 1;
                errors.push(CleanErrorItem {
                    path: path.to_string_lossy().to_string(),
                    error_message: format!(
                        "Security violation during pre-clean verification: {}",
                        e
                    ),
                });
                continue;
            }

            match SafetyGuard::trash_item(&path) {
                Ok(_) => {
                    bytes_freed += size;
                    items_deleted += 1;
                    deleted_strings.push(path.to_string_lossy().to_string());
                }
                Err(e) => {
                    items_failed += 1;
                    errors.push(CleanErrorItem {
                        path: path.to_string_lossy().to_string(),
                        error_message: format!("Failed to move to macOS Trash: {}", e),
                    });
                }
            }
        }
    }

    // Persist audit record in SQLite
    let details_json = serde_json::json!({
        "provider_id": provider_id,
        "dry_run": dry_run,
        "items_deleted": items_deleted,
        "items_failed": items_failed,
        "bytes_moved_to_trash": bytes_freed,
        "deleted_paths": deleted_strings,
        "errors": errors,
    })
    .to_string();

    let record = CleanupRecord {
        id: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
        bytes_freed,
        items_deleted,
        method: if dry_run {
            "developer_dry_run".into()
        } else {
            "developer_trash".into()
        },
        details_json,
    };

    if let Err(e) = db.insert_cleanup_record(&record) {
        eprintln!(
            "Warning: failed to record developer cleanup audit to SQLite: {}",
            e
        );
    }

    Ok(CleanResult {
        success: items_failed == 0,
        dry_run,
        bytes_freed,
        bytes_moved_to_trash: if dry_run { 0 } else { bytes_freed },
        items_deleted,
        items_skipped: 0,
        items_failed,
        errors,
        duration_ms: start.elapsed().as_millis() as u64,
        was_cancelled: false,
    })
}

// ---------------------------------------------------------------------------
// DeveloperEngine: Unified Facade
// ---------------------------------------------------------------------------
pub struct DeveloperEngine;

impl DeveloperEngine {
    pub fn get_standard_providers() -> Vec<Box<dyn DeveloperProvider>> {
        vec![
            Box::new(XcodeDerivedDataProvider),
            Box::new(HomebrewCacheProvider),
            Box::new(CargoCacheProvider),
            Box::new(NpmCacheProvider),
            Box::new(PnpmCacheProvider),
            Box::new(YarnCacheProvider),
            Box::new(GradleCacheProvider),
            Box::new(SwiftPmCacheProvider),
        ]
    }

    pub fn scan_all(
        workspaces: Option<Vec<String>>,
        cancel: &AtomicBool,
    ) -> Result<DeveloperScanResult, String> {
        let mut items = Vec::new();
        let mut detected_providers = Vec::new();
        let mut warnings = Vec::new();

        let providers = Self::get_standard_providers();
        for p in providers {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            if p.detect() {
                detected_providers.push(p.id().to_string());
                match p.inspect(cancel) {
                    Ok(mut found) => items.append(&mut found),
                    Err(e) => warnings.push(format!("{}: {}", p.name(), e)),
                }
            }
        }

        // Workspace project artifacts
        if let Some(ws_strs) = workspaces {
            let ws_paths: Vec<PathBuf> = ws_strs.into_iter().map(PathBuf::from).collect();
            let ws_provider = WorkspaceArtifactsProvider::new(ws_paths);
            if ws_provider.detect() {
                detected_providers.push(ws_provider.id().to_string());
                match ws_provider.inspect(cancel) {
                    Ok(mut found) => items.append(&mut found),
                    Err(e) => warnings.push(format!("Workspaces: {}", e)),
                }
            }
        }

        // Sort items by size descending
        items.sort_by_key(|i| std::cmp::Reverse(i.size_bytes));

        let total_bytes = items.iter().map(|i| i.size_bytes).sum();
        let total_allocated_bytes = items.iter().map(|i| i.allocated_bytes).sum();

        Ok(DeveloperScanResult {
            total_bytes,
            total_allocated_bytes,
            items,
            detected_providers,
            warnings,
        })
    }

    pub fn inspect_single_workspace(ws_path: &Path) -> Result<Vec<DeveloperArtifactItem>, String> {
        let ws_provider = WorkspaceArtifactsProvider::new(vec![ws_path.to_path_buf()]);
        let cancel = AtomicBool::new(false);
        ws_provider.inspect(&cancel)
    }

    pub fn clean_artifacts(
        req: DeveloperCleanRequest,
        workspaces: Option<Vec<String>>,
        db: &Database,
    ) -> Result<CleanResult, String> {
        if !req.confirmed {
            return Err("Unconfirmed cleanup request rejected.".into());
        }

        let start = std::time::Instant::now();
        let mut total_freed = 0;
        let mut total_deleted = 0;
        let mut total_failed = 0;
        let mut all_errors = Vec::new();
        let mut all_deleted_paths = Vec::new();

        let mut providers = Self::get_standard_providers();
        let ws_paths: Vec<PathBuf> = workspaces
            .unwrap_or_default()
            .into_iter()
            .map(PathBuf::from)
            .collect();
        providers.push(Box::new(WorkspaceArtifactsProvider::new(ws_paths)));

        // Match each path to the provider that accepts and validates it
        for target_path in &req.paths {
            let mut handled = false;
            for p in &providers {
                if let Ok(validated) = p.validate(std::slice::from_ref(target_path)) {
                    if let Some(canon) = validated.first() {
                        if !canon.exists() {
                            handled = true;
                            break;
                        }
                        let (size, _) = Scanner::measure_path(canon);

                        if req.dry_run {
                            total_freed += size;
                            total_deleted += 1;
                            all_deleted_paths.push(canon.to_string_lossy().to_string());
                            handled = true;
                            break;
                        } else {
                            match SafetyGuard::trash_item(canon) {
                                Ok(_) => {
                                    total_freed += size;
                                    total_deleted += 1;
                                    all_deleted_paths.push(canon.to_string_lossy().to_string());
                                }
                                Err(e) => {
                                    total_failed += 1;
                                    all_errors.push(CleanErrorItem {
                                        path: canon.to_string_lossy().to_string(),
                                        error_message: e.to_string(),
                                    });
                                }
                            }
                            handled = true;
                            break;
                        }
                    }
                }
            }

            if !handled {
                total_failed += 1;
                all_errors.push(CleanErrorItem {
                    path: target_path.clone(),
                    error_message:
                        "Path was rejected by all developer providers' safety validation rules."
                            .into(),
                });
            }
        }

        // Persist audit record in SQLite
        let details_json = serde_json::json!({
            "dry_run": req.dry_run,
            "items_deleted": total_deleted,
            "items_failed": total_failed,
            "bytes_moved_to_trash": total_freed,
            "deleted_paths": all_deleted_paths,
            "errors": all_errors,
        })
        .to_string();

        let record = CleanupRecord {
            id: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            bytes_freed: total_freed,
            items_deleted: total_deleted,
            method: if req.dry_run {
                "developer_dry_run".into()
            } else {
                "developer_trash".into()
            },
            details_json,
        };

        let _ = db.insert_cleanup_record(&record);

        Ok(CleanResult {
            success: total_failed == 0,
            dry_run: req.dry_run,
            bytes_freed: total_freed,
            bytes_moved_to_trash: if req.dry_run { 0 } else { total_freed },
            items_deleted: total_deleted,
            items_skipped: 0,
            items_failed: total_failed,
            errors: all_errors,
            duration_ms: start.elapsed().as_millis() as u64,
            was_cancelled: false,
        })
    }
}
