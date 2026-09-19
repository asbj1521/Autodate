/**
 * Housekeeping shared by the OAuth callbacks so several accounts per provider
 * can coexist without piling up duplicates.
 *
 * An "account" is identified by (profile_id, provider, account_label), where
 * account_label is the email the provider reported. Connecting the same
 * account again therefore replaces its old connection rather than adding a
 * second copy; connecting a different account simply adds a row. Categories
 * the user set on the old connection's calendars (work, school, ...) are
 * carried over to the new one, matched by the provider's calendar id.
 */
import type { supabaseAdmin } from "./supabaseAdmin.ts";

// A row left 'pending' this long is a callback that died mid-flight (edge
// function timeout or crash), not one still running. Anything younger might
// be a live attempt for another account and must not be touched.
const STALE_PENDING_MS = 10 * 60_000;

/**
 * Copy calendar categories (calendar_sources.purpose) from connections that
 * are about to be deleted onto the calendars of their replacement, matching by
 * external_calendar_id. If several old connections disagree, the newest wins.
 * Never throws: losing a category is a nuisance, not a reason to fail.
 */
export async function carryOverPurposes(
  db: ReturnType<typeof supabaseAdmin>,
  fromConnectionIds: string[],
  toConnectionId: string,
): Promise<void> {
  if (fromConnectionIds.length === 0) return;
  try {
    const { data: oldSources, error: oldErr } = await db
      .from("calendar_sources")
      .select("external_calendar_id, purpose")
      .in("connection_id", fromConnectionIds)
      .not("purpose", "is", null)
      .order("created_at", { ascending: true });
    if (oldErr) throw oldErr;
    if (!oldSources || oldSources.length === 0) return;

    const { data: newSources, error: newErr } = await db
      .from("calendar_sources")
      .select("id, external_calendar_id")
      .eq("connection_id", toConnectionId);
    if (newErr) throw newErr;

    const wanted = new Map<string, string>(); // later rows overwrite earlier ones
    for (const o of oldSources) wanted.set(o.external_calendar_id, o.purpose);
    for (const n of newSources ?? []) {
      const purpose = wanted.get(n.external_calendar_id);
      if (!purpose) continue;
      const { error } = await db.from("calendar_sources").update({ purpose }).eq("id", n.id);
      if (error) throw error;
    }
  } catch (err) {
    console.error("carryOverPurposes failed (categories may need re-setting)", err);
  }
}

/**
 * Call after a connection has reached status 'connected'. Deletes, for the
 * same profile and provider:
 *  - older connections for the same account (case-insensitive email match),
 *  - failed attempts (their error is now history, and the profile page would
 *    otherwise keep showing it),
 *  - long-stale pending attempts.
 * Deleting a connection cascades to its calendar_sources, calendar_secrets and
 * calendar_busy_cache rows. Never throws: cleanup failing must not turn a
 * successful connect into an error, so it just logs.
 */
export async function pruneSupersededConnections(
  db: ReturnType<typeof supabaseAdmin>,
  opts: {
    profileId: string;
    provider: "google" | "outlook" | "apple";
    keepId: string;
    accountLabel: string | null;
  },
): Promise<void> {
  try {
    const { data: others, error } = await db
      .from("calendar_connections")
      .select("id, status, account_label, created_at")
      .eq("profile_id", opts.profileId)
      .eq("provider", opts.provider)
      .neq("id", opts.keepId);
    if (error) throw error;

    const wanted = opts.accountLabel?.toLowerCase() ?? null;
    const staleBefore = Date.now() - STALE_PENDING_MS;
    const sameAccount = (others ?? []).filter(
      (c) => c.status === "connected" && wanted !== null && c.account_label?.toLowerCase() === wanted,
    );
    const noise = (others ?? []).filter(
      (c) =>
        c.status === "error" ||
        (c.status === "pending" && new Date(c.created_at).getTime() < staleBefore),
    );

    // The replacement inherits the categories set on the account it replaces.
    await carryOverPurposes(db, sameAccount.map((c) => c.id), opts.keepId);

    const doomed = [...sameAccount, ...noise].map((c) => c.id);
    if (doomed.length > 0) {
      const { error: delErr } = await db.from("calendar_connections").delete().in("id", doomed);
      if (delErr) throw delErr;
    }
  } catch (err) {
    console.error("pruneSupersededConnections failed (connection itself is fine)", err);
  }
}

/**
 * How close together two callbacks must be to count as one attempt seen
 * twice. A browser or network retry lands within a second or two, while a
 * person connecting a second account has to work through the provider's
 * consent screen again, which takes far longer than this.
 */
export const DUPLICATE_CALLBACK_WINDOW_MS = 30_000;

/** True if the failure is a provider refusing an authorization code it already handed out. */
export function isCodeReuseFailure(failure: unknown): boolean {
  const message = String(failure);
  return /token exchange failed/i.test(message) && message.includes("invalid_grant");
}

/**
 * Decide whether a failed callback is just the second copy of one that worked.
 *
 * An authorization code can be redeemed once. If the same redirect reaches us
 * twice, the first request succeeds and the second is refused with
 * `invalid_grant`, which would otherwise be stored as a failed connection even
 * though the account connected fine. So a code-reuse failure is a duplicate
 * when another attempt for the same account started within the window.
 * `otherAttemptTimes` are the creation times of those other attempts.
 */
export function isRepeatedCallback(opts: {
  failure: unknown;
  attemptedAt: string;
  otherAttemptTimes: string[];
}): boolean {
  if (!isCodeReuseFailure(opts.failure)) return false;
  const attempted = Date.parse(opts.attemptedAt);
  return opts.otherAttemptTimes.some(
    (t) => Math.abs(Date.parse(t) - attempted) <= DUPLICATE_CALLBACK_WINDOW_MS,
  );
}

/**
 * Call from an OAuth callback's catch block. If the failure turns out to be a
 * duplicate of an attempt that worked (or is still working), delete this
 * attempt's row and return true, so the caller can send the user to the
 * success message instead of showing an error. Returns false for anything
 * else. Never throws: on any trouble it says "not a duplicate" and the caller
 * records the failure as before.
 *
 * Other attempts still `pending` count too. The duplicate fails at once, while
 * the original is still fetching calendars and hasn't reached `connected` yet.
 */
export async function discardIfRepeatedCallback(
  db: ReturnType<typeof supabaseAdmin>,
  opts: {
    connection: { id: string; created_at: string };
    profileId: string;
    provider: "google" | "outlook";
    failure: unknown;
  },
): Promise<boolean> {
  if (!isCodeReuseFailure(opts.failure)) return false; // skip the query for ordinary failures
  try {
    const created = Date.parse(opts.connection.created_at);
    const { data, error } = await db
      .from("calendar_connections")
      .select("created_at")
      .eq("profile_id", opts.profileId)
      .eq("provider", opts.provider)
      .in("status", ["pending", "connected"])
      .neq("id", opts.connection.id)
      .gte("created_at", new Date(created - DUPLICATE_CALLBACK_WINDOW_MS).toISOString())
      .lte("created_at", new Date(created + DUPLICATE_CALLBACK_WINDOW_MS).toISOString());
    if (error) throw error;

    const duplicate = isRepeatedCallback({
      failure: opts.failure,
      attemptedAt: opts.connection.created_at,
      otherAttemptTimes: (data ?? []).map((r: { created_at: string }) => r.created_at),
    });
    if (!duplicate) return false;

    const { error: delErr } = await db.from("calendar_connections").delete().eq("id", opts.connection.id);
    if (delErr) throw delErr;
    console.log(`Ignored a repeated ${opts.provider} callback (its one-time code was already used)`);
    return true;
  } catch (err) {
    console.error("discardIfRepeatedCallback failed (treating as a real failure)", err);
    return false;
  }
}
