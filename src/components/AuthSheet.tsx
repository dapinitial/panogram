"use client";

import { useState } from "react";
import Link from "next/link";
import { browserSupabase } from "@/lib/supabase-browser";

// A failed fetch surfaces browser-specific text — "Load failed" (Safari/WebKit),
// "Failed to fetch" (Chrome), "NetworkError" (Firefox) — none of it meaningful to
// a user. Collapse them into one honest message that points at the real cause.
const NETWORK_MSG = "Can't reach the sign-in server. Check your connection and try again.";
function isNetworkError(message: string): boolean {
  return /load failed|failed to fetch|networkerror|network request failed/i.test(message);
}

export default function AuthSheet({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function sendLink() {
    const sb = browserSupabase();
    if (!sb) {
      setState("error");
      setMsg("Supabase isn't configured.");
      return;
    }
    if (!email.trim()) return;
    setState("sending");
    try {
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        setState("error");
        setMsg(isNetworkError(error.message) ? NETWORK_MSG : error.message);
      } else {
        setState("sent");
      }
    } catch (e) {
      // supabase-js can throw (not just return {error}) when fetch fails outright.
      setState("error");
      setMsg(isNetworkError(e instanceof Error ? e.message : "") ? NETWORK_MSG : "Something went wrong. Try again.");
    }
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet glass" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="eyebrow">Account</div>
            <h2>{state === "sent" ? "Check your inbox" : "Sign in to Panogram"}</h2>
          </div>
          <button className="imm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {state === "sent" ? (
          <p style={{ color: "var(--ink-dim)", fontSize: 14, lineHeight: 1.6 }}>
            We sent a magic link to <b style={{ color: "var(--ink)" }}>{email}</b>. Click it to sign
            in — your captures and library will be saved to your account.
          </p>
        ) : (
          <>
            <p style={{ color: "var(--ink-dim)", fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
              No password. Enter your email and we&apos;ll send a one-tap sign-in link.
            </p>
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendLink()}
                autoFocus
              />
            </div>
            {state === "error" && (
              <p style={{ color: "var(--coral)", fontSize: 12.5, marginTop: 10 }}>{msg}</p>
            )}
            <p className="auth-consent">
              By continuing, you agree to Panogram&apos;s{" "}
              <Link href="/terms" onClick={onClose}>Terms</Link> and{" "}
              <Link href="/privacy" onClick={onClose}>Privacy Policy</Link>.
            </p>
            <div className="sheet-foot">
              <span className="sheet-note">We&apos;ll never post without asking.</span>
              <button className="btn-upload" disabled={!email.trim() || state === "sending"} onClick={sendLink}>
                {state === "sending" ? "Sending…" : "Send magic link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
