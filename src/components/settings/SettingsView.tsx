import React, { useEffect, useState } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import {
  ShieldCheck,
  Plus,
  X,
  Lock,
} from "@phosphor-icons/react";

export const SettingsView: React.FC = () => {
  const {
    cleanupMethod,
    setCleanupMethod,
    dryRunMode,
    setDryRunMode,
    whitelist,
    fetchWhitelist,
    addWhitelist,
    removeWhitelist,
  } = useFluxStore();

  const [newPath, setNewPath] = useState("");
  const [newReason, setNewReason] = useState("");

  useEffect(() => {
    fetchWhitelist();
  }, []);

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim()) return;
    await addWhitelist(newPath.trim(), newReason.trim() || "User protected directory");
    setNewPath("");
    setNewReason("");
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Settings & Safety Shield</h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure deletion methods, dry-run simulation, and user-defined protection whitelists.
        </p>
      </div>

      {/* Safety Preference Card */}
      <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
        <div className="flex items-center space-x-2">
          <ShieldCheck size={18} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Deletion Engine Strategy</h2>
        </div>

        <div className="space-y-3">
          <label className="flex items-start space-x-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] cursor-pointer hover:bg-white/[0.04] transition-colors">
            <input
              type="radio"
              name="method"
              checked={cleanupMethod === "trash"}
              onChange={() => setCleanupMethod("trash")}
              className="mt-1 text-indigo-600 focus:ring-0"
            />
            <div>
              <div className="text-xs font-semibold text-white flex items-center space-x-2">
                <span>Move to macOS Trash (Recommended)</span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1 rounded">
                  Recoverable
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Items are safely transported to the native macOS Trash bin so you can easily restore them at any time.
              </p>
            </div>
          </label>

          <label className="flex items-start space-x-3 p-3 rounded-lg bg-white/[0.01] border border-white/[0.03] opacity-60 cursor-not-allowed transition-colors">
            <input
              type="radio"
              name="method"
              checked={false}
              disabled={true}
              className="mt-1 text-slate-600 cursor-not-allowed"
            />
            <div>
              <div className="text-xs font-semibold text-slate-400 flex items-center space-x-2">
                <span>Permanent Immediate Removal</span>
                <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded font-mono">
                  Disabled by Safety Guardrail
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Permanent unlinking is disabled to prevent unrecoverable data loss. All operations strictly route through macOS Recoverable Trash.
              </p>
            </div>
          </label>
        </div>

        {/* Dry-Run Toggle */}
        <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-white block">Dry-Run Simulation Mode</span>
            <p className="text-[11px] text-slate-400">
              Calculate exact reclaimable bytes without deleting or moving any files.
            </p>
          </div>
          <button
            onClick={() => setDryRunMode(!dryRunMode)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              dryRunMode ? "bg-cyan-500" : "bg-white/[0.1]"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                dryRunMode ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Whitelist Manager Card */}
      <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Lock size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Custom Protected Whitelist</h2>
          </div>
          <span className="text-[11px] text-slate-400">{whitelist.length} paths registered</span>
        </div>

        <form onSubmit={handleAddWhitelist} className="flex gap-2">
          <input
            type="text"
            placeholder="/Users/username/Code/my-critical-folder"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 font-mono"
          />
          <input
            type="text"
            placeholder="Reason (e.g. active repo)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            className="w-48 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1"
          >
            <Plus size={14} />
            <span>Add</span>
          </button>
        </form>

        <div className="space-y-1.5">
          {whitelist.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">No custom paths added. System SIP guardrails are still actively enforced.</p>
          ) : (
            whitelist.map((w) => (
              <div
                key={w.id ?? w.path}
                className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]"
              >
                <div>
                  <span className="text-xs font-mono text-white block">{w.path}</span>
                  <span className="text-[11px] text-slate-500">{w.reason}</span>
                </div>
                <button
                  onClick={() => removeWhitelist(w.path)}
                  className="p-1 rounded hover:bg-white/[0.06] text-slate-500 hover:text-rose-400"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
