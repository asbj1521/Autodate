/**
 * The availability engine.
 *
 * Given every participant's busy time, a window to search in, and how long the
 * meeting needs to be, this finds the *earliest* slot where everyone is free.
 *
 * The whole thing is a pure function over plain numbers (epoch milliseconds).
 * No dates-as-objects, no I/O, no React. That makes it deterministic and easy
 * to unit-test, which matters because this is the one piece of logic the entire
 * product depends on being correct.
 *
 * The algorithm:
 *   1. Build the "allowed" windows from the daily-hour / weekend constraints.
 *   2. Merge everyone's busy intervals into one timeline.
 *   3. Subtract busy from allowed -> the windows where everyone is free AND the
 *      constraints are satisfied.
 *   4. The earliest free window long enough to fit the meeting wins; we also
 *      return one slot from each subsequent qualifying window as alternatives.
 */

import type {
  Event,
  Participant,
  SchedulingConstraints,
  SchedulingResult,
  TimeSlot,
} from "@/types";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** A half-open interval [start, end) in epoch milliseconds. */
interface Interval {
  start: number;
  end: number;
}

/** How many alternative slots (beyond the primary) we surface to the UI. */
const MAX_ALTERNATIVES = 3;

/**
 * Find the earliest meeting slot that works for everyone.
 *
 * This is the public entry point used by the rest of the app.
 */
export function findEarliestSlot(event: Event): SchedulingResult {
  const searchStart = Date.parse(event.searchStart);
  const searchEnd = Date.parse(event.searchEnd);
  const durationMs = event.durationMinutes * MS_PER_MINUTE;

  // Guard against nonsense input rather than returning a misleading slot.
  if (
    !Number.isFinite(searchStart) ||
    !Number.isFinite(searchEnd) ||
    searchEnd <= searchStart ||
    durationMs <= 0
  ) {
    return { slot: null, alternatives: [] };
  }

  const allowed = buildAllowedWindows(
    searchStart,
    searchEnd,
    event.constraints,
  );

  const busy = collectBusy(event.participants, searchStart, searchEnd);

  const free = subtractIntervals(allowed, busy);

  // Every free window long enough to hold the meeting yields one candidate
  // slot, anchored at the start of that window (earliest is always best).
  const candidates: TimeSlot[] = [];
  for (const window of free) {
    if (window.end - window.start >= durationMs) {
      candidates.push({
        start: new Date(window.start).toISOString(),
        end: new Date(window.start + durationMs).toISOString(),
      });
    }
    if (candidates.length > MAX_ALTERNATIVES) break;
  }

  if (candidates.length === 0) {
    return { slot: null, alternatives: [] };
  }

  return {
    slot: candidates[0],
    alternatives: candidates.slice(1, MAX_ALTERNATIVES + 1),
  };
}

/**
 * Build the set of intervals the meeting is *allowed* to land in, based on the
 * daily-hour window and weekend rules. With no constraints this is just the
 * whole search range as a single interval.
 */
function buildAllowedWindows(
  searchStart: number,
  searchEnd: number,
  constraints?: SchedulingConstraints,
): Interval[] {
  const earliestHour = constraints?.earliestHour ?? 0;
  const latestHour = constraints?.latestHour ?? 24;
  const excludeWeekends = constraints?.excludeWeekends ?? false;

  // Fast path: no real constraints, so the entire search range is allowed.
  if (earliestHour === 0 && latestHour === 24 && !excludeWeekends) {
    return [{ start: searchStart, end: searchEnd }];
  }

  const windows: Interval[] = [];

  // Walk day by day from the UTC midnight on/before searchStart. Each day
  // contributes at most one [earliestHour, latestHour] window, clamped to the
  // search range and skipped entirely on weekends when asked.
  let dayStart = utcMidnight(searchStart);
  while (dayStart < searchEnd) {
    const dayOfWeek = new Date(dayStart).getUTCDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!excludeWeekends || !isWeekend) {
      const windowStart = Math.max(
        searchStart,
        dayStart + earliestHour * MS_PER_HOUR,
      );
      const windowEnd = Math.min(
        searchEnd,
        dayStart + latestHour * MS_PER_HOUR,
      );
      if (windowEnd > windowStart) {
        windows.push({ start: windowStart, end: windowEnd });
      }
    }

    dayStart += MS_PER_DAY;
  }

  return windows;
}

/**
 * Gather every participant's busy intervals into one merged, clamped timeline.
 * Overlapping or touching blocks are fused so the subtraction step stays simple.
 */
function collectBusy(
  participants: Participant[],
  searchStart: number,
  searchEnd: number,
): Interval[] {
  const raw: Interval[] = [];

  for (const participant of participants) {
    for (const block of participant.busy) {
      const start = Date.parse(block.start);
      const end = Date.parse(block.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        continue; // skip malformed intervals rather than crash
      }
      // Clamp to the search range; drop anything fully outside it.
      const clampedStart = Math.max(start, searchStart);
      const clampedEnd = Math.min(end, searchEnd);
      if (clampedEnd > clampedStart) {
        raw.push({ start: clampedStart, end: clampedEnd });
      }
    }
  }

  return mergeIntervals(raw);
}

/**
 * Merge a list of intervals into the minimal set of non-overlapping intervals,
 * sorted by start. Adjacent intervals that merely touch (a.end === b.start) are
 * also fused, since there's no usable gap between them.
 */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      // Overlapping or touching -> extend the previous interval.
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Subtract a set of "hole" intervals from a set of base intervals, returning the
 * portions of `base` not covered by any hole. Both inputs are treated as
 * unordered; the result is sorted by start.
 *
 * This is the step that turns "allowed windows" + "busy time" into "free time".
 */
function subtractIntervals(base: Interval[], holes: Interval[]): Interval[] {
  const mergedBase = mergeIntervals(base);
  const mergedHoles = mergeIntervals(holes);
  const result: Interval[] = [];

  for (const segment of mergedBase) {
    let cursor = segment.start;

    for (const hole of mergedHoles) {
      if (hole.end <= cursor) continue; // hole is entirely before the cursor
      if (hole.start >= segment.end) break; // remaining holes are past segment

      if (hole.start > cursor) {
        // There's free space between the cursor and this hole.
        result.push({ start: cursor, end: Math.min(hole.start, segment.end) });
      }
      // Advance the cursor past the hole.
      cursor = Math.max(cursor, hole.end);
      if (cursor >= segment.end) break;
    }

    if (cursor < segment.end) {
      result.push({ start: cursor, end: segment.end });
    }
  }

  return result;
}

/** The UTC midnight on or before the given instant. */
function utcMidnight(ms: number): number {
  return Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;
}
