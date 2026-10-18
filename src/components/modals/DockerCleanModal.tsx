import React from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes } from "../../lib/utils";
import confetti from "canvas-confetti";
import {
  ShieldCheck,
  X,
  CircleNotch,
  Flask,
  Trash,
  WarningCircle,
  HardDrives,
  Lock,
} from "@phosphor-icons/react";

export const DockerCleanModal: React.FC = () => {
  const {
    showDockerCleanModal,
    closeDockerCleanModal,
    dockerResult,
    dockerSelectedIds,
    dryRunMode,
    setDryRunMode,
    cleanDockerResources,
    isDockerCleaning,
  } = useFluxStore();

  if (!showDockerCleanModal || !dockerResult) return null;

  const selectedItems = dockerResult.resources.filter(
    (r) => dockerSelectedIds.has(r.id) && !r.is_protected
  );

  const totalBytes = selectedItems.reduce((acc, r) => acc + r.size_bytes, 0);

  const handleProceed = async () => {
    const res = await cleanDockerResources();
    if (res?.success) {
      if (!dryRunMode && res.items_deleted > 0) {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#06B6D4", "#6366F1", "#8B5CF6", "#10B981"],
        });
      }
      closeDockerCleanModal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-2xl bg-[#0D101C] border border-white/[0.1] shadow-2xl p-6 space-y-5 animate-in fade-in duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <HardDrives size={24} weight="bold" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">
                  Prune Docker Resources
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {selectedItems.length} Targets Selected
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Safe removal of stopped containers, dangling images, and build caches
              </p>
            </div>
          </div>
          <button
            onClick={closeDockerCleanModal}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Storage Reclaimable Banner */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/20 via-indigo-950/30 to-violet-950/20 border border-cyan-500/20 flex items-center justify-between shrink-0">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-cyan-300/80 tracking-wider block">
              Estimated Space to Free in Docker VM
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-cyan-300">
                {formatBytes(totalBytes)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-400 block">
              Safety Policy
            </span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center space-x-1 justify-end">
              <Lock size={14} weight="fill" />
              <span>Volumes Protected</span>
            </span>
          </div>
        </div>

        {/* Protection Invariant Notice */}
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start space-x-2.5 text-xs text-emerald-300/90 shrink-0">
          <ShieldCheck size={18} weight="fill" className="text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block text-emerald-200">
              Data Safety Guarantees
            </span>
            <span>
              Persistent Docker database volumes and running containers are strictly locked and cannot be deleted. Only stopped containers, unused layers, and build caches are purged.
            </span>
          </div>
        </div>

        {/* Selected Docker Resources List */}
        <div className="space-y-2 flex-1 min-h-0 flex flex-col">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block shrink-0">
            Selected Resources ({selectedItems.length})
          </span>
          <div className="overflow-y-auto space-y-1.5 pr-1 border border-white/[0.04] rounded-lg p-2.5 bg-black/20 flex-1">
            {selectedItems.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-3 space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-white truncate">
                      {item.name}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase">
                      {item.resource_type.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 truncate block">
                    ID: {item.id} • {item.status}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-semibold text-slate-300 block">
                    {formatBytes(item.size_bytes)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Host Compaction Disclaimer */}
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[11px] text-slate-400 space-y-1 shrink-0">
          <div className="flex items-center space-x-1.5 text-slate-300 font-medium">
            <WarningCircle size={14} className="text-cyan-400" />
            <span>macOS Host Disk Compaction Note</span>
          </div>
          <p>
            Cleaning Docker releases layers within Docker Desktop&apos;s virtual machine. Physical host APFS disk space expands/shrinks progressively as Docker Desktop executes dynamic disk compaction.
          </p>
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
              Verify resource eligibility and simulate commands without issuing Docker prune operations.
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
            <span>Audit record logged to SQLite</span>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={closeDockerCleanModal}
              disabled={isDockerCleaning}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleProceed}
              disabled={isDockerCleaning || selectedItems.length === 0}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer ${
                dryRunMode
                  ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
              }`}
            >
              {isDockerCleaning ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>{dryRunMode ? "Simulating..." : "Pruning..."}</span>
                </>
              ) : dryRunMode ? (
                <>
                  <Flask size={14} weight="fill" />
                  <span>Simulate Prune</span>
                </>
              ) : (
                <>
                  <Trash size={14} weight="fill" />
                  <span>Prune Docker ({formatBytes(totalBytes)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
