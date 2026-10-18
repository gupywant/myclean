import React, { useState, useMemo } from "react";
import type { StorageNode, FileTypeCategory } from "../../types";
import { formatBytes } from "../../lib/utils";
import { Folder, File, ArrowElbowDownRight } from "@phosphor-icons/react";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreemapTile {
  x: number;
  y: number;
  width: number;
  height: number;
  node: StorageNode;
}

interface SquarifiedTreemapProps {
  rootNode: StorageNode;
  width: number;
  height: number;
  onSelectNode: (node: StorageNode) => void;
}

// Compute aspect ratio of a candidate row
function worstRatio(row: number[], w: number): number {
  if (row.length === 0 || w <= 0) return Infinity;
  const s = row.reduce((a, b) => a + b, 0);
  if (s <= 0) return Infinity;
  let max = -Infinity;
  let min = Infinity;
  for (const v of row) {
    if (v > max) max = v;
    if (v < min) min = v;
  }
  const w2 = w * w;
  const s2 = s * s;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}

// Layout an array of nodes into rect (x, y, width, height) using Squarified Treemap
function layoutSquarified(
  nodes: StorageNode[],
  bounds: Rect
): TreemapTile[] {
  if (nodes.length === 0 || bounds.width <= 0 || bounds.height <= 0) {
    return [];
  }

  const totalBytes = nodes.reduce((acc, n) => acc + (n.allocated_bytes || 1), 0);
  if (totalBytes <= 0) return [];

  const totalArea = bounds.width * bounds.height;
  // Normalize node areas to totalArea
  const items = nodes.map((node) => ({
    node,
    area: ((node.allocated_bytes || 1) / totalBytes) * totalArea,
  }));

  // Sort descending by area
  items.sort((a, b) => b.area - a.area);

  const tiles: TreemapTile[] = [];

  let remaining = [...items];
  let curBounds: Rect = { ...bounds };

  while (remaining.length > 0) {
    const isHorizontal = curBounds.width < curBounds.height;
    const w = isHorizontal ? curBounds.width : curBounds.height;

    let row = [remaining[0].area];
    let rowNodes = [remaining[0].node];
    let i = 1;

    while (i < remaining.length) {
      const nextArea = remaining[i].area;
      const candidateRow = [...row, nextArea];
      if (worstRatio(candidateRow, w) <= worstRatio(row, w)) {
        row = candidateRow;
        rowNodes.push(remaining[i].node);
        i++;
      } else {
        break;
      }
    }

    remaining = remaining.slice(row.length);

    // Position the row within curBounds
    const rowArea = row.reduce((a, b) => a + b, 0);
    const rowThickness = rowArea / w;

    let offset = 0;
    for (let j = 0; j < row.length; j++) {
      const itemLen = row[j] / rowThickness;
      if (isHorizontal) {
        tiles.push({
          x: curBounds.x + offset,
          y: curBounds.y,
          width: Math.max(0, itemLen),
          height: Math.max(0, rowThickness),
          node: rowNodes[j],
        });
        offset += itemLen;
      } else {
        tiles.push({
          x: curBounds.x,
          y: curBounds.y + offset,
          width: Math.max(0, rowThickness),
          height: Math.max(0, itemLen),
          node: rowNodes[j],
        });
        offset += itemLen;
      }
    }

    // Shrink remaining bounds
    if (isHorizontal) {
      curBounds = {
        x: curBounds.x,
        y: curBounds.y + rowThickness,
        width: curBounds.width,
        height: Math.max(0, curBounds.height - rowThickness),
      };
    } else {
      curBounds = {
        x: curBounds.x + rowThickness,
        y: curBounds.y,
        width: Math.max(0, curBounds.width - rowThickness),
        height: curBounds.height,
      };
    }
  }

  return tiles;
}

export const getColorForNode = (
  fileType: FileTypeCategory | null,
  isDir: boolean,
  classification: string
): { bg: string; border: string; glow: string; text: string } => {
  if (classification === "safe_to_clean") {
    return {
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/40",
      glow: "hover:shadow-[0_0_15px_rgba(16,185,129,0.25)]",
      text: "text-emerald-300",
    };
  }

  if (classification === "protected") {
    return {
      bg: "bg-rose-500/15",
      border: "border-rose-500/40",
      glow: "hover:shadow-[0_0_15px_rgba(244,63,94,0.25)]",
      text: "text-rose-300",
    };
  }

  if (isDir) {
    return {
      bg: "bg-indigo-600/15",
      border: "border-indigo-500/35",
      glow: "hover:shadow-[0_0_15px_rgba(99,102,241,0.25)]",
      text: "text-indigo-300",
    };
  }

  switch (fileType) {
    case "developer":
      return {
        bg: "bg-violet-600/15",
        border: "border-violet-500/40",
        glow: "hover:shadow-[0_0_15px_rgba(139,92,246,0.25)]",
        text: "text-violet-300",
      };
    case "archives":
      return {
        bg: "bg-amber-500/15",
        border: "border-amber-500/40",
        glow: "hover:shadow-[0_0_15px_rgba(245,158,11,0.25)]",
        text: "text-amber-300",
      };
    case "media":
      return {
        bg: "bg-cyan-500/15",
        border: "border-cyan-500/40",
        glow: "hover:shadow-[0_0_15px_rgba(6,182,212,0.25)]",
        text: "text-cyan-300",
      };
    case "documents":
      return {
        bg: "bg-sky-500/15",
        border: "border-sky-500/40",
        glow: "hover:shadow-[0_0_15px_rgba(14,165,233,0.25)]",
        text: "text-sky-300",
      };
    case "system_caches":
      return {
        bg: "bg-teal-500/15",
        border: "border-teal-500/40",
        glow: "hover:shadow-[0_0_15px_rgba(20,184,166,0.25)]",
        text: "text-teal-300",
      };
    default:
      return {
        bg: "bg-slate-800/40",
        border: "border-white/10",
        glow: "hover:shadow-[0_0_12px_rgba(255,255,255,0.08)]",
        text: "text-slate-300",
      };
  }
};

export const SquarifiedTreemap: React.FC<SquarifiedTreemapProps> = ({
  rootNode,
  width,
  height,
  onSelectNode,
}) => {
  const [hoveredTile, setHoveredTile] = useState<TreemapTile | null>(null);

  const tiles = useMemo(() => {
    // If rootNode has children, display children; else display rootNode itself
    const childrenToLayout =
      rootNode.children && rootNode.children.length > 0
        ? rootNode.children
        : [rootNode];

    return layoutSquarified(childrenToLayout, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }, [rootNode, width, height]);

  if (width <= 0 || height <= 0 || tiles.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono">
        No directory contents to visualize.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full select-none overflow-hidden rounded-xl bg-[#090C16] border border-white/[0.06]">
      {/* SVG Container for Treemap Tiles */}
      <svg
        width={width}
        height={height}
        className="w-full h-full block"
        onMouseLeave={() => setHoveredTile(null)}
      >
        <defs>
          <radialGradient id="treemapHighlight" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {tiles.map((tile) => {
          const isDir = tile.node.node_type === "directory";
          const hasChildren = tile.node.children && tile.node.children.length > 0;
          const pad = 2;
          const rx = tile.x + pad;
          const ry = tile.y + pad;
          const rw = Math.max(0, tile.width - pad * 2);
          const rh = Math.max(0, tile.height - pad * 2);

          const isHovered = hoveredTile?.node.id === tile.node.id;

          // Check if tile is large enough to show text
          const showLabel = rw >= 45 && rh >= 24;
          const showSize = rw >= 65 && rh >= 42;

          return (
            <g
              key={tile.node.id}
              onClick={() => onSelectNode(tile.node)}
              onMouseEnter={() => setHoveredTile(tile)}
              className="cursor-pointer transition-all duration-150"
            >
              {/* Tile Background Rect */}
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                rx={6}
                fill={
                  tile.node.classification === "safe_to_clean"
                    ? isHovered ? "rgba(16, 185, 129, 0.28)" : "rgba(16, 185, 129, 0.16)"
                    : tile.node.classification === "protected"
                    ? isHovered ? "rgba(244, 63, 94, 0.28)" : "rgba(244, 63, 94, 0.16)"
                    : isDir
                    ? isHovered ? "rgba(99, 102, 241, 0.28)" : "rgba(99, 102, 241, 0.16)"
                    : isHovered ? "rgba(139, 92, 246, 0.28)" : "rgba(139, 92, 246, 0.16)"
                }
                stroke={
                  isHovered
                    ? "rgba(255, 255, 255, 0.45)"
                    : tile.node.classification === "safe_to_clean"
                    ? "rgba(16, 185, 129, 0.4)"
                    : tile.node.classification === "protected"
                    ? "rgba(244, 63, 94, 0.4)"
                    : isDir
                    ? "rgba(99, 102, 241, 0.35)"
                    : "rgba(139, 92, 246, 0.35)"
                }
                strokeWidth={isHovered ? 1.5 : 1}
              />

              {/* Text Labels inside Tile */}
              {showLabel && (
                <text
                  x={rx + 8}
                  y={ry + 16}
                  fill="#FFFFFF"
                  fontSize={11}
                  fontWeight={600}
                  fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
                  clipPath={`url(#clip-${tile.node.id})`}
                  className="pointer-events-none"
                >
                  {tile.node.name}
                </text>
              )}

              {showSize && (
                <text
                  x={rx + 8}
                  y={ry + 32}
                  fill={isHovered ? "#38BDF8" : "#94A3B8"}
                  fontSize={10}
                  fontWeight={500}
                  fontFamily="'SF Mono', ui-monospace, Menlo, monospace"
                  className="pointer-events-none"
                >
                  {formatBytes(tile.node.allocated_bytes)}
                </text>
              )}

              {/* Drill-down indicator badge for directories */}
              {hasChildren && rw >= 80 && rh >= 55 && (
                <g
                  transform={`translate(${rx + rw - 20}, ${ry + 8})`}
                  className="pointer-events-none opacity-60"
                >
                  <circle cx={6} cy={6} r={8} fill="rgba(255,255,255,0.08)" />
                  <path
                    d="M4 6 L7 9 L10 6"
                    stroke="#FFFFFF"
                    strokeWidth={1.2}
                    fill="none"
                    strokeLinecap="round"
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Interactive Hover Tooltip Overlay */}
      {hoveredTile && (
        <div
          className="pointer-events-none absolute z-30 px-3.5 py-2.5 rounded-xl bg-[#0F1322]/95 backdrop-blur-xl border border-white/15 shadow-2xl shadow-black/80 space-y-1.5 transition-all text-xs"
          style={{
            left: Math.min(hoveredTile.x + 12, width - 260),
            top: Math.min(hoveredTile.y + 12, height - 120),
            width: "250px",
          }}
        >
          <div className="flex items-center space-x-2">
            {hoveredTile.node.node_type === "directory" ? (
              <Folder size={15} weight="fill" className="text-indigo-400 shrink-0" />
            ) : (
              <File size={15} className="text-violet-400 shrink-0" />
            )}
            <span className="font-bold text-white truncate text-xs">
              {hoveredTile.node.name}
            </span>
          </div>

          <div className="text-[10px] text-slate-400 font-mono truncate">
            {hoveredTile.node.path}
          </div>

          <div className="pt-1.5 border-t border-white/[0.08] grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-slate-400 block text-[10px]">Allocated</span>
              <span className="font-mono font-semibold text-cyan-300">
                {formatBytes(hoveredTile.node.allocated_bytes)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Logical</span>
              <span className="font-mono text-slate-300">
                {formatBytes(hoveredTile.node.logical_bytes)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-white/[0.05] text-[10px]">
            <span
              className={`px-1.5 py-0.2 rounded font-medium ${
                hoveredTile.node.classification === "safe_to_clean"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : hoveredTile.node.classification === "protected"
                  ? "bg-rose-500/20 text-rose-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {hoveredTile.node.classification === "safe_to_clean"
                ? "Safe to Clean"
                : hoveredTile.node.classification === "protected"
                ? "Protected"
                : "Review Required"}
            </span>

            {hoveredTile.node.children && hoveredTile.node.children.length > 0 && (
              <span className="text-indigo-300 flex items-center space-x-1 font-medium">
                <ArrowElbowDownRight size={11} />
                <span>Click to drill down</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
