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
import { useT } from "@/i18n/lang";
import { calendarNames, hasDistinctCalendarNames, syncedAgo } from "@/lib/accountSummary";
import { cn } from "@/lib/utils";
import type { CalendarProvider } from "@/types";

export interface ProviderMeta {
  id: CalendarProvider;
  label: string;
  /** The brand's own mark, not a generic icon: a real logo, not an initial. */
  icon: ReactNode;
  badgeClass: string;
  /** A route to the provider's step-by-step guide, shown beside the label. */
  help: { to: string; label: string };
}

/** What "remove" explains, since each provider revokes access somewhere different. */
function RemoveNote({ provider, label }: { provider: CalendarProvider; label: string | null }) {
  const t = useT();
  if (provider === "ics") return <>{t.providerCard.removeIcs(label)}</>;
  if (provider === "apple") return <>{t.providerCard.removeApple(label)}</>;
  return <>{t.providerCard.removeOauth(label, provider === "google" ? "Google" : "Microsoft")}</>;
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
  const t = useT();
  const [namesOpen, setNamesOpen] = useState(false);
  const count = account.calendar_sources.length;
  // The clock is read once, when the row appears: rendering must not depend
  // on the time it happens to run, and minutes-level freshness is plenty.
  const [now] = useState(Date.now);
  const synced = syncedAgo(account.last_synced_at, now, t.synced);
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
            {account.account_label ?? t.providerCard.unknownAccount}
          </p>
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            {expandable ? (
              <button
                type="button"
                onClick={() => setNamesOpen((o) => !o)}
                aria-expanded={namesOpen}
                className="inline-flex items-center gap-0.5 transition hover:text-foreground"
              >
                {t.counts.calendars(count)}
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", namesOpen && "rotate-180")}
                />
              </button>
            ) : (
              <span>{t.counts.calendars(count)}</span>
            )}
            <span>· {t.counts.busyBlocks(account.busyCount)}</span>
            {synced && <span>· {synced}</span>}
            {/* A temporary failure: the busy times shown are the last good
                ones and the next run retries, so this stays quiet. */}
            {account.sync_error && !reconnect && (
              <span className="text-amber-700" title={account.sync_error}>
                {t.providerCard.lastSyncFailed}
              </span>
            )}
          </p>
          {reconnect && (
            <p className="mt-0.5 text-xs font-medium text-amber-700">
              {provider === "ics" ? t.providerCard.linkStopped : t.providerCard.accessExpired}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {provider !== "ics" && (
            <button
              type="button"
              onClick={onReconnect}
              title={t.providerCard.reconnectTitle}
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
            title={t.providerCard.removeTitle}
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
              {t.providerCard.remove}
            </button>
            <button
              type="button"
              onClick={onCancelRemove}
              disabled={removing}
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
 * One calendar brand on the profile page: its name and a link to its guide,
 * the accounts connected under it, and the button that adds another. Forms
 * and result lines the page owns are passed in as children.
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
  const t = useT();
  const isLink = meta.id === "ics";
  const addingAnother = accounts.length > 0;
  const buttonLabel = addingAnother
    ? t.providerCard.addAnother
    : isLink
      ? t.providerCard.addLink
      : latest?.status === "error"
        ? t.providerCard.tryAgain
        : t.providerCard.connect;

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
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
          {/* On a phone the help link drops under the name as plain text, so
              the name keeps enough room to be read in full. */}
          <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-3">
            <h3 className="font-semibold leading-tight text-foreground sm:truncate">
              {meta.label}
            </h3>
            <Link
              to={meta.help.to}
              className="mt-0.5 flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground sm:mt-0 sm:shrink-0 sm:gap-1.5 sm:rounded-full sm:border sm:bg-background sm:px-2.5 sm:py-1 sm:hover:bg-secondary"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {meta.help.label}
            </Link>
          </div>
        </div>

        {statusPending ? (
          // Until the first answer arrives we genuinely don't know what is
          // linked. Saying so beats rendering "Connect" and then flipping to a
          // list of accounts a moment later.
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t.providerCard.checking}
          </span>
        ) : latest?.status === "pending" ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t.providerCard.connecting}
          </span>
        ) : (
          !formOpen && (
            <button
              type="button"
              onClick={onConnect}
              className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-3.5 py-1.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
            >
              <CalendarPlus className="h-4 w-4" />
              {addingAnother ? (
                <>
                  <span className="sm:hidden">{t.providerCard.addShort}</span>
                  <span className="hidden sm:inline">{buttonLabel}</span>
                </>
              ) : (
                buttonLabel
              )}
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
          <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{t.providerCard.notConnected}</p>
        )
      )}

      {/* The latest attempt failed (e.g. adding another account), with the real
          reason. Cleared automatically by the next successful connect. */}
      {latest?.status === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t.providerCard.lastFailed(latest.error_message ?? t.providerCard.unknownError)}</span>
        </div>
      )}

      {children}
    </div>
  );
}
