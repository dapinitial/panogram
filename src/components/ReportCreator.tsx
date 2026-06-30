"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import ReportSheet from "./ReportSheet";
import AuthSheet from "./AuthSheet";

// "Report this creator" control for the public /u/[handle] page. Self-contained:
// resolves the current user, opens the shared report sheet (target = profile).
export default function ReportCreator({ targetId, handle }: { targetId: string; handle: string }) {
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    const sb = browserSupabase();
    sb?.auth.getUser().then(({ data }) => { if (data.user) setUser({ id: data.user.id }); });
  }, []);

  // Don't offer "report yourself".
  if (user?.id === targetId) return null;

  return (
    <>
      <button className="report-creator" onClick={() => (user ? setOpen(true) : setAuthOpen(true))}>
        ⚑ Report
      </button>
      {open && (
        <ReportSheet
          user={user}
          target={{ type: "profile", id: targetId, label: `@${handle}` }}
          onClose={() => setOpen(false)}
          onAuthRequired={() => { setOpen(false); setAuthOpen(true); }}
        />
      )}
      {authOpen && <AuthSheet onClose={() => setAuthOpen(false)} />}
    </>
  );
}
