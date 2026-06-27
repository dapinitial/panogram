"use client";

import { useCallback, useEffect, useState } from "react";
import { POSTS } from "@/lib/mock";
import type { Post } from "@/lib/types";
import { track } from "@/lib/telemetry";
import { browserSupabase } from "@/lib/supabase-browser";
import Nav, { type Tab } from "@/components/Nav";
import Feed from "@/components/Feed";
import Immersive from "@/components/Immersive";
import Upload from "@/components/Upload";
import AuthSheet from "@/components/AuthSheet";

const SAMPLE = "https://photo-sphere-viewer-data.netlify.app/assets/sphere-small.jpg";

type DbRow = {
  id: string; type: Post["type"]; title: string; location: string | null;
  storage_path: string | null; profiles: { handle: string; avatar_grad: string | null } | null;
};

function dbToPost(row: DbRow): Post {
  const sb = browserSupabase();
  const url = row.storage_path
    ? sb?.storage.from("panoramas").getPublicUrl(row.storage_path).data.publicUrl ?? SAMPLE
    : SAMPLE;
  const handle = row.profiles?.handle ?? "creator";
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    location: row.location ?? "",
    author: { handle, initials: handle[0]?.toUpperCase() ?? "C", grad: row.profiles?.avatar_grad ?? "linear-gradient(135deg,#ff6b35,#7c3aed)" },
    poster: `#0a0a12 url("${url}") center / cover no-repeat`,
    panoUrl: url,
    likes: 0,
    comments: 0,
    saves: 0,
  };
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("Feed");
  const [posts, setPosts] = useState<Post[]>(POSTS);
  const [viewing, setViewing] = useState<Post | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  const loadPosts = useCallback(async () => {
    const sb = browserSupabase();
    if (!sb) return;
    const { data } = await sb
      .from("posts")
      .select("id,type,title,location,storage_path,created_at,profiles(handle,avatar_grad)")
      .order("created_at", { ascending: false });
    if (data && data.length) {
      // Real posts first, seed panoramas after so the feed is never empty.
      setPosts([...(data as unknown as DbRow[]).map(dbToPost), ...POSTS]);
    }
  }, []);

  useEffect(() => {
    track("view", { props: { tab } });
  }, [tab]);

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email });
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      loadPosts();
    });
    loadPosts();
    return () => sub.subscription.unsubscribe();
  }, [loadPosts]);

  function publish(post: Post) {
    setPosts((prev) => [post, ...prev]);
    setUploadOpen(false);
    setTab("Feed");
    setViewing(post); // teleport straight into what you just captured
  }

  async function signOut() {
    await browserSupabase()?.auth.signOut();
    setUser(null);
  }

  return (
    <>
      <div className="backdrop" />
      <Nav
        tab={tab}
        onTab={setTab}
        onUpload={() => setUploadOpen(true)}
        user={user}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={signOut}
      />

      <main className="shell">
        {tab === "Feed" && <Feed posts={posts} onOpen={setViewing} />}

        {tab === "Explore" && (
          <>
            <header className="hero">
              <div className="eyebrow">Discover</div>
              <h1>Find your next <span className="gradient-text">horizon.</span></h1>
              <p>Search by place, format, or creator. (Wiring search to the live feed is next.)</p>
            </header>
            <Feed posts={posts} onOpen={setViewing} />
          </>
        )}

        {tab === "Profile" && (
          <header className="hero">
            <div className="eyebrow">Creator</div>
            <h1>{user ? user.email : "Your profile"}</h1>
            <p>
              {user
                ? "Signed in. Captures you publish are saved to your library and persist across refreshes."
                : "Sign in to claim a profile and save your captures."}
            </p>
            {!user && (
              <button className="btn-upload" style={{ marginTop: 18 }} onClick={() => setAuthOpen(true)}>
                Sign in
              </button>
            )}
          </header>
        )}
      </main>

      {viewing && <Immersive post={viewing} onClose={() => setViewing(null)} />}
      {uploadOpen && <Upload user={user} onClose={() => setUploadOpen(false)} onPublish={publish} />}
      {authOpen && <AuthSheet onClose={() => setAuthOpen(false)} />}
    </>
  );
}
