import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Moderation actions for the admin data room. Gated by ADMIN_KEY (the same key
// that unlocks /admin) and executed with the secret-key client so it can soft-
// remove posts / delete reported content and resolve reports regardless of RLS.
//
// Body: { key, reportId, targetType, targetId, action: "remove" | "dismiss", reason? }
export async function POST(req: Request) {
  let body: {
    key?: string; reportId?: string; targetType?: string; targetId?: string;
    action?: "remove" | "dismiss"; reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const gate = process.env.ADMIN_KEY;
  // Destructive — never allow when unguarded. Require ADMIN_KEY to be set + matched.
  if (!gate || body.key !== gate) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const { reportId, targetType, targetId, action } = body;
  if (!reportId || !targetType || !targetId || (action !== "remove" && action !== "dismiss")) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "not connected" }, { status: 503 });
  }

  if (action === "remove") {
    // Take the content down first, then resolve every open report on it.
    if (targetType === "post") {
      const { error } = await admin.from("posts")
        .update({ removed_at: new Date().toISOString(), removed_reason: body.reason ?? "moderation" })
        .eq("id", targetId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    } else if (targetType === "comment") {
      await admin.from("comments").delete().eq("id", targetId);
    } else if (targetType === "annotation") {
      await admin.from("annotations").delete().eq("id", targetId);
    }
    // profile target: no auto-action here — block/removal of a person is a manual
    // call; resolving the report records that it was reviewed.

    await admin.from("reports")
      .update({ status: "actioned", resolved_at: new Date().toISOString() })
      .eq("target_type", targetType).eq("target_id", targetId).eq("status", "open");
    await admin.from("events").insert({ name: "mod_remove", post_id: null, props: { targetType } });
  } else {
    await admin.from("reports")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", reportId);
    await admin.from("events").insert({ name: "mod_dismiss", post_id: null, props: { targetType } });
  }

  return NextResponse.json({ ok: true });
}
