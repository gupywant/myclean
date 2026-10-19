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

### Phase 05: Duplicate Finder (COMPLETED)
- [x] **Multi-Stage Cryptographic Detection Engine (`duplicates.rs`):**
  - Strict three-tier pipeline: APFS File Size Bucketing &rarr; 16KB Partial Head/Tail BLAKE3 Hashing &rarr; Full Streaming BLAKE3 Verification with bounded 64KB buffers.
  - Zero false positives: files are never classified as duplicates based solely on file names, extensions, sizes, or partial hashes.
  - Real-time event streaming: emits `duplicate:progress` events with current phase, scanned file counts, candidate group counts, bytes hashed, and completion percentage.
  - Immediate cancellation responsiveness: checks `AtomicBool` on every iteration and buffer read to abort within milliseconds.
- [x] **APFS Hard-Link & Symlink Awareness (`duplicates.rs`):**
  - Hard-link deduplication: tracks `(dev, ino)` to recognize files sharing physical disk blocks.
  - Accurate physical savings estimation: groups with only hard links calculate 0 reclaimable bytes because deleting one hard link decreases link count without freeing storage blocks until the last link is unlinked.
  - Boundary restriction: never follows symlinks outside approved scanning boundaries; symlinks are never hashed or added as duplicate targets.
- [x] **Strict Original Preservation Invariant (`duplicates.rs`, `commands.rs`):**
  - Backend enforcement: Rust `clean_duplicate_groups` guarantees at least 1 verified original is retained per group. Requests attempting to delete all copies or delete the designated original are strictly rejected with an error.
  - Default safe state: UI defaults to zero deletion selection (`is_selected_for_removal: false`).
- [x] **Scan-to-Clean Anti-Race Condition Protection (`duplicates.rs`):**
  - Re-computes full BLAKE3 hash immediately prior to trashing; if any file was modified, truncated, or tampered with post-scan, it is automatically skipped and reported.
  - Native macOS Trash only via `trash::delete(&canonical)`; permanent deletion remains strictly disabled.
  - Comprehensive SQLite audit logging storing detailed JSON payload (`CleanupAuditDetail`) in `myclean.db`.
- [x] **Futuristic Premium UI Experience (`DuplicatesView.tsx`, `DuplicateConfirmModal.tsx`, `useCleanStore.ts`):**
  - Target scope selection: Downloads (default), Documents, Desktop, and custom path selector.
  - Minimum size filtering: All (>1KB), 1 MB (default), 10 MB, 100 MB.
  - Live scanning pulse banner with phase details, candidate counters, progress bar, and Abort Scan button.
  - Smart Selection heuristics: Keep Oldest (Recommended), Keep Newest, Deselect All.
  - Group cards with BLAKE3 hash pill (with copy-to-clipboard), reclaimable APFS space badge, clone count, hard-link indicator, and cross-directory warnings.
  - Deep comparison modal (`DuplicateInspectModal`): side-by-side inspection of file paths, logical vs APFS allocated sizes, inodes, link counts, modification dates, Reveal in Finder, and one-click designated original reassignment.
  - Dedicated Duplicate Confirmation Modal: mode toggle (Trash vs Dry-Run Simulation), summary metrics, original preservation notice, and audit-logged execution.
- [x] **Automated Tests & Regression Coverage:**
  - 40 tests passing (38 unit tests + 2 integration tests in `duplicates_safety.rs`), covering empty files, size collisions, partial hash collisions, hard-link zero-savings detection, symlink ignoring, cancellation, original preservation rejection, and anti-race condition hash mismatch.
  - `cargo clippy -- -D warnings` passing with 0 warnings.
  - `npm run build` (`tsc && vite build`) passing cleanly with 0 type errors.

### Phase 06: App Uninstaller & Unused Data (Completed)
- [x] **Installed Application Discovery Engine:**
  - Automated discovery across `/Applications`, `~/Applications`, and user-specified custom application paths.
  - Robust XML and binary `bplist` `Info.plist` parser utilizing macOS `plutil` JSON conversion with fallback XML token extraction.
  - Bundle metadata extraction: `bundle_id`, application name, short version string, publisher / copyright, installation source (System Application, Mac App Store, Homebrew Cask, User Installed), and running status.
  - Native macOS `.icns` extraction via `sips` into 64x64 PNG base64 data URLs with disk caching in `~/Library/Caches/com.myclean.app/icons`.
  - APFS physical allocated vs logical byte measurement for accurate application bundle sizes.
  - Graceful fallback for malformed or missing plists without crashing or omitting applications.
- [x] **Related Application Data Discovery & Confidence Classification:**
  - Heuristic scanning of approved user Library locations: `Application Support`, `Caches`, `Preferences` (`.plist`), `Saved Application State` (`.savedState`), `HTTPStorages`, `WebKit`, `Logs`, and `Containers`.
  - Confidence scoring:
    - `High Confidence`: exact bundle identifier matches (e.g., `com.company.app`).
    - `Review Required`: naming-only matches or ambiguous subfolders.
    - `Protected`: system roots, persistent SQLite databases (`.sqlite`, `.db`), credentials, and user personal documents.
  - Critical persistence preservation: SQLite databases, credentials, user profiles, and keychains are protected by default.
- [x] **Active Application Protection & Running Process Locks:**
  - Real-time running process and bundled helper detection via `sysinfo`.
  - Blocks uninstallation if the application or any of its bundled helper processes is actively running.
  - Refuses to force-quit running applications, preventing unsaved work loss or corrupt application state.
- [x] **Orphaned Application Data Hunter:**
  - Deep heuristic residual scanner for leftover preferences, caches, and saved states in `~/Library`.
  - Cross-references identifiers against all user-installed and system applications to eliminate false positives.
  - Safe removal with confirmation, dry-run simulation, and trash-only deletion.
- [x] **Drag-and-Drop `.app` Inspection:**
  - Instant drag-and-drop zone in UI and backend validation (`inspect_dropped_app`) for standalone `.app` bundles outside standard directories.
- [x] **Safety Policies & Recovery Guarantee:**
  - Protected macOS system applications (`/System/Applications`, `/Library/Apple`) cannot be uninstalled.
  - Single-app uninstallation only; prevents blind bulk app deletion disasters.
  - Recoverable deletion by default via macOS Trash (`trash::delete(&canonical)`); permanent deletion strictly disabled.
  - Complete audit trail persisted to SQLite `cleanup_history`.
- [x] **Futuristic Premium UI:**
  - Installed Apps vs Orphaned Leftovers tabs with live count and footprint badges.
  - Animated Drag-and-Drop target zone with spring feedback.
  - Real extracted native application icons with glowing accent fallback.
  - Active running process indicator pills with PID details.
  - Expandable footprint breakdown by category (Bundle, Caches, App Support, Preferences, Saved State, Containers).
  - Dedicated `AppUninstallModal` with dry-run toggle, active app detection warning, item selection, and celebratory cleanup feedback.
- [x] **Automated Tests & Regression Coverage:**
  - 50 tests passing (41 unit tests + 7 `apps_safety.rs` integration tests + 2 `duplicates_safety.rs` integration tests).
  - Covers malformed plists, missing bundle IDs, system app rejection, unconfirmed request rejection, user document protection, dry-run simulation fidelity, and orphaned safety rejections.
  - `cargo clippy -- -D warnings` passing with 0 warnings.
  - `npm run build` (`tsc && vite build`) passing cleanly with 0 type errors.

### Phase 07: Developer & Docker Cleaner (COMPLETED)
- [x] **Modular Developer Cleanup Provider Architecture (`developer.rs`):**
  - Unified `DeveloperProvider` trait with methods: `detect`, `inspect`, `estimate`, `validate`, `cleanup`, and `explain_risk`.
  - Typed risk classifications: `DeveloperRiskLevel` (`SafeToRebuild`, `NeedsProjectReview`, `HighRiskProtected`) and `RiskExplanation` with rebuild instructions and disposable rationale.
  - Strict boundary validation ensuring providers only touch authorized cache directories and never arbitrary filesystem paths.
- [x] **Conservative Tool Cache Providers (`developer.rs`):**
  - **Xcode DerivedData Provider:** Discovers and clears `~/Library/Developer/Xcode/DerivedData` build products, index stores, and module caches safely without touching Xcode configurations or templates.
  - **Homebrew Cache Provider:** Safely purges downloaded bottles and git clone caches in `~/Library/Caches/Homebrew` while preserving formula definitions and installed taps.
  - **Cargo Cache Provider:** Scans `~/.cargo/registry` and `~/.cargo/git`, strictly protecting `~/.cargo/bin`, `credentials`, `config.toml`, and environment configuration.
  - **npm Cache Provider:** Restricts cleanup strictly to `~/.npm/_cacache`, preserving `package-lock.json`, npm configs, and global modules.
  - **pnpm Store Provider:** Detects and verifies pnpm content-addressable store (`Library/pnpm/store`), explaining rebuild impact.
  - **Yarn Cache Provider:** Targets versioned Yarn v1/v2/v3 global cache directories while preserving Yarn RC files and global binaries.
  - **Gradle Cache Provider:** Purges `~/.gradle/caches`, strictly protecting `gradle-wrapper.jar`, `gradle.properties`, wrapper distributions, and global init scripts.
  - **Swift Package Manager Provider:** Detects `~/Library/Caches/org.swift.swiftpm` repository and artifact cache.
- [x] **Project Workspace Artifacts Provider (`developer.rs`):**
  - Scans user-registered project workspaces for build outputs.
  - Strict manifest verification: `target/` directories require a verified `Cargo.toml` in the same directory; `node_modules/` require a verified `package.json`.
  - Rejects arbitrary directories named `target` or `node_modules` without valid build manifests.
- [x] **Docker Integration & Daemon Inspection (`docker.rs`):**
  - Discovers official Docker CLI paths (`/usr/local/bin/docker`, `/opt/homebrew/bin/docker`).
  - Daemon status checking via `docker info` detecting whether the daemon is online, paused, or offline; refuses to auto-restart stopped daemons, explaining why with user-friendly guidance.
  - Docker storage breakdown via `docker system df --format json` for images, containers, local volumes, and build cache.
  - Resource inspection via structured commands (`docker ps -a`, `docker image ls -a`, `docker builder du`, `docker network ls`, `docker volume ls`).
- [x] **Docker Safety Guardrails & Selective Cleanup (`docker.rs`):**
  - **Strict Docker Volume Protection:** Docker volumes are classified as `is_protected = true` and strictly blocked from deletion by backend validation.
  - **Command Injection Prevention:** All resource IDs and parameters are validated against strict regex (`^[a-zA-Z0-9_\-\.:/]+$`).
  - Never executes arbitrary shell strings; all invocations use structured `std::process::Command` argument arrays.
  - Selective cleanup of stopped containers, dangling/unused images, build cache, and unused networks using tool-native commands (`docker rm`, `docker rmi`, `docker builder prune`, `docker network rm`).
  - Space compaction advisory: alerts users that Docker for Mac VM disk files (`Docker.raw`) do not automatically shrink host disk allocation upon container/image removal, providing clear guidance on host compaction.
- [x] **Recoverable Deletion & Audit Trail:**
  - Filesystem artifacts deleted exclusively via native macOS Trash (`trash::delete(&canonical)`); permanent deletion strictly disabled.
  - Dry-run simulation mode supported for both developer caches and Docker operations.
  - Comprehensive SQLite audit logging storing detailed JSON payload (`CleanupAuditDetail`) in `myclean.db`.
- [x] **Futuristic Premium UI Experience (`DeveloperSpaceView.tsx`, `DeveloperCleanModal.tsx`, `DockerCleanModal.tsx`):**
  - Three specialized studio views: **Tool Caches**, **Project Workspaces**, and **Docker Studio**.
  - Real-time status cards: Active Caches Footprint, Reclaimable Space, Docker Status badge with pulse ring.
  - Filterable Docker resource table with protected volume badge and locked indicator.
  - Dedicated `DeveloperCleanModal` with dry-run toggle, risk explanations, and space metrics.
  - Dedicated `DockerCleanModal` highlighting volume protection and VM disk compaction guidance.
- [x] **Automated Tests & Regression Coverage:**
  - 65 tests passing across all test suites (41 unit tests + 7 `apps_safety.rs` + 9 `developer_safety.rs` + 6 `docker_safety.rs` + 2 `duplicates_safety.rs`).
  - Covers boundary checking, credential protection, wrapper protection, npm cache restriction, manifest requirement, command injection prevention, and volume protection.
  - `cargo clippy -- -D warnings` passing with 0 warnings.
  - `npm run build` (`tsc && vite build`) passing cleanly with 0 type errors.

### Phase 08: Settings & Cleanup History (COMPLETED)
- [x] **Persistent SQLite Settings Architecture (`db.rs`, `commands.rs`):**
  - Strongly typed `AppPreferences` supporting theme (`dark`, `light`, `system`), accent color (`violet`, `cyan`, `indigo`), animation intensity (`full`, `reduced`, `off`), CPU thread limit, large file thresholds, retention intervals, and scan reminder preferences.
  - Zero plaintext secrets or credentials stored; atomic JSON updates in SQLite `app_settings`.
  - Backend safety invariant: `move_to_trash_only = true` is permanently immutable in Rust and cannot be disabled from the frontend.
- [x] **Safety & Privacy Preferences (`SettingsView.tsx`):**
  - Move to macOS Trash enforced as the sole deletion mechanism; permanent deletion disabled with immutable locked badge.
  - Default Dry-Run simulation toggle to enforce safe preview before execution.
  - Comprehensive overview cards explaining SIP root protections, user identity protections, active application process locks, and Docker volume isolation.
  - Zero-telemetry declaration: 100% local-first with zero analytics or background cloud uploads.
- [x] **Exclusion Manager & Path Validator (`safety.rs`, `db.rs`):**
  - Displays mandatory exclusions (macOS SIP roots, User Keychains, Apple Mail, iMessage, Docker VM storage, personal user documents) with human-friendly descriptions.
  - Mandatory exclusions are strictly immutable and protected against removal.
  - Real-time path validation in Rust rejecting path traversal (`..`), empty paths, root (`/`), and redundant paths already covered by mandatory rules.
  - Custom exclusions persisted in SQLite `whitelist` table and automatically merged into all scan scopes (`user_exclusions`) and cleanup validations.
- [x] **Advanced Cleanup History & Audit Timeline (`HistoryView.tsx`, `db.rs`):**
  - Searchable, filterable activity timeline querying real SQLite audit records.
  - Database-side pagination (`LIMIT` / `OFFSET`) supporting arbitrary page sizes.
  - Multi-criteria filtering: search queries, cleanup category (`Deep Clean`, `Developer Spaces`, `Docker Studio`, `App Uninstaller`, `Duplicate Finder`), operation type (Actual vs Dry-Run Simulation), and sorting (`Most Recent`, `Largest Space`, `Most Items`).
  - Interactive record inspection modal displaying raw JSON audit payload, itemized failure counts, and error summaries.
- [x] **Interactive Cleanup Analytics (`HistoryView.tsx`):**
  - Visual charts powered by Recharts with Futuristic Premium aesthetic.
  - 30-day historical activity trend area chart with electric violet gradient.
  - Category volume distribution bar chart.
  - **Storage Recovery Invariant:** Clearly separates "Moved to macOS Trash" from "Docker Reclaimed Storage" and educates users that physical APFS blocks are reclaimed once Trash is emptied in Finder.
- [x] **Database Schema Migrations & Integrity Maintenance (`db.rs`):**
  - Versioned schema migrations using `PRAGMA user_version` (v2 migration adding indices for fast history queries and path lookups).
  - Database health check reporting `PRAGMA integrity_check`, schema version, file size on disk, and record counts.
  - Automatic and manual retention pruning (`30_days`, `90_days`, `180_days`, `forever`).
  - Safe audit clearing requiring explicit confirmation without affecting files in macOS Trash.
- [x] **Local Notifications Subsystem (`notifications.rs`):**
  - Native macOS banner notifications using `osascript` for scan completions, clean completions, and error warnings.
  - Does not introduce privileged background daemons or background battery drain.
  - Test banner dispatch control in UI.
- [x] **Automated Tests & Regression Coverage:**
  - **76 tests passing** across all test suites (44 unit tests + 7 `apps_safety.rs` + 9 `developer_safety.rs` + 6 `docker_safety.rs` + 2 `duplicates_safety.rs` + 8 `settings_safety.rs`).
  - Covers preferences persistence, immutable trash safety, mandatory exclusion protection, custom exclusion validation, history pagination, analytics aggregation, database integrity, and notification robustness.
  - `cargo clippy -- -D warnings` passing with 0 warnings.
  - `npm run build` (`tsc && vite build`) passing cleanly with 0 type errors.

### Phase 09: Security Hardening, Performance Optimization & Quality Assurance (COMPLETED)
- [x] **Comprehensive Security Audit Across All Rust Modules (`SECURITY_AUDIT.md`):**
  - Audited `safety.rs`, `cleaner.rs`, `duplicates.rs`, `apps.rs`, `developer.rs`, `docker.rs`, `commands.rs`, and `tauri.conf.json`.
  - Identified and eliminated attack surfaces: TOCTOU race conditions, symlink substitution attacks, directory traversal (`..`), command injection, and null byte injection.
  - Zero unauthorized data modification; zero unrecoverable deletions. Permanent deletion remains permanently hard-disabled.
- [x] **Anti-TOCTOU & Symlink Substitution Mitigation (`safety.rs`, `cleaner.rs`, `duplicates.rs`, `apps.rs`, `developer.rs`):**
  - Implemented `FileMetadataSnapshot` capturing device ID (`st_dev`), inode (`st_ino`), symlink status, file type, file size, and modification timestamp via `std::fs::symlink_metadata` (never following symlinks).
  - Implemented `SafetyGuard::verify_unaltered` executing immediately before trashing. Any symlink transition, file-to-directory mutation, or inode substitution immediately aborts the operation with `SafetyError::SecurityViolation` or `SafetyError::SymlinkEscape`.
  - Enforced dual path snapshotting in `Cleaner::clean_items`: verifies both the user-specified entry path `p` and its canonical resolution `canonical`.
- [x] **Tauri IPC Boundary Sanitization & Strict Content Security Policy (`commands.rs`, `tauri.conf.json`):**
  - Sanitized all string path parameters across Tauri IPC commands (`open_in_finder`, `inspect_developer_workspace`, `analyze_storage`, `scan_duplicates`, `add_custom_exclusion`).
  - Strict input filters: rejects empty paths, relative traversal components (`..`), null bytes (`\0`), and leading CLI flag characters (`-`) to prevent argument injection into `open -R -- "$path"`.
  - Configured strict CSP in `tauri.conf.json`: restricts resource loading to `self`, `tauri:`, and `asset:`, with IPC connections strictly limited to trusted local origins. Disallows remote script injection and external network calls.
- [x] **Docker Active State Race Protection & Volume Guardrails (`docker.rs`):**
  - Pre-removal container running status recheck: executes `docker inspect -f '{{.State.Running}}' <id>` immediately prior to `docker rm`. If a container was restarted post-scan, removal is skipped with a safety notice.
  - Docker Volumes remain strictly non-deletable with automated security violation rejections.
  - Strict resource ID regex validation preventing shell command chaining.
- [x] **Frontend Performance Optimization & Route-Level Code Splitting (`App.tsx`, `vite.config.ts`):**
  - Route-level dynamic imports (`React.lazy`) with `<Suspense fallback={<ViewLoadingFallback />}>` for secondary views (`StorageTreemapView`, `DeveloperSpaceView`, `LargeFilesView`, `DuplicatesView`, `AppsView`, `HistoryView`, `SettingsView`).
  - Rollup `manualChunks` partitioning in `vite.config.ts` separating `vendor-motion`, `vendor-icons`, `vendor-charts`, and `vendor`.
  - **Initial bundle size reduced from 1,202 kB to 118 kB (a 90.2% reduction in initial entry footprint)**, eliminating all Vite/Rollup chunk size warnings.
  - Webview initial memory consumption reduced by ~60% (~19 MB initial RSS).
- [x] **Benchmarking & Automated Security Regression Coverage (`PERFORMANCE_REPORT.md`, `tests/security_hardening.rs`):**
  - Synthetic scan throughput benchmark: **29,333 files/second** traversal speed and **619 µs sub-millisecond cancellation responsiveness**.
  - **83 tests passing** across 7 test suites (44 unit tests + 7 `apps_safety.rs` + 9 `developer_safety.rs` + 6 `docker_safety.rs` + 2 `duplicates_safety.rs` + 7 `security_hardening.rs` + 8 `settings_safety.rs`).
  - `cargo clippy -- -D warnings` passing with 0 warnings.
  - `npx tsc --noEmit` and `npm run build` passing with 0 errors and 0 warnings.

### Phase 10: macOS Universal Release
- [x] **Universal Mach-O Fat Binary Compilation (`lipo` / `package-release.sh`):**
  - Compiled optimized release binaries for both `aarch64-apple-darwin` (Apple Silicon M1/M2/M3/M4) and `x86_64-apple-darwin` (Intel 64-bit).
  - Combined targets into a Universal 2 Fat Mach-O binary (`x86_64 arm64`) via Apple `lipo`, allowing a single app bundle to run natively at full speed on all modern Mac systems.
- [x] **Application Metadata & Retina Icon Generation (`src-tauri/icons/icon.icns`):**
  - Generated full multi-resolution icon bundle (`icon.icns`, 576 KB) containing 16x16 through 512x512@2x retina assets matching Futuristic Premium branding.
  - Bundled metadata in `Info.plist`: identifier `com.myclean.app`, version `1.0.0`, category `public.app-category.utilities`, minimum OS `11.0`.
- [x] **Fast Native Compressed DMG Packaging (`hdiutil` / `scripts/package-release.sh`):**
  - Automated production-ready UDZO DMG generation containing `myclean.app` and drag-and-drop symlink to `/Applications`.
  - Generates 3 distribution flavors: `myclean-1.0.0-universal.dmg` (8.0 MB), `myclean-1.0.0-aarch64.dmg` (4.1 MB), and `myclean-1.0.0-x86_64.dmg` (4.7 MB).
- [x] **Ad-Hoc Code Signing & Strict Bundle Verification (`codesign`):**
  - Signed bundles using ad-hoc identity (`codesign --force --deep -s -`) with zero dependency on paid Apple Developer ID certificates ($99/yr).
  - Validated disk integrity and Designated Requirements (`codesign --verify --deep --strict`).
- [x] **Cryptographic SHA-256 Checksums (`SHA256SUMS.txt`):**
  - Automated cryptographic hash generation across all packaged DMGs for secure offline download verification.
- [x] **Automated CI/CD Release Pipeline (`.github/workflows/release.yml`):**
  - Configured GitHub Actions workflow on `v*` tags with least-privilege `contents: write` permissions.
  - Automates dual-target Rust toolchain setup, linting (`clippy`), unit tests (`cargo test`), TypeScript checks (`tsc`), DMG packaging, and release publishing via `softprops/action-gh-release@v2`.

### Phase 11: GitHub Branding, SEO, README & Screenshots
- [x] **GitHub Repository Optimization & SEO:**
  - Configured repository description: *"A modern, privacy-first macOS cleaner built with Rust and Tauri. Clean caches, analyze storage, find duplicates, uninstall apps, and manage Docker clutter safely."*
  - Configured 12 GitHub topics: `macos`, `macos-app`, `macos-cleaner`, `disk-cleaner`, `rust`, `tauri`, `desktop-app`, `storage-analyzer`, `duplicate-finder`, `docker`, `developer-tools`, `open-source`.
- [x] **Branding Asset Organization (`assets/branding/`):**
  - Encapsulated approved Gradient M Broom Logo in `assets/branding/myclean-logo.svg` and `assets/branding/myclean-logo.png` without altering design.
  - Native Tauri application icons maintained in `src-tauri/icons/`.
- [x] **Authentic Application Screenshot (`assets/screenshots/dashboard.png`):**
  - Captured actual 1200×800 screenshot of the running myclean dashboard showing the Futuristic Premium void black surface, active SIP Shield status, disk breakdown, and centered radar disc with approved logo.
  - Sanitized telemetry ensuring zero personal user paths or private data exposure.
- [x] **GitHub Social Preview (`assets/branding/github-social-preview.png`):**
  - Generated 1280×640 social preview card featuring ambient violet/cyan backlighting, typographic badges, and real window frame composition.
- [x] **Developer Landing Page (`README.md`):**
  - Centered hero layout with approved logo, version badges, direct Universal DMG download CTA, and real dashboard preview.
  - Comprehensive technical sections: architecture, safety invariants, tech stack, Gatekeeper launch methods, build from source instructions, known limitations, and roadmap.
- [x] **Permissive MIT License (`LICENSE`):**
  - Added official MIT open-source license covering myclean contributors.

### Phase 11.1: CleanMyMac-Inspired Smart Scan Experience (Completed)
- [x] **Native Staged Smart Scan Engine (`src-tauri/src/scanner.rs`):**
  - Staged category execution across 7 distinct targets: System Cache, Application Cache, Browser Cache, Developer Cache, Logs & Temporary Files, macOS Trash, and Docker Resources.
  - Off UI-thread traversal with bounded memory and Rayon/atomic metrics.
  - Real progress calculation strictly derived from actual filesystem and Docker state (no simulated timers or mock percentages). Never emits 100% until engine finishes.
  - Strict monotonic `overall_progress` guarantee with stage-weighted accumulation.
  - Structured progress events containing all 13 fields: `session_id`, `category_id`, `current_category`, `current_path`, `phase`, `files_inspected`, `directories_inspected`, `bytes_analyzed`, `items_discovered`, `items_found`, `bytes_found`, `category_status`, `category_progress`, `overall_progress`, `percent_complete`, `skipped_count`, `permission_denied_count`, `elapsed_ms`, `safe_items_count`, `review_items_count`.
  - Non-blocking emission throttling (minimum 35ms between events or forced on discoveries/transitions).
  - Sub-millisecond cancellation support across every category and directory walk, emitting `CategoryScanStatus::Partial` without jumping to 100%.
  - Native Docker CLI/API inspection: detects dangling images and build cache layers safely, skipping gracefully if Docker daemon is stopped without traversing raw VM files.
- [x] **Safe Docker Prune Routing in Cleaner (`src-tauri/src/cleaner.rs`):**
  - Routes `docker://dangling-images` and `docker://build-cache` to native Docker CLI prune commands when explicitly confirmed, preserving all other safe Trash routing.
- [x] **Comprehensive Progress Test Suite (`src-tauri/tests/scanner_progress.rs`):**
  - 5 automated integration tests verifying progress event structure, monotonicity, category status transitions, mid-scan cancellation partial state, and Docker graceful skip.
  - **88 tests passing** across all test suites (`cargo test`).
  - Zero compiler warnings and zero Clippy warnings (`cargo clippy -- -D warnings`).
- [x] **Smart Scan Centerpiece Component (`src/components/dashboard/SmartScanCenter.tsx`):**
  - Large SVG circular progress gauge with dual cyan-to-violet gradient (`#06B6D4` -> `#8B5CF6`).
  - Rotating conic sweep radar beam active during scanning (respects `useReducedMotion`).
  - Real central live percentage, stage pill, and elapsed time counter.
  - Dynamic scan states: Idle (Approved Logo), Scanning (Live Metrics & Abort button), Results (Total Recoverable & prominent Review Cleanup button), and Cancelled (Partial recovery).
- [x] **Category Progress & State Panel (`src/components/dashboard/ScanCategoryPanel.tsx`):**
  - 7 category cards with dedicated Phosphor icons and color glows.
  - Live state badges: `Scanning` (cyan spinner), `Completed` (emerald check with byte count), `Skipped` (slate minus), `Partial` (amber warning), `Pending` (clock).
  - Bottom progress line per category.
- [x] **Live Discovery Feed (`src/components/dashboard/LiveDiscoveryFeed.tsx`):**
  - Real-time filesystem inspection stream with smart path abbreviation (`~/Library/Caches/...`).
  - Live telemetry counters: Safe to Clean, Review Required, and Files Inspected.
- [x] **Dashboard Integration (`src/components/dashboard/DashboardView.tsx`):**
  - Seamlessly integrates Smart Scan Center, Category Panel, Live Feed, Hardware Telemetry, and Safety Indicator.
  - Non-destructive Review Cleanup workflow: never cleans automatically.
- [x] **TypeScript & Vite Verification:**
  - `npx tsc --noEmit` and `npm run build` passing with 0 errors.

### Phase 11.2: Smart Scan & Docker Safety Hotfix (Completed)
- [x] **Critical Docker Cleaner Safety Audit (`src-tauri/src/cleaner.rs`):**
  - Eliminated broad prune commands (`image prune -f`, `builder prune -f`) from `Cleaner::clean_items`.
  - Generic filesystem cleaner (`clean_items`) strictly rejects any `docker://` or `docker:` pseudo-paths with an explicit security policy violation error.
  - Smart Scan items for Docker (`dangling-images` and `build-cache`) are marked with `is_safe_to_clean: false`, `is_selected: false`, `is_eligible_for_cleanup: false`, and `ineligibility_reason: Some("Docker resources require dedicated scope-specific confirmation in Docker Studio".into())`.
  - Docker cleanup remains strictly routed through the dedicated Docker safety engine (`DockerManager::clean`), requiring explicit confirmation, running container anti-race check, volume protection, and daemon health checks.
- [x] **Truthful Smart Scan Progress Calculation (`src-tauri/src/scanner.rs`):**
  - Replaced static 7-stage weighting with dynamic stage weights computed strictly across *enabled* stages (`100.0 / enabled_stages_count`).
  - Indeterminate category states emit `category_progress: -1.0` during scope initialization and background checks.
  - Disabled or skipped categories emit `CategoryScanStatus::Skipped` with `category_progress: 0.0` and do not artificially advance overall progress.
  - `100.0%` overall completion is strictly gated behind all enabled stages finishing successfully without cancellation.
  - Cancelled scans preserve honest progress reached at abort time with `CategoryScanStatus::Partial` and `was_cancelled: true`.
- [x] **Cache Scope Non-Overlapping Guarantee (`src-tauri/src/scanner.rs`):**
  - Implemented `Scanner::is_path_overlapping` with ancestor, descendant, and exact match checks.
  - Maintained shared `visited_paths: HashSet<PathBuf>` across all scan stages.
  - Excluded browser, messaging, and developer cache directories from Stage 1 (App Cache) to guarantee zero double-counting.
  - Resolved parent-child overlap between `~/Library/Logs` and `~/Library/Logs/DiagnosticReports` in Stage 4.
- [x] **Safety Regression Test Suite:**
  - Added unit test `test_cleaner_rejects_docker_pseudo_paths` in `cleaner.rs`.
  - Added unit tests `test_classify_candidate_rule_docker_review_required_and_ineligible` and `test_is_path_overlapping_detection` in `scanner.rs`.
  - Added integration tests `test_generic_cleaner_strictly_rejects_docker_pseudo_paths` and `test_docker_scan_items_marked_ineligible_for_generic_cleanup` in `tests/docker_safety.rs`.
  - Added integration tests `test_disabled_stages_do_not_advance_overall_progress`, `test_indeterminate_progress_on_initialization`, and `test_non_overlapping_cache_accounting_regression` in `tests/scanner_progress.rs`.
  - **94 tests passing** across 8 test suites (`cargo test`).
  - Zero compiler warnings and zero Clippy warnings (`cargo clippy -- -D warnings`).
  - Clean TypeScript verification (`npx tsc --noEmit`) and Vite production build (`npm run build`).

### Phase 11.3: Fix Smart Scan Stuck at 0% (Completed)
- [x] **Diagnosed Root Cause:**
  - Resolved session ID mismatch between frontend (`scan-${Date.now()}`) and Rust backend (`chrono::Utc::now().timestamp_millis()`).
  - Added `session_id: Option<String>` to `ScanScopeConfig` so the active session identifier is synchronized end-to-end.
  - Resolved deep directory traversal silence: directories with large file counts (e.g. `cargo-xwin` with >9,500 files) previously traversed synchronously without emitting intermediate inspection events. Created `measure_path_with_metrics_cb` with a 40ms throttling callback to stream live file paths, inspected file counts, and interpolated intra-category progress during large directory walks.
  - Replaced runtime dynamic bare-specifier imports in `App.tsx` (`import("@tauri-apps/api/...")`) with static imports (`import { listen } from "./lib/api"`), eliminating WebKit production runtime module resolution errors.
- [x] **Indeterminate & Determinate Progress Architecture:**
  - Emitted `category_progress: -1.0` during scope initialization, rendering an active animated scanning shimmer rather than a misleading static `0%`.
  - Added indeterminate SVG progress ring animation (`animate-spin origin-center` with segmented stroke) during initial directory enumeration, transitioning smoothly to determinate circular fill once measured.
  - Enhanced `ScanCategoryPanel.tsx` with animated pulse gradient indicators for active indeterminate categories.
- [x] **Subscription Lifecycle & Event Delivery:**
  - Added module-level `activeScanUnlisten` tracking in `useCleanStore.ts` to cleanly unsubscribe prior listeners on scan start or cancellation.
  - Implemented dual IPC emission in `commands.rs` (`app_handle.emit` and explicit `win.emit` per webview window) ensuring reliable delivery across all Tauri window contexts.
  - Synchronized window title with live scan progress (`myclean - Scanning (X%) [Category]`) and completion state.
  - Added typed `scanError: string | null` state with error feedback and retry action in `SmartScanCenter.tsx`.
  - Ensured repeated scans cleanly reset metrics, session IDs, discovery feed, and results.
- [x] **Real macOS Native GUI Verification & Live Application Results:**
  - Built production macOS application bundle and installed to `/Applications/myclean.app`.
  - Launched and tested the real installed GUI on desktop screen through all 7 stages:
    1. System Cache
    2. Application Cache
    3. Browser & Messaging Caches
    4. Developer Tooling & Build Caches
    5. Application & System Logs
    6. macOS Trash & Large Candidate Files
    7. Docker Engine Resources
  - Verified live UI state in the running application: smoothly progressed from 0% to 100%, culminating in the final results view with **7.9 GB Estimated Recoverable Space (59 candidate items)**, green checkmarks across all 7 stage cards, and the interactive **"Review Cleanup (7.9 GB)"** button.
- [x] **Dry-Run Simulation Feedback & Cleanup Results Modal:**
  - Resolved issue where Dry-Run simulation closed the confirmation modal prematurely with no user feedback.
  - Implemented multi-state modal flow in `ConfirmCleanModal.tsx`:
    - In-progress simulation spinner with clear safety description and cancellation button.
    - Dry-Run Simulation Verified screen showing reclaimable space (cyan), verified items count, 100% safety indicator, and zero-file-altered guarantee.
    - Transition button to proceed directly from dry-run preview into real macOS Trash deletion.
    - Cleanup completion screen showing storage freed (emerald), items trashed, and celebration confetti.
- [x] **Silent Cocoa Trash Integration (`SafetyGuard::trash_item`):**
  - Diagnosed audible macOS Finder paper-crunch sound effect during cleanup: `trash` crate defaulted to `DeleteMethod::Finder` which executes `osascript -e 'tell application "Finder" to delete...'`, causing Finder to play the system trash sound on every file and introducing subshell overhead.
  - Implemented `SafetyGuard::trash_item` and `SafetyGuard::trash_all` configuring `DeleteMethod::NsFileManager` (`NSFileManager.trashItemAtURL`).
  - Switched all cleanup modules (`cleaner.rs`, `apps.rs`, `developer.rs`, `duplicates.rs`) to silent Cocoa trashing.
  - Deletions are now completely silent, significantly faster, and remain 100% recoverable in the macOS Trash.
  - Added unit test `test_silent_trash_execution` (103/103 cargo tests passing).
- [x] **Sidebar Storage Refresh & macOS Trash Metrics Integration:**
  - Added interactive live storage refresh button (`ArrowsClockwise`) in `Sidebar.tsx` bottom quick storage widget.
  - Implemented `SystemTelemetry::get_trash_metrics()` computing real-time macOS Trash size across `~/.Trash` and volume-mounted `.Trashes/<uid>`.
  - Added intelligent fallback to SQLite audit records if direct `~/.Trash` directory traversal is denied by macOS TCC privacy.
  - Added dedicated **macOS Trash** row in the sidebar storage widget showing live formatted Trash size and item count with Phosphor `Trash` icon.
  - One-click shortcut on the Trash row (`api.openTrashFolder()`) reveals the macOS Trash directly in Finder.
  - Added auto-refresh on window focus so external file deletions and Finder actions immediately reflect in the sidebar.
  - Added unit test `test_trash_metrics_gathering` (104/104 cargo tests passing).
- [x] **Storage Analyzer Layout & Dynamic Treemap ResizeObserver:**
  - Resolved initial container dimension bug where the Squarified Treemap SVG defaulted to fixed fallback dimensions (600x480) when `isStorageAnalyzing` completed, requiring the user to switch tabs to trigger a remount.
  - Implemented callback ref `ref={setContainerEl}` with an active `ResizeObserver` and window resize listeners, ensuring immediate and accurate DOM bounding box measurement the exact instant the analysis completes.
  - Added full vertical scrollability (`overflow-y-auto`) to the Storage Analyzer view so users can inspect complete hierarchical results.
  - Implemented **Folder Contents Breakdown** table directly beneath the Treemap, providing a comprehensive ranked list of all files and folders in the current directory (sorted by allocated bytes) with visual proportion bars, file counts, risk classification badges, "Drill Down / Explore" buttons, and "Reveal in Finder" shortcuts.

### Phase 12: Homebrew Tap & Update Checker (Planned / Next)
- [ ] Create Homebrew Tap (`gupywant/homebrew-tap`) and Cask formula (`Casks/myclean.rb`).
- [ ] Implement opt-in GitHub Release update notifier with semantic version comparisons.




