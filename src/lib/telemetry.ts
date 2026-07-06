// Client-side telemetry. Fire-and-forget to /api/events, which persists to the
// `events` table via the secret-key server client. The full vocabulary lives in
// the schema migration; these are the Phase-1 events the UI emits.
export type EventName =
  | "view"
  | "card_click"
  | "viewer_open"
  | "explore_drag"
  | "annotation_tap"
  | "annotation_create"
  | "cache_find"
  | "comment"
  | "follow"
  | "like"
  | "save"
  | "filter_change"
  | "upload_open"
  | "upload_publish"
  | "report"
  | "block"
  | "ad_impression"
  | "ad_peek"
  | "ad_dwell"
  | "ad_conversion"
  | "theme_change";

// Stable-ish anonymous session id (per tab). No PII — just correlation.
function sessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const k = "pg_sid";
  let v = sessionStorage.getItem(k);
  if (!v) {
    v = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(k, v);
  }
  return v;
}

export function track(
  name: EventName,
  data: { postId?: string; props?: Record<string, unknown> } = {},
): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({
    name,
    session_id: sessionId(),
    post_id: data.postId ?? null,
    props: data.props ?? {},
  });
  // sendBeacon survives navigation; fall back to fetch.
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through */
  }
  fetch("/api/events", { method: "POST", body: payload, keepalive: true }).catch(() => {});
}
