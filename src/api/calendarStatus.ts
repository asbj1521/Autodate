/**
 * The "which calendars are actually linked" query.
 *
 * It lives here rather than inside the profile page so anything can warm it
 * up: the nav prefetches it the moment someone looks like they are heading to
 * the profile, which is most of the wait gone before the page even mounts.
 */
import { queryOptions } from "@tanstack/react-query";

import { callFunction } from "@/lib/supabaseFunctions";
import type { CalendarProvider } from "@/types";

/** One calendar discovered within a connected account (see calendar_sources). */
export interface CalendarSourceStatus {
  id: string;
  display_name: string | null;
  purpose: "work" | "school" | "personal" | "other" | null;
}

/** A linked account's real, persisted state: what calendar-status returns. */
export interface CalendarConnectionStatus {
  id: string;
  provider: CalendarProvider;
  status: "pending" | "connected" | "error";
  account_label: string | null;
  error_message: string | null;
  created_at: string;
  last_synced_at: string | null;
  calendar_sources: CalendarSourceStatus[];
  busyCount: number;
}

/**
 * Backed by the database via the calendar-status Edge Function, so "connected"
 * is a real, persistent fact rather than a banner that shows up once and
 * vanishes on refresh.
 *
 * The call costs a third of a second against a live Supabase project, so the
 * answer is held for a while: connecting and disconnecting both refetch
 * explicitly, which is what actually changes it. Without that, every visit to
 * the page sat on a spinner waiting to be told what it already knew.
 *
 * `userId` only keys the cache, so one person's answer is never served to the
 * next; the function itself learns who is asking from the login token.
 */
export function calendarStatusQuery(userId: string) {
  return queryOptions({
    queryKey: ["calendar-status", userId],
    queryFn: async (): Promise<CalendarConnectionStatus[]> => {
      const body = await callFunction<{
        connections?: CalendarConnectionStatus[];
      }>("calendar-status");
      return body.connections ?? [];
    },
    staleTime: 60_000,
  });
}
