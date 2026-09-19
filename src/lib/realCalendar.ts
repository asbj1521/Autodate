/**
 * The bridge between the signed-in person's real calendars and the
 * scheduling engine.
 *
 * What is stored per busy block is only its time range and which calendar it
 * came from; the calendar carries the category the person gave it. The
 * engine wants each block to say whether it is work/school (which you could
 * take time off from) or anything else (which rules the time out), so the
 * calendar's category is copied onto its blocks here.
 *
 * Only the signed-in person's calendar is real. Everyone else in a group is
 * still generated until they have accounts of their own, so this swaps one
 * participant and leaves the rest alone.
 */
import type { OverviewData } from "@/lib/calendarOverview";
import type { BusyInterval, EventCategory, FriendGroup } from "@/types";

/**
 * Which calendar categories carry over to the engine. Work and school are the
 * "soft" kinds the multi-day rules treat as time you could take off; personal,
 * other and uncategorised calendars carry no category, so their blocks simply
 * count as busy.
 */
const CATEGORY_FOR_PURPOSE: Partial<Record<string, EventCategory>> = {
  work: "work",
  school: "school",
};

/**
 * The person's blocks in the engine's shape. The calendar's own name goes in
 * `title`, which is what the approval banner shows ("you have Work in your
 * calendar"): the person's own label for their own calendar, never an event
 * title, since none are stored.
 */
export function busyFromCalendars(data: OverviewData): BusyInterval[] {
  const byId = new Map(data.calendars.map((c) => [c.id, c]));
  const busy: BusyInterval[] = [];
  for (const b of data.blocks) {
    const cal = byId.get(b.calendarId);
    if (!cal) continue; // a block from a calendar that's no longer listed
    busy.push({
      start: b.start,
      end: b.end,
      calendarId: b.calendarId,
      title: cal.name,
      category: cal.purpose ? CATEGORY_FOR_PURPOSE[cal.purpose] : undefined,
    });
  }
  return busy;
}

/**
 * The groups with one participant's generated calendar replaced by real busy
 * time (and their real name). Groups they aren't in come back unchanged, and
 * nothing is modified in place: the generated groups are shared and cached.
 */
export function withRealCalendar(
  groups: FriendGroup[],
  profileId: string,
  name: string,
  busy: BusyInterval[],
): FriendGroup[] {
  return groups.map((g) =>
    g.participants.some((p) => p.profileId === profileId)
      ? {
          ...g,
          participants: g.participants.map((p) =>
            p.profileId === profileId ? { ...p, name: name || p.name, busy } : p,
          ),
        }
      : g,
  );
}
