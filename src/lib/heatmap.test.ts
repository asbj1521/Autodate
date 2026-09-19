import { describe, it, expect } from "vitest";
import { buildMonthGrid, type DayCell, type MonthGridOptions } from "@/lib/heatmap";
import type { EventCategory, Participant } from "@/types";

/**
 * Tests for the month grid that tints the scheduling calendar.
 *
 * Everything works in fixed UTC instants, like the engine's tests, so results
 * never depend on the machine's timezone. June 2026 is the month under test:
 * it starts on a Monday, which makes the Monday-first layout easy to reason
 * about, and needs exactly five rows.
 */

const YEAR = 2026;
const JUNE = 5; // 0-based

/** Well before the month under test, so no day counts as past unless asked. */
const LONG_AGO = Date.parse("2020-01-01T00:00:00.000Z");

function makeParticipant(
  name: string,
  busy: Array<[string, string, EventCategory?]>,
): Participant {
  return {
    profileId: name.toLowerCase(),
    name,
    busy: busy.map(([start, end, category]) => ({ start, end, category })),
  };
}

function makeOptions(overrides: Partial<MonthGridOptions> = {}): MonthGridOptions {
  return {
    startHour: 18,
    durationMinutes: 120,
    todayMs: LONG_AGO,
    ...overrides,
  };
}

/** The cell for a given day of June 2026. */
function cellFor(weeks: DayCell[][], dayOfMonth: number): DayCell {
  const cell = weeks
    .flat()
    .find((c) => c.inMonth && c.dayOfMonth === dayOfMonth);
  if (!cell) throw new Error(`no in-month cell for June ${dayOfMonth}`);
  return cell;
}

describe("buildMonthGrid layout", () => {
  it("lays June 2026 out Monday-first in whole weeks", () => {
    const grid = buildMonthGrid([], YEAR, JUNE, makeOptions());

    expect(grid.label).toContain("2026");
    expect(grid.weekdayLabels).toEqual([
      "man.",
      "tirs.",
      "ons.",
      "tors.",
      "fre.",
      "lør.",
      "søn.",
    ]);
    // June 2026 starts on a Monday and has 30 days: exactly five rows.
    expect(grid.weeks).toHaveLength(5);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    expect(grid.weeks[0][0].date).toBe("2026-06-01T00:00:00.000Z");
  });

  it("pads with neighbouring months and marks those days out of month", () => {
    // July 2026 starts on a Wednesday, so Monday and Tuesday spill in from June.
    const grid = buildMonthGrid([], YEAR, 6, makeOptions());

    expect(grid.weeks[0][0].inMonth).toBe(false);
    expect(grid.weeks[0][1].inMonth).toBe(false);
    expect(grid.weeks[0][2].inMonth).toBe(true);
    expect(grid.weeks[0][2].dayOfMonth).toBe(1);
  });

  it("marks days before today as past", () => {
    const grid = buildMonthGrid([], YEAR, JUNE, makeOptions({
      todayMs: Date.parse("2026-06-10T09:00:00.000Z"),
    }));

    expect(cellFor(grid.weeks, 9).isPast).toBe(true);
    expect(cellFor(grid.weeks, 10).isPast).toBe(false); // today is not past
    expect(cellFor(grid.weeks, 11).isPast).toBe(false);
  });

  it("reports the participant total on every cell", () => {
    const people = [makeParticipant("Alice", []), makeParticipant("Bob", [])];
    const grid = buildMonthGrid(people, YEAR, JUNE, makeOptions());

    expect(grid.total).toBe(2);
    expect(cellFor(grid.weeks, 15).total).toBe(2);
  });
});

describe("buildMonthGrid for a single meeting", () => {
  it("counts only people free at the chosen hour", () => {
    // The meeting is 18:00-20:00. Alice is busy across it, Bob finishes before.
    const people = [
      makeParticipant("Alice", [
        ["2026-06-03T19:00:00.000Z", "2026-06-03T21:00:00.000Z"],
      ]),
      makeParticipant("Bob", [
        ["2026-06-03T09:00:00.000Z", "2026-06-03T17:00:00.000Z"],
      ]),
    ];

    const grid = buildMonthGrid(people, YEAR, JUNE, makeOptions());

    expect(cellFor(grid.weeks, 3).freeCount).toBe(1);
    expect(cellFor(grid.weeks, 4).freeCount).toBe(2); // nothing on the 4th
  });

  it("counts a meeting that runs past midnight against the next day too", () => {
    // A night out: 22:00 for four hours, ending 02:00 the following day.
    const people = [
      makeParticipant("Alice", [
        ["2026-06-09T00:30:00.000Z", "2026-06-09T01:30:00.000Z"],
      ]),
    ];

    const grid = buildMonthGrid(
      people,
      YEAR,
      JUNE,
      makeOptions({ startHour: 22, durationMinutes: 240 }),
    );

    // The 8th's meeting spills into the 9th, where Alice is busy.
    expect(cellFor(grid.weeks, 8).freeCount).toBe(0);
    expect(cellFor(grid.weeks, 9).freeCount).toBe(1);
  });

  it("excludes weekdays outside allowedDays instead of tinting them", () => {
    const people = [makeParticipant("Alice", [])];
    // Fridays and Saturdays only (5 = Fri, 6 = Sat).
    const grid = buildMonthGrid(
      people,
      YEAR,
      JUNE,
      makeOptions({ allowedDays: [5, 6] }),
    );

    expect(cellFor(grid.weeks, 5).excluded).toBe(false); // Friday
    expect(cellFor(grid.weeks, 6).excluded).toBe(false); // Saturday
    expect(cellFor(grid.weeks, 7).excluded).toBe(true); // Sunday
    expect(cellFor(grid.weeks, 7).freeCount).toBe(0);
  });

  it("leaves spillover days blank", () => {
    const people = [makeParticipant("Alice", [])];
    const grid = buildMonthGrid(people, YEAR, 6, makeOptions());

    expect(grid.weeks[0][0].inMonth).toBe(false);
    expect(grid.weeks[0][0].freeCount).toBe(0);
  });
});

describe("buildMonthGrid in vacation mode", () => {
  const windowEndMs = Date.parse("2027-01-01T00:00:00.000Z");

  it("splits people who are away from people who would take time off", () => {
    const people = [
      // Away all day: a hard block rules the day out entirely.
      makeParticipant("Alice", [
        ["2026-06-15T00:00:00.000Z", "2026-06-16T00:00:00.000Z", "travel"],
      ]),
      // Work only: free, but conditionally.
      makeParticipant("Bob", [
        ["2026-06-15T09:00:00.000Z", "2026-06-15T17:00:00.000Z", "work"],
      ]),
      makeParticipant("Cara", []),
    ];

    const grid = buildMonthGrid(
      people,
      YEAR,
      JUNE,
      makeOptions({ multiDay: { windowEndMs } }),
    );

    const cell = cellFor(grid.weeks, 15);
    expect(cell.freeCount).toBe(1); // Cara
    expect(cell.conditionalCount).toBe(1); // Bob
    // Alice is neither: being away is not "free with effort".
    expect(cell.freeCount + cell.conditionalCount).toBe(2);
  });

  it("leaves days past the end of the data blank", () => {
    const people = [makeParticipant("Alice", [])];
    const grid = buildMonthGrid(
      people,
      YEAR,
      JUNE,
      makeOptions({
        multiDay: { windowEndMs: Date.parse("2026-06-10T00:00:00.000Z") },
      }),
    );

    expect(cellFor(grid.weeks, 9).freeCount).toBe(1);
    expect(cellFor(grid.weeks, 10).freeCount).toBe(0); // beyond the window
  });
});

describe("buildMonthGrid in weekend-trip mode", () => {
  const weeklySpan = {
    anchorDow: 5, // Friday
    spanDays: 3, // Fri, Sat, Sun
    startHour: 17,
    endHour: 21,
    windowEndMs: Date.parse("2027-01-01T00:00:00.000Z"),
  };

  it("excludes days outside the trip's weekly window", () => {
    const grid = buildMonthGrid([], YEAR, JUNE, makeOptions({ weeklySpan }));

    // June 2026: the 5th is a Friday, so Fri-Sun is the 5th to the 7th.
    expect(cellFor(grid.weeks, 5).excluded).toBe(false);
    expect(cellFor(grid.weeks, 6).excluded).toBe(false);
    expect(cellFor(grid.weeks, 7).excluded).toBe(false);
    expect(cellFor(grid.weeks, 8).excluded).toBe(true); // Monday
    expect(cellFor(grid.weeks, 4).excluded).toBe(true); // Thursday
  });

  it("only counts the first day from the departure hour", () => {
    // A workday ending at 17:00 does not touch a trip leaving at 17:00.
    const people = [
      makeParticipant("Alice", [
        ["2026-06-05T09:00:00.000Z", "2026-06-05T17:00:00.000Z", "work"],
      ]),
    ];

    const grid = buildMonthGrid(people, YEAR, JUNE, makeOptions({ weeklySpan }));

    expect(cellFor(grid.weeks, 5).freeCount).toBe(1);
    expect(cellFor(grid.weeks, 5).conditionalCount).toBe(0);
  });

  it("counts work overlapping the departure evening as conditional", () => {
    const people = [
      makeParticipant("Alice", [
        ["2026-06-05T16:00:00.000Z", "2026-06-05T20:00:00.000Z", "work"],
      ]),
    ];

    const grid = buildMonthGrid(people, YEAR, JUNE, makeOptions({ weeklySpan }));

    expect(cellFor(grid.weeks, 5).freeCount).toBe(0);
    expect(cellFor(grid.weeks, 5).conditionalCount).toBe(1);
  });

  it("takes precedence over vacation mode", () => {
    const grid = buildMonthGrid(
      [],
      YEAR,
      JUNE,
      makeOptions({
        weeklySpan,
        multiDay: { windowEndMs: weeklySpan.windowEndMs },
      }),
    );

    expect(cellFor(grid.weeks, 8).excluded).toBe(true);
  });
});
