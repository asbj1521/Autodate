import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Link2,
  Loader2,
  LogOut,
  Pencil,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { FaMicrosoft } from "react-icons/fa6";
import { SiApple, SiGoogle } from "react-icons/si";

import AppleCredentialsForm from "@/components/AppleCredentialsForm";
import GroupsSection, { type GroupConfirm } from "@/components/GroupsSection";
import IcsLinkForm from "@/components/IcsLinkForm";
import InlineTextEdit from "@/components/InlineTextEdit";
import NewGroupDialog from "@/components/NewGroupDialog";
import PasswordForm from "@/components/PasswordForm";
import ProviderCard, { type ProviderMeta } from "@/components/ProviderCard";
import TopNav from "@/components/TopNav";
import { displayName, useAuth } from "@/context/auth";
import { authErrorMessage } from "@/i18n/authError";
import { useT } from "@/i18n/lang";
import { avatarColor } from "@/lib/avatar";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/groups";
import { supabase } from "@/lib/supabase";
import {
  calendarStatusQuery,
  type CalendarConnectionStatus,
} from "@/api/calendarStatus";
import { adminStatusQuery } from "@/api/admin";
import {
  createGroup,
  createInvite,
  deleteGroup,
  groupsQuery,
  groupsQueryKey,
  leaveGroup,
  renameGroup,
  setDisplayName,
  whoAmIQuery,
  whoAmIQueryKey,
  type Group,
} from "@/api/groups";
import { callFunction } from "@/lib/supabaseFunctions";
import { cn } from "@/lib/utils";
import type { CalendarProvider } from "@/types";

/**
 * Every connection attempt for a provider, newest first (calendar-status
 * already orders them). Several accounts per provider can be connected at
 * once, so callers filter this into connected accounts and the latest attempt.
 */
function attemptsFor(
  connections: CalendarConnectionStatus[] | undefined,
  provider: CalendarProvider,
): CalendarConnectionStatus[] {
  return connections?.filter((c) => c.provider === provider) ?? [];
}

/**
 * Apple and the ICS link come first: they take a form to fill in,
 * so putting them ahead of the one-click Google/Outlook cards keeps the grid
 * from alternating between quick cards and ones that need typing.
 */
const PROVIDERS: (Omit<ProviderMeta, "label" | "help"> & { helpTo: string })[] = [
  {
    id: "apple",
    icon: <SiApple className="h-4 w-4 text-neutral-800" />,
    badgeClass: "bg-neutral-200",
    helpTo: "/help/connect-icloud",
  },
  {
    id: "ics",
    // Not a company, so a generic link icon rather than a brand mark.
    icon: <Link2 className="h-4 w-4 text-violet-700" />,
    badgeClass: "bg-violet-100",
    helpTo: "/help/connect-ics",
  },
  {
    id: "google",
    icon: <SiGoogle className="h-4 w-4" style={{ color: "#4285F4" }} />,
    badgeClass: "bg-blue-100",
    helpTo: "/help/connect-google",
  },
  {
    id: "outlook",
    // Simple Icons carries no Outlook-specific mark, so this is Microsoft's
    // own logo (the closest real brand mark available) rather than a letter.
    icon: <FaMicrosoft className="h-4 w-4" style={{ color: "#0078D4" }} />,
    badgeClass: "bg-sky-100",
    helpTo: "/help/connect-outlook",
  },
];

/**
 * Admin mode's panel, loaded only when someone actually opens it: nobody but
 * the admin ever downloads its code.
 */
const AdminPanel = lazy(() => import("@/components/AdminPanel"));

/**
 * The "Connect calendars" section of the user's profile.
 *
 * Google and Outlook connect through OAuth redirects. ICS links and Apple
 * have no consent screen, so their forms POST to an Edge Function directly
 * and show the outcome inline (Apple takes an app-specific password).
 */
export default function Profile() {
  const { user, signOut } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [appleFormOpen, setAppleFormOpen] = useState(false);
  const [appleSubmitting, setAppleSubmitting] = useState(false);
  // Bumped after each successful connect, to remount the form and drop the
  // typed password rather than leave it sitting in the page's state.
  const [appleAddedCount, setAppleAddedCount] = useState(0);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [appleResult, setAppleResult] = useState<string | null>(null);
  const [icsFormOpen, setIcsFormOpen] = useState(false);
  const [icsSubmitting, setIcsSubmitting] = useState(false);
  // Bumped after each successful add, to remount the form with empty fields.
  const [icsAddedCount, setIcsAddedCount] = useState(0);
  const [icsError, setIcsError] = useState<string | null>(null);
  const [icsResult, setIcsResult] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<{ id: string; message: string } | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; text: string } | null>(null);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: connections,
    isPending: statusPending,
    refetch: refetchStatus,
  } = useQuery(calendarStatusQuery(user.id));

  // A custom name (set below by clicking the avatar) wins over the
  // login-derived one; until that first load lands, fall back to the login
  // so the header isn't empty for a beat.
  const { data: whoAmI } = useQuery(whoAmIQuery(user.id));
  const name = whoAmI?.name ?? displayName(user);
  const [editingName, setEditingName] = useState(false);
  const setNameMutation = useMutation({
    mutationFn: setDisplayName,
    onSuccess: (data) => {
      queryClient.setQueryData(whoAmIQueryKey(user.id), data);
      setEditingName(false);
    },
  });

  // Your groups: fetched here (rather than inside GroupsSection) so the stat
  // strip above it can use the same count without a second request.
  const {
    data: groups,
    isPending: groupsPending,
    isError: groupsFailed,
  } = useQuery(groupsQuery(user.id));
  const [groupConfirm, setGroupConfirm] = useState<GroupConfirm | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);

  // Admin mode. The server says whether this person is an admin (and checks
  // again on every admin action); the page only uses the answer to decide
  // whether to show the button. Kept in the URL so a refresh stays put.
  const { data: isAdmin } = useQuery(adminStatusQuery(user.id));
  const adminMode = isAdmin === true && searchParams.get("mode") === "admin";
  const toggleAdminMode = () => {
    const next = new URLSearchParams(searchParams);
    if (adminMode) next.delete("mode");
    else next.set("mode", "admin");
    setSearchParams(next);
  };

  const onGroupsChanged = (data: { groups: Group[] }) => {
    queryClient.setQueryData(groupsQueryKey(user.id), data.groups);
    setGroupConfirm(null);
  };
  const leaveGroupMutation = useMutation({ mutationFn: leaveGroup, onSuccess: onGroupsChanged });
  const deleteGroupMutation = useMutation({ mutationFn: deleteGroup, onSuccess: onGroupsChanged });
  const renameGroupMutation = useMutation({
    mutationFn: ({ groupId, name }: { groupId: string; name: string }) => renameGroup(groupId, name),
    onSuccess: (data) => {
      onGroupsChanged(data);
      setRenamingGroupId(null);
    },
  });

  const renameActionError =
    renameGroupMutation.isError && renameGroupMutation.variables
      ? {
          groupId: renameGroupMutation.variables.groupId,
          message:
            renameGroupMutation.error instanceof Error
              ? renameGroupMutation.error.message
              : t.profile.couldntRename,
        }
      : null;

  function startRenameGroup(groupId: string) {
    renameGroupMutation.reset();
    setRenamingGroupId(groupId);
  }
  function cancelRenameGroup() {
    renameGroupMutation.reset();
    setRenamingGroupId(null);
  }

  const createGroupMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: (data) => {
      onGroupsChanged(data);
      setNewGroupOpen(false);
    },
  });

  // A fresh link every time "Share invite link" is pressed (see the `groups`
  // function); only one group's link is shown on screen at a time.
  const inviteMutation = useMutation({ mutationFn: (groupId: string) => createInvite(groupId) });
  const invite =
    inviteMutation.data && inviteMutation.variables === inviteGroupId ? inviteMutation.data : null;
  const inviteActionError =
    inviteMutation.isError && inviteMutation.variables === inviteGroupId
      ? inviteMutation.error instanceof Error
        ? inviteMutation.error.message
        : t.profile.couldntInvite
      : null;

  function shareInvite(groupId: string) {
    setInviteGroupId(groupId);
    inviteMutation.mutate(groupId);
  }
  function closeInvite() {
    setInviteGroupId(null);
  }

  const groupActionError =
    leaveGroupMutation.isError && leaveGroupMutation.variables
      ? {
          groupId: leaveGroupMutation.variables,
          message:
            leaveGroupMutation.error instanceof Error
              ? leaveGroupMutation.error.message
              : t.profile.couldntLeave,
        }
      : deleteGroupMutation.isError && deleteGroupMutation.variables
        ? {
            groupId: deleteGroupMutation.variables,
            message:
              deleteGroupMutation.error instanceof Error
                ? deleteGroupMutation.error.message
                : t.profile.couldntDelete,
          }
        : null;

  function askLeaveGroup(groupId: string) {
    leaveGroupMutation.reset();
    deleteGroupMutation.reset();
    setGroupConfirm({ groupId, action: "leave" });
  }
  function askDeleteGroup(groupId: string) {
    leaveGroupMutation.reset();
    deleteGroupMutation.reset();
    setGroupConfirm({ groupId, action: "delete" });
  }

  // The OAuth callbacks redirect back here with ?connected=<provider> or
  // ?error=<provider>:<reason>. Read it once, show a banner, then strip the
  // params so a page refresh doesn't repeat the message.
  const connectedParam = searchParams.get("connected");
  const errorParam = searchParams.get("error");
  useEffect(() => {
    if (!connectedParam && !errorParam) return;
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("error");
    setSearchParams(next, { replace: true });
    void refetchStatus();
    // Only run once per redirect landing, not on every searchParams identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedParam, errorParam]);

  const handleConnect = async (provider: CalendarProvider) => {
    if (provider === "google" || provider === "outlook") {
      // Ask for the consent-screen link with our login attached (a plain link
      // can't carry it), then go there. The server ties the link to us.
      setConnectError(null);
      try {
        const { url } = await callFunction<{ url: string }>(`oauth-${provider}-start`, {
          body: {},
          errorMessage: t.profile.couldntStartConnect,
        });
        window.location.assign(url);
      } catch (err) {
        setConnectError(err instanceof Error ? err.message : t.profile.couldntStartConnect);
      }
      return;
    }
    if (provider === "ics") {
      setIcsFormOpen(true);
      setIcsResult(null);
      setIcsError(null);
      return;
    }
    setAppleFormOpen(true);
    setAppleResult(null);
    setAppleError(null);
  };

  /**
   * Fetch every connected account's busy times now, instead of waiting for
   * the hourly run. The scheduling page reads the same data, so its cached
   * copy is marked stale too.
   */
  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { results } = await callFunction<{ results: { ok: boolean }[] }>("calendar-sync", {
        body: {},
        errorMessage: t.profile.couldntSync,
      });
      const failed = results.filter((r) => !r.ok).length;
      setSyncResult(
        results.length === 0
          ? { ok: true, text: t.profile.syncAllFresh }
          : failed === 0
            ? { ok: true, text: t.profile.syncedAccounts(results.length) }
            : { ok: false, text: t.profile.syncSomeFailed(failed, results.length) },
      );
      await refetchStatus();
      void queryClient.invalidateQueries({ queryKey: ["calendar-busy"] });
    } catch (err) {
      setSyncResult({ ok: false, text: err instanceof Error ? err.message : t.profile.couldntSync });
    } finally {
      setSyncing(false);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    setPasswordSubmitting(true);
    setPasswordError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setPasswordSubmitting(false);
    if (err) {
      setPasswordError(authErrorMessage(err, t));
    } else {
      setPasswordFormOpen(false);
      setPasswordSaved(true);
    }
  };

  const hasConnected = connections?.some((c) => c.status === "connected") ?? false;

  // The compact counts shown beside the name: how much Casy is actually doing
  // for this person, at a glance.
  const groupsCount = groupsPending ? null : (groups?.length ?? 0);
  const connectedCount = statusPending
    ? null
    : (connections?.filter((c) => c.status === "connected").length ?? 0);
  const busyCount = statusPending
    ? null
    : (connections?.filter((c) => c.status === "connected").reduce((sum, c) => sum + c.busyCount, 0) ??
      0);

  const handleIcsSubmit = async (url: string, name: string) => {
    setIcsSubmitting(true);
    setIcsError(null);
    setIcsResult(null);
    try {
      const body = await callFunction<{ label: string; busyBlocks: number }>(
        "calendar-add-ics",
        {
          body: { url, name },
          errorMessage: t.profile.couldntAddLink,
        },
      );
      setIcsResult(t.profile.icsAdded(body.label, body.busyBlocks));
      setIcsFormOpen(false);
      setIcsAddedCount((n) => n + 1);
      await refetchStatus();
    } catch (err) {
      setIcsError(err instanceof Error ? err.message : t.profile.couldntAddLink);
    } finally {
      setIcsSubmitting(false);
    }
  };

  const handleRemove = async (connectionId: string) => {
    setRemovingId(connectionId);
    setRemoveError(null);
    try {
      await callFunction("calendar-disconnect", {
        body: { connectionId },
        errorMessage: t.profile.couldntRemove,
      });
      setConfirmRemoveId(null);
      await refetchStatus();
    } catch (err) {
      // Leave the confirm panel open so the user can see why and retry.
      setRemoveError({
        id: connectionId,
        message: err instanceof Error ? err.message : t.profile.couldntRemove,
      });
    } finally {
      setRemovingId(null);
    }
  };

  const handleAppleSubmit = async (username: string, password: string) => {
    setAppleSubmitting(true);
    setAppleError(null);
    setAppleResult(null);
    try {
      const body = await callFunction<{
        label: string;
        calendars: number;
        busyBlocks: number;
        skippedEvents: number;
      }>("calendar-add-apple", {
        body: { username, password },
        errorMessage: t.profile.couldntIcloud,
      });
      setAppleResult(
        t.profile.appleConnected(body.label, body.calendars, body.busyBlocks, body.skippedEvents),
      );
      setAppleFormOpen(false);
      setAppleAddedCount((n) => n + 1);
      await refetchStatus();
    } catch (err) {
      setAppleError(err instanceof Error ? err.message : t.profile.couldntIcloud);
    } finally {
      setAppleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      <main className="px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        {/* Admin mode's entry point: centred on its own line, in the spot the
            "Back to scheduling" link used to occupy (the header nav now has
            its own link back, so that one was dropped). */}
        {isAdmin && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={toggleAdminMode}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition sm:text-sm",
                adminMode
                  ? "border bg-background text-foreground hover:bg-secondary"
                  : "bg-foreground uppercase text-background hover:opacity-90",
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              {adminMode ? t.profile.adminExit : t.profile.adminEnter}
            </button>
          </div>
        )}

        {/* Result of a just-completed OAuth round trip, if any */}
        <AnimatePresence initial={false}>
          {(connectedParam || errorParam) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 overflow-hidden"
            >
              {connectedParam ? (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t.profile.connected(
                      connectedParam in t.providers
                        ? t.providers[connectedParam as keyof typeof t.providers].label
                        : t.profile.yourCalendar,
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t.profile.couldntConnect(
                      // "google:access_denied": the reason after the colon, in words.
                      t.profile.oauthErrors[errorParam.split(":")[1] ?? ""] ?? errorParam,
                    )}
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {connectError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{connectError}</span>
          </div>
        )}

        {/* Who this is, plus a compact stat strip beside the name: three
            numbers that say at a glance how much Casy is actually doing for
            this person. Admin mode and the calendar overview each have their
            own link elsewhere now, so this card is just identity and counts. */}
        <div className="mt-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setNameMutation.reset();
                setEditingName(true);
              }}
              title={t.profile.changeName}
              className={cn(
                "group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold",
                avatarColor(0),
              )}
            >
              {name.charAt(0).toUpperCase()}
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Pencil className="h-5 w-5 text-white" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <InlineTextEdit
                  value={name}
                  maxLength={MAX_DISPLAY_NAME_LENGTH}
                  submitting={setNameMutation.isPending}
                  error={
                    setNameMutation.error instanceof Error
                      ? setNameMutation.error.message
                      : null
                  }
                  inputClassName="text-xl font-bold"
                  onSubmit={(newName) => setNameMutation.mutate(newName)}
                  onCancel={() => setEditingName(false)}
                />
              ) : (
                <p className="flex min-w-0 flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
                  <span className="truncate text-xl font-bold leading-tight text-foreground">
                    {name}
                  </span>
                  {/* Under a Google name, the email says which account this is;
                      when the email is already the name, it would only repeat it. */}
                  {user?.email && user.email !== name && (
                    <span className="truncate text-sm text-muted-foreground">{user.email}</span>
                  )}
                </p>
              )}
            </div>
            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:items-center">
              <div className="flex items-center justify-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <span className="text-sm font-bold text-foreground">
                  {groupsCount ?? "…"}
                </span>
                {t.profile.statGroups}
              </div>
              <div className="flex items-center justify-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <span className="text-sm font-bold text-foreground">
                  {connectedCount ?? "…"}
                </span>
                {t.profile.statCalendars}
              </div>
              <div className="flex items-center justify-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <span className="text-sm font-bold text-foreground">
                  {busyCount ?? "…"}
                </span>
                {t.profile.statBusy}
              </div>
            </div>
          </div>
        </div>

        {adminMode ? (
          <Suspense
            fallback={
              <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.profile.adminOpening}
              </p>
            }
          >
            <AdminPanel youId={user.id} />
          </Suspense>
        ) : (
          <>
            {/* Your groups */}
            <GroupsSection
              groups={groups}
              isPending={groupsPending}
              isError={groupsFailed}
              youId={user.id}
              confirm={groupConfirm}
              leavingId={leaveGroupMutation.isPending ? (leaveGroupMutation.variables ?? null) : null}
              deletingId={
                deleteGroupMutation.isPending ? (deleteGroupMutation.variables ?? null) : null
              }
              actionError={groupActionError}
              renamingId={renamingGroupId}
              renameSubmittingId={
                renameGroupMutation.isPending ? (renameGroupMutation.variables?.groupId ?? null) : null
              }
              renameError={renameActionError}
              inviteOpenId={inviteGroupId}
              inviteUrl={invite?.url ?? null}
              inviteExpiresAt={invite?.expiresAt ?? null}
              invitePending={inviteMutation.isPending}
              inviteError={inviteActionError}
              onAskLeave={askLeaveGroup}
              onAskDelete={askDeleteGroup}
              onCancel={() => setGroupConfirm(null)}
              onLeave={(groupId) => leaveGroupMutation.mutate(groupId)}
              onDelete={(groupId) => deleteGroupMutation.mutate(groupId)}
              onStartRename={startRenameGroup}
              onCancelRename={cancelRenameGroup}
              onSubmitRename={(groupId, name) => renameGroupMutation.mutate({ groupId, name })}
              onCreateGroup={() => {
                createGroupMutation.reset();
                setNewGroupOpen(true);
              }}
              onShareInvite={shareInvite}
              onCloseInvite={closeInvite}
            />
            <NewGroupDialog
              open={newGroupOpen}
              submitting={createGroupMutation.isPending}
              error={createGroupMutation.error instanceof Error ? createGroupMutation.error.message : null}
              onSubmit={(name) => createGroupMutation.mutate(name)}
              onCancel={() => setNewGroupOpen(false)}
            />

            {/* Connected calendars */}
            <section className="mt-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">{t.profile.connectedCalendars}</h2>
                {hasConnected && (
                  <button
                    type="button"
                    onClick={() => void handleSyncNow()}
                    disabled={syncing}
                    className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-3.5 py-1.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-60"
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {syncing ? t.profile.syncing : t.profile.syncNow}
                  </button>
                )}
              </div>
              {syncResult && (
                <p
                  className={cn(
                    "mt-2 flex items-center gap-2 text-sm",
                    syncResult.ok ? "text-emerald-800" : "text-red-800",
                  )}
                >
                  {syncResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0" />
                  )}
                  {syncResult.text}
                </p>
              )}

              <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
                {PROVIDERS.map(({ helpTo, ...provider }) => {
                  const attempts = attemptsFor(connections, provider.id);
                  const words = t.providers[provider.id];
                  return (
                    <ProviderCard
                      key={provider.id}
                      meta={{ ...provider, label: words.label, help: { to: helpTo, label: words.help } }}
                      accounts={attempts.filter((c) => c.status === "connected")}
                      latest={attempts[0]}
                      statusPending={statusPending}
                      formOpen={
                        (provider.id === "apple" && appleFormOpen) ||
                        (provider.id === "ics" && icsFormOpen)
                      }
                      confirmRemoveId={confirmRemoveId}
                      removingId={removingId}
                      removeError={removeError}
                      onConnect={() => void handleConnect(provider.id)}
                      onAskRemove={(id) => {
                        setRemoveError(null);
                        setConfirmRemoveId(id);
                      }}
                      onCancelRemove={() => setConfirmRemoveId(null)}
                      onRemove={(id) => void handleRemove(id)}
                    >
                      {/* ICS: paste a calendar feed link */}
                      {provider.id === "ics" && icsResult && (
                        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-800">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          {icsResult}
                        </p>
                      )}
                      {provider.id === "ics" && (
                        // The key clears the typed link after a successful add, so
                        // "Add another" starts from an empty form.
                        <IcsLinkForm
                          key={icsAddedCount}
                          open={icsFormOpen}
                          submitting={icsSubmitting}
                          error={icsError}
                          onSubmit={(url, name) => void handleIcsSubmit(url, name)}
                          onCancel={() => {
                            setIcsFormOpen(false);
                            setIcsError(null);
                          }}
                        />
                      )}

                      {/* Apple: Apple ID email + app-specific password */}
                      {provider.id === "apple" && appleResult && (
                        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-800">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          {appleResult}
                        </p>
                      )}
                      {provider.id === "apple" && (
                        <AppleCredentialsForm
                          key={appleAddedCount}
                          open={appleFormOpen}
                          submitting={appleSubmitting}
                          error={appleError}
                          onSubmit={(email, password) => void handleAppleSubmit(email, password)}
                          onCancel={() => {
                            setAppleFormOpen(false);
                            setAppleError(null);
                          }}
                        />
                      )}
                    </ProviderCard>
                  );
                })}
              </div>
            </section>

            {/* Password: works alongside Google and the email link, never
                replacing them. One form handles both setting a first
                password and changing an existing one, since there is no
                reliable way to tell from the client which case this is. */}
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-foreground">{t.profile.password}</h2>
              <div className="mt-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                {passwordSaved && !passwordFormOpen && (
                  <p className="mb-3 flex items-center gap-2 text-sm text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {t.profile.passwordSaved}
                  </p>
                )}
                {passwordFormOpen ? (
                  <PasswordForm
                    submitting={passwordSubmitting}
                    error={passwordError}
                    submitLabel={t.profile.savePassword}
                    submittingLabel={t.profile.saving}
                    onSubmit={(password) => void handlePasswordSubmit(password)}
                    onCancel={() => {
                      setPasswordFormOpen(false);
                      setPasswordError(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordSaved(false);
                      setPasswordError(null);
                      setPasswordFormOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary"
                  >
                    {t.profile.setPassword}
                  </button>
                )}
              </div>
            </section>
          </>
        )}

        {/* The nav has no room for Sign out on a phone, so it lives here. */}
        <button
          type="button"
          onClick={() => {
            void signOut().then(() => navigate("/"));
          }}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary sm:hidden"
        >
          <LogOut className="h-4 w-4" />
          {t.nav.signOut}
        </button>
      </main>
    </div>
  );
}
