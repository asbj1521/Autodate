import { SiApple } from "react-icons/si";
import { Copy, ExternalLink, KeyRound, LogIn, Mail, ShieldCheck } from "lucide-react";

import HelpGuide, { BrowserChrome, MockPanel, MockRow, type GuideStep } from "@/components/HelpGuide";
import { useLang } from "@/i18n/lang";

/**
 * How to make an Apple app-specific password and connect it, linked from the
 * Apple iCloud Calendar card. Apple has no one-click sign-in for calendars, so
 * this is the one provider that needs a walkthrough rather than a redirect.
 *
 * The drawn screens quote Apple's own wording. The Danish names come from
 * Apple's Danish account pages ("Login og sikkerhed", "App-specifikke
 * adgangskoder"); check them there if Apple renames anything.
 */

const ACCOUNT_URL = "https://account.apple.com/account/manage";
const ACCOUNT_LABEL = "account.apple.com/account/manage";

const link = (
  <a
    href={ACCOUNT_URL}
    target="_blank"
    rel="noreferrer"
    className="font-medium text-foreground underline underline-offset-2"
  >
    {ACCOUNT_LABEL}
  </a>
);

const da = {
  eyebrow: "Sådan forbinder du iCloud",
  title: "Forbind din Apple-kalender",
  intro:
    "Apple har ingen login med ét klik til kalendere, så Casy beder om en app-specifik adgangskode i stedet for din rigtige Apple-id-adgangskode. Det tager omkring et minut at lave en.",
  open: "Åbn dine Apple-kontoindstillinger",
  steps: {
    signIn: {
      title: "Åbn dine Apple-kontoindstillinger",
      body: <>Gå til {link}, og log ind med det Apple-id, hvis kalender du vil forbinde.</>,
    },
    security: {
      title: "Gå til Login og sikkerhed",
      body: "Vælg Login og sikkerhed i menuen til venstre.",
    },
    passwords: {
      title: "Åbn App-specifikke adgangskoder",
      body: "Rul ned til App-specifikke adgangskoder, vælg det, og vælg at lave en ny.",
    },
    create: {
      title: "Giv den et navn, og kopiér adgangskoden",
      body: 'Skriv et navn, for eksempel "Casy", og bekræft. Apple viser kun den nye adgangskode én gang, så kopiér den, før du lukker vinduet.',
    },
    enter: {
      title: "Indsæt den i Casy",
      body: "Gå tilbage til din profil på Casy, åbn Apple iCloud-kalender, og indsæt dit Apple-id og den app-specifikke adgangskode, du lige har kopieret.",
    },
  },
  mock: {
    signInPrompt: "Log ind med dit Apple-id",
    signIn: "Log ind",
    menu: ["Personlige oplysninger", "Login og sikkerhed", "Betaling og levering", "Enheder"],
    security: "Login og sikkerhed",
    passwords: "App-specifikke adgangskoder",
    generate: "Opret adgangskode…",
    dialog: "Opret en app-specifik adgangskode",
    create: "Opret",
    card: "Apple iCloud-kalender",
    connect: "Forbind",
    email: "dig@icloud.com",
  },
  revoke: (
    <>
      Casy gemmer adgangskoden krypteret og spørger kun Apple om tidspunkter, aldrig titler. Du kan
      tilbagekalde den når som helst under App-specifikke adgangskoder på {link}.
    </>
  ),
};

const en: typeof da = {
  eyebrow: "How to connect iCloud",
  title: "Connect your Apple calendar",
  intro:
    "Apple has no one-click sign-in for calendars, so Casy asks for an app-specific password instead of your real Apple ID password. It takes about a minute to generate one.",
  open: "Open Apple account settings",
  steps: {
    signIn: {
      title: "Open your Apple account settings",
      body: <>Go to {link} and sign in with the Apple ID whose calendar you want to connect.</>,
    },
    security: {
      title: "Go to Sign-In and Security",
      body: "In the menu on the left, choose Sign-In and Security.",
    },
    passwords: {
      title: "Open App-Specific Passwords",
      body: "Scroll down to App-Specific Passwords and select it, then choose to generate a new one.",
    },
    create: {
      title: "Label it and copy the password",
      body: 'Type a label, such as "Casy", and confirm. Apple shows the new password only once, so copy it before closing the dialog.',
    },
    enter: {
      title: "Enter it in Casy",
      body: "Back on your Casy profile, open Apple iCloud Calendar, then paste your Apple ID email and the app-specific password you just copied.",
    },
  },
  mock: {
    signInPrompt: "Sign in with your Apple ID",
    signIn: "Sign In",
    menu: ["Personal Information", "Sign-In and Security", "Payment & Shipping", "Devices"],
    security: "Sign-In and Security",
    passwords: "App-Specific Passwords",
    generate: "Generate Password…",
    dialog: "Generate an app-specific password",
    create: "Create",
    card: "Apple iCloud Calendar",
    connect: "Connect",
    email: "you@icloud.com",
  },
  revoke: (
    <>
      Casy stores this password encrypted and only ever asks Apple for event times, never titles.
      You can revoke it at any time under App-Specific Passwords at {link}.
    </>
  ),
};

export default function ConnectIcloudHelp() {
  const { lang } = useLang();
  const c = lang === "da" ? da : en;
  const m = c.mock;

  const steps: GuideStep[] = [
    {
      icon: LogIn,
      ...c.steps.signIn,
      visual: (
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <BrowserChrome url={ACCOUNT_LABEL} />
          <div className="flex flex-col items-center gap-3 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white">
              <SiApple className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">{m.signInPrompt}</p>
            <span className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground ring-2 ring-primary/40 ring-offset-2">
              {m.signIn}
            </span>
          </div>
        </div>
      ),
    },
    {
      icon: ShieldCheck,
      ...c.steps.security,
      visual: (
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="divide-y">
            {m.menu.map((item, i) => (
              <MockRow key={item} active={i === 1}>
                {item}
              </MockRow>
            ))}
          </div>
        </div>
      ),
    },
    {
      icon: KeyRound,
      ...c.steps.passwords,
      visual: (
        <div className="rounded-xl border bg-background p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {m.security}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2 ring-1 ring-inset ring-primary/40">
            <span className="text-sm font-medium text-primary">{m.passwords}</span>
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
              {m.generate}
            </span>
          </div>
        </div>
      ),
    },
    {
      icon: KeyRound,
      ...c.steps.create,
      visual: (
        <MockPanel title={m.dialog}>
          <div className="space-y-3 p-4">
            <div className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm text-foreground">
              Casy
            </div>
            <span className="inline-block rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              {m.create}
            </span>
            <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2">
              <span className="font-mono text-sm tracking-wide text-foreground">
                abcd-efgh-ijkl-mnop
              </span>
              <Copy className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </MockPanel>
      ),
    },
    {
      icon: Mail,
      ...c.steps.enter,
      visual: (
        <div className="rounded-xl border bg-background p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {m.card}
          </p>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              {m.email}
            </div>
            <div className="rounded-lg border bg-secondary/40 px-3 py-2 font-mono text-sm text-muted-foreground">
              abcd-efgh-ijkl-mnop
            </div>
            <span className="inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
              {m.connect}
            </span>
          </div>
        </div>
      ),
    },
  ];

  return (
    <HelpGuide
      eyebrow={c.eyebrow}
      title={c.title}
      intro={c.intro}
      beforeSteps={
        <a
          href={ACCOUNT_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          {c.open}
          <ExternalLink className="h-4 w-4" />
        </a>
      }
      steps={steps}
      afterSteps={<p className="mt-8 text-sm text-muted-foreground">{c.revoke}</p>}
    />
  );
}
