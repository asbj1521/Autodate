/**
 * The availability engine.
 *
 * Everything the product knows about "when can this group meet" lives here,
 * as pure functions over plain numbers (epoch milliseconds). No I/O, no
 * React — deterministic and easy to unit-test, which matters because this is
 * the one piece of logic the entire product depends on being correct.
 *
 * Four searches share one vocabulary:
 *   - findEarliestSlot     a single meeting at a precise time of day
 *   - findEarliestDaySpan  N whole days, the first place they fit
 *   - findBestDaySpan      N whole days, the best-scoring place (vacations)
 *   - findWeeklySpan       a weekday-anchored window (weekend trips)
 * plus findVacationSuggestions, which proposes workarounds when the requested
 * vacation length doesn't work cleanly.
 *
 * Multi-day searches classify busy blocks with two rules:
 *   - HARD blocks (isHardBlock): all-day absences — being on another trip —
 *     rule the day out entirely. Short plans (a dinner, a training night) are
 *     things you'd skip for a trip and don't block at all.
 *   - SOFT blocks (isSoftBlock): work and school don't block, but come back
 *     as conflicts the affected person must approve ("take Friday off?").
 * On top sits the departure-day rule: a soft block on the span's first day
 * ending by 17:00 is no obstacle — you leave in the evening, exactly like a
 * weekend trip starting Friday after work.
 */

import type {
  BusyInterval,
  Event,
  Participant,
  SchedulingConstraints,
  SchedulingResult,
  TimeSlot,
} from "@/types";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** How many alternative slots (beyond the primary) we surface to the UI. */
const MAX_ALTERNATIVES = 3;

/**
 * Busy categories that only *soft*-block a multi-day event: they surface as
 * conflicts for the person to approve instead of ruling the day out.
 */
const SOFT_CATEGORIES = new Set<string>(["work", "school"]);

/**
 * How long a non-work/school event must be to hard-block a day of a
 * multi-day event. Only being away for effectively the whole day counts; if
 * every dinner blocked a whole day, a shared free week would never exist for
 * any real group of busy people.
 */
const MIN_HARD_BLOCK_MS = 20 * MS_PER_HOUR;

/** The departure-day rule's cutoff: work ending by 17:00 = leave after work. */
const DEPARTURE_HOUR = 17;
const DEPARTURE_MS = DEPARTURE_HOUR * MS_PER_HOUR;

/* ----------------------------------------------------------------------------
 * Shared primitives
 * ------------------------------------------------------------------------- */

/** A half-open interval [start, end) in epoch milliseconds. */
interface Interval {
  start: number;
  end: number;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** The UTC midnight on or before / on or after the given instant. */
const utcMidnight = (ms: number): number => Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;
const utcMidnightCeil = (ms: number): number => Math.ceil(ms / MS_PER_DAY) * MS_PER_DAY;

/** Parse a search range; null if either end is malformed or the range is empty. */
function parseRange(startIso: string, endIso: string): Interval | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end }
    : null;
}

/** Parse one busy block; null if malformed or empty (never crash on bad data). */
function parseBlock(block: BusyInterval): Interval | null {
  const start = Date.parse(block.start);
  const end = Date.parse(block.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end }
    : null;
}

/** True if the block overlaps [start, end) — the standard half-open test. */
function blockOverlaps(block: BusyInterval, start: number, end: number): boolean {
  const iv = parseBlock(block);
  return iv !== null && iv.start < end && iv.end > start;
}

/** A fresh empty result (never share a mutable instance between callers). */
const noSpan = (): MultiDayResult => ({ slot: null, conflicts: [] });

/* ----------------------------------------------------------------------------
 * Interval algebra
 * ------------------------------------------------------------------------- */

/**
 * Merge intervals into the minimal sorted set of non-overlapping intervals.
 * Touching intervals (a.end === b.start) fuse too — there's no usable gap.
 */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) last.end = Math.max(last.end, current.end);
    else merged.push({ ...current });
  }
  return merged;
}

/**
 * Subtract "hole" intervals from base intervals: the portions of `base` not
 * covered by any hole, sorted by start. This is the step that turns "allowed
 * windows" + "busy time" into "free time".
 */
function subtractIntervals(base: Interval[], holes: Interval[]): Interval[] {
  const mergedHoles = mergeIntervals(holes);
  const result: Interval[] = [];

  for (const segment of mergeIntervals(base)) {
    let cursor = segment.start;
    for (const hole of mergedHoles) {
      if (hole.end <= cursor) continue; // hole entirely before the cursor
      if (hole.start >= segment.end) break; // remaining holes past segment
      if (hole.start > cursor) {
        result.push({ start: cursor, end: Math.min(hole.start, segment.end) });
      }
      cursor = Math.max(cursor, hole.end);
      if (cursor >= segment.end) break;
    }
    if (cursor < segment.end) result.push({ start: cursor, end: segment.end });
  }
  return result;
}

/* ----------------------------------------------------------------------------
 * Block classification (multi-day rules)
 * ------------------------------------------------------------------------- */

/** True if this block is one you could take time off from (work / school). */
export function isSoftBlock(block: BusyInterval): boolean {
  return block.category !== undefined && SOFT_CATEGORIES.has(block.category);
}

/** True if this block rules a day out for a multi-day event entirely. */
export function isHardBlock(block: BusyInterval): boolean {
  if (isSoftBlock(block)) return false;
  const iv = parseBlock(block);
  return iv !== null && iv.end - iv.start >= MIN_HARD_BLOCK_MS;
}

/**
 * Availability over a span, split honestly: `free` counts people with nothing
 * in the way at all; `conditional` counts people whose only obstacle is
 * work/school — they could come, but they'd have to take time off, and the UI
 * must say so rather than paint them free. Shared with the heatmap so the
 * calendar and the search always tell the same story.
 */
export function spanAvailability(
  participants: Participant[],
  spanStart: number,
  spanEnd: number,
): { free: number; conditional: number } {
  let free = 0;
  let conditional = 0;
  for (const p of participants) {
    if (p.busy.some((b) => isHardBlock(b) && blockOverlaps(b, spanStart, spanEnd))) {
      continue;
    }
    if (p.busy.some((b) => isSoftBlock(b) && blockOverlaps(b, spanStart, spanEnd))) {
      conditional++;
    } else {
      free++;
    }
  }
  return { free, conditional };
}

/* ----------------------------------------------------------------------------
 * Single meetings
 * ------------------------------------------------------------------------- */

/**
 * Find the earliest meeting slot that works for everyone: build the allowed
 * windows from the constraints, subtract everyone's merged busy time, and
 * take the first gap the meeting fits into (plus a few alternatives).
 */
export function findEarliestSlot(event: Event): SchedulingResult {
  const range = parseRange(event.searchStart, event.searchEnd);
  const durationMs = event.durationMinutes * MS_PER_MINUTE;
  if (!range || durationMs <= 0) return { slot: null, alternatives: [] };

  const free = subtractIntervals(
    buildAllowedWindows(range, event.constraints),
    collectBusy(event.participants, range),
  );

  // Each big-enough free window yields one candidate, anchored at its start
  // (earliest is always best within a window).
  const candidates: TimeSlot[] = [];
  for (const w of free) {
    if (w.end - w.start >= durationMs) {
      candidates.push({ start: iso(w.start), end: iso(w.start + durationMs) });
      if (candidates.length > MAX_ALTERNATIVES) break;
    }
  }
  return {
    slot: candidates[0] ?? null,
    alternatives: candidates.slice(1, MAX_ALTERNATIVES + 1),
  };
}

/**
 * The intervals a meeting is *allowed* to land in, from the daily-hour /
 * weekend / weekday constraints. `latestHour` may exceed 24 so a night event
 * can spill past midnight; a window belongs to the day it *starts* on.
 */
function buildAllowedWindows(
  range: Interval,
  constraints?: SchedulingConstraints,
): Interval[] {
  const earliestHour = constraints?.earliestHour ?? 0;
  const latestHour = constraints?.latestHour ?? 24;
  const excludeWeekends = constraints?.excludeWeekends ?? false;
  const allowedDays =
    constraints?.allowedDays && constraints.allowedDays.length < 7
      ? new Set(constraints.allowedDays)
      : null;

  // Fast path: no real constraints, the entire search range is allowed.
  if (earliestHour === 0 && latestHour === 24 && !excludeWeekends && !allowedDays) {
    return [range];
  }

  // Walk day by day; each allowed day contributes one clamped window.
  const windows: Interval[] = [];
  for (let day = utcMidnight(range.start); day < range.end; day += MS_PER_DAY) {
    const dow = new Date(day).getUTCDay(); // 0 = Sun … 6 = Sat
    if (excludeWeekends && (dow === 0 || dow === 6)) continue;
    if (allowedDays && !allowedDays.has(dow)) continue;

    const start = Math.max(range.start, day + earliestHour * MS_PER_HOUR);
    const end = Math.min(range.end, day + latestHour * MS_PER_HOUR);
    if (end > start) windows.push({ start, end });
  }
  return windows;
}

/** Everyone's busy blocks, clamped to the range and merged into one timeline. */
function collectBusy(participants: Participant[], range: Interval): Interval[] {
  const raw: Interval[] = [];
  for (const p of participants) {
    for (const block of p.busy) {
      const iv = parseBlock(block);
      if (!iv) continue;
      const start = Math.max(iv.start, range.start);
      const end = Math.min(iv.end, range.end);
      if (end > start) raw.push({ start, end });
    }
  }
  return mergeIntervals(raw);
}

/* ----------------------------------------------------------------------------
 * Multi-day spans (vacations)
 * ------------------------------------------------------------------------- */

/** One participant's work/school overlaps with a proposed multi-day span. */
export interface SpanConflict {
  profileId: string;
  name: string;
  /** The overlapping work/school blocks, in time order. */
  events: BusyInterval[];
}

/** The result of a multi-day search: a span plus any conflicts to review. */
export interface MultiDayResult {
  /** The chosen day-aligned span, or null if none was found. */
  slot: TimeSlot | null;
  /**
   * Work/school commitments overlapping the span, per affected participant.
   * Empty means the span works outright for everyone.
   */
  conflicts: SpanConflict[];
}

/**
 * Each participant's work/school blocks overlapping [startMs, endMs) — the
 * "you'd have to take time off" items the UI asks people to review. Blocks
 * ending on/before `departureCutoffMs` are skipped: they're over before the
 * evening departure and conflict with nothing.
 */
function collectSoftConflicts(
  participants: Participant[],
  startMs: number,
  endMs: number,
  departureCutoffMs = -Infinity,
): SpanConflict[] {
  const conflicts: SpanConflict[] = [];
  for (const p of participants) {
    const overlapping = p.busy
      .filter((b) => {
        if (!isSoftBlock(b)) return false;
        const iv = parseBlock(b);
        return iv !== null && iv.start < endMs && iv.end > startMs && iv.end > departureCutoffMs;
      })
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    if (overlapping.length > 0) {
      conflicts.push({ profileId: p.profileId, name: p.name, events: overlapping });
    }
  }
  return conflicts;
}

/**
 * The day-level view of everyone's calendar across a range: prefix sums over
 * per-day flags, so any candidate span scores in O(participants).
 */
interface DayGrid {
  /** hardPrefix[i] = hard-blocked days (by anyone) before day i. */
  hardPrefix: Int32Array;
  /** Per participant: soft-day prefix sums plus the raw per-day flags. */
  soft: { prefix: Int32Array; onDay: Uint8Array; lateOnDay: Uint8Array }[];
}

function buildDayGrid(
  participants: Participant[],
  firstDay: number,
  numDays: number,
): DayGrid {
  const lastDay = firstDay + numDays * MS_PER_DAY;
  const hard = new Uint8Array(numDays);
  const soft = participants.map(() => ({
    onDay: new Uint8Array(numDays),
    lateOnDay: new Uint8Array(numDays),
  }));

  participants.forEach((p, pi) => {
    for (const block of p.busy) {
      const iv = parseBlock(block);
      if (!iv || iv.end <= firstDay || iv.start >= lastDay) continue;
      const from = Math.max(0, Math.floor((iv.start - firstDay) / MS_PER_DAY));
      const to = Math.min(numDays, Math.ceil((iv.end - firstDay) / MS_PER_DAY));

      if (isHardBlock(block)) {
        for (let i = from; i < to; i++) hard[i] = 1;
      } else if (isSoftBlock(block)) {
        for (let i = from; i < to; i++) {
          soft[pi].onDay[i] = 1;
          // Runs past 17:00 on this day -> the departure-day rule can't save it.
          if (iv.end > firstDay + i * MS_PER_DAY + DEPARTURE_MS) {
            soft[pi].lateOnDay[i] = 1;
          }
        }
      }
    }
  });

  const prefix = (arr: Uint8Array): Int32Array => {
    const out = new Int32Array(numDays + 1);
    for (let i = 0; i < numDays; i++) out[i + 1] = out[i] + arr[i];
    return out;
  };
  return {
    hardPrefix: prefix(hard),
    soft: soft.map((s) => ({ ...s, prefix: prefix(s.onDay) })),
  };
}

/**
 * The one day-span search both public variants share. Candidates are all
 * day-aligned runs of `days` days that nobody hard-blocks; the policy decides
 * which one wins:
 *
 *   "earliest"  the first candidate, conflicts reported as-is.
 *   "best"      the candidate needing the least time off — fewest conflicted
 *               people, then fewest conflicted person-days, then earliest —
 *               with the departure-day rule applied to both the scoring and
 *               the reported conflicts.
 */
function searchDaySpans(
  participants: Participant[],
  days: number,
  searchStart: string,
  searchEnd: string,
  policy: "earliest" | "best",
): MultiDayResult {
  const range = parseRange(searchStart, searchEnd);
  if (!range || !Number.isInteger(days) || days <= 0) return noSpan();

  // Day-align: first candidate starts at the midnight on/after the range
  // start; every span must end by the midnight on/before the range end.
  const firstDay = utcMidnightCeil(range.start);
  const numDays = Math.round((utcMidnight(range.end) - firstDay) / MS_PER_DAY);
  if (numDays < days) return noSpan();

  const grid = buildDayGrid(participants, firstDay, numDays);
  const scored = policy === "best";

  let bestStart = -1;
  let bestPeople = Infinity;
  let bestPersonDays = Infinity;

  for (let i = 0; i + days <= numDays; i++) {
    if (grid.hardPrefix[i + days] - grid.hardPrefix[i] > 0) continue; // someone is away

    if (!scored) {
      bestStart = i;
      break; // earliest hard-free span wins outright
    }

    let people = 0;
    let personDays = 0;
    for (const s of grid.soft) {
      let conflicted = s.prefix[i + days] - s.prefix[i];
      // Departure-day rule: work on day i ending by 17:00 is no obstacle.
      if (conflicted > 0 && s.onDay[i] === 1 && s.lateOnDay[i] === 0) conflicted--;
      if (conflicted > 0) {
        people++;
        personDays += conflicted;
      }
    }

    if (people < bestPeople || (people === bestPeople && personDays < bestPersonDays)) {
      bestStart = i;
      bestPeople = people;
      bestPersonDays = personDays;
      if (people === 0) break; // clean and earliest; nothing can beat it
    }
  }

  if (bestStart < 0) return noSpan();

  const slotStart = firstDay + bestStart * MS_PER_DAY;
  const slotEnd = slotStart + days * MS_PER_DAY;
  return {
    slot: { start: iso(slotStart), end: iso(slotEnd) },
    conflicts: collectSoftConflicts(
      participants,
      slotStart,
      slotEnd,
      // Don't report the departure-day workday the scoring already forgave.
      scored ? slotStart + DEPARTURE_MS : undefined,
    ),
  };
}

/**
 * Find the earliest run of `days` consecutive days no participant
 * hard-blocks. Work/school inside the span is reported, not avoided.
 */
export function findEarliestDaySpan(
  participants: Participant[],
  days: number,
  searchStart: string,
  searchEnd: string,
): MultiDayResult {
  return searchDaySpans(participants, days, searchStart, searchEnd, "earliest");
}

/**
 * Find the *best* run of `days` consecutive days — what a human organising a
 * vacation means: the span where the most people have time for the most
 * days. With a realistic holiday calendar in the data, short vacations land
 * on the next free weekend and long ones in school breaks and summer leave,
 * instead of "tomorrow, if all seven of you quit your jobs".
 */
export function findBestDaySpan(
  participants: Participant[],
  days: number,
  searchStart: string,
  searchEnd: string,
): MultiDayResult {
  return searchDaySpans(participants, days, searchStart, searchEnd, "best");
}

/* ----------------------------------------------------------------------------
 * Weekly spans (weekend trips)
 * ------------------------------------------------------------------------- */

/**
 * The shape of a recurring weekly span, e.g. a weekend trip: it always starts
 * on the same day of the week at the same hour, and ends `spanDays - 1` days
 * later at `endHour`. Friday afternoon to Sunday evening = { anchorDow: 5,
 * spanDays: 3, startHour: 17, endHour: 21 }.
 */
export interface WeeklySpanShape {
  /** UTC day-of-week the span starts on (0 = Sunday … 6 = Saturday). */
  anchorDow: number;
  /** How many calendar days the span touches (Fri to Sun = 3). */
  spanDays: number;
  /** Hour of day the span starts on its first day. */
  startHour: number;
  /** Hour of day the span ends on its last day. */
  endHour: number;
}

/**
 * Find the earliest occurrence of a weekly span (e.g. "a weekend") that no
 * one hard-blocks. Candidates exist once per week, anchored to `anchorDow`.
 * Work/school come back as conflicts to review — though with a Friday 17:00
 * start, a normal workday has already ended and only genuine overlaps
 * (overtime, weekend shifts) surface.
 */
export function findWeeklySpan(
  participants: Participant[],
  shape: WeeklySpanShape,
  searchStart: string,
  searchEnd: string,
): MultiDayResult {
  const range = parseRange(searchStart, searchEnd);
  if (!range || !Number.isInteger(shape.spanDays) || shape.spanDays <= 0) {
    return noSpan();
  }

  // The first candidate anchor day on/after the search start.
  let anchor = utcMidnightCeil(range.start);
  while (new Date(anchor).getUTCDay() !== shape.anchorDow) anchor += MS_PER_DAY;

  for (; ; anchor += 7 * MS_PER_DAY) {
    const spanStart = anchor + shape.startHour * MS_PER_HOUR;
    const spanEnd =
      anchor + (shape.spanDays - 1) * MS_PER_DAY + shape.endHour * MS_PER_HOUR;
    if (spanEnd > range.end) break; // ran out of data

    const blocked = participants.some((p) =>
      p.busy.some((b) => isHardBlock(b) && blockOverlaps(b, spanStart, spanEnd)),
    );
    if (blocked) continue;

    return {
      slot: { start: iso(spanStart), end: iso(spanEnd) },
      conflicts: collectSoftConflicts(participants, spanStart, spanEnd),
    };
  }
  return noSpan();
}

/* ----------------------------------------------------------------------------
 * Vacation suggestions (workarounds)
 * ------------------------------------------------------------------------- */

/**
 * A concrete workaround the suggestion engine found: the requested length
 * doesn't work cleanly, but this nearby variant does (or comes closest).
 */
export interface VacationSuggestion {
  /** How the request was relaxed. Currently always a shorter stay. */
  kind: "shorter";
  /** The suggested length in days. */
  days: number;
  slot: TimeSlot;
  /** Remaining work/school conflicts; empty = works for everyone outright. */
  conflicts: SpanConflict[];
  /** True if people work the departure day and would leave after work. */
  leaveAfterWork: boolean;
  /** True if work/school starts the day after the span ends — i.e. the
   * dates get everyone home in time for it. */
  homeBeforeWork: boolean;
}

/**
 * When the requested vacation length has conflicts (or fits nowhere), search
 * for workarounds: the longest slightly-shorter stay that works for everyone
 * with no time off, or failing that, the least-bad shorter option. A plain
 * constraint search over the calendars — deterministic, instant, and always
 * producing real dates.
 */
export function findVacationSuggestions(
  participants: Participant[],
  days: number,
  searchStart: string,
  searchEnd: string,
): VacationSuggestion[] {
  const build = (d: number, res: MultiDayResult): VacationSuggestion | null =>
    res.slot === null
      ? null
      : {
          kind: "shorter",
          days: d,
          slot: res.slot,
          conflicts: res.conflicts,
          ...spanTiming(participants, Date.parse(res.slot.start), Date.parse(res.slot.end)),
        };

  // Try trimming one, then two days: the longest clean shorter stay wins.
  for (let d = days - 1; d >= Math.max(2, days - 2); d--) {
    const res = findBestDaySpan(participants, d, searchStart, searchEnd);
    if (res.slot && res.conflicts.length === 0) {
      const s = build(d, res);
      return s ? [s] : [];
    }
  }

  // Nothing clean even when shorter: offer the least-bad one-day-shorter
  // option so the user still gets a concrete counter-proposal.
  if (days > 2) {
    const s = build(days - 1, findBestDaySpan(participants, days - 1, searchStart, searchEnd));
    if (s) return [s];
  }
  return [];
}

/** The human details of a span: leave after work? home before work resumes? */
function spanTiming(
  participants: Participant[],
  startMs: number,
  endMs: number,
): { leaveAfterWork: boolean; homeBeforeWork: boolean } {
  let leaveAfterWork = false;
  let homeBeforeWork = false;
  for (const p of participants) {
    for (const b of p.busy) {
      if (!isSoftBlock(b)) continue;
      const iv = parseBlock(b);
      if (!iv) continue;
      // A commitment on the departure day that ends before the evening.
      if (iv.end > startMs && iv.end <= startMs + DEPARTURE_MS) leaveAfterWork = true;
      // A commitment starting the day right after the span ends.
      if (iv.start >= endMs && iv.start < endMs + MS_PER_DAY) homeBeforeWork = true;
    }
  }
  return { leaveAfterWork, homeBeforeWork };
}
