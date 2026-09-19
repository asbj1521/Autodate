/**
 * Add a calendar by ICS link (a university timetable, Outlook's "publish
 * calendar" link, Google's secret iCal address, ...).
 *
 * Unlike the OAuth providers there is no browser redirect dance: the profile
 * page POSTs the link here with fetch(), so this needs CORS handling and can
 * return errors straight back to the form instead of via a redirect.
 *
 * Flow: validate + fetch the feed, strip it down to timing lines and expand
 * it into busy intervals (all in _shared/ics.ts), then store the connection,
 * its one calendar source, the secret link, and the busy blocks (see
 * _shared/storeCalendars.ts). The feed is fully processed before anything is
 * written, so a bad link leaves no rows.
 * Adding the same link again replaces the earlier connection, which is also
 * how a link is refreshed until there's a background sync job.
 *
 * Called with the publishable key like calendar-status, so there is no real
 * caller identity yet (see the profile_id notes in the migration).
 */
import { corsHeaders } from "../_shared/cors.ts";
import { carryOverPurposes } from "../_shared/connections.ts";
import { assertSafeFeedUrl, fetchFeedText, IcsError, parseBusyIntervals } from "../_shared/ics.ts";
import { storeCalendars } from "../_shared/storeCalendars.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

// How far ahead to sync. Same window as the Google and Outlook callbacks.
const SYNC_MONTHS_AHEAD = 12;
const MAX_NAME_LENGTH = 80;

/** Drop ASCII control characters (newlines, tabs, NUL, DEL, ...) from user text. */
function stripControlChars(text: string): string {
  return Array.from(text)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
}

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

  let payload: { profileId?: unknown; url?: unknown; name?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const { profileId, url: rawUrl, name: rawName } = payload;
  if (typeof profileId !== "string" || !profileId || typeof rawUrl !== "string" || !rawUrl) {
    return json({ error: "profileId and url are required" }, 400);
  }
  const name =
    typeof rawName === "string"
      ? stripControlChars(rawName).trim().slice(0, MAX_NAME_LENGTH)
      : "";

  // Everything that can fail because of the link happens before any write.
  let feedUrl: URL;
  let parsed: ReturnType<typeof parseBusyIntervals>;
  try {
    feedUrl = assertSafeFeedUrl(rawUrl);
    const text = await fetchFeedText(feedUrl.toString());
    const windowStart = new Date();
    const windowEnd = new Date(Date.now() + SYNC_MONTHS_AHEAD * 30 * 24 * 60 * 60 * 1000);
    parsed = parseBusyIntervals(text, windowStart, windowEnd);
  } catch (err) {
    if (err instanceof IcsError) return json({ error: err.message }, 400);
    console.error("calendar-add-ics unexpected failure before writing", err);
    return json({ error: "Couldn't read that calendar link." }, 500);
  }

  const label = name || parsed.calendarName || feedUrl.hostname;
  const normalizedUrl = feedUrl.toString();
  const db = supabaseAdmin();

  // A feed is one calendar, so it gets a single source.
  let connectionId: string;
  try {
    ({ connectionId } = await storeCalendars(db, {
      profileId,
      provider: "ics",
      accountLabel: label,
      secrets: { ics_url: normalizedUrl },
      calendars: [{ externalId: "ics", displayName: label, intervals: parsed.intervals }],
    }));
  } catch (err) {
    console.error("calendar-add-ics failed while saving", err);
    return json({ error: "Couldn't save the calendar." }, 500);
  }

  // Same link added before by this profile: the new connection supersedes it.
  try {
    const { data: older } = await db
      .from("calendar_secrets")
      .select("connection_id, calendar_connections!inner(profile_id, provider)")
      .eq("ics_url", normalizedUrl)
      .eq("calendar_connections.profile_id", profileId)
      .eq("calendar_connections.provider", "ics")
      .neq("connection_id", connectionId);
    const oldIds = (older ?? []).map((r: { connection_id: string }) => r.connection_id);
    if (oldIds.length > 0) {
      // Keep any category the user set on the link's calendar.
      await carryOverPurposes(db, oldIds, connectionId);
      await db.from("calendar_connections").delete().in("id", oldIds);
    }
  } catch (err) {
    console.error("Failed to remove superseded ICS connection (new one is fine)", err);
  }

  return json({ connectionId, label, busyBlocks: parsed.intervals.length });
});
