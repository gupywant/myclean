import React from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, truncatePath } from "../../lib/utils";
import confetti from "canvas-confetti";
import {
  ShieldCheck,
  Lightning,
  X,
  CircleNotch,
  Flask,
  Trash,
  WarningCircle,
  AppWindow,
} from "@phosphor-icons/react";

export const AppUninstallModal: React.FC = () => {
  const {
    showUninstallModal,
    closeUninstallModal,
    selectedAppForUninstall,
    selectedArtifactPaths,
    dryRunMode,
    setDryRunMode,
    executeUninstall,
    isUninstalling,
  } = useFluxStore();

  if (!showUninstallModal || !selectedAppForUninstall) return null;

  const app = selectedAppForUninstall;

  // Selected artifacts to delete
  const targetedArtifacts = app.artifacts.filter((a) =>
    selectedArtifactPaths.has(a.path)
  );

  const totalAllocatedBytes = targetedArtifacts.reduce(
    (acc, a) => acc + (a.allocated_bytes || a.size_bytes),
    0
  );
  const totalLogicalBytes = targetedArtifacts.reduce(
    (acc, a) => acc + a.size_bytes,
    0
  );

  const containsBundle = selectedArtifactPaths.has(app.app_path);
  const isAppRunning = app.is_running;

  const handleProceed = async () => {
    if (isAppRunning && !dryRunMode) {
      return;
    }
    const res = await executeUninstall();
    if (res?.success && !dryRunMode && res.items_deleted > 0) {
      confetti({
        particleCount: 85,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#6366F1", "#8B5CF6", "#06B6D4", "#10B981"],
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-2xl bg-[#0D101C] border border-white/[0.1] shadow-2xl p-6 space-y-5 animate-in fade-in duration-200 max-h-[90vh] flex flex-col">
        {/* Header with App Identity */}
        <div className="flex items-start justify-between shrink-0">
          <div className="flex items-center space-x-3.5">
            {app.icon_data_url ? (
              <img
                src={app.icon_data_url}
                alt={app.name}
                className="w-12 h-12 rounded-xl object-contain shadow-md bg-black/30 p-1 border border-white/[0.08]"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <AppWindow size={26} />
              </div>
            )}
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">{app.name}</h2>
                <span className="text-[10px] text-slate-400 font-mono px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                  v{app.version}
                </span>
                {app.is_system_app && (
                  <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    System App
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-xs">
                {app.bundle_id}
              </p>
            </div>
          </div>

          <button
            onClick={closeUninstallModal}
            disabled={isUninstalling}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Running Application Alert Banner (Strict Guardrail) */}
        {isAppRunning && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1.5 shrink-0">
            <div className="flex items-center space-x-2 text-rose-300 text-xs font-semibold">
              <WarningCircle size={17} weight="fill" className="text-rose-400 shrink-0" />
              <span>Application Is Actively Running</span>
            </div>
            <p className="text-[11px] text-rose-200/90 leading-relaxed">
              <strong>{app.name}</strong> or its bundled helper processes are currently active on
              macOS (PIDs: {app.running_pids.join(", ")}). To prevent file locking conflicts and
              unstable states, you must quit {app.name} before uninstallation can proceed.
            </p>
          </div>
        )}

        {/* Mode Toggle Bar */}
        <div className="p-1 rounded-xl bg-black/40 border border-white/[0.06] flex items-center gap-1 shrink-0">
          <button
            onClick={() => setDryRunMode(false)}
            disabled={isUninstalling}
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
            disabled={isUninstalling}
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

        {/* Metric Summary Grid */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] grid grid-cols-3 gap-3 shrink-0">
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
              Targets Selected
            </span>
            <span className="text-lg font-bold font-mono text-white">
              {targetedArtifacts.length} item{targetedArtifacts.length === 1 ? "" : "s"}
            </span>
            <span className="text-[10px] text-slate-500 block">
              {containsBundle ? "Includes .app Bundle" : "Caches & Data only"}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">
              Safety Guard
            </span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center space-x-1 mt-1">
              <ShieldCheck size={14} weight="fill" />
              <span>100% Trash-Only</span>
            </span>
            <span className="text-[10px] text-slate-500 block">
              Zero permanent deletion
            </span>
          </div>
        </div>

        {/* Items Queue Preview */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 space-y-1.5">
          <span className="text-[10px] uppercase font-semibold text-slate-500 shrink-0">
            Locations Queued for Removal:
          </span>
          <div className="flex-1 overflow-y-auto rounded-xl bg-black/40 p-3 border border-white/[0.04] space-y-2 font-mono text-xs">
            {targetedArtifacts.map((art) => (
              <div
                key={art.path}
                className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.03] gap-2"
              >
                <div className="flex items-center space-x-2 truncate min-w-0">
                  <span
                    className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      art.kind === "Application Bundle"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    }`}
                  >
                    {art.kind}
                  </span>
                  <span className="truncate text-slate-300" title={art.path}>
                    {truncatePath(art.path, 50)}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {formatBytes(art.allocated_bytes || art.size_bytes)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Safety Note */}
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2 shrink-0">
          <ShieldCheck size={16} weight="fill" className="shrink-0 text-emerald-400" />
          <span>
            {dryRunMode
              ? "Dry-Run simulation will verify permissions without moving any files."
              : "Items will be moved to macOS Trash (100% recoverable). Databases and personal user files remain protected."}
          </span>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] shrink-0">
          <div />

          <div className="flex items-center space-x-3">
            <button
              onClick={closeUninstallModal}
              disabled={isUninstalling}
              className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 border border-white/[0.06] transition-colors disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              onClick={handleProceed}
              disabled={isUninstalling || targetedArtifacts.length === 0 || (isAppRunning && !dryRunMode)}
              className={`px-5 py-2 rounded-xl text-xs font-semibold text-white shadow-lg transition-all flex items-center space-x-2 disabled:opacity-40 ${
                dryRunMode
                  ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/25"
                  : isAppRunning
                  ? "bg-slate-700 cursor-not-allowed text-slate-400"
                  : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/25"
              }`}
            >
              {isUninstalling ? (
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
                      : isAppRunning
                      ? "Quit App to Uninstall"
                      : containsBundle
                      ? "Confirm & Move App to Trash"
                      : "Confirm & Move Data to Trash"}
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
