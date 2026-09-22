/**
 * Step 1 of Microsoft's OAuth flow: build the consent-screen URL for the
 * signed-in person's browser to go to.
 *
 * Called with fetch() by the signed-in person, not by opening a link: a
 * plain navigation can't carry their login, and the login is what says whose
 * calendar this becomes. So instead of redirecting, this answers with the
 * consent-screen URL and the page sends the browser there. The caller's id
 * travels to oauth-outlook-callback inside the signed `state`, which is why the
 * callback can trust it without a login of its own.
 *
 * Uses the `common` tenant endpoint so both work/school (Entra ID) and
 * personal (Outlook.com / Hotmail) accounts can sign in. Scopes live in
 * _shared/outlook.ts so the token exchange asks for exactly the same set.
 */
import { callerId } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { signState } from "../_shared/state.ts";
import { AUTHORIZE_URL, SCOPES } from "../_shared/outlook.ts";
import { langOf, withLanguage } from "../_shared/i18n.ts";

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

  const clientId = Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID");
  const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");
  const functionsBaseUrl = Deno.env.get("FUNCTIONS_BASE_URL");
  if (!clientId || !stateSecret || !functionsBaseUrl) {
    console.error("Server is missing MICROSOFT_OAUTH_CLIENT_ID / OAUTH_STATE_SECRET / FUNCTIONS_BASE_URL");
    return json({ error: "Microsoft connections aren't set up on the server yet." }, 500);
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

  const redirectUri = `${functionsBaseUrl}/oauth-outlook-callback`;

  const authUrl = new URL(AUTHORIZE_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", SCOPES); // includes offline_access, which is what yields a refresh token
  authUrl.searchParams.set("prompt", "select_account"); // lets someone with several Microsoft accounts pick, incl. on reconnect
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("ui_locales", langOf(req)); // Microsoft's sign-in in the site's language

  return json({ url: authUrl.toString() });
}));
