# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Operational Rules

- Execute tools and commands without asking for permission first
- Prioritize methodical execution over speed; explain reasoning as you go
- Treat the user as a capable engineer; avoid over-explaining obvious concepts
- Explain code changes as you would to a junior engineer—clear, educational, thorough
- Request confirmation before committing changes to git; validate correctness together first
- Always commit changes after they have been confirmed
- Provide critical, honest analysis; prioritize solution quality over convenience
- Ask clarifying questions when intent is ambiguous rather than assuming

## Project Overview

Autodate is a scheduling tool that helps groups of people find dates that work for everyone. Users link their calendars (Google, Outlook, Apple) and the app automatically scans availability to find the earliest possible shared free window.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Routing:** React Router v7
- **UI:** Radix UI + Tailwind CSS + shadcn/ui components
- **Animations:** Framer Motion
- **State Management:** React Context API
- **Data Fetching:** TanStack Query (React Query)
- **Testing:** Vitest + Testing Library
- **Linting:** ESLint (TypeScript + React Hooks)

## Common Commands

### Development
```bash
npm run dev              # Start dev server on port 8080
npm run build            # Production build
npm run build:dev        # Development build
npm run preview          # Preview production build
```

### Testing
```bash
npm test                 # Run tests in watch mode
npm run test:ui          # Run tests with UI
npm run test:run         # Run tests once (CI mode)
npm run test:coverage    # Generate coverage report
```

### Code Quality
```bash
npm run lint             # Run ESLint
```

## Architecture

### Directory Structure
```
src/
├── api/              # API layer (calendar integrations, auth)
├── components/       # React components (both custom and ui/*)
├── context/          # React Context providers
├── hooks/            # Custom React hooks
├── lib/              # Utilities (utils, supabase client if used)
├── pages/            # Route components
├── test/             # Test files and test utilities
└── types/            # TypeScript type definitions
```

### TypeScript Configuration

- Path alias `@/*` maps to `src/*`
- Strict mode is relaxed: `noImplicitAny: false`, `strictNullChecks: false`

## Environment Variables

All secrets live in `.env.local` (never committed). The file always contains a `GitHub repo token=` key used for the GitHub Projects workflow.

**If a required key is missing:** stop immediately and show this message — do not attempt to work around it or proceed:

> "This action requires a key that isn't in your `.env.local`. You may not have access to this part of the project. Reach out to the project owner to get the correct credentials."

Never guess, hardcode, or substitute a missing key.

## CI/CD

GitHub Actions workflow at `.github/workflows/ci.yml` runs ESLint on push/PR.

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
  PATCH https://api.github.com/repos/asbj1521/Autodate/issues/<NUMBER>
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
POST https://api.github.com/repos/asbj1521/Autodate/issues
{ "title": "...", "body": "## Problem / Feature\n\n..." }

# Then add to board:
mutation { addProjectV2ItemById(input: { projectId: "PVT_kwHOD5fAM84BbNZz" contentId: "<ISSUE_NODE_ID>" }) { item { id } } }
```

### Step 7 — During Work

- One step at a time — explain what you're about to do before doing it
- User tests locally with `npm run dev` in a separate terminal
- Commit only after the user explicitly confirms a change is good
- Each commit on the feature branch; never commit directly to main

### Step 8 — Wrap Up (after user confirms everything works)

1. **Update the issue body** — append a `## What was done` section (3–5 bullet points) to the original description:
   ```bash
   PATCH https://api.github.com/repos/asbj1521/Autodate/issues/<NUMBER>
   { "body": "<original body>\n\n---\n\n## What was done\n\n- ..." }
   ```
2. **Move card to Done:**
   ```
   value: { singleSelectOptionId: "98236657" }
   ```
3. **Close the issue:**
   ```bash
   PATCH https://api.github.com/repos/asbj1521/Autodate/issues/<NUMBER>
   { "state": "closed" }
   ```
4. **Merge to main:**
   ```bash
   git checkout main
   git pull origin main
   git merge feature/[task-name]
   git push origin main
   git push origin --delete feature/[task-name]
   ```

### Project IDs Reference

| Field | ID |
|---|---|
| Project | `PVT_kwHOD5fAM84BbNZz` |
| Status field | `PVTSSF_lAHOD5fAM84BbNZzzhV_jKU` |
| Status: TO-DO's | `f75ad846` |
| Status: In progress | `47fc9ee4` |
| Status: Done | `98236657` |
| Repo | `asbj1521/Autodate` |
