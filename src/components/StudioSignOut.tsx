"use client";

import { browserSupabase } from "@/lib/supabase-browser";

// Escape hatch on the /studio lock screen for a signed-in non-editor. Magic
// links make "I signed in with the wrong address" common; without this they'd
// be stuck with no way to switch accounts from the page that told them so.
export default function StudioSignOut() {
  async function out() {
    await browserSupabase()?.auth.signOut();
    location.href = "/studio";
  }
  return <button className="btn-sec" onClick={out}>Sign out · use a different email</button>;
}
