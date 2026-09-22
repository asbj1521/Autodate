/**
 * Friend groups: making one, inviting people, joining, leaving, deleting one
 * you made, and reading back the members with their busy times.
 *
 * One function rather than six, because every action is the same shape
 * underneath: work out who is calling, check they belong to the group, touch
 * two tables. Six near-identical files would be six things to deploy and keep
 * in step. The action is picked by the `action` field of the POST body.
 *
 * Identity always comes from the caller's verified login (_shared/auth.ts).
 * Nothing about who you are is ever read from the request, so being handed a
 * group id or an invite token gets you no further than being a member does.
 *
 * `preview` is the one action that works signed out: someone following an
 * invite link needs to see what they are joining before they sign in. It
 * reveals only the group's name and how many people are in it, to whoever
 * already holds the link they were sent.
 *
 * What members learn about each other is deliberately narrow: a display name
 * and busy time ranges. Never an email address, never a calendar's name,
 * never an event title (none are stored anywhere, see the calendar tables).
 */
import { callerUser } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { allowedFrontends, pickFrontend } from "../_shared/frontend.ts";
import {
  cleanDisplayName,
  cleanGroupName,
  displayNameFor,
  INVITE_LIFETIME_MS,
  inviteUrl,
  looksLikeInviteToken,
  newInviteToken,
  type NameableUser,
} from "../_shared/groups.ts";
import { encryptionKeyFromEnv, lookupHash } from "../_shared/secretBox.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { withLanguage } from "../_shared/i18n.ts";

type Db = ReturnType<typeof supabaseAdmin>;

/** Supabase's edge runtime: keeps the function alive for work after the response. */
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

/** Same cap as calendar-busy: a month grid needs 42 days, the search a year. */
const MAX_RANGE_DAYS = 400;
const PAGE_SIZE = 1000; // PostgREST's default row cap per request
const MAX_PAGES = 20; // a whole group's year, bounded

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Remember what the caller is called, from their own verified login.
 *
 * This is how a member list can say "Simon": names live in auth.users, which
 * group queries can't join to, so each person's name is copied into `profiles`
 * whenever they use the app. Failing to write it is not worth failing the
 * request over; the worst case is a slightly stale name.
 *
 * Goes through the remember_login_name function rather than a plain upsert
 * because it has to back off once someone has chosen their own name: a plain
 * upsert would stomp a custom name right back to the login-derived one on the
 * very next call.
 */
async function rememberName(db: Db, user: NameableUser & { id: string }): Promise<void> {
  const { error } = await db.rpc("remember_login_name", {
    p_id: user.id,
    p_display_name: displayNameFor(user),
  });
  if (error) console.error("remember_login_name failed", error);
}

/**
 * The groups this person is in, each with its members' names.
 *
 * Two round trips whatever the number of groups: one for the groups with all
 * their members (embedded through the foreign keys), one for the names.
 * `callerName` is the caller's own name straight from their login, so they
 * are named correctly even before rememberName's write has landed.
 */
async function listGroups(db: Db, profileId: string, callerName: string) {
  type Row = {
    friend_groups: {
      id: string;
      name: string;
      created_at: string;
      created_by: string | null;
      group_members: { profile_id: string; joined_at: string }[];
    } | null;
  };
  const { data: mine, error: mineErr } = await db
    .from("group_members")
    .select("friend_groups(id, name, created_at, created_by, group_members(profile_id, joined_at))")
    .eq("profile_id", profileId);
  if (mineErr) throw mineErr;

  // A to-one embed comes back as a single row, which the untyped client
  // can't know; hence the cast.
  const groups = ((mine ?? []) as unknown as Row[])
    .map((r) => r.friend_groups)
    .filter((g): g is NonNullable<Row["friend_groups"]> => !!g)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  if (groups.length === 0) return [];

  // The caller's own id is included here too, not just other members': if
  // they have chosen a custom name, that is what they should see themself
  // called, the same as everyone else does.
  const memberIds = [
    ...new Set(groups.flatMap((g) => g.group_members.map((m) => m.profile_id))),
  ];
  const nameById = new Map<string, string | null>();
  const customById = new Map<string, boolean>();
  if (memberIds.length > 0) {
    const { data: names, error: namesErr } = await db
      .from("profiles")
      .select("id, display_name, name_is_custom")
      .in("id", memberIds);
    if (namesErr) throw namesErr;
    for (const p of (names ?? []) as {
      id: string;
      display_name: string | null;
      name_is_custom: boolean;
    }[]) {
      nameById.set(p.id, p.display_name);
      customById.set(p.id, p.name_is_custom);
    }
  }

  // The caller's own login-derived name (callerName) is fresher than
  // whatever rememberName last saved, so it wins unless a custom name is on
  // file — that one only a deliberate "set-name" call can produce.
  const ownName =
    customById.get(profileId) && nameById.get(profileId) ? nameById.get(profileId)! : callerName;

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    createdAt: g.created_at,
    // Whoever made the group, so the frontend can offer them (and only
    // them) the delete action. Grants nothing by itself; every membership
    // check still runs.
    createdBy: g.created_by,
    members: [...g.group_members]
      .sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at))
      .map((m) => ({
        profileId: m.profile_id,
        name: m.profile_id === profileId ? ownName : (nameById.get(m.profile_id) ?? "Someone"),
        isYou: m.profile_id === profileId,
        joinedAt: m.joined_at,
      })),
  }));
}

/** What this person is called: their chosen name if they set one, else their login-derived name. */
async function resolveOwnName(db: Db, profileId: string, callerName: string): Promise<string> {
  const { data, error } = await db
    .from("profiles")
    .select("display_name, name_is_custom")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data?.name_is_custom && data.display_name ? data.display_name : callerName;
}

/** True if this person is in this group. Checked before every group action. */
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

/**
 * Everyone's busy blocks in a group, for a window, grouped by person.
 *
 * Only the time ranges cross over: which calendar a block came from, and what
 * that calendar is called, stay with their owner. So a member sees when you
 * are busy, never that it was "Work" or "Dentist".
 */
async function groupBusy(db: Db, memberIds: string[], from: Date, to: Date) {
  const busyByMember = new Map<string, { start: string; end: string }[]>();
  for (const id of memberIds) busyByMember.set(id, []);

  const { data: sources, error: sourcesErr } = await db
    .from("calendar_sources")
    .select("id, purpose, calendar_connections!inner(profile_id, status)")
    .in("calendar_connections.profile_id", memberIds)
    .eq("calendar_connections.status", "connected");
  if (sourcesErr) throw sourcesErr;

  type SourceRow = {
    id: string;
    purpose: string | null;
    calendar_connections: { profile_id: string; status: string };
  };
  const ownerOf = new Map<string, string>();
  const purposeOf = new Map<string, string | null>();
  // The generated row type describes the joined connection as an array (it is
  // a to-many relationship in general); `!inner` on a to-one join makes it a
  // single row, which only a cast can say.
  for (const s of (sources ?? []) as unknown as SourceRow[]) {
    ownerOf.set(s.id, s.calendar_connections.profile_id);
    purposeOf.set(s.id, s.purpose);
  }

  const sourceIds = [...ownerOf.keys()];
  let truncated = false;
  if (sourceIds.length > 0) {
    // Overlap test: a block is in range if it starts before the range ends
    // and ends after the range starts.
    const fetchPage = (page: number, withCount = false) =>
      db
        .from("calendar_busy_cache")
        .select("source_id, start_at, end_at", withCount ? { count: "exact" } : undefined)
        .in("source_id", sourceIds)
        .lt("start_at", to.toISOString())
        .gt("end_at", from.toISOString())
        .order("start_at", { ascending: true })
        .order("id", { ascending: true }) // stable paging when start times tie
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    // The first page also says how many blocks there are in total, so every
    // other page can be asked for at once instead of one after another.
    const first = await fetchPage(0, true);
    if (first.error) throw first.error;
    const total = first.count ?? (first.data ?? []).length;
    const pagesNeeded = Math.ceil(total / PAGE_SIZE);
    truncated = pagesNeeded > MAX_PAGES;
    const extraPages = Math.max(0, Math.min(pagesNeeded, MAX_PAGES) - 1);
    const rest = await Promise.all(
      Array.from({ length: extraPages }, (_, i) => fetchPage(i + 1)),
    );
    const rows = [first, ...rest].flatMap((res) => {
      if (res.error) throw res.error;
      return res.data ?? [];
    });

    for (const r of rows) {
      const owner = ownerOf.get(r.source_id);
      if (!owner) continue;
      busyByMember.get(owner)?.push({
        start: r.start_at,
        end: r.end_at,
        // Work and school are the "soft" kinds the multi-day rules treat as
        // time you could take off; everything else is simply busy. The label
        // is the category, not the calendar's name.
        ...(purposeOf.get(r.source_id) === "work" || purposeOf.get(r.source_id) === "school"
          ? { category: purposeOf.get(r.source_id) }
          : {}),
      });
    }
  }

  // Who has actually linked something: a member with no calendar reads as
  // free all year, which the page must be able to say out loud rather than
  // quietly counting them as available.
  const hasCalendar = new Set([...ownerOf.values()]);
  return {
    busy: Object.fromEntries(busyByMember),
    connected: Object.fromEntries(memberIds.map((id) => [id, hasCalendar.has(id)])),
    truncated,
  };
}

Deno.serve(withLanguage(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const action = payload.action;
  if (typeof action !== "string") return json({ error: "action is required" }, 400);

  const db = supabaseAdmin();

  // Previewing an invite is the one thing that happens before signing in:
  // the link itself is the only thing proving you were meant to see it.
  if (action === "preview") {
    if (!looksLikeInviteToken(payload.token)) {
      return json({ error: "That invite link is not valid." }, 400);
    }
    let hash: string;
    try {
      hash = await lookupHash(payload.token, encryptionKeyFromEnv());
    } catch (err) {
      console.error("groups is not configured", err);
      return json({ error: "Invites are not set up yet." }, 500);
    }
    const { data: invite, error } = await db
      .from("group_invites")
      .select("group_id, expires_at, friend_groups!inner(id, name)")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error) {
      console.error("groups preview query failed", error);
      return json({ error: "Query failed" }, 500);
    }
    if (!invite) return json({ error: "That invite link is not valid." }, 404);
    if (new Date(invite.expires_at) <= new Date()) {
      return json({ error: "That invite link has expired. Ask for a new one." }, 410);
    }
    const { count } = await db
      .from("group_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("group_id", invite.group_id);
    const group = invite.friend_groups as unknown as { id: string; name: string };
    return json({ group: { id: group.id, name: group.name, memberCount: count ?? 0 } });
  }

  const caller = await callerUser(req, db);
  if (!caller) return json({ error: "Please sign in again." }, 401);
  const profileId = caller.id;
  const callerName = displayNameFor(caller);
  // Saved in the background: nothing below waits on it, since the caller's
  // own name is taken straight from their login wherever it is shown.
  EdgeRuntime.waitUntil(rememberName(db, caller));

  try {
    switch (action) {
      case "list": {
        return json({ groups: await listGroups(db, profileId, callerName) });
      }

      case "whoami": {
        return json({ name: await resolveOwnName(db, profileId, callerName) });
      }

      case "set-name": {
        const name = cleanDisplayName(payload.name);
        if (!name) return json({ error: "Give yourself a name." }, 400);

        const { error: nameErr } = await db.from("profiles").upsert(
          { id: profileId, display_name: name, name_is_custom: true, updated_at: new Date().toISOString() },
          { onConflict: "id" },
        );
        if (nameErr) throw nameErr;
        return json({ name });
      }

      case "create": {
        const name = cleanGroupName(payload.name);
        if (!name) return json({ error: "Give the group a name." }, 400);

        const { data: group, error: groupErr } = await db
          .from("friend_groups")
          .insert({ name, created_by: profileId })
          .select("id")
          .single();
        if (groupErr) throw groupErr;

        // The creator is simply its first member; nothing else marks them out.
        const { error: memberErr } = await db
          .from("group_members")
          .insert({ group_id: group.id, profile_id: profileId });
        if (memberErr) {
          // The limit trigger refused, so undo the group rather than leave one
          // nobody is in.
          await db.from("friend_groups").delete().eq("id", group.id);
          return json({ error: memberErr.message }, 400);
        }
        return json({ groups: await listGroups(db, profileId, callerName), createdId: group.id });
      }

      case "rename": {
        const groupId = payload.groupId;
        if (typeof groupId !== "string") return json({ error: "groupId is required" }, 400);
        const name = cleanGroupName(payload.name);
        if (!name) return json({ error: "Give the group a name." }, 400);

        // Any member may rename, the same as inviting: it is a shared label
        // for the group, not something only its creator should control.
        if (!(await isMember(db, groupId, profileId))) {
          return json({ error: "You are not in that group." }, 403);
        }

        const { error: renameErr } = await db
          .from("friend_groups")
          .update({ name })
          .eq("id", groupId);
        if (renameErr) throw renameErr;
        return json({ groups: await listGroups(db, profileId, callerName) });
      }

      case "invite": {
        const groupId = payload.groupId;
        if (typeof groupId !== "string") return json({ error: "groupId is required" }, 400);
        // Any member may invite, which was a deliberate choice: asking the
        // group's creator to hand out every link is a bottleneck, not a
        // safeguard.
        if (!(await isMember(db, groupId, profileId))) {
          return json({ error: "You are not in that group." }, 403);
        }

        let key: string;
        try {
          key = encryptionKeyFromEnv();
        } catch (err) {
          console.error("groups is not configured", err);
          return json({ error: "Invites are not set up yet." }, 500);
        }

        // A new link every time this is pressed, and every unexpired link for
        // the group keeps working. That falls out of storing only a
        // fingerprint: nothing can turn a stored hash back into a link, so an
        // earlier one can't be handed out again — and replacing it would
        // quietly break the link already sent to someone else.
        //
        // Old links are left to expire on their own. Each is reusable by any
        // number of people for its seven days, so this is a handful of rows
        // per group, not a stream of them.
        const freshToken = newInviteToken();
        const origin = pickFrontend(req.headers.get("Origin"), allowedFrontends());
        const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS).toISOString();
        const { error: inviteErr } = await db.from("group_invites").insert({
          group_id: groupId,
          token_hash: await lookupHash(freshToken, key),
          created_by: profileId,
          expires_at: expiresAt,
        });
        if (inviteErr) throw inviteErr;

        return json({ url: inviteUrl(origin, freshToken), expiresAt });
      }

      case "join": {
        if (!looksLikeInviteToken(payload.token)) {
          return json({ error: "That invite link is not valid." }, 400);
        }
        let hash: string;
        try {
          hash = await lookupHash(payload.token, encryptionKeyFromEnv());
        } catch (err) {
          console.error("groups is not configured", err);
          return json({ error: "Invites are not set up yet." }, 500);
        }
        const { data: invite, error: inviteErr } = await db
          .from("group_invites")
          .select("group_id, expires_at")
          .eq("token_hash", hash)
          .maybeSingle();
        if (inviteErr) throw inviteErr;
        if (!invite) return json({ error: "That invite link is not valid." }, 404);
        if (new Date(invite.expires_at) <= new Date()) {
          return json({ error: "That invite link has expired. Ask for a new one." }, 410);
        }

        // Already in it: say so plainly instead of failing on the primary key.
        if (!(await isMember(db, invite.group_id, profileId))) {
          const { error: joinErr } = await db
            .from("group_members")
            .insert({ group_id: invite.group_id, profile_id: profileId });
          if (joinErr) return json({ error: joinErr.message }, 400);
        }
        return json({ groups: await listGroups(db, profileId, callerName), joinedId: invite.group_id });
      }

      case "leave": {
        const groupId = payload.groupId;
        if (typeof groupId !== "string") return json({ error: "groupId is required" }, 400);
        // The database decides whether that was the last member, and deletes
        // the group with them if so (leave_friend_group, one transaction).
        const { data: outcome, error } = await db.rpc("leave_friend_group", {
          p_group_id: groupId,
          p_profile_id: profileId,
        });
        if (error) throw error;
        if (outcome === "not_a_member") {
          return json({ error: "You are not in that group." }, 403);
        }
        return json({ groups: await listGroups(db, profileId, callerName), outcome });
      }

      case "delete": {
        const groupId = payload.groupId;
        if (typeof groupId !== "string") return json({ error: "groupId is required" }, 400);

        // Only the person who made the group may delete it outright — the one
        // power `created_by` actually grants. Everyone else's way out is
        // "leave", which only removes themself.
        const { data: group, error: groupErr } = await db
          .from("friend_groups")
          .select("id, created_by")
          .eq("id", groupId)
          .maybeSingle();
        if (groupErr) throw groupErr;
        if (!group) return json({ error: "That group no longer exists." }, 404);
        if (group.created_by !== profileId) {
          return json({ error: "Only the person who made this group can delete it." }, 403);
        }

        // group_members and group_invites cascade off this delete (see the
        // friend_groups migration's foreign keys), so nothing else to clean up.
        const { error: deleteErr } = await db.from("friend_groups").delete().eq("id", groupId);
        if (deleteErr) throw deleteErr;
        return json({ groups: await listGroups(db, profileId, callerName), outcome: "deleted" });
      }

      case "busy": {
        const groupId = payload.groupId;
        if (typeof groupId !== "string") return json({ error: "groupId is required" }, 400);
        const from = new Date(String(payload.from ?? ""));
        const to = new Date(String(payload.to ?? ""));
        if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
          return json({ error: "from and to must be ISO timestamps with to after from" }, 400);
        }
        if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
          return json({ error: `Range is limited to ${MAX_RANGE_DAYS} days` }, 400);
        }
        // Only a member may read a group's availability, and the membership
        // check is what decides it: holding the group's id proves nothing.
        // One query answers both "who is in it" and "is the caller in it".
        const { data: members, error: membersErr } = await db
          .from("group_members")
          .select("profile_id")
          .eq("group_id", groupId);
        if (membersErr) throw membersErr;
        const memberIds = (members ?? []).map((m: { profile_id: string }) => m.profile_id);
        if (!memberIds.includes(profileId)) {
          return json({ error: "You are not in that group." }, 403);
        }
        return json(await groupBusy(db, memberIds, from, to));
      }

      default:
        return json({ error: `Unknown action "${action}"` }, 400);
    }
  } catch (err) {
    console.error(`groups ${action} failed`, err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}));
