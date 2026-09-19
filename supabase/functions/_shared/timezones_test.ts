// Run with: deno test --node-modules-dir=none supabase/functions/_shared/
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { parseBusyIntervals } from "./ics.ts";
import { addMissingTimezones, buildVtimezone, offsetMinutes } from "./timezones.ts";

const FROM = new Date("2026-09-19T00:00:00Z");
const TO = new Date("2027-09-19T00:00:00Z");

Deno.test("offsets match the real world, including daylight saving", () => {
  const at = (iso: string) => Date.parse(iso);
  assertEquals(offsetMinutes("Europe/Copenhagen", at("2026-01-15T12:00:00Z")), 60); // CET
  assertEquals(offsetMinutes("Europe/Copenhagen", at("2026-07-15T12:00:00Z")), 120); // CEST
  assertEquals(offsetMinutes("America/New_York", at("2026-01-15T12:00:00Z")), -300);
  assertEquals(offsetMinutes("America/New_York", at("2026-07-15T12:00:00Z")), -240);
  assertEquals(offsetMinutes("Asia/Kolkata", at("2026-01-15T12:00:00Z")), 330); // half-hour zone
  assertEquals(offsetMinutes("UTC", at("2026-01-15T12:00:00Z")), 0);
});

Deno.test("Copenhagen's transitions land on the real dates and wall-clock times", () => {
  const vtz = buildVtimezone("Europe/Copenhagen", FROM, TO);
  // Last Sunday of October 2026: 03:00 CEST -> 02:00 CET.
  assertStringIncludes(vtz, "DTSTART:20261025T030000\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100");
  // Last Sunday of March 2027: 02:00 CET -> 03:00 CEST.
  assertStringIncludes(vtz, "DTSTART:20270328T020000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200");
  assertStringIncludes(vtz, "TZID:Europe/Copenhagen");
});

Deno.test("a zone without daylight saving gets no transitions", () => {
  const vtz = buildVtimezone("Asia/Tokyo", FROM, TO);
  assertEquals(vtz.match(/BEGIN:(STANDARD|DAYLIGHT)/g)?.length, 1);
});

const event = (dtstart: string, dtend: string, extra = "") =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:test-1",
    dtstart,
    dtend,
    extra,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

Deno.test("an undefined-zone event now parses to the correct UTC time (summer and winter)", () => {
  const summer = event("DTSTART;TZID=Europe/Copenhagen:20261001T100000", "DTEND;TZID=Europe/Copenhagen:20261001T113000");
  const winter = event("DTSTART;TZID=Europe/Copenhagen:20270115T100000", "DTEND;TZID=Europe/Copenhagen:20270115T113000");

  assertEquals(parseBusyIntervals(addMissingTimezones(summer, FROM, TO), FROM, TO).intervals, [
    { start: "2026-10-01T08:00:00.000Z", end: "2026-10-01T09:30:00.000Z" }, // CEST, UTC+2
  ]);
  assertEquals(parseBusyIntervals(addMissingTimezones(winter, FROM, TO), FROM, TO).intervals, [
    { start: "2027-01-15T09:00:00.000Z", end: "2027-01-15T10:30:00.000Z" }, // CET, UTC+1
  ]);
});

Deno.test("a weekly recurring event stays at the same wall-clock time across the DST change", () => {
  // Every Thursday 10:00 Copenhagen time, starting well before the window.
  const weekly = event(
    "DTSTART;TZID=Europe/Copenhagen:20250102T100000",
    "DTEND;TZID=Europe/Copenhagen:20250102T110000",
    "RRULE:FREQ=WEEKLY;BYDAY=TH",
  );
  const { intervals } = parseBusyIntervals(addMissingTimezones(weekly, FROM, TO), FROM, TO);
  const starts = new Map(intervals.map((iv) => [iv.start.slice(0, 10), iv.start.slice(11, 16)]));
  assertEquals(starts.get("2026-10-22"), "08:00"); // still CEST
  assertEquals(starts.get("2026-10-29"), "09:00"); // clocks went back on the 25th
  assertEquals(starts.get("2027-03-25"), "09:00"); // still CET
  assertEquals(starts.get("2027-04-01"), "08:00"); // clocks went forward on the 28th
});

Deno.test("an event outside the first years still resolves (recurring master years back)", () => {
  const old = event(
    "DTSTART;TZID=Europe/Copenhagen:20230105T090000",
    "DTEND;TZID=Europe/Copenhagen:20230105T100000",
    "RRULE:FREQ=WEEKLY;BYDAY=TH",
  );
  const { intervals } = parseBusyIntervals(addMissingTimezones(old, FROM, TO), FROM, TO);
  assert(intervals.length > 40);
  assert(intervals.every((iv) => ["07:00", "08:00"].includes(iv.start.slice(11, 16))));
});

Deno.test("documents that need nothing come back byte-for-byte unchanged", () => {
  const utc = event("DTSTART:20261001T080000Z", "DTEND:20261001T090000Z");
  const dateOnly = event("DTSTART;VALUE=DATE:20261001", "DTEND;VALUE=DATE:20261002");
  assertEquals(addMissingTimezones(utc, FROM, TO), utc);
  assertEquals(addMissingTimezones(dateOnly, FROM, TO), dateOnly);
});

Deno.test("a zone the document already defines is not defined twice", () => {
  const defined = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Copenhagen",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    "UID:t",
    "DTSTART;TZID=Europe/Copenhagen:20261001T100000",
    "DTEND;TZID=Europe/Copenhagen:20261001T110000",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  assertEquals(addMissingTimezones(defined, FROM, TO), defined);
});

Deno.test("an unknown zone name is left alone, so the parser still reports it", () => {
  const bogus = event("DTSTART;TZID=Not/AZone:20261001T100000", "DTEND;TZID=Not/AZone:20261001T110000");
  assertEquals(addMissingTimezones(bogus, FROM, TO), bogus);
});

Deno.test("two different undefined zones in one document are both added", () => {
  const mixed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:m",
    "DTSTART;TZID=Europe/Copenhagen:20261001T100000",
    "DTEND;TZID=Europe/Berlin:20261001T120000",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const out = addMissingTimezones(mixed, FROM, TO);
  assertEquals(out.match(/BEGIN:VTIMEZONE/g)?.length, 2);
  assertEquals(parseBusyIntervals(out, FROM, TO).intervals, [
    { start: "2026-10-01T08:00:00.000Z", end: "2026-10-01T10:00:00.000Z" },
  ]);
});
