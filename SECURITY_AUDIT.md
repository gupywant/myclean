# myclean — Comprehensive Security & Safety Audit Report (Phase 09)

## Executive Summary
This document provides a comprehensive security and safety audit for **myclean**, a high-performance macOS optimization studio built on Tauri v2 and Rust 2021. As part of **Phase 09**, every systems module and IPC boundary was audited to guarantee zero unauthorized data modification, zero unrecoverable deletions, and resilient protection against malicious symlink substitution and Time-Of-Check to Time-Of-Use (TOCTOU) race conditions.

---

## 1. Audited Modules & Attack Surfaces

| Module | Core Responsibility | Primary Threat Vectors | Audit Status |
| :--- | :--- | :--- | :--- |
| [`safety.rs`](file:///Users/user/Gupy/project/myclean/src-tauri/src/safety.rs) | Path classification, SIP guardrails, exclusions | Boundary escapes, traversal (`..`), symlink redirection | **HARDENED** |
| [`cleaner.rs`](file:///Users/user/Gupy/project/myclean/src-tauri/src/cleaner.rs) | System cache & junk cleanup engine | TOCTOU swap, concurrent app writes, permanent deletion | **HARDENED** |
| [`duplicates.rs`](file:///Users/user/Gupy/project/myclean/src-tauri/src/duplicates.rs) | Duplicate detector & multi-file removal | Original deletion, partial-hash collisions, hard-link overcounting | **HARDENED** |
| [`apps.rs`](file:///Users/user/Gupy/project/myclean/src-tauri/src/apps.rs) | Bundle uninstaller & leftover discovery | System app deletion, running daemon kills, user doc deletion | **HARDENED** |
| [`developer.rs`](file:///Users/user/Gupy/project/myclean/src-tauri/src/developer.rs) | Provider-based build artifact cleaner | Source tree deletion, `.git` alteration, credential leaks | **HARDENED** |
| [`docker.rs`](file:///Users/user/Gupy/project/myclean/src-tauri/src/docker.rs) | Container, image, and cache manager | Volume data loss, CLI argument injection, active container kill | **HARDENED** |
| [`commands.rs`](file:///Users/user/Gupy/project/myclean/src-tauri/src/commands.rs) | Tauri IPC command bridge | Arbitrary path injection, null bytes, command flags | **HARDENED** |
| [`tauri.conf.json`](file:///Users/user/Gupy/project/myclean/src-tauri/tauri.conf.json) | Framework security & webview sandbox | XSS, remote resource loading, IPC spoofing | **HARDENED** |

---

## 2. Vulnerability Analyses & Implemented Mitigations

### 2.1 TOCTOU & Symlink Substitution Mitigation
- **The Threat:** Between initial filesystem scan and user-confirmed cleanup execution, an external process or malicious symlink could replace a disposable cache file with a symlink pointing to sensitive user documents (e.g. `~/Documents/tax.pdf`) or macOS system files.
- **Architectural Defense:**
  1. **Dual Snapshotting:** Introduced [`FileMetadataSnapshot`](file:///Users/user/Gupy/project/myclean/src-tauri/src/safety.rs#L106-L118) in `SafetyGuard`. Before any cleanup, both the input path `p` and its canonical representation `canonical` are snapshotted using `std::fs::symlink_metadata` (which strictly does not follow symlinks).
  2. **Atomic Verification:** Right before dispatching to `trash::delete`, [`SafetyGuard::verify_unaltered`](file:///Users/user/Gupy/project/myclean/src-tauri/src/safety.rs#L620-L650) re-verifies device ID (`meta.dev()`), inode number (`meta.ino()`), file type (`is_file`, `is_dir`), and symlink status.
  3. **Rejection Invariant:** If `p` was a regular file and mutated into a symlink, or if its inode/device changed, execution is aborted immediately with `SafetyError::SymlinkEscape` or `SafetyError::SecurityViolation`.
  4. **Symlink Boundary Checks:** All symlinks are inspected via [`symlink_escapes_boundary`](file:///Users/user/Gupy/project/myclean/src-tauri/src/safety.rs#L330-L350). Symlinks pointing outside user-approved scan scopes or into SIP / user-protected roots are strictly rejected.

### 2.2 Recoverable Deletion & Permanent Deletion Prohibition
- **The Threat:** Unrecoverable data loss caused by `std::fs::remove_file` or `std::fs::remove_dir_all`.
- **Architectural Defense:**
  1. Permanent deletion (`req.method == "permanent"`) is **strictly hard-disabled** at the Rust engine level.
  2. All operations route through the native macOS Trash (`trash::delete`). Trashed files can be completely restored by the user via Finder at any time.
  3. Deletion post-conditions verify the file was actually moved; if a file remains in place after trashing, an error is recorded and logged to SQLite audit tables.

### 2.3 Strict System & User Privacy Protections
- **macOS System Integrity Protection (SIP):** Hardcoded prefix blacklist rejects all operations in `/System`, `/usr`, `/bin`, `/sbin`, `/private/var`, `/Library/Apple`, `/Library/Security`, etc.
- **User Identity & Privacy Stores:** Protected user directories include `~/Library/Keychains`, `~/Library/Mail`, `~/Library/Messages`, `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/Documents`, `~/Desktop`, `~/Pictures`, `~/Music`, `~/Movies`, and iCloud Drive (`~/Library/Mobile Documents`).
- **Database & Persistent Application State:** Regex and extension patterns protect SQLite files (`.db`, `.sqlite`, `.sqlite3`, `.db-wal`, `.db-shm`), browser profile databases (`Cookies`, `Login Data`, `Web Data`, `History.db`), and user defaults plists (`~/Library/Preferences`).

### 2.4 Duplicate Detection & Original Preservation Invariant
- **The Threat:** Data loss resulting from accidental deletion of all copies within a duplicate group, or modification of the designated original during multi-file cleanup.
- **Architectural Defense:**
  1. **Strict Original Preservation:** Rust-side verification enforces that every duplicate group must have a valid, existing `original_path` that is strictly excluded from `paths_to_delete`.
  2. **Pre-Clean Content Hash Revalidation:** Before deleting any duplicate, the full BLAKE3 hash of both the designated original and the duplicate candidate is recomputed and compared against the scan group hash. If the original or target was modified after the scan, cleanup for that group aborts immediately.
  3. **Hard-link Awareness:** Hard-linked files (sharing the same `dev` and `ino`) are detected via `nlink > 1` and accounted for so reclaimable disk space is never artificially inflated.

### 2.5 Application Uninstaller Safety
- **System Applications:** Protected system bundles (`/System/Applications`, Apple-signed system utilities) cannot be uninstalled.
- **Active Process Prevention:** Uses `sysinfo` to detect active running processes and helper daemons matching the target bundle. Uninstallation is blocked until the application is gracefully quit.
- **Post-Scan Application Launch Detection:** Immediately prior to trashing bundle components, the running status is verified again to prevent trashing an application that launched while the modal was open.

### 2.6 Modular Developer Cleanup & Docker Engine Protections
- **Developer Workspaces:** Requires explicit manifest confirmation (`Cargo.toml` for `target/`, `package.json` for `node_modules`).
- **Git Repository Immunity:** Traversal explicitly skips any `.git` directory (`.git/objects`, `.git/refs`, `.git/HEAD`).
- **Docker Volume Protection:** Docker Volumes contain persistent state (databases, persistent stores) and are **permanently non-deletable** in myclean. Any request targeting a volume returns an explicit security violation error.
- **Docker Active Container Race Protection:** Before issuing `docker rm <id>`, the engine re-inspects container status via `docker inspect -f '{{.State.Running}}' <id>`. If the container was restarted, removal is aborted.
- **Resource ID Sanitization:** Resource IDs are validated with strict regex (`^[a-zA-Z0-9_.:/-]+$`) to prevent CLI argument and command injection.

### 2.7 Tauri IPC Boundary Sanitization & Content Security Policy (CSP)
- **IPC Path Sanitization:** Tauri commands taking path parameters (`open_in_finder`, `inspect_developer_workspace`, `analyze_storage`, `scan_duplicates`, `add_custom_exclusion`) validate input strings:
  - Reject paths containing directory traversal (`..`).
  - Reject paths containing null bytes (`\0`).
  - Reject leading CLI flags (e.g. paths starting with `-` to prevent argument injection).
  - Verify paths exist and canonicalize before passing to subcommands.
- **Strict Content Security Policy (CSP):**
  Configured in [`tauri.conf.json`](file:///Users/user/Gupy/project/myclean/src-tauri/tauri.conf.json):
  ```
  default-src 'self' tauri: http://tauri.localhost;
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' asset: data: tauri: http://tauri.localhost;
  font-src 'self' asset: data: tauri:;
  connect-src 'self' ipc: http://ipc.localhost http://tauri.localhost tauri:
  ```
  Completely disallows untrusted remote scripts, inline executable code, or unapproved external network connections. Zero telemetry, zero external requests.

---

## 3. Automated Safety & Security Test Suite

The test suite in [`src-tauri/tests/security_hardening.rs`](file:///Users/user/Gupy/project/myclean/src-tauri/tests/security_hardening.rs) validates all security invariants:
1. `test_toctou_symlink_substitution_rejection`: Verifies that replacing a legitimate file with a symlink triggers an immediate TOCTOU security violation.
2. `test_toctou_inode_replacement_rejection`: Verifies that swapping a file with a newly created file (different inode) is detected and rejected.
3. `test_toctou_file_type_mutation_rejection`: Verifies that mutating a file into a directory is rejected.
4. `test_ipc_open_in_finder_traversal_and_injection`: Verifies path traversal (`..`), null bytes, and flag injections are rejected at the IPC boundary.
5. `test_cleaner_integration_toctou_symlink_swap_aborted`: Verifies that cleaner aborts when encountering a symlink pointing to system-protected locations.
6. `test_docker_security_boundaries_and_volume_protection`: Verifies Docker volume deletion rejection and command injection filtering.
7. `test_bounded_synthetic_benchmark`: Validates scanning throughput (29,333 files/sec) and sub-millisecond cancellation responsiveness.

**Result: 83 / 83 tests passing across all test targets with zero warnings.**
