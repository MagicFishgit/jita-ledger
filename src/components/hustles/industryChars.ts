import { useMemo } from 'react';
import { accountClones, accountRef, cloneMembers, fallbackClone, type AccountRef, type CharClone } from '../../lib/accounts';
import { ratesAtStandings } from '../../lib/altFees';
import { altLedger } from '../../lib/altLedger';
import { askedScopes, hasScope } from '../../lib/auth';
import { SCOPE, SCOPES } from '../../lib/config';
import { rates } from '../../lib/fees';
import { useAuth } from '../../lib/hooks';
import type { Clone } from '../../lib/industry';
import type { OwnedBlueprint } from '../../lib/blueprints';
import { minedLately } from '../../lib/industryRank';
import type { Read } from '../../lib/industryOwned';
import { ownedOf, type JobRecord } from '../../lib/industryTrack';
import { pilotFrom, unreadNote, type Pilot } from '../../lib/pilot';
import type { OwnOrder } from '../../lib/researchTrack';
import { emptyAlt, jobOk, loginState, type AltSaved, type RosterEntry } from '../../lib/roster';
import { useData } from '../../lib/store';
import type { JournalEntry, Order, Tx } from '../../lib/types';
import type { HubOrder } from '../../lib/homeMarket';
import { openInJita } from './researchChars';

const openAnywhere = (orders: Record<string, { state: string; locationId: number; isBuy: boolean; price: number; volumeRemain: number; typeId: number; issued: string }>): HubOrder[] => Object.values(orders)
  .filter((o) => o.state === 'open').map((o) => ({ locationId: o.locationId, typeId: o.typeId, isBuy: o.isBuy, price: o.price, volume: o.volumeRemain, issued: o.issued }));

/**
 * Every character the Industry tab can be shown for: the main from the store, each alt from its pulled copy (altLedger),
 * with its pilot (skills, queue, attributes), clone, Jita fees at its read standings, held stock by place, purchases and
 * whether it mines. Industry.tsx passes the alt store's value in (the one file of the tab allowed to import it,
 * docs/notes/characters.md); this file writes nothing.
 */
export type IndustryChar = {
  charId: number; name: string; isMain: boolean; pilot: Pilot;
  /**
   * As read from its skills, else its account's (accounts.ts: Omega and Alpha belong to an account), else set by hand earlier;
   * `unknown` is never called Alpha. `cloneFrom` says which.
   */
  clone: Clone;
  cloneFrom: CharClone['from'];
  /** The account it's on, as the Characters page sets it; null when none is set. */
  account: AccountRef | null;
  /** Its Jita 4-4 broker fee and sales tax: the main's from its settings; an alt's at its read standings (none read: no standing). */
  broker: number; tax: number;
  /** Every order it holds, any station, and its journal: a home hub's broker fee is measured from its own orders there (hubFeeRate). The main's from its sync, an alt's from the cloud's hourly read. */
  orders: Order[]; journal: Record<string, JournalEntry>;
  /** An alt's standings read (the cloud's hourly sheet); always true for the main, whose fee follows its settings. */
  standingsRead: boolean;
  /**
   * Whether its fee can be shown: the main's when it types its own broker fee and sales tax (Settings' override), or its
   * settings aren't filled from the character, or its skills are read (the fee then follows them); an alt's when its skills
   * are read (altFees.ts works its fee out from them). Otherwise the fee would be that of an untrained character.
   */
  feeKnown: boolean;
  /** Loose items per station or structure as last read, and when: the main's by its sync, an alt's by the cloud's hourly read. Null when not read. */
  stock: { byLocation: Record<number, Record<number, number>>; at: string } | null;
  /** Its own purchases, for what held materials cost it (heldCost). */
  buys: Tx[];
  /** Mining records in the last 30 days: "mined" is picked only for a builder who mines (industryRank.ts). */
  mines: boolean;
  /** Its open Jita 4-4 orders, so a sale is worked out on everyone else's book. */
  own: OwnOrder[];
  /** Every character's open orders anywhere (the main's and each alt's, the same list on every character), so a hub's own read is priced on everyone else's orders. */
  hubOrders: HubOrder[];
  /** Its blueprints as last read: the main's by its sync (`meta.blueprintsAt`), an alt's by the cloud's sheet (its `lastOk`). */
  blueprints: Read<OwnedBlueprint[]>;
  /** Its industry jobs, every status kept: the main's by its sync and the cloud's archive, an alt's by the sheet. */
  jobs: Read<JobRecord[]>;
  /** What its blueprints doc names: the containers, ships and structures they sit in (`''`: no name). */
  places: Record<string, string>;
  /** Which of those places are its own containers or ships (the doc's `items`): asset IDs are 13 digits like structures', so the size can't say. */
  placeItems: number[];
  /** Structures its waiting jobs sit in, named by its sync (`meta.industry.places`): the main's only; an alt's are none. */
  jobPlaces: Record<string, string>;
};
export type IndustryAlts = { roster: RosterEntry[]; alts: Record<number, AltSaved> };

const NO_ALT = emptyAlt();
const timeOf = (iso: string | undefined): number | null => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };
/** Skills read: a ledger's skills doc is absent (a main before its first sync) or empty (an alt's, filled in by altLedger) until they are. */
const hasSkills = (s: Record<number, number> | undefined): boolean => !!s && Object.keys(s).length > 0;

export function useIndustryChars(alts: IndustryAlts): IndustryChar[] {
  const d = useData();
  const auth = useAuth();
  const mainId = auth?.characterId ?? 0;
  const mainName = auth?.characterName ?? 'You';
  const { skills, meta, settings, orders, journal, txs, stock, mining, chars: known, jobs, blueprints, accounts } = d;
  // The hour, so a minute's re-render keeps the same characters (minedLately's 30 days don't need finer).
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  return useMemo(() => {
    const r = rates(settings);
    // Each character's clone state: its own skills', else its account's, else one set by hand earlier (Settings' Omega for the
    // main, since Alpha is the setting's default and so says nothing). The one rule every character reader shares.
    const clones = accountClones(accounts, cloneMembers({ charId: mainId, meta, byHand: settings.clone === 'omega' ? 'omega' : undefined }, alts.roster, alts.alts, known)).chars;
    const mc = clones.get(mainId);
    const main: IndustryChar = {
      charId: mainId, name: mainName, isMain: true,
      // The main's pilot reads the clone setting; only its account's state, when its own skills can't tell, is put in its place.
      pilot: pilotFrom({ skills, meta, settings: mc?.from === 'account' ? { ...settings, clone: mc.clone as 'alpha' | 'omega' } : settings }, { charId: mainId, name: mainName, isMain: true }, false),
      clone: mc?.clone ?? 'unknown', cloneFrom: mc?.from ?? null, account: accountRef(accounts, mainId, mainId),
      broker: r.f, tax: r.t, standingsRead: true,
      feeKnown: settings.override || !settings.fromCharacter || hasSkills(skills),
      stock: stock?.byLocation ? { byLocation: stock.byLocation, at: stock.at } : null,
      buys: Object.values(txs).filter((t) => t.isBuy),
      mines: minedLately(mining, mainId, hour),
      own: openInJita(orders), hubOrders: [], orders: Object.values(orders), journal,
      blueprints: blueprints ? { state: 'read', value: ownedOf(blueprints), at: timeOf(meta.blueprintsAt) } : hasScope(SCOPE.blueprints) ? { state: 'unread' } : { state: 'login' },
      // Read once a stage-2 read has happened (meta.jobsRead, correction 3) or a record came from the cloud's archive. A
      // stage-1 meta.industry isn't one: it listed only the jobs to deliver, and would read here as "0 in use".
      jobs: meta.jobsRead || Object.keys(jobs).length ? { state: 'read', value: Object.values(jobs), at: timeOf(meta.industry?.at) } : hasScope(SCOPE.industry) ? { state: 'unread' } : { state: 'login' },
      places: blueprints?.names ?? {},
      placeItems: blueprints?.items ?? [],
      jobPlaces: meta.industry?.places ?? {},
    };
    const wanted = [...SCOPES, ...askedScopes()];
    const altOrders: HubOrder[] = [];
    const others = alts.roster.map((entry): IndustryChar => {
      const saved = alts.alts[entry.charId] ?? NO_ALT;
      const cc = clones.get(entry.charId);
      const ledger = altLedger(saved, fallbackClone(cc));
      altOrders.push(...openAnywhere(ledger.orders));
      const name = entry.name ?? known[String(entry.charId)]?.name ?? `Character ${entry.charId}`;
      const login = loginState(entry, wanted);
      const lost = login.state === 'working' ? undefined : login.state;
      const list = ledger.meta.standings?.list;
      const ra = ratesAtStandings(ledger.settings, list);
      const st = ledger.stock;
      // Read data wins over a lost login: it stays shown, said as the cloud's last read (lostSaid).
      const sheetAt = jobOk(entry, 'sheet');
      const bpd = ledger.blueprints;
      const altBps: Read<OwnedBlueprint[]> = bpd ? { state: 'read', value: ownedOf(bpd), at: sheetAt }
        : lost ? { state: 'lost', why: lost } : login.missing.includes(SCOPE.blueprints) ? { state: 'handOver' } : { state: 'unread' };
      const altJobs: Read<JobRecord[]> = ledger.meta.jobsRead || Object.keys(ledger.jobs).length ? { state: 'read', value: Object.values(ledger.jobs), at: sheetAt }
        : lost ? { state: 'lost', why: lost } : login.missing.includes(SCOPE.industry) ? { state: 'handOver' } : { state: 'unread' };
      return {
        charId: entry.charId, name, isMain: false,
        pilot: { ...pilotFrom(ledger, { charId: entry.charId, name, isMain: false }, true), lost },
        clone: cc?.clone ?? 'unknown', cloneFrom: cc?.from ?? null, account: accountRef(accounts, entry.charId, mainId),
        broker: ra.f, tax: ra.t, standingsRead: !!list, feeKnown: hasSkills(ledger.skills),
        stock: st?.byLocation ? { byLocation: st.byLocation, at: st.at } : null,
        buys: Object.values(ledger.txs).filter((t) => t.isBuy),
        mines: minedLately(ledger.mining, entry.charId, hour),
        own: openInJita(ledger.orders), hubOrders: [], orders: Object.values(ledger.orders), journal: ledger.journal,
        blueprints: altBps, jobs: altJobs, places: bpd?.names ?? {}, placeItems: bpd?.items ?? [], jobPlaces: {},
      };
    });
    const hubOrders = [...openAnywhere(orders), ...altOrders];
    return [main, ...others].map((c) => ({ ...c, hubOrders }));
  }, [mainId, mainName, skills, meta, settings, orders, journal, txs, stock, mining, known, jobs, blueprints, accounts, alts.roster, alts.alts, hour]);
}

/** Why a character's skills aren't shown, as a sentence: the main's next sync, an alt's first read, or its login to hand over again. */
export const skillsWhy = (c: IndustryChar): string => (c.isMain ? 'Your skills come with the next sync.' : `${unreadNote(c.pilot)}.`);
