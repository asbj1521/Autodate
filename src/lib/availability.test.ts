import { describe, it, expect } from "vitest";
import {
  findBestDaySpan,
  findEarliestDaySpan,
  findEarliestSlot,
  findVacationSuggestions,
  findWeeklySpan,
} from "@/lib/availability";
import type { Event, EventCategory, Participant } from "@/types";

/**
 * Tests for the availability engine.
 *
 * These use fixed UTC instants so the expected results are unambiguous and don't
 * depend on the machine's timezone. A helper builds an Event with sensible
 * defaults so each test only states what it actually cares about.
 *
 * Most searches run in the "UTC" zone, where local time and UTC coincide, so
 * each test reads in plain hours. The Copenhagen tests at the end cover what
 * a real zone changes: local hours, local days, and the clock changes.
 */
const TZ = "UTC";

function makeParticipant(
  name: string,
  busy: Array<[string, string]>,
): Participant {
  return {
    profileId: name.toLowerCase(),
    name,
    busy: busy.map(([start, end]) => ({ start, end })),
  };
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-1",
    title: "Test event",
    organizerId: "alice",
    participants: [],
    durationMinutes: 60,
    searchStart: "2026-06-22T00:00:00.000Z", // a Monday
    searchEnd: "2026-06-27T00:00:00.000Z", // the following Saturday
    timeZone: TZ,
    ...overrides,
  };
}

describe("findEarliestSlot", () => {
  it("returns the very start of the window when everyone is free", () => {
    const event = makeEvent({
      participants: [makeParticipant("Alice", []), makeParticipant("Bob", [])],
    });

    const { slot } = findEarliestSlot(event);

    expect(slot).toEqual({
      start: "2026-06-22T00:00:00.000Z",
      end: "2026-06-22T01:00:00.000Z",
    });
  });

  it("finds the first gap after a busy block at the window start", () => {
    const event = makeEvent({
      participants: [
        makeParticipant("Alice", [
          ["2026-06-22T00:00:00.000Z", "2026-06-22T09:00:00.000Z"],
        ]),
      ],
    });

    const { slot } = findEarliestSlot(event);

    expect(slot).toEqual({
      start: "2026-06-22T09:00:00.000Z",
      end: "2026-06-22T10:00:00.000Z",
    });
  });

  it("requires ALL participants to be free (intersection, not union)", () => {
    // Alice is free from 09:00; Bob is free from 10:00. The first time *both*
    // are free is 10:00, so the union of busy time pushes the slot to 10:00.
    const event = makeEvent({
      participants: [
        makeParticipant("Alice", [
          ["2026-06-22T00:00:00.000Z", "2026-06-22T09:00:00.000Z"],
        ]),
        makeParticipant("Bob", [
          ["2026-06-22T00:00:00.000Z", "2026-06-22T10:00:00.000Z"],
        ]),
      ],
    });

    const { slot } = findEarliestSlot(event);

    expect(slot).toEqual({
      start: "2026-06-22T10:00:00.000Z",
      end: "2026-06-22T11:00:00.000Z",
    });
  });

  it("skips gaps that are too short for the requested duration", () => {
    // There's a 30-minute gap at 09:00, but the meeting needs 60 minutes, so the
    // engine must skip it and take the next big-enough gap at 10:00.
    const event = makeEvent({
      durationMinutes: 60,
      participants: [
        makeParticipant("Alice", [
          ["2026-06-22T00:00:00.000Z", "2026-06-22T09:00:00.000Z"],
          ["2026-06-22T09:30:00.000Z", "2026-06-22T10:00:00.000Z"],
        ]),
      ],
    });

    const { slot } = findEarliestSlot(event);

    expect(slot).toEqual({
      start: "2026-06-22T10:00:00.000Z",
      end: "2026-06-22T11:00:00.000Z",
    });
  });

  it("returns null when no slot fits anywhere in the window", () => {
    const event = makeEvent({
      participants: [
        makeParticipant("Alice", [
          ["2026-06-22T00:00:00.000Z", "2026-06-27T00:00:00.000Z"],
        ]),
      ],
    });

    const result = findEarliestSlot(event);

    expect(result.slot).toBeNull();
    expect(result.alternatives).toEqual([]);
  });

  it("respects daily-hour constraints", () => {
    // Everyone is free, but meetings may only run 09:00-17:00. The earliest
    // valid start is therefore 09:00, not 00:00.
    const event = makeEvent({
      participants: [makeParticipant("Alice", [])],
      constraints: { earliestHour: 9, latestHour: 17 },
    });

    const { slot } = findEarliestSlot(event);

    expect(slot).toEqual({
      start: "2026-06-22T09:00:00.000Z",
      end: "2026-06-22T10:00:00.000Z",
    });
  });

  it("only searches allowed days of the week", () => {
    // Search starts Monday 22 June, but only Wednesdays are allowed, so the
    // earliest slot is Wednesday 24 June.
    const event = makeEvent({
      participants: [makeParticipant("Alice", [])],
      constraints: { allowedDays: [3] },
    });

    const { slot } = findEarliestSlot(event);

    expect(slot?.start).toBe("2026-06-24T00:00:00.000Z");
  });

  it("excludes weekends when asked", () => {
    // Search starts Saturday; with weekends excluded the first slot is Monday.
    const event = makeEvent({
      searchStart: "2026-06-20T00:00:00.000Z", // Saturday
      searchEnd: "2026-06-23T00:00:00.000Z", // Tuesday
      participants: [makeParticipant("Alice", [])],
      constraints: { excludeWeekends: true },
    });

    const { slot } = findEarliestSlot(event);

    expect(slot).toEqual({
      start: "2026-06-22T00:00:00.000Z", // Monday
      end: "2026-06-22T01:00:00.000Z",
    });
  });

  it("merges overlapping busy blocks across participants", () => {
    // Two overlapping busy blocks should behave as one continuous block.
    const event = makeEvent({
      participants: [
        makeParticipant("Alice", [
          ["2026-06-22T00:00:00.000Z", "2026-06-22T10:00:00.000Z"],
        ]),
        makeParticipant("Bob", [
          ["2026-06-22T08:00:00.000Z", "2026-06-22T12:00:00.000Z"],
        ]),
      ],
    });

    const { slot } = findEarliestSlot(event);

    expect(slot).toEqual({
      start: "2026-06-22T12:00:00.000Z",
      end: "2026-06-22T13:00:00.000Z",
    });
  });

  it("provides alternative slots from later free windows", () => {
    // Free all week with a daily 09:00-10:00 window -> one slot per day. The
    // first is the primary; the rest are alternatives (capped at 3).
    const event = makeEvent({
      participants: [makeParticipant("Alice", [])],
      constraints: { earliestHour: 9, latestHour: 10 },
    });

    const { slot, alternatives } = findEarliestSlot(event);

    expect(slot?.start).toBe("2026-06-22T09:00:00.000Z");
    expect(alternatives.map((a) => a.start)).toEqual([
      "2026-06-23T09:00:00.000Z",
      "2026-06-24T09:00:00.000Z",
      "2026-06-25T09:00:00.000Z",
    ]);
  });

  it("returns null for invalid input (end before start)", () => {
    const event = makeEvent({
      searchStart: "2026-06-27T00:00:00.000Z",
      searchEnd: "2026-06-22T00:00:00.000Z",
      participants: [makeParticipant("Alice", [])],
    });

    expect(findEarliestSlot(event).slot).toBeNull();
  });

  it("ignores malformed busy intervals instead of crashing", () => {
    const event = makeEvent({
      participants: [
        {
          profileId: "alice",
          name: "Alice",
          busy: [{ start: "not-a-date", end: "also-bad" }],
        },
      ],
    });

    const { slot } = findEarliestSlot(event);

    // The bad interval is dropped, so Alice is effectively free.
    expect(slot?.start).toBe("2026-06-22T00:00:00.000Z");
  });
});

/** A participant whose busy blocks carry titles + categories (multi-day tests). */
function makeCategorised(
  name: string,
  busy: Array<[string, string, string, EventCategory]>,
): Participant {
  return {
    profileId: name.toLowerCase(),
    name,
    busy: busy.map(([start, end, title, category]) => ({
      start,
      end,
      title,
      category,
    })),
  };
}

describe("findEarliestDaySpan", () => {
  // Mon 22 June to Mon 6 July 2026, all UTC midnights.
  const START = "2026-06-22T00:00:00.000Z";
  const END = "2026-07-06T00:00:00.000Z";

  it("returns the first day of the window when everyone is free", () => {
    const { slot, conflicts } = findEarliestDaySpan(
      [makeParticipant("Alice", []), makeParticipant("Bob", [])],
      3,
      START,
      END,
      TZ,
    );

    expect(slot).toEqual({
      start: "2026-06-22T00:00:00.000Z",
      end: "2026-06-25T00:00:00.000Z",
    });
    expect(conflicts).toEqual([]);
  });

  it("hard-blocks on all-day absences, like being on another holiday", () => {
    // Alice is away 22-24 June, so a 3-day span first fits starting the 25th.
    const alice = makeCategorised("Alice", [
      ["2026-06-22T00:00:00.000Z", "2026-06-25T00:00:00.000Z", "Ferie", "travel"],
    ]);

    const { slot } = findEarliestDaySpan([alice], 3, START, END, TZ);

    expect(slot?.start).toBe("2026-06-25T00:00:00.000Z");
  });

  it("ignores sub-day plans you'd skip for a trip (dinner, outings, errands)", () => {
    // An evening dinner and even a six-hour family outing are not reasons a
    // whole vacation day is impossible, so the span still starts on day one.
    const alice = makeCategorised("Alice", [
      [
        "2026-06-22T18:00:00.000Z",
        "2026-06-22T21:00:00.000Z",
        "Middag",
        "social",
      ],
      [
        "2026-06-23T11:00:00.000Z",
        "2026-06-23T17:00:00.000Z",
        "Familietid",
        "family",
      ],
    ]);

    const { slot, conflicts } = findEarliestDaySpan([alice], 3, START, END, TZ);

    expect(slot?.start).toBe("2026-06-22T00:00:00.000Z");
    expect(conflicts).toEqual([]);
  });

  it("does NOT block on work/school, but reports them as conflicts", () => {
    // Alice works Mon-Tue. The span still starts Monday, but her work days
    // come back as conflicts for her to approve.
    const alice = makeCategorised("Alice", [
      ["2026-06-22T09:00:00.000Z", "2026-06-22T17:00:00.000Z", "Arbejde", "work"],
      ["2026-06-23T09:00:00.000Z", "2026-06-23T17:00:00.000Z", "Arbejde", "work"],
    ]);

    const { slot, conflicts } = findEarliestDaySpan([alice], 3, START, END, TZ);

    expect(slot?.start).toBe("2026-06-22T00:00:00.000Z");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].profileId).toBe("alice");
    expect(conflicts[0].events).toHaveLength(2);
    expect(conflicts[0].events[0].title).toBe("Arbejde");
  });

  it("only reports work/school overlapping the chosen span", () => {
    // Work on 30 June is outside a 3-day span starting 22 June.
    const alice = makeCategorised("Alice", [
      ["2026-06-30T09:00:00.000Z", "2026-06-30T17:00:00.000Z", "Arbejde", "work"],
    ]);

    const { slot, conflicts } = findEarliestDaySpan([alice], 3, START, END, TZ);

    expect(slot?.start).toBe("2026-06-22T00:00:00.000Z");
    expect(conflicts).toEqual([]);
  });

  it("requires the span to be hard-free for ALL participants", () => {
    // Alice's holiday blocks 22-24, Bob's all-day cabin trip blocks the 25th:
    // the first 2-day run clear for both is 26-27.
    const alice = makeCategorised("Alice", [
      ["2026-06-22T00:00:00.000Z", "2026-06-25T00:00:00.000Z", "Ferie", "travel"],
    ]);
    const bob = makeCategorised("Bob", [
      [
        "2026-06-25T00:00:00.000Z",
        "2026-06-26T00:00:00.000Z",
        "Hyttetur",
        "travel",
      ],
    ]);

    const { slot } = findEarliestDaySpan([alice, bob], 2, START, END, TZ);

    expect(slot?.start).toBe("2026-06-26T00:00:00.000Z");
  });

  it("blocks on all-day untagged intervals (real free/busy has no category)", () => {
    const alice = makeParticipant("Alice", [
      ["2026-06-22T00:00:00.000Z", "2026-06-23T00:00:00.000Z"],
    ]);

    const { slot } = findEarliestDaySpan([alice], 2, START, END, TZ);

    expect(slot?.start).toBe("2026-06-23T00:00:00.000Z");
  });

  it("returns null when the window is shorter than the span", () => {
    const result = findEarliestDaySpan(
      [makeParticipant("Alice", [])],
      30,
      START,
      END, // only 14 days
      TZ,
    );

    expect(result.slot).toBeNull();
    expect(result.conflicts).toEqual([]);
  });

  it("returns null for a non-positive or fractional day count", () => {
    const alice = makeParticipant("Alice", []);
    expect(findEarliestDaySpan([alice], 0, START, END, TZ).slot).toBeNull();
    expect(findEarliestDaySpan([alice], -2, START, END, TZ).slot).toBeNull();
    expect(findEarliestDaySpan([alice], 1.5, START, END, TZ).slot).toBeNull();
  });

  it("aligns spans to whole days even when the search start is mid-day", () => {
    const { slot } = findEarliestDaySpan(
      [makeParticipant("Alice", [])],
      2,
      "2026-06-22T15:30:00.000Z",
      END,
      TZ,
    );

    expect(slot?.start).toBe("2026-06-23T00:00:00.000Z");
  });
});

describe("findBestDaySpan", () => {
  // Mon 22 June to Mon 20 July 2026.
  const START = "2026-06-22T00:00:00.000Z";
  const END = "2026-07-20T00:00:00.000Z";

  /** Works 09-17 every weekday in the window, except [freeFrom, freeTo). */
  function workerExcept(
    name: string,
    freeFrom: string,
    freeTo: string,
  ): Participant {
    const busy: Participant["busy"] = [];
    for (let t = Date.parse(START); t < Date.parse(END); t += 86_400_000) {
      const dow = new Date(t).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (t >= Date.parse(freeFrom) && t < Date.parse(freeTo)) continue;
      busy.push({
        start: new Date(t + 9 * 3_600_000).toISOString(),
        end: new Date(t + 17 * 3_600_000).toISOString(),
        title: "Arbejde",
        category: "work",
      });
    }
    return { profileId: name.toLowerCase(), name, busy };
  }

  it("prefers a later conflict-free week over an earlier one full of work", () => {
    // Alice works every weekday except her leave, 6-10 July. The earliest
    // clean 7-day window starts Friday 3 July — she leaves after work Friday,
    // then weekend + her leave week. NOT tomorrow with a week of conflicts.
    const alice = workerExcept(
      "Alice",
      "2026-07-06T00:00:00.000Z",
      "2026-07-13T00:00:00.000Z",
    );

    const { slot, conflicts } = findBestDaySpan([alice], 7, START, END, TZ);

    expect(slot?.start).toBe("2026-07-03T00:00:00.000Z");
    expect(conflicts).toEqual([]);
  });

  it("ignores a departure-day workday that ends by 17:00", () => {
    // Alice works every single weekday, no leave anywhere. A 3-day vacation
    // still fits Friday to Sunday, leaving after work — the same story the
    // weekend-trip search tells about the same calendar.
    const alice = workerExcept("Alice", START, START); // never free
    const { slot, conflicts } = findBestDaySpan([alice], 3, START, END, TZ);

    expect(slot?.start).toBe("2026-06-26T00:00:00.000Z"); // a Friday
    expect(conflicts).toEqual([]);
  });

  it("minimises how many people need time off when no span is clean", () => {
    // Alice works week 1 only; Bob works every week in this shorter window,
    // so no span is conflict-free. The best span is the earliest one where
    // only Bob (not both of them) would need time off.
    const SHORT_END = "2026-07-13T00:00:00.000Z";
    const alice = workerExcept(
      "Alice",
      "2026-06-29T00:00:00.000Z", // free from week 2 onwards
      SHORT_END,
    );
    const bob = workerExcept("Bob", SHORT_END, SHORT_END); // never free

    const { slot, conflicts } = findBestDaySpan([alice, bob], 7, START, SHORT_END, TZ);

    // Friday 26 June: Alice's last workday becomes the departure day, so only
    // Bob is conflicted from there on.
    expect(slot?.start).toBe("2026-06-26T00:00:00.000Z");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].profileId).toBe("bob");
  });

  it("falls back to the least-bad span when the clean week is hard-blocked", () => {
    // Alice's only work-free stretch is 4-13 July, but Bob is travelling
    // exactly then — so the result must carry Alice's work conflicts.
    const alice = workerExcept(
      "Alice",
      "2026-07-06T00:00:00.000Z",
      "2026-07-13T00:00:00.000Z",
    );
    const bob = makeCategorised("Bob", [
      ["2026-07-04T00:00:00.000Z", "2026-07-13T00:00:00.000Z", "Ferie", "travel"],
    ]);

    const { slot, conflicts } = findBestDaySpan([alice, bob], 7, START, END, TZ);

    expect(slot).not.toBeNull();
    expect(slot?.start).not.toBe("2026-07-04T00:00:00.000Z");
    expect(conflicts.some((c) => c.profileId === "alice")).toBe(true);
  });

  it("breaks score ties by picking the earliest span", () => {
    const { slot } = findBestDaySpan(
      [makeParticipant("Alice", [])],
      3,
      START,
      END,
      TZ,
    );

    expect(slot?.start).toBe(START);
  });
});

describe("findVacationSuggestions", () => {
  // Mon 22 June to Mon 20 July 2026.
  const START = "2026-06-22T00:00:00.000Z";
  const END = "2026-07-20T00:00:00.000Z";

  /** Works 09-17 every weekday in the window. */
  function fullTimeWorker(name: string): Participant {
    const busy: Participant["busy"] = [];
    for (let t = Date.parse(START); t < Date.parse(END); t += 86_400_000) {
      const dow = new Date(t).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      busy.push({
        start: new Date(t + 9 * 3_600_000).toISOString(),
        end: new Date(t + 17 * 3_600_000).toISOString(),
        title: "Arbejde",
        category: "work",
      });
    }
    return { profileId: name.toLowerCase(), name, busy };
  }

  it("suggests the longest shorter stay that works for everyone", () => {
    // Alice works every weekday. 4 days can't happen without time off, but 3
    // days over a weekend can: leave after work Friday, home before Monday.
    const out = findVacationSuggestions([fullTimeWorker("Alice")], 4, START, END, TZ);

    expect(out).toHaveLength(1);
    expect(out[0].days).toBe(3);
    expect(out[0].conflicts).toEqual([]);
    expect(out[0].slot.start).toBe("2026-06-26T00:00:00.000Z"); // a Friday
    expect(out[0].leaveAfterWork).toBe(true);
    expect(out[0].homeBeforeWork).toBe(true);
  });

  it("falls back to the least-bad shorter option when nothing is clean", () => {
    // 7 days requested; 5 and 6 days also hit weekdays, so the best it can
    // offer is one day shorter with the remaining conflicts spelled out.
    const out = findVacationSuggestions([fullTimeWorker("Alice")], 7, START, END, TZ);

    expect(out).toHaveLength(1);
    expect(out[0].days).toBe(6);
    expect(out[0].conflicts.length).toBeGreaterThan(0);
  });

  it("suggests nothing for very short requests with no room to trim", () => {
    const out = findVacationSuggestions([fullTimeWorker("Alice")], 2, START, END, TZ);

    expect(out).toEqual([]);
  });
});

describe("findWeeklySpan", () => {
  // Mon 22 June to Mon 13 July 2026. Fridays inside: 26 June, 3 & 10 July.
  const START = "2026-06-22T00:00:00.000Z";
  const END = "2026-07-13T00:00:00.000Z";
  // A classic weekend trip: Friday after work to Sunday evening.
  const WEEKEND = { anchorDow: 5, spanDays: 3, startHour: 17, endHour: 21 };

  it("finds the first weekend when everyone is free", () => {
    const { slot, conflicts } = findWeeklySpan(
      [makeParticipant("Alice", []), makeParticipant("Bob", [])],
      WEEKEND,
      START,
      END,
      TZ,
    );

    expect(slot).toEqual({
      start: "2026-06-26T17:00:00.000Z",
      end: "2026-06-28T21:00:00.000Z",
    });
    expect(conflicts).toEqual([]);
  });

  it("does not flag a normal Friday workday: the trip starts after work", () => {
    const alice = makeCategorised("Alice", [
      ["2026-06-26T09:00:00.000Z", "2026-06-26T17:00:00.000Z", "Arbejde", "work"],
    ]);

    const { slot, conflicts } = findWeeklySpan([alice], WEEKEND, START, END, TZ);

    expect(slot?.start).toBe("2026-06-26T17:00:00.000Z");
    expect(conflicts).toEqual([]);
  });

  it("flags Friday overtime as a conflict to review, not a blocker", () => {
    const alice = makeCategorised("Alice", [
      ["2026-06-26T17:00:00.000Z", "2026-06-26T20:00:00.000Z", "Overarbejde", "work"],
    ]);

    const { slot, conflicts } = findWeeklySpan([alice], WEEKEND, START, END, TZ);

    expect(slot?.start).toBe("2026-06-26T17:00:00.000Z");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].events[0].title).toBe("Overarbejde");
  });

  it("skips a weekend someone is away and takes the next one", () => {
    // Alice is on holiday over the first weekend (26-28 June), so the first
    // workable trip is the following Friday, 3 July.
    const alice = makeCategorised("Alice", [
      ["2026-06-26T00:00:00.000Z", "2026-06-29T00:00:00.000Z", "Ferie", "travel"],
    ]);

    const { slot } = findWeeklySpan([alice], WEEKEND, START, END, TZ);

    expect(slot?.start).toBe("2026-07-03T17:00:00.000Z");
  });

  it("returns null when no full weekend fits inside the window", () => {
    // The window closes Thursday 25 June: the first Friday span would end
    // Sunday the 28th, past the end.
    const result = findWeeklySpan(
      [makeParticipant("Alice", [])],
      WEEKEND,
      START,
      "2026-06-25T00:00:00.000Z",
      TZ,
    );

    expect(result.slot).toBeNull();
    expect(result.conflicts).toEqual([]);
  });

  it("supports extended runs, e.g. Thursday to Sunday", () => {
    const { slot } = findWeeklySpan(
      [makeParticipant("Alice", [])],
      { anchorDow: 4, spanDays: 4, startHour: 17, endHour: 21 },
      START,
      END,
      TZ,
    );

    expect(slot).toEqual({
      start: "2026-06-25T17:00:00.000Z",
      end: "2026-06-28T21:00:00.000Z",
    });
  });
});

/**
 * The same searches in a real zone. Copenhagen is UTC+2 in summer and UTC+1
 * in winter; 2026's clock changes are Sunday 29 March (a 23-hour day) and
 * Sunday 25 October (25 hours). Expected values are UTC instants, with the
 * Copenhagen clock time in the comments.
 */
describe("searching in Copenhagen time", () => {
  const CPH = "Europe/Copenhagen";

  it("puts an 18:00 meeting at 18:00 Danish time, not 18:00 UTC", () => {
    const { slot } = findEarliestSlot(
      makeEvent({
        timeZone: CPH,
        searchStart: "2026-06-21T22:00:00.000Z", // Mon 22 Jun 00:00
        participants: [makeParticipant("Alice", [])],
        constraints: { earliestHour: 18, latestHour: 19 },
      }),
    );
    expect(slot).toEqual({
      start: "2026-06-22T16:00:00.000Z", // 18:00
      end: "2026-06-22T17:00:00.000Z",
    });
  });

  it("is blocked by what is busy at 18:00 locally", () => {
    const { slot } = findEarliestSlot(
      makeEvent({
        timeZone: CPH,
        searchStart: "2026-06-21T22:00:00.000Z",
        participants: [
          // Busy 18:00-19:00 Monday in Copenhagen, which is 16:00 UTC.
          makeParticipant("Alice", [["2026-06-22T16:00:00.000Z", "2026-06-22T17:00:00.000Z"]]),
        ],
        constraints: { earliestHour: 18, latestHour: 19 },
      }),
    );
    expect(slot?.start).toBe("2026-06-23T16:00:00.000Z"); // Tuesday 18:00
  });

  it("uses the local weekday for allowed days", () => {
    // Saturday 00:00-01:00 in Copenhagen is still Friday in UTC.
    const { slot } = findEarliestSlot(
      makeEvent({
        timeZone: CPH,
        searchStart: "2026-06-21T22:00:00.000Z",
        participants: [makeParticipant("Alice", [])],
        constraints: { earliestHour: 0, latestHour: 1, allowedDays: [6] },
      }),
    );
    expect(slot?.start).toBe("2026-06-26T22:00:00.000Z"); // Sat 27 Jun 00:00
  });

  it("keeps day spans on local midnights across the spring clock change", () => {
    const { slot } = findEarliestDaySpan(
      [makeParticipant("Alice", [])],
      3,
      "2026-03-27T23:00:00.000Z", // Sat 28 Mar 00:00 (CET)
      "2026-04-10T22:00:00.000Z",
      CPH,
    );
    expect(slot).toEqual({
      start: "2026-03-27T23:00:00.000Z", // Sat 28 Mar 00:00 CET
      end: "2026-03-30T22:00:00.000Z", // Tue 31 Mar 00:00 CEST: 71 hours later
    });
  });

  it("sees an all-day absence on the 25-hour autumn Sunday as that one day", () => {
    const alice = makeParticipant("Alice", [
      // Away all of Sunday 25 October, local midnight to local midnight.
      ["2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"],
    ]);
    const { slot } = findEarliestDaySpan(
      [alice],
      1,
      "2026-10-23T22:00:00.000Z", // Sat 24 Oct 00:00
      "2026-11-01T23:00:00.000Z",
      CPH,
    );
    // Saturday is free; with a 3-day span Sunday blocks and Monday is next.
    expect(slot?.start).toBe("2026-10-23T22:00:00.000Z");
    const three = findEarliestDaySpan(
      [alice],
      3,
      "2026-10-23T22:00:00.000Z",
      "2026-11-01T23:00:00.000Z",
      CPH,
    );
    expect(three.slot?.start).toBe("2026-10-25T23:00:00.000Z"); // Mon 26 Oct 00:00 CET
  });

  it("finds a Friday-after-work weekend in local time", () => {
    const { slot } = findWeeklySpan(
      [makeParticipant("Alice", [])],
      { anchorDow: 5, spanDays: 3, startHour: 17, endHour: 21 },
      "2026-06-21T22:00:00.000Z",
      "2026-07-21T22:00:00.000Z",
      CPH,
    );
    expect(slot).toEqual({
      start: "2026-06-26T15:00:00.000Z", // Fri 17:00
      end: "2026-06-28T19:00:00.000Z", // Sun 21:00
    });
  });

  it("applies the leave-after-work rule at 17:00 local", () => {
    // Work 09:00-17:00 Copenhagen time on Friday 26 June: over by the
    // evening departure, so a Friday-to-Sunday vacation has no conflicts.
    const alice: Participant = {
      profileId: "alice",
      name: "Alice",
      busy: [
        {
          start: "2026-06-26T07:00:00.000Z",
          end: "2026-06-26T15:00:00.000Z",
          category: "work",
        },
      ],
    };
    const { slot, conflicts } = findBestDaySpan(
      [alice],
      3,
      "2026-06-25T22:00:00.000Z", // Fri 26 Jun 00:00
      "2026-06-28T22:00:00.000Z", // exactly three days
      CPH,
    );
    expect(slot?.start).toBe("2026-06-25T22:00:00.000Z");
    expect(conflicts).toEqual([]);
  });
});
