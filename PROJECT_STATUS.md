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

### Phase 03: Advanced Filesystem Scanner, Safe Scopes & Interactive Storage Analyzer (Completed)
- [x] **Safe Scopes & Mandatory Exclusion Engine (`safety.rs`):**
  - Formally implemented `SafetyGuard::is_mandatory_exclusion` rejecting: SIP (`/System`, `/usr`, `/bin`, `/sbin`, `/private/var/db`), `/Library/Keychains`, `/Library/Security`, User Keychains, Mail (`~/Library/Mail`), Messages (`~/Library/Messages`), iCloud Drive (`~/Library/Mobile Documents`), Docker VM disks (`com.docker.docker/Data/vms`, `.raw`), Time Machine backups, `.git` internals, and unapproved broad `/private/var/folders`.
  - Enforced restricted cache-only traversal for `~/Library/Containers` and `~/Library/Group Containers`.
  - Added `SafetyGuard::symlink_escapes_boundary` to prevent symlinks from escaping authorized search roots.
- [x] **Advanced Parallel Filesystem Scanner (`scanner.rs`):**
  - Configurable scan scopes (`ScanScopeConfig`) with read-only Smart Scan by default.
  - Hard-link deduplication tracking inode tuples `(dev, ino)` to prevent double-counting storage on APFS.
  - Symlink safety: `follow_links(false)` with explicit boundary verification.
  - Filesystem boundary restrictions: verifies `dev() == root_dev` to prevent traversing across mount boundaries into external drives unless explicitly targeted.
  - Comprehensive permission error capture: records `skipped_paths` without aborting scan.
  - Safe risk classification tagging: `SafeToClean`, `ReviewRequired`, and `Protected`.
  - True progress streaming over Tauri IPC with cancellation token checks on every iteration.
- [x] **Real macOS Storage Analyzer Engine (`storage.rs`):**
  - Mounted volume detection (`VolumeInfo`) reading file system type, capacity, used, and available space.
  - Precise physical block allocation measurement (`blocks * 512`) vs logical file size (`len`), accurately exposing APFS sparse compression and clone savings.
  - File type categorization engine: Developer & Code, Media & Audio/Video, Archives & Disk Images, Documents, System Caches, and Other.
  - Aggregation of Top 50 Largest Files and Top 25 Largest Folders with risk classifications.
  - Hierarchical tree generation (`StorageNode`) tailored for treemap visualization with bounded memory depth.
  - Registered Tauri commands: `analyze_storage`, `cancel_storage_analysis`, and `open_in_finder` (native `open -R`).
- [x] **Futuristic Premium UI & Squarified Treemap (`StorageTreemapView.tsx`, `SquarifiedTreemap.tsx`):**
  - Interactive SVG Squarified Treemap (Bruls, Huizing, and van Wijk algorithm) with responsive dynamic resizing.
  - Folder drill-down with breadcrumb navigation trail (`/ > Users > user > Library > Developer ...`) and "Up One Level" jump.
  - Color-coded glowing neon tiles based on safety classification and file types.
  - Rich hover tooltip displaying path, allocated vs logical size, and click-to-drill-down hints.
  - Tabbed inspector: Treemap, File Type distribution bar & statistics, Largest Files table with "Reveal in Finder" and "Exclude from future scans".
  - Enhanced `LargeFilesView.tsx` with "Reveal in Finder" (`open -R`) and exclusion controls.
- [x] **Automated Tests & Validation:**
  - `cargo test` passing 20/20 tests (hard-link deduplication, symlink avoidance, mandatory exclusions, cancellation under deep trees, APFS allocation, sqlite persistence).
  - `cargo clippy -- -D warnings` passing cleanly with 0 warnings.
  - `npm run build` passing cleanly in Vite + TypeScript.

### Phase 04: Safe Cache & Junk Cleanup (Completed)
- [x] **Conservative Rule-Based Classification Engine (`scanner.rs`, `safety.rs`):**
  - Implemented `Scanner::classify_candidate_rule` assigning explicit detection rules (`RULE_SYSTEM_APP_CACHE`, `RULE_BROWSER_WEB_CACHE`, `RULE_APPLICATION_LOGS`, `RULE_XCODE_DERIVED_DATA`, `RULE_DEV_TOOLING_CACHE`, `RULE_MESSAGING_APP_CACHE`, `RULE_USER_TRASH_BIN`, `RULE_MAIL_PREVIEW_ATTACHMENTS`, `RULE_LARGE_USER_FILES`, `RULE_DATABASE_PROTECTED`, `RULE_ACTIVE_APP_RUNNING`, `RULE_MANDATORY_EXCLUSION`).
  - Added disposable justification explanation (`disposable_reason`) and cleanup eligibility (`is_eligible_for_cleanup`, `ineligibility_reason`) to every candidate item.
  - Required candidate metadata: file path, category, logical & allocated APFS sizes, last modification date, risk classification, detection rule identifier.
  - Unknown or unrecognized files strictly default to `ReviewRequired` or `Protected`; never classified as safe based solely on file extension, name, or directory membership.
- [x] **Hardened Safety Policies & Race Condition Guardrail (`safety.rs`, `cleaner.rs`):**
  - Implemented `SafetyGuard::is_database_or_persistent_state` protecting SQLite databases (`.db`, `.sqlite`, `.sqlite3`, `.db-wal`, `.db-shm`), critical browser profiles, credentials, cookies (`Cookies`, `Cookies.binarycookies`), login data (`Login Data`), and preferences (`Bookmarks.plist`, `Preferences`).
  - Scan-to-clean race condition mitigation: validates expected modification times and sizes before trashing to reject files altered after scanning.
  - Strict canonical path validation: checks symlink escapes, parent directory traversal (`..`), SIP boundaries, and user privacy roots.
  - Permanent deletion strictly disabled; no `rm -rf`; no automatic emptying of Trash.
- [x] **Active Application Detection Guardrail (`safety.rs`, `cleaner.rs`, `commands.rs`):**
  - Expanded `SafetyGuard::detect_running_application` with active desktop application signatures (Chrome, Brave, Edge, Firefox, Safari, Slack, Discord, Telegram, Teams, Spotify, Xcode, Cursor, Code, Docker).
  - Pre-clean active application inspection command `check_active_applications` providing proactive warnings in the UI before execution.
  - Runtime cleaning lock: immediately blocks cleanup and skips files if their associated application is actively running on macOS.
- [x] **Native macOS Trash Integration & Dry-Run Workflow (`cleaner.rs`):**
  - Strict recoverable deletion via native `trash::delete(&canonical)`.
  - Post-deletion existence verification: checks `!canonical.exists()` after deletion attempt to catch locked files or permission failures.
  - Itemized failure reporting returning `bytes_freed`, `bytes_moved_to_trash`, `items_deleted`, `items_skipped`, `items_failed`, and itemized error reasons.
  - Cancellable execution checking `AtomicBool` between items to abort gracefully within milliseconds.
  - Comprehensive SQLite audit logging storing detailed JSON payload (`CleanupAuditDetail`) in `myclean.db`.
- [x] **Futuristic Premium UI Experience (`DeepCleanView.tsx`, `ConfirmCleanModal.tsx`, `useCleanStore.ts`):**
  - Risk Classification filtering: `All Risks`, `Safe to Clean`, `Review Required`, `Protected`.
  - Item cards displaying detection rule IDs, classification badges, and active application alerts.
  - Candidate Inspector drawer presenting APFS allocated vs logical sizes, file counts, detection rule IDs, disposable justifications, last modified timestamps, and Reveal in Finder.
  - Enhanced Confirmation Modal featuring a Dry-Run simulation toggle, active applications alert card, space breakdown, detection rules summary, and abort cleaning control.
- [x] **Automated Tests & Verification:**
  - 30/30 unit tests passing in `cargo test` (including race condition detection, persistent database rejection, dry-run simulation, cancellation, hard-link deduplication, candidate rule classification, symlink boundary checks).
  - `cargo clippy -- -D warnings` passing with 0 warnings.
  - `npm run build` (`tsc && vite build`) passing cleanly with 0 type errors.

### Phase 05: Duplicate Finder
- [ ] Side-by-side binary/text diff previews for duplicates
- [ ] Smart duplicate selection heuristics (keep highest resolution / newest / oldest)

### Phase 06: App Uninstaller & Unused Data
- [ ] Deep heuristic leftover scanner for orphaned preferences of deleted apps
- [ ] Drag-and-drop `.app` onto myclean window for instant uninstallation

### Phase 07: Developer & Docker Cleaner
- [ ] Docker VM analysis via Docker CLI/API (not raw VM disks)
- [ ] Node modules & Cargo target cleaner

### Phase 08: Settings & Cleanup History
- [ ] Full audit trail viewer and custom exclusion editor

### Phase 09: Performance, Security & QA
- [ ] End-to-end performance profiling and memory stress tests

### Phase 10: macOS Universal Release
- [ ] Apple Silicon (`aarch64`) and Intel (`x86_64`) Universal macOS binary compilation
- [ ] Notarization and DMG packaging

