/**
 * UTC day arithmetic shared by the scheduling page and its calendar.
 *
 * The engine and the heatmap both work in UTC (see src/types/index.ts on why),
 * so "which day is this instant on" and "which month is this day in" need one
 * definition rather than a handful of inline `Math.floor(ms / 86_400_000)`
 * expressions that have to agree.
 */

export const DAY_MS = 86_400_000;

/** Midnight-ISO of the UTC day containing an instant. */
export function dayOf(iso: string): string {
  return new Date(Math.floor(Date.parse(iso) / DAY_MS) * DAY_MS).toISOString();
}

/** First-of-month (UTC ms) for a given instant. */
export function monthStartMs(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
