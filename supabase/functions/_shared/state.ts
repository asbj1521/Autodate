/**
 * Signed OAuth "state" tokens.
 *
 * The state param round-trips through the provider (Google, later Outlook)
 * unmodified, so it's the only place to carry two things across that hop:
 * which profile is connecting, and proof the callback wasn't forged. Rather
 * than a database table of pending flows (one more thing to expire and
 * clean up), the state itself is a signed, self-contained token: HMAC-SHA256
 * over the payload using a secret only our functions know. If it verifies,
 * it's ours; if the signature or the timestamp is stale, it's rejected.
 */

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface OAuthStatePayload {
  /** Which profile is connecting. Plain text until real auth exists. */
  profileId: string;
  /** Random per-request value; not currently checked against anything, but
   * keeps two states for the same profile from ever being identical. */
  nonce: string;
  /** Epoch ms the state was issued, so stale links can be rejected. */
  ts: number;
}

const MAX_STATE_AGE_MS = 10 * 60_000; // 10 minutes: long enough for a consent screen, no longer.

/** Sign a state payload into the opaque string passed as the OAuth `state` param. */
export async function signState(
  payload: OAuthStatePayload,
  secret: string,
): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(sig))}`;
}

/**
 * Verify a state string from a callback request. Returns the payload if the
 * signature is valid and it isn't stale; null otherwise (never throws on bad
 * input; a forged or expired state is just an untrusted request, not a bug).
 */
export async function verifyState(
  state: string,
  secret: string,
): Promise<OAuthStatePayload | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(sig),
    encoder.encode(body),
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as OAuthStatePayload;
    if (typeof payload.profileId !== "string" || typeof payload.ts !== "number") return null;
    if (Date.now() - payload.ts > MAX_STATE_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
