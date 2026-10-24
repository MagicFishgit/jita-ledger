import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
import { byAccount } from '../../lib/accounts';
import { altLedger } from '../../lib/altLedger';
import { useAlts } from '../../lib/altStore';
import { hasScope } from '../../lib/auth';
import type { ColoniesDoc } from '../../lib/colonies';
import type { ColoniesRead } from '../../lib/colonyTotals';
import { SCOPE } from '../../lib/config';
import { navigate, type Route } from '../../lib/hooks';
import type { Graph } from '../../lib/jumps';
import type { PiIndex } from '../../lib/piBundle';
import { reloadApp } from '../../lib/reload';
import { jobOk, loginState } from '../../lib/roster';
import { PI_SKILLS } from '../../lib/skills';
import { useData } from '../../lib/store';
import { PilotProvider } from '../pilot';
import { Seg } from '../ui';
import type { Colonies as ColoniesSection } from './Colonies';
import { loadGraph } from './industryBundle';
import { useIndustryChars } from './industryChars';
import { loadPlanets } from './planetsBundle';
import type { PlanetsChart as ChartSection } from './PlanetsChart';
import type { PlanetsPlan as PlanSection } from './PlanetsPlan';
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
const SECTION_KEY = 'jita-ledger:planets-section';
const SHOW_KEY = 'jita-ledger:planets-show';
const COLONIES_SHOW_KEY = 'jita-ledger:planets-colonies-show';
const SYSTEM_KEY = 'jita-ledger:planets-system';
/** Plan it: the good Plan is held to, kept per browser until Every product lets it go. */
const GOOD_KEY = 'jita-ledger:planets-plan-good';
const readKept = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const keep = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* just not kept */ } };
const forget = (k: string) => { try { localStorage.removeItem(k); } catch { /* just not kept */ } };

/** A good Plan can be held to: one the bundle knows that a setup makes (P1 to P4); a P0 or an address's stray ID is every product. */
const heldTo = (ix: PiIndex, id: number | null): number | null => (id != null && ix.makes.has(id) ? id : null);

export const SECTIONS = [
  { key: 'plan', label: 'Plan', tip: 'Give it a system: each way of setting planets up, ranked by ISK a day, and which planet does what' },
  { key: 'chart', label: 'Chart', tip: 'Every planetary good from P0 to P4, and how each is made' },
  { key: 'colonies', label: 'Colonies', tip: 'Every character’s colonies as last read: what each makes a day, what’s wrong at its root, when each program ends, and how it compares with the planner’s best' },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

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
  const asked = Number(route.query.get('good')) || null;
  const [keptGood, setKeptGood] = useState<number | null>(() => Number(readKept(GOOD_KEY)) || null);
  useEffect(() => { if (asked != null) { setKeptGood(asked); keep(GOOD_KEY, String(asked)); } }, [asked]);
  const planGood = (id: number) => { setKeptGood(id); keep(GOOD_KEY, String(id)); keep(SECTION_KEY, 'plan'); navigate(`hustles/planets/plan?good=${id}`); };
  const everyProduct = () => { setKeptGood(null); forget(GOOD_KEY); navigate('hustles/planets/plan'); };

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

  const [ix, setIx] = useState<PiIndex | 'failed' | null>(null);
  const [graph, setGraph] = useState<Graph | 'failed' | null>(null);
  useEffect(() => {
    let alive = true;
    loadPlanets().then((b) => { if (alive) setIx(b); }, () => { if (alive) setIx('failed'); });
    loadGraph().then((g) => { if (alive) setGraph(g); }, () => { if (alive) setGraph('failed'); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="col" style={{ gap: 16 }} data-planets="tab">
      <div className="row pl-head">
        <Seg label="Planets section" value={section} onChange={choose} options={SECTIONS.map((s) => ({ v: s.key, label: s.label, tip: s.tip }))} />
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
      <PilotProvider value={shown.pilot}>
        {ix === 'failed' || (section !== 'colonies' && graph === 'failed') ? (
          <p className="note small" style={{ margin: 0 }}>Couldn’t load {ix === 'failed' ? 'the planets’ data' : 'the stargate map'} just now. {/* A chunk that failed can't be asked for again in the same page (gotchas.md): trying again is a reload. */}
            <button type="button" className="link-btn" onClick={() => void reloadApp()}>Reload to try again</button></p>
        ) : !ix || (section !== 'colonies' && !graph) ? (
          <p className="note small" style={{ margin: 0 }}>{section === 'colonies' ? 'Loading the planets’ data…' : 'Loading the planets’ data and the map…'}</p>
        ) : (
          <Suspense fallback={<p className="note small" style={{ margin: 0 }}>Loading this section…</p>}>
            {section === 'colonies' ? (
              <Colonies chars={chars} reads={reads} colonies={colonies} ix={ix} pick={chars.length > 1 ? coloniesFor : main.charId} />
            ) : section === 'chart' ? (
              <PlanetsChart key={shown.charId} c={shown} chars={chars} colonies={colonies} ix={ix} systemId={systemId} onPlan={() => choose('plan')} onPlanGood={planGood} />
            ) : (
              <PlanetsPlan key={shown.charId} c={shown} chars={chars} colonies={colonies} ix={ix} graph={graph as Graph} systemId={systemId} onSystem={chooseSystem} mainName={main.name}
                good={heldTo(ix, asked ?? keptGood)} onEveryProduct={everyProduct} />
            )}
          </Suspense>
        )}
        <div data-planets="skills">
          <SkillPanel title="Skills this wants" needs={PI_SKILLS}
            note="Interplanetary Consolidation is the one that pays for itself fastest: every level is another whole planet, and every setup above scales off the planet count." />
        </div>
      </PilotProvider>
    </div>
  );
}
