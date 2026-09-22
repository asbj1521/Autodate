import { describe, expect, it } from "vitest";

import { findEventSlot, isEventSettings } from "@/lib/eventSearch";
import type { Participant } from "@/types";

const TZ = "UTC";
// Mon 22 June to Mon 13 July 2026.
const START = "2026-06-22T00:00:00.000Z";
const END = "2026-07-13T00:00:00.000Z";

function person(name: string, busy: Array<[string, string, string?]>): Participant {
  return {
    profileId: name.toLowerCase(),
    name,
    busy: busy.map(([start, end, category]) => ({
      start,
      end,
      ...(category ? { category: category as "work" } : {}),
    })),
  };
}

describe("findEventSlot", () => {
  it("finds a single meeting at the chosen hour on an allowed day", () => {
    const { slot, conflicts } = findEventSlot(
      [person("Alice", [["2026-06-22T18:00:00.000Z", "2026-06-22T21:00:00.000Z"]])],
      { kind: "single", durationMinutes: 180, startHour: 18 },
      START,
      END,
      TZ,
    );
    // Monday evening is taken, so Tuesday 18:00-21:00.
    expect(slot).toEqual({ start: "2026-06-23T18:00:00.000Z", end: "2026-06-23T21:00:00.000Z" });
    expect(conflicts).toEqual([]);
  });

  it("only searches the allowed days of week", () => {
    const { slot } = findEventSlot(
      [person("Alice", [])],
      { kind: "single", durationMinutes: 60, startHour: 12, allowedDays: [6] },
      START,
      END,
      TZ,
    );
    expect(slot?.start).toBe("2026-06-27T12:00:00.000Z"); // the first Saturday
  });

  it("searching again from the day after a declined date gives the next one", () => {
    const settings = { kind: "single" as const, durationMinutes: 60, startHour: 18 };
    const first = findEventSlot([person("Alice", [])], settings, START, END, TZ);
    const next = findEventSlot(
      [person("Alice", [])],
      settings,
      "2026-06-23T00:00:00.000Z",
      END,
      TZ,
    );
    expect(first.slot?.start).toBe("2026-06-22T18:00:00.000Z");
    expect(next.slot?.start).toBe("2026-06-23T18:00:00.000Z");
  });

  it("runs trips through the weekly search and vacations through the day-span search", () => {
    const trip = findEventSlot(
      [person("Alice", [])],
      { kind: "trip", shape: { anchorDow: 5, spanDays: 3, startHour: 17, endHour: 21 } },
      START,
      END,
      TZ,
    );
    expect(trip.slot?.start).toBe("2026-06-26T17:00:00.000Z");

    const vacation = findEventSlot([person("Alice", [])], { kind: "vacation", days: 3 }, START, END, TZ);
    expect(vacation.slot).toEqual({
      start: "2026-06-22T00:00:00.000Z",
      end: "2026-06-25T00:00:00.000Z",
    });
  });
});

describe("isEventSettings", () => {
  it("accepts each kind in its proper shape", () => {
    expect(isEventSettings({ kind: "single", durationMinutes: 90, startHour: 12 })).toBe(true);
    expect(
      isEventSettings({ kind: "single", durationMinutes: 90, startHour: 12, allowedDays: [5, 6] }),
    ).toBe(true);
    expect(
      isEventSettings({ kind: "trip", shape: { anchorDow: 5, spanDays: 3, startHour: 17, endHour: 21 } }),
    ).toBe(true);
    expect(isEventSettings({ kind: "vacation", days: 7 })).toBe(true);
  });

  it("rejects anything malformed", () => {
    expect(isEventSettings(null)).toBe(false);
    expect(isEventSettings({ kind: "party" })).toBe(false);
    expect(isEventSettings({ kind: "single", durationMinutes: 90 })).toBe(false);
    expect(isEventSettings({ kind: "single", durationMinutes: 90, startHour: 25 })).toBe(false);
    expect(isEventSettings({ kind: "single", durationMinutes: 90, startHour: 12, allowedDays: [9] })).toBe(false);
    expect(isEventSettings({ kind: "trip", shape: { anchorDow: 5 } })).toBe(false);
    expect(isEventSettings({ kind: "vacation", days: 0 })).toBe(false);
  });
});
