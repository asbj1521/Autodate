/**
 * Provider-agnostic busy-interval helpers shared by the adapters that have to
 * assemble intervals themselves (Outlook's calendarView, ICS feeds). Google's
 * freeBusy returns already-merged blocks, so it doesn't need these.
 */

/** One busy interval, mirroring the frontend's BusyInterval shape (ISO strings, UTC). */
export interface RawBusyInterval {
  start: string;
  end: string;
}

/** Collapse overlapping or touching intervals, like Google's freeBusy does. */
export function mergeIntervals(intervals: RawBusyInterval[]): RawBusyInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start));
  const merged: RawBusyInterval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}
