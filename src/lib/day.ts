/**
 * Day and month identity for the scheduling page and its calendar.
 *
 * A day is named by the instant of its local midnight, as an ISO string, so
 * "is this the best day?" and "is this today?" are plain string comparisons
 * that the calendar and the engine agree on.
 */
import { startOfDay, startOfMonth } from "@/lib/zone";

/** Local-midnight ISO of the day containing an instant. */
export function dayOf(iso: string, timeZone: string): string {
  return new Date(startOfDay(Date.parse(iso), timeZone)).toISOString();
}

/** Local midnight on the 1st of the month containing an instant, in ms. */
export function monthStartMs(ms: number, timeZone: string): number {
  return startOfMonth(ms, timeZone);
}
