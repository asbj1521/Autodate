/**
 * Encrypt a secret before it goes into the database: every credential column
 * of calendar_secrets (OAuth tokens, the iCloud app-specific password, ICS
 * feed links). The database refuses anything not in this format, see the
 * encrypt_calendar_secrets migration.
 *
 * AES-256-GCM with a fresh random nonce per value, so the same password never
 * encrypts to the same text twice, and any tampering with the stored value is
 * detected on decrypt instead of yielding garbage. The key lives in an Edge
 * Function secret (CALDAV_ENCRYPTION_KEY), never in the database, so a leaked
 * database dump alone does not reveal the passwords.
 *
 * Stored format: "v1:<base64 nonce>:<base64 ciphertext>". The version prefix
 * leaves room to rotate the scheme later without guessing what old rows are.
 */

const VERSION = "v1";
/** Labels the lookup-hash subkey, so it can never equal the encryption key. */
const LOOKUP_KEY_INFO = "autodate lookup hash v1";
const NONCE_BYTES = 12; // the size AES-GCM is designed around
const KEY_BYTES = 32; // AES-256

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
}

/** The key's raw bytes, checked for size. */
function decodeKey(base64Key: string): Uint8Array<ArrayBuffer> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64(base64Key);
  } catch {
    throw new Error("Encryption key is not valid base64.");
  }
  if (raw.length !== KEY_BYTES) {
    throw new Error(`Encryption key must be ${KEY_BYTES} bytes (base64 of 32 random bytes).`);
  }
  return raw;
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", decodeKey(base64Key), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * A fingerprint for finding a secret again without storing it readably: the
 * same text always gives the same value, but the value can't be turned back
 * into the text, or checked against guesses, without the key.
 *
 * Encrypted values can't be compared (each has its own random nonce), so this
 * is what answers "was this ICS link added before?". It uses its own key,
 * derived from the main one with HKDF, because using one key for two
 * different algorithms is how their weaknesses end up combining.
 */
export async function lookupHash(text: string, base64Key: string): Promise<string> {
  const master = await crypto.subtle.importKey("raw", decodeKey(base64Key), "HKDF", false, [
    "deriveKey",
  ]);
  const hmacKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(LOOKUP_KEY_INFO),
    },
    master,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(text));
  return toBase64(new Uint8Array(mac));
}

/** Encrypt `plaintext` with a base64 32-byte key. */
export async function encryptSecret(plaintext: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(plaintext)),
  );
  return `${VERSION}:${toBase64(nonce)}:${toBase64(ciphertext)}`;
}

/** Reverse of encryptSecret. Throws if the key is wrong or the value was altered. */
export async function decryptSecret(stored: string, base64Key: string): Promise<string> {
  const [version, nonce, ciphertext] = stored.split(":");
  if (version !== VERSION || !nonce || !ciphertext) {
    throw new Error("Unrecognised secret format.");
  }
  const key = await importKey(base64Key);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(nonce) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(plain);
}

/**
 * The key for this deployment. Fails loudly when it isn't configured, because
 * silently storing a secret unencrypted would be far worse than an error.
 *
 * The name is historical: it was introduced for the iCloud password and now
 * protects every secret. Renaming it would mean re-keying the stored values
 * for no gain in safety.
 */
export function encryptionKeyFromEnv(): string {
  const key = Deno.env.get("CALDAV_ENCRYPTION_KEY");
  if (!key) throw new Error("CALDAV_ENCRYPTION_KEY is not set for this function.");
  return key;
}
