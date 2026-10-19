import React from "react";
import { useCleanStore } from "../../store/useCleanStore";
import { formatBytes } from "../../lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
  Sparkle,
  CircleNotch,
  HardDrive,
  Cpu,
  Lightning,
  ArrowsClockwise,
  CheckCircle,
  Broom,
  Code,
  Globe,
  Trash,
  ShieldCheck,
} from "@phosphor-icons/react";

export const DashboardView: React.FC = () => {
  const {
    systemSummary,
    isScanning,
    scanProgress,
    scanResult,
    cleanupHistory,
    startScan,
    cancelScan,
    openConfirmModal,
    setActiveTab,
    selectedItemIds,
  } = useCleanStore();

  const shouldReduceMotion = useReducedMotion();
  const primaryDisk = systemSummary?.primary_disk;
  const memory = systemSummary?.memory;

  const totalScannedBytes = scanResult?.total_bytes ?? 0;
  const totalScannedItems = scanResult?.total_items ?? 0;
  const totalLifetimeFreed = cleanupHistory.reduce((acc, c) => acc + c.bytes_freed, 0);

  // Selected bytes for cleanup
  const selectedBytes = scanResult
    ? scanResult.items
        .filter((item) => selectedItemIds.has(item.id))
        .reduce((acc, curr) => acc + curr.size_bytes, 0)
    : 0;

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8">
      {/* Hero Atmosphere & Radar */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#111524] to-[#0A0D17] border border-white/[0.08] p-8 shadow-2xl">
        {/* Ambient background glow circles */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          {/* Animated Radar Pulse Core */}
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* Concentric rings */}
            <div className="absolute inset-0 rounded-full border border-indigo-500/15" />
            <div className="absolute inset-4 rounded-full border border-indigo-500/20" />
            <div className="absolute inset-8 rounded-full border border-cyan-500/25" />
            <div
              className={`absolute inset-0 rounded-full border border-cyan-400/30 transition-opacity ${
                isScanning && !shouldReduceMotion ? "animate-pulse-ring" : "opacity-30"
              }`}
            />

            {/* Sweep radar beam if scanning (stops when idle or reduced motion) */}
            {isScanning && !shouldReduceMotion && (
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
                style={{
                  background:
                    "conic-gradient(from 0deg, transparent 0deg 270deg, rgba(6, 182, 212, 0.45) 360deg)",
                }}
              />
            )}

            {/* Center Disc with Icon & Stats */}
            <div className="relative w-28 h-28 rounded-full bg-[#0E1220] border border-white/10 flex flex-col items-center justify-center shadow-inner shadow-black/60">
              {isScanning ? (
                <CircleNotch size={32} className="animate-spin text-cyan-400" />
              ) : totalScannedBytes > 0 ? (
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-widest block font-mono">
                    Estimated
                  </span>
                  <span className="text-lg font-bold text-white font-mono">
                    {formatBytes(totalScannedBytes, 0)}
                  </span>
                </div>
              ) : (
                <img src="/logo.png" alt="myclean logo" className="w-11 h-11 object-contain drop-shadow-[0_0_14px_rgba(139,92,246,0.5)]" />
              )}
            </div>
          </div>

          {/* Heading & Subtitle */}
          <div className="space-y-1.5 max-w-lg">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {isScanning
                ? "Deep System Scanning Active..."
                : totalScannedBytes > 0
                ? `${formatBytes(totalScannedBytes)} Estimated Recoverable Space`
                : "myclean System Optimization & Safety Shield"}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isScanning
                ? scanProgress?.current_path || "Analyzing directory trees..."
                : totalScannedBytes > 0
                ? `Discovered ${totalScannedItems} items across caches, developer artifacts, logs, and trash.`
                : "Inspect system caches, developer build artifacts, hidden duplicates, and leftover data with zero data loss risk."}
            </p>
          </div>

          {/* Action Button Row */}
          <div className="flex items-center space-x-3">
            {isScanning ? (
              <button
                onClick={cancelScan}
                className="px-5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold tracking-wide transition-all duration-150 flex items-center space-x-2"
              >
                <span>Abort Scan</span>
              </button>
            ) : totalScannedBytes > 0 ? (
              <>
                <motion.button
                  whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
                  whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
                  onClick={openConfirmModal}
                  disabled={selectedBytes === 0}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white text-xs font-semibold tracking-wide shadow-lg shadow-indigo-500/25 transition-all duration-150 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Lightning size={16} weight="fill" />
                  <span>Clean {formatBytes(selectedBytes)} Selected</span>
                </motion.button>
                <button
                  onClick={startScan}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 text-xs font-medium transition-all duration-150 flex items-center space-x-1.5"
                >
                  <ArrowsClockwise size={14} />
                  <span>Rescan</span>
                </button>
              </>
            ) : (
              <motion.button
                whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
                onClick={startScan}
                className="px-7 py-3 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white text-xs font-semibold tracking-wide shadow-lg shadow-indigo-500/30 transition-all duration-150 flex items-center space-x-2.5"
              >
                <Sparkle size={16} weight="fill" />
                <span>Start Smart Analysis</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Safety Classification & Scope Status */}
      <div className="p-4 rounded-xl bg-[#0B0E1A] border border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-6 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300 font-medium">Safe to Clean:</span>
            <span className="text-slate-500">Caches, Logs, Trash</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-slate-300 font-medium">Review Required:</span>
            <span className="text-slate-500">Large files &gt;100MB</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span className="text-slate-300 font-medium">Always Protected:</span>
            <span className="text-slate-500">SIP, Documents, Active Apps</span>
          </div>
        </div>

        {totalLifetimeFreed > 0 && (
          <div className="text-xs text-slate-400 font-mono">
            Lifetime Reclaimed: <strong className="text-cyan-400 font-semibold">{formatBytes(totalLifetimeFreed)}</strong>
          </div>
        )}
      </div>

      {/* Real-Time Hardware Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Primary Storage */}
        <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Primary Storage</span>
            <HardDrive size={16} className="text-indigo-400" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-white">
              {primaryDisk ? formatBytes(primaryDisk.available_bytes) : "--"}
            </div>
            <p className="text-[11px] text-slate-500">
              Free of {primaryDisk ? formatBytes(primaryDisk.total_bytes) : "--"}
            </p>
          </div>
          <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${primaryDisk?.usage_percentage ?? 50}%` }}
            />
          </div>
        </div>

        {/* Unified Memory */}
        <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Unified Memory (RAM)</span>
            <Cpu size={16} className="text-cyan-400" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-white">
              {memory ? formatBytes(memory.used_bytes) : "--"}
            </div>
            <p className="text-[11px] text-slate-500">
              Used of {memory ? formatBytes(memory.total_bytes) : "--"} ({memory?.usage_percentage}%)
            </p>
          </div>
          <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full transition-all duration-500"
              style={{ width: `${memory?.usage_percentage ?? 40}%` }}
            />
          </div>
        </div>

        {/* Chip & macOS Platform */}
        <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Silicon Engine</span>
            <ShieldCheck size={16} className="text-violet-400" />
          </div>
          <div>
            <div className="text-base font-bold text-white truncate">
              {systemSummary?.cpu_brand ?? "Apple Silicon"}
            </div>
            <p className="text-[11px] text-slate-500">
              {systemSummary?.os_name} {systemSummary?.os_version} ({systemSummary?.architecture})
            </p>
          </div>
          <div className="flex items-center space-x-2 pt-1 text-[11px] text-emerald-400">
            <CheckCircle size={14} weight="fill" />
            <span>macOS Trash Recovery Guaranteed</span>
          </div>
        </div>
      </div>

      {/* Category Quick Preview Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Reclamation Categories
          </h2>
          <button
            onClick={() => setActiveTab("deep-clean")}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
          >
            Explore All Categories &rarr;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <motion.div
            whileHover={shouldReduceMotion ? {} : { y: -2 }}
            onClick={() => setActiveTab("deep-clean")}
            className="p-4 rounded-xl bg-[#0D101C] hover:bg-[#121626] border border-white/[0.06] cursor-pointer transition-all duration-150 space-y-2 group"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
              <Broom size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">System Caches</div>
              <p className="text-[11px] text-slate-500">App caches & user temp files</p>
            </div>
          </motion.div>

          <motion.div
            whileHover={shouldReduceMotion ? {} : { y: -2 }}
            onClick={() => setActiveTab("developer")}
            className="p-4 rounded-xl bg-[#0D101C] hover:bg-[#121626] border border-white/[0.06] cursor-pointer transition-all duration-150 space-y-2 group"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
              <Code size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">Developer Space</div>
              <p className="text-[11px] text-slate-500">Xcode DerivedData & Homebrew</p>
            </div>
          </motion.div>

          <motion.div
            whileHover={shouldReduceMotion ? {} : { y: -2 }}
            onClick={() => setActiveTab("deep-clean")}
            className="p-4 rounded-xl bg-[#0D101C] hover:bg-[#121626] border border-white/[0.06] cursor-pointer transition-all duration-150 space-y-2 group"
          >
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform">
              <Globe size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">Browser Caches</div>
              <p className="text-[11px] text-slate-500">Chrome, Safari & Brave caches</p>
            </div>
          </motion.div>

          <motion.div
            whileHover={shouldReduceMotion ? {} : { y: -2 }}
            onClick={() => setActiveTab("deep-clean")}
            className="p-4 rounded-xl bg-[#0D101C] hover:bg-[#121626] border border-white/[0.06] cursor-pointer transition-all duration-150 space-y-2 group"
          >
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
              <Trash size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">macOS Trash Bin</div>
              <p className="text-[11px] text-slate-500">Pending discarded files</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
