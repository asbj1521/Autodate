/**
 * Suggested events: suggest a date to your group, answer one suggested to
 * you, cancel one you suggested, and list everything you're part of.
 *
 * One function with an `action` in the POST body, the same shape as `groups`.
 * Identity always comes from the caller's verified login (_shared/auth.ts);
 * a group or event id in the request gets you no further than your own
 * membership already does.
 *
 * The search that finds dates runs in the browser (src/lib/eventSearch.ts),
 * which already has the group's calendars. So a decline arrives with the next
 * date attached; this function checks it is a sensible date after the one
 * being declined, and the database swaps it in atomically (respond_to_event).
 *
 * What members see of each other here: names, and who has accepted or
 * declined which date. Never an email, a calendar or an event title from
 * anyone's calendar.
 */
import { callerUser } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { cleanEventTitle, isEventSettings, parseEventDate } from "../_shared/events.ts";
import { displayNameFor } from "../_shared/groups.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { withLanguage } from "../_shared/i18n.ts";

type Db = ReturnType<typeof supabaseAdmin>;

/** How many events the list returns, newest first. Plenty for a person's groups. */
const LIST_LIMIT = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function isMember(db: Db, groupId: string, profileId: string): Promise<boolean> {
  const { data, error } = await db
    .from("group_members")
    .select("profile_id")
    .eq("group_id", groupId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

type DateRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  declined_by: string | null;
  declined_at: string | null;
  created_at: string;
};

type ProposalRow = {
  id: string;
  group_id: string;
  created_by: string | null;
  title: string;
  settings: unknown;
  status: string;
  created_at: string;
  updated_at: string;
  friend_groups: { name: string } | null;
  event_proposal_dates: DateRow[];
  event_invitees: { profile_id: string }[];
};

/** The date on offer: the newest one nobody declined (as in event_current_date). */
function currentDate(dates: DateRow[]): DateRow | null {
  return (
    [...dates]
      .filter((d) => d.declined_at === null)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null
  );
}

/**
 * Every event the caller was invited to, in groups they are still in.
 *
 * Four round trips whatever the number of events: the caller's groups, the
 * events with their dates and invitees embedded, the answers to each current
 * date, and the names.
 */
async function listEvents(db: Db, profileId: string, callerName: string) {
  const { data: memberships, error: memErr } = await db
    .from("group_members")
    .select("group_id")
    .eq("profile_id", profileId);
  if (memErr) throw memErr;
  const groupIds = (memberships ?? []).map((m: { group_id: string }) => m.group_id);
  if (groupIds.length === 0) return [];

  const { data: rows, error: rowsErr } = await db
    .from("event_proposals")
    .select(
      "id, group_id, created_by, title, settings, status, created_at, updated_at, " +
        "friend_groups(name), " +
        "event_proposal_dates(id, starts_at, ends_at, declined_by, declined_at, created_at), " +
        "event_invitees!inner(profile_id)",
    )
    .in("group_id", groupIds)
    // Only events this person was asked about. The !inner join filters on
    // their invitee row, so the embedded invitees are fetched separately below.
    .eq("event_invitees.profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (rowsErr) throw rowsErr;
  const proposals = (rows ?? []) as unknown as ProposalRow[];
  if (proposals.length === 0) return [];

  const proposalIds = proposals.map((p) => p.id);
  const current = new Map(proposals.map((p) => [p.id, currentDate(p.event_proposal_dates)]));
  const currentIds = [...current.values()].filter((d): d is DateRow => !!d).map((d) => d.id);

  // Everyone invited, and everyone's answer to each current date: neither
  // needs the other, so both are asked at once. Every accept and decline
  // waits on this list, so it's worth the round trip saved.
  const [invitees, answers] = await Promise.all([
    db.from("event_invitees").select("proposal_id, profile_id").in("proposal_id", proposalIds),
    currentIds.length > 0
      ? db.from("event_responses").select("date_id, profile_id, response").in("date_id", currentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (invitees.error) throw invitees.error;
  if (answers.error) throw answers.error;

  const inviteesOf = new Map<string, string[]>();
  for (const r of (invitees.data ?? []) as { proposal_id: string; profile_id: string }[]) {
    inviteesOf.set(r.proposal_id, [...(inviteesOf.get(r.proposal_id) ?? []), r.profile_id]);
  }
  const answerOf = new Map<string, string>(); // `${dateId}:${profileId}` -> response
  for (const a of (answers.data ?? []) as { date_id: string; profile_id: string; response: string }[]) {
    answerOf.set(`${a.date_id}:${a.profile_id}`, a.response);
  }

  const peopleIds = new Set<string>();
  for (const p of proposals) {
    for (const id of inviteesOf.get(p.id) ?? []) peopleIds.add(id);
    if (p.created_by) peopleIds.add(p.created_by);
    for (const d of p.event_proposal_dates) if (d.declined_by) peopleIds.add(d.declined_by);
  }
  const nameById = new Map<string, string>();
  if (peopleIds.size > 0) {
    const { data: names, error: namesErr } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", [...peopleIds]);
    if (namesErr) throw namesErr;
    for (const n of (names ?? []) as { id: string; display_name: string | null }[]) {
      if (n.display_name) nameById.set(n.id, n.display_name);
    }
  }
  const nameOf = (id: string | null) =>
    !id ? "Someone" : (nameById.get(id) ?? (id === profileId ? callerName : "Someone"));

  return proposals.map((p) => {
    const date = current.get(p.id) ?? null;
    return {
      id: p.id,
      group: { id: p.group_id, name: p.friend_groups?.name ?? "A group" },
      title: p.title,
      settings: p.settings,
      status: p.status,
      createdBy: { id: p.created_by, name: nameOf(p.created_by), isYou: p.created_by === profileId },
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      currentDate: date ? { id: date.id, start: date.starts_at, end: date.ends_at } : null,
      invitees: (inviteesOf.get(p.id) ?? [])
        .map((id) => ({
          profileId: id,
          name: nameOf(id),
          isYou: id === profileId,
          response: date ? (answerOf.get(`${date.id}:${id}`) ?? null) : null,
        }))
        // You first, then everyone else by name.
        .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name)),
      declinedDates: p.event_proposal_dates
        .filter((d) => d.declined_at !== null)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
        .map((d) => ({ start: d.starts_at, end: d.ends_at, declinedBy: nameOf(d.declined_by) })),
    };
  });
}

Deno.serve(withLanguage(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const action = payload.action;
  if (typeof action !== "string") return json({ error: "action is required" }, 400);

  const db = supabaseAdmin();
  const caller = await callerUser(req, db);
  if (!caller) return json({ error: "Please sign in again." }, 401);
  const profileId = caller.id;
  const callerName = displayNameFor(caller);

  try {
    switch (action) {
      case "list":
        return json({ events: await listEvents(db, profileId, callerName) });

      case "suggest": {
        const groupId = payload.groupId;
        if (typeof groupId !== "string") return json({ error: "groupId is required" }, 400);
        const title = cleanEventTitle(payload.title);
        if (!title) return json({ error: "Give the event a name." }, 400);
        if (!isEventSettings(payload.settings)) {
          return json({ error: "Those event settings aren't valid." }, 400);
        }
        const date = parseEventDate(payload.date);
        if (!date) return json({ error: "That date isn't valid any more. Search again." }, 400);
        if (!(await isMember(db, groupId, profileId))) {
          return json({ error: "You are not in that group." }, 403);
        }

        const { error } = await db.rpc("suggest_event", {
          p_group_id: groupId,
          p_created_by: profileId,
          p_title: title,
          p_settings: payload.settings,
          p_starts_at: date.start,
          p_ends_at: date.end,
        });
        // The 20-open-events limit is raised by the database with a message
        // written for people.
        if (error) {
          if (error.code === "23514") return json({ error: error.message }, 400);
          throw error;
        }
        return json({ events: await listEvents(db, profileId, callerName) });
      }

      case "respond": {
        const { proposalId, dateId, response } = payload;
        if (typeof proposalId !== "string" || typeof dateId !== "string") {
          return json({ error: "proposalId and dateId are required" }, 400);
        }
        if (response !== "accepted" && response !== "declined") {
          return json({ error: "response must be accepted or declined" }, 400);
        }

        // A decline brings the next date, or null when the search found none.
        let next: { start: string; end: string } | null = null;
        if (response === "declined" && payload.next != null) {
          next = parseEventDate(payload.next);
          if (!next) return json({ error: "The replacement date isn't valid." }, 400);
          // It has to come after the date being declined: the search runs
          // forward from the day after, never back over dates already seen.
          const { data: declined, error: dateErr } = await db
            .from("event_proposal_dates")
            .select("starts_at")
            .eq("id", dateId)
            .eq("proposal_id", proposalId)
            .maybeSingle();
          if (dateErr) throw dateErr;
          if (!declined) return json({ error: "That event no longer exists." }, 404);
          if (Date.parse(next.start) <= Date.parse(declined.starts_at)) {
            return json({ error: "The replacement date must be after the declined one." }, 400);
          }
        }

        const { data: outcome, error } = await db.rpc("respond_to_event", {
          p_proposal_id: proposalId,
          p_date_id: dateId,
          p_profile_id: profileId,
          p_response: response,
          p_next_starts_at: next?.start ?? null,
          p_next_ends_at: next?.end ?? null,
        });
        if (error) throw error;
        if (outcome === "not_invited") return json({ error: "You weren't asked about that event." }, 403);
        if (outcome === "closed") {
          return json({ error: "That event is no longer waiting for answers." }, 409);
        }
        if (outcome === "stale") {
          return json(
            { error: "Someone else answered first and the date changed. Have a look at the new one." },
            409,
          );
        }
        return json({ outcome, events: await listEvents(db, profileId, callerName) });
      }

      case "cancel": {
        const proposalId = payload.proposalId;
        if (typeof proposalId !== "string") return json({ error: "proposalId is required" }, 400);
        const { data: proposal, error: propErr } = await db
          .from("event_proposals")
          .select("id, created_by, status")
          .eq("id", proposalId)
          .maybeSingle();
        if (propErr) throw propErr;
        if (!proposal) return json({ error: "That event no longer exists." }, 404);
        // Only the person who suggested it can call it off; everyone else
        // answers it instead.
        if (proposal.created_by !== profileId) {
          return json({ error: "Only the person who suggested this event can cancel it." }, 403);
        }
        if (proposal.status === "cancelled") {
          return json({ events: await listEvents(db, profileId, callerName) });
        }
        const { error: updErr } = await db
          .from("event_proposals")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", proposalId);
        if (updErr) throw updErr;
        return json({ events: await listEvents(db, profileId, callerName) });
      }

      default:
        return json({ error: `Unknown action "${action}"` }, 400);
    }
  } catch (err) {
    console.error(`events ${action} failed`, err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}));
