import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, ExternalLink, Landmark, ListOrdered, MapPin, Pickaxe } from 'lucide-react';
import type { ColoniesDoc } from '../../lib/colonies';
import { iskBig, units } from '../../lib/format';
import { secBand } from '../../lib/industry';
import { secText } from '../../lib/industrySites';
import type { Graph } from '../../lib/jumps';
import { resolveIds } from '../../lib/market';
import { PI_LINKS, setupSteps, type PlanetType } from '../../lib/pi';
import type { Facility, PiIndex } from '../../lib/piBundle';
import { learnedRates, PI_READING, rateFor, type Learned } from '../../lib/piLearn';
import {
  ALPHA_NO_PI, charWhy, customsLevel, planBought, planChain, planCharOf, planFeed, planSingle, rankSetups, RAN_OUT,
  type PlanChar, type PlanInput, type Role, type Setup, type SetupKind,
} from '../../lib/piPlan';
import { BRAVE_TAX_SOURCE, customsRate, sanitizePlanets, type SystemPrefs, type Tax, type TypedRate } from '../../lib/planetsDoc';
import { update, useData } from '../../lib/store';
import { system as systemInfo } from '../../lib/universe';
import { Points } from '../Facts';
import { Check, NumChip, Seg, Tiles, Tip } from '../ui';
import type { IndustryChar } from './industryChars';
import { useHomeHubs, useIndustryDoc } from './industryMarket';
import { usePlanetMarket, useSystemPlanets, type SystemPlanet } from './planetsMarket';
import { useMainSystem } from './rightNow';

/**
 * Plan: give it a system and every way of setting its planets up is ranked by ISK a day for the character shown, with the upkeep
 * beside it, which planet does what, and every output valued (spec "Stage 1: plan a system"). The inputs (customs tax per planet
 * type with a planet's own, extraction rates learned or typed, the program length) are kept in the synced `planets` doc; where it
 * sells is the `industry` doc's, as Industry's finder sells. The planner (piPlan.ts) runs on a timer once the inputs settle, the
 * last ranking shown meanwhile, first on the morning's books and then again on the live books of the goods that ranking names.
 */

const KIND: Record<SetupKind, { label: string; tip: string }> = {
  p1: { label: 'P0 → P1 on each planet', tip: 'Each planet extracts two of its P0s and refines them into P1 in Basic factories, and exports the P1.\n\n• The pair on each planet is the one that pays most here.\n• The simplest setup: no Advanced factories, nothing carried between planets.' },
  p2: { label: 'P0 → P2 on each planet', tip: 'Each planet makes the best P2 it can make alone: two extractors, their Basic factories, and Advanced ones making the P2.\n\n• The layout is 2 Advanced + 4 Basic with more heads, or 3 + 6 with fewer: whichever your extraction rate fills.\n• Less management time than a factory planet: each planet is its own island.' },
  feed: { label: 'Planets feeding a factory planet', tip: 'Some planets make P1 (or a P2 alone) and ship it to one factory planet in the system that makes a P2 or P3 from it.\n\n• Includes the P2s no single planet can make.\n• Each feeder pays export tax, the factory half that to import, and the factory is sized to what it is fed.' },
  bought: { label: 'A factory planet on bought inputs', tip: 'Factory planets with no extractors: they buy P1, P2 or P3 at the market and make P2, P3 or P4.\n\n• P4 only on Barren and Temperate planets, in High-Tech Production Plants.\n• Each pays import tax on what it buys and export tax on what it sells, and its launchpad is restocked as it empties.' },
  chain: { label: 'A chain across characters', tip: 'A P4 (or a P3) whose planets are more than one character has: each character in it extracts or builds a part.\n\n• Ranked by ISK a day per character in it, so it compares with one character’s setups like for like.\n• Uses characters whose skills are read, in roster order from the one shown.' },
};
const FAC: Record<Facility, [string, string]> = {
  basic: ['Basic Industry Facility', 'Basic Industry Facilities'],
  advanced: ['Advanced Industry Facility', 'Advanced Industry Facilities'],
  hightech: ['High-Tech Production Plant', 'High-Tech Production Plants'],
};
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
/** "2%", "2.5%": a customs rate as a player types it. */
const pctSaid = (x: number) => `${+(x * 100).toFixed(2)}%`;
const hoursSaid = (h: number) => (h % 24 === 0 ? `${h / 24}-day` : `${+h.toFixed(1)}-hour`);
const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** The spec's default program length when the character has none of its own: 3 days. */
const DEFAULT_PROGRAM_HOURS = 72;
/** How long the inputs must stay still before the setups are worked out again (the planner takes up to most of a second). */
const SETTLE_MS = 350;
const NO_SYS: SystemPrefs = { tax: {}, planetTax: {}, interbus: {}, notBrave: false, rates: {} };

/** A type's own customs tax (no planet's override), as `customsRate` gives it: planet ID −1 is never a planet. */
const typeTax = (doc: ReturnType<typeof useData>['planets'], systemId: number, sec: number, t: PlanetType, cce: number | null) => customsRate(doc, systemId, sec, t, -1, cce);

/** A customs tax in words: its rate and where it comes from, or why it isn't known. */
function taxSaid(tax: Tax, t: PlanetType | null): string {
  if (tax.interbus) return tax.rate == null ? 'InterBus’s office: its rate is unverified; type it' : `${pctSaid(tax.rate)} · InterBus’s office, unverified`;
  if (tax.rate == null) return 'not known: ranked before it';
  const r = pctSaid(tax.rate);
  if (tax.npc > 0) return `${r} · the owner’s rate plus the NPC part, ${pctSaid(tax.npc)}`;
  return tax.from === 'brave' ? `${r} · Brave’s wiki, 17 Jul 2023` : tax.from === 'planet' ? `${r} · typed for this planet` : `${r} · typed for ${t ?? 'this type'}`;
}

type Planned = { setups: Setup[] | null; working: boolean };
/**
 * The five setups for an input, worked out on a timer once the input has stayed the same `SETTLE_MS`, one setup a turn of the
 * event loop so the page keeps drawing between them, and ranked. The last ranking stays (marked as being worked out again) until
 * the new one lands; a different `scope` (another system) drops it, since its planets are another system's.
 */
function usePlanned(input: PlanInput | null, scope: number | null): Planned {
  const [st, setSt] = useState<{ setups: Setup[] | null; for: PlanInput | null; scope: number | null }>({ setups: null, for: null, scope: null });
  useEffect(() => {
    if (!input) return;
    let alive = true;
    const steps: ((i: PlanInput) => Setup)[] = [(i) => planSingle(i, 'p1'), (i) => planSingle(i, 'p2'), planFeed, planBought, planChain];
    const done: Setup[] = [];
    let timer = setTimeout(function next() {
      if (!alive) return;
      done.push(steps[done.length](input));
      if (done.length < steps.length) timer = setTimeout(next, 0);
      else setSt({ setups: rankSetups(done), for: input, scope });
    }, SETTLE_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [input, scope]);
  const mine = st.scope === scope ? st.setups : null;
  return { setups: input ? mine : null, working: !!input && st.for !== input };
}

/** The goods a ranking names (what its setups sell and buy), sorted, so the same goods keep one array. */
function goodsOf(setups: Setup[] | null): string {
  if (!setups) return '';
  const ids = new Set<number>();
  for (const s of setups) { for (const o of s.outputs) ids.add(o.id); for (const i of s.inputs) ids.add(i.id); }
  return [...ids].sort((a, b) => a - b).join(',');
}

export function PlanetsPlan({ c, chars, colonies, ix, graph, systemId, onSystem, mainName }: {
  c: IndustryChar; chars: IndustryChar[]; colonies: Record<number, ColoniesDoc | undefined>; ix: PiIndex; graph: Graph;
  systemId: number | null; onSystem: (id: number | null) => void; mainName: string;
}) {
  const d = useData();
  const doc = d.planets;
  const planChar = useMemo(() => planCharOf({ charId: c.charId, name: c.name, skills: c.pilot.skills, clone: c.clone }), [c]);
  const others = useMemo(() => chars.filter((x) => x.charId !== c.charId).map((x) => planCharOf({ charId: x.charId, name: x.name, skills: x.pilot.skills, clone: x.clone })), [chars, c.charId]);
  const cce = customsLevel(c.pilot.skills);
  const sys = useSystemPlanets(systemId, ix, cce);
  const value = sys.state === 'ok' ? sys.value : null;

  // Learned from the shown character's own extractors (the main's kept colonies; an alt's once the cloud keeps them).
  const learned = useMemo(() => learnedRates(colonies[c.charId] ? [colonies[c.charId]!] : [], ix, PI_READING), [colonies, c.charId, ix]);
  const ownHours = useMemo(() => Object.values(learned).flatMap((byP0) => Object.values(byP0 ?? {}).map((l) => l.programHours)), [learned]);
  const defaultHours = ownHours.length ? median(ownHours) : DEFAULT_PROGRAM_HOURS;
  const programHours = doc.programHours ?? defaultHours;
  const prefs = (systemId != null ? doc.systems[String(systemId)] : undefined) ?? NO_SYS;
  const rateOf = useMemo(() => (t: PlanetType, p0: number) => rateFor(learned, prefs.rates[t]?.[String(p0)], t, p0), [learned, prefs.rates]);

  const morning = usePlanetMarket(c, ix);
  const planets = value?.planets ?? null;
  const inputM = useMemo((): PlanInput | null => (planets && morning.ready
    ? { ix, planets, char: planChar, others, rateOf, sell: morning.sell, buy: morning.buy, programHours, freight: morning.freight } : null),
  [ix, planets, planChar, others, rateOf, morning.ready, morning.sell, morning.buy, morning.freight, programHours]);
  const first = usePlanned(inputM, systemId);
  // The goods to read live come from the ranking on the morning's books, never the live one: each live re-rank could name more.
  const goodsKey = goodsOf(first.setups);
  const live = useMemo(() => (goodsKey ? goodsKey.split(',').map(Number) : []), [goodsKey]);
  const market = usePlanetMarket(c, ix, { live });
  const inputL = useMemo((): PlanInput | null => (inputM && market.live && market.ready ? { ...inputM, sell: market.sell, buy: market.buy, freight: market.freight } : null),
    [inputM, market.live, market.ready, market.sell, market.buy, market.freight]);
  const second = usePlanned(inputL, systemId);
  const setups = (inputL && second.setups) ? second.setups : first.setups;
  const working = first.working || (!!inputL && second.working);

  const name = (id: number) => ix.byId.get(id)?.name ?? `type ${id}`;
  const blockedWhy = charWhy(planChar);

  return (
    <section className="col" style={{ gap: 16 }} data-planets="plan">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--body-2)', maxWidth: '72ch' }}>Give it a system: every way of setting its planets up is ranked by ISK a day, with the upkeep beside it and which planet does what.</p>
        <Points compact items={[
          { kind: 'info', icon: ListOrdered, lead: 'Five setups', text: 'P0 → P1 or P0 → P2 on each planet, planets feeding a factory planet, a factory on bought inputs, and chains across characters.' },
          { kind: 'info', icon: Pickaxe, lead: 'Extraction', text: 'is learned from your own extractors by planet type, or typed; with neither, a setup is worked out at what its factories can take, and says so.' },
          { kind: 'info', icon: Landmark, lead: 'Customs', text: 'in sovereign null-sec is the skyhook owner’s rate: Brave’s wiki’s by default, typed over per planet type or planet.' },
        ]} />
      </div>
      <Who c={c} pc={planChar} />
      <SystemChooser c={c} graph={graph} colonies={colonies[c.charId]} systemId={systemId} onSystem={onSystem} mainName={mainName} chosen={value ? value.system.name : null} />
      {systemId != null && (sys.state === 'loading' ? <p className="note small" style={{ margin: 0 }}>Reading the system’s planets…</p>
        : sys.state === 'failed' ? (
          <p className="note small" style={{ margin: 0 }}>The planets couldn’t be read: {sys.error}.{' '}
            <button type="button" className="link-btn" onClick={sys.retry}>{'reload' in sys ? 'Reload to try again' : 'Try again'}</button></p>
        ) : value && (
          <>
            <SystemHead name={value.system.name} security={value.system.security} planets={value.planets} />
            <Selling said={market.said} />
            {blockedWhy ? null : !morning.ready ? <p className="note small" style={{ margin: 0 }} data-planets="waiting">{morning.said}</p> : (
              <Setups setups={setups} working={working} ix={ix} planets={value.planets} chars={[planChar, ...others]} shown={planChar} name={name} />
            )}
            <Inputs ix={ix} systemId={value.system.systemId} security={value.system.security} planets={value.planets} prefs={prefs} cce={cce}
              learned={learned} programHours={programHours} defaultHours={defaultHours} ownHours={ownHours.length > 0} typedHours={doc.programHours} />
            <PlanetList ix={ix} systemId={value.system.systemId} security={value.system.security} planets={value.planets} prefs={prefs} learned={learned} />
          </>
        ))}
      <Points compact items={PI_LINKS.map((l) => ({ kind: 'tip' as const, icon: ExternalLink, lead: <a href={l.href} target="_blank" rel="noopener noreferrer">{l.title}</a>, text: l.what }))} />
    </section>
  );
}

/** Whose plan: planets allowed and the level the fits assume, or why nothing can be planned for this character. */
function Who({ c, pc }: { c: IndustryChar; pc: PlanChar }) {
  const why = charWhy(pc);
  const whose = c.isMain ? 'Your' : `${c.name}’s`;
  if (why === ALPHA_NO_PI) {
    return <p className="notice warn" style={{ margin: 0 }} data-planets="who">{ALPHA_NO_PI}: none of the planet skills is in any Alpha clone, so nothing can be planned for {c.isMain ? 'you' : c.name} until {c.isMain ? 'you are' : 'it is'} Omega.</p>;
  }
  if (why) {
    const reason = c.isMain ? 'they come with the next sync' : c.pilot.lost === 'refused' ? `EVE refused ${c.name}’s login; hand it over again on the Characters page`
      : c.pilot.lost === 'none' ? `the cloud holds no login for ${c.name}; hand one over on the Characters page` : 'they come with the cloud’s first read';
    return <p className="note" style={{ margin: 0 }} data-planets="who">{whose} skills aren’t read yet, so no setup is worked out for {c.isMain ? 'you' : c.name}: {reason}.</p>;
  }
  return (
    <p className="note" style={{ margin: 0 }} data-planets="who">
      {c.isMain ? 'You' : c.name}: <b>{units(pc.planets)} planet{pc.planets === 1 ? '' : 's'}</b> ({pc.planets! > 1 ? `one, plus Interplanetary Consolidation ${ROMAN[pc.planets! - 1] ?? pc.planets! - 1}` : 'one: Interplanetary Consolidation adds one a level'}), each fitted {pc.ccLevel! > 0 ? <>at <b>Command Center Upgrades {ROMAN[pc.ccLevel!] ?? pc.ccLevel}</b></> : 'without Command Center Upgrades'}.
      {pc.alpha == null && ' Clone state not read: worked out as Omega (an Alpha can’t do planetary industry).'}
    </p>
  );
}

/** Choosing the system: by name (the stargate map's names, else ESI's), where the main is, or a system the shown character's colonies are in. */
function SystemChooser({ c, graph, colonies, systemId, onSystem, mainName, chosen }: {
  c: IndustryChar; graph: Graph; colonies: ColoniesDoc | undefined; systemId: number | null; onSystem: (id: number | null) => void; mainName: string; chosen: string | null;
}) {
  const where = useMainSystem();
  const [typed, setTyped] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  // The field follows the system chosen, however it was chosen.
  useEffect(() => { if (chosen) setTyped(chosen); }, [chosen]);
  const byName = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, v] of Object.entries(graph)) m.set(v[1].toLowerCase(), Number(id));
    return m;
  }, [graph]);
  const hints = useMemo(() => {
    const q = typed.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: string[] = [];
    for (const v of Object.values(graph)) { if (v[1].toLowerCase().startsWith(q)) out.push(v[1]); if (out.length >= 12) break; }
    return out;
  }, [typed, graph]);
  const find = async () => {
    const q = typed.trim();
    if (!q) return;
    setSaid(null);
    const known = byName.get(q.toLowerCase());
    if (known) { onSystem(known); return; }
    // Not on the stargate map (a wormhole has no gates): ESI's names.
    try {
      const r = await resolveIds([q]);
      const hit = r.systems?.[0];
      if (hit) onSystem(hit.id); else setSaid(`No system is called “${q}”.`);
    } catch (e) { setSaid(`Couldn’t look “${q}” up: ${e instanceof Error ? e.message : String(e)}.`); }
  };
  // The shown character's colonies' systems, named from the map, else read from ESI (a wormhole).
  const colonySystems = useMemo(() => [...new Set((colonies?.colonies ?? []).map((x) => x.systemId))], [colonies]);
  const [names, setNames] = useState<Record<number, string>>({});
  useEffect(() => {
    const missing = colonySystems.filter((id) => !graph[id] && !names[id]);
    if (!missing.length) return;
    let alive = true;
    Promise.all(missing.map((id) => systemInfo(id).then((s) => [id, s.name] as const).catch(() => null)))
      .then((xs) => { if (alive) setNames((n) => ({ ...n, ...Object.fromEntries(xs.filter((x): x is readonly [number, string] => !!x)) })); });
    return () => { alive = false; };
  }, [colonySystems, graph, names]);
  const sysName = (id: number) => graph[id]?.[1] ?? names[id] ?? null;

  return (
    <div className="col" style={{ gap: 8 }} data-planets="system">
      <div className="row ind-choices">
        <input className="num" style={{ width: 180 }} placeholder="A system’s name" aria-label="System" list="pl-system-names" value={typed}
          onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void find(); }} />
        <datalist id="pl-system-names">{hints.map((h) => <option key={h} value={h} />)}</datalist>
        <button type="button" className="btn" onClick={() => void find()}>Plan it</button>
        {where !== 'noScope' && (
          <button type="button" className="btn" disabled={!where || where === 'failed'} onClick={() => { if (where && where !== 'failed') onSystem(where.systemId); }}
            data-tip={where === 'failed' ? `ESI didn’t say where ${mainName} is just now` : where ? `${mainName} is in ${where.name} (${secText(where.security)})` : `Reading where ${mainName} is…`}>
            <MapPin aria-hidden="true" />Where {mainName} is
          </button>
        )}
        {colonySystems.map((id) => (
          <button key={id} type="button" className={'chip-btn' + (id === systemId ? ' on' : '')} onClick={() => onSystem(id)} data-tip={`${c.isMain ? 'Your' : `${c.name}’s`} colonies are here`}>
            {sysName(id) ?? 'Reading…'}
          </button>
        ))}
      </div>
      {where === 'noScope' && <p className="note small" style={{ margin: 0 }}>Where {mainName} is needs EVE’s permission to read your location, which this login wasn’t given. Log in again and EVE asks for it.</p>}
      {said && <p className="note small" style={{ margin: 0 }}>{said}</p>}
      {systemId == null && <p className="note small" style={{ margin: 0 }}>Choose a system to plan: type its name{where !== 'noScope' ? `, take where ${mainName} is` : ''}{colonySystems.length ? ', or one your colonies are in' : ''}.</p>}
    </div>
  );
}

function SystemHead({ name, security, planets }: { name: string; security: number; planets: SystemPlanet[] }) {
  const band = secBand(security);
  const pi = planets.filter((p) => p.type).length;
  return (
    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
      <span className="panel-title"><MapPin aria-hidden="true" style={{ width: 14, height: 14, color: 'var(--acc)' }} />{name}</span>
      <span className="note small">{secText(security)} · {band === 'null' ? 'null-sec' : band === 'low' ? 'low-sec' : band === 'high' ? 'high-sec' : 'security not known'} · {planets.length} planet{planets.length === 1 ? '' : 's'}{pi < planets.length ? `, ${pi} with planetary industry` : ''}</span>
    </div>
  );
}

/** Where it sells: the Industry doc's home hub and its choice of Jita, the hub or either, as the finder sells. */
function Selling({ said }: { said: string }) {
  const [doc, setDoc] = useIndustryDoc();
  const { hubs } = useHomeHubs();
  const hub = hubs.find((h) => h.id === doc.hub) ?? null;
  return (
    <div className="col" style={{ gap: 6 }} data-planets="market">
      <div className="row ind-choices">
        <label className="chip h34"><span className="cl">Home hub</span>
          <select aria-label="Home hub" className="ind-sel" value={doc.hub ?? ''} onChange={(e) => setDoc({ hub: e.target.value ? Number(e.target.value) : null })}>
            <option value="">None</option>
            {hubs.map((h) => <option key={h.id} value={h.id}>{h.short}</option>)}
            {doc.hub != null && !hub && <option value={doc.hub}>Not known here</option>}
          </select>
        </label>
        {hub && <Seg size="sm" label="Sell at" value={doc.sell} onChange={(v) => setDoc({ sell: v })}
          options={[{ v: 'jita' as const, label: 'Jita' }, { v: 'home' as const, label: hub.short }, { v: 'best' as const, label: 'Either', tip: 'Each good where it nets more: the hub’s listings and bids and Jita’s, in order of what they pay' }]} />}
      </div>
      <p className="note small" style={{ margin: 0 }}>{said} The freight route and the hub’s broker fee are the Industry tab’s.</p>
    </div>
  );
}

const sysPrefs = (doc: ReturnType<typeof useData>['planets'], systemId: number): SystemPrefs => doc.systems[String(systemId)] ?? NO_SYS;
/** Writes one system's prefs into the synced doc, through its sanitizer. */
const setPrefs = (systemId: number, fn: (s: SystemPrefs) => SystemPrefs) => update((x) => ({
  planets: sanitizePlanets({ ...x.planets, systems: { ...x.planets.systems, [String(systemId)]: fn(sysPrefs(x.planets, systemId)) } }),
}));

/** Each planet: its type and the P0s it has, or why it has no planetary industry, and its customs tax with its own override. */
function PlanetList({ ix, systemId, security, planets, prefs, learned }: { ix: PiIndex; systemId: number; security: number; planets: SystemPlanet[]; prefs: SystemPrefs; learned: Partial<Record<PlanetType, Record<string, Learned>>> }) {
  const high = secBand(security) === 'high';
  const name = (id: number) => ix.byId.get(id)?.name ?? `type ${id}`;
  /** How the planet's extraction is known, P0 by P0: learned from your extractors, typed, another P0's learned rate, or none. */
  const extractionSaid = (t: PlanetType): string => {
    const by = { own: [] as string[], typed: [] as string[], other: [] as string[], none: [] as string[] };
    for (const p0 of ix.planetTypes[t].p0) {
      const k = learned[t]?.[String(p0)] ? 'own' : prefs.rates[t]?.[String(p0)] ? 'typed' : rateFor(learned, undefined, t, p0) ? 'other' : 'none';
      by[k].push(name(p0));
    }
    return [
      by.own.length ? `learned for ${listSaid(by.own)}` : null,
      by.typed.length ? `typed for ${listSaid(by.typed)}` : null,
      by.other.length ? `${listSaid(by.other)} at another ${t} P0’s learned rate` : null,
      by.none.length ? `no rate for ${listSaid(by.none)}: worked out at what the factories take, if your extractors deliver that` : null,
    ].filter(Boolean).join('; ');
  };
  return (
    <div className="col pl-planets" style={{ gap: 0 }}>
      <div className="panel-title" style={{ marginBottom: 8 }}>Its planets<Tip title="Its planets" text={'Each planet’s type and the P0s it has, from CCP’s static data.\n\n• Shattered and Scorched Barren planets have no planetary industry.\n• Type a planet’s own customs tax to override its type’s.'} /></div>
      {planets.map((p) => (
        <div key={p.planetId} className="pl-planet" data-planets={`planet:${p.planetId}`}>
          <div className="pl-planet-name"><b>{p.name}</b><span className="sub">{p.type ?? (p.typeName ?? 'A planet').replace(/^Planet \((.+)\)$/, '$1')}</span></div>
          {!p.type ? <span className="note small">No planetary industry here: CCP’s data gives this kind of planet none.</span> : (
            <>
              <span className="col pl-p0s" style={{ gap: 4 }}>
                <span className="row tight">{ix.planetTypes[p.type].p0.map((id) => <span key={id} className="pill-tag">{name(id)}</span>)}</span>
                <span className="note small">Extraction: {extractionSaid(p.type)}.</span>
              </span>
              <span className="row tight pl-tax">
                <NumChip label="Its tax" percent width={44} decimals={2} placeholder="–"
                  value={prefs.planetTax[String(p.planetId)] == null ? null : prefs.planetTax[String(p.planetId)] * 100}
                  onChange={(n) => setPrefs(systemId, (s) => { const planetTax = { ...s.planetTax }; if (n == null) delete planetTax[String(p.planetId)]; else planetTax[String(p.planetId)] = Math.min(100, Math.max(0, n)) / 100; return { ...s, planetTax }; })}
                  tip="This planet’s own customs tax, over its type’s. Empty: its type’s." />
                <span className="note small">{taxSaid(p.tax, p.type)}</span>
                {high && <Check checked={!!prefs.interbus[String(p.planetId)]} onChange={(on) => setPrefs(systemId, (s) => { const interbus = { ...s.interbus }; if (on) interbus[String(p.planetId)] = true; else delete interbus[String(p.planetId)]; return { ...s, interbus }; })}
                  tip="A high-sec planet whose customs office is InterBus’s, not a player’s: what InterBus charges in high-sec today isn’t verified, so type its rate.">InterBus office</Check>}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** The inputs: the program length, customs tax per planet type, Not Brave's space, and the extraction rates. */
function Inputs({ ix, systemId, security, planets, prefs, cce, learned, programHours, defaultHours, ownHours, typedHours }: {
  ix: PiIndex; systemId: number; security: number; planets: SystemPlanet[]; prefs: SystemPrefs; cce: number | null;
  learned: Partial<Record<PlanetType, Record<string, Learned>>>; programHours: number; defaultHours: number; ownHours: boolean; typedHours: number | null;
}) {
  const doc = useData().planets;
  const types = [...new Set(planets.map((p) => p.type).filter((t): t is PlanetType => !!t))];
  const band = secBand(security);
  const name = (id: number) => ix.byId.get(id)?.name ?? `type ${id}`;
  const [edit, setEdit] = useState<{ t: PlanetType; p0: number } | null>(null);
  return (
    <div className="col inset-box" style={{ gap: 12 }} data-planets="inputs">
      <div className="row ind-choices">
        <span data-planets="program" className="row tight">
          <NumChip label="Program, hours" width={60} decimals={1} placeholder={String(+defaultHours.toFixed(1))} value={typedHours}
            onChange={(n) => update((x) => ({ planets: sanitizePlanets({ ...x.planets, programHours: n }) }))}
            tip={'How often you reset, as the extraction program’s length.\n\n• It sets the resets a week in each setup’s upkeep.\n• A learned or typed rate holds at the program length it was measured at: the rows say when yours differs.'} />
          <span className="note small">{typedHours != null ? `${+programHours.toFixed(1)} hours, typed` : ownHours ? `${+defaultHours.toFixed(1)} hours: your own programs’ median` : '3 days until you type one or your colonies show yours'}</span>
        </span>
        {band === 'null' && systemId < 31_000_000 && (
          <span data-planets="notBrave" className="pl-notbrave">
            <Check checked={prefs.notBrave} onChange={(on) => setPrefs(systemId, (s) => ({ ...s, notBrave: on }))}
              tip={`Brave’s wiki’s rates are taken for sovereign null-sec (${BRAVE_TAX_SOURCE}). A system that isn’t Brave’s has no default: type its rates, or it is ranked before tax.`}>Not Brave’s space: no tax assumed</Check>
          </span>
        )}
      </div>
      <div className="col" style={{ gap: 6 }}>
        <div className="panel-title">Customs tax by planet type<Tip title="Customs tax" text={'What the customs office (in sovereign null-sec, the skyhook) takes on what leaves a planet, on CCP’s fixed base value a unit, not the market’s price.\n\n• Exporting pays the rate; importing pays half of it.\n• Null-sec: Brave’s wiki’s rates until you type one: 2% on Barren and Temperate, 5% on the rest.\n• High-sec: a player office’s owner rate plus 10%, less a point a level of Customs Code Expertise.\n• Low-sec: typed.'} /></div>
        <div className="row pl-taxes">
          {types.map((t) => {
            const tax = typeTax(doc, systemId, security, t, cce);
            return (
              <span key={t} className="pl-taxcell" data-planets={`tax:${t}`}>
                <NumChip label={t} percent width={44} decimals={2} placeholder="–"
                  value={prefs.tax[t] == null ? null : prefs.tax[t]! * 100}
                  onChange={(n) => setPrefs(systemId, (s) => { const tx = { ...s.tax }; if (n == null) delete tx[t]; else tx[t] = Math.min(100, Math.max(0, n)) / 100; return { ...s, tax: tx }; })}
                  tip={band === 'high' ? 'The owner’s rate on this type’s planets here: the NPC part is added to it.' : `The customs tax on ${t} planets here. Empty: ${band === 'null' && !prefs.notBrave ? 'Brave’s wiki’s' : 'not known, ranked before it'}.`} />
                <span className="note small">{band === 'high' && cce == null && tax.rate == null && prefs.tax[t] != null ? 'not known: Customs Code Expertise isn’t read' : taxSaid(tax, t)}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="col" style={{ gap: 6 }}>
        <div className="panel-title">Extraction, P0 an hour an extractor<Tip title="Extraction" text={'What one extractor (its control unit and heads) gives an hour, averaged over its program.\n\n• Learned from your own extractors of that planet type, the lower of the two readings of ESI’s figure until the game has been checked once.\n• Typed: the Total the game shows for a program, divided by its hours, with its length and head count.\n• Neither: a setup is worked out at what its factories can take, and says so.'} /></div>
        {types.map((t) => (
          <div key={t} className="pl-rates">
            <b className="pl-rate-type">{t}</b>
            <div className="col" style={{ gap: 4, minWidth: 0 }}>
              {/* A P0 with a rate of its own (learned or typed) is a line; the rest are named together, each a button to type one. */}
              {ix.planetTypes[t].p0.filter((p0) => learned[t]?.[String(p0)] || prefs.rates[t]?.[String(p0)]).map((p0) => {
                const own = learned[t]?.[String(p0)];
                const typed = prefs.rates[t]?.[String(p0)];
                return (
                  <span key={p0} className="pl-rate" data-planets={`rate:${t}:${p0}`}>
                    <span><b>{name(p0)}</b> {own ? learnedSaid(own, systemId) : typedSaid(typed!)}</span>
                    <button type="button" className="link-btn" onClick={() => setEdit({ t, p0 })}>{typed ? 'Change' : 'Type over it'}</button>
                  </span>
                );
              })}
              {(() => {
                const rest = ix.planetTypes[t].p0.filter((p0) => !learned[t]?.[String(p0)] && !prefs.rates[t]?.[String(p0)]);
                if (!rest.length) return null;
                const other = rateFor(learned, undefined, t, rest[0]);
                return (
                  <span className="pl-rate">
                    <span className="note small">{other ? `At another ${t} P0’s learned rate (${units(other.perHour)} an hour):` : 'No rate, so worked out at what the factories take:'}</span>
                    {rest.map((p0) => <span key={p0} data-planets={`rate:${t}:${p0}`}><button type="button" className="pill-btn" onClick={() => setEdit({ t, p0 })} data-tip={`Type ${name(p0)}’s rate on ${t} planets`}>{name(p0)}</button></span>)}
                  </span>
                );
              })()}
              {edit && edit.t === t && <RateEdit key={`${edit.t}:${edit.p0}`} systemId={systemId} t={t} p0={edit.p0} p0Name={name(edit.p0)} typed={prefs.rates[t]?.[String(edit.p0)]} programHours={programHours} onDone={() => setEdit(null)} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function learnedSaid(l: Learned, systemId: number): string {
  const heads = l.heads > 0 ? `${+l.heads.toFixed(1)} heads` : 'heads not known: the colony didn’t say';
  return [
    `${units(l.perHour)} an hour, learned from ${l.extractors} extractor${l.extractors === 1 ? '' : 's'}`,
    `${hoursSaid(l.programHours)} programs, ${heads}`,
    ...(l.systems.includes(systemId) ? [] : ['learned in another system: richness varies from planet to planet']),
    l.checked ? null : `not yet checked against the game’s total${l.higher != null ? ` (${units(l.higher)} the other way)` : ''}`,
  ].filter(Boolean).join(' · ');
}
const typedSaid = (r: TypedRate) => `${units(r.perHour)} an hour, typed · ${hoursSaid(r.programHours)} programs, ${+r.heads.toFixed(1)} heads`;

/** Typing a rate: all three figures are needed (the doc keeps none without them), the program length filled in from the one chosen. */
function RateEdit({ systemId, t, p0, p0Name, typed, programHours, onDone }: { systemId: number; t: PlanetType; p0: number; p0Name: string; typed: TypedRate | undefined; programHours: number; onDone: () => void }) {
  const [perHour, setPerHour] = useState(typed ? String(typed.perHour) : '');
  const [hours, setHours] = useState(String(typed?.programHours ?? +programHours.toFixed(1)));
  const [heads, setHeads] = useState(typed ? String(typed.heads) : '');
  const num = (s: string) => { const n = Number(s.replace(/,/g, '').trim()); return Number.isFinite(n) && n > 0 ? n : null; };
  const missing = [num(perHour) == null && 'P0 an hour', num(hours) == null && 'the program’s hours', num(heads) == null && 'its heads'].filter(Boolean) as string[];
  const save = () => {
    if (missing.length) return;
    setPrefs(systemId, (s) => ({ ...s, rates: { ...s.rates, [t]: { ...(s.rates[t] ?? {}), [String(p0)]: { perHour: num(perHour)!, programHours: num(hours)!, heads: num(heads)! } } } }));
    onDone();
  };
  const remove = () => {
    setPrefs(systemId, (s) => { const byP0 = { ...(s.rates[t] ?? {}) }; delete byP0[String(p0)]; return { ...s, rates: { ...s.rates, [t]: byP0 } }; });
    onDone();
  };
  return (
    <div className="col inset-box" style={{ gap: 6 }} data-planets="rate-edit">
      <span className="note small">{t}’s {p0Name}: in game, the extractor’s program shows a Total for it; divide that by the program’s hours, and give the heads it had.</span>
      <div className="row ind-choices">
        <input className="num" style={{ width: 90 }} aria-label="P0 an hour" placeholder="P0 an hour" value={perHour} onChange={(e) => setPerHour(e.target.value)} />
        <input className="num" style={{ width: 80 }} aria-label="Program, hours" placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} />
        <input className="num" style={{ width: 60 }} aria-label="Heads" placeholder="Heads" value={heads} onChange={(e) => setHeads(e.target.value)} />
        <button type="button" className="btn" disabled={missing.length > 0} onClick={save}>Save</button>
        {typed && <button type="button" className="btn" onClick={remove}>Remove</button>}
        <button type="button" className="link-btn" onClick={onDone}>Cancel</button>
      </div>
      {missing.length > 0 && <span className="note small">Still needed: {listSaid(missing)}.</span>}
    </div>
  );
}

/** A fold within a setup's row: the panels' own toggle, a chevron and its words. */
function Toggle({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  return <button type="button" className="panel-toggle pl-toggle" aria-expanded={open} onClick={onToggle}><ChevronRight className="chev" aria-hidden="true" />{children}</button>;
}

/** The setups, ranked, each a row; the user's own P0 → P2 says how far it is from the best. */
function Setups({ setups, working, ix, planets, chars, shown, name }: {
  setups: Setup[] | null; working: boolean; ix: PiIndex; planets: SystemPlanet[]; chars: PlanChar[]; shown: PlanChar; name: (id: number) => string;
}) {
  if (!setups) return <p className="note small" style={{ margin: 0 }} data-planets="working">Working out each setup…</p>;
  const best = setups.find((s) => s.iskDay != null) ?? null;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="panel-title">The setups, best first</span>
        {working && <span className="note small" data-planets="working">Working them out again for what you changed…</span>}
      </div>
      <span className="note small">Worked out at the customs tax, extraction rates and program length below; change any and they are worked out again.</span>
      {setups.map((s, i) => <SetupRow key={s.kind} s={s} rank={i + 1} best={best} ix={ix} planets={planets} chars={chars} shown={shown} name={name} />)}
    </div>
  );
}

function SetupRow({ s, rank, best, ix, planets, chars, shown, name }: {
  s: Setup; rank: number; best: Setup | null; ix: PiIndex; planets: SystemPlanet[]; chars: PlanChar[]; shown: PlanChar; name: (id: number) => string;
}) {
  const [open, setOpen] = useState(false);
  // The best and the user's own P0 → P2 open with their detail; the rest fold to their head, figures and upkeep.
  const [detail, setDetail] = useState(rank === 1 || s.kind === 'p2');
  const planet = (id: number) => planets.find((p) => p.planetId === id);
  const pname = (id: number) => planet(id)?.name ?? `planet ${id}`;
  const who = (id: number) => chars.find((x) => x.charId === id);
  const used = s.roles.filter((r) => r.does !== 'unused');
  const unused = s.roles.filter((r) => r.does === 'unused');
  const inChain = s.kind === 'chain' && s.why == null ? s.perChar.map((p) => who(p.charId)?.name ?? `Character ${p.charId}`) : [];
  const label = s.kind === 'chain' && inChain.length === 1 ? `A P4 chain on ${inChain[0]}’s planets` : KIND[s.kind].label;
  const perChar = s.kind === 'chain' && inChain.length > 1;
  const priced = s.why == null && s.iskDay != null;
  const high = s.iskDayHigh != null && s.iskDay != null && Math.abs(s.iskDayHigh - s.iskDay) >= 1;
  const taxedPlanets = new Set(s.taxes.filter((t) => t.perDay == null).map((t) => t.planetId));
  const notes: ReactNode[] = [];
  if (s.why) notes.push(s.why === RAN_OUT ? `${RAN_OUT}: nothing was found within it, which says nothing of what this system can do.` : `${s.why}.`);
  if (s.cut && s.why == null) notes.push('The best of the arrangements tried: the search ran out of its budget first, so it may be well under what this system can do.');
  if (priced && s.before.includes('tax')) notes.push(`Before the customs tax on ${taxedPlanets.size} planet${taxedPlanets.size === 1 ? '' : 's'} whose tax isn’t known: each 1% costs ${iskBig(s.perPct)} a day.`);
  if (priced && s.before.includes('extraction')) notes.push('Some extractors have no rate: worked out at what their factories take, if your extractors deliver that.');
  if (priced && s.unvalued) notes.push(`${s.unvalued} output${s.unvalued === 1 ? '' : 's'} not valued (no price read), so not counted: never as 0.`);
  const lacks = [...new Set(s.perChar.flatMap((p) => p.lacks))];
  const gapSaid = s.kind !== 'p2' ? null : !priced ? 'No figure to set against the best here.'
    : best === s || !best || best.iskDay == null ? 'The best here.' : `${iskBig(best.iskDay - s.iskDay!)} a day under the best here${best.kind === 'chain' ? ' (a chain’s figure is per character)' : ''}.`;
  const steps = open ? setupSteps(s.kind, {
    p0s: [...new Set(used.flatMap((r) => r.extracts.map((e) => name(e.p0))))],
    makes: [...new Set(used.filter((r) => r.does === 'factory' || s.kind === 'p2').flatMap((r) => r.makes.filter((m) => m.facility !== 'basic').map((m) => name(m.id))))],
    takesIn: [...new Set(used.flatMap((r) => (r.imports ?? []).filter((x) => x.from === 'market').map((x) => name(x.id))))],
  }) : [];

  return (
    <article className={'pl-setup' + (rank === 1 && priced ? ' best' : '')} data-planets={`setup:${s.kind}`}>
      <div className="pl-setup-head">
        <span className="pl-rank">{rank}</span>
        <div className="pl-setup-name">
          <b>{label}</b>{s.kind === 'p2' && <span className="pl-yours">your setup</span>}<Tip title={KIND[s.kind].label} text={KIND[s.kind].tip} />
          {perChar && <span className="sub">{listSaid(inChain)}: {inChain.length} characters, ranked per character</span>}
        </div>
        <div className="pl-isk">
          {priced ? <><b>{iskBig(s.iskDay)}</b><span className="sub">a day{perChar ? ' per character' : ''}</span></> : <b>–</b>}
          {priced && high && <span className="sub pl-high">up to {iskBig(s.iskDayHigh)} if the game reads extraction the other way</span>}
        </div>
      </div>
      {notes.length > 0 && <div className="col pl-notes">{notes.map((n, i) => <span key={i} className="note small">{n}</span>)}</div>}
      {s.kind === 'chain' && s.why != null && s.perChar.length > 0 && (
        <span className="note small">{(() => {
          const can = s.perChar.filter((p) => !p.lacks.includes('Omega')).map((p) => who(p.charId)?.name ?? `Character ${p.charId}`);
          const alpha = s.perChar.filter((p) => p.lacks.includes('Omega')).map((p) => who(p.charId)?.name ?? `Character ${p.charId}`);
          return [can.length ? `With planetary industry: ${listSaid(can)}.` : null, alpha.length ? `${listSaid(alpha)} could make one up once Omega.` : null].filter(Boolean).join(' ');
        })()}</span>
      )}
      {gapSaid && <span className="note small" data-planets="gap">{gapSaid}</span>}
      {priced && (
        <>
          <div data-planets="upkeep">
            <Tiles min={150} items={[
              { l: 'Resets a week', v: (+s.upkeep.resetsPerWeek.toFixed(1)).toLocaleString('en-US'), n: 'a program each extraction planet, at the length chosen' },
              ...(s.upkeep.restocksPerWeek > 0 ? [{ l: 'Restocks a week', v: (+s.upkeep.restocksPerWeek.toFixed(1)).toLocaleString('en-US'), n: 'a factory planet’s launchpad (10,000 m³) refilled' }] : []),
              { l: 'Hauled a week', v: `${units(s.upkeep.haulM3PerWeek)} m³`, n: 'from the system to market' },
              { l: 'Freight a week', v: s.upkeep.contractsPerWeek == null ? '–' : (+s.upkeep.contractsPerWeek.toFixed(2)).toLocaleString('en-US'),
                n: s.upkeep.contractsPerWeek == null ? 'no freight route to Jita picked' : s.upkeep.jitaM3PerWeek > 0 ? `contracts to Jita for ${units(s.upkeep.jitaM3PerWeek)} m³` : 'nothing goes to Jita' },
              { l: 'Customs a day', v: s.taxDay == null ? '–' : iskBig(s.taxDay), n: s.taxDay == null ? 'some planets’ tax isn’t known' : 'export and import, every planet' },
            ]} />
          </div>
          {(s.kind === 'chain' || lacks.length > 0) && (
            <div className="col pl-lines">
              {s.kind === 'chain' && s.perChar.map((p) => {
                const ch = who(p.charId);
                const n = used.filter((r) => r.charId === p.charId).length;
                return <span key={p.charId} className="pl-line"><b>{ch?.name ?? `Character ${p.charId}`}</b>: {n} colon{n === 1 ? 'y' : 'ies'}{p.iskDay != null ? `, ${iskBig(p.iskDay)} a day as its share` : ''}{p.lacks.length ? `; to fit, train ${listSaid(p.lacks)}` : ''}{ch?.alpha == null ? '; clone state not read: worked out as Omega' : ''}</span>;
              })}
              {s.kind !== 'chain' && lacks.length > 0 && <span className="pl-line">To fit as planned, train {listSaid(lacks)}.</span>}
            </div>
          )}
          <div><Toggle open={detail} onToggle={() => setDetail(!detail)}>What it makes and which planet does what</Toggle></div>
          {detail && <>
          <Outputs s={s} name={name} />
          {s.inputs.length > 0 && (
            <div className="col pl-lines">
              <span className="lbl">Bought</span>
              {s.inputs.map((i) => (
                <span key={i.id} className="pl-line">{units(i.perDay)} {name(i.id)} a day{i.bought.isk == null ? `: can’t be bought (${i.bought.why ?? 'no price'})` : `, ${iskBig(i.bought.isk)} a day at ${i.bought.where === 'home' ? 'the home hub' : 'Jita'}${i.bought.note ? ` (${i.bought.note})` : ''}`}</span>
              ))}
            </div>
          )}
          <div className="col pl-lines">
            <span className="lbl">Which planet does what</span>
            {used.map((r, i) => <RoleLine key={`${r.planetId}:${r.charId}:${i}`} r={r} s={s} planet={planet(r.planetId)} pname={pname} name={name} whose={s.kind === 'chain' || r.charId !== shown.charId ? who(r.charId)?.name ?? null : null} untaxed={taxedPlanets.has(r.planetId)} />)}
            {unused.length > 0 && <span className="note small">Not used: {unusedSaid(unused, pname)}.</span>}
          </div>
          <div>
            <Toggle open={open} onToggle={() => setOpen(!open)}>How to build it</Toggle>
            {open && (
              <ol className="pl-steps">
                {steps.map((st, i) => (
                  <li key={st.title}><span className="mono">{String(i + 1).padStart(2, '0')}</span><div><b>{st.title}</b><p>{st.body}</p>{st.tip && <p className="pl-tip">{st.tip}</p>}</div></li>
                ))}
              </ol>
            )}
          </div>
          </>}
        </>
      )}
    </article>
  );
}

/** Every output: what is made a day, what sells and where, and what builds up; one with no price says why and counts as nothing summed. */
function Outputs({ s, name }: { s: Setup; name: (id: number) => string }) {
  return (
    <div className="col pl-lines">
      <span className="lbl">What it makes, valued</span>
      {s.outputs.map((o) => (
        <span key={o.id} className="pl-line">
          <b>{name(o.id)}</b>: {units(o.perDay)} a day
          {o.sold.isk == null ? `, not valued: ${o.sold.why ?? 'no price read'}`
            : `, ${units(o.sold.units)} sold at ${o.sold.where.length ? listSaid(o.sold.where.map((w) => (w === 'jita' ? 'Jita' : 'the home hub'))) : 'nowhere (nothing sells at your share)'} for ${iskBig(o.sold.isk)} a day`}
          {o.sold.isk != null && o.buildingUp > 1e-6 && <span className="pl-up">; {units(o.buildingUp)} a day build up: the market takes no more at your share</span>}
        </span>
      ))}
    </div>
  );
}

/** One planet's part: what it extracts (each extractor's rate and where it comes from), what its factories make, what it takes in and ships, its customs. */
function RoleLine({ r, s, planet, pname, name, whose, untaxed }: {
  r: Role; s: Setup; planet: SystemPlanet | undefined; pname: (id: number) => string; name: (id: number) => string; whose: string | null; untaxed: boolean;
}) {
  const extract = r.extracts.map((e) => {
    const from = !e.rate ? 'no rate: if your extractors deliver it' : e.rate.from === 'typed' ? 'typed' : e.rate.otherP0 ? 'learned for another P0' : 'learned';
    const heads = e.heads != null ? `${e.heads} head${e.heads === 1 ? '' : 's'}` : e.rate && !(e.rate.heads > 0) ? 'heads not known: the colony didn’t say how many' : 'heads not known';
    return `${name(e.p0)} at ${units(e.perHour)} an hour (${from}; ${heads})`;
  });
  const makes = r.makes.filter((m) => m.count > 0 || m.perDay > 0).map((m) => `${m.count} ${FAC[m.facility][m.count === 1 ? 0 : 1]} make${m.count === 1 ? 's' : ''} ${units(m.perDay)} ${name(m.id)} a day`);
  const imports = (r.imports ?? []).map((x) => `${units(x.perDay)} ${name(x.id)} a day from ${x.from === 'market' ? 'the market' : pname(x.from)}`);
  const ships = r.ships.map((x) => `${units(x.perDay)} ${name(x.id)} a day to ${x.to === 'market' ? 'market' : pname(x.to)}`);
  const rows = s.taxes.filter((t) => t.planetId === r.planetId);
  const tax = rows.length === 0 ? null : rows.some((t) => t.perDay == null) ? 'not known: ranked before it' : `${iskBig(rows.reduce((n, t) => n + t.perDay!, 0))} a day (${rows.map((t) => `${t.tier} ${iskBig(t.perDay)}`).join(', ')})`;
  const parts: [string, string][] = [
    ...(extract.length ? [['Extracts', listSaid(extract)] as [string, string]] : []),
    ...(imports.length ? [['Takes in', listSaid(imports)] as [string, string]] : []),
    ...(makes.length ? [['Makes', listSaid(makes)] as [string, string]] : []),
    ...(ships.length ? [['Ships', listSaid(ships)] as [string, string]] : []),
    ...(tax ? [['Customs', tax] as [string, string]] : []),
  ];
  return (
    <div className="pl-role" data-planets={`role:${r.planetId}`}>
      <div className="pl-role-name"><b>{pname(r.planetId)}</b><span className="pl-type">{[planet?.type ?? 'no planetary industry', r.does === 'factory' ? 'factory planet' : null, whose ? `${whose}’s` : null].filter(Boolean).join(' · ')}</span></div>
      <div className="pl-role-parts">
        {parts.map(([k, v]) => <span key={k} className="pl-line"><span className="pl-k">{k}</span> {v}</span>)}
        {r.does === 'factory' && untaxed && <span className="pl-line pl-up">Picked before its customs tax, which isn’t known here.</span>}
        {r.why && <span className="pl-line pl-why">{r.why}.</span>}
      </div>
    </div>
  );
}

/** The planets a setup leaves unused, grouped by why, so one reason isn't said once a planet. */
function unusedSaid(unused: Role[], pname: (id: number) => string): string {
  const by = new Map<string, string[]>();
  for (const r of unused) { const w = r.why ?? 'not needed'; by.set(w, [...(by.get(w) ?? []), pname(r.planetId)]); }
  return [...by.entries()].map(([w, ps]) => `${listSaid(ps)}: ${w.charAt(0).toLowerCase()}${w.slice(1)}`).join('. ');
}
