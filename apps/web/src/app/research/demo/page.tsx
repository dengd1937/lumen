import { notFound, redirect } from "next/navigation";

/**
 * /research/demo — Demo Day entry. Resolves the demo session_id from
 * the backend (loaded from apps/api/data/demo_session.json fixture at
 * server startup) and redirects to /research/{id} where the standard
 * P2 progress page mounts. The backend's demo replay path then serves
 * the prerendered fixture instead of driving real LangGraph.
 *
 * 404 if the backend has no fixture configured (T13b prerender hasn't
 * been run for this deployment).
 *
 * No client-side reload loop: this is a server-component redirect, so
 * `redirect()` returns a 307 before any HTML is sent to the browser.
 *
 * Auth: the demo replay stream itself is gated by the backend's three-
 * tier guard (Origin allowlist / X-Lumen-Demo-Token / TESTING_MODE).
 * Demo Day deployments serve from https://demo.lumen.app which is in
 * the default allowlist; the Origin/Referer is set automatically by
 * the browser, so no extra headers are needed here.
 */

const API_BASE = process.env.NEXT_PUBLIC_LUMEN_API_BASE_URL ?? "";

interface DemoSessionResponse {
  readonly session_id: string;
}

export default async function DemoPage() {
  const r = await fetch(`${API_BASE}/api/research/demo-session-id`, {
    cache: "no-store",
  });
  if (r.status === 404) {
    notFound();
  }
  if (!r.ok) {
    throw new Error(
      `Demo session lookup failed: HTTP ${r.status} ${r.statusText}`,
    );
  }
  const body = (await r.json()) as DemoSessionResponse;
  if (typeof body.session_id !== "string" || body.session_id.length === 0) {
    throw new Error("Demo session response missing session_id");
  }
  redirect(`/research/${body.session_id}`);
}
