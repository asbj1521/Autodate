import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  Hourglass,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Users,
} from "lucide-react";

import type { MonthGrid } from "@/lib/heatmap";

import {
  buildEventForGroup,
  DAY_END,
  DAY_START,
  getMockGroups,
} from "@/api/mockData";
import { findEarliestSlot } from "@/lib/availability";
import { buildRangeGrid } from "@/lib/heatmap";
import { formatSlot } from "@/lib/format";
import type { FriendGroup, SchedulingResult } from "@/types";
import { cn } from "@/lib/utils";

/** The accent (coral/orange) as raw RGB, so heatmap cells can vary opacity. */
const ACCENT_RGB = "249, 115, 22";

/** Today as a UTC-midnight ISO (computed once), so the calendar can circle it. */
const TODAY_DAY = new Date(
  Math.floor(Date.now() / 86_400_000) * 86_400_000,
).toISOString();

/** Stable colours for the group-member avatars. */
const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
];

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
  const timer = useRef<ReturnType<typeof setTimeout>>();
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

/** A small labelled dropdown that opens a looping wheel (duration / start). */
function Dropdown({
  icon,
  value,
  options,
  onChange,
}: {
  icon: ReactNode;
  value: number;
  options: { label: string; value: number }[];
  onChange: (value: number) => void;
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
              className="absolute left-0 z-20 mt-2 w-32 overflow-hidden rounded-xl border bg-card p-1 shadow-lg"
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
 * taking just a hint from Apple Calendar: thin gridlines, six rows, day numbers
 * in the corner, dimmed spill-over days, today circled, and availability shown
 * as a small event-style row (a coloured tick + "n/7 free"), with the best
 * meeting day rendered as a solid accent bar so it stands out.
 */
function CalendarPanel({
  grid,
  bestDay,
  bestTimeLabel,
  todayDay,
}: {
  grid: MonthGrid;
  bestDay: string | null;
  bestTimeLabel: string | null;
  todayDay: string | null;
}) {
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
          const isToday = cell.date === todayDay;
          // Out-of-range = past days or days beyond the window: dead, greyed.
          const active = cell.inRange;
          const isBest = active && cell.date === bestDay;
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
              title={active ? `${cell.freeCount}/${cell.total} can meet` : undefined}
              className="min-h-[84px] border-b border-r p-1.5"
              style={
                active && frac > 0
                  ? {
                      backgroundColor: `rgba(${ACCENT_RGB}, ${(0.06 + 0.3 * frac).toFixed(3)})`,
                    }
                  : undefined
              }
            >
              {/* Date number (today gets a filled circle) */}
              <div className="flex">
                <span
                  className={cn(
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs",
                    !active && "text-muted-foreground/40",
                    active && !isToday && "text-foreground",
                    isToday && "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {numberLabel}
                </span>
              </div>

              {/* Availability shown as a small event (today + future only) */}
              {active && (
                <div className="mt-1">
                  {isBest ? (
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
                    <div className="flex items-center gap-1">
                      <span
                        className="h-3.5 w-[3px] shrink-0 rounded-full"
                        style={{
                          backgroundColor: `rgba(${ACCENT_RGB}, ${(0.35 + 0.65 * frac).toFixed(2)})`,
                        }}
                      />
                      <span className="truncate text-[10px] text-muted-foreground">
                        {cell.freeCount}/{cell.total} free
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FindDate() {
  const [result, setResult] = useState<SchedulingResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [startHour, setStartHour] = useState(18);
  const cardRef = useRef<HTMLDivElement>(null);

  const { data: groups } = useQuery({
    queryKey: ["mock-groups"],
    queryFn: getMockGroups,
  });

  // Default to the first group once loaded; otherwise honour the user's choice.
  const activeGroupId = selectedGroupId ?? groups?.[0]?.id ?? null;
  const activeGroup = groups?.find((g) => g.id === activeGroupId) ?? null;

  // The event reflects the chosen duration + start time.
  const event = useMemo(
    () =>
      activeGroup
        ? buildEventForGroup(activeGroup, { durationMinutes, startHour })
        : null,
    [activeGroup, durationMinutes, startHour],
  );

  // A rolling calendar starting today: 5 rows of 7 days (35 days).
  const monthGrid = useMemo(() => {
    if (!activeGroup) return null;
    return buildRangeGrid(
      activeGroup.participants,
      Date.parse(TODAY_DAY),
      35,
      DAY_START,
      DAY_END,
    );
  }, [activeGroup]);

  function handleSelectGroup(id: string) {
    setSelectedGroupId(id);
    setResult(null); // clear stale result when switching groups
  }

  function handleDuration(value: number) {
    setDurationMinutes(value);
    setResult(null); // settings changed — previous result no longer applies
  }

  function handleStartHour(value: number) {
    setStartHour(value);
    setResult(null);
  }

  // Never search the past — start from today (or the window start if later).
  function searchBaseFor(ev: NonNullable<typeof event>): string {
    return Date.parse(TODAY_DAY) > Date.parse(ev.searchStart)
      ? TODAY_DAY
      : ev.searchStart;
  }

  function handleFind() {
    if (!event) return;
    setSearching(true);
    setResult(null);
    setTimeout(() => {
      setResult(findEarliestSlot({ ...event, searchStart: searchBaseFor(event) }));
      setSearching(false);
    }, 650);
  }

  /** Find the next time everyone is free, after the current result's day. */
  function handleFindNew() {
    if (!event || !result?.slot) return;
    const dayMs = 86_400_000;
    const nextDay = new Date(
      Math.floor(Date.parse(result.slot.start) / dayMs) * dayMs + dayMs,
    ).toISOString();
    setSearching(true);
    setTimeout(() => {
      setResult(findEarliestSlot({ ...event, searchStart: nextDay }));
      setSearching(false);
    }, 450);
  }

  function handleCreateEvent() {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleCopy() {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // The day (UTC midnight ISO) containing the best slot, for highlighting.
  const bestDay = result?.slot
    ? new Date(
        Math.floor(Date.parse(result.slot.start) / 86_400_000) * 86_400_000,
      ).toISOString()
    : null;

  // "11:00"-style label for the best slot's start time (UTC).
  const bestTimeLabel = result?.slot
    ? new Date(result.slot.start).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      })
    : null;

  const todayDay = TODAY_DAY;

  return (
    <div className="min-h-screen bg-background">
      {/* ───────── Top nav ───────── */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">autodate</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#" className="transition hover:text-foreground">How it works</a>
          <a href="#" className="transition hover:text-foreground">Sign in</a>
        </div>
      </nav>

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
                {/* Event settings: how long, and what time of day it starts */}
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
              </div>
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
                onClick={handleFind}
                disabled={searching}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                Find best time
              </button>
            </div>
          </div>

          {/* Best-time banner */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                {result.slot ? (
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
                          {formatSlot(result.slot.start, result.slot.end)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleFindNew}
                      disabled={searching}
                      className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Find new time
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    No more times work for everyone in this range.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Apple-style month calendar */}
          <div className="mt-6">
            {monthGrid && (
              <CalendarPanel
                grid={monthGrid}
                bestDay={bestDay}
                bestTimeLabel={bestTimeLabel}
                todayDay={todayDay}
              />
            )}

            {/* Legend */}
            <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>Fewer free</span>
              {[0.2, 0.45, 0.7, 1].map((a) => (
                <span
                  key={a}
                  className="h-3 w-5 rounded-sm"
                  style={{ backgroundColor: `rgba(${ACCENT_RGB}, ${a})` }}
                />
              ))}
              <span>More free</span>
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
                      AVATAR_COLORS[i % AVATAR_COLORS.length],
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
