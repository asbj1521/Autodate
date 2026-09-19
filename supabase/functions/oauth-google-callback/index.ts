/**
 * Step 2 of Google's OAuth flow: Google redirects the browser here with a
 * `code` (and the `state` we signed in oauth-google-start). This function
 * exchanges the code for tokens, discovers the account's calendars (names
 * only), stores everything, runs one immediate free/busy sync so the
 * profile page has real data right away, then redirects back to the app.
 *
 * A plain browser redirect target, same as oauth-google-start, no CORS
 * needed.
 */
import { exchangeCodeForTokens, listCalendars, queryFreeBusy } from "../_shared/google.ts";
import { discardIfRepeatedCallback, pruneSupersededConnections } from "../_shared/connections.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { verifyState } from "../_shared/state.ts";

// How far ahead to sync on first connect. Matches the rough shape of the
// frontend's rolling 12-month mock window (src/api/mockData.ts); a
// scheduled sync function can widen or refresh this later.
const SYNC_MONTHS_AHEAD = 12;

function redirectToProfile(frontendUrl: string, query: Record<string, string>): Response {
  const url = new URL("/profile", frontendUrl);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "http://localhost:8080";

  const error = url.searchParams.get("error");
  if (error) {
    // The user declined consent, or Google reported some other error.
    return redirectToProfile(frontendUrl, { error: `google:${error}` });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirectToProfile(frontendUrl, { error: "google:missing_code_or_state" });
  }

  const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  const functionsBaseUrl = Deno.env.get("FUNCTIONS_BASE_URL");
  if (!stateSecret || !clientId || !clientSecret || !functionsBaseUrl) {
    return redirectToProfile(frontendUrl, { error: "google:server_misconfigured" });
  }

  const statePayload = await verifyState(state, stateSecret);
  if (!statePayload) {
    return redirectToProfile(frontendUrl, { error: "google:invalid_state" });
  }
  const { profileId } = statePayload;

  const db = supabaseAdmin();

  // Create the connection row up front (status: pending) so if anything
  // below fails, there's a record to show as errored rather than nothing
  // at all.
  const { data: connection, error: insertErr } = await db
    .from("calendar_connections")
    .insert({ profile_id: profileId, provider: "google", status: "pending" })
    .select()
    .single();
  if (insertErr || !connection) {
    console.error("Failed to create calendar_connections row", insertErr);
    return redirectToProfile(frontendUrl, { error: "google:db_error" });
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      clientId,
      clientSecret,
      redirectUri: `${functionsBaseUrl}/oauth-google-callback`,
    });
    if (!tokens.refresh_token) {
      // Shouldn't happen with access_type=offline&prompt=consent, but if it
      // does there's no way to refresh access later, so fail loudly instead
      // of silently storing a connection that will die in an hour.
      throw new Error("Google did not return a refresh_token");
    }
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const calendars = await listCalendars(tokens.access_token);
    const primary = calendars.find((c) => c.primary) ?? calendars[0];

    const { error: secretErr } = await db.from("calendar_secrets").insert({
      connection_id: connection.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    });
    if (secretErr) throw secretErr;

    const { data: sources, error: sourcesErr } = await db
      .from("calendar_sources")
      .insert(
        calendars.map((c) => ({
          connection_id: connection.id,
          external_calendar_id: c.id,
          display_name: c.summary,
        })),
      )
      .select();
    if (sourcesErr || !sources) throw sourcesErr ?? new Error("No calendar_sources returned");

    // Initial sync: pull free/busy for every discovered calendar right now,
    // so the profile page has real data the moment the redirect lands
    // instead of showing "connected" with nothing behind it yet.
    const timeMin = new Date().toISOString();
    const timeMax = new Date(
      Date.now() + SYNC_MONTHS_AHEAD * 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const busyByCalendar = await queryFreeBusy(
      tokens.access_token,
      calendars.map((c) => c.id),
      timeMin,
      timeMax,
    );

    const sourceIdByCalendarId = new Map(sources.map((s) => [s.external_calendar_id, s.id]));
    const busyRows = Object.entries(busyByCalendar).flatMap(([calendarId, intervals]) => {
      const sourceId = sourceIdByCalendarId.get(calendarId);
      if (!sourceId) return [];
      return intervals.map((iv) => ({ source_id: sourceId, start_at: iv.start, end_at: iv.end }));
    });
    if (busyRows.length > 0) {
      const { error: busyErr } = await db.from("calendar_busy_cache").insert(busyRows);
      if (busyErr) throw busyErr;
    }

    const { error: updateErr } = await db
      .from("calendar_connections")
      .update({
        status: "connected",
        account_label: primary?.id ?? null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
    if (updateErr) throw updateErr;

    // Several accounts per provider are supported: replace an older
    // connection of this same account and clear failed attempts, but leave
    // other accounts alone.
    await pruneSupersededConnections(db, {
      profileId,
      provider: "google",
      keepId: connection.id,
      accountLabel: primary?.id ?? null,
    });

    return redirectToProfile(frontendUrl, { connected: "google" });
  } catch (err) {
    console.error("Google OAuth callback failed", err);
    // The same redirect can reach us twice (a browser or network retry). The
    // provider hands its one-time code to the first request and refuses the
    // second with invalid_grant, which is no failure at all: the account
    // connected. Drop this duplicate attempt instead of recording an error.
    if (await discardIfRepeatedCallback(db, { connection, profileId, provider: "google", failure: err })) {
      return redirectToProfile(frontendUrl, { connected: "google" });
    }
    await db
      .from("calendar_connections")
      .update({ status: "error", error_message: String(err) })
      .eq("id", connection.id);
    return redirectToProfile(frontendUrl, { error: "google:connect_failed" });
  }
});
