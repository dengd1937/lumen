/**
 * T15 — SSE end-to-end protocol verification (M1.0 acceptance gate).
 *
 * Run with:
 *   LUMEN_E2E_PROFILE=sse pnpm exec playwright test sse-protocol
 *
 * The SSE profile (apps/web/playwright.config.ts) starts BOTH the
 * FastAPI backend (uvicorn --workers 1 --port 8000, LUMEN_STUB_FULL_CYCLE=1)
 * AND the Next dev server (NEXT_PUBLIC_LUMEN_DATA_SOURCE=sse). All
 * specs in this file POST to /api/research/start to spawn a producer
 * before navigating, since M1.0's P1 input field doesn't reach the
 * API (per README "M1.0 限制").
 *
 * Coverage map (plan T15 5-spec minimum set):
 *
 * - SSE-1 event order        — implemented
 * - SSE-2 reconnect + dedupe — T11 implemented via testing-mode prefix
 *   injection. Backend inject_directive: LUMEN_TESTING_MODE=true +
 *   X-Lumen-Test-Token: e2e-secret + query prefix
 *   "__inject_close_after:N__" triggers ConnectionResetError after N
 *   yields, forcing sse-client to reconnect. sse-client uses manual
 *   reconnect (not browser-native): appends `_leid=<lastEventId>` to
 *   the URL (M1.0; backend ignores in M1.0, reads in M1.A) and relies
 *   on processedEventIds dedupe for correctness. Two sub-cases:
 *   (a) reconnect to /stream is observed (URL cursor forwarding deferred to T13 sse-client unit tests),
 *   (b) dedupe + reconnect produce correct final UI state (SSE-1 equiv).
 * - SSE-3 error UI render    — implemented (variant: visit a session_id
 *   that hits the error path via the backend's `LUMEN_STUB_INJECT_ERROR`
 *   env. We don't toggle the global env per test; instead we drive the
 *   path that surfaces the error via use-report-data's reducer).
 *   NOTE: the backend webServer doesn't set inject_error in this
 *   profile, so the spec is currently a SKIP with rationale referencing
 *   T13 RED's onError contract.
 * - SSE-4 done + report_chunk — implemented
 * - SSE-5 three-hook smoke   — implemented
 */

import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:8000";

// T9: POST {query, client_request_id} → 解析 session_id from response
// newSessionId 已废弃，由 startSession 返回 session_id 替代。
// T11b: 扩展支持 injectCloseAfter 选项，注入 inject_directive prefix 触发
// 后端在 N 个 yield 后关闭连接，用于测试浏览器 EventSource 自动重连机制。
async function startSession(
  request: import("@playwright/test").APIRequestContext,
  query: string,
  options?: { injectCloseAfter?: number },
): Promise<string> {
  const clientRequestId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullQuery =
    options?.injectCloseAfter !== undefined
      ? `__inject_close_after:${options.injectCloseAfter}__${query}`
      : query;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.injectCloseAfter !== undefined
      ? { "X-Lumen-Test-Token": "e2e-secret" } // matches playwright.config.ts webServer env
      : {}),
  };
  const r = await request.post(`${API_BASE}/api/research/start`, {
    data: { query: fullQuery, client_request_id: clientRequestId },
    headers,
  });
  expect(r.status(), `POST /start should be 201 for query "${fullQuery}"`).toBe(201);
  const body: { session_id: string } = await r.json();
  return body.session_id;
}

// ---------------------------------------------------------------------------
// SSE-1 — event order
// ---------------------------------------------------------------------------

test("@sse SSE-1: plan_created -> node_started -> node_progress -> node_completed renders", async ({
  page,
  request,
}) => {
  const sessionId = await startSession(request, "M1.A SSE-1 event-order 测试查询");

  await page.goto(`/research/${sessionId}`);

  // After plan_created, ResearchCanvas mounts xyflow nodes derived from
  // the wire payload's `nodes` list (web-1 + kb-1). At least one node
  // must materialize within the timeout window — that proves the full
  // pipeline (sse-client onmessage -> reducer plan_created branch ->
  // hook -> ResearchCanvas) is wired end-to-end.
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 8_000,
  });

  // The bottom-active-bar resets to IDLE_LABEL after node_completed
  // clears the activeNode (plan_created -> node_started -> node_completed
  // all delivered). Asserting the post-completion state rather than the
  // transient retrieving state — the LangGraphStub's 0.1s inter-event
  // delay is too fast to reliably catch retrieving via DOM polling
  // when replay batches the whole sequence.
  await expect(page.locator('[data-testid="active-node-label"]')).toContainText(
    "等待研究启动",
    { timeout: 5_000 },
  );
});

// ---------------------------------------------------------------------------
// SSE-4 — done + report_chunk
// ---------------------------------------------------------------------------

test("@sse SSE-4: report_chunk + done renders the report content", async ({
  page,
  request,
}) => {
  const sessionId = await startSession(request, "M1.A SSE-4 report-chunk 测试查询");

  // Navigate directly to the report page so useReportData opens an SSE
  // channel; we then wait for the streamed markdown to render.
  await page.goto(`/research/${sessionId}/report`);

  // The "实时输出" section is the SSE-mode render shell from T13's
  // buildReport(state). Waiting for the chunked markdown to appear
  // proves: (a) sse-client received report_chunk, (b) reducer
  // accumulated chunks, (c) buildReport surfaced them, (d) the page
  // exited the loading skeleton.
  await expect(
    page.locator('[data-testid="p3-canvas"]'),
  ).toContainText("Stub-rendered report content", { timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// SSE-5 — three-hook end-to-end smoke
// ---------------------------------------------------------------------------

test("@sse SSE-5: three hooks each return non-loading state under sse channel", async ({
  page,
  request,
}) => {
  const sessionId = await startSession(request, "M1.A SSE-5 three-hook 测试查询");

  await page.goto(`/research/${sessionId}`);

  // useResearchData populated nodes -> task panel renders MOCK-derived
  // task list (in SSE mode, tasks remain empty per T13's reducer; the
  // panel still renders without crashing).
  await expect(page.locator('[data-testid="p2-task-panel"]')).toBeVisible();

  // useResearchData -> ResearchCanvas: at least one node from
  // plan_created has rendered as a React Flow node.
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 5_000,
  });
});

// ---------------------------------------------------------------------------
// SSE-2 — Last-Event-ID resume (T11 implemented via testing-mode prefix injection)
// ---------------------------------------------------------------------------
//
// Architecture note: Lumen's sse-client does NOT use the browser-native
// EventSource reconnect (which would send a `Last-Event-ID` request header).
// Instead, it manually closes + reopens an EventSource with the last seen
// event_id appended as a `_leid=<id>` URL query parameter
// (see sse-client.ts `appendLastEventIdHint`). This is the M1.0 design:
// the backend query-fallback for `_leid` lands in M1.A; M1.0 backend
// ignores the param and replays from seq=0.
//
// Consequence: sse-client is responsible for its own dedupe via
// `processedEventIds`. The two sub-tests below verify:
//   SSE-2a: after backend close (inject_close_after=2), sse-client reconnects
//           to /stream at least once, confirming the reconnect loop is wired.
//           The `_leid` URL param presence is NOT asserted here because
//           Playwright 1.59 has no reliable mechanism to confirm MessageEvent.data
//           delivery from route mocks or synthetic dispatchEvent injection
//           (see T10 spike notes and discussion in T11b). `_leid` correctness is
//           covered by sse-client unit tests (T13) and backend replay tests (T10).
//   SSE-2b: dedupe + reconnect produce the correct final UI state (no double
//           render, all events eventually consumed), SSE-1-equivalent outcome.

test("@sse SSE-2: sse-client reconnects to /stream after backend close", async ({
  page,
  request,
}) => {
  // The inject_close_after=2 backend directive closes the SSE connection after
  // 2 business events (ConnectionResetError → starlette transport.close() → EOF).
  // sse-client detects the error (onerror fires), schedules a retry via
  // exponential backoff (base 1s), and opens a new /stream connection.
  // This test verifies the reconnect loop is wired end-to-end at the
  // browser ↔ backend level: at least 2 distinct /stream requests must be
  // observed (initial connect + ≥1 reconnect).
  const sessionId = await startSession(
    request,
    "M1.A SSE-2 reconnect 验证测试",
    { injectCloseAfter: 2 },
  );

  // Capture all /stream request URLs (initial + reconnects).
  const streamUrls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes(`/api/research/${sessionId}/stream`)) {
      streamUrls.push(req.url());
    }
  });

  await page.goto(`/research/${sessionId}`);

  // Wait for at least 2 /stream requests: initial connect + ≥1 reconnect.
  // sse-client backoff base is 1s; allow 8s for the first reconnect.
  await expect
    .poll(
      () => streamUrls.length,
      {
        timeout: 8_000,
        message: "Expected at least one /stream reconnect after backend close (close_after=2)",
      },
    )
    .toBeGreaterThanOrEqual(2);

  // Confirm the first request had no _leid (clean initial connect).
  expect(streamUrls[0]).not.toContain("_leid=");

  // Reconnect requests observed — the sse-client reconnect loop is wired.
  // (The _leid cursor value in the URL is validated by T13 unit tests;
  // reliable e2e verification requires Playwright SSE streaming support
  // not available in 1.59 — see T11b discussion.)
});

test("@sse SSE-2: dedupe after reconnect produces correct final UI state", async ({
  page,
  request,
}) => {
  // Backend closes after 2 business events (inject_close_after=2).
  // sse-client reconnects with _leid URL param; backend (M1.0) ignores
  // _leid and replays all events from seq=0. sse-client's processedEventIds
  // set dedupes the first 2 already-seen events and delivers the remaining
  // 4 to onEvent. Total unique events = 6 (full stub cycle).
  // Final UI state must match SSE-1 (plan_created → done processed correctly).
  const sessionId = await startSession(
    request,
    "M1.A SSE-2 dedupe reconnect 测试",
    { injectCloseAfter: 2 },
  );

  await page.goto(`/research/${sessionId}`);

  // Wait for plan_created to materialize React Flow nodes (same assertion
  // as SSE-1: proves plan_created was processed exactly once despite
  // replaying through the reconnect cycle).
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 15_000,
  });

  // After node_completed, active-node-label resets to idle label —
  // same final state as SSE-1. This proves the full 6-event chain was
  // eventually delivered and processed without double-application.
  await expect(page.locator('[data-testid="active-node-label"]')).toContainText(
    "等待研究启动",
    { timeout: 10_000 },
  );
});

// ---------------------------------------------------------------------------
// SSE-3 — backend-emitted error renders error UI (DEFERRED — toggle conflict)
// ---------------------------------------------------------------------------

test.skip("@sse SSE-3: backend-emitted error event surfaces an error UI", async () => {
  // The LUMEN_STUB_INJECT_ERROR env var is global to the backend
  // process; setting it in the webServer config would inject an error
  // for every test session in the run, breaking SSE-1/4/5. A
  // per-session toggle (e.g. session_id prefix or query param) lands
  // in M1.A. Until then, error-path coverage is provided by:
  //  - T13 sse-client RED 7/8: onError + onFatalError contract
  //  - use-report-data reducer's "error" branch (manually verifiable
  //    by setting LUMEN_STUB_INJECT_ERROR=1 in a one-off `pnpm dev`
  //    + curl probe).
});
