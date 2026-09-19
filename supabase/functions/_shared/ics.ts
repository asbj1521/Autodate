/**
 * ICS (iCalendar feed) adapter: fetch a calendar link and turn it into busy
 * intervals. Serves anything that publishes a plain .ics URL: a university
 * timetable, Outlook's "publish calendar" link, Google's secret iCal address.
 *
 * Privacy: an ICS feed inherently carries titles, descriptions, locations and
 * attendees. Before the text ever reaches the parser, stripToTimingLines()
 * keeps only an allowlist of timing/status properties and drops the rest, the
 * same way the Outlook adapter only ever $selects start/end/showAs. Nothing
 * outside that allowlist is parsed, stored, or logged. Keep the allowlist
 * tight.
 *
 * Security: the feed URL is supplied by the caller and fetched from the
 * server, so fetchFeedText() refuses anything but plain public https URLs.
 * DNS-rebinding (a public name that later resolves to a private address) is
 * not defended against here.
 */
import ICAL from "npm:ical.js@2.2.1";
import { mergeIntervals, type RawBusyInterval } from "./intervals.ts";

/** A problem with the feed or URL that is safe to show to the user as-is. */
export class IcsError extends Error {}

// ---------------------------------------------------------------------------
// Privacy filter
// ---------------------------------------------------------------------------

const KEEP_COMPONENTS = new Set(["VCALENDAR", "VEVENT", "VTIMEZONE", "STANDARD", "DAYLIGHT"]);
const KEEP_PROPERTIES = new Set([
  // identity / grouping of recurrence exceptions
  "UID",
  "RECURRENCE-ID",
  // timing
  "DTSTART",
  "DTEND",
  "DURATION",
  "RRULE",
  "RDATE",
  "EXDATE",
  // does this event actually block time?
  "TRANSP",
  "STATUS",
  // time zone definitions
  "TZID",
  "TZOFFSETFROM",
  "TZOFFSETTO",
  "TZNAME",
  "X-WR-TIMEZONE",
  // the feed's own name, used only as a default label
  "X-WR-CALNAME",
  "VERSION",
]);

/**
 * Reduce a feed to timing lines only. Drops every property not in the
 * allowlist, and every component (alarms, todos, ...) other than calendar,
 * event and time zone ones.
 */
export function stripToTimingLines(raw: string): string {
  const unfolded = raw.replace(/\r?\n[ \t]/g, "");
  const out: string[] = [];
  let skipDepth = 0; // >0 while inside a component we are dropping
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9-]+)/);
    if (!m) continue;
    const name = m[1].toUpperCase();
    if (name === "BEGIN") {
      const component = line.slice(line.indexOf(":") + 1).trim().toUpperCase();
      if (skipDepth > 0 || !KEEP_COMPONENTS.has(component)) {
        skipDepth++;
      } else {
        out.push(line);
      }
    } else if (name === "END") {
      if (skipDepth > 0) skipDepth--;
      else out.push(line);
    } else if (skipDepth === 0 && KEEP_PROPERTIES.has(name)) {
      out.push(line);
    }
  }
  return out.join("\r\n");
}

// ---------------------------------------------------------------------------
// Parsing and recurrence expansion
// ---------------------------------------------------------------------------

// Hard stops so a hostile or odd feed can't make us loop or allocate forever.
const MAX_OCCURRENCES_PER_EVENT = 5000;
const MAX_INTERVALS = 50_000;

export interface ParsedFeed {
  /** The feed's own calendar name, if it declares one. */
  calendarName: string | null;
  /** Merged busy intervals clipped to the requested window, UTC ISO strings. */
  intervals: RawBusyInterval[];
}

/**
 * Busy intervals in [windowStart, windowEnd) from raw ICS text. Every event
 * blocks time unless it is TRANSPARENT (shown as free) or CANCELLED. Throws
 * IcsError for feeds that aren't calendars or that use a time zone we can't
 * resolve (rather than silently placing events at the wrong hour).
 */
export function parseBusyIntervals(raw: string, windowStart: Date, windowEnd: Date): ParsedFeed {
  if (!/BEGIN:VCALENDAR/i.test(raw)) {
    throw new IcsError("That link doesn't look like a calendar feed (no VCALENDAR found).");
  }

  let root: InstanceType<typeof ICAL.Component>;
  try {
    root = new ICAL.Component(ICAL.parse(stripToTimingLines(raw)));
  } catch (err) {
    console.error("ICS parse failed", err);
    throw new IcsError("Couldn't read that calendar feed. Is it a valid .ics link?");
  }

  // Time zones are defined inside the feed itself (VTIMEZONE). ical.js keeps a
  // global registry, so start from a clean one for every feed.
  ICAL.TimezoneService.reset();
  const knownZones = new Set<string>();
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    const tz = new ICAL.Timezone(vtz);
    ICAL.TimezoneService.register(tz);
    knownZones.add(tz.tzid);
  }
  const feedZoneName = root.getFirstPropertyValue("x-wr-timezone") as string | null;
  const feedZone =
    feedZoneName && knownZones.has(feedZoneName) ? ICAL.TimezoneService.get(feedZoneName) : null;

  const calendarName = (root.getFirstPropertyValue("x-wr-calname") as string | null) || null;

  // Exceptions (RECURRENCE-ID) override single occurrences of a recurring
  // event with the same UID.
  const events: InstanceType<typeof ICAL.Event>[] = [];
  const exceptions: InstanceType<typeof ICAL.Event>[] = [];
  for (const vevent of root.getAllSubcomponents("vevent")) {
    // TZID is single-valued; the library types it as string | string[].
    const tzid = vevent.getFirstProperty("dtstart")?.getParameter("tzid") as string | undefined;
    if (tzid && !knownZones.has(tzid)) {
      throw new IcsError(
        `This feed uses the time zone "${tzid}" without defining it, so event times can't be placed reliably.`,
      );
    }
    const ev = new ICAL.Event(vevent);
    (vevent.hasProperty("recurrence-id") ? exceptions : events).push(ev);
  }
  const byUid = new Map(events.map((e) => [e.uid, e]));
  const standalone = [...events];
  for (const ex of exceptions) {
    const master = byUid.get(ex.uid);
    if (master && master.isRecurring()) master.relateException(ex);
    else standalone.push(ex); // orphan exception: treat as a normal event
  }

  const toDate = (t: InstanceType<typeof ICAL.Time>): Date => {
    if (t.isDate) {
      // All-day: a calendar date, meaning midnight in the feed's own zone
      // (falling back to UTC when it declares none).
      const midnight = new ICAL.Time(
        { year: t.year, month: t.month, day: t.day, hour: 0, minute: 0, second: 0, isDate: false },
        feedZone ?? ICAL.Timezone.utcTimezone,
      );
      return midnight.toJSDate();
    }
    if (t.zone === ICAL.Timezone.localTimezone && feedZone) {
      // Floating time (no zone, no Z): read it in the feed's own zone.
      t.zone = feedZone;
    }
    return t.toJSDate();
  };

  const blocks = (ev: InstanceType<typeof ICAL.Event>): boolean => {
    const status = String(ev.component.getFirstPropertyValue("status") ?? "").toUpperCase();
    const transp = String(ev.component.getFirstPropertyValue("transp") ?? "").toUpperCase();
    return status !== "CANCELLED" && transp !== "TRANSPARENT";
  };

  const collected: RawBusyInterval[] = [];
  const add = (start: Date, end: Date) => {
    const s = new Date(Math.max(start.getTime(), windowStart.getTime()));
    const e = new Date(Math.min(end.getTime(), windowEnd.getTime()));
    if (e > s) collected.push({ start: s.toISOString(), end: e.toISOString() });
  };

  for (const ev of standalone) {
    if (!ev.isRecurring()) {
      if (blocks(ev)) add(toDate(ev.startDate), toDate(ev.endDate));
    } else {
      const it = ev.iterator();
      for (let n = 0, next = it.next(); next && n < MAX_OCCURRENCES_PER_EVENT; n++, next = it.next()) {
        const d = ev.getOccurrenceDetails(next);
        const start = toDate(d.startDate);
        if (start >= windowEnd) break; // occurrences come in ascending order
        if (blocks(d.item)) add(start, toDate(d.endDate));
      }
    }
    if (collected.length > MAX_INTERVALS) {
      throw new IcsError("That feed has too many events to import.");
    }
  }

  return { calendarName, intervals: mergeIntervals(collected) };
}

// ---------------------------------------------------------------------------
// Safe fetching
// ---------------------------------------------------------------------------

const MAX_FEED_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

function isPrivateIPv4(host: string): boolean {
  const p = host.split(".").map(Number);
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 || // multicast + reserved
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local (cloud metadata lives here)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/**
 * Accept only plain, public https URLs. webcal:// (what calendar apps show)
 * is treated as https://. Returns the normalised URL or throws IcsError.
 */
export function assertSafeFeedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new IcsError("That doesn't look like a valid link.");
  }
  if (url.protocol !== "https:") throw new IcsError("Only https:// (or webcal://) links are supported.");
  if (url.username || url.password) throw new IcsError("Links with a username or password in them aren't supported.");
  if (url.port && url.port !== "443") throw new IcsError("Links on non-standard ports aren't supported.");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const looksInternal =
    host.includes(":") || // IPv6 literal
    !host.includes(".") ||
    /\.(local|localhost|internal|localdomain|lan|home\.arpa)$/.test(host) ||
    (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && isPrivateIPv4(host));
  if (looksInternal) throw new IcsError("That link points at a private or internal address.");
  return url;
}

/** Fetch a feed's text with a size cap, a timeout, and re-validated redirects. */
export async function fetchFeedText(rawUrl: string): Promise<string> {
  let url = assertSafeFeedUrl(rawUrl);
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "Casy/1.0" },
      });
    } catch (err) {
      console.error("ICS fetch failed", url.hostname, err);
      throw new IcsError("Couldn't reach that link (network error or timeout).");
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= MAX_REDIRECTS) throw new IcsError("That link redirects too many times.");
      await res.body?.cancel();
      url = assertSafeFeedUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new IcsError(`That link responded with HTTP ${res.status}.`);
    }

    const declared = Number(res.headers.get("content-length"));
    if (declared > MAX_FEED_BYTES) throw new IcsError("That feed is larger than 5 MB.");

    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_FEED_BYTES) {
        await reader.cancel();
        throw new IcsError("That feed is larger than 5 MB.");
      }
      chunks.push(value);
    }
    const all = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    return new TextDecoder("utf-8").decode(all);
  }
}
