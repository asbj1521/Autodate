/**
 * The languages Casy speaks, without React: plain helpers in src/lib take a
 * `Lang` and import it from here, so they stay free of the context.
 */
export type Lang = "da" | "en";

/** The Intl locale each language formats dates with. */
export const LOCALE: Record<Lang, string> = { da: "da-DK", en: "en-GB" };
