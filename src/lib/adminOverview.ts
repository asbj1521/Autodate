/**
 * Apply an admin action to the admin overview the page already has, so the
 * row disappears the moment the server says it is done, rather than after a
 * full reload of every user, group and account. The real overview is still
 * fetched again in the background and replaces this patched one.
 */
import type { AdminOverview } from "@/api/admin";

/** Recount the numbers that follow from the lists; busy blocks can't be. */
function withStats(o: AdminOverview): AdminOverview {
  const connected = o.connections.filter((c) => c.status === "connected");
  return {
    ...o,
    stats: {
      ...o.stats,
      users: o.users.length,
      groups: o.groups.length,
      connectedAccounts: connected.length,
      failingSyncs: connected.filter((c) => c.needsReconnect || !!c.syncError).length,
    },
  };
}

/** Each user's group count, from the groups as they now stand. */
function withGroupCounts(o: AdminOverview): AdminOverview {
  const count = new Map<string, number>();
  for (const g of o.groups) for (const m of g.members) count.set(m.profileId, (count.get(m.profileId) ?? 0) + 1);
  return { ...o, users: o.users.map((u) => ({ ...u, groups: count.get(u.id) ?? 0 })) };
}

export function withoutGroup(o: AdminOverview, groupId: string): AdminOverview {
  return withStats(withGroupCounts({ ...o, groups: o.groups.filter((g) => g.id !== groupId) }));
}

/** One member out of one group; a group left empty goes too, as on the server. */
export function withoutMember(o: AdminOverview, groupId: string, profileId: string): AdminOverview {
  const groups = o.groups
    .map((g) => (g.id === groupId ? { ...g, members: g.members.filter((m) => m.profileId !== profileId) } : g))
    .filter((g) => g.members.length > 0);
  return withStats(withGroupCounts({ ...o, groups }));
}

/** An account and everything it owned: calendar accounts, memberships, groups it was alone in. */
export function withoutUser(o: AdminOverview, profileId: string): AdminOverview {
  const groups = o.groups
    .map((g) => ({ ...g, members: g.members.filter((m) => m.profileId !== profileId) }))
    .filter((g) => g.members.length > 0);
  return withStats(
    withGroupCounts({
      ...o,
      groups,
      users: o.users.filter((u) => u.id !== profileId),
      connections: o.connections.filter((c) => c.ownerId !== profileId),
    }),
  );
}
