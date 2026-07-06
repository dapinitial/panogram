import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// The magic link lands here with a one-time ?code=… (PKCE). We exchange it for a
// session (which sets the auth cookies) and bounce back into the app.
//
// IMPORTANT: behind DO App Platform's proxy the app listens on an internal port,
// so `new URL(request.url).origin` is "http://localhost:8080" — redirecting there
// strands the user. Resolve the public origin from the forwarded headers (or
// NEXT_PUBLIC_SITE_URL), falling back to the raw origin only for plain local dev.
function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // In-app paths only — "//evil.com" would make ${origin}${next} off-site.
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const origin = publicOrigin(request);

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/?auth=error`);
}
