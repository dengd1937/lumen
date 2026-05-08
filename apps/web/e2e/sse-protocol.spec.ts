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
 * - SSE-2 Last-Event-ID resume — DEFERRED at e2e level. Already covered
 *   at unit level: T10 backend (test_sse_replay.py replay-by-event_id +
 *   invalid 400) + T13 sse-client (RED 5 idle reconnect with fake
 *   timers). e2e simulation requires Playwright route interception of
 *   text/event-stream which is non-trivial in 1.59.
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

// Each test gets a unique session_id so the producer-lock doesn't
// 409 across tests.
function newSessionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function startSession(
  request: import("@playwright/test").APIRequestContext,
  sessionId: string,
): Promise<void> {
  const r = await request.post(`${API_BASE}/api/research/start`, {
    data: { session_id: sessionId },
    headers: { "Content-Type": "application/json" },
  });
  expect(r.status(), `POST /start should be 201 for ${sessionId}`).toBe(201);
}

// ---------------------------------------------------------------------------
// SSE-1 — event order
// ---------------------------------------------------------------------------

test("@sse SSE-1: plan_created -> node_started -> node_progress -> node_completed renders", async ({
  page,
  request,
}) => {
  const sessionId = newSessionId("sse1");
  await startSession(request, sessionId);

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
  const sessionId = newSessionId("sse4");
  await startSession(request, sessionId);

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
  const sessionId = newSessionId("sse5");
  await startSession(request, sessionId);

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
// SSE-2 — Last-Event-ID resume (DEFERRED at e2e level)
// ---------------------------------------------------------------------------

test.skip("@sse SSE-2: Last-Event-ID resume after EventSource reconnect", async () => {
  // Coverage at unit + integration level:
  //  - apps/api/tests/test_sse_replay.py: replay-by-event_id + 400 on
  //    unknown Last-Event-ID
  //  - apps/web/e2e/sse-client.spec.ts RED 5/7: idle-reconnect timer +
  //    exponential backoff
  // Browser auto-attaches Last-Event-ID on reconnect; an e2e test
  // needs Playwright route-interception of text/event-stream which is
  // non-trivial in playwright 1.59. Defer to M1.A.
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
