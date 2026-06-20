/**
 * Mock data layer.
 *
 * Stands in for what will eventually be Supabase + the real Google/Outlook
 * free-busy APIs. The important thing is the *shape* of what these functions
 * return: when we wire up real backends later, only the insides change — the
 * rest of the app keeps calling `getMockGroups()` / `buildEventForGroup()` the
 * same way.
 *
 * The model: a user belongs to several friend groups, each with its own people
 * and their busy time. An event is always created for one chosen group.
 */

import type { BusyInterval, Event, FriendGroup, Participant } from "@/types";

/** Build a participant with the given busy blocks. */
function person(
  id: string,
  name: string,
  blocks: BusyInterval[],
): Participant {
  return { profileId: id, name, busy: blocks };
}

// We schedule across the full day (00:00–24:00) so any start time is valid.
export const DAY_START = 0;
export const DAY_END = 24;

// Busy data is generated across June and July, so a rolling window that crosses
// the month boundary always has realistic data on both sides.
const PLAN_START = Date.UTC(2026, 5, 1); // 1 June 2026, 00:00 UTC
const PLAN_DAYS = 61; // June + July

// The search window covers the generated range. Weekends are allowed — this is
// mainly for events in the user's private life.
const SEARCH_START = "2026-06-01T00:00:00.000Z";
const SEARCH_END = "2026-08-01T00:00:00.000Z"; // 1 August (exclusive)

/**
 * A realistic per-day "how many can meet" plan for a group of `total` people
 * across June (30 days). Real calendars are busy, so most days only a few people
 * are free; a handful of days nobody is free; and only two days (the 12th and
 * 25th) line up for everyone. Deterministic given a seed.
 */
function freePlan(total: number, seed: number): number[] {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  // Most days at least one person is free, and never accidentally "everyone".
  const plan = Array.from({ length: PLAN_DAYS }, () =>
    1 + Math.round(rnd() * (total - 2)),
  );
  [21, 33, 47].forEach((i) => (plan[i] = 0)); // a few days nobody is free
  // Jun 24, Jul 7, Jul 15 line up for everyone — spread across the window.
  [23, 36, 44].forEach((i) => (plan[i] = total));
  return plan;
}

/**
 * Turn a free-plan into participants. On each day, `freeCount` people are free
 * and the rest are busy through the whole working window; we rotate who is free
 * so it isn't always the same people.
 */
function plannedParticipants(
  people: ReadonlyArray<readonly [string, string]>,
  seed: number,
): Participant[] {
  const total = people.length;
  const plan = freePlan(total, seed);
  const busyByPerson: BusyInterval[][] = people.map(() => []);

  plan.forEach((freeCount, dayIdx) => {
    const free = new Set<number>();
    for (let k = 0; k < freeCount; k++) free.add((dayIdx + k) % total);
    // Busy people are busy the whole day; build a full-day block in UTC.
    const startMs = PLAN_START + dayIdx * 86_400_000;
    const block: BusyInterval = {
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + 86_400_000).toISOString(),
    };
    people.forEach((_, i) => {
      if (!free.has(i)) busyByPerson[i].push(block);
    });
  });

  return people.map(([id, name], i) => person(id, name, busyByPerson[i]));
}

const HIGHSCHOOL = [
  ["alice", "Alice"],
  ["bob", "Bob"],
  ["charlie", "Charlie"],
  ["david", "David"],
  ["emma", "Emma"],
  ["felix", "Felix"],
  ["hannah", "Hannah"],
] as const;

const WORK = [
  ["diana", "Diana"],
  ["erik", "Erik"],
  ["frank", "Frank"],
  ["grace", "Grace"],
] as const;

const CLIMBING = [
  ["gina", "Gina"],
  ["sara", "Sara"],
] as const;

/**
 * The user's friend groups. Each group's availability is generated to look
 * realistic — busy most days, with only a couple of days where everyone lines up.
 */
const GROUPS: FriendGroup[] = [
  {
    id: "highschool",
    name: "The highschool group",
    participants: plannedParticipants(HIGHSCHOOL, 7),
  },
  {
    id: "work",
    name: "Work team",
    participants: plannedParticipants(WORK, 13),
  },
  {
    id: "climbing",
    name: "Climbing buddies",
    participants: plannedParticipants(CLIMBING, 29),
  },
];

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
  return {
    id: `event-${group.id}`,
    title: group.name,
    organizerId: group.participants[0]?.profileId ?? "",
    participants: group.participants,
    durationMinutes: opts?.durationMinutes ?? 60,
    searchStart: SEARCH_START,
    searchEnd: SEARCH_END,
    constraints: {
      earliestHour: opts?.startHour ?? 18,
      latestHour: DAY_END,
      excludeWeekends: false,
    },
  };
}
