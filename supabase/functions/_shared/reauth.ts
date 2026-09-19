/**
 * The provider no longer accepts the stored credential: a refresh token that
 * expired or was revoked, an app-specific password that was deleted. Retrying
 * can't fix this, only the person reconnecting the account can, so the sync
 * reports it differently from a temporary failure (an outage, a timeout).
 */
export class ReauthRequired extends Error {}

/**
 * True for an OAuth token endpoint's "this grant is dead" answer. Both Google
 * and Microsoft use the standard `invalid_grant` error for an expired or
 * revoked refresh token.
 */
export function isInvalidGrant(status: number, body: string): boolean {
  return status === 400 && body.includes("invalid_grant");
}
