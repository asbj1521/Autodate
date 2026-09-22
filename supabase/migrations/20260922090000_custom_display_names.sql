-- Let people set their own display name, instead of always being shown
-- whatever their login handed over (a Google full name, or the part of an
-- email before the @).
--
-- Once someone sets one, it has to stick: the `groups` function copies the
-- login name into profiles on every call (rememberName), which would
-- otherwise stomp a chosen name right back on the next request.
-- name_is_custom is the flag that tells it to leave a chosen name alone.
alter table profiles add column if not exists name_is_custom boolean not null default false;

-- Copies the caller's login name into profiles on every `groups` call, same
-- as the plain upsert this replaces, except it now backs off once a custom
-- name is in place. The WHERE on the DO UPDATE is what makes that safe to
-- call unconditionally: a plain upsert can't express "skip this row", but a
-- conditional one can.
create or replace function remember_login_name(p_id uuid, p_display_name text)
returns void
language sql
set search_path = public
as $$
  insert into profiles (id, display_name, updated_at)
  values (p_id, p_display_name, now())
  on conflict (id) do update
    set display_name = excluded.display_name, updated_at = excluded.updated_at
    where profiles.name_is_custom = false;
$$;

revoke execute on function remember_login_name(uuid, text) from public, anon, authenticated;
grant execute on function remember_login_name(uuid, text) to service_role;
