/**
 * Display helpers for turning the engine's UTC ISO strings into human-readable
 * text. The engine and data are all in UTC; we format in UTC here too (with a
 * label) so the demo's times line up exactly with the "09:00–18:00" working
 * window in the data. Timezone-aware display for real users comes later.
 */

const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
};

const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
};

/** "Tue 23 Jun" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", DATE_FMT);
}

/** "16:00" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", TIME_FMT);
}

/** "Tue 23 Jun · 16:00–17:00 (UTC)" */
export function formatSlot(start: string, end: string): string {
  return `${formatDate(start)} · ${formatTime(start)}–${formatTime(end)} (UTC)`;
}

/**
 * "Mon 5 Oct to Sun 11 Oct" for a whole-day span. `end` is the exclusive
 * midnight after the span, so the displayed last day is one day earlier.
 */
export function formatDaySpan(start: string, end: string): string {
  const lastDay = new Date(Date.parse(end) - 86_400_000).toISOString();
  return `${formatDate(start)} to ${formatDate(lastDay)}`;
}

/** "Fri 25 Sep 17:00 to Sun 27 Sep 21:00" for a trip with concrete times. */
export function formatTripSpan(start: string, end: string): string {
  return `${formatDate(start)} ${formatTime(start)} to ${formatDate(end)} ${formatTime(end)}`;
}
