import React from "react";
import { useCleanStore } from "../../store/useCleanStore";
import { formatBytes } from "../../lib/utils";
import {
  Terminal,
  ShieldCheck,
  ShieldWarning,
  HardDrive,
  MagnifyingGlass,
} from "@phosphor-icons/react";

export const LiveDiscoveryFeed: React.FC = () => {
  const { discoveryFeed, scanProgress, isScanning, wasScanCancelled, scanResult } = useCleanStore();

  const safeCount = scanProgress?.safe_items_count ?? (scanResult?.items.filter(i => i.is_safe_to_clean).length ?? 0);
  const reviewCount = scanProgress?.review_items_count ?? (scanResult?.items.filter(i => !i.is_safe_to_clean).length ?? 0);
  const filesInspected = scanProgress?.files_inspected ?? 0;
  const bytesAnalyzed = scanProgress?.bytes_analyzed ?? 0;

  return (
    <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden flex flex-col">
      {/* Header Bar */}
      <div className="p-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3 bg-[#0A0D17]">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Terminal size={16} />
          </div>
          <div>
            <span className="text-xs font-semibold text-white">Live Discovery Feed</span>
            <p className="text-[10px] text-slate-500">Real-time filesystem inspection stream</p>
          </div>
        </div>

        {/* Live Metrics Counters */}
        <div className="flex items-center space-x-2 text-[11px] font-mono">
          <div className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ShieldCheck size={13} weight="fill" />
            <span>Safe: {safeCount}</span>
          </div>

          <div className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <ShieldWarning size={13} weight="fill" />
            <span>Review: {reviewCount}</span>
          </div>

          {isScanning && (
            <div className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-slate-300">
              <HardDrive size={13} />
              <span>{filesInspected.toLocaleString()} files ({formatBytes(bytesAnalyzed)})</span>
            </div>
          )}
        </div>
      </div>

      {/* Feed Content Area */}
      <div className="p-3 max-h-56 min-h-[120px] overflow-y-auto space-y-1.5 font-mono text-xs select-none">
        {discoveryFeed.length === 0 ? (
          <div className="h-28 flex flex-col items-center justify-center text-center space-y-1.5 text-slate-500">
            <MagnifyingGlass size={22} className="opacity-40" />
            <p className="text-xs">
              {isScanning
                ? "Connecting to native traversal pipeline..."
                : wasScanCancelled
                ? "Scan halted. Inspected telemetry preserved."
                : "Scanner telemetry will stream live filesystem inspection events."}
            </p>
          </div>
        ) : (
          discoveryFeed.map((item) => {
            const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });

            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors border border-white/[0.02] text-[11px]"
              >
                <div className="flex items-center space-x-2.5 min-w-0 pr-3">
                  <span className="text-[10px] text-slate-500 shrink-0">{timeStr}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                  <span className="text-slate-300 truncate" title={item.path}>
                    {item.shortPath}
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-[10px] text-slate-400">
                    {item.categoryName}
                  </span>
                  {item.sizeBytes > 0 && (
                    <span className="font-semibold text-cyan-400 text-[10px]">
                      {formatBytes(item.sizeBytes, 0)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
