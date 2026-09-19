/**
 * Remove one linked calendar account.
 *
 * Deleting the calendar_connections row cascades to its calendar_sources,
 * calendar_secrets and calendar_busy_cache rows (see the calendar_integrations
 * migration), so the tokens and every synced busy block go with it.
 *
 * This does NOT revoke the app's access at Google or Microsoft: the user can
 * still see Autodate in their account's connected-apps settings and remove it
 * there. The profile page says so.
 *
 * Called via fetch() from the SPA with the signed-in person's token; only a
 * connection they own can be removed.
 */
import { callerId } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  const db = supabaseAdmin();
  const profileId = await callerId(req, db);
  if (!profileId) return json({ error: "Please sign in again." }, 401);

  let payload: { connectionId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const { connectionId } = payload;
  if (typeof connectionId !== "string") {
    return json({ error: "connectionId is required" }, 400);
  }

  // Filtering on profile_id as well means a connection can only be removed by
  // the person who owns it; a mismatch just deletes nothing.
  const { data, error } = await db
    .from("calendar_connections")
    .delete()
    .eq("id", connectionId)
    .eq("profile_id", profileId)
    .select("id");
  if (error) {
    console.error("calendar-disconnect delete failed", error);
    return json({ error: "Delete failed" }, 500);
  }
  if (!data || data.length === 0) {
    return json({ error: "Connection not found" }, 404);
  }
  return json({ removed: data[0].id });
});
