/**
 * Mock data layer.
 *
 * Stands in for what will eventually be Supabase + the real Google/Outlook
 * free-busy APIs. The important thing is the *shape* of what these functions
 * return: when we wire up real backends later, only the insides change — the
 * rest of the app keeps calling `exampleGroup()` / `buildEventForGroup()` the
 * same way.
 *
 * These groups are the example carousel on the front page: ten made-up groups
 * shown to anyone who has not created a real one yet. Real groups and their
 * members' real busy times come from the database instead (src/api/groups.ts).
 *
 * Availability is fully emergent. Every unique person is given a seeded
 * "personality" — five traits scored 1–5 (work, study, social, family, other) —
 * and their calendar is generated from it. Busy people are genuinely busy, so a
 * shared free slot is hard to find, on purpose. Nothing is hand-picked or
 * guaranteed free; the overlap (or lack of it) falls straight out of the data.
 *
 * Time: the generator reasons in Copenhagen calendar dates and clock times
 * ("Monday, 09:00 to 17:00"). Internally those are kept as "wall-clock ms":
 * Date.UTC(year, month, day, hour), whose UTC fields *are* the local date and
 * time, so day arithmetic stays simple. They only become real instants in
 * `iso()`, where each one is read as Copenhagen time. So work runs 09:00 to
 * 17:00 Danish time in summer and winter alike, as it would in a real
 * calendar.
 */

import type {
  BusyInterval,
  EventCategory,
  Event,
  FriendGroup,
  Participant,
} from "@/types";
import { APP_TIME_ZONE, localDate, wallTime } from "@/lib/zone";

/** The zone the generated people live in. */
const TZ = APP_TIME_ZONE;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// We schedule across the full day (00:00–24:00) so any start time is valid.
export const DAY_START = 0;
export const DAY_END = 24;

// "Today" — the planning reference point. Spontaneous plans (social hangouts)
// only appear within a couple of weeks of this; structured commitments (work,
// school, recurring routines, holidays) are on the calendar regardless. Derived
// from the clock so it tracks "now" the same way the UI's calendar does.
// Wall-clock ms (see the top of the file): today's date in Copenhagen.
const TODAY = localDate(Date.now(), TZ);
const NOW = Date.UTC(TODAY.year, TODAY.month, TODAY.day);

// Calendars are generated for a rolling window anchored to the clock: from the
// 1st of the current month through twelve whole months. Near-term weeks are
// realistically packed; the further out, the emptier calendars get (the
// planning horizon below thins spontaneous plans), so *some* date always
// exists — it may just be months away.
const NOW_DATE = new Date(NOW);
const PLAN_START = Date.UTC(NOW_DATE.getUTCFullYear(), NOW_DATE.getUTCMonth(), 1);
const PLAN_END = Date.UTC(NOW_DATE.getUTCFullYear(), NOW_DATE.getUTCMonth() + 12, 1);
const PLAN_DAYS = Math.round((PLAN_END - PLAN_START) / MS_PER_DAY);

// The search window covers the generated range. Weekends are allowed — this is
// mainly for events in the user's private life.
const SEARCH_START = iso(PLAN_START);
const SEARCH_END = iso(PLAN_END);

/** The window the scheduler searches and has generated calendar data for. */
export const SEARCH_WINDOW = { start: SEARCH_START, end: SEARCH_END };

/* ----------------------------------------------------------------------------
 * Example people & groups
 *
 * Ten made-up groups the front page cycles through, so someone who has not
 * made a real group yet sees what Casy is for rather than an empty screen.
 * They are obviously examples on purpose: a basketball squad, a book club, a
 * family. Nothing here is a real person.
 *
 * Every unique person is defined exactly once in PEOPLE and referenced by id,
 * so anyone who turns up in two groups shares ONE generated personality and
 * calendar across both, the way a real person would.
 *
 * "you" is the slot the signed-in person's own real calendar is swapped into
 * (see src/lib/realCalendar.ts), which is what makes an example worth looking
 * at: the rest is invented, but your own busy time is not.
 * ------------------------------------------------------------------------- */

const PEOPLE: Record<string, string> = {
  you: "You",
  // Basketball
  mikkel: "Mikkel",
  rasmus: "Rasmus",
  oliver: "Oliver",
  emil: "Emil",
  noah: "Noah",
  villads: "Villads",
  august: "August",
  malthe: "Malthe",
  elias: "Elias",
  // Highschool
  simon: "Simon",
  kristoffer: "Kristoffer",
  jonas: "Jonas",
  thue: "Thue",
  claes: "Claes",
  benjamin: "Benjamin",
  // Family
  hansove: "Hans Ove",
  anne: "Anne",
  regitze: "Regitze",
  aksel: "Aksel",
  // Book club
  ida: "Ida",
  sofie: "Sofie",
  clara: "Clara",
  johanne: "Johanne",
  marie: "Marie",
  // Study group
  freja: "Freja",
  lucas: "Lucas",
  alma: "Alma",
  // Work
  prusse: "Prüsse",
  thille: "Thille",
  borring: "Borring",
  nico: "Nico",
  schlei: "Schlei",
  nora: "Nora",
  // Running club
  katrine: "Katrine",
  jeppe: "Jeppe",
  signe: "Signe",
  anders: "Anders",
  louise: "Louise",
  // Band
  viggo: "Viggo",
  karla: "Karla",
  storm: "Storm",
  // Neighbours
  birgitte: "Birgitte",
  poul: "Poul",
  hanne: "Hanne",
  soren: "Søren",
  lene: "Lene",
  kurt: "Kurt",
  // Old friends
  frederik: "Frederik",
  laura: "Laura",
  tobias: "Tobias",
  amalie: "Amalie",
  gustav: "Gustav",
};

/** One of the example groups: a name and who is in it. */
export interface ExampleGroupDef {
  id: string;
  name: string;
  /** Person ids (keys of PEOPLE); "you" is the signed-in person's slot. */
  members: string[];
}

/**
 * The ten groups the front page rotates through. Sizes are meant to look
 * right for what they are — a basketball squad has ten, a band has four —
 * because an example that doesn't look plausible teaches nothing.
 */
export const EXAMPLE_GROUPS: ExampleGroupDef[] = [
  {
    id: "basketball",
    name: "Basketball team",
    members: ["you", "mikkel", "rasmus", "oliver", "emil", "noah", "villads", "august", "malthe", "elias"],
  },
  {
    id: "highschool",
    name: "Highschool group",
    members: ["you", "simon", "kristoffer", "jonas", "thue", "claes", "benjamin"],
  },
  {
    id: "family",
    name: "Family",
    members: ["you", "hansove", "anne", "regitze", "aksel"],
  },
  {
    id: "bookclub",
    name: "Book club",
    members: ["you", "ida", "sofie", "clara", "johanne", "marie"],
  },
  {
    id: "studygroup",
    name: "Study group",
    members: ["you", "freja", "lucas", "alma"],
  },
  {
    id: "work",
    name: "Work team",
    members: ["you", "prusse", "thille", "borring", "nico", "schlei", "nora"],
  },
  {
    id: "running",
    name: "Running club",
    members: ["you", "katrine", "jeppe", "signe", "anders", "louise"],
  },
  {
    id: "band",
    name: "The band",
    members: ["you", "viggo", "karla", "storm"],
  },
  {
    id: "neighbours",
    name: "Neighbours",
    members: ["you", "birgitte", "poul", "hanne", "soren", "lene", "kurt"],
  },
  {
    id: "oldfriends",
    name: "Old friends",
    members: ["you", "frederik", "laura", "tobias", "amalie", "gustav"],
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

/* ----------------------------------------------------------------------------
 * Shared holiday calendar (Danish-style)
 *
 * Schools close for every break; workplaces close between Christmas and New
 * Year and everyone takes three weeks of summer leave somewhere in July. This
 * is what makes group vacations findable in a realistic way: calendars open up
 * when the *whole country's* calendar opens up, not on random weeks.
 * ------------------------------------------------------------------------- */

/** A half-open [start, end) range of whole days, in wall-clock ms. */
interface BreakRange {
  start: number;
  end: number;
}

function buildBreaks(): { school: BreakRange[]; xmas: BreakRange[] } {
  const school: BreakRange[] = [];
  const xmas: BreakRange[] = [];
  const firstYear = new Date(PLAN_START).getUTCFullYear() - 1;
  const lastYear = new Date(PLAN_END).getUTCFullYear() + 1;
  for (let y = firstYear; y <= lastYear; y++) {
    const winter = { start: Date.UTC(y, 1, 14), end: Date.UTC(y, 1, 23) }; // ~uge 7
    const summer = { start: Date.UTC(y, 6, 4), end: Date.UTC(y, 7, 3) }; // July
    const autumn = { start: Date.UTC(y, 9, 12), end: Date.UTC(y, 9, 21) }; // ~uge 42
    const christmas = { start: Date.UTC(y, 11, 21), end: Date.UTC(y + 1, 0, 3) };
    school.push(winter, summer, autumn, christmas);
    xmas.push(christmas);
  }
  return { school, xmas };
}

const BREAKS = buildBreaks();

const inRange = (dayMs: number, r: BreakRange | null): boolean =>
  r !== null && dayMs >= r.start && dayMs < r.end;

const inSchoolBreak = (dayMs: number): boolean =>
  BREAKS.school.some((b) => inRange(dayMs, b));

const inChristmasBreak = (dayMs: number): boolean =>
  BREAKS.xmas.some((b) => inRange(dayMs, b));

/** The first break of a given start month that overlaps the plan window. */
function breakInWindow(month: number): BreakRange | null {
  return (
    BREAKS.school.find(
      (b) =>
        new Date(b.start).getUTCMonth() === month &&
        b.end > PLAN_START &&
        b.start < PLAN_END,
    ) ?? null
  );
}

const SUMMER_WINDOW = breakInWindow(6);
const AUTUMN_WINDOW = breakInWindow(9);
const XMAS_WINDOW = breakInWindow(11);

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

/**
 * A wall-clock time (see the top of the file) as the real instant it happens
 * at in Copenhagen, as an ISO string. The one place generated times cross from
 * "local clock time" into instants.
 */
function iso(wallMs: number): string {
  const d = new Date(wallMs);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60;
  return new Date(
    wallTime(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hours, TZ),
  ).toISOString();
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

/**
 * Generate one person's full calendar across the window, from their traits.
 *
 * The structure mirrors how real calendars work: a *fixed weekly schedule*
 * (the same job days and lecture days every week), *time off* dictated by the
 * shared holiday calendar, *personal trips* booked inside that time off, and
 * a layer of spontaneous plans that only exists a couple of weeks out.
 */
function generateCalendar(personId: string): BusyInterval[] {
  const rng = makeRng(hashSeed(personId));
  const p = rollPersonality(rng);
  const events: BusyInterval[] = [];

  // Real calendars don't double-book: only add an event if its slot is still
  // free. Things are added structural-first, so a fixed commitment (work, a
  // class, the weekly training night) takes precedence over a spontaneous plan.
  //
  // Events are indexed by the days they touch so the clash check only looks at
  // that day's handful of events. Scanning the whole calendar each time made
  // building 21 people's years an O(n²) job that blocked startup for half a
  // second; nothing here is visible to callers except the speed.
  const byDay = new Map<number, { start: number; end: number }[]>();
  const dayIndex = (ms: number) => Math.floor((ms - PLAN_START) / MS_PER_DAY);

  const tryPush = (ev: BusyInterval) => {
    const s = Date.parse(ev.start);
    const e = Date.parse(ev.end);
    const firstDay = dayIndex(s);
    const lastDay = dayIndex(e - 1); // end is exclusive
    for (let d = firstDay; d <= lastDay; d++) {
      for (const iv of byDay.get(d) ?? []) {
        if (iv.start < e && iv.end > s) return;
      }
    }
    events.push(ev);
    const iv = { start: s, end: e };
    for (let d = firstDay; d <= lastDay; d++) {
      const list = byDay.get(d);
      if (list) list.push(iv);
      else byDay.set(d, [iv]);
    }
  };

  // --- The fixed weekly schedule -------------------------------------------
  // Full-timers work Mon-Fri 09:00-17:00; everyone else has a part-time job on
  // the same fixed weekdays every week (the classic studiejob). Students have
  // a lecture timetable on fixed days too.
  const fullTime = p.work >= 4;
  const workDays = fullTime ? [1, 2, 3, 4, 5] : pickWeekdays(rng, p.work);
  const partTimeAfternoon = rng() < 0.5;
  const workTitle = pick(rng, TITLES.workDay);
  const lectureDays = pickWeekdays(rng, Math.min(4, Math.max(0, p.study - 1)));
  const lectureStart = rng() < 0.5 ? 9 : 12;

  // --- Time off --------------------------------------------------------------
  // Workers take three consecutive weeks of summer leave somewhere in the
  // shared July window (plus the Christmas closure). Students are off for
  // every school break.
  let summerLeave: BreakRange | null = null;
  if (SUMMER_WINDOW) {
    const leaveLen = 21 * MS_PER_DAY;
    const maxOffsetDays = Math.max(
      0,
      Math.floor((SUMMER_WINDOW.end - SUMMER_WINDOW.start - leaveLen) / MS_PER_DAY),
    );
    const start =
      SUMMER_WINDOW.start + Math.floor(rng() * (maxOffsetDays + 1)) * MS_PER_DAY;
    summerLeave = { start, end: start + leaveLen };
  }
  const workerOff = (dayMs: number) =>
    inRange(dayMs, summerLeave) || inChristmasBreak(dayMs);

  // --- Christmas itself is family time --------------------------------------
  // Nobody group-vacations over Christmas: the 24th to the 26th are spent
  // with family (and many travel home on the 23rd). Added before everything
  // else so no trip can be booked across those days. What's realistically
  // left of the closure is the stretch between Christmas and New Year.
  for (const b of BREAKS.xmas) {
    if (b.end <= PLAN_START || b.start >= PLAN_END) continue;
    const dec24 = b.start + 3 * MS_PER_DAY; // the break starts on the 21st
    if (rng() < 0.5) {
      tryPush(allDay(dec24 - MS_PER_DAY, "Hjem til familien", "family"));
    }
    tryPush(allDay(dec24, "Juleaften med familien", "family"));
    tryPush(allDay(dec24 + MS_PER_DAY, "Juledag med familien", "family"));
    tryPush(allDay(dec24 + 2 * MS_PER_DAY, "2. juledag med familien", "family"));
  }

  // --- Personal trips, booked inside the time off ----------------------------
  // Being off work doesn't mean being available: many people book their own
  // travel in exactly those weeks, which (added first) blocks everything else.
  if (summerLeave && rng() < 0.55) {
    const len = 6 + Math.floor(rng() * 4); // 6-9 days
    const start =
      summerLeave.start + Math.floor(rng() * (22 - len)) * MS_PER_DAY;
    for (let i = 0; i < len; i++) {
      tryPush(allDay(start + i * MS_PER_DAY, "Sommerferie", "travel"));
    }
  }
  if (XMAS_WINDOW && rng() < 0.25) {
    // A private ski trip or family visit between Christmas and New Year.
    const start = XMAS_WINDOW.start + 6 * MS_PER_DAY; // 27 Dec
    const len = 5 + Math.floor(rng() * 3); // 5-7 days
    for (let i = 0; i < len; i++) {
      tryPush(allDay(start + i * MS_PER_DAY, "Juleferie", "travel"));
    }
  }
  if (AUTUMN_WINDOW && rng() < (p.social + p.family >= 7 ? 0.35 : 0.15)) {
    const len = 3 + Math.floor(rng() * 3); // 3-5 day city break
    const maxOffset = Math.floor(
      (AUTUMN_WINDOW.end - AUTUMN_WINDOW.start) / MS_PER_DAY - len,
    );
    const start =
      AUTUMN_WINDOW.start +
      Math.floor(rng() * (Math.max(0, maxOffset) + 1)) * MS_PER_DAY;
    for (let i = 0; i < len; i++) {
      tryPush(allDay(start + i * MS_PER_DAY, "Efterårsferie", "travel"));
    }
  }

  // OTHER: a couple of *fixed* weekly hobby evenings (recurring) — a stable
  // routine, known well ahead.
  const hobbyNights = pickWeekdays(rng, Math.round(p.other / 2.5)); // 0-2 nights
  const hobbyTitle = pick(rng, TITLES.hobby);

  for (let d = 0; d < PLAN_DAYS; d++) {
    const dayMs = PLAN_START + d * MS_PER_DAY;
    const dow = new Date(dayMs).getUTCDay();
    const weekday = dow >= 1 && dow <= 5;

    // --- Structured commitments: the fixed schedule minus time off. ---
    if (weekday) {
      // WORK — same days every week; gone during leave and the Xmas closure.
      if (p.work >= 1 && workDays.includes(dow) && !workerOff(dayMs)) {
        if (fullTime) {
          tryPush(event(dayMs, 9, 8, workTitle, "work"));
        } else {
          tryPush(event(dayMs, partTimeAfternoon ? 12 : 9, 5, workTitle, "work"));
        }
        // Occasional overtime on a working day bites into the evening.
        if (fullTime && rng() < 0.05) {
          tryPush(event(dayMs, 17, 3, pick(rng, TITLES.workEve), "work"));
        }
      }

      // STUDY — the lecture timetable; paused during every school break.
      if (lectureDays.includes(dow) && !inSchoolBreak(dayMs)) {
        tryPush(event(dayMs, lectureStart, 4, pick(rng, TITLES.studyDay), "school"));
      }
      // Evening study groups are arranged that week, so they fade with the
      // planning horizon (and don't happen in breaks either).
      if (
        p.study >= 3 &&
        !inSchoolBreak(dayMs) &&
        rng() < p.study * 0.08 * planningFactor(dayMs)
      ) {
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
      const start = 18 + Math.floor(rng() * 2); // 18-19: dinners/plans bite early
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
const calendarCache = new Map<string, BusyInterval[]>();

/** One person's generated calendar, built once and kept. */
function calendarFor(id: string): BusyInterval[] {
  let cal = calendarCache.get(id);
  if (!cal) {
    cal = generateCalendar(id);
    calendarCache.set(id, cal);
  }
  return cal;
}

const groupCache = new Map<string, FriendGroup>();

/**
 * One example group, with its people's calendars.
 *
 * Built on demand rather than all ten up front: generating a year of events
 * for sixty people is most of a second's work, and the front page only ever
 * shows one group at a time. The cost lands as each group is first shown, and
 * the cache means a group the carousel comes back around to is free.
 */
export function exampleGroup(id: string): FriendGroup | null {
  const cached = groupCache.get(id);
  if (cached) return cached;

  const def = EXAMPLE_GROUPS.find((g) => g.id === id);
  if (!def) return null;

  const group: FriendGroup = {
    id: def.id,
    name: def.name,
    participants: def.members.map<Participant>((personId) => ({
      profileId: personId,
      name: PEOPLE[personId],
      busy: calendarFor(personId),
    })),
  };
  groupCache.set(id, group);
  return group;
}

/**
 * Build the event for a given friend group: titled after the group, with the
 * shared search window and constraints. Pure (no delay) so the UI can rebuild it
 * instantly when the user switches groups.
 */
export function buildEventForGroup(
  group: FriendGroup,
  opts?: {
    durationMinutes?: number;
    startHour?: number;
    /** Local days of week the event may land on (0 = Sun … 6 = Sat). */
    allowedDays?: number[];
  },
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
    timeZone: TZ,
    constraints: {
      // The picked start time is a *fixed* meeting time: the allowed window is
      // exactly one meeting long, so the engine only ever returns days the whole
      // group is free at that hour. This keeps "Find best/new time" in lock-step
      // with the heatmap (which colours days by availability at the same hour),
      // instead of digging up a late-evening gap on an otherwise-busy day.
      // Deliberately NOT capped at 24: a night out starting 20:00 for 6 hours
      // ends 02:00, and the engine handles windows that spill past midnight.
      earliestHour: startHour,
      latestHour: startHour + durationMinutes / 60,
      excludeWeekends: false,
      allowedDays: opts?.allowedDays,
    },
  };
}
