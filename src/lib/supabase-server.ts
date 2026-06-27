import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Per-request Supabase client backed by the request's cookies, so Server
// Components, Route Handlers and middleware run queries AS the signed-in user —
// RLS sees their JWT. Uses the publishable key, so it is a read fence: a user
// sees only the rows their policies allow. The security lives in the policies
// (supabase/migrations), not here.
//
// Next 16: cookies() is async, so this helper is async too.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const authConfigured = Boolean(url && key);

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(url!, key!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // .set() throws when called from a Server Component (read-only cookies).
          // Safe to ignore — middleware refreshes the session in that case.
        }
      },
    },
  });
}
