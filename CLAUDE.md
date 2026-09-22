# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Operational Rules

- Execute tools and commands without asking for permission first
- Prioritize methodical execution over speed; explain reasoning as you go
- Treat the user as a capable engineer; avoid over-explaining obvious concepts
- Explain code changes as you would to a junior engineer: clear, educational, thorough
- Request confirmation before committing changes to git; validate correctness together first
- Commit only when the user explicitly says so ("commit"); never commit or push on your own
- Provide critical, honest analysis; prioritize solution quality over convenience
- Ask clarifying questions when intent is ambiguous rather than assuming
- Website copy: no emojis, and no em or en dashes

## Project Overview

**Casy** (short for Calendar Syncing; formerly Autodate) is a scheduling tool that helps groups of people find dates that work for everyone. Live at **https://casy.app** (`www.casy.app` 308s to the apex; the older `casy-red.vercel.app` still serves, so invite links sent before the move keep working). The Supabase project, folder, git remote URL and internal code names still say "autodate" on purpose (board IDs and links depend on them); only user-facing text says Casy. The GitHub repo itself is now `asbj1521/casy`; the old `asbj1521/Autodate` URLs redirect, which is why the git remote still works. Never change the `"autodate lookup hash v1"` label in `secretBox.ts`: it would change every stored ICS-link hash.

Casy Users sign in, link their calendars (Google, Outlook, Apple iCloud, or any ICS link), and the app finds the earliest shared free window in their busy times.

**Current state:** everything a signed-in user touches is real: their calendars (stored in Supabase, re-synced hourly), friend groups with invite links (`/join/:token`), and group availability built from every member's real busy times. Someone with no groups yet sees ten generated example groups (`src/api/mockData.ts`), each labelled "Example", with their own real calendar swapped into the "you" slot. The profile page lists your groups (leave any, delete ones you created) and, for admins only, opens admin mode.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite, React Router v7
- **UI:** Tailwind CSS with hand-built components (`src/components/`); only `@radix-ui/react-tooltip` from Radix; icons from lucide-react, except the real Google/Microsoft/Apple brand marks on the profile page's provider cards, which come from `react-icons` (`si`/`fa6`)
- **Animations:** Framer Motion
- **State:** component state plus TanStack Query for server data, with a few of the user's own answers remembered across reloads (`src/lib/queryPersistence.ts`); one React context, for auth (`src/context/`)
- **Hosting:** Vercel (project `casy`), auto-deploys `main`; `vercel.json` rewrites every path to `index.html` for the SPA
- **Backend:** Supabase: Postgres, Auth (Google sign-in + email magic link), Edge Functions (Deno), Vault, pg_cron + pg_net
- **Testing:** Vitest (frontend, `src/**/*.test.ts`) and Deno test (Edge Functions, `supabase/functions/_shared/*_test.ts`)
- **Linting:** ESLint (TypeScript + React Hooks)

## Common Commands

```bash
npm run dev              # Dev server on port 8080 (the user runs this in their own terminal)
npm run build            # Type-check + production build
npm run test:run         # Frontend tests once
npm run lint             # ESLint
npx tsc -b               # Type-check only

# Edge Functions (run from supabase/functions/). --node-modules-dir=none stops Deno
# from using the frontend's node_modules; delete any deno.lock it leaves behind.
deno test --node-modules-dir=none --allow-all _shared/
deno check --node-modules-dir=none */index.ts _shared/*.ts   # 2 known old errors: state.ts, calendar-busy

supabase migration list  # Read-only: which migrations are applied remotely
supabase db push --dry-run
```

## Architecture

### Directory structure
```
src/
├── api/          # Server data: groups, calendarStatus, admin (queries + calls); mockData (example groups), currentUser
├── components/   # Hand-built UI components; RequireAuth guards signed-in routes; AdminPanel is lazy-loaded
├── context/      # Auth: AuthProvider (session) + auth.ts (useAuth, displayName)
├── hooks/        # useSchedulingGroups (real vs example groups), useExampleCarousel
├── lib/          # Pure logic + clients (see below); tests sit next to the code
├── pages/        # FindDate (/), SignIn, Profile, CalendarOverview, JoinGroup (/join/:token), Privacy
└── types/        # Core data model (BusyInterval, Participant, Event, ...)
supabase/
├── functions/    # One folder per Edge Function; _shared/ holds provider adapters and helpers
└── migrations/   # Schema history; applied with `supabase db push`
```

### Key modules
- `src/lib/availability.ts`: the scheduling engine. Pure functions over epoch ms: single meetings, whole-day spans (vacations), weekly spans (weekend trips), vacation suggestions. Work/school blocks are "soft" (need time off), all-day absences are "hard".
- `src/lib/zone.ts`: all local-time arithmetic (local midnight, clock hours, weekdays, months) via Intl. Days are local midnight to local midnight, so DST days are 23/25 hours. The engine, heatmap and calendar take a **required** `timeZone`; the app uses `APP_TIME_ZONE` (Europe/Copenhagen). Busy blocks are always UTC instants. Never step days by adding 86 400 000 ms.
- `src/lib/heatmap.ts`: the month grid tinted by how many people are free.
- `src/lib/realCalendar.ts`: maps the user's stored blocks into the engine's shape (calendar purpose work/school -> category) and swaps them into an example group's "you" slot.
- `src/hooks/useSchedulingGroups.ts`: which groups the scheduling page searches. Real groups carry every member's busy time; a member with no calendar is left out of the search and named in `waitingFor` rather than counted as free. With no real groups, the labelled examples cycle instead. Only the group on screen is fetched.
- `src/lib/queryPersistence.ts`: remembers only the `groups`, `calendar-status`, `admin-status` and `whoami` queries in localStorage (keys include the user id, wiped on sign-out, dropped after 7 days), so reloads show them at once and refresh in the background. Only ever add queries about the signed-in user themself: never other people's busy times or the admin overview.
- `src/lib/adminOverview.ts`: patches the admin overview after an action so the row disappears at once, while the real overview refetches in the background.
- `src/lib/supabaseFunctions.ts`: `callFunction()`, the only way the frontend calls Edge Functions. It attaches the session's access token.
- `src/lib/supabase.ts`: the Supabase client, used for auth only (tables are not read from the browser).

### Auth and data access
- Every table has RLS enabled with **no** policies: the browser can't read or write any table. All data goes through Edge Functions using the service role.
- Every Edge Function identifies the caller with `callerId()` or `callerUser()` (`_shared/auth.ts`), which verifies the `Authorization: Bearer <access token>` with Supabase Auth. Never take a user id from a request body or query string. `verify_jwt = false` in `supabase/config.toml` is intentional: the publishable key is not a JWT, so functions check the login in code.
- OAuth connect: the page POSTs to `oauth-<provider>-start` (signed in) and gets the consent URL back; the verified user id and the site the request came from (`Origin`) travel to the callback inside the HMAC-signed `state` (`_shared/state.ts`). The callback returns there only if it is in `FRONTEND_ORIGINS` (`_shared/frontend.ts`), otherwise to the first entry.
- `calendar_connections.profile_id` is a uuid referencing `auth.users` (cascading deletes).
- The `groups` function handles every group action, picked by `action` in the POST body: list, create, invite, preview, join, leave, delete (creator only), busy. `preview` is the only one that works signed out (an invite link shows the group's name and size); every other action checks membership. Members see each other's names and busy ranges, never emails, calendar names or event titles.
- Admin mode: the `admin` function treats the user ids in the `ADMIN_USER_IDS` secret as admins (`_shared/admin.ts`) and re-checks it on every action; `status` only answers yes or no. The profile's admin button is a convenience, the function is the lock. Admin views show names, dates, counts and sync health; never emails (a Google or Outlook connection's `account_label` is an email), busy times or event details.

### Data model
- Calendars: `calendar_connections` (one per linked account) -> `calendar_sources` (one per calendar, with a user-set `purpose`) -> `calendar_busy_cache` (start/end only; **no event titles are ever stored**). Credentials live in `calendar_secrets`.
- Groups: `friend_groups` (named so because GROUPS is a Postgres keyword; `created_by` is set null if the creator's account goes) -> `group_members` (a trigger caps groups at 20 members and each person at 20 groups) and `group_invites` (only an HMAC of the invite token is stored; links last 7 days and anyone holding one can join). `profiles` holds each user's display name, copied from their own login by the `groups` function; it deliberately has no email.
- `leave_friend_group()` removes a member and deletes the group if they were the last one. Deleting an account cascades everything it owns; the admin delete also removes groups it leaves empty.

### Secrets
- Every credential in `calendar_secrets` is encrypted with `_shared/secretBox.ts` (AES-256-GCM, format `v1:<nonce>:<ciphertext>`); a check constraint rejects anything else. The key is the `CALDAV_ENCRYPTION_KEY` function secret (the name is historical; it protects all secrets).
- ICS links are looked up by `ics_url_hash` (HMAC with an HKDF-derived subkey), since encrypted values can't be compared.

### Sync
- `calendar-sync` refreshes accounts: Google/Outlook via refresh token (rotated tokens are stored again), iCloud via app password, ICS by re-fetching. Busy times are swapped in one transaction (`replace_busy_blocks`); a failed sync keeps the old data.
- Results are stored per connection: `last_synced_at`, `sync_error`, `needs_reconnect` (credential refused).
- pg_cron runs it at 17 past every hour, authenticated by `x-sync-secret`; the URL and secret are read from Vault (`calendar_sync_url`, `calendar_sync_secret`). The profile page's "Sync now" syncs the signed-in user's accounts.
- **Google OAuth is In production but unverified** (since 2026-09-19): connecting Google Calendar shows "Google hasn't verified this app" (Advanced > Go to Casy), and at most 100 users can connect until the app is verified. Refresh tokens no longer expire after 7 days.

### TypeScript configuration
- Path alias `@/*` maps to `src/*`
- Strict mode is relaxed: `noImplicitAny: false`, `strictNullChecks: false`

## Environment Variables

All secrets live in `.env.local` (never committed). The file always contains a `GitHub repo token=` key used for the GitHub Projects workflow.

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (a publishable key, not a JWT)
- Local copies of server secrets: `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `MICROSOFT_OAUTH_CLIENT_ID/SECRET`, `OAUTH_STATE_SECRET`, `CALDAV_ENCRYPTION_KEY`, `CALENDAR_SYNC_SECRET`
- Edge Function secrets (set with `supabase secrets set`): the ones above plus `FUNCTIONS_BASE_URL`, `ADMIN_USER_IDS` (comma-separated user ids with admin mode; not kept in `.env.local`), and `FRONTEND_ORIGINS` (comma-separated sites OAuth may return to, default first: `https://casy.app,https://casy-red.vercel.app,http://localhost:8080`; `FRONTEND_URL` is the older single-site fallback)
- Auth email (Supabase Auth SMTP, set in the Supabase **dashboard**, not with `supabase secrets set`): host `smtp.resend.com`, port 587, user `resend` (the literal word), password `RESEND_API_KEY` (kept in `.env.local`, never a function secret), sender `noreply@casy.app`, sender name `Casy`. The sending domain must be **verified in Resend** or it delivers only to the Resend account owner, which is the same dead end as Supabase's built-in mailer. `supabase/config.toml` records the same settings and reads the key as `env(RESEND_API_KEY)`.
- Vercel project environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (a change needs a redeploy to take effect)

Handling rules:
- Read the GitHub token into a shell variable inside the command; never write a token or key into a command line that gets saved (e.g. permission rules in `.claude/settings.local.json`) or print it.
- To hand a secret to the user, put it on the clipboard (`pbcopy`) and clear the clipboard afterwards; don't print it in the chat.

**If a required key is missing:** stop immediately and show this message. Do not attempt to work around it or proceed:

> "This action requires a key that isn't in your `.env.local`. You may not have access to this part of the project. Reach out to the project owner to get the correct credentials."

Never guess, hardcode, or substitute a missing key.

## Deploying

The website deploys itself: every push to `main` makes Vercel build and publish it (check the Deployments tab if the live site doesn't update). A new site address must also be added to Supabase Auth's Site URL / Redirect URLs, to `FRONTEND_ORIGINS`, and to the Google OAuth branding (home page, privacy link, authorized domain).

Changes under `supabase/` only take effect once deployed. Claude Code's auto mode blocks Claude from changing (or reading) the live database and functions, so **the user runs the deploy commands** in their own terminal; give them the exact commands and what to expect:

```bash
supabase db push                          # apply new migrations (after `--dry-run` shows which)
supabase functions deploy [name]          # all functions, or one by name
```

Order: migrations before the functions that depend on them. Afterwards, `supabase migration list` confirms what is applied. Docker is not installed, so migrations can't be tested on a local database; write them to fail safely (check preconditions, raise instead of guessing).

## CI/CD

GitHub Actions workflow at `.github/workflows/ci.yml` runs ESLint on push/PR. It does not run tests or type-checks, so run `npm run test:run`, `npx tsc -b` and the Deno tests before handing work over.

---

## Session-Start Workflow

**Run all of these steps automatically at the start of every session — no need for the user to ask.**

### Step 1 — Read the Codebase

Scan the directory structure and key files (`App.tsx`, `src/api/`, `src/context/`, `src/pages/`) to understand current state. This should be silent — don't narrate it, just do it.

### Step 2 — Git Housekeeping

```bash
git status
git pull origin main
```

### Step 3 — Load GitHub Token

Read `.env.local` and extract the value after `GitHub repo token=`. Use it as the Bearer token for all GitHub API calls in this session.

### Step 4 — Present Session Options

Fetch the project board (query below), then greet the user with exactly two options:

> **What would you like to work on today?**
>
> **Option 1 — Something new:** Tell me what you want to build, fix, or explore and we'll design it together.
>
> **Option 2 — Pick a TO-DO:** Here are the open items on the board:
> 1. #XX — [title]
> 2. #XX — [title]
> 3. #XX — [title]
> *(show up to 3; if none exist, say so and default to Option 1)*

**Query to fetch TO-DO items:**
```
POST https://api.github.com/graphql
Authorization: Bearer <token>

{
  node(id: "PVT_kwHOD5fAM84BbNZz") {
    ... on ProjectV2 {
      items(first: 50) {
        nodes {
          id
          fieldValues(first: 10) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
            }
          }
          content {
            ... on Issue { title number state url body }
            ... on DraftIssue { title body }
          }
        }
      }
    }
  }
}
```

### Step 5 — Agree on a Plan

Before writing any code, discuss the approach. Be critical — push back on bad ideas, flag complexity, suggest robust alternatives. Only proceed once the user has explicitly agreed on the implementation plan.

### Step 6 — Branch Setup

```bash
# If on main, create a feature branch:
git checkout -b feature/[task-name]
```

If the user picked an existing TO-DO, **clean it up first** before touching the board:

- Rewrite the title if it's messy, vague, or typo-ridden — keep it short and descriptive
- Rewrite or write the body as a clean `## Problem / Feature` section — max 5 lines, no filler
- Patch the issue via REST:
  ```bash
  PATCH https://api.github.com/repos/asbj1521/casy/issues/<NUMBER>
  { "title": "Clean title", "body": "## Problem / Feature\n\nConcise description..." }
  ```
- Show the user the cleaned title + description and confirm before proceeding

Then move it to **In Progress** on the board:
```
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwHOD5fAM84BbNZz"
    itemId: "<ITEM_ID>"
    fieldId: "PVTSSF_lAHOD5fAM84BbNZzzhV_jKU"
    value: { singleSelectOptionId: "47fc9ee4" }
  }) {
    projectV2Item { id }
  }
}
```

If it's something new, create a GitHub issue for it first, add it to the board, then move it to In Progress:
```bash
POST https://api.github.com/repos/asbj1521/casy/issues
{ "title": "...", "body": "## Problem / Feature\n\n..." }

# Then add to board:
mutation { addProjectV2ItemById(input: { projectId: "PVT_kwHOD5fAM84BbNZz" contentId: "<ISSUE_NODE_ID>" }) { item { id } } }
```

### Step 7 — During Work

- One step at a time — explain what you're about to do before doing it
- User tests locally with `npm run dev` in a separate terminal
- Commit only when the user explicitly says "commit"; "it works" is not enough on its own
- Changes under `supabase/` need deploying before the user can test them (see Deploying)
- Each commit on the feature branch; never commit directly to main

### Step 8 — Wrap Up (after user confirms everything works)

1. **Update the issue body** — append a `## What was done` section (3–5 bullet points) to the original description:
   ```bash
   PATCH https://api.github.com/repos/asbj1521/casy/issues/<NUMBER>
   { "body": "<original body>\n\n---\n\n## What was done\n\n- ..." }
   ```
2. **Move card to Done:**
   ```
   value: { singleSelectOptionId: "98236657" }
   ```
3. **Close the issue:**
   ```bash
   PATCH https://api.github.com/repos/asbj1521/casy/issues/<NUMBER>
   { "state": "closed" }
   ```
4. **Merge to main:**
   ```bash
   git checkout main
   git pull origin main
   git merge feature/[task-name]
   git push origin main
   git branch -d feature/[task-name]
   git push origin --delete feature/[task-name]   # only if the branch was ever pushed
   ```

### Project IDs Reference

| Field | ID |
|---|---|
| Project | `PVT_kwHOD5fAM84BbNZz` |
| Status field | `PVTSSF_lAHOD5fAM84BbNZzzhV_jKU` |
| Status: TO-DO's | `f75ad846` |
| Status: In progress | `47fc9ee4` |
| Status: Done | `98236657` |
| Repo | `asbj1521/casy` (renamed from `asbj1521/Autodate`, which redirects) |
