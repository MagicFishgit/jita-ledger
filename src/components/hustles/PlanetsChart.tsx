import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Cog, Cpu, Factory, Globe, MapPin, Pickaxe, X, type LucideIcon } from 'lucide-react';
import type { ColoniesDoc } from '../../lib/colonies';
import { iskBig, units } from '../../lib/format';
import { dayCount } from '../../lib/split';
import type { PlanetType } from '../../lib/pi';
import type { Commodity, PiIndex, Schematic, Tier } from '../../lib/piBundle';
import { canMake, goodsByTier, makingIn, missingFor, longestWord, RECIPE_WIDTH, recipeGrid, recipeOf, recipeTree, TIERS, typesWith, type CanMake } from '../../lib/piChart';
import { charWhy, fallbackSaid, NO_SKILLS, shippedOutput, type Setup, type SetupKind } from '../../lib/piPlan';
import { Points } from '../Facts';
import { edgeShape } from '../../lib/shipTree';
import { ItemIcon, Tiles } from '../ui';
import type { IndustryChar } from './industryChars';
import { useHomeHubs, useIndustryDoc } from './industryMarket';
import type { UnitBook, UnitNet } from './planetsMarket';
import { usePlanning } from './planetsPlanning';
import type { FlowChoice } from '../../lib/piFlow';
import { FindButton, KIND, Selling } from './PlanetsPlan';

/**
 * Chart: every planetary good from P0 to P4 by tier, each valued a unit and a m³ where it sells best for the character shown (Show
 * for's fees, the Industry tab's home hub and Sell at, as the Plan section prices). Picking one shows its recipe all the way down
 * to P0, with quantities and cycle times, the planet types its P0s come from, and, with a system chosen on Plan, the system's
 * planets that have them and which kinds of setup can make it there beside what the Plan section's ranking makes (one ranking,
 * planetsPlanning.ts). Goods the system's planets can't supply are greyed, `aria-disabled` but still pickable.
 */
const PICK_KEY = 'jita-ledger:planets-good';
const readPick = (): number | null => { try { return Number(localStorage.getItem(PICK_KEY)) || null; } catch { return null; } };
const keepPick = (id: number | null) => { try { if (id == null) localStorage.removeItem(PICK_KEY); else localStorage.setItem(PICK_KEY, String(id)); } catch { /* just not kept */ } };

const TIER_SAID: Record<Tier, string> = {
  P0: 'out of the ground: extractors',
  P1: 'Basic Industry Facilities',
  P2: 'Advanced Industry Facilities',
  P3: 'Advanced Industry Facilities',
  P4: 'High-Tech Production Plants, on Barren and Temperate planets',
};
const FACILITY: Record<Schematic['facility'], string> = { basic: 'Basic Industry Facility', advanced: 'Advanced Industry Facility', hightech: 'High-Tech Production Plant' };
const FACILITY_SHORT: Record<Schematic['facility'], string> = { basic: 'Basic', advanced: 'Advanced', hightech: 'High-Tech' };
const FACILITY_ICON: Record<Schematic['facility'], LucideIcon> = { basic: Factory, advanced: Cog, hightech: Cpu };
const listSaid = (xs: string[], and = 'and') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);
/** A value as a chip says it: cents under 100 ISK (a P0 is a few ISK), whole ISK above. */
const iskSaid = (v: number) => iskBig(Math.abs(v) >= 100 ? Math.round(v) : v);
/** How many one unit of the good takes: whole where whole, else to two places (never a known 0.4 read as 0). */
const needSaid = (n: number) => (Number.isInteger(n) ? units(n) : n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : n < 1000 ? 1 : 0 }));
function cycleSaid(sec: number): string {
  if (sec % 3600 === 0) return sec === 3600 ? 'every hour' : `every ${sec / 3600} hours`;
  return `every ${+(sec / 60).toFixed(1)} minutes`;
}
const whereSaid = (w: UnitNet['where'], hub: string | null) => (w === 'home' ? hub ?? 'the home hub' : 'Jita');
/** What the value was read from, said beside it (Ruling T12-2): a good the ranking doesn't name is on this morning's Jita book. */
const BOOK_SAID: Record<UnitBook, string> = {
  now: 'on its Jita book now', morning: 'on this morning’s Jita book', hub: 'on the hub’s own market’s read', goonmetrics: 'on Goonmetrics’ prices',
};
const valueSaid = (u: UnitNet, hub: string | null) => `at ${u.fallback ? 'Jita’s' : whereSaid(u.where, hub)}${u.book ? `, ${BOOK_SAID[u.book]}` : ''}`;
/** Ruling F11: a good the hub doesn't price, valued at Jita's: said with Jita's own listing price, so it can be listed at home at that. */
const fallbackUnit = (u: UnitNet) => (u.fallback ? fallbackSaid({ isk: u.isk, units: 1, fallback: u.fallback }) : null);

export function PlanetsChart({ c, chars, colonies, ix, systemId, onPlan, onPlanGood, onFind = null, ready: collected = false, flow, onPickChange }: {
  c: IndustryChar; chars: IndustryChar[]; colonies: Record<number, ColoniesDoc | undefined>; ix: PiIndex; systemId: number | null; onPlan: () => void;
  /** Every character's copy is loaded: the learned rates' record may be written (planner fix 2). */
  ready?: boolean;
  /** Plan it: opens Plan held to this good (`hustles/planets/plan?good=<id>`). */
  onPlanGood: (id: number) => void;
  /** Find the best system for this good (the system finder, planets-finder.md). */
  onFind?: ((id: number) => void) | null;
  /** Step 2's choices (planets-flow.md): one ranking with Plan's, so the Chart plans with the same characters and skills. */
  flow?: FlowChoice;
  /** Step 1 (planets-flow.md): the good picked, as it changes, for the steps' Next. */
  onPickChange?: (id: number | null) => void;
}) {
  const p = usePlanning({ c, chars, colonies, ix, systemId, ready: collected, flow });
  const tiers = useMemo(() => goodsByTier(ix), [ix]);
  const [pick, setPick] = useState<number | null>(() => { const k = readPick(); return k != null && ix.byId.has(k) ? k : null; });
  // A pick made now brings its recipe into view; a kept one drawn on opening the Chart doesn't scroll past the grid.
  const pickedNow = useRef(false);
  const choose = (id: number | null) => { pickedNow.current = id != null; setPick(id); keepPick(id); };
  useEffect(() => { onPickChange?.(pick); }, [pick, onPickChange]);
  const value = p.value;
  const sysName = value?.system.name ?? null;
  const types = useMemo(() => [...new Set((value?.planets ?? []).map((x) => x.type).filter((t): t is PlanetType => !!t))], [value]);
  // What the system can't supply, worked out once a system is in: none without one (nothing is greyed for no system).
  const missing = useMemo(() => new Map(value ? ix.commodities.map((g) => [g.id, missingFor(ix, g.id, types)] as const) : []), [ix, value, types]);
  const greyed = [...missing.values()].filter((m) => m.length).length;
  const ready = p.market.ready;
  const unit = (id: number): UnitNet => (ready ? p.market.unit(id) : { isk: null, where: null, why: null });
  // Each tier most ISK a unit first (the user, 24 October 2026: "so i can easily see the highest earners first"); a good not valued
  // goes last, in the bundle's order, as do all of them while prices aren't in.
  const byIsk = (gs: readonly Commodity[]) => {
    if (!ready) return gs;
    const v = new Map(gs.map((g) => [g.id, unit(g.id).isk] as const));
    return [...gs].sort((a, b) => { const x = v.get(a.id), y = v.get(b.id); return x == null ? (y == null ? 0 : 1) : y == null ? -1 : y - x; });
  };
  const hubShort = useHubName();

  return (
    <section className="col" style={{ gap: 16 }} data-planets="chart-section">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--body-2)', maxWidth: '72ch' }}>Every planetary good from P0 to P4: pick one to see how it’s made, all the way down to what comes out of the ground.</p>
        <Points compact items={[
          { kind: 'info', icon: Factory, lead: 'Each good', text: 'is valued a unit and a m³ where it nets most for you (the home hub and Sell at below, as on Plan): after your fees and, at Jita, the freight from your hub, so a P0 can come out under nothing.' },
          { kind: 'info', icon: Globe, lead: 'The system', text: 'chosen on Plan greys what its planets can’t supply, and names which of them have each P0.' },
        ]} />
      </div>
      <Selling said={p.market.said} />
      <SystemLine systemId={systemId} p={p} sysName={sysName} greyed={greyed} all={ix.commodities.length} onPlan={onPlan} />
      <div className="pl-chart-wrap">
        <div className="col pl-chart" data-planets="chart">
          {TIERS.map((t) => (
            <div key={t} className="pl-tier" data-planets={`tier:${t}`}>
              <div className="pl-tier-head"><b>{t}</b><span>{tiers[t].length} goods · {TIER_SAID[t]}</span></div>
              <div className="pl-goods">
                {byIsk(tiers[t]).map((g) => <GoodChip key={g.id} g={g} u={unit(g.id)} ready={ready} picked={pick === g.id} missing={missing.get(g.id) ?? []} sysName={sysName} ix={ix} hub={hubShort} onPick={() => choose(pick === g.id ? null : g.id)} />)}
              </div>
            </div>
          ))}
        </div>
        {pick != null && ix.byId.has(pick)
          ? <Tree key={pick} id={pick} ix={ix} p={p} unit={unit} hub={hubShort} missing={missing.get(pick) ?? []} sysName={sysName} scroll={pickedNow.current} onClose={() => choose(null)} onPlan={onPlan} onPlanGood={onPlanGood} onFind={onFind} />
          : <p className="note small pl-tree-none">Pick a good for its recipe down to P0{sysName ? `, which of ${sysName}’s planets supply it, and which setups make it there` : ''}.</p>}
      </div>
    </section>
  );
}

/** The home hub's short name, for "at UALX-3": the Industry doc's hub, as Selling reads it (null with none, or one not known here). */
function useHubName(): string | null {
  const [doc] = useIndustryDoc();
  const { hubs } = useHomeHubs();
  return hubs.find((h) => h.id === doc.hub)?.short ?? null;
}

/** Which system greys the chart: the one chosen on Plan, or how to choose one. */
function SystemLine({ systemId, p, sysName, greyed, all, onPlan }: { systemId: number | null; p: ReturnType<typeof usePlanning>; sysName: string | null; greyed: number; all: number; onPlan: () => void }) {
  if (systemId == null) {
    return (
      <p className="note small" style={{ margin: 0 }} data-planets="chart-system">No system chosen, so nothing is greyed: choose one on{' '}
        <button type="button" className="link-btn" onClick={onPlan}>Plan</button> (type its name, take where you are, or one your colonies are in) and the chart says which of its planets supply each good.</p>
    );
  }
  if (p.sys.state === 'loading') return <p className="note small" style={{ margin: 0 }} data-planets="chart-system">Reading the system’s planets…</p>;
  if (p.sys.state === 'failed') {
    return <p className="note small" style={{ margin: 0 }} data-planets="chart-system">The system’s planets couldn’t be read: {p.sys.error}. <button type="button" className="link-btn" onClick={p.sys.retry}>{'reload' in p.sys ? 'Reload to try again' : 'Try again'}</button></p>;
  }
  return (
    <p className="note small" style={{ margin: 0 }} data-planets="chart-system"><MapPin aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: '-2px', color: 'var(--acc)' }} /> At <b style={{ color: 'var(--ink)' }}>{sysName}</b>, chosen on{' '}
      <button type="button" className="link-btn" onClick={onPlan}>Plan</button>: {greyed ? `${greyed} of ${all} goods are greyed, needing a P0 none of its planets has.` : 'its planets have every P0, so nothing is greyed.'}</p>
  );
}

function GoodChip({ g, u, ready, picked, missing, sysName, ix, hub, onPick }: {
  g: Commodity; u: UnitNet; ready: boolean; picked: boolean; missing: number[]; sysName: string | null; ix: PiIndex; hub: string | null; onPick: () => void;
}) {
  const off = missing.length > 0;
  const name = (id: number) => ix.byId.get(id)?.name ?? `type ${id}`;
  const lines: string[] = [];
  if (off) {
    lines.push(`None of ${sysName}’s planets has ${listSaid(missing.map(name), 'or')}, so ${g.name} can’t be made from them.`, '',
      ...missing.map((m) => `• ${name(m)} is on ${listSaid(typesWith(ix, m))} planets.`),
      ...(g.tier === 'P2' || g.tier === 'P3' || g.tier === 'P4' ? ['', 'A factory on bought inputs may still make it: pick it to see.'] : []));
  }
  if (ready && u.isk == null) lines.push(...(lines.length ? [''] : []), `No value: ${u.why ?? 'no price read'}.`);
  else if (ready && u.isk != null) {
    lines.push(...(lines.length ? [''] : []), `${iskSaid(u.isk)} a unit ${valueSaid(u, hub)}, after your fees${u.where === 'jita' && (!u.fallback || u.fallback.route) ? ` and the freight from ${hub ?? 'your hub'}` : ''}; ${g.volume} m³ a unit.`);
    if (u.fallback) lines.push('', `${fallbackUnit(u)}.`);
    if (u.isk < 0) lines.push('', 'Under nothing: its fees and freight cost more than it sells for.');
  }
  return (
    <button type="button" className={'pl-good' + (picked ? ' sel' : '') + (off ? ' off' : '')} aria-pressed={picked} aria-disabled={off ? true : undefined}
      data-planets={`good:${g.id}`} data-isk={u.isk ?? undefined} data-book={u.isk != null ? u.book ?? undefined : undefined} data-fallback={u.isk != null && u.fallback ? 'jita' : undefined} data-tip={lines.length ? lines.join('\n') : undefined} data-tip-title={lines.length ? g.name : undefined} onClick={onPick}>
      <ItemIcon id={g.id} size="sm" />
      <span className="pl-good-text">
        <span className="pl-good-name">{g.name}</span>
        <span className={'pl-good-v' + (u.isk != null && u.isk < 0 ? ' neg' : '')}>{u.isk != null ? <>{iskSaid(u.isk)}<span className="sub">{iskSaid(u.isk / g.volume)} a m³{u.fallback ? ' · Jita’s' : ''}</span></> : '–'}</span>
      </span>
    </button>
  );
}

/** A picked good: its recipe down to P0, what the system lacks of it, its P0s' planets here, and which setups can make it there. */
function Tree({ id, ix, p, unit, hub, missing, sysName, scroll, onClose, onPlan, onPlanGood, onFind }: {
  id: number; ix: PiIndex; p: ReturnType<typeof usePlanning>; unit: (id: number) => UnitNet; hub: string | null; missing: number[]; sysName: string | null; scroll: boolean; onClose: () => void; onPlan: () => void; onPlanGood: (id: number) => void;
  onFind: ((id: number) => void) | null;
}) {
  const ref = useRef<HTMLElement>(null);
  // Below the grid (a phone, a narrow window) a recipe picked now would land out of sight: brought into view when it isn't. Only
  // on a pick: a kept recipe drawn when the Chart opens leaves the page at the grid.
  const scrollOnPick = useRef(scroll);
  useEffect(() => {
    const el = ref.current;
    if (!el || !scrollOnPick.current) return;
    const r = el.getBoundingClientRect();
    if (r.top > window.innerHeight - 60 || r.bottom < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);
  const g = ix.byId.get(id)!;
  const name = (x: number) => ix.byId.get(x)?.name ?? `type ${x}`;
  const steps = useMemo(() => recipeOf(ix, id), [ix, id]);
  const made = steps.filter((s) => s.schematic);
  const p0s = steps.filter((s) => !s.schematic);
  const parts = steps.slice(1);
  const u = unit(id);
  const planets = p.value?.planets ?? [];
  const short = (planetName: string) => (sysName && planetName.startsWith(`${sysName} `) ? planetName.slice(sysName.length + 1) : planetName);
  /** A P0's planets here, by planet type in the order the bundle gives them: "5-NZNW I, III and IV (Barren), 5-NZNW V (Temperate)". */
  const herePlanets = (p0: number): string | null => {
    const by = typesWith(ix, p0).map((t) => [t, planets.filter((x) => x.type === t)] as const).filter(([, xs]) => xs.length);
    if (!by.length) return null;
    return listSaid(by.map(([t, xs]) => `${sysName} ${listSaid(xs.map((x) => short(x.name)))} (${t})`));
  };
  const lacking = (stepId: number) => (missing.length ? missingFor(ix, stepId, [...new Set(planets.map((x) => x.type).filter((t): t is PlanetType => !!t))]) : []);

  const tree = useMemo(() => recipeTree(ix, id), [ix, id]);
  // The tree takes the width its box has (a scrollbar and the column's width vary), so a P3's columns share it and a P4's scroll.
  const [boxW, setBoxW] = useState(RECIPE_WIDTH - 24);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { const w = Math.floor(el.clientWidth); if (w > 0) setBoxW(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tree.rows > 0]);
  const grid = useMemo(() => recipeGrid(tree.cols, longestWord(ix), boxW), [ix, tree.cols, boxW]);
  const lacksP0 = (x: number) => missing.includes(x);
  const termsOf = (xs: { id: number; qty: number }[]) => xs.map((i, k) => (
    <span key={i.id}>{k > 0 && <span className="pl-plus"> + </span>}<span className="pl-term" data-tip={name(i.id)}><ItemIcon id={i.id} size="sm" /><b>{units(i.qty)}</b>{' '}<span className="nm">{name(i.id)}</span></span></span>
  ));

  return (
    <section ref={ref} className="pl-tree" data-planets="tree" aria-label={g.name}>
      <div className="pl-tree-head">
        <ItemIcon id={id} size="lg" />
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          <b>{g.name}</b>
          <span className="sub">{g.tier} · {g.volume} m³ a unit</span>
          <span className="sub">{u.isk != null ? `Valued ${valueSaid(u, hub)}` : u.why ? `no value: ${u.why}` : 'not valued yet'}</span>
          {u.isk != null && u.fallback && <span className="sub pl-up" data-planets="tree-fallback">{fallbackUnit(u)}.</span>}
        </div>
        <div className="pl-tree-acts">
          {g.tier !== 'P0' && <PlanIt id={id} name={g.name} onPlanGood={onPlanGood} />}
          {onFind && (g.tier === 'P1' || g.tier === 'P2' || g.tier === 'P3') && <FindButton name={g.name} onFind={() => onFind(id)} />}
          <button type="button" className="icon-btn" aria-label="Close the recipe" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
      </div>
      <div data-planets="tree-value">
        <Tiles inset min={140} items={[
          { l: 'ISK a unit', v: u.isk != null ? iskSaid(u.isk) : '–', c: u.isk != null && u.isk < 0 ? 'var(--neg)' : undefined, n: u.isk != null && u.isk < 0 ? 'Fees and freight cost more than it sells for' : undefined },
          { l: 'ISK a m³', v: u.isk != null ? iskSaid(u.isk / g.volume) : '–', c: u.isk != null && u.isk < 0 ? 'var(--neg)' : undefined },
        ]} />
      </div>
      {parts.length > 0 && (
        <div className="col pl-lines" data-planets="needs">
          <span className="lbl">What {g.name} is made from</span>
          <span className="note small">Read right to left: each good is made from the ones to its right, and the number is how many go into one {g.name}.</span>
          <div className="pl-tree-scroll" ref={box}>
            <div className="pl-rtree" data-planets="recipe-tree" role="group" aria-label={`${g.name}, down to P0`} style={{ width: tree.cols * grid.colW, height: tree.rows * grid.rowH }}>
              <svg className="pl-rtree-edges" width={tree.cols * grid.colW} height={tree.rows * grid.rowH} aria-hidden="true">
                {tree.edges.map(([a, b]) => {
                  const e = edgeShape(tree.nodes[a], tree.nodes[b]), X = (v: number) => v * grid.colW, Y = (v: number) => v * grid.rowH;
                  return <path key={`${a}-${b}`} d={`M${X(e.x1)} ${Y(e.y1)} H${X(e.xa)} C${X(e.m)} ${Y(e.y1)}, ${X(e.m)} ${Y(e.y2)}, ${X(e.xb)} ${Y(e.y2)} H${X(e.x2)}`} />;
                })}
              </svg>
              {tree.nodes.map((n) => {
                const c = ix.byId.get(n.id);
                return (
                  <span key={n.i} className={'pl-rnode' + (c?.tier === 'P0' && lacksP0(n.id) ? ' off' : '') + (n.i === 0 ? ' top' : '')} data-planets={`node:${n.id}`} data-tip={name(n.id)}
                    style={{ left: n.col * grid.colW + (grid.colW - grid.cardW) / 2, top: n.row * grid.rowH + (grid.rowH - grid.cardH) / 2, width: grid.cardW, height: grid.cardH }}>
                    <ItemIcon id={n.id} size="sm" />
                    <span className="pl-rnode-t"><span className="nm">{name(n.id)}</span><span className="pl-rnode-n">{n.i === 0 ? c?.tier : `${c?.tier} · ${needSaid(n.need)}`}</span></span>
                  </span>
                );
              })}
            </div>
          </div>
          <span className="lbl" style={{ marginTop: 4 }}>In all, one {g.name} takes</span>
          {TIERS.filter((t) => parts.some((s) => s.tier === t)).reverse().map((t) => (
            <div key={t} className="pl-need"><b>{t}</b><div className="pl-need-grid">{parts.filter((s) => s.tier === t).map((s) => <span key={s.id} className="pl-need-cell"><ItemIcon id={s.id} size="sm" /><span className="nm">{name(s.id)}</span><span className="n">{needSaid(s.need)}</span></span>)}</div></div>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <p className="pl-line pl-up" style={{ margin: 0 }} data-planets="missing">{sysName}’s planets can’t supply it: none has {listSaid(missing.map((m) => `${name(m)} (on ${listSaid(typesWith(ix, m))} planets)`), 'or')}.</p>
      )}
      {made.length > 0 && (
        <div className="col pl-lines">
          <span className="lbl">How it’s made</span>
          {made.map((s) => {
            const lacks = lacking(s.id);
            const F = FACILITY_ICON[s.schematic!.facility];
            return (
              <div key={s.id} className={'pl-stepcard' + (lacks.length ? ' off' : '')} data-planets={`step:${s.id}`}>
                <div className="pl-eq">
                  <span className="pl-ins">{termsOf(s.schematic!.inputs)}</span>
                  <span className="pl-result"><span className="pl-arrow" aria-hidden="true"> → </span>
                    <span className="pl-term out"><ItemIcon id={s.id} size="sm" /><b>{units(s.schematic!.out.qty)}</b>{' '}<span className="nm">{name(s.id)}</span></span></span>
                </div>
                <div className="pl-step-meta">
                  <span className="pl-badge" data-tip={FACILITY[s.schematic!.facility]} data-planets="facility"><F aria-hidden="true" />{FACILITY_SHORT[s.schematic!.facility]}</span>
                  <span className="pl-badge clock"><Clock aria-hidden="true" />{cycleSaid(s.schematic!.cycleSeconds)}</span>
                  <span className="sub">{s.tier}</span>
                  {s.id !== id && <span className="pill-tag">{needSaid(s.need)} for each {g.name}</span>}
                </div>
                {lacks.length > 0 && <span className="pl-why">Can’t be made from {sysName}’s planets: no {listSaid(lacks.map(name), 'or')}.</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="col pl-lines">
        <span className="lbl">{g.tier === 'P0' ? 'Where it comes from' : 'Out of the ground'}</span>
        {p0s.map((s) => {
          const here = sysName ? herePlanets(s.id) : null;
          const types = typesWith(ix, s.id);
          return (
            <div key={s.id} className="pl-stepcard" data-planets={`p0:${s.id}`}>
              <div className="pl-eq"><span className="pl-term out"><ItemIcon id={s.id} size="sm" /><b>{name(s.id)}</b></span>
                <span className="sub">P0{s.id !== id ? ` · ${needSaid(s.need)} for each ${g.name}` : ''}</span></div>
              {/* The planet types as chips in a row (the user, 24 October 2026: a sentence of icons, commas and "and" "looks a bit off"). */}
              <div className="pl-ptypes" aria-label={`On ${listSaid(types)} planets`}><Pickaxe aria-hidden="true" className="pl-ico" /><span className="sub">On</span>
                {types.map((t) => <span key={t} className="pl-ptype"><ItemIcon id={ix.planetTypes[t].typeId} size="sm" />{t}</span>)}</div>
              {sysName && (here ? <span className="pl-line">At {sysName}: {here}.</span> : <span className="pl-line pl-up">None of {sysName}’s planets has it.</span>)}
            </div>
          );
        })}
      </div>
      {sysName ? <Makes id={id} ix={ix} p={p} sysName={sysName} onPlan={onPlan} onPlanGood={onPlanGood} />
        : g.tier !== 'P0' && <span className="note small">Choose a system on Plan to see which of its setups can make it.</span>}
    </section>
  );
}

/**
 * Which setups can make it at the system: each kind that can (by what it sells, from these planets' types) or that the Plan section's
 * ranking does make it with, and for each what the ranking does; the kinds that can't, in one line.
 */
/**
 * Plan it (the user, 19 October 2026: "I am clicking on Gel-Matrix Biopaste which is the one I want to go for but when I go to PLAN I
 * don't think it is showing how to build it on which planet to make that item"): opens Plan held to this good, every setup type's
 * best way to make it here ranked, with which planet does what. No setup sells a P0, so a P0 has none.
 */
function PlanIt({ id, name, onPlanGood }: { id: number; name: string; onPlanGood: (id: number) => void }) {
  return (
    <button type="button" className="btn" data-planets="plan-it" onClick={() => onPlanGood(id)}
      data-tip={`Plan ${name}: the most of it your planets can make a day at your skills, and which planet does what`}>Plan it</button>
  );
}

function Makes({ id, ix, p, sysName, onPlan, onPlanGood }: { id: number; ix: PiIndex; p: ReturnType<typeof usePlanning>; sysName: string; onPlan: () => void; onPlanGood: (id: number) => void }) {
  const planets = p.value?.planets ?? [];
  const types = [...new Set(planets.map((x) => x.type).filter((t): t is PlanetType => !!t))];
  const can = canMake(ix, id, types);
  const making = p.setups ? makingIn(p.setups, id) : [];
  const blocked = charWhy(p.planChar);
  const waiting = !blocked && !p.morning.ready;
  const working = !blocked && !waiting && (!p.setups || p.working);
  const name = (x: number) => ix.byId.get(x)?.name ?? `type ${x}`;
  const pname = (pid: number) => { const n = planets.find((x) => x.planetId === pid)?.name ?? `planet ${pid}`; return n.startsWith(`${sysName} `) ? n.slice(sysName.length + 1) : n; };
  const shown = can.filter((x) => x.can || making.some((m) => m.kind === x.kind));
  const not = can.filter((x) => !shown.includes(x));
  const g = ix.byId.get(id)!;
  const verb = g.tier === 'P0' ? 'extracts' : 'makes';
  // The planets named only when some of the system's kinds of planet would do and others wouldn't.
  const typesOn = (x: CanMake) => {
    if (x.on.length === types.length) return 'any planet here';
    const here = planets.filter((pl) => pl.type && x.on.includes(pl.type));
    return `its ${listSaid(x.on)} planet${here.length === 1 ? '' : 's'} (${sysName} ${listSaid(here.map((pl) => pname(pl.planetId)))})`;
  };
  // What it can do here, always said as "can" (Ruling T12-1), kept apart from what the ranking does ("As ranked on Plan").
  const canSaid = (x: CanMake): string => {
    if (!x.can) return `can’t sell it (${x.why}).`;
    if (x.kind === 'p1' || x.kind === 'p2') return `can make it alone on ${typesOn(x)}.`;
    if (x.kind === 'bought') return `can, on inputs bought at the market, with its factory on ${typesOn(x)}.`;
    if (x.kind === 'chain') return `can${x.when ? `, ${x.when}` : ''}: every P0 it needs is on these planets, extracted across your characters’ colonies, with its factory on ${typesOn(x)}.`;
    if (x.kind === 'team') return `can${x.when ? `, ${x.when}` : ''}: every P0 it needs is on these planets, extracted across your characters’ colonies and fed to the shown character’s factory planets on ${typesOn(x)}.`;
    return `can: every P0 it needs is on these planets, fed to a factory on ${typesOn(x)}.`;
  };
  const rankSaid = (kind: SetupKind): string => {
    if (blocked) return '';
    if (waiting || !p.setups) return '';
    const s = p.setups.find((x) => x.kind === kind);
    const m = making.find((x) => x.kind === kind);
    if (m) return `As ranked on Plan, it ${verb} ${dayCount(m.perDay)} a day on ${sysName} ${listSaid(m.planets.map(pname))}${m.sold ? '' : `, to make what it sells (${outputsSaid(s, name)})`}.`;
    if (!s) return '';
    if (s.why) return `As ranked on Plan, it isn’t planned here: ${s.why.charAt(0).toLowerCase()}${s.why.slice(1)}.`;
    const outs = outputsSaid(s, name);
    return outs ? `As ranked on Plan, its best here makes ${outs} instead.` : '';
  };
  return (
    <div className="col pl-lines" data-planets="makes">
      <span className="lbl">Which setups can make it at {sysName}</span>
      {blocked ? <span className="note small">{blocked === NO_SKILLS ? 'Skills aren’t read for this character, so no setup is ranked; what each kind of setup can make here is by these planets alone.' : `${blocked}: no setup is ranked for this character; what each kind can make here is by these planets alone.`}</span>
        : waiting ? <span className="note small">Prices aren’t in yet, so no setup is ranked: {p.morning.said}</span>
          : working ? <span className="note small" data-planets="working">Working the setups out as Plan does…</span> : null}
      {shown.length ? shown.map((x) => (
        <span key={x.kind} className="pl-line" data-planets={`makes:${x.kind}`}><b>{KIND[x.kind].label}</b>: {[canSaid(x), rankSaid(x.kind)].filter(Boolean).join(' ')}</span>
      )) : <span className="pl-line">{g.tier === 'P0' ? 'No setup sells P0: each refines what it extracts first.' : 'None can make it from these planets.'}</span>}
      {not.length > 0 && <span className="note small" data-planets="makes-not">These can’t: {not.map((x) => `${lower(KIND[x.kind].label)} (${x.why})`).join('; ')}.</span>}
      <span className="note small">Ranked by ISK a day, with which planet does what, on <button type="button" className="link-btn" onClick={onPlan}>Plan</button>.</span>
    </div>
  );
}

/** A setup's name inside a sentence: "a chain across characters", "P0 → P1 on each planet". */
const lower = (s: string) => (/^P\d/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const outputsSaid = (s: Setup | undefined, name: (id: number) => string) => (s ? listSaid(s.outputs.filter(shippedOutput).map((o) => name(o.id))) : '');
