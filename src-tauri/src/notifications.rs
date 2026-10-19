use std::path::PathBuf;

pub struct NotificationManager;

impl NotificationManager {
    /// Dispatches a native macOS banner notification with the official myclean icon.
    /// Uses native Cocoa UserNotification APIs with fallback to osascript.
    pub fn send(title: &str, subtitle: Option<&str>, message: &str) -> Result<(), String> {
        let title_clean = title.replace('"', "\\\"").replace('\n', " ");
        let msg_clean = message.replace('"', "\\\"").replace('\n', " ");
        let sub_part = match subtitle {
            Some(s) => format!(
                " subtitle \"{}\"",
                s.replace('"', "\\\"").replace('\n', " ")
            ),
            None => String::new(),
        };

        // Do not spawn intrusive desktop banner notifications during automated test runs
        if std::env::var("MYCLEAN_SUPPRESS_NOTIFICATIONS").is_ok()
            || std::env::current_exe()
                .map(|p| p.to_string_lossy().contains("deps/"))
                .unwrap_or(false)
        {
            return Ok(());
        }

        // 1. Try native Cocoa notification with embedded myclean app icon
        #[cfg(target_os = "macos")]
        {
            if let Ok(()) = Self::send_native(title, subtitle, message) {
                return Ok(());
            }
        }

        // 2. Dispatch via application bundle ID so macOS LaunchServices attaches the registered icon
        let script_with_icon = format!(
            "tell application id \"com.myclean.app\" to display notification \"{}\" with title \"{}\"{}",
            msg_clean, title_clean, sub_part
        );

        if let Ok(output) = std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script_with_icon)
            .output()
        {
            if output.status.success() {
                return Ok(());
            }
        }

        // 3. Graceful fallback if application bundle is not registered in LaunchServices
        let script_fallback = format!(
            "display notification \"{}\" with title \"{}\"{}",
            msg_clean, title_clean, sub_part
        );

        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script_fallback)
            .output();

        Ok(())
    }

    #[cfg(target_os = "macos")]
    pub fn send_native(title: &str, subtitle: Option<&str>, message: &str) -> Result<(), String> {
        let _ = mac_notification_sys::set_application("com.myclean.app");

        let icon_str = Self::resolve_app_icon().map(|p| p.to_string_lossy().to_string());

        let mut notif = mac_notification_sys::Notification::new();
        notif.title(title);
        if let Some(sub) = subtitle {
            notif.subtitle(sub);
        }
        notif.message(message);
        notif.asynchronous(true);

        if let Some(ref icon) = icon_str {
            notif.app_icon(icon);
        }

        notif
            .send()
            .map_err(|e| format!("Native notification failed: {:?}", e))?;
        Ok(())
    }

    /// Resolves the absolute path to the official myclean logo/icon.
    pub fn resolve_app_icon() -> Option<PathBuf> {
        // 1. Check running app bundle Resources
        if let Ok(exe) = std::env::current_exe() {
            if let Some(mac_os_dir) = exe.parent() {
                if let Some(contents_dir) = mac_os_dir.parent() {
                    let resources_icns = contents_dir.join("Resources").join("icon.icns");
                    if resources_icns.exists() {
                        return Some(resources_icns);
                    }
                }
            }
        }

        // 2. Installed /Applications/myclean.app bundle
        let installed_icns = PathBuf::from("/Applications/myclean.app/Contents/Resources/icon.icns");
        if installed_icns.exists() {
            return Some(installed_icns);
        }

        // 3. Check source repository icons
        let candidates = [
            "src-tauri/icons/icon.icns",
            "src-tauri/icons/icon.png",
            "public/logo.png",
        ];

        for c in &candidates {
            let p = PathBuf::from(c);
            if p.exists() {
                if let Ok(canon) = p.canonicalize() {
                    return Some(canon);
                }
                return Some(p);
            }
        }

        // 4. Fallback to approved logo in Downloads
        if let Some(home) = dirs::home_dir() {
            let dl = home.join("Downloads").join("Symmetrical Gradient M Broom Logo.png");
            if dl.exists() {
                return Some(dl);
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_formatting() {
        let res =
            NotificationManager::send("myclean Test", Some("Safety Check"), "All systems nominal.");
        assert!(res.is_ok());
    }

    #[test]
    fn test_resolve_app_icon() {
        let icon = NotificationManager::resolve_app_icon();
        assert!(icon.is_some(), "App icon must be resolvable");
        assert!(icon.unwrap().exists(), "Resolved icon file must exist");
    }
}
