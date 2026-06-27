import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// The magic link lands here with a one-time ?code=… (PKCE). We exchange it for a
// session (which sets the auth cookies) and bounce back into the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/?auth=error`);
}
