/**
 * Step 2 of Microsoft's OAuth flow: Microsoft redirects the browser here with
 * a `code` (and the `state` we signed in oauth-outlook-start). This function
 * exchanges the code for tokens, discovers the account's calendars (names
 * only), stores everything, runs one immediate busy-time sync so the profile
 * page has real data right away, then redirects back to the app.
 *
 * A plain browser redirect target, same as oauth-outlook-start: no CORS
 * needed. Structure and error handling deliberately mirror
 * oauth-google-callback.
 */
import { exchangeCodeForTokens, listCalendars, queryFreeBusy } from "../_shared/outlook.ts";
import { discardIfRepeatedCallback, pruneSupersededConnections } from "../_shared/connections.ts";
import { encryptionKeyFromEnv, encryptSecret } from "../_shared/secretBox.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { verifyState } from "../_shared/state.ts";

// How far ahead to sync on first connect. Same window as the Google callback.
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
    // The user declined consent, or Microsoft reported some other error.
    // error_description carries the AADSTS detail; log it (it never goes into
    // the redirect URL) since `error` alone is often just "access_denied".
    console.error("Microsoft returned an OAuth error", error, url.searchParams.get("error_description"));
    return redirectToProfile(frontendUrl, { error: `outlook:${error}` });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirectToProfile(frontendUrl, { error: "outlook:missing_code_or_state" });
  }

  const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");
  const clientId = Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_OAUTH_CLIENT_SECRET");
  const functionsBaseUrl = Deno.env.get("FUNCTIONS_BASE_URL");
  if (!stateSecret || !clientId || !clientSecret || !functionsBaseUrl) {
    return redirectToProfile(frontendUrl, { error: "outlook:server_misconfigured" });
  }
  // Checked before the user is sent anywhere or anything is written: with no
  // key there is nowhere safe to put the tokens.
  let encryptionKey: string;
  try {
    encryptionKey = encryptionKeyFromEnv();
  } catch (err) {
    console.error("outlook callback cannot encrypt tokens", err);
    return redirectToProfile(frontendUrl, { error: "outlook:server_misconfigured" });
  }

  const statePayload = await verifyState(state, stateSecret);
  if (!statePayload) {
    return redirectToProfile(frontendUrl, { error: "outlook:invalid_state" });
  }
  const { profileId } = statePayload;

  const db = supabaseAdmin();

  // Create the connection row up front (status: pending) so if anything
  // below fails, there's a record to show as errored rather than nothing
  // at all.
  const { data: connection, error: insertErr } = await db
    .from("calendar_connections")
    .insert({ profile_id: profileId, provider: "outlook", status: "pending" })
    .select()
    .single();
  if (insertErr || !connection) {
    console.error("Failed to create calendar_connections row", insertErr);
    return redirectToProfile(frontendUrl, { error: "outlook:db_error" });
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      clientId,
      clientSecret,
      redirectUri: `${functionsBaseUrl}/oauth-outlook-callback`,
    });
    if (!tokens.refresh_token) {
      // Microsoft only issues one when offline_access was in the requested
      // scopes. If it's missing there's no way to refresh access later, so
      // fail loudly instead of storing a connection that dies in an hour.
      throw new Error("Microsoft did not return a refresh_token (is offline_access in the scope list?)");
    }
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const calendars = await listCalendars(tokens.access_token);
    // The default calendar's owner is the account itself, which gives us the
    // email for account_label without a separate /me call.
    const primary = calendars.find((c) => c.isDefaultCalendar) ?? calendars[0];

    const { error: secretErr } = await db.from("calendar_secrets").insert({
      connection_id: connection.id,
      // Encrypted like every stored secret; the database refuses plaintext.
      access_token: await encryptSecret(tokens.access_token, encryptionKey),
      refresh_token: await encryptSecret(tokens.refresh_token, encryptionKey),
      expires_at: expiresAt,
    });
    if (secretErr) throw secretErr;

    const { data: sources, error: sourcesErr } = await db
      .from("calendar_sources")
      .insert(
        calendars.map((c) => ({
          connection_id: connection.id,
          external_calendar_id: c.id,
          display_name: c.name,
        })),
      )
      .select();
    if (sourcesErr || !sources) throw sourcesErr ?? new Error("No calendar_sources returned");

    // Initial sync: pull busy intervals for every discovered calendar right
    // now, so the profile page has real data the moment the redirect lands
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
        account_label: primary?.owner?.address ?? primary?.name ?? null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
    if (updateErr) throw updateErr;

    // Several accounts per provider are supported: replace an older
    // connection of this same account and clear failed attempts, but leave
    // other accounts alone.
    await pruneSupersededConnections(db, {
      profileId,
      provider: "outlook",
      keepId: connection.id,
      accountLabel: primary?.owner?.address ?? primary?.name ?? null,
    });

    return redirectToProfile(frontendUrl, { connected: "outlook" });
  } catch (err) {
    console.error("Outlook OAuth callback failed", err);
    // The same redirect can reach us twice (a browser or network retry). The
    // provider hands its one-time code to the first request and refuses the
    // second with invalid_grant, which is no failure at all: the account
    // connected. Drop this duplicate attempt instead of recording an error.
    if (await discardIfRepeatedCallback(db, { connection, profileId, provider: "outlook", failure: err })) {
      return redirectToProfile(frontendUrl, { connected: "outlook" });
    }
    await db
      .from("calendar_connections")
      .update({ status: "error", error_message: String(err) })
      .eq("id", connection.id);
    return redirectToProfile(frontendUrl, { error: "outlook:connect_failed" });
  }
});
