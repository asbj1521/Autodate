import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { setCurrentLang } from "@/i18n/current";
import { initialLang, LANG_STORAGE_KEY, LanguageContext, type Lang } from "@/i18n/lang";

function readStored(): string | null {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const first = initialLang(window.location.search, readStored());
    setCurrentLang(first);
    return first;
  });

  const setLang = useCallback((next: Lang) => {
    // Set before the re-render, so a request made during it already asks in
    // the new language.
    setCurrentLang(next);
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice just won't outlive the tab.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
