import { assertEquals } from "jsr:@std/assert@1";

import { DANISH, DANISH_PATTERNS, langOf, translateError, withLanguage } from "./i18n.ts";

/** Every .ts and .sql file the English messages could come from. */
async function allSource(): Promise<string> {
  const roots = [new URL("../", import.meta.url), new URL("../../migrations/", import.meta.url)];
  let text = "";
  async function walk(dir: URL) {
    for await (const entry of Deno.readDir(dir)) {
      const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
      if (entry.isDirectory) await walk(url);
      else if (/\.(ts|sql)$/.test(entry.name) && !entry.name.startsWith("i18n")) {
        text += await Deno.readTextFile(url);
      }
    }
  }
  for (const root of roots) await walk(root);
  return text;
}

Deno.test("every translated message still exists word for word in the code", async () => {
  // Source strings may be split across lines or escape their quotes, so
  // compare with whitespace squashed and apostrophes normalised.
  const squash = (s: string) => s.replace(/\\'/g, "'").replace(/\s+/g, " ");
  const source = squash(await allSource());
  const missing = Object.keys(DANISH).filter((english) => !source.includes(squash(english)));
  assertEquals(missing, []);
});

Deno.test("Danish copy follows the site's rules: no em or en dashes", () => {
  const all = [...Object.values(DANISH), ...DANISH_PATTERNS.map(([, render]) => render("x", "y"))];
  assertEquals(all.filter((s) => /[–—]/.test(s)), []);
});

Deno.test("translates exact and patterned messages, and leaves the rest", () => {
  assertEquals(translateError("Please sign in again.", "da"), "Log ind igen.");
  assertEquals(translateError("That link responded with HTTP 404.", "da"), "Linket svarede med HTTP 404.");
  assertEquals(translateError("groupId is required", "da"), "groupId is required");
  assertEquals(translateError("Please sign in again.", "en"), "Please sign in again.");
});

Deno.test("only ?lang=da asks for Danish", () => {
  assertEquals(langOf(new Request("https://x.test/fn?lang=da")), "da");
  assertEquals(langOf(new Request("https://x.test/fn?lang=en")), "en");
  assertEquals(langOf(new Request("https://x.test/fn")), "en");
});

const failing = () =>
  new Response(JSON.stringify({ error: "Please sign in again." }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

Deno.test("withLanguage rewrites a failed JSON response and keeps its status and headers", async () => {
  const res = await withLanguage(failing)(new Request("https://x.test/fn?lang=da"));
  assertEquals(res.status, 401);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(await res.json(), { error: "Log ind igen." });
});

Deno.test("withLanguage leaves English callers and successes alone", async () => {
  const en = await withLanguage(failing)(new Request("https://x.test/fn?lang=en"));
  assertEquals(await en.json(), { error: "Please sign in again." });
  const ok = await withLanguage(() => new Response(JSON.stringify({ ok: true }), { status: 200 }))(
    new Request("https://x.test/fn?lang=da"),
  );
  assertEquals(await ok.json(), { ok: true });
});
