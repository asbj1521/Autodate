// Run with: deno test --node-modules-dir=none supabase/functions/_shared/
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  discardIfRepeatedCallback,
  DUPLICATE_CALLBACK_WINDOW_MS,
  isCodeReuseFailure,
  isRepeatedCallback,
} from "./connections.ts";

const GOOGLE_FAILURE = new Error(
  'Google token exchange failed: 400 {\n  "error": "invalid_grant",\n  "error_description": "Bad Request"\n}',
);
const MICROSOFT_FAILURE = new Error(
  'Microsoft token exchange failed: 400 {"error":"invalid_grant","error_description":"AADSTS70008: The provided authorization code has expired or already been redeemed."}',
);
const T0 = "2026-09-19T18:01:28.000Z";
const secondsFrom = (iso: string, s: number) => new Date(Date.parse(iso) + s * 1000).toISOString();

Deno.test("only a refused authorization code counts as code reuse", () => {
  assert(isCodeReuseFailure(GOOGLE_FAILURE));
  assert(isCodeReuseFailure(MICROSOFT_FAILURE));
  assert(!isCodeReuseFailure(new Error("Google token exchange failed: 400 invalid_client")));
  assert(!isCodeReuseFailure(new Error("Failed to fetch calendars: invalid_grant")));
  assert(!isCodeReuseFailure(new Error("network down")));
});

Deno.test("a code-reuse failure next to another attempt is a duplicate, in either order", () => {
  for (const other of [secondsFrom(T0, -1), secondsFrom(T0, 1), T0]) {
    assert(isRepeatedCallback({ failure: GOOGLE_FAILURE, attemptedAt: T0, otherAttemptTimes: [other] }));
  }
  assert(isRepeatedCallback({ failure: MICROSOFT_FAILURE, attemptedAt: T0, otherAttemptTimes: [secondsFrom(T0, -2)] }));
});

Deno.test("the window is 30 seconds, inclusive", () => {
  const edge = secondsFrom(T0, -DUPLICATE_CALLBACK_WINDOW_MS / 1000);
  const past = secondsFrom(T0, -(DUPLICATE_CALLBACK_WINDOW_MS / 1000 + 1));
  assert(isRepeatedCallback({ failure: GOOGLE_FAILURE, attemptedAt: T0, otherAttemptTimes: [edge] }));
  assert(!isRepeatedCallback({ failure: GOOGLE_FAILURE, attemptedAt: T0, otherAttemptTimes: [past] }));
});

Deno.test("with no nearby attempt it is a genuine failure", () => {
  assert(!isRepeatedCallback({ failure: GOOGLE_FAILURE, attemptedAt: T0, otherAttemptTimes: [] }));
});

Deno.test("other failures are never treated as duplicates, however close another attempt is", () => {
  assert(
    !isRepeatedCallback({ failure: new Error("Google did not return a refresh_token"), attemptedAt: T0, otherAttemptTimes: [T0] }),
  );
});

/* ---- The database-facing wrapper, against a fake client ---- */

function fakeDb(opts: { others?: { created_at: string }[]; selectError?: boolean; deleteError?: boolean }) {
  const calls: { op: string; filters: [string, unknown][] }[] = [];
  const db = {
    from() {
      const call = { op: "select", filters: [] as [string, unknown][] };
      const chain = {
        select() {
          call.op = "select";
          calls.push(call);
          return chain;
        },
        delete() {
          call.op = "delete";
          calls.push(call);
          return chain;
        },
        eq(col: string, v: unknown) {
          call.filters.push([col, v]);
          return chain;
        },
        neq(col: string, v: unknown) {
          call.filters.push([`!${col}`, v]);
          return chain;
        },
        in(col: string, v: unknown) {
          call.filters.push([col, v]);
          return chain;
        },
        gte: () => chain,
        lte: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            call.op === "delete"
              ? { data: null, error: opts.deleteError ? { message: "boom" } : null }
              : opts.selectError
                ? { data: null, error: { message: "boom" } }
                : { data: opts.others ?? [], error: null },
          ).then(resolve),
      };
      return chain;
    },
  };
  return { db: db as unknown as Parameters<typeof discardIfRepeatedCallback>[0], calls };
}

const attempt = { connection: { id: "dup-1", created_at: T0 }, profileId: "asbjorn", provider: "google" as const };

Deno.test("a duplicate deletes its own row and reports true", async () => {
  const { db, calls } = fakeDb({ others: [{ created_at: secondsFrom(T0, -1) }] });
  assertEquals(await discardIfRepeatedCallback(db, { ...attempt, failure: GOOGLE_FAILURE }), true);
  const del = calls.find((c) => c.op === "delete")!;
  assertEquals(del.filters, [["id", "dup-1"]]);
});

Deno.test("the lookup is scoped to this profile and provider, excludes itself, and includes pending attempts", async () => {
  const { db, calls } = fakeDb({ others: [] });
  await discardIfRepeatedCallback(db, { ...attempt, failure: GOOGLE_FAILURE });
  const q = calls.find((c) => c.op === "select")!.filters;
  assert(q.some(([k, v]) => k === "profile_id" && v === "asbjorn"));
  assert(q.some(([k, v]) => k === "provider" && v === "google"));
  assert(q.some(([k, v]) => k === "!id" && v === "dup-1"));
  assertEquals(q.find(([k]) => k === "status")?.[1], ["pending", "connected"]);
});

Deno.test("no nearby attempt: nothing is deleted", async () => {
  const { db, calls } = fakeDb({ others: [] });
  assertEquals(await discardIfRepeatedCallback(db, { ...attempt, failure: GOOGLE_FAILURE }), false);
  assert(!calls.some((c) => c.op === "delete"));
});

Deno.test("an ordinary failure doesn't even query the database", async () => {
  const { db, calls } = fakeDb({ others: [{ created_at: T0 }] });
  assertEquals(await discardIfRepeatedCallback(db, { ...attempt, failure: new Error("boom") }), false);
  assertEquals(calls.length, 0);
});

Deno.test("if the lookup or the delete fails, it says 'not a duplicate' instead of throwing", async () => {
  const lookup = fakeDb({ selectError: true });
  assertEquals(await discardIfRepeatedCallback(lookup.db, { ...attempt, failure: GOOGLE_FAILURE }), false);
  const del = fakeDb({ others: [{ created_at: T0 }], deleteError: true });
  assertEquals(await discardIfRepeatedCallback(del.db, { ...attempt, failure: GOOGLE_FAILURE }), false);
});
