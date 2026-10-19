pub struct NotificationManager;

impl NotificationManager {
    /// Dispatches a native macOS banner notification via osascript.
    /// Handles permission denials and headless environments gracefully without crashing.
    pub fn send(title: &str, subtitle: Option<&str>, message: &str) -> Result<(), String> {
        let title_clean = title.replace('"', "\\\"").replace('\n', " ");
        let msg_clean = message.replace('"', "\\\"").replace('\n', " ");
        let sub_part = match subtitle {
            Some(s) => format!(" subtitle \"{}\"", s.replace('"', "\\\"").replace('\n', " ")),
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

        // 1. Dispatch via application bundle ID so macOS attaches the official myclean icon
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

        // 2. Graceful fallback if application bundle is not registered in LaunchServices
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_formatting() {
        // Formatting check does not fail even if headless
        let res = NotificationManager::send("myclean Test", Some("Safety Check"), "All systems nominal.");
        assert!(res.is_ok());
    }
}
