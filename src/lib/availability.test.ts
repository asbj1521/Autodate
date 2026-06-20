import { describe, it, expect } from "vitest";
import { findEarliestSlot } from "@/lib/availability";
import type { Event, Participant } from "@/types";

/**
 * Tests for the availability engine.
 *
 * These use fixed UTC instants so the expected results are unambiguous and don't
 * depend on the machine's timezone. A helper builds an Event with sensible
 * defaults so each test only states what it actually cares about.
 */

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
