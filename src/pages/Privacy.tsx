import type { ReactNode } from "react";

import TopNav from "@/components/TopNav";

/**
 * The public privacy policy. Google links to it from the consent screen, so
 * it must describe what the code actually does; update it whenever what is
 * stored or who can see it changes.
 */

const UPDATED = "22 September 2026";
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
              and your name if you sign in with Google. If you sign in with an email link, Casy has
              no name for you and uses the part of your email address before the @ instead.
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
              into one period. Event titles, descriptions, locations and attendees are never stored.
              Google and Microsoft are never asked for them. iCloud and calendar links always send
              whole events, so those details are removed before anything is saved.
            </li>
            <li>
              <span className="font-medium text-foreground">Groups:</span> the name of each group
              you are in, who else is in it, who made it, and the invite links made for it. Invite
              links are stored as a fingerprint that cannot be turned back into a working link.
            </li>
            <li>
              <span className="font-medium text-foreground">Suggested events:</span> events
              suggested in your groups: what kind of event it is, the dates offered, who suggested
              it, and who accepted or declined each date.
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
            times. Casy refreshes them about once an hour so they stay current.
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

        <Section title="What other people in your groups can see">
          <p>
            Joining a group means the other members can see your name and when you are busy. That
            is the whole point of a group: Casy cannot find a time that works for everyone without
            it. Busy periods are shown as time ranges, plus whether a range came from a calendar
            you marked as work or school, which is what lets Casy tell "could take time off" apart
            from "not possible".
          </p>
          <p>
            Members do not see your email address, the names of your calendars, which accounts you
            connected, or what any of your events are called. Casy never stores event titles at
            all, so there is nothing there to reveal. One exception to keep in mind: if you signed
            in with an email link and have not chosen a name on your profile, the name members see is
            the part of your email address before the @ (for example "anna.jensen" for
            anna.jensen@example.com). The rest of the address is never shown.
          </p>
          <p>
            Anyone holding a group&apos;s invite link can see the group&apos;s name and how many
            members it has, and can join it, for the seven days the link works. Treat an invite
            link like an address you would only send to people you want in the group. Leaving a
            group stops the other members seeing anything about you from then on. The person who
            made a group can delete it, which removes it for every member at once.
          </p>
          <p>
            When someone suggests an event, everyone in the group sees it, the date on offer, and
            who has accepted or declined. If you decline, the others see that you could not make
            that date, and Casy offers the next date that works instead.
          </p>
        </Section>

        <Section title="What the person running Casy can see">
          <p>
            Casy is run by one person, who has an admin view to keep the service working and to
            help people who get in touch. It shows everyone&apos;s name, when they signed up and
            last signed in, how many groups and calendars they have, every group with its members,
            and which calendar services each person connected and whether they are syncing. It does
            not show email addresses, busy times or anything about your events.
          </p>
          <p>
            From that view they can delete a group, remove someone from a group, delete an account,
            or refresh a calendar that has stopped syncing. As the operator they can also reach the
            database directly when that is needed to run or repair the service. They do not look
            at your data for any other reason.
          </p>
        </Section>

        <Section title="Where it is kept">
          <p>
            Data is stored with Casy&apos;s database provider, Supabase, and the website is served
            by Vercel. Sign-in emails are delivered by Resend, which receives your email address in
            order to send them. All three keep standard technical logs to run their services. Casy
            uses no analytics or advertising trackers. Your browser keeps your login session so you
            stay signed in, and a copy of your own group list, your calendar connections and
            whether you have admin access, so pages open instantly. That copy is deleted when you
            sign out and is never kept for more than a week. Nothing about other people&apos;s
            calendars is stored in your browser.
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
            Leaving a group removes you from it straight away, and the other members stop seeing
            anything about you. If you were the last member, the group is deleted with you.
          </p>
          <p>
            To delete your Casy account entirely, email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-foreground underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and everything connected to it will be deleted: your calendars, busy times, credentials
            and group memberships. Groups where you were the only member are deleted too; groups
            with other members carry on without you.
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
