/**
 * Who counts as an admin: the user ids listed in the ADMIN_USER_IDS function
 * secret, comma-separated.
 *
 * A secret rather than a table or a flag on the account, so that nothing in
 * the repo or the database says who the admin is, and becoming one takes a
 * `supabase secrets set` that only the project owner can run. An unset or
 * empty secret means nobody is an admin, which is the safe way to fail.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The admin ids from the secret's raw value. Anything that isn't a user id
 * is dropped rather than trusted, so a typo can't turn into a match on
 * something unexpected.
 */
export function parseAdminIds(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => UUID.test(id)),
  );
}

/** True if this verified user id is one of the admins. */
export function isAdminId(userId: string | null | undefined, raw: string | undefined | null): boolean {
  if (!userId) return false;
  return parseAdminIds(raw).has(userId.toLowerCase());
}
