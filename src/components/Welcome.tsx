"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/telemetry";

// First-run welcome — teaches the one gesture that makes Panogram click ("drag to look around"),
// shown once per browser. Keep it short: the magic is in doing it, not reading about it.
export default function Welcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("pg_welcomed")) { setShow(true); track("view", { props: { onboard: "shown" } }); }
  }, []);

  function dismiss() {
    try { localStorage.setItem("pg_welcomed", "1"); } catch { /* private mode */ }
    setShow(false);
  }

  if (!show) return null;
  return (
    <div className="welcome-scrim" onClick={dismiss}>
      <div className="welcome glass" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/panogram-mark.png" alt="" className="welcome-mark" />
        <div className="eyebrow">Welcome to Panogram</div>
        <h2>You don&apos;t scroll the world —<br /><span className="gradient-text">you stand in it.</span></h2>
        <ul className="welcome-steps">
          <li><span className="ws-i">◉</span> Tap any post to <b>teleport inside</b> it</li>
          <li><span className="ws-i">⟲</span> <b>Drag</b> to look around — full 360°, all around you</li>
          <li><span className="ws-i" style={{ color: "var(--holo)" }}>◎</span> Tap the glowing <b>tags</b> to discover what&apos;s there</li>
        </ul>
        <button className="btn-upload welcome-go" onClick={dismiss}>Start exploring</button>
        <div className="welcome-foot">…or hit <b>Capture</b> to drop your own panorama in.</div>
      </div>
    </div>
  );
}
