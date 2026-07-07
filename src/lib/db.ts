// Centralized live-DB access (browser, RLS-enforced). Keep all Supabase queries
// here so components stay declarative. Counts are tallied client-side — fine at
// prototype scale; swap for a SQL view if data grows large.
import { browserSupabase } from "./supabase-browser";
import type { Annotation, Author, Comment, Post, Sighting, Track } from "./types";

const SAMPLE = "https://photo-sphere-viewer-data.netlify.app/assets/sphere-small.jpg";

type ProfileEmbed = { handle: string; avatar_grad: string | null } | null;

function authorOf(p: ProfileEmbed): Author {
  const handle = p?.handle ?? "creator";
  return { handle, initials: handle[0]?.toUpperCase() ?? "C", grad: p?.avatar_grad ?? "linear-gradient(135deg,#ff6b35,#7c3aed)" };
}

type PostRow = {
  id: string; author_id: string; type: Post["type"]; title: string;
  location: string | null; storage_path: string | null; profiles: ProfileEmbed;
  capture_lat: number | null; capture_lng: number | null; capture_heading: number | null;
};

function rowToPost(r: PostRow, url: string | null, counts: { likes: number; comments: number; annos: number }): Post {
  const pano = url ?? SAMPLE;
  return {
    id: r.id, authorId: r.author_id, type: r.type, title: r.title, location: r.location ?? "",
    author: authorOf(r.profiles),
    poster: `#0a0a12 url("${pano}") center / cover no-repeat`,
    panoUrl: pano,
    likes: counts.likes, comments: counts.comments, saves: 0, annotationCount: counts.annos,
    captureLat: r.capture_lat ?? undefined, captureLng: r.capture_lng ?? undefined,
    captureHeading: r.capture_heading ?? undefined,
  };
}

function tally(rows: { post_id: string }[] | null): Map<string, number> {
  const m = new Map<string, number>();
  (rows ?? []).forEach((r) => m.set(r.post_id, (m.get(r.post_id) ?? 0) + 1));
  return m;
}

/** Load the live feed (newest first) with engagement counts. Removed posts are
 *  hidden by RLS; `blocked` authors are filtered out client-side. */
export async function loadFeed(blocked?: Set<string>): Promise<Post[]> {
  const sb = browserSupabase();
  if (!sb) return [];
  const [posts, likes, comments, annos] = await Promise.all([
    sb.from("posts").select("id,author_id,type,title,location,storage_path,capture_lat,capture_lng,capture_heading,profiles(handle,avatar_grad)").order("created_at", { ascending: false }),
    sb.from("likes").select("post_id"),
    sb.from("comments").select("post_id"),
    sb.from("annotations").select("post_id"),
  ]);
  const lc = tally(likes.data as { post_id: string }[]);
  const cc = tally(comments.data as { post_id: string }[]);
  const ac = tally(annos.data as { post_id: string }[]);
  let rows = (posts.data as unknown as PostRow[]) ?? [];
  if (blocked?.size) rows = rows.filter((r) => !blocked.has(r.author_id));
  return rows.map((r) => {
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

export async function loadComments(postId: string, blocked?: Set<string>): Promise<Comment[]> {
  const sb = browserSupabase(); if (!sb) return [];
  const { data } = await sb.from("comments").select("id,user_id,body,created_at,profiles(handle,avatar_grad)").eq("post_id", postId).order("created_at", { ascending: true });
  let rows = (data as unknown as { id: string; user_id: string; body: string; created_at: string; profiles: ProfileEmbed }[]) ?? [];
  if (blocked?.size) rows = rows.filter((r) => !blocked.has(r.user_id));
  return rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, author: authorOf(r.profiles) }));
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
  const { data } = await sb.from("annotations")
    .select("id,yaw,pitch,label,kind,target_url,target_post_id,campaign_id,source,path,poi_type,is_safety_critical,sightings(verdict)")
    .eq("post_id", postId);
  type Row = {
    id: string; yaw: number; pitch: number; label: string; kind: Annotation["kind"];
    target_url: string | null; target_post_id: string | null; campaign_id: string | null;
    source: Annotation["source"]; path: [number, number][] | null;
    poi_type: Annotation["poiType"] | null; is_safety_critical: boolean | null;
    sightings: { verdict: string }[] | null;
  };
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: r.id, yaw: r.yaw, pitch: r.pitch, label: r.label, kind: r.kind,
    targetUrl: r.target_url ?? undefined, targetPostId: r.target_post_id ?? undefined, campaignId: r.campaign_id ?? undefined,
    source: r.source ?? "human", path: r.path ?? undefined, poiType: r.poi_type ?? undefined,
    safetyCritical: r.is_safety_critical ?? false,
    confirmedSightings: (r.sightings ?? []).filter((s) => s.verdict === "confirmed").length,
  }));
}

/** Geocache loop: log that the user found a hidden cache annotation. */
export async function addFind(annotationId: string, userId: string): Promise<boolean> {
  const sb = browserSupabase(); if (!sb) return false;
  const { error } = await sb.from("finds").insert({ annotation_id: annotationId, user_id: userId });
  return !error;
}

export async function addAnnotation(postId: string, userId: string, a: Annotation): Promise<boolean> {
  const sb = browserSupabase(); if (!sb) return false;
  const { error } = await sb.from("annotations").insert({
    post_id: postId, author_id: userId, yaw: a.yaw, pitch: a.pitch, label: a.label, kind: a.kind,
    target_url: a.targetUrl ?? null, target_post_id: a.targetPostId ?? null,
    path: a.path ?? null, poi_type: a.poiType ?? null, // source defaults to 'human'
    world_bearing: a.worldBearing ?? null,
  });
  return !error;
}

// ── Sightings ── the crowdsource loop: native comment + trust + triangulation ─

export async function loadSightings(annotationId: string, blocked?: Set<string>): Promise<Sighting[]> {
  const sb = browserSupabase(); if (!sb) return [];
  const { data } = await sb.from("sightings")
    .select("id,annotation_id,user_id,verdict,note,created_at,profiles(handle,avatar_grad)")
    .eq("annotation_id", annotationId).order("created_at", { ascending: true });
  let rows = (data as unknown as { id: string; annotation_id: string; user_id: string; verdict: Sighting["verdict"]; note: string; created_at: string; profiles: ProfileEmbed }[]) ?? [];
  if (blocked?.size) rows = rows.filter((r) => !blocked.has(r.user_id));
  return rows.map((r) => ({ id: r.id, annotationId: r.annotation_id, verdict: r.verdict, note: r.note, createdAt: r.created_at, author: authorOf(r.profiles) }));
}

/** Upsert: one living verdict per (annotation, user) — re-sighting updates it. */
export async function addSighting(
  annotationId: string, userId: string, verdict: Sighting["verdict"],
  opts: { note?: string; lat?: number; lng?: number } = {},
): Promise<boolean> {
  const sb = browserSupabase(); if (!sb) return false;
  const { error } = await sb.from("sightings").upsert(
    { annotation_id: annotationId, user_id: userId, verdict, note: opts.note ?? "", sighted_lat: opts.lat ?? null, sighted_lng: opts.lng ?? null },
    { onConflict: "annotation_id,user_id" },
  );
  return !error;
}

// ── Tracks ── recorded GPX lines attached to captures ───────────────────────
// (Graceful pre-migration: selects error server-side and return [] / false.)

// points jsonb holds segments: [[[lat,lng,ele|null],…],…]
type TrackRow = { id: string; post_id: string; label: string; points: [number, number, number | null][][]; distance_m: number; gain_m: number };
const rowToTrack = (r: TrackRow): Track => ({ id: r.id, postId: r.post_id, label: r.label, segments: r.points, distanceM: r.distance_m, gainM: r.gain_m });

export async function loadTracks(postId: string): Promise<Track[]> {
  const sb = browserSupabase(); if (!sb) return [];
  const { data } = await sb.from("tracks").select("id,post_id,label,points,distance_m,gain_m").eq("post_id", postId);
  return ((data as TrackRow[]) ?? []).map(rowToTrack);
}

/** All tracks for a set of posts — the Atlas overlay pulls these in one query. */
export async function loadTracksForPosts(postIds: string[]): Promise<Track[]> {
  const sb = browserSupabase(); if (!sb || !postIds.length) return [];
  const { data } = await sb.from("tracks").select("id,post_id,label,points,distance_m,gain_m").in("post_id", postIds);
  return ((data as TrackRow[]) ?? []).map(rowToTrack);
}

export async function addTrack(
  postId: string, userId: string,
  t: { label: string; segments: [number, number, number | null][][]; distanceM: number; gainM: number },
): Promise<boolean> {
  const sb = browserSupabase(); if (!sb) return false;
  const { error } = await sb.from("tracks").insert({
    post_id: postId, author_id: userId, label: t.label.slice(0, 120),
    points: t.segments, distance_m: t.distanceM, gain_m: t.gainM,
  });
  return !error;
}

// ── Trust & safety ──────────────────────────────────────────────────────────

/** Who the current user has blocked (their content is filtered out everywhere). */
export async function loadMyBlocks(userId: string): Promise<Set<string>> {
  const sb = browserSupabase();
  if (!sb) return new Set();
  const { data } = await sb.from("blocks").select("blocked_id").eq("blocker_id", userId);
  return new Set(((data as { blocked_id: string }[]) ?? []).map((r) => r.blocked_id));
}

/** The profiles the current user has blocked — for the management screen. */
export async function loadMyBlockedProfiles(userId: string): Promise<{ id: string; handle: string; grad: string }[]> {
  const sb = browserSupabase();
  if (!sb) return [];
  const { data: rows } = await sb.from("blocks").select("blocked_id").eq("blocker_id", userId);
  const ids = ((rows as { blocked_id: string }[]) ?? []).map((r) => r.blocked_id);
  if (!ids.length) return [];
  const { data: profs } = await sb.from("profiles").select("id,handle,avatar_grad").in("id", ids);
  return ((profs as { id: string; handle: string; avatar_grad: string | null }[]) ?? [])
    .map((p) => ({ id: p.id, handle: p.handle, grad: p.avatar_grad ?? DEFAULT_GRAD }));
}

export async function blockUser(blockerId: string, blockedId: string): Promise<boolean> {
  const sb = browserSupabase(); if (!sb) return false;
  const { error } = await sb.from("blocks").insert({ blocker_id: blockerId, blocked_id: blockedId });
  return !error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
  const sb = browserSupabase(); if (!sb) return false;
  const { error } = await sb.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
  return !error;
}

export type ReportReason = "spam" | "harassment" | "hate" | "nudity" | "violence" | "illegal" | "other";
export type ReportTarget = "post" | "comment" | "annotation" | "profile";

/** File a moderation report via the server route (inserts as the signed-in user
 *  under RLS, then fires a best-effort alert email). `postId` gives moderator
 *  context. `reporterId` is kept for the caller's convenience but the server
 *  derives the real reporter from the session — it is not trusted from the client. */
export async function fileReport(args: {
  reporterId: string; targetType: ReportTarget; targetId: string;
  postId?: string | null; reason: ReportReason; details?: string;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType: args.targetType, targetId: args.targetId,
        postId: args.postId ?? null, reason: args.reason, details: (args.details ?? "").slice(0, 1000),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const DEFAULT_GRAD = "linear-gradient(135deg,#ff6b35,#7c3aed)";

export interface Notification {
  id: string;
  kind: "like" | "comment" | "follow";
  actorHandle: string;
  actorGrad: string;
  postId?: string;
  postTitle?: string;
  body?: string;
  createdAt: string;
}

type ActorRow = { created_at: string; profiles: ProfileEmbed };

/** Activity on the user's own content — derived live from likes/comments/follows
 *  (no notifications table). Newest first. */
export async function loadNotifications(userId: string): Promise<Notification[]> {
  const sb = browserSupabase();
  if (!sb) return [];
  const { data: myPosts } = await sb.from("posts").select("id,title").eq("author_id", userId);
  const ids = ((myPosts as { id: string; title: string }[]) ?? []).map((p) => p.id);
  const titleOf = new Map(((myPosts as { id: string; title: string }[]) ?? []).map((p) => [p.id, p.title]));

  const [likes, comments, follows] = await Promise.all([
    ids.length ? sb.from("likes").select("post_id,created_at,user_id,profiles(handle,avatar_grad)").in("post_id", ids).neq("user_id", userId).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    ids.length ? sb.from("comments").select("id,post_id,body,created_at,user_id,profiles(handle,avatar_grad)").in("post_id", ids).neq("user_id", userId).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    sb.from("follows").select("follower_id,created_at").eq("following_id", userId).order("created_at", { ascending: false }).limit(30),
  ]);

  // follower profiles (two FKs to profiles → resolve handles in one extra query)
  const followerIds = ((follows.data as { follower_id: string }[]) ?? []).map((f) => f.follower_id);
  const profMap = new Map<string, { handle: string; avatar_grad: string | null }>();
  if (followerIds.length) {
    const { data: profs } = await sb.from("profiles").select("id,handle,avatar_grad").in("id", followerIds);
    ((profs as { id: string; handle: string; avatar_grad: string | null }[]) ?? []).forEach((p) => profMap.set(p.id, p));
  }

  const items: Notification[] = [];
  ((likes.data as unknown as (ActorRow & { post_id: string })[]) ?? []).forEach((l) =>
    items.push({ id: `l-${l.post_id}-${l.created_at}`, kind: "like", actorHandle: l.profiles?.handle ?? "someone", actorGrad: l.profiles?.avatar_grad ?? DEFAULT_GRAD, postId: l.post_id, postTitle: titleOf.get(l.post_id), createdAt: l.created_at }));
  ((comments.data as unknown as (ActorRow & { id: string; post_id: string; body: string })[]) ?? []).forEach((c) =>
    items.push({ id: `c-${c.id}`, kind: "comment", actorHandle: c.profiles?.handle ?? "someone", actorGrad: c.profiles?.avatar_grad ?? DEFAULT_GRAD, postId: c.post_id, postTitle: titleOf.get(c.post_id), body: c.body, createdAt: c.created_at }));
  ((follows.data as { follower_id: string; created_at: string }[]) ?? []).forEach((f) => {
    const p = profMap.get(f.follower_id);
    items.push({ id: `f-${f.follower_id}-${f.created_at}`, kind: "follow", actorHandle: p?.handle ?? "someone", actorGrad: p?.avatar_grad ?? DEFAULT_GRAD, createdAt: f.created_at });
  });

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40);
}
