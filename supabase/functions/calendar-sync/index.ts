/**
 * Refresh connected calendars' busy times (see _shared/sync.ts).
 *
 * Two callers, told apart by how they prove who they are:
 *
 *  - The hourly scheduler (pg_cron, see the calendar_sync migration) sends the
 *    shared secret in `x-sync-secret`. It gets every connected account,
 *    least recently tried first. The work continues in the background after
 *    a quick 202, because the scheduler doesn't wait for, or need, the result;
 *    whatever doesn't fit in the time budget is first in line next hour.
 *
 *  - The profile page's "Sync now" button sends the signed-in person's login
 *    and gets their own accounts synced, waiting for the result. An account
 *    tried in the last minute is skipped, so the button can't be used to
 *    hammer the providers.
 */
import { callerId } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptionKeyFromEnv } from "../_shared/secretBox.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { syncConnection, type SyncOutcome, type SyncTarget } from "../_shared/sync.ts";
import { withLanguage } from "../_shared/i18n.ts";

/** Supabase's edge runtime: keeps the function alive for work after the response. */
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

/** Stop starting new syncs after this long; the runtime's own limit is higher. */
const SCHEDULED_BUDGET_MS = 100_000;
/** At most this many accounts per scheduled run. */
const SCHEDULED_BATCH = 200;
/** "Sync now" leaves an account alone if it was tried this recently. */
const MANUAL_COOLDOWN_MS = 60_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Compare secrets without leaking, through timing, how much of a guess was right. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(withLanguage(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let encryptionKey: string;
  try {
    encryptionKey = encryptionKeyFromEnv();
  } catch (err) {
    console.error("calendar-sync is not configured", err);
    return json({ error: "Syncing isn't set up on the server yet." }, 500);
  }
  const db = supabaseAdmin();

  // --- The scheduler -------------------------------------------------------
  const presented = req.headers.get("x-sync-secret");
  if (presented !== null) {
    const expected = Deno.env.get("CALENDAR_SYNC_SECRET");
    if (!expected || !sameSecret(presented, expected)) {
      return json({ error: "Not allowed" }, 401);
    }
    const { data, error } = await db
      .from("calendar_connections")
      .select("id, provider")
      .eq("status", "connected")
      .order("last_sync_attempt_at", { ascending: true, nullsFirst: true })
      .limit(SCHEDULED_BATCH);
    if (error) {
      console.error("calendar-sync could not list connections", error);
      return json({ error: "Query failed" }, 500);
    }
    const targets = (data ?? []) as SyncTarget[];
    EdgeRuntime.waitUntil(runScheduled(db, targets, encryptionKey));
    return json({ queued: targets.length }, 202);
  }

  // --- A signed-in person's "Sync now" ---------------------------------------
  const profileId = await callerId(req, db);
  if (!profileId) return json({ error: "Please sign in again." }, 401);

  const { data, error } = await db
    .from("calendar_connections")
    .select("id, provider, last_sync_attempt_at")
    .eq("profile_id", profileId)
    .eq("status", "connected");
  if (error) {
    console.error("calendar-sync could not list the caller's connections", error);
    return json({ error: "Query failed" }, 500);
  }
  const cutoff = Date.now() - MANUAL_COOLDOWN_MS;
  const due = (data ?? []).filter(
    (c: { last_sync_attempt_at: string | null }) =>
      !c.last_sync_attempt_at || Date.parse(c.last_sync_attempt_at) < cutoff,
  ) as SyncTarget[];

  // One at a time: a person has a handful of accounts, and running them in
  // parallel would only risk tripping a provider's rate limit.
  const results: SyncOutcome[] = [];
  for (const target of due) results.push(await syncConnection(db, target, encryptionKey));
  return json({ results, skipped: (data ?? []).length - due.length });
}));

async function runScheduled(
  db: ReturnType<typeof supabaseAdmin>,
  targets: SyncTarget[],
  encryptionKey: string,
): Promise<void> {
  const started = Date.now();
  let ok = 0;
  let failed = 0;
  for (const target of targets) {
    if (Date.now() - started > SCHEDULED_BUDGET_MS) break;
    const outcome = await syncConnection(db, target, encryptionKey);
    if (outcome.ok) ok++;
    else failed++;
  }
  console.log(`scheduled sync: ${ok} ok, ${failed} failed, ${targets.length - ok - failed} left for next run`);
}
