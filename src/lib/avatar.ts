/**
 * Shared avatar styling.
 *
 * A stable palette cycled by index, used everywhere we render a first-letter
 * avatar (group members on the scheduling page, the profile identity card).
 * Kept in one place so the two pages can't drift into different colour sets.
 */

const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
];

/** Deterministic avatar colour class for a given index. */
export function avatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}
