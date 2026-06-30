import { getSupabaseAdmin } from "@/lib/supabase";
import { MEDIA, type MediaType } from "@/lib/types";
import ModerationQueue, { type ModReport } from "@/components/ModerationQueue";

// Always render fresh per request — this is a live data view, never prerendered.
export const dynamic = "force-dynamic";

type EventRow = { name: string; session_id: string | null; post_id: string | null; created_at: string; props: Record<string, unknown> | null };
type Advertiser = { id: string; name: string };
type Campaign = { id: string; advertiser_id: string; name: string; cpm_cents: number; budget_cents: number | null; status: string };
type ReportRow = {
  id: string; target_type: ModReport["targetType"]; target_id: string; post_id: string | null;
  reason: string; details: string; created_at: string; reporter_id: string | null;
};

// Resolve human context (titles, handles, comment bodies) for the moderation queue.
type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
async function buildModReports(admin: AdminClient, rows: ReportRow[]): Promise<ModReport[]> {
  if (rows.length === 0) return [];
  const postIds = [...new Set(rows.flatMap((r) => [r.post_id, r.target_type === "post" ? r.target_id : null]).filter(Boolean) as string[])];
  const commentIds = rows.filter((r) => r.target_type === "comment").map((r) => r.target_id);
  const profileIds = [...new Set([
    ...rows.map((r) => r.reporter_id).filter(Boolean) as string[],
    ...rows.filter((r) => r.target_type === "profile").map((r) => r.target_id),
  ])];

  const [posts, comments, profiles] = await Promise.all([
    postIds.length ? admin.from("posts").select("id,title").in("id", postIds) : Promise.resolve({ data: [] }),
    commentIds.length ? admin.from("comments").select("id,body").in("id", commentIds) : Promise.resolve({ data: [] }),
    profileIds.length ? admin.from("profiles").select("id,handle").in("id", profileIds) : Promise.resolve({ data: [] }),
  ]);
  const titleOf = new Map(((posts.data as { id: string; title: string }[]) ?? []).map((p) => [p.id, p.title]));
  const bodyOf = new Map(((comments.data as { id: string; body: string }[]) ?? []).map((c) => [c.id, c.body]));
  const handleOf = new Map(((profiles.data as { id: string; handle: string }[]) ?? []).map((p) => [p.id, p.handle]));

  return rows.map((r) => {
    const postTitle = (r.post_id && titleOf.get(r.post_id)) || (r.target_type === "post" && titleOf.get(r.target_id)) || "";
    let context = "";
    if (r.target_type === "post") context = postTitle ? `“${postTitle}”` : "post";
    else if (r.target_type === "comment") context = bodyOf.has(r.target_id) ? `“${bodyOf.get(r.target_id)}”` : "comment (deleted)";
    else if (r.target_type === "annotation") context = postTitle ? `spatial tag on “${postTitle}”` : "spatial tag";
    else context = handleOf.has(r.target_id) ? `@${handleOf.get(r.target_id)}` : "profile";
    return {
      id: r.id, targetType: r.target_type, targetId: r.target_id, reason: r.reason, details: r.details,
      reporterHandle: (r.reporter_id && handleOf.get(r.reporter_id)) || "someone", context, createdAt: r.created_at,
    };
  });
}

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
  let modReports: ModReport[] = [];
  let advertisers: Advertiser[] = [];
  let campaigns: Campaign[] = [];

  if (admin) {
    const [ev, posts, users, reports, adv, camp] = await Promise.all([
      admin.from("events").select("name,session_id,post_id,created_at,props").order("created_at", { ascending: false }).limit(5000),
      admin.from("posts").select("type"),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("reports").select("id,target_type,target_id,post_id,reason,details,created_at,reporter_id")
        .in("status", ["open", "reviewing"]).order("created_at", { ascending: false }).limit(100),
      admin.from("advertisers").select("id,name"),
      admin.from("campaigns").select("id,advertiser_id,name,cpm_cents,budget_cents,status"),
    ]);
    events = (ev.data as EventRow[]) ?? [];
    postTypes = ((posts.data as { type: MediaType }[]) ?? []).map((p) => p.type);
    postCount = postTypes.length;
    userCount = users.count ?? 0;
    modReports = await buildModReports(admin, (reports.data as ReportRow[]) ?? []);
    advertisers = (adv.data as Advertiser[]) ?? [];
    campaigns = (camp.data as Campaign[]) ?? [];
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

  // ── monetization: the native in-world ad layer (the wedge) ────────────────
  const adImpressions = count("ad_impression");
  const adPeeks = count("ad_peek");
  const adConversions = count("ad_conversion");
  const adCtr = adImpressions ? adConversions / adImpressions : 0;

  // Attribute ad events to campaigns via props.campaignId; spend is MODELED at each
  // campaign's own CPM (this is the surface to actually bill).
  const usd = (cents: number) => { const d = cents / 100; return "$" + (d >= 1000 ? fmt(d) : d.toFixed(2)); };
  const advName = new Map(advertisers.map((a) => [a.id, a.name]));
  const campStats = campaigns
    .map((c) => {
      const evs = events.filter((e) => (e.props as { campaignId?: string } | null)?.campaignId === c.id);
      const imp = evs.filter((e) => e.name === "ad_impression").length;
      const conv = evs.filter((e) => e.name === "ad_conversion").length;
      const spendCents = (imp / 1000) * c.cpm_cents;
      return {
        id: c.id, name: c.name, advertiser: advName.get(c.advertiser_id) ?? "—", status: c.status,
        cpm: c.cpm_cents / 100, imp, conv, ctr: imp ? conv / imp : 0, spendCents,
        pacing: c.budget_cents ? Math.min(1, spendCents / c.budget_cents) : null,
      };
    })
    .sort((a, b) => b.imp - a.imp || b.spendCents - a.spendCents);
  const modeledSpendCents = campStats.reduce((s, c) => s + c.spendCents, 0);

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

        {/* Monetization — the wedge: native in-world ads on the spatial layer */}
        <section className="monz">
          <div className="monz-head">
            <div>
              <div className="eyebrow" style={{ color: "#ff8a5c" }}>Monetization · The wedge</div>
              <h3>Native in-world ad layer</h3>
              <p className="monz-sub">Sponsored placements and teleport portals live on the spatial annotation layer — measured end to end.</p>
            </div>
            <div className="monz-rev">
              <div className="monz-rev-v gradient-text">{modeledSpendCents ? usd(modeledSpendCents) : "—"}</div>
              <div className="monz-rev-l">modeled spend · {campStats.filter((c) => c.status === "active").length} active campaigns</div>
            </div>
          </div>
          <div className="monz-grid">
            <div className="monz-kpi"><div className="monz-v">{fmt(adImpressions)}</div><div className="monz-l">Ad impressions</div><div className="monz-x">placements rendered in-scene</div></div>
            <div className="monz-kpi"><div className="monz-v">{fmt(adConversions)}</div><div className="monz-l">Conversions</div><div className="monz-x">CTA taps → advertiser</div></div>
            <div className="monz-kpi"><div className="monz-v">{adImpressions ? pct(adCtr) : "—"}</div><div className="monz-l">Click-through rate</div><div className="monz-x">conversions ÷ impressions</div></div>
            <div className="monz-kpi"><div className="monz-v">{fmt(adPeeks)}</div><div className="monz-l">Portal peeks</div><div className="monz-x">sponsored teleport intent</div></div>
          </div>

          {campaigns.length > 0 && (
            <div className="camp-table">
              <div className="camp-row camp-head">
                <span>Campaign</span><span>Impr.</span><span>CTR</span><span>CPM</span><span>Modeled spend</span><span>Budget pacing</span>
              </div>
              {campStats.map((c) => (
                <div className="camp-row" key={c.id}>
                  <span className="camp-name"><b>{c.name}</b><em>{c.advertiser}</em></span>
                  <span>{fmt(c.imp)}</span>
                  <span>{c.imp ? pct(c.ctr) : "—"}</span>
                  <span>${c.cpm.toFixed(0)}</span>
                  <span className="camp-spend">{usd(c.spendCents)}</span>
                  <span className="camp-pace">
                    {c.pacing === null ? <em>uncapped</em> : (
                      <><span className="pace-track"><span className="pace-fill" style={{ width: `${Math.max(2, c.pacing * 100)}%` }} /></span>{pct(c.pacing)}</>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {adImpressions === 0 && (
            <div className="monz-empty">No ad events yet — open a capture with a sponsored or portal tag (the demo feed has three) to light this up.</div>
          )}
          <div className="monz-note">Spend is <b>modeled</b> at each campaign&apos;s CPM to size the surface — not booked revenue.</div>
        </section>

        {/* Moderation queue — safety first */}
        <div className="card-x" style={{ marginBottom: 18 }}>
          <h3>Moderation queue {modReports.length > 0 && <span className="mod-count">{modReports.length}</span>}</h3>
          <div className="sub">Open user reports. Remove takes the content down and clears every report on it.</div>
          <ModerationQueue reports={modReports} adminKey={gate ? (key ?? "") : ""} />
        </div>

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
