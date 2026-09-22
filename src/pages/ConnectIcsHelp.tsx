import { FaMicrosoft } from "react-icons/fa6";
import { SiApple, SiGoogle } from "react-icons/si";
import { Building2, Copy, Info } from "lucide-react";

import HelpGuide, { MockPanel, type GuideStep } from "@/components/HelpGuide";
import { useLang } from "@/i18n/lang";

/**
 * Where to find a calendar's ICS/webcal link, linked from the Calendar link
 * (ICS) card. A link can come from many places, so this is a set of
 * alternatives rather than one numbered procedure. The drawn screens quote
 * each app's own wording, in the page's language.
 */

const da = {
  eyebrow: "Sådan finder du dit link",
  title: "Find din kalenders link",
  intro:
    "Et kalenderlink (også kaldet et ICS- eller webcal-link) virker for enhver kalender, der udgiver et: et skoleskema, en arbejdsplan eller en kalender fra Google, Outlook eller iCloud. Hvor du finder det, afhænger af, hvor kalenderen ligger, så vælg den, der passer til din.",
  warning:
    "Alle med linket kan læse kalenderen, så behandl det som en adgangskode. Casy gemmer kun start- og sluttider fra det. Titler, steder og deltagere fjernes, før noget gemmes.",
  sources: {
    subscribed: {
      badge: "Hurtigst, hvis det passer på dig",
      title: "Abonnerer du allerede på den i Apple Kalender?",
      body: "Har du allerede tilføjet kalenderen på din iPhone eller Mac (for eksempel et skoleskema), behøver du ikke finde det oprindelige link igen. Åbn Kalender-appen, højreklik (eller ctrl-klik) på kalenderen i sidepanelet, og vælg Vis info. Kalenderens link står lige der, klar til at blive kopieret.",
    },
    own: {
      badge: "Din egen iCloud-kalender",
      title: "Del en kalender, du selv har lavet",
      body: "Har du selv lavet kalenderen i iCloud, så højreklik på den, vælg Delingsindstillinger, og slå Offentlig kalender til. Apple laver et webcal://-link, som du kan kopiere ind i Casy.",
    },
    google: {
      badge: "Google Kalender",
      title: "Fra indstillingerne i Google Kalender",
      body: 'Gå til calendar.google.com, åbn Indstillinger, vælg kalenderen under "Indstillinger for mine kalendere", og rul ned til "Integrer kalender". Kopiér "Hemmelig adresse i iCal-format", og behandl den som en adgangskode, da alle med den kan læse kalenderen.',
    },
    outlook: {
      badge: "Outlook-kalender",
      title: "Fra Outlooks udgivelse af kalendere",
      body: 'Åbn Indstillinger i Outlook på nettet, gå til Kalender og så Delte kalendere, og vælg Udgiv en kalender. Vælg kalenderen og "Kan se alle detaljer", udgiv den, og kopiér det ICS-link, du får.',
    },
    platform: {
      badge: "En skole- eller arbejdsplatform",
      title: "Fra et skema eller en planlægningsside",
      body: "Kig efter ord som dem nedenfor i platformens kalender- eller kontoindstillinger. Det er som regel dér, linket ligger.",
    },
  },
  mock: {
    sidebar: ["Hjem", "Skole", "Familie"],
    getInfo: "Vis info",
    unsubscribe: "Afmeld",
    sharing: "Delingsindstillinger: Familie",
    publicCalendar: "Offentlig kalender",
    integrate: "Integrer kalender",
    secretAddress: "Hemmelig adresse i iCal-format",
    publishTitle: "Udgiv en kalender",
    canView: "Kan se alle detaljer",
    publish: "Udgiv",
    keywords: ["Abonner", "Synkroniser kalender", "Eksporter", "iCal-feed", "ICS-link"],
    looksLike: (
      <>
        Selve linket starter som regel med <span className="font-mono">webcal://</span> eller
        slutter på <span className="font-mono">.ics</span>.
      </>
    ),
  },
};

const en: typeof da = {
  eyebrow: "How to find your link",
  title: "Find your calendar's link",
  intro:
    "A calendar link (also called an ICS or webcal link) works for any calendar that publishes one: a school timetable, a work schedule, or one from Google, Outlook or iCloud. Where to find it depends on where the calendar lives, so pick whichever matches yours below.",
  warning:
    "Anyone who has this link can read the calendar, so treat it like a password. Casy only ever keeps start and end times from it; titles, places and attendees are removed before anything is stored.",
  sources: {
    subscribed: {
      badge: "Fastest, if it applies to you",
      title: "Already subscribed to it in Apple Calendar?",
      body: "If you've already added this calendar to your iPhone or Mac (a school timetable, for example), you don't need to go find the original link again. Open the Calendar app, right-click (or Control-click) the calendar in the sidebar and choose Get Info. The feed's link is right there, ready to copy.",
    },
    own: {
      badge: "Your own iCloud calendar",
      title: "Sharing a calendar you own",
      body: "For a calendar you created yourself in iCloud, right-click it and choose Sharing Settings, then turn on Public Calendar. Apple generates a webcal:// link there that you can copy into Casy.",
    },
    google: {
      badge: "Google Calendar",
      title: "From Google Calendar's settings",
      body: 'On calendar.google.com, open Settings, pick the calendar under "Settings for my calendars", and scroll to "Integrate calendar". Copy the "Secret address in iCal format" and treat it like a password, since anyone with it can read the calendar.',
    },
    outlook: {
      badge: "Outlook Calendar",
      title: "From Outlook's publish option",
      body: 'In Outlook on the web, open Settings, then Calendar > Shared calendars, and choose Publish a calendar. Pick the calendar and "Can view all details", publish it, then copy the ICS link it gives you.',
    },
    platform: {
      badge: "A school or work platform",
      title: "From a timetable or scheduling site",
      body: "Look around its calendar or account settings for wording like the ones below. That's usually where the link is.",
    },
  },
  mock: {
    sidebar: ["Home", "School", "Family"],
    getInfo: "Get Info",
    unsubscribe: "Unsubscribe",
    sharing: "Sharing Settings: Family",
    publicCalendar: "Public Calendar",
    integrate: "Integrate calendar",
    secretAddress: "Secret address in iCal format",
    publishTitle: "Publish a calendar",
    canView: "Can view all details",
    publish: "Publish",
    keywords: ["Subscribe", "Sync calendar", "Export", "iCal feed", "ICS link"],
    looksLike: (
      <>
        The link itself usually starts with <span className="font-mono">webcal://</span> or ends
        in <span className="font-mono">.ics</span>.
      </>
    ),
  },
};

export default function ConnectIcsHelp() {
  const { lang } = useLang();
  const c = lang === "da" ? da : en;
  const m = c.mock;

  const steps: GuideStep[] = [
    {
      icon: SiApple,
      ...c.sources.subscribed,
      visual: (
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="grid grid-cols-[104px_1fr] divide-x sm:grid-cols-[128px_1fr]">
            <div className="divide-y bg-secondary/40 text-sm">
              {m.sidebar.map((name, i) => (
                <div
                  key={name}
                  className={
                    i === 1
                      ? "bg-primary/10 px-3 py-2 font-medium text-primary ring-1 ring-inset ring-primary/40"
                      : "px-3 py-2 text-muted-foreground"
                  }
                >
                  {name}
                </div>
              ))}
            </div>
            <div className="relative p-3">
              <div className="w-full max-w-44 rounded-lg border bg-background p-1 text-xs shadow-md">
                <div className="rounded-md bg-primary/10 px-2.5 py-1.5 font-medium text-primary">
                  {m.getInfo}
                </div>
                <div className="rounded-md px-2.5 py-1.5 text-muted-foreground">{m.unsubscribe}</div>
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
      ...c.sources.own,
      visual: (
        <MockPanel title={m.sharing}>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{m.publicCalendar}</span>
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
        </MockPanel>
      ),
    },
    {
      icon: SiGoogle,
      ...c.sources.google,
      visual: (
        <MockPanel title={m.integrate}>
          <div className="p-4">
            <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 ring-1 ring-inset ring-primary/40">
              <span className="text-sm font-medium text-primary">{m.secretAddress}</span>
              <Copy className="h-4 w-4 shrink-0 text-primary" />
            </div>
          </div>
        </MockPanel>
      ),
    },
    {
      icon: FaMicrosoft,
      ...c.sources.outlook,
      visual: (
        <MockPanel title={m.publishTitle}>
          <div className="space-y-3 p-4">
            <div className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              {m.canView}
            </div>
            <span className="inline-block rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              {m.publish}
            </span>
            <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2">
              <span className="truncate font-mono text-xs text-foreground">
                https://outlook.office365.com/owa/calendar/…/calendar.ics
              </span>
              <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          </div>
        </MockPanel>
      ),
    },
    {
      icon: Building2,
      ...c.sources.platform,
      visual: (
        <div className="rounded-xl border bg-background p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {m.keywords.map((word) => (
              <span
                key={word}
                className="rounded-full border bg-secondary/40 px-3 py-1 text-xs text-foreground"
              >
                {word}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{m.looksLike}</p>
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
        <div className="mt-6 flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>{c.warning}</p>
        </div>
      }
      steps={steps}
      numbered={false}
    />
  );
}
