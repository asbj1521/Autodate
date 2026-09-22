import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarX,
  Check,
  Clock,
  Loader2,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";

import {
  acceptEvent,
  cancelEvent,
  declineEvent,
  eventsQuery,
  eventsQueryKey,
  type EventInvitee,
  type SuggestedEvent,
} from "@/api/events";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/context/auth";
import { avatarColor } from "@/lib/avatar";
import { formatDaySpan, formatSlot, formatTripSpan } from "@/lib/format";
import { eventDateLabel, nameList, sectionEvents, waitingOn } from "@/lib/myEvents";
import { cn } from "@/lib/utils";

/** A declined date, in the same words its event kind uses elsewhere. */
function pastDateLabel(event: SuggestedEvent, d: { start: string; end: string }): string {
  if (event.settings.kind === "vacation") return formatDaySpan(d.start, d.end);
  if (event.settings.kind === "trip") return formatTripSpan(d.start, d.end);
  return formatSlot(d.start, d.end);
}

/** Everyone asked, each with where they stand on the current date. */
function People({ invitees }: { invitees: EventInvitee[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {invitees.map((p, i) => (
        <li
          key={p.profileId}
          className={cn(
            "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs",
            p.response === "accepted" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            p.response === "declined" && "border-rose-200 bg-rose-50 text-rose-800",
            p.response === null && "bg-background text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
              avatarColor(i),
            )}
          >
            {p.name.trim().charAt(0).toUpperCase()}
          </span>
          {p.isYou ? "You" : p.name}
          {p.response === "accepted" ? (
            <Check className="h-3 w-3" />
          ) : p.response === "declined" ? (
            <X className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Where the event came from: who suggested it, and why the date changed if it did. */
function Origin({ event }: { event: SuggestedEvent }) {
  const last = event.declinedDates[event.declinedDates.length - 1];
  return (
    <p className="text-sm text-muted-foreground">
      {event.createdBy.isYou ? "You suggested this" : `Suggested by ${event.createdBy.name}`}
      {last && (
        <>
          . New date because {last.declinedBy} couldn't make {pastDateLabel(event, last)}
        </>
      )}
      .
    </p>
  );
}

export default function MyEvents() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const queryClient = useQueryClient();
  const { data: events, isPending, isError } = useQuery(eventsQuery(userId));

  // Which card has its decline or cancel confirmation open.
  const [confirming, setConfirming] = useState<{ id: string; kind: "decline" | "cancel" } | null>(
    null,
  );

  const onChanged = (data: { events: SuggestedEvent[] }) => {
    queryClient.setQueryData(eventsQueryKey(userId), data.events);
    setConfirming(null);
  };
  // On any failure the list is refetched: the usual cause is someone else
  // answering first, and the fresh list shows what changed.
  const onFailed = () => void queryClient.invalidateQueries({ queryKey: eventsQueryKey(userId) });

  const accept = useMutation({ mutationFn: acceptEvent, onSuccess: onChanged, onError: onFailed });
  const decline = useMutation({
    mutationFn: (event: SuggestedEvent) => declineEvent(queryClient, userId, event),
    onSuccess: onChanged,
    onError: onFailed,
  });
  const cancel = useMutation({ mutationFn: cancelEvent, onSuccess: onChanged, onError: onFailed });

  const busyId =
    (accept.isPending && accept.variables?.id) ||
    (decline.isPending && decline.variables?.id) ||
    (cancel.isPending && cancel.variables) ||
    null;
  const errorFor = (id: string): string | null => {
    for (const m of [accept, decline]) {
      if (m.isError && m.variables?.id === id) return m.error.message;
    }
    if (cancel.isError && cancel.variables === id) return cancel.error.message;
    return null;
  };
  const resetErrors = () => {
    accept.reset();
    decline.reset();
    cancel.reset();
  };

  const sections = events ? sectionEvents(events) : null;

  function cancelControl(event: SuggestedEvent) {
    if (!event.createdBy.isYou) return null;
    if (confirming?.id === event.id && confirming.kind === "cancel") {
      return (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Cancel this event for everyone?
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => cancel.mutate(event.id)}
              disabled={busyId === event.id}
              className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {busyId === event.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Cancel event
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="text-red-900/80 transition hover:text-red-900"
            >
              Keep it
            </button>
          </div>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          resetErrors();
          setConfirming({ id: event.id, kind: "cancel" });
        }}
        className="mt-3 text-sm font-medium text-muted-foreground transition hover:text-red-700"
      >
        Cancel event
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="px-4 pb-16 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Events suggested in your groups. When someone declines, Casy finds the next date that
          works and asks everyone again.
        </p>

        {isPending ? (
          <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your events…
          </p>
        ) : isError || !sections ? (
          <p className="mt-8 text-sm text-red-700">Couldn't load your events.</p>
        ) : events.length === 0 ? (
          <div className="mt-8 flex flex-col items-start rounded-2xl border bg-card p-6">
            <CalendarCheck className="h-8 w-8 text-primary" />
            <p className="mt-3 font-semibold text-foreground">No events yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Find a date on the scheduling page and press Suggest event. It shows up here for
              everyone in the group.
            </p>
            <Link
              to="/"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              Find a date
            </Link>
          </div>
        ) : (
          <>
            {/* ───── Needs your answer: the one thing this page is for ───── */}
            {sections.needsAnswer.length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-foreground">
                  Needs your answer
                  <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    {sections.needsAnswer.length}
                  </span>
                </h2>
                <ul className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {sections.needsAnswer.map((event) => {
                    const busy = busyId === event.id;
                    const declining = confirming?.id === event.id && confirming.kind === "decline";
                    const error = errorFor(event.id);
                    return (
                      <li
                        key={event.id}
                        className="rounded-2xl border border-primary/30 bg-card p-5 shadow-sm"
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-primary">
                          {event.group.name} · {event.title}
                        </p>
                        <p className="mt-1 text-xl font-bold text-foreground">
                          {eventDateLabel(event)}
                        </p>
                        <div className="mt-1">
                          <Origin event={event} />
                        </div>
                        <div className="mt-3">
                          <People invitees={event.invitees} />
                        </div>

                        {declining ? (
                          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                            <p className="text-sm text-rose-900">
                              Can't make it? Casy finds the next date that works for the group and
                              asks everyone again.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => decline.mutate(event)}
                                disabled={busy}
                                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                              >
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                                Decline and find a new date
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirming(null)}
                                disabled={busy}
                                className="rounded-full px-4 py-2 text-sm font-medium text-rose-900/80 transition hover:text-rose-900"
                              >
                                Keep it
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                resetErrors();
                                accept.mutate(event);
                              }}
                              disabled={busy}
                              className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:opacity-60"
                            >
                              {busy ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <Check className="h-5 w-5" />
                              )}
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                resetErrors();
                                setConfirming({ id: event.id, kind: "decline" });
                              }}
                              disabled={busy}
                              className="flex items-center justify-center gap-2 rounded-full border bg-background py-3 font-semibold text-foreground transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
                            >
                              <X className="h-5 w-5" />
                              Decline
                            </button>
                          </div>
                        )}

                        {error && (
                          <p className="mt-3 flex items-start gap-2 text-sm text-red-700">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            {error}
                          </p>
                        )}
                        {cancelControl(event)}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* ───── Waiting for others ───── */}
            {sections.waiting.length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-foreground">Waiting for others</h2>
                <ul className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {sections.waiting.map((event) => {
                    const error = errorFor(event.id);
                    return (
                      <li key={event.id} className="rounded-2xl border bg-card p-5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {event.group.name} · {event.title}
                        </p>
                        <p className="mt-1 text-lg font-bold text-foreground">
                          {eventDateLabel(event)}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-amber-700">
                          <Clock className="h-4 w-4" />
                          Waiting for {nameList(waitingOn(event))}
                        </p>
                        <div className="mt-1">
                          <Origin event={event} />
                        </div>
                        <div className="mt-3">
                          <People invitees={event.invitees} />
                        </div>
                        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
                        {cancelControl(event)}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* ───── Scheduled ───── */}
            {sections.scheduled.length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-foreground">Scheduled</h2>
                <ul className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {sections.scheduled.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                          <CalendarCheck className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                            {event.group.name} · {event.title}
                          </p>
                          <p className="mt-0.5 text-lg font-bold text-foreground">
                            {eventDateLabel(event)}
                          </p>
                          <p className="text-sm text-emerald-800">Everyone is in.</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <People invitees={event.invitees} />
                      </div>
                      {cancelControl(event)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ───── Past and closed ───── */}
            {sections.closed.length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-foreground">Past and closed</h2>
                <ul className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                  {sections.closed.map((event) => (
                    <li key={event.id} className="flex items-start gap-3 rounded-2xl border bg-card p-4">
                      <CalendarX className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-foreground">
                          {event.group.name} · {event.title}
                        </p>
                        <p className="text-muted-foreground">
                          {event.status === "cancelled"
                            ? `Cancelled by ${event.createdBy.isYou ? "you" : event.createdBy.name}.`
                            : event.status === "no_date"
                              ? "No date in the next year works for everyone any more. Suggest it again from the scheduling page."
                              : event.status === "scheduled"
                                ? `Happened: ${eventDateLabel(event)}.`
                                : `The date passed before everyone answered: ${eventDateLabel(event)}.`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
