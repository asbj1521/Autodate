import { Star } from "lucide-react";

import type { MonthGrid } from "@/lib/heatmap";
import { ACCENT_RGB, AMBER_RGB } from "@/lib/colors";
import { DAY_MS } from "@/lib/day";
import { cn } from "@/lib/utils";

/**
 * The product card's calendar. A clean light month grid that fits the website,
 * taking just a hint from Apple Calendar: thin gridlines, Monday-first columns,
 * day numbers in the corner, muted spill-over days from neighbouring months,
 * past days kept in colour but dimmed under a grey veil, today circled, and
 * availability shown as a small event-style row (a coloured tick + "n/7 free"),
 * with the best meeting day rendered as a solid accent bar so it stands out.
 */
export default function CalendarPanel({
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
