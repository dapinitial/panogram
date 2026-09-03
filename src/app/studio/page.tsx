import { supabaseServer } from "@/lib/supabase-server";
import TripStudio from "@/components/TripStudio";
import StudioLogin from "@/components/StudioLogin";

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
    // Promote them if their email was invited before they signed up.
    await sb.rpc("claim_trip_editor_invites");
    const { data } = await sb.from("profiles").select("is_admin,can_manage_trips").eq("id", user.id).single();
    const p = data as { is_admin?: boolean; can_manage_trips?: boolean } | null;
    allowed = !!(p?.is_admin || p?.can_manage_trips);
  }

  if (!allowed) {
    return (
      <main className="studio-locked">
        {user ? (
          <div className="lock glass">
            <div className="eyebrow">Trips CMS</div>
            <h1>Not a trip editor yet</h1>
            <p>The account <b>{user.email}</b> doesn&apos;t have trip access. Ask an editor to invite this email, then reload — you&apos;ll be let in automatically.</p>
          </div>
        ) : (
          <StudioLogin />
        )}
      </main>
    );
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return <TripStudio baseUrl={site} userId={user!.id} />;
}
