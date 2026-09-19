import { describe, expect, it } from "vitest";

import { CURRENT_USER_ID } from "@/api/currentUser";
import { EXAMPLE_GROUPS, exampleGroup } from "@/api/mockData";

describe("example groups", () => {
  it("offers ten of them, each with a distinct id and name", () => {
    expect(EXAMPLE_GROUPS).toHaveLength(10);
    expect(new Set(EXAMPLE_GROUPS.map((g) => g.id)).size).toBe(10);
    expect(new Set(EXAMPLE_GROUPS.map((g) => g.name)).size).toBe(10);
  });

  it("keeps a slot for the signed-in person in every one", () => {
    // Without it, an example would be entirely invented and would say nothing
    // about the viewer's own week.
    for (const g of EXAMPLE_GROUPS) {
      expect(g.members).toContain(CURRENT_USER_ID);
    }
  });

  it("gives each group a plausible size, with nobody listed twice", () => {
    for (const g of EXAMPLE_GROUPS) {
      expect(g.members.length).toBeGreaterThanOrEqual(4);
      expect(g.members.length).toBeLessThanOrEqual(12);
      expect(new Set(g.members).size).toBe(g.members.length);
    }
    expect(EXAMPLE_GROUPS.find((g) => g.id === "basketball")!.members).toHaveLength(10);
  });

  it("builds a group's people and calendars on demand", () => {
    const group = exampleGroup("bookclub")!;
    expect(group.name).toBe("Book club");
    expect(group.participants).toHaveLength(6);
    for (const p of group.participants) {
      expect(p.name).toBeTruthy();
      expect(p.busy.length).toBeGreaterThan(0);
    }
  });

  it("hands back the very same group next time, so a repeat costs nothing", () => {
    expect(exampleGroup("band")).toBe(exampleGroup("band"));
  });

  it("gives one person the same calendar in every group they appear in", () => {
    const you = (id: string) =>
      exampleGroup(id)!.participants.find((p) => p.profileId === CURRENT_USER_ID)!;
    expect(you("family").busy).toBe(you("running").busy);
  });

  it("returns nothing for a group that does not exist", () => {
    expect(exampleGroup("no-such-group")).toBeNull();
  });
});
