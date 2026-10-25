import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Landmark, MapPin, Users } from 'lucide-react';
import type { ColoniesDoc } from '../../lib/colonies';
import { iskBig, units } from '../../lib/format';
import { useStable } from '../../lib/hooks';
import { secText } from '../../lib/industrySites';
import { jumpsFrom, type Graph } from '../../lib/jumps';
import type { PlanetType } from '../../lib/pi';
import type { PiIndex, Region } from '../../lib/piBundle';
import { finderRateOf, finderTaxOf, finderWhy, flowSteps, kindOptions, rankRows, regionOf, regionSystems, splitByP0, systemInput, type Borrowed, type FinderBase, type FinderRow, type FinderSystem, type FlowProgress, type Unworked } from '../../lib/piFinder';
import { flowTeam, kindFor, kindsFor, KIND_SAID, WHAT_IF_SAID, type FlowChoice } from '../../lib/piFlow';
import { planetKeyOf } from '../../lib/piLearn';
import { charWhy, customsLevel, planCharOf, type PlanInput, type SetupKind } from '../../lib/piPlan';
import { DEFAULT_PLANETS, type SystemPrefs } from '../../lib/planetsDoc';
import { reloadApp } from '../../lib/reload';
import { dayCount } from '../../lib/split';
import { useData } from '../../lib/store';
import { Points } from '../Facts';
import { ItemIcon, Th } from '../ui';
import type { IndustryChar } from './industryChars';
import { useHomeHubs, useIndustryDoc } from './industryMarket';
import { loadRadii, loadRegions } from './planetsBundle';
import { usePlanetMarket } from './planetsMarket';
import { useLearned } from './planetsPlanning';
import { Busy, Selling, SystemChooser } from './PlanetsPlan';

/**
 * Find, step 3 (planets-finder.md, planets-flow.md): the best systems in a region for one good. Every system of the region whose planets
 * supply the good's P0s is planned as Plan it plans it, across the characters ticked on step 2 (a one-character setup repeated on each, a
 * factory character's or a chain's team), from the bundle alone: each system's planets, types and sizes are CCP's static data, never read
 * from ESI. In two phases (`flowSteps`): every system screened, then the ones that could make the top ten worked out in full, in slices
 * of a few milliseconds as Plan's setups are, the list growing as each system comes in. Picking a row picks the system for step 4.
 */

/** How long one slice of the finder may hold the page before handing it back: Plan's own (planetsPlanning.ts' SLICE_MS). */
const SLICE_MS = 8;
/** How long the inputs must stand still before the region is worked out again: Plan's own (the market and the rates land in steps). */
const SETTLE_MS = 350;
/** How often the growing list is drawn again while the region is worked out. */
const DRAW_MS = 150;
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const KIND_SHORT: Record<SetupKind, string> = { p1: 'P0 → P1', p2: 'P0 → P2', feed: 'a fed factory', bought: 'bought', chain: 'a chain', team: 'a factory character' };
const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const WORMHOLE_FROM = 31_000_000;

type Job = { systems: FinderSystem[]; inputOf: (s: FinderSystem) => PlanInput; kinds: readonly SetupKind[]; jumps: ReadonlyMap<number, number> | null };
type Found = { job: Job | null; rows: FinderRow[]; unworked: Unworked[]; progress: FlowProgress | null; done: boolean; started: number; took: number | null; worked: number };

/**
 * The region's systems worked out in two phases (`flowSteps`) once the job has stood still `SETTLE_MS`, a step at a time in slices of
 * `SLICE_MS` (a message posted to itself between them, as Plan's `usePlanned`), each exact row kept as it lands and the phases' progress
 * with it. A new job drops the run between two slices. For the same region, good and characters (`scope`: a price read landing, say), the
 * last finished list stands, said as being worked out again (`again`), until the new one is done, so the table doesn't empty and fill again.
 */
function useFound(job: Job | null, scope: string): Found & { again: boolean } {
  const [st, setSt] = useState<Found>({ job: null, rows: [], unworked: [], progress: null, done: false, started: 0, took: null, worked: 0 });
  const last = useRef<{ scope: string; f: Found } | null>(null);
  const mine = st.job === job && !!job;
  if (mine && st.done) last.current = { scope, f: st };
  useEffect(() => {
    if (!job) return;
    let alive = true;
    const rows: FinderRow[] = [];
    let progress: FlowProgress | null = null;
    const started = Date.now();
    const steps = flowSteps(job.systems, job.inputOf, job.kinds, { jumps: job.jumps, land: (r) => rows.push(r), progress: (p) => { progress = p; } });
    const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let drawn = 0;
    // Busy from the start: pressing Next shows the step at once, never a blank (the progress line says what it waits for).
    setSt({ job, rows: [], unworked: [], progress: { phase: 'screen', done: 0, of: job.systems.length, system: null, meter: null }, done: false, started, took: null, worked: 0 });
    const slice = () => {
      if (!alive) return;
      const until = performance.now() + SLICE_MS;
      let fin: ReturnType<typeof steps.next> | null = null;
      do {
        const r = steps.next();
        if (r.done) { fin = r; break; }
      } while (performance.now() < until);
      // Drawn again at most every DRAW_MS while it runs (a region of 150 systems drawn each slice would make the drawing the long task),
      // and at once when done.
      if (fin?.done) { const f = fin.value; setSt({ job, rows: [...rows], unworked: f.unworked, progress: null, done: true, started, took: Date.now() - started, worked: f.worked }); return; }
      if (performance.now() - drawn >= DRAW_MS) { drawn = performance.now(); setSt({ job, rows: [...rows], unworked: [], progress: progress && { ...progress }, done: false, started, took: null, worked: 0 }); }
      if (channel) channel.port2.postMessage(null); else timer = setTimeout(slice, 0);
    };
    if (channel) channel.port1.onmessage = slice;
    timer = setTimeout(slice, SETTLE_MS);
    return () => { alive = false; clearTimeout(timer); if (channel) { channel.port1.onmessage = null; channel.port1.close(); channel.port2.close(); } };
  }, [job]);
  if (mine && st.done) return { ...st, again: false };
  if (last.current?.scope === scope) return { ...last.current.f, done: false, again: true, progress: mine ? st.progress : null };
  return mine ? { ...st, again: false } : { job: null, rows: [], unworked: [], progress: null, done: false, started: 0, took: null, worked: 0, again: false };
}

/** "Owner", "Owner and Willi Wakkerr", "you, Willi Wakkerr and Messenger from God". */
const namesSaid = (xs: string[]) => listSaid(xs);
/** A duration, said: "4 s", "1 min 12 s". */
const tookSaid = (ms: number) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };

export function PlanetsFind({ c, chars, colonies, ix, graph, good, regionId, planSystem, onGood, onRegion, onPlanHere, ready = false, flow, onPick, mainName }: {
  c: IndustryChar; chars: IndustryChar[]; colonies: Record<number, ColoniesDoc | undefined>; ix: PiIndex; graph: Graph;
  /** The good to find for (the address's, else the one Plan is held to); null with none. */
  good: number | null;
  /** The region asked for (the address's, else the one kept); null falls back to Plan's system's region, then the home hub's. */
  regionId: number | null;
  /** The system chosen on Plan, whose region is the default, and the one picked here. */
  planSystem: number | null;
  onGood: (id: number) => void; onRegion: (id: number) => void;
  /** Plan it here: Plan's system set to it, held to the good, straight to step 4. */
  onPlanHere: (systemId: number, good: number) => void;
  /** Every character's copy is loaded: the learned rates' record may be written (planner fix 2). */
  ready?: boolean;
  /** Step 2's choices (planets-flow.md): who's ticked, the setup type, the skills what-if. */
  flow: FlowChoice;
  /** Picking a system: a row, or one by name. Its name, when known, names step 3's Next. */
  onPick: (systemId: number, name: string | null) => void;
  mainName: string;
}) {
  const [radii, setRadii] = useState<Record<string, number[]> | 'failed' | null>(null);
  const [regions, setRegions] = useState<Region[] | 'failed' | null>(null);
  useEffect(() => {
    let alive = true;
    loadRadii().then((r) => { if (alive) setRadii(r); }, () => { if (alive) setRadii('failed'); });
    loadRegions().then((r) => { if (alive) setRegions(r); }, () => { if (alive) setRegions('failed'); });
    return () => { alive = false; };
  }, []);
  const [industry] = useIndustryDoc();
  const { hubs } = useHomeHubs();
  const hub = hubs.find((h) => h.id === industry.hub) ?? null;
  const regionList = Array.isArray(regions) ? regions : null;
  const region = regionList ? regionList.find((r) => r.id === regionId) ?? regionOf(regionList, planSystem) ?? regionList.find((r) => r.id === hub?.region) ?? null : null;

  const doc = useData().planets;
  // Step 2's choices: the factory character (the one shown) and the characters ticked, at the what-if's skills when it's on; keyed on value.
  const team = useStable(flowTeam(planCharOf({ charId: c.charId, name: c.name, skills: c.pilot.skills, clone: c.clone }),
    chars.map((x) => planCharOf({ charId: x.charId, name: x.name, skills: x.pilot.skills, clone: x.clone })), flow));
  const planChar = team.char;
  const crew = [team.char, ...team.others].filter((x) => !charWhy(x));
  const cce = customsLevel(c.pilot.skills);
  const { learned, own, programHours, heads, programFrom } = useLearned(colonies, ix, ready);
  const planetKey = useMemo(() => planetKeyOf(own), [own]);
  const market = usePlanetMarket(c, ix);

  const systems = useMemo(() => (region && radii && radii !== 'failed' ? regionSystems(ix, region, radii, graph) : null), [ix, region, radii, graph]);
  const split = useMemo(() => (systems && good != null ? splitByP0(ix, good, systems) : null), [ix, systems, good]);
  const options = useMemo(() => (good != null ? kindOptions(ix, good, crew.length) : null), [ix, good, crew.length]);
  const kind = options ? kindFor(flow.kind, options) : 'best';
  const kindsKey = options ? kindsFor(kind, options).join(',') : '';
  const kinds = useMemo(() => (kindsKey ? (kindsKey.split(',') as SetupKind[]) : []), [kindsKey]);
  // Each system's own prefs (customs typed for it, "not Brave's", rates typed for it), keyed on value: a write to the `planets` doc
  // elsewhere (the learned rates' record, a plan kept) must not work the region out again.
  const prefs = useStable(useMemo(() => {
    const out: Record<string, SystemPrefs> = {};
    for (const s of systems ?? []) { const p = doc.systems[String(s.id)]; if (p) out[String(s.id)] = { ...p, kept: {} }; }
    return out;
  }, [systems, doc.systems]));
  const taxDoc = useMemo(() => ({ ...DEFAULT_PLANETS, systems: prefs }), [prefs]);
  const taxOf = useMemo(() => finderTaxOf(taxDoc, cce), [taxDoc, cce]);

  const blockedWhy = charWhy(planChar) ?? (good != null && !kinds.length ? finderWhy(ix, good) ?? 'No setup type can make it' : null);
  // The good itself unpriced (no home hub, say) blocks every system for one reason: said once, nothing worked out.
  const priced = good != null && market.ready ? market.sell(good, 1e-6) : null;
  const pricedWhy = priced && priced.isk == null ? `${ix.byId.get(good!)?.name ?? 'This good'} isn’t priced: ${priced.why ?? 'no price read'}` : null;

  const jumps = useMemo(() => (hub ? jumpsFrom(graph, hub.systemId) : null), [graph, hub]);
  const job = useMemo((): Job | null => {
    if (!split || good == null || blockedWhy || !market.ready || pricedWhy || !kinds.length) return null;
    const base: FinderBase = { ix, char: team.char, others: team.others, planetKey, heads, sell: market.sell, buy: market.buy, programHours, programFrom, freight: market.freight, only: good };
    const rateOf = finderRateOf(learned, own, taxDoc);
    // One input a system, so the factory character's work out (phase 2) reuses the plans its screen worked out (phase 1).
    const inputs = new Map<number, PlanInput>();
    return { systems: split.plan, kinds, jumps, inputOf: (s) => { let x = inputs.get(s.id); if (!x) inputs.set(s.id, x = systemInput(base, s, taxOf, rateOf)); return x; } };
  }, [split, good, blockedWhy, market.ready, pricedWhy, kinds, ix, team, planetKey, heads, market.sell, market.buy, market.freight, programHours, programFrom, taxDoc, learned, own, taxOf, jumps]);
  const found = useFound(job, `${region?.id}:${good}:${planChar.charId}:${kinds.join(',')}:${crew.map((x) => `${x.charId}/${x.planets}/${x.ccLevel}`).join(',')}`);

  const ranked = useMemo(() => rankRows(found.rows, jumps), [found.rows, jumps]);
  const shown = ranked.filter((r) => r.made != null), unranked = ranked.filter((r) => r.made == null);
  const beforeTax = shown.filter((r) => r.beforeTax).length;
  const borrowed = shown.filter((r) => r.borrowed.length > 0);
  const assumed = borrowed.some((r) => r.borrowed.some((b) => b.from === 'assumed'));
  // Your colonies by system, every character's: "your colonies here".
  const coloniesBy = useMemo(() => {
    const m = new Map<number, { n: number; who: Set<string> }>();
    for (const ch of chars) for (const k of colonies[ch.charId]?.colonies ?? []) {
      const e = m.get(k.systemId) ?? { n: 0, who: new Set<string>() };
      e.n++; e.who.add(ch.isMain ? 'you' : ch.name);
      m.set(k.systemId, e);
    }
    return m;
  }, [chars, colonies]);
  // Brave's rates are assumed for some system planned (sovereign null-sec, nothing typed, not marked "not Brave's"): said once.
  const brave = useMemo(() => (split?.plan ?? []).some((s) => s.planets.some((p) => p.type && taxOf(s, p, p.type).from === 'brave')), [split, taxOf]);

  const g = good != null ? ix.byId.get(good) ?? null : null;
  const gName = g?.name ?? 'a good';
  const programSaid = programFrom === 'typed' ? 'the length typed on Plan' : programFrom === 'median' ? 'your programs’ median' : 'the 3-day default';
  const pickedName = planSystem == null ? null : graph[String(planSystem)]?.[1] ?? split?.plan.find((s) => s.id === planSystem)?.name ?? null;
  const p = found.progress;
  const busyFrac = !p ? null : p.phase === 'screen' ? (p.of ? p.done / p.of : 0)
    : (p.done + (p.meter?.budget && p.meter.of ? Math.min(0.95, 1 - p.meter.budget.left / p.meter.of) : 0)) / Math.max(1, p.of);
  const busySaid = !p ? null : `${found.again ? 'Working them out again: ' : ''}${p.phase === 'screen' ? `Screening ${p.of} system${p.of === 1 ? '' : 's'}: ${p.done} of ${p.of}…`
    : `Working out the best: ${p.done} of ${p.of}${p.system ? ` (${p.system.name ?? `System ${p.system.id}`})` : ''}…`}`;
  const kindLine = kind === 'best' ? `the best for this team: the most among ${listSaid(kinds.map((k) => KIND_SHORT[k] + (k === 'p1' || k === 'p2' || k === 'feed' ? ' repeated on each' : '')))}` : `${KIND_SAID[kind].label.charAt(0).toLowerCase()}${KIND_SAID[kind].label.slice(1)}${kind === 'p1' || kind === 'p2' || kind === 'feed' ? ', repeated on each' : ''}`;
  const whoSaid = crew.map((x) => (x.charId === c.charId && c.isMain ? 'you' : x.name));

  return (
    <section className="col" style={{ gap: 16 }} data-planets="find">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--body-2)', maxWidth: '72ch' }} data-planets="find-lead">A planet’s richness isn’t in the game’s data: each system is planned on your learned rates for each planet type, and your own planets’ readings where you have colonies there.</p>
        <Points compact items={[
          { kind: 'info', icon: Compass, lead: 'Each system', text: 'whose planets supply every P0 the good needs is planned as Plan it plans it: the most of the good a day across the characters ticked on step 2, then ISK.' },
          { kind: 'info', icon: Users, lead: 'In two phases', text: 'every system screened by what it could make at most, then the ones that could reach the top ten worked out in full: a factory character takes a second or two a system.' },
          { kind: 'info', icon: Landmark, lead: 'Not known', text: 'who owns each customs office or skyhook, the sovereignty, and your standings there: the finder checks none of them.' },
        ]} />
      </div>
      <div className="row ind-choices">
        <label className="chip h34"><span className="cl">Good</span>
          <select aria-label="Good" className="ind-sel" data-planets="find-good" value={good ?? ''} onChange={(e) => { if (e.target.value) onGood(Number(e.target.value)); }}>
            {good == null && <option value="">Pick a good</option>}
            {(['P1', 'P2', 'P3', 'P4'] as const).map((t) => (
              <optgroup key={t} label={t}>
                {ix.commodities.filter((x) => x.tier === t).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="chip h34"><span className="cl">Region</span>
          <select aria-label="Region" className="ind-sel" data-planets="find-region" value={region?.id ?? ''} disabled={!regionList} onChange={(e) => { if (e.target.value) onRegion(Number(e.target.value)); }}>
            {!region && <option value="">{regionList ? 'Pick a region' : 'Loading…'}</option>}
            {regionList && <RegionOptions regions={regionList} graph={graph} />}
          </select>
        </label>
      </div>
      {/* Picking the system by name (Plan's chooser), so a region not worth scanning, or a system you already know, can go straight on. */}
      <div className="col" style={{ gap: 4 }} data-planets="find-pick">
        <SystemChooser c={c} graph={graph} colonies={colonies[c.charId]} systemId={planSystem} onSystem={(id, name) => { if (id != null) onPick(id, name ?? null); }} mainName={mainName} chosen={pickedName} go="Pick it" hint={false} />
        <p className="note small" style={{ margin: 0 }} data-planets="find-picked">{planSystem != null ? <>Picked: <b>{pickedName ?? `System ${planSystem}`}</b>. Pick another here or from the list.</> : 'Pick a system from the list below, or by name.'}</p>
      </div>
      {radii === 'failed' || regions === 'failed' ? (
        <p className="note small" style={{ margin: 0 }}>Couldn’t load the planets’ sizes and regions just now.{' '}
          <button type="button" className="link-btn" onClick={() => void reloadApp()}>Reload to try again</button></p>
      ) : !regionList || !radii ? <Busy tag="find-progress" said="Loading the planets’ sizes and regions…" frac={null} />
      : good == null ? <p className="note small" style={{ margin: 0 }} data-planets="find-why">Pick a good to find where to build it: here, or with Plan it on the Chart.</p>
      : !region ? <p className="note small" style={{ margin: 0 }} data-planets="find-why">Pick a region: none is chosen, and neither Plan’s system nor a home hub says which.</p>
      : (
        <>
          <p className="panel-title" style={{ margin: 0 }} data-planets="find-head"><MapPin aria-hidden="true" style={{ width: 14, height: 14, color: 'var(--acc)' }} />Best systems in {region.name} for {gName}</p>
          {flow.atV && <p className="note small pl-up" style={{ margin: 0 }} data-planets="find-whatif">{WHAT_IF_SAID}.</p>}
          {blockedWhy ? <p className="note" style={{ margin: 0 }} data-planets="find-why">{blockedWhy}.</p> : (
            <>
              <p className="note small" style={{ margin: 0 }} data-planets="find-who">{crew.length > 1 ? `Across ${namesSaid(whoSaid)} (${crew.length} characters ticked, ${c.isMain ? 'you' : c.name} the factory character)` : c.isMain ? 'For you' : `For ${c.name}`}: {kindLine}. {c.isMain ? 'You' : c.name}: {units(planChar.planets)} planet{planChar.planets === 1 ? '' : 's'} at Command Center Upgrades {ROMAN[planChar.ccLevel!] ?? planChar.ccLevel}, on a {+programHours.toFixed(1)}-hour program ({programSaid}){planChar.alpha == null ? '; clone state not read, worked out as Omega' : ''}.{team.unticked.length ? ` Unticked on step 2: ${namesSaid(team.unticked.map((x) => x.name))}.` : ''}</p>
              <Selling said={market.said} />
              {!market.ready ? <p className="note small" style={{ margin: 0 }} data-planets="find-why">{market.said}</p>
              : pricedWhy ? <p className="note small" style={{ margin: 0 }} data-planets="find-why">{pricedWhy}, so nothing is worked out.</p>
              : split && (
                <>
                  <LeftOutLine ix={ix} good={gName} all={systems?.length ?? 0} split={split} systems={systems ?? []} />
                  {brave && <p className="note small" style={{ margin: 0 }} data-planets="find-brave">Brave’s rates assumed in sovereign null-sec; a system that isn’t Brave’s may charge otherwise.</p>}
                  {!hub && <p className="note small" style={{ margin: 0 }}>No home hub picked, so no jumps are counted.</p>}
                  {split.plan.length > 0 && !found.done && <Busy tag="find-progress" said={busySaid ?? 'Waiting for the inputs to settle…'} frac={busyFrac} />}
                  {found.done && split.plan.length > 0 && found.took != null && <p className="note small" style={{ margin: 0 }} data-planets="find-done">Done: {split.plan.length} system{split.plan.length === 1 ? '' : 's'} {found.worked ? `screened, ${found.worked} worked out in full` : 'worked out'} in {tookSaid(found.took)}.</p>}
                  {borrowed.length > 0 && <p className="note small" style={{ margin: 0 }} data-planets="find-borrowed-count">{borrowed.length === shown.length ? 'Every system here is' : `${borrowed.length} of these systems are`} planned partly on a rate learned on another planet type or P0{assumed ? ', or an assumed 12,000 an hour' : ''}: each says so under its figure, and Plan it here says which line.</p>}
                  {beforeTax > 0 && <p className="note small" style={{ margin: 0 }} data-planets="find-before-tax">{beforeTax === shown.length ? 'Every system here is' : `${beforeTax} of these systems are`} ranked before the customs tax: no rate is assumed in high-sec, low-sec or wormhole space, and none is typed for {beforeTax === 1 ? 'it' : 'them'} (type one on Plan, system by system).</p>}
                  {shown.length > 0 && (
                    <div className="tbl-scroll">
                      <table className="tbl compact pl-find" style={{ minWidth: 960 }} data-planets="find-table">
                        <thead>
                          <tr>
                            <Th>#</Th>
                            <Th left>System</Th>
                            <Th tip={`Stargate jumps from the home hub's system${hub ? `, ${hub.short}` : ''}, by any route.\n\n• “–” when no stargate route reaches it, or with no home hub picked.\n• Ties on the good a day go to the nearer system.`}>Jumps</Th>
                            <Th tip={`How much ${gName} it makes a day across the characters ticked: the most it can, as Plan it plans it, which ranks the list.\n\n• A one-character setup repeated on each character it suits; a factory character’s or a chain’s team in all.\n• On your learned rates by planet type, and a planet's own where you have a colony on it.\n• A system's planets differ in richness, which no data holds: the figure is what your rates would give there.`}>Made a day</Th>
                            <Th tip={'What that setup earns a day in all, for information: valued as Plan values it, on this morning’s Jita books and the home hub’s last read, after your fees and the customs tax.\n\n• The list is ranked by the good a day, not this.'}>ISK a day</Th>
                            <Th left tip={'The planets the setup uses, of the system’s planets with planetary industry (a factory character’s factory planets among them), and those planets by type, each type’s count beside it.'}>Planets</Th>
                            <Th left tip={'Your colonies in the system, every character’s: their planets are planned on what they gave (a planet’s own rate), the others on your rates by planet type.'}>Yours</Th>
                            <Th>{''}</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((r) => <Row key={r.system.id} r={r} ix={ix} jumps={jumps} cols={coloniesBy.get(r.system.id) ?? null} good={good} picked={r.system.id === planSystem} onPick={onPick} onPlanHere={onPlanHere} />)}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {found.done && found.unworked.length > 0 && (
                    <div className="col" style={{ gap: 4 }} data-planets="find-unworked-screened">
                      <span className="lbl">Not worked out ({found.unworked.length}): ten do better</span>
                      <span className="note small">Each was screened: what it could make at most is under the tenth best here, so a factory character’s search wasn’t run for it.</span>
                      {[...found.unworked].sort((a, b) => b.bound - a.bound).map((u) => (
                        <p key={u.system.id} className="note small" style={{ margin: 0 }} data-planets={`find-screened:${u.system.id}`}>
                          <b>{u.system.name ?? `System ${u.system.id}`}</b>{u.system.security != null ? ` ${secText(u.system.security)}` : ''}: could make up to {dayCount(u.bound)} a day: not worked out, ten do better.{' '}
                          <button type="button" className="link-btn" onClick={() => onPlanHere(u.system.id, good)}>Plan it there</button>
                        </p>
                      ))}
                    </div>
                  )}
                  {unranked.length > 0 && (
                    <div className="col" style={{ gap: 4 }} data-planets="find-unworked">
                      <span className="lbl">Couldn’t be worked out ({unranked.length})</span>
                      {unranked.map((r) => (
                        <p key={r.system.id} className="note small" style={{ margin: 0 }} data-planets={`find-unranked:${r.system.id}`}>
                          <b>{r.system.name ?? `System ${r.system.id}`}</b>{r.system.security != null ? ` ${secText(r.system.security)}` : ''}: {r.why ?? 'not worked out'}.{' '}
                          <button type="button" className="link-btn" onClick={() => onPlanHere(r.system.id, good)}>Plan it there</button>
                        </p>
                      ))}
                    </div>
                  )}
                  {found.done && split.plan.length > 0 && !shown.length && !unranked.length && !found.unworked.length && <p className="note small" style={{ margin: 0 }}>Nothing worked out.</p>}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

/** Every region with PI planets, by name: those the stargates reach, then wormhole space and the closed regions. */
function RegionOptions({ regions, graph }: { regions: Region[]; graph: Graph }) {
  const byName = (a: Region, b: Region) => a.name.localeCompare(b.name);
  const reached = regions.filter((r) => r.systems.some((s) => graph[String(s)])).sort(byName);
  const not = regions.filter((r) => !r.systems.some((s) => graph[String(s)])).sort(byName);
  const opt = (r: Region) => <option key={r.id} value={r.id}>{r.name} ({r.systems.length})</option>;
  return (
    <>
      <optgroup label="Reached by stargate">{reached.map(opt)}</optgroup>
      {not.length > 0 && <optgroup label="No stargates: wormhole space and closed regions">{not.map(opt)}</optgroup>}
    </>
  );
}

/** "19 of 81 systems left out: their planets can’t supply every P0 … (12 lack Suspended Plasma, the commonest)", each one in the tip. */
function LeftOutLine({ ix, good, all, split, systems }: { ix: PiIndex; good: string; all: number; split: NonNullable<ReturnType<typeof splitByP0>>; systems: FinderSystem[] }) {
  const name = (id: number) => ix.byId.get(id)?.name ?? `type ${id}`;
  if (!split.out.length) return <p className="note small" style={{ margin: 0 }} data-planets="find-out">All {all} systems with planets here supply every P0 {good} needs.</p>;
  const sys = new Map(systems.map((s) => [s.id, s.name ?? `System ${s.id}`]));
  const tip = split.out.slice(0, 40).map((o) => `• ${sys.get(o.systemId)}: no ${listSaid(o.missing.map(name))}`).join('\n') + (split.out.length > 40 ? `\n• and ${split.out.length - 40} more` : '');
  const c = split.commonest;
  return (
    <p className="note small" style={{ margin: 0 }} data-planets="find-out">
      <span tabIndex={0} data-tip={tip} data-tip-title="Left out" style={{ textDecoration: 'underline dotted' }}>{split.out.length} of {all} systems left out</span>: their planets can’t supply every P0 {good} needs
      {c ? ` (${c.count} lack ${name(c.p0)}, the commonest)` : ''}.{split.plan.length ? '' : ' None left to plan.'}
    </p>
  );
}

/** "Your colonies", or "Colonies of Willi Wakkerr and you": the main last, as `you`. */
function whoseColonies(who: Set<string>): string {
  const names = [...who].filter((x) => x !== 'you');
  if (!names.length) return 'Your colonies';
  return `Colonies of ${listSaid(who.has('you') ? [...names, 'you'] : names)}`;
}

/** What a row's figure was planned on that no rate of its own planet type speaks for, line by line. */
function borrowedTip(bs: Borrowed[], ix: PiIndex): string {
  const name = (id: number) => ix.byId.get(id)?.name ?? `type ${id}`;
  const line = (b: Borrowed) => {
    const on = `${b.type ?? 'A'} planet’s ${name(b.p0)}`;
    return b.from === 'assumed' ? `• ${on}: an assumed 12,000 an hour, no rate learned or typed`
      : b.from === 'otherP0' ? `• ${on}: the rate learned for another P0 of ${b.type ?? 'its'} planets`
      : `• ${on}: the rate learned on ${b.from} planets`;
  };
  return `No colony of yours has shown this planet type’s rate for a P0 the good is made from, so it’s planned on another:\n\n${bs.map(line).join('\n')}\n\nPlan it here says which, line by line.`;
}

/**
 * A system's row. Its rank is the table's own count (a CSS counter), so a row is drawn once however many land above it while the region
 * is worked out (`memo`): drawing every row each time the list grew made the drawing the long task on a big region.
 */
const Row = memo(function Row({ r, ix, jumps, cols, good, picked, onPick, onPlanHere }: {
  r: FinderRow; ix: PiIndex; jumps: ReadonlyMap<number, number> | null; cols: { n: number; who: Set<string> } | null; good: number;
  /** Picking a row is choosing the system (step 3): it's lit, and step 3's Next opens step 4 there. */
  picked: boolean; onPick: (systemId: number, name: string | null) => void;
  onPlanHere: (systemId: number, good: number) => void;
}) {
  const s = r.system;
  const j = jumps?.get(s.id);
  const count = new Map<PlanetType, number>();
  for (const p of s.planets) if (p.type) count.set(p.type, (count.get(p.type) ?? 0) + 1);
  const repeated = r.best && (r.best.kind === 'p1' || r.best.kind === 'p2' || r.best.kind === 'feed') && (r.chars ?? 1) > 1;
  return (
    <tr data-planets={`find-row:${s.id}`} data-pick="" className={picked ? 'pl-picked' : undefined} aria-selected={picked} onClick={() => onPick(s.id, s.name)}>
      <td className="find-rank" style={{ color: 'var(--note)' }} />
      <td className="l">
        <span className="name" style={{ display: 'block', fontWeight: 400 }}>{s.name ?? `System ${s.id}`}</span>
        <span className="sub">{s.security != null ? secText(s.security) : 'security not known'}{s.id >= WORMHOLE_FROM ? ' · wormhole' : ''}</span>
      </td>
      <td data-planets="find-jumps">{j != null ? units(j) : <span data-tip={jumps ? 'No stargate route from the home hub reaches it' : 'No home hub picked'}>–</span>}</td>
      <td data-planets="find-made" style={{ minWidth: 185, maxWidth: 230, whiteSpace: 'normal' }}>
        <b>{dayCount(r.made!)}</b>
        <span className="sub" style={{ display: 'block', whiteSpace: 'normal' }} data-planets="find-kind">{r.best ? `${KIND_SHORT[r.best.kind]}${repeated ? `, on each of ${r.chars}` : (r.best.kind === 'team' || r.best.kind === 'chain') && (r.chars ?? 1) > 1 ? `, ${r.chars} characters` : ''}` : ''}</span>
        {r.cut ? <span className="sub" style={{ display: 'block', whiteSpace: 'normal' }} data-tip="The best of the arrangements tried: the search ran out of its budget before it could rule out a better one, so it may be under what this system can do">best tried</span> : null}
        {r.borrowed.length > 0 && <span className="sub" style={{ display: 'block', color: 'var(--acc2)' }} data-planets="find-borrowed" tabIndex={0} data-tip-title="On a borrowed rate" data-tip={borrowedTip(r.borrowed, ix)}>on a borrowed rate</span>}
      </td>
      <td data-planets="find-isk">
        {r.iskDay != null ? iskBig(r.iskDay) : <span data-tip={r.iskWhy ?? 'Not valued'}>–</span>}
        {r.beforeTax && <span className="sub" style={{ display: 'block' }} data-tip={`A planet's customs tax isn't known here, so this is before it: each 1% costs about ${iskBig(r.perPct)} a day. Type the rate on Plan for this system.`}>before customs</span>}
      </td>
      <td className="l" style={{ minWidth: 280, whiteSpace: 'normal', paddingTop: 6, paddingBottom: 6 }}>
        <span className="sub" data-planets="find-used">{r.used} of {r.piPlanets} used{repeated ? `, on each of ${r.chars}` : ''}{r.factories != null ? `, ${r.factories} of them factory planet${r.factories === 1 ? '' : 's'}` : ''}</span>
        <div className="pl-ptypes" style={{ marginTop: 3 }}>
          {[...count].map(([t, n]) => <span key={t} className="pl-ptype"><ItemIcon id={ix.planetTypes[t].typeId} size="sm" />{t}{n > 1 ? ` ×${n}` : ''}</span>)}
        </div>
      </td>
      <td className="l" data-planets="find-yours">{cols ? <span data-tip={`${whoseColonies(cols.who)} here: their planets are planned on what they gave`}>{cols.n} colon{cols.n === 1 ? 'y' : 'ies'}</span> : ''}</td>
      <td><button type="button" className="btn" data-planets={`plan-here:${s.id}`} onClick={(e) => { e.stopPropagation(); onPick(s.id, s.name); onPlanHere(s.id, good); }}>Plan it here</button></td>
    </tr>
  );
});
