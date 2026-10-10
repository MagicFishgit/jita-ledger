import { shareInFlight } from './inFlight';

/**
 * A name lookup that keeps what ESI definitely said, for the Industry tab's NPC stations (docs/notes/industry.md).
 * A name read is a string; one ESI answered without (a lookup that came back with no name, or a refusal of that ID:
 * `definite`) is null; one still being read, or one whose lookup failed in a way that says nothing about the ID (offline,
 * a 5xx, a timeout), is absent from `known`, so a later visit asks again. A refused batch (ESI rejects the whole list over
 * one bad ID) is asked again one ID at a time, each shared while in flight so a changed list mid-fallback doesn't ask the
 * same IDs twice. Within one `read` nothing is retried. Pure: the caller hands in the lookup, so check.mjs loads it.
 */
export function nameReader(resolve: (ids: number[]) => Promise<Record<number, string>>, definite: (e: unknown) => boolean) {
  const known = new Map<number, string | null>();
  const one = shareInFlight((id: number) => String(id), async (id: number): Promise<void> => {
    try { known.set(id, (await resolve([id]))[id] ?? null); } catch (e) { if (definite(e)) known.set(id, null); }
  });
  const many = shareInFlight((ids: number[]) => ids.join(','), async (ids: number[]): Promise<void> => {
    try {
      const got = await resolve(ids);
      for (const id of ids) known.set(id, got[id] ?? null);
    } catch (e) {
      if (definite(e)) await Promise.all(ids.map((id) => one(id)));
    }
  });
  return {
    known,
    /** Reads the names not held yet; resolves when done, whatever the answer (check `known`). */
    async read(ids: readonly number[]): Promise<void> {
      const want = [...new Set(ids)].filter((id) => !known.has(id)).sort((a, b) => a - b);
      if (want.length) await many(want).catch(() => undefined);
    },
  };
}
