use crate::scanner::Scanner;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppArtifact {
    pub path: String,
    pub kind: String, // "Application Bundle", "Application Support", "Caches", "Preferences", "Saved State"
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub name: String,
    pub bundle_id: String,
    pub version: String,
    pub app_path: String,
    pub total_size_bytes: u64,
    pub binary_size_bytes: u64,
    pub artifacts: Vec<AppArtifact>,
}

pub struct AppInspector;

impl AppInspector {
    /// Extract a string field from Info.plist XML text
    fn extract_plist_key(content: &str, key: &str) -> Option<String> {
        let pattern = format!("<key>{}</key>", key);
        if let Some(pos) = content.find(&pattern) {
            let rest = &content[pos + pattern.len()..];
            if let Some(string_start) = rest.find("<string>") {
                let val_start = string_start + "<string>".len();
                if let Some(string_end) = rest[val_start..].find("</string>") {
                    return Some(rest[val_start..val_start + string_end].trim().to_string());
                }
            }
        }
        None
    }

    /// Discover installed applications and all related artifacts across macOS Library locations
    pub fn scan_applications() -> Vec<InstalledApp> {
        let mut apps = Vec::new();
        let mut search_dirs = vec![PathBuf::from("/Applications")];

        if let Some(home) = dirs::home_dir() {
            let user_apps = home.join("Applications");
            if user_apps.exists() {
                search_dirs.push(user_apps);
            }
        }

        for dir in search_dirs {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() && path.extension().map(|e| e == "app").unwrap_or(false) {
                        if let Some(app) = Self::inspect_app_bundle(&path) {
                            apps.push(app);
                        }
                    }
                }
            }
        }

        // Sort applications by total footprint descending
        apps.sort_by_key(|a| std::cmp::Reverse(a.total_size_bytes));
        apps
    }

    fn inspect_app_bundle(app_path: &Path) -> Option<InstalledApp> {
        let info_plist_path = app_path.join("Contents/Info.plist");
        let app_name_default = app_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown App".to_string());

        let (bundle_id, name, version) = if info_plist_path.exists() {
            if let Ok(content) = fs::read_to_string(&info_plist_path) {
                let bid = Self::extract_plist_key(&content, "CFBundleIdentifier")
                    .unwrap_or_else(|| app_name_default.clone());
                let bname = Self::extract_plist_key(&content, "CFBundleName")
                    .or_else(|| Self::extract_plist_key(&content, "CFBundleDisplayName"))
                    .unwrap_or_else(|| app_name_default.clone());
                let bver = Self::extract_plist_key(&content, "CFBundleShortVersionString")
                    .unwrap_or_else(|| "1.0".to_string());
                (bid, bname, bver)
            } else {
                (app_name_default.clone(), app_name_default.clone(), "1.0".to_string())
            }
        } else {
            (app_name_default.clone(), app_name_default.clone(), "1.0".to_string())
        };

        let (binary_size, _) = Scanner::measure_path(app_path);
        let mut artifacts = vec![AppArtifact {
            path: app_path.to_string_lossy().to_string(),
            kind: "Application Bundle".into(),
            size_bytes: binary_size,
        }];

        // Locate potential user artifacts in ~/Library
        if let Some(home) = dirs::home_dir() {
            // Application Support
            let app_sup1 = home.join("Library/Application Support").join(&bundle_id);
            let app_sup2 = home.join("Library/Application Support").join(&name);
            for p in &[app_sup1, app_sup2] {
                if p.exists() {
                    let (s, _) = Scanner::measure_path(p);
                    if s > 0 {
                        artifacts.push(AppArtifact {
                            path: p.to_string_lossy().to_string(),
                            kind: "Application Support".into(),
                            size_bytes: s,
                        });
                    }
                }
            }

            // Caches
            let cache_path = home.join("Library/Caches").join(&bundle_id);
            if cache_path.exists() {
                let (s, _) = Scanner::measure_path(&cache_path);
                if s > 0 {
                    artifacts.push(AppArtifact {
                        path: cache_path.to_string_lossy().to_string(),
                        kind: "Caches".into(),
                        size_bytes: s,
                    });
                }
            }

            // Preferences
            let pref_path = home
                .join("Library/Preferences")
                .join(format!("{}.plist", bundle_id));
            if pref_path.exists() {
                let (s, _) = Scanner::measure_path(&pref_path);
                if s > 0 {
                    artifacts.push(AppArtifact {
                        path: pref_path.to_string_lossy().to_string(),
                        kind: "Preferences".into(),
                        size_bytes: s,
                    });
                }
            }

            // Saved State
            let state_path = home
                .join("Library/Saved Application State")
                .join(format!("{}.savedState", bundle_id));
            if state_path.exists() {
                let (s, _) = Scanner::measure_path(&state_path);
                if s > 0 {
                    artifacts.push(AppArtifact {
                        path: state_path.to_string_lossy().to_string(),
                        kind: "Saved State".into(),
                        size_bytes: s,
                    });
                }
            }
        }

        let total_size: u64 = artifacts.iter().map(|a| a.size_bytes).sum();

        Some(InstalledApp {
            name,
            bundle_id,
            version,
            app_path: app_path.to_string_lossy().to_string(),
            total_size_bytes: total_size,
            binary_size_bytes: binary_size,
            artifacts,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_plist_key() {
        let sample = r#"<?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0">
        <dict>
            <key>CFBundleIdentifier</key>
            <string>com.example.TestApp</string>
            <key>CFBundleName</key>
            <string>TestApp</string>
            <key>CFBundleShortVersionString</key>
            <string>2.4.1</string>
        </dict>
        </plist>"#;

        assert_eq!(
            AppInspector::extract_plist_key(sample, "CFBundleIdentifier"),
            Some("com.example.TestApp".to_string())
        );
        assert_eq!(
            AppInspector::extract_plist_key(sample, "CFBundleName"),
            Some("TestApp".to_string())
        );
        assert_eq!(
            AppInspector::extract_plist_key(sample, "CFBundleShortVersionString"),
            Some("2.4.1".to_string())
        );
    }
}
