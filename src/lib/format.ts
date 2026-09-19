/**
 * Display helpers for turning the engine's ISO instants into readable text,
 * in the zone the schedule lives in: a meeting found for 18:00 in Copenhagen
 * reads "18:00" wherever the page happens to be opened.
 */
import { APP_TIME_ZONE } from "@/lib/zone";

const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: APP_TIME_ZONE,
};

const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: APP_TIME_ZONE,
};

/** "Tue 23 Jun" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", DATE_FMT);
}

/** "16:00" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", TIME_FMT);
}

/** "Tue 23 Jun · 16:00-17:00" */
export function formatSlot(start: string, end: string): string {
  return `${formatDate(start)} · ${formatTime(start)}-${formatTime(end)}`;
}

/**
 * "Mon 5 Oct to Sun 11 Oct" for a whole-day span. `end` is the exclusive
 * midnight after the span, so the last day shown is the one containing the
 * moment just before it (not end minus 24 h, which is wrong across a clock
 * change).
 */
export function formatDaySpan(start: string, end: string): string {
  const lastMoment = new Date(Date.parse(end) - 1).toISOString();
  return `${formatDate(start)} to ${formatDate(lastMoment)}`;
}

/** "Fri 25 Sep 17:00 to Sun 27 Sep 21:00" for a trip with concrete times. */
export function formatTripSpan(start: string, end: string): string {
  return `${formatDate(start)} ${formatTime(start)} to ${formatDate(end)} ${formatTime(end)}`;
}
