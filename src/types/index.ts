/**
 * Core data model for Autodate.
 *
 * Everything in the app hangs off these types. They're written to mirror what a
 * real backend (Supabase) and the calendar providers (Google / Outlook) will
 * eventually hand us, so the mock data layer and the real one share one shape.
 *
 * Time convention: all instants are stored as ISO 8601 strings in UTC
 * (e.g. "2026-06-20T14:00:00.000Z"). We only convert to local time at the UI
 * edge. Keeping the core in UTC avoids an entire category of timezone bugs in
 * the availability engine.
 */

/** Which kind of account a calendar came from. */
export type CalendarProvider = "google" | "outlook" | "apple";

/**
 * A user-facing label for what a calendar is *for*. This is the "mark them after
 * what they are" step — it lets us later support rules like "ignore work
 * calendars on weekends" without changing the data model.
 */
export type CalendarPurpose = "work" | "school" | "personal" | "other";

/** A person using Autodate. */
export interface Profile {
  id: string;
  name: string;
  /** E.164 format preferred (e.g. "+4512345678"), but not enforced yet. */
  phone: string;
  calendars: Calendar[];
}

/** One connected calendar belonging to a profile. */
export interface Calendar {
  id: string;
  /** The profile this calendar belongs to. */
  ownerId: string;
  provider: CalendarProvider;
  purpose: CalendarPurpose;
  /** Display name, usually the account email or calendar name. */
  label: string;
}

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
  /** Optional constraints on what counts as an acceptable slot. */
  constraints?: SchedulingConstraints;
}

/**
 * Optional rules that narrow down what counts as a valid meeting slot.
 * Everything here is optional so the engine has sensible defaults.
 */
export interface SchedulingConstraints {
  /**
   * Earliest hour of day a meeting may start, 0-23 local-ish (applied in UTC
   * for now; timezone-aware day windows come later). Defaults to 0.
   */
  earliestHour?: number;
  /** Latest hour of day a meeting may *end*, 1-24. Defaults to 24. */
  latestHour?: number;
  /** If true, Saturdays and Sundays are excluded. Defaults to false. */
  excludeWeekends?: boolean;
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
