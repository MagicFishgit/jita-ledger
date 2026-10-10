import { useMemo } from 'react';
import { ratesAtStandings } from '../../lib/altFees';
import { altLedger } from '../../lib/altLedger';
import { askedScopes } from '../../lib/auth';
import { SCOPES } from '../../lib/config';
import { rates } from '../../lib/fees';
import { useAuth } from '../../lib/hooks';
import type { Clone } from '../../lib/industry';
import { minedLately } from '../../lib/industryRank';
import { pilotFrom, unreadNote, type Pilot } from '../../lib/pilot';
import type { OwnOrder } from '../../lib/researchTrack';
import { emptyAlt, loginState, type AltSaved, type RosterEntry } from '../../lib/roster';
import { useData } from '../../lib/store';
import type { Tx } from '../../lib/types';
import { openInJita } from './researchChars';

/**
 * Every character the Industry tab can be shown for: the main from the store, each alt from its pulled copy (altLedger),
 * with its pilot (skills, queue, attributes), clone, Jita fees at its read standings, held stock by place, purchases and
 * whether it mines. Industry.tsx passes the alt store's value in (the one file of the tab allowed to import it,
 * docs/notes/characters.md); this file writes nothing.
 */
export type IndustryChar = {
  charId: number; name: string; isMain: boolean; pilot: Pilot;
  /** As read from its skills, or set by hand; `unknown` is never called Alpha. */
  clone: Clone;
  /** Its Jita 4-4 broker fee and sales tax: the main's from its settings; an alt's at its read standings (none read: no standing). */
  broker: number; tax: number;
  /** An alt's standings read (the cloud's hourly sheet); always true for the main, whose fee follows its settings. */
  standingsRead: boolean;
  /** Loose items per station or structure as last read, and when: the main's by its sync, an alt's by the cloud's hourly read. Null when not read. */
  stock: { byLocation: Record<number, Record<number, number>>; at: string } | null;
  /** Its own purchases, for what held materials cost it (heldCost). */
  buys: Tx[];
  /** Mining records in the last 30 days: "mined" is picked only for a builder who mines (industryRank.ts). */
  mines: boolean;
  /** Its open Jita 4-4 orders, so a sale is worked out on everyone else's book. */
  own: OwnOrder[];
};
export type IndustryAlts = { roster: RosterEntry[]; alts: Record<number, AltSaved> };

const NO_ALT = emptyAlt();

export function useIndustryChars(alts: IndustryAlts): IndustryChar[] {
  const d = useData();
  const auth = useAuth();
  const mainId = auth?.characterId ?? 0;
  const mainName = auth?.characterName ?? 'You';
  const { skills, meta, settings, orders, txs, stock, mining, chars: known } = d;
  // The hour, so a minute's re-render keeps the same characters (minedLately's 30 days don't need finer).
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  return useMemo(() => {
    const r = rates(settings);
    const main: IndustryChar = {
      charId: mainId, name: mainName, isMain: true,
      pilot: pilotFrom({ skills, meta, settings }, { charId: mainId, name: mainName, isMain: true }, false),
      clone: meta.cloneDetected ?? (settings.clone === 'omega' ? 'omega' : 'unknown'),
      broker: r.f, tax: r.t, standingsRead: true,
      stock: stock?.byLocation ? { byLocation: stock.byLocation, at: stock.at } : null,
      buys: Object.values(txs).filter((t) => t.isBuy),
      mines: minedLately(mining, mainId, hour),
      own: openInJita(orders),
    };
    const wanted = [...SCOPES, ...askedScopes()];
    const others = alts.roster.map((entry): IndustryChar => {
      const saved = alts.alts[entry.charId] ?? NO_ALT;
      const byHand = known[String(entry.charId)]?.clone;
      const ledger = altLedger(saved, byHand);
      const name = entry.name ?? known[String(entry.charId)]?.name ?? `Character ${entry.charId}`;
      const login = loginState(entry, wanted);
      const lost = login.state === 'working' ? undefined : login.state;
      const list = ledger.meta.standings?.list;
      const ra = ratesAtStandings(ledger.settings, list);
      const st = ledger.stock;
      return {
        charId: entry.charId, name, isMain: false,
        pilot: { ...pilotFrom(ledger, { charId: entry.charId, name, isMain: false }, true), lost },
        clone: (ledger.meta as { cloneDetected?: 'alpha' | 'omega' }).cloneDetected ?? byHand ?? 'unknown',
        broker: ra.f, tax: ra.t, standingsRead: !!list,
        stock: st?.byLocation ? { byLocation: st.byLocation, at: st.at } : null,
        buys: Object.values(ledger.txs).filter((t) => t.isBuy),
        mines: minedLately(ledger.mining, entry.charId, hour),
        own: openInJita(ledger.orders),
      };
    });
    return [main, ...others];
  }, [mainId, mainName, skills, meta, settings, orders, txs, stock, mining, known, alts.roster, alts.alts, hour]);
}

/** Why a character's skills aren't shown, as a sentence: the main's next sync, an alt's first read, or its login to hand over again. */
export const skillsWhy = (c: IndustryChar): string => (c.isMain ? 'Your skills come with the next sync.' : `${unreadNote(c.pilot)}.`);
