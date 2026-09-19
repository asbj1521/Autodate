// Run with: deno test --node-modules-dir=none supabase/functions/_shared/
//
// Fixtures copy the *shape* of real iCloud responses (single-quoted
// attributes, an xmlns on nearly every element, subscribed calendars, the
// account root, inbox and reminder lists) with made-up names and ids.
import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  assertIcloudUrl,
  CalDavError,
  discoverCalendars,
  fetchEventDocuments,
  mapPool,
  parseMultistatus,
  pickEventCalendars,
} from "./caldav.ts";

const CREDS = { username: "me@example.com", password: "abcd-efgh-ijkl-mnop" };
const HOME = new URL("https://p48-caldav.icloud.com/111/calendars/");

const wrap = (responses: string) =>
  `<?xml version='1.0' encoding='UTF-8'?><multistatus xmlns="DAV:">${responses}</multistatus>`;

const collection = (href: string, name: string | null, type: string, comps: string[]) => `
  <response><href>${href}</href><propstat><prop>
    ${name === null ? "" : `<displayname xmlns="DAV:">${name}</displayname>`}
    <resourcetype xmlns="DAV:"><collection/>${type}</resourcetype>
    <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav">${comps
      .map((c) => `<comp name='${c}' xmlns='urn:ietf:params:xml:ns:caldav'/>`)
      .join("")}</supported-calendar-component-set>
  </prop><status>HTTP/1.1 200 OK</status></propstat></response>`;

const CAL = `<calendar xmlns="urn:ietf:params:xml:ns:caldav"/>`;
const SUBSCRIBED = `<subscribed xmlns="http://calendarserver.org/ns/"/>`;

const LISTING = wrap(
  [
    collection("/111/calendars/", "Account root", "", ["VEVENT", "VTODO"]),
    collection("/111/calendars/AAAA-1111/", "Work", CAL, ["VEVENT"]),
    collection("/111/calendars/BBBB-2222/", "Family & friends", CAL, ["VEVENT"]),
    collection("/111/calendars/CCCC-3333/", "University feed", SUBSCRIBED, ["VEVENT"]),
    collection("/111/calendars/DDDD-4444/", "Reminders", CAL, ["VTODO"]),
    collection("/111/calendars/inbox/", null, `<schedule-inbox xmlns="urn:ietf:params:xml:ns:caldav"/>`, ["VEVENT"]),
    collection("/111/calendars/outbox/", null, `<schedule-outbox xmlns="urn:ietf:params:xml:ns:caldav"/>`, ["VEVENT"]),
    collection("/111/notification/", null, `<notification xmlns="http://calendarserver.org/ns/"/>`, []),
  ].join(""),
);

Deno.test("only real and subscribed event calendars are picked", () => {
  const found = pickEventCalendars(parseMultistatus(LISTING), HOME);
  assertEquals(
    found.map((c) => [c.id, c.name]),
    [
      ["AAAA-1111", "Work"],
      ["BBBB-2222", "Family & friends"], // entities decoded
      ["CCCC-3333", "University feed"], // subscribed calendars are included
    ],
  );
  assert(found[0].url.startsWith("https://p48-caldav.icloud.com/111/calendars/AAAA-1111"));
});

Deno.test("a calendar without a name comes back with a null name", () => {
  const xml = wrap(collection("/111/calendars/EEEE-5555/", null, CAL, ["VEVENT"]));
  assertEquals(pickEventCalendars(parseMultistatus(xml), HOME)[0].name, null);
});

Deno.test("properties the server could not read (404) are ignored", () => {
  const xml = wrap(`<response><href>/x/</href>
    <propstat><prop><displayname>Good</displayname></prop><status>HTTP/1.1 200 OK</status></propstat>
    <propstat><prop><getetag>nope</getetag></prop><status>HTTP/1.1 404 Not Found</status></propstat>
  </response>`);
  const [r] = parseMultistatus(xml);
  assertEquals(r.prop["displayname"], "Good");
  assert(!("getetag" in r.prop));
});

Deno.test("garbage instead of XML is a friendly error", () => {
  assertThrows(() => parseMultistatus("<not closed"), CalDavError);
});

Deno.test("only https icloud.com URLs are accepted", () => {
  assertIcloudUrl("https://caldav.icloud.com/");
  assertIcloudUrl("https://p48-caldav.icloud.com:443/1/calendars/");
  for (const bad of [
    "http://caldav.icloud.com/",
    "https://evil.com/",
    "https://icloud.com.evil.com/",
    "https://evilicloud.com/",
    "https://user:pw@caldav.icloud.com/",
    "https://caldav.icloud.com:8443/",
    "not a url",
  ]) {
    assertThrows(() => assertIcloudUrl(bad), CalDavError, undefined, bad);
  }
});

/* ---- Discovery and event fetching against a stubbed network ---- */

type Handler = (req: Request) => Response | Promise<Response>;

async function withFetch(handler: Handler, body: () => Promise<void>) {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
  try {
    await body();
  } finally {
    globalThis.fetch = real;
  }
}

const xmlResponse = (body: string, status = 207) => new Response(body, { status });

const principalXml = wrap(
  `<response><href>/</href><propstat><prop><current-user-principal><href>/111/principal/</href></current-user-principal></prop><status>HTTP/1.1 200 OK</status></propstat></response>`,
);
const homeXml = (href: string) =>
  wrap(
    `<response><href>/111/principal/</href><propstat><prop><calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href xmlns="DAV:">${href}</href></calendar-home-set></prop><status>HTTP/1.1 200 OK</status></propstat></response>`,
  );

function icloud(homeHref = "https://p48-caldav.icloud.com:443/111/calendars/"): Handler {
  return (req) => {
    const url = new URL(req.url);
    if (url.host === "caldav.icloud.com" && url.pathname === "/") return xmlResponse(principalXml);
    if (url.pathname === "/111/principal/") return xmlResponse(homeXml(homeHref));
    if (url.pathname === "/111/calendars/") return xmlResponse(LISTING);
    return new Response("unexpected " + req.url, { status: 500 });
  };
}

Deno.test("discovery walks principal -> home -> calendars", async () => {
  await withFetch(icloud(), async () => {
    const cals = await discoverCalendars(CREDS);
    assertEquals(cals.map((c) => c.name), ["Work", "Family & friends", "University feed"]);
  });
});

Deno.test("the login is sent as HTTP Basic, and only to icloud hosts", async () => {
  const seen: { host: string; auth: string | null }[] = [];
  await withFetch(
    (req) => {
      seen.push({ host: new URL(req.url).host, auth: req.headers.get("authorization") });
      return icloud()(req);
    },
    async () => {
      await discoverCalendars(CREDS);
    },
  );
  const expected = "Basic " + btoa("me@example.com:abcd-efgh-ijkl-mnop");
  assert(seen.length === 3);
  for (const s of seen) {
    assertEquals(s.auth, expected);
    assert(s.host.endsWith("icloud.com"));
  }
});

Deno.test("a wrong password gives the friendly login error", async () => {
  await withFetch(
    () => new Response("", { status: 401 }),
    async () => {
      await assertRejects(() => discoverCalendars(CREDS), CalDavError, "app-specific password");
    },
  );
});

Deno.test("a calendar home on another host is refused, and the password never goes there", async () => {
  const hosts: string[] = [];
  await withFetch(
    (req) => {
      hosts.push(new URL(req.url).host);
      return icloud("https://evil.example.com/111/calendars/")(req);
    },
    async () => {
      await assertRejects(() => discoverCalendars(CREDS), CalDavError, "unexpected server");
    },
  );
  assert(!hosts.includes("evil.example.com"));
});

Deno.test("a redirect to another host is refused", async () => {
  const hosts: string[] = [];
  await withFetch(
    (req) => {
      hosts.push(new URL(req.url).host);
      return new Response(null, { status: 302, headers: { location: "https://evil.example.com/" } });
    },
    async () => {
      await assertRejects(() => discoverCalendars(CREDS), CalDavError, "unexpected server");
    },
  );
  assertEquals(hosts, ["caldav.icloud.com"]);
});

Deno.test("a redirect within icloud.com is followed", async () => {
  let hops = 0;
  await withFetch(
    (req) => {
      const url = new URL(req.url);
      // The very first request is bounced to another iCloud host, which then
      // answers as the account root would have.
      if (url.host === "caldav.icloud.com" && url.pathname === "/" && hops++ === 0) {
        return new Response(null, { status: 301, headers: { location: "https://p48-caldav.icloud.com/" } });
      }
      if (url.host === "p48-caldav.icloud.com" && url.pathname === "/") return xmlResponse(principalXml);
      return icloud()(req);
    },
    async () => {
      const cals = await discoverCalendars(CREDS);
      assertEquals(cals.length, 3);
    },
  );
});

Deno.test("event documents are pulled out, entities decoded, empty ones dropped", async () => {
  const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20261001T100000Z\r\nDTEND:20261001T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const xml = wrap(`
    <response><href>/a.ics</href><propstat><prop><calendar-data xmlns="urn:ietf:params:xml:ns:caldav">${ics}</calendar-data></prop><status>HTTP/1.1 200 OK</status></propstat></response>
    <response><href>/b.ics</href><propstat><prop><getetag>x</getetag></prop><status>HTTP/1.1 200 OK</status></propstat></response>`);

  let requestBody = "";
  await withFetch(
    async (req) => {
      requestBody = await req.text();
      return xmlResponse(xml);
    },
    async () => {
      const docs = await fetchEventDocuments(
        CREDS,
        "https://p48-caldav.icloud.com/111/calendars/AAAA-1111/",
        new Date("2026-09-19T00:00:00Z"),
        new Date("2027-09-19T00:00:00Z"),
      );
      assertEquals(docs.length, 1);
      assert(docs[0].includes("UID:1"));
    },
  );
  // The request asks for timing properties only, and uses CalDAV's time format.
  assert(requestBody.includes('start="20260919T000000Z"'));
  assert(requestBody.includes('<c:prop name="DTSTART"/>'));
  for (const forbidden of ["SUMMARY", "DESCRIPTION", "LOCATION", "ATTENDEE"]) {
    assert(!requestBody.includes(forbidden), `request must not ask for ${forbidden}`);
  }
});

Deno.test("mapPool keeps order and respects the concurrency limit", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5 * (8 - n)));
    running--;
    return n * 10;
  });
  assertEquals(out, [10, 20, 30, 40, 50, 60, 70]);
  assert(peak <= 3, `peak concurrency was ${peak}`);
});
