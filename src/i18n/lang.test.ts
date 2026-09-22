import { describe, expect, it } from "vitest";

import { initialLang } from "@/i18n/lang";

describe("initialLang", () => {
  it("defaults to Danish", () => {
    expect(initialLang("", null)).toBe("da");
  });

  it("uses the remembered choice", () => {
    expect(initialLang("", "en")).toBe("en");
  });

  it("lets ?lang= override the remembered choice", () => {
    expect(initialLang("?lang=en", "da")).toBe("en");
    expect(initialLang("?next=%2F&lang=da", "en")).toBe("da");
  });

  it("ignores values it doesn't know", () => {
    expect(initialLang("?lang=de", "fr")).toBe("da");
  });
});
