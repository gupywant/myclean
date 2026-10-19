# Release Architecture & Distribution Guide — myclean

## Overview
**myclean** is an open-source macOS system cleaner and optimization studio engineered for high performance, strict privacy, and maximum safety.

This document details the build architecture, signing strategy, packaging pipeline, and release integrity verification for public distribution without requiring an Apple Developer ID account.

---

## 1. Supported Architectures & Binary Matrix

| Artifact | Target Triple | Architecture | Binary Type | Distribution Channel |
| :--- | :--- | :--- | :--- | :--- |
| `myclean-1.0.0-universal.dmg` | `universal-apple-darwin` | `arm64` + `x86_64` | Universal 2 Fat Mach-O | GitHub Release (Primary) |
| `myclean-1.0.0-aarch64.dmg` | `aarch64-apple-darwin` | `arm64` | Thin Mach-O | GitHub Release |
| `myclean-1.0.0-x86_64.dmg` | `x86_64-apple-darwin` | `x86_64` | Thin Mach-O | GitHub Release |
| `SHA256SUMS.txt` | N/A | Text | SHA-256 Hashes | GitHub Release |

### Why Universal Binary?
The universal binary combines both Apple Silicon (`arm64`) and Intel (`x86_64`) slices using Apple's `lipo` tool:
```bash
lipo -create -output myclean_universal myclean_arm64 myclean_x86_64
```
On macOS, the kernel automatically executes the native slice matching the host CPU. Apple Silicon users run arm64 without Rosetta 2 translation overhead, while Intel Mac users run full 64-bit x86 natively.

---

## 2. Code Signing & Gatekeeper Policy

### Zero Apple Developer ID Dependency
myclean is distributed independently to ensure free and open access without recurring Apple Developer program fees ($99/year).

- **Signing Identity:** Ad-hoc code signature (`codesign -s -`) applied to the bundle.
- **Notarization:** myclean is **not notarized** by Apple's ticket servers.
- **Integrity Verification:** Every release includes cryptographic `SHA256SUMS.txt`.
- **Gatekeeper Compliance:** Users approve one-time execution via macOS System Settings (*Privacy & Security > Security > Open Anyway*) or context-menu *Open*.
- **No Gatekeeper Bypass:** The project explicitly condemns disabling Gatekeeper globally (`spctl --master-disable`). All instructions preserve macOS system protections.

---

## 3. Local Release Build Pipeline

### Prerequisites
- macOS 11.0+ with Xcode Command Line Tools (`xcode-select --install`)
- Node.js 20+ and npm
- Rust 1.80+ (`rustup`)
- Rust cross-compilation targets:
  ```bash
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  ```

### Build Commands
To perform a complete clean build, compilation of both architectures, universal fusion, ad-hoc signing, and DMG packaging:

```bash
# 1. Install dependencies
npm ci

# 2. Build release artifacts
npm run package
```

The output artifacts will be placed in `release-artifacts/`:
```text
release-artifacts/
├── myclean-1.0.0-universal.dmg
├── myclean-1.0.0-aarch64.dmg
├── myclean-1.0.0-x86_64.dmg
└── SHA256SUMS.txt
```

---

## 4. Packaging Architecture (`scripts/package-release.sh`)

1. **Frontend Compilation:** Vite builds minified, split JavaScript chunks with strict Content Security Policy (`npm run build`).
2. **Rust Release Profile:**
   - Optimization level: `opt-level = 3`
   - Link-Time Optimization: `lto = "thin"`
   - Codegen units: `codegen-units = 1`
   - Panic handling: `panic = "abort"`
   - Symbol stripping: `strip = true`
3. **App Bundle Assembly:**
   - Executable: `Contents/MacOS/myclean` (0755 permissions)
   - Metadata: `Contents/Info.plist` (Bundle ID `com.myclean.app`, Minimum OS `11.0`)
   - Assets: `Contents/Resources/icon.icns` (512x512 retina icon)
4. **Signature Application:**
   ```bash
   codesign --force --deep -s - myclean.app
   codesign --verify --deep --strict myclean.app
   ```
5. **DMG Generation:**
   Native Apple `hdiutil` creates compressed Read-Only `UDZO` disk images containing an Applications shortcut for drag-and-drop installation.

---

## 5. Security & Privacy Declaration
- **Network Isolation:** myclean contains zero network endpoints, telemetry libraries, or tracking beacons.
- **Filesystem Boundaries:** Protected system paths (SIP, `/System`, `/usr`, `/Library/Keychains`) and user document roots are rejected in Rust engine code.
- **Recoverable Cleanup:** All file deletions use the macOS Trash (`trash::delete`). Permanent deletion is never executed.
