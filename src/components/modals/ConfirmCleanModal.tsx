import React, { useEffect } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, truncatePath } from "../../lib/utils";
import confetti from "canvas-confetti";
import {
  ShieldWarning,
  ShieldCheck,
  Lightning,
  X,
  CircleNotch,
  ArrowBendDownRight,
  Flask,
  Trash,
  StopCircle,
  WarningCircle,
  Tag,
} from "@phosphor-icons/react";

export const ConfirmCleanModal: React.FC = () => {
  const {
    showConfirmModal,
    closeConfirmModal,
    scanResult,
    selectedItemIds,
    dryRunMode,
    setDryRunMode,
    executeCleanup,
    cancelClean,
    isCleaning,
    activeAppWarnings,
    checkActiveAppsForSelected,
  } = useFluxStore();

  useEffect(() => {
    if (showConfirmModal) {
      checkActiveAppsForSelected();
    }
  }, [showConfirmModal, checkActiveAppsForSelected]);

  if (!showConfirmModal || !scanResult) return null;

  const selectedItems = scanResult.items.filter((item) => selectedItemIds.has(item.id));
  const totalAllocatedBytes = selectedItems.reduce(
    (acc, i) => acc + (i.allocated_bytes ?? i.size_bytes),
    0
  );
  const totalLogicalBytes = selectedItems.reduce(
    (acc, i) => acc + (i.logical_bytes ?? i.size_bytes),
    0
  );

  // Collect unique detection rules
  const uniqueRules = Array.from(
    new Set(
      selectedItems
        .map((i) => i.detection_rule_id)
        .filter((r): r is string => Boolean(r && r.length > 0))
    )
  );

  const handleProceed = async () => {
    const res = await executeCleanup();
    if (res?.success && !dryRunMode && res.items_deleted > 0) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#6366F1", "#8B5CF6", "#06B6D4", "#10B981"],
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl bg-[#0D101C] border border-white/[0.1] shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                dryRunMode
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                  : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
              }`}
            >
              {dryRunMode ? (
                <Flask size={22} weight="fill" />
              ) : (
                <ShieldWarning size={22} weight="fill" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {dryRunMode ? "Dry-Run Simulation Preview" : "Confirm Safe Cleanup"}
              </h2>
              <p className="text-xs text-slate-400">
                {dryRunMode
                  ? "Calculates reclaimable space without modifying any files"
                  : "Explicit confirmation required before moving items to Trash"}
              </p>
            </div>
          </div>

          <button
            onClick={closeConfirmModal}
            disabled={isCleaning}
            className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Toggle Bar */}
        <div className="p-1 rounded-xl bg-black/40 border border-white/[0.06] flex items-center gap-1">
          <button
            onClick={() => setDryRunMode(false)}
            disabled={isCleaning}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center space-x-1.5 ${
              !dryRunMode
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Trash size={14} />
            <span>Move to Trash (Recoverable)</span>
          </button>
          <button
            onClick={() => setDryRunMode(true)}
            disabled={isCleaning}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center space-x-1.5 ${
              dryRunMode
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Flask size={14} />
            <span>Dry-Run Simulation</span>
          </button>
        </div>

        {/* Summary Metric Pill */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] grid grid-cols-3 gap-2">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">
              Reclaimable Space
            </span>
            <span className="text-lg font-bold font-mono text-cyan-400">
              {formatBytes(totalAllocatedBytes)}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block">
              Logical: {formatBytes(totalLogicalBytes)}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">
              Items Targeted
            </span>
            <span className="text-lg font-bold font-mono text-white">
              {selectedItems.length}
            </span>
            <span className="text-[10px] text-slate-500 block">
              Across {uniqueRules.length} rule{uniqueRules.length === 1 ? "" : "s"}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">
              Safety Guard
            </span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center space-x-1 mt-1">
              <ShieldCheck size={14} weight="fill" />
              <span>100% Protected</span>
            </span>
            <span className="text-[10px] text-slate-500 block">
              Databases & SIP shielded
            </span>
          </div>
        </div>

        {/* Active Application Warnings Banner */}
        {activeAppWarnings.length > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
            <div className="flex items-center space-x-2 text-amber-300 text-xs font-semibold">
              <WarningCircle size={16} weight="fill" className="shrink-0 text-amber-400" />
              <span>Active Applications Detected</span>
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              The following applications are currently open on macOS. To prevent file lock
              conflicts or data corruption, their caches will be safely protected and skipped
              until the app is closed:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeAppWarnings.map((w) => (
                <span
                  key={w.app_name}
                  className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/30 text-[10px] font-medium"
                >
                  {w.app_name} ({w.affected_paths.length} item
                  {w.affected_paths.length === 1 ? "" : "s"})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Detection Rules Applied */}
        {uniqueRules.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 flex items-center space-x-1">
              <Tag size={12} />
              <span>Applied Detection Rules:</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {uniqueRules.map((rule) => (
                <span
                  key={rule}
                  className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-[10px] font-mono text-slate-300"
                >
                  {rule}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Destination Note */}
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2.5">
          <ArrowBendDownRight size={16} className="shrink-0 text-emerald-400" />
          <span>
            {dryRunMode
              ? "Dry-Run simulation will verify permissions and safety rules without deleting or trashing any files."
              : "Items will be moved to macOS Trash (100% recoverable). Permanent deletion is disabled."}
          </span>
        </div>

        {/* Preview of paths */}
        <div className="space-y-1">
          <span className="text-[10px] uppercase font-semibold text-slate-500">
            Selected Locations Preview:
          </span>
          <div className="max-h-32 overflow-y-auto rounded-lg bg-black/40 p-2 border border-white/[0.04] space-y-1 font-mono text-[11px] text-slate-400">
            {selectedItems.slice(0, 6).map((i) => (
              <div key={i.id} className="truncate flex items-center justify-between gap-2">
                <span className="truncate">{truncatePath(i.path, 45)}</span>
                <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                  {formatBytes(i.allocated_bytes ?? i.size_bytes)}
                </span>
              </div>
            ))}
            {selectedItems.length > 6 && (
              <div className="text-slate-600 text-[10px] pt-0.5">
                + {selectedItems.length - 6} more paths...
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          {isCleaning ? (
            <button
              onClick={cancelClean}
              className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors flex items-center space-x-1.5"
            >
              <StopCircle size={15} weight="fill" />
              <span>Abort Cleaning</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center space-x-3">
            <button
              onClick={closeConfirmModal}
              disabled={isCleaning}
              className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 border border-white/[0.06] transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleProceed}
              disabled={isCleaning || selectedItems.length === 0}
              className={`px-5 py-2 rounded-xl text-xs font-semibold text-white shadow-lg transition-all flex items-center space-x-2 disabled:opacity-40 ${
                dryRunMode
                  ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/25"
                  : "bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 shadow-indigo-500/25"
              }`}
            >
              {isCleaning ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Lightning size={14} weight="fill" />
                  <span>{dryRunMode ? "Run Simulation" : "Confirm & Move to Trash"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
