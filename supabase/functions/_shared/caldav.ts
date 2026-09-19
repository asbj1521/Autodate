/**
 * iCloud CalDAV client: log in with an app-specific password, find the
 * account's calendars, and fetch the timing of their events.
 *
 * Apple has no OAuth for calendars, so this is the only way in. The flow was
 * proven against a real account (see the issue notes):
 *   1. PROPFIND caldav.icloud.com          -> the account's principal URL
 *   2. PROPFIND principal                  -> the calendar home (a pNN-caldav host)
 *   3. PROPFIND home, Depth 1              -> every calendar, with type info
 *   4. REPORT calendar-query per calendar  -> events in a time range
 *
 * Privacy: step 4 asks for timing properties only (no title, place or
 * attendees), and the ICS adapter strips anything else before parsing. iCloud
 * honours the request, but the promise is enforced by our code, not by Apple.
 *
 * Security: the password is only ever sent to *.icloud.com over https. Every
 * URL that comes back from Apple (redirects, the calendar home, calendar
 * links) is re-checked before we send credentials to it, so a malformed or
 * malicious response can't make us hand the password to another host.
 */
import { XMLParser } from "npm:fast-xml-parser@4.5.1";

/** A problem that is safe to show to the user as-is. */
export class CalDavError extends Error {}

/**
 * iCloud refused the login itself. A CalDavError like any other to the
 * connect form, but the sync tells it apart: a deleted app-specific password
 * won't come back by retrying, so the account needs reconnecting.
 */
export class CalDavLoginError extends CalDavError {}

export interface CalDavCredentials {
  username: string;
  password: string;
}

/** One event calendar found in the account. */
export interface CalDavCalendar {
  /** Absolute, validated URL of the calendar collection. */
  url: string;
  /** The last path segment of the URL: stable and unique within the account. */
  id: string;
  name: string | null;
}

const START_URL = "https://caldav.icloud.com/";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_CHARS = 20_000_000;

const BAD_LOGIN =
  "Apple rejected that email or password. Use an app-specific password (not your Apple ID password) with the Apple ID email it belongs to.";

/* ----------------------------------------------------------------------------
 * URL safety
 * ------------------------------------------------------------------------- */

/** Accept only plain https URLs on icloud.com or its subdomains. */
export function assertIcloudUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CalDavError("Apple returned an address we couldn't read.");
  }
  const host = url.hostname.toLowerCase();
  const isIcloud = host === "icloud.com" || host.endsWith(".icloud.com");
  if (url.protocol !== "https:" || !isIcloud || url.username || url.password || url.port) {
    throw new CalDavError("Apple pointed us at an unexpected server, so we stopped.");
  }
  return url;
}

/* ----------------------------------------------------------------------------
 * Transport
 * ------------------------------------------------------------------------- */

async function dav(
  creds: CalDavCredentials,
  method: "PROPFIND" | "REPORT",
  rawUrl: string | URL,
  body: string,
  depth: 0 | 1,
): Promise<string> {
  const authorization = "Basic " + btoa(unescape(encodeURIComponent(`${creds.username}:${creds.password}`)));
  let url = assertIcloudUrl(rawUrl);

  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        redirect: "manual", // follow by hand so every hop is re-validated
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: authorization,
          "Content-Type": "application/xml; charset=utf-8",
          Depth: String(depth),
          "User-Agent": "Casy/1.0",
        },
        body,
      });
    } catch (err) {
      console.error("CalDAV request failed", method, url.hostname, err);
      throw new CalDavError("Couldn't reach iCloud (network error or timeout).");
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      if (hop >= MAX_REDIRECTS) throw new CalDavError("iCloud redirected too many times.");
      url = assertIcloudUrl(new URL(location, url));
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel();
      throw new CalDavLoginError(BAD_LOGIN);
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new CalDavError(`iCloud responded with HTTP ${res.status}.`);
    }
    const text = await res.text();
    if (text.length > MAX_RESPONSE_CHARS) throw new CalDavError("iCloud sent back more data than we accept.");
    return text;
  }
}

/* ----------------------------------------------------------------------------
 * XML
 * ------------------------------------------------------------------------- */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // iCloud puts a namespace on every element; we don't care which
  parseTagValue: false, // keep "2026" a string, not a number
  isArray: (name) => name === "response" || name === "propstat" || name === "comp",
});

type XmlValue = unknown;

/** The text of an element, whether or not the parser wrapped it (attributes). */
function textOf(value: XmlValue): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in value) {
    return String((value as { "#text": unknown })["#text"]);
  }
  return null;
}

/** One <response> of a multistatus: its href and its successfully-read properties. */
export interface DavResponse {
  href: string;
  prop: Record<string, XmlValue>;
}

/** Parse a WebDAV multistatus body into responses (only 200-status properties). */
export function parseMultistatus(xml: string): DavResponse[] {
  let doc: { multistatus?: { response?: unknown[] } };
  try {
    doc = parser.parse(xml);
  } catch {
    throw new CalDavError("iCloud sent a response we couldn't read.");
  }
  const responses = (doc.multistatus?.response ?? []) as {
    href?: XmlValue;
    propstat?: { prop?: Record<string, XmlValue>; status?: string }[];
  }[];

  return responses.map((r) => {
    const prop: Record<string, XmlValue> = {};
    for (const ps of r.propstat ?? []) {
      if (typeof ps.status === "string" && !/\s200\s/.test(ps.status)) continue;
      if (ps.prop && typeof ps.prop === "object") Object.assign(prop, ps.prop);
    }
    return { href: textOf(r.href) ?? "", prop };
  });
}

/** The href inside a property such as current-user-principal / calendar-home-set. */
function hrefInside(prop: XmlValue): string | null {
  if (prop && typeof prop === "object" && "href" in prop) {
    return textOf((prop as { href: XmlValue }).href);
  }
  return null;
}

/* ----------------------------------------------------------------------------
 * Discovery
 * ------------------------------------------------------------------------- */

const NS = `xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"`;

/**
 * Turn a listing of collections into event calendars: collections that are
 * real or subscribed calendars AND hold events. That skips the home root, the
 * scheduling inbox/outbox, notification collections, and reminder lists.
 */
export function pickEventCalendars(responses: DavResponse[], homeUrl: URL): CalDavCalendar[] {
  const calendars: CalDavCalendar[] = [];
  for (const r of responses) {
    const type = r.prop["resourcetype"];
    if (!type || typeof type !== "object") continue;
    if (!("calendar" in type) && !("subscribed" in type)) continue;

    const componentSet = r.prop["supported-calendar-component-set"];
    const comps = (componentSet && typeof componentSet === "object"
      ? ((componentSet as { comp?: { "@_name"?: string }[] }).comp ?? [])
      : []);
    if (!comps.some((c) => c["@_name"]?.toUpperCase() === "VEVENT")) continue;

    const url = assertIcloudUrl(new URL(r.href, homeUrl));
    const id = url.pathname.split("/").filter(Boolean).pop();
    if (!id) continue;
    calendars.push({ url: url.toString(), id, name: textOf(r.prop["displayname"]) });
  }
  return calendars;
}

/** Log in and list the account's event calendars. */
export async function discoverCalendars(creds: CalDavCredentials): Promise<CalDavCalendar[]> {
  const principalXml = await dav(
    creds,
    "PROPFIND",
    START_URL,
    `<d:propfind ${NS}><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
    0,
  );
  const principalHref = hrefInside(parseMultistatus(principalXml)[0]?.prop["current-user-principal"]);
  if (!principalHref) throw new CalDavError("Couldn't find your iCloud calendar account.");

  const homeXml = await dav(
    creds,
    "PROPFIND",
    new URL(principalHref, START_URL),
    `<d:propfind ${NS}><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
    0,
  );
  const homeHref = hrefInside(parseMultistatus(homeXml)[0]?.prop["calendar-home-set"]);
  if (!homeHref) throw new CalDavError("Couldn't find your iCloud calendars.");
  const homeUrl = assertIcloudUrl(new URL(homeHref, START_URL));

  const listXml = await dav(
    creds,
    "PROPFIND",
    homeUrl,
    `<d:propfind ${NS}><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`,
    1,
  );
  return pickEventCalendars(parseMultistatus(listXml), homeUrl);
}

/* ----------------------------------------------------------------------------
 * Events
 * ------------------------------------------------------------------------- */

/** ICS "basic" UTC form, e.g. 20260919T000000Z, as CalDAV time ranges want. */
const caldavTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Fetch the events of one calendar that touch [from, to). Returns one ICS
 * document per event resource. Only timing properties are requested; the
 * caller must still pass each through the ICS privacy filter, since that is
 * what we rely on.
 *
 * Recurring events come back as one document with their RRULE, and time zones
 * are usually referred to by name without a definition (iCloud mostly does
 * this); see timezones.ts for how those are made parseable.
 */
export async function fetchEventDocuments(
  creds: CalDavCredentials,
  calendarUrl: string,
  from: Date,
  to: Date,
): Promise<string[]> {
  const xml = await dav(
    creds,
    "REPORT",
    calendarUrl,
    `<c:calendar-query ${NS}>
      <d:prop><c:calendar-data>
        <c:comp name="VCALENDAR"><c:prop name="VERSION"/>
          <c:comp name="VEVENT">
            <c:prop name="UID"/><c:prop name="DTSTART"/><c:prop name="DTEND"/><c:prop name="DURATION"/>
            <c:prop name="RRULE"/><c:prop name="RDATE"/><c:prop name="EXDATE"/><c:prop name="RECURRENCE-ID"/>
            <c:prop name="TRANSP"/><c:prop name="STATUS"/>
          </c:comp>
          <c:comp name="VTIMEZONE"/>
        </c:comp>
      </c:calendar-data></d:prop>
      <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
        <c:time-range start="${caldavTime(from)}" end="${caldavTime(to)}"/>
      </c:comp-filter></c:comp-filter></c:filter>
    </c:calendar-query>`,
    1,
  );
  return parseMultistatus(xml)
    .map((r) => textOf(r.prop["calendar-data"]))
    .filter((doc): doc is string => !!doc && doc.includes("BEGIN:VCALENDAR"));
}

/* ----------------------------------------------------------------------------
 * Small utility
 * ------------------------------------------------------------------------- */

/** Run `fn` over `items` with at most `limit` in flight, keeping input order. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}
