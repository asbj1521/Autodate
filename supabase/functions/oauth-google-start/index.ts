/**
 * Step 1 of Google's OAuth flow: build the consent-screen URL for the
 * signed-in person's browser to go to.
 *
 * Called with fetch() by the signed-in person, not by opening a link: a
 * plain navigation can't carry their login, and the login is what says whose
 * calendar this becomes. So instead of redirecting, this answers with the
 * consent-screen URL and the page sends the browser there. The caller's id
 * travels to oauth-google-callback inside the signed `state`, which is why the
 * callback can trust it without a login of its own.
 *
 * Scopes are deliberately minimal: freebusy (busy/free intervals, never
 * event titles) and calendarlist.readonly (calendar *names*, so the profile
 * page can let the user label each one's purpose, see the calendar_sources
 * table). Matches the privacy design already documented in src/types/index.ts.
 */
import { callerId } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { signState } from "../_shared/state.ts";
import { langOf, withLanguage } from "../_shared/i18n.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(withLanguage(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  const profileId = await callerId(req, supabaseAdmin());
  if (!profileId) return json({ error: "Please sign in again." }, 401);

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");
  const functionsBaseUrl = Deno.env.get("FUNCTIONS_BASE_URL");
  if (!clientId || !stateSecret || !functionsBaseUrl) {
    console.error("Server is missing GOOGLE_OAUTH_CLIENT_ID / OAUTH_STATE_SECRET / FUNCTIONS_BASE_URL");
    return json({ error: "Google connections aren't set up on the server yet." }, 500);
  }

  const state = await signState(
    {
      profileId,
      nonce: crypto.randomUUID(),
      ts: Date.now(),
      // The browser names the site the request came from; the callback only
      // honours it if it's on the allowlist.
      returnTo: req.headers.get("Origin") ?? undefined,
    },
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
  authUrl.searchParams.set("hl", langOf(req)); // Google's consent screen in the site's language

  return json({ url: authUrl.toString() });
}));
