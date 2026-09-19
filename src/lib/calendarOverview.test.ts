import { describe, it, expect } from "vitest";
import {
  buildMonthLayout,
  calendarColors,
  dayKey,
  isoWeekNumber,
  formatDuration,
  formatSegmentRange,
  HOLIDAY_CALENDAR,
  HOLIDAY_CALENDAR_ID,
  holidaySegmentsByDay,
  segmentByDay,
  withHolidays,
  type OverviewBlock,
  type OverviewCalendar,
} from "@/lib/calendarOverview";

/**
 * Tests for the calendar overview's layout logic.
 *
 * Days are *local* days, so instants are built with the local-time Date
 * constructor and compared by local day keys. That keeps the expectations true
 * in whatever time zone the tests run in.
 */

const iso = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

const block = (start: string, end: string, calendarId = "cal"): OverviewBlock => ({
  calendarId,
  start,
  end,
});

describe("buildMonthLayout", () => {
  it("pads September 2026 (starts on a Tuesday) with one leading day, 5 rows", () => {
    const layout = buildMonthLayout(2026, 8);
    expect(layout.weeks).toHaveLength(5);
    expect(layout.weeks.every((w) => w.length === 7)).toBe(true);
    expect(layout.weeks[0][0].key).toBe("2026-08-31"); // Monday
    expect(layout.weeks[0][0].inMonth).toBe(false);
    expect(layout.weeks[0][1].key).toBe("2026-09-01");
    expect(layout.weeks[0][1].inMonth).toBe(true);
    expect(layout.weeks[4][6].key).toBe("2026-10-04"); // trailing spill-over
    expect(layout.weeks[4][6].inMonth).toBe(false);
    expect(layout.weekdayLabels).toEqual(["man.", "tirs.", "ons.", "tors.", "fre.", "lør.", "søn."]);
  });

  it("needs 6 rows when a 31-day month starts late in the week (August 2026)", () => {
    const layout = buildMonthLayout(2026, 7); // Aug 1 2026 is a Saturday
    expect(layout.weeks).toHaveLength(6);
    expect(layout.weeks[0][5].key).toBe("2026-08-01");
  });

  it("uses exactly 4 rows when the month fits (February 2027 starts on a Monday)", () => {
    expect(buildMonthLayout(2027, 1).weeks).toHaveLength(4);
  });

  it("exposes a half-open range covering exactly the grid", () => {
    const layout = buildMonthLayout(2026, 8);
    expect(dayKey(layout.from)).toBe("2026-08-31");
    expect(dayKey(layout.to)).toBe("2026-10-05"); // the day after the last cell
  });

  it("walks across a year boundary (December 2026)", () => {
    const layout = buildMonthLayout(2026, 11);
    expect(layout.weeks.flat().some((d) => d.key === "2027-01-03")).toBe(true);
  });

  it("labels the month in Danish like the front page", () => {
    expect(buildMonthLayout(2026, 8).label).toBe("september 2026");
  });
});

describe("segmentByDay", () => {
  const from = new Date(2026, 8, 1);
  const to = new Date(2026, 9, 1);

  it("keeps a same-day block as one segment", () => {
    const seg = segmentByDay([block(iso(2026, 9, 22, 9, 15), iso(2026, 9, 22, 11, 20))], from, to);
    expect([...seg.keys()]).toEqual(["2026-09-22"]);
    const [s] = seg.get("2026-09-22")!;
    expect(s.allDay).toBe(false);
    expect(s.continuesBefore || s.continuesAfter).toBe(false);
    expect(formatSegmentRange(s)).toBe("09:15-11:20");
    expect(formatDuration(s.start, s.end)).toBe("2 h 5 min");
  });

  it("splits an overnight block across two days", () => {
    const seg = segmentByDay([block(iso(2026, 9, 25, 22), iso(2026, 9, 26, 2))], from, to);
    const fri = seg.get("2026-09-25")![0];
    const sat = seg.get("2026-09-26")![0];
    expect(formatSegmentRange(fri)).toBe("22:00-24:00");
    expect(fri.continuesAfter).toBe(true);
    expect(fri.continuesBefore).toBe(false);
    expect(formatSegmentRange(sat)).toBe("00:00-02:00");
    expect(sat.continuesBefore).toBe(true);
    expect(sat.continuesAfter).toBe(false);
  });

  it("makes the middle day of a three-day block an all-day segment", () => {
    const seg = segmentByDay([block(iso(2026, 9, 25, 22), iso(2026, 9, 27, 2))], from, to);
    const mid = seg.get("2026-09-26")![0];
    expect(mid.allDay).toBe(true);
    expect(formatSegmentRange(mid)).toBe("All day");
    expect(mid.continuesBefore && mid.continuesAfter).toBe(true);
  });

  it("treats a midnight-to-midnight block (an all-day event) as one all-day segment", () => {
    const seg = segmentByDay([block(iso(2026, 9, 10), iso(2026, 9, 11))], from, to);
    expect([...seg.keys()]).toEqual(["2026-09-10"]);
    const [s] = seg.get("2026-09-10")!;
    expect(s.allDay).toBe(true);
    expect(s.continuesBefore || s.continuesAfter).toBe(false);
  });

  it("clips blocks at the range edges", () => {
    const seg = segmentByDay([block(iso(2026, 8, 30, 12), iso(2026, 9, 2, 12))], from, to);
    expect([...seg.keys()].sort()).toEqual(["2026-09-01", "2026-09-02"]);
    expect(seg.get("2026-09-01")![0].allDay).toBe(true);
  });

  it("ignores blocks entirely outside the range and malformed ones", () => {
    const seg = segmentByDay(
      [
        block(iso(2026, 8, 1, 9), iso(2026, 8, 1, 10)),
        block(iso(2026, 10, 1, 9), iso(2026, 10, 1, 10)), // starts exactly at `to`
        block(iso(2026, 9, 5, 10), iso(2026, 9, 5, 9)), // ends before it starts
      ],
      from,
      to,
    );
    expect(seg.size).toBe(0);
  });

  it("sorts each day's segments by start time and keeps their calendars", () => {
    const seg = segmentByDay(
      [
        block(iso(2026, 9, 22, 14), iso(2026, 9, 22, 15), "b"),
        block(iso(2026, 9, 22, 8), iso(2026, 9, 22, 9), "a"),
      ],
      from,
      to,
    );
    expect(seg.get("2026-09-22")!.map((s) => s.calendarId)).toEqual(["a", "b"]);
  });

  it("loses no time: segment durations add up to the block, even across DST changes", () => {
    // Spans 25 Oct 2026 (clocks change in Europe) and 29 Mar 2026-style edges alike.
    const start = iso(2026, 10, 23, 18);
    const end = iso(2026, 10, 27, 7);
    const seg = segmentByDay([block(start, end)], new Date(2026, 9, 1), new Date(2026, 10, 1));
    const total = [...seg.values()].flat().reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()), 0);
    expect(total).toBe(Date.parse(end) - Date.parse(start));
  });
});

describe("formatDuration", () => {
  it("formats minutes, whole hours and mixed", () => {
    const t = (min: number) => formatDuration(new Date(0), new Date(min * 60_000));
    expect(t(45)).toBe("45 min");
    expect(t(180)).toBe("3 h");
    expect(t(155)).toBe("2 h 35 min");
  });
});

describe("calendarColors", () => {
  const cal = (id: string, purpose: OverviewCalendar["purpose"]): OverviewCalendar => ({
    id,
    name: id,
    purpose,
    provider: "ics",
    account: null,
    connectionId: "c",
  });

  it("colours by category when set, and gives uncategorised calendars distinct palette colours", () => {
    const colors = calendarColors([cal("a", "school"), cal("b", null), cal("c", null), cal("d", "school")]);
    expect(colors.get("a")).toBe(colors.get("d")); // same category, same colour
    expect(colors.get("b")).not.toBe(colors.get("c"));
    expect(colors.get("a")).not.toBe(colors.get("b"));
  });

  it("reuses the palette instead of failing when there are many uncategorised calendars", () => {
    const many = Array.from({ length: 12 }, (_, i) => cal(`x${i}`, null));
    const colors = calendarColors(many);
    expect(colors.size).toBe(13); // 12 calendars plus the built-in holiday calendar
    expect(colors.get("x0")).toBe(colors.get("x7")); // palette has 7 colours
  });
});

describe("built-in Danish holidays", () => {
  it("places the April 2026 holidays on the right days of the grid (Easter is 5 April)", () => {
    const layout = buildMonthLayout(2026, 3);
    const byDay = holidaySegmentsByDay(layout.from, layout.to);
    const names = (key: string) => byDay.get(key)?.map((s) => s.holiday?.name);
    expect(names("2026-04-02")).toEqual(["Skærtorsdag"]);
    expect(names("2026-04-03")).toEqual(["Langfredag"]);
    expect(names("2026-04-05")).toEqual(["Påskedag"]);
    expect(names("2026-04-06")).toEqual(["2. påskedag"]);
    expect(byDay.size).toBe(4);
  });

  it("marks holiday segments as all-day, on the built-in calendar, spanning exactly that local day", () => {
    const layout = buildMonthLayout(2026, 3);
    const seg = holidaySegmentsByDay(layout.from, layout.to).get("2026-04-03")![0];
    expect(seg.calendarId).toBe(HOLIDAY_CALENDAR_ID);
    expect(seg.allDay).toBe(true);
    expect(formatSegmentRange(seg)).toBe("All day");
    expect(dayKey(seg.start)).toBe("2026-04-03");
    expect(dayKey(seg.end)).toBe("2026-04-04");
  });

  it("includes days from the next year when a December grid spills into January", () => {
    const layout = buildMonthLayout(2026, 11); // grid runs to Sunday 3 January 2027
    const byDay = holidaySegmentsByDay(layout.from, layout.to);
    expect([...byDay.keys()]).toEqual(["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-31", "2027-01-01"]);
  });

  it("only returns holidays inside the requested range", () => {
    const byDay = holidaySegmentsByDay(new Date(2026, 3, 3), new Date(2026, 3, 6)); // 3 to 5 April
    expect([...byDay.keys()]).toEqual(["2026-04-03", "2026-04-05"]);
  });

  it("puts a day's holidays before its timed blocks without changing the inputs", () => {
    const from = new Date(2026, 3, 1);
    const to = new Date(2026, 4, 1);
    const timed = segmentByDay([block(iso(2026, 4, 3, 9), iso(2026, 4, 3, 10), "x")], from, to);
    const holidays = holidaySegmentsByDay(from, to);
    const merged = withHolidays(timed, holidays);
    expect(merged.get("2026-04-03")!.map((s) => s.holiday?.name ?? s.calendarId)).toEqual(["Langfredag", "x"]);
    expect(timed.get("2026-04-03")).toHaveLength(1); // untouched
    expect(merged.get("2026-04-02")).toHaveLength(1); // holiday on a day with no blocks
  });

  it("is a fixed calendar with no account and its own colour, distinct from the palette", () => {
    expect(HOLIDAY_CALENDAR.provider).toBe("builtin");
    expect(HOLIDAY_CALENDAR.account).toBeNull();
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `x${i}`, name: `x${i}`, purpose: null, provider: "ics" as const, account: null, connectionId: "c",
    }));
    const colors = calendarColors(many);
    expect([...colors.entries()].filter(([id, rgb]) => id !== HOLIDAY_CALENDAR_ID && rgb === colors.get(HOLIDAY_CALENDAR_ID))).toEqual([]);
  });
});

describe("isoWeekNumber", () => {
  const week = (y: number, m: number, d: number) => isoWeekNumber(new Date(y, m - 1, d));

  it("numbers September 2026 weeks 36 to 40 (Monday 21 September starts week 39)", () => {
    expect(week(2026, 8, 31)).toBe(36);
    expect(week(2026, 9, 7)).toBe(37);
    expect(week(2026, 9, 14)).toBe(38);
    expect(week(2026, 9, 21)).toBe(39);
    expect(week(2026, 9, 28)).toBe(40);
  });

  it("gives every day of a week the same number, Monday to Sunday", () => {
    for (let d = 21; d <= 27; d++) expect(week(2026, 9, d)).toBe(39);
    expect(week(2026, 9, 28)).toBe(40); // the next Monday starts a new week
  });

  it("puts 1 January in week 1 when it falls Monday to Thursday (2026 starts on a Thursday)", () => {
    expect(week(2026, 1, 1)).toBe(1);
    expect(week(2025, 12, 29)).toBe(1); // Monday of that week, still in December
    expect(week(2025, 12, 28)).toBe(52);
    expect(week(2024, 1, 1)).toBe(1);
  });

  it("puts 1 January in the previous year's last week when it falls Friday to Sunday", () => {
    expect(week(2027, 1, 1)).toBe(53); // 2026 has 53 weeks
    expect(week(2027, 1, 3)).toBe(53);
    expect(week(2027, 1, 4)).toBe(1);
    expect(week(2021, 1, 3)).toBe(53); // 2020 had 53 weeks
    expect(week(2022, 1, 1)).toBe(52);
  });

  it("puts late December in week 1 of the next year when its Thursday is in January", () => {
    expect(week(2024, 12, 30)).toBe(1); // Monday, week 1 of 2025
    expect(week(2019, 12, 30)).toBe(1); // week 1 of 2020
    expect(week(2026, 12, 31)).toBe(53);
  });

  it("is not thrown off by the days the clocks change", () => {
    expect(week(2026, 3, 29)).toBe(13); // Sunday, clocks go forward in Europe
    expect(week(2026, 10, 25)).toBe(43); // Sunday, clocks go back
  });
});

describe("month layout week numbers", () => {
  it("has one number per row, matching the Monday of each row", () => {
    const layout = buildMonthLayout(2026, 8); // September 2026, grid starts Monday 31 August
    expect(layout.weekNumbers).toEqual([36, 37, 38, 39, 40]);
    expect(layout.weekNumbers).toHaveLength(layout.weeks.length);
  });

  it("ends the December 2026 grid with week 52 then week 53 across the year boundary", () => {
    const layout = buildMonthLayout(2026, 11); // December 2026, grid runs to 3 January 2027
    // last two rows: 21 to 27 Dec is week 52, and 28 Dec to 3 Jan 2027 is week 53
    expect(layout.weekNumbers.slice(-2)).toEqual([52, 53]);
  });

  it("handles a six-row month", () => {
    const layout = buildMonthLayout(2026, 7); // August 2026 needs six rows
    expect(layout.weekNumbers).toEqual([31, 32, 33, 34, 35, 36]);
  });
});
