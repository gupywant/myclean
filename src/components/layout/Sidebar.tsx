import React from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes } from "../../lib/utils";
import type { NavigationTab } from "../../types";
import {
  House,
  Broom,
  Code,
  FileArchive,
  CopySimple,
  AppWindow,
  ClockCounterClockwise,
  GearSix,
  Sparkle,
  HardDrive,
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
  { id: "developer", label: "Developer Space", icon: Code, badge: "Dev" },
  { id: "large-files", label: "Large & Old Files", icon: FileArchive },
  { id: "duplicates", label: "Duplicate Finder", icon: CopySimple },
  { id: "apps", label: "App Uninstaller", icon: AppWindow },
  { id: "history", label: "History & Logs", icon: ClockCounterClockwise },
  { id: "settings", label: "Settings & Safety", icon: GearSix },
];

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, systemSummary, scanResult } = useFluxStore();
  const primaryDisk = systemSummary?.primary_disk;

  const totalBytesReclaimable = scanResult?.total_bytes ?? 0;

  return (
    <aside className="w-64 h-full bg-[#080A12]/85 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col justify-between p-3 select-none">
      {/* Brand & Workspace */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2.5 px-3 py-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-white/10">
            <Sparkle size={18} weight="fill" className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white flex items-center space-x-1.5">
              <span>FLUX</span>
              <span className="text-[10px] font-mono text-cyan-400 font-semibold">v1.0</span>
            </div>
            <p className="text-[11px] text-slate-400">High-Performance Studio</p>
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
            <HardDrive size={14} className="text-indigo-400" />
            <span>Macintosh HD</span>
          </div>
          {primaryDisk && (
            <span className="text-[10px] font-mono text-slate-400">
              {primaryDisk.usage_percentage}%
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500"
            style={{ width: `${primaryDisk?.usage_percentage ?? 50}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Available</span>
          <span className="font-mono text-slate-300">
            {primaryDisk ? formatBytes(primaryDisk.available_bytes) : "Calculating..."}
          </span>
        </div>

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
