import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import type { CalendarConnectionStatus } from "@/api/calendarStatus";
import InfoTip from "@/components/InfoTip";
import { calendarNames, hasDistinctCalendarNames, plural, syncedAgo } from "@/lib/accountSummary";
import { cn } from "@/lib/utils";
import type { CalendarProvider } from "@/types";

export interface ProviderMeta {
  id: CalendarProvider;
  label: string;
  /** The brand's own mark, not a generic icon: a real logo, not an initial. */
  icon: ReactNode;
  badgeClass: string;
  /** Shown behind the (i), not on the card. Omit when `help` is set. */
  description?: string;
  /** A route to a longer guide, shown as a button beside the label instead of the (i). */
  help?: { to: string; label: string };
}

/** What "remove" explains, since each provider revokes access somewhere different. */
function RemoveNote({ provider, label }: { provider: CalendarProvider; label: string | null }) {
  if (provider === "ics") {
    return (
      <>
        Remove {label ?? "this link"}? Its synced busy times and the saved link are deleted from
        Casy. The link itself stays valid at its source until you regenerate it there.
      </>
    );
  }
  if (provider === "apple") {
    return (
      <>
        Remove {label ?? "this account"}? Its synced busy times and the saved password are deleted
        from Casy. To also revoke the password itself, delete it under App-Specific Passwords
        at account.apple.com.
      </>
    );
  }
  return (
    <>
      Remove {label ?? "this account"}? Its synced busy times are deleted from Casy. To also
      revoke Casy's access, remove it in that account's connected-apps settings at{" "}
      {provider === "google" ? "Google" : "Microsoft"}.
    </>
  );
}

/** One connected account: its label, a one-line summary, and its actions. */
function AccountRow({
  account,
  provider,
  confirming,
  removing,
  removeError,
  onReconnect,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  account: CalendarConnectionStatus;
  provider: CalendarProvider;
  confirming: boolean;
  removing: boolean;
  removeError: string | null;
  onReconnect: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}) {
  const [namesOpen, setNamesOpen] = useState(false);
  const count = account.calendar_sources.length;
  // The clock is read once, when the row appears: rendering must not depend
  // on the time it happens to run, and minutes-level freshness is plenty.
  const [now] = useState(Date.now);
  const synced = syncedAgo(account.last_synced_at, now);
  const reconnect = account.needs_reconnect;
  // Names are only worth a click when they say more than the row's own title.
  const expandable = hasDistinctCalendarNames(account);

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        {reconnect ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {account.account_label ?? "unknown account"}
          </p>
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            {expandable ? (
              <button
                type="button"
                onClick={() => setNamesOpen((o) => !o)}
                aria-expanded={namesOpen}
                className="inline-flex items-center gap-0.5 transition hover:text-foreground"
              >
                {plural(count, "calendar")}
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", namesOpen && "rotate-180")}
                />
              </button>
            ) : (
              <span>{plural(count, "calendar")}</span>
            )}
            <span>· {plural(account.busyCount, "busy block")}</span>
            {synced && <span>· {synced}</span>}
            {/* A temporary failure: the busy times shown are the last good
                ones and the next run retries, so this stays quiet. */}
            {account.sync_error && !reconnect && (
              <span className="text-amber-700" title={account.sync_error}>
                · last sync failed, retrying
              </span>
            )}
          </p>
          {reconnect && (
            <p className="mt-0.5 text-xs font-medium text-amber-700">
              {provider === "ics"
                ? "This link stopped working. Remove it and add it again."
                : "Access expired. Reconnect this account to keep it in sync."}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {provider !== "ics" && (
            <button
              type="button"
              onClick={onReconnect}
              title="Reconnect (pick this account again)"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border transition",
                reconnect
                  ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onAskRemove}
            title="Remove this account"
            className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {namesOpen && (
        <ul className="mt-2 flex flex-wrap gap-1.5 pl-7">
          {calendarNames(account).map((name, i) => (
            <li
              key={account.calendar_sources[i].id}
              className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground"
            >
              {name}
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>
            <RemoveNote provider={provider} label={account.account_label} />
          </p>
          {removeError && <p className="mt-2 font-medium">{removeError}</p>}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onRemove}
              disabled={removing}
              className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {removing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Remove
            </button>
            <button
              type="button"
              onClick={onCancelRemove}
              disabled={removing}
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
 * One calendar brand on the profile page: its name (with the long description
 * behind an (i)), the accounts connected under it, and the button that adds
 * another. Forms and result lines the page owns are passed in as children.
 */
export default function ProviderCard({
  meta,
  accounts,
  latest,
  statusPending,
  formOpen,
  confirmRemoveId,
  removingId,
  removeError,
  onConnect,
  onAskRemove,
  onCancelRemove,
  onRemove,
  children,
}: {
  meta: ProviderMeta;
  /** Connected accounts only. */
  accounts: CalendarConnectionStatus[];
  /** The newest attempt of any status, which is what "Connecting" and errors describe. */
  latest: CalendarConnectionStatus | undefined;
  statusPending: boolean;
  /** This provider's add form is open, so its own button steps aside. */
  formOpen: boolean;
  confirmRemoveId: string | null;
  removingId: string | null;
  removeError: { id: string; message: string } | null;
  onConnect: () => void;
  onAskRemove: (connectionId: string) => void;
  onCancelRemove: () => void;
  onRemove: (connectionId: string) => void;
  children?: ReactNode;
}) {
  const isLink = meta.id === "ics";
  const buttonLabel = isLink
    ? accounts.length > 0
      ? "Add another"
      : "Add link"
    : accounts.length > 0
      ? "Add another"
      : latest?.status === "error"
        ? "Try again"
        : "Connect";

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              meta.badgeClass,
            )}
          >
            {meta.icon}
          </span>
          <h3 className="truncate font-semibold text-foreground">{meta.label}</h3>
          {meta.help ? (
            <Link
              to={meta.help.to}
              className="flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {meta.help.label}
            </Link>
          ) : (
            meta.description && (
              <InfoTip label={`About ${meta.label}`}>{meta.description}</InfoTip>
            )
          )}
        </div>

        {statusPending ? (
          // Until the first answer arrives we genuinely don't know what is
          // linked. Saying so beats rendering "Connect" and then flipping to a
          // list of accounts a moment later.
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking
          </span>
        ) : latest?.status === "pending" ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting
          </span>
        ) : (
          !formOpen && (
            <button
              type="button"
              onClick={onConnect}
              className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-3.5 py-1.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
            >
              <CalendarPlus className="h-4 w-4" />
              {buttonLabel}
            </button>
          )
        )}
      </div>

      {accounts.length > 0 ? (
        <ul className="mt-3 divide-y border-t">
          {accounts.map((acc) => (
            <AccountRow
              key={acc.id}
              account={acc}
              provider={meta.id}
              confirming={confirmRemoveId === acc.id}
              removing={removingId === acc.id}
              removeError={removeError?.id === acc.id ? removeError.message : null}
              onReconnect={onConnect}
              onAskRemove={() => onAskRemove(acc.id)}
              onCancelRemove={onCancelRemove}
              onRemove={() => onRemove(acc.id)}
            />
          ))}
        </ul>
      ) : (
        !statusPending && (
          <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">Not connected yet.</p>
        )
      )}

      {/* The latest attempt failed (e.g. adding another account), with the real
          reason. Cleared automatically by the next successful connect. */}
      {latest?.status === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Last attempt failed: {latest.error_message ?? "unknown error"}</span>
        </div>
      )}

      {children}
    </div>
  );
}
