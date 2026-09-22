import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FaMicrosoft } from "react-icons/fa6";
import { CheckCircle2, EyeOff, ArrowLeft, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import TopNav from "@/components/TopNav";

interface Step {
  icon: LucideIcon | typeof FaMicrosoft;
  title: string;
  body: ReactNode;
  visual: ReactNode;
}

const STEPS: Step[] = [
  {
    icon: FaMicrosoft,
    title: "Click Connect",
    body: "On the Outlook Calendar card, click Connect. Microsoft opens and asks you to sign in.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100">
              <FaMicrosoft className="h-3.5 w-3.5" style={{ color: "#0078D4" }} />
            </span>
            Outlook Calendar
          </div>
          <span className="rounded-full border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground ring-2 ring-primary/40 ring-offset-2">
            Connect
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: FaMicrosoft,
    title: "Sign in with your Microsoft account",
    body: "Work, school or personal: whichever account's calendar you want to read.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
          Sign in
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
            you@outlook.com
          </div>
          <span className="inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
            Next
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: CheckCircle2,
    title: "Accept the permissions and you're done",
    body: "Review the access Casy is requesting and accept it. Casy reads your free/busy times right away and keeps them in sync automatically every hour.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
          Casy would like to
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary ring-1 ring-inset ring-primary/40">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Read your calendars
          </div>
          <span className="mt-2 inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
            Accept
          </span>
        </div>
      </div>
    ),
  },
];

/**
 * What to expect when connecting Outlook Calendar, linked from the (?)
 * button on that card. A short page since it's a plain one-click OAuth
 * flow with no verification warning to explain, unlike Google's.
 */
export default function ConnectOutlookHelp() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-6">
        <Link
          to="/profile"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>

        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-primary">
          How it works
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          Connect Outlook Calendar
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          One click, no password to type. Here's exactly what happens.
        </p>

        <ol className="mt-8 space-y-4 sm:mt-10 sm:space-y-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <step.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
                    <span className="text-sm font-medium tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    {step.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </div>
              <div className="mt-3 sm:ml-12 sm:mt-4">{step.visual}</div>
            </li>
          ))}
        </ol>

        <p className="mt-8 flex items-start gap-2 text-sm text-muted-foreground">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Casy never asks Microsoft for event titles, places or guests. It only sees when you're busy.
        </p>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Some schools and workplaces block this sign-in from working at all. If Connect doesn't
            get you anywhere, you can usually get the same result by publishing your Outlook
            calendar and adding that link under{" "}
            <Link
              to="/help/connect-ics"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Calendar link (ICS)
            </Link>{" "}
            instead. It's a common workaround for accounts managed by an organization.
          </p>
        </div>

        <div className="mt-6">
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
