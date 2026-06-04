import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client for the automation engine and cron jobs. Bypasses RLS, so it must
// ONLY ever be used in server-side code (route handlers, server actions, cron). Never
// import this from a client component — the key would leak.
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Automation requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
