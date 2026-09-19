/**
 * Where the Supabase Edge Functions live, and how to call them.
 *
 * The base URL is derived from the same project URL the rest of the app uses
 * rather than a second env var to keep in sync. Every call carries the
 * signed-in person's access token, which is how a function knows whose
 * calendars it is looking at: nothing in the request body says so any more.
 */
import { supabase } from "@/lib/supabase";

export const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The publishable key identifies the app; the access token identifies the
 * person. getSession() hands back a token that is still valid, refreshing it
 * first if it was about to expire. Signed out, the key stands in for the token
 * and the function answers 401.
 */
async function functionHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return {
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${data.session?.access_token ?? PUBLISHABLE_KEY}`,
  };
}

interface CallOptions {
  /** Query-string parameters; used by the read-only GET endpoints. */
  params?: Record<string, string>;
  /** A JSON body. Passing one makes the call a POST. */
  body?: unknown;
  /** What to say if the function fails without a message of its own. */
  errorMessage?: string;
}

/**
 * Call one Edge Function and return its parsed body.
 *
 * Every caller wants the same three things — the headers, a readable error
 * when the call fails, and JSON back — so they live here instead of being
 * rewritten at each call site. A function's own `error` field wins over the
 * generic message, since it is the one written for the person reading it.
 */
export async function callFunction<T>(
  name: string,
  { params, body, errorMessage }: CallOptions = {},
): Promise<T> {
  const url = new URL(`${SUPABASE_FUNCTIONS_URL}/${name}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers = await functionHeaders();
  const res = await fetch(
    url,
    body === undefined
      ? { headers }
      : {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );

  // A failing function may answer with plain text or nothing at all, so a
  // body that won't parse is not itself an error worth reporting.
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (parsed as { error?: string }).error ??
        `${errorMessage ?? `${name} failed`} (HTTP ${res.status})`,
    );
  }
  return parsed as T;
}
