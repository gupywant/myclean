import React, { useEffect } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, formatDate } from "../../lib/utils";
import { CheckCircle } from "@phosphor-icons/react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const HistoryView: React.FC = () => {
  const { cleanupHistory, fetchHistory } = useFluxStore();

  useEffect(() => {
    fetchHistory();
  }, []);

  const totalLifetimeFreed = cleanupHistory.reduce((acc, c) => acc + c.bytes_freed, 0);
  const totalOperations = cleanupHistory.length;

  // Prepare chart data (reverse so oldest to newest left-to-right)
  const chartData = [...cleanupHistory]
    .reverse()
    .slice(-10)
    .map((record) => ({
      date: formatDate(record.timestamp).split(",")[0],
      megabytes: Math.round(record.bytes_freed / (1024 * 1024)),
    }));

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      {/* Header & Lifetime Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">History & Audit Trail</h1>
          <p className="text-xs text-slate-400 mt-1">
            Immutable SQLite records of all system scan analyses and safe cleanup operations.
          </p>
        </div>

        <div className="flex items-center space-x-6 text-right">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              Total Space Reclaimed
            </span>
            <span className="text-xl font-bold font-mono text-cyan-400">
              {formatBytes(totalLifetimeFreed)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              Total Operations
            </span>
            <span className="text-xl font-bold font-mono text-white">
              {totalOperations}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Chart */}
      {chartData.length > 0 && (
        <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
              Space Freed Over Time (MB)
            </h2>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
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
                <Bar dataKey="megabytes" fill="#6366F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
            Operation Audit Log
          </h2>
        </div>

        {cleanupHistory.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No cleanup operations recorded yet. Perform your first clean to populate audit logs.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {cleanupHistory.map((record) => (
              <div
                key={record.id ?? record.timestamp}
                className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <CheckCircle size={16} weight="fill" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-white">
                        Cleaned {record.items_deleted} item{record.items_deleted === 1 ? "" : "s"}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-1.5 py-0.2 rounded border border-white/[0.06]">
                        via {record.method === "trash" ? "macOS Trash" : "Permanent"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {formatDate(record.timestamp)}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    +{formatBytes(record.bytes_freed)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
