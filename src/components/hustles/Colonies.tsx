import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Globe, Siren } from 'lucide-react';
import { accountCountSaid } from '../../lib/accounts';
import type { KeptColony, KeptPin } from '../../lib/colonies';
import { ENDING_SOON_HOURS } from '../../lib/colony';
import { bestsFor, colonyChain, pinKindOf, versusBest, type Chain, type ChainFlag, type ChainFlagRow } from '../../lib/colonyChain';
import { PLANETS_SCOPE, readColonies, useColonies } from '../../lib/colonyStore';
import { allColoniesTotal, charColoniesTotal, coloniesWhy, type CharColoniesTotal, type ColoniesRead, type ColonyDay } from '../../lib/colonyTotals';
import { hasScope } from '../../lib/auth';
import { ago, iskBig, units } from '../../lib/format';
import { useNow, useStable } from '../../lib/hooks';
import { monthOfOmega, omegaShare, periods, shareSaid, type Periods } from '../../lib/iskPeriods';
import { decodeRadii, type PiIndex } from '../../lib/piBundle';
import { readings } from '../../lib/piExtraction';
import { PI_READING, PI_UNCHECKED, rateFor } from '../../lib/piLearn';
import { customsLevel, fallbackGoods, listSaid, planCharOf, type PlanInput, type Sell, type Setup } from '../../lib/piPlan';
import { customsRate, type Tax } from '../../lib/planetsDoc';
import { lostSaid } from '../../lib/pilot';
import { dayCount } from '../../lib/split';
import { useData } from '../../lib/store';
import { planet as planetInfo, system } from '../../lib/universe';
import { Points } from '../Facts';
import { usePlexPrice } from '../plexPrice';
import { cssVars, ItemIcon, Notice, Th, Tip } from '../ui';
import type { IndustryChar } from './industryChars';
import { loadRadii } from './planetsBundle';
import { usePlanetMarket } from './planetsMarket';
import { useLearned, type LearnedFrom } from './planetsPlanning';
import { Outputs } from './PlanetsPlan';

/**
 * Colonies (docs/notes/planets-colonies.md, Task 16): every character's kept colonies, or one's, each worked out as its real chain
 * (colonyChain.ts: what it makes a day, every output valued at that character's own fees, what's wrong at its root) and set against
 * the planner's best for that planet (`versusBest`), with ISK a day, a week and a month (Ruling F10). Drawn from the kept documents
 * alone: the main's (Read my colonies writes it, as To do, the alerts and the cloud's hourly read do) and each alt's the cloud keeps,
 * which Planets.tsx passes down (the one file of the tab allowed to read the alt store); nothing here writes an alt's.
 */

/** A chain's flag as a chip: its short word, and whether it costs you ISK now. Its own words (`said`) are the tip. */
export const FLAG: Record<ChainFlag, { short: string; bad: boolean }> = {
  starving: { short: 'Short of input', bad: true },
  buildingUp: { short: 'Building up', bad: true },
  storageFull: { short: 'Storage full', bad: true },
  expired: { short: 'Programme ended', bad: true },
  endingSoon: { short: 'Ending soon', bad: false },
  idle: { short: 'Idle', bad: true },
};
const H = 3600e3;
type ExState = 'running' | 'endingSoon' | 'expired' | 'idle';
const STATE_C: Record<ExState, string> = { running: 'var(--pos)', endingSoon: 'var(--acc2)', expired: 'var(--neg)', idle: 'var(--neg)' };
/** No tax to go on yet (the system's security still being read). */
const NO_TAX: Tax = { rate: null, from: 'none', npc: 0, interbus: false };

/** A countdown that reads like one, from hours. */
export function left(hours: number): string {
  if (!Number.isFinite(hours)) return 'no programme';
  const h = Math.abs(hours);
  const s = h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
  return hours < 0 ? `${s} ago` : s;
}

/** Each system's name and security, read publicly (and kept, as the universe module keeps them); `failed` when ESI wouldn't say. */
function useSystems(ids: number[]): Record<number, { name: string; security: number } | 'failed'> {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const [got, setGot] = useState<Record<number, { name: string; security: number } | 'failed'>>({});
  useEffect(() => {
    let alive = true;
    for (const id of key ? key.split(',').map(Number) : []) {
      system(id).then((s) => { if (alive) setGot((g) => (g[id] && g[id] !== 'failed' ? g : { ...g, [id]: { name: s.name, security: s.security } })); },
        () => { if (alive) setGot((g) => (g[id] ? g : { ...g, [id]: 'failed' })); });
    }
    return () => { alive = false; };
  }, [key]);
  return got;
}

/** Each planet's name ("5-NZNW VII"), read publicly and kept; a planet ESI wouldn't name is said by its system. */
function usePlanetNames(ids: number[]): Record<number, string> {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const [got, setGot] = useState<Record<number, string>>({});
  useEffect(() => {
    let alive = true;
    for (const id of key ? key.split(',').map(Number) : []) planetInfo(id).then((p) => { if (alive) setGot((g) => (g[id] ? g : { ...g, [id]: p.name })); }, () => undefined);
    return () => { alive = false; };
  }, [key]);
  return got;
}

/** Each planet's radius from the radii chunk (loaded once): the planner fits a best to the planet's own size. */
function useRadii(): Record<string, number[]> | 'failed' | null {
  const [radii, setRadii] = useState<Record<string, number[]> | 'failed' | null>(null);
  useEffect(() => {
    let alive = true;
    loadRadii().then((r) => { if (alive) setRadii(r); }, () => { if (alive) setRadii('failed'); });
    return () => { alive = false; };
  }, []);
  return radii;
}

/** The goods a colony touches (its extractors' P0s, its factories' outputs and inputs): read live, as Plan reads the goods it names. */
function goodsOf(ks: readonly KeptColony[], ix: PiIndex): number[] {
  const ids = new Set<number>();
  for (const k of ks) for (const p of k.pins) {
    if (p.extractor?.product != null) ids.add(p.extractor.product);
    const s = p.schematic != null ? ix.schematics.find((x) => x.id === p.schematic) : undefined;
    if (s) { ids.add(s.out.id); for (const i of s.inputs) ids.add(i.id); }
  }
  return [...ids].sort((a, b) => a - b);
}

type OmegaCost = { price: number | null; perMonth: number; typed: boolean; at: string | undefined; now: number };

/**
 * ISK a day as a day, a week and a month, and the month against months of Omega (Ruling F10), as figures. `k`: how many accounts'
 * months (1 for a colony or a character: Omega is an account's). Not known is "–" in all three with why, never 0.
 */
function IskFigures({ per, why, omega, k = 1, accountsSaid, nothing, zeroSaid, tag }: {
  per: Periods | null; why: string | null; omega: OmegaCost; k?: number; accountsSaid?: string; nothing?: string;
  /** What a known nothing is said as under the day: "nothing made leaves the planet" unless given. */
  zeroSaid?: string; tag: string;
}) {
  const cost = monthOfOmega(omega.perMonth, omega.price);
  const share = per ? omegaShare(per.month / k, omega.perMonth, omega.price) : null;
  const dash = nothing ?? why ?? 'not known';
  const omegaTile = !per ? { v: '–', n: dash }
    : per.day === 0 ? { v: '–', n: 'nothing made to set against it' }
      : cost == null ? { v: '–', n: 'PLEX price not read yet' }
        : share == null ? { v: '–', n: 'nothing made to set against it' }
        : { v: shareSaid(share), n: k === 1 ? 'of one account’s month' : `of ${accountsSaid ?? `${k} accounts’ months`}` };
  const tip = cost == null ? 'The PLEX price hasn’t been read yet, so a month of Omega can’t be priced. It is read when this page opens; type one on Omega to use your own.'
    : `What a month of this (${per ? iskBig(per.month) : '–'}, thirty days of ${per ? iskBig(per.day) : '–'}) is of ${k === 1 ? 'one account’s month of Omega' : `${k} accounts’ months of Omega`}: ${k > 1 ? `${k} × ` : ''}${units(omega.perMonth)} PLEX × ${iskBig(omega.price)} = ${iskBig(cost * k)}.\n\n• The price is ${omega.typed ? 'the one typed on Omega' : `the Global PLEX Market’s lowest sell, read ${ago(omega.at, omega.now)}`}.${k > 1 ? '\n• Omega is an account’s, so characters on one account share one month of it: set which account each is on on the Characters page.' : ''}`;
  // A known nothing (nothing made leaves the planet) is said as that, never "0 ISK" (Task 15's wording).
  const none = per != null && per.day === 0;
  const fig = (v: number) => (none ? 'Nothing' : iskBig(v));
  const tiles: { l: string; v: string; n?: string; key: string; tip?: string }[] = [
    { l: 'ISK a day', v: per ? fig(per.day) : '–', n: none ? zeroSaid ?? 'nothing made leaves the planet' : per ? undefined : dash, key: 'day' },
    { l: 'A week', v: per ? fig(per.week) : '–', n: per && !none ? 'seven days of it' : undefined, key: 'week' },
    { l: 'A month', v: per ? fig(per.month) : '–', n: per && !none ? 'thirty days of it' : undefined, key: 'month' },
    { l: 'Of a month of Omega', v: omegaTile.v, n: omegaTile.n, key: 'omega', tip },
  ];
  return (
    <div className="mini-tiles" data-planets={tag}>
      {tiles.map((t) => (
        <div key={t.key} className="mini-tile" style={cssVars({ '--c': per && t.key !== 'omega' && per.day > 0 ? 'var(--pos)' : undefined })} data-planets={t.key}>
          <div className="tile-l">{t.l}{t.tip && <Tip text={t.tip} title={t.l} />}</div><div className="tile-v">{t.v}</div>{t.n && <div className="tile-n">{t.n}</div>}
        </div>
      ))}
    </div>
  );
}

/** Why a total isn't known, from its colonies: still being worked out, or not valued, with their reasons. */
function totalWhy(t: Pick<CharColoniesTotal, 'pending' | 'unknown' | 'whys'>): string | null {
  if (t.pending) return `Working out ${t.pending === 1 ? 'a colony' : `${t.pending} colonies`}…`;
  if (t.unknown) return `${t.unknown === 1 ? 'A colony' : `${t.unknown} colonies`} can’t be valued: ${t.whys.map((w) => w.charAt(0).toLowerCase() + w.slice(1)).join('; ')}`;
  return null;
}
/** What a total leaves out, said under its figures: before a customs tax not known, outputs not valued. */
function totalNotes(t: Pick<CharColoniesTotal, 'beforeTax' | 'unvalued'>): string[] {
  return [
    t.beforeTax ? `Before the customs tax on ${t.beforeTax === 1 ? 'a colony' : `${t.beforeTax} colonies`} whose tax isn’t known.` : null,
    t.unvalued ? `${t.unvalued} output${t.unvalued === 1 ? '' : 's'} not valued (no price read), so not counted.` : null,
  ].filter((x): x is string => !!x);
}

export function Colonies({ chars, reads, colonies, ix, pick }: {
  chars: IndustryChar[]; reads: Record<number, ColoniesRead>; colonies: Parameters<typeof useLearned>[0]; ix: PiIndex; pick: 'all' | number;
}) {
  const main = chars[0];
  const { busy, error } = useColonies();
  const canRead = hasScope(PLANETS_SCOPE);
  // Every character's kept colonies teach the rates a colony's best is planned at, as Plan's are (Task 16).
  const learned = useLearned(colonies, ix);
  const plex = usePlexPrice();
  const settings = useData().settings;
  const plexNow = useNow(60_000);
  const omega: OmegaCost = { price: plex.price, perMonth: settings.plexPerMonth, typed: settings.plexPrice > 0, at: plex.read?.at, now: plexNow };
  const shown = pick === 'all' ? chars : [chars.find((c) => c.charId === pick) ?? main];
  const [totals, setTotals] = useState<Record<number, CharColoniesTotal>>({});
  const onTotal = useMemo(() => (id: number, t: CharColoniesTotal) => setTotals((x) => (JSON.stringify(x[id]) === JSON.stringify(t) ? x : { ...x, [id]: t })), []);
  const all = pick === 'all' ? allColoniesTotal(chars.map((c) => ({
    account: c.account?.id ?? null,
    // A character not reported yet is being worked out: pending, never counted as nothing.
    total: totals[c.charId] ?? (reads[c.charId]?.state === 'read' ? { ...charColoniesTotal(true, []), pending: 1, day: null } : charColoniesTotal(false, [])),
  }))) : null;
  const mainShown = shown.some((c) => c.isMain);

  return (
    <div className="sub-box col" style={{ gap: 12 }} data-planets="colonies">
      <div className="intro-row">
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <p style={{ margin: 0 }}>Your colonies, as last read from the game, each worked out route by route.</p>
          <Points compact items={[
            { kind: 'good', lead: 'Measured', text: 'what each extracts and how its pins are routed come from the game, not assumed.' },
            { kind: 'good', lead: 'Valued', text: 'what leaves each planet, at that character’s own fees, where you sell on the Industry tab.' },
            { kind: 'info', lead: 'Against the best', text: 'each planet is set against the planner’s best for it, on the rates Plan uses.' },
          ]} />
        </div>
        {mainShown && canRead && <button type="button" className="btn primary tall" disabled={!!busy} onClick={() => void readColonies(0)}><Globe aria-hidden="true" />{reads[main.charId]?.state === 'read' ? 'Read them now' : 'Read my colonies'}</button>}
      </div>
      {busy && <div className="busy-row" role="status"><span className="spinner keep-motion" /><span className="bt">{busy}</span></div>}
      {error && <Notice kind="err">{error}</Notice>}
      {all && (
        <div className="col" style={{ gap: 8 }} data-planets="all">
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <span className="panel-title">All characters</span>
            <span className="note small" data-planets="all-read">{all.read} of {all.of} characters read{all.read < all.of ? ': the others’ colonies aren’t known, so not counted' : ''}</span>
            <Tip title="All characters" text={'What every character’s colonies make a day together.\n\n• Only the characters whose colonies were read are added up: one not read yet, or whose login can’t be read, adds nothing, said below.\n• A character whose login was refused after a read counts at the cloud’s last read of it.\n• A colony that can’t be valued leaves the total “–”, never a sum short by it.'} />
          </div>
          <IskFigures per={all.day} why={totalWhy(all)} omega={omega} k={Math.max(1, all.accounts.k)} accountsSaid={`the months of Omega of ${accountCountSaid(all.accounts)}`} tag="all-figures"
            nothing={all.read === 0 ? 'no character’s colonies read yet' : undefined} />
          {totalNotes(all).map((n) => <span key={n} className="note small">{n}</span>)}
        </div>
      )}
      {shown.map((c) => (
        <CharColonies key={c.charId} c={c} read={reads[c.charId] ?? { state: 'unread' }} ix={ix} learned={learned} omega={omega} head={pick === 'all'} onTotal={onTotal} />
      ))}
    </div>
  );
}

/** One character's colonies: its read state, its figures, and each colony's row, opening to its chain and the planner's best. */
function CharColonies({ c, read, ix, learned, omega, head, onTotal }: {
  c: IndustryChar; read: ColoniesRead; ix: PiIndex; learned: LearnedFrom; omega: OmegaCost; head: boolean; onTotal: (id: number, t: CharColoniesTotal) => void;
}) {
  const doc = read.state === 'read' ? read.value : null;
  const ks = useMemo(() => doc?.colonies ?? [], [doc]);
  const live = useMemo(() => goodsOf(ks, ix), [ks, ix]);
  // Valued at this character's own fees (its sales tax and broker fee), where the Industry tab says to sell.
  const market = usePlanetMarket(c, ix, { live });
  const systems = useSystems(ks.map((k) => k.systemId));
  const names = usePlanetNames(ks.map((k) => k.planetId));
  const radii = useRadii();
  const planetsDoc = useData().planets;
  const now = useNow(60_000);
  const cce = customsLevel(c.pilot.skills);
  const planChar = useStable(planCharOf({ charId: c.charId, name: c.name, skills: c.pilot.skills, clone: c.clone }));
  const [open, setOpen] = useState<number | null>(null);

  // Each planet's customs tax as the planner has it, once its system's security is read (null while it is: the colony waits).
  const taxes = useMemo(() => new Map(ks.map((k): [number, Tax | null] => {
    const s = systems[k.systemId];
    if (!s) return [k.planetId, null];
    if (!k.planetType) return [k.planetId, NO_TAX];
    return [k.planetId, customsRate(planetsDoc, k.systemId, s === 'failed' ? null : s.security, k.planetType, k.planetId, cce)];
  })), [ks, systems, planetsDoc, cce]);
  // Until prices can be had, the chain is still followed (its flags need none), every output said with the market's reason.
  const sell: Sell = useMemo(() => (market.ready ? market.sell : () => ({ isk: null, units: 0, where: [], why: market.said || 'prices aren’t read yet' })), [market.ready, market.sell, market.said]);
  const chains = useMemo(() => new Map(ks.map((k): [number, Chain] => [k.planetId, colonyChain(k, ix, sell, now, taxes.get(k.planetId) ?? NO_TAX, PI_READING)])), [ks, ix, sell, now, taxes]);

  // The planner's best for each planet (`bestsFor`: on Plan's rates, the colony's own level, its storage and launchpads, its own
  // factories), worked out a colony at a time in tasks of their own once its prices and size can be had, the last kept meanwhile:
  // 3 to 12 ms a colony, and never on the minute's clock (nothing it reads moves with it).
  const [bests, setBests] = useState<Map<number, { best: Setup | null; own: Setup | null }>>(new Map());
  const radiiReady = radii !== null;
  useEffect(() => {
    if (!market.ready || !radiiReady || !ks.length) return;
    let alive = true, i = 0;
    const got = new Map<number, { best: Setup | null; own: Setup | null }>();
    const rowsOf = radii && radii !== 'failed' ? new Map<number, Map<number, number>>() : null;
    const radius = (k: KeptColony) => {
      if (!rowsOf || !radii || radii === 'failed') return null;
      let m = rowsOf.get(k.systemId);
      if (!m) { const row = radii[String(k.systemId)]; rowsOf.set(k.systemId, m = new Map(row ? decodeRadii(row) : [])); }
      return m.get(k.planetId) ?? null;
    };
    const step = () => {
      if (!alive) return;
      const until = performance.now() + 8;
      while (i < ks.length && performance.now() < until) {
        const k = ks[i++];
        const tax = taxes.get(k.planetId);
        if (tax == null) continue;
        // The colony's own system and planet, never the system Plan is planning: a colony elsewhere would get no setup (the re-review).
        const input: PlanInput = {
          ix, planets: [{ planetId: k.planetId, name: names[k.planetId] ?? `Planet ${k.planetId}`, type: k.planetType, radiusKm: radius(k), tax }],
          char: planChar, others: [], heads: learned.heads, programHours: learned.programHours,
          rateOf: (t, p0) => rateFor(learned.learned, planetsDoc.systems[String(k.systemId)]?.rates[t]?.[String(p0)], t, p0),
          sell: market.sell, buy: market.buy, freight: market.freight,
        };
        got.set(k.planetId, bestsFor(k, colonyChain(k, ix, market.sell, Date.now(), tax, PI_READING), ix, input));
      }
      if (i < ks.length) setTimeout(step, 0);
      else setBests(got);
    };
    const timer = setTimeout(step, 50);
    return () => { alive = false; clearTimeout(timer); };
    // names change only the planet's label in the best's words, which the page doesn't show: not a reason to plan again.
  }, [ks, ix, market.ready, market.sell, market.buy, market.freight, radiiReady, radii, taxes, planChar, learned, planetsDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  const days: ColonyDay[] = ks.map((k) => {
    const ch = chains.get(k.planetId)!;
    const pending = taxes.get(k.planetId) == null;
    return { iskDay: pending ? null : ch.iskDay, why: pending ? null : ch.why ?? (ch.iskDay == null ? 'its figure isn’t known' : null), pending, beforeTax: ch.before.includes('tax'), unvalued: ch.unvalued };
  });
  const total = charColoniesTotal(read.state === 'read', days);
  const totalKey = JSON.stringify(total);
  useEffect(() => { onTotal(c.charId, total); }, [c.charId, totalKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const why = coloniesWhy(c, read);
  const lost = read.state === 'read' ? lostSaid(c) : null;
  const newest = ks.reduce((t, k) => Math.max(t, Date.parse(k.lastUpdate) || 0), 0);
  const readSaid = read.state !== 'read' ? null
    : c.isMain ? `As kept from the last read (Read my colonies here, To do, or the cloud’s hourly one): each colony as EVE last updated it${newest > 0 ? `, the newest ${ago(new Date(newest).toISOString(), now)}` : ''}.`
      : `As the cloud last read them${read.at != null ? `, ${ago(new Date(read.at).toISOString(), now)}` : ''}: each colony as EVE last updated it${newest > 0 ? `, the newest ${ago(new Date(newest).toISOString(), now)}` : ''}.`;
  const trouble = ks.filter((k) => chains.get(k.planetId)!.flags.some((f) => f.flag === 'expired'));
  const pname = (k: KeptColony) => names[k.planetId] ?? (systems[k.systemId] && systems[k.systemId] !== 'failed' ? `A planet in ${(systems[k.systemId] as { name: string }).name}` : `Planet ${k.planetId}`);
  const nameOf = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;

  return (
    <section className="col" style={{ gap: 10 }} data-planets={`char:${c.charId}`}>
      {head && (
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <span className="panel-title">{c.name}</span>
          {c.account && <span className="note small">{c.account.name}</span>}
        </div>
      )}
      {why ? <p className="note small" style={{ margin: 0 }} data-planets="read">{why}</p> : (
        <p className="note small" style={{ margin: 0 }} data-planets="read">{readSaid}{lost ? ` ${lost}` : ''}{!ks.length ? ' No colonies yet: find what pays on Plan, put a command centre on a planet, and this fills in.' : ''}</p>
      )}
      {ks.length > 0 && (
        <>
          <IskFigures per={total.day} why={totalWhy(total)} omega={omega} tag="char-figures" />
          {totalNotes(total).map((n) => <span key={n} className="note small">{n}</span>)}
          {!market.ready && market.said && <span className="note small" data-planets="prices">{market.said}</span>}
          {trouble.length > 0 && (
            <div className="row" style={{ padding: '10px 14px', background: 'rgba(255,107,125,.07)', border: '1px solid rgba(255,107,125,.4)', fontSize: 13, animation: 'rise .3s' }}>
              <Siren aria-hidden="true" style={{ width: 16, height: 16, color: 'var(--neg)' }} />
              <span><b>{trouble.length === 1 ? 'One colony needs you' : `${trouble.length} colonies need you`}:</b> {trouble.map(pname).join(', ')}. An ended programme earns nothing while it sits there: the figures count {trouble.length === 1 ? 'it' : 'them'} at the rate {trouble.length === 1 ? 'it' : 'they'} ran.</span>
            </div>
          )}
          <div className="tbl-scroll">
            <table className="tbl compact" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <Th left>Planet</Th><Th left>Makes</Th>
                  <Th tip={'When the extraction programme stops.\n\n• It runs for a set time, then stops dead.\n• The colony still looks normal and the factories drain what’s left, but it earns nothing until you reset the heads.'}>Programme ends</Th>
                  <Th tip={'What the colony makes a day that leaves the planet, valued: its chain followed route by route, after its customs tax and your fees.\n\n• A week is seven days of it, a month thirty.\n• Open the colony for what it makes, what’s wrong at its root and how it compares with the planner’s best.'}>ISK a day</Th>
                  <Th left>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {ks.map((k, n) => {
                  const ch = chains.get(k.planetId)!;
                  const d = days[n];
                  const sys = systems[k.systemId];
                  const exts = k.pins.filter((p) => p.extractor);
                  const soonest = exts.map((p) => exState(p, now)).filter((x) => x.ends != null).sort((a, b) => a.hours - b.hours)[0];
                  const isOpen = open === k.planetId;
                  const flags = [...new Set(ch.flags.map((f) => f.flag))];
                  return (
                    <Fragment key={k.planetId}>
                      <tr className={'hover' + (isOpen ? ' open' : '')} data-planets={`colony:${k.planetId}`}>
                        <td className="l">
                          <button type="button" className="expander" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k.planetId)}>
                            <ChevronRight className="chev" aria-hidden="true" />
                            <span><span className="name" style={{ display: 'block', fontWeight: 400 }}>{pname(k)}</span>
                              <span className="sub">{k.planetType ?? 'Unknown type'}{sys && sys !== 'failed' && ` · ${sys.name} ${sys.security.toFixed(1)}`} · command centre {k.level}</span></span>
                          </button>
                        </td>
                        <td className="l txt wrap" style={{ color: 'var(--cell)' }}>{makesSaid(ch, ix)}</td>
                        <td style={{ color: soonest ? STATE_C[soonest.state] : 'var(--neg)' }}>{soonest ? (soonest.state === 'expired' ? `ended ${left(soonest.hours)}` : left(soonest.hours)) : 'no programme'}</td>
                        <td data-planets={`colony-isk:${k.planetId}`}><ColonyIsk d={d} ch={ch} /></td>
                        <td className="l">
                          <span className="flags" style={{ justifyContent: 'flex-start' }}>
                            {flags.length ? flags.map((f) => <span key={f} className="flag plain" tabIndex={0} data-tip={ch.flags.filter((x) => x.flag === f).map((x) => flagSaid(x, ch, now)).join('\n\n')} data-tip-title={FLAG[f].short} style={cssVars({ '--c': FLAG[f].bad ? 'var(--neg)' : 'var(--acc2)' })}>{FLAG[f].short}</span>)
                              : <span className="pos" style={{ fontFamily: 'var(--f-body)' }}>Running</span>}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="detail">
                          <td colSpan={5} className="col-detail">
                            {/* The opened colony keeps to the table's visible width (styles.css `.col-unfold`, Ruling T12-3). */}
                            <div className="unfold col-unfold">
                              <ColonyDetail k={k} ch={ch} d={d} ix={ix} now={now} nameOf={nameOf} omega={omega} pname={pname(k)} bests={bests.get(k.planetId)} marketReady={market.ready} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** An extractor's programme against the clock: running, ending within a day, ended, or idle (no programme). */
function exState(p: KeptPin, now: number): { state: ExState; hours: number; ends: number | null } {
  const ends = p.expiry ? Date.parse(p.expiry) : NaN;
  if (!p.extractor || p.extractor.qty == null || !Number.isFinite(ends)) return { state: 'idle', hours: Infinity, ends: null };
  const hours = (ends - now) / H;
  return { state: hours <= 0 ? 'expired' : hours <= ENDING_SOON_HOURS ? 'endingSoon' : 'running', hours, ends };
}

const TIERS = ['P0', 'P1', 'P2', 'P3', 'P4'];
/** What a colony makes, by its top tier ("Nanites"), or what it extracts with no factory; nothing when neither. */
function makesSaid(ch: Chain, ix: PiIndex): ReactNode {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  const tier = (id: number) => TIERS.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const top = ch.makes.length ? Math.max(...ch.makes.map((m) => tier(m.id))) : -1;
  const tops = [...new Set(ch.makes.filter((m) => tier(m.id) === top).map((m) => name(m.id)))];
  if (tops.length) return listSaid(tops);
  const p0s = [...new Set(ch.extracts.map((x) => name(x.p0)))];
  return p0s.length ? `Extracts ${listSaid(p0s)}` : <span className="neg">nothing</span>;
}

/** A colony's ISK a day in its cell: the figure with its week and month, or why there is none. Never "0 ISK". */
function ColonyIsk({ d, ch }: { d: ColonyDay; ch: Chain }) {
  if (d.pending) return <span className="faint">Reading its system…</span>;
  if (d.iskDay == null) return <span className="faint" tabIndex={0} data-tip={d.why ?? undefined} data-tip-title="Not valued">–</span>;
  if (d.iskDay === 0 && !ch.why) return <span className="faint" data-planets="nothing-leaves">{nothingSaid(ch)}</span>;
  const per = periods(d.iskDay)!;
  return (
    <span className="col" style={{ gap: 2, alignItems: 'flex-end' }}>
      <b style={{ color: per.day > 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBig(per.day)}</b>
      <span className="sub" data-planets="colony-periods">{iskBig(per.week)} a week · {iskBig(per.month)} a month</span>
      {ch.flags.some((f) => f.flag === 'expired') && <span className="sub neg">at the rate it ran: its programme has ended</span>}
    </span>
  );
}
/** A known nothing: "Makes nothing" when no factory makes anything and nothing is extracted, else nothing it makes leaves the planet. */
const nothingSaid = (ch: Chain) => (ch.makes.every((m) => !(m.perDay != null && m.perDay > 0)) && !ch.outputs.length ? 'Makes nothing' : 'Makes nothing that leaves the planet');

/** A flag's own words, a full storage dated by when EVE last updated the colony (its contents are as of then). */
function flagSaid(f: ChainFlagRow, ch: Chain, now: number): string {
  return f.flag === 'storageFull' ? `${f.said}, as of EVE’s last update of the colony ${ago(ch.lastUpdate, now)}` : f.said;
}

/** An extractor's programme total by CCP's formula, as the game reads it (the in-game check, planets.md); both readings were it unset. */
function ProgramTotal({ p }: { p: KeptPin }) {
  const e = p.extractor!;
  const install = p.install ? Date.parse(p.install) : NaN, expiry = p.expiry ? Date.parse(p.expiry) : NaN;
  const r = e.qty != null && Number.isFinite(install) && Number.isFinite(expiry) ? readings({ qtyPerCycle: e.qty, cycleSeconds: e.cycle, install, expiry }) : null;
  const cycles = r && e.cycle > 0 ? Math.floor((r.hours * 3600) / e.cycle) : null;
  return (
    <div style={{ fontSize: 11.5, color: 'var(--note)', marginTop: 4, maxWidth: 320, whiteSpace: 'normal' }} data-planets={`program:${p.id}`}>
      {!r ? 'Its programme’s total isn’t known: ESI gave no install time, expiry or quantity for it.' : (
        PI_READING === 'formula' ? (
          <>Programme total: <b style={{ color: 'var(--figure)' }}>{units(r.formula.total)}</b> over {hoursSaid(r.hours)}, {units(Math.round(r.formula.perHour))} an hour on average, by CCP’s formula, as the game reads it.</>
        ) : (
          <>Programme total: <b style={{ color: 'var(--figure)' }}>{units(r.formula.total)}</b> by CCP’s formula, <b style={{ color: 'var(--figure)' }}>{units(r.perCycle.total)}</b> as {units(e.qty)} × {units(cycles)} cycles
            {PI_READING == null ? <>: {PI_UNCHECKED}.</> : <>: the game reads it as the figure a cycle.</>}</>
        )
      )}
    </div>
  );
}
/** A programme's length as the game's window says it ("3d 1h", whole hours: 47.5 h reads "1d 23h"), or in hours under a day. */
const hoursSaid = (h: number) => (h >= 24 ? `${Math.floor(h / 24)}d ${Math.floor(h) % 24}h` : `${Math.round(h * 10) / 10} h`);

const FAC: Record<string, [string, string]> = { basic: ['Basic', 'Basics'], advanced: ['Advanced', 'Advanced'], hightech: ['High-Tech', 'High-Tech'] };

/**
 * An opened colony: its extractors with their programmes, what its factories make and what it brings in, its outputs valued (a good
 * the hub doesn't price named as valued at Jita's, F11), its figures, its flags, and below them its comparison with the planner's best
 * (versusBest's words whole, never its gain alone: "(a flag above says why)" points at the flags drawn above it).
 */
function ColonyDetail({ k, ch, d, ix, now, nameOf, omega, pname, bests, marketReady }: {
  k: KeptColony; ch: Chain; d: ColonyDay; ix: PiIndex; now: number; nameOf: (id: number) => string; omega: OmegaCost; pname: string;
  bests: { best: Setup | null; own: Setup | null } | undefined; marketReady: boolean;
}) {
  const exts = k.pins.filter((p) => p.extractor);
  const stored = new Map<number, number>();
  for (const p of k.pins) {
    const kd = pinKindOf(p.typeId);
    if (kd === 'storage' || kd === 'launchpad' || kd === 'command') for (const [id, n] of p.contents) stored.set(id, (stored.get(id) ?? 0) + n);
  }
  const fell = fallbackGoods(ch.outputs);
  const hub = ch.outputs.find((o) => o.sold.fallback)?.sold.fallback?.hub;
  const vs = bests ? versusBest(ch, bests.best, ix, bests.own) : null;
  const per = d.pending || d.iskDay == null || (d.iskDay === 0 && !ch.why) ? null : periods(d.iskDay);
  return (
    <div className="col" style={{ gap: 10 }} data-planets={`detail:${k.planetId}`}>
      {exts.length > 0 && (
        <div className="row" style={{ alignItems: 'stretch' }}>
          {exts.map((p) => {
            const st = exState(p, now), e = p.extractor!, x = ch.extracts.find((y) => y.pinId === p.id);
            return (
              <div key={p.id} className="col-ex" style={{ padding: '10px 12px', background: 'rgba(2,7,12,.55)', borderLeft: `2px solid ${STATE_C[st.state]}` }}>
                <div className="lbl">{e.product != null ? nameOf(e.product) : 'Idle extractor'}</div>
                <div className="mono" style={{ fontSize: 14, color: STATE_C[st.state], marginTop: 3 }}>{x?.perHour != null ? `${units(Math.round(x.perHour))}/hour` : '–'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--note)' }}>
                  {e.heads > 0 ? `${e.heads} head${e.heads === 1 ? '' : 's'}` : 'heads not said'} · {e.qty != null ? `${units(e.qty)} a cycle` : 'no quantity a cycle'}{e.cycle > 0 && ` every ${Math.round(e.cycle / 60)} min`} · {st.state === 'expired' ? `ended ${left(st.hours)}` : st.state === 'idle' ? 'no programme' : `${left(st.hours)} left`}
                </div>
                {st.state !== 'idle' && <ProgramTotal p={p} />}
              </div>
            );
          })}
        </div>
      )}
      {(ch.makes.length > 0 || ch.imports.length > 0) && (
        <div className="col pl-lines">
          <span className="lbl">What its factories make</span>
          {ch.makes.map((m) => (
            <span key={`${m.id}:${m.facility}`} className="pl-line">{m.count} {FAC[m.facility][m.count === 1 ? 0 : 1]} on <b>{nameOf(m.id)}</b>: {m.perDay != null ? `${dayCount(m.perDay)} a day` : 'not known (the extractors’ rates aren’t)'}</span>
          ))}
          {ch.imports.map((x) => <span key={x.id} className="pl-line">Brings in {dayCount(x.perDay)} <b>{nameOf(x.id)}</b> a day, while kept stocked</span>)}
        </div>
      )}
      {ch.outputs.length > 0 && <Outputs outputs={ch.outputs} name={nameOf} label="What leaves it, valued" />}
      {marketReady && fell.length > 0 && <span className="note small" data-planets="fallback-goods">{`Valued at Jita’s for want of a ${hub} figure: ${listSaid(fell.map(nameOf))} (each line says why).`}</span>}
      {ch.taxDay != null && ch.taxDay > 0 && <span className="note small">Customs: {iskBig(ch.taxDay)} a day, taken off the figures.</span>}
      {ch.before.includes('tax') && ch.iskDay != null && <span className="note small">Before the customs tax, which isn’t known here: each 1% costs {iskBig(ch.perPct)} a day.</span>}
      {!d.pending && (per ? <IskFigures per={per} why={null} omega={omega} tag="colony-figures" /> : (
        <span className="note small" data-planets="colony-why">{d.iskDay == null ? `Not valued: ${(d.why ?? 'its figure isn’t known').replace(/^./, (x) => x.toLowerCase())}.` : `${nothingSaid(ch)}.`}</span>
      ))}
      {ch.flags.length > 0 && (
        <div data-planets={`flags:${k.planetId}`}>
          <Points compact items={ch.flags.map((f) => ({ kind: FLAG[f.flag].bad ? 'warn' as const : 'info' as const, lead: FLAG[f.flag].short, text: flagSaid(f, ch, now) }))} />
        </div>
      )}
      {/* Below the flags, on purpose: its "(a flag above says why)" points at them (Rulings T15b-3 to T15b-5). Its words whole, never
          its gain alone; nothing at all when it has nothing to say, which is both "already the best" and a best that doesn't fit at the
          colony's level (Ruling T15-1: never a suggestion to train). */}
      {(!marketReady || !vs || vs.said) && (
        <span className="note small" data-planets={`versus:${k.planetId}`}>
          {!marketReady ? 'Set against the planner’s best once its prices are read.' : !vs ? 'Setting it against the planner’s best for this planet…' : `${pname}: ${vs.said}.`}
        </span>
      )}
      {stored.size > 0 && (
        <div>
          <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>Waiting to be collected, as of EVE’s last update {ago(k.lastUpdate, now)}</span>
          <div className="bonuses">
            {[...stored].slice(0, 8).map(([id, n]) => <span key={id} className="bonus drop"><ItemIcon id={id} size="sm" />{nameOf(id)}<b style={{ color: 'var(--figure)' }}>{units(n)}</b></span>)}
            {stored.size > 8 && <span className="bonus drop">and {stored.size - 8} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}
