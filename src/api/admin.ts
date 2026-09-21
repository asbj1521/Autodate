/**
 * Admin mode, backed by the `admin` Edge Function.
 *
 * Whether someone is an admin is decided on the server (the ADMIN_USER_IDS
 * secret). The page only asks, so it knows whether to show the button; every
 * admin action is checked again by the function, so hiding the button is not
 * what keeps anyone else out.
 */
import { queryOptions } from "@tanstack/react-query";

import { callFunction } from "@/lib/supabaseFunctions";
import type { CalendarProvider } from "@/types";

export interface AdminStats {
  users: number;
  groups: number;
  connectedAccounts: number;
  failingSyncs: number;
  busyBlocks: number;
}

export interface AdminGroup {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  members: { profileId: string; name: string; joinedAt: string }[];
}

export interface AdminUser {
  id: string;
  name: string;
  createdAt: string;
  lastSignInAt: string | null;
  groups: number;
  calendars: number;
}

export interface AdminConnection {
  id: string;
  ownerId: string;
  ownerName: string;
  provider: CalendarProvider;
  status: "pending" | "connected" | "error";
  calendars: number;
  createdAt: string;
  lastSyncedAt: string | null;
  lastSyncAttemptAt: string | null;
  syncError: string | null;
  needsReconnect: boolean;
}

export interface AdminOverview {
  stats: AdminStats;
  groups: AdminGroup[];
  users: AdminUser[];
  /** True if there were more accounts than the function reads in one go. */
  usersTruncated: boolean;
  connections: AdminConnection[];
}

/** Whether the signed-in person is an admin. `userId` only keys the cache. */
export function adminStatusQuery(userId: string) {
  return queryOptions({
    queryKey: ["admin-status", userId],
    queryFn: async () =>
      (
        await callFunction<{ isAdmin: boolean }>("admin", {
          body: { action: "status" },
          errorMessage: "Couldn't check admin access",
        })
      ).isAdmin,
    // Being an admin changes only when the secret does, so asking now and then
    // is plenty. Not never: the answer is remembered across reloads (see
    // queryPersistence.ts), and a remembered "yes" must still be re-checked.
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function adminOverviewKey(userId: string) {
  return ["admin-overview", userId] as const;
}

/** Everything admin mode shows. */
export function adminOverviewQuery(userId: string) {
  return queryOptions({
    queryKey: adminOverviewKey(userId),
    queryFn: () =>
      callFunction<AdminOverview>("admin", {
        body: { action: "overview" },
        errorMessage: "Couldn't load the admin overview",
      }),
    staleTime: 30_000,
  });
}

export async function adminDeleteGroup(groupId: string): Promise<{ outcome: "deleted" }> {
  return await callFunction("admin", {
    body: { action: "deleteGroup", groupId },
    errorMessage: "Couldn't delete the group",
  });
}

/** `outcome` is "group_deleted" when that was the group's last member. */
export async function adminRemoveMember(args: {
  groupId: string;
  profileId: string;
}): Promise<{ outcome: "left" | "group_deleted" }> {
  return await callFunction("admin", {
    body: { action: "removeMember", ...args },
    errorMessage: "Couldn't remove them from the group",
  });
}

/**
 * Delete an account and everything it owns. Groups they were alone in are
 * deleted too; groups with other members carry on without them.
 */
export async function adminDeleteUser(
  profileId: string,
): Promise<{ outcome: "deleted"; leftGroups: number; deletedGroups: number }> {
  return await callFunction("admin", {
    body: { action: "deleteUser", profileId },
    errorMessage: "Couldn't delete the account",
  });
}

export async function adminSyncConnection(
  connectionId: string,
): Promise<{ ok: boolean; message?: string; busyBlocks?: number }> {
  return await callFunction("admin", {
    body: { action: "syncConnection", connectionId },
    errorMessage: "Couldn't sync that account",
  });
}
