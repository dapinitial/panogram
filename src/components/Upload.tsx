"use client";

import { useRef, useState } from "react";
import type { MediaType, Post } from "@/lib/types";
import { MEDIA } from "@/lib/types";
import { browserSupabase } from "@/lib/supabase-browser";
import { track } from "@/lib/telemetry";
import { extractCaptureGeo, type CaptureGeo } from "@/lib/exif";
import { downscaleForViewer } from "@/lib/downscale";

const TYPES: MediaType[] = ["panoramic_photo", "360_photo", "360_video", "180_photo", "180_video"];

const aspectFor = (t: MediaType) =>
  t.includes("video") ? "16/9" : t === "panoramic_photo" ? "3/1" : t.startsWith("180") ? "16/9" : "2/1";

// Uploads to Supabase Storage with the signed-in client; returns the storage path
// and a public URL. Falls back to a local object URL when not configured.
async function storePano(file: File): Promise<{ url: string; path: string | null }> {
  const sb = browserSupabase();
  if (!sb) return { url: URL.createObjectURL(file), path: null };
  const ext = file.name.split(".").pop() || "jpg";
  const path = `uploads/${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await sb.storage.from("panoramas").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) return { url: URL.createObjectURL(file), path: null }; // bucket not pushed yet
  return { url: sb.storage.from("panoramas").getPublicUrl(path).data.publicUrl, path };
}

export default function Upload({
  user,
  onClose,
  onPublish,
}: {
  user: { id: string; email?: string } | null;
  onClose: () => void;
  onPublish: (p: Post) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [over, setOver] = useState(false);
  const [type, setType] = useState<MediaType>("panoramic_photo");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [geo, setGeo] = useState<CaptureGeo>({});
  const [manualHeading, setManualHeading] = useState<number | null>(null);

  function take(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    // Capture geo unlocks the sun layer + real-world bearings. Best-effort.
    setGeo({}); setManualHeading(null);
    extractCaptureGeo(f).then(setGeo);
  }

  async function publish() {
    if (!title.trim() || !file || busy) return;
    setBusy(true);
    // Geo was already read from the ORIGINAL file (re-encoding strips EXIF);
    // what we store is the viewer-safe version.
    const { file: storeFile, resized } = await downscaleForViewer(file);
    const { url, path } = await storePano(storeFile);

    // Persist a real post when signed in (RLS lets you insert as yourself).
    let id = `u-${Math.random().toString(36).slice(2)}`;
    const sb = browserSupabase();
    if (user && sb && path) {
      const { data, error } = await sb
        .from("posts")
        .insert({
          author_id: user.id, type, title: title.trim(), location: location.trim(), storage_path: path, aspect: aspectFor(type),
          capture_lat: geo.lat ?? null, capture_lng: geo.lng ?? null, capture_heading: geo.heading ?? null,
        })
        .select("id")
        .single();
      if (!error && data) id = data.id as string;
    }

    const post: Post = {
      id,
      type,
      title: title.trim(),
      location: location.trim() || "Somewhere on Earth",
      author: { handle: user?.email?.split("@")[0] ?? "you", initials: (user?.email?.[0] ?? "Y").toUpperCase(), grad: "linear-gradient(135deg,#ff6b35,#7c3aed)" },
      poster: `#0a0a12 url("${url}") center / cover no-repeat`,
      panoUrl: url,
      likes: 0,
      comments: 0,
      saves: 0,
      captureLat: geo.lat, captureLng: geo.lng, captureHeading: geo.heading,
    };
    track("upload_publish", { postId: post.id, props: { type, persisted: !!(user && path), hasGeo: geo.lat !== undefined, hasHeading: geo.heading !== undefined, resized } });
    onPublish(post);
  }

  const willSave = !!user;

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet glass" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="eyebrow">Capture</div>
            <h2>Share a place</h2>
          </div>
          <button className="imm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <input ref={inputRef} type="file" accept="image/*,video/*" hidden onChange={(e) => take(e.target.files?.[0])} />
        <button
          className="chamber"
          data-loaded={!!preview}
          data-over={over}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
        >
          {preview ? (
            <>
              <div className="chamber-band" style={{ backgroundImage: `url("${preview}")` }} />
              <div className="chamber-horizon" />
              <div className="chamber-status">
                <span className="dot" /> Ready to enter — {file?.name}
                {geo.lat !== undefined && (
                  <span className="geo-chip" title="Capture GPS found — sun path + real-world bearings enabled">
                    📍 {geo.lat.toFixed(4)}, {geo.lng!.toFixed(4)}{geo.heading !== undefined ? ` · ⌖ ${Math.round(geo.heading)}°` : ""}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="chamber-empty">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <circle cx="12" cy="12" r="9" opacity="0.5" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              <b>Drop a panorama</b>
              <span>or choose a file — equirectangular JPG, PNG, or MP4</span>
            </div>
          )}
        </button>

        <div className="field">
          <label>Format</label>
          <div className="seg">
            {TYPES.map((t) => (
              <button key={t} className="seg-opt" data-active={type === t} onClick={() => setType(t)}>
                {MEDIA[t].short}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="t">Name this place</label>
          <input id="t" placeholder="Shinjuku at 3am" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="l">Location</label>
          <input id="l" placeholder="Tokyo, Japan" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>

        {/* Heading nudge: GPS without compass means the sun layer can't orient.
            One tap fixes it — which way was the camera's center facing? */}
        {file && geo.lat !== undefined && geo.heading === undefined && (
          <div className="field">
            <label>Which way does the center of the shot face? <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>(no compass data found — this places the sun path)</span></label>
            <div className="seg" style={{ flexWrap: "wrap" }}>
              {([["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]] as const).map(([label, deg]) => (
                <button key={label} className="seg-opt" data-active={manualHeading === deg}
                  onClick={() => { setManualHeading(deg); setGeo((g) => ({ ...g, heading: deg })); }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sheet-foot">
          <span className="sheet-note">{willSave ? "Saves to your library" : "Sign in to save — publishing locally for now"}</span>
          <button className="btn-upload" disabled={!title.trim() || !file || busy} onClick={publish}>
            {busy ? "Publishing…" : "Publish to feed"}
          </button>
        </div>
      </div>
    </div>
  );
}
