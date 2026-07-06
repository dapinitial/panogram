"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Annotation, Comment, Post, Sighting } from "@/lib/types";
import { MEDIA, POI } from "@/lib/types";
import PanoViewer from "./PanoViewer";
import ReportSheet from "./ReportSheet";
import { track } from "@/lib/telemetry";
import { addAnnotation, addComment, addFind, addSighting, loadAnnotations, loadComments, loadSightings, type ReportTarget } from "@/lib/db";
import type { SelectedMarker } from "./PanoViewerImpl";
import { sunPathForPano } from "@/lib/sun";

type ReportSubject = { type: ReportTarget; id: string; postId?: string | null; label: string };

const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const KINDS: Annotation["kind"][] = ["note", "cache", "sponsored", "product", "portal"];

type AdCard = { id?: string; label: string; url?: string; kind: string; campaignId?: string };
type PortalCard = { id?: string; label: string; targetPostId?: string; campaignId?: string };
const AD_KINDS = new Set(["sponsored", "product", "link"]);

export default function Immersive({
  post, user, liked, isFollowing, blocked, onClose, onLike, onFollow, onBlock, onTeleport, onAuthRequired,
}: {
  post: Post;
  user: { id: string; email?: string } | null;
  liked: boolean;
  isFollowing: boolean;
  blocked: Set<string>;
  onClose: () => void;
  onLike: () => void;
  onFollow: () => void;
  onBlock: (targetId: string) => void;
  onTeleport?: (postId: string) => void;
  onAuthRequired: () => void;
}) {
  const spec = MEDIA[post.type];
  const [comments, setComments] = useState<Comment[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>(post.annotations ?? []);
  const [panelOpen, setPanelOpen] = useState(false);
  const [text, setText] = useState("");
  const [addMode, setAddMode] = useState(false);
  // Topo drawing (VISION annotation layer §2): clicks accumulate into a
  // spherical polyline. null = not drawing; [] = armed, waiting for first point.
  const [draft, setDraft] = useState<[number, number][] | null>(null);
  const [naming, setNaming] = useState(false);
  const [pending, setPending] = useState<{ yaw: number; pitch: number } | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<Annotation["kind"]>("note");
  const [pinUrl, setPinUrl] = useState("");
  const [shared, setShared] = useState(false);
  const [cache, setCache] = useState<{ id: string; label: string } | null>(null);
  const [foundMsg, setFoundMsg] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [report, setReport] = useState<ReportSubject | null>(null);
  // AI tagging (BYOK — the key lives in this browser only, rides each request,
  // and is never stored server-side).
  const [aiOpen, setAiOpen] = useState(false);
  const [aiKey, setAiKey] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  // Sun layer (deterministic — lib/sun.ts). Null when the post has no capture geo.
  const sunPath = useMemo(() => sunPathForPano(post), [post]);
  const [sunOn, setSunOn] = useState(false);
  // Sighting sheet — confirm/dispute a tapped annotation from the field.
  const [sight, setSight] = useState<{ id: string; label: string; kind: string } | null>(null);
  const [sightList, setSightList] = useState<Sighting[]>([]);
  const [sightNote, setSightNote] = useState("");
  const [verdict, setVerdict] = useState<Sighting["verdict"]>("confirmed");
  const [ad, setAd] = useState<AdCard | null>(null);
  const [portal, setPortal] = useState<PortalCard | null>(null);
  const adOpenedAt = useRef(0);
  const impressed = useRef<Set<string>>(new Set());

  const notMine = !!post.authorId && post.authorId !== user?.id;

  function closeAd() {
    if (ad) {
      const ms = adOpenedAt.current ? Date.now() - adOpenedAt.current : 0;
      if (ms > 250) track("ad_dwell", { postId: post.id, props: { kind: ad.kind, ms, campaignId: ad.campaignId } });
    }
    setAd(null);
  }

  function adConvert() {
    if (!ad) return;
    track("ad_conversion", { postId: post.id, props: { kind: ad.kind, label: ad.label, campaignId: ad.campaignId } });
    if (ad.url) window.open(ad.url, "_blank", "noopener,noreferrer");
    closeAd();
  }

  function stepThroughPortal() {
    if (!portal) return;
    track("ad_conversion", { postId: post.id, props: { kind: "portal", label: portal.label, campaignId: portal.campaignId } });
    if (portal.targetPostId && onTeleport) onTeleport(portal.targetPostId);
    setPortal(null);
  }

  function onSelect(m: SelectedMarker) {
    if (m.kind === "cache" && m.id) {
      setCache({ id: m.id, label: m.label || "cache" });
    } else if (m.id && (m.kind === "route" || m.kind === "poi" || m.kind === "nature" || m.kind === "cultural")) {
      setSight({ id: m.id, label: m.label || m.kind, kind: m.kind });
      setSightNote(""); setVerdict("confirmed"); setSightList([]);
      loadSightings(m.id, blocked).then(setSightList);
    } else if (m.kind && AD_KINDS.has(m.kind)) {
      adOpenedAt.current = Date.now();
      setAd({ id: m.id, label: m.label || "Sponsored", url: m.targetUrl, kind: m.kind, campaignId: m.campaignId });
    } else if (m.kind === "portal") {
      track("ad_peek", { postId: post.id, props: { label: m.label, campaignId: m.campaignId } });
      setPortal({ id: m.id, label: m.label || "Portal", targetPostId: m.targetPostId, campaignId: m.campaignId });
    }
  }

  // Count an impression once per ad-kind placement that renders in this scene —
  // the brand was on-screen, whether or not the viewer taps it.
  useEffect(() => {
    annotations.forEach((a) => {
      if (a.kind !== "sponsored" && a.kind !== "product" && a.kind !== "link" && a.kind !== "portal") return;
      const key = `${post.id}:${a.id ?? `${a.kind}-${a.yaw.toFixed(2)}-${a.pitch.toFixed(2)}`}`;
      if (impressed.current.has(key)) return;
      impressed.current.add(key);
      track("ad_impression", { postId: post.id, props: { kind: a.kind, label: a.label, campaignId: a.campaignId } });
    });
  }, [annotations, post.id]);

  function openAi() {
    if (!user) return onAuthRequired();
    setAiError("");
    setAiKey(localStorage.getItem("pg_anthropic_key") ?? "");
    setAiOpen(true); setMenuOpen(false);
  }

  async function runAiTagging() {
    if (!user || aiBusy) return;
    setAiBusy(true); setAiError("");
    const key = aiKey.trim();
    if (key) localStorage.setItem("pg_anthropic_key", key);
    try {
      const res = await fetch("/api/annotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId: post.id, apiKey: key || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setAiError(data.error ?? "tagging failed"); return; }
      track("ai_tag_run", { postId: post.id, props: { tags: data.inserted } });
      loadAnnotations(post.id).then((a) => a.length && setAnnotations(a));
      setAiOpen(false);
      setFoundMsg(`✨ ${data.inserted} AI tag${data.inserted === 1 ? "" : "s"} proposed — review and confirm them`);
      setTimeout(() => setFoundMsg(""), 3200);
    } catch {
      setAiError("network error — try again");
    } finally {
      setAiBusy(false);
    }
  }

  // Save a sighting — the native comment + trust upgrade + triangulation sample.
  // The sighter's GPS rides along when the browser grants it quickly; never blocks.
  async function saveSighting() {
    if (!user) return onAuthRequired();
    if (!sight) return;
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 3000, maximumAge: 60000 });
    });
    const ok = await addSighting(sight.id, user.id, verdict, {
      note: sightNote.trim() || undefined,
      lat: pos?.coords.latitude, lng: pos?.coords.longitude,
    });
    if (ok) {
      track("sighting", { postId: post.id, props: { verdict, kind: sight.kind } });
      if (verdict === "confirmed") {
        // Upgrade locally so unverified styling clears without a refetch.
        setAnnotations((prev) => prev.map((a) =>
          a.id === sight.id ? { ...a, confirmedSightings: (a.confirmedSightings ?? 0) + 1 } : a));
      }
      setFoundMsg("Sighting logged — thanks for keeping the map honest");
      setTimeout(() => setFoundMsg(""), 2200);
    }
    setSight(null);
  }

  async function markFound() {
    if (!user) return onAuthRequired();
    if (!cache) return;
    const ok = await addFind(cache.id, user.id);
    if (ok) { track("cache_find", { postId: post.id }); setFoundMsg(`Found “${cache.label}” 🧭`); setTimeout(() => setFoundMsg(""), 2200); }
    setCache(null);
  }

  async function share() {
    const url = `${location.origin}/p/${post.id}`;
    try { if (navigator.share) { await navigator.share({ title: post.title, text: `Stand inside ${post.title} on Panogram`, url }); return; } } catch { /* user cancelled */ }
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 1800); } catch { /* clipboard blocked */ }
  }

  const canFollow = !!post.authorId && post.authorId !== user?.id;

  // Load once per post (don't re-run on every state change).
  useEffect(() => {
    track("viewer_open", { postId: post.id, props: { type: post.type } });
    if (post.authorId) {
      loadComments(post.id, blocked).then(setComments);
      loadAnnotations(post.id).then((a) => a.length && setAnnotations(a));
    }
  }, [post.id, post.authorId, post.type, blocked]);

  // Esc closes the pin composer first, otherwise the viewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (report) setReport(null);
      else if (ad) closeAd();
      else if (portal) setPortal(null);
      else if (sight) setSight(null);
      else if (aiOpen) setAiOpen(false);
      else if (menuOpen) setMenuOpen(false);
      else if (naming) setNaming(false);
      else if (draft) setDraft(null);
      else if (pending) setPending(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, menuOpen, report, ad, portal, draft, naming, sight, aiOpen, onClose]);

  function onPlace(yaw: number, pitch: number) {
    if (!user) { setAddMode(false); setDraft(null); return onAuthRequired(); }
    if (draft) { setDraft([...draft, [yaw, pitch]]); return; } // drawing: extend the line
    setPending({ yaw, pitch });
    setLabel(""); setPinUrl("");
  }

  function toggleDraw() {
    if (!user) return onAuthRequired();
    setAddMode(false); setPending(null); setNaming(false); setLabel("");
    setDraft((d) => (d ? null : []));
  }

  async function saveRoute() {
    if (!user || !draft || draft.length < 2 || !label.trim() || !post.authorId) return;
    const a: Annotation = { yaw: draft[0][0], pitch: draft[0][1], label: label.trim(), kind: "route", path: draft };
    const ok = await addAnnotation(post.id, user.id, a);
    if (ok) {
      setAnnotations((prev) => [...prev, a]);
      track("route_draw", { postId: post.id, props: { points: draft.length } });
    }
    setDraft(null); setNaming(false); setLabel("");
  }

  // Live preview: the in-progress line rides into the viewer as a route annotation.
  const viewerAnnotations = draft?.length
    ? [...annotations, { yaw: draft[0][0], pitch: draft[0][1], label: "drawing…", kind: "route" as const, path: draft }]
    : annotations;

  const kindNeedsUrl = kind === "sponsored" || kind === "product" || kind === "link";

  async function savePin() {
    if (!user || !pending || !label.trim() || !post.authorId) return;
    const a: Annotation = {
      yaw: pending.yaw, pitch: pending.pitch, label: label.trim(), kind,
      targetUrl: kindNeedsUrl && pinUrl.trim() ? pinUrl.trim() : undefined,
    };
    const ok = await addAnnotation(post.id, user.id, a);
    if (ok) {
      setAnnotations((prev) => [...prev, a]);
      track("annotation_create", { postId: post.id, props: { kind } });
    }
    setPending(null); setAddMode(false);
  }

  async function submitComment() {
    if (!user) return onAuthRequired();
    if (!text.trim() || !post.authorId) return;
    const c = await addComment(post.id, user.id, text.trim());
    if (c) { setComments((prev) => [...prev, c]); track("comment", { postId: post.id }); }
    setText("");
  }

  return (
    <div className="imm">
      <div className="imm-stage">
        <PanoViewer post={post} annotations={viewerAnnotations} addMode={addMode || !!draft} onPlace={onPlace} onSelect={onSelect} sunPath={sunOn ? sunPath : null} />

        <svg className="gaze" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="24" cy="24" r="13" opacity="0.5" /><circle cx="24" cy="24" r="2.5" fill="currentColor" stroke="none" />
          <path d="M24 3v8M24 37v8M3 24h8M37 24h8" />
        </svg>

        {/* top HUD */}
        <div className="imm-top">
          <div className="imm-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/panogram-mark.png" alt="Panogram" />
            <div>
              <div className="imm-title">{post.title}</div>
              <div className="imm-sub">{spec.label} · {post.location} · @{post.author.handle}</div>
            </div>
          </div>
          {canFollow && (
            <button className={`follow ${isFollowing ? "on" : ""}`} onClick={() => (user ? onFollow() : onAuthRequired())}>
              {isFollowing ? "Following" : `Follow @${post.author.handle}`}
            </button>
          )}
          {post.authorId && (
            <button className="imm-close" onClick={share} aria-label="Share" title="Share this place" style={canFollow ? undefined : { marginLeft: "auto" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" /></svg>
            </button>
          )}
          {post.authorId && (
            <div className="imm-menu-wrap">
              <button className="imm-close" onClick={() => setMenuOpen((v) => !v)} aria-label="More" title="More">⋯</button>
              {menuOpen && (
                <>
                  <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
                  <div className="imm-menu glass">
                    <button onClick={openAi}>✨ AI annotate</button>
                    <button onClick={() => { setMenuOpen(false); setReport({ type: "post", id: post.id, postId: post.id, label: "this capture" }); }}>
                      ⚑ Report capture
                    </button>
                    {notMine && (
                      <button onClick={() => { setMenuOpen(false); setReport({ type: "profile", id: post.authorId!, postId: post.id, label: `@${post.author.handle}` }); }}>
                        ⚑ Report @{post.author.handle}
                      </button>
                    )}
                    {notMine && (
                      <button className="danger" onClick={() => { setMenuOpen(false); user ? onBlock(post.authorId!) : onAuthRequired(); }}>
                        ⛔ Block @{post.author.handle}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <button className="imm-close" onClick={onClose} aria-label="Exit">✕</button>
        </div>
        {shared && <div className="toast">Link copied — anyone can step inside</div>}
        {foundMsg && <div className="toast">{foundMsg}</div>}

        {/* AI annotate — BYOK sheet */}
        {aiOpen && (
          <div className="pin-compose glass" role="dialog" aria-label="AI annotate">
            <div className="eyebrow">✨ AI annotate</div>
            <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.55, margin: "8px 0" }}>
              Claude reads this scene and proposes spatial tags — trails, flora, routes, points of
              interest. Proposals are marked <b>AI · unverified</b> until the community confirms them.
            </p>
            <input type="password" placeholder="Your Anthropic API key (sk-ant-…)" value={aiKey}
              onChange={(e) => setAiKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAiTagging()} />
            <p style={{ color: "var(--ink-faint)", fontSize: 11, lineHeight: 1.5, marginTop: 6 }}>
              Bring your own key — it stays in this browser, rides along with the request once, and is
              never stored on our servers.
            </p>
            {aiError && <p style={{ color: "#ffb454", fontSize: 12, marginTop: 8 }}>⚠ {aiError}</p>}
            <div className="sheet-foot" style={{ marginTop: 14 }}>
              <button className="btn-sec" onClick={() => setAiOpen(false)}>Cancel</button>
              <button className="btn-upload" disabled={aiBusy} onClick={runAiTagging}>
                {aiBusy ? "Reading the scene…" : "Run AI tagging"}
              </button>
            </div>
          </div>
        )}

        {/* sighting sheet — the crowdsource loop on a tapped annotation */}
        {sight && (() => {
          const anno = annotations.find((a) => a.id === sight.id);
          const unverified = !!anno?.safetyCritical && !(anno.confirmedSightings && anno.confirmedSightings > 0);
          const what = anno?.poiType ? POI[anno.poiType].label : sight.kind;
          return (
            <div className="pin-compose glass" role="dialog" aria-label="Sighting">
              <div className="eyebrow">{what}{anno?.source === "ai" ? " · AI-proposed" : ""}</div>
              <div style={{ fontFamily: "var(--font-d)", fontSize: 18, fontWeight: 600, margin: "8px 0 4px" }}>{sight.label}</div>
              {unverified && (
                <p style={{ color: "#ffb454", fontSize: 12, lineHeight: 1.5 }}>
                  ⚠ Unverified — nobody has confirmed this from the field. Trust your own judgment, not this marker.
                </p>
              )}
              {sightList.length > 0 && (
                <div style={{ maxHeight: 130, overflowY: "auto", margin: "8px 0" }}>
                  {sightList.map((s) => (
                    <div className="cmt" key={s.id}>
                      <div className="dot-av" style={{ background: s.author.grad, width: 22, height: 22 }}>{s.author.initials}</div>
                      <div style={{ flex: 1 }}>
                        <div className="cmt-h">@{s.author.handle} · {s.verdict === "confirmed" ? "✓ confirmed" : s.verdict === "disputed" ? "✕ not as described" : "∅ gone"}</div>
                        {s.note && <div className="cmt-b">{s.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="seg" style={{ marginTop: 10, flexWrap: "wrap" }}>
                {(["confirmed", "disputed", "gone"] as const).map((v) => (
                  <button key={v} className="seg-opt" data-active={verdict === v} onClick={() => setVerdict(v)}>
                    {v === "confirmed" ? "✓ it's there" : v === "disputed" ? "✕ not as described" : "∅ gone"}
                  </button>
                ))}
              </div>
              <input style={{ marginTop: 10 }} placeholder="Field note (optional) — condition, season, beta…" value={sightNote}
                onChange={(e) => setSightNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveSighting()} />
              <div className="sheet-foot" style={{ marginTop: 14 }}>
                <button className="btn-sec" onClick={() => setSight(null)}>Close</button>
                <button className="btn-upload" onClick={saveSighting}>Log sighting</button>
              </div>
            </div>
          );
        })()}

        {/* geocache find panel */}
        {cache && (
          <div className="pin-compose glass">
            <div className="eyebrow" style={{ color: "var(--holo)" }}>🧭 Cache found</div>
            <div style={{ fontFamily: "var(--font-d)", fontSize: 18, fontWeight: 600, margin: "8px 0 4px" }}>{cache.label}</div>
            <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.5 }}>You spotted a hidden cache in this scene. Log the find?</p>
            <div className="sheet-foot" style={{ marginTop: 14 }}>
              <button className="btn-sec" onClick={() => setCache(null)}>Not yet</button>
              <button className="btn-upload" onClick={markFound}>Log find</button>
            </div>
          </div>
        )}

        {/* sponsored / product / link — native in-world ad */}
        {ad && (
          <div className="ad-card glass" role="dialog" aria-label="Sponsored">
            <button className="ad-x" onClick={closeAd} aria-label="Dismiss">✕</button>
            <div className="ad-eyebrow"><span className="ad-dot" />Sponsored{ad.kind === "product" ? " · Shop" : ""}</div>
            <div className="ad-label">{ad.label}</div>
            {ad.url && <div className="ad-host">{(() => { try { return new URL(ad.url).hostname.replace(/^www\./, ""); } catch { return ad.url; } })()}</div>}
            <button className="ad-cta" onClick={adConvert}>
              {ad.kind === "product" ? "Shop now" : ad.kind === "link" ? "Open" : "Visit"} →
            </button>
          </div>
        )}

        {/* portal — native sponsored teleport */}
        {portal && (
          <div className="ad-card glass portal-card" role="dialog" aria-label="Teleport">
            <button className="ad-x" onClick={() => setPortal(null)} aria-label="Dismiss">✕</button>
            <div className="ad-eyebrow portal"><span className="ad-dot" />Portal · Teleport</div>
            <div className="ad-label">{portal.label}</div>
            <p className="ad-sub">Step through into another place — without leaving immersion.</p>
            <button className="ad-cta portal" disabled={!portal.targetPostId || !onTeleport} onClick={stepThroughPortal}>
              {portal.targetPostId && onTeleport ? "Step inside →" : "Preview only"}
            </button>
          </div>
        )}

        {/* add-mode hint */}
        {addMode && !pending && (
          <div className="imm-bottom"><div className="glasses-hint">⌖ Click anywhere in the scene to drop a spatial tag</div></div>
        )}
        {!addMode && !draft && (
          <div className="imm-bottom"><div className="glasses-hint">⌖ Drag to look around · <b>Optimized for spatial displays</b></div></div>
        )}

        {/* draw-mode HUD — the topo tool */}
        {draft && !naming && (
          <div className="imm-bottom">
            <div className="glasses-hint">
              ✎ {draft.length === 0
                ? "Click the rock to start the line — bottom to top, like a guidebook topo"
                : `${draft.length} point${draft.length === 1 ? "" : "s"} — click to extend the line`}
              {draft.length > 0 && (
                <button className="hint-act" onClick={() => setDraft(draft.slice(0, -1))}>↩ Undo</button>
              )}
              <button className="hint-act" onClick={() => setDraft(null)}>✕ Cancel</button>
              {draft.length > 1 && (
                <button className="hint-act hint-act--go" onClick={() => { setLabel(""); setNaming(true); }}>✓ Finish line</button>
              )}
            </div>
          </div>
        )}

        {/* route naming composer */}
        {draft && naming && (
          <div className="pin-compose glass">
            <div className="eyebrow">New line · {draft.length} points</div>
            <input autoFocus placeholder="Name it — route, rap line, approach…" value={label}
              onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveRoute()} />
            <p style={{ color: "var(--ink-dim)", fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Lines are observations, not endorsements — safety-critical beta stays marked unverified until the community confirms it.
            </p>
            <div className="sheet-foot" style={{ marginTop: 14 }}>
              <button className="btn-sec" onClick={() => setNaming(false)}>Keep drawing</button>
              <button className="btn-upload" disabled={!label.trim()} onClick={saveRoute}>Save line</button>
            </div>
          </div>
        )}

        {/* pin label composer */}
        {pending && (
          <div className="pin-compose glass">
            <div className="eyebrow">New spatial tag</div>
            <input autoFocus placeholder="What's here?" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePin()} />
            <div className="seg" style={{ marginTop: 10, flexWrap: "wrap" }}>
              {KINDS.map((k) => <button key={k} className="seg-opt" data-active={kind === k} onClick={() => setKind(k)}>{k}</button>)}
            </div>
            {kindNeedsUrl && (
              <input style={{ marginTop: 10 }} placeholder="Destination URL (https://…)" value={pinUrl}
                onChange={(e) => setPinUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePin()} />
            )}
            <div className="sheet-foot" style={{ marginTop: 14 }}>
              <button className="btn-sec" onClick={() => setPending(null)}>Cancel</button>
              <button className="btn-upload" disabled={!label.trim()} onClick={savePin}>Drop tag</button>
            </div>
          </div>
        )}

        {/* action rail */}
        <div className="imm-rail">
          <button className="rail-btn" data-on={liked} onClick={onLike} title="Like">
            <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /></svg>
            <span>{fmt(post.likes)}</span>
          </button>
          <button className="rail-btn" data-on={panelOpen} onClick={() => setPanelOpen((v) => !v)} title="Comments">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span>{comments.length}</span>
          </button>
          <button className="rail-btn" data-on={addMode} onClick={() => { if (!user) return onAuthRequired(); setDraft(null); setAddMode((v) => !v); }} title="Add spatial tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="11" r="8" /><path d="M12 8v6M9 11h6" /></svg>
            <span>tag</span>
          </button>
          <button className="rail-btn" data-on={!!draft} onClick={toggleDraw} title="Draw a line — route topo, rap line, approach">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20c3-1 2.5-5 5-7s5-1.5 7-5 2-5 2-5" /><circle cx="4" cy="20" r="1.6" fill="currentColor" stroke="none" /><circle cx="18" cy="3" r="1.6" fill="currentColor" stroke="none" /></svg>
            <span>draw</span>
          </button>
          {sunPath && (
            <button className="rail-btn" data-on={sunOn}
              onClick={() => { if (!sunOn) track("sun_path_view", { postId: post.id }); setSunOn((v) => !v); }}
              title="Today's sun path — where it rises, arcs, and sets in this scene">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>
              <span>sun</span>
            </button>
          )}
        </div>

        {/* comments drawer */}
        {panelOpen && (
          <aside className="drawer glass">
            <div className="drawer-head"><b>Comments</b><button className="imm-close" onClick={() => setPanelOpen(false)}>✕</button></div>
            <div className="drawer-list">
              {!post.authorId ? (
                <p className="drawer-empty">Comments live on published captures. This is a demo panorama.</p>
              ) : comments.length === 0 ? (
                <p className="drawer-empty">No comments yet. Say something about this place.</p>
              ) : (
                comments.map((c) => (
                  <div className="cmt" key={c.id}>
                    <div className="dot-av" style={{ background: c.author.grad, width: 26, height: 26 }}>{c.author.initials}</div>
                    <div style={{ flex: 1 }}><div className="cmt-h">@{c.author.handle}</div><div className="cmt-b">{c.body}</div></div>
                    <button className="cmt-report" title="Report comment" aria-label="Report comment"
                      onClick={() => (user ? setReport({ type: "comment", id: c.id, postId: post.id, label: "this comment" }) : onAuthRequired())}>⚑</button>
                  </div>
                ))
              )}
            </div>
            {post.authorId && (
              <div className="drawer-input">
                <input placeholder={user ? "Add a comment…" : "Sign in to comment"} value={text}
                  onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitComment()} />
                <button className="btn-upload" onClick={submitComment} disabled={!text.trim()}>Send</button>
              </div>
            )}
          </aside>
        )}

        {report && (
          <ReportSheet user={user} target={report} onClose={() => setReport(null)} onAuthRequired={onAuthRequired} />
        )}
      </div>
    </div>
  );
}
