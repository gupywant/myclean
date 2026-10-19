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
  LiveCategoryState,
  DiscoveryFeedItem,
  StorageAnalysisResult,
  StorageNode,
  ActiveAppWarning,
  CleanItemTarget,
  DuplicateScanProgress,
  DuplicateGroupCleanSelection,
  OrphanedScanResult,
  DeveloperScanResult,
  DockerScanResult,
  DockerCleanResult,
  AppPreferences,
  ExclusionDescriptor,
  HistoryQueryRequest,
  HistoryQueryResponse,
  CleanupAnalyticsSummary,
  DatabaseHealthReport,
  LargeFilesScanResult,
} from "../types";
import { applyThemePreferences } from "../lib/theme";

export const INITIAL_CATEGORY_STATES: Record<string, LiveCategoryState> = {
  system_cache: {
    id: "system_cache",
    name: "System Cache",
    description: "macOS system cache buffers",
    status: "pending",
    progress: 0,
    itemsFound: 0,
    bytesFound: 0,
  },
  app_cache: {
    id: "app_cache",
    name: "Application Cache",
    description: "User application runtime caches",
    status: "pending",
    progress: 0,
    itemsFound: 0,
    bytesFound: 0,
  },
  browser_cache: {
    id: "browser_cache",
    name: "Browser Cache",
    description: "Chrome, Safari, Brave & messaging buffers",
    status: "pending",
    progress: 0,
    itemsFound: 0,
    bytesFound: 0,
  },
  developer_cache: {
    id: "developer_cache",
    name: "Developer Cache",
    description: "Xcode, Cargo, Gradle, npm & Homebrew",
    status: "pending",
    progress: 0,
    itemsFound: 0,
    bytesFound: 0,
  },
  logs_and_temp: {
    id: "logs_and_temp",
    name: "Logs & Temporary Files",
    description: "System logs & diagnostic crash reports",
    status: "pending",
    progress: 0,
    itemsFound: 0,
    bytesFound: 0,
  },
  user_trash: {
    id: "user_trash",
    name: "macOS Trash",
    description: "Pending deleted files in user Trash",
    status: "pending",
    progress: 0,
    itemsFound: 0,
    bytesFound: 0,
  },
  docker: {
    id: "docker",
    name: "Docker Resources",
    description: "Dangling Docker images & build cache",
    status: "pending",
    progress: 0,
    itemsFound: 0,
    bytesFound: 0,
  },
};

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

  // Smart Scan & Category Live Progress State
  scanSessionId: string | null;
  categoryStates: Record<string, LiveCategoryState>;
  discoveryFeed: DiscoveryFeedItem[];
  wasScanCancelled: boolean;
  scanElapsedTimeMs: number;
  scanError: string | null;

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
  duplicateScanError: string | null;
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

  // Developer & Docker Studio State
  developerResult: DeveloperScanResult | null;
  isDeveloperScanning: boolean;
  developerSelectedPaths: Set<string>;
  isDeveloperCleaning: boolean;
  lastDeveloperCleanResult: CleanResult | null;
  developerWorkspaces: string[];
  developerActiveTab: "tool_caches" | "workspaces" | "docker";
  showDeveloperCleanModal: boolean;

  dockerResult: DockerScanResult | null;
  isDockerInspecting: boolean;
  dockerSelectedIds: Set<string>;
  isDockerCleaning: boolean;
  lastDockerCleanResult: DockerCleanResult | null;
  showDockerCleanModal: boolean;

  // History & Whitelist
  scanHistory: ScanRecord[];
  cleanupHistory: CleanupRecord[];
  whitelist: WhitelistEntry[];
  settings: Record<string, string>;

  // Phase 08 Preferences, Exclusions, Advanced History & Analytics
  preferences: AppPreferences | null;
  isPreferencesLoading: boolean;
  allExclusions: ExclusionDescriptor[];
  isExclusionsLoading: boolean;
  historyQueryResponse: HistoryQueryResponse | null;
  isHistoryLoading: boolean;
  historyFilter: HistoryQueryRequest;
  cleanupAnalytics: CleanupAnalyticsSummary | null;
  isAnalyticsLoading: boolean;
  databaseHealth: DatabaseHealthReport | null;
  isHealthChecking: boolean;

  // Large & Old Files Studio State
  largeFilesResult: LargeFilesScanResult | null;
  isLargeFilesScanning: boolean;
  largeFilesSelectedIds: Set<string>;
  largeFilesScope: string;
  largeFilesMinSizeMB: number;
  largeFilesMinDays: number;
  largeFilesCategoryFilter: string;
  largeFilesSearchQuery: string;

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
  scanDuplicates: (targetPath?: string, minSizeBytes?: number) => Promise<boolean>;
  pickAndScanDuplicateFolder: () => Promise<void>;
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

  // Developer & Docker Studio Actions
  scanDeveloperSpaces: (workspaces?: string[]) => Promise<void>;
  cancelDeveloperScan: () => Promise<void>;
  toggleDeveloperPathSelection: (path: string) => void;
  selectAllDeveloperPaths: (select: boolean) => void;
  cleanDeveloperArtifacts: (dryRun?: boolean) => Promise<CleanResult | null>;
  addDeveloperWorkspace: (path: string) => void;
  removeDeveloperWorkspace: (path: string) => void;
  setDeveloperActiveTab: (tab: "tool_caches" | "workspaces" | "docker") => void;
  openDeveloperCleanModal: () => void;
  closeDeveloperCleanModal: () => void;

  inspectDocker: () => Promise<void>;
  toggleDockerResourceSelection: (id: string) => void;
  selectAllDockerResources: (select: boolean) => void;
  cleanDockerResources: (dryRun?: boolean) => Promise<DockerCleanResult | null>;
  openDockerCleanModal: () => void;
  closeDockerCleanModal: () => void;

  fetchHistory: () => Promise<void>;
  fetchWhitelist: () => Promise<void>;
  addWhitelist: (path: string, reason: string) => Promise<void>;
  removeWhitelist: (path: string) => Promise<void>;
  cleanSpecificPaths: (paths: string[]) => Promise<CleanResult | null>;

  // Phase 08 Actions
  fetchPreferences: () => Promise<void>;
  updatePreferences: (prefs: Partial<AppPreferences>) => Promise<void>;
  fetchAllExclusions: () => Promise<void>;
  addCustomExclusion: (path: string, reason: string) => Promise<boolean>;
  removeCustomExclusion: (path: string) => Promise<boolean>;
  fetchHistoryQuery: (req?: Partial<HistoryQueryRequest>) => Promise<void>;
  setHistoryFilter: (filter: Partial<HistoryQueryRequest>) => void;
  fetchCleanupAnalytics: () => Promise<void>;
  checkDatabaseHealth: () => Promise<void>;
  pruneHistory: (days: number) => Promise<number>;
  clearCleanupHistory: (confirmed: boolean) => Promise<void>;
  clearScanHistory: (confirmed: boolean) => Promise<void>;
  sendTestNotification: () => Promise<void>;

  // Large & Old Files Actions
  setLargeFilesScope: (scope: string) => void;
  setLargeFilesMinSizeMB: (mb: number) => void;
  setLargeFilesMinDays: (days: number) => void;
  setLargeFilesCategoryFilter: (category: string) => void;
  setLargeFilesSearchQuery: (query: string) => void;
  scanLargeFiles: (scope?: string, minSizeMB?: number, minDays?: number) => Promise<void>;
  cancelLargeFilesScan: () => Promise<void>;
  toggleLargeFileSelection: (id: string) => void;
  selectAllLargeFiles: (select: boolean) => void;
  cleanSelectedLargeFiles: () => Promise<CleanResult | null>;
}

let activeScanUnlisten: (() => void) | null = null;

export const useCleanStore = create<CleanState>((set, get) => ({
  activeTab: "dashboard",
  systemSummary: null,
  isSystemLoading: false,

  isScanning: false,
  scanProgress: null,
  scanResult: null,
  selectedItemIds: new Set<string>(),
  scanSessionId: null,
  categoryStates: INITIAL_CATEGORY_STATES,
  discoveryFeed: [],
  wasScanCancelled: false,
  scanElapsedTimeMs: 0,
  scanError: null,
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
    include_docker: true,
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
  duplicateScanError: null,
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

  developerResult: null,
  isDeveloperScanning: false,
  developerSelectedPaths: new Set<string>(),
  isDeveloperCleaning: false,
  lastDeveloperCleanResult: null,
  developerWorkspaces: [],
  developerActiveTab: "tool_caches",
  showDeveloperCleanModal: false,

  dockerResult: null,
  isDockerInspecting: false,
  dockerSelectedIds: new Set<string>(),
  isDockerCleaning: false,
  lastDockerCleanResult: null,
  showDockerCleanModal: false,

  scanHistory: [],
  cleanupHistory: [],
  whitelist: [],
  settings: {},

  // Phase 08 Preferences, Exclusions, Advanced History & Analytics
  preferences: null,
  isPreferencesLoading: false,
  allExclusions: [],
  isExclusionsLoading: false,
  historyQueryResponse: null,
  isHistoryLoading: false,
  historyFilter: {
    page: 1,
    page_size: 15,
    category: "all",
    dry_run_only: null,
    search_query: "",
    sort_by: "id",
    sort_order: "desc",
  },
  cleanupAnalytics: null,
  isAnalyticsLoading: false,
  databaseHealth: null,
  isHealthChecking: false,

  // Large & Old Files Initial State
  largeFilesResult: null,
  isLargeFilesScanning: false,
  largeFilesSelectedIds: new Set<string>(),
  largeFilesScope: "downloads",
  largeFilesMinSizeMB: 25,
  largeFilesMinDays: 0,
  largeFilesCategoryFilter: "all",
  largeFilesSearchQuery: "",

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
    // 1. Unsubscribe any active listener from a prior scan
    if (activeScanUnlisten) {
      activeScanUnlisten();
      activeScanUnlisten = null;
    }

    const sessionId = `scan-${Date.now()}`;
    set({
      isScanning: true,
      wasScanCancelled: false,
      scanError: null,
      scanResult: null,
      scanSessionId: sessionId,
      categoryStates: { ...INITIAL_CATEGORY_STATES },
      discoveryFeed: [],
      scanElapsedTimeMs: 0,
      scanProgress: {
        session_id: sessionId,
        category_id: "system_cache",
        current_category: "System Cache",
        current_path: "Initializing Smart Scan pipeline...",
        phase: "Starting",
        files_inspected: 0,
        directories_inspected: 0,
        bytes_analyzed: 0,
        items_discovered: 0,
        items_found: 0,
        bytes_found: 0,
        category_status: "scanning",
        category_progress: -1,
        overall_progress: 0,
        percent_complete: 0,
        skipped_count: 0,
        permission_denied_count: 0,
        elapsed_ms: 0,
        safe_items_count: 0,
        review_items_count: 0,
      },
    });

    try {
      // Register progress listener asynchronously so startScan is never blocked
      api.onScanProgress((progress) => {
        const activeSession = get().scanSessionId;
        // Stale event protection: ignore events from prior cancelled/completed sessions
        if (activeSession && progress.session_id && progress.session_id !== activeSession) {
          return;
        }

        set((state) => {
          const catId = progress.category_id;
          const prevCat = state.categoryStates[catId] || {
            id: catId,
            name: progress.current_category,
            description: "",
            status: "pending",
            progress: 0,
            itemsFound: 0,
            bytesFound: 0,
          };

          const isIndeterminate = progress.category_progress < 0;
          const updatedCat: LiveCategoryState = {
            ...prevCat,
            status: progress.category_status,
            progress: progress.category_progress >= 0 ? progress.category_progress : prevCat.progress,
            itemsFound: progress.items_discovered,
            bytesFound: progress.bytes_found,
            isIndeterminate,
            skipReason:
              progress.current_path &&
              (progress.current_path.includes("disabled") ||
                progress.current_path.includes("not running") ||
                progress.current_path.includes("not found") ||
                progress.current_path.includes("No items found"))
                ? progress.current_path
                : prevCat.skipReason,
          };

          // If path is valid, update discovery feed (keep max 30 items)
          let nextFeed = state.discoveryFeed;
          if (
            progress.current_path &&
            progress.current_path.length > 0 &&
            !progress.current_path.startsWith("Initializing") &&
            !progress.current_path.startsWith("Category disabled") &&
            !progress.current_path.startsWith("No items found")
          ) {
            const raw = progress.current_path;
            const short = raw.replace(/^\/Users\/[^/]+/, "~");
            const feedItem: DiscoveryFeedItem = {
              id: `feed-${Date.now()}-${Math.random()}`,
              timestamp: Date.now(),
              path: raw,
              shortPath: short.length > 55 ? `${short.slice(0, 25)}...${short.slice(-25)}` : short,
              sizeBytes: progress.bytes_found,
              categoryName: progress.current_category,
              isSafe: true,
            };
            nextFeed = [feedItem, ...state.discoveryFeed.slice(0, 29)];
          }

          return {
            scanProgress: progress,
            scanElapsedTimeMs: progress.elapsed_ms,
            categoryStates: {
              ...state.categoryStates,
              [catId]: updatedCat,
            },
            discoveryFeed: nextFeed,
          };
        });
      }).then((unlisten) => {
        activeScanUnlisten = unlisten;
      }).catch((listenerErr) => {
        console.warn("Failed to attach scan progress listener:", listenerErr);
      });

      const config: ScanScopeConfig = {
        ...get().scanConfig,
        session_id: sessionId,
      };
      const result = await api.startScan(config);
      const defaultSelected = new Set<string>();
      result.items.forEach((item) => {
        if (item.is_selected) {
          defaultSelected.add(item.id);
        }
      });

      // Defensive guarantee: Ensure all category states are marked as completed if scan finished successfully
      const finalCategoryStates = { ...get().categoryStates };
      if (!result.was_cancelled) {
        Object.keys(finalCategoryStates).forEach((key) => {
          if (finalCategoryStates[key].status === "scanning" || finalCategoryStates[key].status === "pending") {
            finalCategoryStates[key] = {
              ...finalCategoryStates[key],
              status: "completed",
              progress: 100,
            };
          }
        });
      }

      const currentProg = get().scanProgress;
      set({
        scanResult: result,
        selectedItemIds: defaultSelected,
        categoryStates: finalCategoryStates,
        isScanning: false,
        wasScanCancelled: result.was_cancelled,
        scanError: null,
        scanProgress: currentProg
          ? {
              ...currentProg,
              overall_progress: 100,
              percent_complete: 100,
              category_status: "completed",
              category_progress: 100,
              phase: "Complete",
              items_discovered: result.total_items,
              items_found: result.total_items,
              bytes_found: result.total_bytes,
            }
          : null,
      });

      // Refresh history
      get().fetchHistory();
    } catch (err) {
      console.error("Scan error:", err);
      set({
        isScanning: false,
        wasScanCancelled: false,
        scanError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      const fn = activeScanUnlisten as (() => void) | null;
      if (fn) {
        try {
          fn();
        } catch (_) {}
        activeScanUnlisten = null;
      }
    }
  },

  cancelScan: async () => {
    await api.cancelScan();
    if (activeScanUnlisten) {
      activeScanUnlisten();
      activeScanUnlisten = null;
    }
    set((state) => {
      // Mark active categories as partial
      const nextCats = { ...state.categoryStates };
      Object.keys(nextCats).forEach((k) => {
        if (nextCats[k].status === "scanning") {
          nextCats[k] = { ...nextCats[k], status: "partial" };
        }
      });
      return {
        isScanning: false,
        wasScanCancelled: true,
        categoryStates: nextCats,
      };
    });
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
    set({ showConfirmModal: true, lastCleanResult: null });
    get().checkActiveAppsForSelected();
  },
  closeConfirmModal: () => set({ showConfirmModal: false, lastCleanResult: null }),

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

    set({ isCleaning: true, lastCleanResult: null });

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

  setDuplicateTargetDir: (dir: string) => set({ duplicateTargetDir: dir, duplicateScanError: null }),
  setDuplicateMinSize: (bytes: number) => set({ duplicateMinSize: bytes }),

  scanDuplicates: async (targetPath, minSizeBytes) => {
    const dir = targetPath !== undefined ? targetPath : get().duplicateTargetDir;
    const minSize = minSizeBytes ?? get().duplicateMinSize;

    set({ isDuplicateScanning: true, duplicateProgress: null, duplicateScanError: null });

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await api.onDuplicateProgress((progress) => {
        set({ duplicateProgress: progress });
      });

      const res = await api.scanDuplicates(dir || undefined, minSize);
      set({
        duplicatesResult: res,
        isDuplicateScanning: false,
        duplicateProgress: null,
        duplicateScanError: null,
      });
      return true;
    } catch (err: any) {
      console.error("Duplicate scan error:", err);
      const errorMsg =
        typeof err === "string"
          ? err
          : err?.message || "Failed to complete duplicate scan.";
      set({
        isDuplicateScanning: false,
        duplicateProgress: null,
        duplicateScanError: errorMsg,
      });
      return false;
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  },

  pickAndScanDuplicateFolder: async () => {
    try {
      const selected = await api.pickFolder("Select folder to scan for duplicate files");
      if (selected) {
        set({ duplicateTargetDir: selected, duplicateScanError: null });
        await get().scanDuplicates(selected);
      }
    } catch (err: any) {
      console.error("Failed to pick folder:", err);
      const errorMsg =
        typeof err === "string"
          ? err
          : err?.message || "Failed to open folder picker.";
      set({ duplicateScanError: errorMsg });
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

  // Developer Space Actions
  scanDeveloperSpaces: async (workspaces?: string[]) => {
    set({ isDeveloperScanning: true });
    try {
      const activeWorkspaces = workspaces ?? get().developerWorkspaces;
      const res = await api.scanDeveloperSpaces(activeWorkspaces);
      const selected = new Set<string>();
      res.items.forEach((item) => {
        if (item.is_selected) selected.add(item.path);
      });
      set({
        developerResult: res,
        developerSelectedPaths: selected,
        isDeveloperScanning: false,
      });
    } catch (err) {
      console.error("Developer scan error:", err);
      set({ isDeveloperScanning: false });
    }
  },

  cancelDeveloperScan: async () => {
    await api.cancelDeveloperScan();
    set({ isDeveloperScanning: false });
  },

  toggleDeveloperPathSelection: (path: string) => {
    set((state) => {
      const next = new Set(state.developerSelectedPaths);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { developerSelectedPaths: next };
    });
  },

  selectAllDeveloperPaths: (select: boolean) => {
    set((state) => {
      if (select && state.developerResult) {
        return {
          developerSelectedPaths: new Set(
            state.developerResult.items
              .filter((i) => i.is_eligible)
              .map((i) => i.path)
          ),
        };
      }
      return { developerSelectedPaths: new Set() };
    });
  },

  cleanDeveloperArtifacts: async (dryRun?: boolean) => {
    const { developerSelectedPaths, developerWorkspaces, dryRunMode } = get();
    if (developerSelectedPaths.size === 0) return null;

    const useDryRun = dryRun ?? dryRunMode;
    set({ isDeveloperCleaning: true });
    try {
      const res = await api.cleanDeveloperArtifacts(
        {
          paths: Array.from(developerSelectedPaths),
          dry_run: useDryRun,
          confirmed: true,
        },
        developerWorkspaces
      );

      set({
        lastDeveloperCleanResult: res,
        isDeveloperCleaning: false,
      });

      if (!useDryRun && res.items_deleted > 0) {
        get().scanDeveloperSpaces();
        get().fetchSystemSummary();
        get().fetchHistory();
      }

      return res;
    } catch (err) {
      console.error("Developer cleanup error:", err);
      set({ isDeveloperCleaning: false });
      return null;
    }
  },

  addDeveloperWorkspace: (path: string) => {
    set((state) => {
      if (state.developerWorkspaces.includes(path)) return state;
      const next = [...state.developerWorkspaces, path];
      return { developerWorkspaces: next };
    });
    get().scanDeveloperSpaces();
  },

  removeDeveloperWorkspace: (path: string) => {
    set((state) => ({
      developerWorkspaces: state.developerWorkspaces.filter((p) => p !== path),
    }));
    get().scanDeveloperSpaces();
  },

  setDeveloperActiveTab: (tab) => set({ developerActiveTab: tab }),
  openDeveloperCleanModal: () => set({ showDeveloperCleanModal: true }),
  closeDeveloperCleanModal: () => set({ showDeveloperCleanModal: false }),

  // Docker Studio Actions
  inspectDocker: async () => {
    set({ isDockerInspecting: true });
    try {
      const res = await api.inspectDocker();
      const selected = new Set<string>();
      res.resources.forEach((r) => {
        if (r.reclaimable && !r.is_protected) {
          selected.add(r.id);
        }
      });
      set({
        dockerResult: res,
        dockerSelectedIds: selected,
        isDockerInspecting: false,
      });
    } catch (err) {
      console.error("Docker inspection error:", err);
      set({ isDockerInspecting: false });
    }
  },

  toggleDockerResourceSelection: (id: string) => {
    set((state) => {
      const next = new Set(state.dockerSelectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { dockerSelectedIds: next };
    });
  },

  selectAllDockerResources: (select: boolean) => {
    set((state) => {
      if (select && state.dockerResult) {
        return {
          dockerSelectedIds: new Set(
            state.dockerResult.resources
              .filter((r) => r.reclaimable && !r.is_protected)
              .map((r) => r.id)
          ),
        };
      }
      return { dockerSelectedIds: new Set() };
    });
  },

  cleanDockerResources: async (dryRun?: boolean) => {
    const { dockerSelectedIds, dockerResult, dryRunMode } = get();
    if (!dockerResult || dockerSelectedIds.size === 0) return null;

    const useDryRun = dryRun ?? dryRunMode;
    const selectedList = dockerResult.resources.filter((r) =>
      dockerSelectedIds.has(r.id)
    );

    const resource_ids = selectedList.map((r) => r.id);
    const resource_types = selectedList.map((r) => r.resource_type);

    set({ isDockerCleaning: true });
    try {
      const res = await api.cleanDockerResources({
        resource_ids,
        resource_types,
        dry_run: useDryRun,
        confirmed: true,
      });

      set({
        lastDockerCleanResult: res,
        isDockerCleaning: false,
      });

      if (!useDryRun && res.items_deleted > 0) {
        get().inspectDocker();
        get().fetchHistory();
      }

      return res;
    } catch (err) {
      console.error("Docker cleanup error:", err);
      set({ isDockerCleaning: false });
      return null;
    }
  },

  openDockerCleanModal: () => set({ showDockerCleanModal: true }),
  closeDockerCleanModal: () => set({ showDockerCleanModal: false }),

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

  fetchPreferences: async () => {
    set({ isPreferencesLoading: true });
    try {
      const prefs = await api.getPreferences();
      applyThemePreferences(prefs);
      set({ preferences: prefs, dryRunMode: prefs.dry_run_default, isPreferencesLoading: false });
    } catch (err) {
      console.error("Failed to load preferences:", err);
      set({ isPreferencesLoading: false });
    }
  },

  updatePreferences: async (partial) => {
    const current = get().preferences || {
      theme: "dark",
      accent_color: "violet",
      animation_intensity: "full",
      dry_run_default: false,
      move_to_trash_only: true,
      confirm_before_cleanup: true,
      large_file_threshold_mb: 100,
      low_disk_warning_threshold_gb: 15,
      history_retention: "90_days",
      notify_scan_complete: true,
      notify_clean_complete: true,
      notify_clean_failure: true,
      notify_low_disk_space: true,
      scan_reminder_interval: "weekly",
      cpu_thread_limit: 0,
      default_categories: [],
      developer_workspaces: [],
    };

    const optimistic: AppPreferences = { ...current, ...partial, move_to_trash_only: true };
    // Apply theme and accent immediately for 0ms visual responsiveness
    applyThemePreferences(optimistic);
    set({ preferences: optimistic });

    try {
      const updated = await api.updatePreferences(optimistic);
      set({ preferences: updated });
    } catch (err) {
      console.error("Failed to update preferences:", err);
      if (current) {
        applyThemePreferences(current);
        set({ preferences: current });
      }
    }
  },

  fetchAllExclusions: async () => {
    set({ isExclusionsLoading: true });
    try {
      const list = await api.getAllExclusions();
      set({ allExclusions: list, isExclusionsLoading: false });
    } catch (err) {
      console.error("Failed to load exclusions:", err);
      set({ isExclusionsLoading: false });
    }
  },

  addCustomExclusion: async (path, reason) => {
    try {
      await api.addCustomExclusion(path, reason);
      await get().fetchAllExclusions();
      return true;
    } catch (err) {
      console.error("Failed to add custom exclusion:", err);
      return false;
    }
  },

  removeCustomExclusion: async (path) => {
    try {
      const ok = await api.removeCustomExclusion(path);
      if (ok) {
        await get().fetchAllExclusions();
      }
      return ok;
    } catch (err) {
      console.error("Failed to remove custom exclusion:", err);
      return false;
    }
  },

  fetchHistoryQuery: async (req) => {
    const filter = { ...get().historyFilter, ...req };
    set({ historyFilter: filter, isHistoryLoading: true });
    try {
      const res = await api.queryCleanupHistory(filter);
      set({ historyQueryResponse: res, isHistoryLoading: false });
    } catch (err) {
      console.error("Failed to query cleanup history:", err);
      set({ isHistoryLoading: false });
    }
  },

  setHistoryFilter: (partial) => {
    const next = { ...get().historyFilter, ...partial };
    set({ historyFilter: next });
    get().fetchHistoryQuery(next);
  },

  fetchCleanupAnalytics: async () => {
    set({ isAnalyticsLoading: true });
    try {
      const analytics = await api.getCleanupAnalytics();
      set({ cleanupAnalytics: analytics, isAnalyticsLoading: false });
    } catch (err) {
      console.error("Failed to fetch cleanup analytics:", err);
      set({ isAnalyticsLoading: false });
    }
  },

  checkDatabaseHealth: async () => {
    set({ isHealthChecking: true });
    try {
      const report = await api.checkDatabaseIntegrity();
      set({ databaseHealth: report, isHealthChecking: false });
    } catch (err) {
      console.error("Failed to check database health:", err);
      set({ isHealthChecking: false });
    }
  },

  pruneHistory: async (days) => {
    try {
      const count = await api.pruneHistoryByRetention(days);
      get().fetchHistoryQuery();
      get().fetchCleanupAnalytics();
      get().checkDatabaseHealth();
      return count;
    } catch (err) {
      console.error("Failed to prune history:", err);
      return 0;
    }
  },

  clearCleanupHistory: async (confirmed) => {
    try {
      await api.clearCleanupHistory(confirmed);
      get().fetchHistoryQuery();
      get().fetchCleanupAnalytics();
      get().checkDatabaseHealth();
    } catch (err) {
      console.error("Failed to clear cleanup history:", err);
    }
  },

  clearScanHistory: async (confirmed) => {
    try {
      await api.clearScanHistory(confirmed);
      get().checkDatabaseHealth();
    } catch (err) {
      console.error("Failed to clear scan history:", err);
    }
  },

  sendTestNotification: async () => {
    try {
      await api.sendTestNotification();
    } catch (err) {
      console.error("Failed to send test notification:", err);
    }
  },

  // Large & Old Files Actions
  setLargeFilesScope: (scope: string) => {
    set({ largeFilesScope: scope });
    get().scanLargeFiles(scope);
  },

  setLargeFilesMinSizeMB: (mb: number) => {
    set({ largeFilesMinSizeMB: mb });
    get().scanLargeFiles(undefined, mb);
  },

  setLargeFilesMinDays: (days: number) => {
    set({ largeFilesMinDays: days });
    get().scanLargeFiles(undefined, undefined, days);
  },

  setLargeFilesCategoryFilter: (category: string) => {
    set({ largeFilesCategoryFilter: category });
  },

  setLargeFilesSearchQuery: (query: string) => {
    set({ largeFilesSearchQuery: query });
  },

  scanLargeFiles: async (scope, minSizeMB, minDays) => {
    const targetScope = scope ?? get().largeFilesScope;
    const targetMinSize = minSizeMB ?? get().largeFilesMinSizeMB;
    const targetMinDays = minDays ?? get().largeFilesMinDays;

    set({ isLargeFilesScanning: true });
    try {
      const result = await api.scanLargeOldFiles(targetScope, targetMinSize, targetMinDays);
      set({
        largeFilesResult: result,
        isLargeFilesScanning: false,
        largeFilesSelectedIds: new Set<string>(),
      });
    } catch (err) {
      console.error("Large files scan error:", err);
      set({ isLargeFilesScanning: false });
    }
  },

  cancelLargeFilesScan: async () => {
    try {
      await api.cancelLargeOldFilesScan();
    } catch (err) {
      console.error("Cancel large files scan error:", err);
    }
    set({ isLargeFilesScanning: false });
  },

  toggleLargeFileSelection: (id: string) => {
    set((state) => {
      const next = new Set(state.largeFilesSelectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { largeFilesSelectedIds: next };
    });
  },

  selectAllLargeFiles: (select: boolean) => {
    set((state) => {
      if (!select || !state.largeFilesResult) {
        return { largeFilesSelectedIds: new Set() };
      }
      const allIds = new Set(state.largeFilesResult.items.map((i) => i.id));
      return { largeFilesSelectedIds: allIds };
    });
  },

  cleanSelectedLargeFiles: async () => {
    const { largeFilesResult, largeFilesSelectedIds } = get();
    if (!largeFilesResult || largeFilesSelectedIds.size === 0) return null;

    const pathsToClean: string[] = [];
    largeFilesResult.items.forEach((item) => {
      if (largeFilesSelectedIds.has(item.id)) {
        pathsToClean.push(item.path);
      }
    });

    if (pathsToClean.length === 0) return null;

    const res = await get().cleanSpecificPaths(pathsToClean);
    if (res && res.items_deleted > 0) {
      await get().scanLargeFiles();
    }
    return res;
  },
}));

export const useFluxStore = useCleanStore;
