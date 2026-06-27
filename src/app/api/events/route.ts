import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Telemetry ingestion. Writes with the secret-key client (bypasses RLS — events
// is server-write-only). If Supabase isn't configured yet, no-ops gracefully so
// the app runs on mock data without errors.
export async function POST(req: Request) {
  let body: { name?: string; session_id?: string; post_id?: string | null; props?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ ok: false, error: "missing name" }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
