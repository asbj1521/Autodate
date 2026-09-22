/**
 * The small rules about groups the browser needs to know too.
 *
 * The database and the `groups` Edge Function are what actually enforce these
 * (supabase/migrations/…_friend_groups.sql and _shared/groups.ts). The copies
 * here exist so a form can stop someone typing a 200-character name before
 * the round trip, not as the rule itself.
 */

/** Longest group name that will be stored. */
export const MAX_GROUP_NAME_LENGTH = 60;

/** Most people in one group. */
export const MAX_GROUP_MEMBERS = 20;

/** Longest custom display name that will be stored. */
export const MAX_DISPLAY_NAME_LENGTH = 40;

/** The words for "7 days", "3 hours" and so on, from the page's dictionary. */
export interface InviteExpiryWords {
  expired: string;
  days: (n: number) => string;
  hours: (n: number) => string;
  underAnHour: string;
}

/**
 * How long is left on an invite link, in words: "7 days", "6 hours", or
 * "soon" for the last stretch. Whole units only, because an invite is
 * something you glance at before pasting it into a chat, not a countdown.
 */
export function inviteExpiryLabel(
  expiresAt: string,
  words: InviteExpiryWords,
  now = Date.now(),
): string {
  const left = Date.parse(expiresAt) - now;
  if (!Number.isFinite(left) || left <= 0) return words.expired;
  const days = Math.floor(left / 86_400_000);
  if (days >= 1) return words.days(days);
  const hours = Math.floor(left / 3_600_000);
  if (hours >= 1) return words.hours(hours);
  return words.underAnHour;
}
