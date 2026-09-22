import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Hourglass,
  Lightbulb,
  Loader2,
  Send,
  Sparkles,
  Tag,
} from "lucide-react";

import { eventsQueryKey, suggestEvent } from "@/api/events";
import {
  createGroup,
  createInvite,
  groupsQueryKey,
  leaveGroup,
  type Group,
} from "@/api/groups";
import {
  buildEventForGroup,
  DAY_END,
  DAY_START,
  SEARCH_WINDOW,
} from "@/api/mockData";
import {
  findVacationSuggestions,
  type MultiDayResult,
  type VacationSuggestion,
  type WeeklySpanShape,
} from "@/lib/availability";
import { findEventSlot, type EventSettings } from "@/lib/eventSearch";
import { buildMonthGrid } from "@/lib/heatmap";
import { useSchedulingGroups } from "@/hooks/useSchedulingGroups";
import { useAuth } from "@/context/auth";
import { formatDaySpan, formatSlot, formatTime, formatTripSpan } from "@/lib/format";
import { avatarColor } from "@/lib/avatar";
import { ACCENT_RGB, AMBER_RGB } from "@/lib/colors";
import { dayOf, monthStartMs } from "@/lib/day";
import { ALL_DOWS } from "@/lib/weekdays";
import { cn } from "@/lib/utils";
import { addDays, APP_TIME_ZONE, localDate, startOfMonth } from "@/lib/zone";
import CalendarPanel from "@/components/CalendarPanel";
import DaySlider from "@/components/DaySlider";
import Dropdown from "@/components/Dropdown";
import GroupPanel from "@/components/GroupPanel";
import GroupSwitcher from "@/components/GroupSwitcher";
import NewGroupDialog from "@/components/NewGroupDialog";
import TopNav from "@/components/TopNav";

/**
 * The zone every search and every day on this page is local to. One constant
 * for now; once groups exist for real, each group carries its own.
 */
const TZ = APP_TIME_ZONE;

/** Today as a local-midnight ISO (computed once), so the calendar can circle it. */
const TODAY_DAY = dayOf(new Date().toISOString(), TZ);

/** First-of-month (ms) for the month containing today — the default view. */
const DEFAULT_MONTH = monthStartMs(Date.parse(TODAY_DAY), TZ);
/** Navigable month range: from this month up to the last month with data. */
const MIN_MONTH = Math.max(
  DEFAULT_MONTH,
  monthStartMs(Date.parse(SEARCH_WINDOW.start), TZ),
);
const MAX_MONTH = monthStartMs(Date.parse(SEARCH_WINDOW.end) - 1, TZ);

/**
 * Horizontal slide + motion-blur used when the calendar pages to a new date
 * range. Moving forward in time, the new range sweeps in from the right while
 * the old one blurs off to the left; `dir` flips it for going back.
 */
const calendarSlide = {
  enter: (dir: number) => ({
    x: dir >= 0 ? "55%" : "-55%",
    opacity: 0,
    filter: "blur(14px)",
  }),
  center: { x: "0%", opacity: 1, filter: "blur(0px)" },
  exit: (dir: number) => ({
    x: dir >= 0 ? "-55%" : "55%",
    opacity: 0,
    filter: "blur(14px)",
  }),
};

/** Format minutes as a friendly duration label, e.g. 90 -> "1 h 30 min". */
function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h} h ${m} min`;
}

/** How long the event should last: 30 min … 12 hours, in 30-min steps. */
const DURATION_OPTIONS = Array.from({ length: 24 }, (_, i) => (i + 1) * 30).map(
  (v) => ({ label: formatDuration(v), value: v }),
);

/** What time of day the event should start: every hour of the day. */
const START_OPTIONS = Array.from({ length: 24 }, (_, h) => h)
  .filter((h) => h >= DAY_START && h < DAY_END)
  .map((h) => ({ label: `${String(h).padStart(2, "0")}:00`, value: h }));

/**
 * The kinds of event you can schedule.
 * - "single" types preset duration + start time (both still adjustable) and
 *   support picking which days of the week are searched.
 * - "trip" is anchored to a weekly window (default Friday after work to
 *   Sunday evening); the day slider defines which days the trip covers.
 * - "vacation" is N whole days anywhere; only the days wheel applies.
 */
interface EventTypeDef {
  id: string;
  label: string;
  kind: "single" | "trip" | "vacation";
  /** Presets for single-day types. */
  durationMinutes?: number;
  startHour?: number;
  /** Default length for vacations. */
  defaultDays?: number;
  /** Default searched/covered days of week (local values); omitted = all. */
  defaultDows?: number[];
}

const EVENT_TYPES: EventTypeDef[] = [
  { id: "evening", label: "Evening", kind: "single", durationMinutes: 180, startHour: 18 },
  { id: "lunch", label: "Lunch", kind: "single", durationMinutes: 90, startHour: 12 },
  { id: "dinner", label: "Dinner", kind: "single", durationMinutes: 120, startHour: 18 },
  { id: "gaming", label: "Gaming session", kind: "single", durationMinutes: 300, startHour: 19, defaultDows: [5, 6, 0] },
  { id: "nightout", label: "Night out", kind: "single", durationMinutes: 360, startHour: 20, defaultDows: [5, 6] },
  { id: "weekend", label: "Weekend trip", kind: "trip", defaultDows: [5, 6, 0] },
  { id: "vacation", label: "Vacation", kind: "vacation", defaultDays: 7 },
];

/**
 * When a weekend trip starts and ends. 17:00 is "after work" in the demo data
 * (workdays run 09:00 to 17:00), so a normal Friday at the office doesn't show
 * up as a conflict on every single weekend; 21:00 is "Sunday evening, home in
 * time for the week".
 */
const TRIP_START_HOUR = 17;
const TRIP_END_HOUR = 21;

/** Wheel options for the type picker (value = index into EVENT_TYPES). */
const TYPE_OPTIONS = EVENT_TYPES.map((t, i) => ({ label: t.label, value: i }));

/** How many days a multi-day event needs: 1 to 30. */
const DAYS_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1).map((d) => ({
  label: d === 1 ? "1 day" : `${d} days`,
  value: d,
}));

/**
 * Where every search starts from: today, or the window start if that's later.
 * The past is never searched, and all four event kinds share this anchor.
 */
const SEARCH_BASE =
  Date.parse(TODAY_DAY) > Date.parse(SEARCH_WINDOW.start)
    ? TODAY_DAY
    : SEARCH_WINDOW.start;

/** "Simon", "Simon and Nora", or "Simon, Nora and 2 more". */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

/**
 * Step back and forward through the recommended times found this session.
 * Back only replays what's already been seen (never searches); forward
 * searches for the next occurrence once it runs past what's cached.
 */
function FindStepper({
  canGoBack,
  onPrev,
  onNext,
}: {
  canGoBack: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="inline-flex items-center divide-x overflow-hidden rounded-lg border bg-card">
      <button
        onClick={onPrev}
        disabled={!canGoBack}
        aria-label="Previous recommended time"
        className="flex h-9 w-9 items-center justify-center text-foreground transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={onNext}
        aria-label="Next recommended time"
        className="flex h-9 w-9 items-center justify-center text-foreground transition hover:bg-secondary"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function FindDate() {
  const [copied, setCopied] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [eventTypeIdx, setEventTypeIdx] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [startHour, setStartHour] = useState(18);
  const [days, setDays] = useState(7);
  // Which days of the week are active in the day slider (searched days for
  // single events, covered days for a trip).
  const [selectedDows, setSelectedDows] = useState<number[]>(ALL_DOWS);
  // Multi-day spans with work/school conflicts need the user's sign-off; this
  // holds the slot start they accepted (null = nothing accepted yet).
  const [acceptedSlot, setAcceptedSlot] = useState<string | null>(null);
  // The search anchors visited this "session": history[0] is the first result
  // (from today), and each later entry is the next occurrence past the one
  // before it. historyIndex is which one is on screen; the back/forward
  // arrows just move it, only searching for a new entry when stepping past
  // the end. Empty (-1) means nothing has been searched yet — changing any
  // setting resets to this, so the engine only ever runs when asked to.
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const hasSearched = historyIndex >= 0;
  const searchFrom = hasSearched ? history[historyIndex] : null;
  // Which month the calendar shows (first-of-month ms), and which way it slides.
  const [viewMonth, setViewMonth] = useState(DEFAULT_MONTH);
  const [slideDir, setSlideDir] = useState(1);
  // Bumped by the Find buttons to ask the calendar to page to the new result.
  const [revealRequest, setRevealRequest] = useState(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Don't leave the "Copied!" timer running after the page goes away.
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Real groups and everyone's real busy time, or the labelled example group
  // for someone who has not made a group yet. See the hook for which is which.
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    groups,
    activeGroup,
    activeGroupId,
    busyLoading,
    busyFailed,
    myCalendarsFailed,
    youProfileId,
    carousel,
  } = useSchedulingGroups(selectedGroupId);

  /**
   * Any touch of either card stops the example carousel, for good.
   *
   * One capture handler per card rather than a call inside every button: the
   * rule is "if you are using the page, it is not a demo any more", and that
   * is easier to keep true in one place than across a dozen handlers that
   * will grow over time. Pinning the current example as the selection too,
   * so it can't move on between the click and the next render.
   */
  function stopCarousel() {
    if (!carousel.running) return;
    setSelectedGroupId((id) => id ?? activeGroupId);
    carousel.stop();
  }

  // Anything that changes membership answers with the new list of groups, so
  // the cache is filled from the reply instead of asking for it again.
  const onGroupsChanged = (data: { groups: Group[] }) => {
    queryClient.setQueryData(groupsQueryKey(user?.id ?? ""), data.groups);
  };

  const createMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: (data) => {
      onGroupsChanged(data);
      setSelectedGroupId(data.createdId);
      setNewGroupOpen(false);
    },
  });

  const inviteMutation = useMutation({ mutationFn: createInvite });

  // Suggesting the date on screen to the group. The answer is the fresh list
  // of events, which goes straight into the cache the header badge reads.
  const suggestMutation = useMutation({
    mutationFn: suggestEvent,
    onSuccess: (data) => queryClient.setQueryData(eventsQueryKey(user?.id ?? ""), data.events),
  });

  const leaveMutation = useMutation({
    mutationFn: leaveGroup,
    onSuccess: (data) => {
      onGroupsChanged(data);
      setSelectedGroupId(null);
      inviteMutation.reset();
    },
  });

  // A link belongs to the group it was made for; switching groups must not
  // leave the previous group's invite on screen.
  const invite =
    inviteMutation.data && inviteMutation.variables === activeGroupId
      ? inviteMutation.data
      : null;

  const eventType = EVENT_TYPES[eventTypeIdx];
  const isMultiDay = eventType.kind !== "single";

  // The trip's weekly window, derived from the day slider: it runs from the
  // first selected day (Monday-first order) through the last, starting after
  // work on the first day and ending in the evening of the last.
  const tripShape = useMemo<WeeklySpanShape | null>(() => {
    if (eventType.kind !== "trip") return null;
    const idxs = selectedDows
      .map((d) => ALL_DOWS.indexOf(d))
      .sort((a, b) => a - b);
    return {
      anchorDow: ALL_DOWS[idxs[0]],
      spanDays: idxs[idxs.length - 1] - idxs[0] + 1,
      startHour: TRIP_START_HOUR,
      endHour: TRIP_END_HOUR,
    };
  }, [eventType, selectedDows]);

  // The event reflects the chosen duration + start time + searched days.
  const event = useMemo(
    () =>
      activeGroup
        ? buildEventForGroup(activeGroup, {
            durationMinutes,
            startHour,
            allowedDays:
              eventType.kind === "single" && selectedDows.length < 7
                ? selectedDows
                : undefined,
          })
        : null,
    [activeGroup, durationMinutes, startHour, eventType, selectedDows],
  );

  // The month calendar, tinted by availability for the current event shape.
  const monthGrid = useMemo(() => {
    if (!activeGroup) return null;
    const vm = localDate(viewMonth, TZ);
    return buildMonthGrid(
      activeGroup.participants,
      vm.year,
      vm.month,
      {
        timeZone: TZ,
        startHour,
        durationMinutes,
        todayMs: Date.parse(TODAY_DAY),
        allowedDays:
          eventType.kind === "single" && selectedDows.length < 7
            ? selectedDows
            : undefined,
        multiDay:
          eventType.kind === "vacation"
            ? { windowEndMs: Date.parse(SEARCH_WINDOW.end) }
            : undefined,
        weeklySpan:
          eventType.kind === "trip" && tripShape
            ? { ...tripShape, windowEndMs: Date.parse(SEARCH_WINDOW.end) }
            : undefined,
      },
    );
  }, [
    activeGroup,
    viewMonth,
    startHour,
    durationMinutes,
    eventType,
    selectedDows,
    tripShape,
  ]);

  // What is being searched for, as data. The same settings travel with a
  // suggested event, so a decline re-runs exactly this search (eventSearch.ts).
  const settings = useMemo<EventSettings | null>(() => {
    if (eventType.kind === "vacation") return { kind: "vacation", days };
    if (eventType.kind === "trip") return tripShape ? { kind: "trip", shape: tripShape } : null;
    return {
      kind: "single",
      durationMinutes,
      startHour,
      allowedDays: selectedDows.length < 7 ? selectedDows : undefined,
    };
  }, [eventType, days, tripShape, durationMinutes, startHour, selectedDows]);

  // The search itself: single meetings need the whole group free at that
  // hour; multi-day spans let work/school through as conflicts to review.
  // Cheap and pure, so it simply follows the settings; what's shown is gated
  // on hasSearched below.
  const found = useMemo<MultiDayResult | null>(() => {
    if (!activeGroup || !settings) return null;
    return findEventSlot(
      activeGroup.participants,
      settings,
      searchFrom ?? SEARCH_BASE,
      SEARCH_WINDOW.end,
      TZ,
    );
  }, [activeGroup, settings, searchFrom]);
  const result = isMultiDay ? null : found;
  const multiResult = isMultiDay ? found : null;

  // Workarounds for vacations that don't work cleanly: "6 days works for
  // everyone if you leave after work Friday" and the like.
  const suggestions = useMemo<VacationSuggestion[]>(() => {
    if (eventType.kind !== "vacation" || !activeGroup || !multiResult) return [];
    if (multiResult.slot && multiResult.conflicts.length === 0) return [];
    return findVacationSuggestions(
      activeGroup.participants,
      days,
      searchFrom ?? SEARCH_BASE,
      SEARCH_WINDOW.end,
      TZ,
    );
  }, [eventType, activeGroup, multiResult, days, searchFrom]);

  // Whichever search is active (single meeting vs multi-day span), the slot it
  // found drives the calendar highlight and the banner — but only once asked
  // for. Before that, result/multiResult are still computed underneath (a
  // cheap, pure function of whatever the settings currently are), just not
  // surfaced: nothing highlights or appears until "Find best time" is pressed.
  const activeSlot = hasSearched
    ? ((isMultiDay ? multiResult?.slot : result?.slot) ?? null)
    : null;

  // The day (local-midnight ISO) containing the best slot, for highlighting.
  const bestDay = activeSlot ? dayOf(activeSlot.start, TZ) : null;

  // "11:00"-style label for the best slot's start time; meaningless for
  // whole-day spans, so omitted there.
  const bestTimeLabel =
    activeSlot && !isMultiDay ? formatTime(activeSlot.start) : null;

  /**
   * Changing any setting clears the search entirely: nothing is shown again
   * until "Find best time" is pressed, rather than a new result silently
   * appearing for whatever was just changed.
   */
  function clearSearch() {
    setHistory([]);
    setHistoryIndex(-1);
    setAcceptedSlot(null);
  }

  /** Start a fresh search from `from` (null = today) and reveal its result. */
  function runSearch(from: string | null) {
    setHistory([from]);
    setHistoryIndex(0);
    setAcceptedSlot(null);
    setRevealRequest((n) => n + 1);
  }

  /** Adopt a suggested workaround: shorter stay, anchored on its dates. */
  function applySuggestion(s: VacationSuggestion) {
    setDays(s.days);
    const anchor = dayOf(s.slot.start, TZ);
    setHistory([anchor]);
    setHistoryIndex(0);
    setAcceptedSlot(null);
    revealDay(anchor);
  }

  function handleSelectGroup(id: string) {
    setSelectedGroupId(id);
    clearSearch(); // a new group's best time is unknown until searched for
    setSlideDir(-1);
    setViewMonth(DEFAULT_MONTH); // show the new group from the current month
    inviteMutation.reset(); // a link belongs to the group it was made for
  }

  /**
   * "New group" from the switcher. Making a group needs an account, since a
   * group with no owner is nobody's; anyone signed out is sent to sign in
   * first and comes straight back here.
   */
  function handleNewGroup() {
    if (!user) {
      navigate("/sign-in?next=/");
      return;
    }
    createMutation.reset();
    setNewGroupOpen(true);
  }

  function handleEventType(idx: number) {
    const t = EVENT_TYPES[idx];
    setEventTypeIdx(idx);
    // Apply the type's presets so the pickers land somewhere sensible.
    if (t.kind === "vacation") {
      setDays(t.defaultDays ?? 7);
    } else if (t.kind === "single") {
      setDurationMinutes(t.durationMinutes ?? 60);
      setStartHour(t.startHour ?? 18);
    }
    setSelectedDows(t.defaultDows ?? ALL_DOWS);
    clearSearch();
  }

  function handleDows(dows: number[]) {
    let next = dows;
    // A trip is one continuous stay: selecting Thu alongside Fri-Sun extends
    // the run, and any gap in between is filled in automatically.
    if (eventType.kind === "trip") {
      const idxs = dows.map((d) => ALL_DOWS.indexOf(d)).sort((a, b) => a - b);
      next = ALL_DOWS.slice(idxs[0], idxs[idxs.length - 1] + 1);
    }
    setSelectedDows(next);
    clearSearch();
  }

  function handleDuration(value: number) {
    setDurationMinutes(value);
    clearSearch();
  }

  function handleStartHour(value: number) {
    setStartHour(value);
    clearSearch();
  }

  function handleDays(value: number) {
    setDays(value);
    clearSearch();
  }

  /**
   * Page the calendar to the month containing `dayIso`. If that month is already
   * shown we leave the view alone (no animation); otherwise we slide there —
   * forward in time sweeps the new month in from the right, back reverses it.
   */
  function revealDay(dayIso: string) {
    const month = monthStartMs(Date.parse(dayIso), TZ);
    if (month === viewMonth) return;
    setSlideDir(month > viewMonth ? 1 : -1);
    setViewMonth(month);
  }

  /**
   * Page the calendar to whatever the Find buttons just turned up. They only
   * bump `revealRequest`; by the time this runs, the memos above have already
   * recomputed, so `activeSlot` here is the new result. Running the search a
   * second time inside the click handler was both wasted work and a chance for
   * the two answers to disagree.
   */
  useEffect(() => {
    if (revealRequest === 0 || !activeSlot) return;
    revealDay(dayOf(activeSlot.start, TZ));
    // Deliberately keyed on the request alone: changing a setting recomputes
    // activeSlot too, and that must not move the calendar on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealRequest]);

  /** Step the calendar a month back (-1) or forward (+1), within the data range. */
  function pageMonth(delta: number) {
    const month = startOfMonth(viewMonth, TZ, delta);
    if (month < MIN_MONTH || month > MAX_MONTH) return;
    setSlideDir(delta);
    setViewMonth(month);
  }

  /** Find the earliest slot from today and page the calendar to it. */
  function handleFindBest() {
    runSearch(null);
  }

  /**
   * Step forward: if the next occurrence was already searched for earlier
   * this session (the user stepped back), just reveal it again; otherwise
   * search past the current slot's day for it.
   */
  function handleFindNext() {
    if (!activeSlot) return;
    if (historyIndex + 1 < history.length) {
      setHistoryIndex(historyIndex + 1);
    } else {
      const nextDay = addDays(Date.parse(activeSlot.start), 1, TZ);
      setHistory((h) => [...h, new Date(nextDay).toISOString()]);
      setHistoryIndex(historyIndex + 1);
    }
    setAcceptedSlot(null);
    setRevealRequest((n) => n + 1);
  }

  /** Step back to the occurrence shown just before this one. Never searches. */
  function handleFindPrev() {
    if (historyIndex <= 0) return;
    setHistoryIndex(historyIndex - 1);
    setAcceptedSlot(null);
    setRevealRequest((n) => n + 1);
  }

  /** Suggest the date on screen to everyone in the group. */
  function handleSuggest() {
    if (!activeGroup || !activeSlot || !settings) return;
    suggestMutation.mutate({
      groupId: activeGroup.id,
      title: eventType.label,
      settings,
      date: { start: activeSlot.start, end: activeSlot.end },
    });
  }

  function handleCopy() {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1800);
  }

  // How many calendar days the best slot's highlight covers.
  const bestSpanDays =
    eventType.kind === "vacation"
      ? days
      : eventType.kind === "trip"
        ? (tripShape?.spanDays ?? 1)
        : 1;

  // The banner's headline text for the found slot, per event kind.
  const slotLabel = activeSlot
    ? eventType.kind === "vacation"
      ? formatDaySpan(activeSlot.start, activeSlot.end)
      : eventType.kind === "trip"
        ? formatTripSpan(activeSlot.start, activeSlot.end)
        : formatSlot(activeSlot.start, activeSlot.end)
    : null;

  // Suggesting needs a signed-in person, a real group, and a date to suggest.
  const canSuggest = !!user && !!activeGroup && !activeGroup.isExample && !!activeSlot && !!settings;
  // Success and errors belong to the exact date they were for: switch group,
  // step to another date or change a setting, and they stop showing.
  const suggestedFor = suggestMutation.variables;
  const suggestIsForThis =
    !!suggestedFor &&
    suggestedFor.groupId === activeGroup?.id &&
    suggestedFor.date.start === activeSlot?.start;
  const suggestedThis = suggestIsForThis && suggestMutation.isSuccess;
  const suggestError =
    suggestIsForThis && suggestMutation.isError ? suggestMutation.error.message : null;

  // Conflict review state for multi-day spans. Your own work/school conflicts
  // need your explicit approval; other people's put the dates under review.
  const selfConflict =
    multiResult?.conflicts.find((c) => c.profileId === youProfileId) ?? null;
  const otherConflicts =
    multiResult?.conflicts.filter((c) => c.profileId !== youProfileId) ?? [];
  const selfAccepted =
    multiResult?.slot != null && acceptedSlot === multiResult.slot.start;
  const needsSelfApproval = selfConflict !== null && !selfAccepted;
  // Unique titles of your own conflicting commitments: a generated title like
  // "Arbejde", or with real data the name of the calendar, e.g. "Work".
  const selfConflictTitles = selfConflict
    ? [...new Set(selfConflict.events.map((e) => e.title ?? "a commitment"))]
        .slice(0, 3)
        .join(", ")
    : "";

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      {/*
        A working page, not a poster: the calendar is what people came for, so
        it starts at the very top of the screen and takes the full width.
        Everything you set before searching lives in the column beside it
        rather than stacked on top, which is what used to push the calendar
        below the fold.
      */}
      <div className="px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* ───────── Controls: who, and what kind of event ───────── */}
          <aside
            onPointerDownCapture={stopCarousel}
            onFocusCapture={stopCarousel}
            className="w-full lg:sticky lg:top-4 lg:w-[21rem] lg:shrink-0 xl:w-[23rem]"
          >
            {groups && activeGroupId && (
              <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
                <span className="text-sm font-medium text-muted-foreground">
                  Scheduling for
                </span>
                <div className="mt-2">
                  <GroupSwitcher
                    groups={groups}
                    selectedId={activeGroupId}
                    onChange={handleSelectGroup}
                    onCreate={handleNewGroup}
                    variant="hero"
                  />
                </div>

                {/* Event settings: what kind of event, then either how many
                    days (multi-day) or how long + what time it starts. */}
                <div className="mt-4 border-t pt-4">
                  <span className="text-sm font-medium text-muted-foreground">
                    What kind of event
                  </span>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Dropdown
                      icon={<Tag className="h-3.5 w-3.5 text-muted-foreground" />}
                      value={eventTypeIdx}
                      options={TYPE_OPTIONS}
                      onChange={handleEventType}
                      menuWidth="w-44"
                    />
                    {eventType.kind === "vacation" && (
                      <Dropdown
                        icon={<CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />}
                        value={days}
                        options={DAYS_OPTIONS}
                        onChange={handleDays}
                      />
                    )}
                    {eventType.kind === "single" && (
                      <>
                        <Dropdown
                          icon={<Hourglass className="h-3.5 w-3.5 text-muted-foreground" />}
                          value={durationMinutes}
                          options={DURATION_OPTIONS}
                          onChange={handleDuration}
                        />
                        <Dropdown
                          icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                          value={startHour}
                          options={START_OPTIONS}
                          onChange={handleStartHour}
                        />
                      </>
                    )}
                  </div>
                  {/* Day slider: which weekdays are searched (single events) or
                      covered by the trip. Vacations span any days, so none there. */}
                  {eventType.kind !== "vacation" && (
                    <div className="mt-3">
                      <DaySlider selected={selectedDows} onChange={handleDows} />
                    </div>
                  )}
                </div>

                {/* Suggest the date that was found: it goes to everyone in
                    the group, who accept or decline it on My events. Only
                    once there is a date, and only for a real group. */}
                <button
                  onClick={handleSuggest}
                  disabled={!canSuggest || suggestMutation.isPending || suggestedThis}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:opacity-60"
                >
                  {suggestMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : suggestedThis ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                  {suggestedThis ? "Suggested" : "Suggest event"}
                </button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {suggestedThis ? (
                    <>
                      Sent to the group.{" "}
                      <Link
                        to="/events"
                        className="font-medium text-foreground underline underline-offset-2"
                      >
                        Follow the answers in My events
                      </Link>
                      .
                    </>
                  ) : suggestError ? (
                    <span className="text-red-700">{suggestError}</span>
                  ) : !user ? (
                    "Sign in and make a group to suggest events."
                  ) : activeGroup?.isExample ? (
                    "Make a group to suggest events to real people."
                  ) : !activeSlot ? (
                    hasSearched
                      ? "No date to suggest with these settings. Try changing them."
                      : "Press Find best time, then suggest the date to your group."
                  ) : (
                    "Everyone in the group gets it to accept or decline."
                  )}
                </p>
              </div>
            )}

            {activeGroup && (
              <div className="mt-4">
                <GroupPanel
                  group={activeGroup}
                  busyLoading={busyLoading}
                  inviteUrl={invite?.url ?? null}
                  inviteExpiresAt={invite?.expiresAt ?? null}
                  invitePending={inviteMutation.isPending}
                  inviteError={
                    inviteMutation.error ? (inviteMutation.error as Error).message : null
                  }
                  onInvite={() => inviteMutation.mutate(activeGroup.id)}
                  leavePending={leaveMutation.isPending}
                  onLeave={() => leaveMutation.mutate(activeGroup.id)}
                />
              </div>
            )}
          </aside>

          {/* ───────── The calendar itself ───────── */}
          <main
            onPointerDownCapture={stopCarousel}
            onFocusCapture={stopCarousel}
            className="min-w-0 flex-1 scroll-mt-4 rounded-2xl border bg-card p-4 shadow-xl shadow-black/5 sm:p-6"
          >
            {/* Card header: which group this is, and the two actions. Only a
                label here — switching groups happens in the box to the
                left, not in the calendar view. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                {activeGroup ? (
                  <h2 className="truncate text-xl font-bold text-foreground sm:text-2xl">
                    {activeGroup.name}
                  </h2>
                ) : (
                  <h2 className="text-2xl font-bold text-foreground">Loading…</h2>
                )}
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? "Copied!" : "Copy link"}
                </button>
                <button
                  onClick={handleFindBest}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  <Sparkles className="h-4 w-4" />
                  Find best time
                </button>
              </div>
            </div>

            {/* Which month the grid below is showing. Sits right above it
                (nothing between the two), so there's never a question which
                month is on screen. */}
            {monthGrid && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-foreground">{monthGrid.label}</p>
                {/* On a phone the arrows sit here: the floating ones on the
                    grid's edges would hang off the screen. */}
                <div className="flex items-center gap-1.5 sm:hidden">
                  <button
                    onClick={() => pageMonth(-1)}
                    disabled={viewMonth <= MIN_MONTH}
                    aria-label="Previous month"
                    className="flex h-9 w-9 items-center justify-center rounded-full border bg-card text-foreground transition hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => pageMonth(1)}
                    disabled={viewMonth >= MAX_MONTH}
                    aria-label="Next month"
                    className="flex h-9 w-9 items-center justify-center rounded-full border bg-card text-foreground transition hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Apple-style month calendar */}
            <div className="mt-2">
              <div className="relative">
                <div className="overflow-hidden rounded-xl">
                  <AnimatePresence mode="popLayout" custom={slideDir} initial={false}>
                    <motion.div
                      key={viewMonth}
                      custom={slideDir}
                      variants={calendarSlide}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {/* Cross-fade when the group changes: both calendars sit
                          in one grid cell, so the old one fades out under the
                          new one instead of the page collapsing to nothing. */}
                      <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
                        <AnimatePresence initial={false}>
                          <motion.div
                            key={activeGroupId ?? "none"}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, pointerEvents: "none" }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                          >
                            {monthGrid && (
                              <CalendarPanel
                                grid={monthGrid}
                                bestDay={bestDay}
                                bestSpanDays={bestSpanDays}
                                bestTimeLabel={bestTimeLabel}
                                todayDay={TODAY_DAY}
                                timeZone={TZ}
                              />
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Month nav arrows, pinned to a fixed height on the calendar's
                    left/right edges. Anchored to a constant offset rather than
                    top-1/2: months render 5 or 6 week rows, so centering on
                    the grid's own (variable) height made the arrows hop up
                    and down every time that row count changed between months. */}
                <button
                  onClick={() => pageMonth(-1)}
                  disabled={viewMonth <= MIN_MONTH}
                  aria-label="Previous month"
                  className="absolute left-0 top-8 z-20 hidden h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-foreground shadow-md transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-30 sm:flex"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => pageMonth(1)}
                  disabled={viewMonth >= MAX_MONTH}
                  aria-label="Next month"
                  className="absolute right-0 top-8 z-20 hidden h-9 w-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-foreground shadow-md transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-30 sm:flex"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {/* Legend */}
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                <span>Fewer free</span>
                {[0.2, 0.45, 0.7, 1].map((a) => (
                  <span
                    key={a}
                    className="h-3 w-5 rounded-sm"
                    style={{ backgroundColor: `rgba(${ACCENT_RGB}, ${a})` }}
                  />
                ))}
                <span>More free</span>
                {isMultiDay && (
                  <>
                    <span
                      className="ml-3 h-3 w-5 rounded-sm"
                      style={{ backgroundColor: `rgba(${AMBER_RGB}, 0.5)` }}
                    />
                    <span>free only with time off</span>
                  </>
                )}
              </div>
            </div>

            {/* Best-time banner, under the calendar. Single meetings: found /
                not found. Multi-day spans add two review states — your own
                work/school needs your approval, other people's puts the
                dates under review. */}
            <AnimatePresence>
              {hasSearched && (isMultiDay ? multiResult : result) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  {!activeSlot ? (
                    <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                      {eventType.kind === "vacation" ? (
                        <>
                          No stretch of {days === 1 ? "1 day" : `${days} days`}{" "}
                          works for the whole group in this range. Try fewer days
                          or another group.
                        </>
                      ) : eventType.kind === "trip" ? (
                        <>
                          No week has a free trip window for the whole group in
                          this range. Try changing which days the trip covers.
                        </>
                      ) : (
                        <>
                          No time works for the whole group at{" "}
                          {String(startHour).padStart(2, "0")}:00 on the selected
                          days in this range. Try a different start time,
                          duration, or more days.
                        </>
                      )}
                    </div>
                  ) : isMultiDay && needsSelfApproval ? (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                          <AlertTriangle className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                            Needs your approval
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {slotLabel}
                          </p>
                          <p className="mt-0.5 text-sm text-amber-800">
                            The earliest possible dates, but you have{" "}
                            {selfConflictTitles} in your calendar.
                            {otherConflicts.length > 0 &&
                              ` ${nameList(otherConflicts.map((c) => c.name))} would also need to take time off.`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setAcceptedSlot(activeSlot.start)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                        >
                          <Check className="h-4 w-4" />
                          Accept
                        </button>
                        <FindStepper
                          canGoBack={historyIndex > 0}
                          onPrev={handleFindPrev}
                          onNext={handleFindNext}
                        />
                      </div>
                    </div>
                  ) : isMultiDay && otherConflicts.length > 0 ? (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white">
                          <Hourglass className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-sky-700">
                            Dates under review
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {slotLabel}
                          </p>
                          <p className="mt-0.5 text-sm text-sky-800">
                            {nameList(otherConflicts.map((c) => c.name))}{" "}
                            {otherConflicts.length === 1 ? "has" : "have"} work or
                            school during these dates and must approve them.
                            {selfAccepted && " You have approved taking time off."}
                          </p>
                        </div>
                      </div>
                      <FindStepper
                        canGoBack={historyIndex > 0}
                        onPrev={handleFindPrev}
                        onNext={handleFindNext}
                      />
                    </div>
                  ) : (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-primary">
                            Works for everyone
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {slotLabel}
                          </p>
                          {isMultiDay && selfAccepted && (
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              You approved taking time off for these dates.
                            </p>
                          )}
                        </div>
                      </div>
                      <FindStepper
                        canGoBack={historyIndex > 0}
                        onPrev={handleFindPrev}
                        onNext={handleFindNext}
                      />
                    </div>
                  )}

                  {/* Workaround suggestions: concrete counter-proposals when the
                      requested vacation length doesn't work cleanly. */}
                  {suggestions.map((s) => (
                    <div
                      key={`${s.days}-${s.slot.start}`}
                      className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-card p-3"
                    >
                      <div className="flex items-center gap-2.5 text-sm text-foreground">
                        <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
                        <span>
                          {s.conflicts.length === 0 ? (
                            <>
                              {days === 1 ? "1 day" : `${days} days`}{" "}
                              {multiResult?.slot ? "needs time off" : "does not fit"},
                              but{" "}
                              <span className="font-semibold">
                                {s.days} days works for everyone
                              </span>
                              : {formatDaySpan(s.slot.start, s.slot.end)}
                              {s.leaveAfterWork &&
                                ", leaving after work on the first day"}
                              {s.homeBeforeWork &&
                                ", home before work starts again"}
                              .
                            </>
                          ) : (
                            <>
                              Closest workaround: {s.days} days,{" "}
                              {formatDaySpan(s.slot.start, s.slot.end)}, if{" "}
                              {nameList(s.conflicts.map((c) => c.name))}{" "}
                              {s.conflicts.length === 1 ? "takes" : "take"} time
                              off.
                            </>
                          )}
                        </span>
                      </div>
                      <button
                        onClick={() => applySuggestion(s)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                      >
                        Use these dates
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Group members */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-foreground">
                Group members
              </h3>
              {/* Whose times are real. The example group is the only place
                  generated calendars are still used, and it says so. */}
              <p className="mt-1 text-xs text-muted-foreground">
                {activeGroup?.isExample ? (
                  !user ? (
                    <>
                      Everyone here is example data.{" "}
                      <Link to="/sign-in?next=/" className="font-medium text-foreground underline underline-offset-2">
                        Sign in
                      </Link>{" "}
                      to use your own calendar and make a real group.
                    </>
                  ) : myCalendarsFailed ? (
                    <>Couldn't load your calendars, so you are shown with example data too.</>
                  ) : (
                    <>
                      The other people here are example data.{" "}
                      <Link to="/profile" className="font-medium text-foreground underline underline-offset-2">
                        Connect a calendar
                      </Link>{" "}
                      and make a group to find a date with real people.
                    </>
                  )
                ) : busyFailed ? (
                  <>Couldn't load this group's calendars, so these times are incomplete.</>
                ) : busyLoading ? (
                  <>Loading everyone's calendars…</>
                ) : (
                  <>
                    These times come from every member's own connected calendars. Nobody sees
                    what your events are called.
                  </>
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {event?.participants.map((p, i) => (
                  <span
                    key={p.profileId}
                    className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                        avatarColor(i),
                      )}
                    >
                      {p.name.charAt(0)}
                    </span>
                    <span className="text-sm text-foreground">{p.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>

      <NewGroupDialog
        open={newGroupOpen}
        submitting={createMutation.isPending}
        error={createMutation.error ? (createMutation.error as Error).message : null}
        onSubmit={(name) => createMutation.mutate(name)}
        onCancel={() => setNewGroupOpen(false)}
      />
    </div>
  );
}
