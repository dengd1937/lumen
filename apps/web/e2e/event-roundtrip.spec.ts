/**
 * Codex M6 — cross-language SSE event wire-format roundtrip.
 *
 * The backend writes `apps/api/tests/fixtures/event_samples.json`
 * (T4 produced; T8/T9 keep in sync). This spec loads that fixture from
 * the frontend and proves the JSON narrows cleanly to the
 * `AnyWireEvent` discriminated union — i.e. the snake_case wire shape
 * matches both sides 1:1.
 *
 * Why an e2e spec for a type-level concern: the fixture is the closest
 * thing to a contract artifact and lives in the API project. Any spec
 * that imports it forces tsc to materialize the discriminated union at
 * compile time AND verifies field presence at runtime. A standalone
 * vitest setup would be redundant given Playwright is already the
 * frontend test runner (project rule: TypeScript testing via Vitest +
 * Playwright; M1.0 frontend is Playwright-only — vitest may be added in
 * M1.A but isn't here yet).
 *
 * Plan T11 named the spec `src/types/__tests__/event-roundtrip.spec.ts`;
 * we route it through `e2e/` so playwright's testDir picks it up
 * without a config change. Deviation tracked in T11 commit message.
 */

import { test, expect } from "@playwright/test";

import samplesFixture from "../../api/tests/fixtures/event_samples.json";

import type { AnyWireEvent } from "../src/types/research-events";

const EXPECTED_TYPES = new Set<AnyWireEvent["type"]>([
  "plan_created",
  "node_started",
  "node_progress",
  "node_completed",
  "conflict_detected",
  "report_chunk",
  "done",
  "error",
  "heartbeat",
]);

test.describe("@codex-m6 SSE event wire-format roundtrip (T11)", () => {
  test("event_samples.json carries all 9 wire types and narrows cleanly", () => {
    // Cast via `unknown` because JSON imports widen string-literal fields
    // (e.g. `type: "plan_created"`) to plain `string`. We re-narrow at the
    // boundary; the runtime switch below proves the discriminant holds.
    const fixture = samplesFixture as unknown as {
      _schema_version: string;
    } & Record<string, AnyWireEvent>;
    const { _schema_version, ...wire } = fixture;

    expect(_schema_version).toBe("M1.0");

    const events = Object.values(wire);
    expect(events).toHaveLength(EXPECTED_TYPES.size);

    const observedTypes = new Set(events.map((e) => e.type));
    expect(observedTypes).toEqual(EXPECTED_TYPES);

    for (const ev of events) {
      // Discriminant narrowing — each branch references type-specific
      // fields. tsc verifies the narrow at compile time; the runtime
      // assertion checks the field landed on the wire.
      switch (ev.type) {
        case "plan_created":
          expect(Array.isArray(ev.nodes)).toBe(true);
          expect(ev.nodes.length).toBeGreaterThanOrEqual(1);
          break;
        case "node_started":
          expect(typeof ev.node_id).toBe("string");
          expect(["web", "kb"]).toContain(ev.track);
          break;
        case "node_progress":
          expect(typeof ev.node_id).toBe("string");
          expect(typeof ev.message).toBe("string");
          break;
        case "node_completed":
          expect(typeof ev.node_id).toBe("string");
          expect(Array.isArray(ev.sources)).toBe(true);
          break;
        case "conflict_detected":
          expect(typeof ev.conflict_id).toBe("string");
          expect(typeof ev.description).toBe("string");
          break;
        case "report_chunk":
          expect(typeof ev.content).toBe("string");
          break;
        case "done":
          expect(typeof ev.report_id).toBe("string");
          break;
        case "error":
          expect(typeof ev.message).toBe("string");
          break;
        case "heartbeat":
          expect(typeof ev.server_time).toBe("string");
          break;
      }
    }
  });
});
