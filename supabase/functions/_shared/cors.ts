/**
 * CORS headers for the Edge Functions called via fetch() from the SPA
 * (unlike oauth-google-start/callback, which are reached by plain browser
 * navigation and never need this).
 */
export const corsHeaders = {
  // Wide open for now since there's no real auth to scope it to yet; these
  // functions only return non-secret data (calendar-status) or delete a
  // connection by unguessable id (calendar-disconnect).
  // Tighten to the deployed frontend origin once real accounts exist.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
