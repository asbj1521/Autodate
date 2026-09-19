/**
 * Read-only status of a profile's linked calendars.
 *
 * The profile page calls this on every load (not just right after an OAuth
 * redirect) so "connected" is a real, persistent fact backed by the
 * database, not something that only shows up once in a banner and vanishes
 * on refresh. RLS denies the anon/publishable key direct access to these
 * tables (see the calendar_integrations migration), so this function, using
 * the service role key, is the only sanctioned read path, and it only ever
 * returns non-secret fields (never touches calendar_secrets).
 *
 * Called via fetch() from the SPA, unlike the OAuth functions, so this one
 * needs CORS handling.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const profileId = url.searchParams.get("profileId");
  if (!profileId) {
    return new Response(JSON.stringify({ error: "Missing profileId" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const db = supabaseAdmin();

  const { data: connections, error } = await db
    .from("calendar_connections")
    .select(
      "id, provider, status, account_label, error_message, created_at, last_synced_at, calendar_sources(id, display_name, purpose)",
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("calendar-status query failed", error);
    return new Response(JSON.stringify({ error: "Query failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // One busy-interval count per connection, via a lightweight count-only
  // query rather than pulling every row back.
  const withCounts = await Promise.all(
    (connections ?? []).map(async (c) => {
      const sourceIds = (c.calendar_sources ?? []).map((s: { id: string }) => s.id);
      let busyCount = 0;
      if (sourceIds.length > 0) {
        const { count } = await db
          .from("calendar_busy_cache")
          .select("id", { count: "exact", head: true })
          .in("source_id", sourceIds);
        busyCount = count ?? 0;
      }
      return { ...c, busyCount };
    }),
  );

  return new Response(JSON.stringify({ connections: withCounts }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
