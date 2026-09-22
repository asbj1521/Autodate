/**
 * How the My events page sorts and describes suggested events. Pure, so the
 * rules (which section an event belongs in, who it's waiting for) are tested
 * rather than trusted to the page.
 */
import type { SuggestedEvent } from "@/api/events";
import { formatDaySpan, formatSlot, formatTripSpan } from "@/lib/format";

export interface EventSections {
  /** Pending, and you haven't answered the current date yet. */
  needsAnswer: SuggestedEvent[];
  /** Pending, you've said yes, others haven't answered. */
  waiting: SuggestedEvent[];
  /** Everyone accepted, and the date hasn't passed. */
  scheduled: SuggestedEvent[];
  /** Past, or no date left. Cancelled events aren't kept anywhere. */
  closed: SuggestedEvent[];
}

const startOf = (e: SuggestedEvent) =>
  e.currentDate ? Date.parse(e.currentDate.start) : Infinity;

export function sectionEvents(events: SuggestedEvent[], now = Date.now()): EventSections {
  const sections: EventSections = { needsAnswer: [], waiting: [], scheduled: [], closed: [] };
  for (const e of events) {
    // A cancelled event has nothing left to act on or learn from, so it's
    // dropped rather than filed away to look at later.
    if (e.status === "cancelled") continue;
    const over = e.currentDate !== null && Date.parse(e.currentDate.end) <= now;
    if (e.status === "scheduled" && !over) sections.scheduled.push(e);
    else if (e.status === "pending" && !over) {
      const you = e.invitees.find((i) => i.isYou);
      if (you && you.response === null) sections.needsAnswer.push(e);
      else sections.waiting.push(e);
    } else sections.closed.push(e);
  }
  // Soonest first where there's a date to act on; most recent first for the rest.
  sections.needsAnswer.sort((a, b) => startOf(a) - startOf(b));
  sections.waiting.sort((a, b) => startOf(a) - startOf(b));
  sections.scheduled.sort((a, b) => startOf(a) - startOf(b));
  sections.closed.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return sections;
}

/** The people who haven't answered the current date yet (never you). */
export function waitingOn(event: SuggestedEvent): string[] {
  return event.invitees.filter((i) => !i.isYou && i.response === null).map((i) => i.name);
}

/** The event's date in the same words the scheduling page uses for its kind. */
export function eventDateLabel(event: SuggestedEvent): string {
  if (!event.currentDate) return "No date";
  const { start, end } = event.currentDate;
  switch (event.settings.kind) {
    case "vacation":
      return formatDaySpan(start, end);
    case "trip":
      return formatTripSpan(start, end);
    default:
      return formatSlot(start, end);
  }
}

/** "Emilie", "Emilie and Tessa", or "Emilie, Tessa and 2 more". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}
