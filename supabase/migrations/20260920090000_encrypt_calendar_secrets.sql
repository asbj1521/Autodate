-- Every credential in calendar_secrets is now stored encrypted (AES-256-GCM,
-- see supabase/functions/_shared/secretBox.ts), not just the iCloud password.
-- The key lives in an Edge Function secret, never in the database, so a copy
-- of the database alone no longer hands out working Google/Outlook access or
-- calendar feed links.

-- Encrypted links can't be compared with each other (each has a random
-- nonce), so "has this link been added before?" is answered by a keyed hash
-- of the link instead.
alter table calendar_secrets add column if not exists ics_url_hash text;
create index if not exists calendar_secrets_ics_url_hash_idx
  on calendar_secrets (ics_url_hash);

-- Remove the plaintext secrets stored before this change. Nothing reads them
-- back yet (there is no background sync), so busy times and calendars are
-- unaffected; the accounts get fresh, encrypted credentials when they are
-- reconnected, which a future sync job will need. The key isn't available
-- here, so encrypting them in place isn't an option, and keeping them in
-- plaintext until then is exactly the exposure this change removes.
update calendar_secrets set access_token = null
  where access_token is not null and access_token not like 'v1:%';
update calendar_secrets set refresh_token = null
  where refresh_token is not null and refresh_token not like 'v1:%';
update calendar_secrets set ics_url = null
  where ics_url is not null and ics_url not like 'v1:%';
update calendar_secrets set caldav_password = null
  where caldav_password is not null and caldav_password not like 'v1:%';

-- From here on, refuse anything that isn't in the encrypted format, so code
-- that forgets to encrypt fails loudly instead of quietly storing a secret.
alter table calendar_secrets
  add constraint calendar_secrets_encrypted_check check (
    (access_token is null or access_token ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$')
    and (refresh_token is null or refresh_token ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$')
    and (ics_url is null or ics_url ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$')
    and (caldav_password is null or caldav_password ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$')
  );

comment on table calendar_secrets is
  'Encrypted credentials (format v1:<nonce>:<ciphertext>, enforced by calendar_secrets_encrypted_check). RLS denies all client-side access; only the service_role key (Edge Functions) can touch this table.';
comment on column calendar_secrets.ics_url is
  'Encrypted ICS feed link for provider = ics. A bearer secret: anyone with the plain link can read the calendar.';
comment on column calendar_secrets.ics_url_hash is
  'Keyed hash (HMAC-SHA256, subkey of the encryption key) of the plain ICS link, for finding a link added before.';
