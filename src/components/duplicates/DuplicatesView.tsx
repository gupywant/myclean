import React, { useState, useMemo } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, formatDate, formatDuration, truncatePath } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import type { DuplicateGroup, DuplicateFile } from "../../types";
import {
  CopySimple,
  Trash,
  Sparkle,
  CheckSquare,
  Square,
  Hash,
  FolderOpen,
  ArrowSquareOut,
  Lock,
  Link,
  MagnifyingGlass,
  Funnel,
  Clock,
  ArrowsLeftRight,
  ShieldCheck,
  StopCircle,
  Check,
  X,
} from "@phosphor-icons/react";

type SortOption = "reclaimable" | "count" | "size" | "name";

export const DuplicatesView: React.FC = () => {
  const {
    duplicatesResult,
    isDuplicateScanning,
    duplicateProgress,
    duplicateTargetDir,
    duplicateMinSize,
    setDuplicateTargetDir,
    setDuplicateMinSize,
    scanDuplicates,
    cancelDuplicateScan,
    toggleDuplicateFile,
    autoSelectDuplicates,
    openDuplicateConfirmModal,
    openInFinder,
  } = useFluxStore();

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("reclaimable");
  const [customPathInput, setCustomPathInput] = useState("");
  const [showCustomPath, setShowCustomPath] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [inspectingGroup, setInspectingGroup] = useState<DuplicateGroup | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    showToast("BLAKE3 hash copied to clipboard");
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const groups = duplicatesResult?.groups ?? [];

  // Filter and sort groups
  const filteredAndSortedGroups = useMemo(() => {
    let result = [...groups];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((g) =>
        g.files.some(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.path.toLowerCase().includes(q) ||
            g.hash.toLowerCase().includes(q)
        )
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "reclaimable":
          return b.reclaimable_bytes - a.reclaimable_bytes;
        case "count":
          return b.files.length - a.files.length;
        case "size":
          return b.file_size - a.file_size;
        case "name":
          return (a.files[0]?.name || "").localeCompare(b.files[0]?.name || "");
        default:
          return 0;
      }
    });

    return result;
  }, [groups, searchQuery, sortBy]);

  // Calculate selected files to delete
  let selectedFilesCount = 0;
  let selectedReclaimableBytes = 0;

  groups.forEach((group) => {
    const toDelete = group.files.filter((f) => f.is_selected_for_removal);
    selectedFilesCount += toDelete.length;
    // Calculate reclaimable bytes accurately based on unique inodes
    const original = group.files.find((f) => !f.is_selected_for_removal);
    if (original) {
      toDelete.forEach((f) => {
        if (f.inode !== original.inode) {
          selectedReclaimableBytes += f.allocated_bytes || f.file_size;
        }
      });
    }
  });

  const handleStartScan = (pathOverride?: string) => {
    const path = pathOverride !== undefined ? pathOverride : duplicateTargetDir;
    scanDuplicates(path || undefined, duplicateMinSize);
  };

  const handleSelectPreset = (scopeName: string) => {
    setShowCustomPath(false);
    setDuplicateTargetDir(scopeName === "Downloads" ? "" : scopeName);
  };

  // Helper to check if unchecking a file would violate original preservation
  const handleToggleFile = (group: DuplicateGroup, file: DuplicateFile) => {
    if (!file.is_selected_for_removal) {
      // Trying to select for removal: check if there's at least one OTHER file not selected
      const remainingKept = group.files.filter(
        (f) => f.path !== file.path && !f.is_selected_for_removal
      );
      if (remainingKept.length === 0) {
        showToast("Safety Guard: At least 1 verified original copy must be preserved.");
        return;
      }
    }
    toggleDuplicateFile(group.hash, file.path);
  };

  // Handler to set a specific file as the only preserved original in the inspecting modal
  const handleSetPreservedOriginal = (groupHash: string, originalPath: string) => {
    const group = groups.find((g) => g.hash === groupHash);
    if (!group) return;
    group.files.forEach((f) => {
      const shouldBeSelected = f.path !== originalPath;
      if (f.is_selected_for_removal !== shouldBeSelected) {
        toggleDuplicateFile(groupHash, f.path);
      }
    });
    // Update local inspecting group if open
    if (inspectingGroup && inspectingGroup.hash === groupHash) {
      setInspectingGroup({
        ...inspectingGroup,
        files: inspectingGroup.files.map((f) => ({
          ...f,
          is_selected_for_removal: f.path !== originalPath,
        })),
      });
    }
    showToast(`Preserved original updated to ${truncatePath(originalPath, 35)}`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#1B2238] border border-indigo-500/30 text-indigo-200 text-xs shadow-xl flex items-center space-x-2 backdrop-blur-md"
          >
            <ShieldCheck size={16} weight="fill" className="text-indigo-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header & Scope Selector */}
      <div className="p-6 border-b border-white/[0.06] bg-[#0A0D18]/85 backdrop-blur-md shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">
                Advanced Duplicate Finder
              </h1>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                BLAKE3 Streaming
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                APFS Hard-Link Aware
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Byte-exact multi-stage verification (APFS Size Bucketing &rarr; 16KB Partial Hash &rarr; Full BLAKE3).
              Zero risk of false positives.
            </p>
          </div>

          {/* Action Button */}
          <div className="flex items-center space-x-3">
            {isDuplicateScanning ? (
              <button
                onClick={cancelDuplicateScan}
                className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all flex items-center space-x-2"
              >
                <StopCircle size={15} weight="fill" />
                <span>Abort Scan</span>
              </button>
            ) : (
              <button
                onClick={() => handleStartScan()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all flex items-center space-x-2"
              >
                <Sparkle size={14} weight="fill" />
                <span>Scan for Duplicates</span>
              </button>
            )}
          </div>
        </div>

        {/* Scope and Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Target Directory Scope */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400 flex items-center space-x-1">
              <FolderOpen size={14} />
              <span>Scope:</span>
            </span>
            <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-black/40 border border-white/[0.06]">
              <button
                onClick={() => handleSelectPreset("Downloads")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  duplicateTargetDir === "" && !showCustomPath
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Downloads (Default)
              </button>
              <button
                onClick={() => handleSelectPreset("Documents")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  duplicateTargetDir === "Documents" && !showCustomPath
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Documents
              </button>
              <button
                onClick={() => handleSelectPreset("Desktop")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  duplicateTargetDir === "Desktop" && !showCustomPath
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Desktop
              </button>
              <button
                onClick={() => setShowCustomPath(!showCustomPath)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  showCustomPath
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Custom Path...
              </button>
            </div>
          </div>

          {/* Minimum Size Threshold */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400 flex items-center space-x-1">
              <Funnel size={14} />
              <span>Min Size:</span>
            </span>
            <div className="flex items-center space-x-1 p-1 rounded-xl bg-black/40 border border-white/[0.06]">
              {[
                { label: "All (>1KB)", bytes: 1024 },
                { label: "1 MB", bytes: 1024 * 1024 },
                { label: "10 MB", bytes: 10 * 1024 * 1024 },
                { label: "100 MB", bytes: 100 * 1024 * 1024 },
              ].map((opt) => (
                <button
                  key={opt.bytes}
                  onClick={() => setDuplicateMinSize(opt.bytes)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    duplicateMinSize === opt.bytes
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Path Input Field (if selected) */}
        {showCustomPath && (
          <div className="flex items-center space-x-2 pt-1 animate-in fade-in duration-150">
            <input
              type="text"
              placeholder="/Users/username/Developer or path to folder..."
              value={customPathInput}
              onChange={(e) => setCustomPathInput(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-black/50 border border-white/[0.08] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => {
                if (customPathInput.trim()) {
                  setDuplicateTargetDir(customPathInput.trim());
                  handleStartScan(customPathInput.trim());
                }
              }}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            >
              Scan Path
            </button>
          </div>
        )}
      </div>

      {/* Real-time Scanning Progress Banner */}
      {isDuplicateScanning && (
        <div className="p-6 bg-[#0B0E1B] border-b border-white/[0.06] space-y-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative w-8 h-8 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500"
                />
                <Hash size={14} className="absolute text-indigo-400" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  {duplicateProgress?.phase || "Analyzing directory..."}
                </span>
                <span className="text-[11px] font-mono text-slate-400 truncate max-w-lg block">
                  {duplicateProgress?.current_file
                    ? truncatePath(duplicateProgress.current_file, 60)
                    : "Collecting files..."}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4 text-xs font-mono">
              <span className="text-slate-400">
                Candidates:{" "}
                <strong className="text-cyan-400">
                  {duplicateProgress?.candidate_files ?? 0}
                </strong>
              </span>
              <span className="text-slate-400">
                Hashed:{" "}
                <strong className="text-indigo-400">
                  {formatBytes(duplicateProgress?.bytes_hashed ?? 0)}
                </strong>
              </span>
              <span className="text-white font-bold">
                {duplicateProgress?.percent_complete.toFixed(0) ?? 0}%
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${duplicateProgress?.percent_complete ?? 5}%` }}
              transition={{ ease: "easeOut", duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* If no scan results and not scanning: Welcome / Info Banner */}
        {!duplicatesResult && !isDuplicateScanning && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-2xl shadow-indigo-500/10">
              <CopySimple size={32} weight="duotone" />
            </div>

            <div className="space-y-2 max-w-md">
              <h2 className="text-base font-bold text-white">
                Find & Reclaim Redundant File Clones
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Scan your Downloads or personal directories to identify exact byte duplicates.
                Our multi-tier BLAKE3 verification engine and APFS hard-link deduplication guarantee
                zero false positives and total safety.
              </p>
            </div>

            {/* Feature pillars */}
            <div className="grid grid-cols-3 gap-3 max-w-lg text-left">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1.5">
                <div className="flex items-center space-x-1.5 text-indigo-400 text-xs font-semibold">
                  <Hash size={14} />
                  <span>BLAKE3 Exact</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Full cryptographic verification eliminates risk of content mismatches.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1.5">
                <div className="flex items-center space-x-1.5 text-cyan-400 text-xs font-semibold">
                  <Link size={14} />
                  <span>Hard-Link Aware</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Identifies APFS hard links to calculate genuine physical block savings.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1.5">
                <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-semibold">
                  <ShieldCheck size={14} weight="fill" />
                  <span>Original Protected</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Rust backend strictly retains at least 1 verified original copy per group.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleStartScan()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-xl shadow-indigo-600/30 transition-all flex items-center space-x-2"
            >
              <Sparkle size={15} weight="fill" />
              <span>Start Scan in Downloads</span>
            </button>
          </div>
        )}

        {/* Results View */}
        {duplicatesResult && !isDuplicateScanning && (
          <>
            {/* Results Metric Header & Smart Select Bar */}
            <div className="p-4 bg-[#0A0D18] border-b border-white/[0.06] space-y-3 shrink-0">
              {/* Metric Highlights */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                    Duplicate Groups
                  </span>
                  <span className="text-base font-bold font-mono text-white">
                    {duplicatesResult.total_duplicate_groups}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                    Redundant Clones
                  </span>
                  <span className="text-base font-bold font-mono text-rose-400">
                    {duplicatesResult.total_duplicate_files - duplicatesResult.total_duplicate_groups}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                    Physical Reclaimable Space
                  </span>
                  <span className="text-base font-bold font-mono text-cyan-400">
                    {formatBytes(duplicatesResult.total_reclaimable_bytes)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                    Scan Duration
                  </span>
                  <span className="text-base font-bold font-mono text-slate-300">
                    {formatDuration(duplicatesResult.duration_ms)}
                  </span>
                </div>
              </div>

              {/* Filtering, Search & Smart Selection Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-xs">
                  <MagnifyingGlass
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    placeholder="Search by name, path or BLAKE3 hash..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/[0.06] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Sort selector */}
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    aria-label="Sort duplicate groups"
                    className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/[0.06] text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="reclaimable">Reclaimable Space (High to Low)</option>
                    <option value="count">Clone Count (Most to Least)</option>
                    <option value="size">File Size (Largest First)</option>
                    <option value="name">File Name (A to Z)</option>
                  </select>
                </div>

                {/* Smart Selection Buttons */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">Smart Select:</span>
                  <button
                    onClick={() => autoSelectDuplicates("keep_oldest")}
                    className="px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 font-medium text-xs border border-white/[0.06] transition-colors flex items-center space-x-1.5"
                  >
                    <Clock size={12} className="text-indigo-400" />
                    <span>Keep Oldest (Recommended)</span>
                  </button>
                  <button
                    onClick={() => autoSelectDuplicates("keep_newest")}
                    className="px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 font-medium text-xs border border-white/[0.06] transition-colors"
                  >
                    Keep Newest
                  </button>
                  <button
                    onClick={() => autoSelectDuplicates("deselect_all")}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 text-xs transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            </div>

            {/* Duplicate Groups List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {filteredAndSortedGroups.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-3 p-12">
                  <CopySimple size={36} className="text-slate-600" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">
                      {searchQuery
                        ? "No duplicate groups matching query"
                        : "No Duplicate Clones Found"}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      {searchQuery
                        ? "Try clearing the search filter to display all duplicate groups."
                        : "No exact duplicate files were detected in the selected scope."}
                    </p>
                  </div>
                </div>
              ) : (
                filteredAndSortedGroups.map((group) => {
                  const toDeleteCount = group.files.filter(
                    (f) => f.is_selected_for_removal
                  ).length;

                  return (
                    <div
                      key={group.hash}
                      className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden shadow-lg transition-all hover:border-white/[0.1]"
                    >
                      {/* Group Header */}
                      <div className="px-4 py-3 bg-white/[0.02] border-b border-white/[0.05] flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2.5">
                          <button
                            onClick={() => handleCopyHash(group.hash)}
                            className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-black/40 border border-white/[0.06] font-mono text-[11px] text-slate-400 hover:text-indigo-300 transition-colors"
                            title="Click to copy BLAKE3 hash"
                          >
                            <Hash size={13} className="text-indigo-400" />
                            <span>blake3:{group.hash.slice(0, 14)}...</span>
                            {copiedHash === group.hash ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <CopySimple size={12} />
                            )}
                          </button>

                          <span className="text-[11px] font-mono text-slate-400">
                            {formatBytes(group.file_size)} / file
                          </span>

                          {group.has_hardlinks && (
                            <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 flex items-center space-x-1">
                              <Link size={12} />
                              <span>APFS Hard Links</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-3">
                          <span className="text-cyan-400 font-mono text-[11px] font-semibold">
                            Reclaimable: {formatBytes(group.reclaimable_bytes)}
                          </span>

                          <span className="text-slate-400 text-[11px]">
                            {group.files.length} copies ({toDeleteCount} marked)
                          </span>

                          {/* Compare Copies Inspector Trigger */}
                          <button
                            onClick={() => setInspectingGroup(group)}
                            className="px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-medium text-[11px] border border-white/[0.06] transition-colors flex items-center space-x-1"
                          >
                            <ArrowsLeftRight size={12} />
                            <span>Compare Details</span>
                          </button>
                        </div>
                      </div>

                      {/* Files in Group */}
                      <div className="divide-y divide-white/[0.03]">
                        {group.files.map((file) => {
                          const isKept = !file.is_selected_for_removal;
                          const isSoleOriginal =
                            isKept &&
                            group.files.filter((f) => !f.is_selected_for_removal).length === 1;

                          return (
                            <div
                              key={file.path}
                              onClick={() => handleToggleFile(group, file)}
                              className={`px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] cursor-pointer transition-colors ${
                                file.is_selected_for_removal ? "bg-rose-500/[0.04]" : ""
                              }`}
                            >
                              <div className="flex items-center space-x-3 min-w-0 pr-4">
                                {/* Checkbox for deletion */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleFile(group, file);
                                  }}
                                  className={`text-slate-400 hover:text-white transition-colors ${
                                    isSoleOriginal ? "opacity-60 cursor-not-allowed" : ""
                                  }`}
                                  title={
                                    isSoleOriginal
                                      ? "Original copy must be preserved"
                                      : "Select for removal"
                                  }
                                >
                                  {file.is_selected_for_removal ? (
                                    <CheckSquare
                                      size={18}
                                      weight="fill"
                                      className="text-rose-400"
                                    />
                                  ) : (
                                    <Square size={18} className="text-slate-600" />
                                  )}
                                </button>

                                <div className="min-w-0">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs font-semibold text-white truncate">
                                      {file.name}
                                    </span>
                                  </div>
                                  <span
                                    className="text-[11px] font-mono text-slate-500 truncate block mt-0.5"
                                    title={file.path}
                                  >
                                    {truncatePath(file.path, 60)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center space-x-3 shrink-0">
                                {file.modified_at && (
                                  <span className="text-[11px] font-mono text-slate-500 flex items-center space-x-1">
                                    <Clock size={12} />
                                    <span>{formatDate(file.modified_at)}</span>
                                  </span>
                                )}

                                {/* Status Tag */}
                                {file.is_selected_for_removal ? (
                                  <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 flex items-center space-x-1">
                                    <Trash size={12} />
                                    <span>Clone to Trash</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                                    <Lock size={12} weight="fill" />
                                    <span>Preserved Original</span>
                                  </span>
                                )}

                                {/* Reveal in Finder */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openInFinder(file.path);
                                  }}
                                  className="p-1 rounded-md hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
                                  title="Reveal in Finder"
                                >
                                  <ArrowSquareOut size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Floating / Sticky Action Bar for Selected Deletions */}
            {selectedFilesCount > 0 && (
              <div className="p-4 border-t border-white/[0.06] bg-[#0A0D18]/95 backdrop-blur-md flex items-center justify-between shrink-0 shadow-2xl">
                <div className="flex items-center space-x-4 text-xs">
                  <div className="text-slate-300">
                    Selected for Trash:{" "}
                    <strong className="text-rose-400 font-mono font-semibold">
                      {selectedFilesCount} clone file{selectedFilesCount === 1 ? "" : "s"}
                    </strong>
                  </div>
                  <div className="text-slate-400 border-l border-white/[0.06] pl-4">
                    Reclaimable:{" "}
                    <strong className="text-cyan-400 font-mono font-semibold">
                      {formatBytes(selectedReclaimableBytes)}
                    </strong>
                  </div>
                  <div className="text-[11px] text-emerald-400 flex items-center space-x-1 border-l border-white/[0.06] pl-4">
                    <ShieldCheck size={14} weight="fill" />
                    <span>Originals guaranteed preserved</span>
                  </div>
                </div>

                <button
                  onClick={openDuplicateConfirmModal}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-semibold shadow-lg shadow-rose-600/25 transition-all flex items-center space-x-2"
                >
                  <Trash size={15} weight="fill" />
                  <span>Review & Clean Duplicates...</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Side-by-Side Comparison Modal */}
      {inspectingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-3xl rounded-2xl bg-[#0D101C] border border-white/[0.1] shadow-2xl p-6 space-y-5 animate-in fade-in duration-200 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between shrink-0">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-white">
                    Duplicate Group Deep Comparison
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    BLAKE3: {inspectingGroup.hash.slice(0, 16)}...
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Inspect APFS inode references, allocation blocks, and set which file is designated as the preserved original.
                </p>
              </div>

              <button
                onClick={() => setInspectingGroup(null)}
                className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Comparison Table */}
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="grid grid-cols-1 gap-3">
                {inspectingGroup.files.map((file) => {
                  const isOriginal = !file.is_selected_for_removal;
                  return (
                    <div
                      key={file.path}
                      className={`p-4 rounded-xl border transition-all ${
                        isOriginal
                          ? "bg-emerald-500/[0.03] border-emerald-500/25"
                          : "bg-white/[0.02] border-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-white truncate">
                              {file.name}
                            </span>
                            {isOriginal ? (
                              <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                                <Lock size={11} weight="fill" />
                                <span>Designated Original</span>
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 flex items-center space-x-1">
                                <Trash size={11} />
                                <span>Targeted for Trash</span>
                              </span>
                            )}
                          </div>

                          <div className="font-mono text-[11px] text-slate-400 truncate">
                            {file.path}
                          </div>

                          {/* Metadata row */}
                          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 font-mono pt-1">
                            <span>
                              Logical Size:{" "}
                              <strong className="text-white">
                                {formatBytes(file.file_size)}
                              </strong>
                            </span>
                            <span>
                              APFS Allocated:{" "}
                              <strong className="text-cyan-400">
                                {formatBytes(file.allocated_bytes || file.file_size)}
                              </strong>
                            </span>
                            <span>
                              Inode:{" "}
                              <strong className="text-indigo-400">#{file.inode}</strong>
                            </span>
                            <span>
                              Links:{" "}
                              <strong className="text-slate-300">{file.nlink}</strong>
                            </span>
                            {file.modified_at && (
                              <span>
                                Modified:{" "}
                                <strong className="text-slate-300">
                                  {formatDate(file.modified_at)}
                                </strong>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-end space-y-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => openInFinder(file.path)}
                            className="px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-xs font-medium border border-white/[0.06] transition-colors flex items-center space-x-1"
                          >
                            <ArrowSquareOut size={13} />
                            <span>Reveal</span>
                          </button>

                          {!isOriginal && (
                            <button
                              type="button"
                              onClick={() =>
                                handleSetPreservedOriginal(inspectingGroup.hash, file.path)
                              }
                              className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium border border-emerald-500/30 transition-colors flex items-center space-x-1"
                            >
                              <Lock size={12} weight="fill" />
                              <span>Preserve This File</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] shrink-0">
              <span className="text-xs text-slate-400">
                BLAKE3 byte hashes are identical across all listed files.
              </span>
              <button
                type="button"
                onClick={() => setInspectingGroup(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 border border-white/[0.06] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
