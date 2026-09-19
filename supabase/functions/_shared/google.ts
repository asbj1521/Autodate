/**
 * Thin wrappers over the three Google endpoints the Google adapter needs:
 * token exchange, listing calendars (names only), and free/busy. Kept
 * separate from the Edge Functions themselves so the same calls can be
 * reused by a future scheduled sync function, not just the OAuth callback.
 */

import { isInvalidGrant, ReauthRequired } from "./reauth.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_LIST_URL =
  "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";

export interface GoogleTokens {
  access_token: string;
  /** Only present on the first consent (or a forced re-consent). */
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
}): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Trade the stored refresh token for a fresh access token (they last an
 * hour). Throws ReauthRequired when Google refuses the refresh token itself,
 * which in Testing mode happens seven days after consent.
 */
export async function refreshAccessToken(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (isInvalidGrant(res.status, body)) {
      throw new ReauthRequired("Google no longer accepts this connection's access.");
    }
    throw new Error(`Google token refresh failed: ${res.status} ${body}`);
  }
  return res.json();
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
}

/**
 * Google's built-in calendars for holidays ("en.danish#holiday@group.v.calendar.google.com")
 * and week numbers ("e_2_en#weeknum@group.v.calendar.google.com"). They aren't
 * part of the user's account data, and free/busy answers "notFound" for them.
 * Autodate provides both itself, a built-in Danish holiday calendar and a
 * week-number column, so importing them would only add empty per-account
 * calendars to the list.
 */
export function isGoogleBuiltInCalendar(id: string): boolean {
  return (
    id.endsWith("#holiday@group.v.calendar.google.com") ||
    id.endsWith("#weeknum@group.v.calendar.google.com")
  );
}

/** List the calendars this account can see: names and ids only, never events. */
export async function listCalendars(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const items: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(CALENDAR_LIST_URL);
    url.searchParams.set("minAccessRole", "freeBusyReader");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google calendarList failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    items.push(...(body.items ?? []).filter((c: GoogleCalendarListEntry) => !isGoogleBuiltInCalendar(c.id)));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return items;
}

/** One provider-agnostic busy interval, mirroring the frontend's BusyInterval shape. */
export interface RawBusyInterval {
  start: string;
  end: string;
}

/**
 * Free/busy for a set of calendars over one range, keyed by calendar id.
 *
 * Google rejects a single freeBusy.query whose range is too long (observed
 * as a "timeRangeTooLong" 400 past roughly three months), so a request
 * spanning a year (which an initial full sync does) is chunked into
 * smaller windows run sequentially, with each calendar's results merged
 * across chunks. Callers never see the chunking; they get back the same
 * shape as a single query over the whole range.
 */
const MAX_CHUNK_DAYS = 90;

async function queryFreeBusyChunk(
  accessToken: string,
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<Record<string, RawBusyInterval[]>> {
  const res = await fetch(FREEBUSY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Google freeBusy failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  const out: Record<string, RawBusyInterval[]> = {};
  for (const [calendarId, entry] of Object.entries<{ busy?: RawBusyInterval[] }>(
    body.calendars ?? {},
  )) {
    out[calendarId] = entry.busy ?? [];
  }
  return out;
}

export async function queryFreeBusy(
  accessToken: string,
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<Record<string, RawBusyInterval[]>> {
  const merged: Record<string, RawBusyInterval[]> = {};
  for (const id of calendarIds) merged[id] = [];

  let chunkStart = new Date(timeMin);
  const end = new Date(timeMax);
  while (chunkStart < end) {
    const chunkEnd = new Date(
      Math.min(chunkStart.getTime() + MAX_CHUNK_DAYS * 24 * 60 * 60 * 1000, end.getTime()),
    );
    const chunkResult = await queryFreeBusyChunk(
      accessToken,
      calendarIds,
      chunkStart.toISOString(),
      chunkEnd.toISOString(),
    );
    for (const [calendarId, intervals] of Object.entries(chunkResult)) {
      (merged[calendarId] ??= []).push(...intervals);
    }
    chunkStart = chunkEnd;
  }
  return merged;
}
