import React, { useEffect, useState } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, formatDate } from "../../lib/utils";
import type { CleanupHistoryItem } from "../../types";
import {
  CheckCircle,
  WarningCircle,
  Clock,
  Funnel,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  ChartBar,
  ChartLine,
  Trash,
  Flask,
  Info,
  X,
  FileCode,
} from "@phosphor-icons/react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const HistoryView: React.FC = () => {
  const {
    historyQueryResponse,
    isHistoryLoading,
    historyFilter,
    setHistoryFilter,
    cleanupAnalytics,
    fetchCleanupAnalytics,
  } = useFluxStore();

  const [activeTab, setActiveTab] = useState<"timeline" | "analytics">("timeline");
  const [selectedRecord, setSelectedRecord] = useState<CleanupHistoryItem | null>(null);

  useEffect(() => {
    setHistoryFilter({ page: 1, page_size: 15 });
    fetchCleanupAnalytics();
  }, []);

  const totalTrash = cleanupAnalytics?.total_bytes_moved_to_trash ?? 0;
  const totalDocker = cleanupAnalytics?.docker_bytes_reclaimed ?? 0;
  const totalOps = cleanupAnalytics?.total_operations ?? 0;

  // Chart data from analytics
  const trendData = (cleanupAnalytics?.daily_trends || []).map((t) => ({
    date: t.date.slice(5),
    megabytes: Math.round(t.bytes_moved_to_trash / 1048576),
    operations: t.operations,
  }));

  const categoryData = (cleanupAnalytics?.storage_by_category || []).map((c) => ({
    name: c.category,
    megabytes: Math.round(c.bytes / 1048576),
    items: c.items,
  }));

  const items = historyQueryResponse?.items || [];
  const totalPages = historyQueryResponse?.total_pages || 1;
  const currentPage = historyQueryResponse?.current_page || 1;
  const totalCount = historyQueryResponse?.total_count || 0;

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      {/* Header & High-Level Metric Cards */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2">
            <span>History & Audit Studio</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Verified SQLite Records
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Searchable, itemized timeline and analytics of all scans and recoverable operations.
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl self-start md:self-auto">
          <button
            onClick={() => setActiveTab("timeline")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "timeline"
                ? "bg-violet-600 text-white shadow-md shadow-violet-950/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Clock size={14} />
            <span>Activity Timeline</span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "analytics"
                ? "bg-violet-600 text-white shadow-md shadow-violet-950/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ChartBar size={14} />
            <span>Cleanup Analytics</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
              Moved to macOS Trash
            </span>
            <Trash size={14} className="text-emerald-400" />
          </div>
          <span className="text-xl font-bold font-mono text-emerald-400 block">
            {formatBytes(totalTrash)}
          </span>
          <p className="text-[10px] text-slate-500">
            Recoverable in ~/.Trash until Trash is manually emptied.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
              Docker Pruned Storage
            </span>
            <FileCode size={14} className="text-cyan-400" />
          </div>
          <span className="text-xl font-bold font-mono text-cyan-400 block">
            {formatBytes(totalDocker)}
          </span>
          <p className="text-[10px] text-slate-500">
            Internal daemon caches pruned. Host disk shrinks via VM compaction.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
              Total Recorded Actions
            </span>
            <CheckCircle size={14} className="text-violet-400" />
          </div>
          <span className="text-xl font-bold font-mono text-white block">
            {totalOps} Operations
          </span>
          <p className="text-[10px] text-slate-500">
            Complete audit trail safely indexed in myclean.db.
          </p>
        </div>
      </div>

      {/* Advisory Alert Banner */}
      <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center space-x-3 text-xs text-slate-300">
        <Info size={18} className="text-violet-400 shrink-0" />
        <p className="text-[11px]">
          <strong className="text-white">macOS Storage Recovery Note:</strong> Moving files to macOS Trash guarantees safety and instant recovery. Physical APFS disk allocation is restored when you empty the Trash in Finder.
        </p>
      </div>

      {/* Tab 1: Activity Timeline */}
      {activeTab === "timeline" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <MagnifyingGlass size={14} className="absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by operation name, error reason, or paths..."
                  value={historyFilter.search_query || ""}
                  onChange={(e) => setHistoryFilter({ search_query: e.target.value, page: 1 })}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                />
              </div>

              {/* Category Filter */}
              <div className="flex items-center space-x-2">
                <Funnel size={14} className="text-slate-500 shrink-0" />
                <select
                  value={historyFilter.category || "all"}
                  onChange={(e) => setHistoryFilter({ category: e.target.value, page: 1 })}
                  className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none"
                >
                  <option value="all" className="bg-slate-900">All Categories</option>
                  <option value="System Cache" className="bg-slate-900">Deep Clean</option>
                  <option value="Developer" className="bg-slate-900">Developer Spaces</option>
                  <option value="Docker" className="bg-slate-900">Docker Studio</option>
                  <option value="Applications" className="bg-slate-900">App Uninstaller</option>
                  <option value="Duplicates" className="bg-slate-900">Duplicate Finder</option>
                </select>

                {/* Dry Run Filter */}
                <select
                  value={
                    historyFilter.dry_run_only === null || historyFilter.dry_run_only === undefined
                      ? "all"
                      : historyFilter.dry_run_only
                      ? "dry_run"
                      : "real"
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setHistoryFilter({
                      dry_run_only: val === "all" ? null : val === "dry_run",
                      page: 1,
                    });
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none"
                >
                  <option value="all" className="bg-slate-900">All Operations</option>
                  <option value="real" className="bg-slate-900">Actual Trashed</option>
                  <option value="dry_run" className="bg-slate-900">Dry-Run Simulations</option>
                </select>

                {/* Sorting */}
                <select
                  value={historyFilter.sort_by || "id"}
                  onChange={(e) => setHistoryFilter({ sort_by: e.target.value as any, page: 1 })}
                  className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none"
                >
                  <option value="id" className="bg-slate-900">Most Recent</option>
                  <option value="bytes_freed" className="bg-slate-900">Largest Space</option>
                  <option value="items_deleted" className="bg-slate-900">Most Items</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
              <span>{totalCount} Total Entries</span>
              <span>Page {currentPage} of {totalPages}</span>
            </div>

            {isHistoryLoading ? (
              <div className="p-16 text-center text-xs text-slate-400 space-y-2">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Loading audit timeline...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="p-16 text-center space-y-2">
                <Clock size={36} className="text-slate-500 mx-auto opacity-40" />
                <p className="text-xs text-slate-400">No cleanup operations match the selected criteria.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {items.map((record) => (
                  <div
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                    className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-3.5 min-w-0 pr-4">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          record.status === "failed"
                            ? "bg-rose-500/10 text-rose-400"
                            : record.is_dry_run
                            ? "bg-cyan-500/10 text-cyan-400"
                            : "bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        {record.status === "failed" ? (
                          <WarningCircle size={16} weight="fill" />
                        ) : record.is_dry_run ? (
                          <Flask size={16} weight="fill" />
                        ) : (
                          <CheckCircle size={16} weight="fill" />
                        )}
                      </div>

                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-white">
                            {record.cleanup_source}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                            {record.category}
                          </span>
                          {record.is_dry_run && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              SIMULATION
                            </span>
                          )}
                          {record.status === "partial" && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              PARTIAL
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-mono">
                          <span>{formatDate(record.timestamp)}</span>
                          <span>•</span>
                          <span>{record.items_deleted} item{record.items_deleted === 1 ? "" : "s"} processed</span>
                          {record.items_failed > 0 && (
                            <span className="text-rose-400">({record.items_failed} failed)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`text-xs font-mono font-bold block ${
                        record.is_dry_run ? "text-cyan-400" : "text-emerald-400"
                      }`}>
                        +{formatBytes(record.estimated_reclaimable_bytes)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {record.method === "trash" ? "macOS Trash" : record.method}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setHistoryFilter({ page: currentPage - 1 })}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <CaretLeft size={12} />
                  <span>Previous</span>
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, idx) => {
                    const pageNum = idx + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setHistoryFilter({ page: pageNum })}
                        className={`w-7 h-7 rounded-lg text-xs font-mono ${
                          currentPage === pageNum
                            ? "bg-violet-600 text-white font-bold"
                            : "text-slate-400 hover:bg-white/[0.04]"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setHistoryFilter({ page: currentPage + 1 })}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <span>Next</span>
                  <CaretRight size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Analytics Studio */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* Trends Area Chart */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
                  <ChartLine size={16} className="text-cyan-400" />
                  <span>30-Day Historical Cleaning Activity</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Daily volume of storage moved to macOS Trash or Docker pruned.
                </p>
              </div>
            </div>

            <div className="h-56 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorMb" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis
                    dataKey="date"
                    stroke="#64748B"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
                  />
                  <YAxis
                    stroke="#64748B"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
                    unit="MB"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#101422",
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "#06B6D4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="megabytes"
                    stroke="#8B5CF6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorMb)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Distribution Bar Chart */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
            <div>
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
                <ChartBar size={16} className="text-violet-400" />
                <span>Volume Cleaned by Category (MB)</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Breakdown of physical assets moved to Trash across studios.
              </p>
            </div>

            <div className="h-48 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis
                    dataKey="name"
                    stroke="#64748B"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
                  />
                  <YAxis
                    stroke="#64748B"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
                    unit="MB"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#101422",
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "#8B5CF6" }}
                  />
                  <Bar dataKey="megabytes" fill="#6366F1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Record Inspection Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-2xl bg-[#0D101C] border border-white/[0.1] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {selectedRecord.cleanup_source} Audit Details
                </h3>
                <p className="text-[10px] text-slate-500 font-mono">
                  {formatDate(selectedRecord.timestamp)}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[10px] text-slate-400 block font-mono">Reclaimed / Trashed</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {formatBytes(selectedRecord.estimated_reclaimable_bytes)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[10px] text-slate-400 block font-mono">Processed Items</span>
                <span className="text-sm font-bold font-mono text-white">
                  {selectedRecord.items_deleted} files
                </span>
              </div>
            </div>

            {selectedRecord.error_summary && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                <strong className="block text-rose-200">Error Encountered:</strong>
                <p className="font-mono text-[11px] mt-0.5">{selectedRecord.error_summary}</p>
              </div>
            )}

            <div>
              <span className="text-xs font-semibold text-slate-300 block mb-1.5">
                Audit Log Payload (SQLite):
              </span>
              <pre className="p-3 rounded-lg bg-black/40 border border-white/[0.04] text-[10px] font-mono text-slate-400 max-h-48 overflow-y-auto">
                {JSON.stringify(JSON.parse(selectedRecord.details_json || "{}"), null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-white transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
