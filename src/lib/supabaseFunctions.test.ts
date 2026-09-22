import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setCurrentLang } from "@/i18n/current";
import { callFunction } from "@/lib/supabaseFunctions";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("callFunction", () => {
  beforeEach(() => setCurrentLang("da"));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the function's own error rather than the fallback", async () => {
    answer(400, { error: "Invitationslinket er ikke gyldigt." });
    await expect(callFunction("groups", { body: {}, errorMessage: "Kunne ikke" })).rejects.toThrow(
      "Invitationslinket er ikke gyldigt.",
    );
  });

  it("falls back to the caller's message when the function says nothing", async () => {
    answer(500, {});
    await expect(callFunction("groups", { body: {}, errorMessage: "Kunne ikke" })).rejects.toThrow(
      "Kunne ikke (HTTP 500)",
    );
  });

  it("says which function failed when there is no message at all", async () => {
    answer(502, {});
    await expect(callFunction("groups", { body: {} })).rejects.toThrow("groups fejlede (HTTP 502)");
  });

  it("asks the function to answer in the page's language", async () => {
    const fetchMock = answer(200, { ok: true });
    setCurrentLang("en");
    await callFunction("calendar-busy", { params: { from: "a" } });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.get("from")).toBe("a");
  });
});
