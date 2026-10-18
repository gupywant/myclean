import React from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, truncatePath } from "../../lib/utils";
import confetti from "canvas-confetti";
import {
  ShieldCheck,
  Lightning,
  X,
  CircleNotch,
  ArrowBendDownRight,
  Flask,
  Trash,
  StopCircle,
  Hash,
  Link,
  Lock,
} from "@phosphor-icons/react";

export const DuplicateConfirmModal: React.FC = () => {
  const {
    showDuplicateConfirmModal,
    closeDuplicateConfirmModal,
    duplicatesResult,
    dryRunMode,
    setDryRunMode,
    executeDuplicateCleanup,
    cancelDuplicateClean,
    isDuplicateCleaning,
  } = useFluxStore();

  if (!showDuplicateConfirmModal || !duplicatesResult) return null;

  // Gather targeted files & preserved originals
  const targetGroups: {
    hash: string;
    fileSize: number;
    original: { path: string; name: string };
    toDelete: { path: string; name: string; isHardlink: boolean; inode: number }[];
  }[] = [];

  let totalReclaimable = 0;
  let totalFilesToDelete = 0;
  let hasAnyHardlinks = false;

  for (const group of duplicatesResult.groups) {
    const toDelete = group.files.filter((f) => f.is_selected_for_removal);
    if (toDelete.length === 0) continue;

    const original = group.files.find((f) => !f.is_selected_for_removal);
    if (!original) continue;

    totalFilesToDelete += toDelete.length;
    // Calculate reclaimable space for this group:
    // If files are hard-link copies sharing inode with original, deleting doesn't reclaim physical blocks
    const originalInode = original.inode;
    let groupReclaimable = 0;
    for (const f of toDelete) {
      if (f.inode === originalInode) {
        hasAnyHardlinks = true;
      } else {
        groupReclaimable += f.allocated_bytes || f.file_size;
      }
    }
    totalReclaimable += groupReclaimable;

    targetGroups.push({
      hash: group.hash,
      fileSize: group.file_size,
      original: { path: original.path, name: original.name },
      toDelete: toDelete.map((f) => ({
        path: f.path,
        name: f.name,
        isHardlink: f.inode === originalInode,
        inode: f.inode,
      })),
    });
  }

  const handleProceed = async () => {
    const res = await executeDuplicateCleanup();
    if (res?.success && !dryRunMode && res.items_deleted > 0) {
      confetti({
        particleCount: 90,
        spread: 65,
        origin: { y: 0.6 },
        colors: ["#6366F1", "#8B5CF6", "#06B6D4", "#10B981"],
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-2xl bg-[#0D101C] border border-white/[0.1] shadow-2xl p-6 space-y-5 animate-in fade-in duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between shrink-0">
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
                <Trash size={22} weight="fill" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {dryRunMode ? "Duplicate Clean Simulation" : "Confirm Duplicate Cleanup"}
              </h2>
              <p className="text-xs text-slate-400">
                {dryRunMode
                  ? "Simulate duplicate trashing with zero filesystem modifications"
                  : "Move redundant clone files safely to macOS Trash"}
              </p>
            </div>
          </div>

          <button
            onClick={closeDuplicateConfirmModal}
            disabled={isDuplicateCleaning}
            className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Toggle Bar */}
        <div className="p-1 rounded-xl bg-black/40 border border-white/[0.06] flex items-center gap-1 shrink-0">
          <button
            onClick={() => setDryRunMode(false)}
            disabled={isDuplicateCleaning}
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
            disabled={isDuplicateCleaning}
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

        {/* Summary Metric Grid */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] grid grid-cols-3 gap-3 shrink-0">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">
              Reclaimable Space
            </span>
            <span className="text-lg font-bold font-mono text-cyan-400">
              {formatBytes(totalReclaimable)}
            </span>
            <span className="text-[10px] text-slate-500 block">
              Physical APFS blocks freed
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">
              Clones Targeted
            </span>
            <span className="text-lg font-bold font-mono text-rose-400">
              {totalFilesToDelete}
            </span>
            <span className="text-[10px] text-slate-500 block">
              Across {targetGroups.length} group{targetGroups.length === 1 ? "" : "s"}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">
              Originals Retained
            </span>
            <span className="text-lg font-bold font-mono text-emerald-400 flex items-center space-x-1">
              <Lock size={15} weight="bold" />
              <span>{targetGroups.length}</span>
            </span>
            <span className="text-[10px] text-slate-500 block">
              100% verified preserved
            </span>
          </div>
        </div>

        {/* Safety Invariant Notice */}
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2.5 shrink-0">
          <ShieldCheck size={18} weight="fill" className="shrink-0 text-emerald-400" />
          <span className="leading-relaxed">
            <strong>Rust Original Preservation Guarantee:</strong> The core engine strictly forbids
            deleting all copies of any duplicate group. Every clone is re-hashed with BLAKE3
            prior to trashing to prevent scan-to-clean race conditions.
          </span>
        </div>

        {/* Hardlink Notice if present */}
        {hasAnyHardlinks && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center space-x-2 shrink-0">
            <Link size={16} className="shrink-0 text-amber-400" />
            <span>
              Some files are APFS hard links (sharing physical inodes). Removing hard links reduces
              link count, but only frees physical disk blocks once the final link is unlinked.
            </span>
          </div>
        )}

        {/* Preview of Groups to be cleaned */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 space-y-1.5">
          <span className="text-[10px] uppercase font-semibold text-slate-500 shrink-0">
            Cleanup Queue Preview:
          </span>
          <div className="flex-1 overflow-y-auto rounded-xl bg-black/40 p-3 border border-white/[0.04] space-y-3 font-mono text-xs">
            {targetGroups.map((group) => (
              <div
                key={group.hash}
                className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] pb-1 border-b border-white/[0.04]">
                  <div className="flex items-center space-x-1.5 text-slate-400">
                    <Hash size={12} className="text-indigo-400" />
                    <span>BLAKE3: {group.hash.slice(0, 16)}...</span>
                  </div>
                  <span className="text-slate-500">{formatBytes(group.fileSize)}</span>
                </div>

                {/* Preserved Original */}
                <div className="flex items-center space-x-2 text-[11px] text-emerald-400 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10">
                  <Lock size={12} className="shrink-0" />
                  <span className="font-semibold shrink-0">PRESERVED:</span>
                  <span className="truncate text-slate-300">
                    {truncatePath(group.original.path, 50)}
                  </span>
                </div>

                {/* Targeted Clones */}
                <div className="space-y-1 pl-4 border-l border-white/[0.06]">
                  {group.toDelete.map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center justify-between text-[11px] text-rose-300"
                    >
                      <div className="flex items-center space-x-1.5 truncate">
                        <ArrowBendDownRight size={12} className="shrink-0 text-rose-400" />
                        <span className="truncate">{truncatePath(f.path, 45)}</span>
                      </div>
                      {f.isHardlink && (
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0 ml-2">
                          Hard Link
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] shrink-0">
          {isDuplicateCleaning ? (
            <button
              onClick={cancelDuplicateClean}
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
              onClick={closeDuplicateConfirmModal}
              disabled={isDuplicateCleaning}
              className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 border border-white/[0.06] transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleProceed}
              disabled={isDuplicateCleaning || totalFilesToDelete === 0}
              className={`px-5 py-2 rounded-xl text-xs font-semibold text-white shadow-lg transition-all flex items-center space-x-2 disabled:opacity-40 ${
                dryRunMode
                  ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/25"
                  : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/25"
              }`}
            >
              {isDuplicateCleaning ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Lightning size={14} weight="fill" />
                  <span>
                    {dryRunMode
                      ? "Run Simulation"
                      : `Move ${totalFilesToDelete} Clone${totalFilesToDelete === 1 ? "" : "s"} to Trash`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
