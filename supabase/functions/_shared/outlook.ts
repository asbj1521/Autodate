/**
 * Thin wrappers over the Microsoft endpoints the Outlook adapter needs:
 * token exchange, listing calendars (names only), and busy intervals. Same
 * exported shape as _shared/google.ts so the OAuth callbacks read alike, and
 * so a future scheduled sync function can reuse these calls.
 *
 * Why calendarView and not getSchedule (the obvious "free/busy" endpoint):
 * delegated getSchedule is documented as unsupported for personal Microsoft
 * accounts (Outlook.com / Hotmail), and it is keyed by SMTP address rather
 * than calendar, so it can't give per-calendar busy data for the purpose
 * labels in calendar_sources. calendarView works for both account types and
 * per calendar.
 *
 * Privacy: unlike Google's calendar.freebusy scope, no Microsoft scope is
 * free/busy-only, and Calendars.Read can read event subjects and bodies. So
 * "we never read titles" is enforced here, by always sending an explicit
 * $select of start/end/showAs/isCancelled. Never widen that $select.
 *
 * Why Calendars.Read rather than the narrower Calendars.ReadBasic: tested
 * against a real personal (Outlook.com) account, ReadBasic authenticates but
 * every calendar call returns 403 ErrorAccessDenied, despite the docs listing
 * it as supported for personal accounts. It may work for work/school accounts,
 * but the account type isn't known until after sign-in, so one scope set has
 * to serve both.
 */

import { mergeIntervals, type RawBusyInterval } from "./intervals.ts";
import { isInvalidGrant, ReauthRequired } from "./reauth.ts";

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const GRAPH_URL = "https://graph.microsoft.com/v1.0";

/**
 * offline_access is what makes Microsoft issue a refresh token at all (Google
 * uses access_type=offline instead). Without it the connection dies after the
 * first access token expires, about an hour.
 *
 * User.Read looks unused (we take the account email from the default
 * calendar's owner) but is needed for personal accounts: a token with only a
 * calendar scope got 401 UnknownError from Graph on every endpoint, including
 * /me, until User.Read was also consented.
 */
export const SCOPES = [
  "offline_access",
  "https://graph.microsoft.com/Calendars.Read",
  "https://graph.microsoft.com/User.Read",
].join(" ");

export interface OutlookTokens {
  access_token: string;
  /** Only present because offline_access was requested. */
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<OutlookTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES,
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Trade the stored refresh token for a fresh access token. Microsoft usually
 * returns a *new* refresh token as well and the old one eventually stops
 * working, so the caller must store the replacement. Throws ReauthRequired
 * when Microsoft refuses the refresh token itself.
 */
export async function refreshAccessToken(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<OutlookTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: "refresh_token",
      scope: SCOPES,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (isInvalidGrant(res.status, body)) {
      throw new ReauthRequired("Microsoft no longer accepts this connection's access.");
    }
    throw new Error(`Microsoft token refresh failed: ${res.status} ${body}`);
  }
  return res.json();
}

/** The shape of a paged Graph collection response. */
interface GraphList<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

/** The only event fields we ever request (see the $select in queryCalendarChunk). */
interface GraphEvent {
  start: { dateTime: string };
  end: { dateTime: string };
  showAs?: string;
  isCancelled?: boolean;
}

/** GET a Graph URL as JSON, backing off on throttling (429) a couple of times. */
async function graphGet<T>(accessToken: string, url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Without this, times come back in UTC anyway; stating it keeps the
        // "append Z" normalisation below honest if a default ever changes.
        Prefer: 'outlook.timezone="UTC"',
      },
    });
    if (res.status === 429 && attempt < 2) {
      const waitSec = Math.min(Number(res.headers.get("Retry-After")) || 2, 20);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }
    if (!res.ok) {
      // Graph often answers 401 with an empty body; the reason then lives in
      // WWW-Authenticate, so include it (never the token) in the error.
      const wwwAuth = res.headers.get("WWW-Authenticate");
      throw new Error(
        `Microsoft Graph ${res.status} for ${new URL(url).pathname}: ${await res.text()}` +
          (wwwAuth ? ` [WWW-Authenticate: ${wwwAuth}]` : "") +
          ` [request-id: ${res.headers.get("request-id") ?? "n/a"}]`,
      );
    }
    return res.json();
  }
}

export interface OutlookCalendarListEntry {
  id: string;
  name: string;
  isDefaultCalendar?: boolean;
  owner?: { name?: string; address?: string } | null;
}

/** List the calendars this account can see: names and ids only, never events. */
export async function listCalendars(accessToken: string): Promise<OutlookCalendarListEntry[]> {
  const items: OutlookCalendarListEntry[] = [];
  let next: string | undefined =
    `${GRAPH_URL}/me/calendars?$select=id,name,isDefaultCalendar,owner&$top=100`;
  while (next) {
    const body: GraphList<OutlookCalendarListEntry> = await graphGet(accessToken, next);
    items.push(...(body.value ?? []));
    next = body["@odata.nextLink"];
  }
  return items;
}

// Only these count as "busy". free and workingElsewhere leave you available;
// unknown is what Outlook uses for things like birthdays and holidays.
const BUSY_STATUSES = new Set(["busy", "tentative", "oof"]);

// calendarView's docs state no maximum date range (unlike Google's
// freeBusy.query, which rejected long ranges). Chunking anyway to keep each
// response bounded and match the Google adapter's behavior. calendarView
// returns every event *overlapping* the window, so an event spanning a chunk
// boundary appears in both chunks: intervals are clipped to their chunk and
// merged afterwards.
const MAX_CHUNK_DAYS = 90;
const PAGE_SIZE = 1000; // calendarView's documented $top maximum

/** Graph returns "2026-09-20T10:00:00.0000000" (UTC, no zone suffix, 7 fractional digits). */
function graphDateTimeToIso(dateTime: string): string {
  const trimmed = dateTime.replace(/(\.\d{3})\d*$/, "$1");
  return new Date(trimmed.endsWith("Z") ? trimmed : `${trimmed}Z`).toISOString();
}

async function queryCalendarChunk(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<RawBusyInterval[]> {
  const out: RawBusyInterval[] = [];
  const params = new URLSearchParams({
    startDateTime: timeMin.toISOString(),
    endDateTime: timeMax.toISOString(),
    // The privacy line: never select subject, location, organizer, etc.
    $select: "start,end,showAs,isCancelled",
    $top: String(PAGE_SIZE),
  });
  let next: string | undefined =
    `${GRAPH_URL}/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params}`;
  while (next) {
    const body: GraphList<GraphEvent> = await graphGet(accessToken, next);
    for (const ev of body.value ?? []) {
      // No status at all is treated like an unknown one: not busy.
      if (ev.isCancelled || !BUSY_STATUSES.has(ev.showAs ?? "")) continue;
      const start = new Date(Math.max(new Date(graphDateTimeToIso(ev.start.dateTime)).getTime(), timeMin.getTime()));
      const end = new Date(Math.min(new Date(graphDateTimeToIso(ev.end.dateTime)).getTime(), timeMax.getTime()));
      if (end > start) out.push({ start: start.toISOString(), end: end.toISOString() });
    }
    next = body["@odata.nextLink"];
  }
  return out;
}

/**
 * Busy intervals for a set of calendars over one range, keyed by calendar id.
 * Same signature and return shape as the Google adapter's queryFreeBusy.
 *
 * Calendars are queried sequentially rather than in parallel: Outlook limits
 * concurrent requests per mailbox (documented as 4), and throttling costs
 * more than it saves.
 */
export async function queryFreeBusy(
  accessToken: string,
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<Record<string, RawBusyInterval[]>> {
  const result: Record<string, RawBusyInterval[]> = {};
  const rangeEnd = new Date(timeMax);

  for (const calendarId of calendarIds) {
    const collected: RawBusyInterval[] = [];
    let chunkStart = new Date(timeMin);
    while (chunkStart < rangeEnd) {
      const chunkEnd = new Date(
        Math.min(chunkStart.getTime() + MAX_CHUNK_DAYS * 24 * 60 * 60 * 1000, rangeEnd.getTime()),
      );
      collected.push(...(await queryCalendarChunk(accessToken, calendarId, chunkStart, chunkEnd)));
      chunkStart = chunkEnd;
    }
    result[calendarId] = mergeIntervals(collected);
  }
  return result;
}
