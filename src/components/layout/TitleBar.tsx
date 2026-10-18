import React from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes } from "../../lib/utils";
import { isTauriEnvironment } from "../../lib/api";
import {
  Cpu,
  HardDrive,
  ShieldCheck,
  CircleNotch,
} from "@phosphor-icons/react";

export const TitleBar: React.FC = () => {
  const { systemSummary, isScanning } = useFluxStore();
  const primaryDisk = systemSummary?.primary_disk;

  return (
    <header className="h-11 w-full bg-[#080A12]/90 backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between px-4 select-none mac-titlebar-drag z-50">
      {/* Left traffic lights reserve spacing (standard macOS traffic lights sit around 72px) */}
      <div className="flex items-center space-x-3 pl-18 mac-titlebar-no-drag">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
            myclean
          </span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
            PRO
          </span>
        </div>
      </div>

      {/* Middle status indicator */}
      <div className="flex items-center space-x-2 text-xs text-slate-400 mac-titlebar-no-drag">
        {isScanning ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300">
            <CircleNotch size={13} className="animate-spin text-cyan-400" />
            <span className="text-[11px] font-medium font-mono">Rust Engine Scanning</span>
          </div>
        ) : !isTauriEnvironment() ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[11px] font-medium">UI Preview Mode • Native IPC on macOS</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ShieldCheck size={13} weight="fill" />
            <span className="text-[11px] font-medium">SIP Shield Active • Trash Safe</span>
          </div>
        )}
      </div>

      {/* Right system quick telemetry pill */}
      <div className="flex items-center space-x-3 text-xs text-slate-400 mac-titlebar-no-drag">
        {primaryDisk && (
          <div className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.05]">
            <HardDrive size={13} className="text-indigo-400" />
            <span className="text-[11px] text-slate-300 font-mono">
              {formatBytes(primaryDisk.available_bytes)} free
            </span>
          </div>
        )}
        {systemSummary && (
          <div className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.05]">
            <Cpu size={13} className="text-cyan-400" />
            <span className="text-[11px] text-slate-300">
              {systemSummary.architecture === "aarch64" ? "Apple Silicon" : "Intel"}
            </span>
          </div>
        )}
      </div>
    </header>
  );
};
