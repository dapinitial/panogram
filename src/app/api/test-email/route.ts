import { NextResponse } from "next/server";
import { sendEmail, emailConfigured } from "@/lib/email";

// Dev-only smoke test for the Resend integration. Visit:
//   /api/test-email            → sends to the default test recipient
//   /api/test-email?to=you@x   → sends to a specific address
// Disabled in production so it can't be abused as an open mailer.
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "disabled in production" }, { status: 404 });
  }
  if (!emailConfigured) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set in .env.local" }, { status: 400 });
  }

  const to = new URL(req.url).searchParams.get("to") ?? "dpuerto@gmail.com";
  const result = await sendEmail({
    to,
    subject: "Hello from Panogram",
    html: `<div style="font-family:system-ui;padding:24px">
      <h2 style="margin:0 0 8px">Congrats — your first email sent. 🎉</h2>
      <p style="color:#555;margin:0">Resend is wired into Panogram. Magic-link auth is next.</p>
    </div>`,
  });

  return NextResponse.json({ to, ...result }, { status: result.ok ? 200 : 500 });
}
