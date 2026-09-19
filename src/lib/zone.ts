/**
 * Calendar arithmetic in a named time zone.
 *
 * Busy blocks and search results are instants (epoch ms / UTC ISO strings),
 * but everything a person says about time is local: "18:00", "Friday",
 * "after work", "a whole day". This is the one place those words are turned
 * into instants, using the IANA database the browser already ships (Intl),
 * so there is no library and no table of daylight-saving rules to maintain.
 *
 * A "day" is always local midnight to the next local midnight. That is 24
 * hours most of the time, but 23 on the spring-forward Sunday and 25 on the
 * fall-back one; code that steps days by 86 400 000 ms drifts an hour across
 * those, which is exactly the bug this module exists to prevent.
 */

/** The zone scheduling happens in until groups can have their own. */
export const APP_TIME_ZONE = "Europe/Copenhagen";

const MS_PER_HOUR = 3_600_000;
/** Offset lookups are cached per quarter hour: no zone changes offset more often. */
const CACHE_BUCKET_MS = 900_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, Map<number, number>>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/**
 * How far local time in `timeZone` is ahead of UTC at instant `ms`, in ms
 * (+2 h in Copenhagen in summer). Asking Intl is slow next to arithmetic and
 * the answer only changes twice a year, so answers are remembered.
 */
export function offsetAt(ms: number, timeZone: string): number {
  if (timeZone === "UTC") return 0;
  let cache = offsetCache.get(timeZone);
  if (!cache) {
    cache = new Map();
    offsetCache.set(timeZone, cache);
  }
  const bucket = Math.floor(ms / CACHE_BUCKET_MS);
  const cached = cache.get(bucket);
  if (cached !== undefined) return cached;

  const at = bucket * CACHE_BUCKET_MS;
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(at)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = asUtc - at;
  cache.set(bucket, offset);
  return offset;
}

/** The local calendar date (and weekday, 0 = Sunday) of an instant. */
export function localDate(
  ms: number,
  timeZone: string,
): { year: number; month: number; day: number; dow: number } {
  const local = new Date(ms + offsetAt(ms, timeZone));
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    dow: local.getUTCDay(),
  };
}

/**
 * The instant a local wall-clock time happens. `month` is 0-based; out-of-range
 * days roll over like Date.UTC (day 32 is next month), and `hours` may be
 * fractional or run past 24 (26 = 02:00 the next day), for night events.
 *
 * Two local times need a rule. In the spring-forward gap (02:30 doesn't exist)
 * the answer is pushed forward by the gap, to 03:30. In the repeated fall-back
 * hour (02:30 happens twice) it is one of the two. Nothing is scheduled for
 * those hours in practice, so either is fine; what matters is never crashing.
 */
export function wallTime(
  year: number,
  month: number,
  day: number,
  hours: number,
  timeZone: string,
): number {
  const asUtc = Date.UTC(year, month, day) + Math.round(hours * MS_PER_HOUR);
  // Guess with the offset at the wrong instant, then correct once with the
  // offset at the guess: right everywhere except across a transition, where
  // the second offset is the one that applies.
  const guess = asUtc - offsetAt(asUtc, timeZone);
  return asUtc - offsetAt(guess, timeZone);
}

/** Local midnight at the start of the day containing `ms`. */
export function startOfDay(ms: number, timeZone: string): number {
  const d = localDate(ms, timeZone);
  return wallTime(d.year, d.month, d.day, 0, timeZone);
}

/** Local midnight `n` days after the day containing `ms` (negative goes back). */
export function addDays(ms: number, n: number, timeZone: string): number {
  const d = localDate(ms, timeZone);
  return wallTime(d.year, d.month, d.day + n, 0, timeZone);
}

/** The instant of local clock time `hours` on the day containing `ms`. */
export function atHour(ms: number, hours: number, timeZone: string): number {
  const d = localDate(ms, timeZone);
  return wallTime(d.year, d.month, d.day, hours, timeZone);
}

/** Day of the week of `ms` in the zone (0 = Sunday … 6 = Saturday). */
export function dayOfWeek(ms: number, timeZone: string): number {
  return localDate(ms, timeZone).dow;
}

/** Local midnight on the 1st of the month containing `ms`, moved `n` months. */
export function startOfMonth(ms: number, timeZone: string, n = 0): number {
  const d = localDate(ms, timeZone);
  return wallTime(d.year, d.month + n, 1, 0, timeZone);
}
