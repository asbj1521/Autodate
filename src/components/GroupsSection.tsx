import { Link } from "react-router-dom";
import { Loader2, LogOut, Trash2, Users } from "lucide-react";

import type { Group } from "@/api/groups";
import InfoTip from "@/components/InfoTip";
import { plural } from "@/lib/accountSummary";
import { avatarColor } from "@/lib/avatar";
import { formatMonthYear } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Which group's confirm panel is open, and for which action. */
export interface GroupConfirm {
  groupId: string;
  action: "leave" | "delete";
}

/** One group: its member avatars, and the leave/delete controls. */
function GroupRow({
  group,
  youId,
  confirm,
  leaving,
  deleting,
  error,
  onAskLeave,
  onAskDelete,
  onCancel,
  onLeave,
  onDelete,
}: {
  group: Group;
  youId: string;
  confirm: GroupConfirm | null;
  leaving: boolean;
  deleting: boolean;
  error: string | null;
  onAskLeave: () => void;
  onAskDelete: () => void;
  onCancel: () => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  const isCreator = group.createdBy === youId;
  // Leaving a group you're the only member of already deletes it (see
  // useSchedulingGroups / leave_friend_group), so a separate delete button
  // would just be a second way to do the same thing.
  const soleMember = group.members.length <= 1;
  const busy = leaving || deleting;

  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <div className="flex -space-x-2">
          {group.members.slice(0, 4).map((m, i) => (
            <span
              key={m.profileId}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-card text-xs font-semibold",
                avatarColor(i),
              )}
              title={m.name}
            >
              {m.name.trim().charAt(0).toUpperCase()}
            </span>
          ))}
          {group.members.length > 4 && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-card bg-secondary text-xs font-semibold text-muted-foreground">
              +{group.members.length - 4}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            <span className="truncate">{group.name}</span>
            {isCreator && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                You made this
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {plural(group.members.length, "member")} · made {formatMonthYear(group.createdAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onAskLeave}
            title="Leave this group"
            className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
          {isCreator && !soleMember && (
            <button
              type="button"
              onClick={onAskDelete}
              title="Delete this group for everyone"
              className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {confirm && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>
            {confirm.action === "delete"
              ? `Delete "${group.name}" for everyone? All ${plural(group.members.length, "member")} lose access right away.`
              : soleMember
                ? `Leave "${group.name}"? You're the only member, so this deletes it for good.`
                : `Leave "${group.name}"? You'll need a new invite link to get back in.`}
          </p>
          {error && <p className="mt-2 font-medium">{error}</p>}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={confirm.action === "delete" ? onDelete : onLeave}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirm.action === "delete" || soleMember ? "Delete group" : "Leave group"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
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

/**
 * The profile page's "Your groups": every group you're in, who else is in
 * each one, and a way out — leave any of them, or delete one you made
 * outright (which removes it for every member, not just you).
 */
export default function GroupsSection({
  groups,
  isPending,
  isError,
  youId,
  confirm,
  leavingId,
  deletingId,
  actionError,
  onAskLeave,
  onAskDelete,
  onCancel,
  onLeave,
  onDelete,
}: {
  groups: Group[] | undefined;
  isPending: boolean;
  isError: boolean;
  youId: string;
  confirm: GroupConfirm | null;
  leavingId: string | null;
  deletingId: string | null;
  actionError: { groupId: string; message: string } | null;
  onAskLeave: (groupId: string) => void;
  onAskDelete: (groupId: string) => void;
  onCancel: () => void;
  onLeave: (groupId: string) => void;
  onDelete: (groupId: string) => void;
}) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
            Your groups
            <InfoTip label="What members can see">
              Everyone in a group can see each other's name and when they are busy. Nobody sees
              your email address, your calendars' names, or what any of your events are called.
            </InfoTip>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Leave any group, or delete one you made — that removes it for everyone in it.
          </p>
        </div>
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-3.5 py-1.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
        >
          <Users className="h-4 w-4" />
          Make a group
        </Link>
      </div>

      {isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your groups…
        </p>
      ) : isError ? (
        <p className="mt-4 text-sm text-red-700">Couldn't load your groups.</p>
      ) : !groups || groups.length === 0 ? (
        <p className="mt-4 rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
          You're not in a group yet.{" "}
          <Link to="/" className="font-medium text-foreground underline underline-offset-2">
            Make one from the scheduling page
          </Link>{" "}
          and invite people in.
        </p>
      ) : (
        <ul className="mt-4 divide-y border-t">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              youId={youId}
              confirm={confirm?.groupId === g.id ? confirm : null}
              leaving={leavingId === g.id}
              deleting={deletingId === g.id}
              error={actionError?.groupId === g.id ? actionError.message : null}
              onAskLeave={() => onAskLeave(g.id)}
              onAskDelete={() => onAskDelete(g.id)}
              onCancel={onCancel}
              onLeave={() => onLeave(g.id)}
              onDelete={() => onDelete(g.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
