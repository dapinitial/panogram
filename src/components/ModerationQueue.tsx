"use client";

import { useState } from "react";

export type ModReport = {
  id: string;
  targetType: "post" | "comment" | "annotation" | "profile";
  targetId: string;
  reason: string;
  details: string;
  reporterHandle: string;
  context: string;        // post title / comment body / handle — what the moderator reviews
  createdAt: string;
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ModerationQueue({ reports, adminKey }: { reports: ModReport[]; adminKey: string }) {
  const [items, setItems] = useState(reports);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function act(r: ModReport, action: "remove" | "dismiss") {
    if (!adminKey) { setErr("Set ADMIN_KEY and open /admin?key=… to take action."); return; }
    setBusy(r.id + action); setErr("");
    const res = await fetch("/api/moderation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: adminKey, reportId: r.id, targetType: r.targetType, targetId: r.targetId, action, reason: r.reason }),
    });
    setBusy(null);
    if (!res.ok) { setErr(`Action failed (${res.status}).`); return; }
    // On remove, drop every queued report for the same target (the API resolved them).
    setItems((cur) => cur.filter((x) => (action === "remove" ? !(x.targetType === r.targetType && x.targetId === r.targetId) : x.id !== r.id)));
  }

  if (items.length === 0) {
    return <div className="empty-x">Queue is clear — no open reports. 🎉</div>;
  }

  return (
    <div className="modq">
      {err && <div className="mod-err">{err}</div>}
      {items.map((r) => (
        <div className="mod-row" key={r.id}>
          <div className="mod-main">
            <div className="mod-tags">
              <span className={`mod-reason r-${r.reason}`}>{r.reason}</span>
              <span className="mod-type">{r.targetType}</span>
              <span className="mod-time">{ago(r.createdAt)}</span>
            </div>
            <div className="mod-context">{r.context || `${r.targetType} ${r.targetId.slice(0, 8)}`}</div>
            {r.details && <div className="mod-details">“{r.details}”</div>}
            <div className="mod-reporter">reported by @{r.reporterHandle}</div>
          </div>
          <div className="mod-actions">
            <button className="btn-sec" disabled={!!busy} onClick={() => act(r, "dismiss")}>
              {busy === r.id + "dismiss" ? "…" : "Dismiss"}
            </button>
            <button className="mod-remove" disabled={!!busy} onClick={() => act(r, "remove")}>
              {busy === r.id + "remove" ? "…" : (r.targetType === "post" ? "Remove post" : r.targetType === "profile" ? "Mark reviewed" : "Remove")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
