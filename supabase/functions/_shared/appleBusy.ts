/**
 * Every event calendar in an iCloud account, reduced to busy intervals.
 *
 * Shared by calendar-add-apple (the first fetch, when the account is
 * connected) and the scheduled sync, so both read an account the same way.
 * Throws CalDavError (CalDavLoginError for a refused password) for anything
 * wrong with the account or iCloud.
 */
import { discoverCalendars, fetchEventDocuments, mapPool, type CalDavCredentials } from "./caldav.ts";
import { parseBusyIntervals } from "./ics.ts";
import { mergeIntervals, type RawBusyInterval } from "./intervals.ts";
import { addMissingTimezones } from "./timezones.ts";

// Calendars fetched at once: fast enough, gentle enough not to trip rate limits.
const CALENDAR_CONCURRENCY = 4;

export interface AppleCalendarBusy {
  /** The calendar's CalDAV id: calendar_sources.external_calendar_id. */
  id: string;
  name: string | null;
  intervals: RawBusyInterval[];
}

export async function fetchAppleBusy(
  creds: CalDavCredentials,
  windowStart: Date,
  windowEnd: Date,
): Promise<{ calendars: AppleCalendarBusy[]; skippedEvents: number }> {
  let skippedEvents = 0;
  const calendars = await discoverCalendars(creds);
  const fetched = await mapPool(calendars, CALENDAR_CONCURRENCY, async (cal) => {
    const documents = await fetchEventDocuments(creds, cal.url, windowStart, windowEnd);
    const intervals: RawBusyInterval[] = [];
    for (const doc of documents) {
      try {
        // iCloud names time zones without defining them; fill those in first.
        const complete = addMissingTimezones(doc, windowStart, windowEnd);
        intervals.push(...parseBusyIntervals(complete, windowStart, windowEnd).intervals);
      } catch {
        // One unreadable event (an odd time zone, say) must not sink the
        // whole account. It is counted so the user is told, not hidden.
        skippedEvents++;
      }
    }
    return { id: cal.id, name: cal.name, intervals: mergeIntervals(intervals) };
  });
  return { calendars: fetched, skippedEvents };
}
