/**
 * Connect an iCloud account over CalDAV with an app-specific password.
 *
 * Like calendar-add-ics, the profile page POSTs here with fetch() (no browser
 * redirect dance), so this handles CORS and returns errors straight to the
 * form. Apple has no OAuth for calendars, hence the password.
 *
 * Flow: log in and discover every event calendar in the account, pull each
 * one's events as timing-only ICS, and reduce them to busy intervals with the
 * same parser the ICS-link feature uses. Only then is anything written: a
 * wrong password or an unreachable iCloud leaves no rows behind. The password
 * is encrypted (see _shared/secretBox.ts) before it is stored. Re-adding the
 * same account replaces the old connection and keeps its calendar categories.
 *
 * Called with the signed-in person's token; the account is stored as theirs.
 */
import { callerId } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { discoverCalendars, CalDavError, fetchEventDocuments, mapPool } from "../_shared/caldav.ts";
import { pruneSupersededConnections } from "../_shared/connections.ts";
import { parseBusyIntervals } from "../_shared/ics.ts";
import { mergeIntervals, type RawBusyInterval } from "../_shared/intervals.ts";
import { encryptionKeyFromEnv, encryptSecret } from "../_shared/secretBox.ts";
import { storeCalendars } from "../_shared/storeCalendars.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { addMissingTimezones } from "../_shared/timezones.ts";

// How far ahead to sync. Same window as the other providers.
const SYNC_MONTHS_AHEAD = 12;
// Calendars fetched at once: fast enough, gentle enough not to trip rate limits.
const CALENDAR_CONCURRENCY = 4;
const MAX_FIELD_LENGTH = 254;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** True for strings with no control characters (newlines, tabs, NUL, DEL, ...). */
const isPlainText = (text: string) => Array.from(text).every((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  // Checked before anything else, so no one can make us log in to iCloud
  // with a password without being signed in themselves.
  const db = supabaseAdmin();
  const profileId = await callerId(req, db);
  if (!profileId) return json({ error: "Please sign in again." }, 401);

  let payload: { username?: unknown; password?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const { username: rawUsername, password: rawPassword } = payload;
  if (typeof rawUsername !== "string" || typeof rawPassword !== "string") {
    return json({ error: "username and password are required" }, 400);
  }
  const username = rawUsername.trim();
  // Apple shows app-specific passwords with dashes and people paste stray spaces.
  const password = rawPassword.trim();
  if (
    !username || !password ||
    username.length > MAX_FIELD_LENGTH || password.length > MAX_FIELD_LENGTH ||
    !isPlainText(username) || !isPlainText(password)
  ) {
    return json({ error: "Enter your iCloud email and your app-specific password." }, 400);
  }

  // Refuse up front, before contacting Apple, if there is nowhere safe to keep
  // the password: better an error than an unencrypted credential.
  let encryptionKey: string;
  try {
    encryptionKey = encryptionKeyFromEnv();
  } catch (err) {
    console.error("calendar-add-apple is not configured", err);
    return json({ error: "Apple calendar connections aren't set up on the server yet." }, 500);
  }

  // Everything that can fail because of the account happens before any write.
  const creds = { username, password };
  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + SYNC_MONTHS_AHEAD * 30 * 24 * 60 * 60 * 1000);
  let fetched: { id: string; name: string | null; intervals: RawBusyInterval[] }[];
  let skippedEvents = 0;
  try {
    const calendars = await discoverCalendars(creds);
    if (calendars.length === 0) {
      return json({ error: "That iCloud account has no calendars we can read." }, 400);
    }

    fetched = await mapPool(calendars, CALENDAR_CONCURRENCY, async (cal) => {
      const documents = await fetchEventDocuments(creds, cal.url, windowStart, windowEnd);
      const intervals: RawBusyInterval[] = [];
      for (const doc of documents) {
        try {
          // iCloud names time zones without defining them; fill those in first.
          const complete = addMissingTimezones(doc, windowStart, windowEnd);
          intervals.push(...parseBusyIntervals(complete, windowStart, windowEnd).intervals);
        } catch {
          // One unreadable event (an odd time zone, say) must not sink the
          // whole account. It is counted so the user is told, not hidden.
          skippedEvents++;
        }
      }
      return { id: cal.id, name: cal.name, intervals: mergeIntervals(intervals) };
    });
  } catch (err) {
    if (err instanceof CalDavError) return json({ error: err.message }, 400);
    console.error("calendar-add-apple unexpected failure before writing", err);
    return json({ error: "Couldn't read that iCloud account." }, 500);
  }

  let connectionId: string;
  try {
    ({ connectionId } = await storeCalendars(db, {
      profileId,
      provider: "apple",
      accountLabel: username,
      secrets: {
        caldav_username: username,
        caldav_password: await encryptSecret(password, encryptionKey),
      },
      calendars: fetched.map((c) => ({ externalId: c.id, displayName: c.name, intervals: c.intervals })),
    }));
  } catch (err) {
    console.error("calendar-add-apple failed while saving", err);
    return json({ error: "Couldn't save the calendars." }, 500);
  }

  // Same account added before: the new connection supersedes it (and failed
  // attempts), carrying over any work/school labels. Never throws.
  await pruneSupersededConnections(db, {
    profileId,
    provider: "apple",
    keepId: connectionId,
    accountLabel: username,
  });

  return json({
    connectionId,
    label: username,
    calendars: fetched.length,
    busyBlocks: fetched.reduce((sum, c) => sum + c.intervals.length, 0),
    skippedEvents,
  });
});
