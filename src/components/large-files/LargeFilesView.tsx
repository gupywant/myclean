import React, { useState } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, formatDate, truncatePath } from "../../lib/utils";
import {
  FileArchive,
  Trash,
  Warning,
} from "@phosphor-icons/react";

export const LargeFilesView: React.FC = () => {
  const { scanResult, cleanSpecificPaths, isCleaning } = useFluxStore();
  const [minSizeMB, setMinSizeMB] = useState<number>(100);

  const largeFiles = scanResult
    ? scanResult.items.filter((i) => i.category === "large_files" && i.size_bytes >= minSizeMB * 1024 * 1024)
    : [];

  const totalBytes = largeFiles.reduce((acc, i) => acc + i.size_bytes, 0);

  const handleClean = async (path: string, name: string) => {
    if (confirm(`Send "${name}" to macOS Trash?`)) {
      await cleanSpecificPaths([path]);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Large & Old Files</h1>
          <p className="text-xs text-slate-400 mt-1">
            Detect high-capacity archives, disk images (.dmg), and outdated media taking up disk quota.
          </p>
        </div>

        {totalBytes > 0 && (
          <div className="text-right">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              Cumulative Size
            </span>
            <span className="text-xl font-bold font-mono text-cyan-400">
              {formatBytes(totalBytes)}
            </span>
          </div>
        )}
      </div>

      {/* Safety Notice */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center space-x-2.5">
        <Warning size={18} className="shrink-0" />
        <span>
          Large files in user folders are <strong>never selected automatically</strong>. Please review each file before trashing.
        </span>
      </div>

      {/* Size Threshold Filters */}
      <div className="flex items-center space-x-2">
        <span className="text-xs text-slate-400 mr-2">Minimum Threshold:</span>
        {[100, 500, 1024, 5120].map((mb) => (
          <button
            key={mb}
            onClick={() => setMinSizeMB(mb)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              minSizeMB === mb
                ? "bg-indigo-600 text-white"
                : "bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]"
            }`}
          >
            &gt; {mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`}
          </button>
        ))}
      </div>

      {/* Files List */}
      <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
            Matching Files ({largeFiles.length})
          </h2>
        </div>

        {largeFiles.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FileArchive size={32} className="mx-auto text-slate-600" />
            <p className="text-xs text-slate-400">
              No files exceeding {minSizeMB >= 1024 ? `${minSizeMB / 1024} GB` : `${minSizeMB} MB`} found in the current scan scope.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {largeFiles.map((file) => (
              <div
                key={file.id}
                className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
              >
                <div className="space-y-0.5 min-w-0 pr-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-white truncate">
                      {file.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {truncatePath(file.path, 55)}
                  </p>
                </div>

                <div className="flex items-center space-x-4 shrink-0">
                  <div className="text-right">
                    <span className="text-xs font-mono font-semibold text-white block">
                      {formatBytes(file.size_bytes)}
                    </span>
                    {file.modified_at && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatDate(file.modified_at)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleClean(file.path, file.name)}
                    disabled={isCleaning}
                    className="p-2 rounded-lg bg-white/[0.03] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/[0.06] transition-colors"
                    title="Send to macOS Trash"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
