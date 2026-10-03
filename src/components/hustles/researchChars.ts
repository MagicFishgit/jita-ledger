import { useMemo } from 'react';
import { altLedger } from '../../lib/altLedger';
import { askedScopes, hasScope } from '../../lib/auth';
import { JITA_44, SCOPE, SCOPES } from '../../lib/config';
import { rates } from '../../lib/fees';
import { useAuth } from '../../lib/hooks';
import { type Pilot, pilotFrom } from '../../lib/pilot';
import type { ResearchRow, StandingRow } from '../../lib/research';
import type { OwnOrder } from '../../lib/researchTrack';
import { emptyAlt, jobOk, loginState, type AltSaved, type RosterEntry } from '../../lib/roster';
import { useData } from '../../lib/store';
import type { Order } from '../../lib/types';

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

/**
 * Where a character's R&D research stands, as standings do: `read` (an empty list is read, no agent running), `unread`,
 * `login` (the main's login lacks the research permission), `handOver` (an alt's login handed over without it), `lost`.
 * `at` is when it was read: the main's by the sync, an alt's by the cloud's sheet (its `lastOk`).
 */
export type ResearchState =
  | { state: 'read'; agents: ResearchRow[]; at: number | null }
  | { state: 'unread' } | { state: 'login' } | { state: 'handOver' } | { state: 'lost'; why: 'refused' | 'none' };

export type ResearchChar = {
  charId: number; name: string; isMain: boolean; pilot: Pilot; standings: StandingsState; research: ResearchState;
  /** Its own sales tax and broker fee, for what its datacores fetch sold into bids and listed. */
  tax: number; broker: number;
  /**
   * Its open orders in Jita 4-4 (the main's from the sync, an alt's from the cloud's read), so what datacores fetch is
   * worked out on everyone else's orders: selling into a bid of your own is trading with yourself (market-reading.md).
   */
  own: OwnOrder[];
  /** When EVE last offered a research mission (`meta.researchMissionAt`): the main's only, since an alt's notifications aren't read. */
  missionAt: string | null;
  /**
   * As read from its skills, or set by hand (an alt on the Characters page; the main's Omega in Settings, since Alpha is
   * the setting's default and so says nothing). `unknown` is never called Alpha, and says so.
   */
  clone: 'alpha' | 'omega' | 'unknown';
};

/** What the hook needs of the alt store (structurally, so this file needn't import it). */
export type ResearchAlts = { roster: RosterEntry[]; alts: Record<number, AltSaved> };

const NO_ALT = emptyAlt();

/** A read time as a number, or null when there's none or it can't be read: never NaN, which a date can't be made from. */
const timeOf = (iso: string | undefined): number | null => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };

/** A character's open Jita 4-4 orders, as the Research tab weighs them. */
const openInJita = (orders: Record<string, Order>): ResearchChar['own'] => Object.values(orders)
  .filter((o) => o.state === 'open' && o.locationId === JITA_44)
  .map((o) => ({ typeId: o.typeId, isBuy: o.isBuy, price: o.price, volume: o.volumeRemain }));

export function useResearchChars(alts: ResearchAlts): ResearchChar[] {
  const d = useData();
  const auth = useAuth();
  const mainId = auth?.characterId ?? 0;
  const mainName = auth?.characterName ?? 'You';
  const { skills, meta, settings, orders, chars: known } = d;
  const canStandings = hasScope(SCOPE.standings);
  const canResearch = hasScope(SCOPE.agentsResearch);
  return useMemo(() => {
    const main: ResearchChar = {
      charId: mainId, name: mainName, isMain: true,
      pilot: pilotFrom({ skills, meta, settings }, { charId: mainId, name: mainName, isMain: true }, false),
      standings: meta.standings ? { state: 'read', list: meta.standings.list, at: timeOf(meta.standings.at) }
        : canStandings ? { state: 'unread' } : { state: 'login' },
      research: meta.research ? { state: 'read', agents: meta.research.agents, at: timeOf(meta.research.at) }
        : canResearch ? { state: 'unread' } : { state: 'login' },
      tax: rates(settings).t, broker: rates(settings).f,
      own: openInJita(orders),
      missionAt: meta.researchMissionAt ?? null,
      clone: meta.cloneDetected ?? (settings.clone === 'omega' ? 'omega' : 'unknown'),
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
      const rs = ledger.meta.research;
      const detected = (ledger.meta as { cloneDetected?: 'alpha' | 'omega' }).cloneDetected;
      return {
        charId: entry.charId, name, isMain: false,
        pilot: { ...pilotFrom(ledger, { charId: entry.charId, name, isMain: false }, true), lost },
        // An alt's meta carries no read time: when its standings were read is its sheet job's last success.
        standings: st ? { state: 'read', list: st.list, at: jobOk(entry, 'sheet') }
          : lost ? { state: 'lost', why: lost }
            : login.missing.includes(SCOPE.standings) ? { state: 'handOver' } : { state: 'unread' },
        // Likewise its research: read by the cloud's sheet, only once its login carries the permission.
        research: rs ? { state: 'read', agents: rs.agents, at: jobOk(entry, 'sheet') }
          : lost ? { state: 'lost', why: lost }
            : login.missing.includes(SCOPE.agentsResearch) ? { state: 'handOver' } : { state: 'unread' },
        tax: rates(ledger.settings).t, broker: rates(ledger.settings).f,
        own: openInJita(ledger.orders),
        missionAt: null,
        clone: detected ?? byHand ?? 'unknown',
      };
    });
    return [main, ...others];
  }, [mainId, mainName, skills, meta, settings, orders, canStandings, canResearch, known, alts.roster, alts.alts]);
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

/**
 * Why a character's research isn't shown, as a sentence; null when it's read. Never "No agents running" for a read that
 * didn't happen: the main's login without the permission says to log in again, an alt's to hand its login over again.
 */
export function researchWhy(c: ResearchChar): string | null {
  const s = c.research;
  if (s.state === 'read') return null;
  if (s.state === 'unread') return c.isMain ? 'Not read yet: your research comes with the next sync.' : `Not read yet: ${c.name}’s research comes with the cloud’s next hourly read.`;
  if (s.state === 'login') return 'Log in again to read your research: this login wasn’t given EVE’s permission to read R&D agents.';
  if (s.state === 'handOver') return `Hand the cloud ${c.name}’s login again: it was handed over without the permission to read R&D agents.`;
  return s.why === 'refused' ? `Not read: EVE refused ${c.name}’s login; hand it over again on the Characters page.`
    : `Not read: the cloud holds no login for ${c.name}; hand one over on the Characters page.`;
}
