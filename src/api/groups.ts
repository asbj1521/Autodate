/**
 * Real friend groups, backed by the `groups` Edge Function.
 *
 * This replaces the generated groups in mockData.ts as the source of who you
 * schedule with. The generated ones stay on as a clearly labelled example for
 * anyone who has not made a group yet, so an empty account still has
 * something to look at.
 *
 * Nothing here says who is calling: the function takes that from the login
 * token the call carries. A group id in one of these requests only gets you
 * as far as your membership already does.
 */
import { queryOptions } from "@tanstack/react-query";

import { callFunction } from "@/lib/supabaseFunctions";
import type { BusyInterval, EventCategory } from "@/types";

/** One person in a group, as other members see them: a name, nothing more. */
export interface GroupMember {
  profileId: string;
  name: string;
  /** True for the signed-in person, so the list can say "you". */
  isYou: boolean;
  joinedAt: string;
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
  /**
   * Whoever made the group — null if their account is gone (created_by is set
   * null on delete, see the migration). Grants nothing except the ability to
   * delete the group outright; every other action is open to any member.
   */
  createdBy: string | null;
  members: GroupMember[];
}

/** What the group's members are busy with, as far as anyone else may know. */
export interface GroupBusy {
  /** Busy blocks per member id. A member with no calendar linked has none. */
  busy: Record<string, { start: string; end: string; category?: EventCategory }[]>;
  /** Whether each member has a working calendar at all. */
  connected: Record<string, boolean>;
  /** True if the backend stopped early because there were too many blocks. */
  truncated: boolean;
}

/**
 * The cache key for a person's groups, shared by every place that reads or
 * writes it (the query itself, and any mutation that hands back a fresh
 * group list) so a successful create/join/leave/delete can update the cache
 * directly instead of triggering a refetch.
 */
export function groupsQueryKey(userId: string) {
  return ["groups", userId] as const;
}

/**
 * Your groups. `userId` only keys the cache so one person's answer is never
 * served to the next; the function itself learns who is asking from the token.
 */
export function groupsQuery(userId: string) {
  return queryOptions({
    queryKey: groupsQueryKey(userId),
    queryFn: async (): Promise<Group[]> => {
      const body = await callFunction<{ groups?: Group[] }>("groups", {
        body: { action: "list" },
        errorMessage: "Couldn't load your groups",
      });
      return body.groups ?? [];
    },
    staleTime: 60_000,
  });
}

/** Everyone's busy time in one group, across the scheduling search window. */
export function groupBusyQuery(userId: string, groupId: string | null, from: string, to: string) {
  return queryOptions({
    queryKey: ["group-busy", userId, groupId, from, to],
    queryFn: async (): Promise<GroupBusy> =>
      await callFunction<GroupBusy>("groups", {
        body: { action: "busy", groupId, from, to },
        errorMessage: "Couldn't load the group's calendars",
      }),
    enabled: !!groupId,
    staleTime: 60_000,
  });
}

export async function createGroup(name: string): Promise<{ groups: Group[]; createdId: string }> {
  return await callFunction("groups", {
    body: { action: "create", name },
    errorMessage: "Couldn't create the group",
  });
}

/** A fresh invite link. Earlier links for the group keep working until they expire. */
export async function createInvite(groupId: string): Promise<{ url: string; expiresAt: string }> {
  return await callFunction("groups", {
    body: { action: "invite", groupId },
    errorMessage: "Couldn't make an invite link",
  });
}

/** The group behind an invite link, for the join page before anyone signs in. */
export async function previewInvite(
  token: string,
): Promise<{ group: { id: string; name: string; memberCount: number } }> {
  return await callFunction("groups", {
    body: { action: "preview", token },
    errorMessage: "Couldn't open that invite",
  });
}

export async function joinGroup(token: string): Promise<{ groups: Group[]; joinedId: string }> {
  return await callFunction("groups", {
    body: { action: "join", token },
    errorMessage: "Couldn't join the group",
  });
}

/** Leave a group. `outcome` is "group_deleted" when you were the last one in it. */
export async function leaveGroup(
  groupId: string,
): Promise<{ groups: Group[]; outcome: "left" | "group_deleted" }> {
  return await callFunction("groups", {
    body: { action: "leave", groupId },
    errorMessage: "Couldn't leave the group",
  });
}

/**
 * Delete a group outright, removing it (and everyone's membership) for good.
 * Only the person who created it can do this; anyone else should leave
 * instead.
 */
export async function deleteGroup(groupId: string): Promise<{ groups: Group[]; outcome: "deleted" }> {
  return await callFunction("groups", {
    body: { action: "delete", groupId },
    errorMessage: "Couldn't delete the group",
  });
}

/**
 * A real group in the shape the scheduling engine wants: participants each
 * carrying their own busy blocks.
 *
 * A member who has linked no calendar comes back with no blocks, which would
 * read as "free all year" and quietly make the whole group look available.
 * They are dropped from the participant list instead, and the page says who
 * is missing rather than counting them as free.
 */
export function participantsFromGroup(group: Group, data: GroupBusy | undefined) {
  const connected = group.members.filter((m) => data?.connected[m.profileId]);
  return {
    participants: connected.map((m) => ({
      profileId: m.profileId,
      name: m.isYou ? `${m.name} (you)` : m.name,
      busy: (data?.busy[m.profileId] ?? []) as BusyInterval[],
    })),
    /** Members left out because they have not linked a calendar yet. */
    waitingFor: group.members.filter((m) => !data?.connected[m.profileId]),
  };
}
