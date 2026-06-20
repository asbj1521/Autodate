/**
 * Mock data layer.
 *
 * Stands in for what will eventually be Supabase + the real Google/Outlook
 * free-busy APIs. The important thing is the *shape* of what these functions
 * return: when we wire up real backends later, only the insides change — the
 * rest of the app keeps calling `getMockGroups()` / `buildEventForGroup()` the
 * same way.
 *
 * Availability is fully emergent. Every unique person is given a seeded
 * "personality" — five traits scored 1–5 (work, study, social, family, other) —
 * and their calendar is generated from it. Busy people are genuinely busy, so a
 * shared free slot is hard to find, on purpose. Nothing is hand-picked or
 * guaranteed free; the overlap (or lack of it) falls straight out of the data.
 */

import type {
  BusyInterval,
  EventCategory,
  Event,
  FriendGroup,
  Participant,
} from "@/types";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// We schedule across the full day (00:00–24:00) so any start time is valid.
export const DAY_START = 0;
export const DAY_END = 24;

// Calendars are generated across June + July 2026, so a rolling window that
// crosses the month boundary always has realistic data on both sides.
const PLAN_START = Date.UTC(2026, 5, 1); // 1 June 2026, 00:00 UTC
const PLAN_DAYS = 61; // June + July

// The search window covers the generated range. Weekends are allowed — this is
// mainly for events in the user's private life.
const SEARCH_START = "2026-06-01T00:00:00.000Z";
const SEARCH_END = "2026-08-01T00:00:00.000Z"; // 1 August (exclusive)

/** The window the scheduler searches and has generated calendar data for. */
export const SEARCH_WINDOW = { start: SEARCH_START, end: SEARCH_END };

// "Today" — the planning reference point. Spontaneous plans (social hangouts)
// only appear within a couple of weeks of this; structured commitments (work,
// school, recurring routines, holidays) are on the calendar regardless. Derived
// from the clock so it tracks "now" the same way the UI's calendar does.
const NOW = Math.floor(Date.now() / MS_PER_DAY) * MS_PER_DAY;

/* ----------------------------------------------------------------------------
 * People & groups
 *
 * Every unique person is defined exactly once in PEOPLE. Groups reference them
 * by id, so each person has a single calendar — Asbjørn appears in three groups
 * but shares ONE generated personality + calendar across all of them.
 * ------------------------------------------------------------------------- */

const PEOPLE: Record<string, string> = {
  // Ikke Almene HA'ere
  asbjorn: "Asbjørn Bay",
  simon: "Simon Liocouras",
  kristoffer: "Kristoffer Winther",
  jonas: "Jonas Eriksen",
  thue: "Thue Fransen",
  claes: "Claes Fransen",
  benjamin: "Benjamin Glover",
  // Vejlederholdet
  prusse: "Prüsse",
  thille: "Thille",
  thind: "Thind",
  borring: "Borring",
  nico: "Nico",
  schlei: "Schlei",
  philip: "Philip",
  ottesen: "Ottesen",
  nora: "Nora",
  // Family
  hansove: "Hans Ove",
  anne: "Anne",
  regitze: "Regitze",
  aksel: "Aksel",
};

interface GroupDef {
  id: string;
  name: string;
  /** Person ids (keys of PEOPLE). */
  members: string[];
}

const GROUP_DEFS: GroupDef[] = [
  {
    id: "highschool",
    name: "Ikke Almene HA'ere",
    members: [
      "asbjorn",
      "simon",
      "kristoffer",
      "jonas",
      "thue",
      "claes",
      "benjamin",
    ],
  },
  {
    id: "work",
    name: "Vejlederholdet",
    members: [
      "prusse",
      "thille",
      "thind",
      "borring",
      "nico",
      "schlei",
      "philip",
      "asbjorn",
      "ottesen",
      "nora",
    ],
  },
  {
    id: "climbing",
    name: "Family",
    members: ["hansove", "anne", "regitze", "aksel", "asbjorn"],
  },
];

/* ----------------------------------------------------------------------------
 * Personalities
 *
 * Each person is scored 1–5 on five traits. The scores are drawn from the
 * person's seeded RNG and then nudged so the combinations make sense (see the
 * rules below) — a heavy student isn't also a full-time worker, but they are
 * very social, etc.
 * ------------------------------------------------------------------------- */

interface Personality {
  work: number;
  study: number;
  social: number;
  family: number;
  other: number;
}

function clamp5(n: number): number {
  return Math.max(1, Math.min(5, n));
}

function rollPersonality(rng: () => number): Personality {
  const d5 = () => 1 + Math.floor(rng() * 5);
  const d3 = () => 1 + Math.floor(rng() * 3);

  let study = d5();
  let work = d5();
  // Work and study compete for the same daytime hours — nobody does both at
  // full tilt. Whichever is already high pulls the other down.
  if (study >= 4) work = Math.min(work, d3());
  else if (work >= 4) study = Math.min(study, d3());

  // Studiers live a social campus life: lectures, Friday bars, conventions.
  let social = clamp5(d5() + (study >= 3 ? 1 : 0) + (work >= 5 ? 1 : 0));

  // Family life skews towards working adults and away from heavy students…
  const family = clamp5(d5() - (study >= 4 ? 1 : 0) + (work >= 4 ? 1 : 0));
  // …and a busy family tends to mean fewer nights out.
  if (family >= 4) social = clamp5(social - 1);

  const other = d5(); // hobbies / sport / errands — independent

  return { work, study, social, family, other };
}

/* ----------------------------------------------------------------------------
 * Calendar generation
 *
 * Each trait contributes events with a probability scaled by its score and a
 * time-of-day that fits the activity. The evening traits (study, social,
 * family, other) are what make a shared evening slot scarce.
 * ------------------------------------------------------------------------- */

const TITLES = {
  workDay: ["Arbejde", "På kontoret", "Arbejdsdag"],
  workEve: ["Overarbejde", "Sent møde", "Deadline"],
  studyDay: ["Forelæsning", "Undervisning", "Øvelsestime"],
  studyEve: ["Læsegruppe", "Projektarbejde", "Eksamenslæsning"],
  socialEve: ["Middag med venner", "Bar", "Fællesspisning", "Hygge"],
  socialBig: ["Fest", "Koncert", "Fødselsdag", "Sommerfest"],
  familyEve: ["Familiemiddag", "Aftensmad hjemme", "Henter børn"],
  familyDay: ["Familietid", "Besøg svigerfamilie", "Havedag"],
  hobby: ["Træning", "Fodbold", "Kor", "Yoga", "Løbeklub", "Frivilligt arbejde"],
  errand: ["Tandlæge", "Frisør", "Lægebesøg", "Indkøb"],
  trip: ["Weekendtur", "Hyttetur", "Festival", "Sommerhus"],
};

// Saturday day-indices that have a following Sunday inside the window, so a
// weekend trip never spills past the generated range.
const SATURDAYS = Array.from({ length: PLAN_DAYS }, (_, i) => i).filter(
  (i) =>
    i + 1 < PLAN_DAYS &&
    new Date(PLAN_START + i * MS_PER_DAY).getUTCDay() === 6,
);

/** FNV-1a hash → a stable 32-bit seed from a string id. */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (xorshift32) returning floats in [0, 1). */
function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * How likely a *spontaneous* plan is to already be on the calendar on a given
 * day, given how people actually plan: hangouts get arranged a week or two
 * ahead, rarely more. Days within ~2 weeks are essentially booked up; a month
 * out is mostly still open. Days in the past return 1 — they already happened.
 */
function planningFactor(dayMs: number): number {
  const daysAhead = (dayMs - NOW) / MS_PER_DAY;
  if (daysAhead <= 14) return 1; // this/next fortnight: fully planned
  if (daysAhead <= 28) return 0.35; // 2–4 weeks out: only some plans exist
  return 0.08; // beyond a month: rarely on the calendar yet
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Choose `n` distinct weekdays (1–5), deterministically via partial shuffle. */
function pickWeekdays(rng: () => number, n: number): number[] {
  const days = [1, 2, 3, 4, 5];
  for (let i = days.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [days[i], days[j]] = [days[j], days[i]];
  }
  return days.slice(0, Math.max(0, Math.min(5, n)));
}

function event(
  dayMs: number,
  startHour: number,
  durHours: number,
  title: string,
  category: EventCategory,
): BusyInterval {
  const start = dayMs + Math.round(startHour * MS_PER_HOUR);
  return {
    start: iso(start),
    end: iso(start + Math.round(durHours * MS_PER_HOUR)),
    title,
    category,
  };
}

/** A whole-day busy block (used for multi-day trips). */
function allDay(dayMs: number, title: string, category: EventCategory): BusyInterval {
  return { start: iso(dayMs), end: iso(dayMs + MS_PER_DAY), title, category };
}

/** Generate one person's full calendar across the window, from their traits. */
function generateCalendar(personId: string): BusyInterval[] {
  const rng = makeRng(hashSeed(personId));
  const p = rollPersonality(rng);
  const events: BusyInterval[] = [];

  // Real calendars don't double-book: only add an event if its slot is still
  // free. Things are added structural-first, so a fixed commitment (work, a
  // class, the weekly training night) takes precedence over a spontaneous plan.
  const tryPush = (ev: BusyInterval) => {
    const s = Date.parse(ev.start);
    const e = Date.parse(ev.end);
    if (events.some((b) => Date.parse(b.start) < e && Date.parse(b.end) > s)) return;
    events.push(ev);
  };

  // SUMMER HOLIDAY — many people are away for a 1–2 week stretch in Jun/Jul.
  // Booked far ahead, so it's on the calendar regardless of the planning horizon
  // and (added first) blocks out everything else while they're gone.
  if (rng() < 0.4) {
    const len = 6 + Math.floor(rng() * 7); // 6–12 days
    const startDay = Math.floor(rng() * (PLAN_DAYS - len));
    const vacStart = PLAN_START + startDay * MS_PER_DAY;
    events.push({
      start: iso(vacStart),
      end: iso(vacStart + len * MS_PER_DAY),
      title: "Ferie",
      category: "travel",
    });
  }

  // OTHER: a couple of *fixed* weekly hobby evenings (recurring) — a stable
  // routine, known well ahead.
  const hobbyNights = pickWeekdays(rng, Math.round(p.other / 2.5)); // 0–2 nights
  const hobbyTitle = pick(rng, TITLES.hobby);

  for (let d = 0; d < PLAN_DAYS; d++) {
    const dayMs = PLAN_START + d * MS_PER_DAY;
    const dow = new Date(dayMs).getUTCDay();
    const weekday = dow >= 1 && dow <= 5;

    // --- Structured commitments: termtime/rotas, planned months ahead. ---
    if (weekday) {
      // WORK — daytime (doesn't block evenings), occasional overtime that does.
      const works = p.work >= 4 || rng() < p.work * 0.18;
      if (works) {
        tryPush(event(dayMs, 9, p.work >= 4 ? 8 : 5, pick(rng, TITLES.workDay), "work"));
      }
      if (rng() < p.work * 0.04) {
        tryPush(event(dayMs, 17, 3, pick(rng, TITLES.workEve), "work"));
      }

      // STUDY — timetabled lectures are fixed far ahead; evening study-group
      // sessions are arranged that week, so they fade with the planning horizon.
      if (rng() < p.study * 0.18) {
        tryPush(event(dayMs, 10, 4, pick(rng, TITLES.studyDay), "school"));
      }
      if (rng() < p.study * 0.12 * planningFactor(dayMs)) {
        tryPush(event(dayMs, 18, 3, pick(rng, TITLES.studyEve), "school"));
      }

      // FAMILY — weekday dinners / kids in the early evening.
      if (rng() < p.family * 0.06) {
        tryPush(event(dayMs, 17, 3, pick(rng, TITLES.familyEve), "family"));
      }

      // OTHER — the recurring hobby nights.
      if (hobbyNights.includes(dow) && rng() < 0.85) {
        tryPush(event(dayMs, 18, 2.5, hobbyTitle, "health"));
      }
    } else {
      // FAMILY — weekend days out + the standing Sunday dinner.
      if (rng() < p.family * 0.14) {
        tryPush(event(dayMs, 11, 6, pick(rng, TITLES.familyDay), "family"));
      }
      if (dow === 0 && rng() < 0.4 + p.family * 0.07) {
        tryPush(event(dayMs, 17.5, 2.5, "Søndagsmiddag", "family"));
      }
    }

    // --- Spontaneous plans: only on the calendar a couple of weeks out. ---
    // SOCIAL hangouts further ahead simply haven't been arranged yet, so those
    // evenings read as free (until, in real life, they fill in closer to the day).
    const heavyNight = dow === 4 || dow === 5 || dow === 6;
    const socialChance =
      p.social * (heavyNight ? 0.22 : 0.12) * planningFactor(dayMs);
    if (rng() < socialChance) {
      const start = 18 + Math.floor(rng() * 2); // 18–19: dinners/plans bite early
      const big = heavyNight && rng() < 0.5;
      tryPush(
        event(
          dayMs,
          start,
          3 + Math.floor(rng() * 3),
          pick(rng, big ? TITLES.socialBig : TITLES.socialEve),
          "social",
        ),
      );
    }

    // The odd appointment (dentist, haircut). Usually booked ahead, so no horizon.
    if (rng() < 0.03) {
      tryPush(
        event(dayMs, 9 + Math.floor(rng() * 7), 1, pick(rng, TITLES.errand), "personal"),
      );
    }
  }

  // A spontaneous weekend getaway for sociable / family people — also only
  // arranged a few weeks out, so it fades with the horizon.
  if (SATURDAYS.length > 0) {
    const satIdx = pick(rng, SATURDAYS);
    const satMs = PLAN_START + satIdx * MS_PER_DAY;
    if (rng() < ((p.social + p.family) / 22) * planningFactor(satMs)) {
      const trip = pick(rng, TITLES.trip);
      tryPush(allDay(satMs, trip, "travel"));
      tryPush(allDay(satMs + MS_PER_DAY, trip, "travel"));
    }
  }

  return events;
}

/**
 * Build the friend groups: generate each unique person's calendar once (cached),
 * then assemble participants. The cache is what guarantees Asbjørn shares one
 * calendar across every group.
 */
function buildGroups(): FriendGroup[] {
  const cache = new Map<string, BusyInterval[]>();
  const calendarFor = (id: string): BusyInterval[] => {
    let cal = cache.get(id);
    if (!cal) {
      cal = generateCalendar(id);
      cache.set(id, cal);
    }
    return cal;
  };

  return GROUP_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    participants: def.members.map<Participant>((id) => ({
      profileId: id,
      name: PEOPLE[id],
      busy: calendarFor(id),
    })),
  }));
}

const GROUPS: FriendGroup[] = buildGroups();

/** Small artificial delay so the UI's loading state is exercised realistically. */
function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Get the user's friend groups (stands in for "fetch my groups"). */
export async function getMockGroups(): Promise<FriendGroup[]> {
  return delay(GROUPS);
}

/**
 * Build the event for a given friend group: titled after the group, with the
 * shared search window and constraints. Pure (no delay) so the UI can rebuild it
 * instantly when the user switches groups.
 */
export function buildEventForGroup(
  group: FriendGroup,
  opts?: { durationMinutes?: number; startHour?: number },
): Event {
  const startHour = opts?.startHour ?? 18;
  const durationMinutes = opts?.durationMinutes ?? 60;
  return {
    id: `event-${group.id}`,
    title: group.name,
    organizerId: group.participants[0]?.profileId ?? "",
    participants: group.participants,
    durationMinutes,
    searchStart: SEARCH_START,
    searchEnd: SEARCH_END,
    constraints: {
      // The picked start time is a *fixed* meeting time: the allowed window is
      // exactly one meeting long, so the engine only ever returns days the whole
      // group is free at that hour. This keeps "Find best/new time" in lock-step
      // with the heatmap (which colours days by availability at the same hour),
      // instead of digging up a late-evening gap on an otherwise-busy day.
      earliestHour: startHour,
      latestHour: Math.min(DAY_END, startHour + durationMinutes / 60),
      excludeWeekends: false,
    },
  };
}
