import { authConfigured, supabaseServer } from "@/lib/supabase-server";

// Is the current request from a signed-in profile with is_admin? Read through the user's own
// session (RLS lets a profile read itself), so a forged cookie gets nothing. This is the admin
// path that leaves no key in browser history; ADMIN_KEY in the address stays as the fallback.
export async function isSignedInAdmin(): Promise<boolean> {
  if (!authConfigured) return false;
  try {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    return prof?.is_admin === true;
  } catch {
    return false;
  }
}
