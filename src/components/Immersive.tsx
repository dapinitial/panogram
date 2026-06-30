"use client";

import { useEffect, useRef, useState } from "react";
import type { Annotation, Comment, Post } from "@/lib/types";
import { MEDIA } from "@/lib/types";
import PanoViewer from "./PanoViewer";
import ReportSheet from "./ReportSheet";
import { track } from "@/lib/telemetry";
import { addAnnotation, addComment, addFind, loadAnnotations, loadComments, type ReportTarget } from "@/lib/db";
import type { SelectedMarker } from "./PanoViewerImpl";

type ReportSubject = { type: ReportTarget; id: string; postId?: string | null; label: string };

const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const KINDS: Annotation["kind"][] = ["note", "cache", "sponsored", "product", "portal"];

type AdCard = { id?: string; label: string; url?: string; kind: string };
type PortalCard = { id?: string; label: string; targetPostId?: string };
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
  const [pending, setPending] = useState<{ yaw: number; pitch: number } | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<Annotation["kind"]>("note");
  const [pinUrl, setPinUrl] = useState("");
  const [shared, setShared] = useState(false);
  const [cache, setCache] = useState<{ id: string; label: string } | null>(null);
  const [foundMsg, setFoundMsg] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [report, setReport] = useState<ReportSubject | null>(null);
  const [ad, setAd] = useState<AdCard | null>(null);
  const [portal, setPortal] = useState<PortalCard | null>(null);
  const adOpenedAt = useRef(0);
  const impressed = useRef<Set<string>>(new Set());

  const notMine = !!post.authorId && post.authorId !== user?.id;

  function closeAd() {
    if (ad) {
      const ms = adOpenedAt.current ? Date.now() - adOpenedAt.current : 0;
      if (ms > 250) track("ad_dwell", { postId: post.id, props: { kind: ad.kind, ms } });
    }
    setAd(null);
  }

  function adConvert() {
    if (!ad) return;
    track("ad_conversion", { postId: post.id, props: { kind: ad.kind, label: ad.label } });
    if (ad.url) window.open(ad.url, "_blank", "noopener,noreferrer");
    closeAd();
  }

  function stepThroughPortal() {
    if (!portal) return;
    track("ad_conversion", { postId: post.id, props: { kind: "portal", label: portal.label } });
    if (portal.targetPostId && onTeleport) onTeleport(portal.targetPostId);
    setPortal(null);
  }

  function onSelect(m: SelectedMarker) {
    if (m.kind === "cache" && m.id) {
      setCache({ id: m.id, label: m.label || "cache" });
    } else if (m.kind && AD_KINDS.has(m.kind)) {
      adOpenedAt.current = Date.now();
      setAd({ id: m.id, label: m.label || "Sponsored", url: m.targetUrl, kind: m.kind });
    } else if (m.kind === "portal") {
      track("ad_peek", { postId: post.id, props: { label: m.label } });
      setPortal({ id: m.id, label: m.label || "Portal", targetPostId: m.targetPostId });
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
      track("ad_impression", { postId: post.id, props: { kind: a.kind, label: a.label } });
    });
  }, [annotations, post.id]);

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
      else if (menuOpen) setMenuOpen(false);
      else if (pending) setPending(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, menuOpen, report, ad, portal, onClose]);

  function onPlace(yaw: number, pitch: number) {
    if (!user) { setAddMode(false); return onAuthRequired(); }
    setPending({ yaw, pitch });
    setLabel(""); setPinUrl("");
  }

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
        <PanoViewer post={post} annotations={annotations} addMode={addMode} onPlace={onPlace} onSelect={onSelect} />

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
        {!addMode && (
          <div className="imm-bottom"><div className="glasses-hint">⌖ Drag to look around · <b>Optimized for spatial displays</b></div></div>
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
          <button className="rail-btn" data-on={addMode} onClick={() => (user ? setAddMode((v) => !v) : onAuthRequired())} title="Add spatial tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="11" r="8" /><path d="M12 8v6M9 11h6" /></svg>
            <span>tag</span>
          </button>
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
