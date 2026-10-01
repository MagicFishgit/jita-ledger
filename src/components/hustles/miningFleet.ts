import { useEffect, useMemo, useState } from 'react';
import { altLedger } from '../../lib/altLedger';
import { askedScopes, hasScope } from '../../lib/auth';
import { cloudAltTicks, cloudEnabled, cloudMiningTicks, useCloud } from '../../lib/cloud';
import { SCOPE, SCOPES } from '../../lib/config';
import { useAuth } from '../../lib/hooks';
import type { CharTick, MiningRecord } from '../../lib/mining';
import { type Pilot, pilotFrom } from '../../lib/pilot';
import { altReadState, emptyAlt, type AltSaved, type RosterEntry } from '../../lib/roster';
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
  /**
   * Whether its mining has been read (`altReadState` for an alt; for the main, its records or the permission), so a
   * character never read shows "Not read yet" rather than zeros. `permission`: its login lacks the Mining ledger one.
   */
  mining: 'read' | 'permission' | 'unread';
};

/** What the read of every character's ticks said. `loading` until the first read after the cloud came on answers. */
export type AltTicks = 'loading' | 'ok' | 'behind' | 'failed' | 'off';

/** What the hook needs of the alt store (structurally, so this file needn't import it). */
export type FleetAlts = { roster: RosterEntry[]; alts: Record<number, AltSaved> };

/** One empty copy for every alt not pulled yet, so altLedger's answer for it is worked out once, not on every render. */
const NO_ALT = emptyAlt();

export function useMiningFleet(days: number, alts: FleetAlts): {
  chars: FleetChar[];
  /** Every character's ticks, tagged; null with the cloud off, or until the main's first read has answered. */
  ticks: CharTick[] | null;
  altTicks: AltTicks;
} {
  const d = useData();
  const auth = useAuth();
  const cloud = useCloud();
  const mainId = auth?.characterId ?? 0;
  const mainName = auth?.characterName ?? 'You';
  const canRead = hasScope(SCOPE.mining);

  // Keyed on what's read, never the whole ledger: a write to trades or orders would otherwise build every character
  // again, and every memo on the tab after it.
  const { mining, skills, meta, settings, chars: known } = d;
  const myMining = useMemo(() => Object.values(mining).filter((r) => r.charId === mainId), [mining, mainId]);
  const mainPilot = useMemo(() => pilotFrom({ skills, meta, settings }, { charId: mainId, name: mainName, isMain: true }, false), [skills, meta, settings, mainId, mainName]);
  const chars = useMemo<FleetChar[]>(() => {
    const main: FleetChar = {
      charId: mainId, name: mainName, isMain: true, records: myMining, pilot: mainPilot,
      mining: myMining.length || canRead ? 'read' : 'permission',
    };
    const wanted = [...SCOPES, ...askedScopes()];
    const others = alts.roster.map((entry): FleetChar => {
      const saved = alts.alts[entry.charId] ?? NO_ALT;
      const ledger = altLedger(saved, known[String(entry.charId)]?.clone);
      const name = entry.name ?? known[String(entry.charId)]?.name ?? `Character ${entry.charId}`;
      return {
        charId: entry.charId, name, isMain: false, entry,
        records: Object.values(ledger.mining),
        pilot: pilotFrom(ledger, { charId: entry.charId, name, isMain: false }, true),
        mining: altReadState(saved, entry, wanted, SCOPE.mining).mining,
      };
    });
    return [main, ...others];
  }, [mainId, mainName, myMining, mainPilot, canRead, known, alts.roster, alts.alts]);

  // Ticks are read once a visit and again when a roster revision moves: the key, never the objects, drives the effect.
  const revKey = alts.roster.map((e) => `${e.charId}:${e.rev}`).join(',');
  const on = cloudEnabled() && cloud.started;
  const [mine, setMine] = useState<CharTick[] | null>(null);
  const [theirs, setTheirs] = useState<CharTick[]>([]);
  const [altTicks, setAltTicks] = useState<AltTicks>(on ? 'loading' : 'off');
  useEffect(() => {
    // The cloud switched off: what it said before isn't kept, or the tab would go on showing sessions it can't read.
    if (!on) { setMine(null); setTheirs([]); setAltTicks('off'); return; }
    let alive = true;
    // Only the first read after the cloud came on is "loading": a later one (a roster revision moved) keeps what the
    // last said until it answers, so no line flashes.
    setAltTicks((s) => (s === 'off' ? 'loading' : s));
    // The main's failing keeps what it had, else none: sessions are then the alts' alone, and none is said as none seen.
    cloudMiningTicks(days).then((t) => { if (alive) setMine(t.map((x) => ({ ...x, charId: mainId }))); }).catch(() => { if (alive) setMine((m) => m ?? []); });
    cloudAltTicks(days)
      .then((t) => { if (alive) { setTheirs(t); setAltTicks('ok'); } })
      .catch((e: Error & { status?: number }) => { if (alive) { setTheirs([]); setAltTicks(e.status === 404 ? 'behind' : 'failed'); } });
    return () => { alive = false; };
  }, [on, days, mainId, revKey]);

  const ticks = useMemo(() => (on && mine ? [...mine, ...theirs] : null), [on, mine, theirs]);
  return { chars, ticks, altTicks };
}
