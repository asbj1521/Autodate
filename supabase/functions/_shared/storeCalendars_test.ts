// Run with: deno test --node-modules-dir=none supabase/functions/_shared/
//
// Named `_test.ts` (Deno's convention) rather than `.test.ts` so the frontend's
// Vitest run, which globs `*.test.ts`, doesn't try to load Deno-only code.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { StoreError, storeCalendars } from "./storeCalendars.ts";

interface Call {
  table: string;
  op: "insert" | "update" | "delete";
  payload?: unknown;
}

/**
 * Just enough of the Supabase query builder for storeCalendars: records every
 * write, hands back plausible ids, and can be told to fail one table/op.
 */
function fakeDb(failOn?: string) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "insert" };
      const fails = () => failOn === `${table}:${call.op}`;
      const outcome = () => {
        if (fails()) return { data: null, error: { message: "boom" } };
        if (table === "calendar_sources" && call.op === "insert") {
          const rows = call.payload as { external_calendar_id: string }[];
          return {
            data: rows.map((r, i) => ({ id: `source-${i}`, external_calendar_id: r.external_calendar_id })),
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const chain = {
        insert(payload: unknown) {
          Object.assign(call, { op: "insert", payload });
          calls.push(call);
          return chain;
        },
        update(payload: unknown) {
          Object.assign(call, { op: "update", payload });
          calls.push(call);
          return chain;
        },
        delete() {
          call.op = "delete";
          calls.push(call);
          return chain;
        },
        eq: () => chain,
        select: () => chain,
        single: () =>
          Promise.resolve(fails() ? { data: null, error: { message: "boom" } } : { data: { id: "conn-1" }, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(outcome()).then(resolve),
      };
      return chain;
    },
  };
  return { db: db as unknown as Parameters<typeof storeCalendars>[0], calls };
}

const iv = (n: number) => ({ start: `2026-10-${String(n).padStart(2, "0")}T10:00:00.000Z`, end: `2026-10-${String(n).padStart(2, "0")}T11:00:00.000Z` });

Deno.test("stores several calendars and attaches each one's busy blocks to its own source", async () => {
  const { db, calls } = fakeDb();
  const res = await storeCalendars(db, {
    profileId: "asbjorn",
    provider: "apple",
    accountLabel: "me@icloud.com",
    secrets: { caldav_username: "me@icloud.com", caldav_password: "enc" },
    calendars: [
      { externalId: "cal-a", displayName: "Work", intervals: [iv(1), iv(2)] },
      { externalId: "cal-b", displayName: "Family", intervals: [iv(3)] },
    ],
  });
  assertEquals(res, { connectionId: "conn-1" });

  const busy = calls.find((c) => c.table === "calendar_busy_cache")!.payload as { source_id: string }[];
  assertEquals(busy.map((b) => b.source_id), ["source-0", "source-0", "source-1"]);

  const last = calls[calls.length - 1];
  assertEquals(last.table, "calendar_connections");
  assertEquals(last.op, "update");
  assertEquals((last.payload as { status: string }).status, "connected");
});

Deno.test("inserts busy blocks in chunks of 500", async () => {
  const { db, calls } = fakeDb();
  const many = Array.from({ length: 1200 }, (_, i) => ({
    start: new Date(Date.UTC(2026, 9, 1) + i * 7_200_000).toISOString(),
    end: new Date(Date.UTC(2026, 9, 1) + i * 7_200_000 + 3_600_000).toISOString(),
  }));
  await storeCalendars(db, {
    profileId: "p",
    provider: "ics",
    accountLabel: "x",
    secrets: { ics_url: "https://example.com/a.ics" },
    calendars: [{ externalId: "ics", displayName: "x", intervals: many }],
  });
  const sizes = calls
    .filter((c) => c.table === "calendar_busy_cache")
    .map((c) => (c.payload as unknown[]).length);
  assertEquals(sizes, [500, 500, 200]);
});

Deno.test("a calendar with no busy time is still saved", async () => {
  const { db, calls } = fakeDb();
  await storeCalendars(db, {
    profileId: "p",
    provider: "apple",
    accountLabel: "x",
    secrets: {},
    calendars: [{ externalId: "empty", displayName: "Empty", intervals: [] }],
  });
  assert(calls.some((c) => c.table === "calendar_sources"));
  assert(!calls.some((c) => c.table === "calendar_busy_cache"));
});

Deno.test("a failure while saving deletes the half-made connection", async () => {
  const { db, calls } = fakeDb("calendar_busy_cache:insert");
  await assertRejects(
    () =>
      storeCalendars(db, {
        profileId: "p",
        provider: "apple",
        accountLabel: "x",
        secrets: {},
        calendars: [{ externalId: "a", displayName: "A", intervals: [iv(1)] }],
      }),
    StoreError,
  );
  const last = calls[calls.length - 1];
  assertEquals([last.table, last.op], ["calendar_connections", "delete"]);
  assert(!calls.some((c) => c.op === "update"), "must not be marked connected");
});

Deno.test("if the connection row can't be created, nothing else is attempted", async () => {
  const { db, calls } = fakeDb("calendar_connections:insert");
  await assertRejects(
    () =>
      storeCalendars(db, {
        profileId: "p",
        provider: "ics",
        accountLabel: "x",
        secrets: {},
        calendars: [],
      }),
    StoreError,
  );
  assertEquals(calls.length, 1);
});
