"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { POSTS } from "@/lib/mock";
import type { Post } from "@/lib/types";
import { track } from "@/lib/telemetry";
import { browserSupabase } from "@/lib/supabase-browser";
import { loadFeed, loadMyEngagement, loadNotifications, loadMyBlocks, blockUser, toggleLike, toggleSave, toggleFollow, followerCount, type Notification } from "@/lib/db";
import Nav, { type Tab } from "@/components/Nav";
import Feed from "@/components/Feed";
import Immersive from "@/components/Immersive";
import Upload from "@/components/Upload";
import AuthSheet from "@/components/AuthSheet";
import Notifications from "@/components/Notifications";
import Welcome from "@/components/Welcome";
import Footer from "@/components/Footer";

export default function Home() {
  const [tab, setTab] = useState<Tab>("Feed");
  const [posts, setPosts] = useState<Post[]>(POSTS);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [query, setQuery] = useState("");
  const [followers, setFollowers] = useState(0);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [seen, setSeen] = useState("");
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  const viewing = useMemo(() => posts.find((p) => p.id === viewingId) ?? null, [posts, viewingId]);
  const unread = notifs.filter((n) => n.createdAt > seen).length;

  const refresh = useCallback(async (uid?: string) => {
    const blocks = uid ? await loadMyBlocks(uid) : new Set<string>();
    setBlocked(blocks);
    const db = await loadFeed(blocks);
    setPosts(db.length ? [...db, ...POSTS] : POSTS);
    if (uid) {
      const me = await loadMyEngagement(uid);
      setLiked(me.liked); setSaved(me.saved); setFollowing(me.following);
      setFollowers(await followerCount(uid));
      setNotifs(await loadNotifications(uid));
    }
  }, []);

  useEffect(() => { track("view", { props: { tab } }); }, [tab]);
  useEffect(() => { setSeen(localStorage.getItem("pg_notif_seen") ?? ""); }, []);

  function openBell() {
    setNotifOpen(true);
    const now = new Date().toISOString();
    setSeen(now);
    try { localStorage.setItem("pg_notif_seen", now); } catch { /* private mode */ }
  }

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => { if (data.user) setUser({ id: data.user.id, email: data.user.email }); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ? { id: session.user.id, email: session.user.email } : null;
      setUser(u);
      refresh(u?.id);
    });
    refresh();
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  // ── engagement handlers (optimistic + persist real posts) ──
  const setCount = (postId: string, delta: number) =>
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likes: Math.max(0, p.likes + delta) } : p)));

  async function onLike(post: Post) {
    if (!user) return setAuthOpen(true);
    const on = !liked.has(post.id);
    setLiked((s) => { const n = new Set(s); on ? n.add(post.id) : n.delete(post.id); return n; });
    setCount(post.id, on ? 1 : -1);
    if (on) track("like", { postId: post.id });
    if (post.authorId) await toggleLike(post.id, user.id, on);
  }

  async function onSave(post: Post) {
    if (!user) return setAuthOpen(true);
    const on = !saved.has(post.id);
    setSaved((s) => { const n = new Set(s); on ? n.add(post.id) : n.delete(post.id); return n; });
    if (on) track("save", { postId: post.id });
    if (post.authorId) await toggleSave(post.id, user.id, on);
  }

  async function onFollow(post: Post) {
    if (!user) return setAuthOpen(true);
    if (!post.authorId || post.authorId === user.id) return;
    const on = !following.has(post.authorId);
    setFollowing((s) => { const n = new Set(s); on ? n.add(post.authorId!) : n.delete(post.authorId!); return n; });
    await toggleFollow(post.authorId, user.id, on);
  }

  async function onBlock(targetId: string) {
    if (!user) return setAuthOpen(true);
    setBlocked((s) => new Set(s).add(targetId));
    setViewingId(null);
    track("block", { props: { target: targetId } });
    await blockUser(user.id, targetId);
    await refresh(user.id);
  }

  function publish(post: Post) {
    setPosts((prev) => [post, ...prev]);
    setUploadOpen(false);
    setTab("Feed");
    setViewingId(post.id);
    if (user) refresh(user.id);
  }

  async function signOut() {
    await browserSupabase()?.auth.signOut();
    setUser(null); setLiked(new Set()); setSaved(new Set()); setFollowing(new Set());
  }

  const mine = posts.filter((p) => user && p.authorId === user.id);
  const found = query.trim()
    ? posts.filter((p) => [p.title, p.location, p.author.handle].some((s) => s.toLowerCase().includes(query.toLowerCase())))
    : posts;

  return (
    <>
      <div className="backdrop" />
      <Nav tab={tab} onTab={setTab} onUpload={() => setUploadOpen(true)} user={user} onSignIn={() => setAuthOpen(true)} onSignOut={signOut} unread={unread} onBell={openBell} />

      <main className="shell">
        {tab === "Feed" && <Feed posts={posts} liked={liked} saved={saved} onOpen={setViewingId} onLike={onLike} onSave={onSave} />}

        {tab === "Explore" && (
          <>
            <header className="hero">
              <div className="eyebrow">Discover</div>
              <h1>Find your next <span className="gradient-text">horizon.</span></h1>
              <div className="search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <input placeholder="Search place, title, or creator…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
                {query && <button onClick={() => setQuery("")} aria-label="Clear">✕</button>}
              </div>
            </header>
            {found.length ? (
              <Feed posts={found} liked={liked} saved={saved} onOpen={setViewingId} onLike={onLike} onSave={onSave} bare />
            ) : (
              <p style={{ color: "var(--ink-faint)", padding: "40px 0" }}>No panoramas match “{query}”.</p>
            )}
          </>
        )}

        {tab === "Profile" && (
          <>
            <header className="hero">
              <div className="eyebrow">Creator</div>
              <h1>{user ? (user.email ?? "You") : "Your profile"}</h1>
              {user ? (
                <p>{mine.length} capture{mine.length === 1 ? "" : "s"} · {followers} follower{followers === 1 ? "" : "s"} · saved & liked panoramas are remembered across sessions.</p>
              ) : (
                <>
                  <p>Sign in to claim a profile, publish captures, and save panoramas.</p>
                  <button className="btn-upload" style={{ marginTop: 18 }} onClick={() => setAuthOpen(true)}>Sign in</button>
                </>
              )}
            </header>
            {user && (mine.length ? <Feed posts={mine} liked={liked} saved={saved} onOpen={setViewingId} onLike={onLike} onSave={onSave} bare /> : <p style={{ color: "var(--ink-faint)" }}>No captures yet — hit Capture to publish your first.</p>)}
          </>
        )}
      </main>

      <Footer />

      {viewing && (
        <Immersive
          post={viewing}
          user={user}
          liked={liked.has(viewing.id)}
          isFollowing={!!viewing.authorId && following.has(viewing.authorId)}
          onClose={() => setViewingId(null)}
          onLike={() => onLike(viewing)}
          onFollow={() => onFollow(viewing)}
          onBlock={onBlock}
          blocked={blocked}
          onTeleport={(id) => setViewingId(id)}
          onAuthRequired={() => setAuthOpen(true)}
        />
      )}
      {uploadOpen && <Upload user={user} onClose={() => setUploadOpen(false)} onPublish={publish} />}
      {authOpen && <AuthSheet onClose={() => setAuthOpen(false)} />}
      {notifOpen && <Notifications items={notifs} onClose={() => setNotifOpen(false)} />}
      <Welcome />
    </>
  );
}
