// Run with: deno test --node-modules-dir=none --allow-all supabase/functions/_shared/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { encryptSecret } from "./secretBox.ts";
import { syncConnection } from "./sync.ts";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const NOW = new Date("2026-09-20T12:00:00.000Z");

/**
 * Just enough of the Supabase client for syncConnection: serves one
 * connection's secrets and calendars, and records every update and rpc call.
 */
function fakeDb(secrets: Record<string, unknown> | null, sources: { id: string; external_calendar_id: string }[]) {
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update(payload: Record<string, unknown>) {
          updates.push({ table, payload });
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: secrets, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            table === "calendar_sources" ? { data: sources, error: null } : { data: null, error: null },
          ).then(resolve),
      };
      return chain;
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: (args.p_blocks as unknown[]).length, error: null });
    },
  };
  return { db: db as unknown as Parameters<typeof syncConnection>[0], updates, rpcs };
}

/** Replace fetch for one test; returns the URLs it was asked for. */
function stubFetch(respond: (url: string) => Response): { urls: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    return Promise.resolve(respond(url));
  }) as typeof fetch;
  return { urls, restore: () => (globalThis.fetch = original) };
}

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//test//test//EN",
  "BEGIN:VEVENT",
  "UID:one",
  "DTSTAMP:20260101T000000Z",
  "DTSTART:20261001T100000Z",
  "DTEND:20261001T110000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const connectionUpdate = (updates: { table: string; payload: Record<string, unknown> }[]) =>
  updates.find((u) => u.table === "calendar_connections")!.payload;

Deno.test("an ICS link is fetched again and its busy times swapped in", async () => {
  const { db, updates, rpcs } = fakeDb(
    { ics_url: await encryptSecret("https://calendar.example.com/feed.ics", KEY) },
    [{ id: "source-1", external_calendar_id: "ics" }],
  );
  const net = stubFetch(() => new Response(FEED, { status: 200 }));
  try {
    const outcome = await syncConnection(db, { id: "conn-1", provider: "ics" }, KEY, NOW);
    assertEquals(outcome, { connectionId: "conn-1", ok: true, busyBlocks: 1 });
    assertEquals(net.urls, ["https://calendar.example.com/feed.ics"]);
  } finally {
    net.restore();
  }
  assertEquals(rpcs[0].fn, "replace_busy_blocks");
  assertEquals(rpcs[0].args.p_blocks, [
    { source_id: "source-1", start_at: "2026-10-01T10:00:00.000Z", end_at: "2026-10-01T11:00:00.000Z" },
  ]);
  const done = connectionUpdate(updates);
  assertEquals(done.sync_error, null);
  assertEquals(done.needs_reconnect, false);
  assertEquals(done.last_synced_at, NOW.toISOString());
});

Deno.test("a temporary failure keeps the old busy times and says it will retry", async () => {
  const { db, updates, rpcs } = fakeDb(
    { ics_url: await encryptSecret("https://calendar.example.com/feed.ics", KEY) },
    [{ id: "source-1", external_calendar_id: "ics" }],
  );
  const net = stubFetch(() => new Response("down", { status: 503 }));
  try {
    const outcome = await syncConnection(db, { id: "conn-1", provider: "ics" }, KEY, NOW);
    assertEquals(outcome.ok, false);
  } finally {
    net.restore();
  }
  assertEquals(rpcs, []); // nothing replaced, so nothing lost
  const failed = connectionUpdate(updates);
  assertEquals(failed.needs_reconnect, false);
  assert(String(failed.sync_error).includes("try again"));
  assertEquals(failed.last_synced_at, undefined); // still the last *good* sync
});

Deno.test("missing credentials mean the account must be reconnected", async () => {
  const { db, updates, rpcs } = fakeDb(null, [{ id: "source-1", external_calendar_id: "ics" }]);
  const outcome = await syncConnection(db, { id: "conn-1", provider: "ics" }, KEY, NOW);
  assertEquals(outcome.ok, false);
  assertEquals(rpcs, []);
  assertEquals(connectionUpdate(updates).needs_reconnect, true);
});

Deno.test("Google refusing the refresh token means reconnect, not retry", async () => {
  Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "client");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
  const { db, updates, rpcs } = fakeDb(
    {
      access_token: await encryptSecret("old-access", KEY),
      refresh_token: await encryptSecret("dead-refresh", KEY),
      expires_at: "2026-09-19T00:00:00.000Z", // expired, so a refresh is needed
    },
    [{ id: "source-1", external_calendar_id: "primary" }],
  );
  const net = stubFetch(() => new Response('{"error": "invalid_grant"}', { status: 400 }));
  try {
    const outcome = await syncConnection(db, { id: "conn-1", provider: "google" }, KEY, NOW);
    assertEquals(outcome.ok, false);
  } finally {
    net.restore();
  }
  assertEquals(rpcs, []);
  const failed = connectionUpdate(updates);
  assertEquals(failed.needs_reconnect, true);
  assert(String(failed.sync_error).includes("Reconnect"));
});

Deno.test("a still-valid Google access token is used without refreshing", async () => {
  const { db, rpcs } = fakeDb(
    {
      access_token: await encryptSecret("good-access", KEY),
      refresh_token: await encryptSecret("refresh", KEY),
      expires_at: "2026-09-20T12:30:00.000Z", // half an hour left
    },
    [{ id: "source-1", external_calendar_id: "primary" }],
  );
  const net = stubFetch(() =>
    new Response(
      JSON.stringify({
        calendars: { primary: { busy: [{ start: "2026-10-02T08:00:00Z", end: "2026-10-02T09:00:00Z" }] } },
      }),
      { status: 200 },
    )
  );
  try {
    const outcome = await syncConnection(db, { id: "conn-1", provider: "google" }, KEY, NOW);
    assertEquals(outcome.ok, true);
    assert(net.urls.every((u) => u.includes("freeBusy")), "no token refresh expected");
  } finally {
    net.restore();
  }
  // Four 90-day chunks cover the year; the stub answers the same block to each.
  const blocks = rpcs[0].args.p_blocks as { source_id: string }[];
  assert(blocks.length > 0 && blocks.every((b) => b.source_id === "source-1"));
});
