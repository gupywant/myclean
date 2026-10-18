# myclean — Project Status

## Project Overview
**myclean** is a high-performance, privacy-first macOS cleaning studio built with Tauri 2, Rust systems programming, React 19, TypeScript, Tailwind CSS v4, Motion for React, Phosphor Icons, and SQLite.

---

## Roadmap & Phase Status

### Phase 1: Core Foundation, Rust Engine Architecture & Futuristic UI Shell
- [x] Initialize Tauri 2 + Vite + React 19 + TypeScript + Tailwind CSS v4 workspace
- [x] Implement Rust Safety & Security Engine (`safety.rs`) with SIP/protected path guardrails
- [x] Implement Rust System Metrics Provider (`system.rs`) with live disk & memory telemetry
- [x] Implement Rust Parallel Filesystem Scanner (`scanner.rs`) with Rayon & cancellation tokens
- [x] Implement Rust Duplicate File Detector (`duplicates.rs`) with BLAKE3 hashing
- [x] Implement Rust Safe Cleaner (`cleaner.rs`) with macOS Trash integration & dry-run mode
- [x] Implement Rust SQLite Persistence (`db.rs`) for scan history, audit records, and whitelists
- [x] Expose typed Tauri commands & streaming event channels (`commands.rs`, `lib.rs`)
- [x] Add automated Rust tests for safety checks, scanner logic, and database operations (9/9 passed)
- [x] Build Futuristic Premium UI Design System (Deep Navy `#07080D`, Violet/Cyan glow, Frosted Glass)
- [x] Create Custom Frameless macOS Window Chrome with traffic lights spacing (`TitleBar.tsx`)
- [x] Build Frosted Glass Sidebar Navigation with Phosphor Icons (`Sidebar.tsx`)
- [x] Build Dashboard with live animated Disk Radar Gauge and 1-Click Quick Scan (`DashboardView.tsx`)
- [x] Build Deep Clean Category Explorer with selection hierarchy and detail drawer (`DeepCleanView.tsx`)
- [x] Build Developer Space view for Xcode DerivedData, build caches, and package managers (`DeveloperSpaceView.tsx`)
- [x] Build Large & Old Files explorer with interactive size filters (`LargeFilesView.tsx`)
- [x] Build Duplicate Finder view with BLAKE3 checksum display and auto-selection (`DuplicatesView.tsx`)
- [x] Build Application Uninstaller & Leftover Hunter view (`AppsView.tsx`)
- [x] Build History & Audit Log with Recharts storage freed timeline (`HistoryView.tsx`)
- [x] Build Settings & Whitelist management view (`SettingsView.tsx`)
- [x] Build explicit Confirmation Modal with dry-run toggle and recovery guarantee (`ConfirmCleanModal.tsx`)
- [x] Validate with `cargo check`, `cargo clippy -- -D warnings`, `cargo test` (9/9 passed), and `npm run build`

### Phase 02: Premium UI Polish, Branding & Safety Audit (Completed)
- [x] **Complete Rebranding to myclean:**
  - Updated application title, `productName`, and window chrome to `myclean`
  - Updated bundle identifier to `com.myclean.app`
  - Preserved legacy SQLite data through a non-destructive migration (`com.fluxcleaner.app/fluxcleaner.db` -> `com.myclean.app/myclean.db`)
  - Generated premium Futuristic macOS icons (`32x32`, `128x128`, `128x128@2x`, `icon.png` 512x512)
- [x] **Safety Audit & Hardening:**
  - Filesystem path traversal protection (rejects paths containing `..` parent references)
  - Canonicalization verification before all deletions to prevent symlink swaps and race conditions
  - Symlink escape protection (refuses unlinking symlinks that resolve outside designated bounds)
  - Active application guardrail (checks `sysinfo` running processes before allowing cleanup of application data)
  - Hardened SIP / core system blacklist (`/System`, `/usr`, `/bin`, `/sbin`, `/private/var/db`, `/Library/Security`, `/Library/Keychains`)
  - Hardened user privacy directories (`Keychains`, `Mail`, `Messages`, `Cookies`, `.ssh`, `.gnupg`, `.aws`, `.config/gh`)
  - Protected active Git repositories (`.git/objects`, `.git/refs`, `.git/HEAD`)
  - **Permanent deletion strictly disabled** in Rust engine and UI to prevent unrecoverable data loss
  - Duplicate selection safeguards (guarantees at least 1 original file is preserved per duplicate group)
  - Dry-run simulation fidelity verified
- [x] **Futuristic Premium UI Polish & Performance:**
  - CPU-optimized radar sweep (stops rotation when idle or when reduced motion is preferred)
  - Motion accessibility support (`useReducedMotion` from `motion/react`)
  - Clear classification badges across all views: `Safe to Clean`, `Review Required`, `Protected by Safety Guard`
  - Separate display of Estimated Recoverable Space vs Lifetime Actual Reclaimed Storage
  - Transparent IPC mode indicator (`Native Engine Active` vs `UI Preview Mode`) in TitleBar
  - Polished hover springs, micro-interactions, and responsive layout
- [x] **Validation:**
  - `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` (passed, 0 warnings)
  - `cargo test --manifest-path src-tauri/Cargo.toml` (11/11 tests passed, 0 failures)
  - `npm run build` (tsc & vite passed cleanly in 3.17s)

### Phase 3: Advanced Duplicate Detection & Visual Treemap
- [ ] Interactive zoomable Disk Treemap visualization (Squarified layout in SVG)
- [ ] File type categorization and quick thumbnail previews
- [ ] Side-by-side binary/text diff previews for duplicates

### Phase 4: Application Uninstaller & Leftovers Deep Scan
- [ ] Deep heuristic leftover scanner for orphaned preferences of deleted apps
- [ ] Drag-and-drop `.app` onto myclean window for instant uninstallation
- [ ] Total system application disk consumption analytics

### Phase 5: Distribution Packaging (.app & .dmg) & Release Readiness
- [ ] Apple Silicon (`aarch64`) and Intel (`x86_64`) Universal macOS binary compilation
- [ ] Notarization and codesigning setup
- [ ] DMG background styling and drag-to-Applications layout
