"use client";

import { track } from "@/lib/telemetry";

const TABS = ["Feed", "Explore", "Profile"] as const;
export type Tab = (typeof TABS)[number];

export default function Nav({
  tab,
  onTab,
  onUpload,
  user,
  onSignIn,
  onSignOut,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onUpload: () => void;
  user: { email?: string } | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  return (
    <nav className="nav">
      <div className="brand" onClick={() => onTab("Feed")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/panogram-mark.png" alt="Panogram" />
        <b>panogram</b>
      </div>

      <div className="nav-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className="nav-tab"
            data-active={tab === t}
            onClick={() => onTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="nav-right">
        <div className="status">
          <span className="dot" /> Spatial · Live
        </div>
        <button
          className="btn-upload"
          onClick={() => {
            track("upload_open");
            onUpload();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Capture
        </button>
        {user ? (
          <div
            className="avatar"
            title={`${user.email ?? "Signed in"} — click to sign out`}
            onClick={onSignOut}
          >
            {(user.email?.[0] ?? "Y").toUpperCase()}
          </div>
        ) : (
          <button className="nav-tab" style={{ color: "var(--ink)" }} onClick={onSignIn}>
            Sign in
          </button>
        )}
      </div>
    </nav>
  );
}
