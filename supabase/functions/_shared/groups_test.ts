// Run with: deno test --node-modules-dir=none --allow-all supabase/functions/_shared/
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  cleanDisplayName,
  cleanGroupName,
  displayNameFor,
  inviteUrl,
  looksLikeInviteToken,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  newInviteToken,
} from "./groups.ts";

Deno.test("an invite token survives a URL and is never repeated", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const token = newInviteToken();
    assert(looksLikeInviteToken(token), `${token} is not token-shaped`);
    assertEquals(encodeURIComponent(token), token, "token must need no escaping");
    assert(!seen.has(token), "tokens must not repeat");
    seen.add(token);
  }
});

Deno.test("junk is rejected before the database is asked", () => {
  assertEquals(looksLikeInviteToken(""), false);
  assertEquals(looksLikeInviteToken("short"), false);
  assertEquals(looksLikeInviteToken(`a+/=${"x".repeat(40)}`), false);
  assertEquals(looksLikeInviteToken(null), false);
  assertEquals(looksLikeInviteToken(42), false);
});

Deno.test("the invite link points at the join page", () => {
  assertEquals(
    inviteUrl("https://casy-red.vercel.app", "abc123"),
    "https://casy-red.vercel.app/join/abc123",
  );
});

Deno.test("group names are tidied, capped and never left blank", () => {
  assertEquals(cleanGroupName("  Ikke Almene HA'ere  "), "Ikke Almene HA'ere");
  assertEquals(cleanGroupName("Two\nlines\tand\u0000nulls"), "Twolinesandnulls");
  assertEquals(cleanGroupName("   "), null);
  assertEquals(cleanGroupName(""), null);
  assertEquals(cleanGroupName(null), null);
  assertEquals(cleanGroupName(12), null);
});

Deno.test("a long name is cut to the limit without a trailing space", () => {
  const name = cleanGroupName(`${"a".repeat(MAX_GROUP_NAME_LENGTH - 1)} bbbb`);
  assertEquals(name, "a".repeat(MAX_GROUP_NAME_LENGTH - 1));
  assertEquals(name!.length <= MAX_GROUP_NAME_LENGTH, true);
});

Deno.test("a chosen display name is tidied, capped and never left blank", () => {
  assertEquals(cleanDisplayName("  Simon  "), "Simon");
  assertEquals(cleanDisplayName("Two\nlines\tand\u0000nulls"), "Twolinesandnulls");
  assertEquals(cleanDisplayName("   "), null);
  assertEquals(cleanDisplayName(""), null);
  assertEquals(cleanDisplayName(null), null);
  assertEquals(cleanDisplayName(12), null);
  const long = cleanDisplayName(`${"a".repeat(MAX_DISPLAY_NAME_LENGTH - 1)} bbbb`);
  assertEquals(long, "a".repeat(MAX_DISPLAY_NAME_LENGTH - 1));
});

Deno.test("members are named, and never by their email address", () => {
  assertEquals(
    displayNameFor({ email: "simon@example.com", user_metadata: { full_name: "Simon Liocouras" } }),
    "Simon Liocouras",
  );
  assertEquals(displayNameFor({ email: "x@y.dk", user_metadata: { name: "Thue" } }), "Thue");
  // No name at all: the local part stands in, so the domain stays private.
  assertEquals(displayNameFor({ email: "kristoffer@somebank.dk" }), "kristoffer");
  assertEquals(displayNameFor({ email: null, user_metadata: null }), "Someone");
  assertEquals(displayNameFor(null), "Someone");
  // A blank name in the metadata must not win over the email.
  assertEquals(displayNameFor({ email: "jonas@example.com", user_metadata: { full_name: "  " } }), "jonas");
});
