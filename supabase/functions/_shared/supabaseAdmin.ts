/**
 * A Supabase client authenticated as the service role.
 *
 * This bypasses row-level security entirely, which is exactly why the
 * calendar tables' RLS policies deny the anon/authenticated roles outright
 * (see the calendar_integrations migration): the *only* code path meant to
 * reach those tables is an Edge Function using this client. Never send this
 * client, or the key it's built from, anywhere near the browser.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set for this function.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
