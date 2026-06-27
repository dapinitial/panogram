import { getSupabaseAdmin } from "@/lib/supabase";
import { MEDIA, type MediaType } from "@/lib/types";

// Always render fresh per request — this is a live data view, never prerendered.
export const dynamic = "force-dynamic";

type EventRow = { name: string; session_id: string | null; post_id: string | null; created_at: string };

const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));
const pct = (n: number) => (n * 100).toFixed(n >= 0.1 ? 0 : 1) + "%";

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// The funnel — every arrow is a real event in the schema (see VISION.md).
const FUNNEL: { key: string; label: string }[] = [
  { key: "view", label: "Viewed the feed" },
  { key: "card_click", label: "Tapped a post" },
  { key: "viewer_open", label: "Entered immersion" },
  { key: "explore_drag", label: "Explored — dragged to look" },
  { key: "upload_publish", label: "Published a capture" },
];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  // Optional gate: set ADMIN_KEY to lock this page; pass ?key=… to view.
  const gate = process.env.ADMIN_KEY;
  const { key } = await searchParams;
  if (gate && key !== gate) {
    return (
      <main className="admin">
        <div className="lock glass">
          <div className="eyebrow">Restricted</div>
          <h1>Data room is locked</h1>
          <p>Append <code>?key=…</code> to the URL with the admin key to view live metrics.</p>
        </div>
      </main>
    );
  }

  const admin = getSupabaseAdmin();
  const connected = !!admin;

  let events: EventRow[] = [];
  let postTypes: MediaType[] = [];
  let postCount = 0;
  let userCount = 0;

  if (admin) {
    const [ev, posts, users] = await Promise.all([
      admin.from("events").select("name,session_id,post_id,created_at").order("created_at", { ascending: false }).limit(5000),
      admin.from("posts").select("type"),
      admin.from("profiles").select("id", { count: "exact", head: true }),
    ]);
    events = (ev.data as EventRow[]) ?? [];
    postTypes = ((posts.data as { type: MediaType }[]) ?? []).map((p) => p.type);
    postCount = postTypes.length;
    userCount = users.count ?? 0;
  }

  // ── compute the metric tree ──────────────────────────────────────────────
  const weekAgo = Date.now() - 7 * 86_400_000;
  const recent = events.filter((e) => new Date(e.created_at).getTime() >= weekAgo);
  const sessions = new Set(events.map((e) => e.session_id).filter(Boolean));
  const sessions7d = new Set(recent.map((e) => e.session_id).filter(Boolean));

  const count = (name: string, rows: EventRow[] = events) => rows.filter((e) => e.name === name).length;
  const immersiveViews7d = count("viewer_open", recent);
  const northStar = sessions7d.size ? immersiveViews7d / sessions7d.size : 0;

  // sessions that reached the "magic moment" (entered immersion)
  const reached = new Set(events.filter((e) => e.name === "viewer_open").map((e) => e.session_id));
  const activation = sessions.size ? reached.size / sessions.size : 0;

  const funnel = FUNNEL.map((s) => ({ ...s, n: count(s.key) }));
  const funnelTop = Math.max(1, funnel[0].n);

  // events by name (top 8)
  const byName = Object.entries(
    events.reduce<Record<string, number>>((a, e) => ((a[e.name] = (a[e.name] || 0) + 1), a), {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const byNameMax = Math.max(1, ...byName.map(([, n]) => n));

  // content mix
  const typeMix = postTypes.reduce<Record<string, number>>((a, t) => ((a[t] = (a[t] || 0) + 1), a), {});

  return (
    <>
      <div className="backdrop" />
      <main className="admin">
        <div className="admin-head">
          <div>
            <div className="eyebrow">Panogram · Data room</div>
            <h1>What&apos;s actually landing</h1>
          </div>
          <div className="conn">
            <span className={`dot ${connected ? "on" : "off"}`} />
            {connected ? "Live · Supabase" : "Not connected"}
          </div>
        </div>

        {!connected && (
          <div className="banner">
            <span>⚠</span>
            <div>
              <b>No live data yet.</b> Paste <code>SUPABASE_SECRET_KEY</code> into <code>.env.local</code> and
              restart — interactions in the app will start flowing into this dashboard. The structure below is
              what lights up.
            </div>
          </div>
        )}
        {connected && !gate && (
          <div className="banner">
            <span>🔓</span>
            <div>
              This page is <b>unprotected</b>. Set <code>ADMIN_KEY</code> in <code>.env.local</code> to require
              <code>?key=…</code> before anyone can read your metrics.
            </div>
          </div>
        )}

        {/* North-star */}
        <section className="ns">
          <div className="eyebrow">North-star metric</div>
          <div className="ns-val gradient-text">{northStar ? northStar.toFixed(1) : "—"}</div>
          <div className="ns-unit">immersive views per active visitor · last 7 days</div>
          <div className="ns-parts">
            <div className="ns-part"><b>{fmt(immersiveViews7d)}</b><span>Immersive views (7d)</span></div>
            <div className="ns-part"><b>{fmt(sessions7d.size)}</b><span>Active visitors (7d)</span></div>
            <div className="ns-part"><b>{pct(activation)}</b><span>Activation rate</span></div>
          </div>
        </section>

        {/* KPI row */}
        <section className="kpis">
          <div className="kpi"><div className="kpi-v">{fmt(sessions.size)}</div><div className="kpi-l">Visitors (all-time)</div><div className="kpi-sub">distinct sessions</div></div>
          <div className="kpi"><div className="kpi-v">{fmt(events.length)}</div><div className="kpi-l">Events captured</div><div className="kpi-sub">{events.length >= 5000 ? "showing latest 5,000" : "all events"}</div></div>
          <div className="kpi"><div className="kpi-v">{fmt(count("viewer_open"))}</div><div className="kpi-l">Immersions entered</div><div className="kpi-sub">viewer opens</div></div>
          <div className="kpi"><div className="kpi-v">{fmt(count("upload_publish"))}</div><div className="kpi-l">Captures published</div><div className="kpi-sub">supply side</div></div>
          <div className="kpi"><div className="kpi-v">{fmt(postCount)}</div><div className="kpi-l">Posts</div><div className="kpi-sub">{userCount} creators</div></div>
        </section>

        <div className="panel-grid">
          {/* Funnel */}
          <div className="card-x">
            <h3>Conversion funnel</h3>
            <div className="sub">Feed → immersion → exploration → capture. % is step-to-step conversion.</div>
            {events.length === 0 ? (
              <div className="empty-x">No events yet — interact with the app to populate the funnel.</div>
            ) : (
              <div className="funnel">
                {funnel.map((s, i) => {
                  const prev = i === 0 ? s.n : funnel[i - 1].n;
                  const cv = prev ? s.n / prev : 0;
                  return (
                    <div className="fstep" key={s.key}>
                      <div className="fstep-top">
                        <span className="fstep-name">{s.label}</span>
                        {i > 0 && <span className="fstep-cv">{pct(cv)} ▸</span>}
                      </div>
                      <div className="ftrack">
                        <div className="fbar" style={{ width: `${Math.max(6, (s.n / funnelTop) * 100)}%` }}>
                          <b>{fmt(s.n)}</b>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Events by type */}
          <div className="card-x">
            <h3>Where attention goes</h3>
            <div className="sub">Event volume by type — the engagement signal.</div>
            {byName.length === 0 ? (
              <div className="empty-x">No events yet.</div>
            ) : (
              <div className="bars">
                {byName.map(([name, n]) => (
                  <div className="bar-row" key={name}>
                    <span className="nm">{name}</span>
                    <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / byNameMax) * 100}%` }} /></span>
                    <span className="ct">{fmt(n)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel-grid" style={{ marginTop: 18 }}>
          {/* Recent activity */}
          <div className="card-x">
            <h3>Live activity</h3>
            <div className="sub">The most recent events, newest first.</div>
            {events.length === 0 ? (
              <div className="empty-x">Nothing yet. Every tap in the app shows up here.</div>
            ) : (
              <div className="act">
                {events.slice(0, 12).map((e, i) => (
                  <div className="act-row" key={i}>
                    <div>
                      <div className="act-name">{e.name}</div>
                      <div className="act-meta">
                        session {e.session_id?.slice(0, 6) ?? "—"}{e.post_id ? ` · post ${e.post_id.slice(0, 6)}` : ""}
                      </div>
                    </div>
                    <div className="act-time">{ago(e.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content mix */}
          <div className="card-x">
            <h3>Content mix</h3>
            <div className="sub">Published posts by immersive format.</div>
            {postCount === 0 ? (
              <div className="empty-x">No posts in the database yet.</div>
            ) : (
              <div className="bars">
                {Object.entries(typeMix).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                  <div className="bar-row" key={t}>
                    <span className="nm">{MEDIA[t as MediaType]?.short ?? t}</span>
                    <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / Math.max(1, ...Object.values(typeMix))) * 100}%` }} /></span>
                    <span className="ct">{fmt(n)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
