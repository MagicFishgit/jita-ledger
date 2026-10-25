import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { byAccount } from '../../lib/accounts';
import { altLedger } from '../../lib/altLedger';
import { getAlts, refreshAlts, useAlts } from '../../lib/altStore';
import { hasScope } from '../../lib/auth';
import { cloudAltRead } from '../../lib/cloud';
import { altPulledWhy } from '../../lib/setupCheck';
import type { ColoniesDoc } from '../../lib/colonies';
import type { ColoniesRead } from '../../lib/colonyTotals';
import { SCOPE } from '../../lib/config';
import { navigate, type Route } from '../../lib/hooks';
import type { Graph } from '../../lib/jumps';
import { regionOf, type PiIndex } from '../../lib/piBundle';
import { planCharOf } from '../../lib/piChar';
import { flowChars, goodWhy, sanitizeFlow, setupWhy, systemWhy, type FlowChoice } from '../../lib/piFlow';
import { reloadApp } from '../../lib/reload';
import { jobOk, loginState } from '../../lib/roster';
import { PI_SKILLS } from '../../lib/skills';
import { useData } from '../../lib/store';
import { PilotProvider } from '../pilot';
import { Seg } from '../ui';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Colonies as ColoniesSection } from './Colonies';
import { loadGraph } from './industryBundle';
import { useIndustryChars } from './industryChars';
import { loadPlanets, loadRegions } from './planetsBundle';
import type { PlanetsChart as ChartSection } from './PlanetsChart';
import type { PlanetsFind as FindSection } from './PlanetsFind';
import type { PlanetsPlan as PlanSection } from './PlanetsPlan';
import type { PlanetsSetup as SetupSection } from './PlanetsSetup';
import { SkillPanel } from './SkillPanel';

/**
 * Planets: plan a system, the chart of every good, and your colonies (docs/superpowers/specs/2026-10-17-planets-design.md). Its
 * sections sit in the address (hustles/planets/<section>) and the last one picked is kept per browser. "Show for" picks whose
 * skills, clone, fees and kept colonies the planner uses: the main, or an alt from its pulled copy, read and never written. The
 * system planned is kept per browser too. The one file of the tab that imports the alt store (scripts/check.mjs keeps the list).
 *
 * Plan, the Chart and Colonies each load as a chunk of their own when first shown (Ruling F2), so the other Side hustles tabs don't
 * carry the planner: as App.tsx's pages do, a chunk a deploy renamed reloads the app once; failing again, the section says so and
 * offers a reload (a failed dynamic import can't be asked for again in the same page: gotchas.md).
 */
const RELOADED_KEY = 'jita-ledger:reloaded-for-planets';
function section<P extends object>(load: () => Promise<Record<string, unknown>>, name: string) {
  return lazy(() => load().then((m) => {
    try { sessionStorage.removeItem(RELOADED_KEY); } catch { /* storage blocked */ }
    return { default: m[name] as ComponentType<P> };
  }, () => {
    try {
      if (!sessionStorage.getItem(RELOADED_KEY)) { sessionStorage.setItem(RELOADED_KEY, '1'); void reloadApp(); return new Promise<never>(() => {}); }
    } catch { /* storage blocked: say so */ }
    return { default: (() => <SectionFailed />) as ComponentType<P> };
  }));
}
function SectionFailed() {
  return (
    <p className="note small" style={{ margin: 0 }} data-planets="section-failed">Couldn’t load this section just now.{' '}
      <button type="button" className="link-btn" onClick={() => void reloadApp()}>Reload to try again</button></p>
  );
}
const PlanetsPlan = section<Parameters<typeof PlanSection>[0]>(() => import('./PlanetsPlan'), 'PlanetsPlan');
const PlanetsChart = section<Parameters<typeof ChartSection>[0]>(() => import('./PlanetsChart'), 'PlanetsChart');
const Colonies = section<Parameters<typeof ColoniesSection>[0]>(() => import('./Colonies'), 'Colonies');
const PlanetsFind = section<Parameters<typeof FindSection>[0]>(() => import('./PlanetsFind'), 'PlanetsFind');
const PlanetsSetup = section<Parameters<typeof SetupSection>[0]>(() => import('./PlanetsSetup'), 'PlanetsSetup');
const SECTION_KEY = 'jita-ledger:planets-section';
const SHOW_KEY = 'jita-ledger:planets-show';
const COLONIES_SHOW_KEY = 'jita-ledger:planets-colonies-show';
const SYSTEM_KEY = 'jita-ledger:planets-system';
/** Plan it: the good Plan is held to, kept per browser until Every product lets it go. */
const GOOD_KEY = 'jita-ledger:planets-plan-good';
/** Find: the region the system finder last looked in, kept per browser. */
const REGION_KEY = 'jita-ledger:planets-find-region';
/** Step 2's choices (planets-flow.md): the characters left out, the setup type and the skills what-if, kept per browser. */
const FLOW_KEY = 'jita-ledger:planets-flow';
/** The Chart's own pick (PlanetsChart.tsx keeps it): step 1's good when Plan isn't held to one. */
const CHART_PICK_KEY = 'jita-ledger:planets-good';
const readKept = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const keep = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* just not kept */ } };
const forget = (k: string) => { try { localStorage.removeItem(k); } catch { /* just not kept */ } };

/** A good Plan can be held to: one the bundle knows that a setup makes (P1 to P4); a P0 or an address's stray ID is every product. */
const heldTo = (ix: PiIndex, id: number | null): number | null => (id != null && ix.makes.has(id) ? id : null);

/**
 * The four steps (planets-flow.md: product, who and how, system, plan), then Colonies apart. The addresses stay as they were
 * (`chart`, `find`, `plan`, `colonies`), with `setup` for step 2, so every deep link and kept section lands where it did.
 */
export const SECTIONS = [
  { key: 'chart', step: 1, label: 'Product', tip: 'Step 1: pick the good to make, from every planetary good from P0 to P4, and see how each is made' },
  { key: 'setup', step: 2, label: 'Who and how', tip: 'Step 2: the characters to plan with, the factory character, the setup type and the skills to plan at' },
  { key: 'find', step: 3, label: 'System', tip: 'Step 3: the best systems in a region for the good, the most of it a day across the characters ticked first' },
  { key: 'plan', step: 4, label: 'Plan', tip: 'Step 4: the plan at the system chosen, each way of setting its planets up ranked, which planet does what, and how to build it' },
  { key: 'colonies', step: null, label: 'Colonies', tip: 'Every character’s colonies as last read: what each makes a day, what’s wrong at its root, when each program ends, and how it compares with the planner’s best' },
] as const;
type Section = (typeof SECTIONS)[number]['key'];
const readFlow = (): FlowChoice => { try { return sanitizeFlow(JSON.parse(localStorage.getItem(FLOW_KEY) ?? 'null')); } catch { return sanitizeFlow(null); } };

export function Planets({ route }: { route: Route }) {
  // The alt store is read here because this is the file allowed to read it (scripts/check.mjs keeps the list).
  const alts = useAlts();
  const chars = useIndustryChars(alts);
  const main = chars[0];
  const d = useData();
  // A kept character no longer on the roster falls back to the main, without forgetting the kept one: the roster loads after the tab first draws.
  const [keptShow, setKeptShow] = useState<number | null>(() => Number(readKept(SHOW_KEY)) || null);
  const shown = chars.find((c) => c.charId === keptShow) ?? main;
  // Colonies alone can show every character at once (All, Task 16), kept per browser apart from Show for, since Plan and the Chart
  // need one character: picking a character there picks it for Show for too.
  const [keptColonies, setKeptColonies] = useState<'all' | number | null>(() => { const v = readKept(COLONIES_SHOW_KEY); return v === 'all' ? 'all' : Number(v) || null; });
  const coloniesFor: 'all' | number = keptColonies === 'all' ? 'all' : chars.find((c) => c.charId === keptColonies)?.charId ?? shown.charId;
  const chooseShow = (id: number) => { setKeptShow(id); keep(SHOW_KEY, String(id)); setKeptColonies(id); keep(COLONIES_SHOW_KEY, String(id)); };
  const chooseColonies = (v: 'all' | number) => { if (v === 'all') { setKeptColonies('all'); keep(COLONIES_SHOW_KEY, 'all'); } else chooseShow(v); };

  const kept = readKept(SECTION_KEY);
  const section: Section = SECTIONS.find((s) => s.key === route.path[2])?.key ?? SECTIONS.find((s) => s.key === kept)?.key ?? 'plan';
  const choose = (s: Section) => { keep(SECTION_KEY, s); navigate(`hustles/planets/${s}`); };

  const [systemId, setSystemId] = useState<number | null>(() => Number(readKept(SYSTEM_KEY)) || null);
  const chooseSystem = (id: number | null) => { setSystemId(id); if (id == null) forget(SYSTEM_KEY); else keep(SYSTEM_KEY, String(id)); };

  // Plan it (19 October 2026): the good Plan is held to, from the address (hustles/planets/plan?good=<id>, the Chart's Plan it) and
  // kept per browser, so coming back to Plan keeps it; Every product lets it go, back to the ranking of every product.
  // The address's good holds Plan only on Plan: Find's (hustles/planets/find?good=<id>) is the finder's own, until Plan it here.
  const asked = section === 'plan' ? Number(route.query.get('good')) || null : null;
  const [keptGood, setKeptGood] = useState<number | null>(() => Number(readKept(GOOD_KEY)) || null);
  useEffect(() => { if (asked != null) { setKeptGood(asked); keep(GOOD_KEY, String(asked)); } }, [asked]);
  const planGood = (id: number) => { setKeptGood(id); keep(GOOD_KEY, String(id)); keep(SECTION_KEY, 'plan'); navigate(`hustles/planets/plan?good=${id}`); };
  const everyProduct = () => { setKeptGood(null); forget(GOOD_KEY); navigate('hustles/planets/plan'); };

  // Find (the system finder, planets-finder.md): the good and the region from the address (hustles/planets/find?good=<id>&region=<id>),
  // else the good Plan is held to and the region kept; Plan it here sets Plan's system and holds Plan to the good.
  const findGood = section === 'find' ? Number(route.query.get('good')) || null : null;
  const askedRegion = section === 'find' ? Number(route.query.get('region')) || null : null;
  const [keptRegion, setKeptRegion] = useState<number | null>(() => Number(readKept(REGION_KEY)) || null);
  useEffect(() => { if (askedRegion != null) { setKeptRegion(askedRegion); keep(REGION_KEY, String(askedRegion)); } }, [askedRegion]);
  const regionNow = askedRegion ?? keptRegion;
  const findFor = (good: number | null, region: number | null) => {
    const q = [good != null ? `good=${good}` : '', region != null ? `region=${region}` : ''].filter(Boolean).join('&');
    keep(SECTION_KEY, 'find');
    navigate(`hustles/planets/find${q ? `?${q}` : ''}`);
  };
  // Plan it here: what chooseSystem and planGood do, with nothing but setters and storage in it, so one function for good (Find's rows are
  // memoised on it: the review's Minor 5).
  const planHere = useCallback((sysId: number, good: number) => {
    setSystemId(sysId); keep(SYSTEM_KEY, String(sysId));
    setKeptGood(good); keep(GOOD_KEY, String(good)); keep(SECTION_KEY, 'plan'); navigate(`hustles/planets/plan?good=${good}`);
  }, []);
  // From Plan and the Chart: the region of the system chosen on Plan, read from the regions' chunk on the click; with none, the finder's own.
  const findNear = (good: number) => {
    if (systemId == null) { findFor(good, null); return; }
    loadRegions().then((rs) => findFor(good, regionOf(rs, systemId)?.id ?? null), () => findFor(good, null));
  };

  // Each character's kept colonies: the main's document, an alt's from its pulled copy (altLedger, sanitized once a copy), which the
  // cloud's hourly sheet keeps (Task 14). Every character's teach the planner its rates (Task 16).
  const colonies = useMemo(() => Object.fromEntries(chars.map((c): [number, ColoniesDoc | undefined] =>
    [c.charId, c.isMain ? d.colonies : alts.alts[c.charId] ? altLedger(alts.alts[c.charId]).colonies : undefined])), [chars, d.colonies, alts.alts]);
  // Where each character's colonies stand (the words are colonyTotals.ts' `coloniesWhy`): a kept document is read, a refused alt's
  // last read included (read data wins, said with lostSaid); else why not: the main's login without the planets permission, an
  // alt's login refused or not held, or handed over without the permission, or a first read still to come.
  const canPlanets = hasScope(SCOPE.planets);
  const reads = useMemo(() => Object.fromEntries(chars.map((c): [number, ColoniesRead] => {
    const doc = colonies[c.charId];
    if (c.isMain) return [c.charId, doc ? { state: 'read', value: doc, at: null } : canPlanets ? { state: 'unread' } : { state: 'login' }];
    const entry = alts.roster.find((e) => e.charId === c.charId);
    if (doc) return [c.charId, { state: 'read', value: doc, at: entry ? jobOk(entry, 'sheet') : null }];
    const login = entry ? loginState(entry, []) : { state: 'none' as const };
    if (login.state !== 'working') return [c.charId, { state: 'lost', why: login.state }];
    return [c.charId, entry!.scopes.includes(SCOPE.planets) ? { state: 'unread' } : { state: 'handOver' }];
  })), [chars, colonies, alts.roster, canPlanets]);

  // Check my setup on an alt's planet (planets-board.md): the cloud reads the alt now (its colonies with the rest of its sheet), and the
  // alt store pulls what changed. `refreshAlts` keeps a failed roster read to itself, so whether the alt's copy was pulled after the read
  // is checked on the store's state (`altPulledWhy`): never taken as read when it wasn't (Important 1 of the review).
  const readAlt = useMemo(() => async (id: number): Promise<string | null> => {
    await cloudAltRead(id);
    const since = Date.now();
    await refreshAlts();
    return altPulledWhy(getAlts(), id, since);
  }, []);

  // Step 2's choices (planets-flow.md), kept per browser: Plan, Find and the Chart plan with them.
  const [flow, setFlow] = useState<FlowChoice>(readFlow);
  const chooseFlow = (f: FlowChoice) => { setFlow(f); keep(FLOW_KEY, JSON.stringify(f)); };
  // Step 1's good: the Chart's pick (it says which as it changes), else the good Plan is held to.
  const [chartPick, setChartPick] = useState<number | null>(() => Number(readKept(CHART_PICK_KEY)) || null);
  const [systemName, setSystemName] = useState<{ id: number; name: string } | null>(null);
  const pickSystem = useCallback((id: number, name: string | null) => {
    setSystemId(id); keep(SYSTEM_KEY, String(id));
    if (name) setSystemName({ id, name });
  }, []);

  const [ix, setIx] = useState<PiIndex | 'failed' | null>(null);
  const [graph, setGraph] = useState<Graph | 'failed' | null>(null);
  useEffect(() => {
    let alive = true;
    loadPlanets().then((b) => { if (alive) setIx(b); }, () => { if (alive) setIx('failed'); });
    loadGraph().then((g) => { if (alive) setGraph(g); }, () => { if (alive) setGraph('failed'); });
    return () => { alive = false; };
  }, []);

  // The steps (planets-flow.md): each has Back and Next, Next named for where it goes and disabled with its reason until its step is
  // complete. Step 1's good is the Chart's pick, else the good Plan is held to.
  const ixOk = ix && ix !== 'failed' ? ix : null;
  const heldGood = ixOk ? heldTo(ixOk, asked ?? keptGood) : null;
  const productGood = ixOk ? heldTo(ixOk, chartPick) ?? (chartPick == null ? heldGood : null) : null;
  const listed = flowChars(chars.map((c) => planCharOf({ charId: c.charId, name: c.name, skills: c.pilot.skills, clone: c.clone })), flow, shown.charId);
  const sysSaid = systemId == null ? null : systemName?.id === systemId ? systemName.name : (graph && graph !== 'failed' ? graph[String(systemId)]?.[1] : null) ?? null;
  const toSetup = (good: number) => { setKeptGood(good); keep(GOOD_KEY, String(good)); keep(SECTION_KEY, 'setup'); navigate('hustles/planets/setup'); };
  const toPlan = () => { if (heldGood != null) planGood(heldGood); else choose('plan'); };
  const nav: { back: { label: string; go: () => void } | null; next: { label: string; go: () => void; why: string | null } | null } | null = !ixOk || section === 'colonies' ? null
    : section === 'chart' ? { back: null, next: { label: 'Next: who and how', why: chartPick != null && !productGood ? goodWhy(ixOk, chartPick) : goodWhy(ixOk, productGood), go: () => productGood != null && toSetup(productGood) } }
      : section === 'setup' ? { back: { label: 'Back: product', go: () => choose('chart') }, next: { label: 'Next: find a system', why: goodWhy(ixOk, heldGood) ?? setupWhy(listed, shown.charId), go: () => heldGood != null && findNear(heldGood) } }
        // Back from step 3 holds Plan to Find's good, so a find?good= link's good reaches step 2 (fix round 1's M2).
        : section === 'find' ? { back: { label: 'Back: who and how', go: () => { const g = heldTo(ixOk, findGood ?? keptGood); if (g != null) toSetup(g); else choose('setup'); } }, next: { label: sysSaid ? `Next: plan it at ${sysSaid}` : 'Next: plan it', why: systemWhy(systemId) ?? goodWhy(ixOk, findGood ?? keptGood), go: () => { const g = heldTo(ixOk, findGood ?? keptGood); if (g != null) planGood(g); else toPlan(); } } }
          : { back: { label: 'Back: system', go: () => (heldGood != null ? findNear(heldGood) : choose('find')) }, next: null };
  const stepOf = SECTIONS.find((x) => x.key === section)?.step ?? null;

  return (
    <div className="col" style={{ gap: 16 }} data-planets="tab">
      <div className="row pl-head">
        <Seg label="Planets section" value={section} onChange={choose}
          options={SECTIONS.map((s) => ({ v: s.key, label: s.step ? <><span className="pl-step-n" aria-hidden="true">{s.step}</span>{s.label}</> : s.label, tip: s.tip, tipTitle: s.step ? `Step ${s.step} of 4: ${s.label}` : s.label }))} />
        {chars.length > 1 && (section === 'colonies' ? (
          // The same picker with All in front: Colonies alone shows every character at once.
          <Seg<'all' | number> size="sm" label="Show for" value={coloniesFor} onChange={chooseColonies}
            options={[{ v: 'all', label: 'All', tip: 'Every character’s colonies, and what they make together', tipTitle: 'Show for every character' },
              ...byAccount(chars).map((c) => ({ v: c.charId as 'all' | number, label: c.name, group: c.group, tip: c.isMain ? 'Your colonies, skills and fees' : `${c.name}’s colonies, skills and fees, as the cloud last read them`, tipTitle: `Show for ${c.name}` }))]} />
        ) : (
          <Seg size="sm" label="Show for" value={shown.charId} onChange={chooseShow}
            options={byAccount(chars).map((c) => ({ v: c.charId, label: c.name, group: c.group, tip: c.isMain ? 'Your skills, clone, fees and colonies' : `${c.name}’s skills, clone and fees, as the cloud last read them`, tipTitle: `Show for ${c.name}` }))} />
        ))}
      </div>
      {nav && <StepNav step={stepOf} section={section} back={nav.back} next={nav.next} tag="step-nav" />}
      <PilotProvider value={shown.pilot}>
        {ix === 'failed' || (section !== 'colonies' && section !== 'setup' && graph === 'failed') ? (
          <p className="note small" style={{ margin: 0 }}>Couldn’t load {ix === 'failed' ? 'the planets’ data' : 'the stargate map'} just now. {/* A chunk that failed can't be asked for again in the same page (gotchas.md): trying again is a reload. */}
            <button type="button" className="link-btn" onClick={() => void reloadApp()}>Reload to try again</button></p>
        ) : !ix || (section !== 'colonies' && section !== 'setup' && !graph) ? (
          <p className="note small" style={{ margin: 0 }} data-planets="loading">{section === 'colonies' || section === 'setup' ? 'Loading the planets’ data…' : 'Loading the planets’ data and the map…'}</p>
        ) : (
          <Suspense fallback={<p className="note small" style={{ margin: 0 }} data-planets="loading">Loading this section…</p>}>
            {section === 'colonies' ? (
              <Colonies chars={chars} reads={reads} colonies={colonies} ix={ix} pick={chars.length > 1 ? coloniesFor : main.charId} ready={alts.ready} />
            ) : section === 'chart' ? (
              <PlanetsChart key={shown.charId} c={shown} chars={chars} colonies={colonies} ix={ix} systemId={systemId} onPlan={() => choose('plan')} onPlanGood={planGood} onFind={findNear} ready={alts.ready}
                flow={flow} onPickChange={setChartPick} />
            ) : section === 'setup' ? (
              <PlanetsSetup chars={chars} shown={shown.charId} onShow={chooseShow} flow={flow} onFlow={chooseFlow} ix={ix} good={heldGood} />
            ) : section === 'find' ? (
              <PlanetsFind key={shown.charId} c={shown} chars={chars} colonies={colonies} ix={ix} graph={graph as Graph} good={heldTo(ix, findGood ?? keptGood)} regionId={regionNow} planSystem={systemId}
                onGood={(id) => findFor(id, regionNow)} onRegion={(id) => { setKeptRegion(id); keep(REGION_KEY, String(id)); findFor(findGood ?? keptGood, id); }} onPlanHere={planHere} ready={alts.ready}
                flow={flow} onPick={pickSystem} mainName={main.name} />
            ) : (
              <PlanetsPlan key={shown.charId} c={shown} chars={chars} colonies={colonies} ix={ix} graph={graph as Graph} systemId={systemId} onSystem={chooseSystem} mainName={main.name}
                good={heldTo(ix, asked ?? keptGood)} onEveryProduct={everyProduct} ready={alts.ready} reads={reads} readAlt={readAlt} onFind={findNear} flow={flow} />
            )}
          </Suspense>
        )}
        {nav && section !== 'plan' && <StepNav step={stepOf} section={section} back={nav.back} next={nav.next} tag="step-nav-bottom" />}
        <div data-planets="skills">
          <SkillPanel title="Skills this wants" needs={PI_SKILLS}
            note="Interplanetary Consolidation is the one that pays for itself fastest: every level is another whole planet, and every setup above scales off the planet count." />
        </div>
      </PilotProvider>
    </div>
  );
}

/**
 * A step's Back and Next (planets-flow.md): Next named for where it goes, disabled with its reason (said beside it, and in its tip) until the
 * step is complete.
 */
function StepNav({ step, section, back, next, tag }: {
  step: number | null; section: Section; tag: string;
  back: { label: string; go: () => void } | null; next: { label: string; go: () => void; why: string | null } | null;
}) {
  const label = SECTIONS.find((x) => x.key === section)?.label ?? '';
  return (
    <div className="row pl-nav" data-planets={tag}>
      {step != null && <span className="pl-nav-step note small">Step {step} of 4 · {label}</span>}
      <span className="pl-nav-go">
        {back && <button type="button" className="btn" onClick={back.go} data-planets="back"><ArrowLeft aria-hidden="true" />{back.label}</button>}
        {next && <button type="button" className="btn primary" onClick={next.go} disabled={!!next.why} data-tip={next.why ?? undefined} data-planets="next">{next.label}<ArrowRight aria-hidden="true" /></button>}
      </span>
      {next?.why && <span className="note small pl-nav-why" data-planets="next-why">{next.why}.</span>}
    </div>
  );
}
