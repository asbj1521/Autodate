import { describe, it, expect } from "vitest";
import { danishHolidays, easterSunday } from "@/lib/danishHolidays";

/**
 * Expected dates come from the published Easter dates and the Danish
 * holiday rules (offsets from Easter Sunday), not from the code under test.
 */

const keys = (year: number) => danishHolidays(year).map((h) => h.key);
const on = (year: number, name: string) => danishHolidays(year).find((h) => h.name === name)?.key;

describe("easterSunday", () => {
  it.each([
    [2019, "2019-04-21"],
    [2023, "2023-04-09"],
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2028, "2028-04-16"],
    [2029, "2029-04-01"],
    [2030, "2030-04-21"],
  ])("Easter %i is %s", (year, expected) => {
    const d = easterSunday(year);
    expect(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`).toBe(expected);
  });
});

describe("danishHolidays", () => {
  it("gives the 2026 dates: Easter is 5 April", () => {
    expect(on(2026, "Skærtorsdag")).toBe("2026-04-02");
    expect(on(2026, "Langfredag")).toBe("2026-04-03");
    expect(on(2026, "Påskedag")).toBe("2026-04-05");
    expect(on(2026, "2. påskedag")).toBe("2026-04-06");
    expect(on(2026, "Kristi Himmelfartsdag")).toBe("2026-05-14");
    expect(on(2026, "Pinsedag")).toBe("2026-05-24");
    expect(on(2026, "2. pinsedag")).toBe("2026-05-25");
  });

  it("includes the fixed-date holidays", () => {
    expect(on(2026, "Nytårsdag")).toBe("2026-01-01");
    expect(on(2026, "Juledag")).toBe("2026-12-25");
    expect(on(2026, "2. juledag")).toBe("2026-12-26");
  });

  it("handles a March Easter and month rollover (2027: Easter 28 March, Ascension 6 May)", () => {
    expect(on(2027, "Skærtorsdag")).toBe("2027-03-25");
    expect(on(2027, "Kristi Himmelfartsdag")).toBe("2027-05-06");
    expect(on(2027, "2. pinsedag")).toBe("2027-05-17");
  });

  it("had Store bededag up to 2023 (fourth Friday after Easter) and not from 2024", () => {
    expect(on(2023, "Store bededag")).toBe("2023-05-05");
    expect(on(2019, "Store bededag")).toBe("2019-05-17");
    expect(on(2024, "Store bededag")).toBeUndefined();
    expect(on(2026, "Store bededag")).toBeUndefined();
  });

  it("has 10 public holidays a year from 2024, plus 3 commonly observed days", () => {
    for (const year of [2024, 2026, 2030]) {
      const list = danishHolidays(year);
      expect(list.filter((h) => h.kind === "public")).toHaveLength(10);
      expect(list.filter((h) => h.kind === "observed").map((h) => h.name)).toEqual([
        "Grundlovsdag",
        "Juleaften",
        "Nytårsaften",
      ]);
    }
  });

  it("marks the observed days as observed and the official ones as public", () => {
    const list = danishHolidays(2026);
    expect(list.find((h) => h.name === "Juleaften")?.kind).toBe("observed");
    expect(list.find((h) => h.name === "Juledag")?.kind).toBe("public");
  });

  it("returns days sorted by date, all inside the year, with local-midnight dates and English names", () => {
    const list = danishHolidays(2026);
    expect(keys(2026)).toEqual([...keys(2026)].sort());
    for (const h of list) {
      expect(h.date.getFullYear()).toBe(2026);
      expect(h.date.getHours()).toBe(0);
      expect(h.englishName.length).toBeGreaterThan(0);
    }
    expect(new Set(keys(2026)).size).toBe(list.length); // no two on the same day
  });
});
