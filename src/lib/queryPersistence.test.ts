import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { clearPersistedQueries, persistQueries } from "@/lib/queryPersistence";

/** A plain in-memory stand-in for the browser's localStorage. */
function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => void items.set(k, String(v)),
    removeItem: (k) => void items.delete(k),
    clear: () => items.clear(),
  };
}

const DAY = 24 * 60 * 60 * 1000;

describe("queryPersistence", () => {
  beforeEach(() => vi.stubGlobal("localStorage", fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("remembers the person's own answers and brings them back on the next load", () => {
    const first = new QueryClient();
    const stop = persistQueries(first);
    first.setQueryData(["groups", "u1"], [{ id: "g1" }]);
    first.setQueryData(["admin-status", "u1"], true);
    stop();

    const next = new QueryClient();
    persistQueries(next);
    expect(next.getQueryData(["groups", "u1"])).toEqual([{ id: "g1" }]);
    expect(next.getQueryData(["admin-status", "u1"])).toBe(true);
  });

  it("never writes other people's busy times or the admin overview to the device", () => {
    const client = new QueryClient();
    persistQueries(client);
    client.setQueryData(["group-busy", "u1", "g1", "a", "b"], { busy: {} });
    client.setQueryData(["admin-overview", "u1"], { users: [] });
    client.setQueryData(["calendar-busy", "u1", "search-window"], { calendars: [] });
    expect(localStorage.length).toBe(0);
  });

  it("keeps the fetch time, so a restored answer is still refetched once stale", () => {
    const first = new QueryClient();
    persistQueries(first);
    first.setQueryData(["calendar-status", "u1"], [], { updatedAt: 1_000 });

    const next = new QueryClient();
    persistQueries(next, 2_000);
    expect(next.getQueryState(["calendar-status", "u1"])?.dataUpdatedAt).toBe(1_000);
  });

  it("drops answers older than a week instead of showing them", () => {
    const now = 100 * DAY;
    const first = new QueryClient();
    persistQueries(first);
    first.setQueryData(["groups", "u1"], [], { updatedAt: now - 8 * DAY });

    const next = new QueryClient();
    persistQueries(next, now);
    expect(next.getQueryData(["groups", "u1"])).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it("forgets everything on sign-out, and leaves other sites' keys alone", () => {
    localStorage.setItem("sb-auth-token", "kept");
    const client = new QueryClient();
    persistQueries(client);
    client.setQueryData(["groups", "u1"], []);
    clearPersistedQueries();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem("sb-auth-token")).toBe("kept");
  });

  it("throws away an entry it can't read rather than failing the page", () => {
    localStorage.setItem('casy:query:["groups","u1"]', "{not json");
    expect(() => persistQueries(new QueryClient())).not.toThrow();
    expect(localStorage.length).toBe(0);
  });
});
