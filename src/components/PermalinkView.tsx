"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Post } from "@/lib/types";
import { browserSupabase } from "@/lib/supabase-browser";
import { loadMyEngagement, loadMyBlocks, blockUser, toggleLike, toggleFollow } from "@/lib/db";
import { track } from "@/lib/telemetry";
import Immersive from "./Immersive";
import AuthSheet from "./AuthSheet";

// Standalone viewer for a shared /p/[id] link. Reuses the immersive viewer, loads
// the visitor's auth + engagement, and routes home on close.
export default function PermalinkView({ post: initial }: { post: Post }) {
  const router = useRouter();
  const [post, setPost] = useState(initial);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) return;
    (async () => {
      const { data } = await sb.auth.getUser();
      const u = data.user ? { id: data.user.id, email: data.user.email } : null;
      setUser(u);
      const { count } = await sb.from("likes").select("*", { count: "exact", head: true }).eq("post_id", initial.id);
      setPost((p) => ({ ...p, likes: count ?? 0 }));
      if (u) {
        const me = await loadMyEngagement(u.id);
        setLiked(me.liked.has(initial.id));
        if (initial.authorId) setFollowing(me.following.has(initial.authorId));
        setBlocked(await loadMyBlocks(u.id));
      }
    })();
  }, [initial.id, initial.authorId]);

  async function onLike() {
    if (!user) return setAuthOpen(true);
    const on = !liked;
    setLiked(on);
    setPost((p) => ({ ...p, likes: Math.max(0, p.likes + (on ? 1 : -1)) }));
    if (post.authorId) await toggleLike(post.id, user.id, on);
  }

  async function onFollow() {
    if (!user) return setAuthOpen(true);
    if (!post.authorId || post.authorId === user.id) return;
    const on = !following;
    setFollowing(on);
    await toggleFollow(post.authorId, user.id, on);
  }

  async function onBlock(targetId: string) {
    if (!user) return setAuthOpen(true);
    track("block", { props: { target: targetId } });
    await blockUser(user.id, targetId);
    router.push("/");
  }

  return (
    <>
      <Immersive
        post={post}
        user={user}
        liked={liked}
        isFollowing={following}
        blocked={blocked}
        onClose={() => router.push("/")}
        onLike={onLike}
        onFollow={onFollow}
        onBlock={onBlock}
        onAuthRequired={() => setAuthOpen(true)}
      />
      {authOpen && <AuthSheet onClose={() => setAuthOpen(false)} />}
    </>
  );
}
