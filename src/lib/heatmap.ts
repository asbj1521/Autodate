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
  /** True for Saturday/Sunday — used for subtle calendar styling. */
  isWeekend: boolean;
  /** Participants free for a meeting at the chosen start time that day. */
  freeCount: number;
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
  return !participant.busy.some((b) => {
    const bs = Date.parse(b.start);
    const be = Date.parse(b.end);
    return bs < end && be > start; // standard half-open overlap test
  });
}

/**
 * How many participants are free for a meeting of `durationMs` starting at
 * `startHour` on the given day — i.e. availability at the *chosen* meeting time,
 * not "the best slot anywhere in the evening". Anchoring to the configured start
 * gives a real gradient at any group size (a wide window plus a short meeting
 * almost always finds some common gap, which washes small groups out to all-free).
 *
 * If the meeting can't finish before the window closes (`endHour`), nobody can
 * attend that day — matching the engine, which rejects slots ending past
 * `latestHour`.
 */
function freeForMeetingOnDay(
  participants: Participant[],
  dayMidnight: number,
  startHour: number,
  endHour: number,
  durationMs: number,
): number {
  const start = dayMidnight + startHour * MS_PER_HOUR;
  const end = start + durationMs;
  if (end > dayMidnight + endHour * MS_PER_HOUR) return 0; // doesn't fit
  let count = 0;
  for (const p of participants) {
    if (isFree(p, start, end)) count++;
  }
  return count;
}

/**
 * Build a Monday-first calendar grid for a single month. The month's days are
 * padded with spillover days from the neighbouring months to fill whole weeks
 * (usually 5 rows, occasionally 6). Availability is computed for the month's own
 * days only; spillover cells are left blank for the UI to mute.
 *
 * @param year    full year, e.g. 2026
 * @param month   0-based month index (0 = January)
 * @param startHour first day-window hour (inclusive), 0–23
 * @param endHour   last day-window hour (exclusive), 1–24
 * @param durationMinutes meeting length used to size each candidate slot
 * @param todayMs  any instant "now", used to flag past days
 */
export function buildMonthGrid(
  participants: Participant[],
  year: number,
  month: number,
  startHour: number,
  endHour: number,
  durationMinutes: number,
  todayMs: number,
): MonthGrid {
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
      const inMonth = d.getUTCMonth() === month && d.getUTCFullYear() === year;

      row.push({
        date: d.toISOString(),
        dayOfMonth: d.getUTCDate(),
        inMonth,
        isPast: dayMidnight < todayMidnight,
        isWeekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
        freeCount: inMonth
          ? freeForMeetingOnDay(
              participants,
              dayMidnight,
              startHour,
              endHour,
              durationMs,
            )
          : 0,
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
