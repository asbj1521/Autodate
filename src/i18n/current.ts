import { da, type Messages } from "@/i18n/da";
import { en } from "@/i18n/en";
import type { Lang } from "@/i18n/locale";

/**
 * The page's language for code that runs outside React: the API helpers'
 * fallback messages, and the `lang` sent to every Edge Function so its own
 * messages come back in the same language. LanguageProvider keeps it in step.
 */
let current: Lang = "da";

export function setCurrentLang(lang: Lang) {
  current = lang;
}

export function currentLang(): Lang {
  return current;
}

/** The current language's copy, for the same code. */
export function currentMessages(): Messages {
  return current === "da" ? da : en;
}
