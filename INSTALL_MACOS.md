# Installing myclean on macOS

This guide provides instructions for installing, launching, and managing **myclean** on macOS 11.0 (Big Sur) and newer, including macOS Sequoia, Sonoma, and Ventura.

---

## System Requirements

- **Operating System:** macOS 11.0 or newer (macOS 12 Monterey, macOS 13 Ventura, macOS 14 Sonoma, macOS 15 Sequoia).
- **Hardware Architecture:**
  - **Apple Silicon:** M1, M2, M3, M4 (all variations: Base, Pro, Max, Ultra).
  - **Intel:** Any 64-bit Intel Mac (`x86_64`).
- **Disk Space:** ~50 MB free disk space for application installation.

---

## 1. Choosing the Right Package

| Package | Architecture | Recommended For |
| :--- | :--- | :--- |
| **`myclean-1.0.0-universal.dmg`** | **Universal (arm64 + x86_64)** | **Recommended.** Contains native binaries for both Apple Silicon and Intel Macs. Runs at maximum native performance on any Mac. |
| **`myclean-1.0.0-aarch64.dmg`** | Apple Silicon (`arm64`) | Smaller download size specifically for M1/M2/M3/M4 Macs. |
| **`myclean-1.0.0-x86_64.dmg`** | Intel 64-bit (`x86_64`) | Smaller download size specifically for older Intel Macs. |

---

## 2. Standard Installation

1. Download the `.dmg` of your choice from the [Releases](https://github.com/gupywant/myclean/releases) page.
2. Double-click the downloaded `.dmg` file in Finder to mount it.
3. In the mounted disk image window, drag **myclean.app** into the **Applications** folder shortcut.
4. Eject the disk image in Finder by clicking the Eject icon next to **myclean** in the sidebar.

---

## 3. First Launch & macOS Gatekeeper

myclean is free, open-source software provided directly to users without a paid Apple Developer subscription. As a result, the application binary is **ad-hoc signed** rather than notarized with an Apple Developer ID.

When you open myclean for the first time, macOS Gatekeeper may show a dialog stating:
> *"myclean cannot be opened because Apple cannot check it for malicious software."*
> or
> *"myclean is an app downloaded from the internet."*

### Official macOS Approved Launch Methods

Choose either of the two standard macOS methods below:

#### Method A: Open Anyway via System Settings (macOS 13 Ventura, 14 Sonoma, 15 Sequoia)
1. Attempt to open **myclean** from your Applications folder (or Spotlight).
2. Dismiss the alert dialog by clicking **Cancel** or **Done**.
3. Open **System Settings** on your Mac.
4. Navigate to **Privacy & Security** in the sidebar.
5. Scroll down to the **Security** section.
6. You will see a notification: *"myclean was blocked from use because it is not from an identified developer"*.
7. Click the **Open Anyway** button.
8. When prompted, enter your Mac administrator password or use Touch ID, and click **Open**.
9. myclean will launch. This approval is saved by macOS, and you will not need to repeat this step on future launches.

#### Method B: Context-Menu Open (Quickest)
1. Open **Finder** and navigate to your **/Applications** folder.
2. Locate **myclean.app**.
3. **Right-click** (or hold `Control` and click) **myclean.app**.
4. Select **Open** from the context menu (do not double-click).
5. A confirmation dialog will appear with an **Open** button.
6. Click **Open**.

> [!WARNING]
> **Never disable Gatekeeper globally.**
> You should **never** run commands such as `sudo spctl --master-disable` to bypass Gatekeeper. Disabling Gatekeeper compromises macOS system security. The official methods above grant one-time execution rights to myclean without altering your Mac's security configuration.

---

## 4. Full Disk Access (Optional for Deep Scans)

By default, macOS Sandboxing and Transparency, Consent, and Control (TCC) restrict applications from reading certain system directories in `~/Library`.

myclean safely scans accessible caches without special permissions. However, if you wish to analyze deep system caches, developer build directories, or Docker container stores:

1. Open **System Settings > Privacy & Security > Full Disk Access**.
2. Click the **+** (Add) button (authenticate with Touch ID or password).
3. Select **myclean.app** from `/Applications` and click **Open**.
4. Ensure the toggle next to **myclean** is switched to **On**.
5. Restart myclean if it is currently open.

*Note: If Full Disk Access is not granted, myclean will gracefully skip restricted directories without crashing or hanging.*

---

## 5. Verifying Release Integrity (Checksums)

To verify that your downloaded DMG has not been tampered with or corrupted during download:

1. Open **Terminal.app**.
2. Navigate to your Downloads folder:
   ```bash
   cd ~/Downloads
   ```
3. Run `shasum -a 256` on the downloaded file:
   ```bash
   shasum -a 256 myclean-1.0.0-universal.dmg
   ```
4. Compare the output against the hash listed in `SHA256SUMS.txt` on the GitHub release page.

To inspect the ad-hoc code signature:
```bash
codesign -dvv /Applications/myclean.app
```

---

## 6. Uninstallation & Complete Cleanup

To remove myclean completely from your system:

1. Quit **myclean** if running.
2. Move `/Applications/myclean.app` to the Trash.
3. (Optional) Remove the local SQLite database and preferences:
   ```bash
   rm -rf ~/Library/Application\ Support/com.myclean.app
   ```
4. Empty the Trash.
