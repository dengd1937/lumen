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
