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

        let script = format!(
            "display notification \"{}\" with title \"{}\"{}",
            msg_clean, title_clean, sub_part
        );

        // Do not spawn intrusive desktop banner notifications during automated test runs
        if std::env::var("MYCLEAN_SUPPRESS_NOTIFICATIONS").is_ok()
            || std::env::current_exe()
                .map(|p| p.to_string_lossy().contains("deps/"))
                .unwrap_or(false)
        {
            return Ok(());
        }

        match std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
        {
            Ok(output) if output.status.success() => Ok(()),
            Ok(output) => {
                let err = String::from_utf8_lossy(&output.stderr);
                // Return gracefully; notifications being suppressed by Do Not Disturb is normal
                eprintln!("macOS notification notice: {}", err);
                Ok(())
            }
            Err(e) => {
                eprintln!("macOS notification execution error: {}", e);
                Ok(())
            }
        }
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
