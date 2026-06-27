import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Two clients, two security roles — same posture as sedulous/shotgundetour, ported
// to Next.js (process.env + NEXT_PUBLIC_ instead of import.meta.env + PUBLIC_).
//
//   getSupabase()      → publishable/anon key. READ FENCE: every query it runs is
//                        subject to Row Level Security. Safe to use anywhere.
//   getSupabaseAdmin() → secret key, BYPASSES RLS. WRITE FENCE for trusted
//                        server-side writes (e.g. telemetry ingestion). SERVER ONLY —
//                        never import into a Client Component, never use it to dodge
//                        a read policy.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function secretKey(): string | undefined {
  // Server-only. NEXT_PUBLIC_* is inlined into the browser bundle, so the secret
  // deliberately has NO such prefix — it only exists in the server process.
  return process.env.SUPABASE_SECRET_KEY;
}

/** True when the public client can be built. Lets pages fall back to mock data. */
export const supabaseConfigured = Boolean(url && publishable);

let _public: SupabaseClient | null = null;
let _admin: SupabaseClient | null = null;

/** Anon/publishable client — subject to RLS (the read fence). */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!_public) _public = createClient(url!, publishable!);
  return _public;
}

/**
 * Server-only admin client (secret key). BYPASSES RLS — the write fence for
 * trusted server operations. NEVER import this into client-side code.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const secret = secretKey();
  if (!url || !secret) return null;
  if (!_admin) _admin = createClient(url, secret, { auth: { persistSession: false } });
  return _admin;
}
