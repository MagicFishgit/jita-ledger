import { useMemo } from 'react';
import { altLedger } from '../../lib/altLedger';
import { askedScopes, hasScope } from '../../lib/auth';
import { SCOPE, SCOPES } from '../../lib/config';
import { rates } from '../../lib/fees';
import { useAuth } from '../../lib/hooks';
import { type Pilot, pilotFrom } from '../../lib/pilot';
import type { StandingRow } from '../../lib/research';
import { emptyAlt, jobOk, loginState, type AltSaved, type RosterEntry } from '../../lib/roster';
import { useData } from '../../lib/store';

/**
 * Every character the Research tab can be shown for: the main from the store, each alt from its pulled copy (altLedger),
 * each with its pilot (skills, queue, attributes), its standings and its sales tax. The alt store's value is passed in by
 * Research.tsx, the one file here allowed to import it (docs/notes/characters.md), as miningFleet.ts takes Mining's; this
 * file writes nothing.
 */

/**
 * Where a character's standings stand. Nothing not known reads as "no standing": `unread` is not read yet (the main's
 * next sync, an alt's next hourly read by the cloud), `login` the main's login lacking the standings permission, `handOver`
 * an alt's login handed over without it, `lost` an alt whose login EVE refused or the cloud doesn't hold.
 */
export type StandingsState =
  | { state: 'read'; list: StandingRow[]; at: number | null }
  | { state: 'unread' } | { state: 'login' } | { state: 'handOver' } | { state: 'lost'; why: 'refused' | 'none' };

export type ResearchChar = {
  charId: number; name: string; isMain: boolean; pilot: Pilot; standings: StandingsState;
  /** Its own sales tax, for what its datacores fetch. */
  tax: number;
  /** As read from its skills (or set by hand for an alt); `unknown` is never called Alpha. */
  clone: 'alpha' | 'omega' | 'unknown';
};

/** What the hook needs of the alt store (structurally, so this file needn't import it). */
export type ResearchAlts = { roster: RosterEntry[]; alts: Record<number, AltSaved> };

const NO_ALT = emptyAlt();

export function useResearchChars(alts: ResearchAlts): ResearchChar[] {
  const d = useData();
  const auth = useAuth();
  const mainId = auth?.characterId ?? 0;
  const mainName = auth?.characterName ?? 'You';
  const { skills, meta, settings, chars: known } = d;
  const canStandings = hasScope(SCOPE.standings);
  return useMemo(() => {
    const main: ResearchChar = {
      charId: mainId, name: mainName, isMain: true,
      pilot: pilotFrom({ skills, meta, settings }, { charId: mainId, name: mainName, isMain: true }, false),
      standings: meta.standings ? { state: 'read', list: meta.standings.list, at: meta.standings.at ? Date.parse(meta.standings.at) : null }
        : canStandings ? { state: 'unread' } : { state: 'login' },
      tax: rates(settings).t,
      clone: meta.cloneDetected ?? 'unknown',
    };
    const wanted = [...SCOPES, ...askedScopes()];
    const others = alts.roster.map((entry): ResearchChar => {
      const saved = alts.alts[entry.charId] ?? NO_ALT;
      const byHand = known[String(entry.charId)]?.clone;
      const ledger = altLedger(saved, byHand);
      const name = entry.name ?? known[String(entry.charId)]?.name ?? `Character ${entry.charId}`;
      const login = loginState(entry, wanted);
      const lost = login.state === 'working' ? undefined : login.state;
      const st = ledger.meta.standings;
      const detected = (ledger.meta as { cloneDetected?: 'alpha' | 'omega' }).cloneDetected;
      return {
        charId: entry.charId, name, isMain: false,
        pilot: { ...pilotFrom(ledger, { charId: entry.charId, name, isMain: false }, true), lost },
        // An alt's meta carries no read time: when its standings were read is its sheet job's last success.
        standings: st ? { state: 'read', list: st.list, at: jobOk(entry, 'sheet') }
          : lost ? { state: 'lost', why: lost }
            : login.missing.includes(SCOPE.standings) ? { state: 'handOver' } : { state: 'unread' },
        tax: rates(ledger.settings).t,
        clone: detected ?? byHand ?? 'unknown',
      };
    });
    return [main, ...others];
  }, [mainId, mainName, skills, meta, settings, canStandings, known, alts.roster, alts.alts]);
}

/** Why a character's standings aren't shown, as a sentence; null when they're read. */
export function standingsWhy(c: ResearchChar): string | null {
  const s = c.standings;
  if (s.state === 'read') return null;
  if (s.state === 'unread') return c.isMain ? 'Not read yet: your standings come with the next sync.' : `Not read yet: ${c.name}’s standings come with the cloud’s next hourly read.`;
  if (s.state === 'login') return 'Log in again: this login wasn’t given the permission to read your standings.';
  if (s.state === 'handOver') return `Hand the cloud ${c.name}’s login again: it was handed over without the permission to read standings.`;
  return s.why === 'refused' ? `Not read: EVE refused ${c.name}’s login; hand it over again on the Characters page.`
    : `Not read: the cloud holds no login for ${c.name}; hand one over on the Characters page.`;
}
