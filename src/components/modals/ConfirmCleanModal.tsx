import React from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, truncatePath } from "../../lib/utils";
import confetti from "canvas-confetti";
import {
  ShieldWarning,
  Lightning,
  X,
  CircleNotch,
  ArrowBendDownRight,
} from "@phosphor-icons/react";

export const ConfirmCleanModal: React.FC = () => {
  const {
    showConfirmModal,
    closeConfirmModal,
    scanResult,
    selectedItemIds,
    dryRunMode,
    executeCleanup,
    isCleaning,
  } = useFluxStore();

  if (!showConfirmModal || !scanResult) return null;

  const selectedItems = scanResult.items.filter((item) => selectedItemIds.has(item.id));
  const totalSelectedBytes = selectedItems.reduce((acc, i) => acc + i.size_bytes, 0);

  const handleProceed = async () => {
    const res = await executeCleanup();
    if (res?.success && !dryRunMode) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#6366F1", "#8B5CF6", "#06B6D4", "#10B981"],
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl bg-[#0D101C] border border-white/[0.1] shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <ShieldWarning size={22} weight="fill" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {dryRunMode ? "Confirm Dry-Run Simulation" : "Confirm Safe Cleanup"}
              </h2>
              <p className="text-xs text-slate-400">
                Explicit confirmation required before modifying files
              </p>
            </div>
          </div>

          <button
            onClick={closeConfirmModal}
            className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Summary Metric Pill */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">
              Space to Reclaim
            </span>
            <span className="text-xl font-bold font-mono text-cyan-400">
              {formatBytes(totalSelectedBytes)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">
              Items Targeted
            </span>
            <span className="text-xl font-bold font-mono text-white">
              {selectedItems.length}
            </span>
          </div>
        </div>

        {/* Destination Note */}
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2.5">
          <ArrowBendDownRight size={16} className="shrink-0 text-emerald-400" />
          <span>
            Target items will be moved to <strong>macOS Trash Bin</strong> (100% recoverable). Permanent unlinking is disabled to protect against data loss.
          </span>
        </div>

        {/* Preview of paths */}
        <div className="space-y-1">
          <span className="text-[10px] uppercase font-semibold text-slate-500">
            Selected Locations Preview:
          </span>
          <div className="max-h-36 overflow-y-auto rounded-lg bg-black/40 p-2 border border-white/[0.04] space-y-1 font-mono text-[11px] text-slate-400">
            {selectedItems.slice(0, 8).map((i) => (
              <div key={i.id} className="truncate">
                {truncatePath(i.path, 50)}
              </div>
            ))}
            {selectedItems.length > 8 && (
              <div className="text-slate-600 text-[10px]">
                + {selectedItems.length - 8} more paths...
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            onClick={closeConfirmModal}
            className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 border border-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProceed}
            disabled={isCleaning}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all flex items-center space-x-2"
          >
            {isCleaning ? (
              <>
                <CircleNotch size={14} className="animate-spin" />
                <span>Cleaning...</span>
              </>
            ) : (
              <>
                <Lightning size={14} weight="fill" />
                <span>{dryRunMode ? "Simulate Clean" : "Confirm & Move to Trash"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
