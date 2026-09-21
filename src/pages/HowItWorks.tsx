import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CalendarPlus,
  EyeOff,
  LogIn,
  Sparkles,
  SlidersHorizontal,
  Tags,
  Users,
} from "lucide-react";

import TopNav from "@/components/TopNav";
import { useAuth } from "@/context/auth";

/**
 * What Casy does, from signing in to a found date, in six steps.
 *
 * Every claim here describes what the code actually does (the engine's
 * soft/hard rules, the 7-day invite links, the hourly sync), so update it
 * when those change, the same way as the privacy policy.
 */

interface Step {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    icon: LogIn,
    title: "Sign in",
    body: "Continue with Google, or get a one-time sign-in link sent to any email address. There is no password to remember.",
  },
  {
    icon: CalendarPlus,
    title: "Connect your calendars",
    body: "Link Google, Outlook or iCloud, or paste any calendar link, such as a school timetable. Casy only reads when you are busy, never what your events are, and refreshes every hour.",
  },
  {
    icon: Tags,
    title: "Say what each calendar is for",
    body: (
      <>
        Mark calendars as work, school, personal or other. For a dinner or an evening, every
        event counts as busy. For a weekend trip or a vacation, work and school count as time you
        could take off: Casy still suggests those dates and says who would need a day off. Short
        plans like a dinner don't stand in the way of a trip, but being away all day does.
      </>
    ),
  },
  {
    icon: Users,
    title: "Make a group and share the link",
    body: "Name a group, copy its invite link and send it to the people you plan with. A link works for seven days. Everyone in the group sees each other's names and busy times, and nothing more.",
  },
  {
    icon: SlidersHorizontal,
    title: "Pick what you are planning",
    body: "An evening, lunch, dinner, gaming session, night out, weekend trip or vacation. Adjust how long it takes, when it starts and which days of the week work.",
  },
  {
    icon: Sparkles,
    title: "Casy finds the date",
    body: (
      <>
        You get the earliest time that works for everyone. The calendar shades every day by how
        many people are free, and amber means free only if someone takes time off. Not quite
        right? Ask for the next option. Members who have not linked a calendar yet are named and
        left out, rather than counted as free.
      </>
    ),
  },
];

export default function HowItWorks() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">How it works</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          From "when are you free?" to a date, without the group chat.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Casy compares everyone's calendars and finds the first time the whole group is free. Set
          it up once, and every plan after that takes seconds.
        </p>

        <ol className="mt-10 space-y-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex shrink-0 flex-col items-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" />
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
                  <span className="text-sm font-medium tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  {step.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-8 rounded-2xl bg-secondary p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <EyeOff className="h-5 w-5 text-primary" />
            What Casy never sees
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Only the start and end of each busy period is stored. Event titles, places, notes and
            guests are never requested from Google or Microsoft. iCloud and calendar links always
            send whole events, so Casy removes those details before anything is saved. Group
            members never see your calendars' names or which accounts you connected.{" "}
            <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">
              Read the privacy policy
            </Link>
            .
          </p>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to={user ? "/" : "/sign-in"}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            {user ? "Find a date" : "Get started"}
            <ArrowRight className="h-4 w-4" />
          </Link>
          {user && (
            <Link
              to="/profile"
              className="rounded-full border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
            >
              Connect calendars
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
