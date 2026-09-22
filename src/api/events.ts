/**
 * Suggested events, backed by the `events` Edge Function.
 *
 * Someone finds a date on the scheduling page and suggests it; everyone else
 * in the group accepts or declines it on the My events page. A decline comes
 * with the next date already found (by the decliner's browser, which has the
 * group's calendars), so nobody ever has to suggest the same event twice.
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { groupBusyQuery, groupsQuery, participantsFromGroup } from "@/api/groups";
import { SEARCH_WINDOW } from "@/api/mockData";
import { dayOf } from "@/lib/day";
import { findEventSlot, isEventSettings, type EventSettings } from "@/lib/eventSearch";
import { callFunction } from "@/lib/supabaseFunctions";
import { addDays, APP_TIME_ZONE } from "@/lib/zone";
import { currentMessages } from "@/i18n/current";

export type EventStatus = "pending" | "scheduled" | "no_date" | "cancelled";
export type EventResponse = "accepted" | "declined";

export interface EventInvitee {
  profileId: string;
  name: string;
  isYou: boolean;
  /** Their answer to the current date; null means they haven't answered yet. */
  response: EventResponse | null;
}

export interface SuggestedEvent {
  id: string;
  group: { id: string; name: string };
  title: string;
  settings: EventSettings;
  status: EventStatus;
  createdBy: { id: string | null; name: string; isYou: boolean };
  createdAt: string;
  updatedAt: string;
  /** The date on offer (or, once scheduled, the date it's on). */
  currentDate: { id: string; start: string; end: string } | null;
  invitees: EventInvitee[];
  /** Dates offered earlier and turned down, oldest first. */
  declinedDates: { start: string; end: string; declinedBy: string }[];
}

export function eventsQueryKey(userId: string) {
  return ["events", userId] as const;
}

/**
 * Every event you were asked about. Not persisted across reloads like the
 * groups are: it carries other people's answers, and the badge can wait a
 * moment for a fresh copy.
 */
export function eventsQuery(userId: string) {
  return queryOptions({
    queryKey: eventsQueryKey(userId),
    queryFn: async (): Promise<SuggestedEvent[]> => {
      const body = await callFunction<{ events?: SuggestedEvent[] }>("events", {
        body: { action: "list" },
        errorMessage: currentMessages().api.loadEvents,
      });
      return body.events ?? [];
    },
    staleTime: 30_000,
  });
}

/** True if this event is waiting for your answer on its current date. */
export function needsYourAnswer(event: SuggestedEvent): boolean {
  return (
    event.status === "pending" &&
    event.invitees.some((i) => i.isYou && i.response === null)
  );
}

export async function suggestEvent(input: {
  groupId: string;
  title: string;
  settings: EventSettings;
  date: { start: string; end: string };
}): Promise<{ events: SuggestedEvent[] }> {
  return await callFunction("events", {
    body: { action: "suggest", ...input },
    errorMessage: currentMessages().api.suggestEvent,
  });
}

export async function cancelEvent(proposalId: string): Promise<{ events: SuggestedEvent[] }> {
  return await callFunction("events", {
    body: { action: "cancel", proposalId },
    errorMessage: currentMessages().api.cancelEvent,
  });
}

export async function acceptEvent(event: SuggestedEvent): Promise<{ events: SuggestedEvent[] }> {
  if (!event.currentDate) throw new Error(currentMessages().api.noDateToAccept);
  return await callFunction("events", {
    body: {
      action: "respond",
      proposalId: event.id,
      dateId: event.currentDate.id,
      response: "accepted",
    },
    errorMessage: currentMessages().api.acceptEvent,
  });
}

/**
 * Decline the current date and hand over the next one.
 *
 * The next date comes from the same search that found the first
 * (findEventSlot, with the event's own settings), run over the group's
 * calendars from the day after the declined date. Members with no calendar
 * linked are left out of it, exactly as on the scheduling page.
 */
export async function declineEvent(
  queryClient: QueryClient,
  userId: string,
  event: SuggestedEvent,
): Promise<{ events: SuggestedEvent[]; outcome: string }> {
  if (!event.currentDate) throw new Error(currentMessages().api.noDateToDecline);
  if (!isEventSettings(event.settings)) throw new Error(currentMessages().api.cantReschedule);

  const [groups, busy] = await Promise.all([
    queryClient.fetchQuery(groupsQuery(userId)),
    queryClient.fetchQuery(
      groupBusyQuery(userId, event.group.id, SEARCH_WINDOW.start, SEARCH_WINDOW.end),
    ),
  ]);
  const group = groups.find((g) => g.id === event.group.id);
  if (!group) throw new Error(currentMessages().api.notInGroup);
  const { participants } = participantsFromGroup(group, busy);

  // Where the next search starts. A vacation starts after the declined one
  // ends: a stay overlapping days you just said you can't make would only be
  // declined again. Shorter events start from the day after the declined one.
  const from =
    event.settings.kind === "vacation"
      ? event.currentDate.end
      : new Date(
          addDays(Date.parse(dayOf(event.currentDate.start, APP_TIME_ZONE)), 1, APP_TIME_ZONE),
        ).toISOString();
  const { slot } = findEventSlot(
    participants,
    event.settings,
    from,
    SEARCH_WINDOW.end,
    APP_TIME_ZONE,
  );

  return await callFunction("events", {
    body: {
      action: "respond",
      proposalId: event.id,
      dateId: event.currentDate.id,
      response: "declined",
      next: slot ? { start: slot.start, end: slot.end } : null,
    },
    errorMessage: currentMessages().api.declineEvent,
  });
}
