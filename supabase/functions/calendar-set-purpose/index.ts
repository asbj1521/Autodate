/**
 * Set (or clear) the category of one calendar: work, school, personal, other.
 *
 * This is the "mark them after what they are" step from the privacy design:
 * categories live on the calendar (calendar_sources.purpose), never on
 * individual events, and every busy block inherits its calendar's category.
 *
 * Called via fetch() from the SPA with the publishable key, like
 * calendar-disconnect: no real caller identity yet, so the guard is that the
 * calendar must belong to a connection owned by the profileId given.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const PURPOSES = new Set(["work", "school", "personal", "other"]);

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

  let payload: { profileId?: unknown; calendarId?: unknown; purpose?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const { profileId, calendarId, purpose } = payload;
  if (typeof profileId !== "string" || typeof calendarId !== "string") {
    return json({ error: "profileId and calendarId are required" }, 400);
  }
  // null clears the category; anything else must be one of the four.
  if (purpose !== null && !(typeof purpose === "string" && PURPOSES.has(purpose))) {
    return json({ error: "purpose must be work, school, personal, other or null" }, 400);
  }

  const db = supabaseAdmin();

  // Ownership check first: the calendar's connection must belong to this profile.
  const { data: owned, error: lookupErr } = await db
    .from("calendar_sources")
    .select("id, calendar_connections!inner(profile_id)")
    .eq("id", calendarId)
    .eq("calendar_connections.profile_id", profileId)
    .maybeSingle();
  if (lookupErr) {
    console.error("calendar-set-purpose lookup failed", lookupErr);
    return json({ error: "Lookup failed" }, 500);
  }
  if (!owned) return json({ error: "Calendar not found" }, 404);

  const { error: updateErr } = await db
    .from("calendar_sources")
    .update({ purpose })
    .eq("id", calendarId);
  if (updateErr) {
    console.error("calendar-set-purpose update failed", updateErr);
    return json({ error: "Update failed" }, 500);
  }
  return json({ calendarId, purpose });
});
