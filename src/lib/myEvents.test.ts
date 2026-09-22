import { describe, expect, it } from "vitest";

import type { SuggestedEvent } from "@/api/events";
import { nameList, sectionEvents, waitingOn } from "@/lib/myEvents";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");

function event(overrides: Partial<SuggestedEvent> & { id: string }): SuggestedEvent {
  return {
    group: { id: "g1", name: "Assebasser" },
    title: "Evening",
    settings: { kind: "single", durationMinutes: 180, startHour: 18 },
    status: "pending",
    createdBy: { id: "emilie", name: "Emilie", isYou: false },
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    currentDate: { id: "d1", start: "2026-09-25T16:00:00.000Z", end: "2026-09-25T19:00:00.000Z" },
    invitees: [
      { profileId: "me", name: "Asbjørn", isYou: true, response: null },
      { profileId: "emilie", name: "Emilie", isYou: false, response: "accepted" },
    ],
    declinedDates: [],
    ...overrides,
  };
}

describe("sectionEvents", () => {
  it("puts an event you haven't answered under needs-your-answer", () => {
    const s = sectionEvents([event({ id: "a" })], NOW);
    expect(s.needsAnswer.map((e) => e.id)).toEqual(["a"]);
    expect(s.waiting).toEqual([]);
  });

  it("puts one you accepted, still waiting on others, under waiting", () => {
    const e = event({
      id: "a",
      invitees: [
        { profileId: "me", name: "Asbjørn", isYou: true, response: "accepted" },
        { profileId: "tessa", name: "Tessa", isYou: false, response: null },
      ],
    });
    const s = sectionEvents([e], NOW);
    expect(s.waiting.map((x) => x.id)).toEqual(["a"]);
    expect(waitingOn(e)).toEqual(["Tessa"]);
  });

  it("files scheduled events by date, and moves past or closed ones aside", () => {
    const soon = event({
      id: "soon",
      status: "scheduled",
      currentDate: { id: "d2", start: "2026-09-24T16:00:00.000Z", end: "2026-09-24T19:00:00.000Z" },
    });
    const later = event({ id: "later", status: "scheduled" });
    const past = event({
      id: "past",
      status: "scheduled",
      currentDate: { id: "d3", start: "2026-09-20T16:00:00.000Z", end: "2026-09-20T19:00:00.000Z" },
    });
    const cancelled = event({ id: "cancelled", status: "cancelled" });
    const noDate = event({ id: "nodate", status: "no_date", currentDate: null });

    const s = sectionEvents([later, past, cancelled, soon, noDate], NOW);
    expect(s.scheduled.map((e) => e.id)).toEqual(["soon", "later"]);
    expect(s.closed.map((e) => e.id).sort()).toEqual(["nodate", "past"]);
  });

  it("drops a cancelled event entirely rather than filing it under closed", () => {
    const s = sectionEvents([event({ id: "gone", status: "cancelled" })], NOW);
    expect(s.needsAnswer).toEqual([]);
    expect(s.waiting).toEqual([]);
    expect(s.scheduled).toEqual([]);
    expect(s.closed).toEqual([]);
  });

  it("treats a pending event whose date has passed as closed", () => {
    const stale = event({
      id: "stale",
      currentDate: { id: "d4", start: "2026-09-21T16:00:00.000Z", end: "2026-09-21T19:00:00.000Z" },
    });
    expect(sectionEvents([stale], NOW).closed.map((e) => e.id)).toEqual(["stale"]);
  });
});

describe("nameList", () => {
  it("reads naturally for one, two and many", () => {
    expect(nameList(["Emilie"])).toBe("Emilie");
    expect(nameList(["Emilie", "Tessa"])).toBe("Emilie and Tessa");
    expect(nameList(["Emilie", "Tessa", "Simon", "Nora"])).toBe("Emilie, Tessa and 2 more");
  });
});
