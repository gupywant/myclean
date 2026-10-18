import React from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, formatDate, truncatePath } from "../../lib/utils";
import {
  CopySimple,
  CircleNotch,
  Trash,
  Sparkle,
  CheckSquare,
  Square,
  Hash,
} from "@phosphor-icons/react";

export const DuplicatesView: React.FC = () => {
  const {
    duplicatesResult,
    isDuplicateScanning,
    scanDuplicates,
    toggleDuplicateFile,
    autoSelectDuplicates,
    cleanSpecificPaths,
    isCleaning,
  } = useFluxStore();

  const groups = duplicatesResult?.groups ?? [];
  const totalWasted = duplicatesResult?.total_wasted_bytes ?? 0;

  // Calculate selected files to delete
  const selectedPathsToDelete: string[] = [];
  let selectedBytesToReclaim = 0;

  groups.forEach((group) => {
    group.files.forEach((file) => {
      if (file.is_selected_for_removal) {
        selectedPathsToDelete.push(file.path);
        selectedBytesToReclaim += group.file_size;
      }
    });
  });

  const handleCleanDuplicates = async () => {
    if (selectedPathsToDelete.length === 0) return;
    if (
      confirm(
        `Move ${selectedPathsToDelete.length} duplicate file(s) (${formatBytes(
          selectedBytesToReclaim
        )}) to macOS Trash?`
      )
    ) {
      await cleanSpecificPaths(selectedPathsToDelete);
      // Re-scan duplicates after deletion
      scanDuplicates();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top Header */}
      <div className="p-6 border-b border-white/[0.06] bg-[#0A0D18]/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-white">Duplicate File Detector</h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              BLAKE3
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Byte-exact multi-stage verification (Size Bucketing &rarr; 4KB Head/Tail Hash &rarr; Full BLAKE3).
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => scanDuplicates()}
            disabled={isDuplicateScanning}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center space-x-2 disabled:opacity-50"
          >
            {isDuplicateScanning ? (
              <>
                <CircleNotch size={14} className="animate-spin text-white" />
                <span>Hashing Files...</span>
              </>
            ) : (
              <>
                <Sparkle size={14} weight="fill" />
                <span>Scan Downloads for Duplicates</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Auto-Select Strategy Bar (if groups found) */}
      {groups.length > 0 && (
        <div className="px-6 py-2.5 bg-[#080B15] border-b border-white/[0.04] flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Smart Select:</span>
            <button
              onClick={() => autoSelectDuplicates("keep_oldest")}
              className="px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-medium border border-white/[0.06] transition-colors"
            >
              Keep Oldest Original
            </button>
            <button
              onClick={() => autoSelectDuplicates("keep_newest")}
              className="px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-medium border border-white/[0.06] transition-colors"
            >
              Keep Newest Version
            </button>
          </div>

          <div className="flex items-center space-x-3 text-slate-400">
            <span>Found {groups.length} duplicate groups</span>
            <span className="font-mono text-cyan-400 font-semibold">
              {formatBytes(totalWasted)} wasted
            </span>
          </div>
        </div>
      )}

      {/* Duplicate Groups List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {groups.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-3 p-12">
            <CopySimple size={36} className="text-slate-600" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">No Duplicate Clones Discovered</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Scan your Downloads directory or project folders to discover exact clone files wasting storage.
              </p>
            </div>
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.hash}
              className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.05] flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Hash size={13} className="text-indigo-400" />
                  <span className="font-mono text-[11px] text-slate-400">
                    BLAKE3: {group.hash.slice(0, 16)}...
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-slate-400 text-[11px]">
                    Size per file:{" "}
                    <strong className="text-slate-200 font-mono">
                      {formatBytes(group.file_size)}
                    </strong>
                  </span>
                  <span className="text-cyan-400 font-mono text-[11px] font-semibold">
                    Wasting {formatBytes(group.wasted_bytes)}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-white/[0.03]">
                {group.files.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => toggleDuplicateFile(group.hash, file.path)}
                    className={`px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] cursor-pointer transition-colors ${
                      file.is_selected_for_removal ? "bg-rose-500/[0.04]" : ""
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDuplicateFile(group.hash, file.path);
                        }}
                        className="text-slate-400 hover:text-white"
                      >
                        {file.is_selected_for_removal ? (
                          <CheckSquare size={16} weight="fill" className="text-rose-400" />
                        ) : (
                          <Square size={16} className="text-slate-600" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-white truncate block">
                          {file.name}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 truncate block">
                          {truncatePath(file.path, 55)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0">
                      {file.modified_at && (
                        <span className="text-[11px] font-mono text-slate-500">
                          {formatDate(file.modified_at)}
                        </span>
                      )}
                      {file.is_selected_for_removal ? (
                        <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                          Remove
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          Keep Original
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Bar */}
      {selectedPathsToDelete.length > 0 && (
        <div className="p-4 border-t border-white/[0.06] bg-[#0A0D18]/95 backdrop-blur-md flex items-center justify-between">
          <div className="text-xs text-slate-300">
            Selected: <strong className="text-white">{selectedPathsToDelete.length} files</strong>{" "}
            wasting{" "}
            <strong className="text-cyan-400 font-mono">
              {formatBytes(selectedBytesToReclaim)}
            </strong>
          </div>
          <button
            onClick={handleCleanDuplicates}
            disabled={isCleaning}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 transition-all flex items-center space-x-2"
          >
            <Trash size={14} />
            <span>Trash Selected Duplicates</span>
          </button>
        </div>
      )}
    </div>
  );
};
