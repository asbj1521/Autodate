import { describe, expect, it } from "vitest";

import type { AdminConnection, AdminOverview } from "@/api/admin";
import { withoutGroup, withoutMember, withoutUser } from "@/lib/adminOverview";

const user = (id: string, groups: number, calendars = 0) => ({
  id,
  name: id,
  createdAt: "2026-09-01T00:00:00.000Z",
  lastSignInAt: null,
  groups,
  calendars,
});

const member = (profileId: string) => ({ profileId, name: profileId, joinedAt: "2026-09-02T00:00:00.000Z" });

const connection = (id: string, ownerId: string, extra: Partial<AdminConnection> = {}): AdminConnection => ({
  id,
  ownerId,
  ownerName: ownerId,
  provider: "google",
  status: "connected",
  calendars: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  lastSyncedAt: null,
  lastSyncAttemptAt: null,
  syncError: null,
  needsReconnect: false,
  ...extra,
});

// Ann and Bo share "Both"; Bo is alone in "Solo"; Bo's account is failing.
const OVERVIEW: AdminOverview = {
  stats: { users: 2, groups: 2, connectedAccounts: 2, failingSyncs: 1, busyBlocks: 500 },
  groups: [
    { id: "both", name: "Both", createdAt: "", createdBy: "ann", createdByName: "ann", members: [member("ann"), member("bo")] },
    { id: "solo", name: "Solo", createdAt: "", createdBy: "bo", createdByName: "bo", members: [member("bo")] },
  ],
  users: [user("ann", 1, 1), user("bo", 2, 1)],
  usersTruncated: false,
  connections: [connection("c-ann", "ann"), connection("c-bo", "bo", { needsReconnect: true })],
};

describe("withoutGroup", () => {
  it("drops the group and lowers every member's group count", () => {
    const next = withoutGroup(OVERVIEW, "both");
    expect(next.groups.map((g) => g.id)).toEqual(["solo"]);
    expect(next.stats.groups).toBe(1);
    expect(next.users.map((u) => [u.id, u.groups])).toEqual([["ann", 0], ["bo", 1]]);
  });
});

describe("withoutMember", () => {
  it("takes one person out and leaves the group for the rest", () => {
    const next = withoutMember(OVERVIEW, "both", "bo");
    expect(next.groups.find((g) => g.id === "both")?.members.map((m) => m.profileId)).toEqual(["ann"]);
    expect(next.users.find((u) => u.id === "bo")?.groups).toBe(1);
  });

  it("deletes a group once its last member is out, as the server does", () => {
    const next = withoutMember(OVERVIEW, "solo", "bo");
    expect(next.groups.map((g) => g.id)).toEqual(["both"]);
    expect(next.stats.groups).toBe(1);
  });
});

describe("withoutUser", () => {
  it("removes the account, its calendar accounts, its memberships and groups it was alone in", () => {
    const next = withoutUser(OVERVIEW, "bo");
    expect(next.users.map((u) => u.id)).toEqual(["ann"]);
    expect(next.connections.map((c) => c.id)).toEqual(["c-ann"]);
    expect(next.groups.map((g) => [g.id, g.members.map((m) => m.profileId)])).toEqual([["both", ["ann"]]]);
    expect(next.stats).toEqual({ users: 1, groups: 1, connectedAccounts: 1, failingSyncs: 0, busyBlocks: 500 });
  });

  it("leaves the overview it was given untouched", () => {
    withoutUser(OVERVIEW, "bo");
    expect(OVERVIEW.users).toHaveLength(2);
    expect(OVERVIEW.groups[1].members).toHaveLength(1);
  });
});
