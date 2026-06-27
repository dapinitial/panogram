"use client";

import { useEffect, useState } from "react";
import type { Annotation, Comment, Post } from "@/lib/types";
import { MEDIA } from "@/lib/types";
import PanoViewer from "./PanoViewer";
import { track } from "@/lib/telemetry";
import { addAnnotation, addComment, addFind, loadAnnotations, loadComments } from "@/lib/db";
import type { SelectedMarker } from "./PanoViewerImpl";

const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const KINDS: Annotation["kind"][] = ["note", "cache", "portal"];

export default function Immersive({
  post, user, liked, isFollowing, onClose, onLike, onFollow, onAuthRequired,
}: {
  post: Post;
  user: { id: string; email?: string } | null;
  liked: boolean;
  isFollowing: boolean;
  onClose: () => void;
  onLike: () => void;
  onFollow: () => void;
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
  const [shared, setShared] = useState(false);
  const [cache, setCache] = useState<{ id: string; label: string } | null>(null);
  const [foundMsg, setFoundMsg] = useState("");

  function onSelect(m: SelectedMarker) {
    if (m.kind === "cache" && m.id) setCache({ id: m.id, label: m.label || "cache" });
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
      loadComments(post.id).then(setComments);
      loadAnnotations(post.id).then((a) => a.length && setAnnotations(a));
    }
  }, [post.id, post.authorId, post.type]);

  // Esc closes the pin composer first, otherwise the viewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (pending ? setPending(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  function onPlace(yaw: number, pitch: number) {
    if (!user) { setAddMode(false); return onAuthRequired(); }
    setPending({ yaw, pitch });
    setLabel("");
  }

  async function savePin() {
    if (!user || !pending || !label.trim() || !post.authorId) return;
    const a: Annotation = { yaw: pending.yaw, pitch: pending.pitch, label: label.trim(), kind };
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
            <div className="seg" style={{ marginTop: 10 }}>
              {KINDS.map((k) => <button key={k} className="seg-opt" data-active={kind === k} onClick={() => setKind(k)}>{k}</button>)}
            </div>
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
                    <div><div className="cmt-h">@{c.author.handle}</div><div className="cmt-b">{c.body}</div></div>
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
      </div>
    </div>
  );
}
