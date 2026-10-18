use std::path::{Path, PathBuf};
use sysinfo::{ProcessesToUpdate, System};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SafetyError {
    #[error("Path is a system-protected location (SIP / macOS Core): {0}")]
    SystemProtected(String),
    #[error("Path is within user protected documents, databases or private data: {0}")]
    UserProtected(String),
    #[error("Path traversal attempt detected (contains relative '..' component): {0}")]
    PathTraversal(String),
    #[error("Symlink target escapes allowed root boundary: {0}")]
    SymlinkEscape(String),
    #[error("Path does not exist: {0}")]
    NotFound(String),
    #[error("Target application '{0}' is actively running. Please quit the application before cleaning its caches.")]
    ActiveApplicationRunning(String),
    #[error("Permanent deletion is disabled by safety guardrail.")]
    PermanentDeletionDisabled,
    #[error("Path is whitelisted by user configuration: {0}")]
    Whitelisted(String),
    #[error("Target path contains persistent database or application state: {0}")]
    DatabaseOrPersistentState(String),
    #[error("Filesystem IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Blacklist of macOS System Integrity Protection (SIP) and core root directories.
/// These directories can NEVER be scanned for cleaning or modified.
const SYSTEM_PROTECTED_PREFIXES: &[&str] = &[
    "/System",
    "/usr",
    "/bin",
    "/sbin",
    "/etc",
    "/private/etc",
    "/private/var/db",
    "/private/var/root",
    "/private/var/protected",
    "/private/var/audit",
    "/private/var/at",
    "/private/var/backups",
    "/Library/Apple",
    "/Library/SystemExtensions",
    "/Library/KernelExtensions",
    "/Library/Security",
    "/Library/Preferences/SystemConfiguration",
    "/Library/Keychains",
    "/Library/Updates",
    "/dev",
    "/Network",
    "/cores",
    "/Volumes",
];

/// User core privacy and identity directories that are forbidden from automated cleaning.
const USER_PROTECTED_SUBPATHS: &[&str] = &[
    "Library/Keychains",
    "Library/Mail",
    "Library/Accounts",
    "Library/IdentityServices",
    "Library/Messages",
    "Library/PersonalizationPortrait",
    "Library/Calendars",
    "Library/AddressBook",
    "Library/HomeKit",
    "Library/Safari/Bookmarks.plist",
    "Library/Safari/History.db",
    "Library/Cookies",
    ".ssh",
    ".gnupg",
    ".aws",
    ".config/gh",
    ".gitconfig",
    "Library/Containers/com.docker.docker/Data/vms", // Protect Docker VM virtual hard disks
];

/// Directories containing personal user work and documents.
/// Never touched by automated system cleaners.
const USER_DOCUMENT_DIRECTORIES: &[&str] = &[
    "Documents",
    "Desktop",
    "Pictures",
    "Music",
    "Movies",
    "Creative Cloud Files",
    "Library/Mobile Documents", // iCloud Drive
];

pub struct SafetyGuard;

impl SafetyGuard {
    /// Validates whether a path is strictly prohibited from any cleaning operations.
    pub fn is_system_protected<P: AsRef<Path>>(path: P) -> bool {
        let p = path.as_ref();
        let canonical_str = match p.canonicalize() {
            Ok(c) => c.to_string_lossy().to_string(),
            Err(_) => p.to_string_lossy().to_string(),
        };

        for prefix in SYSTEM_PROTECTED_PREFIXES {
            if canonical_str == *prefix || canonical_str.starts_with(&format!("{}/", prefix)) {
                return true;
            }
        }
        false
    }

    /// Validates whether a path points to protected user data or personal documents.
    pub fn is_user_data_protected<P: AsRef<Path>>(path: P) -> bool {
        let p = path.as_ref();
        let path_str = match p.canonicalize() {
            Ok(c) => c.to_string_lossy().to_string(),
            Err(_) => p.to_string_lossy().to_string(),
        };

        if let Some(home) = dirs::home_dir() {
            let home_str = home.to_string_lossy();
            if !path_str.starts_with(home_str.as_ref()) {
                // Not in user home, check system protection
                return false;
            }

            let relative = match Path::new(&path_str).strip_prefix(&home) {
                Ok(r) => r.to_string_lossy().to_string(),
                Err(_) => return false,
            };

            for protected in USER_PROTECTED_SUBPATHS {
                if relative == *protected || relative.starts_with(&format!("{}/", protected)) {
                    return true;
                }
            }

            for doc_dir in USER_DOCUMENT_DIRECTORIES {
                if relative == *doc_dir || relative.starts_with(&format!("{}/", doc_dir)) {
                    return true;
                }
            }
        }

        false
    }

    /// Evaluates whether a path is subject to mandatory exclusions from automated scanning or cleaning.
    /// Excludes: SIP, Keychains, Mail, Messages, iCloud Drive, Docker VM disks, Time Machine,
    /// .git directories, broad /private/var/folders, and unrestricted Containers.
    pub fn is_mandatory_exclusion<P: AsRef<Path>>(path: P) -> bool {
        let p = path.as_ref();
        let path_str = p.to_string_lossy();

        // 1. Any .git internal directory
        for comp in p.components() {
            if comp.as_os_str() == ".git" {
                return true;
            }
        }

        // 2. SIP and core system
        if Self::is_system_protected(p) {
            return true;
        }

        // 3. User protected privacy/keys/docs
        if Self::is_user_data_protected(p) {
            return true;
        }

        // 4. Time Machine & spotlight metadata
        if path_str.contains(".MobileBackups")
            || path_str.contains("Backups.backupdb")
            || path_str.contains(".Spotlight-V100")
            || path_str.contains(".fseventsd")
        {
            return true;
        }

        // 5. Docker Desktop VM virtual disks
        if path_str.contains("com.docker.docker/Data/vms")
            || path_str.ends_with("Docker.raw")
            || path_str.ends_with("Docker.qcow2")
        {
            return true;
        }

        // 6. Broad /private/var/folders traversal restriction
        if path_str == "/private/var/folders" || path_str == "/private/var/folders/" {
            return true;
        }

        // 7. Containers restriction: permit only explicitly supported cache / downloads subpaths
        if let Some(home) = dirs::home_dir() {
            let containers = home.join("Library/Containers");
            let group_containers = home.join("Library/Group Containers");

            if p.starts_with(&containers) || p.starts_with(&group_containers) {
                let p_str = p.to_string_lossy();
                let is_safe_container_cache = p_str.contains("/Data/Library/Caches")
                    || p_str.contains("/Data/Library/Mail Downloads");
                if !is_safe_container_cache {
                    return true;
                }
            }
        }

        false
    }

    /// Checks if a symlink target escapes an allowed root directory.
    pub fn symlink_escapes_boundary<P: AsRef<Path>, B: AsRef<Path>>(symlink_path: P, boundary: B) -> bool {
        let p = symlink_path.as_ref();
        let boundary = boundary.as_ref();

        if let Ok(target) = std::fs::read_link(p) {
            let resolved = if target.is_relative() {
                if let Some(parent) = p.parent() {
                    parent.join(&target)
                } else {
                    target
                }
            } else {
                target
            };

            if let (Ok(canon_resolved), Ok(canon_boundary)) = (resolved.canonicalize(), boundary.canonicalize()) {
                return !canon_resolved.starts_with(canon_boundary);
            }
            // Conservative: if canonicalize fails, assume it might escape
            return true;
        }
        false
    }

    /// Detects if a path points to an application database, persistent preferences,
    /// or session credential store that must never be modified by automated cleanup.
    pub fn is_database_or_persistent_state<P: AsRef<Path>>(path: P) -> bool {
        let p = path.as_ref();
        let path_str = p.to_string_lossy();

        // 1. Critical persistent directories
        if path_str.contains("/Library/Preferences")
            || path_str.contains("/Library/Keychains")
            || path_str.contains("/Library/Accounts")
            || path_str.contains("/Session Storage")
            || path_str.contains("/IndexedDB")
        {
            return true;
        }

        // 2. Sensitive database & preference extensions
        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            if ext_lower == "db"
                || ext_lower == "sqlite"
                || ext_lower == "sqlite3"
                || ext_lower == "db-wal"
                || ext_lower == "db-shm"
            {
                return true;
            }
        }

        // 3. Known critical browser & system state filenames
        if let Some(file_name) = p.file_name().and_then(|f| f.to_str()) {
            let fn_lower = file_name.to_lowercase();
            if fn_lower == "cookies"
                || fn_lower == "cookies.binarycookies"
                || fn_lower == "bookmarks.plist"
                || fn_lower == "history.db"
                || fn_lower == "history"
                || fn_lower == "login data"
                || fn_lower == "web data"
                || fn_lower == "preferences"
                || fn_lower == "keychain-2.db"
            {
                return true;
            }
        }

        false
    }

    /// Inspects running processes to prevent race conditions or database corruption
    /// caused by deleting files of an actively running macOS application.
    pub fn detect_running_application(path: &Path) -> Option<String> {
        let path_str = path.to_string_lossy().to_lowercase();

        // Identify common desktop application signatures
        let app_target: Option<String> = if path_str.contains("chrome") || path_str.contains("google/chrome") {
            Some("Google Chrome".to_string())
        } else if path_str.contains("slack") {
            Some("Slack".to_string())
        } else if path_str.contains("xcode") {
            Some("Xcode".to_string())
        } else if path_str.contains("docker") {
            Some("Docker".to_string())
        } else if path_str.contains("firefox") {
            Some("firefox".to_string())
        } else if path_str.contains("brave") {
            Some("Brave Browser".to_string())
        } else if path_str.contains("edge") || path_str.contains("microsoft edge") {
            Some("Microsoft Edge".to_string())
        } else if path_str.contains("telegram") {
            Some("Telegram".to_string())
        } else if path_str.contains("discord") {
            Some("Discord".to_string())
        } else if path_str.contains("teams") {
            Some("Microsoft Teams".to_string())
        } else if path_str.contains("spotify") {
            Some("Spotify".to_string())
        } else if path_str.contains("cursor") {
            Some("Cursor".to_string())
        } else if path_str.contains("code") {
            Some("Code".to_string())
        } else if path_str.contains("safari") {
            Some("Safari".to_string())
        } else if path_str.contains("mail") {
            Some("Mail".to_string())
        } else if path_str.ends_with(".app") {
            path.file_stem().map(|s| s.to_string_lossy().to_string())
        } else {
            None
        };

        let target_name = app_target?;
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);

        for proc in sys.processes().values() {
            let proc_name = proc.name().to_string_lossy();
            if proc_name.eq_ignore_ascii_case(&target_name)
                || proc_name.to_lowercase().contains(&target_name.to_lowercase())
            {
                return Some(target_name.to_string());
            }
        }

        None
    }

    /// Batch inspects running applications for a list of candidate cleanup paths.
    /// Returns a deduplicated list of active application names.
    pub fn detect_running_applications_for_paths(paths: &[&Path]) -> Vec<String> {
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);

        let mut running_apps = Vec::new();

        for path in paths {
            let path_str = path.to_string_lossy().to_lowercase();
            let app_target: Option<&str> = if path_str.contains("chrome") {
                Some("Google Chrome")
            } else if path_str.contains("slack") {
                Some("Slack")
            } else if path_str.contains("xcode") {
                Some("Xcode")
            } else if path_str.contains("docker") {
                Some("Docker")
            } else if path_str.contains("firefox") {
                Some("firefox")
            } else if path_str.contains("brave") {
                Some("Brave Browser")
            } else if path_str.contains("edge") {
                Some("Microsoft Edge")
            } else if path_str.contains("telegram") {
                Some("Telegram")
            } else if path_str.contains("discord") {
                Some("Discord")
            } else if path_str.contains("teams") {
                Some("Microsoft Teams")
            } else if path_str.contains("spotify") {
                Some("Spotify")
            } else {
                None
            };

            if let Some(target) = app_target {
                if !running_apps.iter().any(|a: &String| a.eq_ignore_ascii_case(target)) {
                    for proc in sys.processes().values() {
                        let proc_name = proc.name().to_string_lossy();
                        if proc_name.eq_ignore_ascii_case(target)
                            || proc_name.to_lowercase().contains(&target.to_lowercase())
                        {
                            running_apps.push(target.to_string());
                            break;
                        }
                    }
                }
            }
        }

        running_apps
    }

    /// Verifies that a path is safe for cleaning. Returns Err(SafetyError) if unsafe.
    pub fn validate_for_cleaning<P: AsRef<Path>>(path: P) -> Result<PathBuf, SafetyError> {
        let p = path.as_ref();
        let path_str = p.to_string_lossy().to_string();

        // 1. Path traversal check: reject any paths containing '..' relative components
        if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            return Err(SafetyError::PathTraversal(path_str));
        }

        if !p.exists() {
            return Err(SafetyError::NotFound(path_str));
        }

        // 2. Canonicalize path
        let canonical = p.canonicalize().map_err(SafetyError::Io)?;
        let canonical_str = canonical.to_string_lossy().to_string();

        // 3. Symlink inspection
        if p.is_symlink() {
            let target = std::fs::read_link(p)?;
            if Self::is_system_protected(&target) {
                return Err(SafetyError::SystemProtected(target.to_string_lossy().to_string()));
            }
            if Self::is_user_data_protected(&target) {
                return Err(SafetyError::UserProtected(target.to_string_lossy().to_string()));
            }
        }

        // 4. Database & persistent state protection
        if Self::is_database_or_persistent_state(p) || Self::is_database_or_persistent_state(&canonical) {
            return Err(SafetyError::DatabaseOrPersistentState(canonical_str));
        }

        // 5. Git tree protection: never touch active git repositories
        if canonical_str.contains("/.git/objects") || canonical_str.contains("/.git/refs") || canonical_str.contains("/.git/HEAD") {
            return Err(SafetyError::UserProtected("Protected active Git repository data".into()));
        }

        // 6. System protected check
        if Self::is_system_protected(p) || Self::is_system_protected(&canonical) {
            return Err(SafetyError::SystemProtected(canonical_str));
        }

        // 6. User protected check
        if Self::is_user_data_protected(p) || Self::is_user_data_protected(&canonical) {
            return Err(SafetyError::UserProtected(canonical_str));
        }

        // 7. Prevent deleting root or user home directory
        if let Some(home) = dirs::home_dir() {
            if canonical == home || p == home {
                return Err(SafetyError::UserProtected("Cannot delete user home directory".into()));
            }
        }

        if canonical == Path::new("/") || p == Path::new("/") {
            return Err(SafetyError::SystemProtected("Cannot delete root directory".into()));
        }

        // 8. Active application protection check (only if not running a unit test)
        #[cfg(not(test))]
        if let Some(app_name) = Self::detect_running_application(&canonical) {
            return Err(SafetyError::ActiveApplicationRunning(app_name));
        }

        Ok(canonical)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_protected_paths() {
        assert!(SafetyGuard::is_system_protected("/System/Library"));
        assert!(SafetyGuard::is_system_protected("/usr/bin"));
        assert!(SafetyGuard::is_system_protected("/bin/sh"));
        assert!(SafetyGuard::is_system_protected("/private/var/db"));
        assert!(SafetyGuard::is_system_protected("/Library/Security"));
        assert!(!SafetyGuard::is_system_protected("/tmp"));
    }

    #[test]
    fn test_user_protected_paths() {
        if let Some(home) = dirs::home_dir() {
            let keychains = home.join("Library/Keychains");
            assert!(SafetyGuard::is_user_data_protected(&keychains));

            let documents = home.join("Documents/secret.txt");
            assert!(SafetyGuard::is_user_data_protected(&documents));

            let caches = home.join("Library/Caches/test_cache");
            assert!(!SafetyGuard::is_user_data_protected(&caches));
        }
    }

    #[test]
    fn test_path_traversal_rejection() {
        let traversal_path = PathBuf::from("/tmp/../System");
        let res = SafetyGuard::validate_for_cleaning(&traversal_path);
        assert!(matches!(res, Err(SafetyError::PathTraversal(_))));
    }

    #[test]
    fn test_mandatory_exclusions() {
        assert!(SafetyGuard::is_mandatory_exclusion(Path::new("/Users/user/project/.git/HEAD")));
        assert!(SafetyGuard::is_mandatory_exclusion(Path::new("/Users/user/Library/Containers/com.docker.docker/Data/vms/Docker.raw")));
        assert!(SafetyGuard::is_mandatory_exclusion(Path::new("/private/var/folders")));
        assert!(SafetyGuard::is_mandatory_exclusion(Path::new("/System/Library")));
        if let Some(home) = dirs::home_dir() {
            let icloud = home.join("Library/Mobile Documents");
            assert!(SafetyGuard::is_mandatory_exclusion(&icloud));

            let container_app_data = home.join("Library/Containers/com.example.app/Data/Documents");
            assert!(SafetyGuard::is_mandatory_exclusion(&container_app_data));

            let safe_container_cache = home.join("Library/Containers/com.apple.mail/Data/Library/Mail Downloads");
            assert!(!SafetyGuard::is_mandatory_exclusion(&safe_container_cache));
        }
    }

    #[test]
    fn test_symlink_escapes_boundary() {
        let temp_dir = std::env::temp_dir().join("myclean_symlink_boundary_test");
        let _ = std::fs::remove_dir_all(&temp_dir);
        let _ = std::fs::create_dir_all(&temp_dir);

        let inside_file = temp_dir.join("inside.txt");
        let _ = std::fs::write(&inside_file, b"inside");

        let symlink_inside = temp_dir.join("link_inside");
        let _ = std::os::unix::fs::symlink(&inside_file, &symlink_inside);

        assert!(!SafetyGuard::symlink_escapes_boundary(&symlink_inside, &temp_dir));

        let outside_file = std::env::temp_dir().join("outside.txt");
        let _ = std::fs::write(&outside_file, b"outside");

        let symlink_outside = temp_dir.join("link_outside");
        let _ = std::os::unix::fs::symlink(&outside_file, &symlink_outside);

        assert!(SafetyGuard::symlink_escapes_boundary(&symlink_outside, &temp_dir));

        let _ = std::fs::remove_dir_all(&temp_dir);
        let _ = std::fs::remove_file(&outside_file);
    }

    #[test]
    fn test_database_or_persistent_state_protection() {
        assert!(SafetyGuard::is_database_or_persistent_state(Path::new("/Users/user/Library/Safari/History.db")));
        assert!(SafetyGuard::is_database_or_persistent_state(Path::new("/Users/user/Library/Safari/Bookmarks.plist")));
        assert!(SafetyGuard::is_database_or_persistent_state(Path::new("/Users/user/Library/Application Support/Google/Chrome/Default/Cookies")));
        assert!(SafetyGuard::is_database_or_persistent_state(Path::new("/Users/user/Library/Application Support/Slack/IndexedDB")));
        assert!(SafetyGuard::is_database_or_persistent_state(Path::new("/Users/user/Library/Preferences/com.apple.finder.plist")));
        assert!(!SafetyGuard::is_database_or_persistent_state(Path::new("/Users/user/Library/Caches/Google/Chrome/data_0")));
    }
}

