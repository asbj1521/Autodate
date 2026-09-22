/**
 * Small pieces of wording and logic for a connected account's row on the
 * profile page, kept out of the components so they can be tested.
 */
import type { CalendarConnectionStatus } from "@/api/calendarStatus";

/** The names of an account's calendars, as the profile page lists them. */
export function calendarNames(account: CalendarConnectionStatus): string[] {
  return account.calendar_sources.map((s) => s.display_name ?? s.id);
}

const normalise = (text: string | null | undefined) => (text ?? "").trim().toLowerCase();

/**
 * True when listing the calendar names would tell the user something new.
 * A Google account's only calendar is named after the account itself, and a
 * link's single calendar after the link, so showing those names would only
 * repeat the row's title.
 */
export function hasDistinctCalendarNames(account: CalendarConnectionStatus): boolean {
  const label = normalise(account.account_label);
  return calendarNames(account).some((name) => normalise(name) !== label);
}

/** The words for "Synced 12 min ago" and so on, from the page's dictionary. */
export interface SyncedWords {
  justNow: string;
  minutes: (n: number) => string;
  hours: (n: number) => string;
  days: (n: number) => string;
}

/**
 * "Synced just now", "Synced 12 min ago", "Synced 3 h ago", "Synced 2 days
 * ago": how fresh an account's busy times are. Null when it never synced.
 */
export function syncedAgo(iso: string | null, nowMs: number, words: SyncedWords): string | null {
  if (!iso) return null;
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 1) return words.justNow;
  if (minutes < 60) return words.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.hours(hours);
  return words.days(Math.floor(hours / 24));
}
