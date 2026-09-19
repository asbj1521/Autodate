import { describe, expect, it } from "vitest";

import { inviteExpiryLabel } from "@/lib/groups";

describe("inviteExpiryLabel", () => {
  const now = Date.parse("2026-09-20T12:00:00.000Z");
  const inMs = (ms: number) => new Date(now + ms).toISOString();

  it("counts whole days while there are any", () => {
    expect(inviteExpiryLabel(inMs(7 * 86_400_000), now)).toBe("7 days");
    expect(inviteExpiryLabel(inMs(86_400_000 + 1000), now)).toBe("1 day");
  });

  it("falls back to hours on the last day", () => {
    expect(inviteExpiryLabel(inMs(5 * 3_600_000), now)).toBe("5 hours");
    expect(inviteExpiryLabel(inMs(3_600_000), now)).toBe("1 hour");
  });

  it("stops counting in the final hour", () => {
    expect(inviteExpiryLabel(inMs(59 * 60_000), now)).toBe("under an hour");
  });

  it("says so once the link is dead", () => {
    expect(inviteExpiryLabel(inMs(0), now)).toBe("expired");
    expect(inviteExpiryLabel(inMs(-1000), now)).toBe("expired");
    expect(inviteExpiryLabel("not a date", now)).toBe("expired");
  });
});
