import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase auth session fresh on navigation by rotating the cookies.
// Required for SSR + the magic-link flow to stay signed in. No-ops if Supabase
// isn't configured. (Next 16 "proxy" convention — formerly "middleware".)
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Touch the session so expired tokens refresh into the response cookies.
  await supabase.auth.getUser();

  // The /embed pages are meant to be iframed on external sites (kafadventures.com
  // etc.), so allow cross-origin framing there — and only there. Everything else
  // stays same-origin-only (no X-Frame-Options set = browser default).
  if (request.nextUrl.pathname.startsWith("/embed")) {
    response.headers.set("Content-Security-Policy", "frame-ancestors *");
    response.headers.delete("X-Frame-Options");
  }
  return response;
}

export const config = {
  // Run on everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)"],
};
