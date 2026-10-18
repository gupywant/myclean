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
  ActiveAppWarning,
  CleanItemTarget,
  DuplicateScanProgress,
  DuplicateGroupCleanSelection,
  OrphanedScanResult,
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
  activeAppWarnings: ActiveAppWarning[];

  // Duplicates State
  duplicatesResult: DuplicateScanResult | null;
  isDuplicateScanning: boolean;
  duplicateProgress: DuplicateScanProgress | null;
  duplicateTargetDir: string;
  duplicateMinSize: number;
  isDuplicateCleaning: boolean;
  showDuplicateConfirmModal: boolean;
  duplicateCleanResult: CleanResult | null;

  // Applications State
  installedApps: InstalledApp[];
  isAppsScanning: boolean;
  orphanedResult: OrphanedScanResult | null;
  isOrphanedScanning: boolean;
  selectedAppForUninstall: InstalledApp | null;
  selectedArtifactPaths: Set<string>;
  isUninstalling: boolean;
  showUninstallModal: boolean;
  lastUninstallResult: CleanResult | null;
  orphanedSelectedPaths: Set<string>;
  isCleaningOrphaned: boolean;
  lastOrphanedCleanResult: CleanResult | null;
  appActiveTab: "installed" | "orphaned";
  appFilterQuery: string;
  appSortBy: "total_size" | "binary_size" | "name" | "recent";

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
  checkActiveAppsForSelected: () => Promise<ActiveAppWarning[]>;
  cancelClean: () => Promise<void>;
  executeCleanup: () => Promise<CleanResult | null>;
  startStorageAnalysis: (path?: string, maxDepth?: number) => Promise<void>;
  cancelStorageAnalysis: () => Promise<void>;
  drillDownNode: (node: StorageNode) => void;
  drillUpTo: (index: number) => void;
  openInFinder: (path: string) => Promise<void>;
  setDuplicateTargetDir: (dir: string) => void;
  setDuplicateMinSize: (bytes: number) => void;
  scanDuplicates: (targetPath?: string, minSizeBytes?: number) => Promise<void>;
  cancelDuplicateScan: () => Promise<void>;
  toggleDuplicateFile: (groupHash: string, path: string) => void;
  autoSelectDuplicates: (strategy: "keep_oldest" | "keep_newest" | "deselect_all") => void;
  openDuplicateConfirmModal: () => void;
  closeDuplicateConfirmModal: () => void;
  executeDuplicateCleanup: () => Promise<CleanResult | null>;
  cancelDuplicateClean: () => Promise<void>;
  setAppActiveTab: (tab: "installed" | "orphaned") => void;
  setAppFilterQuery: (q: string) => void;
  setAppSortBy: (sort: "total_size" | "binary_size" | "name" | "recent") => void;
  scanApplications: (customDirs?: string[]) => Promise<void>;
  scanOrphanedData: () => Promise<void>;
  inspectDroppedApp: (path: string) => Promise<InstalledApp | null>;
  selectAppForUninstall: (app: InstalledApp | null) => void;
  toggleAppArtifactSelection: (path: string) => void;
  selectAllAppArtifacts: (select: boolean) => void;
  openUninstallModal: () => void;
  closeUninstallModal: () => void;
  executeUninstall: () => Promise<CleanResult | null>;
  toggleOrphanedPathSelection: (path: string) => void;
  selectAllOrphanedPaths: (select: boolean) => void;
  executeCleanOrphaned: () => Promise<CleanResult | null>;
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
  activeAppWarnings: [],

  duplicatesResult: null,
  isDuplicateScanning: false,
  duplicateProgress: null,
  duplicateTargetDir: "",
  duplicateMinSize: 1024 * 1024,
  isDuplicateCleaning: false,
  showDuplicateConfirmModal: false,
  duplicateCleanResult: null,

  installedApps: [],
  isAppsScanning: false,
  orphanedResult: null,
  isOrphanedScanning: false,
  selectedAppForUninstall: null,
  selectedArtifactPaths: new Set<string>(),
  isUninstalling: false,
  showUninstallModal: false,
  lastUninstallResult: null,
  orphanedSelectedPaths: new Set<string>(),
  isCleaningOrphaned: false,
  lastOrphanedCleanResult: null,
  appActiveTab: "installed",
  appFilterQuery: "",
  appSortBy: "total_size",

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
  openConfirmModal: () => {
    set({ showConfirmModal: true });
    get().checkActiveAppsForSelected();
  },
  closeConfirmModal: () => set({ showConfirmModal: false }),

  checkActiveAppsForSelected: async () => {
    const { scanResult, selectedItemIds } = get();
    if (!scanResult) return [];
    const selectedPaths = scanResult.items
      .filter((i) => selectedItemIds.has(i.id))
      .map((i) => i.path);
    if (selectedPaths.length === 0) {
      set({ activeAppWarnings: [] });
      return [];
    }
    try {
      const warnings = await api.checkActiveApplications(selectedPaths);
      set({ activeAppWarnings: warnings });
      return warnings;
    } catch (e) {
      console.error("Failed to check active applications:", e);
      return [];
    }
  },

  cancelClean: async () => {
    await api.cancelClean();
    set({ isCleaning: false });
  },

  executeCleanup: async () => {
    const { scanResult, selectedItemIds, cleanupMethod, dryRunMode } = get();
    if (!scanResult) return null;

    const selectedItems = scanResult.items.filter((i) => selectedItemIds.has(i.id));
    const pathsToClean = selectedItems.map((i) => i.path);
    const targets: CleanItemTarget[] = selectedItems.map((i) => ({
      path: i.path,
      expected_modified_at: i.modified_at,
      expected_size_bytes: i.size_bytes,
    }));

    if (pathsToClean.length === 0) return null;

    set({ isCleaning: true, showConfirmModal: false });

    try {
      const result = await api.cleanItems({
        paths: pathsToClean,
        targets,
        method: cleanupMethod,
        dry_run: dryRunMode,
        confirmed: true,
      });

      set({
        lastCleanResult: result,
        isCleaning: false,
      });

      // If actual clean was run, remove cleaned items from scanResult and update system metrics
      if (!dryRunMode && result.items_deleted > 0) {
        // Collect paths that failed or were skipped so they stay selected
        const failedPaths = new Set(result.errors.map((e) => e.path));
        const remainingItems = scanResult.items.filter(
          (i) => !selectedItemIds.has(i.id) || failedPaths.has(i.path)
        );
        const remainingBytes = remainingItems.reduce((acc, i) => acc + i.size_bytes, 0);

        set({
          scanResult: {
            ...scanResult,
            items: remainingItems,
            total_bytes: remainingBytes,
            total_items: remainingItems.length,
          },
          selectedItemIds: new Set(
            remainingItems.filter((i) => failedPaths.has(i.path)).map((i) => i.id)
          ),
        });

        // Trigger telemetry updates
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

  setDuplicateTargetDir: (dir: string) => set({ duplicateTargetDir: dir }),
  setDuplicateMinSize: (bytes: number) => set({ duplicateMinSize: bytes }),

  scanDuplicates: async (targetPath, minSizeBytes) => {
    const dir = targetPath ?? get().duplicateTargetDir;
    const minSize = minSizeBytes ?? get().duplicateMinSize;

    set({ isDuplicateScanning: true, duplicateProgress: null });

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await api.onDuplicateProgress((progress) => {
        set({ duplicateProgress: progress });
      });

      const res = await api.scanDuplicates(dir || undefined, minSize);
      set({ duplicatesResult: res, isDuplicateScanning: false, duplicateProgress: null });
    } catch (err) {
      console.error("Duplicate scan error:", err);
      set({ isDuplicateScanning: false, duplicateProgress: null });
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  },

  cancelDuplicateScan: async () => {
    try {
      await api.cancelDuplicateScan();
    } finally {
      set({ isDuplicateScanning: false, duplicateProgress: null });
    }
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
            // Cannot mark all files in group for deletion - at least one must be preserved
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

  autoSelectDuplicates: (strategy: "keep_oldest" | "keep_newest" | "deselect_all") => {
    set((state) => {
      if (!state.duplicatesResult) return state;
      const updatedGroups = state.duplicatesResult.groups.map((group) => {
        if (strategy === "deselect_all") {
          return {
            ...group,
            files: group.files.map((file) => ({
              ...file,
              is_selected_for_removal: false,
            })),
          };
        }

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

  openDuplicateConfirmModal: () => set({ showDuplicateConfirmModal: true }),
  closeDuplicateConfirmModal: () => set({ showDuplicateConfirmModal: false }),

  executeDuplicateCleanup: async () => {
    const { duplicatesResult, dryRunMode } = get();
    if (!duplicatesResult) return null;

    const selections: DuplicateGroupCleanSelection[] = [];
    for (const group of duplicatesResult.groups) {
      const pathsToDelete = group.files
        .filter((f) => f.is_selected_for_removal)
        .map((f) => f.path);

      if (pathsToDelete.length === 0) continue;

      const original = group.files.find((f) => !f.is_selected_for_removal);
      if (!original) {
        console.error(`Group ${group.hash} has no preserved original file!`);
        continue;
      }

      selections.push({
        group_hash: group.hash,
        original_path: original.path,
        paths_to_delete: pathsToDelete,
      });
    }

    if (selections.length === 0) return null;

    set({ isDuplicateCleaning: true });

    try {
      const result = await api.cleanDuplicates({
        groups: selections,
        dry_run: dryRunMode,
        confirmed: true,
      });

      set({
        duplicateCleanResult: result,
        isDuplicateCleaning: false,
        showDuplicateConfirmModal: false,
      });

      if (!dryRunMode && result.items_deleted > 0) {
        const failedPaths = new Set(result.errors.map((e) => e.path));
        const deletedPaths = new Set(
          selections
            .flatMap((s) => s.paths_to_delete)
            .filter((p) => !failedPaths.has(p))
        );

        const nextGroups = duplicatesResult.groups
          .map((group) => {
            const remainingFiles = group.files.filter((f) => !deletedPaths.has(f.path));
            return {
              ...group,
              files: remainingFiles,
            };
          })
          .filter((group) => group.files.length > 1);

        const totalWasted = nextGroups.reduce((acc, g) => acc + g.wasted_bytes, 0);
        const totalReclaimable = nextGroups.reduce((acc, g) => acc + g.reclaimable_bytes, 0);
        const totalFiles = nextGroups.reduce((acc, g) => acc + g.files.length, 0);

        set({
          duplicatesResult: {
            ...duplicatesResult,
            groups: nextGroups,
            total_duplicate_groups: nextGroups.length,
            total_duplicate_files: totalFiles,
            total_wasted_bytes: totalWasted,
            total_reclaimable_bytes: totalReclaimable,
          },
        });

        get().fetchSystemSummary();
        get().fetchHistory();
      }

      return result;
    } catch (err) {
      console.error("Duplicate cleanup error:", err);
      set({ isDuplicateCleaning: false });
      return null;
    }
  },

  cancelDuplicateClean: async () => {
    try {
      await api.cancelDuplicateClean();
    } finally {
      set({ isDuplicateCleaning: false });
    }
  },

  setAppActiveTab: (tab) => set({ appActiveTab: tab }),
  setAppFilterQuery: (q) => set({ appFilterQuery: q }),
  setAppSortBy: (sort) => set({ appSortBy: sort }),

  scanApplications: async (customDirs) => {
    set({ isAppsScanning: true });
    try {
      const apps = await api.scanApplications(customDirs);
      set({ installedApps: apps, isAppsScanning: false });
    } catch (err) {
      console.error("App scan error:", err);
      set({ isAppsScanning: false });
    }
  },

  scanOrphanedData: async () => {
    set({ isOrphanedScanning: true });
    try {
      const res = await api.scanOrphanedData();
      const eligiblePaths = new Set(
        res.items.filter((i) => i.is_eligible_for_cleanup).map((i) => i.path)
      );
      set({
        orphanedResult: res,
        orphanedSelectedPaths: eligiblePaths,
        isOrphanedScanning: false,
      });
    } catch (err) {
      console.error("Orphaned scan error:", err);
      set({ isOrphanedScanning: false });
    }
  },

  inspectDroppedApp: async (path: string) => {
    try {
      const app = await api.inspectDroppedApp(path);
      get().selectAppForUninstall(app);
      return app;
    } catch (err) {
      console.error("Inspect dropped app error:", err);
      return null;
    }
  },

  selectAppForUninstall: (app) => {
    if (!app) {
      set({ selectedAppForUninstall: null, selectedArtifactPaths: new Set() });
      return;
    }
    const defaults = new Set(
      app.artifacts.filter((a) => a.is_selected_by_default).map((a) => a.path)
    );
    set({ selectedAppForUninstall: app, selectedArtifactPaths: defaults });
  },

  toggleAppArtifactSelection: (path) => {
    set((state) => {
      const next = new Set(state.selectedArtifactPaths);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { selectedArtifactPaths: next };
    });
  },

  selectAllAppArtifacts: (select) => {
    set((state) => {
      if (!state.selectedAppForUninstall) return state;
      if (select) {
        return {
          selectedArtifactPaths: new Set(
            state.selectedAppForUninstall.artifacts.map((a) => a.path)
          ),
        };
      }
      return { selectedArtifactPaths: new Set() };
    });
  },

  openUninstallModal: () => set({ showUninstallModal: true }),
  closeUninstallModal: () => set({ showUninstallModal: false }),

  executeUninstall: async () => {
    const { selectedAppForUninstall, selectedArtifactPaths, dryRunMode } = get();
    if (!selectedAppForUninstall || selectedArtifactPaths.size === 0) return null;

    set({ isUninstalling: true });
    try {
      const res = await api.uninstallApplication({
        app_path: selectedAppForUninstall.app_path,
        bundle_id: selectedAppForUninstall.bundle_id,
        paths_to_delete: Array.from(selectedArtifactPaths),
        dry_run: dryRunMode,
        confirmed: true,
      });

      set({
        lastUninstallResult: res,
        isUninstalling: false,
        showUninstallModal: false,
      });

      if (!dryRunMode && res.items_deleted > 0) {
        if (selectedArtifactPaths.has(selectedAppForUninstall.app_path)) {
          set((state) => ({
            installedApps: state.installedApps.filter(
              (a) => a.app_path !== selectedAppForUninstall.app_path
            ),
            selectedAppForUninstall: null,
            selectedArtifactPaths: new Set(),
          }));
        } else {
          get().scanApplications();
        }

        get().fetchSystemSummary();
        get().fetchHistory();
      }

      return res;
    } catch (err) {
      console.error("Uninstall error:", err);
      set({ isUninstalling: false });
      return null;
    }
  },

  toggleOrphanedPathSelection: (path) => {
    set((state) => {
      const next = new Set(state.orphanedSelectedPaths);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { orphanedSelectedPaths: next };
    });
  },

  selectAllOrphanedPaths: (select) => {
    set((state) => {
      if (!state.orphanedResult) return state;
      if (select) {
        return {
          orphanedSelectedPaths: new Set(
            state.orphanedResult.items
              .filter((i) => i.is_eligible_for_cleanup)
              .map((i) => i.path)
          ),
        };
      }
      return { orphanedSelectedPaths: new Set() };
    });
  },

  executeCleanOrphaned: async () => {
    const { orphanedSelectedPaths, orphanedResult, dryRunMode } = get();
    if (!orphanedResult || orphanedSelectedPaths.size === 0) return null;

    set({ isCleaningOrphaned: true });
    try {
      const res = await api.cleanOrphanedData({
        paths: Array.from(orphanedSelectedPaths),
        dry_run: dryRunMode,
        confirmed: true,
      });

      set({
        lastOrphanedCleanResult: res,
        isCleaningOrphaned: false,
      });

      if (!dryRunMode && res.items_deleted > 0) {
        const deletedSet = new Set(orphanedSelectedPaths);
        const remaining = orphanedResult.items.filter((i) => !deletedSet.has(i.path));
        const remBytes = remaining.reduce((acc, i) => acc + i.size_bytes, 0);
        const remAlloc = remaining.reduce((acc, i) => acc + i.allocated_bytes, 0);

        set({
          orphanedResult: {
            total_items: remaining.length,
            total_bytes: remBytes,
            total_allocated_bytes: remAlloc,
            items: remaining,
          },
          orphanedSelectedPaths: new Set(),
        });

        get().fetchSystemSummary();
        get().fetchHistory();
      }

      return res;
    } catch (err) {
      console.error("Clean orphaned error:", err);
      set({ isCleaningOrphaned: false });
      return null;
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
