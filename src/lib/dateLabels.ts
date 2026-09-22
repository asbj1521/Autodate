/** Column headers and month headings for the month grids, in any locale. */

/** Monday-first short weekday names: "man." to "søn.", or "Mon" to "Sun". */
export function mondayFirstWeekdays(locale: string): string[] {
  // 1 January 2024 was a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, {
      weekday: "short",
      timeZone: "UTC",
    }),
  );
}
