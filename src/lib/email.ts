import "server-only";
import { Resend } from "resend";

// Server-only email via Resend. The API key is a secret — it must never reach the
// browser, so this module is marked `server-only` and reads from process.env
// (no NEXT_PUBLIC_ prefix). Import it from Route Handlers / Server Actions only.
const key = process.env.RESEND_API_KEY;

// Test mode (onboarding@resend.dev) can only deliver to YOUR Resend account email.
// Override RESEND_FROM with a verified-domain sender for real sending.
const FROM = process.env.RESEND_FROM ?? "Panogram <onboarding@resend.dev>";

export const emailConfigured = Boolean(key);

let _resend: Resend | null = null;
function client(): Resend | null {
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };
  const { data, error } = await resend.emails.send({
    from: opts.from ?? FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}
