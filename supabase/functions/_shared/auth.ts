/**
 * Who is calling: the one place an Edge Function learns the caller's identity.
 *
 * The browser sends the signed-in person's access token as
 * `Authorization: Bearer <token>`. Asking Supabase Auth about that token
 * both proves it is genuine (signed by this project, not expired, not revoked
 * by a sign-out) and tells us whose it is. Nothing the browser says about
 * itself in a body or query string is trusted for identity any more.
 *
 * The gateway's own JWT check stays off for these functions (verify_jwt =
 * false in config.toml): the publishable key the app sends when nobody is
 * signed in is not a JWT, so the gateway would reject requests before this
 * code could answer them with a proper 401.
 */
import type { supabaseAdmin } from "./supabaseAdmin.ts";

/** The signed-in caller's user id, or null if there is no valid login. */
export async function callerId(
  req: Request,
  db: ReturnType<typeof supabaseAdmin>,
): Promise<string | null> {
  return (await callerUser(req, db))?.id ?? null;
}

/**
 * The whole verified user, for the callers that need more than the id.
 *
 * The groups function copies people's display names out of their own login,
 * and asking Supabase Auth about the same token twice per request (once for
 * the id, once for the name) is a second round trip for something the first
 * answer already contained.
 */
export async function callerUser(
  req: Request,
  db: ReturnType<typeof supabaseAdmin>,
): Promise<{ id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null> {
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
