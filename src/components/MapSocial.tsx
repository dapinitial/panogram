"use client";

import { useEffect, useState } from "react";
import type { Comment } from "@/lib/types";
import { loadMapSocial, toggleMapLike, loadMapComments, addMapComment } from "@/lib/db";
import { track } from "@/lib/telemetry";

/**
 * Likes + comment thread for a saved map — shared by the flat and 3D Atlas
 * engines so social is identical on both. Self-contained: it fetches its own
 * state from `mapId` and prompts sign-in (via onAuthRequired) on write.
 */
export default function MapSocial({ mapId, user, onAuthRequired }: {
  mapId: string;
  user: { id: string } | null;
  onAuthRequired: () => void;
}) {
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // Parents pass key={mapId}, so this mounts fresh per map — no stale-state reset needed.
  useEffect(() => {
    let ok = true;
    (async () => {
      const [s, c] = await Promise.all([loadMapSocial(mapId, user?.id), loadMapComments(mapId)]);
      if (!ok) return;
      setLikes(s.likes); setLiked(s.liked); setComments(c);
    })();
    return () => { ok = false; };
  }, [mapId, user?.id]);

  async function toggleLike() {
    if (!user) return onAuthRequired();
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1)); // optimistic
    await toggleMapLike(mapId, user.id, next);
    track(next ? "map_like" : "map_unlike");
  }

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    if (!user) return onAuthRequired();
    setBusy(true);
    const added = await addMapComment(mapId, user.id, body.slice(0, 1000));
    setBusy(false);
    if (added) { setComments((cs) => [...cs, added]); setDraft(""); track("map_comment"); }
  }

  return (
    <div className="map-social">
      <div className="map-social-head">
        <button className="map-like" data-on={liked} onClick={toggleLike} aria-pressed={liked}>
          <span className="map-like-heart">{liked ? "♥" : "♡"}</span>
          <span>{likes}</span>
        </button>
        <span className="map-social-label">{comments.length} comment{comments.length === 1 ? "" : "s"}</span>
      </div>
      <div className="map-comments">
        {comments.map((c) => (
          <div className="map-comment" key={c.id}>
            <span className="map-comment-grad" style={{ background: c.author.grad }} aria-hidden />
            <div className="map-comment-body">
              <b>@{c.author.handle}</b>
              <span>{c.body}</span>
            </div>
          </div>
        ))}
        {comments.length === 0 && <p className="plot-hint">No comments yet — start the thread.</p>}
      </div>
      <div className="map-comment-add">
        <input className="plot-title" placeholder={user ? "Add a comment…" : "Sign in to comment…"}
          value={draft} maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="btn-sec" disabled={busy || !draft.trim()} onClick={submit}>
          {busy ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}
