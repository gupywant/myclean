# AGENTS.md — myclean Engineering & Design Standards

## Application Identity
**myclean** is a high-performance, privacy-first macOS system cleaner and optimization studio with a Futuristic Premium interface. It combines ultra-fast Rust systems programming with a tactile, fluid desktop UI inspired by high-end macOS creative applications.

---

## Mandatory Technology Stack
- **Desktop Framework:** Tauri v2 (`@tauri-apps/cli`, `@tauri-apps/api`)
- **Core Engine (Systems):** Rust 2021 Edition
  - File traversal & parallel scanning: `rayon`, `walkdir`
  - macOS Trash & safe deletion: `trash` crate
  - Persistence & audit logs: `rusqlite` (bundled SQLite)
  - Fast hashing & duplicate detection: `blake3` / `crc32fast`
  - System metrics & disk statistics: `sysinfo`, `libc`
  - Serialization: `serde`, `serde_json`
  - Error management: `thiserror`, `anyhow`
- **Frontend Framework:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS v4
- **Animation:** Motion for React (`motion/react`)
- **Icons:** Phosphor Icons (`@phosphor-icons/react`) only — **NEVER use Lucide**
- **State Management:** Zustand with typed slices and reactive Tauri event listeners
- **Visualizations:** Recharts and custom handcrafted SVG gauges & radar rings
- **Packaging:** macOS `.app` bundle & `.dmg` for Apple Silicon (`aarch64`) and Intel (`x86_64`)

---

## Design System Principles (Futuristic Premium)
1. **Surfaces & Atmosphere:**
   - Deep navy / void black canvas: `#07080D` base, `#0D0F18` card surface, `#131726` elevated surface, `#1B2238` hover/active.
   - Frosted-glass sidebar: Translucent background with `backdrop-blur-xl`, subtle border highlights (`rgba(255, 255, 255, 0.07)`).
   - Accents: Electric violet (`#8B5CF6`), hyper-indigo (`#6366F1`), cyan pulse (`#06B6D4`), emerald safety indicator (`#10B981`), amber warning (`#F59E0B`), rose danger (`#F43F5E`).
   - Ambient glow: Subdued radial gradients, glowing badge pills, subtle backlights behind key metrics.

2. **Typography & Layout:**
   - Native macOS font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"`.
   - Monospace accents for hashes, file paths, byte sizes, and memory offsets: `"SF Mono", ui-monospace, Menlo`.
   - Generous whitespace, razor-sharp borders, no cluttered admin dashboards.
   - Custom macOS window titlebar with native traffic-light inset spacing.

3. **Motion & Tactility:**
   - Physics-based spring curves using `motion/react` (`type: "spring", stiffness: 350, damping: 30`).
   - Smooth layout transitions on category selection and detail panel expansions.
   - Live pulse rings and scanning radar animations during scan phases.

4. **Feedback & States:**
   - First-class treatment for: Loading/Scanning, Empty, Error, Confirmation, and Success states.
   - Audio-tactile visuals: animated counters, storage breakdown bars, disk health rings.

---

## Core Engineering Rules & Safety Invariants
1. **Real Functionality Only:** Every scan, classification, analysis, and cleaning command executes real, verified Rust code. No mock-only shells.
2. **Off UI Thread Execution:** All filesystem scans and hashing run on worker threads (via Rayon or background Tokio threads). The frontend receives real-time progress events (`scan:progress`, `scan:item_found`, `scan:complete`).
3. **Cancellability:** All long-running scan and clean loops check an `AtomicBool` cancellation token on every iteration to abort gracefully within milliseconds.
4. **Safety & Protected Paths Guardrail:**
   - **Hard Blacklist (Never scanned or deleted):**
     - macOS SIP directories: `/System`, `/usr`, `/bin`, `/sbin`, `/private/var`, `/Library/Apple`
     - User personal documents: `~/Documents`, `~/Desktop`, `~/Pictures`, `~/Music`, `~/Movies` (unless user explicitly targets a specific folder in duplicate finder)
     - Core system and identity stores: `~/Library/Keychains`, `~/Library/Mail`, `~/Library/Accounts`, `~/Library/IdentityServices`, `~/Library/Messages`
     - Active Git repositories (`.git/objects`, `.git/refs`)
   - **Symlink Protection:** Always resolve symlinks; NEVER follow symlinks that point outside the scanned directory, and NEVER delete the target of a symlink when unlinking.
5. **Recoverable Deletion by Default:**
   - Always default to sending files to the macOS Trash via the native `trash` crate.
   - Permanent deletion (`std::fs::remove_*`) is strictly gated behind an explicit double-confirmation setting.
   - Always verify path existence and permissions before attempting deletion.
6. **Local Persistence & Privacy:**
   - Zero telemetry, zero external network calls.
   - SQLite database stored securely in `~/Library/Application Support/com.myclean.app/myclean.db` (with automatic migration from legacy com.fluxcleaner.app).
   - Comprehensive audit log of every scan and clean action (freed bytes, timestamp, item count, dry-run flag).
   - User whitelist/ignore-list stored in SQLite.

---

## Workflow for Every Phase
1. **Inspect:** Check existing codebase, dependencies, and configuration.
2. **Plan:** Present a concise, clear implementation plan.
3. **Implement:** Write complete, modular, idiomatic code for the current phase.
4. **Validate:** Execute validation commands (`cargo check`, `cargo test`, `npm run build`, `tsc --noEmit`).
5. **Fix:** Eliminate any compiler warnings, type errors, or test failures.
6. **Report:** Summarize changed files, added functionality, test results, and next steps.
7. **Status:** Update `PROJECT_STATUS.md` with checked items.
8. **Pause:** Stop and await user instruction for the next phase.
