export type NavigationTab =
  | "dashboard"
  | "deep-clean"
  | "developer"
  | "storage-analyzer"
  | "large-files"
  | "duplicates"
  | "apps"
  | "history"
  | "settings";

export type RiskClassification = "safe_to_clean" | "review_required" | "protected";

export interface ScanScopeConfig {
  include_system_caches: boolean;
  include_application_logs: boolean;
  include_developer_xcode: boolean;
  include_developer_caches: boolean;
  include_browser_caches: boolean;
  include_messaging_caches: boolean;
  include_trash: boolean;
  include_mail_downloads: boolean;
  include_large_files: boolean;
  large_files_min_mb?: number;
  custom_paths: string[];
  user_exclusions: string[];
}

export interface DiskMetric {
  name: String;
  mount_point: string;
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  usage_percentage: number;
  file_system: string;
  is_removable: boolean;
}

export interface MemoryMetric {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  usage_percentage: number;
  total_swap_bytes: number;
  used_swap_bytes: number;
}

export interface SystemSummary {
  host_name: string;
  os_name: string;
  os_version: string;
  kernel_version: string;
  cpu_brand: string;
  cpu_count: number;
  architecture: string;
  primary_disk: DiskMetric | null;
  all_disks: DiskMetric[];
  memory: MemoryMetric;
}

export type ScanCategoryType =
  | "system_caches"
  | "application_logs"
  | "developer_xcode"
  | "developer_caches"
  | "browser_caches"
  | "messaging_caches"
  | "user_trash"
  | "mail_downloads"
  | "large_files";

export interface ScanItem {
  id: string;
  path: string;
  name: string;
  category: ScanCategoryType;
  size_bytes: number;
  file_count: number;
  modified_at: string | null;
  description: string;
  is_safe_to_clean: boolean;
  is_selected: boolean;
  classification?: RiskClassification;
}

export interface CategorySummary {
  category: ScanCategoryType;
  display_name: string;
  description: string;
  total_bytes: number;
  item_count: number;
  is_safe_by_default: boolean;
}

export interface SkippedPath {
  path: string;
  reason: string;
}

export interface ScanProgress {
  phase: string;
  current_category: string;
  current_path: string;
  items_found: number;
  bytes_found: number;
  percent_complete: number;
}

export interface ScanResult {
  duration_ms: number;
  total_bytes: number;
  total_items: number;
  categories: CategorySummary[];
  items: ScanItem[];
  skipped_paths?: SkippedPath[];
  was_cancelled: boolean;
}

export type StorageNodeType = "directory" | "file" | "symlink";

export type FileTypeCategory =
  | "developer"
  | "media"
  | "archives"
  | "documents"
  | "system_caches"
  | "other";

export interface FileTypeBreakdown {
  category: FileTypeCategory;
  display_name: string;
  total_allocated_bytes: number;
  total_logical_bytes: number;
  file_count: number;
  percentage: number;
}

export interface StorageNode {
  id: string;
  name: string;
  path: string;
  node_type: StorageNodeType;
  allocated_bytes: number;
  logical_bytes: number;
  file_count: number;
  file_type: FileTypeCategory | null;
  children: StorageNode[];
  classification: RiskClassification;
}

export interface LargestItem {
  path: string;
  name: string;
  is_dir: boolean;
  allocated_bytes: number;
  logical_bytes: number;
  file_count: number;
  file_type: FileTypeCategory | null;
  classification: RiskClassification;
  modified_at: string | null;
}

export interface VolumeInfo {
  name: string;
  mount_point: string;
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  file_system: string;
  is_removable: boolean;
}

export interface StorageAnalysisCoverage {
  analyzed_allocated_bytes: number;
  analyzed_logical_bytes: number;
  total_files_analyzed: number;
  total_dirs_analyzed: number;
  inaccessible_paths_count: number;
  inaccessible_paths: SkippedPath[];
  volume_total_bytes: number;
  volume_available_bytes: number;
  coverage_percentage: number;
}

export interface StorageAnalysisResult {
  root_path: string;
  duration_ms: number;
  volume: VolumeInfo | null;
  root_node: StorageNode;
  largest_files: LargestItem[];
  largest_folders: LargestItem[];
  file_type_distribution: FileTypeBreakdown[];
  coverage: StorageAnalysisCoverage;
  was_cancelled: boolean;
}

export interface DuplicateFile {
  path: string;
  name: string;
  modified_at: string | null;
  is_selected_for_removal: boolean;
}

export interface DuplicateGroup {
  hash: string;
  file_size: number;
  wasted_bytes: number;
  files: DuplicateFile[];
}

export interface DuplicateScanResult {
  duration_ms: number;
  total_duplicate_groups: number;
  total_wasted_bytes: number;
  groups: DuplicateGroup[];
  was_cancelled: boolean;
}

export interface AppArtifact {
  path: string;
  kind: string;
  size_bytes: number;
}

export interface InstalledApp {
  name: string;
  bundle_id: string;
  version: string;
  app_path: string;
  total_size_bytes: number;
  binary_size_bytes: number;
  artifacts: AppArtifact[];
}

export interface ScanRecord {
  id?: number;
  timestamp: string;
  duration_ms: number;
  total_bytes_found: number;
  total_items_found: number;
  category_breakdown_json: string;
}

export interface CleanupRecord {
  id?: number;
  timestamp: string;
  bytes_freed: number;
  items_deleted: number;
  method: string;
  details_json: string;
}

export interface WhitelistEntry {
  id?: number;
  path: string;
  reason: string;
  added_at: string;
}

export interface CleanRequest {
  paths: string[];
  method: "trash" | "permanent";
  dry_run: boolean;
  confirmed: boolean;
}

export interface CleanErrorItem {
  path: string;
  error_message: string;
}

export interface CleanResult {
  success: boolean;
  dry_run: boolean;
  bytes_freed: number;
  items_deleted: number;
  errors: CleanErrorItem[];
  duration_ms: number;
}
