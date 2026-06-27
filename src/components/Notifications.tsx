"use client";

import Link from "next/link";
import type { Notification } from "@/lib/db";

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const verb = (n: Notification) =>
  n.kind === "like" ? "liked" : n.kind === "comment" ? "commented on" : "followed you";

export default function Notifications({ items, onClose }: { items: Notification[]; onClose: () => void }) {
  return (
    <>
      <div className="notif-scrim" onClick={onClose} />
      <aside className="notif glass">
        <div className="notif-head"><b>Activity</b><button className="imm-close" onClick={onClose}>✕</button></div>
        <div className="notif-list">
          {items.length === 0 ? (
            <p className="drawer-empty">No activity yet. When people like, comment, or follow, it shows up here.</p>
          ) : (
            items.map((n) => {
              const href = n.kind === "follow" ? `/u/${n.actorHandle}` : n.postId ? `/p/${n.postId}` : "/";
              return (
                <Link key={n.id} href={href} className="notif-row" onClick={onClose}>
                  <div className="dot-av" style={{ background: n.actorGrad, width: 30, height: 30 }}>{n.actorHandle[0]?.toUpperCase()}</div>
                  <div className="notif-body">
                    <span><b>@{n.actorHandle}</b> {verb(n)}{n.kind !== "follow" && n.postTitle ? <> <span className="notif-ctx">{n.postTitle}</span></> : ""}</span>
                    {n.kind === "comment" && n.body && <div className="notif-quote">“{n.body}”</div>}
                  </div>
                  <span className="notif-time">{ago(n.createdAt)}</span>
                </Link>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
