import { motion, LayoutGroup } from "framer-motion";

import { ALL_DOWS, DOW_SHORT } from "@/lib/weekdays";

/**
 * The day slider: two zones, with the seven weekday chips sliding between
 * them. Chips inside the marked (accent) zone are the days being searched —
 * or, for a trip, the days the trip covers; chips in the dashed zone are off.
 * Tapping a chip slides it across (Framer Motion layout animation).
 *
 * No label text and no wrapping: each zone is a single flex row that never
 * wraps, and its chips are flex-1, so seven of them always share the row's
 * full width evenly rather than sitting at a fixed size that may not fit it.
 * The off zone drops out entirely once every day is back on, rather than
 * sitting there empty.
 */
export default function DaySlider({
  selected,
  onChange,
}: {
  /** Currently active days, as UTC day-of-week values. */
  selected: number[];
  onChange: (dows: number[]) => void;
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
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 p-1">
          {inZone.map((d) => (
            <motion.button
              key={`dow-${d}`}
              layoutId={`dow-${d}`}
              onClick={() => toggle(d)}
              className="min-w-0 flex-1 rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground"
            >
              {DOW_SHORT[d]}
            </motion.button>
          ))}
        </div>
        {outZone.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg border border-dashed p-1">
            {outZone.map((d) => (
              <motion.button
                key={`dow-${d}`}
                layoutId={`dow-${d}`}
                onClick={() => toggle(d)}
                className="min-w-0 flex-1 rounded-md bg-secondary py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {DOW_SHORT[d]}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}
