/**
 * Step 1 of Google's OAuth flow: build the consent-screen URL and redirect
 * the browser there.
 *
 * Reached by a plain top-level navigation from the profile page
 * (`window.location.href = .../oauth-google-start?profileId=...`), not a
 * fetch() call, so this never needs CORS handling, only Google's redirect
 * back to oauth-google-callback does the same.
 *
 * Scopes are deliberately minimal: freebusy (busy/free intervals, never
 * event titles) and calendarlist.readonly (calendar *names*, so the profile
 * page can let the user label each one's purpose, see the calendar_sources
 * table). Matches the privacy design already documented in src/types/index.ts.
 */
import { signState } from "../_shared/state.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // No real multi-user auth yet: profileId is passed through as a plain
  // query param, matching CURRENT_USER_ID in the frontend's mock data.
  // Once real accounts exist, derive this from the caller's session instead
  // of trusting a query param.
  const profileId = url.searchParams.get("profileId");
  if (!profileId) {
    return new Response("Missing profileId", { status: 400 });
  }

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");
  const functionsBaseUrl = Deno.env.get("FUNCTIONS_BASE_URL");
  if (!clientId || !stateSecret || !functionsBaseUrl) {
    return new Response(
      "Server is missing GOOGLE_OAUTH_CLIENT_ID / OAUTH_STATE_SECRET / FUNCTIONS_BASE_URL",
      { status: 500 },
    );
  }

  const state = await signState(
    { profileId, nonce: crypto.randomUUID(), ts: Date.now() },
    stateSecret,
  );

  const redirectUri = `${functionsBaseUrl}/oauth-google-callback`;

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline"); // needed to receive a refresh token
  // consent guarantees a refresh token even on re-connect; select_account
  // always shows Google's account chooser, so a second account can be added
  // instead of Google silently reusing the one already signed in.
  authUrl.searchParams.set("prompt", "select_account consent");
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl.toString(), 302);
});
