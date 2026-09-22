import { describe, expect, it } from "vitest";

import type { CalendarConnectionStatus } from "@/api/calendarStatus";
import { da } from "@/i18n/da";
import { en } from "@/i18n/en";
import { calendarNames, hasDistinctCalendarNames, syncedAgo } from "@/lib/accountSummary";

const account = (
  label: string | null,
  names: (string | null)[],
): CalendarConnectionStatus => ({
  id: "conn",
  provider: "google",
  status: "connected",
  account_label: label,
  error_message: null,
  created_at: "2026-09-19T12:00:00Z",
  last_synced_at: null,
  last_sync_attempt_at: null,
  sync_error: null,
  needs_reconnect: false,
  calendar_sources: names.map((n, i) => ({ id: `src-${i}`, display_name: n, purpose: null })),
  busyCount: 0,
});

describe("calendarNames", () => {
  it("falls back to the id when a calendar has no name", () => {
    expect(calendarNames(account("a@b.c", ["Work", null]))).toEqual(["Work", "src-1"]);
  });
});

describe("hasDistinctCalendarNames", () => {
  it("is false when the only calendar is named after the account (a Google account)", () => {
    expect(hasDistinctCalendarNames(account("me@gmail.com", ["me@gmail.com"]))).toBe(false);
  });

  it("ignores case and stray spaces when comparing", () => {
    expect(hasDistinctCalendarNames(account("Me@Gmail.com", [" me@gmail.com "]))).toBe(false);
  });

  it("is false for a link whose single calendar is named after the link", () => {
    expect(hasDistinctCalendarNames(account("CBS timetable", ["CBS timetable"]))).toBe(false);
  });

  it("is true when calendars have their own names (an Apple account)", () => {
    expect(hasDistinctCalendarNames(account("me@icloud.com", ["Work", "Family", "CBS"]))).toBe(true);
  });

  it("is true if just one of several names is different", () => {
    expect(hasDistinctCalendarNames(account("me@gmail.com", ["me@gmail.com", "Birthdays"]))).toBe(true);
  });

  it("is true for a nameless calendar, since its id is not the account label", () => {
    expect(hasDistinctCalendarNames(account("me@gmail.com", [null]))).toBe(true);
  });

  it("is false when there are no calendars at all", () => {
    expect(hasDistinctCalendarNames(account("me@gmail.com", []))).toBe(false);
  });
});

describe("syncedAgo", () => {
  const now = Date.parse("2026-09-20T12:00:00.000Z");
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it("says nothing for an account that never synced", () => {
    expect(syncedAgo(null, now, en.synced)).toBeNull();
  });

  it("counts minutes, then hours, then days", () => {
    expect(syncedAgo(ago(0), now, en.synced)).toBe("Synced just now");
    expect(syncedAgo(ago(12), now, en.synced)).toBe("Synced 12 min ago");
    expect(syncedAgo(ago(59), now, en.synced)).toBe("Synced 59 min ago");
    expect(syncedAgo(ago(60), now, en.synced)).toBe("Synced 1 h ago");
    expect(syncedAgo(ago(23 * 60 + 59), now, en.synced)).toBe("Synced 23 h ago");
    expect(syncedAgo(ago(24 * 60), now, en.synced)).toBe("Synced 1 day ago");
    expect(syncedAgo(ago(3 * 24 * 60), now, en.synced)).toBe("Synced 3 days ago");
  });

  it("treats a clock slightly ahead of ours as just now", () => {
    expect(syncedAgo(ago(-2), now, en.synced)).toBe("Synced just now");
  });

  it("speaks Danish too", () => {
    expect(syncedAgo(ago(0), now, da.synced)).toBe("Synkroniseret lige nu");
    expect(syncedAgo(ago(12), now, da.synced)).toBe("Synkroniseret for 12 min siden");
    expect(syncedAgo(ago(49 * 60), now, da.synced)).toBe("Synkroniseret for 2 dage siden");
  });
});
