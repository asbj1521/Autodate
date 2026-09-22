import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiApple } from "react-icons/si";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import TopNav from "@/components/TopNav";
import { cn } from "@/lib/utils";

const ACCOUNT_URL = "https://account.apple.com/account/manage";

/** A row in one of the illustrated mockups below, highlighted when it's the one to click. */
function MockRow({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "px-4 py-2.5 text-sm",
        active
          ? "bg-primary/10 font-semibold text-primary ring-1 ring-inset ring-primary/40"
          : "text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

/** The little three-dot browser chrome atop the address-bar mockup in step 1. */
function BrowserChrome({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b bg-secondary/60 px-3 py-2">
      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      <span className="ml-2 truncate rounded-md border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
        {url}
      </span>
    </div>
  );
}

interface Step {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  visual: ReactNode;
}

const STEPS: Step[] = [
  {
    icon: LogIn,
    title: "Open your Apple account settings",
    body: (
      <>
        Go to{" "}
        <a
          href={ACCOUNT_URL}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground underline underline-offset-2"
        >
          account.apple.com/account/manage
        </a>{" "}
        and sign in with the Apple ID whose calendar you want to connect.
      </>
    ),
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <BrowserChrome url="account.apple.com/account/manage" />
        <div className="flex flex-col items-center gap-3 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white">
            <SiApple className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground">Sign in with your Apple ID</p>
          <span className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground ring-2 ring-primary/40 ring-offset-2">
            Sign In
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Go to Sign-In and Security",
    body: "In the menu on the left, choose Sign-In and Security.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="divide-y">
          <MockRow>Personal Information</MockRow>
          <MockRow active>Sign-In and Security</MockRow>
          <MockRow>Payment &amp; Shipping</MockRow>
          <MockRow>Devices</MockRow>
        </div>
      </div>
    ),
  },
  {
    icon: KeyRound,
    title: "Open App-Specific Passwords",
    body: "Scroll down to App-Specific Passwords and select it, then choose to generate a new one.",
    visual: (
      <div className="rounded-xl border bg-background p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sign-In and Security
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2 ring-1 ring-inset ring-primary/40">
          <span className="text-sm font-medium text-primary">App-Specific Passwords</span>
          <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            Generate Password…
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: KeyRound,
    title: "Label it and copy the password",
    body: "Type a label, such as \"Casy\", and confirm. Apple shows the new password only once, so copy it before closing the dialog.",
    visual: (
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
          Generate an app-specific password
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm text-foreground">
            Casy
          </div>
          <span className="inline-block rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Create
          </span>
          <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2">
            <span className="font-mono text-sm tracking-wide text-foreground">
              abcd-efgh-ijkl-mnop
            </span>
            <Copy className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: Mail,
    title: "Enter it in Casy",
    body: "Back on your Casy profile, open Apple iCloud Calendar, then paste your Apple ID email and the app-specific password you just copied.",
    visual: (
      <div className="rounded-xl border bg-background p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Apple iCloud Calendar
        </p>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
            you@icloud.com
          </div>
          <div className="rounded-lg border bg-secondary/40 px-3 py-2 font-mono text-sm text-muted-foreground">
            abcd-efgh-ijkl-mnop
          </div>
          <span className="inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
            Connect
          </span>
        </div>
      </div>
    ),
  },
];

/**
 * Step-by-step guide for generating an Apple app-specific password and
 * connecting it in Casy, linked from the (?) button on the Apple iCloud
 * Calendar card. Apple has no one-click sign-in for calendars, so this is
 * the one provider that needs a walkthrough rather than an OAuth redirect.
 */
export default function ConnectIcloudHelp() {
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
          How to connect iCloud
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          Connect your Apple calendar
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Apple has no one-click sign-in for calendars, so Casy asks for an app-specific password
          instead of your real Apple ID password. It takes about a minute to generate one.
        </p>

        <a
          href={ACCOUNT_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          Open Apple account settings
          <ExternalLink className="h-4 w-4" />
        </a>

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

        <p className="mt-8 text-sm text-muted-foreground">
          Casy stores this password encrypted and only ever asks Apple for event times, never
          titles. You can revoke it at any time under App-Specific Passwords at{" "}
          <a
            href={ACCOUNT_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            account.apple.com/account/manage
          </a>
          .
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
