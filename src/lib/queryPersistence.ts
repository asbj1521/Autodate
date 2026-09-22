/**
 * Remember a few small server answers across page loads, so a reload shows
 * the last known state at once and refreshes it quietly in the background
 * instead of starting from spinners.
 *
 * Only the queries named in PERSISTED are kept, and on purpose they are all
 * about the signed-in person themself: their groups (names and members),
 * their calendar status, whether they are an admin, and their own resolved
 * display name. Other people's busy times and the admin overview are never
 * written to the device.
 *
 * Every key those queries use includes the user's id, so one person's cache
 * is never served to another; everything is wiped on sign-out anyway (see
 * AuthProvider). A restored answer is marked with the time it was fetched,
 * so React Query still treats an old one as stale and refetches it.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** The first element of the query keys worth remembering. */
const PERSISTED = new Set(["groups", "calendar-status", "admin-status", "whoami"]);

const STORAGE_PREFIX = "casy:query:";
/** Anything older than this is dropped rather than shown. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored {
  key: QueryKey;
  data: unknown;
  updatedAt: number;
}

function isPersisted(key: QueryKey): boolean {
  return typeof key[0] === "string" && PERSISTED.has(key[0]);
}

function storageKey(key: QueryKey): string {
  return STORAGE_PREFIX + JSON.stringify(key);
}

/** Every stored entry, oldest ones removed on the way. Never throws. */
function readAll(now: number): Stored[] {
  const entries: Stored[] = [];
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const name = localStorage.key(i);
      if (!name?.startsWith(STORAGE_PREFIX)) continue;
      try {
        const entry = JSON.parse(localStorage.getItem(name) ?? "") as Stored;
        if (!Array.isArray(entry.key) || !isPersisted(entry.key) || now - entry.updatedAt > MAX_AGE_MS) {
          localStorage.removeItem(name);
        } else {
          entries.push(entry);
        }
      } catch {
        localStorage.removeItem(name);
      }
    }
  } catch {
    // Storage can be blocked (private windows, strict settings): no cache then.
  }
  return entries;
}

/**
 * Put the remembered answers into the client, then keep remembering every
 * fresh answer to the persisted queries. Call once, before the first render.
 * Returns a function that stops listening.
 */
export function persistQueries(client: QueryClient, now = Date.now()): () => void {
  for (const entry of readAll(now)) {
    client.setQueryData(entry.key, entry.data, { updatedAt: entry.updatedAt });
  }

  // Only successes are written. A query that is dropped from memory (React
  // Query does that to unused ones after a few minutes) keeps its stored
  // copy; stored copies only go on sign-out or once they are too old.
  return client.getQueryCache().subscribe((event) => {
    const { query } = event;
    if (!isPersisted(query.queryKey)) return;
    try {
      if (
        event.type === "updated" &&
        event.action.type === "success" &&
        query.state.data !== undefined
      ) {
        const entry: Stored = {
          key: query.queryKey,
          data: query.state.data,
          updatedAt: query.state.dataUpdatedAt,
        };
        localStorage.setItem(storageKey(query.queryKey), JSON.stringify(entry));
      }
    } catch {
      // Full or blocked storage only costs the head start on the next load.
    }
  });
}

/** Forget everything remembered, as on sign-out. Never throws. */
export function clearPersistedQueries(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const name = localStorage.key(i);
      if (name?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(name);
    }
  } catch {
    // Nothing stored, then.
  }
}
