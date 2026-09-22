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
import { useLang } from "@/i18n/lang";

/**
 * What Casy does, from signing in to a found date, in six steps.
 *
 * Every claim here describes what the code actually does (the engine's
 * soft/hard rules, the 7-day invite links, the hourly sync), so update it
 * when those change, the same way as the privacy policy. The page's copy
 * lives here rather than in the shared dictionaries: it is only ever used on
 * this page, and English must match Danish key for key all the same.
 */

const ICONS: LucideIcon[] = [LogIn, CalendarPlus, Tags, Users, SlidersHorizontal, Sparkles];

const da = {
  eyebrow: "Sådan virker det",
  title: 'Fra "hvornår kan I?" til en dato, uden gruppechatten.',
  intro:
    "Casy sammenligner alles kalendere og finder det første tidspunkt, hvor hele gruppen kan. Sæt det op én gang, så tager hver plan derefter få sekunder.",
  steps: [
    {
      title: "Log ind",
      body: "Fortsæt med Google, eller brug din e-mail med en adgangskode eller et login-link, der kun virker én gang.",
    },
    {
      title: "Forbind dine kalendere",
      body: "Forbind Google, Outlook eller iCloud, eller indsæt et kalenderlink, for eksempel et skoleskema. Casy læser kun, hvornår du er optaget, aldrig hvad dine aftaler er, og opdaterer hver time.",
    },
    {
      title: "Sig, hvad hver kalender bruges til",
      body: "Marker kalendere som arbejde, skole, privat eller andet. Til en middag eller en aften tæller alle aftaler som optaget. Til en weekendtur eller en ferie tæller arbejde og skole som tid, du kan tage fri fra: Casy foreslår stadig de datoer og siger, hvem der skal have en fridag. Korte planer som en middag står ikke i vejen for en tur, men at være væk hele dagen gør.",
    },
    {
      title: "Lav en gruppe, og del linket",
      body: "Giv gruppen et navn, kopiér dens invitationslink, og send det til dem, du planlægger med. Et link virker i syv dage. Alle i gruppen kan se hinandens navne, og hvornår de er optaget, og intet andet.",
    },
    {
      title: "Vælg, hvad I planlægger",
      body: "En aften, frokost, middag, gaming, en tur i byen, en weekendtur eller en ferie. Juster, hvor lang tid det tager, hvornår det starter, og hvilke ugedage der passer.",
    },
    {
      title: "Casy finder datoen",
      body: "Du får det tidligste tidspunkt, hvor alle kan. Kalenderen farver hver dag efter, hvor mange der er ledige, og gul betyder kun ledig, hvis nogen tager fri. Passer det ikke helt? Bed om den næste mulighed. Medlemmer, der ikke har forbundet en kalender endnu, bliver nævnt og holdt uden for i stedet for at blive talt som ledige.",
    },
  ],
  neverSeesTitle: "Det ser Casy aldrig",
  neverSeesBody:
    "Kun start og slut på hvert optaget tidsrum gemmes. Titler, steder, noter og gæster bliver aldrig hentet fra Google eller Microsoft. iCloud og kalenderlinks sender altid hele aftaler, så Casy fjerner de oplysninger, før noget gemmes. Gruppemedlemmer ser aldrig navnene på dine kalendere eller hvilke konti, du har forbundet.",
  privacyLink: "Læs privatlivspolitikken",
  findDate: "Find en dato",
  getStarted: "Kom i gang",
  connect: "Forbind kalendere",
};

const en: typeof da = {
  eyebrow: "How it works",
  title: 'From "when are you free?" to a date, without the group chat.',
  intro:
    "Casy compares everyone's calendars and finds the first time the whole group is free. Set it up once, and every plan after that takes seconds.",
  steps: [
    {
      title: "Sign in",
      body: "Continue with Google, or use your email with a password or a one-time sign-in link.",
    },
    {
      title: "Connect your calendars",
      body: "Link Google, Outlook or iCloud, or paste any calendar link, such as a school timetable. Casy only reads when you are busy, never what your events are, and refreshes every hour.",
    },
    {
      title: "Say what each calendar is for",
      body: "Mark calendars as work, school, personal or other. For a dinner or an evening, every event counts as busy. For a weekend trip or a vacation, work and school count as time you could take off: Casy still suggests those dates and says who would need a day off. Short plans like a dinner don't stand in the way of a trip, but being away all day does.",
    },
    {
      title: "Make a group and share the link",
      body: "Name a group, copy its invite link and send it to the people you plan with. A link works for seven days. Everyone in the group sees each other's names and busy times, and nothing more.",
    },
    {
      title: "Pick what you are planning",
      body: "An evening, lunch, dinner, gaming session, night out, weekend trip or vacation. Adjust how long it takes, when it starts and which days of the week work.",
    },
    {
      title: "Casy finds the date",
      body: "You get the earliest time that works for everyone. The calendar shades every day by how many people are free, and amber means free only if someone takes time off. Not quite right? Ask for the next option. Members who have not linked a calendar yet are named and left out, rather than counted as free.",
    },
  ],
  neverSeesTitle: "What Casy never sees",
  neverSeesBody:
    "Only the start and end of each busy period is stored. Event titles, places, notes and guests are never requested from Google or Microsoft. iCloud and calendar links always send whole events, so Casy removes those details before anything is saved. Group members never see your calendars' names or which accounts you connected.",
  privacyLink: "Read the privacy policy",
  findDate: "Find a date",
  getStarted: "Get started",
  connect: "Connect calendars",
};

export default function HowItWorks() {
  const { user } = useAuth();
  const { lang } = useLang();
  const c = lang === "da" ? da : en;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{c.eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          {c.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">{c.intro}</p>

        <ol className="mt-8 space-y-3 sm:mt-10">
          {c.steps.map((step, i) => {
            const Icon = ICONS[i];
            return (
              <li
                key={step.title}
                className="flex gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:gap-4 sm:p-5"
              >
                <div className="flex shrink-0 flex-col items-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary sm:h-10 sm:w-10">
                    <Icon className="h-5 w-5" />
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
            );
          })}
        </ol>

        <section className="mt-8 rounded-2xl bg-secondary p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <EyeOff className="h-5 w-5 text-primary" />
            {c.neverSeesTitle}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {c.neverSeesBody}{" "}
            <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">
              {c.privacyLink}
            </Link>
            .
          </p>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to={user ? "/" : "/sign-in"}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            {user ? c.findDate : c.getStarted}
            <ArrowRight className="h-4 w-4" />
          </Link>
          {user && (
            <Link
              to="/profile"
              className="rounded-full border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
            >
              {c.connect}
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
