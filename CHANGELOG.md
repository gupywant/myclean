# Changelog — myclean

All notable changes to **myclean** will be documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-10-19

### 🚀 Initial Universal Release

Welcome to the initial production release of **myclean**, the high-performance, privacy-first macOS cleaner and optimization studio with a Futuristic Premium interface.

---

### Key Features by System

#### ⚡ Core Engine & Performance
- **Zero UI-Blocking Operations:** Filesystem scanning and hashing execute across worker threads using Rayon and asynchronous Tokio tasks.
- **Microsecond Cancellability:** All long-running scan and clean loops query atomic cancellation flags on every iteration.
- **Memory-Bounded Streaming:** Cryptographic BLAKE3 hashing uses fixed 64 KB buffers, ensuring low peak RAM usage (<120 MB during full-disk scans).
- **Embedded Local Persistence:** SQLite database stored at `~/Library/Application Support/com.myclean.app/myclean.db` with WAL mode enabled.
- **Zero Telemetry & 100% Privacy:** Absolutely no network connections, telemetry endpoints, or external analytic pings.

#### 🛡️ Bulletproof Safety Architecture
- **Non-Destructive Deletion:** All cleaning operations route through the macOS Trash via the native `trash` crate (`trash::delete`).
- **Hardcoded SIP & System Guardrails:** Absolute protection for macOS System Integrity Protection paths (`/System`, `/usr`, `/bin`, `/Library/Apple`, `/private/var`), personal document directories (`~/Documents`, `~/Desktop`, `~/Pictures`), and identity stores (`~/Library/Keychains`, `~/Library/Messages`).
- **TOCTOU & Symlink Defense:** File descriptors and `O_NOFOLLOW` flag enforcement prevent symlink redirection and race condition attacks.
- **Git Preservation:** Active git repositories (`.git/objects`, `.git/refs`) are strictly protected from accidental cleaning.

#### 📊 Interactive Storage Analyzer
- Dynamic filesystem tree traversal with categorized breakdown by MIME types and extensions.
- Breadcrumb navigation and visual capacity rings.
- Large and old file discovery with configurable size thresholds.

#### 🧹 Safe Cache & Junk Cleanup
- Conservative rule-based cleanup engine for user application caches, browser disposable caches, expired application logs, and system crash reports.
- Transparent risk ratings (Safe to Clean, Review Required, Protected) with human-readable rationales.

#### ♊ Advanced Duplicate Finder
- Efficient multi-tier duplicate detection: file size bucketing, partial BLAKE3 prefix/suffix hashing, and full-content BLAKE3 verification.
- Hard-link and symlink awareness preventing false positive duplicates.
- Smart auto-select algorithms preserving the newest or oldest file copy.

#### 📦 App Uninstaller & Remnant Cleaner
- Deep application remnant discovery across `~/Library/Application Support`, `~/Library/Caches`, `~/Library/Containers`, and `~/Library/Preferences`.
- Running process detection with graceful termination prompts before uninstallation.
- Apple system applications explicitly protected from uninstallation.

#### 🛠️ Developer & Docker Optimization
- Modular providers for Xcode DerivedData, Homebrew caches, Cargo registry, npm/pnpm/Yarn caches, Gradle, and user-selected `node_modules`.
- Native Docker engine integration via Unix domain socket (`/var/run/docker.sock`) for inspecting and pruning dangling images, stopped containers, build cache, and unused volumes.

#### ⚙️ Settings & Audit History
- Configurable scan scopes, custom exclusion lists, disk alert thresholds, and theme accents (Electric Violet, Hyper-Indigo, Cyan Pulse).
- Comprehensive audit log of every scan and cleanup action with JSON and CSV export capabilities.

#### 🖥️ Universal macOS Packaging & Distribution
- Universal 2 Mach-O fat binary combining native Apple Silicon (`arm64`) and Intel (`x86_64`) architectures via `lipo`.
- Self-contained, compressed `.dmg` disk images generated via Apple `hdiutil`.
- Ad-hoc codesigned bundles (`codesign -s -`) compatible with macOS Gatekeeper.
- Automated GitHub Actions release pipeline (`.github/workflows/release.yml`) with cryptographic `SHA256SUMS.txt` generation.
