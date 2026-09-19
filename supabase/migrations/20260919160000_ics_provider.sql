-- ICS calendar links as a fourth provider: anything that publishes a plain
-- .ics feed (a university timetable, Outlook's "publish calendar" link,
-- Google's secret iCal address). There is no OAuth and no account to sign in
-- to; the link itself is the credential.

-- Widen the provider check. The original was declared inline on the column,
-- so find it by definition instead of trusting its auto-generated name.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'calendar_connections'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%'
  loop
    execute format('alter table calendar_connections drop constraint %I', c.conname);
  end loop;
end $$;

alter table calendar_connections
  add constraint calendar_connections_provider_check
  check (provider in ('google', 'outlook', 'apple', 'ics'));

-- The feed URL is a bearer secret (anyone holding it can read the calendar),
-- so it lives with the other credentials in calendar_secrets, which RLS
-- locks away from the anon/authenticated roles entirely.
alter table calendar_secrets add column if not exists ics_url text;

comment on column calendar_secrets.ics_url is
  'ICS feed link for provider = ics. A bearer secret: anyone with it can read the calendar. Same TODO as the tokens: move to Vault.';
