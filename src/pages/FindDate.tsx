import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Hourglass,
  Lightbulb,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Tag,
  Users,
} from "lucide-react";

import type { MonthGrid } from "@/lib/heatmap";

import {
  buildEventForGroup,
  CURRENT_USER_ID,
  DAY_END,
  DAY_START,
  getMockGroups,
  SEARCH_WINDOW,
} from "@/api/mockData";
import {
  findBestDaySpan,
  findEarliestSlot,
  findVacationSuggestions,
  findWeeklySpan,
  type MultiDayResult,
  type VacationSuggestion,
  type WeeklySpanShape,
} from "@/lib/availability";
import { buildMonthGrid } from "@/lib/heatmap";
import { formatDaySpan, formatSlot, formatTripSpan } from "@/lib/format";
import type { FriendGroup, SchedulingResult } from "@/types";
import { avatarColor } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import TopNav from "@/components/TopNav";

/** The accent (coral/orange) as raw RGB, so heatmap cells can vary opacity. */
const ACCENT_RGB = "249, 115, 22";

/** Today as a UTC-midnight ISO (computed once), so the calendar can circle it. */
const TODAY_DAY = new Date(
  Math.floor(Date.now() / 86_400_000) * 86_400_000,
).toISOString();

const DAY_MS = 86_400_000;

/** First-of-month (UTC ms) for a given instant. */
const monthStartMs = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

/** First-of-month (UTC ms) for the month containing today — the default view. */
const DEFAULT_MONTH = monthStartMs(Date.parse(TODAY_DAY));
/** Navigable month range: from this month up to the last month with data. */
const MIN_MONTH = Math.max(
  DEFAULT_MONTH,
  monthStartMs(Date.parse(SEARCH_WINDOW.start)),
);
const MAX_MONTH = monthStartMs(Date.parse(SEARCH_WINDOW.end) - 1);

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
  /** Default searched/covered days of week (UTC values); omitted = all. */
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

/** All days of the week in Monday-first display order (UTC values). */
const ALL_DOWS = [1, 2, 3, 4, 5, 6, 0];

/** Short English labels indexed by UTC day-of-week. */
const DOW_SHORT: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/**
 * When a weekend trip starts and ends. 17:00 is "after work" in the demo data
 * (workdays run 09:00 to 17:00), so a normal Friday at the office doesn't show
 * up as a conflict on every single weekend; 21:00 is "Sunday evening, home in
 * time for the week".
 */
const TRIP_START_HOUR = 17;
const TRIP_END_HOUR = 21;

/** Amber for "free only if they take time off", as raw RGB like ACCENT_RGB. */
const AMBER_RGB = "245, 158, 11";

/** Wheel options for the type picker (value = index into EVENT_TYPES). */
const TYPE_OPTIONS = EVENT_TYPES.map((t, i) => ({ label: t.label, value: i }));

/** How many days a multi-day event needs: 1 to 30. */
const DAYS_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1).map((d) => ({
  label: d === 1 ? "1 day" : `${d} days`,
  value: d,
}));

/** Where multi-day searches start from: today, or the window start if later. */
const MULTI_SEARCH_BASE =
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
 * An iOS-style looping scroll wheel. The options are repeated many times so the
 * user can spin freely; on settle we snap to the centred item, report it, and
 * seamlessly recenter to keep the loop effectively endless.
 */
function WheelPicker({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: number }[];
  value: number;
  onChange: (value: number) => void;
}) {
  const ITEM = 36;
  const VISIBLE = 5;
  const COPIES = 41;
  const len = options.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const middleStart = Math.floor(COPIES / 2) * len;

  const list = useMemo(
    () => Array.from({ length: COPIES * len }, (_, i) => options[i % len]),
    [options, len],
  );

  // Centre the current value when the wheel first mounts.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const optIdx = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    el.scrollTop = (middleStart + optIdx) * ITEM;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      let absIdx = Math.round(el.scrollTop / ITEM);
      const optIdx = ((absIdx % len) + len) % len;
      // Snap, and recenter if we've drifted near either end of the repeats.
      if (absIdx < len || absIdx >= (COPIES - 1) * len) {
        absIdx = middleStart + optIdx;
      }
      el.scrollTop = absIdx * ITEM;
      if (options[optIdx].value !== value) onChange(options[optIdx].value);
    }, 90);
  }

  const pad = ((VISIBLE - 1) / 2) * ITEM;

  return (
    <div className="relative" style={{ height: VISIBLE * ITEM }}>
      {/* Centre selection band */}
      <div
        className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-md border-y border-primary/40 bg-primary/5"
        style={{ height: ITEM }}
      />
      {/* Fade top/bottom for the wheel illusion */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-9 bg-gradient-to-b from-card to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-9 bg-gradient-to-t from-card to-transparent" />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "y mandatory" }}
      >
        <div style={{ paddingTop: pad, paddingBottom: pad }}>
          {list.map((o, i) => (
            <div
              key={i}
              className="flex items-center justify-center text-sm text-foreground"
              style={{ height: ITEM, scrollSnapAlign: "center" }}
            >
              {o.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A small labelled dropdown that opens a looping wheel (type / duration / start). */
function Dropdown({
  icon,
  value,
  options,
  onChange,
  menuWidth = "w-32",
}: {
  icon: ReactNode;
  value: number;
  options: { label: string; value: number }[];
  onChange: (value: number) => void;
  /** Tailwind width class for the wheel popup (wider for long labels). */
  menuWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition hover:bg-secondary"
      >
        {icon}
        {current?.label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className={cn(
                "absolute left-0 z-20 mt-2 overflow-hidden rounded-xl border bg-card p-1 shadow-lg",
                menuWidth,
              )}
            >
              <WheelPicker options={options} value={value} onChange={onChange} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The day slider: two zones, with the seven weekday chips sliding between
 * them. Chips inside the marked (accent) zone are the days being searched —
 * or, for a trip, the days the trip covers; chips in the dashed zone are off.
 * Tapping a chip slides it across (Framer Motion layout animation).
 */
function DaySlider({
  selected,
  onChange,
  zoneLabel,
}: {
  /** Currently active days, as UTC day-of-week values. */
  selected: number[];
  onChange: (dows: number[]) => void;
  /** What the marked zone means for this event type. */
  zoneLabel: string;
}) {
  const inZone = ALL_DOWS.filter((d) => selected.includes(d));
  const outZone = ALL_DOWS.filter((d) => !selected.includes(d));

  function toggle(d: number) {
    if (selected.includes(d)) {
      if (selected.length <= 1) return; // at least one day must stay active
      onChange(selected.filter((x) => x !== d));
    } else {
      onChange([...selected, d]);
    }
  }

  return (
    <LayoutGroup>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-h-[34px] items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-1.5 py-1">
          <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-primary">
            {zoneLabel}
          </span>
          {inZone.map((d) => (
            <motion.button
              key={`dow-${d}`}
              layoutId={`dow-${d}`}
              onClick={() => toggle(d)}
              className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground"
            >
              {DOW_SHORT[d]}
            </motion.button>
          ))}
        </div>
        <div className="flex min-h-[34px] items-center gap-1 rounded-lg border border-dashed px-1.5 py-1">
          {outZone.length === 0 ? (
            <span className="px-1 text-[10px] text-muted-foreground">
              All days on
            </span>
          ) : (
            outZone.map((d) => (
              <motion.button
                key={`dow-${d}`}
                layoutId={`dow-${d}`}
                onClick={() => toggle(d)}
                className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {DOW_SHORT[d]}
              </motion.button>
            ))
          )}
        </div>
      </div>
    </LayoutGroup>
  );
}

/**
 * A dropdown to switch which friend group you're scheduling for. Used in two
 * places — the hero and the card title — via the `variant` prop, so users see
 * the "pick your group" idea immediately and again in context.
 */
function GroupSwitcher({
  groups,
  selectedId,
  onChange,
  variant,
}: {
  groups: FriendGroup[];
  selectedId: string;
  onChange: (id: string) => void;
  variant: "hero" | "title";
}) {
  const [open, setOpen] = useState(false);
  const selected = groups.find((g) => g.id === selectedId);

  return (
    <div
      className={cn(
        "relative text-left",
        variant === "hero" ? "block w-full" : "inline-block",
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "transition",
          variant === "hero" &&
            "flex w-full items-center justify-between gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary",
          variant === "title" &&
            "inline-flex items-center gap-2 rounded-lg px-1 -mx-1 text-2xl font-bold text-foreground hover:bg-secondary",
        )}
      >
        <span className="flex items-center gap-2">
          {variant === "hero" && <Users className="h-4 w-4 text-primary" />}
          {selected?.name ?? "Select group"}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground transition",
            variant === "hero" ? "h-4 w-4" : "h-5 w-5",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 z-20 mt-2 w-full min-w-[15rem] overflow-hidden rounded-xl border bg-card p-1 shadow-lg"
            >
              <p className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your friend groups
              </p>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    onChange(g.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-secondary"
                >
                  <span className="font-medium text-foreground">{g.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {g.participants.length}
                    </span>
                    {g.id === selectedId && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </span>
                </button>
              ))}
              <div className="mt-1 border-t pt-1">
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-primary transition hover:bg-secondary">
                  <Plus className="h-4 w-4" />
                  New group
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The product card's calendar. A clean light month grid that fits the website,
 * taking just a hint from Apple Calendar: thin gridlines, Monday-first columns,
 * day numbers in the corner, muted spill-over days from neighbouring months,
 * past days kept in colour but dimmed under a grey veil, today circled, and
 * availability shown as a small event-style row (a coloured tick + "n/7 free"),
 * with the best meeting day rendered as a solid accent bar so it stands out.
 */
function CalendarPanel({
  grid,
  bestDay,
  bestSpanDays,
  bestTimeLabel,
  todayDay,
}: {
  grid: MonthGrid;
  bestDay: string | null;
  /** How many days the best slot covers (1 for normal meetings). */
  bestSpanDays: number;
  bestTimeLabel: string | null;
  todayDay: string | null;
}) {
  const bestMs = bestDay ? Date.parse(bestDay) : null;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b bg-secondary/40">
        {grid.weekdayLabels.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {grid.weeks.flat().map((cell) => {
          const frac = grid.total === 0 ? 0 : cell.freeCount / grid.total;
          const condFrac =
            grid.total === 0 ? 0 : cell.conditionalCount / grid.total;
          const isToday = cell.date === todayDay;
          // Spill-over days belong to a neighbouring month; we mute those.
          const inMonth = cell.inMonth;
          const isPast = inMonth && cell.isPast;
          // Best-slot highlight: a single day for meetings, a run of days for
          // multi-day events. The first day carries the star + label; the rest
          // get a solid continuation bar.
          const cellMs = Date.parse(cell.date);
          const inBestSpan =
            bestMs !== null &&
            inMonth &&
            !cell.isPast &&
            cellMs >= bestMs &&
            cellMs < bestMs + bestSpanDays * DAY_MS;
          const isBestStart = inBestSpan && cellMs === bestMs;
          // The 1st of a month is labelled with its abbreviation, e.g. "1. jul.".
          const numberLabel =
            cell.dayOfMonth === 1
              ? `1. ${new Date(cell.date).toLocaleString("da-DK", {
                  month: "short",
                  timeZone: "UTC",
                })}`
              : cell.dayOfMonth;

          return (
            <div
              key={cell.date}
              title={
                inMonth && !isPast && !cell.excluded
                  ? `${cell.freeCount}/${cell.total} can meet${
                      cell.conditionalCount > 0
                        ? `, ${cell.conditionalCount} would need time off`
                        : ""
                    }`
                  : undefined
              }
              className="relative min-h-[84px] border-b border-r p-1.5"
              style={
                inMonth && !cell.excluded
                  ? frac > 0
                    ? {
                        backgroundColor: `rgba(${ACCENT_RGB}, ${(0.06 + 0.3 * frac).toFixed(3)})`,
                      }
                    : cell.conditionalCount > 0
                      ? {
                          // Nobody is outright free, but some could take time
                          // off: amber, not orange, so it reads as "possible
                          // with effort" rather than "available".
                          backgroundColor: `rgba(${AMBER_RGB}, ${(0.08 + 0.22 * condFrac).toFixed(3)})`,
                        }
                      : undefined
                  : undefined
              }
            >
              {/* Date number (today gets a filled circle) */}
              <div className="flex">
                <span
                  className={cn(
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs",
                    !inMonth && "text-muted-foreground/40",
                    inMonth && isPast && "text-muted-foreground",
                    inMonth && !isPast && !isToday && "text-foreground",
                    isToday && "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {numberLabel}
                </span>
              </div>

              {/* Availability event — upcoming, searched days only; past days
                  show colour only, excluded days stay neutral */}
              {inMonth && !isPast && !cell.excluded && (
                <div className="mt-1">
                  {inBestSpan ? (
                    isBestStart ? (
                      <div
                        className="flex items-center gap-1 rounded-[4px] px-1 py-0.5 text-[10px] font-semibold text-primary-foreground"
                        style={{ backgroundColor: `rgb(${ACCENT_RGB})` }}
                      >
                        <Star className="h-2.5 w-2.5 shrink-0 fill-current" />
                        <span className="truncate">
                          Best{bestTimeLabel ? ` · ${bestTimeLabel}` : ""}
                        </span>
                      </div>
                    ) : (
                      <div
                        className="h-[19px] rounded-[4px]"
                        style={{ backgroundColor: `rgb(${ACCENT_RGB})` }}
                      />
                    )
                  ) : (
                    <div className="flex items-center gap-1">
                      <span
                        className="h-3.5 w-[3px] shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            cell.freeCount === 0 && cell.conditionalCount > 0
                              ? `rgba(${AMBER_RGB}, 0.9)`
                              : `rgba(${ACCENT_RGB}, ${(0.35 + 0.65 * frac).toFixed(2)})`,
                        }}
                      />
                      <span className="truncate text-[10px] text-muted-foreground">
                        {cell.conditionalCount > 0
                          ? `${cell.freeCount}/${cell.total} free · ${cell.conditionalCount} work`
                          : `${cell.freeCount}/${cell.total} free`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Past days keep their colour but get a grey veil laid over the top. */}
              {isPast && (
                <div className="pointer-events-none absolute inset-0 bg-zinc-400/35" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FindDate() {
  const [copied, setCopied] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
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
  // Where to start searching from. null = "from today"; "Find new time" bumps it
  // forward to surface the next slot after the current one.
  const [searchFrom, setSearchFrom] = useState<string | null>(null);
  // Which month the calendar shows (first-of-month ms), and which way it slides.
  const [viewMonth, setViewMonth] = useState(DEFAULT_MONTH);
  const [slideDir, setSlideDir] = useState(1);
  const cardRef = useRef<HTMLDivElement>(null);

  const { data: groups } = useQuery({
    queryKey: ["mock-groups"],
    queryFn: getMockGroups,
  });

  // Default to the first group once loaded; otherwise honour the user's choice.
  const activeGroupId = selectedGroupId ?? groups?.[0]?.id ?? null;
  const activeGroup = groups?.find((g) => g.id === activeGroupId) ?? null;

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
    const vm = new Date(viewMonth);
    return buildMonthGrid(
      activeGroup.participants,
      vm.getUTCFullYear(),
      vm.getUTCMonth(),
      {
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

  // Never search the past — start from today (or the window start if later).
  function searchBaseFor(ev: NonNullable<typeof event>): string {
    return Date.parse(TODAY_DAY) > Date.parse(ev.searchStart)
      ? TODAY_DAY
      : ev.searchStart;
  }

  // The earliest slot the whole group can actually meet, recomputed
  // automatically whenever the group, duration, start time, or search anchor
  // changes — so the front page always shows a real, calendar-derived time
  // without anyone having to press a button.
  const result = useMemo<SchedulingResult | null>(() => {
    if (!event || isMultiDay) return null;
    const searchStart = searchFrom ?? searchBaseFor(event);
    return findEarliestSlot({ ...event, searchStart });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, searchFrom, isMultiDay]);

  // Multi-day events search whole days (vacation) or weekly windows (trip)
  // instead, with work/school surfacing as conflicts to review rather than
  // blocking outright.
  const runMultiSearch = (searchStart: string): MultiDayResult | null => {
    if (!activeGroup) return null;
    if (eventType.kind === "vacation") {
      return findBestDaySpan(
        activeGroup.participants,
        days,
        searchStart,
        SEARCH_WINDOW.end,
      );
    }
    if (eventType.kind === "trip" && tripShape) {
      return findWeeklySpan(
        activeGroup.participants,
        tripShape,
        searchStart,
        SEARCH_WINDOW.end,
      );
    }
    return null;
  };

  const multiResult = useMemo<MultiDayResult | null>(() => {
    if (!isMultiDay) return null;
    return runMultiSearch(searchFrom ?? MULTI_SEARCH_BASE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiDay, activeGroup, eventType, days, tripShape, searchFrom]);

  // Workarounds for vacations that don't work cleanly: "6 days works for
  // everyone if you leave after work Friday" and the like.
  const suggestions = useMemo<VacationSuggestion[]>(() => {
    if (eventType.kind !== "vacation" || !activeGroup || !multiResult) return [];
    if (multiResult.slot && multiResult.conflicts.length === 0) return [];
    return findVacationSuggestions(
      activeGroup.participants,
      days,
      searchFrom ?? MULTI_SEARCH_BASE,
      SEARCH_WINDOW.end,
    );
  }, [eventType, activeGroup, multiResult, days, searchFrom]);

  /** Adopt a suggested workaround: shorter stay, anchored on its dates. */
  function applySuggestion(s: VacationSuggestion) {
    setDays(s.days);
    setSearchFrom(dayOf(s.slot.start));
    setAcceptedSlot(null);
    revealDay(dayOf(s.slot.start));
  }

  function handleSelectGroup(id: string) {
    setSelectedGroupId(id);
    setSearchFrom(null); // re-anchor to the earliest slot for the new group
    setAcceptedSlot(null);
    setSlideDir(-1);
    setViewMonth(DEFAULT_MONTH); // show the new group from the current month
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
    setSearchFrom(null);
    setAcceptedSlot(null);
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
    setSearchFrom(null);
    setAcceptedSlot(null);
  }

  function handleDuration(value: number) {
    setDurationMinutes(value);
    setSearchFrom(null); // settings changed — re-anchor to today
    setAcceptedSlot(null);
  }

  function handleStartHour(value: number) {
    setStartHour(value);
    setSearchFrom(null);
    setAcceptedSlot(null);
  }

  function handleDays(value: number) {
    setDays(value);
    setSearchFrom(null);
    setAcceptedSlot(null);
  }

  /** Midnight-ISO of the day containing an instant. */
  function dayOf(iso: string): string {
    return new Date(Math.floor(Date.parse(iso) / DAY_MS) * DAY_MS).toISOString();
  }

  /**
   * Page the calendar to the month containing `dayIso`. If that month is already
   * shown we leave the view alone (no animation); otherwise we slide there —
   * forward in time sweeps the new month in from the right, back reverses it.
   */
  function revealDay(dayIso: string) {
    const month = monthStartMs(Date.parse(dayIso));
    if (month === viewMonth) return;
    setSlideDir(month > viewMonth ? 1 : -1);
    setViewMonth(month);
  }

  /** Step the calendar a month back (-1) or forward (+1), within the data range. */
  function pageMonth(delta: number) {
    const d = new Date(viewMonth);
    const month = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
    if (month < MIN_MONTH || month > MAX_MONTH) return;
    setSlideDir(delta);
    setViewMonth(month);
  }

  /** Re-find the earliest slot from today and scroll to it if it's off screen. */
  function handleFindBest() {
    setSearchFrom(null);
    setAcceptedSlot(null);
    if (isMultiDay) {
      const res = runMultiSearch(MULTI_SEARCH_BASE);
      if (res?.slot) revealDay(dayOf(res.slot.start));
      return;
    }
    if (!event) return;
    const res = findEarliestSlot({ ...event, searchStart: searchBaseFor(event) });
    if (res.slot) revealDay(dayOf(res.slot.start));
  }

  /** Advance the search past the current slot's day to surface the next one. */
  function handleFindNew() {
    const currentSlot = isMultiDay ? multiResult?.slot : result?.slot;
    if (!currentSlot) return;
    const nextDay = new Date(
      Math.floor(Date.parse(currentSlot.start) / DAY_MS) * DAY_MS + DAY_MS,
    ).toISOString();
    setSearchFrom(nextDay);
    setAcceptedSlot(null);
    if (isMultiDay) {
      const res = runMultiSearch(nextDay);
      if (res?.slot) revealDay(dayOf(res.slot.start));
      return;
    }
    if (!event) return;
    const res = findEarliestSlot({ ...event, searchStart: nextDay });
    if (res.slot) revealDay(dayOf(res.slot.start));
  }

  function handleCreateEvent() {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleCopy() {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // Whichever search is active (single meeting vs multi-day span), the slot it
  // found drives the calendar highlight and the banner.
  const activeSlot = (isMultiDay ? multiResult?.slot : result?.slot) ?? null;

  // The day (UTC midnight ISO) containing the best slot, for highlighting.
  const bestDay = activeSlot
    ? new Date(
        Math.floor(Date.parse(activeSlot.start) / 86_400_000) * 86_400_000,
      ).toISOString()
    : null;

  // "11:00"-style label for the best slot's start time (UTC); meaningless for
  // whole-day spans, so omitted there.
  const bestTimeLabel =
    activeSlot && !isMultiDay
      ? new Date(activeSlot.start).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC",
        })
      : null;

  const todayDay = TODAY_DAY;

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

  // Conflict review state for multi-day spans. Your own work/school conflicts
  // need your explicit approval; other people's put the dates under review.
  const selfConflict =
    multiResult?.conflicts.find((c) => c.profileId === CURRENT_USER_ID) ?? null;
  const otherConflicts =
    multiResult?.conflicts.filter((c) => c.profileId !== CURRENT_USER_ID) ?? [];
  const selfAccepted =
    multiResult?.slot != null && acceptedSlot === multiResult.slot.start;
  const needsSelfApproval = selfConflict !== null && !selfAccepted;
  // Unique titles of your own conflicting commitments, e.g. "Arbejde".
  const selfConflictTitles = selfConflict
    ? [...new Set(selfConflict.events.map((e) => e.title ?? "a commitment"))]
        .slice(0, 3)
        .join(", ")
    : "";

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      {/* ───────── Hero ───────── */}
      <header className="mx-auto max-w-6xl px-6 pt-16 pb-12">
        <div className="flex flex-col items-start gap-10 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: value proposition */}
          <div className="max-w-xl">
            <h1 className="text-5xl font-bold leading-tight tracking-tight text-foreground sm:text-6xl">
              Find a time to meet.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Autodate syncs everyone's calendars and finds the earliest window
              that works for your whole group — automatically.
            </p>
          </div>

          {/* Right: pick a group + create */}
          {groups && activeGroupId && (
            <div className="w-full rounded-2xl border bg-card p-6 shadow-sm lg:w-80 lg:shrink-0">
              <span className="text-sm font-medium text-muted-foreground">
                Scheduling for
              </span>
              <div className="mt-2">
                <GroupSwitcher
                  groups={groups}
                  selectedId={activeGroupId}
                  onChange={handleSelectGroup}
                  variant="hero"
                />
              </div>
              <button
                onClick={handleCreateEvent}
                disabled={!event}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:opacity-60"
              >
                <Plus className="h-5 w-5" />
                Create event
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ───────── Product preview card ───────── */}
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <div
          ref={cardRef}
          className="scroll-mt-6 rounded-2xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-8"
        >
          {/* Card header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                {groups && activeGroupId ? (
                  <GroupSwitcher
                    groups={groups}
                    selectedId={activeGroupId}
                    onChange={handleSelectGroup}
                    variant="title"
                  />
                ) : (
                  <h2 className="text-2xl font-bold text-foreground">Loading…</h2>
                )}
                {/* Event settings: what kind of event, then either how many
                    days (multi-day) or how long + what time it starts. */}
                <Dropdown
                  icon={<Tag className="h-3.5 w-3.5 text-muted-foreground" />}
                  value={eventTypeIdx}
                  options={TYPE_OPTIONS}
                  onChange={handleEventType}
                  menuWidth="w-44"
                />
                {eventType.kind === "vacation" && (
                  <Dropdown
                    icon={
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    }
                    value={days}
                    options={DAYS_OPTIONS}
                    onChange={handleDays}
                  />
                )}
                {eventType.kind === "single" && (
                  <>
                    <Dropdown
                      icon={
                        <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
                      }
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
                  <DaySlider
                    selected={selectedDows}
                    onChange={handleDows}
                    zoneLabel={
                      eventType.kind === "trip" ? "Trip days" : "Searching"
                    }
                  />
                </div>
              )}
              {monthGrid && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {monthGrid.label}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                <Sparkles className="h-4 w-4" />
                Find best time
              </button>
            </div>
          </div>

          {/* Best-time banner. Single meetings: found / not found. Multi-day
              spans add two review states — your own work/school needs your
              approval, other people's puts the dates under review. */}
          <AnimatePresence>
            {(isMultiDay ? multiResult : result) && (
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
                      <button
                        onClick={handleFindNew}
                        className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Find new date
                      </button>
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
                    <button
                      onClick={handleFindNew}
                      className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Find new date
                    </button>
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
                    <button
                      onClick={handleFindNew}
                      className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {isMultiDay ? "Find new date" : "Find new time"}
                    </button>
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

          {/* Apple-style month calendar */}
          <div className="mt-6">
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
                    {monthGrid && (
                      <CalendarPanel
                        grid={monthGrid}
                        bestDay={bestDay}
                        bestSpanDays={bestSpanDays}
                        bestTimeLabel={bestTimeLabel}
                        todayDay={todayDay}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Month nav arrows, centred on the calendar's left/right edges */}
              <button
                onClick={() => pageMonth(-1)}
                disabled={viewMonth <= MIN_MONTH}
                aria-label="Previous month"
                className="absolute left-0 top-1/2 z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-foreground shadow-md transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => pageMonth(1)}
                disabled={viewMonth >= MAX_MONTH}
                aria-label="Next month"
                className="absolute right-0 top-1/2 z-20 flex h-9 w-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-foreground shadow-md transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-30"
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

          {/* Group members */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground">
              Group members
            </h3>
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
        </div>
      </main>
    </div>
  );
}
