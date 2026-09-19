/**
 * Layout logic for the "Calendar overview" page: a month grid of the user's
 * own collected busy blocks.
 *
 * Unlike the scheduling page (which works in UTC over mock participants), this
 * shows one real person's data, so days are *local* days: a block that runs
 * 22:00 to 02:00 belongs partly to each of two days as the person lives them.
 * Everything here is a pure function over plain data so it can be tested
 * without a browser or a network.
 *
 * Privacy: blocks carry only a time range and the calendar they came from.
 * There is no event title anywhere in this data, by design.
 */
import { danishHolidays, type Holiday } from "@/lib/danishHolidays";
import type { CalendarProvider, CalendarPurpose } from "@/types";

/** One connected calendar, as returned by the calendar-busy function. */
export interface OverviewCalendar {
  id: string;
  name: string;
  /** The category the user gave this calendar, or null if unset. */
  purpose: CalendarPurpose | null;
  /** "builtin" marks a calendar Autodate provides itself, with no account behind it. */
  provider: CalendarProvider | "builtin";
  /** The account it belongs to (an email, or a link's name). */
  account: string | null;
  connectionId: string;
}

/** A busy block. `start` inclusive, `end` exclusive, ISO 8601 UTC. */
export interface OverviewBlock {
  calendarId: string;
  start: string;
  end: string;
}

export interface OverviewData {
  calendars: OverviewCalendar[];
  blocks: OverviewBlock[];
  /** True if the backend stopped early because there were too many blocks. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Month layout
// ---------------------------------------------------------------------------

export interface MonthDay {
  /** Local calendar day as "YYYY-MM-DD", used as a stable key. */
  key: string;
  /** Local midnight at the start of the day. */
  date: Date;
  dayOfMonth: number;
  /** False for the spill-over days that pad the grid from neighbouring months. */
  inMonth: boolean;
}

export interface MonthLayout {
  /** e.g. "september 2026". */
  label: string;
  /** Column headers, Monday-first, in the same Danish style as the front page. */
  weekdayLabels: string[];
  weeks: MonthDay[][];
  /** ISO 8601 week number for each row of `weeks` (Danish "uge"). */
  weekNumbers: number[];
  /** Start of the first grid cell (local midnight). */
  from: Date;
  /** Start of the day after the last grid cell (local midnight, exclusive). */
  to: Date;
}

const WEEKDAY_LABELS = ["man.", "tirs.", "ons.", "tors.", "fre.", "lør.", "søn."];

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for the local calendar day containing `d`. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight at the start of the day containing `d`. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * ISO 8601 week number (1 to 53) of the local calendar day containing `date`.
 * Weeks start on Monday, and week 1 is the week containing the year's first
 * Thursday, which is the numbering Denmark uses. The week number belongs to
 * the year of that Thursday, so 1 January can fall in week 52 or 53 and 31
 * December in week 1.
 */
export function isoWeekNumber(date: Date): number {
  // Work in UTC on the local y/m/d so daylight saving can't shift the day.
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayBasedDay = (new Date(utc).getUTCDay() + 6) % 7; // Monday = 0
  const thursday = utc + (3 - mondayBasedDay) * 86_400_000;
  const jan1 = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - jan1) / 86_400_000 / 7) + 1;
}

/**
 * A Monday-first month grid padded with spill-over days to whole weeks (5 or
 * 6 rows), like the front page's calendar.
 *
 * @param monthIndex 0-based (0 = January)
 */
export function buildMonthLayout(year: number, monthIndex: number): MonthLayout {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7; // days since Monday
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const rows = Math.ceil((offset + daysInMonth) / 7);

  const weeks: MonthDay[][] = [];
  for (let r = 0; r < rows; r++) {
    const week: MonthDay[] = [];
    for (let c = 0; c < 7; c++) {
      // Date() normalises out-of-range days, so this walks across month edges.
      const date = new Date(year, monthIndex, 1 - offset + r * 7 + c);
      week.push({
        key: dayKey(date),
        date,
        dayOfMonth: date.getDate(),
        inMonth: date.getMonth() === monthIndex,
      });
    }
    weeks.push(week);
  }

  return {
    label: first.toLocaleString("da-DK", { month: "long", year: "numeric" }),
    weekdayLabels: WEEKDAY_LABELS,
    weeks,
    weekNumbers: weeks.map((week) => isoWeekNumber(week[0].date)),
    from: weeks[0][0].date,
    to: new Date(year, monthIndex, 1 - offset + rows * 7),
  };
}

// ---------------------------------------------------------------------------
// Blocks -> per-day segments
// ---------------------------------------------------------------------------

/** The part of one busy block that falls on one local day. */
export interface DaySegment {
  calendarId: string;
  /** Clipped to the day. */
  start: Date;
  /** Clipped to the day; may be the following local midnight. */
  end: Date;
  /** Covers the whole local day (an all-day event, or the middle of a long one). */
  allDay: boolean;
  /** The block began on an earlier day. */
  continuesBefore: boolean;
  /** The block runs on into a later day. */
  continuesAfter: boolean;
  /** Set for a built-in holiday entry; these are days, not busy time. */
  holiday?: Holiday;
}

const MAX_DAYS_PER_BLOCK = 400; // guard against a malformed, endless block

/**
 * Split blocks at local midnights and group the pieces by day, limited to
 * [from, to). Each day's segments are sorted by start time.
 */
export function segmentByDay(
  blocks: OverviewBlock[],
  from: Date,
  to: Date,
): Map<string, DaySegment[]> {
  const byDay = new Map<string, DaySegment[]>();
  for (const b of blocks) {
    const bs = new Date(b.start);
    const be = new Date(b.end);
    if (!(be > bs) || be <= from || bs >= to) continue;

    const limit = be < to ? be : to;
    let day = startOfLocalDay(bs > from ? bs : from);
    for (let n = 0; day < limit && n < MAX_DAYS_PER_BLOCK; n++) {
      // Built from parts (not +24h) so 23- and 25-hour days at DST changes work.
      const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      const start = bs > day ? bs : day;
      const end = be < next ? be : next;
      if (end > start) {
        const key = dayKey(day);
        const list = byDay.get(key) ?? [];
        list.push({
          calendarId: b.calendarId,
          start,
          end,
          allDay: start.getTime() === day.getTime() && end.getTime() === next.getTime(),
          continuesBefore: bs < day,
          continuesAfter: be > next,
        });
        byDay.set(key, list);
      }
      day = next;
    }
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
  }
  return byDay;
}

// ---------------------------------------------------------------------------
// Built-in Danish holidays
// ---------------------------------------------------------------------------

export const HOLIDAY_CALENDAR_ID = "builtin:dk-holidays";

/** Holidays are always categorised as this; there is nothing to pick. */
export const HOLIDAY_CATEGORY_LABEL = "Holiday";

/** The always-present holiday calendar: computed, not connected, no account. */
export const HOLIDAY_CALENDAR: OverviewCalendar = {
  id: HOLIDAY_CALENDAR_ID,
  name: "Danish public holidays",
  purpose: null,
  provider: "builtin",
  account: null,
  connectionId: HOLIDAY_CALENDAR_ID,
};

/** "r, g, b" for holidays. Red, deliberately not used by categories or the palette. */
const HOLIDAY_RGB = "220, 38, 38";

/** Holidays inside [from, to), as all-day segments keyed by local day. */
export function holidaySegmentsByDay(from: Date, to: Date): Map<string, DaySegment[]> {
  const byDay = new Map<string, DaySegment[]>();
  const lastYear = new Date(to.getTime() - 1).getFullYear(); // a grid can straddle two years
  for (let year = from.getFullYear(); year <= lastYear; year++) {
    for (const holiday of danishHolidays(year)) {
      if (holiday.date < from || holiday.date >= to) continue;
      const next = new Date(holiday.date.getFullYear(), holiday.date.getMonth(), holiday.date.getDate() + 1);
      const list = byDay.get(holiday.key) ?? [];
      list.push({
        calendarId: HOLIDAY_CALENDAR_ID,
        start: holiday.date,
        end: next,
        allDay: true,
        continuesBefore: false,
        continuesAfter: false,
        holiday,
      });
      byDay.set(holiday.key, list);
    }
  }
  return byDay;
}

/** Put each day's holidays ahead of that day's other segments. Inputs are not modified. */
export function withHolidays(
  segments: Map<string, DaySegment[]>,
  holidays: Map<string, DaySegment[]>,
): Map<string, DaySegment[]> {
  const merged = new Map(segments);
  for (const [key, list] of holidays) merged.set(key, [...list, ...(segments.get(key) ?? [])]);
  return merged;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "09:15" in the viewer's local time zone. */
export function formatLocalTime(d: Date): string {
  return TIME_FORMAT.format(d);
}

/** "09:15-11:20", "All day", or "22:00-24:00" for a segment ending at midnight. */
export function formatSegmentRange(seg: DaySegment): string {
  if (seg.allDay) return "All day";
  const endsAtMidnight =
    seg.end.getHours() === 0 && seg.end.getMinutes() === 0 && seg.end > seg.start;
  return `${formatLocalTime(seg.start)}-${endsAtMidnight ? "24:00" : formatLocalTime(seg.end)}`;
}

/** "2 h 35 min", "45 min", "3 h". */
export function formatDuration(start: Date, end: Date): string {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ---------------------------------------------------------------------------
// Categories and colours
// ---------------------------------------------------------------------------

export const CATEGORY_OPTIONS: { value: CalendarPurpose; label: string }[] = [
  { value: "work", label: "Work" },
  { value: "school", label: "School" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

export const CATEGORY_LABELS: Record<CalendarPurpose, string> = {
  work: "Work",
  school: "School",
  personal: "Personal",
  other: "Other",
};

/** "r, g, b" strings, for use in rgba(...) like the front page's accent colours. */
const CATEGORY_RGB: Record<CalendarPurpose, string> = {
  work: "59, 130, 246",
  school: "168, 85, 247",
  personal: "34, 197, 94",
  other: "113, 113, 122",
};

// For calendars with no category yet. The first is the app's accent orange.
const UNCATEGORISED_PALETTE = [
  "249, 115, 22",
  "20, 184, 166",
  "236, 72, 153",
  "234, 179, 8",
  "132, 204, 22",
  "6, 182, 212",
  "99, 102, 241",
];

/**
 * One colour per calendar: its category's colour if it has one, otherwise the
 * next colour from a palette so uncategorised calendars stay distinguishable.
 */
export function calendarColors(calendars: OverviewCalendar[]): Map<string, string> {
  const colors = new Map<string, string>([[HOLIDAY_CALENDAR_ID, HOLIDAY_RGB]]);
  let uncategorised = 0;
  for (const c of calendars) {
    if (c.purpose) {
      colors.set(c.id, CATEGORY_RGB[c.purpose]);
    } else {
      colors.set(c.id, UNCATEGORISED_PALETTE[uncategorised % UNCATEGORISED_PALETTE.length]);
      uncategorised++;
    }
  }
  return colors;
}

// ---------------------------------------------------------------------------
// Calendar list grouping
// ---------------------------------------------------------------------------

/** The brands the calendar list is grouped by, in the order they are shown. */
const BRANDS: { provider: OverviewCalendar["provider"]; label: string }[] = [
  { provider: "google", label: "Google" },
  { provider: "outlook", label: "Outlook" },
  { provider: "apple", label: "Apple" },
  // Calendars added by link (a timetable, a shared feed): no brand of their own.
  { provider: "ics", label: "Special" },
  { provider: "builtin", label: "Built in" },
];

export interface CalendarGroup {
  /** The provider this group holds, which is also its stable key. */
  id: OverviewCalendar["provider"];
  label: string;
  calendars: OverviewCalendar[];
}

/**
 * Split calendars into one group per brand, in a fixed order. Brands with no
 * calendars are left out, and calendars keep the order they came in within
 * their group. A provider this list doesn't know about (a new integration)
 * gets a group of its own at the end instead of silently vanishing.
 */
export function groupCalendarsByBrand(calendars: OverviewCalendar[]): CalendarGroup[] {
  const known = new Set(BRANDS.map((b) => b.provider));
  const groups: CalendarGroup[] = BRANDS.map((b) => ({
    id: b.provider,
    label: b.label,
    calendars: calendars.filter((c) => c.provider === b.provider),
  }));
  for (const c of calendars) {
    if (known.has(c.provider)) continue;
    const label = String(c.provider);
    const existing = groups.find((g) => g.id === c.provider);
    if (existing) existing.calendars.push(c);
    else groups.push({ id: c.provider, label, calendars: [c] });
  }
  return groups.filter((g) => g.calendars.length > 0);
}

/**
 * What a group's checkbox should show: every calendar visible ("all"), none
 * of them ("none"), or a mix ("some", the indeterminate dash).
 */
export function groupVisibility(
  group: CalendarGroup,
  hidden: ReadonlySet<string>,
): "all" | "none" | "some" {
  const hiddenCount = group.calendars.filter((c) => hidden.has(c.id)).length;
  if (hiddenCount === 0) return "all";
  return hiddenCount === group.calendars.length ? "none" : "some";
}
