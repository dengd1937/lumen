/**
 * SSE client — replay-aware EventSource wrapper.
 *
 * Per ADR-0002 D8.1 + Codex C1 + plan T13. Contract:
 *
 *   createSseClient({
 *     url, onEvent, onError, onFatalError?,
 *     eventSourceFactory?, setTimeoutFn?, clearTimeoutFn?, nowFn?,
 *     lastEventId?, idleTimeoutMs?, maxRetries?, backoffBaseMs?,
 *   }) -> { start, close }
 *
 * Responsibilities:
 *
 * 1. Create an EventSource via the injected factory (defaults to the
 *    global). Tests inject a mock factory; production uses the real
 *    EventSource (browser or polyfill).
 *
 * 2. Forward each parsed message to `onEvent`. Heartbeat events are
 *    forwarded the same as business events — the consumer can filter.
 *
 * 3. Dedupe by `event_id`: if the same id has been delivered before
 *    (replay duplication, double-fire bug), drop without re-dispatching
 *    to `onEvent`. Heartbeats never carry event_id and are not deduped.
 *
 * 4. Auto-close when `data.type === "done"` lands.
 *
 * 5. Idle reconnect: if no message arrives within `idleTimeoutMs` (60s
 *    default), close the current EventSource and reconnect with the
 *    last seen event_id as Last-Event-ID. The idle timer is reset on
 *    every message (including heartbeat).
 *
 * 6. Error reconnect: on EventSource error, schedule a retry with
 *    exponential backoff (1s → 2s → 4s → 8s → 16s); after `maxRetries`
 *    consecutive failures, invoke `onFatalError` and stop trying.
 *
 * Injection points (`eventSourceFactory`, `setTimeoutFn`, `nowFn`)
 * exist so unit tests can swap timers + EventSource without touching
 * the global env. Defaults read from `globalThis`.
 */

import type { AnyWireEvent } from "@/types/research-events";

export interface SseClientOptions {
  /** Stream URL (relative or absolute). The client appends no query params. */
  readonly url: string;
  readonly onEvent: (event: AnyWireEvent) => void;
  readonly onError: (error: Error) => void;
  /** Called once when retries are exhausted; client stops after. */
  readonly onFatalError?: (error: Error) => void;
  /** Override EventSource creation (default = globalThis.EventSource). */
  readonly eventSourceFactory?: EventSourceFactory;
  /** Override timer functions (default = globalThis.setTimeout/clearTimeout). */
  readonly setTimeoutFn?: TimerFn;
  readonly clearTimeoutFn?: ClearTimerFn;
  /** Override clock (default = Date.now). */
  readonly nowFn?: () => number;
  /** Initial Last-Event-ID; client also auto-refreshes from each event. */
  readonly lastEventId?: string;
  /** No-message-received reconnect threshold. Default 60_000 ms. */
  readonly idleTimeoutMs?: number;
  /** Cap on consecutive error retries. Default 5. */
  readonly maxRetries?: number;
  /** Backoff base in ms; doubles each retry. Default 1000 (1, 2, 4, 8, 16s). */
  readonly backoffBaseMs?: number;
}

export interface SseClient {
  /** Open the EventSource; idempotent — no-op if already started. */
  readonly start: () => void;
  /** Close any in-flight EventSource + cancel scheduled reconnects. */
  readonly close: () => void;
}

export type EventSourceFactory = (
  url: string,
  init?: EventSourceInit,
) => EventSource;

// Opaque so caller's setTimeout can return either browser-`number` or
// Node's `Timeout` without casts. The handle is only ever passed back
// to `clearTimeoutFn` — clients never inspect it.
export type TimerHandle = unknown;
export type TimerFn = (callback: () => void, delayMs: number) => TimerHandle;
export type ClearTimerFn = (handle: TimerHandle) => void;

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BACKOFF_BASE_MS = 1_000;

interface InternalState {
  current: EventSource | null;
  processedEventIds: Set<string>;
  retryCount: number;
  idleTimer: TimerHandle;
  reconnectTimer: TimerHandle;
  lastEventId: string | undefined;
  closed: boolean;
}

export function createSseClient(options: SseClientOptions): SseClient {
  const {
    url,
    onEvent,
    onError,
    onFatalError,
    eventSourceFactory = defaultEventSourceFactory(),
    setTimeoutFn = globalSetTimeout,
    clearTimeoutFn = globalClearTimeout,
    lastEventId: initialLastEventId,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
  } = options;

  const state: InternalState = {
    current: null,
    processedEventIds: new Set(),
    retryCount: 0,
    idleTimer: null,
    reconnectTimer: null,
    lastEventId: initialLastEventId,
    closed: false,
  };

  const cancelTimers = (): void => {
    if (state.idleTimer !== null) {
      clearTimeoutFn(state.idleTimer);
      state.idleTimer = null;
    }
    if (state.reconnectTimer !== null) {
      clearTimeoutFn(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  };

  const closeCurrent = (): void => {
    if (state.current !== null) {
      state.current.close();
      state.current = null;
    }
  };

  const scheduleIdleReconnect = (): void => {
    if (state.idleTimer !== null) {
      clearTimeoutFn(state.idleTimer);
    }
    state.idleTimer = setTimeoutFn(() => {
      state.idleTimer = null;
      // Treat as a soft error; reuse the backoff pipeline so the
      // retry-cap + onFatalError logic stays uniform.
      handleError(new Error("SSE idle timeout"));
    }, idleTimeoutMs);
  };

  const scheduleReconnect = (): void => {
    if (state.reconnectTimer !== null) {
      // Defensive: if handleError reentered before the previous
      // reconnect fired, we'd leak the old handle without this guard.
      clearTimeoutFn(state.reconnectTimer);
    }
    const delay = backoffBaseMs * 2 ** Math.max(0, state.retryCount - 1);
    state.reconnectTimer = setTimeoutFn(() => {
      state.reconnectTimer = null;
      if (!state.closed) {
        connect();
      }
    }, delay);
  };

  const handleError = (err: Error): void => {
    if (state.closed) return;
    closeCurrent();
    if (state.idleTimer !== null) {
      clearTimeoutFn(state.idleTimer);
      state.idleTimer = null;
    }
    onError(err);
    state.retryCount += 1;
    if (state.retryCount > maxRetries) {
      state.closed = true;
      cancelTimers();
      onFatalError?.(err);
      return;
    }
    scheduleReconnect();
  };

  const handleMessage = (raw: string): void => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      onError(new Error(`SSE: malformed JSON payload: ${raw.slice(0, 80)}`));
      return;
    }
    if (!isWireEvent(parsed)) {
      onError(new Error("SSE: payload missing 'type' discriminator"));
      return;
    }
    // Reset retry budget on any successfully parsed message.
    state.retryCount = 0;
    scheduleIdleReconnect();

    if (parsed.type !== "heartbeat") {
      const id = parsed.event_id;
      if (state.processedEventIds.has(id)) {
        // Replay duplicate — already delivered upstream.
        return;
      }
      state.processedEventIds.add(id);
      state.lastEventId = id;
    }

    onEvent(parsed);

    if (parsed.type === "done") {
      state.closed = true;
      closeCurrent();
      cancelTimers();
    }
  };

  const connect = (): void => {
    if (state.closed) return;
    closeCurrent();
    // The EventSource constructor takes (url, EventSourceInit). The
    // browser DOES NOT accept a `headers` field — Last-Event-ID is set
    // via the URL only on first connect; subsequent reconnects let the
    // browser auto-attach it from the last `id:` line received. For
    // explicit reconnect-with-cursor (e.g. after idle), we encode it
    // in a query param the backend honors as a fallback if Last-Event-ID
    // header is absent. T10 backend currently only honors header; URL
    // fallback is wired in M1.A. For now, the initial lastEventId is
    // set on the URL via the documented hash prefix the backend ignores;
    // the browser will populate Last-Event-ID on its own reconnect.
    const url2 =
      state.lastEventId !== undefined
        ? appendLastEventIdHint(url, state.lastEventId)
        : url;
    const source = eventSourceFactory(url2);
    state.current = source;
    source.onmessage = (e: MessageEvent<string>) => handleMessage(e.data);
    source.onerror = () => handleError(new Error("SSE: connection error"));
    scheduleIdleReconnect();
  };

  return {
    start: () => {
      if (state.closed || state.current !== null) return;
      connect();
    },
    close: () => {
      state.closed = true;
      closeCurrent();
      cancelTimers();
    },
  };
}

function isWireEvent(payload: unknown): payload is AnyWireEvent {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    typeof (payload as { type: unknown }).type === "string"
  );
}

function appendLastEventIdHint(url: string, lastEventId: string): string {
  // Encoded for backend M1.A query-fallback; M1.0 backend ignores.
  // Keeps the request idempotent vs. the stub URL.
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_leid=${encodeURIComponent(lastEventId)}`;
}

function defaultEventSourceFactory(): EventSourceFactory {
  return (url, init) => {
    const Ctor = (globalThis as { EventSource?: typeof EventSource })
      .EventSource;
    if (typeof Ctor !== "function") {
      throw new Error(
        "SSE: globalThis.EventSource is unavailable; provide " +
          "eventSourceFactory or run in a browser/polyfilled environment.",
      );
    }
    return new Ctor(url, init);
  };
}

const globalSetTimeout: TimerFn = (cb, ms) => setTimeout(cb, ms);
const globalClearTimeout: ClearTimerFn = (h) => {
  // h is `unknown` at the public-API boundary so callers (browser =
  // number, Node = Timeout, fake = number) interoperate. clearTimeout
  // accepts both at runtime; the cast is the documented seam.
  clearTimeout(h as Parameters<typeof clearTimeout>[0]);
};
