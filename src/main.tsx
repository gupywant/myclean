import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { useCleanStore } from "./store/useCleanStore";
import * as api from "./lib/api";

// Top-level automation and remote test hooks
(window as any).useCleanStore = useCleanStore;
(window as any).api = api;
(window as any).__MYCLEAN_START_SCAN__ = () => {
  useCleanStore.getState().setActiveTab("dashboard");
  useCleanStore.getState().startScan();
};

// Mirror live scan progress in macOS window title
useCleanStore.subscribe((state) => {
  if (state.isScanning) {
    const pct = Math.round(state.scanProgress?.overall_progress || 0);
    const cat = state.scanProgress?.current_category || "System";
    document.title = `myclean - Scanning (${pct}%) [${cat}]`;
  } else if (state.scanResult) {
    document.title = `myclean - Scan Complete (${state.scanResult.total_items} items)`;
  } else {
    document.title = "myclean";
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
