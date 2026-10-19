import React, { useState, useEffect, useMemo } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, formatDate, truncatePath } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import type { LargeFileItem } from "../../types";
import {
  FileArchive,
  FileVideo,
  FileDoc,
  File,
  HardDrives,
  Trash,
  Warning,
  ArrowSquareOut,
  MinusCircle,
  ArrowClockwise,
  StopCircle,
  CheckSquare,
  Square,
  MagnifyingGlass,
  Funnel,
  Clock,
  FolderOpen,
  Check,
  X,
  Sparkle,
  ArrowsDownUp,
} from "@phosphor-icons/react";

type SortOption = "size_desc" | "size_asc" | "age_desc" | "age_asc" | "name_asc";

const SCOPES = [
  { id: "downloads", label: "Downloads" },
  { id: "home", label: "Home (~)" },
  { id: "desktop", label: "Desktop" },
  { id: "documents", label: "Documents" },
  { id: "movies", label: "Movies" },
];

const SIZE_THRESHOLDS = [
  { mb: 25, label: "> 25 MB" },
  { mb: 50, label: "> 50 MB" },
  { mb: 100, label: "> 100 MB" },
  { mb: 500, label: "> 500 MB" },
  { mb: 1024, label: "> 1 GB" },
  { mb: 5120, label: "> 5 GB" },
];

const AGE_THRESHOLDS = [
  { days: 0, label: "All Ages" },
  { days: 30, label: "> 30 Days" },
  { days: 90, label: "> 90 Days" },
  { days: 180, label: "> 180 Days" },
  { days: 365, label: "> 1 Year" },
];

const CATEGORY_FILTERS = [
  { id: "all", label: "All Types" },
  { id: "archives", label: "Archives & DMGs" },
  { id: "media", label: "Media & Video" },
  { id: "document", label: "Documents" },
  { id: "other", label: "Other" },
];

function formatDaysOld(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = (days / 365).toFixed(1);
  return `${years} yr ago`;
}

function getCategoryInfo(category: LargeFileItem["category"], extension: string) {
  switch (category) {
    case "archive":
      return {
        label: "Archive",
        icon: FileArchive,
        badgeClass: "text-amber-400 bg-amber-500/10 border-amber-500/20",
        iconColor: "text-amber-400",
      };
    case "disk_image":
      return {
        label: "Disk Image",
        icon: HardDrives,
        badgeClass: "text-orange-400 bg-orange-500/10 border-orange-500/20",
        iconColor: "text-orange-400",
      };
    case "package":
      return {
        label: "Installer",
        icon: FileArchive,
        badgeClass: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
        iconColor: "text-yellow-400",
      };
    case "media":
      return {
        label: "Media",
        icon: FileVideo,
        badgeClass: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
        iconColor: "text-cyan-400",
      };
    case "document":
      return {
        label: "Document",
        icon: FileDoc,
        badgeClass: "text-sky-400 bg-sky-500/10 border-sky-500/20",
        iconColor: "text-sky-400",
      };
    case "database":
      return {
        label: "Database",
        icon: File,
        badgeClass: "text-purple-400 bg-purple-500/10 border-purple-500/20",
        iconColor: "text-purple-400",
      };
    default:
      return {
        label: extension ? extension.toUpperCase() : "File",
        icon: File,
        badgeClass: "text-slate-400 bg-slate-500/10 border-slate-500/20",
        iconColor: "text-slate-400",
      };
  }
}

export const LargeFilesView: React.FC = () => {
  const {
    largeFilesResult,
    isLargeFilesScanning,
    largeFilesSelectedIds,
    largeFilesScope,
    largeFilesMinSizeMB,
    largeFilesMinDays,
    largeFilesCategoryFilter,
    largeFilesSearchQuery,
    setLargeFilesScope,
    setLargeFilesMinSizeMB,
    setLargeFilesMinDays,
    setLargeFilesCategoryFilter,
    setLargeFilesSearchQuery,
    scanLargeFiles,
    cancelLargeFilesScan,
    toggleLargeFileSelection,
    selectAllLargeFiles,
    cleanSelectedLargeFiles,
    cleanSpecificPaths,
    isCleaning,
    openInFinder,
    addWhitelist,
  } = useFluxStore();

  const [sortBy, setSortBy] = useState<SortOption>("size_desc");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [singleItemToTrash, setSingleItemToTrash] = useState<LargeFileItem | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Auto-scan on initial component mount if no result yet
  useEffect(() => {
    if (!largeFilesResult && !isLargeFilesScanning) {
      scanLargeFiles();
    }
  }, []);

  // Filtered and sorted files
  const filteredFiles = useMemo(() => {
    if (!largeFilesResult) return [];

    let list = largeFilesResult.items;

    // Category filter
    if (largeFilesCategoryFilter === "archives") {
      list = list.filter((i) => i.category === "archive" || i.category === "disk_image" || i.category === "package");
    } else if (largeFilesCategoryFilter === "media") {
      list = list.filter((i) => i.category === "media");
    } else if (largeFilesCategoryFilter === "document") {
      list = list.filter((i) => i.category === "document");
    } else if (largeFilesCategoryFilter === "other") {
      list = list.filter((i) => i.category === "database" || i.category === "other");
    }

    // Search query filter
    if (largeFilesSearchQuery.trim()) {
      const q = largeFilesSearchQuery.toLowerCase().trim();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q));
    }

    // Sorting
    return [...list].sort((a, b) => {
      if (sortBy === "size_desc") return b.size_bytes - a.size_bytes;
      if (sortBy === "size_asc") return a.size_bytes - b.size_bytes;
      if (sortBy === "age_desc") return b.days_old - a.days_old;
      if (sortBy === "age_asc") return a.days_old - b.days_old;
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [largeFilesResult, largeFilesCategoryFilter, largeFilesSearchQuery, sortBy]);

  // Aggregate stats for filtered files
  const filteredTotalBytes = useMemo(() => {
    return filteredFiles.reduce((acc, i) => acc + i.size_bytes, 0);
  }, [filteredFiles]);

  // Selected files stats
  const selectedItems = useMemo(() => {
    if (!largeFilesResult) return [];
    return largeFilesResult.items.filter((i) => largeFilesSelectedIds.has(i.id));
  }, [largeFilesResult, largeFilesSelectedIds]);

  const selectedTotalBytes = useMemo(() => {
    return selectedItems.reduce((acc, i) => acc + i.size_bytes, 0);
  }, [selectedItems]);

  const allFilteredSelected = useMemo(() => {
    if (filteredFiles.length === 0) return false;
    return filteredFiles.every((f) => largeFilesSelectedIds.has(f.id));
  }, [filteredFiles, largeFilesSelectedIds]);

  const handleToggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      // Deselect all
      selectAllLargeFiles(false);
    } else {
      // Select all filtered items
      filteredFiles.forEach((f) => {
        if (!largeFilesSelectedIds.has(f.id)) {
          toggleLargeFileSelection(f.id);
        }
      });
    }
  };

  const handleExclude = async (file: LargeFileItem) => {
    await addWhitelist(file.path, `Excluded from Large Files: ${file.name}`);
    showToast(`Added "${file.name}" to exclusions`);
    // Re-scan to update list
    scanLargeFiles();
  };

  const handleConfirmTrashSelected = async () => {
    setConfirmModalOpen(false);
    const res = await cleanSelectedLargeFiles();
    if (res) {
      showToast(`Moved ${res.items_deleted} items to macOS Trash (${formatBytes(res.bytes_freed)})`);
    }
  };

  const handleConfirmTrashSingle = async () => {
    if (!singleItemToTrash) return;
    const target = singleItemToTrash;
    setSingleItemToTrash(null);
    const res = await cleanSpecificPaths([target.path]);
    if (res && res.items_deleted > 0) {
      showToast(`Moved "${target.name}" to macOS Trash`);
      scanLargeFiles();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-8 right-8 z-50 flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#131726] border border-cyan-500/30 text-cyan-300 text-xs shadow-2xl backdrop-blur-xl"
          >
            <Check size={16} className="text-cyan-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-white tracking-wide">Large & Old Files</h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-semibold">
              Storage Studio
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Audit high-capacity archives, disk images, recordings, and untouched files taking up valuable disk quota.
          </p>
        </div>

        {/* Global Stats & Refresh Button */}
        <div className="flex items-center space-x-4">
          {largeFilesResult && !isLargeFilesScanning && (
            <div className="text-right">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
                Total Detected ({largeFilesResult.total_files})
              </span>
              <span className="text-xl font-bold font-mono text-cyan-400">
                {formatBytes(largeFilesResult.total_bytes)}
              </span>
            </div>
          )}

          {isLargeFilesScanning ? (
            <button
              onClick={cancelLargeFilesScan}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-rose-950/20"
            >
              <StopCircle size={16} className="animate-spin text-rose-400" />
              <span>Cancel Scan</span>
            </button>
          ) : (
            <button
              onClick={() => scanLargeFiles()}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-indigo-950/30 hover:scale-[1.02] active:scale-[0.98]"
            >
              <ArrowClockwise size={15} />
              <span>Refresh Scan</span>
            </button>
          )}
        </div>
      </div>

      {/* Safety Notice */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <Warning size={18} className="shrink-0 text-amber-400" />
          <span>
            User files are <strong>never selected automatically</strong>. Files you choose to clean are sent safely to the <strong>macOS Trash</strong> and remain fully recoverable.
          </span>
        </div>
        <span className="text-[10px] font-mono font-medium text-amber-400/80 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 shrink-0 ml-2">
          Safety Protected
        </span>
      </div>

      {/* Controls Bar: Scope, Size, Age, Category, Search */}
      <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3.5">
        {/* Row 1: Scope Selection */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <span className="text-slate-400 font-medium flex items-center space-x-1.5 mr-2">
            <FolderOpen size={15} className="text-indigo-400" />
            <span>Target Scope:</span>
          </span>
          {SCOPES.map((scope) => (
            <button
              key={scope.id}
              onClick={() => setLargeFilesScope(scope.id)}
              disabled={isLargeFilesScanning}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                largeFilesScope === scope.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
                  : "bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]"
              }`}
            >
              {scope.label}
            </button>
          ))}
        </div>

        {/* Row 2: Size & Age Filters */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-1 border-t border-white/[0.04]">
          {/* Size Pills */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs">
            <span className="text-slate-400 font-medium mr-1.5">Min Size:</span>
            {SIZE_THRESHOLDS.map((thresh) => (
              <button
                key={thresh.mb}
                onClick={() => setLargeFilesMinSizeMB(thresh.mb)}
                disabled={isLargeFilesScanning}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                  largeFilesMinSizeMB === thresh.mb
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "bg-white/[0.02] text-slate-400 hover:text-slate-200 border border-white/[0.04]"
                }`}
              >
                {thresh.label}
              </button>
            ))}
          </div>

          {/* Age Pills */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs">
            <span className="text-slate-400 font-medium flex items-center space-x-1 mr-1.5">
              <Clock size={13} className="text-indigo-400" />
              <span>Min Age:</span>
            </span>
            {AGE_THRESHOLDS.map((thresh) => (
              <button
                key={thresh.days}
                onClick={() => setLargeFilesMinDays(thresh.days)}
                disabled={isLargeFilesScanning}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  largeFilesMinDays === thresh.days
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                    : "bg-white/[0.02] text-slate-400 hover:text-slate-200 border border-white/[0.04]"
                }`}
              >
                {thresh.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: Category Filter, Search, and Sort */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-1 border-t border-white/[0.04]">
          {/* Category Pills */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs">
            <span className="text-slate-400 font-medium flex items-center space-x-1 mr-1.5">
              <Funnel size={13} className="text-slate-400" />
              <span>Category:</span>
            </span>
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setLargeFilesCategoryFilter(cat.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  largeFilesCategoryFilter === cat.id
                    ? "bg-white/10 text-white border border-white/20"
                    : "bg-white/[0.02] text-slate-400 hover:text-slate-200 border border-white/[0.04]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search & Sort */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filter by name..."
                value={largeFilesSearchQuery}
                onChange={(e) => setLargeFilesSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs rounded-lg bg-white/[0.03] border border-white/[0.06] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 w-44"
              />
              {largeFilesSearchQuery && (
                <button
                  onClick={() => setLargeFilesSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-1 text-xs text-slate-400">
              <ArrowsDownUp size={14} className="text-slate-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="Sort files by"
                className="bg-[#131726] border border-white/[0.06] rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500/50"
              >
                <option value="size_desc">Largest First</option>
                <option value="size_asc">Smallest First</option>
                <option value="age_desc">Oldest First</option>
                <option value="age_asc">Newest First</option>
                <option value="name_asc">Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Files Table */}
      <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden shadow-xl">
        {/* Table Header */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleToggleSelectAllFiltered}
              disabled={filteredFiles.length === 0}
              className="text-slate-400 hover:text-white transition-colors"
              title={allFilteredSelected ? "Deselect All Filtered" : "Select All Filtered"}
            >
              {allFilteredSelected && filteredFiles.length > 0 ? (
                <CheckSquare size={17} weight="fill" className="text-indigo-400" />
              ) : (
                <Square size={17} />
              )}
            </button>
            <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
              Matching Files ({filteredFiles.length})
            </span>
            {filteredFiles.length > 0 && (
              <span className="text-[11px] font-mono text-cyan-400/80">
                ({formatBytes(filteredTotalBytes)})
              </span>
            )}
          </div>

          <div className="flex items-center space-x-8 text-[11px] uppercase font-semibold text-slate-500">
            <span className="w-24 text-center">Category</span>
            <span className="w-24 text-center">Age</span>
            <span className="w-24 text-right">Size</span>
            <span className="w-28 text-center">Actions</span>
          </div>
        </div>

        {/* Loading / Scanning State */}
        {isLargeFilesScanning && (
          <div className="p-16 text-center space-y-4">
            <div className="relative w-12 h-12 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping" />
              <ArrowClockwise size={36} className="animate-spin text-indigo-400 absolute inset-0 m-auto" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Scanning Scope: {largeFilesScope}</p>
              <p className="text-xs text-slate-400 mt-1">
                Traversing high-capacity files exceeding {largeFilesMinSizeMB} MB...
              </p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLargeFilesScanning && filteredFiles.length === 0 && (
          <div className="p-16 text-center space-y-3">
            <FileArchive size={40} className="mx-auto text-slate-600" />
            <p className="text-sm font-semibold text-white">No Matching Files Found</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No files exceeding <strong>{largeFilesMinSizeMB} MB</strong> in <strong>{largeFilesScope}</strong> matched your filters.
              Try lowering the threshold to <strong>25 MB</strong> or switching target scope to <strong>Home (~)</strong>.
            </p>
            <div className="pt-2 flex justify-center space-x-2">
              <button
                onClick={() => setLargeFilesMinSizeMB(25)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-colors"
              >
                Set Threshold to 25 MB
              </button>
              <button
                onClick={() => setLargeFilesScope("home")}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] text-xs font-medium transition-colors"
              >
                Scan Entire Home (~)
              </button>
            </div>
          </div>
        )}

        {/* File Rows */}
        {!isLargeFilesScanning && filteredFiles.length > 0 && (
          <div className="divide-y divide-white/[0.04] max-h-[520px] overflow-y-auto">
            {filteredFiles.map((file) => {
              const isSelected = largeFilesSelectedIds.has(file.id);
              const catInfo = getCategoryInfo(file.category, file.extension);
              const CatIcon = catInfo.icon;

              return (
                <div
                  key={file.id}
                  className={`px-5 py-3 flex items-center justify-between transition-colors ${
                    isSelected ? "bg-indigo-600/[0.06] hover:bg-indigo-600/[0.09]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  {/* Left: Checkbox & File Info */}
                  <div className="flex items-center space-x-3.5 min-w-0 pr-4">
                    <button
                      onClick={() => toggleLargeFileSelection(file.id)}
                      className="shrink-0 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare size={17} weight="fill" className="text-indigo-400" />
                      ) : (
                        <Square size={17} />
                      )}
                    </button>

                    <div className="shrink-0 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                      <CatIcon size={18} className={catInfo.iconColor} />
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-white truncate max-w-md" title={file.name}>
                          {file.name}
                        </span>
                        {file.extension && (
                          <span className="text-[10px] font-mono text-slate-400 uppercase bg-white/[0.04] px-1.5 py-0.2 rounded">
                            .{file.extension}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono truncate max-w-lg" title={file.path}>
                        {truncatePath(file.path, 60)}
                      </p>
                    </div>
                  </div>

                  {/* Right: Category, Age, Size, Actions */}
                  <div className="flex items-center space-x-8 shrink-0">
                    {/* Category Badge */}
                    <div className="w-24 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${catInfo.badgeClass}`}>
                        {catInfo.label}
                      </span>
                    </div>

                    {/* Age Badge */}
                    <div className="w-24 text-center">
                      <span className="text-xs font-mono text-slate-300 block">
                        {formatDaysOld(file.days_old)}
                      </span>
                      {file.modified_at && (
                        <span className="text-[10px] text-slate-500 font-mono block">
                          {formatDate(file.modified_at)}
                        </span>
                      )}
                    </div>

                    {/* Size */}
                    <div className="w-24 text-right">
                      <span className="text-xs font-mono font-bold text-white block">
                        {formatBytes(file.size_bytes)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 block">
                        alloc: {formatBytes(file.allocated_bytes)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="w-28 flex items-center justify-end space-x-1.5">
                      <button
                        onClick={() => openInFinder(file.path)}
                        className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-indigo-600/20 text-slate-400 hover:text-indigo-300 border border-white/[0.06] transition-colors cursor-pointer"
                        title="Reveal in Finder"
                      >
                        <ArrowSquareOut size={15} />
                      </button>
                      <button
                        onClick={() => handleExclude(file)}
                        className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border border-white/[0.06] transition-colors cursor-pointer"
                        title="Exclude from future scans"
                      >
                        <MinusCircle size={15} />
                      </button>
                      <button
                        onClick={() => setSingleItemToTrash(file)}
                        disabled={isCleaning}
                        className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/[0.06] transition-colors cursor-pointer"
                        title="Move to macOS Trash"
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bottom Action Bar for Multi-Selection */}
      <AnimatePresence>
        {selectedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="sticky bottom-6 z-40 flex items-center justify-between p-4 rounded-xl bg-[#0D101C]/95 border border-indigo-500/30 backdrop-blur-xl shadow-2xl shadow-indigo-950/40"
          >
            <div className="flex items-center space-x-3">
              <span className="p-2 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400">
                <Sparkle size={18} />
              </span>
              <div>
                <span className="text-xs font-semibold text-white block">
                  {selectedItems.length} {selectedItems.length === 1 ? "file" : "files"} selected
                </span>
                <span className="text-[11px] font-mono text-cyan-400">
                  {formatBytes(selectedTotalBytes)} reclaimable
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => selectAllLargeFiles(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Deselect All
              </button>

              <button
                onClick={() => setConfirmModalOpen(true)}
                disabled={isCleaning}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/30 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <Trash size={16} />
                <span>Move Selected to Trash</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal: Batch Trashing */}
      <AnimatePresence>
        {confirmModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl bg-[#0D101C] border border-white/[0.08] p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center space-x-3">
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Trash size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Move {selectedItems.length} Files to Trash?</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Total cumulative size: <strong className="text-cyan-400 font-mono">{formatBytes(selectedTotalBytes)}</strong>
                  </p>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-white/[0.04] rounded-lg bg-black/30 p-2 text-xs font-mono">
                {selectedItems.map((item) => (
                  <div key={item.id} className="py-1.5 flex justify-between items-center text-slate-300">
                    <span className="truncate max-w-xs">{item.name}</span>
                    <span className="text-cyan-400 shrink-0 ml-2">{formatBytes(item.size_bytes)}</span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-400">
                These items will be moved to the macOS Trash using native macOS safety APIs. They will not be deleted permanently and can be restored at any time from Trash.
              </p>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setConfirmModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmTrashSelected}
                  disabled={isCleaning}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/30 transition-colors"
                >
                  {isCleaning ? "Trashing..." : `Move ${selectedItems.length} Items to Trash`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal: Single Item Trashing */}
      <AnimatePresence>
        {singleItemToTrash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl bg-[#0D101C] border border-white/[0.08] p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center space-x-3">
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Trash size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Move to macOS Trash?</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Size: <strong className="text-cyan-400 font-mono">{formatBytes(singleItemToTrash.size_bytes)}</strong>
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-black/30 text-xs font-mono text-slate-300 space-y-1">
                <p className="font-semibold text-white truncate">{singleItemToTrash.name}</p>
                <p className="text-[11px] text-slate-500 break-all">{singleItemToTrash.path}</p>
              </div>

              <p className="text-[11px] text-slate-400">
                This file will be safely sent to the macOS Trash and can be restored at any time.
              </p>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setSingleItemToTrash(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmTrashSingle}
                  disabled={isCleaning}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/30 transition-colors"
                >
                  {isCleaning ? "Trashing..." : "Move to Trash"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
