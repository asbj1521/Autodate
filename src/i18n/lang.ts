import { createContext, useContext } from "react";

import { da, type Messages } from "@/i18n/da";
import { en } from "@/i18n/en";
import { LOCALE, type Lang } from "@/i18n/locale";

export { LOCALE, type Lang };

export const MESSAGES: Record<Lang, Messages> = { da, en };

export const LANG_STORAGE_KEY = "casy-lang";

function asLang(value: string | null | undefined): Lang | null {
  return value === "da" || value === "en" ? value : null;
}

/**
 * Danish unless this visit or an earlier one chose English. `?lang=` wins over
 * the remembered choice, so a link like /privacy?lang=en always opens in English.
 */
export function initialLang(search: string, stored: string | null): Lang {
  return asLang(new URLSearchParams(search).get("lang")) ?? asLang(stored) ?? "da";
}

export interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const LanguageContext = createContext<LanguageContextValue>({
  lang: "da",
  setLang: () => {},
});

export function useLang() {
  const { lang, setLang } = useContext(LanguageContext);
  return { lang, setLang, locale: LOCALE[lang] };
}

/** The current language's copy: `const t = useT(); t.nav.profile`. */
export function useT(): Messages {
  return MESSAGES[useContext(LanguageContext).lang];
}
