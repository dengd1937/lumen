import { defineConfig, devices } from '@playwright/test';

// T15: dual-server e2e for SSE protocol verification.
// - The default `chromium` project tests the mock channel (existing
//   229 specs + roundtrip).
// - The `sse` project sets NEXT_PUBLIC_LUMEN_DATA_SOURCE=sse and runs
//   only e2e/sse-protocol.spec.ts; webServer launches the FastAPI
//   backend (with LUMEN_USE_STUB=1 so report_chunk + done
//   land) plus the Next dev server.
const isSseRun = process.env.LUMEN_E2E_PROFILE === 'sse';

const baseProject = {
  use: { ...devices['Desktop Chrome'] },
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: isSseRun
    ? [
        {
          name: 'sse',
          ...baseProject,
          testMatch: /sse-protocol\.spec\.ts/,
        },
      ]
    : [
        {
          name: 'chromium',
          ...baseProject,
          testIgnore: /sse-protocol\.spec\.ts/,
        },
      ],
  webServer: isSseRun
    ? [
        {
          // FastAPI backend with full-cycle stub (emits report_chunk +
          // done so SSE-4 sees a terminal close). LUMEN_USE_STUB=1
          // activates LangGraphStub — no real DashScope LLM call needed.
          // DASHSCOPE_API_KEY / DASHSCOPE_BASE_URL kept as placeholders:
          // Settings still validates them at construction (no default),
          // but stub path never consumes the values.
          // LUMEN_TESTING_MODE + LUMEN_TESTING_TOKEN injected for T11/T12
          // reuse (backend does not consume them in T7C phase).
          command:
            'cd ../api && LUMEN_USE_STUB=1 ' +
            'DASHSCOPE_API_KEY=stub-placeholder ' +
            'DASHSCOPE_BASE_URL=https://stub.invalid ' +
            'LUMEN_DB_PATH=./.lumen-e2e.db ' +
            'LUMEN_TESTING_MODE=true LUMEN_TESTING_TOKEN=e2e-secret ' +
            'uv run uvicorn main:app --workers 1 --port 8000',
          url: 'http://localhost:8000/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          // Next.js with the SSE channel forced on. We point hooks at
          // the absolute backend URL (NEXT_PUBLIC_LUMEN_API_BASE_URL)
          // rather than going through Next's rewrite, because dev-mode
          // rewrites can buffer SSE responses on Next.js 16 — events
          // never reach EventSource until the response closes. CORS
          // is configured backend-side for localhost:3000, so the
          // cross-origin call is permitted.
          command:
            'NEXT_PUBLIC_LUMEN_DATA_SOURCE=sse ' +
            'NEXT_PUBLIC_LUMEN_API_BASE_URL=http://localhost:8000 ' +
            'pnpm dev',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ]
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
