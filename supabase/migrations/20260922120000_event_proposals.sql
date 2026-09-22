-- Suggested events: someone in a group proposes a date, everyone in the group
-- accepts or declines it, and a decline replaces the date with the next one
-- that fits, so nobody has to suggest the same event twice.
--
-- Locked down like every other table: RLS on, no policies. The `events` Edge
-- Function (service role) is the only way in, and it checks membership first.

-- One suggested event. `settings` is the search that found its dates (event
-- kind, duration/start hour or trip shape or number of days), kept so a
-- decline can run the same search again from the day after.
create table if not exists event_proposals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references friend_groups (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  settings jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'no_date', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_proposals_group_id_idx on event_proposals (group_id);

comment on table event_proposals is
  'An event suggested to a group. pending until every invitee accepts its current date (scheduled); a decline swaps in the next date, or no_date if none is left.';

-- Every date an event has been offered on, oldest first. The current date is
-- the newest one nobody has declined; the declined ones stay as history, so a
-- date that was turned down is never quietly offered again.
create table if not exists event_proposal_dates (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references event_proposals (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  declined_by uuid references auth.users (id) on delete set null,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists event_proposal_dates_proposal_id_idx
  on event_proposal_dates (proposal_id, created_at);

-- Who has to answer: everyone in the group when the event was suggested. A
-- snapshot, so someone joining later isn't suddenly holding up an event they
-- never saw; someone leaving is dropped (see leave_friend_group below).
create table if not exists event_invitees (
  proposal_id uuid not null references event_proposals (id) on delete cascade,
  profile_id uuid not null references auth.users (id) on delete cascade,
  primary key (proposal_id, profile_id)
);

create index if not exists event_invitees_profile_id_idx on event_invitees (profile_id);

-- Answers, per date. A new date starts with no answers at all, which is what
-- makes a replacement date go back to everyone.
create table if not exists event_responses (
  date_id uuid not null references event_proposal_dates (id) on delete cascade,
  profile_id uuid not null references auth.users (id) on delete cascade,
  response text not null check (response in ('accepted', 'declined')),
  responded_at timestamptz not null default now(),
  primary key (date_id, profile_id)
);

-- The date currently on offer: the newest one nobody declined.
create or replace function event_current_date(p_proposal_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select id from event_proposal_dates
  where proposal_id = p_proposal_id and declined_at is null
  order by created_at desc
  limit 1;
$$;

-- Mark a pending event scheduled once every invitee has accepted its current
-- date. Called after anything that could complete it: an accept, or someone
-- leaving the group while everyone else had already said yes.
create or replace function refresh_event_status(p_proposal_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_date uuid := event_current_date(p_proposal_id);
  v_missing int;
begin
  if v_date is null then
    return;
  end if;
  select count(*) into v_missing
  from event_invitees i
  where i.proposal_id = p_proposal_id
    and not exists (
      select 1 from event_responses r
      where r.date_id = v_date and r.profile_id = i.profile_id and r.response = 'accepted'
    );
  if v_missing = 0 then
    update event_proposals
    set status = 'scheduled', updated_at = now()
    where id = p_proposal_id and status = 'pending';
  end if;
end;
$$;

-- Suggest an event, in one transaction: the event, its first date, everyone
-- in the group as invitees, and the suggester's own yes. Membership is
-- checked by the Edge Function before this runs; the limit is checked here so
-- no code path can get around it.
create or replace function suggest_event(
  p_group_id uuid,
  p_created_by uuid,
  p_title text,
  p_settings jsonb,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_open int;
  v_proposal uuid;
  v_date uuid;
begin
  select count(*) into v_open
  from event_proposals
  where group_id = p_group_id and status = 'pending';
  if v_open >= 20 then
    raise exception 'This group already has 20 events waiting for answers.'
      using errcode = 'check_violation';
  end if;

  insert into event_proposals (group_id, created_by, title, settings)
  values (p_group_id, p_created_by, p_title, p_settings)
  returning id into v_proposal;

  insert into event_proposal_dates (proposal_id, starts_at, ends_at)
  values (v_proposal, p_starts_at, p_ends_at)
  returning id into v_date;

  insert into event_invitees (proposal_id, profile_id)
  select v_proposal, profile_id from group_members where group_id = p_group_id;

  insert into event_responses (date_id, profile_id, response)
  values (v_date, p_created_by, 'accepted');

  -- A group of one is scheduled the moment it is suggested.
  perform refresh_event_status(v_proposal);
  return v_proposal;
end;
$$;

-- Answer an event's current date, in one transaction with the event locked,
-- so two people declining at the same moment can't both swap in a date.
--
-- p_date_id is the date the person was looking at. If it is no longer the
-- current one (someone else declined first), nothing changes and the caller
-- is told 'stale', so they can look at the new date instead.
--
-- A decline brings the next date with it (found by the decliner's browser,
-- which already has the group's calendars; the Edge Function sanity-checks
-- it). No next date means none is left: the event becomes no_date.
--
-- Returns 'accepted', 'declined', 'no_date', 'stale', 'closed' or 'not_invited'.
create or replace function respond_to_event(
  p_proposal_id uuid,
  p_date_id uuid,
  p_profile_id uuid,
  p_response text,
  p_next_starts_at timestamptz,
  p_next_ends_at timestamptz
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from event_proposals where id = p_proposal_id for update;
  if v_status is null or v_status <> 'pending' then
    return 'closed';
  end if;
  if not exists (
    select 1 from event_invitees where proposal_id = p_proposal_id and profile_id = p_profile_id
  ) then
    return 'not_invited';
  end if;
  if event_current_date(p_proposal_id) is distinct from p_date_id then
    return 'stale';
  end if;

  if p_response = 'accepted' then
    insert into event_responses (date_id, profile_id, response)
    values (p_date_id, p_profile_id, 'accepted')
    on conflict (date_id, profile_id) do update
      set response = 'accepted', responded_at = now();
    perform refresh_event_status(p_proposal_id);
    return 'accepted';
  end if;

  if p_response <> 'declined' then
    raise exception 'Unknown response %', p_response;
  end if;

  insert into event_responses (date_id, profile_id, response)
  values (p_date_id, p_profile_id, 'declined')
  on conflict (date_id, profile_id) do update
    set response = 'declined', responded_at = now();
  update event_proposal_dates
  set declined_by = p_profile_id, declined_at = now()
  where id = p_date_id;

  if p_next_starts_at is null then
    update event_proposals set status = 'no_date', updated_at = now() where id = p_proposal_id;
    return 'no_date';
  end if;

  insert into event_proposal_dates (proposal_id, starts_at, ends_at)
  values (p_proposal_id, p_next_starts_at, p_next_ends_at);
  update event_proposals set updated_at = now() where id = p_proposal_id;
  return 'declined';
end;
$$;

-- Leaving a group now also takes you off its pending events, so nobody is
-- left waiting on an answer from someone who is no longer there. Same
-- behaviour as before otherwise (see the friend_groups migration).
create or replace function leave_friend_group(p_group_id uuid, p_profile_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  removed int;
  remaining int;
  v_proposal uuid;
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

  for v_proposal in
    delete from event_invitees i
    using event_proposals p
    where i.proposal_id = p.id
      and p.group_id = p_group_id
      and p.status = 'pending'
      and i.profile_id = p_profile_id
    returning i.proposal_id
  loop
    perform refresh_event_status(v_proposal);
  end loop;

  return 'left';
end;
$$;

-- Service role only, like the group functions.
revoke execute on function event_current_date(uuid) from public, anon, authenticated;
revoke execute on function refresh_event_status(uuid) from public, anon, authenticated;
revoke execute on function suggest_event(uuid, uuid, text, jsonb, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke execute on function respond_to_event(uuid, uuid, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function suggest_event(uuid, uuid, text, jsonb, timestamptz, timestamptz)
  to service_role;
grant execute on function respond_to_event(uuid, uuid, uuid, text, timestamptz, timestamptz)
  to service_role;
revoke execute on function leave_friend_group(uuid, uuid) from public, anon, authenticated;
grant execute on function leave_friend_group(uuid, uuid) to service_role;

alter table event_proposals enable row level security;
alter table event_proposal_dates enable row level security;
alter table event_invitees enable row level security;
alter table event_responses enable row level security;
