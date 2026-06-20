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

/** "09:00–18:00" for a busy block on a single day. */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}
