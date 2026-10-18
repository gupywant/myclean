use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SafetyError {
    #[error("Path is a system-protected location (SIP / macOS Core): {0}")]
    SystemProtected(String),
    #[error("Path is within user protected documents or private data: {0}")]
    UserProtected(String),
    #[error("Symlink target escapes allowed root boundary: {0}")]
    SymlinkEscape(String),
    #[error("Path does not exist: {0}")]
    NotFound(String),
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
    "/dev",
    "/Network",
    "/cores",
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
        let path_str = p.to_string_lossy().to_string();

        if let Some(home) = dirs::home_dir() {
            let home_str = home.to_string_lossy();
            if !path_str.starts_with(home_str.as_ref()) {
                // Not in user home, check system protection
                return false;
            }

            let relative = match p.strip_prefix(&home) {
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

    /// Verifies that a path is safe for cleaning. Returns Err(SafetyError) if unsafe.
    pub fn validate_for_cleaning<P: AsRef<Path>>(path: P) -> Result<PathBuf, SafetyError> {
        let p = path.as_ref();

        if !p.exists() {
            return Err(SafetyError::NotFound(p.to_string_lossy().to_string()));
        }

        // Check symlinks: do not unlink if it resolves outside or is dangerous
        if p.is_symlink() {
            let target = std::fs::read_link(p)?;
            if Self::is_system_protected(&target) {
                return Err(SafetyError::SystemProtected(target.to_string_lossy().to_string()));
            }
        }

        if Self::is_system_protected(p) {
            return Err(SafetyError::SystemProtected(p.to_string_lossy().to_string()));
        }

        if Self::is_user_data_protected(p) {
            return Err(SafetyError::UserProtected(p.to_string_lossy().to_string()));
        }

        // Prevent deleting root or home directory root
        if let Some(home) = dirs::home_dir() {
            if p == home {
                return Err(SafetyError::UserProtected("Cannot delete user home directory".into()));
            }
        }

        if p == Path::new("/") {
            return Err(SafetyError::SystemProtected("Cannot delete root directory".into()));
        }

        Ok(p.to_path_buf())
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
}
