-- Calendar integrations: connections, per-calendar purpose labels, secrets,
-- and a cache of normalized busy intervals.
--
-- There is no real multi-user auth system yet (login and full profiles are
-- a separate, later piece of work), so profile_id is a plain text
-- identifier matching the CURRENT_USER_ID convention already used in the
-- frontend's mock data (src/api/mockData.ts), not a foreign key into an
-- auth table. Once real accounts exist, add that FK and backfill.

-- One row per linked external calendar account (a Google account, an
-- Outlook account, an iCloud account). Holds no secrets, see
-- calendar_secrets below.
create table if not exists calendar_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null,
  provider text not null check (provider in ('google', 'outlook', 'apple')),
  account_label text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create index if not exists calendar_connections_profile_id_idx
  on calendar_connections (profile_id);

comment on table calendar_connections is
  'One row per linked external calendar account. Never holds tokens or passwords, see calendar_secrets.';

-- One row per individual calendar *within* a connection (a single Google
-- account can have a "Work" calendar and a "Family" calendar, each
-- surfaced separately so the user can label its purpose). Busy intervals
-- reference this table rather than the connection directly, so every block
-- inherits its calendar's purpose label without the app ever reading an
-- event title or description.
create table if not exists calendar_sources (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references calendar_connections (id) on delete cascade,
  external_calendar_id text not null,
  display_name text,
  purpose text check (purpose in ('work', 'school', 'personal', 'other')),
  created_at timestamptz not null default now(),
  unique (connection_id, external_calendar_id)
);

create index if not exists calendar_sources_connection_id_idx
  on calendar_sources (connection_id);

-- OAuth tokens / CalDAV credentials, deliberately kept in a separate table
-- from calendar_connections so connection metadata can be listed without
-- ever selecting a secret column. RLS below denies all access from the
-- anon/authenticated roles outright: only Edge Functions, using the
-- service_role key (which bypasses RLS), can read or write this table.
create table if not exists calendar_secrets (
  connection_id uuid primary key references calendar_connections (id) on delete cascade,
  -- Google / Outlook (OAuth):
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  -- Apple (CalDAV, per-user app-specific password, no OAuth):
  caldav_username text,
  caldav_password text,
  updated_at timestamptz not null default now()
);

comment on table calendar_secrets is
  'Tokens and passwords. RLS denies all client-side access; only the service_role key (Edge Functions) can touch this table. TODO: move to Supabase Vault for encryption at rest once the OAuth flow is proven end-to-end.';

-- Normalized busy intervals, refreshed by a sync job rather than hitting
-- three provider APIs live on every page load. Mirrors the frontend's
-- BusyInterval shape (src/types/index.ts): just a time range, nothing else.
create table if not exists calendar_busy_cache (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references calendar_sources (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint calendar_busy_cache_range_check check (end_at > start_at)
);

create index if not exists calendar_busy_cache_source_id_idx
  on calendar_busy_cache (source_id);
create index if not exists calendar_busy_cache_range_idx
  on calendar_busy_cache (start_at, end_at);

-- Lock every table down by default. Nothing here is meant to be reachable
-- with the anon/publishable key, only Edge Functions (service_role,
-- which bypasses RLS entirely) read or write these tables. This is
-- intentionally restrictive rather than permissive; loosen only when a
-- specific client-side read is actually needed (e.g. showing connection
-- status on the profile page), and only for the columns that need it.
alter table calendar_connections enable row level security;
alter table calendar_sources enable row level security;
alter table calendar_secrets enable row level security;
alter table calendar_busy_cache enable row level security;
