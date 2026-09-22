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
 *   - findWeeklySpan       a weekday-anchored window, best-scoring occurrence
 *                          (weekend trips)
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
 *
 * Time zones: blocks and results are instants, but hours, weekdays and whole
 * days are local to the zone each search is given ("18:00" means 18:00 in
 * Copenhagen). Days are stepped with src/lib/zone.ts rather than by adding
 * 24 hours, so the two days a year that are 23 or 25 hours long come out
 * right.
 */

import type {
  BusyInterval,
  Event,
  Participant,
  SchedulingConstraints,
  SchedulingResult,
  TimeSlot,
} from "@/types";
import { addDays, atHour, dayOfWeek, startOfDay } from "@/lib/zone";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

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

/* ----------------------------------------------------------------------------
 * Shared primitives
 * ------------------------------------------------------------------------- */

/** A half-open interval [start, end) in epoch milliseconds. */
interface Interval {
  start: number;
  end: number;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** Local midnight on or after the given instant. */
function startOfDayCeil(ms: number, timeZone: string): number {
  const day = startOfDay(ms, timeZone);
  return day < ms ? addDays(day, 1, timeZone) : day;
}

/** Parse a search range; null if either end is malformed or the range is empty. */
function parseRange(startIso: string, endIso: string): Interval | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end }
    : null;
}

/**
 * Parsed bounds per block, remembered for the life of the block object.
 *
 * A block's ISO strings never change, but the same blocks are re-tested
 * thousands of times — the heatmap alone asks about every participant's whole
 * calendar once per day cell. `Date.parse` is ~33x slower than comparing two
 * numbers, so parsing once per block instead of once per test is the
 * difference between a calendar that redraws instantly and one that stutters.
 * A WeakMap keeps this invisible to callers and lets blocks be collected
 * normally when the data they came from goes away.
 */
const parsedBlocks = new WeakMap<BusyInterval, Interval | null>();

/** Parse one busy block; null if malformed or empty (never crash on bad data). */
function parseBlock(block: BusyInterval): Interval | null {
  const cached = parsedBlocks.get(block);
  if (cached !== undefined) return cached;

  const start = Date.parse(block.start);
  const end = Date.parse(block.end);
  const parsed =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? { start, end }
      : null;
  parsedBlocks.set(block, parsed);
  return parsed;
}

/**
 * True if the block overlaps [start, end) — the standard half-open test, and
 * the one definition of "busy then" the whole app shares.
 */
export function blockOverlaps(
  block: BusyInterval,
  start: number,
  end: number,
): boolean {
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
    // One pass per person: the overlap test is the cheap filter, so it runs
    // first and classification only happens for blocks that actually clash.
    let hard = false;
    let soft = false;
    for (const b of p.busy) {
      if (!blockOverlaps(b, spanStart, spanEnd)) continue;
      if (isSoftBlock(b)) soft = true;
      else if (isHardBlock(b)) {
        hard = true;
        break; // away all day; nothing else about this person matters
      }
    }
    if (hard) continue;
    if (soft) conditional++;
    else free++;
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
    buildAllowedWindows(range, event.timeZone, event.constraints),
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
 * weekend / weekday constraints, read as local time in `timeZone`.
 * `latestHour` may exceed 24 so a night event can spill past midnight; a
 * window belongs to the day it *starts* on.
 */
function buildAllowedWindows(
  range: Interval,
  timeZone: string,
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
  for (
    let day = startOfDay(range.start, timeZone);
    day < range.end;
    day = addDays(day, 1, timeZone)
  ) {
    const dow = dayOfWeek(day, timeZone); // 0 = Sun … 6 = Sat
    if (excludeWeekends && (dow === 0 || dow === 6)) continue;
    if (allowedDays && !allowedDays.has(dow)) continue;

    const start = Math.max(range.start, atHour(day, earliestHour, timeZone));
    const end = Math.min(range.end, atHour(day, latestHour, timeZone));
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

/** The last index i with bounds[i] <= ms (bounds ascending, ms >= bounds[0]). */
function dayIndexFloor(bounds: number[], ms: number): number {
  let lo = 0;
  let hi = bounds.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bounds[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * `bounds` are the local midnights of the searched days plus the one after the
 * last, so day i is [bounds[i], bounds[i + 1]) whatever its length.
 * `departures[i]` is 17:00 on day i.
 */
function buildDayGrid(
  participants: Participant[],
  bounds: number[],
  departures: number[],
): DayGrid {
  const numDays = bounds.length - 1;
  const first = bounds[0];
  const last = bounds[numDays];
  const hard = new Uint8Array(numDays);
  const soft = participants.map(() => ({
    onDay: new Uint8Array(numDays),
    lateOnDay: new Uint8Array(numDays),
  }));

  participants.forEach((p, pi) => {
    for (const block of p.busy) {
      const iv = parseBlock(block);
      if (!iv || iv.end <= first || iv.start >= last) continue;
      // Days touched: from the day containing the start through the day
      // containing the last moment before the (exclusive) end.
      const from = iv.start <= first ? 0 : dayIndexFloor(bounds, iv.start);
      const to = iv.end >= last ? numDays : dayIndexFloor(bounds, iv.end - 1) + 1;

      if (isHardBlock(block)) {
        for (let i = from; i < to; i++) hard[i] = 1;
      } else if (isSoftBlock(block)) {
        for (let i = from; i < to; i++) {
          soft[pi].onDay[i] = 1;
          // Runs past 17:00 on this day -> the departure-day rule can't save it.
          if (iv.end > departures[i]) soft[pi].lateOnDay[i] = 1;
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
  timeZone: string,
  policy: "earliest" | "best",
): MultiDayResult {
  const range = parseRange(searchStart, searchEnd);
  if (!range || !Number.isInteger(days) || days <= 0) return noSpan();

  // Day-align: the first candidate starts at the local midnight on/after the
  // range start; every span must end by the midnight on/before the range end.
  const lastMidnight = startOfDay(range.end, timeZone);
  const bounds: number[] = [];
  for (
    let day = startOfDayCeil(range.start, timeZone);
    day <= lastMidnight;
    day = addDays(day, 1, timeZone)
  ) {
    bounds.push(day);
  }
  const numDays = bounds.length - 1;
  if (numDays < days) return noSpan();

  const departures = bounds.map((day) => atHour(day, DEPARTURE_HOUR, timeZone));
  const grid = buildDayGrid(participants, bounds, departures);
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

  const slotStart = bounds[bestStart];
  const slotEnd = bounds[bestStart + days];
  return {
    slot: { start: iso(slotStart), end: iso(slotEnd) },
    conflicts: collectSoftConflicts(
      participants,
      slotStart,
      slotEnd,
      // Don't report the departure-day workday the scoring already forgave.
      scored ? departures[bestStart] : undefined,
    ),
  };
}

/**
 * Find the earliest run of `days` consecutive local days no participant
 * hard-blocks. Work/school inside the span is reported, not avoided.
 */
export function findEarliestDaySpan(
  participants: Participant[],
  days: number,
  searchStart: string,
  searchEnd: string,
  timeZone: string,
): MultiDayResult {
  return searchDaySpans(participants, days, searchStart, searchEnd, timeZone, "earliest");
}

/**
 * Find the *best* run of `days` consecutive local days — what a human
 * organising a vacation means: the span where the most people have time for
 * the most days. With a realistic holiday calendar in the data, short
 * vacations land on the next free weekend and long ones in school breaks and
 * summer leave, instead of "tomorrow, if all seven of you quit your jobs".
 */
export function findBestDaySpan(
  participants: Participant[],
  days: number,
  searchStart: string,
  searchEnd: string,
  timeZone: string,
): MultiDayResult {
  return searchDaySpans(participants, days, searchStart, searchEnd, timeZone, "best");
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
  /** Local day-of-week the span starts on (0 = Sunday … 6 = Saturday). */
  anchorDow: number;
  /** How many calendar days the span touches (Fri to Sun = 3). */
  spanDays: number;
  /** Local hour of day the span starts on its first day. */
  startHour: number;
  /** Local hour of day the span ends on its last day. */
  endHour: number;
}

/**
 * Find the *best* occurrence of a weekly span (e.g. "a weekend"): scored the
 * same way findBestDaySpan scores a vacation. Candidates exist once per
 * week, anchored to `anchorDow`; a hard block (someone away the whole
 * weekend) rules a candidate out outright. Among the rest, the one needing
 * the least time off wins — fewest conflicted people, then fewest
 * conflicted events, then earliest — so a later weekend nobody has to take
 * time off for beats an earlier one two people would. With a Friday 17:00
 * start, a normal workday has already ended and only genuine overlaps
 * (overtime, weekend shifts) surface as conflicts at all.
 */
export function findWeeklySpan(
  participants: Participant[],
  shape: WeeklySpanShape,
  searchStart: string,
  searchEnd: string,
  timeZone: string,
): MultiDayResult {
  const range = parseRange(searchStart, searchEnd);
  if (!range || !Number.isInteger(shape.spanDays) || shape.spanDays <= 0) {
    return noSpan();
  }

  // The first candidate anchor day on/after the search start.
  let anchor = startOfDayCeil(range.start, timeZone);
  while (dayOfWeek(anchor, timeZone) !== shape.anchorDow) {
    anchor = addDays(anchor, 1, timeZone);
  }

  let best: MultiDayResult | null = null;
  let bestPeople = Infinity;
  let bestEvents = Infinity;

  for (; ; anchor = addDays(anchor, 7, timeZone)) {
    const spanStart = atHour(anchor, shape.startHour, timeZone);
    const lastDay = addDays(anchor, shape.spanDays - 1, timeZone);
    const spanEnd = atHour(lastDay, shape.endHour, timeZone);
    if (spanEnd > range.end) break; // ran out of data

    const blocked = participants.some((p) =>
      p.busy.some((b) => isHardBlock(b) && blockOverlaps(b, spanStart, spanEnd)),
    );
    if (blocked) continue;

    const conflicts = collectSoftConflicts(participants, spanStart, spanEnd);
    if (conflicts.length === 0) {
      // Fully free, and nothing earlier could have been: nothing can beat it.
      return { slot: { start: iso(spanStart), end: iso(spanEnd) }, conflicts };
    }

    const events = conflicts.reduce((sum, c) => sum + c.events.length, 0);
    if (conflicts.length < bestPeople || (conflicts.length === bestPeople && events < bestEvents)) {
      best = { slot: { start: iso(spanStart), end: iso(spanEnd) }, conflicts };
      bestPeople = conflicts.length;
      bestEvents = events;
    }
  }
  return best ?? noSpan();
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
  timeZone: string,
): VacationSuggestion[] {
  const build = (d: number, res: MultiDayResult): VacationSuggestion | null =>
    res.slot === null
      ? null
      : {
          kind: "shorter",
          days: d,
          slot: res.slot,
          conflicts: res.conflicts,
          ...spanTiming(
            participants,
            Date.parse(res.slot.start),
            Date.parse(res.slot.end),
            timeZone,
          ),
        };

  // Try trimming one, then two days: the longest clean shorter stay wins.
  for (let d = days - 1; d >= Math.max(2, days - 2); d--) {
    const res = findBestDaySpan(participants, d, searchStart, searchEnd, timeZone);
    if (res.slot && res.conflicts.length === 0) {
      const s = build(d, res);
      return s ? [s] : [];
    }
  }

  // Nothing clean even when shorter: offer the least-bad one-day-shorter
  // option so the user still gets a concrete counter-proposal.
  if (days > 2) {
    const s = build(
      days - 1,
      findBestDaySpan(participants, days - 1, searchStart, searchEnd, timeZone),
    );
    if (s) return [s];
  }
  return [];
}

/** The human details of a span: leave after work? home before work resumes? */
function spanTiming(
  participants: Participant[],
  startMs: number,
  endMs: number,
  timeZone: string,
): { leaveAfterWork: boolean; homeBeforeWork: boolean } {
  const departure = atHour(startMs, DEPARTURE_HOUR, timeZone);
  const dayAfter = addDays(endMs, 1, timeZone);
  let leaveAfterWork = false;
  let homeBeforeWork = false;
  for (const p of participants) {
    for (const b of p.busy) {
      if (!isSoftBlock(b)) continue;
      const iv = parseBlock(b);
      if (!iv) continue;
      // A commitment on the departure day that ends before the evening.
      if (iv.end > startMs && iv.end <= departure) leaveAfterWork = true;
      // A commitment starting the day right after the span ends.
      if (iv.start >= endMs && iv.start < dayAfter) homeBeforeWork = true;
    }
  }
  return { leaveAfterWork, homeBeforeWork };
}
