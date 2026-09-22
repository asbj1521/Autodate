import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";

import {
  CATEGORY_OPTIONS,
  groupCalendarsByBrand,
  groupVisibility,
  HOLIDAY_CATEGORY_LABEL,
  type OverviewCalendar,
} from "@/lib/calendarOverview";
import { cn } from "@/lib/utils";
import type { CalendarPurpose } from "@/types";

/** Most colour dots shown on a collapsed group's header before they stop helping. */
const MAX_HEADER_DOTS = 6;

/**
 * A checkbox that can show "some but not all". The browser only exposes the
 * dash through a DOM property, not an attribute, so it is set in an effect.
 */
function GroupCheckbox({
  state,
  label,
  onChange,
}: {
  state: "all" | "none" | "some";
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
    />
  );
}

/**
 * The overview's calendar list, grouped by brand. Each group is collapsed by
 * default and has a checkbox that shows or hides all of its calendars on the
 * month grid; opening it reveals a checkbox and a category picker for each
 * calendar. Unchecking only hides a calendar from the view: nothing is
 * disconnected or deleted (that lives on the profile page).
 */
export default function CalendarListPanel({
  calendars,
  hidden,
  blockCounts,
  colorOf,
  savingId,
  saveError,
  onSetVisible,
  onSetPurpose,
}: {
  calendars: OverviewCalendar[];
  hidden: ReadonlySet<string>;
  blockCounts: ReadonlyMap<string, number>;
  colorOf: (calendarId: string) => string;
  /** The calendar whose category is being saved right now, if any. */
  savingId: string | null;
  saveError: string | null;
  onSetVisible: (calendarIds: string[], visible: boolean) => void;
  onSetPurpose: (calendarId: string, purpose: CalendarPurpose | null) => void;
}) {
  const groups = useMemo(() => groupCalendarsByBrand(calendars), [calendars]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="font-semibold text-foreground">Your calendars</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Tick a calendar to show it on the grid. Open a group to give each calendar a category;
        every busy block takes its calendar's category and colour.
      </p>

      <ul className="mt-3 divide-y">
        {groups.map((group) => {
          const isOpen = open.has(group.id);
          const state = groupVisibility(group, hidden);
          const ids = group.calendars.map((c) => c.id);
          const inView = ids.reduce((sum, id) => sum + (blockCounts.get(id) ?? 0), 0);
          const n = group.calendars.length;

          return (
            <li key={group.id}>
              <div className="flex items-center gap-3 py-3">
                <GroupCheckbox
                  state={state}
                  label={`Show all ${group.label} calendars`}
                  // All visible -> hide them all; otherwise show them all.
                  onChange={() => onSetVisible(ids, state !== "all")}
                />
                <button
                  type="button"
                  onClick={() => toggleOpen(group.id)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {group.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {n} {n === 1 ? "calendar" : "calendars"} · {inView} in this view
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {group.calendars.slice(0, MAX_HEADER_DOTS).map((c) => (
                      <span
                        key={c.id}
                        className={cn("h-2 w-2 rounded-full", hidden.has(c.id) && "opacity-30")}
                        style={{ backgroundColor: `rgb(${colorOf(c.id)})` }}
                      />
                    ))}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {group.calendars.map((c) => {
                      const isBuiltIn = c.provider === "builtin";
                      const isHidden = hidden.has(c.id);
                      const saving = savingId === c.id;
                      return (
                        <li key={c.id} className="flex flex-col gap-2 border-t border-dashed py-3 pl-7">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={!isHidden}
                              onChange={() => onSetVisible([c.id], isHidden)}
                              aria-label={`Show ${c.name}`}
                              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                            />
                            <span
                              className={cn("mt-1 h-3 w-3 shrink-0 rounded-full", isHidden && "opacity-30")}
                              style={{ backgroundColor: `rgb(${colorOf(c.id)})` }}
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "truncate text-sm font-medium text-foreground",
                                  isHidden && "text-muted-foreground line-through",
                                )}
                              >
                                {c.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {isBuiltIn ? "Built in, no account needed" : (c.account ?? "")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pl-[2.375rem]">
                            {isBuiltIn ? (
                              // Holidays are always categorised as such; there is nothing to pick.
                              <span
                                className="rounded-full px-2 py-0.5 text-xs"
                                style={{
                                  backgroundColor: `rgba(${colorOf(c.id)}, 0.16)`,
                                  color: `rgb(${colorOf(c.id)})`,
                                }}
                              >
                                {HOLIDAY_CATEGORY_LABEL}
                              </span>
                            ) : (
                              <select
                                value={c.purpose ?? ""}
                                disabled={saving}
                                onChange={(e) =>
                                  onSetPurpose(c.id, (e.target.value || null) as CalendarPurpose | null)
                                }
                                aria-label={`Category for ${c.name}`}
                                className="rounded-lg border bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                              >
                                <option value="">No category</option>
                                {CATEGORY_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            )}
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                            <span className="text-xs text-muted-foreground">
                              {blockCounts.get(c.id) ?? 0} in this view
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      {saveError && <p className="mt-2 text-xs text-red-700">{saveError}</p>}
    </aside>
  );
}
