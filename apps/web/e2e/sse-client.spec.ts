/**
 * T13 sse-client unit specs.
 *
 * Per plan T13 RED 1-8: contract + reconnect + dedupe + backoff +
 * fatal-error coverage. We deliberately avoid Playwright's clock API
 * here — the client takes injectable `setTimeoutFn` / `nowFn` so we
 * can drive timers manually from a queue-based fake.
 *
 * This spec is a pure-JS unit test with no rendering or page boot,
 * but it lives under `e2e/` because Playwright is the project's only
 * test runner. M1.A may migrate to Vitest.
 */

import { expect, test } from "@playwright/test";

import {
  createSseClient,
  type EventSourceFactory,
} from "../src/lib/sse-client";
import type { AnyWireEvent } from "../src/types/research-events";

// ---------------------------------------------------------------------------
// Mock EventSource
// ---------------------------------------------------------------------------

class MockEventSource implements EventSource {
  // EventSource interface (only the subset we need is real; rest are stubs)
  readonly url: string;
  readonly readyState: number = 1;
  readonly withCredentials = false;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  onopen: ((ev: Event) => unknown) | null = null;
  onmessage: ((ev: MessageEvent<string>) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;

  closed = false;

  constructor(url: string) {
    this.url = url;
  }

  // Routing table for typed frames. Per W3C SSE spec, frames carrying
  // an `event:` line dispatch to listeners registered via
  // addEventListener(eventName, handler), NOT onmessage. We track them
  // so emitTyped can simulate the browser's actual dispatch path —
  // mirrors the production fix in sse-client.ts (T15 reviewer HIGH).
  private listeners = new Map<string, EventListener[]>();

  // Default `emit` keeps the legacy onmessage path so existing RED
  // specs (RED 1-8) stay focused on the dedupe/backoff/done logic
  // rather than the dispatch routing detail.
  emit(payload: object): void {
    const evt = { data: JSON.stringify(payload) } as MessageEvent<string>;
    this.onmessage?.(evt);
  }
  emitRaw(rawData: string): void {
    this.onmessage?.({ data: rawData } as MessageEvent<string>);
  }
  // Routes through addEventListener like a real browser would for
  // frames carrying `event:` lines (every Lumen wire frame does — see
  // app/core/sse.py format_sse). Used by the regression spec below to
  // catch a future revert to onmessage-only.
  emitTyped(eventName: string, payload: object): void {
    const evt = {
      data: JSON.stringify(payload),
      type: eventName,
    } as MessageEvent<string>;
    const handlers = this.listeners.get(eventName) ?? [];
    for (const h of handlers) h(evt as unknown as Event);
  }
  triggerError(): void {
    this.onerror?.({} as Event);
  }
  close(): void {
    this.closed = true;
  }
  addEventListener(name: string, handler: EventListener): void {
    const list = this.listeners.get(name) ?? [];
    list.push(handler);
    this.listeners.set(name, list);
  }
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
}

interface FakeTimer {
  id: number;
  callback: () => void;
  delay: number;
  scheduledAt: number;
}

class FakeClock {
  private now = 0;
  private nextId = 1;
  private pending: FakeTimer[] = [];

  setTimeoutFn = (cb: () => void, delay: number): unknown => {
    const id = this.nextId++;
    this.pending.push({ id, callback: cb, delay, scheduledAt: this.now });
    return id;
  };

  clearTimeoutFn = (handle: unknown): void => {
    this.pending = this.pending.filter((t) => t.id !== handle);
  };

  nowFn = (): number => this.now;

  /** Advance time by `ms`, firing every timer whose deadline has passed. */
  advance(ms: number): void {
    const target = this.now + ms;
    while (this.pending.length > 0) {
      // Find the earliest-deadline timer that's due by `target`.
      this.pending.sort(
        (a, b) => a.scheduledAt + a.delay - (b.scheduledAt + b.delay),
      );
      const next = this.pending[0]!;
      const dueAt = next.scheduledAt + next.delay;
      if (dueAt > target) break;
      this.pending.shift();
      this.now = dueAt;
      next.callback();
    }
    this.now = target;
  }

  pendingCount(): number {
    return this.pending.length;
  }
}

// Helpers to build well-formed wire events for the mock to emit.
function planCreated(eventId: string): AnyWireEvent {
  return {
    event_id: eventId,
    session_id: "test",
    timestamp: "2026-05-08T00:00:00.000Z",
    type: "plan_created",
    nodes: [],
  };
}

function done(eventId: string): AnyWireEvent {
  return {
    event_id: eventId,
    session_id: "test",
    timestamp: "2026-05-08T00:00:01.000Z",
    type: "done",
    report_id: "rpt-1",
  };
}

function heartbeat(): AnyWireEvent {
  return { type: "heartbeat", server_time: "2026-05-08T00:00:00.000Z" };
}

interface Harness {
  emitOn(index: number, payload: object): void;
  triggerErrorOn(index: number): void;
  sources: MockEventSource[];
  events: AnyWireEvent[];
  errors: Error[];
  fatals: Error[];
  clock: FakeClock;
  factory: EventSourceFactory;
}

function makeHarness(): Harness {
  const sources: MockEventSource[] = [];
  const events: AnyWireEvent[] = [];
  const errors: Error[] = [];
  const fatals: Error[] = [];
  const clock = new FakeClock();
  const factory: EventSourceFactory = (url) => {
    const src = new MockEventSource(url);
    sources.push(src);
    return src as unknown as EventSource;
  };
  return {
    sources,
    events,
    errors,
    fatals,
    clock,
    factory,
    emitOn(index, payload) {
      sources[index]!.emit(payload);
    },
    triggerErrorOn(index) {
      sources[index]!.triggerError();
    },
  };
}

// ---------------------------------------------------------------------------
// RED 1 — createSseClient accepts the documented options shape
// ---------------------------------------------------------------------------

test.describe("@T13 sse-client", () => {
  test("RED 1: createSseClient returns { start, close } given full options", () => {
    const h = makeHarness();
    const client = createSseClient({
      url: "/api/research/s1/stream",
      onEvent: (ev) => h.events.push(ev),
      onError: (err) => h.errors.push(err),
      onFatalError: (err) => h.fatals.push(err),
      eventSourceFactory: h.factory,
      setTimeoutFn: h.clock.setTimeoutFn,
      clearTimeoutFn: h.clock.clearTimeoutFn,
      nowFn: h.clock.nowFn,
      lastEventId: "evt-cursor-7",
    });
    expect(typeof client.start).toBe("function");
    expect(typeof client.close).toBe("function");
  });

  // -------------------------------------------------------------------------
  // RED 2/3 — start() opens EventSource via factory; events forward to onEvent
  // -------------------------------------------------------------------------

  test("RED 2/3: start opens an EventSource via factory; messages forward to onEvent", () => {
    const h = makeHarness();
    const client = createSseClient({
      url: "/api/research/s1/stream",
      onEvent: (ev) => h.events.push(ev),
      onError: (err) => h.errors.push(err),
      eventSourceFactory: h.factory,
      setTimeoutFn: h.clock.setTimeoutFn,
      clearTimeoutFn: h.clock.clearTimeoutFn,
      nowFn: h.clock.nowFn,
    });
    client.start();
    expect(h.sources.length).toBe(1);
    h.emitOn(0, planCreated("e1"));
    expect(h.events).toHaveLength(1);
    expect(h.events[0]!.type).toBe("plan_created");
    client.close();
  });

  // -------------------------------------------------------------------------
  // RED 4 — done auto-closes the connection
  // -------------------------------------------------------------------------

  test("RED 4: done event auto-closes the connection", () => {
    const h = makeHarness();
    const client = createSseClient({
      url: "/api/research/s1/stream",
      onEvent: (ev) => h.events.push(ev),
      onError: () => undefined,
      eventSourceFactory: h.factory,
      setTimeoutFn: h.clock.setTimeoutFn,
      clearTimeoutFn: h.clock.clearTimeoutFn,
      nowFn: h.clock.nowFn,
    });
    client.start();
    h.emitOn(0, done("e-done"));
    expect(h.sources[0]!.closed).toBe(true);
    // Subsequent events on a closed source are no-ops (verifies idempotence).
    client.close();
  });

  // -------------------------------------------------------------------------
  // RED 5 — 60s idle reconnect via fake timers
  // -------------------------------------------------------------------------

  test("RED 5: 60s without messages triggers reconnect", () => {
    const h = makeHarness();
    const client = createSseClient({
      url: "/api/research/s1/stream",
      onEvent: (ev) => h.events.push(ev),
      onError: (err) => h.errors.push(err),
      eventSourceFactory: h.factory,
      setTimeoutFn: h.clock.setTimeoutFn,
      clearTimeoutFn: h.clock.clearTimeoutFn,
      nowFn: h.clock.nowFn,
      backoffBaseMs: 100, // shrink so the reconnect timer fires within window
    });
    client.start();
    expect(h.sources.length).toBe(1);
    // Idle timer fires at 60s → onError + scheduled reconnect
    h.clock.advance(60_000);
    expect(h.errors.length).toBeGreaterThanOrEqual(1);
    // Backoff: first retry after 100ms (1 * 100, 2^0)
    h.clock.advance(100);
    expect(h.sources.length).toBe(2);
    client.close();
  });

  // -------------------------------------------------------------------------
  // RED 6 — processedEventIds drops duplicate event_ids
  // -------------------------------------------------------------------------

  test("RED 6: duplicate event_id is dropped (replay idempotency)", () => {
    const h = makeHarness();
    const client = createSseClient({
      url: "/api/research/s1/stream",
      onEvent: (ev) => h.events.push(ev),
      onError: () => undefined,
      eventSourceFactory: h.factory,
      setTimeoutFn: h.clock.setTimeoutFn,
      clearTimeoutFn: h.clock.clearTimeoutFn,
      nowFn: h.clock.nowFn,
    });
    client.start();
    h.emitOn(0, planCreated("dup-1"));
    h.emitOn(0, planCreated("dup-1")); // same id
    h.emitOn(0, planCreated("dup-2"));
    expect(h.events.map((e) => e.type === "heartbeat" ? null : e.event_id))
      .toEqual(["dup-1", "dup-2"]);
    // Heartbeats bypass dedupe
    h.emitOn(0, heartbeat());
    h.emitOn(0, heartbeat());
    expect(h.events.filter((e) => e.type === "heartbeat")).toHaveLength(2);
    client.close();
  });

  // -------------------------------------------------------------------------
  // RED 7 — exponential backoff 1→2→4→8→16s on consecutive errors
  // -------------------------------------------------------------------------

  test("RED 7: exponential backoff 1,2,4,8,16 seconds on consecutive errors", () => {
    const h = makeHarness();
    const client = createSseClient({
      url: "/api/research/s1/stream",
      onEvent: () => undefined,
      onError: (err) => h.errors.push(err),
      onFatalError: (err) => h.fatals.push(err),
      eventSourceFactory: h.factory,
      setTimeoutFn: h.clock.setTimeoutFn,
      clearTimeoutFn: h.clock.clearTimeoutFn,
      nowFn: h.clock.nowFn,
      backoffBaseMs: 1_000,
      maxRetries: 5,
    });
    client.start();
    const expectedDelays = [1_000, 2_000, 4_000, 8_000, 16_000];

    for (let i = 0; i < expectedDelays.length; i++) {
      const errorBefore = h.errors.length;
      h.triggerErrorOn(i);
      // The error fires immediately; reconnect is scheduled at expectedDelays[i].
      // Advance by 1ms less than the delay → no new EventSource yet.
      h.clock.advance(expectedDelays[i]! - 1);
      expect(h.sources.length).toBe(i + 1);
      // Advance past the boundary.
      h.clock.advance(1);
      expect(h.sources.length).toBe(i + 2);
      expect(h.errors.length).toBe(errorBefore + 1);
    }
    client.close();
  });

  // -------------------------------------------------------------------------
  // RED 8 — onFatalError fires after 5 consecutive failures
  // -------------------------------------------------------------------------

  test("RED 8: onFatalError fires after maxRetries+1 consecutive errors", () => {
    const h = makeHarness();
    const client = createSseClient({
      url: "/api/research/s1/stream",
      onEvent: () => undefined,
      onError: (err) => h.errors.push(err),
      onFatalError: (err) => h.fatals.push(err),
      eventSourceFactory: h.factory,
      setTimeoutFn: h.clock.setTimeoutFn,
      clearTimeoutFn: h.clock.clearTimeoutFn,
      nowFn: h.clock.nowFn,
      backoffBaseMs: 100,
      maxRetries: 5,
    });
    client.start();
    // Trigger 6 consecutive errors (the 6th should exhaust retries).
    for (let i = 0; i < 6; i++) {
      h.triggerErrorOn(i);
      // Advance enough for the next retry to materialize (or to be the
      // last attempt).
      h.clock.advance(100 * 2 ** i + 10);
    }
    expect(h.fatals).toHaveLength(1);
    // After fatal, no further sources are created.
    const sourcesAfter = h.sources.length;
    h.clock.advance(60_000);
    expect(h.sources.length).toBe(sourcesAfter);
    client.close();
  });

  // -------------------------------------------------------------------------
  // Bonus — malformed payload surfaces via onError without crashing
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Regression — typed `event:` frames (W3C SSE) must reach onEvent
  // -------------------------------------------------------------------------

  test("typed frames (event: line) route through addEventListener, not onmessage", () => {
    // T15 reviewer HIGH: prior implementation only listened on
    // `onmessage`, missing every frame from the Lumen backend (which
    // always writes an `event:` line — see app/core/sse.py format_sse).
    // This spec uses emitTyped (addEventListener path) so the behavior
    // matches the real browser; a regression to onmessage-only would
    // result in zero events delivered to onEvent.
    const h = makeHarness();
    const client = createSseClient({
      url: "/api/research/s1/stream",
      onEvent: (ev) => h.events.push(ev),
      onError: (err) => h.errors.push(err),
      eventSourceFactory: h.factory,
      setTimeoutFn: h.clock.setTimeoutFn,
      clearTimeoutFn: h.clock.clearTimeoutFn,
      nowFn: h.clock.nowFn,
    });
    client.start();
    const src = h.sources[0]!;
    src.emitTyped("plan_created", planCreated("typed-1"));
    src.emitTyped("done", done("typed-2"));
    expect(h.events).toHaveLength(2);
    expect(h.events[0]!.type).toBe("plan_created");
    expect(h.events[1]!.type).toBe("done");
    client.close();
  });

  test("malformed JSON payload routes to onError, doesn't break the stream", () => {
    const h = makeHarness();
    const client = createSseClient({
      url: "/api/research/s1/stream",
      onEvent: (ev) => h.events.push(ev),
      onError: (err) => h.errors.push(err),
      eventSourceFactory: h.factory,
      setTimeoutFn: h.clock.setTimeoutFn,
      clearTimeoutFn: h.clock.clearTimeoutFn,
      nowFn: h.clock.nowFn,
    });
    client.start();
    h.sources[0]!.emitRaw("not-valid-json");
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]!.message).toContain("malformed JSON");
    // Stream still alive; valid event after malformed.
    h.emitOn(0, planCreated("after"));
    expect(h.events).toHaveLength(1);
    client.close();
  });
});
