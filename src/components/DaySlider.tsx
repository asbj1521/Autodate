import { motion, LayoutGroup } from "framer-motion";

import { ALL_DOWS, DOW_SHORT } from "@/lib/weekdays";

/**
 * The day slider: two zones, with the seven weekday chips sliding between
 * them. Chips inside the marked (accent) zone are the days being searched —
 * or, for a trip, the days the trip covers; chips in the dashed zone are off.
 * Tapping a chip slides it across (Framer Motion layout animation).
 */
export default function DaySlider({
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
