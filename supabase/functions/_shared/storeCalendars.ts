/**
 * Save a freshly fetched account (connection, secret, calendars, busy blocks)
 * in one go, for the adapters that fetch everything up front: ICS links and
 * Apple/CalDAV. Google and Outlook build the same rows inside their OAuth
 * callbacks, where a failure is shown as an errored connection instead.
 *
 * Everything is fetched and parsed *before* this is called, so a bad link or
 * a wrong password never leaves rows behind. If saving itself fails halfway,
 * the connection is deleted, which cascades to whatever was inserted so far.
 */
import type { RawBusyInterval } from "./intervals.ts";
import type { supabaseAdmin } from "./supabaseAdmin.ts";

const BUSY_INSERT_CHUNK = 500;

/** One calendar inside the account, with its busy blocks already computed. */
export interface CalendarToStore {
  /** The provider's own id for this calendar; unique within the connection. */
  externalId: string;
  displayName: string | null;
  intervals: RawBusyInterval[];
}

export interface StoreCalendarsInput {
  profileId: string;
  provider: "ics" | "apple";
  /** What the profile page shows for the account (a link's name, an email). */
  accountLabel: string | null;
  /** Columns of calendar_secrets to fill, already encrypted by the caller. */
  secrets: Record<string, string>;
  calendars: CalendarToStore[];
}

/** Saving failed; the message is for the logs, not for the user. */
export class StoreError extends Error {}

/**
 * Store an account and return its new connection id. Throws StoreError after
 * cleaning up if anything goes wrong.
 */
export async function storeCalendars(
  db: ReturnType<typeof supabaseAdmin>,
  input: StoreCalendarsInput,
): Promise<{ connectionId: string }> {
  const { data: connection, error: insertErr } = await db
    .from("calendar_connections")
    .insert({
      profile_id: input.profileId,
      provider: input.provider,
      status: "pending",
      account_label: input.accountLabel,
    })
    .select()
    .single();
  if (insertErr || !connection) {
    throw new StoreError(`Failed to create calendar_connections row: ${insertErr?.message}`);
  }

  try {
    const { error: secretErr } = await db
      .from("calendar_secrets")
      .insert({ connection_id: connection.id, ...input.secrets });
    if (secretErr) throw secretErr;

    let busyRows: { source_id: string; start_at: string; end_at: string }[] = [];
    if (input.calendars.length > 0) {
      const { data: sources, error: sourcesErr } = await db
        .from("calendar_sources")
        .insert(
          input.calendars.map((c) => ({
            connection_id: connection.id,
            external_calendar_id: c.externalId,
            display_name: c.displayName,
          })),
        )
        .select();
      if (sourcesErr || !sources) throw sourcesErr ?? new Error("No calendar_sources returned");

      const sourceIdByExternalId = new Map<string, string>(
        sources.map((s: { external_calendar_id: string; id: string }) => [s.external_calendar_id, s.id]),
      );
      busyRows = input.calendars.flatMap((c) => {
        const sourceId = sourceIdByExternalId.get(c.externalId);
        return sourceId
          ? c.intervals.map((iv) => ({ source_id: sourceId, start_at: iv.start, end_at: iv.end }))
          : [];
      });
    }

    for (let i = 0; i < busyRows.length; i += BUSY_INSERT_CHUNK) {
      const { error: busyErr } = await db
        .from("calendar_busy_cache")
        .insert(busyRows.slice(i, i + BUSY_INSERT_CHUNK));
      if (busyErr) throw busyErr;
    }

    const { error: updateErr } = await db
      .from("calendar_connections")
      .update({ status: "connected", last_synced_at: new Date().toISOString() })
      .eq("id", connection.id);
    if (updateErr) throw updateErr;
  } catch (err) {
    await db.from("calendar_connections").delete().eq("id", connection.id);
    throw new StoreError(`Failed while saving; rolled back: ${String(err)}`);
  }

  return { connectionId: connection.id };
}
