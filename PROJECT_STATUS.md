# Flux Cleaner — Project Status

## Project Overview
**Flux Cleaner** is a privacy-first macOS cleaning application built with Tauri 2, Rust, React, TypeScript, Tailwind CSS v4, Motion, Phosphor Icons, and SQLite.

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

### Phase 2: Enhanced Scanning & Deep Developer Clean Rules
- [ ] Deep recursive `node_modules` project detection with last git commit age heuristic
- [ ] Docker container, image, and build cache direct socket pruning
- [ ] iOS DeviceSupport and older Simulator runtimes cleanup
- [ ] Custom scan paths selector for user project repositories

### Phase 3: Advanced Duplicate Detection & Visual Treemap
- [ ] Interactive zoomable Disk Treemap visualization (Squarified layout in SVG)
- [ ] File type categorization and quick thumbnail previews
- [ ] Side-by-side binary/text diff previews for duplicates

### Phase 4: Application Uninstaller & Leftovers Deep Scan
- [ ] Deep heuristic leftover scanner for orphaned preferences of deleted apps
- [ ] Drag-and-drop `.app` onto Flux Cleaner window for instant uninstallation
- [ ] Total system application disk consumption analytics

### Phase 5: Distribution Packaging (.app & .dmg) & Release Readiness
- [ ] Apple Silicon (`aarch64`) and Intel (`x86_64`) Universal macOS binary compilation
- [ ] Notarization and codesigning setup
- [ ] DMG background styling and drag-to-Applications layout
