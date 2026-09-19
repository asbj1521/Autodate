/**
 * The one Supabase client the frontend shares.
 *
 * For now it is only used for login: data still flows through the Edge
 * Functions (see supabaseFunctions.ts), because RLS keeps every table closed
 * to the browser. The client keeps the session in localStorage and refreshes
 * its access token on its own, so a signed-in person stays signed in across
 * reloads without any code of ours.
 */
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
