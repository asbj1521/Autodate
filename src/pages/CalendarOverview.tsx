import { Fragment, useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";

import CalendarListPanel from "@/components/CalendarListPanel";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/context/auth";
import {
  buildMonthLayout,
  calendarColors,
  CATEGORY_LABELS,
  dayKey,
  formatDuration,
  formatSegmentRange,
  HOLIDAY_CALENDAR,
  HOLIDAY_CALENDAR_ID,
  HOLIDAY_CATEGORY_LABEL,
  holidaySegmentsByDay,
  segmentByDay,
  withHolidays,
  type DaySegment,
  type OverviewCalendar,
  type OverviewData,
} from "@/lib/calendarOverview";
import { callFunction } from "@/lib/supabaseFunctions";
import { cn } from "@/lib/utils";
import type { CalendarPurpose } from "@/types";

const PROVIDER_LABELS: Record<OverviewCalendar["provider"], string> = {
  builtin: "Built in",
  google: "Google",
  outlook: "Outlook",
  apple: "Apple",
  ics: "Calendar link",
};

/** "Tue Sep 22 2026, 2 busy blocks" plus any holiday names, for screen readers and tests. */
function cellLabel(date: Date, segments: DaySegment[]): string {
  const busy = segments.filter((s) => !s.holiday).length;
  const holidays = segments.flatMap((s) => (s.holiday ? [s.holiday.name] : []));
  return (
    `${date.toDateString()}, ${busy} busy ${busy === 1 ? "block" : "blocks"}` +
    (holidays.length > 0 ? `, ${holidays.join(", ")}` : "")
  );
}

/** Zinc, for a block whose calendar is somehow missing from the list. */
const FALLBACK_RGB = "113, 113, 122";

/** A narrow week-number column, then seven equal day columns. */
const GRID_COLUMNS = "grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]";

/** Rows shown inside a day cell before collapsing the rest into "+N more". */
const MAX_ROWS_PER_CELL = 3;

function fetchOverview(from: Date, to: Date): Promise<OverviewData> {
  return callFunction<OverviewData>("calendar-busy", {
    params: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    errorMessage: "Couldn't load your calendars",
  });
}

/**
 * The user's own collected calendar data, laid out in the same month-grid
 * style as the scheduling page.
 *
 * What's shown is exactly what Autodate stores: busy time ranges plus the
 * calendar (and account) each came from, coloured by the category the user
 * gave that calendar. There are no event titles: providers are only ever asked
 * for times, by design (see the privacy notes in the calendar_integrations
 * migration). Overlapping and back-to-back events are already merged into one
 * busy block, so a run of consecutive lectures appears as a single block.
 */
export default function CalendarOverview() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const layout = useMemo(() => buildMonthLayout(month.year, month.month), [month]);
  const gridDays = useMemo(() => layout.weeks.flat(), [layout]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["calendar-busy", user.id, dayKey(layout.from)],
    queryFn: () => fetchOverview(layout.from, layout.to),
    placeholderData: keepPreviousData, // no flash of emptiness when changing month
  });

  const setPurpose = useMutation({
    mutationFn: (v: { calendarId: string; purpose: CalendarPurpose | null }) =>
      callFunction("calendar-set-purpose", {
        body: v,
        errorMessage: "Couldn't save the category",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar-busy"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar-status"] });
    },
  });

  const calendars = useMemo(() => data?.calendars ?? [], [data]);
  // The built-in holiday calendar is always present, ahead of the connected ones.
  const allCalendars = useMemo(() => [HOLIDAY_CALENDAR, ...calendars], [calendars]);
  const calendarById = useMemo(() => new Map(allCalendars.map((c) => [c.id, c])), [allCalendars]);
  const palette = useMemo(() => calendarColors(calendars), [calendars]);
  // Every lookup wants the same fallback, so ask through one function instead
  // of repeating the grey at each call site.
  const colorOf = useCallback(
    (calendarId: string) => palette.get(calendarId) ?? FALLBACK_RGB,
    [palette],
  );
  const holidaysByDay = useMemo(() => holidaySegmentsByDay(layout.from, layout.to), [layout]);
  const blockCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of data?.blocks ?? []) counts.set(b.calendarId, (counts.get(b.calendarId) ?? 0) + 1);
    counts.set(
      HOLIDAY_CALENDAR_ID,
      [...holidaysByDay.values()].reduce((sum, list) => sum + list.length, 0),
    );
    return counts;
  }, [data, holidaysByDay]);
  const segmentsByDay = useMemo(
    () =>
      withHolidays(
        segmentByDay(
          (data?.blocks ?? []).filter((b) => !hidden.has(b.calendarId)),
          layout.from,
          layout.to,
        ),
        hidden.has(HOLIDAY_CALENDAR_ID) ? new Map() : holidaysByDay,
      ),
    [data, hidden, layout, holidaysByDay],
  );

  const todayKey = dayKey(new Date());
  const inMonthKeys = gridDays.filter((d) => d.inMonth).map((d) => d.key);
  const selected =
    selectedKey && gridDays.some((d) => d.key === selectedKey)
      ? selectedKey
      : inMonthKeys.includes(todayKey)
        ? todayKey
        : inMonthKeys[0];
  const selectedDay = gridDays.find((d) => d.key === selected);
  const selectedSegments = segmentsByDay.get(selected) ?? [];

  const shiftMonth = (delta: number) => {
    setSelectedKey(null);
    setMonth(({ year, month: m }) => {
      const d = new Date(year, m + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };
  const goToday = () => {
    const now = new Date();
    setSelectedKey(dayKey(now));
    setMonth({ year: now.getFullYear(), month: now.getMonth() });
  };
  // Show or hide any number of calendars at once: one, or a whole brand group.
  const setCalendarsVisible = (ids: string[], visible: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (visible) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const noConnectedCalendars = !isLoading && !error && calendars.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <TopNav wide />

      <main className="px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <Link
          to="/profile"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to profile
        </Link>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">
              {error instanceof Error ? error.message : "Something went wrong."}
            </span>
            <button
              onClick={() => void refetch()}
              className="font-medium underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {data?.truncated && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>This month has more busy blocks than can be shown, so some are missing.</span>
          </div>
        )}

        {noConnectedCalendars && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border bg-secondary/40 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No calendars connected yet.{" "}
              <Link
                to="/profile"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Connect one on your profile
              </Link>{" "}
              to see your own busy times here. Danish holidays are already shown.
            </span>
          </div>
        )}

        {/* One grid, so the calendar list's top lines up with the month grid's:
            the month header is row 1, the grid box and the list start on row 2. */}
        <div className="mt-4 grid items-start gap-x-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="mb-3 flex min-w-0 items-center justify-between lg:col-start-1 lg:row-start-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold capitalize text-foreground">
              {layout.label}
              {(isLoading || isFetching) && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={goToday}
                className="rounded-full border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                Today
              </button>
              <button
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl border bg-card lg:col-start-1 lg:row-start-2">
            <div className={cn(GRID_COLUMNS, "border-b bg-secondary/40")}>
              <div
                className="px-1 py-2 text-center text-xs font-medium text-muted-foreground"
                title="Week number"
              >
                uge
              </div>
              {layout.weekdayLabels.map((label) => (
                <div key={label} className="px-2 py-2 text-xs font-medium text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>

            <div className={GRID_COLUMNS}>
              {gridDays.map((cell, index) => {
                const isToday = cell.key === todayKey;
                const isPast = cell.inMonth && cell.key < todayKey;
                const isSelected = cell.key === selected;
                const segments = segmentsByDay.get(cell.key) ?? [];
                const shown = segments.slice(0, MAX_ROWS_PER_CELL);
                const extra = segments.length - shown.length;
                // The 1st of a month is labelled with its abbreviation, e.g. "1. okt.".
                const numberLabel =
                  cell.dayOfMonth === 1
                    ? `1. ${cell.date.toLocaleString("da-DK", { month: "short" })}`
                    : cell.dayOfMonth;

                // Each row starts with its ISO week number, on the left of Monday.
                const rowIndex = Math.floor(index / 7);
                const isCurrentWeek = layout.weeks[rowIndex].some((d) => d.key === todayKey);

                return (
                  <Fragment key={cell.key}>
                    {index % 7 === 0 && (
                      <div
                        title={`Week ${layout.weekNumbers[rowIndex]}`}
                        className={cn(
                          "flex items-start justify-center border-b border-r bg-secondary/40 pt-2.5 text-xs text-muted-foreground",
                          isCurrentWeek && "font-semibold text-foreground",
                        )}
                      >
                        {layout.weekNumbers[rowIndex]}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedKey(cell.key)}
                      aria-label={cellLabel(cell.date, segments)}
                      aria-pressed={isSelected}
                      className={cn(
                        "relative flex min-h-[104px] flex-col border-b border-r p-1.5 text-left transition hover:bg-secondary/40",
                        isSelected && "ring-2 ring-inset ring-primary/60",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-6 min-w-6 items-center justify-center self-start rounded-full px-1 text-xs",
                          !cell.inMonth && "text-muted-foreground/40",
                          cell.inMonth && isPast && "text-muted-foreground",
                          cell.inMonth && !isPast && !isToday && "text-foreground",
                          isToday && "bg-primary font-semibold text-primary-foreground",
                        )}
                      >
                        {numberLabel}
                      </span>

                      <div className="mt-1 flex flex-col gap-0.5">
                        {shown.map((seg, i) => {
                          const rgb = colorOf(seg.calendarId);
                          const cal = calendarById.get(seg.calendarId);
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-1 rounded-[4px] px-1 py-0.5 text-[10px] leading-tight"
                              style={{ backgroundColor: `rgba(${rgb}, 0.16)` }}
                            >
                              <span
                                className="h-3 w-[3px] shrink-0 rounded-full"
                                style={{ backgroundColor: `rgb(${rgb})` }}
                              />
                              <span className="truncate text-foreground/80">
                                {seg.holiday ? (
                                  <span className="font-medium">{seg.holiday.name}</span>
                                ) : (
                                  <>
                                    <span className="font-medium">{formatSegmentRange(seg)}</span>{" "}
                                    {cal?.name}
                                  </>
                                )}
                              </span>
                            </div>
                          );
                        })}
                        {extra > 0 && (
                          <span className="px-1 text-[10px] text-muted-foreground">
                            +{extra} more
                          </span>
                        )}
                      </div>

                      {/* Past days keep their colour under a grey veil, like the front page. */}
                      {isPast && (
                        <div className="pointer-events-none absolute inset-0 bg-zinc-400/35" />
                      )}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>

          <section className="mt-6 min-w-0 rounded-2xl border bg-card p-5 shadow-sm lg:col-start-1 lg:row-start-3">
            <h3 className="font-semibold text-foreground">
              {selectedDay?.date.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </h3>
            {selectedSegments.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing busy on this day in the calendars shown.
              </p>
            ) : (
              <ul className="mt-3 divide-y">
                {selectedSegments.map((seg, i) => (
                  <DayRow
                    key={i}
                    seg={seg}
                    calendar={calendarById.get(seg.calendarId)}
                    rgb={colorOf(seg.calendarId)}
                  />
                ))}
              </ul>
            )}
          </section>

          <div className="mt-6 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:mt-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <CalendarListPanel
              calendars={allCalendars}
              hidden={hidden}
              blockCounts={blockCounts}
              colorOf={colorOf}
              savingId={setPurpose.isPending ? (setPurpose.variables?.calendarId ?? null) : null}
              saveError={
                setPurpose.isError
                  ? setPurpose.error instanceof Error
                    ? setPurpose.error.message
                    : "Couldn't save."
                  : null
              }
              onSetVisible={setCalendarsVisible}
              onSetPurpose={(calendarId, purpose) => setPurpose.mutate({ calendarId, purpose })}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * One row in the selected day's list. Holidays and busy blocks differ only in
 * what the two lines of text say and which pill sits on the right, so they
 * share the row rather than duplicating its frame.
 */
function DayRow({
  seg,
  calendar,
  rgb,
}: {
  seg: DaySegment;
  calendar: OverviewCalendar | undefined;
  rgb: string;
}) {
  const holiday = seg.holiday;

  const title = holiday ? holiday.name : formatSegmentRange(seg);
  const aside = holiday
    ? holiday.englishName
    : seg.allDay
      ? ""
      : formatDuration(seg.start, seg.end);
  const source = holiday
    ? `${holiday.kind === "public" ? "Public holiday" : "Commonly observed day off"} · Denmark`
    : [calendar?.name ?? "Calendar", calendar?.account, calendar && PROVIDER_LABELS[calendar.provider]]
        .filter(Boolean)
        .join(" · ");
  const pill = holiday
    ? HOLIDAY_CATEGORY_LABEL
    : calendar?.purpose
      ? CATEGORY_LABELS[calendar.purpose]
      : "No category";

  return (
    <li className="flex items-start gap-3 py-3 text-sm">
      <span
        className="mt-0.5 h-8 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: `rgb(${rgb})` }}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {title}
          {aside && <span className="ml-2 font-normal text-muted-foreground">{aside}</span>}
        </p>
        <p className="text-muted-foreground">{source}</p>
        {!holiday && (seg.continuesBefore || seg.continuesAfter) && (
          <p className="text-xs text-muted-foreground">
            {seg.continuesBefore && seg.continuesAfter
              ? "Continues from the previous day and into the next"
              : seg.continuesBefore
                ? "Continues from the previous day"
                : "Continues into the next day"}
          </p>
        )}
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-xs"
        style={{ backgroundColor: `rgba(${rgb}, 0.16)`, color: `rgb(${rgb})` }}
      >
        {pill}
      </span>
    </li>
  );
}
