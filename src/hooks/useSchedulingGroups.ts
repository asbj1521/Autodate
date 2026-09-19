/**
 * Which groups the scheduling page can search, and whose calendars go into
 * each one.
 *
 * Two quite different things arrive in the same shape here, so the page below
 * doesn't have to care which it is looking at:
 *
 * - Real groups from the database, with every member's real busy time. A
 *   member who has not linked a calendar yet is left out of the search rather
 *   than counted as free all year, and named in `waitingFor` so the page can
 *   say who is missing.
 * - Ten made-up example groups, shown only to someone who has no real groups
 *   yet, which the front page cycles through (see useExampleCarousel). A new
 *   account gets something worth watching instead of an empty screen, and
 *   every one of them is labelled an example wherever it appears.
 *
 * The signed-in person's own real calendar is swapped into whichever example
 * is showing, which is what makes them worth watching at all. That swap used
 * to happen silently, leaving people looking at a stranger's name on their own
 * busy time; here it only ever happens inside a group that says it is made up.
 *
 * Only the group actually on screen has its calendars built or fetched. For
 * the examples that means nine groups' worth of generated years never happen;
 * for real groups it means one request rather than one per group.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  groupBusyQuery,
  groupsQuery,
  participantsFromGroup,
  type GroupMember,
} from "@/api/groups";
import { EXAMPLE_GROUPS, exampleGroup, SEARCH_WINDOW } from "@/api/mockData";
import { CURRENT_USER_ID } from "@/api/currentUser";
import { useExampleCarousel, type Carousel } from "@/hooks/useExampleCarousel";
import { displayName, useAuth } from "@/context/auth";
import type { OverviewData } from "@/lib/calendarOverview";
import { busyFromCalendars, withRealCalendar } from "@/lib/realCalendar";
import { callFunction } from "@/lib/supabaseFunctions";
import type { FriendGroup } from "@/types";

/** What the page shows in the switcher: a group, plus how real it is. */
export interface SchedulingGroup extends FriendGroup {
  /** True for the made-up groups shown to people with no groups yet. */
  isExample: boolean;
  /** Real members left out of the search because they have no calendar yet. */
  waitingFor: GroupMember[];
  /**
   * How many people are in it. Not `participants.length`: only the group on
   * screen has its participants built, so the others would all read as empty.
   */
  memberCount: number;
}

export interface SchedulingGroups {
  groups: SchedulingGroup[];
  activeGroup: SchedulingGroup | null;
  activeGroupId: string | null;
  /**
   * Which participant in the active group is you. Your own work conflicts are
   * yours to sign off, so the page has to be able to pick you out; in an
   * example group that is still the stand-in your calendar replaced.
   */
  youProfileId: string | null;
  /** The example carousel, so the page can animate it and stop it. */
  carousel: Carousel;
  /** True while the active group's members' calendars are still loading. */
  busyLoading: boolean;
  /** True if the group's calendars could not be loaded at all. */
  busyFailed: boolean;
  /** True if your own calendars could not be loaded (examples only). */
  myCalendarsFailed: boolean;
  /** True once there is at least one real group, so the examples are gone. */
  hasRealGroups: boolean;
  isLoading: boolean;
}

export function useSchedulingGroups(selectedGroupId: string | null): SchedulingGroups {
  const { user } = useAuth();

  const realQuery = useQuery({ ...groupsQuery(user?.id ?? ""), enabled: !!user });
  // A stable empty array while nothing has loaded, so the memos below aren't
  // rebuilt on every render by a fresh [] each time.
  const realGroups = useMemo(() => realQuery.data ?? [], [realQuery.data]);
  const hasRealGroups = realGroups.length > 0;

  // The carousel only turns while the examples are what's on screen, and it
  // stops for good the first time the person touches the page.
  const showingExamples = !realQuery.isLoading && !hasRealGroups;
  const carousel = useExampleCarousel(EXAMPLE_GROUPS.length, showingExamples);

  // Your own busy time, for the examples only. Real groups get yours from the
  // server along with everyone else's.
  const { data: myCalendars, isError: myCalendarsFailed } = useQuery({
    queryKey: ["calendar-busy", user?.id, "search-window"],
    queryFn: () =>
      callFunction<OverviewData>("calendar-busy", {
        params: { from: SEARCH_WINDOW.start, to: SEARCH_WINDOW.end },
        errorMessage: "Couldn't load your calendars",
      }),
    enabled: !!user && !hasRealGroups,
    staleTime: 60_000,
  });

  // Which group is being scheduled for. A group picked by hand wins; failing
  // that, real groups start at the first and examples follow the carousel, so
  // the page is never left without a selection.
  const candidateIds = hasRealGroups
    ? realGroups.map((g) => g.id)
    : showingExamples
      ? EXAMPLE_GROUPS.map((g) => g.id)
      : [];
  const fallbackId = hasRealGroups
    ? candidateIds[0]
    : EXAMPLE_GROUPS[carousel.index % EXAMPLE_GROUPS.length]?.id;
  const activeGroupId =
    selectedGroupId && candidateIds.includes(selectedGroupId)
      ? selectedGroupId
      : (fallbackId ?? null);

  const busyEnabledId = hasRealGroups ? activeGroupId : null;
  const busyQuery = useQuery({
    ...groupBusyQuery(user?.id ?? "", busyEnabledId, SEARCH_WINDOW.start, SEARCH_WINDOW.end),
    enabled: !!user && !!busyEnabledId,
  });

  const groups = useMemo<SchedulingGroup[]>(() => {
    if (hasRealGroups) {
      return realGroups.map((g) => {
        // Only the active group's calendars are fetched, so the others are
        // listed with no participants until they are selected in turn.
        const data = g.id === activeGroupId ? busyQuery.data : undefined;
        const { participants, waitingFor } = participantsFromGroup(g, data);
        return {
          id: g.id,
          name: g.name,
          participants,
          isExample: false,
          waitingFor,
          memberCount: g.members.length,
        };
      });
    }
    if (!showingExamples) return [];

    return EXAMPLE_GROUPS.map((def) => {
      const base = def.id === activeGroupId ? exampleGroup(def.id) : null;

      // Your real calendar replaces the "you" slot only once there is one:
      // with nothing connected you would read as free all year, which is less
      // honest than leaving the generated calendar in place.
      const withYou =
        base && myCalendars && myCalendars.calendars.length > 0
          ? withRealCalendar(
              [base],
              CURRENT_USER_ID,
              `${displayName(user)} (you)`,
              busyFromCalendars(myCalendars),
            )[0]
          : base;

      return {
        id: def.id,
        name: def.name,
        participants: withYou?.participants ?? [],
        isExample: true,
        waitingFor: [],
        memberCount: def.members.length,
      };
    });
  }, [hasRealGroups, realGroups, showingExamples, activeGroupId, busyQuery.data, myCalendars, user]);

  return {
    groups,
    activeGroup: groups.find((g) => g.id === activeGroupId) ?? null,
    activeGroupId,
    youProfileId: hasRealGroups ? (user?.id ?? null) : CURRENT_USER_ID,
    carousel,
    busyLoading: busyQuery.isLoading && !!busyEnabledId,
    busyFailed: busyQuery.isError,
    myCalendarsFailed: !hasRealGroups && myCalendarsFailed,
    hasRealGroups,
    isLoading: realQuery.isLoading,
  };
}
