import { useLang, useT, type Lang } from "@/i18n/lang";
import { cn } from "@/lib/utils";

const OPTIONS: { lang: Lang; label: string; name: string }[] = [
  { lang: "da", label: "DA", name: "Dansk" },
  { lang: "en", label: "EN", name: "English" },
];

/** The DA | EN switch beside the logo. Kept small: on a phone the header is full. */
export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  const t = useT();

  return (
    <div
      role="radiogroup"
      aria-label={t.language.switchLabel}
      className="flex items-center rounded-full border bg-secondary/60 p-0.5 text-[10px] font-semibold sm:text-xs"
    >
      {OPTIONS.map((option) => {
        const active = option.lang === lang;
        return (
          <button
            key={option.lang}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.name}
            lang={option.lang}
            onClick={() => setLang(option.lang)}
            className={cn(
              "rounded-full px-1.5 py-0.5 transition sm:px-2",
              active
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
