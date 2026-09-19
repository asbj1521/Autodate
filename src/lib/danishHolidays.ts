/**
 * Danish public holidays, computed from their rules instead of fetched.
 *
 * Almost every Danish holiday is a fixed date or a fixed offset from Easter,
 * so there is no data source to go stale, no account to connect and no network
 * call: give it a year, get that year's days. Dates are local calendar days
 * (midnight in the viewer's time zone), matching how the calendar overview
 * lays out days.
 */

export interface Holiday {
  /** Local midnight at the start of the day. */
  date: Date;
  /** Local day as "YYYY-MM-DD". */
  key: string;
  /** Danish name, as shown on the calendar. */
  name: string;
  englishName: string;
  /**
   * "public" days are official helligdage. "observed" days are not official
   * holidays but are widely taken off or treated as one.
   */
  kind: "public" | "observed";
}

/** Easter Sunday (Gregorian) as a local midnight date: the Meeus/Jones/Butcher algorithm. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Store Bededag (Great Prayer Day) was abolished as a public holiday from 2024. */
const LAST_STORE_BEDEDAG_YEAR = 2023;

/** All Danish holidays in `year`, sorted by date. */
export function danishHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  // Days after Easter Sunday; Date() normalises month overflow.
  const afterEaster = (days: number) =>
    new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + days);

  const rules: Array<[Date, string, string, Holiday["kind"]]> = [
    [new Date(year, 0, 1), "Nytårsdag", "New Year's Day", "public"],
    [afterEaster(-3), "Skærtorsdag", "Maundy Thursday", "public"],
    [afterEaster(-2), "Langfredag", "Good Friday", "public"],
    [afterEaster(0), "Påskedag", "Easter Sunday", "public"],
    [afterEaster(1), "2. påskedag", "Easter Monday", "public"],
    [afterEaster(39), "Kristi Himmelfartsdag", "Ascension Day", "public"],
    [afterEaster(49), "Pinsedag", "Whit Sunday", "public"],
    [afterEaster(50), "2. pinsedag", "Whit Monday", "public"],
    [new Date(year, 5, 5), "Grundlovsdag", "Constitution Day", "observed"],
    [new Date(year, 11, 24), "Juleaften", "Christmas Eve", "observed"],
    [new Date(year, 11, 25), "Juledag", "Christmas Day", "public"],
    [new Date(year, 11, 26), "2. juledag", "Boxing Day", "public"],
    [new Date(year, 11, 31), "Nytårsaften", "New Year's Eve", "observed"],
  ];
  if (year <= LAST_STORE_BEDEDAG_YEAR) {
    rules.push([afterEaster(26), "Store bededag", "Great Prayer Day", "public"]);
  }

  return rules
    .map(([date, name, englishName, kind]) => ({ date, key: keyOf(date), name, englishName, kind }))
    .sort((x, y) => x.date.getTime() - y.date.getTime());
}
