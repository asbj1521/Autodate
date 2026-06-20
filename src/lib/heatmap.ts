/**
 * Builds a rolling calendar grid tinted by availability — the killer visual.
 *
 * The grid starts on the present date and runs a fixed number of days into the
 * future (crossing into the next month when needed). For every day in range we
 * compute the *most* people who could meet at once that day (the best
 * simultaneous overlap during the day-window). The UI tints each day by that
 * count, so the best days to meet jump out at a glance.
 *
 * Like the engine, this is a pure function over the data model and works in UTC.
 */

import type { Participant } from "@/types";

export interface DayCell {
  /** ISO 8601 UTC midnight for this day. */
  date: string;
  /** Day number 1–31, for the cell label. */
  dayOfMonth: number;
  /** True if this day is within the visible scheduling range (today..+N). */
  inRange: boolean;
  /** True for Saturday/Sunday — used for subtle calendar styling. */
  isWeekend: boolean;
  /** Most participants free at once during the day-window that day. */
  freeCount: number;
  /** Total participant count, i.e. the max freeCount can be. */
  total: number;
}

export interface MonthGrid {
  /** e.g. "juni – juli 2026". */
  label: string;
  /** Column headers, Monday-first. */
  weekdayLabels: string[];
  /** Calendar rows, each with 7 day cells (including out-of-range padding). */
  weeks: DayCell[][];
  /** Total participant count. */
  total: number;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// Danish weekday abbreviations indexed by Date.getUTCDay() (0 = Sun … 6 = Sat).
const DOW_LABELS = ["søn.", "man.", "tirs.", "ons.", "tors.", "fre.", "lør."];

/** True if the participant has no busy block overlapping [start, end). */
function isFree(participant: Participant, start: number, end: number): boolean {
  return !participant.busy.some((b) => {
    const bs = Date.parse(b.start);
    const be = Date.parse(b.end);
    return bs < end && be > start; // standard half-open overlap test
  });
}

/**
 * The most participants who are simultaneously free during any one-hour slot in
 * the working window on the given day.
 */
function bestOverlapForDay(
  participants: Participant[],
  dayMidnight: number,
  startHour: number,
  endHour: number,
): number {
  let best = 0;
  for (let h = startHour; h < endHour; h++) {
    const start = dayMidnight + h * MS_PER_HOUR;
    const end = start + MS_PER_HOUR;
    const count = participants.filter((p) => isFree(p, start, end)).length;
    if (count > best) best = count;
  }
  return best;
}

/**
 * Build a rolling calendar grid whose FIRST cell is the start day (today). It
 * runs `days` consecutive days forward laid out in rows of 7, so the columns
 * begin on the start day's weekday rather than Monday. It crosses month
 * boundaries automatically.
 *
 * @param startMs  any instant on the first day (we floor to UTC midnight)
 * @param days     total number of days to show (e.g. 35 for 5 rows of 7)
 * @param startHour first day-window hour (inclusive), 0–23
 * @param endHour   last day-window hour (exclusive), 1–24
 */
export function buildRangeGrid(
  participants: Participant[],
  startMs: number,
  days: number,
  startHour: number,
  endHour: number,
): MonthGrid {
  const rangeStart = Math.floor(startMs / MS_PER_DAY) * MS_PER_DAY;
  const numWeeks = Math.ceil(days / 7);

  // Columns start on the start day's weekday, so headers stay aligned.
  const startDow = new Date(rangeStart).getUTCDay();
  const weekdayLabels = Array.from(
    { length: 7 },
    (_, i) => DOW_LABELS[(startDow + i) % 7],
  );

  const weeks: DayCell[][] = [];
  for (let week = 0; week < numWeeks; week++) {
    const row: DayCell[] = [];
    for (let col = 0; col < 7; col++) {
      const index = week * 7 + col;
      const dayMidnight = rangeStart + index * MS_PER_DAY;
      const d = new Date(dayMidnight);
      const inRange = index < days;

      row.push({
        date: d.toISOString(),
        dayOfMonth: d.getUTCDate(),
        inRange,
        isWeekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
        freeCount: inRange
          ? bestOverlapForDay(participants, dayMidnight, startHour, endHour)
          : 0,
        total: participants.length,
      });
    }
    weeks.push(row);
  }

  // Label spans one or two months, e.g. "juni 2026" or "juni – juli 2026".
  const rangeEnd = rangeStart + (days - 1) * MS_PER_DAY;
  const monthName = (ms: number) =>
    new Date(ms).toLocaleString("da-DK", { month: "long", timeZone: "UTC" });
  const startMonth = monthName(rangeStart);
  const endMonth = monthName(rangeEnd);
  const year = new Date(rangeEnd).getUTCFullYear();
  const label =
    startMonth === endMonth
      ? `${startMonth} ${year}`
      : `${startMonth} – ${endMonth} ${year}`;

  return {
    label,
    weekdayLabels,
    weeks,
    total: participants.length,
  };
}
