import { NextResponse } from "next/server";
import { authConfigured, supabaseServer } from "@/lib/supabase-server";

// AI vision tagging (VISION.md annotation layer §1) — STUB.
//
// The pipeline this route will run, per the doc:
//   1. Load the post's equirectangular image from Storage.
//   2. Render 4–6 rectilinear views out of the sphere (NEVER feed raw
//      equirectangular — pole distortion confuses vision models), keeping each
//      view's yaw/pitch/fov.
//   3. Send the views to Claude vision → tags with pixel coords per view
//      (trails, flora/fauna, route lines, POIs; cultural pointers attributed,
//      never paraphrased).
//   4. Convert pixel coords back to sphere yaw/pitch (+ polyline paths for
//      traced lines); match candidate route lines against OpenBeta by the
//      post's capture GPS — vision traces, the database names.
//   5. Insert rows with source='ai' via the admin client. AI rows are
//      REVIEWABLE, NEVER AUTHORITATIVE: safety-critical kinds render
//      unverified until confirmed sightings exist (§6). Emit `ai_tag_run`.
//
// Requires ANTHROPIC_API_KEY (server-only, .env.local) before implementation.
export async function POST(req: Request) {
  let body: { postId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!body?.postId) {
    return NextResponse.json({ ok: false, error: "missing postId" }, { status: 400 });
  }

  // Authed users only — tagging costs inference money.
  if (!authConfigured) {
    return NextResponse.json({ ok: false, error: "auth not configured" }, { status: 503 });
  }
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "auth required" }, { status: 401 });
  }

  return NextResponse.json(
    { ok: false, error: "not implemented — see pipeline plan in this route" },
    { status: 501 },
  );
}
