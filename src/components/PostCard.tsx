"use client";

import Link from "next/link";
import type { Post } from "@/lib/types";
import { MEDIA } from "@/lib/types";
import { track } from "@/lib/telemetry";

const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));

export default function PostCard({
  post, liked, saved, onOpen, onLike, onSave,
}: {
  post: Post;
  liked: boolean;
  saved: boolean;
  onOpen: (id: string) => void;
  onLike: (p: Post) => void;
  onSave: (p: Post) => void;
}) {
  const spec = MEDIA[post.type];
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <article
      className="card"
      onClick={() => { track("card_click", { postId: post.id, props: { type: post.type } }); onOpen(post.id); }}
    >
      <div className="card-stage">
        <div className="card-poster" style={{ background: post.poster }} />
        <div className="horizon" />

        <div className="badge">
          {spec.immersive ? <span className="o">◉ </span> : <span className="o">▭ </span>}
          {spec.short}
        </div>

        {!!post.annotationCount && post.annotationCount > 0 && (
          <div className="anno-pip" title={`${post.annotationCount} spatial tag${post.annotationCount === 1 ? "" : "s"}`}>
            ◎ {post.annotationCount}
          </div>
        )}

        <div className="enter" aria-hidden>
          <svg className="reticle" viewBox="0 0 24 24" fill="none" stroke="var(--holo)" strokeWidth="1.4">
            <circle cx="12" cy="12" r="7" opacity="0.6" />
            <circle cx="12" cy="12" r="1.6" fill="var(--holo)" stroke="none" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </div>

        <div className="card-meta">
          <h3>{post.title}</h3>
          <div className="card-loc">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            {post.location}
          </div>
        </div>
      </div>

      <div className="card-foot">
        {post.authorId ? (
          <Link href={`/u/${post.author.handle}`} className="who" onClick={stop}>
            <div className="dot-av" style={{ background: post.author.grad }}>{post.author.initials}</div>
            <span className="handle">@{post.author.handle}</span>
          </Link>
        ) : (
          <div className="who">
            <div className="dot-av" style={{ background: post.author.grad }}>{post.author.initials}</div>
            <span className="handle">@{post.author.handle}</span>
          </div>
        )}
        <div className="stats">
          <button className="stat" style={liked ? { color: "var(--coral)" } : undefined}
            onClick={(e) => { stop(e); onLike(post); }} aria-label="Like">
            <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /></svg>
            {fmt(post.likes)}
          </button>
          <span className="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            {fmt(post.comments)}
          </span>
          <button className="stat" style={saved ? { color: "var(--purple)" } : undefined}
            onClick={(e) => { stop(e); onSave(post); }} aria-label="Save">
            <svg viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </button>
        </div>
      </div>
    </article>
  );
}
