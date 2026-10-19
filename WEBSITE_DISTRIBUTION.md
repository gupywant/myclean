# Website Distribution & Download Integration Guide — myclean

This guide provides instructions and frontend components for hosting and integrating **myclean** download links on your official website or documentation portal.

---

## 1. Direct Release Download Endpoints

When publishing releases to GitHub, asset links follow a standard CDN pattern. Use the URLs below for your website download buttons:

### Latest Version Links
| Platform / Target | Download URL | Recommended Button Copy |
| :--- | :--- | :--- |
| **Universal macOS** *(Recommended)* | `https://github.com/myclean-app/myclean/releases/latest/download/myclean-1.0.0-universal.dmg` | **Download for macOS (Universal)**<br><small>Apple Silicon & Intel • macOS 11+</small> |
| **Apple Silicon (M1/M2/M3/M4)** | `https://github.com/myclean-app/myclean/releases/latest/download/myclean-1.0.0-aarch64.dmg` | **Apple Silicon (arm64)** |
| **Intel Mac (64-bit)** | `https://github.com/myclean-app/myclean/releases/latest/download/myclean-1.0.0-x86_64.dmg` | **Intel Mac (x86_64)** |
| **Integrity Checksums** | `https://github.com/myclean-app/myclean/releases/latest/download/SHA256SUMS.txt` | View SHA-256 Checksums |

---

## 2. Recommended Website UI Component (React + Tailwind)

Below is a production-ready React component formatted to match the Futuristic Premium design system of myclean:

```tsx
import React, { useState } from 'react';

export function DownloadSection() {
  const [showGatekeeperHelp, setShowGatekeeperHelp] = useState(false);

  return (
    <section className="py-20 px-6 max-w-5xl mx-auto text-center">
      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-mono mb-6">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        v1.0.0 Universal macOS Release
      </div>

      {/* Heading */}
      <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
        Clean your Mac at the speed of Rust.
      </h2>
      <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
        Free, open-source, and 100% offline. Zero telemetry, zero bloat, and recoverable Trash-only deletion.
      </p>

      {/* Main Download CTA */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
        <a
          href="https://github.com/myclean-app/myclean/releases/latest/download/myclean-1.0.0-universal.dmg"
          className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-lg shadow-lg shadow-violet-500/25 transition-all flex items-center justify-center gap-3"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.78 1.06-1.87.94-2.97-1 .04-2.18.67-2.88 1.49-.6.7-1.13 1.82-1 2.9 1.12.09 2.31-.64 2.94-1.42z" />
          </svg>
          Download for macOS (Universal)
        </a>
      </div>

      {/* Alternative Architectures */}
      <div className="flex items-center justify-center gap-6 text-sm text-slate-400 mb-8">
        <span>Also available for:</span>
        <a
          href="https://github.com/myclean-app/myclean/releases/latest/download/myclean-1.0.0-aarch64.dmg"
          className="text-violet-400 hover:underline"
        >
          Apple Silicon Only (.dmg)
        </a>
        <span className="text-slate-600">•</span>
        <a
          href="https://github.com/myclean-app/myclean/releases/latest/download/myclean-1.0.0-x86_64.dmg"
          className="text-violet-400 hover:underline"
        >
          Intel Only (.dmg)
        </a>
        <span className="text-slate-600">•</span>
        <a
          href="https://github.com/myclean-app/myclean/releases/latest/download/SHA256SUMS.txt"
          className="text-slate-400 hover:text-white"
        >
          SHA-256 Hashes
        </a>
      </div>

      {/* Gatekeeper Explainer Trigger */}
      <button
        type="button"
        onClick={() => setShowGatekeeperHelp(!showGatekeeperHelp)}
        className="text-xs text-slate-400 hover:text-slate-300 underline cursor-pointer"
      >
        First time opening myclean on macOS Sequoia, Sonoma or Ventura? Click here for the 10-second setup.
      </button>

      {/* Gatekeeper Helper Card */}
      {showGatekeeperHelp && (
        <div className="mt-6 p-6 rounded-2xl bg-[#0D0F18] border border-white/10 text-left max-w-xl mx-auto text-sm text-slate-300 space-y-3">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <span>🛡️</span> macOS First Launch Instructions
          </h4>
          <p className="text-xs text-slate-400">
            myclean is distributed independently without a paid Apple Developer subscription. When opening for the first time:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-xs">
            <li>Drag <strong>myclean.app</strong> into your Applications folder.</li>
            <li>In Finder, <strong>Right-click</strong> (Control-click) <code className="bg-white/10 px-1 py-0.5 rounded">myclean.app</code> and select <strong>Open</strong>.</li>
            <li>Click <strong>Open</strong> in the confirmation box.</li>
            <li><em>Alternatively:</em> Open <strong>System Settings &gt; Privacy &amp; Security</strong> and click <strong>Open Anyway</strong>.</li>
          </ol>
        </div>
      )}
    </section>
  );
}
```

---

## 3. SEO & Web Metadata Recommendations

When marketing myclean on your domain, include structured metadata for discovery and clarity:

```html
<title>myclean — High-Performance, Privacy-First macOS Cleaner</title>
<meta name="description" content="Free, open-source macOS cleaner written in Rust and React. Native Universal binaries for Apple Silicon and Intel. Zero telemetry, 100% offline.">
<meta name="keywords" content="macOS cleaner, mac cleaner, open source mac cleaner, rust mac cleaner, storage analyzer mac, duplicate finder mac">
```
