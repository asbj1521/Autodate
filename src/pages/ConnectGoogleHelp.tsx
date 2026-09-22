import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiGoogle } from "react-icons/si";
import { AlertTriangle, ArrowLeft, CheckCircle2, EyeOff, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import TopNav from "@/components/TopNav";

interface Step {
  icon: LucideIcon | typeof SiGoogle;
  title: string;
  body: ReactNode;
  visual: ReactNode;
}

const STEPS: Step[] = [
  {
    icon: SiGoogle,
    title: "Click Connect",
    body: "On the Google Calendar card, click Connect. Google opens in a new tab and asks which account to use.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
              <SiGoogle className="h-3.5 w-3.5" style={{ color: "#4285F4" }} />
            </span>
            Google Calendar
          </div>
          <span className="rounded-full border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground ring-2 ring-primary/40 ring-offset-2">
            Connect
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Choose your Google account",
    body: "Pick the account whose calendar you want to read, or sign in if you're not already.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
          Choose an account
        </div>
        <div className="divide-y">
          <div className="flex items-center gap-3 bg-primary/10 px-4 py-2.5 ring-1 ring-inset ring-primary/40">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              A
            </span>
            <span className="text-sm font-medium text-primary">you@gmail.com</span>
          </div>
          <div className="px-4 py-2.5 text-sm text-muted-foreground">Use another account</div>
        </div>
      </div>
    ),
  },
  {
    icon: AlertTriangle,
    title: "\"Google hasn't verified this app\"? That's expected",
    body: "Casy is a small app awaiting Google's review, so Google shows a warning before continuing. Click Advanced, then Go to Casy (unsafe) to proceed — Google only lets this through because Casy has told Google exactly which permissions it needs, and asks for nothing beyond your free/busy times.",
    visual: (
      <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
        <div className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Google hasn't verified this app</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              The app is requesting access to sensitive info in your Google Account.
            </p>
            <p className="mt-3 text-xs font-semibold text-amber-900 underline underline-offset-2">
              Advanced
            </p>
            <p className="mt-1 text-xs font-semibold text-amber-900">Go to Casy (unsafe)</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: CheckCircle2,
    title: "Allow the permissions and you're done",
    body: "Confirm the access Casy is asking for. Once you allow it, Casy reads your free/busy times right away and keeps them in sync automatically every hour.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
          Casy wants to access your Google Account
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary ring-1 ring-inset ring-primary/40">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            See your calendars' free/busy information
          </div>
          <span className="mt-2 inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
            Continue
          </span>
        </div>
      </div>
    ),
  },
];

/**
 * What to expect when connecting Google Calendar, linked from the (?) button
 * on that card. It's a one-click OAuth flow, so the only real friction is
 * Google's "unverified app" warning while Casy's verification is pending
 * (see the Google OAuth note in CLAUDE.md) — this page exists mostly to
 * explain that screen so it doesn't look like something went wrong.
 */
export default function ConnectGoogleHelp() {
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
          How it works
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Connect Google Calendar
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          One click, no password to type. Here's exactly what happens, including the warning
          screen Google shows while Casy is still awaiting verification.
        </p>

        <ol className="mt-10 space-y-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl border bg-card p-5 shadow-sm">
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
              <div className="mt-4 sm:ml-12">{step.visual}</div>
            </li>
          ))}
        </ol>

        <p className="mt-8 flex items-start gap-2 text-sm text-muted-foreground">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Casy never asks Google for event titles, places or guests — only when you're busy.
        </p>

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
