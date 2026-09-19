/**
 * Small pieces of wording and logic for a connected account's row on the
 * profile page, kept out of the components so they can be tested.
 */
import type { CalendarConnectionStatus } from "@/api/calendarStatus";

/** "1 calendar", "8 calendars", "0 busy blocks". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

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
