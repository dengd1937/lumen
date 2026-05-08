/**
 * Data-source channel selector.
 *
 * Per ADR-0002 D7 + plan T11: hooks pick between mock and SSE channels
 * via this single module-level constant rather than three duplicated
 * ternaries. T13 will add the actual SSE consumer; T15 will run e2e
 * specs with `NEXT_PUBLIC_LUMEN_DATA_SOURCE=sse` set at build time.
 *
 * Validation policy (per project env-var rule in `.claude/rules/languages.md`):
 *
 *   - Unset / undefined → "mock" (documented default; no log noise)
 *   - "mock" / "sse"    → echoed
 *   - Any other value   → throw at module load (catches typos like
 *                         "stage" / "live" before they silently
 *                         degrade production to mock data)
 *
 * Throwing at module load means the bad value surfaces during
 * `next build` rather than at the first hook call inside a render.
 */

export type DataSource = "mock" | "sse";

const _raw = process.env.NEXT_PUBLIC_LUMEN_DATA_SOURCE;

if (_raw !== undefined && _raw !== "mock" && _raw !== "sse") {
  throw new Error(
    `Invalid NEXT_PUBLIC_LUMEN_DATA_SOURCE="${_raw}". ` +
      `Expected "mock" or "sse" (or unset for the mock default).`,
  );
}

export const DATA_SOURCE: DataSource = _raw === "sse" ? "sse" : "mock";

/**
 * SSE channel base URL.
 *
 * Defaults to "" (empty, so hook URLs stay relative and route through
 * the Next.js rewrite). Set NEXT_PUBLIC_LUMEN_API_BASE_URL to an
 * absolute URL (e.g. http://localhost:8000) when:
 *   - the rewrite path buffers streaming responses (some Next.js dev
 *     server configurations); or
 *   - the frontend is deployed with a different origin policy from
 *     the backend.
 *
 * EventSource enforces same-origin by default; cross-origin requires
 * the backend to set the appropriate CORS allow-origin (the M1.0
 * backend already does for localhost:3000).
 */
export const SSE_API_BASE_URL: string =
  process.env.NEXT_PUBLIC_LUMEN_API_BASE_URL ?? "";

// Dev-mode warning when SSE channel is on but no base URL is set —
// Next.js dev rewrites can buffer streaming responses, so EventSource
// will silently hang. Production deployments may legitimately want the
// rewrite path (same-origin), so this is a warning, not a throw.
if (
  DATA_SOURCE === "sse" &&
  SSE_API_BASE_URL === "" &&
  process.env.NODE_ENV !== "production" &&
  typeof console !== "undefined"
) {
  console.warn(
    "[lumen] DATA_SOURCE=sse but NEXT_PUBLIC_LUMEN_API_BASE_URL is " +
      "unset. Next.js dev rewrites may buffer SSE responses; if events " +
      "never reach the UI, set this var to the absolute backend URL " +
      "(e.g. http://localhost:8000).",
  );
}
