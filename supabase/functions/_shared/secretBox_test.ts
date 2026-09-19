// Run with: deno test --node-modules-dir=none supabase/functions/_shared/
import { assert, assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert@1";
import { decryptSecret, encryptSecret, lookupHash } from "./secretBox.ts";

const newKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

Deno.test("a secret survives an encrypt/decrypt round trip", async () => {
  const key = newKey();
  const stored = await encryptSecret("abcd-efgh-ijkl-mnop", key);
  assertEquals(await decryptSecret(stored, key), "abcd-efgh-ijkl-mnop");
});

Deno.test("the stored value never contains the plaintext", async () => {
  const stored = await encryptSecret("abcd-efgh-ijkl-mnop", newKey());
  assert(!stored.includes("abcd"));
  assert(stored.startsWith("v1:"));
});

Deno.test("the same secret encrypts differently each time", async () => {
  const key = newKey();
  assertNotEquals(await encryptSecret("same", key), await encryptSecret("same", key));
});

Deno.test("unicode secrets round trip", async () => {
  const key = newKey();
  assertEquals(await decryptSecret(await encryptSecret("blåbærgrød ø å æ", key), key), "blåbærgrød ø å æ");
});

Deno.test("the wrong key cannot decrypt", async () => {
  const stored = await encryptSecret("secret", newKey());
  await assertRejects(() => decryptSecret(stored, newKey()));
});

Deno.test("a tampered value is rejected, not decrypted to garbage", async () => {
  const key = newKey();
  const [v, nonce, ct] = (await encryptSecret("secret", key)).split(":");
  const flipped = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
  await assertRejects(() => decryptSecret(`${v}:${nonce}:${flipped}`, key));
});

Deno.test("a key of the wrong size is refused", async () => {
  const short = btoa("too short");
  await assertRejects(() => encryptSecret("x", short), Error, "32 bytes");
});

Deno.test("an unknown stored format is refused", async () => {
  await assertRejects(() => decryptSecret("v9:aaa:bbb", newKey()), Error, "Unrecognised");
  await assertRejects(() => decryptSecret("plaintext", newKey()), Error, "Unrecognised");
});

Deno.test("a lookup hash is the same for the same text and key", async () => {
  const key = newKey();
  assertEquals(
    await lookupHash("https://example.com/cal.ics", key),
    await lookupHash("https://example.com/cal.ics", key),
  );
});

Deno.test("a lookup hash differs for different text, or a different key", async () => {
  const key = newKey();
  const hash = await lookupHash("https://example.com/a.ics", key);
  assertNotEquals(hash, await lookupHash("https://example.com/b.ics", key));
  assertNotEquals(hash, await lookupHash("https://example.com/a.ics", newKey()));
});

Deno.test("a lookup hash does not contain the text", async () => {
  const hash = await lookupHash("https://example.com/secret-feed.ics", newKey());
  assert(!hash.includes("example"));
});
