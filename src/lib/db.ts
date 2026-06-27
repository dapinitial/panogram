// Centralized live-DB access (browser, RLS-enforced). Keep all Supabase queries
// here so components stay declarative. Counts are tallied client-side — fine at
// prototype scale; swap for a SQL view if data grows large.
import { browserSupabase } from "./supabase-browser";
import type { Annotation, Author, Comment, Post } from "./types";

const SAMPLE = "https://photo-sphere-viewer-data.netlify.app/assets/sphere-small.jpg";

type ProfileEmbed = { handle: string; avatar_grad: string | null } | null;

function authorOf(p: ProfileEmbed): Author {
  const handle = p?.handle ?? "creator";
  return { handle, initials: handle[0]?.toUpperCase() ?? "C", grad: p?.avatar_grad ?? "linear-gradient(135deg,#ff6b35,#7c3aed)" };
}

type PostRow = {
  id: string; author_id: string; type: Post["type"]; title: string;
  location: string | null; storage_path: string | null; profiles: ProfileEmbed;
};

function rowToPost(r: PostRow, url: string | null, counts: { likes: number; comments: number; annos: number }): Post {
  const pano = url ?? SAMPLE;
  return {
    id: r.id, authorId: r.author_id, type: r.type, title: r.title, location: r.location ?? "",
    author: authorOf(r.profiles),
    poster: `#0a0a12 url("${pano}") center / cover no-repeat`,
    panoUrl: pano,
    likes: counts.likes, comments: counts.comments, saves: 0, annotationCount: counts.annos,
  };
}

function tally(rows: { post_id: string }[] | null): Map<string, number> {
  const m = new Map<string, number>();
  (rows ?? []).forEach((r) => m.set(r.post_id, (m.get(r.post_id) ?? 0) + 1));
  return m;
}

/** Load the live feed (newest first) with engagement counts. */
export async function loadFeed(): Promise<Post[]> {
  const sb = browserSupabase();
  if (!sb) return [];
  const [posts, likes, comments, annos] = await Promise.all([
    sb.from("posts").select("id,author_id,type,title,location,storage_path,profiles(handle,avatar_grad)").order("created_at", { ascending: false }),
    sb.from("likes").select("post_id"),
    sb.from("comments").select("post_id"),
    sb.from("annotations").select("post_id"),
  ]);
  const lc = tally(likes.data as { post_id: string }[]);
  const cc = tally(comments.data as { post_id: string }[]);
  const ac = tally(annos.data as { post_id: string }[]);
  return ((posts.data as unknown as PostRow[]) ?? []).map((r) => {
    const url = r.storage_path ? sb.storage.from("panoramas").getPublicUrl(r.storage_path).data.publicUrl : null;
    return rowToPost(r, url, { likes: lc.get(r.id) ?? 0, comments: cc.get(r.id) ?? 0, annos: ac.get(r.id) ?? 0 });
  });
}

/** What the current user has liked / saved / who they follow — to seed UI state. */
export async function loadMyEngagement(userId: string): Promise<{ liked: Set<string>; saved: Set<string>; following: Set<string> }> {
  const sb = browserSupabase();
  if (!sb) return { liked: new Set(), saved: new Set(), following: new Set() };
  const [likes, saves, follows] = await Promise.all([
    sb.from("likes").select("post_id").eq("user_id", userId),
    sb.from("saves").select("post_id").eq("user_id", userId),
    sb.from("follows").select("following_id").eq("follower_id", userId),
  ]);
  return {
    liked: new Set((likes.data ?? []).map((r: { post_id: string }) => r.post_id)),
    saved: new Set((saves.data ?? []).map((r: { post_id: string }) => r.post_id)),
    following: new Set((follows.data ?? []).map((r: { following_id: string }) => r.following_id)),
  };
}

export async function toggleLike(postId: string, userId: string, on: boolean) {
  const sb = browserSupabase(); if (!sb) return;
  if (on) await sb.from("likes").insert({ post_id: postId, user_id: userId });
  else await sb.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
}

export async function toggleSave(postId: string, userId: string, on: boolean) {
  const sb = browserSupabase(); if (!sb) return;
  if (on) await sb.from("saves").insert({ post_id: postId, user_id: userId });
  else await sb.from("saves").delete().eq("post_id", postId).eq("user_id", userId);
}

export async function toggleFollow(targetId: string, userId: string, on: boolean) {
  const sb = browserSupabase(); if (!sb) return;
  if (on) await sb.from("follows").insert({ follower_id: userId, following_id: targetId });
  else await sb.from("follows").delete().eq("follower_id", userId).eq("following_id", targetId);
}

export async function followerCount(targetId: string): Promise<number> {
  const sb = browserSupabase(); if (!sb) return 0;
  const { count } = await sb.from("follows").select("*", { count: "exact", head: true }).eq("following_id", targetId);
  return count ?? 0;
}

export async function loadComments(postId: string): Promise<Comment[]> {
  const sb = browserSupabase(); if (!sb) return [];
  const { data } = await sb.from("comments").select("id,body,created_at,profiles(handle,avatar_grad)").eq("post_id", postId).order("created_at", { ascending: true });
  return ((data as unknown as { id: string; body: string; created_at: string; profiles: ProfileEmbed }[]) ?? []).map((r) => ({
    id: r.id, body: r.body, createdAt: r.created_at, author: authorOf(r.profiles),
  }));
}

export async function addComment(postId: string, userId: string, body: string): Promise<Comment | null> {
  const sb = browserSupabase(); if (!sb) return null;
  const { data, error } = await sb.from("comments").insert({ post_id: postId, user_id: userId, body }).select("id,body,created_at,profiles(handle,avatar_grad)").single();
  if (error || !data) return null;
  const r = data as unknown as { id: string; body: string; created_at: string; profiles: ProfileEmbed };
  return { id: r.id, body: r.body, createdAt: r.created_at, author: authorOf(r.profiles) };
}

export async function loadAnnotations(postId: string): Promise<Annotation[]> {
  const sb = browserSupabase(); if (!sb) return [];
  const { data } = await sb.from("annotations").select("yaw,pitch,label,kind").eq("post_id", postId);
  return (data as Annotation[]) ?? [];
}

export async function addAnnotation(postId: string, userId: string, a: Annotation): Promise<boolean> {
  const sb = browserSupabase(); if (!sb) return false;
  const { error } = await sb.from("annotations").insert({
    post_id: postId, author_id: userId, yaw: a.yaw, pitch: a.pitch, label: a.label, kind: a.kind,
  });
  return !error;
}
