import { describe, it, expect } from "vitest";
import {
  addDays,
  atHour,
  dayOfWeek,
  offsetAt,
  startOfDay,
  startOfMonth,
  wallTime,
} from "@/lib/zone";

/**
 * Copenhagen in 2026: CET (+1) in winter, CEST (+2) from 01:00 UTC on Sunday
 * 29 March to 01:00 UTC on Sunday 25 October.
 */
const CPH = "Europe/Copenhagen";
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("offsets", () => {
  it("is +2 h in summer and +1 h in winter", () => {
    expect(offsetAt(Date.parse("2026-06-20T12:00:00Z"), CPH)).toBe(2 * H);
    expect(offsetAt(Date.parse("2026-01-20T12:00:00Z"), CPH)).toBe(1 * H);
  });

  it("switches at the exact moment the clocks change", () => {
    expect(offsetAt(Date.parse("2026-03-29T00:59:00Z"), CPH)).toBe(1 * H);
    expect(offsetAt(Date.parse("2026-03-29T01:00:00Z"), CPH)).toBe(2 * H);
  });

  it("is zero for UTC", () => {
    expect(offsetAt(Date.parse("2026-06-20T12:00:00Z"), "UTC")).toBe(0);
  });
});

describe("wallTime", () => {
  it("turns a Danish evening into the right instant", () => {
    expect(iso(wallTime(2026, 5, 20, 18, CPH))).toBe("2026-06-20T16:00:00.000Z");
    expect(iso(wallTime(2026, 0, 20, 18, CPH))).toBe("2026-01-20T17:00:00.000Z");
  });

  it("lets a night out run past midnight", () => {
    // 26 = 02:00 the next day.
    expect(iso(wallTime(2026, 5, 20, 26, CPH))).toBe("2026-06-21T00:00:00.000Z");
  });

  it("takes fractional hours", () => {
    expect(iso(wallTime(2026, 5, 20, 17.5, CPH))).toBe("2026-06-20T15:30:00.000Z");
  });

  it("pushes a time in the spring-forward gap to after it", () => {
    // 02:30 on 29 March doesn't exist in Copenhagen; it lands on 03:30 CEST.
    expect(iso(wallTime(2026, 2, 29, 2.5, CPH))).toBe("2026-03-29T01:30:00.000Z");
  });

  it("rolls day overflow into the next month", () => {
    expect(iso(wallTime(2026, 5, 31, 0, CPH))).toBe("2026-06-30T22:00:00.000Z"); // 1 July
  });
});

describe("days", () => {
  it("finds local midnight, not UTC midnight", () => {
    // 23:30 UTC on the 20th is already 01:30 on the 21st in Copenhagen.
    expect(iso(startOfDay(Date.parse("2026-06-20T23:30:00Z"), CPH))).toBe(
      "2026-06-20T22:00:00.000Z",
    );
  });

  it("uses the local weekday", () => {
    // Friday 22:30 UTC is Saturday 00:30 in Copenhagen.
    expect(dayOfWeek(Date.parse("2026-06-19T22:30:00Z"), CPH)).toBe(6);
    expect(dayOfWeek(Date.parse("2026-06-19T22:30:00Z"), "UTC")).toBe(5);
  });

  it("makes the spring-forward Sunday 23 hours long", () => {
    const sunday = startOfDay(Date.parse("2026-03-29T12:00:00Z"), CPH);
    expect(addDays(sunday, 1, CPH) - sunday).toBe(23 * H);
  });

  it("makes the fall-back Sunday 25 hours long", () => {
    const sunday = startOfDay(Date.parse("2026-10-25T12:00:00Z"), CPH);
    expect(addDays(sunday, 1, CPH) - sunday).toBe(25 * H);
  });

  it("keeps 18:00 at 18:00 on both sides of a clock change", () => {
    const sat = startOfDay(Date.parse("2026-03-28T12:00:00Z"), CPH);
    const sun = addDays(sat, 1, CPH);
    expect(iso(atHour(sat, 18, CPH))).toBe("2026-03-28T17:00:00.000Z"); // CET
    expect(iso(atHour(sun, 18, CPH))).toBe("2026-03-29T16:00:00.000Z"); // CEST
  });

  it("steps backwards too", () => {
    const day = startOfDay(Date.parse("2026-06-20T12:00:00Z"), CPH);
    expect(iso(addDays(day, -1, CPH))).toBe("2026-06-18T22:00:00.000Z");
  });
});

describe("months", () => {
  it("finds the local first of the month, and moves by months", () => {
    const june = startOfMonth(Date.parse("2026-06-20T12:00:00Z"), CPH);
    expect(iso(june)).toBe("2026-05-31T22:00:00.000Z");
    expect(iso(startOfMonth(june, CPH, 1))).toBe("2026-06-30T22:00:00.000Z");
    expect(iso(startOfMonth(june, CPH, -6))).toBe("2025-11-30T23:00:00.000Z"); // 1 Dec, CET
  });
});
