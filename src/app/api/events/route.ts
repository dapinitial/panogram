import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { clientIp, limited } from "@/lib/ratelimit";

// Telemetry ingestion. Writes with the secret-key client (bypasses RLS — events
// is server-write-only). If Supabase isn't configured yet, no-ops gracefully so
// the app runs on mock data without errors.
// Anyone can post here, so: a per-visitor budget well above a real session's event
// rate, a 4 KB body, and bounded fields, or a script could fill the table.
export async function POST(req: Request) {
  if (limited("events:" + clientIp(req), 300, 60_000)) return new NextResponse(null, { status: 429 });
  const text = await req.text();
  if (text.length > 4096) return NextResponse.json({ ok: false, error: "too large" }, { status: 413 });
  let body: { name?: string; session_id?: string; post_id?: string | null; props?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  if (!body?.name || typeof body.name !== "string" || body.name.length > 64) {
    return NextResponse.json({ ok: false, error: "missing name" }, { status: 400 });
  }
  if (body.session_id != null && (typeof body.session_id !== "string" || body.session_id.length > 64)) {
    return NextResponse.json({ ok: false, error: "bad session" }, { status: 400 });
  }
  if (body.post_id != null && (typeof body.post_id !== "string" || body.post_id.length > 64)) {
    return NextResponse.json({ ok: false, error: "bad post" }, { status: 400 });
  }
  if (body.props != null && (typeof body.props !== "object" || Array.isArray(body.props))) {
    return NextResponse.json({ ok: false, error: "bad props" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    // Not configured — accept and drop, so the UI never errors pre-setup.
    return new NextResponse(null, { status: 204 });
  }

  const { error } = await admin.from("events").insert({
    name: body.name,
    session_id: body.session_id ?? null,
    post_id: body.post_id ?? null,
    props: (body.props as Record<string, unknown>) ?? {},
  });

  if (error) {
    console.error("events insert:", error.message);
    return NextResponse.json({ ok: false, error: "insert failed" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
