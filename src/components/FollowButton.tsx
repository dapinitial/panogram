"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import { toggleFollow } from "@/lib/db";
import { track } from "@/lib/telemetry";
import AuthSheet from "./AuthSheet";

// Self-contained follow toggle for the creator page. Optimistic + persisted.
export default function FollowButton({ targetId, count: initial }: { targetId: string; count: number }) {
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(initial);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) return;
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUser({ id: data.user.id });
      const { data: row } = await sb.from("follows").select("follower_id").eq("follower_id", data.user.id).eq("following_id", targetId).maybeSingle();
      setFollowing(!!row);
    });
  }, [targetId]);

  const isSelf = user?.id === targetId;

  async function toggle() {
    if (!user) return setAuthOpen(true);
    if (isSelf) return;
    const on = !following;
    setFollowing(on);
    setCount((c) => Math.max(0, c + (on ? 1 : -1)));
    if (on) track("follow", { props: { target: targetId } });
    await toggleFollow(targetId, user.id, on);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
        {!isSelf && (
          <button className={`follow ${following ? "on" : ""}`} onClick={toggle} style={{ marginLeft: 0 }}>
            {following ? "Following" : "Follow"}
          </button>
        )}
        <span style={{ color: "var(--ink-dim)", fontSize: 14 }}>
          <b style={{ color: "var(--ink)", fontFamily: "var(--font-d)" }}>{count}</b> follower{count === 1 ? "" : "s"}
        </span>
      </div>
      {authOpen && <AuthSheet onClose={() => setAuthOpen(false)} />}
    </>
  );
}
