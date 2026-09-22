import { SiGoogle } from "react-icons/si";
import { AlertTriangle, CheckCircle2, EyeOff, ShieldCheck } from "lucide-react";

import HelpGuide, { MockPanel, type GuideStep } from "@/components/HelpGuide";
import { useLang } from "@/i18n/lang";

/**
 * What to expect when connecting Google Calendar, linked from that card. It
 * is a one-click OAuth flow, so the only real friction is Google's "unverified
 * app" warning while Casy's verification is pending; this page mostly exists
 * to explain that screen so it doesn't look like something went wrong.
 */

const da = {
  eyebrow: "Sådan virker det",
  title: "Forbind Google Kalender",
  intro:
    "Ét klik og ingen adgangskode at skrive. Her er præcis, hvad der sker, også den advarsel, Google viser, mens Casy venter på at blive godkendt.",
  steps: {
    connect: {
      title: "Tryk på Forbind",
      body: "Tryk på Forbind på kortet Google Kalender. Google åbner og spørger, hvilken konto du vil bruge.",
    },
    account: {
      title: "Vælg din Google-konto",
      body: "Vælg den konto, hvis kalender du vil forbinde, eller log ind, hvis du ikke allerede er logget ind.",
    },
    warning: {
      title: '"Google har ikke bekræftet denne app"? Det er forventet',
      body: "Casy er en lille app, der venter på Googles gennemgang, så Google viser en advarsel, før du kan fortsætte. Tryk på Avanceret og så Gå til Casy (usikker) for at fortsætte. Casy beder kun om at se, hvornår du er ledig og optaget.",
    },
    allow: {
      title: "Giv adgang, så er du færdig",
      body: "Bekræft den adgang, Casy beder om. Så snart du har givet adgang, henter Casy dine ledige og optagede tider og holder dem opdateret hver time.",
    },
  },
  mock: {
    card: "Google Kalender",
    connect: "Forbind",
    chooseAccount: "Vælg en konto",
    email: "dig@gmail.com",
    otherAccount: "Brug en anden konto",
    unverified: "Google har ikke bekræftet denne app",
    unverifiedBody: "Appen anmoder om adgang til følsomme oplysninger på din Google-konto.",
    advanced: "Avanceret",
    goTo: "Gå til Casy (usikker)",
    wantsAccess: "Casy vil gerne have adgang til din Google-konto",
    permission: "Se oplysninger om ledig og optaget tid i dine kalendere",
    continue: "Fortsæt",
  },
  never: "Casy beder aldrig Google om titler, steder eller gæster. Casy ser kun, hvornår du er optaget.",
};

const en: typeof da = {
  eyebrow: "How it works",
  title: "Connect Google Calendar",
  intro:
    "One click, no password to type. Here's exactly what happens, including the warning screen Google shows while Casy is still awaiting verification.",
  steps: {
    connect: {
      title: "Click Connect",
      body: "On the Google Calendar card, click Connect. Google opens and asks which account to use.",
    },
    account: {
      title: "Choose your Google account",
      body: "Pick the account whose calendar you want to read, or sign in if you're not already.",
    },
    warning: {
      title: "\"Google hasn't verified this app\"? That's expected",
      body: "Casy is a small app awaiting Google's review, so Google shows a warning before continuing. Click Advanced, then Go to Casy (unsafe) to continue. Casy only asks for your free and busy times.",
    },
    allow: {
      title: "Allow the permissions and you're done",
      body: "Confirm the access Casy is asking for. Once you allow it, Casy reads your free/busy times right away and keeps them in sync automatically every hour.",
    },
  },
  mock: {
    card: "Google Calendar",
    connect: "Connect",
    chooseAccount: "Choose an account",
    email: "you@gmail.com",
    otherAccount: "Use another account",
    unverified: "Google hasn't verified this app",
    unverifiedBody: "The app is requesting access to sensitive info in your Google Account.",
    advanced: "Advanced",
    goTo: "Go to Casy (unsafe)",
    wantsAccess: "Casy wants to access your Google Account",
    permission: "See your calendars' free/busy information",
    continue: "Continue",
  },
  never: "Casy never asks Google for event titles, places or guests. It only sees when you're busy.",
};

export default function ConnectGoogleHelp() {
  const { lang } = useLang();
  const c = lang === "da" ? da : en;
  const m = c.mock;

  const steps: GuideStep[] = [
    {
      icon: SiGoogle,
      ...c.steps.connect,
      visual: (
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                <SiGoogle className="h-3.5 w-3.5" style={{ color: "#4285F4" }} />
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
      icon: ShieldCheck,
      ...c.steps.account,
      visual: (
        <MockPanel title={m.chooseAccount}>
          <div className="divide-y">
            <div className="flex items-center gap-3 bg-primary/10 px-4 py-2.5 ring-1 ring-inset ring-primary/40">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                A
              </span>
              <span className="text-sm font-medium text-primary">{m.email}</span>
            </div>
            <div className="px-4 py-2.5 text-sm text-muted-foreground">{m.otherAccount}</div>
          </div>
        </MockPanel>
      ),
    },
    {
      icon: AlertTriangle,
      ...c.steps.warning,
      visual: (
        <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
          <div className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">{m.unverified}</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">{m.unverifiedBody}</p>
              <p className="mt-3 text-xs font-semibold text-amber-900 underline underline-offset-2">
                {m.advanced}
              </p>
              <p className="mt-1 text-xs font-semibold text-amber-900">{m.goTo}</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      icon: CheckCircle2,
      ...c.steps.allow,
      visual: (
        <MockPanel title={m.wantsAccess}>
          <div className="space-y-2 p-4">
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary ring-1 ring-inset ring-primary/40">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {m.permission}
            </div>
            <span className="mt-2 inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
              {m.continue}
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
        <p className="mt-8 flex items-start gap-2 text-sm text-muted-foreground">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {c.never}
        </p>
      }
    />
  );
}
