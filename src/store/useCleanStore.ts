import { create } from "zustand";
import { api } from "../lib/api";
import type {
  NavigationTab,
  SystemSummary,
  ScanResult,
  ScanProgress,
  ScanScopeConfig,
  CleanResult,
  DuplicateScanResult,
  InstalledApp,
  ScanRecord,
  CleanupRecord,
  WhitelistEntry,
  ScanCategoryType,
  StorageAnalysisResult,
  StorageNode,
} from "../types";

interface CleanState {
  activeTab: NavigationTab;
  systemSummary: SystemSummary | null;
  isSystemLoading: boolean;

  // System Scanner State & Config
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  scanResult: ScanResult | null;
  selectedItemIds: Set<string>;
  scanConfig: ScanScopeConfig;

  // Storage Analyzer State
  storageResult: StorageAnalysisResult | null;
  isStorageAnalyzing: boolean;
  activeDrillDownNode: StorageNode | null;
  drillDownBreadcrumbs: StorageNode[];

  // Clean Execution State
  isCleaning: boolean;
  lastCleanResult: CleanResult | null;
  showConfirmModal: boolean;
  dryRunMode: boolean;
  cleanupMethod: "trash" | "permanent";

  // Duplicates State
  duplicatesResult: DuplicateScanResult | null;
  isDuplicateScanning: boolean;

  // Applications State
  installedApps: InstalledApp[];
  isAppsScanning: boolean;

  // History & Whitelist
  scanHistory: ScanRecord[];
  cleanupHistory: CleanupRecord[];
  whitelist: WhitelistEntry[];
  settings: Record<string, string>;

  // Actions
  setActiveTab: (tab: NavigationTab) => void;
  fetchSystemSummary: () => Promise<void>;
  setScanConfig: (config: Partial<ScanScopeConfig>) => void;
  startScan: () => Promise<void>;
  cancelScan: () => Promise<void>;
  toggleItemSelection: (id: string) => void;
  toggleCategorySelection: (category: ScanCategoryType, select: boolean) => void;
  selectAllItems: () => void;
  deselectAllItems: () => void;
  setDryRunMode: (val: boolean) => void;
  setCleanupMethod: (method: "trash" | "permanent") => void;
  openConfirmModal: () => void;
  closeConfirmModal: () => void;
  executeCleanup: () => Promise<CleanResult | null>;
  startStorageAnalysis: (path?: string, maxDepth?: number) => Promise<void>;
  cancelStorageAnalysis: () => Promise<void>;
  drillDownNode: (node: StorageNode) => void;
  drillUpTo: (index: number) => void;
  openInFinder: (path: string) => Promise<void>;
  scanDuplicates: (targetPath?: string, minSizeBytes?: number) => Promise<void>;
  cancelDuplicateScan: () => Promise<void>;
  toggleDuplicateFile: (groupHash: string, path: string) => void;
  autoSelectDuplicates: (strategy: "keep_oldest" | "keep_newest") => void;
  scanApplications: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  fetchWhitelist: () => Promise<void>;
  addWhitelist: (path: string, reason: string) => Promise<void>;
  removeWhitelist: (path: string) => Promise<void>;
  cleanSpecificPaths: (paths: string[]) => Promise<CleanResult | null>;
}

export const useCleanStore = create<CleanState>((set, get) => ({
  activeTab: "dashboard",
  systemSummary: null,
  isSystemLoading: false,

  isScanning: false,
  scanProgress: null,
  scanResult: null,
  selectedItemIds: new Set<string>(),
  scanConfig: {
    include_system_caches: true,
    include_application_logs: true,
    include_developer_xcode: true,
    include_developer_caches: true,
    include_browser_caches: true,
    include_messaging_caches: true,
    include_trash: true,
    include_mail_downloads: true,
    include_large_files: true,
    large_files_min_mb: 100,
    custom_paths: [],
    user_exclusions: [],
  },

  storageResult: null,
  isStorageAnalyzing: false,
  activeDrillDownNode: null,
  drillDownBreadcrumbs: [],

  isCleaning: false,
  lastCleanResult: null,
  showConfirmModal: false,
  dryRunMode: false,
  cleanupMethod: "trash",

  duplicatesResult: null,
  isDuplicateScanning: false,

  installedApps: [],
  isAppsScanning: false,

  scanHistory: [],
  cleanupHistory: [],
  whitelist: [],
  settings: {},

  setActiveTab: (tab) => set({ activeTab: tab }),

  setScanConfig: (config) => {
    set((state) => ({
      scanConfig: { ...state.scanConfig, ...config },
    }));
  },

  fetchSystemSummary: async () => {
    set({ isSystemLoading: true });
    try {
      const summary = await api.getSystemMetrics();
      set({ systemSummary: summary, isSystemLoading: false });
    } catch (err) {
      console.error("Failed to load system metrics:", err);
      set({ isSystemLoading: false });
    }
  },

  startScan: async () => {
    set({
      isScanning: true,
      scanProgress: {
        phase: "Initializing Parallel Scanner...",
        current_category: "Caches & Artifacts",
        current_path: "Preparing search trees...",
        items_found: 0,
        bytes_found: 0,
        percent_complete: 0,
      },
    });

    const unlisten = await api.onScanProgress((progress) => {
      set({ scanProgress: progress });
    });

    try {
      const config = get().scanConfig;
      const result = await api.startScan(config);
      const defaultSelected = new Set<string>();
      result.items.forEach((item) => {
        if (item.is_selected) {
          defaultSelected.add(item.id);
        }
      });

      set({
        scanResult: result,
        selectedItemIds: defaultSelected,
        isScanning: false,
        scanProgress: null,
      });

      // Refresh history
      get().fetchHistory();
    } catch (err) {
      console.error("Scan error:", err);
      set({ isScanning: false, scanProgress: null });
    } finally {
      unlisten();
    }
  },

  cancelScan: async () => {
    await api.cancelScan();
    set({ isScanning: false, scanProgress: null });
  },

  startStorageAnalysis: async (path?: string, maxDepth?: number) => {
    set({ isStorageAnalyzing: true });
    try {
      const res = await api.analyzeStorage(path, maxDepth);
      set({
        storageResult: res,
        activeDrillDownNode: res.root_node,
        drillDownBreadcrumbs: [res.root_node],
        isStorageAnalyzing: false,
      });
    } catch (err) {
      console.error("Storage analysis failed:", err);
      set({ isStorageAnalyzing: false });
    }
  },

  cancelStorageAnalysis: async () => {
    await api.cancelStorageAnalysis();
    set({ isStorageAnalyzing: false });
  },

  drillDownNode: (node: StorageNode) => {
    if (node.children && node.children.length > 0) {
      set((state) => ({
        activeDrillDownNode: node,
        drillDownBreadcrumbs: [...state.drillDownBreadcrumbs, node],
      }));
    }
  },

  drillUpTo: (index: number) => {
    set((state) => {
      if (index >= 0 && index < state.drillDownBreadcrumbs.length) {
        const nextCrumbs = state.drillDownBreadcrumbs.slice(0, index + 1);
        return {
          activeDrillDownNode: nextCrumbs[nextCrumbs.length - 1],
          drillDownBreadcrumbs: nextCrumbs,
        };
      }
      return state;
    });
  },

  openInFinder: async (path: string) => {
    try {
      await api.openInFinder(path);
    } catch (err) {
      console.error("Failed to open in Finder:", err);
    }
  },

  toggleItemSelection: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedItemIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedItemIds: next };
    });
  },

  toggleCategorySelection: (category: ScanCategoryType, select: boolean) => {
    set((state) => {
      if (!state.scanResult) return state;
      const next = new Set(state.selectedItemIds);
      state.scanResult.items
        .filter((item) => item.category === category)
        .forEach((item) => {
          if (select) {
            next.add(item.id);
          } else {
            next.delete(item.id);
          }
        });
      return { selectedItemIds: next };
    });
  },

  selectAllItems: () => {
    set((state) => {
      if (!state.scanResult) return state;
      const allIds = new Set(state.scanResult.items.map((i) => i.id));
      return { selectedItemIds: allIds };
    });
  },

  deselectAllItems: () => {
    set({ selectedItemIds: new Set<string>() });
  },

  setDryRunMode: (val) => set({ dryRunMode: val }),
  setCleanupMethod: (method) => set({ cleanupMethod: method }),
  openConfirmModal: () => set({ showConfirmModal: true }),
  closeConfirmModal: () => set({ showConfirmModal: false }),

  executeCleanup: async () => {
    const { scanResult, selectedItemIds, cleanupMethod, dryRunMode } = get();
    if (!scanResult) return null;

    const pathsToClean = scanResult.items
      .filter((i) => selectedItemIds.has(i.id))
      .map((i) => i.path);

    if (pathsToClean.length === 0) return null;

    set({ isCleaning: true, showConfirmModal: false });

    try {
      const result = await api.cleanItems({
        paths: pathsToClean,
        method: cleanupMethod,
        dry_run: dryRunMode,
        confirmed: true,
      });

      set({
        lastCleanResult: result,
        isCleaning: false,
      });

      // If actual clean was run, remove cleaned items from scanResult and update system metrics
      if (!dryRunMode && result.success) {
        const remainingItems = scanResult.items.filter(
          (i) => !selectedItemIds.has(i.id)
        );
        const remainingBytes = remainingItems.reduce((acc, i) => acc + i.size_bytes, 0);

        set({
          scanResult: {
            ...scanResult,
            items: remainingItems,
            total_bytes: remainingBytes,
            total_items: remainingItems.length,
          },
          selectedItemIds: new Set<string>(),
        });

        // Trigger updates
        get().fetchSystemSummary();
        get().fetchHistory();
      }

      return result;
    } catch (err) {
      console.error("Cleanup error:", err);
      set({ isCleaning: false });
      return null;
    }
  },

  cleanSpecificPaths: async (paths: string[]) => {
    const { cleanupMethod, dryRunMode } = get();
    set({ isCleaning: true });

    try {
      const result = await api.cleanItems({
        paths,
        method: cleanupMethod,
        dry_run: dryRunMode,
        confirmed: true,
      });

      set({
        lastCleanResult: result,
        isCleaning: false,
      });

      get().fetchSystemSummary();
      get().fetchHistory();
      return result;
    } catch (err) {
      console.error("Clean specific paths error:", err);
      set({ isCleaning: false });
      return null;
    }
  },

  scanDuplicates: async (targetPath, minSizeBytes) => {
    set({ isDuplicateScanning: true });
    try {
      const res = await api.scanDuplicates(targetPath, minSizeBytes);
      set({ duplicatesResult: res, isDuplicateScanning: false });
    } catch (err) {
      console.error("Duplicate scan error:", err);
      set({ isDuplicateScanning: false });
    }
  },

  cancelDuplicateScan: async () => {
    await api.cancelDuplicateScan();
    set({ isDuplicateScanning: false });
  },

  toggleDuplicateFile: (groupHash: string, path: string) => {
    set((state) => {
      if (!state.duplicatesResult) return state;
      const nextGroups = state.duplicatesResult.groups.map((group) => {
        if (group.hash !== groupHash) return group;

        const targetFile = group.files.find((f) => f.path === path);
        if (!targetFile) return group;

        // If toggling from keep (false) to remove (true), ensure at least one other file remains unselected
        if (!targetFile.is_selected_for_removal) {
          const remainingKept = group.files.filter(
            (f) => f.path !== path && !f.is_selected_for_removal
          );
          if (remainingKept.length === 0) {
            // Cannot mark all files in group for deletion
            return group;
          }
        }

        return {
          ...group,
          files: group.files.map((file) =>
            file.path === path
              ? { ...file, is_selected_for_removal: !file.is_selected_for_removal }
              : file
          ),
        };
      });
      return {
        duplicatesResult: {
          ...state.duplicatesResult,
          groups: nextGroups,
        },
      };
    });
  },

  autoSelectDuplicates: (strategy: "keep_oldest" | "keep_newest") => {
    set((state) => {
      if (!state.duplicatesResult) return state;
      const updatedGroups = state.duplicatesResult.groups.map((group) => {
        const sorted = [...group.files].sort((a, b) => {
          const timeA = a.modified_at ? new Date(a.modified_at).getTime() : 0;
          const timeB = b.modified_at ? new Date(b.modified_at).getTime() : 0;
          return strategy === "keep_oldest" ? timeA - timeB : timeB - timeA;
        });

        const keepPath = sorted[0]?.path;
        return {
          ...group,
          files: group.files.map((file) => ({
            ...file,
            is_selected_for_removal: file.path !== keepPath,
          })),
        };
      });

      return {
        duplicatesResult: {
          ...state.duplicatesResult,
          groups: updatedGroups,
        },
      };
    });
  },

  scanApplications: async () => {
    set({ isAppsScanning: true });
    try {
      const apps = await api.scanApplications();
      set({ installedApps: apps, isAppsScanning: false });
    } catch (err) {
      console.error("App scan error:", err);
      set({ isAppsScanning: false });
    }
  },

  fetchHistory: async () => {
    try {
      const [scans, cleans] = await Promise.all([
        api.getScanHistory(20),
        api.getCleanupHistory(30),
      ]);
      set({ scanHistory: scans, cleanupHistory: cleans });
    } catch (err) {
      console.error("History fetch error:", err);
    }
  },

  fetchWhitelist: async () => {
    try {
      const list = await api.getWhitelist();
      set({ whitelist: list });
    } catch (err) {
      console.error("Whitelist fetch error:", err);
    }
  },

  addWhitelist: async (path: string, reason: string) => {
    try {
      await api.addToWhitelist(path, reason);
      get().fetchWhitelist();
    } catch (err) {
      console.error("Add whitelist error:", err);
    }
  },

  removeWhitelist: async (path: string) => {
    try {
      await api.removeFromWhitelist(path);
      get().fetchWhitelist();
    } catch (err) {
      console.error("Remove whitelist error:", err);
    }
  },
}));

export const useFluxStore = useCleanStore;
