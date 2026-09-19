/**
 * Step 1 of Microsoft's OAuth flow: build the consent-screen URL and redirect
 * the browser there.
 *
 * Reached by a plain top-level navigation from the profile page
 * (`window.location.assign(.../oauth-outlook-start?profileId=...)`), not a
 * fetch() call, so this never needs CORS handling.
 *
 * Uses the `common` tenant endpoint so both work/school (Entra ID) and
 * personal (Outlook.com / Hotmail) accounts can sign in. Scopes live in
 * _shared/outlook.ts so the token exchange asks for exactly the same set.
 */
import { signState } from "../_shared/state.ts";
import { AUTHORIZE_URL, SCOPES } from "../_shared/outlook.ts";

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

  const clientId = Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID");
  const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");
  const functionsBaseUrl = Deno.env.get("FUNCTIONS_BASE_URL");
  if (!clientId || !stateSecret || !functionsBaseUrl) {
    return new Response(
      "Server is missing MICROSOFT_OAUTH_CLIENT_ID / OAUTH_STATE_SECRET / FUNCTIONS_BASE_URL",
      { status: 500 },
    );
  }

  const state = await signState(
    { profileId, nonce: crypto.randomUUID(), ts: Date.now() },
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

  return Response.redirect(authUrl.toString(), 302);
});
