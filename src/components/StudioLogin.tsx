"use client";

import { useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";

// Magic-link sign-in shown on the /studio lock screen, so an invited collaborator
// (e.g. Mick) can log in right here. The link returns to /studio via the auth
// callback's ?next, where the server auto-claims their editor invite.
const NETWORK = "Can't reach the sign-in server. Check your connection and try again.";
const isNet = (m: string) => /load failed|failed to fetch|networkerror|network request failed/i.test(m);

export default function StudioLogin() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send() {
    const sb = browserSupabase();
    if (!sb) { setState("error"); setMsg("Supabase isn't configured."); return; }
    if (!email.trim()) return;
    setState("sending");
    try {
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=/studio` },
      });
      if (error) { setState("error"); setMsg(isNet(error.message) ? NETWORK : error.message); }
      else setState("sent");
    } catch (e) {
      setState("error");
      setMsg(isNet(e instanceof Error ? e.message : "") ? NETWORK : "Something went wrong. Try again.");
    }
  }

  if (state === "sent") {
    return (
      <div className="lock glass">
        <div className="eyebrow">Check your inbox</div>
        <h1>Magic link sent</h1>
        <p>We sent a sign-in link to <b>{email}</b>. Click it and you&apos;ll land back in the Trips CMS.</p>
      </div>
    );
  }

  return (
    <div className="lock glass">
      <div className="eyebrow">Trips CMS</div>
      <h1>Sign in to manage trips</h1>
      <p>Enter your email and we&apos;ll send a one-time magic link — no password.</p>
      <div className="studio-login">
        <input type="email" placeholder="you@example.com" value={email}
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn-fly" disabled={state === "sending" || !email.trim()} onClick={send}>
          {state === "sending" ? "Sending…" : "Send magic link"}
        </button>
      </div>
      {state === "error" && <p className="studio-err">{msg}</p>}
    </div>
  );
}
