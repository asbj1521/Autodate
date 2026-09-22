import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  CalendarOff,
  Check,
  Copy,
  Link2,
  Loader2,
  LogOut,
  UserPlus,
  Users,
} from "lucide-react";

import InfoTip from "@/components/InfoTip";
import { useAuth } from "@/context/auth";
import { avatarColor } from "@/lib/avatar";
import { inviteExpiryLabel } from "@/lib/groups";
import { cn } from "@/lib/utils";
import type { SchedulingGroup } from "@/hooks/useSchedulingGroups";

/**
 * Who is in the group you are scheduling for, how to get more people in, and
 * how to get out.
 *
 * The member list is honest about a gap real groups can have: someone who has
 * joined but linked no calendar yet, so nothing is known about their time.
 * That is said out loud rather than quietly folded into a result, because a
 * scheduling answer is only worth anything if you know whose calendars it was
 * based on. The example group is made up entirely, which is disclosed
 * elsewhere on the page rather than repeated here; a logged-out visitor gets
 * a sign-up nudge in this spot instead, since they are the ones who would
 * otherwise have nothing real to look at.
 */
export default function GroupPanel({
  group,
  busyLoading,
  inviteUrl,
  inviteExpiresAt,
  invitePending,
  inviteError,
  onInvite,
  leavePending,
  onLeave,
}: {
  group: SchedulingGroup;
  busyLoading: boolean;
  inviteUrl: string | null;
  inviteExpiresAt: string | null;
  invitePending: boolean;
  inviteError: string | null;
  onInvite: () => void;
  leavePending: boolean;
  onLeave: () => void;
}) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const memberCount = group.participants.length + group.waitingFor.length;
  const lastOneIn = memberCount <= 1;

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

  if (group.isExample) {
    // A signed-in person with no real groups yet already has a profile; the
    // nudge below is only for a logged-out visitor still looking at made-up
    // data.
    if (user) return null;
    return (
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <UserPlus className="h-4 w-4 text-primary" />
          Don't have a profile yet?
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign up to link your own calendar and make a group with real people.
        </p>
        <Link
          to="/sign-in?next=/&signup=1"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Users className="h-4 w-4 text-primary" />
        {memberCount === 1 ? "1 member" : `${memberCount} members`}
        <InfoTip label="What members can see">
          Everyone in a group can see each other's name and when they are busy. Nobody sees your
          email address, your calendars' names, or what any of your events are called. Casy never
          stores event titles at all.
        </InfoTip>
      </h3>

      <ul className="mt-3 flex flex-col gap-1.5">
        {group.participants.map((p, i) => (
          <li key={p.profileId} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                avatarColor(i),
              )}
            >
              {p.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="truncate text-foreground">{p.name}</span>
            {busyLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </li>
        ))}
        {group.waitingFor.map((m) => (
          <li key={m.profileId} className="flex items-center gap-2 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
              {m.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="truncate text-muted-foreground">{m.name}</span>
            <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
              <CalendarOff className="h-3 w-3" />
              no calendar yet
            </span>
          </li>
        ))}
      </ul>

      {group.waitingFor.length > 0 && (
        <p className="mt-3 rounded-lg bg-secondary p-2.5 text-xs text-muted-foreground">
          {group.waitingFor.length === 1
            ? `${group.waitingFor[0].name} has not linked a calendar yet, so they are left out of the search.`
            : `${group.waitingFor.length} members have not linked a calendar yet, so they are left out of the search.`}{" "}
          Counting them as free would make every date look better than it is.
        </p>
      )}

      <div className="mt-4 border-t pt-4">
        <button
          onClick={onInvite}
          disabled={invitePending}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          {invitePending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          {inviteUrl ? "New invite link" : "Invite people"}
        </button>

        <AnimatePresence initial={false}>
          {inviteUrl && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none"
                />
                <button
                  onClick={copyLink}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                    copied
                      ? "bg-primary/10 text-primary"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Anyone with this link can join the group. It works for{" "}
                {inviteExpiresAt ? inviteExpiryLabel(inviteExpiresAt) : "7 days"} and can be used
                by as many people as you send it to.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {inviteError && (
          <p className="mt-2 text-xs text-red-700">{inviteError}</p>
        )}
      </div>

      <div className="mt-4 border-t pt-4">
        {confirmingLeave ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-900">
              {lastOneIn
                ? `You are the last member. Leaving deletes "${group.name}" for good.`
                : `Leave "${group.name}"? You will need a new invite link to get back in.`}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={onLeave}
                disabled={leavePending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {leavePending && <Loader2 className="h-4 w-4 animate-spin" />}
                {lastOneIn ? "Delete group" : "Leave group"}
              </button>
              <button
                onClick={() => setConfirmingLeave(false)}
                disabled={leavePending}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingLeave(true)}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-red-700"
          >
            <LogOut className="h-4 w-4" />
            Leave group
          </button>
        )}
      </div>
    </div>
  );
}
