import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendEmail, emailConfigured } from "@/lib/email";

// File a moderation report server-side: insert it AS the signed-in user (RLS
// gates reporter_id = auth.uid()), then fire a best-effort alert email to the
// moderation inbox so reports aren't only discovered by opening /admin.
//
// Body: { targetType, targetId, postId?, reason, details? }
const REASONS = new Set(["spam", "harassment", "hate", "nudity", "violence", "illegal", "other"]);
const TARGETS = new Set(["post", "comment", "annotation", "profile"]);
const ALERT_TO = process.env.REPORT_ALERT_TO ?? "me@davidpuerto.com";

export async function POST(req: Request) {
  let body: { targetType?: string; targetId?: string; postId?: string | null; reason?: string; details?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const { targetType, targetId, reason } = body;
  if (!targetType || !TARGETS.has(targetType) || !targetId || !reason || !REASONS.has(reason)) {
    return NextResponse.json({ ok: false, error: "invalid report" }, { status: 400 });
  }
  const details = (body.details ?? "").slice(0, 1000);

  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: "sign in to report" }, { status: 401 });
  }

  const { error } = await sb.from("reports").insert({
    reporter_id: auth.user.id, target_type: targetType, target_id: targetId,
    post_id: body.postId ?? null, reason, details,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Best-effort alert — never block the user's report on email delivery.
  if (emailConfigured) {
    const safe = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
    sendEmail({
      to: ALERT_TO,
      subject: `🚩 New ${reason} report on Panogram`,
      html: `<h2 style="font-family:sans-serif">New moderation report</h2>
        <p style="font-family:sans-serif;line-height:1.6">
          <b>Reason:</b> ${safe(reason)}<br/>
          <b>Target:</b> ${safe(targetType)} <code>${safe(targetId).slice(0, 8)}</code><br/>
          ${details ? `<b>Details:</b> ${safe(details)}<br/>` : ""}
          <b>Reporter:</b> <code>${auth.user.id.slice(0, 8)}</code>
        </p>
        <p style="font-family:sans-serif"><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin">Open the moderation queue →</a></p>`,
    }).catch(() => { /* swallow — alerting is non-critical */ });
  }

  return NextResponse.json({ ok: true });
}
