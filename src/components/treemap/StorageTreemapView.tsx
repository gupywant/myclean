import React, { useState, useEffect, useRef } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, formatDate, truncatePath } from "../../lib/utils";
import { SquarifiedTreemap } from "./SquarifiedTreemap";
import {
  HardDrive,
  Folder,
  CaretRight,
  ArrowBendUpLeft,
  ArrowSquareOut,
  Stop,
  Sparkle,
  ChartPieSlice,
  FileCode,
  FileArchive,
  FileVideo,
  FileText,
  MinusCircle,
} from "@phosphor-icons/react";

export const StorageTreemapView: React.FC = () => {
  const {
    storageResult,
    isStorageAnalyzing,
    activeDrillDownNode,
    drillDownBreadcrumbs,
    startStorageAnalysis,
    cancelStorageAnalysis,
    drillDownNode,
    drillUpTo,
    openInFinder,
    addWhitelist,
  } = useFluxStore();

  const [activeTab, setActiveTab] = useState<"treemap" | "types" | "largest_files" | "largest_folders">("treemap");
  const [targetPreset, setTargetPreset] = useState<string>("home");
  const [filterType, setFilterType] = useState<string>("all");

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 600,
    height: 480,
  });

  // Track container dimensions using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 50 && height > 50) {
          setDimensions({
            width: Math.floor(width),
            height: Math.floor(height),
          });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initial auto-analyze if empty
  useEffect(() => {
    if (!storageResult && !isStorageAnalyzing) {
      startStorageAnalysis();
    }
  }, []);

  const handleRunAnalysis = (preset: string) => {
    setTargetPreset(preset);
    let path: string | undefined;
    if (preset === "downloads") {
      path = "/Users/user/Downloads"; // In preview, or resolved by backend dirs::download_dir
    } else if (preset === "caches") {
      path = "/Users/user/Library/Caches";
    } else if (preset === "developer") {
      path = "/Users/user/Library/Developer";
    }
    startStorageAnalysis(path);
  };

  const handleExcludePath = async (path: string, name: string) => {
    if (confirm(`Add "${name}" to safety exclusion whitelist?`)) {
      await addWhitelist(path, `Excluded via Storage Analyzer: ${name}`);
    }
  };

  const volume = storageResult?.volume;
  const coverage = storageResult?.coverage;
  const displayNode = activeDrillDownNode || storageResult?.root_node;

  // Filtered largest files
  const filteredFiles = (storageResult?.largest_files || []).filter((f) => {
    if (filterType === "all") return true;
    return f.file_type === filterType;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#07080D] select-none">
      {/* Top Controls Bar */}
      <div className="px-6 py-4 border-b border-white/[0.06] bg-[#0A0D18]/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500/20 to-indigo-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ChartPieSlice size={18} weight="fill" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-bold text-white tracking-tight">Interactive Storage Analyzer</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold">
                APFS Clones & Allocation Aware
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Precise physical block allocation, hard-link deduplication & hierarchical disk treemap.
            </p>
          </div>
        </div>

        {/* Volume & Scan Controls */}
        <div className="flex items-center space-x-2.5">
          {/* Target Scopes Dropdown */}
          <div className="flex items-center space-x-1.5 bg-white/[0.03] border border-white/[0.08] rounded-lg p-1 text-xs">
            <button
              onClick={() => handleRunAnalysis("home")}
              disabled={isStorageAnalyzing}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                targetPreset === "home"
                  ? "bg-indigo-600 text-white font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Home (~)
            </button>
            <button
              onClick={() => handleRunAnalysis("caches")}
              disabled={isStorageAnalyzing}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                targetPreset === "caches"
                  ? "bg-indigo-600 text-white font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Caches
            </button>
            <button
              onClick={() => handleRunAnalysis("developer")}
              disabled={isStorageAnalyzing}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                targetPreset === "developer"
                  ? "bg-indigo-600 text-white font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Developer
            </button>
            <button
              onClick={() => handleRunAnalysis("downloads")}
              disabled={isStorageAnalyzing}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                targetPreset === "downloads"
                  ? "bg-indigo-600 text-white font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Downloads
            </button>
          </div>

          {/* Action Trigger */}
          {isStorageAnalyzing ? (
            <button
              onClick={cancelStorageAnalysis}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
            >
              <Stop size={14} weight="fill" />
              <span>Cancel Scan</span>
            </button>
          ) : (
            <button
              onClick={() => handleRunAnalysis(targetPreset)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 text-xs font-semibold transition-colors"
            >
              <Sparkle size={14} weight="fill" />
              <span>Analyze Space</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="px-6 py-2.5 bg-[#090C16] border-b border-white/[0.04] flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center space-x-6">
          {volume && (
            <div className="flex items-center space-x-2">
              <HardDrive size={15} className="text-cyan-400" />
              <span className="font-semibold text-slate-200">{volume.name}</span>
              <span className="font-mono text-[11px] text-slate-500">({volume.file_system.toUpperCase()})</span>
            </div>
          )}

          {coverage && (
            <div className="flex items-center space-x-4 text-[11px]">
              <div>
                <span>Allocated Size: </span>
                <span className="font-mono font-bold text-cyan-300">
                  {formatBytes(coverage.analyzed_allocated_bytes)}
                </span>
              </div>
              <div className="hidden sm:block">
                <span>Logical: </span>
                <span className="font-mono text-slate-300">
                  {formatBytes(coverage.analyzed_logical_bytes)}
                </span>
              </div>
              <div>
                <span>Files: </span>
                <span className="font-mono text-slate-300">
                  {coverage.total_files_analyzed.toLocaleString()}
                </span>
              </div>
              <div className="hidden md:block">
                <span>Folders: </span>
                <span className="font-mono text-slate-300">
                  {coverage.total_dirs_analyzed.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center space-x-1 bg-white/[0.02] border border-white/[0.06] rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab("treemap")}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              activeTab === "treemap"
                ? "bg-white/[0.08] text-white font-medium"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Treemap
          </button>
          <button
            onClick={() => setActiveTab("types")}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              activeTab === "types"
                ? "bg-white/[0.08] text-white font-medium"
                : "text-slate-400 hover:text-white"
            }`}
          >
            File Types
          </button>
          <button
            onClick={() => setActiveTab("largest_files")}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              activeTab === "largest_files"
                ? "bg-white/[0.08] text-white font-medium"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Largest Files
          </button>
          <button
            onClick={() => setActiveTab("largest_folders")}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              activeTab === "largest_folders"
                ? "bg-white/[0.08] text-white font-medium"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Top Folders
          </button>
        </div>
      </div>

      {/* Breadcrumb Navigation Trail */}
      <div className="px-6 py-2 bg-[#080B14] border-b border-white/[0.04] flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center space-x-1 overflow-x-auto py-0.5 max-w-4xl">
          {drillDownBreadcrumbs.map((crumb, idx) => {
            const isLast = idx === drillDownBreadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.id || idx}>
                <button
                  onClick={() => drillUpTo(idx)}
                  className={`flex items-center space-x-1.5 px-2 py-0.5 rounded text-xs transition-colors ${
                    isLast
                      ? "text-cyan-300 font-semibold bg-cyan-500/10 border border-cyan-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  <Folder size={13} weight={isLast ? "fill" : "regular"} className="shrink-0" />
                  <span className="truncate max-w-[140px]">{crumb.name}</span>
                </button>
                {!isLast && <CaretRight size={11} className="text-slate-600 shrink-0" />}
              </React.Fragment>
            );
          })}
        </div>

        {drillDownBreadcrumbs.length > 1 && (
          <button
            onClick={() => drillUpTo(drillDownBreadcrumbs.length - 2)}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 text-xs transition-colors shrink-0"
          >
            <ArrowBendUpLeft size={13} />
            <span>Up One Level</span>
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Loading Spinner State */}
        {isStorageAnalyzing && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping" />
              <div className="w-16 h-16 rounded-full border-2 border-t-cyan-400 border-r-indigo-500 border-b-transparent border-l-transparent animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-white">Analyzing Filesystem Allocation...</p>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                Computing inode blocks and detecting hard-link references
              </p>
            </div>
          </div>
        )}

        {/* Tab 1: Interactive Squarified Treemap */}
        {!isStorageAnalyzing && activeTab === "treemap" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            {/* Treemap Container with dynamic sizing */}
            <div ref={containerRef} className="flex-1 min-h-[350px] w-full relative">
              {displayNode && (
                <SquarifiedTreemap
                  rootNode={displayNode}
                  width={dimensions.width}
                  height={dimensions.height}
                  onSelectNode={(node) => {
                    if (node.node_type === "directory") {
                      drillDownNode(node);
                    }
                  }}
                />
              )}
            </div>

            {/* Treemap Legend & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-400 shrink-0">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1.5">
                  <div className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/50" />
                  <span>Safe to Clean</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <div className="w-3 h-3 rounded bg-indigo-500/30 border border-indigo-500/50" />
                  <span>Directories</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <div className="w-3 h-3 rounded bg-violet-500/30 border border-violet-500/50" />
                  <span>Developer / Code</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <div className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50" />
                  <span>Archives & Disk Images</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <div className="w-3 h-3 rounded bg-rose-500/30 border border-rose-500/50" />
                  <span>Protected</span>
                </div>
              </div>

              {displayNode && (
                <button
                  onClick={() => openInFinder(displayNode.path)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border border-white/[0.08] transition-colors"
                >
                  <ArrowSquareOut size={14} />
                  <span>Reveal Folder in Finder</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: File Type Distribution */}
        {!isStorageAnalyzing && activeTab === "types" && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] p-5 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                Space Distribution by File Category
              </h2>

              {/* Stacked Progress Bar */}
              <div className="h-4 w-full bg-white/[0.05] rounded-full overflow-hidden flex">
                {(storageResult?.file_type_distribution || []).map((t, idx) => {
                  const colors = [
                    "bg-indigo-500",
                    "bg-violet-500",
                    "bg-amber-500",
                    "bg-cyan-500",
                    "bg-teal-500",
                    "bg-slate-600",
                  ];
                  return (
                    <div
                      key={t.category}
                      style={{ width: `${t.percentage}%` }}
                      className={`h-full ${colors[idx % colors.length]} transition-all`}
                      title={`${t.display_name}: ${t.percentage.toFixed(1)}%`}
                    />
                  );
                })}
              </div>

              {/* Category Breakdown Table */}
              <div className="divide-y divide-white/[0.04] pt-2">
                {(storageResult?.file_type_distribution || []).map((type) => (
                  <div
                    key={type.category}
                    className="py-3 flex items-center justify-between hover:bg-white/[0.02] px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-slate-300">
                        {type.category === "developer" ? (
                          <FileCode size={16} className="text-indigo-400" />
                        ) : type.category === "archives" ? (
                          <FileArchive size={16} className="text-amber-400" />
                        ) : type.category === "media" ? (
                          <FileVideo size={16} className="text-cyan-400" />
                        ) : (
                          <FileText size={16} className="text-slate-400" />
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-white block">
                          {type.display_name}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {type.file_count.toLocaleString()} files
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-cyan-300 block">
                        {formatBytes(type.total_allocated_bytes)}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {type.percentage.toFixed(1)}% of analyzed storage
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Largest Files List */}
        {!isStorageAnalyzing && activeTab === "largest_files" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            {/* Filters Bar */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400">Filter Category:</span>
              {["all", "archives", "developer", "media", "documents", "system_caches"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                    filterType === f
                      ? "bg-indigo-600 text-white font-medium"
                      : "bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.06]"
                  }`}
                >
                  {f === "system_caches" ? "Caches" : f}
                </button>
              ))}
            </div>

            {/* Files List */}
            <div className="flex-1 overflow-y-auto rounded-xl bg-[#0D101C] border border-white/[0.06] divide-y divide-white/[0.04]">
              {filteredFiles.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500 font-mono">
                  No matching files found.
                </div>
              ) : (
                filteredFiles.map((file) => (
                  <div
                    key={file.path}
                    className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="space-y-0.5 min-w-0 pr-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {file.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                            file.classification === "safe_to_clean"
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                              : file.classification === "protected"
                              ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                              : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          }`}
                        >
                          {file.classification === "safe_to_clean"
                            ? "Safe"
                            : file.classification === "protected"
                            ? "Protected"
                            : "Review Required"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono truncate">
                        {truncatePath(file.path, 60)}
                      </p>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-white block">
                          {formatBytes(file.allocated_bytes)}
                        </span>
                        {file.modified_at && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {formatDate(file.modified_at)}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => openInFinder(file.path)}
                        className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-indigo-600/30 text-slate-400 hover:text-indigo-300 border border-white/[0.06] transition-colors"
                        title="Reveal in Finder"
                      >
                        <ArrowSquareOut size={15} />
                      </button>

                      <button
                        onClick={() => handleExcludePath(file.path, file.name)}
                        className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border border-white/[0.06] transition-colors"
                        title="Add to Exclusions Whitelist"
                      >
                        <MinusCircle size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Largest Folders List */}
        {!isStorageAnalyzing && activeTab === "largest_folders" && (
          <div className="flex-1 overflow-y-auto rounded-xl bg-[#0D101C] border border-white/[0.06] divide-y divide-white/[0.04]">
            {(storageResult?.largest_folders || []).map((folder) => (
              <div
                key={folder.path}
                className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
              >
                <div className="space-y-0.5 min-w-0 pr-4">
                  <div className="flex items-center space-x-2">
                    <Folder size={15} weight="fill" className="text-indigo-400 shrink-0" />
                    <span className="text-xs font-semibold text-white truncate">
                      {folder.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      ({folder.file_count.toLocaleString()} items)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {truncatePath(folder.path, 60)}
                  </p>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <span className="text-xs font-mono font-bold text-cyan-300">
                    {formatBytes(folder.allocated_bytes)}
                  </span>

                  <button
                    onClick={() => openInFinder(folder.path)}
                    className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-indigo-600/30 text-slate-400 hover:text-indigo-300 border border-white/[0.06] transition-colors"
                    title="Reveal in Finder"
                  >
                    <ArrowSquareOut size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
