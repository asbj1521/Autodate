// Run with: deno test --node-modules-dir=none --allow-all supabase/functions/_shared/
import { assertEquals } from "jsr:@std/assert@1";
import { isAdminId, parseAdminIds } from "./admin.ts";

const A = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0";
const B = "11111111-2222-3333-4444-555555555555";

Deno.test("an unset or empty secret makes nobody an admin", () => {
  assertEquals(isAdminId(A, undefined), false);
  assertEquals(isAdminId(A, null), false);
  assertEquals(isAdminId(A, ""), false);
  assertEquals(isAdminId(A, " , ,"), false);
});

Deno.test("listed ids match, with spaces and case forgiven", () => {
  const raw = ` ${A.toUpperCase()} , ${B}`;
  assertEquals(isAdminId(A, raw), true);
  assertEquals(isAdminId(B, raw), true);
  assertEquals(isAdminId("22222222-2222-3333-4444-555555555555", raw), false);
});

Deno.test("no caller is never an admin", () => {
  assertEquals(isAdminId(null, A), false);
  assertEquals(isAdminId("", A), false);
});

Deno.test("entries that aren't user ids are dropped, not matched", () => {
  assertEquals([...parseAdminIds(`*,true,${A},admin`)], [A]);
  assertEquals(isAdminId("*", "*"), false);
});
