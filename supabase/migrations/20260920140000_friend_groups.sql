-- Real friend groups: who is in them, and the invite links that let people in.
--
-- Until now groups were generated in the browser (src/api/mockData.ts), so
-- "the group" only ever existed on one screen. These tables make a group a
-- real, shared thing: two people opening Casy see the same members.
--
-- Like the calendar tables, everything here is locked down with RLS and no
-- policies. The browser can't read or write any of it; the `groups` Edge
-- Function, using the service role, is the only way in, and it takes the
-- caller's identity from their verified login (_shared/auth.ts), never from
-- the request body.

-- A display name per user, so a member list can say "Simon" instead of a uuid.
--
-- Names live in Supabase's private auth.users table, which can't be joined
-- from the API schema. Rather than reach into it, the group functions copy
-- the caller's own name out of their verified login into this table on every
-- call, so it is always as fresh as the last time that person used the app.
--
-- Only the name is copied. Email addresses stay in auth.users: members see
-- each other's names and availability, never each other's email.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  updated_at timestamptz not null default now()
);

comment on table profiles is
  'Display names, copied from each user''s own verified login by the groups Edge Function. Deliberately holds no email address.';

-- A named circle of people who schedule together. Mirrors the frontend's
-- FriendGroup type. Named friend_groups rather than groups because GROUPS is
-- also a Postgres keyword (window frame mode), and an unquoted `groups` in a
-- later query is an easy mistake to make.
--
-- created_by is remembered for support and display, but it grants nothing:
-- every member has the same powers (any member can invite, anyone may leave),
-- so nothing breaks when the creator's account is deleted and this goes null.
create table if not exists friend_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table friend_groups is
  'A named circle of people who schedule together. Membership lives in group_members.';

-- Who is in which group. The pair is the primary key, so joining a group you
-- are already in is harmless rather than a duplicate row.
create table if not exists group_members (
  group_id uuid not null references friend_groups (id) on delete cascade,
  profile_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

-- "Which groups am I in" is the first query every page makes, and the primary
-- key indexes the columns the other way round.
create index if not exists group_members_profile_id_idx
  on group_members (profile_id);

-- Invite links. The link carries a random token; what is stored here is only
-- a fingerprint of it (lookupHash in _shared/secretBox.ts, the same way ICS
-- links are stored), so a copy of this table hands out no working invites.
--
-- A group can have several rows over time, each from a "Copy invite link"
-- once the previous one expired. The newest unexpired one is the live link.
create table if not exists group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references friend_groups (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists group_invites_group_id_idx
  on group_invites (group_id);

comment on column group_invites.token_hash is
  'HMAC fingerprint of the invite token (see _shared/secretBox.ts). The token itself exists only in the link that was copied.';

-- Bounds, enforced here rather than only in the Edge Function so no future
-- code path can get around them. A group's availability is computed across
-- every member's calendar, so an unbounded group is an unbounded query; and
-- one account joining thousands of groups is abuse, not use.
--
-- Counting before the insert leaves a hairline race if two people join the
-- 20th slot in the same instant. The cost is a group of 21, which is not
-- worth a lock for.
create or replace function enforce_group_limits() returns trigger
language plpgsql
set search_path = public
as $$
declare
  members int;
  groups_joined int;
begin
  select count(*) into members from group_members where group_id = new.group_id;
  if members >= 20 then
    raise exception 'This group is full (20 members).' using errcode = 'check_violation';
  end if;

  select count(*) into groups_joined from group_members where profile_id = new.profile_id;
  if groups_joined >= 20 then
    raise exception 'You are already in 20 groups, which is the limit.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists group_members_enforce_limits on group_members;
create trigger group_members_enforce_limits
  before insert on group_members
  for each row execute function enforce_group_limits();

-- Leaving a group, in one transaction: drop the membership, and if that was
-- the last member, drop the group with it. An empty group is invisible to
-- everyone (nobody can list it, nobody can be invited back into it), so it
-- would only ever be a row nothing can reach.
--
-- Returns what happened, so the function can tell the person whether the
-- group is now gone: 'left', 'group_deleted', or 'not_a_member'.
create or replace function leave_friend_group(p_group_id uuid, p_profile_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  removed int;
  remaining int;
begin
  delete from group_members
  where group_id = p_group_id and profile_id = p_profile_id;
  get diagnostics removed = row_count;
  if removed = 0 then
    return 'not_a_member';
  end if;

  select count(*) into remaining from group_members where group_id = p_group_id;
  if remaining = 0 then
    delete from friend_groups where id = p_group_id;
    return 'group_deleted';
  end if;

  return 'left';
end;
$$;

-- Functions in the public schema are callable through the API by default.
-- These must only ever be reached by the Edge Functions (service role).
revoke execute on function leave_friend_group(uuid, uuid) from public, anon, authenticated;
grant execute on function leave_friend_group(uuid, uuid) to service_role;
revoke execute on function enforce_group_limits() from public, anon, authenticated;

-- Lock every table down, the same way the calendar tables are: RLS on with no
-- policies at all, so the anon/publishable key can read and write nothing.
-- Only the service role (which bypasses RLS) touches these, from the Edge
-- Functions, after checking who is calling.
alter table profiles enable row level security;
alter table friend_groups enable row level security;
alter table group_members enable row level security;
alter table group_invites enable row level security;
