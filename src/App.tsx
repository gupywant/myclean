import React, { useEffect } from "react";
import { useFluxStore } from "./store/useFluxStore";
import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { DashboardView } from "./components/dashboard/DashboardView";
import { DeepCleanView } from "./components/scanner/DeepCleanView";
import { DeveloperSpaceView } from "./components/developer/DeveloperSpaceView";
import { LargeFilesView } from "./components/large-files/LargeFilesView";
import { DuplicatesView } from "./components/duplicates/DuplicatesView";
import { AppsView } from "./components/apps/AppsView";
import { HistoryView } from "./components/history/HistoryView";
import { SettingsView } from "./components/settings/SettingsView";
import { ConfirmCleanModal } from "./components/modals/ConfirmCleanModal";

export const App: React.FC = () => {
  const { activeTab, fetchSystemSummary, fetchHistory } = useFluxStore();

  useEffect(() => {
    fetchSystemSummary();
    fetchHistory();
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
          {activeTab === "dashboard" && <DashboardView />}
          {activeTab === "deep-clean" && <DeepCleanView />}
          {activeTab === "developer" && <DeveloperSpaceView />}
          {activeTab === "large-files" && <LargeFilesView />}
          {activeTab === "duplicates" && <DuplicatesView />}
          {activeTab === "apps" && <AppsView />}
          {activeTab === "history" && <HistoryView />}
          {activeTab === "settings" && <SettingsView />}
        </main>
      </div>

      {/* Confirmation Modal */}
      <ConfirmCleanModal />
    </div>
  );
};

export default App;
