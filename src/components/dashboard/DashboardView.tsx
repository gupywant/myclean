import React from "react";
import { useCleanStore } from "../../store/useCleanStore";
import { formatBytes } from "../../lib/utils";
import { SmartScanCenter } from "./SmartScanCenter";
import { ScanCategoryPanel } from "./ScanCategoryPanel";
import { LiveDiscoveryFeed } from "./LiveDiscoveryFeed";
import {
  HardDrive,
  Cpu,
  CheckCircle,
  ShieldCheck,
} from "@phosphor-icons/react";

export const DashboardView: React.FC = () => {
  const { systemSummary, cleanupHistory } = useCleanStore();

  const primaryDisk = systemSummary?.primary_disk;
  const memory = systemSummary?.memory;
  const totalLifetimeFreed = cleanupHistory.reduce((acc, c) => acc + c.bytes_freed, 0);

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      {/* 1. CleanMyMac-Inspired Smart Scan Centerpiece */}
      <SmartScanCenter />

      {/* 2. Category-by-Category Progress & State Panel */}
      <ScanCategoryPanel />

      {/* 3. Live Discovery Feed (Real-Time Filesystem Telemetry Stream) */}
      <LiveDiscoveryFeed />

      {/* 4. Safety Guardrail & Privacy Policy Indicator */}
      <div className="p-4 rounded-xl bg-[#0B0E1A] border border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-6 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300 font-medium">Safe to Clean:</span>
            <span className="text-slate-500">System Caches, Logs, Trash</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-slate-300 font-medium">Review Required:</span>
            <span className="text-slate-500">Docker Clutter, Large Files &gt;100MB</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span className="text-slate-300 font-medium">Always Protected:</span>
            <span className="text-slate-500">SIP, User Documents, Active Apps</span>
          </div>
        </div>

        {totalLifetimeFreed > 0 && (
          <div className="text-xs text-slate-400 font-mono">
            Lifetime Reclaimed:{" "}
            <strong className="text-cyan-400 font-semibold">
              {formatBytes(totalLifetimeFreed)}
            </strong>
          </div>
        )}
      </div>

      {/* 5. Real-Time Hardware Telemetry Cards */}
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
            <p className="text-[11px] text-slate-500 font-mono">
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
            <p className="text-[11px] text-slate-500 font-mono">
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

        {/* Apple Silicon Engine & Platform */}
        <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Silicon Engine</span>
            <ShieldCheck size={16} className="text-violet-400" />
          </div>
          <div>
            <div className="text-base font-bold text-white truncate">
              {systemSummary?.cpu_brand ?? "Apple Silicon"}
            </div>
            <p className="text-[11px] text-slate-500 font-mono">
              {systemSummary?.os_name} {systemSummary?.os_version} ({systemSummary?.architecture})
            </p>
          </div>
          <div className="flex items-center space-x-2 pt-1 text-[11px] text-emerald-400 font-mono">
            <CheckCircle size={14} weight="fill" />
            <span>macOS Trash Recovery Guaranteed</span>
          </div>
        </div>
      </div>
    </div>
  );
};
