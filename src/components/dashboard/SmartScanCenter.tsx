import React, { useMemo } from "react";
import { useCleanStore } from "../../store/useCleanStore";
import { formatBytes } from "../../lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
  Sparkle,
  ArrowsClockwise,
  CheckCircle,
  WarningCircle,
  StopCircle,
  Lightning,
} from "@phosphor-icons/react";

export const SmartScanCenter: React.FC = () => {
  const {
    isScanning,
    scanProgress,
    scanResult,
    wasScanCancelled,
    startScan,
    cancelScan,
    setActiveTab,
    selectedItemIds,
  } = useCleanStore();

  const shouldReduceMotion = useReducedMotion();

  // Progress metrics
  const overallProgress = scanProgress?.overall_progress ?? (scanResult ? 100 : 0);
  const clampedProgress = Math.min(100, Math.max(0, overallProgress));

  // Circle dimensions
  const radius = 95;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  // Elapsed time formatting
  const elapsedFormatted = useMemo(() => {
    const ms = scanProgress?.elapsed_ms ?? (scanResult ? scanResult.duration_ms : 0);
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, [scanProgress?.elapsed_ms, scanResult?.duration_ms]);

  const totalScannedBytes = scanResult?.total_bytes ?? 0;
  const totalScannedItems = scanResult?.total_items ?? 0;

  // Selected bytes for cleanup
  const selectedBytes = useMemo(() => {
    if (!scanResult) return 0;
    return scanResult.items
      .filter((item) => selectedItemIds.has(item.id))
      .reduce((acc, curr) => acc + curr.size_bytes, 0);
  }, [scanResult, selectedItemIds]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#111524] to-[#0A0D17] border border-white/[0.08] p-8 shadow-2xl">
      {/* Ambient background glow accents */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center space-y-6">
        {/* Animated Circular Progress Gauge & Radar Sweep */}
        <div className="relative w-56 h-56 flex items-center justify-center">
          {/* Subtle Outer Boundary Ring */}
          <div className="absolute inset-0 rounded-full border border-indigo-500/15" />
          <div className="absolute inset-3 rounded-full border border-white/[0.04]" />

          {/* SVG Circular Progress Track and Fill */}
          <svg className="w-56 h-56 -rotate-90 transform" viewBox="0 0 220 220">
            <defs>
              <linearGradient id="scanGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06B6D4" />
                <stop offset="50%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>

            {/* Background Track Circle */}
            <circle
              cx="110"
              cy="110"
              r={radius}
              stroke="rgba(255, 255, 255, 0.06)"
              strokeWidth="9"
              fill="transparent"
            />

            {/* Active Progress Circle */}
            <circle
              cx="110"
              cy="110"
              r={radius}
              stroke="url(#scanGradient)"
              strokeWidth="9"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-[stroke-dashoffset] duration-300 ease-out"
            />
          </svg>

          {/* Rotating Sweep Radar Beam (active while scanning) */}
          {isScanning && !shouldReduceMotion && (
            <motion.div
              className="absolute inset-4 rounded-full pointer-events-none"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg 270deg, rgba(6, 182, 212, 0.35) 360deg)",
              }}
            />
          )}

          {/* Central Glass Disc & Status Content */}
          <div className="absolute w-36 h-36 rounded-full bg-[#0D101C] border border-white/10 flex flex-col items-center justify-center shadow-inner shadow-black/80 p-3 select-none">
            {isScanning ? (
              <div className="flex flex-col items-center justify-center space-y-1">
                <span className="text-3xl font-bold font-mono text-white tracking-tight">
                  {Math.round(clampedProgress)}%
                </span>
                <span className="text-[10px] font-mono text-cyan-400 font-medium">
                  {elapsedFormatted}
                </span>
                <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-cyan-300">
                    Live
                  </span>
                </div>
              </div>
            ) : wasScanCancelled ? (
              <div className="flex flex-col items-center justify-center space-y-1 text-center">
                <WarningCircle size={28} className="text-amber-400" weight="fill" />
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Cancelled
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {formatBytes(totalScannedBytes, 0)}
                </span>
              </div>
            ) : scanResult ? (
              <div className="flex flex-col items-center justify-center space-y-1 text-center">
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                  <CheckCircle size={18} weight="fill" />
                </div>
                <span className="text-lg font-bold font-mono text-white tracking-tight">
                  {formatBytes(totalScannedBytes, 1)}
                </span>
                <span className="text-[9px] uppercase tracking-wider font-semibold text-emerald-400 font-mono">
                  Recoverable
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-1">
                <img
                  src="/logo.png"
                  alt="myclean logo"
                  className="w-12 h-12 object-contain drop-shadow-[0_0_16px_rgba(139,92,246,0.55)]"
                />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 font-mono">
                  Ready
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Headings & Context Details */}
        <div className="space-y-1.5 max-w-xl">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isScanning ? (
              <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-violet-400 bg-clip-text text-transparent">
                Scanning {scanProgress?.current_category || "System Trees"}...
              </span>
            ) : wasScanCancelled ? (
              "Smart Scan Stopped Early"
            ) : scanResult ? (
              `${formatBytes(totalScannedBytes)} Estimated Recoverable Space`
            ) : (
              "myclean Smart System Optimization"
            )}
          </h1>

          <p className="text-xs text-slate-400 leading-relaxed font-mono truncate max-w-lg mx-auto">
            {isScanning ? (
              scanProgress?.current_path || "Analyzing directory trees and files..."
            ) : wasScanCancelled ? (
              `Scan was halted by user. Found ${totalScannedItems} items (${formatBytes(totalScannedBytes)}) before cancellation.`
            ) : scanResult ? (
              `Discovered ${totalScannedItems} items across caches, developer artifacts, logs, and trash.`
            ) : (
              "Inspect system caches, developer build artifacts, Docker clutter, and trash safely with zero data loss risk."
            )}
          </p>

          {/* Live Inspected Files Counter Row during scanning */}
          {isScanning && scanProgress && (
            <div className="flex items-center justify-center space-x-4 pt-1 text-[11px] font-mono text-slate-400">
              <div>
                Files Inspected:{" "}
                <strong className="text-slate-200">
                  {scanProgress.files_inspected.toLocaleString()}
                </strong>
              </div>
              <span className="text-white/20">•</span>
              <div>
                Analyzed:{" "}
                <strong className="text-slate-200">
                  {formatBytes(scanProgress.bytes_analyzed)}
                </strong>
              </div>
              <span className="text-white/20">•</span>
              <div>
                Found:{" "}
                <strong className="text-cyan-400">
                  {formatBytes(scanProgress.bytes_found)}
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button Bar */}
        <div className="flex items-center space-x-3 pt-1">
          {isScanning ? (
            <motion.button
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
              onClick={cancelScan}
              className="px-6 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold tracking-wide transition-all duration-150 flex items-center space-x-2 shadow-lg shadow-rose-500/10"
            >
              <StopCircle size={16} weight="bold" />
              <span>Abort Scan</span>
            </motion.button>
          ) : scanResult && !wasScanCancelled ? (
            <>
              <motion.button
                whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
                onClick={() => setActiveTab("deep-clean")}
                className="px-7 py-3 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white text-xs font-semibold tracking-wide shadow-lg shadow-indigo-500/30 transition-all duration-150 flex items-center space-x-2.5"
              >
                <Lightning size={16} weight="fill" />
                <span>Review Cleanup ({formatBytes(selectedBytes > 0 ? selectedBytes : totalScannedBytes)})</span>
              </motion.button>

              <button
                onClick={startScan}
                className="px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 text-xs font-medium transition-all duration-150 flex items-center space-x-1.5"
              >
                <ArrowsClockwise size={15} />
                <span>Rescan</span>
              </button>
            </>
          ) : (
            <motion.button
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
              onClick={startScan}
              className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white text-xs font-semibold tracking-wide shadow-lg shadow-indigo-500/30 transition-all duration-150 flex items-center space-x-2.5"
            >
              <Sparkle size={16} weight="fill" />
              <span>{wasScanCancelled ? "Restart Smart Analysis" : "Start Smart Analysis"}</span>
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};
