import React from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, truncatePath } from "../../lib/utils";
import confetti from "canvas-confetti";
import {
  Code,
  ShieldCheck,
  X,
  CircleNotch,
  Flask,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";

export const DeveloperCleanModal: React.FC = () => {
  const {
    showDeveloperCleanModal,
    closeDeveloperCleanModal,
    developerResult,
    developerSelectedPaths,
    dryRunMode,
    setDryRunMode,
    cleanDeveloperArtifacts,
    isDeveloperCleaning,
  } = useFluxStore();

  if (!showDeveloperCleanModal || !developerResult) return null;

  const targetedItems = developerResult.items.filter((item) =>
    developerSelectedPaths.has(item.path)
  );

  const totalBytes = targetedItems.reduce((acc, i) => acc + i.size_bytes, 0);
  const totalAllocatedBytes = targetedItems.reduce(
    (acc, i) => acc + (i.allocated_bytes || i.size_bytes),
    0
  );

  const hasReviewRequired = targetedItems.some(
    (i) => i.risk.level === "ReviewRequired"
  );

  const handleProceed = async () => {
    const res = await cleanDeveloperArtifacts();
    if (res?.success) {
      if (!dryRunMode && res.items_deleted > 0) {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#6366F1", "#8B5CF6", "#06B6D4", "#10B981"],
        });
      }
      closeDeveloperCleanModal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-2xl bg-[#0D101C] border border-white/[0.1] shadow-2xl p-6 space-y-5 animate-in fade-in duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Code size={24} weight="bold" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">
                  Purge Developer Artifacts
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {targetedItems.length} Items Selected
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Safe cleanup of build caches, indexing modules, and dependencies
              </p>
            </div>
          </div>
          <button
            onClick={closeDeveloperCleanModal}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Reclaimable Metric Banner */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/20 via-indigo-950/30 to-violet-950/20 border border-cyan-500/20 flex items-center justify-between shrink-0">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-cyan-300/80 tracking-wider block">
              Estimated Reclaimable Space
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-cyan-300">
                {formatBytes(totalBytes)}
              </span>
              {totalAllocatedBytes > 0 && totalAllocatedBytes !== totalBytes && (
                <span className="text-[11px] font-mono text-slate-400">
                  ({formatBytes(totalAllocatedBytes)} allocated on APFS)
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-400 block">
              Destination
            </span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center space-x-1 justify-end">
              <ShieldCheck size={14} weight="fill" />
              <span>macOS Trash</span>
            </span>
          </div>
        </div>

        {/* Warning if review required items are selected */}
        {hasReviewRequired && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start space-x-2.5 text-xs text-amber-300/90 shrink-0">
            <WarningCircle size={17} weight="fill" className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-amber-200">
                Workspace Build Output / Dependencies Included
              </span>
              <span>
                Purging compiled Rust targets or node_modules will require running build or install commands before running those projects again.
              </span>
            </div>
          </div>
        )}

        {/* Target Items List */}
        <div className="space-y-2 flex-1 min-h-0 flex flex-col">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block shrink-0">
            Selected Targets ({targetedItems.length})
          </span>
          <div className="overflow-y-auto space-y-1.5 pr-1 border border-white/[0.04] rounded-lg p-2.5 bg-black/20 flex-1">
            {targetedItems.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-3 space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-white truncate">
                      {item.display_name}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                        item.risk.level === "Safe"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {item.risk.level === "Safe" ? "Safe Cache" : "Review Required"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 truncate block">
                    {truncatePath(item.path, 50)}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-semibold text-slate-300 block">
                    {formatBytes(item.size_bytes)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {item.item_count} files
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mode Toggle & Dry Run Note */}
        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between shrink-0">
          <div className="space-y-0.5 pr-4">
            <div className="flex items-center space-x-1.5">
              <Flask
                size={15}
                weight={dryRunMode ? "fill" : "regular"}
                className={dryRunMode ? "text-cyan-400" : "text-slate-400"}
              />
              <span className="text-xs font-semibold text-white">
                Dry-Run Simulation Mode
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Verify candidates and simulate exact byte reclamation without moving items to macOS Trash.
            </p>
          </div>

          <button
            onClick={() => setDryRunMode(!dryRunMode)}
            className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer shrink-0 ${
              dryRunMode ? "bg-cyan-600" : "bg-slate-700"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                dryRunMode ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Modal Actions */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Audit log recorded to SQLite</span>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={closeDeveloperCleanModal}
              disabled={isDeveloperCleaning}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleProceed}
              disabled={isDeveloperCleaning || targetedItems.length === 0}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer ${
                dryRunMode
                  ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
              }`}
            >
              {isDeveloperCleaning ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>{dryRunMode ? "Simulating..." : "Purging..."}</span>
                </>
              ) : dryRunMode ? (
                <>
                  <Flask size={14} weight="fill" />
                  <span>Simulate Purge</span>
                </>
              ) : (
                <>
                  <Trash size={14} weight="fill" />
                  <span>Move to Trash ({formatBytes(totalBytes)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
