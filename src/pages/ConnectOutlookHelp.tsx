import { Link } from "react-router-dom";
import { FaMicrosoft } from "react-icons/fa6";
import { CheckCircle2, EyeOff, Info } from "lucide-react";

import HelpGuide, { MockPanel, type GuideStep } from "@/components/HelpGuide";
import { useLang } from "@/i18n/lang";

/**
 * What to expect when connecting Outlook Calendar, linked from that card. A
 * plain one-click OAuth flow with no verification warning to explain, plus
 * the way round it for organisations that block the sign-in outright.
 */

const icsLink = (label: string) => (
  <Link to="/help/connect-ics" className="font-medium text-foreground underline underline-offset-2">
    {label}
  </Link>
);

const da = {
  eyebrow: "Sådan virker det",
  title: "Forbind Outlook-kalender",
  intro: "Ét klik og ingen adgangskode at skrive. Her er præcis, hvad der sker.",
  steps: {
    connect: {
      title: "Tryk på Forbind",
      body: "Tryk på Forbind på kortet Outlook-kalender. Microsoft åbner og beder dig logge på.",
    },
    signIn: {
      title: "Log på med din Microsoft-konto",
      body: "Arbejde, skole eller privat: den konto, hvis kalender du vil forbinde.",
    },
    accept: {
      title: "Accepter adgangen, så er du færdig",
      body: "Se den adgang, Casy beder om, og accepter den. Casy henter dine ledige og optagede tider med det samme og holder dem opdateret hver time.",
    },
  },
  mock: {
    card: "Outlook-kalender",
    connect: "Forbind",
    signIn: "Log på",
    email: "dig@outlook.com",
    next: "Næste",
    wantsTo: "Casy vil gerne",
    permission: "Læse dine kalendere",
    accept: "Accepter",
  },
  never: "Casy beder aldrig Microsoft om titler, steder eller gæster. Casy ser kun, hvornår du er optaget.",
  blocked: (
    <>
      Nogle skoler og arbejdspladser blokerer det her login helt. Kommer du ikke videre efter Forbind,
      kan du som regel få det samme ved at udgive din Outlook-kalender og tilføje det link under{" "}
      {icsLink("Kalenderlink (ICS)")} i stedet. Det er en almindelig løsning for konti, som en
      organisation styrer.
    </>
  ),
};

const en: typeof da = {
  eyebrow: "How it works",
  title: "Connect Outlook Calendar",
  intro: "One click, no password to type. Here's exactly what happens.",
  steps: {
    connect: {
      title: "Click Connect",
      body: "On the Outlook Calendar card, click Connect. Microsoft opens and asks you to sign in.",
    },
    signIn: {
      title: "Sign in with your Microsoft account",
      body: "Work, school or personal: whichever account's calendar you want to read.",
    },
    accept: {
      title: "Accept the permissions and you're done",
      body: "Review the access Casy is requesting and accept it. Casy reads your free/busy times right away and keeps them in sync automatically every hour.",
    },
  },
  mock: {
    card: "Outlook Calendar",
    connect: "Connect",
    signIn: "Sign in",
    email: "you@outlook.com",
    next: "Next",
    wantsTo: "Casy would like to",
    permission: "Read your calendars",
    accept: "Accept",
  },
  never: "Casy never asks Microsoft for event titles, places or guests. It only sees when you're busy.",
  blocked: (
    <>
      Some schools and workplaces block this sign-in from working at all. If Connect doesn't get
      you anywhere, you can usually get the same result by publishing your Outlook calendar and
      adding that link under {icsLink("Calendar link (ICS)")} instead. It's a common workaround for
      accounts managed by an organization.
    </>
  ),
};

export default function ConnectOutlookHelp() {
  const { lang } = useLang();
  const c = lang === "da" ? da : en;
  const m = c.mock;

  const steps: GuideStep[] = [
    {
      icon: FaMicrosoft,
      ...c.steps.connect,
      visual: (
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100">
                <FaMicrosoft className="h-3.5 w-3.5" style={{ color: "#0078D4" }} />
              </span>
              {m.card}
            </div>
            <span className="rounded-full border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground ring-2 ring-primary/40 ring-offset-2">
              {m.connect}
            </span>
          </div>
        </div>
      ),
    },
    {
      icon: FaMicrosoft,
      ...c.steps.signIn,
      visual: (
        <MockPanel title={m.signIn}>
          <div className="space-y-3 p-4">
            <div className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              {m.email}
            </div>
            <span className="inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
              {m.next}
            </span>
          </div>
        </MockPanel>
      ),
    },
    {
      icon: CheckCircle2,
      ...c.steps.accept,
      visual: (
        <MockPanel title={m.wantsTo}>
          <div className="space-y-2 p-4">
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary ring-1 ring-inset ring-primary/40">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {m.permission}
            </div>
            <span className="mt-2 inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
              {m.accept}
            </span>
          </div>
        </MockPanel>
      ),
    },
  ];

  return (
    <HelpGuide
      eyebrow={c.eyebrow}
      title={c.title}
      intro={c.intro}
      steps={steps}
      afterSteps={
        <>
          <p className="mt-8 flex items-start gap-2 text-sm text-muted-foreground">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {c.never}
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>{c.blocked}</p>
          </div>
        </>
      }
    />
  );
}
