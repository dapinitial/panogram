"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser client with cookie-backed sessions, so the server (middleware, Server
// Components, the auth callback) sees the same auth state. Returns null when
// Supabase isn't configured, so the app still runs on mock data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let _client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!_client) _client = createBrowserClient(url, key);
  return _client;
}
