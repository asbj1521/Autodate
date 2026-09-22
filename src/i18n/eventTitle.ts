import type { Messages } from "@/i18n/da";
import { en } from "@/i18n/en";

type EventTypeId = keyof Messages["eventTypes"];

/**
 * A suggested event stores its type's English name as its title ("Evening"),
 * whoever suggested it, so everyone in a mixed group reads the same event in
 * their own language. Any other title is shown as it was written.
 */
export function eventTitle(stored: string, t: Messages): string {
  const id = (Object.keys(en.eventTypes) as EventTypeId[]).find((k) => en.eventTypes[k] === stored);
  return id ? t.eventTypes[id] : stored;
}

/** The title to store for an event type: its English name, see above. */
export function storedEventTitle(id: EventTypeId): string {
  return en.eventTypes[id];
}
