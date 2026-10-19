import React, { useEffect, Suspense } from "react";
import { useFluxStore } from "./store/useFluxStore";
import { listen } from "./lib/api";
import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { DashboardView } from "./components/dashboard/DashboardView";
import { DeepCleanView } from "./components/scanner/DeepCleanView";
import { ConfirmCleanModal } from "./components/modals/ConfirmCleanModal";
import { DuplicateConfirmModal } from "./components/modals/DuplicateConfirmModal";
import { AppUninstallModal } from "./components/modals/AppUninstallModal";
import { DeveloperCleanModal } from "./components/modals/DeveloperCleanModal";
import { DockerCleanModal } from "./components/modals/DockerCleanModal";

// Lazy-loaded views to reduce initial bundle footprint and optimize application startup
const StorageTreemapView = React.lazy(() =>
  import("./components/treemap/StorageTreemapView").then((m) => ({ default: m.StorageTreemapView }))
);
const DeveloperSpaceView = React.lazy(() =>
  import("./components/developer/DeveloperSpaceView").then((m) => ({ default: m.DeveloperSpaceView }))
);
const LargeFilesView = React.lazy(() =>
  import("./components/large-files/LargeFilesView").then((m) => ({ default: m.LargeFilesView }))
);
const DuplicatesView = React.lazy(() =>
  import("./components/duplicates/DuplicatesView").then((m) => ({ default: m.DuplicatesView }))
);
const AppsView = React.lazy(() =>
  import("./components/apps/AppsView").then((m) => ({ default: m.AppsView }))
);
const HistoryView = React.lazy(() =>
  import("./components/history/HistoryView").then((m) => ({ default: m.HistoryView }))
);
const SettingsView = React.lazy(() =>
  import("./components/settings/SettingsView").then((m) => ({ default: m.SettingsView }))
);

const ViewLoadingFallback: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
    <div className="relative w-12 h-12 flex items-center justify-center">
      <div className="absolute inset-0 rounded-full border border-violet-500/20 animate-ping" />
      <div className="w-10 h-10 rounded-full border-2 border-violet-500/20 border-t-violet-400 animate-spin" />
    </div>
    <div className="text-center space-y-1">
      <p className="text-xs font-semibold tracking-wider uppercase text-slate-300">
        Loading Module
      </p>
      <p className="text-[11px] text-slate-500 font-mono">
        Streaming workspace assets...
      </p>
    </div>
  </div>
);

export const App: React.FC = () => {
  const { activeTab, fetchSystemSummary, fetchHistory } = useFluxStore();

  useEffect(() => {
    fetchSystemSummary();
    fetchHistory();

    // 1. Listen to trigger event from backend
    let unlistenTrigger: (() => void) | null = null;

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      listen("trigger:start_scan", () => {
        useFluxStore.getState().setActiveTab("dashboard");
        useFluxStore.getState().startScan();
      }).then((unlisten) => {
        unlistenTrigger = unlisten;
      }).catch(() => {});
    }

    // 2. Global keyboard shortcuts to trigger scan (Enter, Space, Cmd+S)
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isInput) return;

      if (e.key === "Enter" || e.code === "Space" || (e.metaKey && e.key.toLowerCase() === "s")) {
        e.preventDefault();
        useFluxStore.getState().setActiveTab("dashboard");
        useFluxStore.getState().startScan();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (unlistenTrigger) unlistenTrigger();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);


  return (
    <div className="flex flex-col h-screen w-screen bg-[#07080D] text-slate-100 overflow-hidden">
      {/* Native-styled macOS TitleBar */}
      <TitleBar />

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Frosted Glass Sidebar */}
        <Sidebar />

        {/* View Router */}
        <main className="flex-1 flex flex-col bg-gradient-to-br from-[#07080D] via-[#090C16] to-[#0B0F1C] overflow-hidden">
          <Suspense fallback={<ViewLoadingFallback />}>
            {activeTab === "dashboard" && <DashboardView />}
            {activeTab === "deep-clean" && <DeepCleanView />}
            {activeTab === "storage-analyzer" && <StorageTreemapView />}
            {activeTab === "developer" && <DeveloperSpaceView />}
            {activeTab === "large-files" && <LargeFilesView />}
            {activeTab === "duplicates" && <DuplicatesView />}
            {activeTab === "apps" && <AppsView />}
            {activeTab === "history" && <HistoryView />}
            {activeTab === "settings" && <SettingsView />}
          </Suspense>
        </main>
      </div>

      {/* Confirmation Modals */}
      <ConfirmCleanModal />
      <DuplicateConfirmModal />
      <AppUninstallModal />
      <DeveloperCleanModal />
      <DockerCleanModal />
    </div>
  );
};

export default App;
