import "server-only";
import { supabaseServer } from "./supabase-server";
import type { MediaType } from "./types";

const SAMPLE = "https://photo-sphere-viewer-data.netlify.app/assets/sphere-small.jpg";

export interface ProfileCard { id: string; type: MediaType; title: string; location: string; poster: string }
export interface CreatorProfile {
  id: string; handle: string; displayName: string; bio: string; grad: string;
  followerCount: number; posts: ProfileCard[];
}

/** Public creator page data: profile + their posts + follower count. */
export async function getProfileByHandle(handle: string): Promise<CreatorProfile | null> {
  const sb = await supabaseServer();
  const { data: prof } = await sb
    .from("profiles")
    .select("id,handle,display_name,bio,avatar_grad")
    .eq("handle", handle)
    .maybeSingle();
  if (!prof) return null;

  const [{ data: posts }, { count }] = await Promise.all([
    sb.from("posts").select("id,type,title,location,storage_path").eq("author_id", prof.id).order("created_at", { ascending: false }),
    sb.from("follows").select("*", { count: "exact", head: true }).eq("following_id", prof.id),
  ]);

  const cards: ProfileCard[] = ((posts as { id: string; type: MediaType; title: string; location: string | null; storage_path: string | null }[]) ?? []).map((p) => {
    const url = p.storage_path ? sb.storage.from("panoramas").getPublicUrl(p.storage_path).data.publicUrl : SAMPLE;
    return { id: p.id, type: p.type, title: p.title, location: p.location ?? "", poster: `#0a0a12 url("${url}") center / cover no-repeat` };
  });

  return {
    id: prof.id, handle: prof.handle, displayName: prof.display_name || prof.handle, bio: prof.bio || "",
    grad: prof.avatar_grad || "linear-gradient(135deg,#ff6b35,#7c3aed)",
    followerCount: count ?? 0, posts: cards,
  };
}
