/**
 * One search, described as data: what kind of event, and its shape.
 *
 * The scheduling page runs it when you press "Find best time", and a
 * suggested event keeps the same settings so that when someone declines a
 * date, their browser can run the exact same search again from the day after.
 * Keeping both on this one function is what stops the replacement date from
 * being found by slightly different rules than the first one was.
 */
import {
  findBestDaySpan,
  findEarliestSlot,
  findWeeklySpan,
  type MultiDayResult,
  type WeeklySpanShape,
} from "@/lib/availability";
import type { Participant } from "@/types";

export type EventSettings =
  | {
      kind: "single";
      durationMinutes: number;
      startHour: number;
      /** Local days of week to search (0 = Sun … 6 = Sat); omitted = every day. */
      allowedDays?: number[];
    }
  | { kind: "trip"; shape: WeeklySpanShape }
  | { kind: "vacation"; days: number };

/**
 * The best date for `settings` on or after `searchStart`. Single meetings
 * never carry conflicts (a clash rules the time out); multi-day spans report
 * the work/school the dates would need time off from.
 */
export function findEventSlot(
  participants: Participant[],
  settings: EventSettings,
  searchStart: string,
  searchEnd: string,
  timeZone: string,
): MultiDayResult {
  switch (settings.kind) {
    case "single": {
      const { slot } = findEarliestSlot({
        id: "search",
        title: "",
        organizerId: "",
        participants,
        durationMinutes: settings.durationMinutes,
        searchStart,
        searchEnd,
        timeZone,
        constraints: {
          // A fixed meeting time: the allowed window is exactly one meeting
          // long, so only days the whole group is free at that hour qualify.
          // Not capped at 24, so a night out can run past midnight.
          earliestHour: settings.startHour,
          latestHour: settings.startHour + settings.durationMinutes / 60,
          excludeWeekends: false,
          allowedDays: settings.allowedDays,
        },
      });
      return { slot, conflicts: [] };
    }
    case "trip":
      return findWeeklySpan(participants, settings.shape, searchStart, searchEnd, timeZone);
    case "vacation":
      return findBestDaySpan(participants, settings.days, searchStart, searchEnd, timeZone);
  }
}

/** True if `value` is a well-formed EventSettings (for data read back from the server). */
export function isEventSettings(value: unknown): value is EventSettings {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
  switch (s.kind) {
    case "single":
      return (
        int(s.durationMinutes, 1, 24 * 60) &&
        int(s.startHour, 0, 23) &&
        (s.allowedDays === undefined ||
          (Array.isArray(s.allowedDays) && s.allowedDays.every((d) => int(d, 0, 6))))
      );
    case "trip": {
      const shape = s.shape as Record<string, unknown> | undefined;
      return (
        !!shape &&
        int(shape.anchorDow, 0, 6) &&
        int(shape.spanDays, 1, 7) &&
        int(shape.startHour, 0, 23) &&
        int(shape.endHour, 0, 24)
      );
    }
    case "vacation":
      return int(s.days, 1, 30);
    default:
      return false;
  }
}
