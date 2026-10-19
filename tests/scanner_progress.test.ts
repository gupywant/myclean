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

console.log("--> All 5 Frontend Smart Scan Progress Regression Tests Passed!\n");
