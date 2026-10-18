import React, { useState } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, formatDate, truncatePath } from "../../lib/utils";
import type { ScanCategoryType, ScanItem } from "../../types";
import {
  Broom,
  MagnifyingGlass,
  CheckSquare,
  Square,
  ShieldCheck,
  FolderOpen,
  Info,
  Calendar,
  Lightning,
  Sparkle,
} from "@phosphor-icons/react";

export const DeepCleanView: React.FC = () => {
  const {
    scanResult,
    selectedItemIds,
    toggleItemSelection,
    selectAllItems,
    deselectAllItems,
    startScan,
    isScanning,
    openConfirmModal,
  } = useFluxStore();

  const [selectedCategory, setSelectedCategory] = useState<ScanCategoryType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectedItem, setInspectedItem] = useState<ScanItem | null>(null);

  if (!scanResult || scanResult.items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
          <Broom size={32} />
        </div>
        <div className="space-y-1 max-w-sm">
          <h2 className="text-base font-semibold text-white">No Scan Results Available</h2>
          <p className="text-xs text-slate-400">
            Run an analysis to inspect macOS system caches, application log files, and recoverable trash.
          </p>
        </div>
        <button
          onClick={startScan}
          disabled={isScanning}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center space-x-2"
        >
          <Sparkle size={14} weight="fill" />
          <span>{isScanning ? "Scanning..." : "Start System Scan"}</span>
        </button>
      </div>
    );
  }

  // Filter items
  const filteredItems = scanResult.items.filter((item) => {
    const matchCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchSearch =
      searchQuery.trim() === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.path.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const selectedBytes = scanResult.items
    .filter((i) => selectedItemIds.has(i.id))
    .reduce((acc, i) => acc + i.size_bytes, 0);

  const selectedCount = scanResult.items.filter((i) => selectedItemIds.has(i.id)).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top Controls Bar */}
      <div className="p-4 border-b border-white/[0.06] bg-[#0A0D18]/80 backdrop-blur-md flex items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlass
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            placeholder="Filter files by name or path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Selection buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={selectAllItems}
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-xs text-slate-300 font-medium transition-colors"
          >
            Select All
          </button>
          <button
            onClick={deselectAllItems}
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-xs text-slate-400 font-medium transition-colors"
          >
            Deselect
          </button>
        </div>
      </div>

      {/* Categories Horizontal Pill Scroll */}
      <div className="px-4 py-2.5 border-b border-white/[0.04] bg-[#070913] flex items-center space-x-2 overflow-x-auto">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
            selectedCategory === "all"
              ? "bg-indigo-600 text-white"
              : "bg-white/[0.03] text-slate-400 hover:text-white"
          }`}
        >
          All Items ({scanResult.items.length})
        </button>
        {scanResult.categories.map((cat) => (
          <button
            key={cat.category}
            onClick={() => setSelectedCategory(cat.category)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center space-x-1.5 ${
              selectedCategory === cat.category
                ? "bg-indigo-600 text-white"
                : "bg-white/[0.03] text-slate-400 hover:text-white"
            }`}
          >
            <span>{cat.display_name}</span>
            <span className="text-[10px] opacity-75 font-mono">
              {formatBytes(cat.total_bytes, 0)}
            </span>
          </button>
        ))}
      </div>

      {/* Main Content Area with Split Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Items Table */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.03]">
          {filteredItems.map((item) => {
            const isSelected = selectedItemIds.has(item.id);
            const isInspected = inspectedItem?.id === item.id;

            return (
              <div
                key={item.id}
                onClick={() => setInspectedItem(item)}
                className={`flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] cursor-pointer transition-colors ${
                  isInspected ? "bg-indigo-500/[0.06]" : ""
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleItemSelection(item.id);
                    }}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    {isSelected ? (
                      <CheckSquare size={18} weight="fill" className="text-indigo-400" />
                    ) : (
                      <Square size={18} className="text-slate-600" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {item.name}
                      </span>
                      {item.is_safe_to_clean && (
                        <span className="inline-flex items-center text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 rounded">
                          Safe
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      {truncatePath(item.path, 50)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 pl-4 shrink-0">
                  <span className="text-xs font-mono font-medium text-slate-300">
                    {formatBytes(item.size_bytes)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Inspector Drawer */}
        {inspectedItem && (
          <div className="w-80 border-l border-white/[0.06] bg-[#0A0D18] p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold tracking-wider text-indigo-400 uppercase">
                  Item Inspector
                </span>
                <h3 className="text-sm font-bold text-white break-words">
                  {inspectedItem.name}
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">
                    Size on Disk
                  </span>
                  <div className="text-base font-bold font-mono text-cyan-400">
                    {formatBytes(inspectedItem.size_bytes)}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {inspectedItem.file_count} file{inspectedItem.file_count === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center space-x-1">
                    <FolderOpen size={12} />
                    <span>Exact File Path</span>
                  </span>
                  <p className="text-[11px] font-mono text-slate-300 break-all bg-black/40 p-2 rounded border border-white/5">
                    {inspectedItem.path}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center space-x-1">
                    <Info size={12} />
                    <span>Classification</span>
                  </span>
                  <p className="text-xs text-slate-300">{inspectedItem.description}</p>
                </div>

                {inspectedItem.modified_at && (
                  <div className="space-y-1">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center space-x-1">
                      <Calendar size={12} />
                      <span>Last Modified</span>
                    </span>
                    <p className="text-xs text-slate-400 font-mono">
                      {formatDate(inspectedItem.modified_at)}
                    </p>
                  </div>
                )}

                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-start space-x-2">
                  <ShieldCheck size={16} className="shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Verified safe: Will be moved to the macOS Trash Bin for complete recoverability.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => toggleItemSelection(inspectedItem.id)}
              className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                selectedItemIds.has(inspectedItem.id)
                  ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              {selectedItemIds.has(inspectedItem.id) ? "Deselect Item" : "Select for Cleaning"}
            </button>
          </div>
        )}
      </div>

      {/* Floating Bottom Action Bar */}
      <div className="p-4 border-t border-white/[0.06] bg-[#0A0D18]/95 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400">Selected for removal:</span>
          <span className="font-bold text-white">{selectedCount} items</span>
          <span className="text-slate-600">/</span>
          <span className="font-bold font-mono text-cyan-400">{formatBytes(selectedBytes)}</span>
        </div>

        <button
          onClick={openConfirmModal}
          disabled={selectedCount === 0}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Lightning size={14} weight="fill" />
          <span>Clean Selected Items</span>
        </button>
      </div>
    </div>
  );
};
