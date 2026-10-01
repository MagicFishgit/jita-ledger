import { useEffect, useMemo, useState } from 'react';
import { altLedger } from '../../lib/altLedger';
import { askedScopes, hasScope } from '../../lib/auth';
import { cloudAltTicks, cloudEnabled, cloudMiningTicks, useCloud } from '../../lib/cloud';
import { SCOPE, SCOPES } from '../../lib/config';
import { useAuth } from '../../lib/hooks';
import type { CharTick, MiningRecord } from '../../lib/mining';
import { type Pilot, pilotFrom } from '../../lib/pilot';
import { altReadState, emptyAlt, loginState, type AltSaved, type RosterEntry } from '../../lib/roster';
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
   * An alt's own type names, pulled with its copy (altLedger), so its ore is priced and named here as on the Characters
   * page even while ESI's name lookup fails; none for the main, whose names are the store's.
   */
  names?: Record<number, string>;
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

/**
 * Only the first read after the cloud came on is "loading": a later one (the ticks may have grown) keeps what the last
 * said until it answers, so no line flashes; and a later one failing keeps what the last one read.
 */
const first = (s: AltTicks): AltTicks => (s === 'off' ? 'loading' : s);
const failed = (s: AltTicks): AltTicks => (s === 'ok' ? s : 'failed');

export function useMiningFleet(days: number, alts: FleetAlts): {
  chars: FleetChar[];
  /** Every character's ticks that have been read, tagged; null with the cloud off, or until a read has brought some. */
  ticks: CharTick[] | null;
  /** What the read of your own ticks said ('behind' never: the main's route is as old as sessions). */
  mainTicks: AltTicks;
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
      // A login refused, or none kept: nothing more is read, so what isn't read says so (Pilot's `lost`).
      const login = loginState(entry, wanted).state;
      return {
        charId: entry.charId, name, isMain: false, entry, names: ledger.names,
        records: Object.values(ledger.mining),
        pilot: { ...pilotFrom(ledger, { charId: entry.charId, name, isMain: false }, true), lost: login === 'working' ? undefined : login },
        mining: altReadState(saved, entry, wanted, SCOPE.mining).mining,
      };
    });
    return [main, ...others];
  }, [mainId, mainName, myMining, mainPilot, canRead, known, alts.roster, alts.alts]);

  // Ticks are read once a visit, and again when they may have grown: the main's when its mining records do (the cloud
  // pushes what its ten-minute read found, and the ESI sync adds its own), the alts' when a roster revision moves. Keys,
  // never the objects, drive the effects: the ESI sync rebuilds the records object each time it reads, grown or not.
  const mineKey = useMemo(() => `${myMining.length}:${myMining.reduce((n, r) => n + r.qty, 0)}`, [myMining]);
  const revKey = alts.roster.map((e) => `${e.charId}:${e.rev}`).join(',');
  const on = cloudEnabled() && cloud.started;
  const [mine, setMine] = useState<CharTick[] | null>(null);
  const [theirs, setTheirs] = useState<CharTick[]>([]);
  const [mainTicks, setMainTicks] = useState<AltTicks>(on ? 'loading' : 'off');
  const [altTicks, setAltTicks] = useState<AltTicks>(on ? 'loading' : 'off');
  useEffect(() => {
    // The cloud switched off: what it said before isn't kept, or the tab would go on showing sessions it can't read.
    if (!on) { setMine(null); setMainTicks('off'); return; }
    let alive = true;
    setMainTicks(first);
    cloudMiningTicks(days)
      .then((t) => { if (alive) { setMine(t.map((x) => ({ ...x, charId: mainId }))); setMainTicks('ok'); } })
      .catch(() => { if (alive) setMainTicks(failed); });
    return () => { alive = false; };
  }, [on, days, mainId, mineKey]);
  useEffect(() => {
    if (!on) { setTheirs([]); setAltTicks('off'); return; }
    let alive = true;
    setAltTicks(first);
    cloudAltTicks(days)
      .then((t) => { if (alive) { setTheirs(t); setAltTicks('ok'); } })
      // A Worker a version behind has no alt route: none, and said once. Any other failure keeps what was read.
      .catch((e: Error & { status?: number }) => { if (alive) { if (e.status === 404) { setTheirs([]); setAltTicks('behind'); } else setAltTicks(failed); } });
    return () => { alive = false; };
  }, [on, days, revKey]);

  const ticks = useMemo(() => (on && (mine || altTicks === 'ok') ? [...(mine ?? []), ...theirs] : null), [on, mine, theirs, altTicks]);
  return { chars, ticks, mainTicks, altTicks };
}
