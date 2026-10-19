import React, { useState, useEffect } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes } from "../../lib/utils";
import { api } from "../../lib/api";
import type { NavigationTab } from "../../types";
import {
  House,
  Broom,
  Code,
  ChartPieSlice,
  FileArchive,
  CopySimple,
  AppWindow,
  ClockCounterClockwise,
  GearSix,
  HardDrive,
  ArrowsClockwise,
  Trash,
} from "@phosphor-icons/react";

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Overview", icon: House },
  { id: "deep-clean", label: "Deep Clean", icon: Broom },
  { id: "storage-analyzer", label: "Storage Analyzer", icon: ChartPieSlice, badge: "Treemap" },
  { id: "developer", label: "Developer Space", icon: Code, badge: "Dev" },
  { id: "large-files", label: "Large & Old Files", icon: FileArchive },
  { id: "duplicates", label: "Duplicate Finder", icon: CopySimple },
  { id: "apps", label: "App Uninstaller", icon: AppWindow },
  { id: "history", label: "History & Logs", icon: ClockCounterClockwise },
  { id: "settings", label: "Settings & Safety", icon: GearSix },
];

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    systemSummary,
    scanResult,
    fetchSystemSummary,
    isSystemLoading,
  } = useFluxStore();
  const primaryDisk = systemSummary?.primary_disk;
  const totalBytesReclaimable = scanResult?.total_bytes ?? 0;
  const trashBytes = systemSummary?.trash_bytes ?? 0;
  const trashItemCount = systemSummary?.trash_item_count ?? 0;

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-refresh metrics whenever the user switches focus back to the app window
  useEffect(() => {
    const handleFocus = () => {
      fetchSystemSummary();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchSystemSummary]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    try {
      await fetchSystemSummary();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const isSpinning = isRefreshing || isSystemLoading;

  return (
    <aside className="w-64 h-full bg-[#080A12]/85 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col justify-between p-3 select-none">
      {/* Brand & Workspace */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2.5 px-3 py-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shadow-lg shadow-violet-500/20 border border-white/10 bg-[#0D0F18]/80">
            <img src="/logo.png" alt="myclean logo" className="w-full h-full object-contain p-0.5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white flex items-center space-x-1.5">
              <span>myclean</span>
              <span className="text-[10px] font-mono text-cyan-400 font-semibold">v1.0</span>
            </div>
            <p className="text-[11px] text-slate-400">macOS Optimization Studio</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 group relative ${
                  isActive
                    ? "bg-indigo-600/15 text-white border border-indigo-500/30 shadow-sm shadow-indigo-500/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Icon
                    size={17}
                    weight={isActive ? "fill" : "regular"}
                    className={`transition-colors ${
                      isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Storage Quick Widget */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-medium">
            <HardDrive size={14} className="text-indigo-400 shrink-0" />
            <span className="truncate">Macintosh HD</span>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isSpinning}
              title="Refresh available storage & Trash size"
              className="p-1 rounded-md hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <ArrowsClockwise
                size={13}
                className={`transition-transform duration-300 ${
                  isSpinning ? "animate-spin text-cyan-400" : "group-hover:text-slate-200"
                }`}
              />
            </button>
            {primaryDisk && (
              <span className="text-[10px] font-mono text-slate-400 font-medium">
                {primaryDisk.usage_percentage}%
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500"
            style={{ width: `${primaryDisk?.usage_percentage ?? 50}%` }}
          />
        </div>

        {/* Available Storage */}
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Available</span>
          <span className="font-mono text-slate-200 font-medium">
            {primaryDisk ? formatBytes(primaryDisk.available_bytes) : "Calculating..."}
          </span>
        </div>

        {/* macOS Trash Size */}
        <div
          onClick={() => api.openTrashFolder()}
          title="Click to reveal macOS Trash in Finder"
          className="flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer group/trash transition-colors py-0.5 rounded px-1 -mx-1 hover:bg-white/[0.03]"
        >
          <span className="flex items-center space-x-1.5">
            <Trash
              size={13}
              className="text-amber-400/80 group-hover/trash:text-amber-300 transition-colors shrink-0"
            />
            <span>macOS Trash</span>
          </span>
          <div className="flex items-center space-x-1.5 font-mono">
            <span className="text-slate-300 group-hover/trash:text-white font-medium">
              {formatBytes(trashBytes)}
            </span>
            {trashItemCount > 0 && (
              <span className="text-[10px] text-slate-500">
                ({trashItemCount.toLocaleString()} {trashItemCount === 1 ? "item" : "items"})
              </span>
            )}
          </div>
        </div>

        {/* Cleanable Space from Scan */}
        {totalBytesReclaimable > 0 && (
          <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between text-[11px]">
            <span className="text-cyan-400 font-medium">Cleanable</span>
            <span className="font-mono text-cyan-300 font-semibold">
              {formatBytes(totalBytesReclaimable)}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
