import { useEffect, useMemo, useState } from 'react';
import { altLedger } from '../../lib/altLedger';
import { cloudAltTicks, cloudEnabled, cloudMiningTicks, useCloud } from '../../lib/cloud';
import { useAuth } from '../../lib/hooks';
import type { CharTick, MiningRecord } from '../../lib/mining';
import { type Pilot, pilotFrom } from '../../lib/pilot';
import { emptyAlt, type AltSaved, type RosterEntry } from '../../lib/roster';
import { useData } from '../../lib/store';

/**
 * Every character's mining for the Mining tab (stage 3 of several characters): the main's records from the store, each
 * alt's from its pulled copy (altLedger), a pilot for each, and the cloud's ticks for all of them tagged by character.
 * The alt store's value is passed in by Mining.tsx, the one page allowed to import it (docs/notes/characters.md), so this
 * file never imports the store an alt's data lives in, and nothing here writes the ledger.
 */
export type FleetChar = {
  charId: number; name: string; isMain: boolean;
  /** Its mining records (the main's from the store, an alt's from its pulled copy). */
  records: MiningRecord[];
  /** Its pilot, for Scaling up. */
  pilot: Pilot;
  /** An alt's roster entry (its login, jobs, ship at the last mining read); none for the main. */
  entry?: RosterEntry;
};

/** What the hook needs of the alt store (structurally, so this file needn't import it). */
export type FleetAlts = { roster: RosterEntry[]; alts: Record<number, AltSaved> };

/** One empty copy for every alt not pulled yet, so altLedger's answer for it is worked out once, not on every render. */
const NO_ALT = emptyAlt();

export function useMiningFleet(days: number, alts: FleetAlts): {
  chars: FleetChar[];
  ticks: CharTick[] | null;
  altTicks: 'ok' | 'behind' | 'failed' | 'off';
} {
  const d = useData();
  const auth = useAuth();
  const cloud = useCloud();
  const mainId = auth?.characterId ?? 0;
  const mainName = auth?.characterName ?? 'You';

  const myMining = useMemo(() => Object.values(d.mining).filter((r) => r.charId === mainId), [d.mining, mainId]);
  const chars = useMemo<FleetChar[]>(() => {
    const main: FleetChar = {
      charId: mainId, name: mainName, isMain: true, records: myMining,
      pilot: pilotFrom(d, { charId: mainId, name: mainName, isMain: true }, false),
    };
    const others = alts.roster.map((entry): FleetChar => {
      const ledger = altLedger(alts.alts[entry.charId] ?? NO_ALT, d.chars[String(entry.charId)]?.clone);
      const name = entry.name ?? d.chars[String(entry.charId)]?.name ?? `Character ${entry.charId}`;
      return {
        charId: entry.charId, name, isMain: false, entry,
        records: Object.values(ledger.mining),
        pilot: pilotFrom(ledger, { charId: entry.charId, name, isMain: false }, true),
      };
    });
    return [main, ...others];
  }, [d, mainId, mainName, myMining, alts.roster, alts.alts]);

  // Ticks are read once a visit and again when a roster revision moves: the key, never the objects, drives the effect.
  const revKey = alts.roster.map((e) => `${e.charId}:${e.rev}`).join(',');
  const on = cloudEnabled() && cloud.started;
  const [mine, setMine] = useState<CharTick[] | null>(null);
  const [theirs, setTheirs] = useState<CharTick[]>([]);
  const [altTicks, setAltTicks] = useState<'ok' | 'behind' | 'failed' | 'off'>('off');
  useEffect(() => {
    if (!on) { setAltTicks('off'); return; }
    let alive = true;
    cloudMiningTicks(days).then((t) => { if (alive) setMine(t.map((x) => ({ ...x, charId: mainId }))); }).catch(() => { if (alive) setMine(null); });
    cloudAltTicks(days)
      .then((t) => { if (alive) { setTheirs(t); setAltTicks('ok'); } })
      .catch((e: Error & { status?: number }) => { if (alive) { setTheirs([]); setAltTicks(e.status === 404 ? 'behind' : 'failed'); } });
    return () => { alive = false; };
  }, [on, days, mainId, revKey]);

  const ticks = useMemo(() => (mine ? [...mine, ...theirs] : null), [mine, theirs]);
  return { chars, ticks, altTicks };
}
