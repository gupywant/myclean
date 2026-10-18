import React, { useState, useEffect } from "react";
import { useFluxStore } from "../../store/useFluxStore";
import { formatBytes, truncatePath } from "../../lib/utils";
import {
  Code,
  Terminal,
  Cpu,
  Package,
  HardDrives,
  Trash,
  CheckCircle,
  ArrowClockwise,
  MagnifyingGlass,
  Plus,
  FolderOpen,
  X,
  Lock,
  Plugs,
  PlugsConnected,
  FileCode,
} from "@phosphor-icons/react";

export const DeveloperSpaceView: React.FC = () => {
  const {
    developerResult,
    isDeveloperScanning,
    developerSelectedPaths,
    developerWorkspaces,
    developerActiveTab,
    dockerResult,
    isDockerInspecting,
    dockerSelectedIds,
    scanDeveloperSpaces,
    toggleDeveloperPathSelection,
    selectAllDeveloperPaths,
    addDeveloperWorkspace,
    removeDeveloperWorkspace,
    setDeveloperActiveTab,
    openDeveloperCleanModal,
    inspectDocker,
    toggleDockerResourceSelection,
    selectAllDockerResources,
    openDockerCleanModal,
    openInFinder,
  } = useFluxStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [dockerFilter, setDockerFilter] = useState<string>("all");

  useEffect(() => {
    if (!developerResult && !isDeveloperScanning) {
      scanDeveloperSpaces();
    }
    if (!dockerResult && !isDockerInspecting) {
      inspectDocker();
    }
  }, []);

  // Filter items in Tool Caches
  const filteredDevItems = (developerResult?.items ?? []).filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.display_name.toLowerCase().includes(q) ||
      item.path.toLowerCase().includes(q) ||
      item.provider_name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  const toolCacheItems = filteredDevItems.filter(
    (i) => i.provider_id !== "workspace_artifacts"
  );
  const workspaceItems = (developerResult?.items ?? []).filter(
    (i) => i.provider_id === "workspace_artifacts"
  );

  // Selected totals
  const selectedToolItems = (developerResult?.items ?? []).filter((i) =>
    developerSelectedPaths.has(i.path)
  );
  const selectedBytes = selectedToolItems.reduce((acc, i) => acc + i.size_bytes, 0);

  // Filter Docker items
  const filteredDockerResources = (dockerResult?.resources ?? []).filter((r) => {
    if (dockerFilter === "all") return true;
    if (dockerFilter === "containers") return r.resource_type === "stopped_container";
    if (dockerFilter === "images")
      return r.resource_type === "dangling_image" || r.resource_type === "unused_image";
    if (dockerFilter === "cache") return r.resource_type === "build_cache";
    if (dockerFilter === "volumes") return r.resource_type === "volume";
    return true;
  });

  const selectedDockerItems = (dockerResult?.resources ?? []).filter(
    (r) => dockerSelectedIds.has(r.id) && !r.is_protected
  );
  const selectedDockerBytes = selectedDockerItems.reduce((acc, r) => acc + r.size_bytes, 0);

  const handleAddWorkspace = () => {
    if (!workspaceInput.trim()) return;
    addDeveloperWorkspace(workspaceInput.trim());
    setWorkspaceInput("");
  };

  const getProviderIcon = (category: string) => {
    switch (category) {
      case "xcode":
        return Cpu;
      case "homebrew":
        return Terminal;
      case "cargo":
      case "rust_target":
        return FileCode;
      case "npm":
      case "pnpm":
      case "yarn":
      case "node_modules":
        return Package;
      default:
        return Code;
    }
  };

  const dockerStatus = dockerResult?.status;
  const isDockerConnected = dockerStatus?.cli_available && dockerStatus?.daemon_running;

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      {/* Top Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold text-white tracking-tight">
              Developer Optimization Studio
            </h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              macOS Dev Studio
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Conservative cleanup of Xcode DerivedData, package manager caches, Rust targets, node_modules, and Docker resources.
          </p>
        </div>

        {/* Global Action Refresh */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              scanDeveloperSpaces();
              inspectDocker();
            }}
            disabled={isDeveloperScanning || isDockerInspecting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.06] transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
          >
            <ArrowClockwise
              size={14}
              className={isDeveloperScanning || isDockerInspecting ? "animate-spin" : ""}
            />
            <span>Refresh All</span>
          </button>
        </div>
      </div>

      {/* Futuristic Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setDeveloperActiveTab("tool_caches")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 cursor-pointer ${
              developerActiveTab === "tool_caches"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10"
                : "text-slate-400 hover:text-white hover:bg-white/[0.03]"
            }`}
          >
            <Package size={15} weight={developerActiveTab === "tool_caches" ? "fill" : "regular"} />
            <span>Tool & Build Caches</span>
            {toolCacheItems.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                {toolCacheItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setDeveloperActiveTab("workspaces")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 cursor-pointer ${
              developerActiveTab === "workspaces"
                ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-500/10"
                : "text-slate-400 hover:text-white hover:bg-white/[0.03]"
            }`}
          >
            <FolderOpen size={15} weight={developerActiveTab === "workspaces" ? "fill" : "regular"} />
            <span>Project Workspaces</span>
            {developerWorkspaces.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                {developerWorkspaces.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setDeveloperActiveTab("docker")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 cursor-pointer ${
              developerActiveTab === "docker"
                ? "bg-violet-500/15 text-violet-300 border border-violet-500/30 shadow-sm shadow-violet-500/10"
                : "text-slate-400 hover:text-white hover:bg-white/[0.03]"
            }`}
          >
            <HardDrives size={15} weight={developerActiveTab === "docker" ? "fill" : "regular"} />
            <span>Docker Studio</span>
            <div
              className={`w-2 h-2 rounded-full ${
                isDockerConnected ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-amber-400"
              }`}
            />
          </button>
        </div>

        {/* Selected Space Summary Pill */}
        {developerActiveTab !== "docker" && selectedBytes > 0 && (
          <div className="flex items-center space-x-3">
            <span className="text-xs text-slate-400">
              Selected: <strong className="font-mono text-cyan-400">{formatBytes(selectedBytes)}</strong>
            </span>
            <button
              onClick={openDeveloperCleanModal}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash size={13} weight="fill" />
              <span>Purge Selected</span>
            </button>
          </div>
        )}

        {developerActiveTab === "docker" && selectedDockerBytes > 0 && isDockerConnected && (
          <div className="flex items-center space-x-3">
            <span className="text-xs text-slate-400">
              Selected: <strong className="font-mono text-violet-400">{formatBytes(selectedDockerBytes)}</strong>
            </span>
            <button
              onClick={openDockerCleanModal}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash size={13} weight="fill" />
              <span>Prune Docker</span>
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: TOOL & BUILD CACHES */}
      {developerActiveTab === "tool_caches" && (
        <div className="space-y-5">
          {/* Top Presets Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            {/* Xcode DerivedData Card */}
            <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Cpu size={18} />
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium">
                  Safe
                </span>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-white">Xcode DerivedData</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  Compiler indexes & module cache
                </p>
              </div>
            </div>

            {/* Homebrew Card */}
            <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                  <Terminal size={18} />
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium">
                  Safe
                </span>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-white">Homebrew Bottles</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  Cached tarballs & downloads
                </p>
              </div>
            </div>

            {/* Cargo Registry Card */}
            <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <FileCode size={18} />
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium">
                  Safe
                </span>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-white">Cargo Registry</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  .crate archives & git clones
                </p>
              </div>
            </div>

            {/* npm/pnpm/Yarn Card */}
            <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
                  <Package size={18} />
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium">
                  Safe
                </span>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-white">Node Package Caches</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  npm _cacache, pnpm & Yarn
                </p>
              </div>
            </div>
          </div>

          {/* Search & Selection Filter Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <MagnifyingGlass
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search developer caches by tool or path..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/40"
              />
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <button
                onClick={() => selectAllDeveloperPaths(true)}
                className="px-2.5 py-1 rounded bg-white/[0.03] text-slate-300 hover:text-white border border-white/[0.06] transition-colors"
              >
                Select All
              </button>
              <button
                onClick={() => selectAllDeveloperPaths(false)}
                className="px-2.5 py-1 rounded bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-white/[0.06] transition-colors"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Table of Discovered Developer Caches */}
          <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
                Discovered Tool Artifacts ({toolCacheItems.length})
              </h2>
              <span className="text-[11px] text-slate-400">
                Total Cache Footprint:{" "}
                <strong className="font-mono text-cyan-400">
                  {formatBytes(developerResult?.total_bytes ?? 0)}
                </strong>
              </span>
            </div>

            {toolCacheItems.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Code size={32} className="text-slate-400 mx-auto" />
                <p className="text-xs text-slate-400">
                  {isDeveloperScanning
                    ? "Scanning developer directories and tool caches..."
                    : "No active developer caches detected on your system."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {toolCacheItems.map((item) => {
                  const Icon = getProviderIcon(item.category);
                  const isChecked = developerSelectedPaths.has(item.path);

                  return (
                    <div
                      key={item.id}
                      className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors group"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0 pr-4">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleDeveloperPathSelection(item.path)}
                          className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />

                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                          <Icon size={16} />
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-white truncate">
                              {item.display_name}
                            </span>
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              {item.category}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                                item.risk.level === "Safe"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }`}
                            >
                              {item.risk.title}
                            </span>
                          </div>

                          <button
                            onClick={() => openInFinder(item.path)}
                            className="text-[10px] font-mono text-slate-400 hover:text-cyan-400 text-left truncate block max-w-xl transition-colors cursor-pointer"
                            title="Click to reveal in Finder"
                          >
                            {truncatePath(item.path, 60)}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-white block">
                            {formatBytes(item.size_bytes)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {item.item_count} files
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            selectAllDeveloperPaths(false);
                            toggleDeveloperPathSelection(item.path);
                            openDeveloperCleanModal();
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="Purge this item immediately"
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PROJECT WORKSPACES */}
      {developerActiveTab === "workspaces" && (
        <div className="space-y-5">
          {/* Add Project Workspace Card */}
          <div className="p-5 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <FolderOpen size={22} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Add Local Project Workspace
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enter an absolute path to a project directory. myclean verifies manifest files (<code>Cargo.toml</code> or <code>package.json</code>) before identifying <code>target/</code> or <code>node_modules/</code>.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={workspaceInput}
                onChange={(e) => setWorkspaceInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddWorkspace()}
                placeholder="/Users/user/Projects/my-app"
                className="flex-1 px-3.5 py-2 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-white placeholder-slate-400 font-mono focus:outline-none focus:border-indigo-500/50"
              />
              <button
                onClick={handleAddWorkspace}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Plus size={14} weight="bold" />
                <span>Add Workspace</span>
              </button>
            </div>
          </div>

          {/* Workspace Folders List */}
          <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
                Configured Workspaces ({developerWorkspaces.length})
              </h2>
              <span className="text-[11px] text-slate-400">
                Manifest Validation Guardrail Active
              </span>
            </div>

            {developerWorkspaces.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <FolderOpen size={32} className="text-slate-400 mx-auto" />
                <p className="text-xs text-slate-400">
                  No project workspaces added yet. Add your project folders above to inspect and safely purge build artifacts.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {developerWorkspaces.map((wsPath) => {
                  const wsArtifacts = workspaceItems.filter((i) =>
                    i.path.startsWith(wsPath)
                  );
                  const totalWsBytes = wsArtifacts.reduce(
                    (acc, i) => acc + i.size_bytes,
                    0
                  );

                  return (
                    <div key={wsPath} className="p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-white font-mono">
                              {truncatePath(wsPath, 50)}
                            </span>
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded flex items-center space-x-1">
                              <CheckCircle size={10} weight="fill" />
                              <span>Manifest Verified</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Reclaimable Artifacts:{" "}
                            <strong className="text-indigo-400 font-mono">
                              {formatBytes(totalWsBytes)}
                            </strong>
                          </p>
                        </div>

                        <button
                          onClick={() => removeDeveloperWorkspace(wsPath)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove workspace"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      {/* Discovered Sub-Artifacts */}
                      <div className="space-y-1.5 pl-3 border-l-2 border-indigo-500/20">
                        {wsArtifacts.length === 0 ? (
                          <div className="text-xs text-slate-400 py-1">
                            No active <code>target/</code> or <code>node_modules/</code> found. Project is clean.
                          </div>
                        ) : (
                          wsArtifacts.map((art) => {
                            const isChecked = developerSelectedPaths.has(art.path);
                            return (
                              <div
                                key={art.id}
                                className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center space-x-3">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleDeveloperPathSelection(art.path)}
                                    className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 cursor-pointer"
                                  />
                                  <div>
                                    <span className="font-semibold text-white block">
                                      {art.display_name}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {truncatePath(art.path, 55)}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="font-mono font-bold text-white block">
                                    {formatBytes(art.size_bytes)}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {art.item_count} files
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DOCKER STUDIO */}
      {developerActiveTab === "docker" && (
        <div className="space-y-5">
          {/* Docker Health & Daemon Status Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              isDockerConnected
                ? "bg-emerald-950/20 border-emerald-500/20"
                : "bg-amber-950/20 border-amber-500/20"
            }`}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isDockerConnected
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {isDockerConnected ? <PlugsConnected size={22} /> : <Plugs size={22} />}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    {isDockerConnected ? "Docker Daemon Connected" : "Docker Daemon Offline"}
                  </h3>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                      isDockerConnected
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {isDockerConnected ? `v${dockerStatus?.daemon_version ?? ""}` : "Socket Missing"}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {isDockerConnected
                    ? "Docker CLI communicating with native socket. Volumes are locked & protected by default."
                    : dockerStatus?.daemon_error ?? "Docker Desktop is stopped or daemon is not responding."}
                </p>
              </div>
            </div>

            <button
              onClick={() => inspectDocker()}
              disabled={isDockerInspecting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.06] transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <ArrowClockwise size={13} className={isDockerInspecting ? "animate-spin" : ""} />
              <span>Inspect Daemon</span>
            </button>
          </div>

          {/* Docker Storage Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            {/* Images */}
            <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-2">
              <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold block">
                Docker Images
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold font-mono text-white">
                  {formatBytes(dockerResult?.summary.images_size_bytes ?? 0)}
                </span>
                <span className="text-xs font-mono text-cyan-400">
                  {dockerResult?.summary.images_count ?? 0} images
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Reclaimable: {formatBytes(dockerResult?.summary.images_reclaimable_bytes ?? 0)}
              </span>
            </div>

            {/* Stopped Containers */}
            <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-2">
              <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold block">
                Containers
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold font-mono text-white">
                  {formatBytes(dockerResult?.summary.containers_size_bytes ?? 0)}
                </span>
                <span className="text-xs font-mono text-cyan-400">
                  {dockerResult?.summary.containers_count ?? 0} total
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Reclaimable: {formatBytes(dockerResult?.summary.containers_reclaimable_bytes ?? 0)}
              </span>
            </div>

            {/* Build Cache */}
            <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-2">
              <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold block">
                BuildKit Cache
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold font-mono text-white">
                  {formatBytes(dockerResult?.summary.build_cache_size_bytes ?? 0)}
                </span>
                <span className="text-xs font-mono text-cyan-400">
                  {dockerResult?.summary.build_cache_count ?? 0} layers
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Reclaimable: {formatBytes(dockerResult?.summary.build_cache_reclaimable_bytes ?? 0)}
              </span>
            </div>

            {/* Volumes (Protected) */}
            <div className="p-4 rounded-xl bg-[#0D101C] border border-white/[0.06] space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold block">
                  Docker Volumes
                </span>
                <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded flex items-center space-x-1">
                  <Lock size={10} weight="fill" />
                  <span>Protected</span>
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold font-mono text-white">
                  {formatBytes(dockerResult?.summary.volumes_size_bytes ?? 0)}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {dockerResult?.summary.volumes_count ?? 0} volumes
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Preserved by default
              </span>
            </div>
          </div>

          {/* Docker Filter & Bulk Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              {[
                { id: "all", label: "All Resources" },
                { id: "containers", label: "Stopped Containers" },
                { id: "images", label: "Dangling/Unused Images" },
                { id: "cache", label: "Build Cache" },
                { id: "volumes", label: "Volumes (Protected)" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setDockerFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    dockerFilter === f.id
                      ? "bg-white/[0.1] text-white"
                      : "text-slate-400 hover:text-white hover:bg-white/[0.03]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <button
                onClick={() => selectAllDockerResources(true)}
                disabled={!isDockerConnected}
                className="px-2.5 py-1 rounded bg-white/[0.03] text-slate-300 hover:text-white border border-white/[0.06] transition-colors disabled:opacity-40"
              >
                Select Reclaimable
              </button>
              <button
                onClick={() => selectAllDockerResources(false)}
                disabled={!isDockerConnected}
                className="px-2.5 py-1 rounded bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-white/[0.06] transition-colors disabled:opacity-40"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Docker Resources Table */}
          <div className="rounded-xl bg-[#0D101C] border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
                Docker Resources ({filteredDockerResources.length})
              </h2>
              <span className="text-[11px] text-slate-400">
                Host APFS reclamation depends on dynamic VM compaction
              </span>
            </div>

            {filteredDockerResources.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <HardDrives size={32} className="text-slate-400 mx-auto" />
                <p className="text-xs text-slate-400">
                  {isDockerConnected
                    ? "No Docker resources found in this category."
                    : "Docker daemon is offline. Start Docker Desktop and click 'Inspect Daemon'."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {filteredDockerResources.map((res) => {
                  const isChecked = dockerSelectedIds.has(res.id);

                  return (
                    <div
                      key={res.id}
                      className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0 pr-4">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={res.is_protected || !res.reclaimable || !isDockerConnected}
                          onChange={() => toggleDockerResourceSelection(res.id)}
                          className="rounded border-slate-700 bg-slate-900 text-violet-500 focus:ring-0 cursor-pointer disabled:opacity-30"
                        />

                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-white truncate font-mono">
                              {res.name}
                            </span>
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                              {res.resource_type.replace('_', ' ')}
                            </span>
                            {res.is_protected && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center space-x-1">
                                <Lock size={10} weight="fill" />
                                <span>Protected</span>
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-1">
                            {res.explanation}
                          </p>
                          {res.dependencies.length > 0 && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              {res.dependencies.join(" • ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-bold text-white block">
                          {formatBytes(res.size_bytes)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {res.id.slice(0, 12)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
