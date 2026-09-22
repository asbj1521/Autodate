import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import TopNav from "@/components/TopNav";
import { useT } from "@/i18n/lang";
import { cn } from "@/lib/utils";

/** One card in a guide: what to do, and a drawing of the screen it happens on. */
export interface GuideStep {
  icon: ComponentType<{ className?: string }>;
  /** A small label above the title; guides of alternatives use it instead of a number. */
  badge?: string;
  title: string;
  body: ReactNode;
  visual: ReactNode;
}

/**
 * The frame every "how to connect" guide shares: a way back to the profile,
 * the heading, the steps, and whatever the guide adds around them. Numbered
 * steps are one procedure in order; unnumbered ones are alternatives.
 */
export default function HelpGuide({
  eyebrow,
  title,
  intro,
  beforeSteps,
  steps,
  numbered = true,
  afterSteps,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  beforeSteps?: ReactNode;
  steps: GuideStep[];
  numbered?: boolean;
  afterSteps?: ReactNode;
}) {
  const t = useT();
  const List = numbered ? "ol" : "ul";

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-6">
        <Link
          to="/profile"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.calendarView.back}
        </Link>

        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">{intro}</p>

        {beforeSteps}

        <List className="mt-8 space-y-4 sm:mt-10 sm:space-y-6">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <step.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  {step.badge && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {step.badge}
                    </p>
                  )}
                  <h2 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
                    {numbered && (
                      <span className="text-sm font-medium tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                    )}
                    {step.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </div>
              <div className="mt-3 sm:ml-12 sm:mt-4">{step.visual}</div>
            </li>
          ))}
        </List>

        {afterSteps}

        <div className="mt-6">
          <Link
            to="/profile"
            className="rounded-full border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            {t.calendarView.back}
          </Link>
        </div>
      </main>
    </div>
  );
}

/** A row in a drawn screen, highlighted when it is the one to click. */
export function MockRow({ active, children }: { active?: boolean; children: ReactNode }) {
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

/** The three-dot browser bar atop a drawn web page. */
export function BrowserChrome({ url }: { url: string }) {
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

/** A drawn dialog or panel: a small title bar over its contents. */
export function MockPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
