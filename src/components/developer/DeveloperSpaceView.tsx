import React from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes } from "../../lib/utils";
import {
  Terminal,
  Package,
  Cpu,
  Trash,
  CheckCircle,
} from "@phosphor-icons/react";

export const DeveloperSpaceView: React.FC = () => {
  const { scanResult, cleanSpecificPaths, isCleaning } = useFluxStore();

  const devItems = scanResult
    ? scanResult.items.filter(
        (i) => i.category === "developer_xcode" || i.category === "developer_caches"
      )
    : [];

  const totalDevBytes = devItems.reduce((acc, i) => acc + i.size_bytes, 0);

  const handlePurge = async (path: string) => {
    if (confirm(`Safely move "${path}" to macOS Trash?`)) {
      await cleanSpecificPaths([path]);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-white">Developer Optimization Studio</h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              macOS Dev
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Reclaim gigabytes of orphaned build caches, Xcode indexes, simulator artifacts, and dependency archives.
          </p>
        </div>

        {totalDevBytes > 0 && (
          <div className="text-right">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              Reclaimable Dev Space
            </span>
            <span className="text-xl font-bold font-mono text-cyan-400">
              {formatBytes(totalDevBytes)}
            </span>
          </div>
        )}
      </div>

      {/* Developer Presets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Xcode Suite */}
        <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Cpu size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Xcode DerivedData</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Intermediate indexing files and build modules created during compilation.
            </p>
          </div>
          <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-xs">
            <span className="text-slate-500">Status</span>
            <span className="text-emerald-400 font-medium flex items-center space-x-1">
              <CheckCircle size={13} weight="fill" />
              <span>Safe to Purge</span>
            </span>
          </div>
        </div>

        {/* Homebrew Bottles */}
        <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Terminal size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Homebrew Bottles</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Cached pre-built formula tarballs and package downloads from brew upgrade.
            </p>
          </div>
          <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-xs">
            <span className="text-slate-500">Status</span>
            <span className="text-emerald-400 font-medium flex items-center space-x-1">
              <CheckCircle size={13} weight="fill" />
              <span>Safe to Purge</span>
            </span>
          </div>
        </div>

        {/* Package Registries */}
        <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
          <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
            <Package size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Cargo & NPM Registries</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Archived `.crate` files and npm cache buffers downloaded during builds.
            </p>
          </div>
          <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-xs">
            <span className="text-slate-500">Status</span>
            <span className="text-emerald-400 font-medium flex items-center space-x-1">
              <CheckCircle size={13} weight="fill" />
              <span>Safe to Purge</span>
            </span>
          </div>
        </div>
      </div>

      {/* Discovered Developer Artifacts Table */}
      <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
            Discovered Developer Caches ({devItems.length})
          </h2>
          <span className="text-[11px] text-slate-400">All deletions move to macOS Trash</span>
        </div>

        {devItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No active developer artifacts detected or already purged. Run an analysis from the Overview tab.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {devItems.map((item) => (
              <div
                key={item.id}
                className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
              >
                <div className="space-y-0.5 min-w-0 pr-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-white truncate">
                      {item.name}
                    </span>
                    <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded">
                      {item.category === "developer_xcode" ? "Xcode" : "Tooling"}
                    </span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium">
                      Safe to Clean
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">{item.path}</p>
                </div>

                <div className="flex items-center space-x-4 shrink-0">
                  <span className="text-xs font-mono font-medium text-cyan-400">
                    {formatBytes(item.size_bytes)}
                  </span>
                  <button
                    onClick={() => handlePurge(item.path)}
                    disabled={isCleaning}
                    className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/[0.06] transition-colors"
                    title="Purge to Trash"
                  >
                    <Trash size={14} />
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
