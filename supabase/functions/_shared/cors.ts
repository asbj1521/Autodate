/**
 * CORS headers for the Edge Functions called via fetch() from the SPA
 * (unlike oauth-google-start/callback, which are reached by plain browser
 * navigation and never need this).
 */
export const corsHeaders = {
  // Any origin may call, which is safe here: the login travels as a bearer
  // token the page adds itself, never as a cookie a browser would attach on a
  // stranger's behalf, so another site can't act as a signed-in person.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
