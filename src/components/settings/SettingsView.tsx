import React, { useEffect, useState } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes } from "../../lib/utils";
import {
  ShieldCheck,
  Plus,
  Trash,
  Lock,
  Bell,
  Database,
  CheckCircle,
  Warning,
  MagnifyingGlass,
  PaintBrush,
  Cpu,
  Info,
} from "@phosphor-icons/react";

type SettingsSection = "general" | "safety" | "exclusions" | "notifications" | "database";

export const SettingsView: React.FC = () => {
  const {
    preferences,
    fetchPreferences,
    updatePreferences,
    allExclusions,
    fetchAllExclusions,
    addCustomExclusion,
    removeCustomExclusion,
    databaseHealth,
    checkDatabaseHealth,
    pruneHistory,
    clearCleanupHistory,
    clearScanHistory,
    sendTestNotification,
  } = useFluxStore();

  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [newExclusionPath, setNewExclusionPath] = useState("");
  const [newExclusionReason, setNewExclusionReason] = useState("");
  const [exclusionFilter, setExclusionFilter] = useState("");
  const [exclusionTab, setExclusionTab] = useState<"all" | "mandatory" | "custom">("all");
  const [exclusionError, setExclusionError] = useState<string | null>(null);

  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [notificationSent, setNotificationSent] = useState(false);
  const [pruneResult, setPruneResult] = useState<string | null>(null);

  useEffect(() => {
    fetchPreferences();
    fetchAllExclusions();
    checkDatabaseHealth();
  }, []);

  const handleAddExclusion = async (e: React.FormEvent) => {
    e.preventDefault();
    setExclusionError(null);
    if (!newExclusionPath.trim()) return;

    const success = await addCustomExclusion(
      newExclusionPath.trim(),
      newExclusionReason.trim() || "User protected directory"
    );

    if (success) {
      setNewExclusionPath("");
      setNewExclusionReason("");
    } else {
      setExclusionError("Could not add exclusion. Ensure path is valid and not covered by mandatory protections.");
    }
  };

  const handlePruneNow = async () => {
    if (!preferences) return;
    const days = preferences.history_retention === "30_days" ? 30
      : preferences.history_retention === "90_days" ? 90
      : preferences.history_retention === "180_days" ? 180 : 0;

    const count = await pruneHistory(days);
    setPruneResult(`Pruned ${count} records older than retention threshold.`);
    setTimeout(() => setPruneResult(null), 4000);
  };

  const handleTestNotification = async () => {
    await sendTestNotification();
    setNotificationSent(true);
    setTimeout(() => setNotificationSent(false), 3000);
  };

  // Filter exclusions
  const filteredExclusions = allExclusions.filter((item) => {
    if (exclusionTab === "mandatory" && !item.is_mandatory) return false;
    if (exclusionTab === "custom" && item.is_mandatory) return false;
    if (!exclusionFilter.trim()) return true;
    const q = exclusionFilter.toLowerCase();
    return (
      item.path.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.reason.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center space-x-2">
          <span>Settings & Safety Shield</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
            Local-First
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Customize system analysis scopes, appearance, safety guardrails, and persistent exclusions.
        </p>
      </div>

      {/* Navigation Pills */}
      <div className="flex items-center space-x-2 border-b border-white/[0.06] pb-3">
        {[
          { id: "general", label: "General & Appearance", icon: PaintBrush },
          { id: "safety", label: "Safety & Privacy", icon: ShieldCheck },
          { id: "exclusions", label: "Exclusions Manager", icon: Lock },
          { id: "notifications", label: "Notifications & Alerts", icon: Bell },
          { id: "database", label: "Database Maintenance", icon: Database },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as SettingsSection)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-violet-600/20 text-violet-300 border border-violet-500/30 shadow-lg shadow-violet-950/20"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. General & Appearance Section */}
      {activeSection === "general" && preferences && (
        <div className="space-y-6">
          {/* Appearance Card */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
            <div className="flex items-center space-x-2">
              <PaintBrush size={18} className="text-violet-400" />
              <h2 className="text-sm font-semibold text-white">Interface & Visual Theme</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["dark", "system", "light"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => updatePreferences({ theme: t })}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    preferences.theme === t
                      ? "bg-violet-600/10 border-violet-500/40 text-white"
                      : "bg-white/[0.02] border-white/[0.05] text-slate-400 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold capitalize text-white">{t} Theme</span>
                    {preferences.theme === t && <CheckCircle size={14} className="text-violet-400" weight="fill" />}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {t === "dark" ? "Deep navy & void black palette (Recommended)" : t === "system" ? "Automatically match macOS system setting" : "High-contrast clean surface mode"}
                  </p>
                </button>
              ))}
            </div>

            {/* Accent Color */}
            <div className="pt-3 border-t border-white/[0.04] space-y-2">
              <span className="text-xs font-semibold text-white block">Accent Pulse Color</span>
              <div className="flex space-x-3">
                {[
                  { id: "violet", label: "Electric Violet", color: "bg-[#8B5CF6]" },
                  { id: "cyan", label: "Cyan Pulse", color: "bg-[#06B6D4]" },
                  { id: "indigo", label: "Hyper Indigo", color: "bg-[#6366F1]" },
                ].map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => updatePreferences({ accent_color: acc.id as any })}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                      preferences.accent_color === acc.id
                        ? "border-white/30 bg-white/[0.06] text-white"
                        : "border-white/[0.05] text-slate-400 hover:bg-white/[0.02]"
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${acc.color}`} />
                    <span>{acc.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Animation Intensity */}
            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white block">Motion & Spring Animations</span>
                <p className="text-[11px] text-slate-400">
                  Control physics-based spring transitions and scanning radars.
                </p>
              </div>
              <div className="flex space-x-2">
                {(["full", "reduced", "off"] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => updatePreferences({ animation_intensity: level })}
                    className={`px-3 py-1 rounded-md text-[11px] font-medium border capitalize ${
                      preferences.animation_intensity === level
                        ? "bg-violet-600/20 border-violet-500/40 text-violet-300"
                        : "border-white/[0.06] text-slate-400 hover:text-white"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Engine & Resources Card */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
            <div className="flex items-center space-x-2">
              <Cpu size={18} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Scanner Engine & Resource Limits</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block">Parallel CPU Thread Concurrency</span>
                  <p className="text-[11px] text-slate-400">
                    Controls Rayon parallel worker thread limits during filesystem sweeps.
                  </p>
                </div>
                <select
                  value={preferences.cpu_thread_limit}
                  onChange={(e) => updatePreferences({ cpu_thread_limit: parseInt(e.target.value) })}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none"
                >
                  <option value={0} className="bg-slate-900">Auto (All Available Cores)</option>
                  <option value={2} className="bg-slate-900">2 Threads (Battery Saver)</option>
                  <option value={4} className="bg-slate-900">4 Threads (Balanced)</option>
                  <option value={8} className="bg-slate-900">8 Threads (High Performance)</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <div>
                  <span className="text-xs font-semibold text-white block">Large File Analysis Threshold</span>
                  <p className="text-[11px] text-slate-400">
                    Files exceeding this size require review and are flagged in the large files analyzer.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={10}
                    max={10000}
                    value={preferences.large_file_threshold_mb}
                    onChange={(e) => updatePreferences({ large_file_threshold_mb: parseInt(e.target.value) || 100 })}
                    className="w-20 px-2.5 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-xs text-right font-mono text-white focus:outline-none"
                  />
                  <span className="text-xs text-slate-400 font-mono">MB</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Safety & Privacy Section */}
      {activeSection === "safety" && preferences && (
        <div className="space-y-6">
          {/* Deletion Strategy Card */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
            <div className="flex items-center space-x-2">
              <ShieldCheck size={18} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Recoverable Deletion Invariant</h2>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-start space-x-3">
                <CheckCircle size={18} className="text-emerald-400 mt-0.5 shrink-0" weight="fill" />
                <div>
                  <div className="text-xs font-semibold text-white flex items-center space-x-2">
                    <span>Move to macOS Trash (Only Supported Strategy)</span>
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                      ENFORCED BY RUST ENGINE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    All cleaned items are transported to native macOS Trash (<code className="text-emerald-300">~/.Trash</code>).
                    Items can be easily inspected and restored at any time via Finder.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-white/[0.01] border border-white/[0.04] opacity-50 flex items-start space-x-3 cursor-not-allowed">
                <Lock size={18} className="text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-400 flex items-center space-x-2">
                    <span>Direct Permanent Unlinking</span>
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                      Permanently Disabled
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Permanent deletion (<code className="text-slate-400">unlink / rm -rf</code>) is strictly locked out by the systems architecture to prevent unrecoverable data loss.
                  </p>
                </div>
              </div>
            </div>

            {/* Dry-Run Default */}
            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white block">Default to Dry-Run Simulation</span>
                <p className="text-[11px] text-slate-400">
                  Pre-selects Dry Run mode across all cleanup dialogs to require simulation before trashing.
                </p>
              </div>
              <button
                onClick={() => updatePreferences({ dry_run_default: !preferences.dry_run_default })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  preferences.dry_run_default ? "bg-cyan-500" : "bg-white/[0.1]"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                    preferences.dry_run_default ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* Confirmation policy */}
            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white block">Require Double Confirmation</span>
                <p className="text-[11px] text-slate-400">
                  Always display a detailed itemization modal before executing any file operations.
                </p>
              </div>
              <button
                onClick={() => updatePreferences({ confirm_before_cleanup: !preferences.confirm_before_cleanup })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  preferences.confirm_before_cleanup ? "bg-violet-600" : "bg-white/[0.1]"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                    preferences.confirm_before_cleanup ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Core Protections Overview Card */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
            <div className="flex items-center space-x-2">
              <Lock size={18} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Immutable System & Architecture Guardrails</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-1">
                <span className="font-semibold text-amber-300 block">Docker Volume Protection</span>
                <p className="text-[11px] text-slate-400">
                  Docker volumes store persistent databases and cannot be removed through myclean. Only disposable cache and stopped containers are eligible.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-1">
                <span className="font-semibold text-amber-300 block">Active Application Lock</span>
                <p className="text-[11px] text-slate-400">
                  Applications currently running in memory are locked. The engine refuses to clean caches of running processes to prevent file corruption.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-1">
                <span className="font-semibold text-amber-300 block">System Integrity Protection (SIP)</span>
                <p className="text-[11px] text-slate-400">
                  All macOS root directories (<code className="text-slate-300">/System, /usr, /bin, /Library/Apple</code>) are strictly blacklisted from all scan and clean scopes.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-1">
                <span className="font-semibold text-amber-300 block">Identity & Personal Documents</span>
                <p className="text-[11px] text-slate-400">
                  Keychains, Mail databases, Messages, and user folders (<code className="text-slate-300">~/Documents, ~/Desktop</code>) are strictly protected by design.
                </p>
              </div>
            </div>

            {/* Privacy Declaration */}
            <div className="p-3.5 rounded-lg bg-violet-500/5 border border-violet-500/20 flex items-center space-x-3">
              <Info size={20} className="text-violet-400 shrink-0" />
              <p className="text-[11px] text-slate-300">
                <strong className="text-white">Zero Telemetry Promise:</strong> myclean contains zero analytics trackers, zero cloud sync daemons, and zero background network calls. All scans and history stay 100% on your local machine.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Exclusions Manager Section */}
      {activeSection === "exclusions" && (
        <div className="space-y-6">
          {/* Add Custom Exclusion Form */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Add Custom Exclusion</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Protect any project directory, repository, or private folder from all scanners and cleaning operations.
              </p>
            </div>

            <form onSubmit={handleAddExclusion} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="/Users/username/Workspace/my-repo"
                  value={newExclusionPath}
                  onChange={(e) => setNewExclusionPath(e.target.value)}
                  className="md:col-span-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 font-mono"
                />
                <input
                  type="text"
                  placeholder="Reason (e.g. active client project)"
                  value={newExclusionReason}
                  onChange={(e) => setNewExclusionReason(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                />
              </div>

              {exclusionError && (
                <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg flex items-center space-x-2">
                  <Warning size={14} />
                  <span>{exclusionError}</span>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!newExclusionPath.trim()}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-40 transition-colors shadow-lg shadow-violet-950/20"
                >
                  <Plus size={14} />
                  <span>Register Exclusion</span>
                </button>
              </div>
            </form>
          </div>

          {/* Exclusions Directory Table */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Registered Exclusions & Guardrails</h2>
                <span className="text-[11px] text-slate-400">{filteredExclusions.length} exclusions active</span>
              </div>

              <div className="flex items-center space-x-3 w-full md:w-auto">
                <div className="flex items-center space-x-1 bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.06]">
                  {(["all", "mandatory", "custom"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setExclusionTab(tab)}
                      className={`px-2.5 py-1 rounded text-[11px] capitalize font-medium ${
                        exclusionTab === tab
                          ? "bg-violet-600/30 text-violet-300 font-semibold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="relative flex-1 md:w-48">
                  <MagnifyingGlass size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search exclusions..."
                    value={exclusionFilter}
                    onChange={(e) => setExclusionFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="divide-y divide-white/[0.04] max-h-96 overflow-y-auto rounded-lg border border-white/[0.04]">
              {filteredExclusions.map((excl, i) => (
                <div
                  key={`${excl.path}-${i}`}
                  className="p-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 pr-4 space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-medium text-white truncate">
                        {excl.path}
                      </span>
                      {excl.is_mandatory ? (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center space-x-1">
                          <Lock size={10} />
                          <span>MANDATORY</span>
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          USER CUSTOM
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                      <span className="text-violet-400 font-medium">{excl.category}</span>
                      <span>•</span>
                      <span>{excl.reason}</span>
                    </div>
                  </div>

                  {!excl.is_mandatory && (
                    <button
                      onClick={() => removeCustomExclusion(excl.path)}
                      className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Remove exclusion"
                    >
                      <Trash size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Notifications & Alerts Section */}
      {activeSection === "notifications" && preferences && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bell size={18} className="text-violet-400" />
                <h2 className="text-sm font-semibold text-white">System Banners & Scan Reminders</h2>
              </div>
              <button
                onClick={handleTestNotification}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white border border-white/[0.08] transition-colors"
              >
                {notificationSent ? "Notification Dispatched!" : "Send Test Banner"}
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block">Scan Completion Banner</span>
                  <p className="text-[11px] text-slate-400">Notify when background filesystem analysis concludes.</p>
                </div>
                <button
                  onClick={() => updatePreferences({ notify_scan_complete: !preferences.notify_scan_complete })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    preferences.notify_scan_complete ? "bg-violet-600" : "bg-white/[0.1]"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      preferences.notify_scan_complete ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <div>
                  <span className="text-xs font-semibold text-white block">Cleanup Completion Banner</span>
                  <p className="text-[11px] text-slate-400">Notify when files have been moved to macOS Trash.</p>
                </div>
                <button
                  onClick={() => updatePreferences({ notify_clean_complete: !preferences.notify_clean_complete })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    preferences.notify_clean_complete ? "bg-violet-600" : "bg-white/[0.1]"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      preferences.notify_clean_complete ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <div>
                  <span className="text-xs font-semibold text-white block">Cleanup Issue / Permission Alert</span>
                  <p className="text-[11px] text-slate-400">Notify if items fail to move to Trash or permission errors occur.</p>
                </div>
                <button
                  onClick={() => updatePreferences({ notify_clean_failure: !preferences.notify_clean_failure })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    preferences.notify_clean_failure ? "bg-violet-600" : "bg-white/[0.1]"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      preferences.notify_clean_failure ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <div>
                  <span className="text-xs font-semibold text-white block">Low Disk Storage Warning</span>
                  <p className="text-[11px] text-slate-400">Alert when primary drive drops below threshold.</p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={preferences.low_disk_warning_threshold_gb}
                      onChange={(e) => updatePreferences({ low_disk_warning_threshold_gb: parseInt(e.target.value) || 15 })}
                      className="w-16 px-2 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-xs text-right font-mono text-white focus:outline-none"
                    />
                    <span className="text-xs text-slate-400 font-mono">GB</span>
                  </div>
                  <button
                    onClick={() => updatePreferences({ notify_low_disk_space: !preferences.notify_low_disk_space })}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      preferences.notify_low_disk_space ? "bg-violet-600" : "bg-white/[0.1]"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                        preferences.notify_low_disk_space ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <div>
                  <span className="text-xs font-semibold text-white block">Scheduled Scan Reminders</span>
                  <p className="text-[11px] text-slate-400">Periodic reminders to scan and inspect junk build-up.</p>
                </div>
                <select
                  value={preferences.scan_reminder_interval}
                  onChange={(e) => updatePreferences({ scan_reminder_interval: e.target.value as any })}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none"
                >
                  <option value="off" className="bg-slate-900">Disabled</option>
                  <option value="daily" className="bg-slate-900">Daily Reminder</option>
                  <option value="weekly" className="bg-slate-900">Weekly Reminder (Recommended)</option>
                  <option value="monthly" className="bg-slate-900">Monthly Reminder</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.04] text-[11px] text-slate-400 flex items-center space-x-2">
              <Info size={14} className="text-cyan-400 shrink-0" />
              <span>Reminders use native macOS UserNotification API only. No privileged background daemon is installed.</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Database Maintenance Section */}
      {activeSection === "database" && databaseHealth && preferences && (
        <div className="space-y-6">
          {/* Health Card */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database size={18} className="text-cyan-400" />
                <h2 className="text-sm font-semibold text-white">SQLite Storage & Integrity Health</h2>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                databaseHealth.is_healthy
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}>
                STATUS: {databaseHealth.integrity_status.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Database Size</span>
                <span className="text-base font-bold font-mono text-white mt-0.5 block">
                  {formatBytes(databaseHealth.database_size_bytes)}
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Schema Version</span>
                <span className="text-base font-bold font-mono text-cyan-400 mt-0.5 block">
                  v{databaseHealth.schema_version}
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Cleanup Records</span>
                <span className="text-base font-bold font-mono text-white mt-0.5 block">
                  {databaseHealth.total_cleanup_records}
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Active Exclusions</span>
                <span className="text-base font-bold font-mono text-violet-400 mt-0.5 block">
                  {databaseHealth.total_exclusions}
                </span>
              </div>
            </div>

            {/* Retention selector */}
            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white block">Audit History Retention Period</span>
                <p className="text-[11px] text-slate-400">
                  Automatically prune audit logs older than this duration to maintain optimal database size.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={preferences.history_retention}
                  onChange={(e) => updatePreferences({ history_retention: e.target.value as any })}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none"
                >
                  <option value="30_days" className="bg-slate-900">30 Days</option>
                  <option value="90_days" className="bg-slate-900">90 Days (Recommended)</option>
                  <option value="180_days" className="bg-slate-900">180 Days</option>
                  <option value="forever" className="bg-slate-900">Forever</option>
                </select>
                <button
                  onClick={handlePruneNow}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-slate-300 transition-colors"
                >
                  Prune Now
                </button>
              </div>
            </div>

            {pruneResult && (
              <div className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                {pruneResult}
              </div>
            )}
          </div>

          {/* Destructive Maintenance Card */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-rose-500/20 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-rose-400 flex items-center space-x-2">
                <Warning size={16} />
                <span>Privacy & Audit Data Clearing</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Permanently clears SQLite activity history. Does not affect files already moved to macOS Trash.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowClearHistoryConfirm(true)}
                className="px-3.5 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors"
              >
                Clear Cleanup History
              </button>
              <button
                onClick={() => clearScanHistory(true)}
                className="px-3.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 text-xs font-semibold transition-colors"
              >
                Clear Scan Snapshots
              </button>
            </div>

            {showClearHistoryConfirm && (
              <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 space-y-2">
                <span className="text-xs font-semibold text-white block">
                  Confirm History Clearing?
                </span>
                <p className="text-[11px] text-slate-300">
                  This will wipe all operation records and statistics from SQLite. This cannot be undone.
                </p>
                <div className="flex space-x-2 pt-1">
                  <button
                    onClick={() => {
                      clearCleanupHistory(true);
                      setShowClearHistoryConfirm(false);
                    }}
                    className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                  >
                    Confirm & Wipe
                  </button>
                  <button
                    onClick={() => setShowClearHistoryConfirm(false)}
                    className="px-3 py-1 rounded bg-white/[0.06] text-slate-300 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
