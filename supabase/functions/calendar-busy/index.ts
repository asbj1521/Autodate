/**
 * Read-only feed for the "Calendar overview" page: a profile's connected
 * calendars plus their busy blocks inside a date range.
 *
 * Only what the app actually stores comes back: block timestamps, the
 * calendar's own name, its account, provider and category. There are no event
 * titles anywhere in this data by design (see the calendar_integrations
 * migration and each adapter), so none can leak from here.
 *
 * Called via fetch() from the SPA with the signed-in person's token, like
 * calendar-status, and answers only for them. RLS blocks direct table access,
 * so this service-role function is the read path. Never touches
 * calendar_secrets.
 */
import { callerId } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { withLanguage } from "../_shared/i18n.ts";

/** A calendar_sources row joined to its connection, as selected below. */
interface SourceRow {
  id: string;
  display_name: string | null;
  purpose: string | null;
  calendar_connections: {
    id: string;
    provider: string;
    account_label: string | null;
    status: string;
    profile_id: string;
  };
}

// A month grid needs 42 days; the scheduling page asks for its whole search
// window, twelve months from the 1st of this one. MAX_PAGES still bounds the
// response however busy the year is.
const MAX_RANGE_DAYS = 400;
const PAGE_SIZE = 1000; // PostgREST's default row cap per request
const MAX_PAGES = 10; // stop at 10k blocks rather than build an unbounded response

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(withLanguage(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json({ error: "Use GET" }, 405);
  }

  const params = new URL(req.url).searchParams;
  const from = new Date(params.get("from") ?? "");
  const to = new Date(params.get("to") ?? "");
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
    return json({ error: "from and to must be ISO timestamps with to after from" }, 400);
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    return json({ error: `Range is limited to ${MAX_RANGE_DAYS} days` }, 400);
  }

  const db = supabaseAdmin();
  const profileId = await callerId(req, db);
  if (!profileId) return json({ error: "Please sign in again." }, 401);

  const { data: sources, error: sourcesErr } = await db
    .from("calendar_sources")
    .select(
      "id, display_name, purpose, calendar_connections!inner(id, provider, account_label, status, profile_id)",
    )
    .eq("calendar_connections.profile_id", profileId)
    .eq("calendar_connections.status", "connected");
  if (sourcesErr) {
    console.error("calendar-busy sources query failed", sourcesErr);
    return json({ error: "Query failed" }, 500);
  }

  const calendars = ((sources ?? []) as SourceRow[])
    .map((s) => ({
      id: s.id,
      name: s.display_name ?? "Calendar",
      purpose: s.purpose,
      provider: s.calendar_connections.provider,
      account: s.calendar_connections.account_label,
      connectionId: s.calendar_connections.id,
    }))
    .sort(
      (a, b) =>
        (a.account ?? "").localeCompare(b.account ?? "") || a.name.localeCompare(b.name),
    );

  const blocks: { calendarId: string; start: string; end: string }[] = [];
  let truncated = false;
  if (calendars.length > 0) {
    const ids = calendars.map((c) => c.id);
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) {
        truncated = true;
        break;
      }
      // Overlap test: a block belongs to the range if it starts before the
      // range ends and ends after the range starts.
      const { data, error } = await db
        .from("calendar_busy_cache")
        .select("source_id, start_at, end_at")
        .in("source_id", ids)
        .lt("start_at", to.toISOString())
        .gt("end_at", from.toISOString())
        .order("start_at", { ascending: true })
        .order("id", { ascending: true }) // stable paging when start times tie
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) {
        console.error("calendar-busy blocks query failed", error);
        return json({ error: "Query failed" }, 500);
      }
      for (const r of data ?? []) {
        blocks.push({ calendarId: r.source_id, start: r.start_at, end: r.end_at });
      }
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }

  return json({ calendars, blocks, truncated });
}));
