/**
 * Builds a month calendar grid tinted by availability — the killer visual.
 *
 * It lays out a single calendar month, Monday-first, with leading/trailing days
 * from the neighbouring months padding the grid to whole weeks. For every day in
 * the month we compute how many people are free for a meeting at the chosen
 * time, and the UI tints each day by that count so the best days jump out. Days
 * in the past keep their tint but get dimmed in the UI.
 *
 * Like the engine, this is a pure function over the data model and works in UTC.
 */

import {
  blockOverlaps,
  spanAvailability,
  type WeeklySpanShape,
} from "@/lib/availability";
import type { Participant } from "@/types";

export interface DayCell {
  /** ISO 8601 UTC midnight for this day. */
  date: string;
  /** Day number 1–31, for the cell label. */
  dayOfMonth: number;
  /** True if this day belongs to the displayed month (vs neighbouring spillover). */
  inMonth: boolean;
  /** True if this day is strictly before today (shown, but dimmed). */
  isPast: boolean;
  /** Participants genuinely free for the event on/starting this day. */
  freeCount: number;
  /**
   * Participants who are only free if they take time off work/school
   * (multi-day modes only; always 0 for single meetings, where the chosen
   * time either works or it doesn't).
   */
  conditionalCount: number;
  /** True if this day is not part of the search (unselected weekday, or a
   * day outside the weekly trip window) and should render neutral. */
  excluded: boolean;
  /** Total participant count, i.e. the max freeCount can be. */
  total: number;
}

export interface MonthGrid {
  /** e.g. "juni 2026". */
  label: string;
  /** Column headers, Monday-first. */
  weekdayLabels: string[];
  /** Calendar rows, each with 7 day cells (including spillover padding). */
  weeks: DayCell[][];
  /** Total participant count. */
  total: number;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// Danish weekday abbreviations indexed by Date.getUTCDay() (0 = Sun … 6 = Sat).
const DOW_LABELS = ["søn.", "man.", "tirs.", "ons.", "tors.", "fre.", "lør."];
// Monday-first column order: man, tirs, ons, tors, fre, lør, søn.
const MON_FIRST_LABELS = [1, 2, 3, 4, 5, 6, 0].map((i) => DOW_LABELS[i]);

/** True if the participant has no busy block overlapping [start, end). */
function isFree(participant: Participant, start: number, end: number): boolean {
  return !participant.busy.some((b) => blockOverlaps(b, start, end));
}

/**
 * How many participants are free for a meeting of `durationMs` starting at
 * `startHour` on the given day — i.e. availability at the *chosen* meeting time,
 * not "the best slot anywhere in the evening". Anchoring to the configured start
 * gives a real gradient at any group size (a wide window plus a short meeting
 * almost always finds some common gap, which washes small groups out to all-free).
 * The meeting may spill past midnight (a night out ending 02:00), matching the
 * engine's uncapped `latestHour`.
 */
function freeForMeetingOnDay(
  participants: Participant[],
  dayMidnight: number,
  startHour: number,
  durationMs: number,
): number {
  const start = dayMidnight + startHour * MS_PER_HOUR;
  const end = start + durationMs;
  let count = 0;
  for (const p of participants) {
    if (isFree(p, start, end)) count++;
  }
  return count;
}

/** How availability is computed for each day cell. */
export interface MonthGridOptions {
  /** Meeting start hour for single-day events, 0–23. */
  startHour: number;
  /** Meeting length in minutes (may cross midnight). */
  durationMinutes: number;
  /** Any instant "now", used to flag past days. */
  todayMs: number;
  /**
   * Which UTC days of week are searched for single-day events (0 = Sun … 6 =
   * Sat). Days outside the set render as excluded. Omitted = all seven.
   */
  allowedDays?: number[];
  /**
   * Vacation mode: tint each day by who could join a vacation on *that day*
   * (amber-split for people whose only obstacle that day is work/school).
   * Per-day, so the same person reads as busy on the same days in every
   * mode — span reasoning lives in the engine, not the map.
   */
  multiDay?: { windowEndMs: number };
  /**
   * Weekend-trip mode: days belonging to the weekly window (e.g. Fri–Sun)
   * are tinted by who is available for that day's part of the trip (Friday
   * from `startHour`, the last day until `endHour`, whole days between);
   * other days are excluded. Takes precedence over `multiDay`.
   */
  weeklySpan?: WeeklySpanShape & { windowEndMs: number };
}

/**
 * Build a Monday-first calendar grid for a single month. The month's days are
 * padded with spillover days from the neighbouring months to fill whole weeks
 * (usually 5 rows, occasionally 6). Availability is computed for the month's own
 * days only; spillover cells are left blank for the UI to mute.
 *
 * @param year  full year, e.g. 2026
 * @param month 0-based month index (0 = January)
 */
export function buildMonthGrid(
  participants: Participant[],
  year: number,
  month: number,
  opts: MonthGridOptions,
): MonthGrid {
  const { startHour, durationMinutes, todayMs, allowedDays, multiDay, weeklySpan } =
    opts;
  const durationMs = durationMinutes * 60_000;
  const firstOfMonth = Date.UTC(year, month, 1);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayMidnight = Math.floor(todayMs / MS_PER_DAY) * MS_PER_DAY;

  // Monday-first leading offset: how many days of the previous month to show.
  const firstDow = new Date(firstOfMonth).getUTCDay(); // 0 = Sun … 6 = Sat
  const leading = (firstDow + 6) % 7;
  const gridStart = firstOfMonth - leading * MS_PER_DAY;
  const numWeeks = Math.ceil((leading + daysInMonth) / 7);

  const weeks: DayCell[][] = [];
  for (let week = 0; week < numWeeks; week++) {
    const row: DayCell[] = [];
    for (let col = 0; col < 7; col++) {
      const dayMidnight = gridStart + (week * 7 + col) * MS_PER_DAY;
      const d = new Date(dayMidnight);
      const dow = d.getUTCDay();
      const inMonth = d.getUTCMonth() === month && d.getUTCFullYear() === year;

      let freeCount = 0;
      let conditionalCount = 0;
      let excluded = false;

      if (inMonth) {
        if (weeklySpan) {
          // Trip mode: a day is either part of the weekly trip window (and
          // shows availability for that day's slice of the trip) or not
          // searched at all.
          const offset = (dow - weeklySpan.anchorDow + 7) % 7;
          if (offset >= weeklySpan.spanDays) {
            excluded = true;
          } else {
            const sliceStart =
              dayMidnight +
              (offset === 0 ? weeklySpan.startHour * MS_PER_HOUR : 0);
            const sliceEnd =
              dayMidnight +
              (offset === weeklySpan.spanDays - 1
                ? weeklySpan.endHour * MS_PER_HOUR
                : MS_PER_DAY);
            if (sliceEnd <= weeklySpan.windowEndMs) {
              const a = spanAvailability(participants, sliceStart, sliceEnd);
              freeCount = a.free;
              conditionalCount = a.conditional;
            }
          }
        } else if (multiDay) {
          // Vacation mode: per-day availability, same data story as the
          // other modes.
          if (dayMidnight + MS_PER_DAY <= multiDay.windowEndMs) {
            const a = spanAvailability(
              participants,
              dayMidnight,
              dayMidnight + MS_PER_DAY,
            );
            freeCount = a.free;
            conditionalCount = a.conditional;
          }
        } else if (allowedDays && !allowedDays.includes(dow)) {
          excluded = true;
        } else {
          freeCount = freeForMeetingOnDay(
            participants,
            dayMidnight,
            startHour,
            durationMs,
          );
        }
      }

      row.push({
        date: d.toISOString(),
        dayOfMonth: d.getUTCDate(),
        inMonth,
        isPast: dayMidnight < todayMidnight,
        freeCount,
        conditionalCount,
        excluded,
        total: participants.length,
      });
    }
    weeks.push(row);
  }

  const monthName = new Date(firstOfMonth).toLocaleString("da-DK", {
    month: "long",
    timeZone: "UTC",
  });

  return {
    label: `${monthName} ${year}`,
    weekdayLabels: MON_FIRST_LABELS,
    weeks,
    total: participants.length,
  };
}
