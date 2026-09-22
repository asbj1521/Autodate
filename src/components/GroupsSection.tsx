import { useState } from "react";
import { Check, Copy, Link2, Loader2, LogOut, Pencil, Trash2, Users } from "lucide-react";

import type { Group } from "@/api/groups";
import InfoTip from "@/components/InfoTip";
import InlineTextEdit from "@/components/InlineTextEdit";
import { avatarColor } from "@/lib/avatar";
import { useLang, useT } from "@/i18n/lang";
import { formatMonthYear } from "@/lib/format";
import { inviteExpiryLabel, MAX_GROUP_NAME_LENGTH } from "@/lib/groups";
import { cn } from "@/lib/utils";

/** Which group's confirm panel is open, and for which action. */
export interface GroupConfirm {
  groupId: string;
  action: "leave" | "delete";
}

/** One group: its member avatars, the rename control, and the leave/delete controls. */
function GroupRow({
  group,
  youId,
  confirm,
  leaving,
  deleting,
  error,
  isRenaming,
  renaming,
  renameError,
  inviteOpen,
  inviteUrl,
  inviteExpiresAt,
  invitePending,
  inviteError,
  onAskLeave,
  onAskDelete,
  onCancel,
  onLeave,
  onDelete,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onShareInvite,
  onCloseInvite,
}: {
  group: Group;
  youId: string;
  confirm: GroupConfirm | null;
  leaving: boolean;
  deleting: boolean;
  error: string | null;
  isRenaming: boolean;
  renaming: boolean;
  renameError: string | null;
  inviteOpen: boolean;
  inviteUrl: string | null;
  inviteExpiresAt: string | null;
  invitePending: boolean;
  inviteError: string | null;
  onAskLeave: () => void;
  onAskDelete: () => void;
  onCancel: () => void;
  onLeave: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSubmitRename: (name: string) => void;
  onShareInvite: () => void;
  onCloseInvite: () => void;
}) {
  const { lang } = useLang();
  const t = useT();
  const isCreator = group.createdBy === youId;
  // Leaving a group you're the only member of already deletes it (see
  // useSchedulingGroups / leave_friend_group), so a separate delete button
  // would just be a second way to do the same thing.
  const soleMember = group.members.length <= 1;
  const canDelete = isCreator && !soleMember;
  const busy = leaving || deleting;
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the link is on screen to copy by hand.
    }
  }

  return (
    <li className="py-4">
      {/* On a phone the actions wrap onto their own line under the name, so
          the name isn't squeezed down to a few letters. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3 sm:flex-nowrap">
        {/* Fixed width regardless of member count (1 to 4 avatars, plus a
            "+N" badge past 4), so the group name starts at the same spot
            on every row instead of drifting with the avatar count. Right
            aligned so the avatars sit right next to the name; any leftover
            space lands before the avatars instead of between them and the
            name. */}
        <div className="flex w-32 shrink-0 justify-end -space-x-2">
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
          {isRenaming ? (
            <InlineTextEdit
              value={group.name}
              maxLength={MAX_GROUP_NAME_LENGTH}
              submitting={renaming}
              error={renameError}
              onSubmit={onSubmitRename}
              onCancel={onCancelRename}
            />
          ) : (
            <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground">
              <span className="truncate">{group.name}</span>
              <button
                type="button"
                onClick={onStartRename}
                title={t.groupsSection.renameTitle}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.counts.members(group.members.length)} ·{" "}
            {t.groupsSection.made(formatMonthYear(group.createdAt, lang))}
          </p>
        </div>

        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onShareInvite}
            title={t.groupsSection.inviteTitle}
            className="flex items-center gap-1.5 rounded-full border bg-background px-3.5 py-1.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <Link2 className="h-4 w-4" />
            {t.groupsSection.inviteLink}
          </button>
          <button
            type="button"
            onClick={onAskLeave}
            title={t.groupsSection.leaveTitle}
            className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
          {/* Always reserve this button's space, even when it doesn't apply
              to this group, so the invite-link button lines up at the same
              spot on every row instead of drifting with who can delete. */}
          <button
            type="button"
            onClick={canDelete ? onAskDelete : undefined}
            title={canDelete ? t.groupsSection.deleteTitle : undefined}
            aria-hidden={!canDelete}
            tabIndex={canDelete ? 0 : -1}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-red-50 hover:text-red-700",
              !canDelete && "invisible",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {inviteOpen && (
        <div className="mt-3 rounded-lg border bg-secondary/50 p-3">
          {inviteUrl ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                    copied
                      ? "bg-primary/10 text-primary"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? t.common.copied : t.common.copy}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {t.groupsSection.inviteShort(
                    inviteExpiresAt
                      ? inviteExpiryLabel(inviteExpiresAt, t.inviteExpiry)
                      : t.inviteExpiry.days(7),
                  )}
                </p>
                <button
                  type="button"
                  onClick={onCloseInvite}
                  className="shrink-0 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  {t.groupsSection.done}
                </button>
              </div>
            </>
          ) : invitePending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.groupsSection.makingLink}
            </p>
          ) : (
            <p className="text-sm text-red-700">{inviteError ?? t.groupsSection.linkFailed}</p>
          )}
        </div>
      )}

      {confirm && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>
            {confirm.action === "delete"
              ? t.groupsSection.deleteConfirm(group.name, group.members.length)
              : soleMember
                ? t.groupsSection.leaveSole(group.name)
                : t.groupPanel.leaveConfirm(group.name)}
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
              {confirm.action === "delete" || soleMember
                ? t.groupPanel.deleteGroup
                : t.groupPanel.leaveGroup}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-sm text-red-900/80 transition hover:text-red-900"
            >
              {t.common.cancel}
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
  renamingId,
  renameSubmittingId,
  renameError,
  inviteOpenId,
  inviteUrl,
  inviteExpiresAt,
  invitePending,
  inviteError,
  onAskLeave,
  onAskDelete,
  onCancel,
  onLeave,
  onDelete,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onCreateGroup,
  onShareInvite,
  onCloseInvite,
}: {
  groups: Group[] | undefined;
  isPending: boolean;
  isError: boolean;
  youId: string;
  confirm: GroupConfirm | null;
  leavingId: string | null;
  deletingId: string | null;
  actionError: { groupId: string; message: string } | null;
  /** The group whose name is currently open for editing, if any. */
  renamingId: string | null;
  renameSubmittingId: string | null;
  renameError: { groupId: string; message: string } | null;
  /** The group whose invite link is currently shown, if any (one at a time). */
  inviteOpenId: string | null;
  inviteUrl: string | null;
  inviteExpiresAt: string | null;
  invitePending: boolean;
  inviteError: string | null;
  onAskLeave: (groupId: string) => void;
  onAskDelete: (groupId: string) => void;
  onCancel: () => void;
  onLeave: (groupId: string) => void;
  onDelete: (groupId: string) => void;
  onStartRename: (groupId: string) => void;
  onCancelRename: () => void;
  onSubmitRename: (groupId: string, name: string) => void;
  onCreateGroup: () => void;
  onShareInvite: (groupId: string) => void;
  onCloseInvite: () => void;
}) {
  const t = useT();
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
          {t.groupsSection.title}
          <InfoTip label={t.groupPanel.whatMembersSee}>{t.groupPanel.whatMembersSeeBody}</InfoTip>
        </h2>
        <button
          type="button"
          onClick={onCreateGroup}
          className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-3.5 py-1.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
        >
          <Users className="h-4 w-4" />
          {t.groupsSection.makeGroup}
        </button>
      </div>

      {isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t.groupsSection.loading}
        </p>
      ) : isError ? (
        <p className="mt-4 text-sm text-red-700">{t.groupsSection.loadFailed}</p>
      ) : !groups || groups.length === 0 ? (
        <p className="mt-4 rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
          {t.groupsSection.empty(
            <button
              type="button"
              onClick={onCreateGroup}
              className="font-medium text-foreground underline underline-offset-2"
            >
              {t.groupsSection.makeOne}
            </button>,
          )}
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
              isRenaming={renamingId === g.id}
              renaming={renameSubmittingId === g.id}
              renameError={renameError?.groupId === g.id ? renameError.message : null}
              inviteOpen={inviteOpenId === g.id}
              inviteUrl={inviteOpenId === g.id ? inviteUrl : null}
              inviteExpiresAt={inviteOpenId === g.id ? inviteExpiresAt : null}
              invitePending={inviteOpenId === g.id && invitePending}
              inviteError={inviteOpenId === g.id ? inviteError : null}
              onAskLeave={() => onAskLeave(g.id)}
              onAskDelete={() => onAskDelete(g.id)}
              onCancel={onCancel}
              onLeave={() => onLeave(g.id)}
              onDelete={() => onDelete(g.id)}
              onStartRename={() => onStartRename(g.id)}
              onCancelRename={onCancelRename}
              onSubmitRename={(name) => onSubmitRename(g.id, name)}
              onShareInvite={() => onShareInvite(g.id)}
              onCloseInvite={onCloseInvite}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
