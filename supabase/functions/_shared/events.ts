/**
 * The rules for suggested events that are worth testing on their own: what
 * counts as valid search settings, and what counts as a sensible date.
 *
 * isEventSettings mirrors src/lib/eventSearch.ts, which the browser uses to
 * run the search. Edge Functions can't import from src/, so the shape is
 * written out twice; this copy is the one that decides what gets stored.
 */

/** Longest event title we keep, matching the check constraint on the table. */
export const MAX_EVENT_TITLE_LENGTH = 60;

/** Longest span a date may cover: a 30-day vacation plus a little slack. */
const MAX_SPAN_MS = 31 * 24 * 60 * 60 * 1000;
/** How far ahead a date may be: the scheduling page searches about a year. */
const MAX_AHEAD_MS = 400 * 24 * 60 * 60 * 1000;

const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** True if `value` is search settings in one of the three known shapes. */
export function isEventSettings(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  switch (s.kind) {
    case "single":
      return (
        int(s.durationMinutes, 1, 24 * 60) &&
        int(s.startHour, 0, 23) &&
        (s.allowedDays === undefined ||
          (Array.isArray(s.allowedDays) &&
            s.allowedDays.length <= 7 &&
            s.allowedDays.every((d) => int(d, 0, 6))))
      );
    case "trip": {
      const shape = s.shape as Record<string, unknown> | undefined;
      return (
        !!shape &&
        typeof shape === "object" &&
        int(shape.anchorDow, 0, 6) &&
        int(shape.spanDays, 1, 7) &&
        int(shape.startHour, 0, 23) &&
        int(shape.endHour, 0, 24)
      );
    }
    case "vacation":
      return int(s.days, 1, 30);
    default:
      return false;
  }
}

/**
 * A date as sent by a browser, or null if it isn't one worth storing: both
 * ends valid ISO instants, the end after the start and not already over, no
 * longer than a month, and within the year or so the app searches.
 */
export function parseEventDate(
  raw: unknown,
  now = Date.now(),
): { start: string; end: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const { start, end } = raw as Record<string, unknown>;
  if (typeof start !== "string" || typeof end !== "string") return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  if (e <= s || e <= now || e - s > MAX_SPAN_MS || s > now + MAX_AHEAD_MS) return null;
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
}

/** An event title as it should be stored, or null if nothing is left of it. */
export function cleanEventTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, MAX_EVENT_TITLE_LENGTH)
    .trim();
  return title.length > 0 ? title : null;
}
