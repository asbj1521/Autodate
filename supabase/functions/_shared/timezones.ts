/**
 * Make ICS documents parseable when they name a time zone without defining it.
 *
 * iCloud (and other CalDAV servers) usually write DTSTART;TZID=Europe/Copenhagen
 * and leave out the VTIMEZONE block that says what that zone means. The ICS
 * parser rightly refuses to guess, which in a real iCloud account made 17 of 29
 * events unusable. The zone's rules are not a secret though: the runtime
 * ships the IANA time zone database (Intl), so we write the missing VTIMEZONE
 * ourselves from it.
 *
 * The generated definition lists every offset change (daylight saving start
 * and end) in a range as explicit one-off transitions, rather than
 * recurrence rules. That is exactly right for any zone, however odd its
 * history, and needs no per-region knowledge.
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
/** Recurring events can start years before the search window; cover that. */
const YEARS_BEFORE = 3;

/** True if the runtime knows this IANA zone name. */
function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The zone's UTC offset in minutes at the given instant (positive = ahead of UTC). */
export function offsetMinutes(zone: string, atMs: number): number {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(zone).formatToParts(new Date(atMs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((wallClockAsUtc - Math.floor(atMs / 1000) * 1000) / MS_PER_MINUTE);
}

/** "+0100" / "-0330", the form TZOFFSETFROM/TZOFFSETTO use. */
function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
}

/** 20261025T030000, the floating local form DTSTART inside a VTIMEZONE uses. */
function formatLocal(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
}

/**
 * The instant, to the minute, at which the zone's offset first differs from
 * `offsetBefore`, somewhere in (lowMs, highMs].
 */
function findTransition(zone: string, lowMs: number, highMs: number, offsetBefore: number): number {
  let low = lowMs; // offset here is offsetBefore
  let high = highMs; // offset here is different
  while (high - low > MS_PER_MINUTE) {
    const mid = low + Math.floor((high - low) / 2 / MS_PER_MINUTE) * MS_PER_MINUTE;
    if (mid <= low) break;
    if (offsetMinutes(zone, mid) === offsetBefore) low = mid;
    else high = mid;
  }
  return high;
}

const cache = new Map<string, string>();

/** A VTIMEZONE block (CRLF lines, no trailing newline) valid for [from, to]. */
export function buildVtimezone(zone: string, from: Date, to: Date): string {
  const startYear = from.getUTCFullYear() - YEARS_BEFORE;
  const endYear = to.getUTCFullYear() + 1;
  const key = `${zone}|${startYear}|${endYear}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const scanStart = Date.UTC(startYear, 0, 1);
  const scanEnd = Date.UTC(endYear, 11, 31);

  const initial = offsetMinutes(zone, scanStart);
  const observances: string[] = [
    // Where the scan begins: no change, just "this is the offset in force".
    ["BEGIN:STANDARD", "DTSTART:19700101T000000", `TZOFFSETFROM:${formatOffset(initial)}`, `TZOFFSETTO:${formatOffset(initial)}`, "END:STANDARD"].join("\r\n"),
  ];

  let previousOffset = initial;
  for (let day = scanStart; day < scanEnd; day += MS_PER_DAY) {
    const next = offsetMinutes(zone, day + MS_PER_DAY);
    if (next === previousOffset) continue;

    const at = findTransition(zone, day, day + MS_PER_DAY, previousOffset);
    const kind = next > previousOffset ? "DAYLIGHT" : "STANDARD";
    observances.push(
      [
        `BEGIN:${kind}`,
        // DTSTART is the wall-clock moment of the change, read in the OLD offset.
        `DTSTART:${formatLocal(at + previousOffset * MS_PER_MINUTE)}`,
        `TZOFFSETFROM:${formatOffset(previousOffset)}`,
        `TZOFFSETTO:${formatOffset(next)}`,
        `END:${kind}`,
      ].join("\r\n"),
    );
    previousOffset = next;
  }

  const block = ["BEGIN:VTIMEZONE", `TZID:${zone}`, ...observances, "END:VTIMEZONE"].join("\r\n");
  cache.set(key, block);
  return block;
}

/** Zone names used by DTSTART;TZID=... style parameters anywhere in the text. */
function usedZones(ics: string): Set<string> {
  return new Set([...ics.matchAll(/TZID=("?)([^:;"\r\n]+)\1/g)].map((m) => m[2]));
}

/** Zone names the document already defines with its own VTIMEZONE blocks. */
function definedZones(ics: string): Set<string> {
  return new Set([...ics.matchAll(/^TZID:(.+?)\r?$/gm)].map((m) => m[1].trim()));
}

/**
 * Return `ics` with a VTIMEZONE added for every named zone it uses but does
 * not define. Zones the runtime doesn't recognise are left alone, so the
 * parser reports them as it always did. Documents needing nothing come back
 * unchanged.
 */
export function addMissingTimezones(ics: string, from: Date, to: Date): string {
  const defined = definedZones(ics);
  const missing = [...usedZones(ics)].filter((z) => !defined.has(z) && isKnownZone(z));
  if (missing.length === 0) return ics;

  const blocks = missing.map((z) => buildVtimezone(z, from, to)).join("\r\n");
  // Time zone definitions live directly inside VCALENDAR; right after its
  // opening line is always a valid place.
  return ics.replace(/BEGIN:VCALENDAR\r?\n/i, (open) => `${open}${blocks}\r\n`);
}
