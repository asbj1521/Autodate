import { describe, it, expect } from "vitest";
import type { OverviewData } from "@/lib/calendarOverview";
import { busyFromCalendars, withRealCalendar } from "@/lib/realCalendar";
import { isHardBlock, isSoftBlock } from "@/lib/availability";
import type { FriendGroup } from "@/types";

const calendar = (id: string, name: string, purpose: OverviewData["calendars"][0]["purpose"]) => ({
  id,
  name,
  purpose,
  provider: "google" as const,
  account: "me@example.com",
  connectionId: "conn-1",
});

const DATA: OverviewData = {
  calendars: [
    calendar("work", "Work", "work"),
    calendar("uni", "CBS timetable", "school"),
    calendar("home", "Family", "personal"),
    calendar("misc", "Shared", null),
  ],
  blocks: [
    { calendarId: "work", start: "2026-06-22T07:00:00.000Z", end: "2026-06-22T15:00:00.000Z" },
    { calendarId: "uni", start: "2026-06-23T08:00:00.000Z", end: "2026-06-23T10:00:00.000Z" },
    { calendarId: "home", start: "2026-06-24T22:00:00.000Z", end: "2026-06-25T22:00:00.000Z" },
    { calendarId: "misc", start: "2026-06-26T16:00:00.000Z", end: "2026-06-26T18:00:00.000Z" },
    { calendarId: "gone", start: "2026-06-27T16:00:00.000Z", end: "2026-06-27T18:00:00.000Z" },
  ],
  truncated: false,
};

describe("busyFromCalendars", () => {
  const busy = busyFromCalendars(DATA);

  it("carries work and school over as time you could take off", () => {
    expect(busy[0]).toMatchObject({ category: "work", title: "Work" });
    expect(busy[1]).toMatchObject({ category: "school", title: "CBS timetable" });
    expect(isSoftBlock(busy[0])).toBe(true);
    expect(isSoftBlock(busy[1])).toBe(true);
  });

  it("leaves other calendars uncategorised, so they simply count as busy", () => {
    expect(busy[2].category).toBeUndefined();
    expect(busy[3].category).toBeUndefined();
    // A whole personal day is a hard block for a trip; a two-hour one isn't.
    expect(isHardBlock(busy[2])).toBe(true);
    expect(isHardBlock(busy[3])).toBe(false);
  });

  it("drops blocks from a calendar that isn't listed", () => {
    expect(busy).toHaveLength(4);
    expect(busy.some((b) => b.calendarId === "gone")).toBe(false);
  });
});

describe("withRealCalendar", () => {
  const groups: FriendGroup[] = [
    {
      id: "a",
      name: "With me",
      participants: [
        { profileId: "me", name: "Demo me", busy: [{ start: "x", end: "y" }] },
        { profileId: "friend", name: "Friend", busy: [] },
      ],
    },
    { id: "b", name: "Without me", participants: [{ profileId: "friend", name: "Friend", busy: [] }] },
  ];
  const real = [{ start: "2026-06-22T07:00:00.000Z", end: "2026-06-22T15:00:00.000Z" }];

  it("replaces only that person's calendar and name", () => {
    const out = withRealCalendar(groups, "me", "Real Me", real);
    expect(out[0].participants[0]).toEqual({ profileId: "me", name: "Real Me", busy: real });
    expect(out[0].participants[1]).toBe(groups[0].participants[1]);
  });

  it("leaves groups they aren't in untouched, and never mutates the input", () => {
    const out = withRealCalendar(groups, "me", "Real Me", real);
    expect(out[1]).toBe(groups[1]);
    expect(groups[0].participants[0].name).toBe("Demo me");
  });

  it("keeps the generated name when no real one is known", () => {
    expect(withRealCalendar(groups, "me", "", real)[0].participants[0].name).toBe("Demo me");
  });
});
