import { supabaseServer } from "@/lib/supabase-server";
import TripStudio from "@/components/TripStudio";

// The Trips CMS — a white-label content tool for a trusted collaborator to add,
// edit and publish embeddable 3D fly-by routes without touching code. Gated to
// trip editors (is_admin OR profiles.can_manage_trips); everyone else is locked
// out. Distinct from /admin (the full data room) — this is trips only.

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  let allowed = false;
  if (user) {
    const { data } = await sb.from("profiles").select("is_admin,can_manage_trips").eq("id", user.id).single();
    const p = data as { is_admin?: boolean; can_manage_trips?: boolean } | null;
    allowed = !!(p?.is_admin || p?.can_manage_trips);
  }

  if (!allowed) {
    return (
      <main className="studio-locked">
        <div className="lock glass">
          <div className="eyebrow">Trips CMS</div>
          <h1>{user ? "Not a trip editor" : "Sign in required"}</h1>
          <p>{user
            ? "Your account doesn't have trip-management access. Ask an admin to enable it on your profile."
            : "Sign in with an authorized account to manage trips."}</p>
        </div>
      </main>
    );
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return <TripStudio baseUrl={site} userId={user!.id} />;
}
