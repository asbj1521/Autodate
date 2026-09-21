import { useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import {
  adminDeleteGroup,
  adminDeleteUser,
  adminOverviewKey,
  adminOverviewQuery,
  adminRemoveMember,
  adminSyncConnection,
  type AdminConnection,
  type AdminGroup,
  type AdminUser,
} from "@/api/admin";
import StatTile from "@/components/StatTile";
import { plural, syncedAgo } from "@/lib/accountSummary";
import { avatarColor } from "@/lib/avatar";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarProvider } from "@/types";

type Tab = "groups" | "users" | "calendars";

/** What a confirm panel is open for: a whole group, or one member of one. */
type Confirm =
  | { kind: "group"; groupId: string }
  | { kind: "member"; groupId: string; profileId: string };

const PROVIDER_LABELS: Record<CalendarProvider, string> = {
  google: "Google",
  outlook: "Outlook",
  apple: "iCloud",
  ics: "Calendar link",
};

/** The error text of whichever mutation failed, for the row it failed on. */
function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Case-insensitive "does any of these contain the query". */
function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => f?.toLowerCase().includes(q));
}

/** A red inline "are you sure", the same shape as the rest of the profile page's. */
function ConfirmBox({
  text,
  action,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  text: string;
  action: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <p>{text}</p>
      {error && <p className="mt-2 font-medium">{error}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {action}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-sm text-red-900/80 transition hover:text-red-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function GroupRow({
  group,
  confirm,
  deleting,
  removingId,
  error,
  onAskDelete,
  onAskRemove,
  onCancel,
  onDelete,
  onRemove,
}: {
  group: AdminGroup;
  confirm: Confirm | null;
  deleting: boolean;
  removingId: string | null;
  error: string | null;
  onAskDelete: () => void;
  onAskRemove: (profileId: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onRemove: (profileId: string) => void;
}) {
  const removing = confirm?.kind === "member" ? group.members.find((m) => m.profileId === confirm.profileId) : null;
  const lastOne = group.members.length <= 1;

  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {plural(group.members.length, "member")} · made {formatDate(group.createdAt)}
            {group.createdByName && ` by ${group.createdByName}`}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {group.members.map((m, i) => (
              <li
                key={m.profileId}
                className="flex items-center gap-1.5 rounded-full border bg-background py-0.5 pl-0.5 pr-1.5 text-xs text-foreground"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                    avatarColor(i),
                  )}
                >
                  {m.name.trim().charAt(0).toUpperCase()}
                </span>
                {m.name}
                <button
                  type="button"
                  onClick={() => onAskRemove(m.profileId)}
                  title={`Remove ${m.name} from ${group.name}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition hover:bg-red-100 hover:text-red-700"
                >
                  {removingId === m.profileId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onAskDelete}
          title="Delete this group for everyone"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {confirm?.kind === "group" && (
        <ConfirmBox
          text={`Delete "${group.name}"? All ${plural(group.members.length, "member")} lose it right away, along with its invite links. This can't be undone.`}
          action="Delete group"
          pending={deleting}
          error={error}
          onConfirm={onDelete}
          onCancel={onCancel}
        />
      )}
      {removing && (
        <ConfirmBox
          text={
            lastOne
              ? `Remove ${removing.name}? They are the only member, so "${group.name}" is deleted too.`
              : `Remove ${removing.name} from "${group.name}"? They'll need a new invite link to get back in.`
          }
          action={lastOne ? "Remove and delete" : "Remove"}
          pending={removingId === removing.profileId}
          error={error}
          onConfirm={() => onRemove(removing.profileId)}
          onCancel={onCancel}
        />
      )}
    </li>
  );
}

/** What deleting one account takes with it, as the confirm step spells it out. */
interface UserImpact {
  /** Calendar accounts of any status: all of them go. */
  calendarAccounts: number;
  groups: number;
  /** Groups they are the only member of, which are deleted with them. */
  soleGroups: number;
}

function UserRow({
  user,
  index,
  isYou,
  impact,
  confirming,
  deleting,
  error,
  onAsk,
  onCancel,
  onDelete,
}: {
  user: AdminUser;
  index: number;
  isYou: boolean;
  impact: UserImpact;
  confirming: boolean;
  deleting: boolean;
  error: string | null;
  onAsk: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  // Typing the name is the guard against deleting the wrong row: the button
  // stays off until it matches, ignoring case and stray spaces.
  const nameMatches = typed.trim().toLowerCase() === user.name.trim().toLowerCase();

  const parts = [
    plural(impact.calendarAccounts, "calendar account"),
    impact.groups === 0
      ? "no groups"
      : impact.soleGroups > 0
        ? `${plural(impact.groups, "group membership")} (${impact.soleGroups} of them ${impact.soleGroups === 1 ? "a group" : "groups"} only they are in, deleted too)`
        : plural(impact.groups, "group membership"),
  ];

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            avatarColor(index),
          )}
        >
          {user.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
            {user.name}
            {isYou && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                You
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Joined {formatDate(user.createdAt)}
            {user.lastSignInAt && ` · last signed in ${formatDate(user.lastSignInAt)}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-4 text-right text-xs text-muted-foreground">
          <span>
            <span className="block text-sm font-semibold tabular-nums text-foreground">{user.groups}</span>
            groups
          </span>
          <span>
            <span
              className={cn(
                "block text-sm font-semibold tabular-nums",
                user.calendars === 0 ? "text-amber-700" : "text-foreground",
              )}
            >
              {user.calendars}
            </span>
            calendars
          </span>
        </div>
        {/* Never on your own row: the server refuses it too. */}
        {isYou ? (
          <span className="h-8 w-8 shrink-0" />
        ) : (
          <button
            type="button"
            onClick={() => {
              setTyped("");
              onAsk();
            }}
            title={`Delete ${user.name}'s account`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>
            Delete {user.name}'s account? This removes their {parts.join(" and ")}, along with every
            busy time Casy stored for them. Groups other people are in carry on without them. This
            can't be undone, and it isn't a ban: they can sign up again.
          </p>
          <label htmlFor={inputId} className="mt-3 block text-xs font-medium">
            Type <span className="font-semibold">{user.name}</span> to confirm
          </label>
          <input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            autoComplete="off"
            className="mt-1 w-full max-w-xs rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-red-300"
          />
          {error && <p className="mt-2 font-medium">{error}</p>}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting || !nameMatches}
              className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Delete account
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="text-sm text-red-900/80 transition hover:text-red-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ConnectionRow({
  connection,
  now,
  syncing,
  result,
  onSync,
}: {
  connection: AdminConnection;
  now: number;
  syncing: boolean;
  result: { ok: boolean; text: string } | null;
  onSync: () => void;
}) {
  const c = connection;
  const broken = c.status === "connected" && (c.needsReconnect || !!c.syncError);
  const synced = syncedAgo(c.lastSyncedAt, now);

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        {c.status !== "connected" ? (
          <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : broken ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {c.ownerName} <span className="font-normal text-muted-foreground">· {PROVIDER_LABELS[c.provider]}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {c.status === "connected"
              ? `${plural(c.calendars, "calendar")} · ${synced ?? "never synced"}`
              : c.status === "pending"
                ? "Connecting, never finished"
                : "Connecting failed"}
          </p>
          {c.needsReconnect ? (
            <p className="mt-0.5 text-xs font-medium text-amber-700">Needs the owner to reconnect.</p>
          ) : (
            c.syncError && <p className="mt-0.5 text-xs text-amber-700">{c.syncError}</p>
          )}
          {result && (
            <p className={cn("mt-0.5 text-xs font-medium", result.ok ? "text-emerald-700" : "text-red-700")}>
              {result.text}
            </p>
          )}
        </div>
        {c.status === "connected" && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            title="Sync this account now"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Admin mode: the whole of Casy at a glance, for the project owner only.
 *
 * Overview numbers first, then one tab each for groups (delete any, or remove
 * someone from one), users, and calendar health (re-sync an account). The
 * server decides who may see this and checks again on every action; see the
 * `admin` Edge Function.
 */
export default function AdminPanel({ youId }: { youId: string }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, refetch, isFetching } = useQuery(adminOverviewQuery(youId));
  const [tab, setTab] = useState<Tab>("groups");
  const [query, setQuery] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, { ok: boolean; text: string }>>({});
  // Read once: "synced 5 min ago" doesn't need to tick while the panel is open.
  const [now] = useState(Date.now);

  // Anything an admin changes can also change what the rest of the page (and
  // the scheduling page) shows for the admin's own account.
  const afterChange = async () => {
    setConfirm(null);
    setConfirmUserId(null);
    await queryClient.invalidateQueries({ queryKey: adminOverviewKey(youId) });
    void queryClient.invalidateQueries({ queryKey: ["groups"] });
    void queryClient.invalidateQueries({ queryKey: ["group-busy"] });
  };

  const deleteMutation = useMutation({ mutationFn: adminDeleteGroup, onSuccess: afterChange });
  const removeMutation = useMutation({ mutationFn: adminRemoveMember, onSuccess: afterChange });
  const deleteUserMutation = useMutation({
    mutationFn: adminDeleteUser,
    onSuccess: async (res, profileId) => {
      const who = data?.users.find((u) => u.id === profileId)?.name ?? "The account";
      setNotice(
        `${who} was deleted` +
          (res.deletedGroups > 0 ? `, along with ${plural(res.deletedGroups, "group")} only they were in.` : "."),
      );
      await afterChange();
    },
  });
  const syncMutation = useMutation({
    mutationFn: adminSyncConnection,
    onSuccess: (res, connectionId) => {
      setSyncResults((r) => ({
        ...r,
        [connectionId]: res.ok
          ? { ok: true, text: `Synced: ${plural(res.busyBlocks ?? 0, "busy block")}.` }
          : { ok: false, text: res.message ?? "Sync failed." },
      }));
      void queryClient.invalidateQueries({ queryKey: adminOverviewKey(youId) });
      void queryClient.invalidateQueries({ queryKey: ["calendar-status"] });
    },
    onError: (err, connectionId) => {
      setSyncResults((r) => ({ ...r, [connectionId]: { ok: false, text: messageOf(err, "Sync failed.") } }));
    },
  });

  function ask(next: Confirm) {
    deleteMutation.reset();
    removeMutation.reset();
    setConfirm(next);
  }
  function askDeleteUser(profileId: string) {
    deleteUserMutation.reset();
    setNotice(null);
    setConfirmUserId(profileId);
  }

  /** What deleting this account would take with it, from the loaded overview. */
  const impactOf = (profileId: string): UserImpact => {
    const theirGroups = (data?.groups ?? []).filter((g) => g.members.some((m) => m.profileId === profileId));
    return {
      calendarAccounts: (data?.connections ?? []).filter((c) => c.ownerId === profileId).length,
      groups: theirGroups.length,
      soleGroups: theirGroups.filter((g) => g.members.length === 1).length,
    };
  };

  const groupError = (groupId: string) =>
    deleteMutation.isError && deleteMutation.variables === groupId
      ? messageOf(deleteMutation.error, "Couldn't delete the group")
      : removeMutation.isError && removeMutation.variables?.groupId === groupId
        ? messageOf(removeMutation.error, "Couldn't remove them")
        : null;

  const groups = useMemo(
    () =>
      (data?.groups ?? []).filter((g) =>
        matches(query, g.name, g.createdByName, ...g.members.map((m) => m.name)),
      ),
    [data, query],
  );
  const users = useMemo(
    () =>
      (data?.users ?? []).filter(
        (u) => matches(query, u.name) && (!problemsOnly || u.calendars === 0),
      ),
    [data, query, problemsOnly],
  );
  const connections = useMemo(
    () =>
      (data?.connections ?? []).filter(
        (c) =>
          matches(query, c.ownerName, PROVIDER_LABELS[c.provider]) &&
          (!problemsOnly || c.status !== "connected" || c.needsReconnect || !!c.syncError),
      ),
    [data, query, problemsOnly],
  );

  const tabs: { id: Tab; label: string; count: number | undefined }[] = [
    { id: "groups", label: "Groups", count: data?.groups.length },
    { id: "users", label: "Users", count: data?.users.length },
    { id: "calendars", label: "Calendar health", count: data?.connections.length },
  ];
  const problemsLabel = tab === "users" ? "Only users without a calendar" : "Only problems";
  const stats = data?.stats;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Admin
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            All of Casy, for you only. Names, dates and sync health; never emails, busy times or
            event details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-3.5 py-1.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Users" value={stats?.users ?? null} />
        <StatTile label="Groups" value={stats?.groups ?? null} />
        <StatTile label="Connected accounts" value={stats?.connectedAccounts ?? null} />
        <StatTile label="Failing syncs" value={stats?.failingSyncs ?? null} alert={!!stats?.failingSyncs} />
        <StatTile label="Busy blocks stored" value={stats?.busyBlocks ?? null} />
      </div>

      {isError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{messageOf(error, "Couldn't load the admin overview")}</span>
        </div>
      )}

      {notice && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} title="Dismiss" className="text-emerald-900/70 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-full bg-secondary p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setConfirm(null);
                  setConfirmUserId(null);
                  setProblemsOnly(false);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
                  tab === t.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {tab !== "groups" && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={problemsOnly}
                  onChange={(e) => setProblemsOnly(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                {problemsLabel}
              </label>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name"
                className="w-48 rounded-full border bg-background py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>

        {isPending ? (
          <p className="mt-4 flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading everything…
          </p>
        ) : tab === "groups" ? (
          groups.length === 0 ? (
            <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
              {query ? "No group matches that." : "Nobody has made a group yet."}
            </p>
          ) : (
            <ul className="mt-4 divide-y border-t">
              {groups.map((g) => (
                <GroupRow
                  key={g.id}
                  group={g}
                  confirm={confirm?.groupId === g.id ? confirm : null}
                  deleting={deleteMutation.isPending && deleteMutation.variables === g.id}
                  removingId={
                    removeMutation.isPending && removeMutation.variables?.groupId === g.id
                      ? removeMutation.variables.profileId
                      : null
                  }
                  error={groupError(g.id)}
                  onAskDelete={() => ask({ kind: "group", groupId: g.id })}
                  onAskRemove={(profileId) => ask({ kind: "member", groupId: g.id, profileId })}
                  onCancel={() => setConfirm(null)}
                  onDelete={() => deleteMutation.mutate(g.id)}
                  onRemove={(profileId) => removeMutation.mutate({ groupId: g.id, profileId })}
                />
              ))}
            </ul>
          )
        ) : tab === "users" ? (
          <>
            {data?.usersTruncated && (
              <p className="mt-4 text-xs text-amber-700">
                Showing the first {data.users.length.toLocaleString("en-GB")} accounts only.
              </p>
            )}
            {users.length === 0 ? (
              <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">No user matches that.</p>
            ) : (
              <ul className="mt-4 divide-y border-t">
                {users.map((u, i) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    index={i}
                    isYou={u.id === youId}
                    impact={impactOf(u.id)}
                    confirming={confirmUserId === u.id}
                    deleting={deleteUserMutation.isPending && deleteUserMutation.variables === u.id}
                    error={
                      deleteUserMutation.isError && deleteUserMutation.variables === u.id
                        ? messageOf(deleteUserMutation.error, "Couldn't delete the account")
                        : null
                    }
                    onAsk={() => askDeleteUser(u.id)}
                    onCancel={() => setConfirmUserId(null)}
                    onDelete={() => deleteUserMutation.mutate(u.id)}
                  />
                ))}
              </ul>
            )}
          </>
        ) : connections.length === 0 ? (
          <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
            {problemsOnly ? "No problems. Every account is syncing." : "No calendar accounts match that."}
          </p>
        ) : (
          <ul className="mt-4 divide-y border-t">
            {connections.map((c) => (
              <ConnectionRow
                key={c.id}
                connection={c}
                now={now}
                syncing={syncMutation.isPending && syncMutation.variables === c.id}
                result={syncResults[c.id] ?? null}
                onSync={() => syncMutation.mutate(c.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
