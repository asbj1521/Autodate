import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  Info,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import AppleCredentialsForm from "@/components/AppleCredentialsForm";
import IcsLinkForm from "@/components/IcsLinkForm";
import TopNav from "@/components/TopNav";
import { avatarColor } from "@/lib/avatar";
import { CURRENT_USER_ID } from "@/api/currentUser";
import {
  calendarStatusQuery,
  type CalendarConnectionStatus,
} from "@/api/calendarStatus";
import { callFunction, SUPABASE_FUNCTIONS_URL } from "@/lib/supabaseFunctions";
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
 * Placeholder identity for the single demo account. Real phone-number login
 * and multi-person profiles are a separate, later piece of work; this page
 * just gives the one hardcoded user the rest of the app already assumes
 * (`CURRENT_USER_ID` in mockData) somewhere to live.
 */
const CURRENT_USER = {
  name: "Asbjørn Bay",
  phone: "+45 00 00 00 00",
};

interface ProviderMeta {
  id: CalendarProvider;
  label: string;
  initial: string;
  badgeClass: string;
  description: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "google",
    label: "Google Calendar",
    initial: "G",
    badgeClass: "bg-blue-100 text-blue-700",
    description:
      "Connect with one click. Autodate only ever reads free and busy times, never event details.",
  },
  {
    id: "outlook",
    label: "Outlook Calendar",
    initial: "O",
    badgeClass: "bg-sky-100 text-sky-700",
    description:
      "Connect with one click via your Microsoft account. Autodate only ever reads free and busy times, never event details.",
  },
  {
    id: "ics",
    label: "Calendar link (ICS)",
    initial: "#",
    badgeClass: "bg-violet-100 text-violet-700",
    description:
      "Paste a calendar feed link, for example your school timetable or an Outlook publish link. Only start and end times are kept; titles, places and attendees are removed before anything is stored.",
  },
  {
    id: "apple",
    label: "Apple iCloud Calendar",
    initial: "A",
    badgeClass: "bg-neutral-200 text-neutral-800",
    description:
      "Apple has no one-click sign-in for calendars. Generate an app-specific password for Autodate, then enter your iCloud email and that password below.",
  },
];

/**
 * The "Connect calendars" section of the user's profile.
 *
 * Google and Outlook are wired to the real OAuth Edge Functions. Apple has
 * no backend yet, so its connect action shows an honest inline notice
 * instead of pretending an account got linked; the design and interaction
 * (including Apple's password form, since it has no consent-screen flow)
 * are meant to be final; only that handler is still a stub.
 */
export default function Profile() {
  const [notice, setNotice] = useState<CalendarProvider | null>(null);
  const [appleFormOpen, setAppleFormOpen] = useState(false);
  const [icsFormOpen, setIcsFormOpen] = useState(false);
  const [icsSubmitting, setIcsSubmitting] = useState(false);
  // Bumped after each successful add, to remount the form with empty fields.
  const [icsAddedCount, setIcsAddedCount] = useState(0);
  const [icsError, setIcsError] = useState<string | null>(null);
  const [icsResult, setIcsResult] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<{ id: string; message: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: connections,
    isPending: statusPending,
    refetch: refetchStatus,
  } = useQuery(calendarStatusQuery());

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

  const handleConnect = (provider: CalendarProvider) => {
    if (provider === "google" || provider === "outlook") {
      window.location.assign(
        `${SUPABASE_FUNCTIONS_URL}/oauth-${provider}-start?profileId=${encodeURIComponent(CURRENT_USER_ID)}`,
      );
      return;
    }
    if (provider === "ics") {
      setIcsFormOpen(true);
      setIcsResult(null);
      setIcsError(null);
      return;
    }
    setAppleFormOpen(true);
    setNotice(null);
  };

  const handleIcsSubmit = async (url: string, name: string) => {
    setIcsSubmitting(true);
    setIcsError(null);
    setIcsResult(null);
    try {
      const body = await callFunction<{ label: string; busyBlocks: number }>(
        "calendar-add-ics",
        {
          body: { profileId: CURRENT_USER_ID, url, name },
          errorMessage: "Couldn't add the link",
        },
      );
      setIcsResult(
        `Added "${body.label}" with ${body.busyBlocks} busy ${body.busyBlocks === 1 ? "block" : "blocks"}.`,
      );
      setIcsFormOpen(false);
      setIcsAddedCount((n) => n + 1);
      await refetchStatus();
    } catch (err) {
      setIcsError(err instanceof Error ? err.message : "Couldn't add the link");
    } finally {
      setIcsSubmitting(false);
    }
  };

  const handleRemove = async (connectionId: string) => {
    setRemovingId(connectionId);
    setRemoveError(null);
    try {
      await callFunction("calendar-disconnect", {
        body: { profileId: CURRENT_USER_ID, connectionId },
        errorMessage: "Couldn't remove the account",
      });
      setConfirmRemoveId(null);
      await refetchStatus();
    } catch (err) {
      // Leave the confirm panel open so the user can see why and retry.
      setRemoveError({
        id: connectionId,
        message: err instanceof Error ? err.message : "Couldn't remove the account",
      });
    } finally {
      setRemovingId(null);
    }
  };

  // Apple has no backend yet, so say so rather than pretend an account linked.
  const handleAppleSubmit = () => setNotice("apple");

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to scheduling
        </Link>

        {/* Result of a just-completed OAuth round trip, if any */}
        <AnimatePresence initial={false}>
          {(connectedParam || errorParam) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-6 overflow-hidden"
            >
              {connectedParam ? (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Connected to{" "}
                    {PROVIDERS.find((p) => p.id === connectedParam)?.label ?? "your calendar"}{" "}
                    and pulled in your busy times.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Couldn't connect: {errorParam}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Identity card */}
        <div className="mt-6 flex items-center gap-4 rounded-2xl border bg-card p-6 shadow-sm">
          <span
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold",
              avatarColor(0),
            )}
          >
            {CURRENT_USER.name.charAt(0)}
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {CURRENT_USER.name}
            </h1>
            <p className="text-sm text-muted-foreground">{CURRENT_USER.phone}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Phone-number login and multi-person profiles are coming in a later
          update. For now this page reflects the one demo account the rest of
          Autodate uses.
        </p>

        {/* Connected calendars */}
        <section className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">
              Connected calendars
            </h2>
            <Link
              to="/calendar-overview"
              className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary"
            >
              <CalendarDays className="h-4 w-4" />
              Calendar overview
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Link your calendars so Autodate can see when you are free. Only
            free and busy times are read, never event titles or details.
          </p>

          <div className="mt-5 flex flex-col gap-4">
            {PROVIDERS.map((provider) => {
              const attempts = attemptsFor(connections, provider.id);
              const accounts = attempts.filter((c) => c.status === "connected");
              const latest = attempts[0];
              return (
              <div
                key={provider.id}
                className="rounded-2xl border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        provider.badgeClass,
                      )}
                    >
                      {provider.initial}
                    </span>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {provider.label}
                      </h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {provider.description}
                      </p>
                    </div>
                  </div>

                  {statusPending ? (
                    // Until the first answer arrives we genuinely don't know
                    // what is linked. Saying so beats rendering "Connect" and
                    // then flipping to a list of accounts a moment later.
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
                    !(provider.id === "apple" && appleFormOpen) &&
                    !(provider.id === "ics" && icsFormOpen) && (
                      <button
                        onClick={() => handleConnect(provider.id)}
                        className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        {provider.id === "ics"
                          ? accounts.length > 0
                            ? "Add another link"
                            : "Add link"
                          : accounts.length > 0
                            ? "Add another account"
                            : latest?.status === "error"
                              ? "Try again"
                              : "Connect"}
                      </button>
                    )
                  )}
                </div>

                {/* Real, persisted state: every connected account, which
                    calendars were found and how much data synced. */}
                {accounts.length > 0 && (
                  <ul className="mt-4 flex flex-col divide-y border-t">
                    {accounts.map((acc) => (
                      <li key={acc.id} className="py-4 text-sm text-muted-foreground">
                        <div className="flex items-start justify-between gap-3">
                          <p className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                              <span className="font-medium text-foreground">
                                {acc.account_label ?? "unknown account"}
                              </span>
                              . Found {acc.calendar_sources.length}{" "}
                              {acc.calendar_sources.length === 1 ? "calendar" : "calendars"},{" "}
                              {acc.busyCount} busy {acc.busyCount === 1 ? "block" : "blocks"} synced.
                            </span>
                          </p>
                          <div className="flex shrink-0 items-center gap-2">
                            {provider.id !== "ics" && (
                              <button
                                onClick={() => handleConnect(provider.id)}
                                title="Reconnect (pick this account again)"
                                className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setRemoveError(null);
                                setConfirmRemoveId(acc.id);
                              }}
                              title="Remove this account"
                              className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <ul className="mt-2 flex flex-wrap gap-2 pl-6">
                          {acc.calendar_sources.map((s) => (
                            <li
                              key={s.id}
                              className="rounded-full border bg-background px-2.5 py-1 text-xs"
                            >
                              {s.display_name ?? s.id}
                            </li>
                          ))}
                        </ul>

                        {confirmRemoveId === acc.id && (
                          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
                            <p>
                              {provider.id === "ics" ? (
                                <>
                                  Remove {acc.account_label ?? "this link"}? Its synced busy times
                                  and the saved link are deleted from Autodate. The link itself
                                  stays valid at its source until you regenerate it there.
                                </>
                              ) : (
                                <>
                                  Remove {acc.account_label ?? "this account"}? Its synced busy
                                  times are deleted from Autodate. To also revoke Autodate's
                                  access, remove it in that account's connected-apps settings at{" "}
                                  {provider.id === "google" ? "Google" : "Microsoft"}.
                                </>
                              )}
                            </p>
                            {removeError?.id === acc.id && (
                              <p className="mt-2 font-medium">{removeError.message}</p>
                            )}
                            <div className="mt-2 flex items-center gap-3">
                              <button
                                onClick={() => void handleRemove(acc.id)}
                                disabled={removingId === acc.id}
                                className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                              >
                                {removingId === acc.id && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                )}
                                Remove
                              </button>
                              <button
                                onClick={() => setConfirmRemoveId(null)}
                                disabled={removingId === acc.id}
                                className="text-sm text-red-900/80 transition hover:text-red-900"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* The latest attempt failed (e.g. adding another account),
                    with the real reason. Cleared automatically by the next
                    successful connect of this provider. */}
                {latest?.status === "error" && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Last attempt failed: {latest.error_message ?? "unknown error"}
                    </span>
                  </div>
                )}

                {/* ICS: paste a calendar feed link */}
                {provider.id === "ics" && icsResult && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {icsResult}
                  </p>
                )}
                {provider.id === "ics" && (
                  // The key clears the typed link after a successful add, so
                  // "Add another link" starts from an empty form.
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

                {provider.id === "apple" && (
                  <AppleCredentialsForm
                    open={appleFormOpen}
                    onSubmit={handleAppleSubmit}
                    onCancel={() => setAppleFormOpen(false)}
                  />
                )}

                {/* Stub notice after attempting to connect */}
                <AnimatePresence initial={false}>
                  {notice === provider.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Calendar sync is not set up yet. This will connect for
                          real once the backend is configured.
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
