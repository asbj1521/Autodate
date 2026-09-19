/**
 * Where the Supabase Edge Functions live, and how to call them.
 *
 * The base URL is derived from the same project URL the rest of the app uses
 * rather than a second env var to keep in sync. There is no user session yet,
 * so calls go out with the publishable key (see the profile_id notes in the
 * migration).
 */

export const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export const FUNCTION_HEADERS = {
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
};

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

  const res = await fetch(
    url,
    body === undefined
      ? { headers: FUNCTION_HEADERS }
      : {
          method: "POST",
          headers: { ...FUNCTION_HEADERS, "Content-Type": "application/json" },
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
