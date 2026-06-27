"use client";

import { useEffect } from "react";
import type { Post } from "@/lib/types";
import { MEDIA } from "@/lib/types";
import PanoViewer from "./PanoViewer";
import { track } from "@/lib/telemetry";

export default function Immersive({ post, onClose }: { post: Post; onClose: () => void }) {
  useEffect(() => {
    track("viewer_open", { postId: post.id, props: { type: post.type } });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [post.id, post.type, onClose]);

  const spec = MEDIA[post.type];

  return (
    <div className="imm">
      <div className="imm-stage">
        <PanoViewer post={post} />

        {/* gaze reticle — a spatial-targeting hint that fades after a beat */}
        <svg className="gaze" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="24" cy="24" r="13" opacity="0.5" />
          <circle cx="24" cy="24" r="2.5" fill="currentColor" stroke="none" />
          <path d="M24 3v8M24 37v8M3 24h8M37 24h8" />
        </svg>

        {/* top HUD */}
        <div className="imm-top">
          <div className="imm-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/panogram-mark.png" alt="Panogram" />
            <div>
              <div className="imm-title">{post.title}</div>
              <div className="imm-sub">
                {spec.label} · {post.location} · @{post.author.handle}
              </div>
            </div>
          </div>
          <div className="imm-hud">
            <span className="dot" /> Immersive mode
          </div>
          <button className="imm-close" onClick={onClose} aria-label="Exit immersive view">
            ✕
          </button>
        </div>

        {/* bottom HUD — drag hint + the glasses-ready tell */}
        <div className="imm-bottom">
          <div className="glasses-hint">
            ⌖ Drag to look around &nbsp;·&nbsp; <b>Optimized for spatial displays</b>
          </div>
        </div>
      </div>
    </div>
  );
}
