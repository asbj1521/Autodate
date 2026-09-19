/**
 * The pieces of group handling that are worth testing on their own: invite
 * tokens, the tidying of names people type, and what a member is called.
 *
 * The database work itself lives in the `groups` function; this file stays
 * free of Supabase so every rule here can be checked with a plain unit test.
 */

/** How long a freshly made invite link keeps working. */
export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Longest group name we keep, matching the check constraint on the table. */
export const MAX_GROUP_NAME_LENGTH = 60;

/** Most people in one group, matching the enforce_group_limits trigger. */
export const MAX_GROUP_MEMBERS = 20;

/**
 * A fresh invite token: 32 random bytes in URL-safe base64.
 *
 * It ends up in a link people paste into chats, so it must survive a URL
 * untouched (no "+", "/" or "="), and it must be unguessable: 256 bits of
 * randomness means nobody finds a live invite by trying.
 */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * Is this string shaped like one of our tokens? Checked before the database
 * is asked anything, so a junk URL costs no query.
 */
export function looksLikeInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

/** The link to send someone, for a site we already decided is allowed. */
export function inviteUrl(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}

/** Drop ASCII control characters (newlines, tabs, NUL, DEL, ...) from user text. */
function stripControlChars(text: string): string {
  return Array.from(text)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
}

/**
 * A group name as it should be stored, or null if there is nothing left once
 * the invisible characters and surrounding spaces are gone. Trimming happens
 * after the length cap too, so a name cut mid-space doesn't end in one.
 */
export function cleanGroupName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = stripControlChars(raw).trim().slice(0, MAX_GROUP_NAME_LENGTH).trim();
  return name.length > 0 ? name : null;
}

/** The shape of an auth user, as much of it as naming someone needs. */
export interface NameableUser {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * What to call someone in a member list.
 *
 * Google hands us a full name, which is what people expect to see. Someone
 * who signed in by email link has no name at all, so the part of their
 * address before the "@" stands in: it is the half they chose, and it keeps
 * the domain (where they work, which provider they use) out of other
 * members' sight. Group members are never shown an email address.
 */
export function displayNameFor(user: NameableUser | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  for (const key of ["full_name", "name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const local = user?.email?.split("@")[0]?.trim();
  return local || "Someone";
}
