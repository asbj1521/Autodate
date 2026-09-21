/**
 * Admin mode: a whole-app view for the project owner, and the few actions
 * that go with it (delete any group, remove someone from a group, delete an
 * account, re-sync a calendar account).
 *
 * Who is an admin is decided here and only here: the caller's verified login
 * (_shared/auth.ts) must be listed in the ADMIN_USER_IDS secret
 * (_shared/admin.ts). The profile page hides the admin button from everyone
 * else, but that is a convenience; this check is the actual lock. Every
 * action but `status` re-checks it, so a hand-made request gets a 403.
 *
 * `status` answers any signed-in person with a yes or no, which is how the
 * page knows whether to show the button at all.
 *
 * Even an admin sees only what support needs: names, dates, counts and sync
 * health. Never an email address, never a calendar's name or account label
 * (a Google account's label is its email), never a busy time or anything
 * about an event.
 */
import { isAdminId } from "../_shared/admin.ts";
import { callerUser } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { displayNameFor } from "../_shared/groups.ts";
import { encryptionKeyFromEnv } from "../_shared/secretBox.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { syncConnection, type SyncTarget } from "../_shared/sync.ts";

type Db = ReturnType<typeof supabaseAdmin>;

/** Auth's admin API pages users; this many per page, this many pages at most. */
const USERS_PER_PAGE = 1000;
const MAX_USER_PAGES = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface AuthUserRow {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  created_at: string;
  last_sign_in_at?: string | null;
}

/** Every account, from Supabase Auth. Emails are read only to derive a name. */
async function allUsers(db: Db): Promise<{ users: AuthUserRow[]; truncated: boolean }> {
  const users: AuthUserRow[] = [];
  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw error;
    users.push(...(data.users as AuthUserRow[]));
    if (data.users.length < USERS_PER_PAGE) return { users, truncated: false };
  }
  return { users, truncated: true };
}

/** Everything admin mode shows, in one round trip. */
async function overview(db: Db) {
  const [
    { users, truncated },
    { data: profiles, error: profilesErr },
    { data: groups, error: groupsErr },
    { data: members, error: membersErr },
    { data: connections, error: connectionsErr },
    { count: busyBlocks, error: busyErr },
  ] = await Promise.all([
    allUsers(db),
    db.from("profiles").select("id, display_name"),
    db.from("friend_groups").select("id, name, created_at, created_by").order("created_at", { ascending: false }),
    db.from("group_members").select("group_id, profile_id, joined_at").order("joined_at", { ascending: true }),
    db
      .from("calendar_connections")
      .select(
        "id, profile_id, provider, status, created_at, last_synced_at, last_sync_attempt_at, sync_error, needs_reconnect, calendar_sources(count)",
      )
      .order("created_at", { ascending: false }),
    db.from("calendar_busy_cache").select("id", { count: "exact", head: true }),
  ]);
  if (profilesErr) throw profilesErr;
  if (groupsErr) throw groupsErr;
  if (membersErr) throw membersErr;
  if (connectionsErr) throw connectionsErr;
  if (busyErr) throw busyErr;

  // The name people chose shows in groups (profiles); anyone who never used
  // groups falls back to the same rule that fills profiles in the first place.
  const storedName = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name]),
  );
  const nameOf = new Map(users.map((u) => [u.id, storedName.get(u.id) ?? displayNameFor(u)]));
  const name = (id: string | null) => (id ? (nameOf.get(id) ?? "Deleted account") : "Deleted account");

  type MemberRow = { group_id: string; profile_id: string; joined_at: string };
  type ConnectionRow = {
    id: string;
    profile_id: string;
    provider: string;
    status: string;
    created_at: string;
    last_synced_at: string | null;
    last_sync_attempt_at: string | null;
    sync_error: string | null;
    needs_reconnect: boolean;
    calendar_sources: { count: number }[];
  };
  const memberRows = (members ?? []) as MemberRow[];
  const connectionRows = (connections ?? []) as unknown as ConnectionRow[];

  const groupsJoined = new Map<string, number>();
  for (const m of memberRows) groupsJoined.set(m.profile_id, (groupsJoined.get(m.profile_id) ?? 0) + 1);
  const calendarsLinked = new Map<string, number>();
  for (const c of connectionRows) {
    if (c.status === "connected") calendarsLinked.set(c.profile_id, (calendarsLinked.get(c.profile_id) ?? 0) + 1);
  }

  const failing = connectionRows.filter(
    (c) => c.status === "connected" && (c.needs_reconnect || c.sync_error),
  ).length;

  return {
    stats: {
      users: users.length,
      groups: (groups ?? []).length,
      connectedAccounts: connectionRows.filter((c) => c.status === "connected").length,
      failingSyncs: failing,
      busyBlocks: busyBlocks ?? 0,
    },
    groups: (groups ?? []).map(
      (g: { id: string; name: string; created_at: string; created_by: string | null }) => ({
        id: g.id,
        name: g.name,
        createdAt: g.created_at,
        createdBy: g.created_by,
        createdByName: g.created_by ? name(g.created_by) : null,
        members: memberRows
          .filter((m) => m.group_id === g.id)
          .map((m) => ({ profileId: m.profile_id, name: name(m.profile_id), joinedAt: m.joined_at })),
      }),
    ),
    users: users
      .map((u) => ({
        id: u.id,
        name: name(u.id),
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        groups: groupsJoined.get(u.id) ?? 0,
        calendars: calendarsLinked.get(u.id) ?? 0,
      }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    usersTruncated: truncated,
    connections: connectionRows.map((c) => ({
      id: c.id,
      ownerId: c.profile_id,
      ownerName: name(c.profile_id),
      provider: c.provider,
      status: c.status,
      calendars: c.calendar_sources?.[0]?.count ?? 0,
      createdAt: c.created_at,
      lastSyncedAt: c.last_synced_at,
      lastSyncAttemptAt: c.last_sync_attempt_at,
      syncError: c.sync_error,
      needsReconnect: c.needs_reconnect,
    })),
  };
}

Deno.serve(async (req) => {
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
  const caller = await callerUser(req, db);
  if (!caller) return json({ error: "Please sign in again." }, 401);
  const isAdmin = isAdminId(caller.id, Deno.env.get("ADMIN_USER_IDS"));

  if (action === "status") return json({ isAdmin });
  if (!isAdmin) return json({ error: "Admins only." }, 403);

  try {
    switch (action) {
      case "overview": {
        return json(await overview(db));
      }

      case "deleteGroup": {
        const groupId = payload.groupId;
        if (typeof groupId !== "string") return json({ error: "groupId is required" }, 400);
        // Members and invites cascade off the group (friend_groups migration).
        const { data, error } = await db.from("friend_groups").delete().eq("id", groupId).select("id, name");
        if (error) throw error;
        if (!data || data.length === 0) return json({ error: "That group no longer exists." }, 404);
        console.log(`admin ${caller.id} deleted group ${groupId} ("${data[0].name}")`);
        return json({ outcome: "deleted" });
      }

      case "removeMember": {
        const { groupId, profileId } = payload;
        if (typeof groupId !== "string" || typeof profileId !== "string") {
          return json({ error: "groupId and profileId are required" }, 400);
        }
        // The same transaction as leaving, so removing the last member deletes
        // the group rather than leaving an empty one nobody can reach.
        const { data: outcome, error } = await db.rpc("leave_friend_group", {
          p_group_id: groupId,
          p_profile_id: profileId,
        });
        if (error) throw error;
        if (outcome === "not_a_member") return json({ error: "They are not in that group." }, 404);
        console.log(`admin ${caller.id} removed ${profileId} from group ${groupId}: ${outcome}`);
        return json({ outcome });
      }

      case "deleteUser": {
        const profileId = payload.profileId;
        if (typeof profileId !== "string") return json({ error: "profileId is required" }, 400);
        // Deleting yourself from here would be an accident, never the intent.
        if (profileId === caller.id) {
          return json({ error: "You can't delete your own account from admin mode." }, 400);
        }
        const { data: found, error: findErr } = await db.auth.admin.getUserById(profileId);
        if (findErr || !found?.user) return json({ error: "That account no longer exists." }, 404);

        // Which groups they are in, read before the account (and with it their
        // memberships) is gone.
        const { data: memberships, error: memberErr } = await db
          .from("group_members")
          .select("group_id")
          .eq("profile_id", profileId);
        if (memberErr) throw memberErr;
        const groupIds = (memberships ?? []).map((m: { group_id: string }) => m.group_id);

        // The account first: if this fails, nothing has changed at all. The
        // foreign keys then cascade everything else they own: calendar
        // accounts, stored credentials, busy times, memberships, their name.
        const { error: deleteErr } = await db.auth.admin.deleteUser(profileId);
        if (deleteErr) throw deleteErr;

        // A group they were alone in is now empty, which nobody can reach
        // (the same reason leave_friend_group deletes one). Clean those up.
        // Should this step fail, the account is still gone; the worst left
        // behind is an empty group, so it is logged rather than reported.
        let deletedGroups = 0;
        if (groupIds.length > 0) {
          const { data: remaining, error: remainingErr } = await db
            .from("group_members")
            .select("group_id")
            .in("group_id", groupIds);
          const stillUsed = new Set((remaining ?? []).map((m: { group_id: string }) => m.group_id));
          const empty = groupIds.filter((id) => !stillUsed.has(id));
          if (remainingErr) {
            console.error("admin deleteUser: couldn't check for empty groups", remainingErr);
          } else if (empty.length > 0) {
            const { error: emptyErr } = await db.from("friend_groups").delete().in("id", empty);
            if (emptyErr) console.error("admin deleteUser: couldn't delete empty groups", emptyErr);
            else deletedGroups = empty.length;
          }
        }

        console.log(
          `admin ${caller.id} deleted user ${profileId}; left ${groupIds.length} groups, ${deletedGroups} deleted as empty`,
        );
        return json({ outcome: "deleted", leftGroups: groupIds.length, deletedGroups });
      }

      case "syncConnection": {
        const connectionId = payload.connectionId;
        if (typeof connectionId !== "string") return json({ error: "connectionId is required" }, 400);
        const { data: target, error } = await db
          .from("calendar_connections")
          .select("id, provider, status")
          .eq("id", connectionId)
          .maybeSingle();
        if (error) throw error;
        if (!target) return json({ error: "That account no longer exists." }, 404);
        if (target.status !== "connected") return json({ error: "That account isn't connected." }, 400);
        let key: string;
        try {
          key = encryptionKeyFromEnv();
        } catch (err) {
          console.error("admin sync is not configured", err);
          return json({ error: "Syncing isn't set up on the server yet." }, 500);
        }
        console.log(`admin ${caller.id} re-synced connection ${connectionId}`);
        // Never throws; the outcome is recorded on the connection either way.
        return json(await syncConnection(db, target as SyncTarget, key));
      }

      default:
        return json({ error: `Unknown action "${action}"` }, 400);
    }
  } catch (err) {
    console.error(`admin ${action} failed`, err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
