import React, { useEffect, useState } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, truncatePath } from "../../lib/utils";
import type { InstalledApp } from "../../types";
import {
  AppWindow,
  CircleNotch,
  Sparkle,
  CaretRight,
  CaretDown,
} from "@phosphor-icons/react";

export const AppsView: React.FC = () => {
  const { installedApps, isAppsScanning, scanApplications, cleanSpecificPaths, isCleaning } =
    useFluxStore();

  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  useEffect(() => {
    if (installedApps.length === 0 && !isAppsScanning) {
      scanApplications();
    }
  }, []);

  const totalAppBytes = installedApps.reduce((acc, app) => acc + app.total_size_bytes, 0);

  const handleCleanArtifacts = async (app: InstalledApp, onlyLeftovers = true) => {
    const paths = onlyLeftovers
      ? app.artifacts.filter((a) => a.kind !== "Application Bundle").map((a) => a.path)
      : app.artifacts.map((a) => a.path);

    if (paths.length === 0) return;

    const actionDesc = onlyLeftovers ? "leftover caches & data" : "entire application and all data";
    if (confirm(`Move ${actionDesc} of "${app.name}" to macOS Trash?`)) {
      await cleanSpecificPaths(paths);
      scanApplications();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-white">Application Uninstaller & Leftovers</h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              macOS
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Detect complete application footprints including hidden Library support, caches, and orphaned preferences.
          </p>
        </div>

        <button
          onClick={() => scanApplications()}
          disabled={isAppsScanning}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center space-x-2 disabled:opacity-50"
        >
          {isAppsScanning ? (
            <>
              <CircleNotch size={14} className="animate-spin text-white" />
              <span>Scanning Applications...</span>
            </>
          ) : (
            <>
              <Sparkle size={14} weight="fill" />
              <span>Rescan Applications</span>
            </>
          )}
        </button>
      </div>

      {/* Discovered Apps List */}
      <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
            Installed Applications ({installedApps.length})
          </h2>
          <span className="text-xs font-mono text-cyan-400 font-semibold">
            Total Footprint: {formatBytes(totalAppBytes)}
          </span>
        </div>

        {installedApps.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            {isAppsScanning ? "Scanning installed applications..." : "No applications found."}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {installedApps.map((app) => {
              const isExpanded = expandedApp === app.bundle_id;
              const leftoverArtifacts = app.artifacts.filter(
                (a) => a.kind !== "Application Bundle"
              );
              const leftoverBytes = leftoverArtifacts.reduce((acc, a) => acc + a.size_bytes, 0);

              return (
                <div key={app.bundle_id} className="transition-colors">
                  <div
                    onClick={() => setExpandedApp(isExpanded ? null : app.bundle_id)}
                    className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] cursor-pointer"
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-4">
                      <div className="text-slate-500">
                        {isExpanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                        <AppWindow size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-white truncate">
                            {app.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            v{app.version}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono truncate">
                          {app.bundle_id}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-mono font-semibold text-white block">
                          {formatBytes(app.total_size_bytes)}
                        </span>
                        {leftoverBytes > 0 && (
                          <span className="text-[10px] text-cyan-400 font-mono">
                            {formatBytes(leftoverBytes)} data
                          </span>
                        )}
                      </div>

                      {leftoverBytes > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCleanArtifacts(app, true);
                          }}
                          disabled={isCleaning}
                          className="px-2.5 py-1 rounded bg-white/[0.04] hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/[0.06] text-[11px] font-medium transition-colors"
                          title="Clean only caches and application support without removing app"
                        >
                          Clear Data
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Artifacts List */}
                  {isExpanded && (
                    <div className="px-12 py-3 bg-black/20 border-t border-white/[0.02] space-y-2">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                        Associated Footprint Breakdown
                      </span>
                      <div className="space-y-1.5">
                        {app.artifacts.map((art) => (
                          <div
                            key={art.path}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white/[0.02]"
                          >
                            <div className="flex items-center space-x-2 min-w-0 pr-4">
                              <span className="text-[10px] font-medium text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded shrink-0">
                                {art.kind}
                              </span>
                              {art.kind === "Application Bundle" ? (
                                <span className="text-[9px] font-medium text-slate-400 bg-white/[0.04] px-1 py-0.2 rounded shrink-0">
                                  App Binary
                                </span>
                              ) : (
                                <span className="text-[9px] font-medium text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded shrink-0">
                                  Safe to Clear
                                </span>
                              )}
                              <span className="font-mono text-[11px] text-slate-400 truncate">
                                {truncatePath(art.path, 50)}
                              </span>
                            </div>
                            <span className="font-mono text-slate-300 shrink-0">
                              {formatBytes(art.size_bytes)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
