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

    /// Inspects running processes to prevent race conditions or database corruption
    /// caused by deleting files of an actively running macOS application.
    pub fn detect_running_application(path: &Path) -> Option<String> {
        let path_str = path.to_string_lossy().to_lowercase();

        // Identify common high-stakes desktop application signatures
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

        // 4. Git tree protection: never touch active git repositories
        if canonical_str.contains("/.git/objects") || canonical_str.contains("/.git/refs") || canonical_str.contains("/.git/HEAD") {
            return Err(SafetyError::UserProtected("Protected active Git repository data".into()));
        }

        // 5. System protected check
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
}
