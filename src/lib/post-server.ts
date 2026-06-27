import "server-only";
import { supabaseServer } from "./supabase-server";
import type { Post } from "./types";

const SAMPLE = "https://photo-sphere-viewer-data.netlify.app/assets/sphere-small.jpg";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string; author_id: string; type: Post["type"]; title: string;
  location: string | null; description: string | null; storage_path: string | null;
  profiles: { handle: string; avatar_grad: string | null } | null;
};

/** Public post fetch for the permalink route + its OG metadata. Posts are
 *  public-read, so the anon SSR client suffices. */
export async function getPostById(id: string): Promise<(Post & { description: string; imageUrl: string | null }) | null> {
  if (!UUID.test(id)) return null; // avoid a uuid cast error on bad input
  const sb = await supabaseServer();
  const { data } = await sb
    .from("posts")
    .select("id,author_id,type,title,location,description,storage_path,profiles(handle,avatar_grad)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Row;
  const imageUrl = r.storage_path ? sb.storage.from("panoramas").getPublicUrl(r.storage_path).data.publicUrl : null;
  const pano = imageUrl ?? SAMPLE;
  const handle = r.profiles?.handle ?? "creator";
  return {
    id: r.id, authorId: r.author_id, type: r.type, title: r.title, location: r.location ?? "",
    description: r.description ?? "",
    author: { handle, initials: handle[0]?.toUpperCase() ?? "C", grad: r.profiles?.avatar_grad ?? "linear-gradient(135deg,#ff6b35,#7c3aed)" },
    poster: `#0a0a12 url("${pano}") center / cover no-repeat`,
    panoUrl: pano,
    imageUrl,
    likes: 0, comments: 0, saves: 0,
  };
}
