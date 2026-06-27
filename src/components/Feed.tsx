"use client";

import { useState } from "react";
import type { MediaType, Post } from "@/lib/types";
import { MEDIA } from "@/lib/types";
import PostCard from "./PostCard";
import { track } from "@/lib/telemetry";

const FILTERS: { id: "all" | MediaType; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "panoramic_photo", label: "Panoramic" },
  { id: "360_photo", label: "360°" },
  { id: "360_video", label: "360° Video" },
  { id: "180_photo", label: "VR180" },
  { id: "180_video", label: "VR180 Video" },
];

export default function Feed({ posts, onOpen }: { posts: Post[]; onOpen: (p: Post) => void }) {
  const [filter, setFilter] = useState<"all" | MediaType>("all");
  const shown = filter === "all" ? posts : posts.filter((p) => p.type === filter);

  return (
    <>
      <header className="hero">
        <div className="eyebrow">Spatial social · Teleport anywhere</div>
        <h1>
          Stand inside <span className="gradient-text">the world.</span>
        </h1>
        <p>
          Panoramic, 360° and 180° captures you can step into — not scroll past. Drag to
          look around, tap to explore. Built spatial-native for the displays we&apos;ll all
          be wearing soon.
        </p>
        <div className="hero-spec">
          <div className="spec-chip">Formats <span>· 5</span></div>
          <div className="spec-chip">Annotations <span>· spatial</span></div>
          <div className="spec-chip">Glasses <span>· ready</span></div>
        </div>
      </header>

      <div className="rail">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className="chip"
            data-active={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              track("filter_change", { props: { filter: f.id } });
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", padding: "60px 0", textAlign: "center" }}>
          Nothing in this format yet.
        </p>
      ) : (
        <div className="grid">
          {shown.map((p) => (
            <PostCard key={p.id} post={p} onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  );
}
