import React, { useState } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, formatDate, truncatePath } from "../../lib/utils";
import type { RiskClassification, ScanCategoryType, ScanItem } from "../../types";
import {
  Broom,
  MagnifyingGlass,
  CheckSquare,
  Square,
  ShieldCheck,
  ShieldWarning,
  Lock,
  FolderOpen,
  Info,
  Calendar,
  Lightning,
  Sparkle,
  WarningCircle,
  Tag,
  ArrowSquareOut,
  SlidersHorizontal,
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
    openInFinder,
  } = useFluxStore();

  const [selectedCategory, setSelectedCategory] = useState<ScanCategoryType | "all">("all");
  const [selectedClassification, setSelectedClassification] = useState<RiskClassification | "all">("all");
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
    const itemClassification = item.classification ?? (item.is_safe_to_clean ? "safe_to_clean" : "review_required");
    const matchClassification = selectedClassification === "all" || itemClassification === selectedClassification;
    const matchSearch =
      searchQuery.trim() === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.detection_rule_id && item.detection_rule_id.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCategory && matchClassification && matchSearch;
  });

  const selectedBytes = scanResult.items
    .filter((i) => selectedItemIds.has(i.id))
    .reduce((acc, i) => acc + (i.allocated_bytes ?? i.size_bytes), 0);

  const selectedCount = scanResult.items.filter((i) => selectedItemIds.has(i.id)).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top Controls Bar */}
      <div className="p-4 border-b border-white/[0.06] bg-[#0A0D18]/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <MagnifyingGlass
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            placeholder="Search by name, path, or rule ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Classification Filter Tabs */}
        <div className="flex items-center space-x-1.5 bg-black/40 p-1 rounded-lg border border-white/[0.06] text-xs">
          <SlidersHorizontal size={13} className="text-slate-500 ml-1.5 mr-0.5" />
          <button
            onClick={() => setSelectedClassification("all")}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
              selectedClassification === "all"
                ? "bg-white/[0.08] text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            All Risks
          </button>
          <button
            onClick={() => setSelectedClassification("safe_to_clean")}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center space-x-1 ${
              selectedClassification === "safe_to_clean"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-emerald-400/70 hover:text-emerald-300"
            }`}
          >
            <ShieldCheck size={11} weight="fill" />
            <span>Safe</span>
          </button>
          <button
            onClick={() => setSelectedClassification("review_required")}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center space-x-1 ${
              selectedClassification === "review_required"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-amber-400/70 hover:text-amber-300"
            }`}
          >
            <ShieldWarning size={11} weight="fill" />
            <span>Review</span>
          </button>
          <button
            onClick={() => setSelectedClassification("protected")}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center space-x-1 ${
              selectedClassification === "protected"
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                : "text-rose-400/70 hover:text-rose-300"
            }`}
          >
            <Lock size={11} weight="fill" />
            <span>Protected</span>
          </button>
        </div>

        {/* Selection buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={selectAllItems}
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-xs text-slate-300 font-medium transition-colors"
          >
            Select Eligible
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
      <div className="px-4 py-2 border-b border-white/[0.04] bg-[#070913] flex items-center space-x-2 overflow-x-auto">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
            selectedCategory === "all"
              ? "bg-indigo-600 text-white"
              : "bg-white/[0.03] text-slate-400 hover:text-white"
          }`}
        >
          All Scopes ({scanResult.items.length})
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
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No files matching current scope or risk filter criteria.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedItemIds.has(item.id);
              const isInspected = inspectedItem?.id === item.id;
              const classification = item.classification ?? (item.is_safe_to_clean ? "safe_to_clean" : "review_required");
              const isProtected = classification === "protected";
              const isEligible = item.is_eligible_for_cleanup !== false && !isProtected;

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
                        if (isEligible) {
                          toggleItemSelection(item.id);
                        }
                      }}
                      disabled={!isEligible}
                      className={`text-slate-400 transition-colors ${
                        !isEligible ? "opacity-30 cursor-not-allowed" : "hover:text-white"
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare size={18} weight="fill" className="text-indigo-400" />
                      ) : (
                        <Square size={18} className="text-slate-600" />
                      )}
                    </button>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-xs font-semibold text-white truncate max-w-[260px]">
                          {item.name}
                        </span>

                        {/* Classification Badges */}
                        {classification === "safe_to_clean" && (
                          <span className="inline-flex items-center space-x-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium">
                            <ShieldCheck size={11} weight="fill" />
                            <span>Safe to Clean</span>
                          </span>
                        )}
                        {classification === "review_required" && (
                          <span className="inline-flex items-center space-x-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium">
                            <ShieldWarning size={11} weight="fill" />
                            <span>Review Required</span>
                          </span>
                        )}
                        {classification === "protected" && (
                          <span className="inline-flex items-center space-x-1 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded font-medium">
                            <Lock size={11} weight="fill" />
                            <span>Protected</span>
                          </span>
                        )}

                        {/* Detection Rule Pill */}
                        {item.detection_rule_id && (
                          <span className="text-[9px] font-mono text-slate-400 bg-white/[0.03] border border-white/[0.06] px-1.5 py-0.5 rounded">
                            {item.detection_rule_id}
                          </span>
                        )}

                        {/* Active App Badge */}
                        {item.associated_app && (
                          <span className="inline-flex items-center space-x-1 text-[9px] text-amber-300 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded">
                            <WarningCircle size={10} weight="fill" />
                            <span>App: {item.associated_app}</span>
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 font-mono truncate">
                        {truncatePath(item.path, 55)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 pl-4 shrink-0">
                    <div className="text-right">
                      <span className="text-xs font-mono font-medium text-slate-300 block">
                        {formatBytes(item.allocated_bytes ?? item.size_bytes)}
                      </span>
                      {item.logical_bytes && item.logical_bytes !== (item.allocated_bytes ?? item.size_bytes) && (
                        <span className="text-[10px] font-mono text-slate-600 block">
                          Logical: {formatBytes(item.logical_bytes)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Inspector Drawer */}
        {inspectedItem && (
          <div className="w-88 border-l border-white/[0.06] bg-[#0A0D18] p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold tracking-wider text-indigo-400 uppercase">
                  Candidate Inspector
                </span>
                <h3 className="text-sm font-bold text-white break-words">
                  {inspectedItem.name}
                </h3>
              </div>

              {/* Space Breakdown Box */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">
                    Allocated on APFS
                  </span>
                  <span className="text-sm font-bold font-mono text-cyan-400">
                    {formatBytes(inspectedItem.allocated_bytes ?? inspectedItem.size_bytes)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span className="text-[10px] text-slate-500">Logical Size</span>
                  <span className="font-mono">
                    {formatBytes(inspectedItem.logical_bytes ?? inspectedItem.size_bytes)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-xs pt-1 border-t border-white/[0.04]">
                  <span className="text-[10px] text-slate-500">File Count</span>
                  <span className="font-mono">
                    {inspectedItem.file_count} item{inspectedItem.file_count === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {/* Exact Path with Reveal in Finder */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center space-x-1">
                    <FolderOpen size={12} />
                    <span>Exact Path</span>
                  </span>
                  <button
                    onClick={() => openInFinder(inspectedItem.path)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                  >
                    <span>Reveal</span>
                    <ArrowSquareOut size={10} />
                  </button>
                </div>
                <p className="text-[11px] font-mono text-slate-300 break-all bg-black/40 p-2.5 rounded-lg border border-white/5">
                  {inspectedItem.path}
                </p>
              </div>

              {/* Detection Rule & Disposable Justification */}
              {inspectedItem.detection_rule_id && (
                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center space-x-1">
                    <Tag size={12} />
                    <span>Detection Rule</span>
                  </span>
                  <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono">
                    {inspectedItem.detection_rule_id}
                  </div>
                </div>
              )}

              {/* Disposable Justification */}
              {inspectedItem.disposable_reason ? (
                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center space-x-1">
                    <Info size={12} />
                    <span>Disposable Justification</span>
                  </span>
                  <p className="text-xs text-slate-300 bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.05] leading-relaxed">
                    {inspectedItem.disposable_reason}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center space-x-1">
                    <Info size={12} />
                    <span>Description</span>
                  </span>
                  <p className="text-xs text-slate-300">{inspectedItem.description}</p>
                </div>
              )}

              {/* Ineligibility or Running App Warning */}
              {inspectedItem.ineligibility_reason && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start space-x-2">
                  <WarningCircle size={15} className="shrink-0 mt-0.5 text-amber-400" />
                  <p className="text-[11px] leading-relaxed">
                    {inspectedItem.ineligibility_reason}
                  </p>
                </div>
              )}

              {inspectedItem.modified_at && (
                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold flex items-center space-x-1">
                    <Calendar size={12} />
                    <span>Last Modified Date</span>
                  </span>
                  <p className="text-xs text-slate-400 font-mono">
                    {formatDate(inspectedItem.modified_at)}
                  </p>
                </div>
              )}

              {/* Safety Shield Note */}
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-start space-x-2">
                <ShieldCheck size={16} className="shrink-0 mt-0.5 text-emerald-400" />
                <p className="text-[11px] leading-relaxed">
                  Targeted cleanup uses macOS native Trash for 100% recoverability. Permanent deletion is disabled.
                </p>
              </div>
            </div>

            {/* Selection Action Button */}
            <div className="pt-4">
              {inspectedItem.classification === "protected" || inspectedItem.is_eligible_for_cleanup === false ? (
                <button
                  disabled
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed flex items-center justify-center space-x-1.5"
                >
                  <Lock size={14} />
                  <span>Protected by Safety Guardrail</span>
                </button>
              ) : (
                <button
                  onClick={() => toggleItemSelection(inspectedItem.id)}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    selectedItemIds.has(inspectedItem.id)
                      ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                  }`}
                >
                  {selectedItemIds.has(inspectedItem.id) ? "Deselect Item" : "Select for Cleaning"}
                </button>
              )}
            </div>
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
