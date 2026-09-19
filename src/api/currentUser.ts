/**
 * Who is using the app.
 *
 * Deliberately its own module rather than a constant on the mock data layer:
 * the profile and calendar-overview pages are backed by real Supabase data and
 * need nothing from the generator, but importing this id from there pulled
 * twenty-one generated calendars into both pages for the sake of one string.
 *
 * Real phone-number login replaces this; until then, conflict review ("you
 * have work that week" vs "waiting for Simon to approve") hinges on knowing
 * whose calendar is whose.
 */
export const CURRENT_USER_ID = "asbjorn";
