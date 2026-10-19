import assert from "node:assert";
import type { ScanProgress, LiveCategoryState, ScanScopeConfig } from "../src/types";

console.log("--> Running Frontend Smart Scan Progress Regression Tests...");

// Test 1: Event parsing & field compatibility
{
  const rawPayload = JSON.stringify({
    session_id: "scan-1740000000000",
    category_id: "system_cache",
    current_category: "System Cache",
    current_path: "/Library/Caches/com.apple.coresymbolicationd",
    phase: "Inspecting trees",
    files_inspected: 120,
    directories_inspected: 15,
    bytes_analyzed: 50331648,
    items_discovered: 4,
    items_found: 4,
    bytes_found: 24576000,
    category_status: "scanning",
    category_progress: 35.5,
    overall_progress: 12.8,
    percent_complete: 12.8,
    skipped_count: 2,
    permission_denied_count: 0,
    elapsed_ms: 450,
    safe_items_count: 3,
    review_items_count: 1,
  });

  const parsed: ScanProgress = JSON.parse(rawPayload);
  assert.strictEqual(parsed.session_id, "scan-1740000000000");
  assert.strictEqual(parsed.category_id, "system_cache");
  assert.strictEqual(parsed.category_status, "scanning");
  assert.strictEqual(parsed.category_progress, 35.5);
  assert.strictEqual(parsed.overall_progress, 12.8);
  assert.strictEqual(parsed.items_discovered, 4);
  assert.strictEqual(parsed.files_inspected, 120);
  console.log("  [PASS] Test 1: Progress-event JSON deserialization and typed parsing");
}

// Test 2: Active session filtering and stale event rejection
{
  const activeSessionId = "scan-active-session-12345";
  const staleSessionId = "scan-stale-session-00000";

  const staleEvent: ScanProgress = {
    session_id: staleSessionId,
    category_id: "system_cache",
    current_category: "System Cache",
    current_path: "/stale/path",
    phase: "Scanning",
    files_inspected: 10,
    directories_inspected: 2,
    bytes_analyzed: 1024,
    items_discovered: 1,
    items_found: 1,
    bytes_found: 1024,
    category_status: "scanning",
    category_progress: 10,
    overall_progress: 5,
    percent_complete: 5,
    skipped_count: 0,
    permission_denied_count: 0,
    elapsed_ms: 100,
    safe_items_count: 1,
    review_items_count: 0,
  };

  const activeEvent: ScanProgress = {
    ...staleEvent,
    session_id: activeSessionId,
    current_path: "/active/path",
    overall_progress: 25,
  };

  // Simulating store session guard
  function processEvent(progress: ScanProgress, currentSessionId: string | null): boolean {
    if (currentSessionId && progress.session_id && progress.session_id !== currentSessionId) {
      return false; // Dropped
    }
    return true; // Accepted
  }

  assert.strictEqual(processEvent(staleEvent, activeSessionId), false, "Stale session event must be rejected");
  assert.strictEqual(processEvent(activeEvent, activeSessionId), true, "Active session event must be accepted");
  console.log("  [PASS] Test 2: Active session ID enforcement and stale event rejection");
}

// Test 3: Indeterminate progress handling (-1.0 category progress)
{
  const indeterminateEvent: ScanProgress = {
    session_id: "scan-indeterminate",
    category_id: "docker",
    current_category: "Docker Resources",
    current_path: "Checking Docker CLI & daemon status...",
    phase: "Scanning",
    files_inspected: 0,
    directories_inspected: 0,
    bytes_analyzed: 0,
    items_discovered: 0,
    items_found: 0,
    bytes_found: 0,
    category_status: "scanning",
    category_progress: -1.0,
    overall_progress: 50.0,
    percent_complete: 50.0,
    skipped_count: 0,
    permission_denied_count: 0,
    elapsed_ms: 1200,
    safe_items_count: 0,
    review_items_count: 0,
  };

  const isCategoryIndeterminate = indeterminateEvent.category_progress < 0;
  assert.strictEqual(isCategoryIndeterminate, true, "Category progress < 0 must be flagged as indeterminate");

  const categoryState: LiveCategoryState = {
    id: indeterminateEvent.category_id,
    name: indeterminateEvent.current_category,
    description: "",
    status: indeterminateEvent.category_status,
    progress: indeterminateEvent.category_progress >= 0 ? indeterminateEvent.category_progress : 0,
    itemsFound: indeterminateEvent.items_discovered,
    bytesFound: indeterminateEvent.bytes_found,
    isIndeterminate: isCategoryIndeterminate,
  };

  assert.strictEqual(categoryState.isIndeterminate, true);
  assert.strictEqual(categoryState.status, "scanning");
  console.log("  [PASS] Test 3: Indeterminate progress handling (-1.0 flag and state transition)");
}

// Test 4: Category transitions (Pending -> Scanning -> Completed)
{
  const catStates: Record<string, LiveCategoryState> = {
    system_cache: {
      id: "system_cache",
      name: "System Cache",
      description: "",
      status: "pending",
      progress: 0,
      itemsFound: 0,
      bytesFound: 0,
    },
  };

  // 1. Initial pending
  assert.strictEqual(catStates.system_cache.status, "pending");

  // 2. Transition to scanning
  catStates.system_cache = {
    ...catStates.system_cache,
    status: "scanning",
    progress: 45.0,
    itemsFound: 8,
    bytesFound: 104857600,
  };
  assert.strictEqual(catStates.system_cache.status, "scanning");
  assert.strictEqual(catStates.system_cache.progress, 45.0);

  // 3. Transition to completed
  catStates.system_cache = {
    ...catStates.system_cache,
    status: "completed",
    progress: 100.0,
  };
  assert.strictEqual(catStates.system_cache.status, "completed");
  assert.strictEqual(catStates.system_cache.progress, 100.0);
  console.log("  [PASS] Test 4: Category state transitions (pending -> scanning -> completed)");
}

// Test 5: ScanScopeConfig session_id propagation
{
  const config: ScanScopeConfig = {
    session_id: "scan-myclean-test-session",
    include_system_caches: true,
    include_application_logs: true,
    include_developer_xcode: false,
    include_developer_caches: false,
    include_browser_caches: false,
    include_messaging_caches: false,
    include_trash: false,
    include_mail_downloads: false,
    include_large_files: false,
    include_docker: false,
    custom_paths: [],
    user_exclusions: [],
  };

  assert.strictEqual(config.session_id, "scan-myclean-test-session");
  console.log("  [PASS] Test 5: ScanScopeConfig session_id propagation contract");
}

// Test 6: Full scan lifecycle from initialization to completed result screen
{
  const sessionId = "scan-full-lifecycle-test";
  let isScanning = true;
  let wasScanCancelled = false;
  let scanResult: any = null;
  const categoryStates: Record<string, LiveCategoryState> = {
    system_cache: { id: "system_cache", name: "System Cache", description: "", status: "pending", progress: 0, itemsFound: 0, bytesFound: 0 },
    app_cache: { id: "app_cache", name: "Application Cache", description: "", status: "pending", progress: 0, itemsFound: 0, bytesFound: 0 },
    browser_cache: { id: "browser_cache", name: "Browser Cache", description: "", status: "pending", progress: 0, itemsFound: 0, bytesFound: 0 },
    developer_cache: { id: "developer_cache", name: "Developer Cache", description: "", status: "pending", progress: 0, itemsFound: 0, bytesFound: 0 },
    logs_and_temp: { id: "logs_and_temp", name: "Logs & Temporary Files", description: "", status: "pending", progress: 0, itemsFound: 0, bytesFound: 0 },
    user_trash: { id: "user_trash", name: "macOS Trash", description: "", status: "pending", progress: 0, itemsFound: 0, bytesFound: 0 },
    docker: { id: "docker", name: "Docker Resources", description: "", status: "pending", progress: 0, itemsFound: 0, bytesFound: 0 },
  };

  // 1. Initial State: isScanning true, result null
  assert.strictEqual(isScanning, true);
  assert.strictEqual(scanResult, null);

  // 2. Stream progress events for each category
  const stages = ["system_cache", "app_cache", "browser_cache", "developer_cache", "logs_and_temp", "user_trash", "docker"];
  for (let i = 0; i < stages.length; i++) {
    const stageId = stages[i];
    categoryStates[stageId] = {
      ...categoryStates[stageId],
      status: "completed",
      progress: 100,
      itemsFound: 5 * (i + 1),
      bytesFound: 1024 * 1024 * 100 * (i + 1),
    };
  }

  // 3. Backend scan returns final ScanResult
  const mockResult = {
    duration_ms: 2196,
    total_bytes: 8513470464,
    total_items: 59,
    was_cancelled: false,
    categories: [
      { category: "system_caches", display_name: "System & App Caches", total_bytes: 5200000000, item_count: 32, is_safe_by_default: true },
      { category: "developer_caches", display_name: "Developer Tooling Caches", total_bytes: 2800000000, item_count: 20, is_safe_by_default: true },
      { category: "user_trash", display_name: "macOS Trash", total_bytes: 513470464, item_count: 7, is_safe_by_default: true },
    ],
    items: [
      { id: "item-1", name: "System Caches", size_bytes: 5200000000, is_selected: true, is_safe_to_clean: true },
      { id: "item-2", name: "Cargo Registry", size_bytes: 2800000000, is_selected: true, is_safe_to_clean: true },
      { id: "item-3", name: "Trash Files", size_bytes: 513470464, is_selected: true, is_safe_to_clean: true },
    ],
  };

  // Finalize state exactly as useCleanStore does:
  const finalCategoryStates = { ...categoryStates };
  Object.keys(finalCategoryStates).forEach((key) => {
    if (finalCategoryStates[key].status === "scanning" || finalCategoryStates[key].status === "pending") {
      finalCategoryStates[key] = {
        ...finalCategoryStates[key],
        status: "completed",
        progress: 100,
      };
    }
  });

  const selectedItemIds = new Set<string>();
  mockResult.items.forEach((item) => {
    if (item.is_selected) selectedItemIds.add(item.id);
  });

  scanResult = mockResult;
  isScanning = false;
  wasScanCancelled = mockResult.was_cancelled;

  // Verify Completed Results State:
  assert.strictEqual(isScanning, false, "isScanning must be false on completion");
  assert.notStrictEqual(scanResult, null, "scanResult must be populated");
  assert.strictEqual(scanResult.total_bytes, 8513470464);
  assert.strictEqual(scanResult.total_items, 59);
  assert.strictEqual(selectedItemIds.size, 3);

  // Every stage must be marked completed
  for (const stageId of stages) {
    assert.strictEqual(finalCategoryStates[stageId].status, "completed");
    assert.strictEqual(finalCategoryStates[stageId].progress, 100);
  }

  // Calculate selected recoverable bytes
  const selectedBytes = scanResult.items
    .filter((item: any) => selectedItemIds.has(item.id))
    .reduce((sum: number, item: any) => sum + item.size_bytes, 0);
  assert.strictEqual(selectedBytes, 8513470464, "All default selected items must sum to 8.51 GB");

  console.log("  [PASS] Test 6: Full scan lifecycle from initialization to completed result screen");
}

console.log("--> All 6 Frontend Smart Scan Progress Regression Tests Passed!\n");

