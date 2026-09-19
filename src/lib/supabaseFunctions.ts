/**
 * Where the Supabase Edge Functions live, and the headers to call them with.
 * Derived from the same project URL the rest of the app uses rather than a
 * second env var to keep in sync. There is no user session yet, so calls go
 * out with the publishable key (see the profile_id notes in the migration).
 */
export const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export const FUNCTION_HEADERS = {
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
};
