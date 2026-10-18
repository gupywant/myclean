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
  allocated_bytes?: number;
  logical_bytes?: number;
  file_count: number;
  modified_at: string | null;
  description: string;
  is_safe_to_clean: boolean;
  is_selected: boolean;
  classification?: RiskClassification;
  detection_rule_id?: string;
  disposable_reason?: string;
  is_eligible_for_cleanup?: boolean;
  ineligibility_reason?: string | null;
  associated_app?: string | null;
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
  file_size: number;
  allocated_bytes: number;
  modified_at: string | null;
  is_selected_for_removal: boolean;
  inode: number;
  device: number;
  nlink: number;
  is_hardlink_copy: boolean;
  is_suggested_original: boolean;
}

export interface DuplicateGroup {
  hash: string;
  file_size: number;
  allocated_bytes: number;
  wasted_bytes: number;
  reclaimable_bytes: number;
  has_hardlinks: boolean;
  files: DuplicateFile[];
}

export interface DuplicateScanProgress {
  phase: string;
  files_scanned: number;
  candidate_files: number;
  candidate_groups: number;
  bytes_hashed: number;
  current_file: string;
  percent_complete: number;
}

export interface DuplicateScanResult {
  duration_ms: number;
  total_duplicate_groups: number;
  total_duplicate_files: number;
  total_wasted_bytes: number;
  total_reclaimable_bytes: number;
  groups: DuplicateGroup[];
  skipped_paths?: SkippedPath[];
  was_cancelled: boolean;
}

export interface DuplicateGroupCleanSelection {
  group_hash: string;
  original_path: string;
  paths_to_delete: string[];
}

export interface CleanDuplicatesRequest {
  groups: DuplicateGroupCleanSelection[];
  dry_run: boolean;
  confirmed: boolean;
}

export type ConfidenceLevel = "High" | "ReviewRequired" | "Protected";

export interface AppArtifact {
  path: string;
  kind: string;
  size_bytes: number;
  allocated_bytes: number;
  confidence: ConfidenceLevel;
  is_database_or_persistent: boolean;
  explanation: string;
  is_selected_by_default: boolean;
}

export interface InstalledApp {
  name: string;
  bundle_id: string;
  version: string;
  publisher: string | null;
  app_path: string;
  icon_data_url: string | null;
  installation_source: string;
  is_system_app: boolean;
  is_running: boolean;
  running_pids: number[];
  last_modified: string | null;
  total_size_bytes: number;
  allocated_size_bytes: number;
  binary_size_bytes: number;
  binary_allocated_bytes: number;
  artifacts: AppArtifact[];
}

export interface OrphanedAppArtifact {
  path: string;
  bundle_id: string;
  kind: string;
  size_bytes: number;
  allocated_bytes: number;
  confidence: ConfidenceLevel;
  explanation: string;
  last_modified: string | null;
  is_eligible_for_cleanup: boolean;
}

export interface OrphanedScanResult {
  total_items: number;
  total_bytes: number;
  total_allocated_bytes: number;
  items: OrphanedAppArtifact[];
}

export interface UninstallAppRequest {
  app_path: string;
  bundle_id: string;
  paths_to_delete: string[];
  dry_run: boolean;
  confirmed: boolean;
}

export interface CleanOrphanedRequest {
  paths: string[];
  dry_run: boolean;
  confirmed: boolean;
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

export interface CleanItemTarget {
  path: string;
  expected_modified_at?: string | null;
  expected_size_bytes?: number | null;
}

export interface ActiveAppWarning {
  app_name: string;
  affected_paths: string[];
}

export interface CleanRequest {
  paths: string[];
  targets?: CleanItemTarget[];
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
  bytes_moved_to_trash: number;
  items_deleted: number;
  items_skipped: number;
  items_failed: number;
  errors: CleanErrorItem[];
  duration_ms: number;
  was_cancelled: boolean;
}
