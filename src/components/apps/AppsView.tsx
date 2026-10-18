import React, { useEffect, useState, useMemo } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, truncatePath } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";
import {
  AppWindow,
  CircleNotch,
  Sparkle,
  Trash,
  CheckSquare,
  Square,
  ArrowSquareOut,
  MagnifyingGlass,
  X,
  ShieldCheck,
  WarningCircle,
  Ghost,
  UploadSimple,
  CaretRight,
  ArrowsDownUp,
} from "@phosphor-icons/react";

export const AppsView: React.FC = () => {
  const {
    installedApps,
    isAppsScanning,
    scanApplications,
    orphanedResult,
    isOrphanedScanning,
    scanOrphanedData,
    selectedAppForUninstall,
    selectedArtifactPaths,
    selectAppForUninstall,
    toggleAppArtifactSelection,
    selectAllAppArtifacts,
    openUninstallModal,
    orphanedSelectedPaths,
    toggleOrphanedPathSelection,
    selectAllOrphanedPaths,
    executeCleanOrphaned,
    isCleaningOrphaned,
    openInFinder,
    appActiveTab,
    setAppActiveTab,
    appFilterQuery,
    setAppFilterQuery,
    appSortBy,
    setAppSortBy,
    inspectDroppedApp,
    dryRunMode,
  } = useFluxStore();

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    if (installedApps.length === 0 && !isAppsScanning) {
      scanApplications();
    }
    if (!orphanedResult && !isOrphanedScanning) {
      scanOrphanedData();
    }
  }, []);

  // Filter and sort installed apps
  const filteredApps = useMemo(() => {
    let result = [...installedApps];

    if (appFilterQuery.trim()) {
      const q = appFilterQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.bundle_id.toLowerCase().includes(q) ||
          (a.publisher && a.publisher.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      switch (appSortBy) {
        case "total_size":
          return b.total_size_bytes - a.total_size_bytes;
        case "binary_size":
          return b.binary_size_bytes - a.binary_size_bytes;
        case "name":
          return a.name.localeCompare(b.name);
        case "recent":
          return (
            (b.last_modified ? new Date(b.last_modified).getTime() : 0) -
            (a.last_modified ? new Date(a.last_modified).getTime() : 0)
          );
        default:
          return 0;
      }
    });

    return result;
  }, [installedApps, appFilterQuery, appSortBy]);

  const totalInstalledFootprint = installedApps.reduce(
    (acc, a) => acc + (a.allocated_size_bytes || a.total_size_bytes),
    0
  );

  const orphanedItems = orphanedResult?.items ?? [];
  const orphanedSelectedBytes = orphanedItems
    .filter((i) => orphanedSelectedPaths.has(i.path))
    .reduce((acc, i) => acc + (i.allocated_bytes || i.size_bytes), 0);

  // Handle Drag & Drop of .app bundle
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    // Check if any dropped item is a .app bundle
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // On macOS, webkitRelativePath or path might hold the file system path
      const droppedPath = (file as unknown as { path?: string }).path || file.name;
      if (droppedPath.endsWith(".app")) {
        const app = await inspectDroppedApp(droppedPath);
        if (app) {
          showToast(`Inspecting ${app.name} (${app.bundle_id})`);
          return;
        }
      }
    }
    showToast("Please drop a valid macOS .app bundle.");
  };

  const handleCleanOrphanedSelected = async () => {
    if (orphanedSelectedPaths.size === 0) return;
    const res = await executeCleanOrphaned();
    if (res?.success && !dryRunMode && res.items_deleted > 0) {
      confetti({
        particleCount: 75,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#6366F1", "#8B5CF6", "#06B6D4", "#10B981"],
      });
      showToast(
        `Moved ${res.items_deleted} orphaned files (${formatBytes(res.bytes_freed)}) to Trash`
      );
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 flex flex-col overflow-hidden relative transition-all ${
        isDraggingOver ? "ring-2 ring-indigo-500 bg-indigo-500/[0.03]" : ""
      }`}
    >
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#1B2238] border border-indigo-500/30 text-indigo-200 text-xs shadow-xl flex items-center space-x-2 backdrop-blur-md"
          >
            <ShieldCheck size={16} weight="fill" className="text-indigo-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag Over Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center space-y-4 border-2 border-dashed border-indigo-500 pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center animate-bounce">
            <UploadSimple size={36} weight="bold" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white">Drop .app Bundle to Inspect</h3>
            <p className="text-xs text-slate-400">
              myclean will safely analyze the bundle, running processes, and related Library data.
            </p>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="p-6 border-b border-white/[0.06] bg-[#0A0D18]/85 backdrop-blur-md shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">
                Application Studio & Deep Uninstaller
              </h1>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                macOS Native
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Zero Residual Leftovers
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Discover complete application footprints, inspect hidden Library caches, and remove
              orphaned leftovers from deleted apps.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                if (appActiveTab === "installed") {
                  scanApplications();
                } else {
                  scanOrphanedData();
                }
              }}
              disabled={isAppsScanning || isOrphanedScanning}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              {isAppsScanning || isOrphanedScanning ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Sparkle size={14} weight="fill" />
                  <span>{appActiveTab === "installed" ? "Rescan Apps" : "Rescan Leftovers"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab Switcher & Metrics */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-black/40 border border-white/[0.06]">
            <button
              onClick={() => setAppActiveTab("installed")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 ${
                appActiveTab === "installed"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <AppWindow size={15} />
              <span>Installed Applications ({installedApps.length})</span>
            </button>

            <button
              onClick={() => setAppActiveTab("orphaned")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-2 ${
                appActiveTab === "orphaned"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Ghost size={15} />
              <span>Orphaned App Leftovers ({orphanedItems.length})</span>
            </button>
          </div>

          <div className="flex items-center space-x-4 text-xs font-mono">
            {appActiveTab === "installed" ? (
              <span className="text-slate-400">
                Total Apps Footprint:{" "}
                <strong className="text-cyan-400 font-semibold">
                  {formatBytes(totalInstalledFootprint)}
                </strong>
              </span>
            ) : (
              <span className="text-slate-400">
                Orphaned Residuals:{" "}
                <strong className="text-rose-400 font-semibold">
                  {formatBytes(orphanedResult?.total_bytes ?? 0)}
                </strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tab 1: Installed Applications */}
        {appActiveTab === "installed" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Filter and Sort Toolbar */}
            <div className="p-4 bg-[#0A0D18] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Search input */}
              <div className="relative flex-1 max-w-sm">
                <MagnifyingGlass
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  placeholder="Filter by name, bundle ID, or publisher..."
                  value={appFilterQuery}
                  onChange={(e) => setAppFilterQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/[0.06] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                {appFilterQuery && (
                  <button
                    onClick={() => setAppFilterQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Sort selector */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 flex items-center space-x-1">
                  <ArrowsDownUp size={13} />
                  <span>Sort:</span>
                </span>
                <select
                  value={appSortBy}
                  onChange={(e) =>
                    setAppSortBy(
                      e.target.value as "total_size" | "binary_size" | "name" | "recent"
                    )
                  }
                  aria-label="Sort installed applications"
                  className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/[0.06] text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="total_size">Total Footprint (Largest)</option>
                  <option value="binary_size">Binary Executable Size</option>
                  <option value="name">Application Name (A-Z)</option>
                  <option value="recent">Recently Modified</option>
                </select>
              </div>
            </div>

            {/* Applications List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {filteredApps.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-3">
                  <AppWindow size={38} className="text-slate-600" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">
                      {appFilterQuery
                        ? "No applications matching query"
                        : "No Applications Discovered"}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      {appFilterQuery
                        ? "Try clearing your search filter to display all installed apps."
                        : "Click 'Rescan Apps' or drag any .app bundle into this window."}
                    </p>
                  </div>
                </div>
              ) : (
                filteredApps.map((app) => {
                  const isSelected =
                    selectedAppForUninstall?.app_path === app.app_path;
                  const dataArtifacts = app.artifacts.filter(
                    (a) => a.kind !== "Application Bundle"
                  );
                  const dataBytes = dataArtifacts.reduce(
                    (acc, a) => acc + (a.allocated_bytes || a.size_bytes),
                    0
                  );

                  return (
                    <div
                      key={app.app_path}
                      className={`p-4 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-indigo-500/[0.05] border-indigo-500/40 shadow-lg shadow-indigo-500/5"
                          : "bg-[#0D101C] border-white/[0.06] hover:border-white/[0.12]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* App Icon & Basic Info */}
                        <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                          {app.icon_data_url ? (
                            <img
                              src={app.icon_data_url}
                              alt={app.name}
                              className="w-11 h-11 rounded-xl object-contain shadow bg-black/40 p-1 border border-white/[0.06] shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                              <AppWindow size={22} />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-white truncate">
                                {app.name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono px-1.5 py-0.5 rounded bg-white/[0.03]">
                                v{app.version}
                              </span>

                              {/* Running Badge */}
                              {app.is_running ? (
                                <span className="text-[9px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25 flex items-center space-x-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <span>Running (PID {app.running_pids[0]})</span>
                                </span>
                              ) : (
                                <span className="text-[9px] uppercase text-slate-500 bg-white/[0.02] px-1.5 py-0.5 rounded">
                                  Idle
                                </span>
                              )}

                              {/* Source Badge */}
                              <span className="text-[9px] text-slate-400 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                {app.installation_source}
                              </span>
                            </div>

                            <p
                              className="text-[11px] font-mono text-slate-500 truncate mt-0.5"
                              title={app.bundle_id}
                            >
                              {app.bundle_id}
                            </p>
                          </div>
                        </div>

                        {/* Sizes Breakdown & Actions */}
                        <div className="flex items-center space-x-4 shrink-0">
                          <div className="text-right font-mono">
                            <span className="text-xs font-bold text-white block">
                              {formatBytes(app.total_size_bytes)}
                            </span>
                            <div className="text-[10px] text-slate-500 space-x-2">
                              <span>App: {formatBytes(app.binary_size_bytes)}</span>
                              {dataBytes > 0 && (
                                <span className="text-cyan-400">
                                  Data: {formatBytes(dataBytes)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => openInFinder(app.app_path)}
                              className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors"
                              title="Reveal App in Finder"
                            >
                              <ArrowSquareOut size={14} />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                selectAppForUninstall(isSelected ? null : app)
                              }
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                                isSelected
                                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                                  : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]"
                              }`}
                            >
                              <span>{isSelected ? "Hide Details" : "Inspect & Clean"}</span>
                              <CaretRight
                                size={12}
                                className={`transition-transform ${
                                  isSelected ? "rotate-90" : ""
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Detail Drawer (if selected) */}
                      {isSelected && (
                        <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-4 animate-in fade-in duration-150">
                          {/* Running Alert within drawer */}
                          {app.is_running && (
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center space-x-2">
                              <WarningCircle
                                size={16}
                                weight="fill"
                                className="shrink-0 text-amber-400"
                              />
                              <span>
                                {app.name} is actively running. Uninstallation is protected and
                                locked until you quit the application.
                              </span>
                            </div>
                          )}

                          {/* Artifacts Header & Selectors */}
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-medium">
                              Associated Application Footprint ({app.artifacts.length} locations)
                            </span>
                            <div className="flex items-center space-x-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => selectAllAppArtifacts(true)}
                                className="text-indigo-400 hover:text-indigo-300"
                              >
                                Select All
                              </button>
                              <span className="text-slate-600">|</span>
                              <button
                                type="button"
                                onClick={() => selectAllAppArtifacts(false)}
                                className="text-slate-400 hover:text-slate-300"
                              >
                                Deselect All
                              </button>
                            </div>
                          </div>

                          {/* Artifacts List */}
                          <div className="space-y-1.5">
                            {app.artifacts.map((art) => {
                              const isChecked = selectedArtifactPaths.has(art.path);
                              return (
                                <div
                                  key={art.path}
                                  onClick={() => toggleAppArtifactSelection(art.path)}
                                  className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between text-xs ${
                                    isChecked
                                      ? "bg-white/[0.03] border-white/[0.08]"
                                      : "bg-black/20 border-white/[0.02] opacity-60"
                                  }`}
                                >
                                  <div className="flex items-center space-x-3 min-w-0 pr-4">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleAppArtifactSelection(art.path);
                                      }}
                                      className="text-slate-400 hover:text-white"
                                    >
                                      {isChecked ? (
                                        <CheckSquare
                                          size={16}
                                          weight="fill"
                                          className="text-indigo-400"
                                        />
                                      ) : (
                                        <Square size={16} className="text-slate-600" />
                                      )}
                                    </button>

                                    <div className="min-w-0">
                                      <div className="flex items-center space-x-2">
                                        <span className="font-semibold text-white">
                                          {art.kind}
                                        </span>
                                        {/* Confidence Badge */}
                                        <span
                                          className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded border ${
                                            art.confidence === "High"
                                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                              : art.confidence === "ReviewRequired"
                                              ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                              : "bg-rose-500/10 text-rose-300 border-rose-500/20"
                                          }`}
                                        >
                                          {art.confidence === "Protected"
                                            ? "Persistent DB Protected"
                                            : art.confidence}
                                        </span>
                                      </div>
                                      <span
                                        className="text-[11px] font-mono text-slate-500 truncate block mt-0.5"
                                        title={art.path}
                                      >
                                        {truncatePath(art.path, 55)}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-3 shrink-0">
                                    <span className="font-mono text-slate-300 text-xs">
                                      {formatBytes(art.allocated_bytes || art.size_bytes)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openInFinder(art.path);
                                      }}
                                      className="p-1 rounded hover:bg-white/[0.06] text-slate-400 hover:text-white"
                                      title="Reveal in Finder"
                                    >
                                      <ArrowSquareOut size={13} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Drawer Action Bar */}
                          <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                            <div className="text-xs text-slate-400">
                              Selected for removal:{" "}
                              <strong className="text-white font-mono">
                                {selectedArtifactPaths.size} items
                              </strong>
                            </div>

                            <button
                              type="button"
                              onClick={openUninstallModal}
                              disabled={selectedArtifactPaths.size === 0}
                              className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-semibold shadow-lg shadow-rose-600/25 transition-all flex items-center space-x-2 disabled:opacity-40"
                            >
                              <Trash size={14} weight="fill" />
                              <span>Uninstall & Move to Trash...</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Orphaned App Leftovers */}
        {appActiveTab === "orphaned" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Orphaned Summary Bar */}
            <div className="p-4 bg-[#0A0D18] border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-4 text-xs">
                <span className="text-slate-400">
                  Leftovers Found:{" "}
                  <strong className="text-white font-mono">{orphanedItems.length}</strong>
                </span>
                <span className="text-slate-400 border-l border-white/[0.06] pl-4">
                  Reclaimable:{" "}
                  <strong className="text-cyan-400 font-mono font-semibold">
                    {formatBytes(orphanedResult?.total_bytes ?? 0)}
                  </strong>
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => selectAllOrphanedPaths(true)}
                  className="px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-xs font-medium border border-white/[0.06] transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => selectAllOrphanedPaths(false)}
                  className="px-2.5 py-1 rounded bg-white/[0.02] hover:bg-white/[0.05] text-slate-400 text-xs font-medium transition-colors"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Orphaned Items List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {orphanedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-3">
                  <Ghost size={38} className="text-slate-600" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">
                      Zero Orphaned Leftovers Discovered
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Your macOS Library is clean. No leftover caches or saved states from
                      uninstalled applications were detected.
                    </p>
                  </div>
                </div>
              ) : (
                orphanedItems.map((item) => {
                  const isChecked = orphanedSelectedPaths.has(item.path);

                  return (
                    <div
                      key={item.path}
                      onClick={() => toggleOrphanedPathSelection(item.path)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? "bg-rose-500/[0.03] border-rose-500/30"
                          : "bg-[#0D101C] border-white/[0.06] hover:border-white/[0.1]"
                      }`}
                    >
                      <div className="flex items-center space-x-3.5 min-w-0 pr-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOrphanedPathSelection(item.path);
                          }}
                          className="text-slate-400 hover:text-white"
                        >
                          {isChecked ? (
                            <CheckSquare
                              size={18}
                              weight="fill"
                              className="text-rose-400"
                            />
                          ) : (
                            <Square size={18} className="text-slate-600" />
                          )}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-white truncate">
                              {item.bundle_id}
                            </span>
                            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                              {item.kind}
                            </span>
                            <span
                              className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                                item.confidence === "High"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                              }`}
                            >
                              {item.confidence}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {item.explanation}
                          </p>

                          <span
                            className="text-[10px] font-mono text-slate-500 truncate block mt-0.5"
                            title={item.path}
                          >
                            {truncatePath(item.path, 60)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 shrink-0">
                        <span className="text-xs font-mono font-bold text-cyan-400">
                          {formatBytes(item.allocated_bytes || item.size_bytes)}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openInFinder(item.path);
                          }}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
                          title="Reveal in Finder"
                        >
                          <ArrowSquareOut size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sticky Action Bar for Orphaned Cleanups */}
            {orphanedSelectedPaths.size > 0 && (
              <div className="p-4 border-t border-white/[0.06] bg-[#0A0D18]/95 backdrop-blur-md flex items-center justify-between shrink-0 shadow-2xl">
                <div className="flex items-center space-x-4 text-xs">
                  <div className="text-slate-300">
                    Selected Orphaned Files:{" "}
                    <strong className="text-rose-400 font-mono font-semibold">
                      {orphanedSelectedPaths.size}
                    </strong>
                  </div>
                  <div className="text-slate-400 border-l border-white/[0.06] pl-4">
                    Reclaimable:{" "}
                    <strong className="text-cyan-400 font-mono font-semibold">
                      {formatBytes(orphanedSelectedBytes)}
                    </strong>
                  </div>
                  <div className="text-[11px] text-emerald-400 flex items-center space-x-1 border-l border-white/[0.06] pl-4">
                    <ShieldCheck size={14} weight="fill" />
                    <span>Moved to macOS Trash (Recoverable)</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCleanOrphanedSelected}
                  disabled={isCleaningOrphaned}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-semibold shadow-lg shadow-rose-600/25 transition-all flex items-center space-x-2 disabled:opacity-50"
                >
                  {isCleaningOrphaned ? (
                    <>
                      <CircleNotch size={14} className="animate-spin" />
                      <span>Trashing Leftovers...</span>
                    </>
                  ) : (
                    <>
                      <Trash size={15} weight="fill" />
                      <span>Clean Selected Leftovers</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
