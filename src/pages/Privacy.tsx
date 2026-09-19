import type { ReactNode } from "react";

import TopNav from "@/components/TopNav";

/**
 * The public privacy policy. Google links to it from the consent screen, so
 * it must describe what the code actually does; update it whenever what is
 * stored or who can see it changes.
 */

const UPDATED = "20 September 2026";
const CONTACT_EMAIL = "asbjornbay@gmail.com";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-2xl px-6 pb-20 pt-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>

        <Section title="In short">
          <p>
            Casy (short for Calendar Syncing) helps a group find a time that works for everyone. To
            do that it reads when you are busy, and nothing else: never the titles, places, notes or
            guests of your events. Your data is not sold, not used for advertising, and not shared
            with anyone outside the service.
          </p>
        </Section>

        <Section title="What Casy stores">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium text-foreground">Your account:</span> your email address,
              and your name if you sign in with Google.
            </li>
            <li>
              <span className="font-medium text-foreground">Connected calendars:</span> which
              accounts you connected (for example the email address of a Google account), the names
              of their calendars, and the category you give each one (work, school, personal,
              other).
            </li>
            <li>
              <span className="font-medium text-foreground">Busy times:</span> the start and end of
              each busy period, for roughly the next twelve months. Overlapping events are merged
              into one period. Event titles, descriptions, locations and attendees are never
              requested or stored; for calendar links they are removed before anything is saved.
            </li>
            <li>
              <span className="font-medium text-foreground">Access credentials:</span> what is needed
              to keep your calendars up to date: access tokens from Google or Microsoft, an iCloud
              app-specific password, or a calendar link. These are encrypted before they are stored,
              and the key is kept separately from the database.
            </li>
          </ul>
        </Section>

        <Section title="How it is used">
          <p>
            Busy times are used only to show when you and your groups are free and to suggest
            times. Casy refreshes them about once an hour so they stay current. Today only you can
            see your own busy times.
          </p>
          <p>
            Casy&apos;s use and transfer of information received from Google APIs adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="Where it is kept">
          <p>
            Data is stored with Casy&apos;s database provider, Supabase, and the website is served
            by Vercel. Both keep standard technical logs to run their services. Casy uses no
            analytics or advertising trackers. Your browser keeps your login session so you stay
            signed in.
          </p>
        </Section>

        <Section title="Removing your data">
          <p>
            Removing a calendar account on your profile deletes its busy times and credentials from
            Casy immediately. To stop the provider&apos;s side as well, remove Casy&apos;s access in
            your Google or Microsoft account settings, or delete the app-specific password at
            account.apple.com.
          </p>
          <p>
            To delete your Casy account entirely, email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-foreground underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and everything connected to it will be deleted.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data:{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-foreground underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </main>
    </div>
  );
}
