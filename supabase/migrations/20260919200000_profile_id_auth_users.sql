-- Tie every calendar connection to a real signed-in user.
--
-- Until now profile_id was free text that the browser supplied ("asbjorn"),
-- so anyone could claim to be anyone. The Edge Functions now take the id from
-- the caller's verified login instead (supabase/functions/_shared/auth.ts),
-- and this makes the column hold exactly that: an auth.users id.
--
-- The demo-era rows belong to the project's owner, who by this point has
-- signed in once and is the only user. They are moved onto that account
-- rather than dropped, so the calendars and their work/school categories
-- survive. If there is not exactly one user, the migration stops without
-- changing anything, instead of guessing whose calendars these are.

do $$
declare
  demo_rows int;
  other_rows int;
  user_count int;
  owner_id uuid;
begin
  select count(*) into demo_rows from calendar_connections where profile_id = 'asbjorn';

  select count(*) into other_rows
  from calendar_connections
  where profile_id <> 'asbjorn'
    and profile_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if other_rows > 0 then
    raise exception '% connection(s) have a profile_id that is neither ''asbjorn'' nor a user id; sort them out by hand first.', other_rows;
  end if;

  if demo_rows > 0 then
    select count(*) into user_count from auth.users;
    if user_count <> 1 then
      raise exception 'Found % demo connection(s) but % users, so it is unclear whose they are. Move them by hand first.', demo_rows, user_count;
    end if;
    select id into owner_id from auth.users;
    update calendar_connections set profile_id = owner_id::text where profile_id = 'asbjorn';
  end if;
end $$;

alter table calendar_connections
  alter column profile_id type uuid using profile_id::uuid;

-- Deleting an account deletes its connections, and through the existing
-- cascades its calendars, secrets and busy blocks: nothing is left behind.
alter table calendar_connections
  add constraint calendar_connections_profile_id_fkey
  foreign key (profile_id) references auth.users (id) on delete cascade;

comment on column calendar_connections.profile_id is
  'The owning user (auth.users.id). Set by the Edge Functions from the caller''s verified login, never from request input.';
