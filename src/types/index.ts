export type NavigationTab =
  | "dashboard"
  | "deep-clean"
  | "developer"
  | "large-files"
  | "duplicates"
  | "apps"
  | "history"
  | "settings";

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
}

export interface CategorySummary {
  category: ScanCategoryType;
  display_name: string;
  description: string;
  total_bytes: number;
  item_count: number;
  is_safe_by_default: boolean;
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
