import React from "react";
import { useCleanStore } from "../../store/useCleanStore";
import { formatBytes } from "../../lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
  HardDrives,
  AppWindow,
  Globe,
  Code,
  FileText,
  Trash,
  Package,
  CheckCircle,
  CircleNotch,
  Clock,
  MinusCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import type { CategoryScanStatus } from "../../types";

interface CategoryMeta {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  glowColor: string;
}

const CATEGORY_DEFINITIONS: CategoryMeta[] = [
  {
    id: "system_cache",
    name: "System Cache",
    description: "macOS system cache buffers & update packages",
    icon: <HardDrives size={20} weight="duotone" />,
    accentColor: "text-indigo-400",
    glowColor: "rgba(99, 102, 241, 0.2)",
  },
  {
    id: "app_cache",
    name: "Application Cache",
    description: "Third-party application runtime caches & buffers",
    icon: <AppWindow size={20} weight="duotone" />,
    accentColor: "text-cyan-400",
    glowColor: "rgba(6, 182, 212, 0.2)",
  },
  {
    id: "browser_cache",
    name: "Browser Cache",
    description: "Chrome, Safari, Brave & messaging preview buffers",
    icon: <Globe size={20} weight="duotone" />,
    accentColor: "text-violet-400",
    glowColor: "rgba(139, 92, 246, 0.2)",
  },
  {
    id: "developer_cache",
    name: "Developer Cache",
    description: "Xcode DerivedData, Cargo, Gradle, npm & Homebrew",
    icon: <Code size={20} weight="duotone" />,
    accentColor: "text-emerald-400",
    glowColor: "rgba(16, 185, 129, 0.2)",
  },
  {
    id: "logs_and_temp",
    name: "Logs & Temp Files",
    description: "Diagnostic reports, crash logs & telemetry",
    icon: <FileText size={20} weight="duotone" />,
    accentColor: "text-amber-400",
    glowColor: "rgba(245, 158, 11, 0.2)",
  },
  {
    id: "user_trash",
    name: "macOS Trash",
    description: "Pending discarded files taking up storage",
    icon: <Trash size={20} weight="duotone" />,
    accentColor: "text-rose-400",
    glowColor: "rgba(244, 63, 94, 0.2)",
  },
  {
    id: "docker",
    name: "Docker Resources",
    description: "Dangling Docker images & BuildKit builder cache",
    icon: <Package size={20} weight="duotone" />,
    accentColor: "text-sky-400",
    glowColor: "rgba(56, 189, 248, 0.2)",
  },
];

export const ScanCategoryPanel: React.FC = () => {
  const { categoryStates, setActiveTab } = useCleanStore();
  const shouldReduceMotion = useReducedMotion();

  const renderStatusBadge = (status: CategoryScanStatus, bytes: number, items: number, skipReason?: string) => {
    switch (status) {
      case "scanning":
        return (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-[10px] font-semibold uppercase tracking-wider font-mono">
            <CircleNotch size={12} className="animate-spin text-cyan-400" />
            <span>Scanning</span>
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px] font-mono font-medium">
            <CheckCircle size={13} weight="fill" className="text-emerald-400" />
            <span>
              {bytes > 0 ? `${formatBytes(bytes, 0)} (${items})` : "Clean"}
            </span>
          </div>
        );
      case "skipped":
        return (
          <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-400 text-[10px] font-mono truncate max-w-[130px]" title={skipReason || "Skipped"}>
            <MinusCircle size={12} />
            <span className="truncate">{skipReason ? "Skipped" : "Skipped"}</span>
          </div>
        );
      case "partial":
        return (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-mono">
            <WarningCircle size={12} weight="fill" className="text-amber-400" />
            <span>Partial</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[10px] font-mono">
            <WarningCircle size={12} weight="fill" className="text-rose-400" />
            <span>Error</span>
          </div>
        );
      case "pending":
      default:
        return (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-slate-500 text-[10px] font-mono">
            <Clock size={11} />
            <span>Waiting</span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
          <span>Target Categories</span>
          <span className="text-[10px] font-mono font-normal text-slate-500">
            ({CATEGORY_DEFINITIONS.length} stages)
          </span>
        </h2>
        <button
          onClick={() => setActiveTab("deep-clean")}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
        >
          Detailed Inspector &rarr;
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {CATEGORY_DEFINITIONS.map((def) => {
          const state = categoryStates[def.id] || {
            status: "pending" as CategoryScanStatus,
            progress: 0,
            itemsFound: 0,
            bytesFound: 0,
          };

          const isCurrentScanning = state.status === "scanning";

          return (
            <motion.div
              key={def.id}
              whileHover={shouldReduceMotion ? {} : { y: -2 }}
              onClick={() => setActiveTab(def.id === "docker" ? "developer" : "deep-clean")}
              className={`relative overflow-hidden rounded-xl bg-[#0D101C] border p-4 cursor-pointer transition-all duration-200 flex flex-col justify-between space-y-3 group ${
                isCurrentScanning
                  ? "border-cyan-500/50 shadow-lg shadow-cyan-500/10 bg-[#0F1426]"
                  : "border-white/[0.06] hover:border-white/[0.12] hover:bg-[#121628]"
              }`}
            >
              {/* Top Row: Icon + Status Pill */}
              <div className="flex items-center justify-between">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 ${def.accentColor}`}
                  style={{ backgroundColor: def.glowColor }}
                >
                  {def.icon}
                </div>
                {renderStatusBadge(state.status, state.bytesFound, state.itemsFound, state.skipReason)}
              </div>

              {/* Title & Description */}
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-white group-hover:text-cyan-200 transition-colors">
                  {def.name}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                  {def.description}
                </p>
              </div>

              {/* Thin Bottom Progress Indicator Line */}
              <div className="h-1 w-full bg-white/[0.04] rounded-full overflow-hidden mt-2 relative">
                {isCurrentScanning && (state.isIndeterminate || state.progress <= 0) ? (
                  <div className="h-full w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse rounded-full" />
                ) : (
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      state.status === "completed"
                        ? "bg-emerald-500"
                        : state.status === "scanning"
                        ? "bg-cyan-400"
                        : state.status === "partial"
                        ? "bg-amber-400"
                        : "bg-transparent"
                    }`}
                    style={{
                      width: `${
                        state.status === "completed"
                          ? 100
                          : state.progress > 0
                          ? state.progress
                          : 0
                      }%`,
                    }}
                  />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
