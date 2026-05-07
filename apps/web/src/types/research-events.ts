/**
 * Lumen SSE event contract — TypeScript wire types.
 *
 * Matches apps/api/app/models/events.py 1:1 (snake_case fields, no transform
 * at the protocol boundary). Defined per ADR-0001 D2 (8 business events) +
 * ADR-0002 D8.2 (BaseEvent + heartbeat as 9th).
 *
 * Naming convention: snake_case across both languages so JSON.parse() and
 * Pydantic model_validate() consume the same payload without aliasing.
 */

export type Track = "web" | "kb";

export interface BaseEvent {
  readonly event_id: string;
  readonly session_id: string;
  readonly timestamp: string;
}

export interface PlanNode {
  readonly id: string;
  readonly title: string;
  readonly track: Track;
}

export interface SourceRef {
  readonly id: string;
  readonly title: string;
  readonly url?: string;
  readonly snippet?: string;
  readonly similarity?: number;
}

export interface PlanCreatedEvent extends BaseEvent {
  readonly type: "plan_created";
  readonly nodes: ReadonlyArray<PlanNode>;
}

export interface NodeStartedEvent extends BaseEvent {
  readonly type: "node_started";
  readonly node_id: string;
  readonly track: Track;
}

export interface NodeProgressEvent extends BaseEvent {
  readonly type: "node_progress";
  readonly node_id: string;
  readonly message: string;
}

export interface NodeCompletedEvent extends BaseEvent {
  readonly type: "node_completed";
  readonly node_id: string;
  readonly sources: ReadonlyArray<SourceRef>;
}

export interface ConflictDetectedEvent extends BaseEvent {
  readonly type: "conflict_detected";
  readonly conflict_id: string;
  readonly description: string;
}

export interface ReportChunkEvent extends BaseEvent {
  readonly type: "report_chunk";
  readonly content: string;
}

export interface DoneEvent extends BaseEvent {
  readonly type: "done";
  readonly report_id: string;
}

export interface ErrorEvent extends BaseEvent {
  readonly type: "error";
  readonly message: string;
}

/**
 * Heartbeat is wire-only — does not extend BaseEvent because heartbeat events
 * are not persisted to audit_log and do not participate in replay or reducer
 * idempotency. The SSE frame still carries an `id:` field (server emits e.g.
 * `heartbeat-<server_time>`) so the browser does not reset its internal
 * lastEventId on heartbeat receipt.
 */
export interface HeartbeatEvent {
  readonly type: "heartbeat";
  readonly server_time: string;
}

/**
 * Discriminated union of the 8 business events. Reducers and audit_log
 * consumers operate on this type. Heartbeat is intentionally excluded.
 */
export type ResearchEvent =
  | PlanCreatedEvent
  | NodeStartedEvent
  | NodeProgressEvent
  | NodeCompletedEvent
  | ConflictDetectedEvent
  | ReportChunkEvent
  | DoneEvent
  | ErrorEvent;

/**
 * Wire-level union — what the SSE client receives before stripping heartbeat.
 * Use this only at the EventSource boundary; downstream code should narrow
 * to ResearchEvent before dispatching to reducers.
 */
export type AnyWireEvent = ResearchEvent | HeartbeatEvent;

// ---------------------------------------------------------------------------
// Compile-time type assertions (no runtime cost; verified by `tsc --noEmit`)
// ---------------------------------------------------------------------------

type _Expect<T extends true> = T;
type _Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

type _TestBaseEventFields = _Expect<
  _Equal<
    keyof BaseEvent,
    "event_id" | "session_id" | "timestamp"
  >
>;

type _TestPlanCreatedExtractsNodes = _Expect<
  _Equal<
    Extract<ResearchEvent, { type: "plan_created" }>["nodes"],
    ReadonlyArray<PlanNode>
  >
>;

type _TestNodeStartedHasTrack = _Expect<
  _Equal<
    Extract<ResearchEvent, { type: "node_started" }>["track"],
    Track
  >
>;

type _TestHeartbeatNotInResearchEvent = _Expect<
  _Equal<
    Extract<ResearchEvent, { type: "heartbeat" }>,
    never
  >
>;

type _TestHeartbeatHasServerTime = _Expect<
  _Equal<
    HeartbeatEvent["server_time"],
    string
  >
>;

type _TestAllNineTypesPresent = _Expect<
  _Equal<
    AnyWireEvent["type"],
    | "plan_created"
    | "node_started"
    | "node_progress"
    | "node_completed"
    | "conflict_detected"
    | "report_chunk"
    | "done"
    | "error"
    | "heartbeat"
  >
>;

// Force tsc to evaluate every assertion without leaking symbols to consumers.
// `declare const` emits no runtime; a tuple type ensures all assertions are referenced.
declare const _researchEventsTypeTests: [
  _TestBaseEventFields,
  _TestPlanCreatedExtractsNodes,
  _TestNodeStartedHasTrack,
  _TestHeartbeatNotInResearchEvent,
  _TestHeartbeatHasServerTime,
  _TestAllNineTypesPresent,
];
void _researchEventsTypeTests;
