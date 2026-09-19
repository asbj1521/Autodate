-- Automatic re-sync of connected calendars (see supabase/functions/calendar-sync).

-- Sync state per connection. A failed sync deliberately does NOT change
-- `status`: the last good busy times stay in use (calendar-busy only reads
-- 'connected' rows), and the profile page shows what went wrong instead.
alter table calendar_connections
  add column if not exists last_sync_attempt_at timestamptz,
  add column if not exists sync_error text,
  add column if not exists needs_reconnect boolean not null default false;

comment on column calendar_connections.last_synced_at is
  'When busy times were last fetched successfully (at connect, or by a sync).';
comment on column calendar_connections.last_sync_attempt_at is
  'When a sync last tried this connection, successful or not. The scheduler takes the oldest first.';
comment on column calendar_connections.sync_error is
  'Why the latest sync failed, for the profile page; null after a successful sync.';
comment on column calendar_connections.needs_reconnect is
  'The provider refused the stored credential (expired or revoked). Only reconnecting fixes it.';

-- Swap a connection's busy times from `p_from` onwards for a fresh set, in
-- one transaction: readers see either the old blocks or the new ones, never
-- a half-deleted calendar. Blocks that ended before `p_from` are history and
-- stay. `p_blocks` is a JSON array of {source_id, start_at, end_at}; rows for
-- a source outside this connection are ignored rather than trusted.
create or replace function replace_busy_blocks(
  p_connection_id uuid,
  p_from timestamptz,
  p_blocks jsonb
) returns integer
language plpgsql
set search_path = public
as $$
declare
  inserted integer;
begin
  delete from calendar_busy_cache b
  using calendar_sources s
  where b.source_id = s.id
    and s.connection_id = p_connection_id
    and b.end_at > p_from;

  insert into calendar_busy_cache (source_id, start_at, end_at)
  select (x->>'source_id')::uuid, (x->>'start_at')::timestamptz, (x->>'end_at')::timestamptz
  from jsonb_array_elements(p_blocks) as x
  where (x->>'source_id')::uuid in (
    select id from calendar_sources where connection_id = p_connection_id
  );
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Functions in the public schema are callable through the API by default.
-- This one must only ever be called by the Edge Functions (service role).
revoke execute on function replace_busy_blocks(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function replace_busy_blocks(uuid, timestamptz, jsonb) to service_role;

-- The hourly schedule: pg_cron fires an HTTP call (pg_net) to calendar-sync.
-- The function's URL and the shared secret that proves the call comes from
-- here are read from Vault at run time, so neither is written into this
-- migration or the repository. They are created once by hand; the job does
-- nothing useful until they exist.
-- Installed the way Supabase documents: pg_cron in pg_catalog, pg_net in
-- extensions (its functions live in the `net` schema either way).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'calendar-sync-hourly',
  '17 * * * *', -- 17 minutes past every hour, off the busy top of the hour
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_sync_secret')
    ),
    body := '{"scope": "all"}'::jsonb
  );
  $job$
);
