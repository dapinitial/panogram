import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { authConfigured, supabaseServer } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_VIEWS, renderViews, viewPixelToSphere } from "@/lib/reproject";

// AI vision tagging (VISION annotation layer §1) — Claude reads rectilinear
// views rendered out of the sphere and proposes annotations, inserted with
// source='ai' AS THE REQUESTING USER (their RLS, their rows, reportable and
// deletable like any annotation). AI rows are REVIEWABLE, NEVER AUTHORITATIVE:
// safety-critical kinds render unverified until confirmed sightings exist.
//
// Key model — BYOK: the caller sends their own Anthropic API key per request.
// It is used for exactly one upstream call and never stored or logged. The
// server's ANTHROPIC_API_KEY (owner-funded) is a fallback for ADMINS ONLY.
// Claude Max subscriptions cannot back this route (consumer auth only works
// in Anthropic's own surfaces) — the founder path is tagging locally via
// Claude Code instead (see CLAUDE.md).

export const maxDuration = 120; // reprojection + a vision call take a while

const MODEL = "claude-opus-4-8";
const KINDS = new Set(["note", "poi", "nature", "cultural", "route"]);
const POI_TYPES = new Set([
  "camp", "bivy", "water", "trailhead", "cairn", "mine", "wreck", "summit",
  "rappel", "anchor", "crack", "other",
]);

const TAG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tags"],
  properties: {
    tags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["view", "kind", "label", "body", "x", "y", "poi_type", "path"],
        properties: {
          view: { type: "integer", description: "Index of the view the tag was found in" },
          kind: { type: "string", enum: [...KINDS] },
          label: { type: "string", description: "Short marker label (≤6 words)" },
          body: { type: "string", description: "One or two sentences of detail; '' if none" },
          x: { type: "integer", description: "0–1000 horizontal position in the view" },
          y: { type: "integer", description: "0–1000 vertical position in the view" },
          poi_type: { type: "string", enum: [...POI_TYPES, ""], description: "Required when kind='poi', else ''" },
          path: {
            type: "array",
            description: "kind='route' only: the traced line as [x,y] points (0–1000), bottom to top; [] otherwise",
            items: { type: "array", items: { type: "integer" } },
          },
        },
      },
    },
  },
} as const;

const PROMPT = `You are tagging an outdoor panorama for Panogram, a spatial social platform. The images are flat perspective views rendered out of one 360° photo; each is labeled with its index and center yaw.

Tag what you can genuinely identify: trails and trailheads, plants and animals (traditional uses welcome in body), rock/geology features, visible climbing lines (trace as 'route' paths, bottom to top), and points of interest (camps, water sources, cairns, summits...).

Hard rules:
- SAFETY: never present anchors, rappel stations, or cracks as usable. Tag them only if unmistakably visible, framed as observations ("bolted anchor visible"), never endorsements ("rap here"). When unsure, skip.
- CULTURAL: indigenous significance only as an attributed pointer naming the specific nation; never paraphrase sacred stories.
- Coordinates are 0–1000 within the view the feature appears in. Prefer the view where the feature is most central.
- Quality over quantity: 3–10 solid tags beats 20 guesses. Skip anything you can't identify with reasonable confidence.`;

export async function POST(req: Request) {
  let body: { postId?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!body?.postId) {
    return NextResponse.json({ ok: false, error: "missing postId" }, { status: 400 });
  }
  if (!authConfigured) {
    return NextResponse.json({ ok: false, error: "auth not configured" }, { status: 503 });
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "auth required" }, { status: 401 });
  }

  // BYOK first; the server's own key is admin-only (it spends the owner's money).
  let apiKey = body.apiKey?.trim() || null;
  if (!apiKey && process.env.ANTHROPIC_API_KEY) {
    const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", user.id).single();
    if (prof?.is_admin) apiKey = process.env.ANTHROPIC_API_KEY;
  }
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Bring your own Anthropic API key — AI tagging runs on your key, used once and never stored." },
      { status: 402 },
    );
  }

  const { data: post } = await sb.from("posts").select("id,type,title,location,storage_path").eq("id", body.postId).maybeSingle();
  if (!post?.storage_path) {
    return NextResponse.json({ ok: false, error: "post not found or has no stored image" }, { status: 404 });
  }
  if (post.type !== "360_photo" && post.type !== "panoramic_photo") {
    return NextResponse.json({ ok: false, error: "AI tagging supports photos only" }, { status: 400 });
  }

  const imageUrl = sb.storage.from("panoramas").getPublicUrl(post.storage_path).data.publicUrl;
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    return NextResponse.json({ ok: false, error: "could not fetch pano image" }, { status: 502 });
  }
  const equirect = Buffer.from(await imgRes.arrayBuffer());

  try {
    const views = DEFAULT_VIEWS;
    const jpegs = await renderViews(equirect, views);

    const anthropic = new Anthropic({ apiKey });
    const content: Anthropic.ContentBlockParam[] = jpegs.flatMap((data, i) => [
      { type: "text" as const, text: `View ${i}: center yaw ${Math.round((views[i].yaw * 180) / Math.PI)}°, pitch 0°, horizontal FOV 100°.` },
      { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } },
    ]);
    content.push({ type: "text", text: `Pano title: “${post.title}”. Location hint: “${post.location || "unknown"}”.` });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: PROMPT,
      output_config: { format: { type: "json_schema", schema: TAG_SCHEMA } },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ ok: false, error: "the model declined to tag this image" }, { status: 422 });
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
    const { tags } = JSON.parse(text) as { tags: Array<{ view: number; kind: string; label: string; body: string; x: number; y: number; poi_type: string; path: number[][] }> };

    // Validate + convert to sphere coords; insert as the user (RLS-gated).
    const rows = (tags ?? [])
      .filter((t) => KINDS.has(t.kind) && t.label?.trim() && views[t.view])
      .slice(0, 24)
      .map((t) => {
        const view = views[t.view];
        const { yaw, pitch } = viewPixelToSphere(t.x, t.y, view);
        const path = t.kind === "route" && Array.isArray(t.path) && t.path.length > 1
          ? t.path.slice(0, 64).map(([px, py]) => { const p = viewPixelToSphere(px, py, view); return [p.yaw, p.pitch]; })
          : null;
        return {
          post_id: post.id, author_id: user.id, source: "ai",
          yaw, pitch, kind: t.kind, label: t.label.trim().slice(0, 80), body: (t.body ?? "").slice(0, 500),
          poi_type: t.kind === "poi" && POI_TYPES.has(t.poi_type) ? t.poi_type : null,
          path,
        };
      });

    let inserted = 0;
    if (rows.length) {
      const { error, count } = await sb.from("annotations").insert(rows, { count: "exact" });
      if (error) {
        return NextResponse.json({ ok: false, error: `insert failed: ${error.message}` }, { status: 500 });
      }
      inserted = count ?? rows.length;
    }

    // Telemetry (events is server-write-only) — never include the API key.
    getSupabaseAdmin()?.from("events").insert({
      name: "ai_tag_run", post_id: post.id,
      props: { tags: inserted, model: MODEL, byok: !!body.apiKey },
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ ok: false, error: "that API key was rejected — check it and try again" }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ ok: false, error: "rate limited by the API — try again shortly" }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ ok: false, error: `model call failed (${err.status})` }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "tagging failed" }, { status: 500 });
  }
}
