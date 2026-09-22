import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FaMicrosoft } from "react-icons/fa6";
import { SiApple, SiGoogle } from "react-icons/si";
import { ArrowLeft, Building2, Copy, Info, type LucideIcon } from "lucide-react";

import TopNav from "@/components/TopNav";

interface Source {
  icon: LucideIcon | typeof SiApple;
  badge: string;
  title: string;
  body: ReactNode;
  visual: ReactNode;
}

const SOURCES: Source[] = [
  {
    icon: SiApple,
    badge: "Fastest, if it applies to you",
    title: "Already subscribed to it in Apple Calendar?",
    body: "If you've already added this calendar to your iPhone or Mac (a school timetable, for example), you don't need to go find the original link again. Open the Calendar app, right-click (or Control-click) the calendar in the sidebar and choose Get Info — the feed's link is right there, ready to copy.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="grid grid-cols-[128px_1fr] divide-x">
          <div className="divide-y bg-secondary/40 text-sm">
            <div className="px-3 py-2 text-muted-foreground">Home</div>
            <div className="bg-primary/10 px-3 py-2 font-medium text-primary ring-1 ring-inset ring-primary/40">
              School
            </div>
            <div className="px-3 py-2 text-muted-foreground">Family</div>
          </div>
          <div className="relative p-3">
            <div className="w-44 rounded-lg border bg-background p-1 text-xs shadow-md">
              <div className="rounded-md bg-primary/10 px-2.5 py-1.5 font-medium text-primary">
                Get Info
              </div>
              <div className="rounded-md px-2.5 py-1.5 text-muted-foreground">Unsubscribe</div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="truncate font-mono text-xs text-foreground">
            webcal://timetable.school.edu/feed/1234.ics
          </span>
          <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </div>
    ),
  },
  {
    icon: SiApple,
    badge: "Your own iCloud calendar",
    title: "Sharing a calendar you own",
    body: "For a calendar you created yourself in iCloud, right-click it and choose Sharing Settings, then turn on Public Calendar. Apple generates a webcal:// link there that you can copy into Casy.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
          Sharing Settings — Family
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Public Calendar</span>
            <span className="flex h-5 w-9 items-center rounded-full bg-primary p-0.5">
              <span className="ml-auto h-4 w-4 rounded-full bg-white" />
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2">
            <span className="truncate font-mono text-xs text-foreground">
              webcal://p01-caldav.icloud.com/published/2/…
            </span>
            <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: SiGoogle,
    badge: "Google Calendar",
    title: "From Google Calendar's settings",
    body: "On calendar.google.com, open Settings, pick the calendar under \"Settings for my calendars\", and scroll to \"Integrate calendar\". Copy the \"Secret address in iCal format\" — treat it like a password, since anyone with it can read the calendar.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
          Integrate calendar
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 ring-1 ring-inset ring-primary/40">
            <span className="text-sm font-medium text-primary">Secret address in iCal format</span>
            <Copy className="h-4 w-4 shrink-0 text-primary" />
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: FaMicrosoft,
    badge: "Outlook Calendar",
    title: "From Outlook's publish option",
    body: "In Outlook on the web, open Settings, then Calendar > Shared calendars, and choose Publish a calendar. Pick the calendar and \"Can view all details\", publish it, then copy the ICS link it gives you.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
          Publish a calendar
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
            Can view all details
          </div>
          <span className="inline-block rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Publish
          </span>
          <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2">
            <span className="truncate font-mono text-xs text-foreground">
              https://outlook.office365.com/owa/calendar/…/calendar.ics
            </span>
            <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: Building2,
    badge: "A school or work platform",
    title: "From a timetable or scheduling site",
    body: "Look around its calendar or account settings for wording like the ones below — that's usually where the link is.",
    visual: (
      <div className="rounded-xl border bg-background p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {["Subscribe", "Sync calendar", "Export", "iCal feed", "ICS link"].map((label) => (
            <span
              key={label}
              className="rounded-full border bg-secondary/40 px-3 py-1 text-xs text-foreground"
            >
              {label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The link itself usually starts with <span className="font-mono">webcal://</span> or ends
          in <span className="font-mono">.ics</span>.
        </p>
      </div>
    ),
  },
];

/**
 * Where to find a calendar's ICS/webcal link, linked from the (?) button on
 * the Calendar link (ICS) card. Unlike Apple's app-specific password (one
 * fixed procedure), a calendar link can come from any number of places, so
 * this page is a set of alternatives rather than a single numbered sequence.
 */
export default function ConnectIcsHelp() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-6">
        <Link
          to="/profile"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>

        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-primary">
          How to find your link
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Find your calendar's link
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          A calendar link (also called an ICS or webcal link) works for any calendar that
          publishes one — a school timetable, a work schedule, or one from Google, Outlook or
          iCloud. Where to find it depends on where the calendar lives, so pick whichever matches
          yours below.
        </p>

        <div className="mt-6 flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Anyone who has this link can read the calendar, so treat it like a password. Casy only
            ever keeps start and end times from it; titles, places and attendees are removed
            before anything is stored.
          </p>
        </div>

        <ul className="mt-8 space-y-6">
          {SOURCES.map((source) => (
            <li key={source.title} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <source.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {source.badge}
                  </p>
                  <h2 className="text-base font-semibold text-foreground">{source.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {source.body}
                  </p>
                </div>
              </div>
              <div className="mt-4 sm:ml-12">{source.visual}</div>
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <Link
            to="/profile"
            className="rounded-full border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            Back to profile
          </Link>
        </div>
      </main>
    </div>
  );
}
