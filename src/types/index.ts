/**
 * Core data model for Autodate.
 *
 * Everything in the app hangs off these types. They're written to mirror what a
 * real backend (Supabase) and the calendar providers (Google / Outlook) will
 * eventually hand us, so the mock data layer and the real one share one shape.
 *
 * Time convention: all instants are stored as ISO 8601 strings in UTC
 * (e.g. "2026-06-20T14:00:00.000Z"): a busy block is a moment in time no
 * matter where anyone is. What *is* local is how people describe a meeting,
 * "18:00 on a Friday", so those settings are read in the event's time zone
 * (see src/lib/zone.ts) and turned into instants before any comparison.
 */

/** Which kind of account a calendar came from. */
export type CalendarProvider = "google" | "outlook" | "apple" | "ics";

/**
 * A user-facing label for what a calendar is *for*. This is the "mark them after
 * what they are" step — it lets us later support rules like "ignore work
 * calendars on weekends" without changing the data model.
 */
export type CalendarPurpose = "work" | "school" | "personal" | "other";

/**
 * A coarse category for a busy block, used for colouring/filtering in our fake
 * test data. Real free/busy feeds won't include this (nor a title) — both are
 * optional so the same `BusyInterval` shape covers mock and real data.
 */
export type EventCategory =
  | "work"
  | "school"
  | "social"
  | "health"
  | "travel"
  | "personal"
  | "family";

/**
 * A single block of time during which someone is unavailable.
 *
 * This is deliberately *just* a time range — no event title, location, or
 * attendees. Both Google and Outlook expose a "free/busy" API that returns
 * exactly this and nothing more, which is both a privacy win and less data to
 * handle. `start` is inclusive, `end` is exclusive.
 */
export interface BusyInterval {
  /** ISO 8601 UTC instant, inclusive. */
  start: string;
  /** ISO 8601 UTC instant, exclusive. */
  end: string;
  /** Which calendar this busy block came from (for debugging / filtering). */
  calendarId?: string;
  /** Optional human-readable title (present in fake/test data; real free/busy omits it). */
  title?: string;
  /** Optional category, for colouring/filtering in test data. */
  category?: EventCategory;
}

/** A person invited to an event, plus their aggregated busy time. */
export interface Participant {
  profileId: string;
  name: string;
  /** Merged busy intervals across all of this participant's calendars. */
  busy: BusyInterval[];
}

/**
 * A named circle of friends a user schedules with — "The highschool group",
 * "Work team", etc. One profile can belong to many groups, and an event is
 * always created for exactly one group.
 */
export interface FriendGroup {
  id: string;
  name: string;
  participants: Participant[];
}

/** An event someone is trying to schedule. */
export interface Event {
  id: string;
  title: string;
  /** Profile id of whoever created the event. */
  organizerId: string;
  participants: Participant[];
  /** How long the meeting needs to be, in minutes. */
  durationMinutes: number;
  /** The window to search within, as ISO 8601 UTC instants. */
  searchStart: string;
  searchEnd: string;
  /**
   * IANA zone the constraints' hours and weekdays are read in, e.g.
   * "Europe/Copenhagen". Required, so no search silently falls back to UTC.
   */
  timeZone: string;
  /** Optional constraints on what counts as an acceptable slot. */
  constraints?: SchedulingConstraints;
}

/**
 * Optional rules that narrow down what counts as a valid meeting slot.
 * Everything here is optional so the engine has sensible defaults.
 */
export interface SchedulingConstraints {
  /**
   * Earliest local hour of day a meeting may start, 0-23 (fractions allowed).
   * Defaults to 0.
   */
  earliestHour?: number;
  /**
   * Latest local hour of day a meeting may *end*, 1-24 — or beyond 24 to let the
   * window spill past midnight (e.g. 26 = 02:00 the next day, for night events).
   * Defaults to 24.
   */
  latestHour?: number;
  /** If true, Saturdays and Sundays are excluded. Defaults to false. */
  excludeWeekends?: boolean;
  /**
   * Which days of the week may host the event, as local day-of-week values
   * (0 = Sunday … 6 = Saturday). A window is kept if it *starts* on an allowed
   * day, so a Friday night out that ends 02:00 Saturday counts as Friday.
   * Omitted = all seven days.
   */
  allowedDays?: number[];
}

/** The result of running the availability engine. */
export interface SchedulingResult {
  /** The earliest slot that works, or null if none was found. */
  slot: TimeSlot | null;
  /**
   * Up to a handful of alternative slots after the first, for UX ("here are a
   * few options"). Empty if none found.
   */
  alternatives: TimeSlot[];
}

/** A concrete proposed meeting time. */
export interface TimeSlot {
  /** ISO 8601 UTC instant. */
  start: string;
  /** ISO 8601 UTC instant. */
  end: string;
}
