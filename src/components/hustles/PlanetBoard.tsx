import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronRight, ClipboardCheck, CircleCheck, CirclePlus, CircleX, Clock, Hammer, Info } from 'lucide-react';
import type { AccountRef } from '../../lib/accounts';
import { hasScope } from '../../lib/auth';
import { cloudEnabled } from '../../lib/cloud';
import type { ColoniesDoc } from '../../lib/colonies';
import { colonyChain } from '../../lib/colonyChain';
import { getColonies, PLANETS_SCOPE, readColonies } from '../../lib/colonyStore';
import { coloniesWhy, type ColoniesRead } from '../../lib/colonyTotals';
import { ago, units } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import type { PiIndex } from '../../lib/piBundle';
import { PI_READING, poorShare, type Rate } from '../../lib/piLearn';
import type { PlanChar, Role, Sell, Setup } from '../../lib/piPlan';
import { boardOf, buildSteps, cardKey, dropStale, FACILITY_SHORT, factoryCounts, headsNeeded, headsNeedSaid, levelNeeded, roleSig, ticked, ticksDone, type Ticks } from '../../lib/planetBoard';
import type { Tax } from '../../lib/planetsDoc';
import { lostSaid } from '../../lib/pilot';
import { checkSaid, mainReadWhy, setupCheck, type CheckItem, type FeedersChecked } from '../../lib/setupCheck';
import { dayCount } from '../../lib/split';
import { Check, ItemIcon, Tip } from '../ui';
import type { IndustryChar } from './industryChars';
import type { SystemPlanet } from './planetsMarket';

/**
 * The planet board (docs/notes/planets-board.md): a setup's planets as cards, what each does drawn as goods and factories rather
 * than paragraphs, a fed setup's feeders joined to its factory planet by lines labelled with what travels, each planet's Build it list
 * with ticks kept in this browser, and Check my setup, which reads each character's colony on the planet fresh and sets it against the
 * plan (setupCheck.ts). The user (24 October 2026): "the planner itself suffers from information overload. if we can use better ui to
 * help you understand what to do on which planet etc that would be great." Nothing here works a setup out: it draws the planner's.
 */

const aDay = (n: number) => dayCount(n);
const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const NO_TAX: Tax = { rate: null, from: 'none', npc: 0, interbus: false };

/** What a card's Check my setup needs: every character, those doing planetary industry, their kept colonies, how each was read. */
export type CheckCtx = {
  chars: IndustryChar[];
  /** The characters doing planetary industry (skills read, not Alpha): each gets a result on a one-character setup's planets. */
  pi: number[];
  colonies: Record<number, ColoniesDoc | undefined>;
  reads: Record<number, ColoniesRead>;
  /**
   * Runs an alt's full read in the cloud and waits for its pull (Planets.tsx, the one file of the tab that reads the alt store): null when
   * its copy here was pulled after the read, else why not (`altPulledWhy`).
   */
  readAlt: ((id: number) => Promise<string | null>) | null;
  sell: Sell;
};

// --- Fresh reads, shared by every card: one character's colonies read once however many cards ask, kept until the next or a reload.
/** `unpulled`: the cloud read an alt, but its copy here wasn't pulled after it: nothing is judged as fresh (Important 1 of the review). */
type Fresh = { state: 'reading' } | { state: 'read'; at: number } | { state: 'failed'; why: string; at: number } | { state: 'unpulled'; why: string; at: number };
const fresh = new Map<number, Fresh>();
const checked = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
const bump = () => { version++; listeners.forEach((l) => l()); };
// Defined once: an inline subscribe would resubscribe every render (gotchas.md).
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const snapshot = () => version;
const useChecks = () => useSyncExternalStore(subscribe, snapshot);
/** How long an alt's read in the cloud is waited for before it's said not to have come back. */
export const ALT_READ_BOUND_MS = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Why a character's colonies can't be read fresh here, in the Colonies section's words; null when they can. */
function cantRead(c: IndustryChar, ctx: CheckCtx): string | null {
  const read = ctx.reads[c.charId] ?? { state: 'unread' };
  if (c.isMain) return hasScope(PLANETS_SCOPE) ? null : coloniesWhy(c, { state: 'login' });
  if (!cloudEnabled() || !ctx.readAlt) return `The cloud isn’t on in this browser, and ${c.name}’s colonies are read by the cloud`;
  if (read.state === 'handOver' || read.state === 'lost') return coloniesWhy(c, read);
  return lostSaid(c);
}

function startRead(c: IndustryChar, ctx: CheckCtx) {
  if (fresh.get(c.charId)?.state === 'reading' || cantRead(c, ctx)) return;
  fresh.set(c.charId, { state: 'reading' });
  bump();
  const run: Promise<string | null> = c.isMain ? (async () => {
    // A read already running (Colonies' button, To do) answers with the last read: wait it out, then read, and say "read" only when a
    // new read came back (Minor 3 of the review).
    for (let i = 0; getColonies().busy && i < 120; i++) await sleep(500);
    const before = getColonies().read?.at ?? null;
    await readColonies(0, true);
    const why = mainReadWhy(before, getColonies());
    if (why) throw new Error(why);
    return null;
  })() : Promise.race([ctx.readAlt!(c.charId), sleep(ALT_READ_BOUND_MS).then((): never => { throw new Error(`the cloud’s read of ${c.name} hadn’t come back after ${ALT_READ_BOUND_MS / 1000} seconds`); })]);
  run.then((unpulled) => { fresh.set(c.charId, unpulled ? { state: 'unpulled', why: unpulled, at: Date.now() } : { state: 'read', at: Date.now() }); },
    (e: unknown) => {
      const why = (e as { status?: number }).status === 404 ? `the cloud is a version behind, and can’t read ${c.name} on demand yet`
        : e instanceof Error ? e.message.charAt(0).toLowerCase() + e.message.slice(1) : String(e);
      fresh.set(c.charId, { state: 'failed', why, at: Date.now() });
    }).finally(bump);
}

/** Every character whose colony on this planet the check reads: a chain's or a factory character's card is its own character's; any other, every PI character's. */
function whoChecks(s: Setup, r: Role, ctx: CheckCtx): IndustryChar[] {
  if (s.kind === 'chain' || s.kind === 'team') return ctx.chars.filter((c) => c.charId === r.charId);
  const has = (c: IndustryChar) => !!ctx.colonies[c.charId]?.colonies.some((k) => k.planetId === r.planetId);
  return ctx.chars.filter((c) => ctx.pi.includes(c.charId) || c.charId === r.charId || has(c));
}

// --- Build it: ticks kept per browser, by card (`cardKey`: system, good, setup kind, planet and character), under the planet's layout:
// one kept under another layout is deleted when seen, so switching back brings none back (planetBoard.ts' `dropStale`).
const BUILD_KEY = 'jita-ledger:planets-build';
const readTicks = (): Ticks => { try { return JSON.parse(localStorage.getItem(BUILD_KEY) ?? '{}') as Ticks; } catch { return {}; } };
const writeTicks = (t: Ticks) => { try { localStorage.setItem(BUILD_KEY, JSON.stringify(t)); } catch { /* just not kept */ } };
function useTicks(key: string, sig: string): [Set<string>, (id: string, on: boolean) => void] {
  const [all, setAll] = useState<Ticks>(readTicks);
  useEffect(() => {
    const held = readTicks(), next = dropStale(held, key, sig);
    if (next !== held) { writeTicks(next); setAll(next); }
  }, [key, sig]);
  const done = useMemo(() => new Set(ticksDone(all, key, sig)), [all, key, sig]);
  const set = (id: string, on: boolean) => {
    const next = ticked(readTicks(), key, sig, id, on, Date.now());
    writeTicks(next);
    setAll(next);
  };
  return [done, set];
}

/** A rate in words, as the planner's planet lines say it: its source and its heads. */
function rateSaid(e: Role['extracts'][number], name: (id: number) => string, t: string | null): string {
  const from = e.setAside ? `${e.setAside.from === 'typed' ? 'your typed rate' : e.setAside.otherType ? `the rate learned on ${e.setAside.otherType} planets` : 'another P0’s rate'} set aside, its heads more than fit: if your extractors deliver it`
    : !e.rate ? 'no rate: if your extractors deliver it' : e.rate.from === 'typed' ? 'typed' : e.rate.otherP0 ? 'learned for another P0'
      : e.rate.otherType ? `learned on ${e.rate.otherType} planets` : ownSaid(e.rate, t) ?? (e.rate.before ? 'learned before' : 'learned');
  const heads = e.heads != null ? `${e.heads} head${e.heads === 1 ? '' : 's'}` : e.rate && !(e.rate.heads > 0) ? 'heads not known: the colony didn’t say how many' : 'heads not known';
  return `${name(e.p0)} at ${units(e.perHour)} an hour (${from}; ${heads})`;
}
/** A planet's own rate (planet rates): "learned on this planet: about 67% a head of your other Gas planets". */
const ownSaid = (r: Rate, t: string | null) => (r.own && r.factor != null ? `learned on this planet: about ${Math.round(r.factor * 100)}% a head of your other ${t ? `${t} ` : ''}planets` : null);

/** A good as the board draws it: its icon and name, and how many a day after the name when it's a flow. */
function Term({ id, n, name, out, tip }: { id: number; n?: number; name: (id: number) => string; out?: boolean; tip?: string }) {
  return (
    <span className={'pl-term' + (out ? ' out' : '')} data-tip={tip ?? name(id)}>
      <ItemIcon id={id} size="sm" /><span className="nm">{name(id)}</span>{n != null && <><b>{aDay(n)}</b><span className="pl-aday">a day</span></>}
    </span>
  );
}
const Arrow = () => <span className="pl-arrow" aria-hidden="true">→</span>;
/** How far apart two wire labels sit in a factory character's gutter, at least: a label is two lines. */
const LABEL_GAP = 44;

export function PlanetBoard({ s, ix, planets, chars, name, details, words, systemId, good, programHours, ctx, accountOf = () => null }: {
  s: Setup; ix: PiIndex; planets: SystemPlanet[]; chars: PlanChar[]; name: (id: number) => string;
  /** Each character's account (the Characters page): a factory character's groups name it once any is set. */
  accountOf?: (charId: number) => AccountRef | null;
  /** The setup's Details is open: every card shows the planner's words for its planet (where its figures come from). */
  details: boolean; words: (r: Role) => ReactNode;
  /** The system and the good planned (null: every product), for each card's key (`cardKey`). */
  systemId: number; good: number | null; programHours: number;
  /** Check my setup's reads; null where none is offered. */
  ctx: CheckCtx | null;
}) {
  const b = useMemo(() => boardOf(s), [s]);
  // A kept plan is a kind of its own: its cards' ticks and checks are never another setup's (Important 2 of the review).
  const keyOf = (r: Role) => cardKey(systemId, good, s.kept ? `kept-${s.kind}` : s.kind, r.planetId, r.charId);
  const owners = new Set(s.roles.filter((r) => r.does !== 'unused').map((r) => r.charId));
  const whose = (r: Role) => (owners.size > 1 ? chars.find((c) => c.charId === r.charId)?.name ?? `Character ${r.charId}` : null);
  const card = (r: Role, at: 'feeder' | 'factory' | 'row') => (
    <PlanetCard key={`${r.planetId}:${r.charId}`} r={r} s={s} at={at} ix={ix} planet={planets.find((p) => p.planetId === r.planetId)} planets={planets} pname={(id) => planets.find((p) => p.planetId === id)?.name ?? `planet ${id}`} name={name} whose={whose(r)}
      cc={chars.find((c) => c.charId === r.charId)?.ccLevel ?? null} words={details ? words(r) : null} cardKey={keyOf(r)} keyOf={keyOf} programHours={programHours} ctx={ctx} />
  );
  return (
    <div className="pl-board-scroll" data-planets="board">
      {b.layout === 'row' ? <div className="pl-board row">{b.groups[0].roles.map((r) => card(r, 'row'))}</div>
        : b.layout === 'team' ? <TeamFlow b={b} card={card} name={name} charName={(id) => chars.find((c) => c.charId === id)?.name ?? `Character ${id}`} accountOf={accountOf} factoryChar={s.team?.factoryChar ?? null}
          parts={s.team?.parts ?? []} good={s.made?.id ?? null} />
          : <Flow b={b} card={card} name={name} charName={(id) => chars.find((c) => c.charId === id)?.name ?? `Character ${id}`} planets={planets} />}
    </div>
  );
}

/**
 * A fed setup: feeders on the left (a chain's by character), the factory planet on the right, a line from each feeder to it labelled
 * with each good it ships there and how many a day. The lines are drawn once the cards are laid out (their heights vary), and again
 * when any card changes size (a Build it list opened, a check's result).
 */
function Flow({ b, card, name, charName, planets }: {
  b: ReturnType<typeof boardOf>; card: (r: Role, at: 'feeder' | 'factory') => ReactNode; name: (id: number) => string; charName: (id: number) => string; planets: SystemPlanet[];
}) {
  const box = useRef<HTMLDivElement>(null);
  type Wire = { key: string; d: string; x: number; y: number; goods: { id: number; perDay: number }[]; from: number };
  const [wires, setWires] = useState<{ w: number; h: number; list: Wire[] } | null>(null);
  const feeders = b.groups.flatMap((g) => g.roles);
  const sig = feeders.map((r) => `${r.planetId}:${r.charId}:${(b.edges.get(r) ?? []).map((e) => `${e.id}x${Math.round(e.perDay)}`).join(',')}`).join(' ');
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const f = el.querySelector<HTMLElement>('[data-board="factory"]')?.getBoundingClientRect();
      if (!f) return;
      const rows = [...el.querySelectorAll<HTMLElement>('[data-board="feeder"]')];
      // A feeder card is as wide as what it holds (fix round 1), so its line starts at its own edge; the column's edge is where the gutter starts.
      const colRight = (el.querySelector<HTMLElement>('.pl-feeders')?.getBoundingClientRect().right ?? f.left) - base.left;
      const into = feeders.map((r, i) => ({ r, rect: rows[i]?.getBoundingClientRect(), goods: b.edges.get(r) ?? [] })).filter((x) => x.rect && x.goods.length);
      // Each line meets the factory card's left edge at its own height, spread over the middle of the card in the feeders' order.
      const span = Math.min(f.height * 0.6, Math.max(0, into.length - 1) * 28);
      const list: Wire[] = into.map((x, i) => {
        const x1 = x.rect!.right - base.left, y1 = x.rect!.top - base.top + Math.min(x.rect!.height / 2, 46);
        const x2 = f.left - base.left, y2 = f.top - base.top + f.height / 2 - span / 2 + (into.length > 1 ? (span * i) / (into.length - 1) : 0);
        const xa = Math.max(x1, x2 - 30), m = (xa + x2) / 2;
        // The label in the gutter's middle, on the line's straight run: never over a card (the gutter holds none).
        return { key: `${x.r.planetId}:${x.r.charId}`, d: `M${x1} ${y1} H${xa} C${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`, x: (colRight + x2) / 2, y: y1, goods: x.goods, from: x.r.planetId };
      });
      // Apart from each other, as a factory character's are (fix round 1's M4): a label of several goods is taller.
      for (let i = 1; i < list.length; i++) {
        const gap = Math.max(LABEL_GAP, 10 + 18 * (list[i - 1].goods.length + list[i].goods.length) / 2);
        if (list[i].y < list[i - 1].y + gap) list[i] = { ...list[i], y: list[i - 1].y + gap };
      }
      const next = { w: base.width, h: base.height, list };
      setWires((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll('[data-board]').forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const pname = (id: number) => planets.find((p) => p.planetId === id)?.name ?? `planet ${id}`;
  return (
    <div className="pl-board flow" ref={box}>
      {wires && (
        <svg className="pl-wires" width={wires.w} height={wires.h} aria-hidden="true">
          <defs><marker id="pl-wire-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" /></marker></defs>
          {wires.list.map((w) => <path key={w.key} className="pl-wire" d={w.d} markerEnd="url(#pl-wire-end)" />)}
        </svg>
      )}
      <div className="pl-feeders">
        {b.groups.map((g) => (
          <div key={g.charId ?? 'all'} className="pl-feeder-group">
            {g.charId != null && b.groups.length > 1 && <span className="pl-group-head" data-planets={`group:${g.charId}`}>{charName(g.charId)}</span>}
            {g.roles.map((r) => card(r, 'feeder'))}
          </div>
        ))}
      </div>
      <div className="pl-factory-col">{b.factory && card(b.factory, 'factory')}</div>
      {wires?.list.map((w) => (
        <span key={w.key} className="pl-wire-label" style={{ left: w.x, top: w.y }}
          data-tip={w.goods.map((g) => `${aDay(g.perDay)} ${name(g.id)} a day from ${pname(w.from)} to ${b.factory ? pname(b.factory.planetId) : 'the factory planet'}`).join('\n')}>
          {w.goods.map((g) => <span key={g.id} className="pl-wire-good" data-planets={`edge:${w.from}:${g.id}`}><ItemIcon id={g.id} size="sm" /><b>{aDay(g.perDay)}</b> a day</span>)}
        </span>
      ))}
    </div>
  );
}

/**
 * A factory character's board: the feeders on the left grouped by character, each group folded to one line (who, its account once any is
 * set, how many planets, what it sends a day) until opened to its planet cards; the factory character's factory planets stacked on the
 * right; a line from each group to them labelled with what it sends a day. The user, 25 October 2026: "No need to show all build types
 * fully extended at once. They can be collapsed and then I can pick the ones that can actually work and extend them to see more detail."
 */
function TeamFlow({ b, card, name, charName, accountOf, factoryChar, parts, good }: {
  b: ReturnType<typeof boardOf>; card: (r: Role, at: 'feeder' | 'factory') => ReactNode; name: (id: number) => string; charName: (id: number) => string;
  accountOf: (charId: number) => AccountRef | null; factoryChar: number | null;
  /** Each character's part (`TeamFigures.parts`): the wire's label, its m³ a day and the good a day it stands for. */
  parts: NonNullable<Setup['team']>['parts']; good: number | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  type Wire = { key: string; d: string; x: number; y: number; goods: { id: number; perDay: number }[]; charId: number };
  const [wires, setWires] = useState<{ w: number; h: number; list: Wire[] } | null>(null);
  const anyAccount = b.groups.some((g) => g.charId != null && accountOf(g.charId));
  const sig = `${b.groups.map((g) => `${g.charId}:${g.sends.map((x) => `${x.id}x${Math.round(x.perDay)}`).join(',')}`).join(' ')}|${[...open].join(',')}`;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const f = el.querySelector<HTMLElement>('[data-board="factories"]')?.getBoundingClientRect();
      if (!f) return;
      const heads = [...el.querySelectorAll<HTMLElement>('[data-board="group"]')];
      const into = b.groups.map((g, i) => ({ g, rect: heads[i]?.getBoundingClientRect() })).filter((x) => x.rect && x.g.sends.length);
      const span = Math.min(f.height * 0.7, Math.max(0, into.length - 1) * 34);
      const list: Wire[] = into.map((x, i) => {
        const x1 = x.rect!.right - base.left, y1 = x.rect!.top - base.top + x.rect!.height / 2;
        const x2 = f.left - base.left, y2 = f.top - base.top + Math.min(f.height / 2, 160) - span / 2 + (into.length > 1 ? (span * i) / (into.length - 1) : 0);
        const xa = Math.min(x2 - 30, x1 + 60), m = (xa + x2) / 2;
        return { key: String(x.g.charId), d: `M${x1} ${y1} H${xa} C${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2, goods: x.g.sends, charId: x.g.charId! };
      });
      // The labels sit in the gutter between the columns, centred across it, and apart from each other: never over a card or a group's line.
      for (let i = 1; i < list.length; i++) if (list[i].y < list[i - 1].y + LABEL_GAP) list[i] = { ...list[i], y: list[i - 1].y + LABEL_GAP };
      const next = { w: base.width, h: base.height, list };
      setWires((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll('[data-board]').forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: number) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="pl-board team" ref={box}>
      {wires && (
        <svg className="pl-wires" width={wires.w} height={wires.h} aria-hidden="true">
          <defs><marker id="pl-team-wire-end" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" /></marker></defs>
          {wires.list.map((w) => <path key={w.key} className="pl-wire" d={w.d} markerEnd="url(#pl-team-wire-end)" />)}
        </svg>
      )}
      <div className="pl-feeders">
        {b.groups.map((g) => {
          const id = g.charId!, shown = open.has(id);
          const acct = anyAccount ? accountOf(id)?.name ?? 'account not set' : null;
          const n = g.roles.length;
          return (
            <div key={id} className={'pl-team-group' + (shown ? ' open' : '')} data-planets={`group:${id}`}>
              <button type="button" className="pl-team-head" data-board="group" aria-expanded={shown} onClick={() => toggle(id)}
                aria-label={`${shown ? 'Fold' : 'Open'} ${charName(id)}’s planets`}>
                <ChevronRight className="chev" aria-hidden="true" />
                <span className="pl-team-who"><b>{charName(id)}</b>{acct ? <span className="pl-type"> ({acct})</span> : null}
                  <span className="sub">{n} planet{n === 1 ? '' : 's'}{id === factoryChar ? ' feeding' : ''}</span></span>
                <span className="pl-team-sends" data-planets="sends">{g.sends.map((x, i) => (
                  <span key={x.id} className="pl-term" data-tip={`${aDay(x.perDay)} ${name(x.id)} a day to the factory planets`}><ItemIcon id={x.id} size="sm" /><span className="nm">{name(x.id)}</span><b>{aDay(x.perDay)}</b>{i === g.sends.length - 1 ? <span className="pl-aday">a day</span> : null}</span>
                ))}</span>
              </button>
              {shown && <div className="pl-team-cards">{g.roles.map((r) => card(r, 'feeder'))}</div>}
            </div>
          );
        })}
      </div>
      <div className="pl-factory-col team" data-board="factories" data-planets="factories">{b.factories.map((r) => card(r, 'factory'))}</div>
      {wires?.list.map((w) => (
        <span key={w.key} className="pl-wire-label" style={{ left: w.x, top: w.y }} data-planets={`group-edge:${w.charId}`}
          data-tip={w.goods.map((x) => `${aDay(x.perDay)} ${name(x.id)} a day from ${charName(w.charId)}’s planets`).join('\n')}>
          {(() => { const part = parts.find((x) => x.charId === w.charId); return part ? (
            <><span className="pl-wire-good"><b>{units(part.m3)}</b> m³ a day</span>{good != null && <span className="pl-wire-good"><ItemIcon id={good} size="sm" /><b>{aDay(part.perDay)}</b> a day’s worth</span>}</>
          ) : null; })()}
        </span>
      ))}
    </div>
  );
}

/** One planet: its type, name and owner, a badge for what it does, what it does drawn as goods and factories, Build it, Check my setup. */
function PlanetCard({ r, s, at, ix, planet, planets, pname, name, whose, cc, words, cardKey: key, keyOf, programHours, ctx }: {
  r: Role; s: Setup; at: 'feeder' | 'factory' | 'row'; ix: PiIndex; planet: SystemPlanet | undefined; planets: SystemPlanet[]; pname: (id: number) => string; name: (id: number) => string; whose: string | null;
  cc: number | null; words: ReactNode | null; cardKey: string; keyOf: (r: Role) => string; programHours: number; ctx: CheckCtx | null;
}) {
  const [build, setBuild] = useState(false);
  useChecks();
  const t = planet?.type ?? null;
  const basics = r.makes.filter((m) => m.facility === 'basic');
  const above = r.makes.filter((m) => m.facility !== 'basic' && m.count > 0);
  const unfit = !!r.fit && !r.fit.fits;
  // A factory planet's counts as the user builds them (Ruling F27): "6 Oxides, 6 Biocells, 6 Superconductors, 3 Gel-Matrix Biopaste: 21 of the 22 Advanced it holds".
  const counts = s.kind === 'team' ? factoryCounts(r, ix, { t, cc, radiusKm: planet?.radiusKm ?? null }) : null;
  // What it sells, said where it isn't the card's last line already: a feeder's goods sold beside what it ships to the factory, or a
  // good left over below what the planet's factories make (a P0 → P2 planet's P1 to spare).
  const tierOf = (id: number) => ['P0', 'P1', 'P2', 'P3', 'P4'].indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const top = Math.max(-1, ...r.makes.map((m) => tierOf(m.id)));
  const fedOn = r.ships.some((x) => x.to !== 'market');
  const market = r.ships.filter((x) => x.to === 'market' && (fedOn || tierOf(x.id) < top));
  const lineOf = (e: Role['extracts'][number], i: number) => {
    const bs = basics[i];
    const share = poorShare(e.rate);
    // Short of what its Basics take: what more heads would need here, beside the rate (never a promise).
    const h = headsNeeded(r, i, ix, t, cc, planet?.radiusKm ?? null);
    const tip = h ? `${rateSaid(e, name, t)}\n\n${headsNeedSaid(h)}.\n\n• At ${r.does === 'extract' ? 'this character’s' : 'its'} Command Center Upgrades level, beside the planet’s factories and one launchpad, that many heads fit for this line.\n• Heads overlap and the planet depletes, so more heads don’t each add what one did: it isn’t a promise.` : rateSaid(e, name, t);
    return (
      <div key={`${e.p0}:${i}`} className={'pl-bline' + (e.extra ? ' extra' : '')} data-planets={`line:${e.p0}`}>
        <div className="pl-bflow">
          <Term id={e.p0} name={name} />
          <span className="pl-chip" data-tip={rateSaid(e, name, t)}>{e.heads != null ? `${e.heads} head${e.heads === 1 ? '' : 's'}` : 'heads?'}</span>
          <span data-planets={h ? 'heads-need' : undefined}><Tip title={`${name(e.p0)} on ${planet?.name ?? 'this planet'}`} text={tip} /></span>
          {bs && bs.count > 0 && <><Arrow /><span className="pl-badge">{bs.count} Basic</span><Arrow /><Term id={bs.id} n={bs.perDay} name={name} out tip={`${aDay(bs.perDay)} ${name(bs.id)} a day from ${bs.count} Basic Industry Facilit${bs.count === 1 ? 'y' : 'ies'}`} /></>}
        </div>
        {(e.extra || e.topsUp || e.setAside || !e.rate || share != null) && (
          <div className="pl-btags">
            {e.extra && <span className="pl-badge amber" data-tip={e.extra} data-planets="extra-badge">Extra</span>}
            {e.topsUp && <span className="pl-badge blue" data-tip={e.topsUp} data-planets="tops-up-badge">Tops up</span>}
            {e.setAside && <span className="pl-badge amber" data-tip={rateSaid(e, name, t)}>Set aside</span>}
            {!e.rate && !e.setAside && <span className="pl-badge dim" data-tip={rateSaid(e, name, t)}>No rate yet</span>}
            {share != null && <span className="pl-badge amber" data-tip={`Learned on this planet: about ${Math.round(share * 100)}% a head of your other ${t ? `${t} ` : ''}planets’ ${name(e.p0)}. The plan is worked out at it.`} data-planets="poor">{Math.round(share * 100)}% a head</span>}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className={`pl-card ${r.does}` + (unfit ? ' unfit' : '')} data-planets={`role:${r.planetId}`} data-board={at === 'row' ? undefined : at} data-does={r.does}>
      <div className="pl-card-head">
        <span className="pl-card-ptype">{t ? <ItemIcon id={ix.planetTypes[t].typeId} size="sm" /> : null}</span>
        <div className="pl-card-name">
          <b>{planet?.name ?? `Planet ${r.planetId}`}</b>
          <span className="sub">{[t ?? 'no planetary industry', r.does === 'factory' ? 'factory planet' : null, whose ? `${whose}’s` : null].filter(Boolean).join(' · ')}</span>
        </div>
        <span className={'pl-badge does ' + r.does} data-planets="does">{r.does === 'factory' ? 'Factory' : 'Extracts'}</span>
      </div>
      {counts && <span className="pl-card-counts" data-planets="factory-counts">{counts}</span>}
      {unfit && <span className="pl-badge red" data-planets="unfit" data-tip={r.lacks ? `Train ${r.lacks} to fit it on this planet: the figures are what it would make if it did.` : 'No Command Center Upgrades level fits it on this planet: the figures are what it would make if it did.'}>Doesn’t fit at {whose ? `${whose}’s` : 'your'} level</span>}
      <div className="pl-card-body">
        {r.does === 'factory' && (r.imports ?? []).length > 0 && (
          <div className="pl-bline in" data-planets="takes-in"><span className="pl-k">{(r.imports ?? []).every((x) => x.from === 'market') ? 'Bought' : 'In'}</span>
            {/* Each good once, what comes from every planet summed (a factory character's come from several characters' colonies); the tip says from where. */}
            {[...new Set((r.imports ?? []).map((x) => x.id))].map((id) => {
              const from = (r.imports ?? []).filter((x) => x.id === id);
              return <Term key={id} id={id} n={from.reduce((t, x) => t + x.perDay, 0)} name={name}
                tip={from.map((x) => `${aDay(x.perDay)} ${name(id)} a day ${x.from === 'market' ? 'bought at the market' : `from ${pname(x.from)}`}`).join('\n')} />;
            })}
          </div>
        )}
        {r.extracts.map(lineOf)}
        {(r.does === 'factory' ? r.makes.filter((m) => m.count > 0) : above).map((m) => (
          <div key={`${m.id}:${m.facility}`} className="pl-bline" data-planets={`makes:${m.id}`}>
            <div className="pl-bflow">
              <span className="pl-ins" data-tip={`From ${listSaid((ix.makes.get(m.id)?.inputs ?? []).map((x) => name(x.id)))}`}>{(ix.makes.get(m.id)?.inputs ?? []).map((x) => <ItemIcon key={x.id} id={x.id} size="sm" />)}</span><Arrow />
              <span className="pl-badge">{m.count} {FACILITY_SHORT[m.facility]}</span><Arrow /><Term id={m.id} n={m.perDay} name={name} out />
            </div>
          </div>
        ))}
        {/* A feeder making a P2 beside its P1 (a factory character's): said, so the P2 is built as what it ships, not a by-product. */}
        {r.does === 'extract' && above.filter((m) => r.ships.some((x) => x.id === m.id && typeof x.to === 'number') && r.ships.some((x) => x.id !== m.id && typeof x.to === 'number')).map((m) => {
          const n = r.ships.filter((x) => x.id === m.id && typeof x.to === 'number').reduce((t, x) => t + x.perDay, 0);
          // One line (the user's screenshot, 25 October 2026, drew it as a full-width bar on three lines): "As well: ships Biocells 240 a day as well as its P1".
          return <div key={`as-well:${m.id}`} className="pl-bline aswell" data-planets="as-well" data-tip={`Its ${m.count} Advanced make ${name(m.id)} here, which it ships to the factory planets beside its P1`}><span className="pl-k">As well:</span> ships <Term id={m.id} n={n} name={name} out /> as well as its P1</div>;
        })}
        {market.length > 0 && (
          <div className="pl-bline out" data-planets="to-market"><span className="pl-k">Sold</span>
            {market.map((x, i) => <Term key={i} id={x.id} n={x.perDay} name={name} out tip={`${aDay(x.perDay)} ${name(x.id)} a day to market`} />)}
          </div>
        )}
      </div>
      {words && <div className="pl-card-words">{words}</div>}
      <div className="pl-card-foot">
        <button type="button" className="pl-toggle" aria-expanded={build} onClick={() => setBuild(!build)} data-planets="build"><Hammer aria-hidden="true" />Build it</button>
        {ctx && <button type="button" className="btn sm" data-planets="check" onClick={() => { checked.set(key, Date.now()); bump(); for (const c of whoChecks(s, r, ctx)) startRead(c, ctx); }}><ClipboardCheck aria-hidden="true" />Check my setup</button>}
      </div>
      {build && <BuildList r={r} team={s.kind === 'team'} ix={ix} planet={planet} cc={cc} programHours={programHours} tickKey={key} />}
      {ctx && checked.has(key) && <CheckResult r={r} s={s} ix={ix} planet={planet} planets={planets} ctx={ctx} keyOf={keyOf} />}
    </div>
  );
}

/** Build it: a numbered list, each step ticked off in this browser; the ticks clear once the planet's layout in the plan changes. */
function BuildList({ r, team, ix, planet, cc, programHours, tickKey }: { r: Role; team: boolean; ix: PiIndex; planet: SystemPlanet | undefined; cc: number | null; programHours: number; tickKey: string }) {
  const sig = roleSig(r);
  const [done, tick] = useTicks(tickKey, sig);
  let need = levelNeeded(r, ix, planet?.type ?? null, planet?.radiusKm ?? null);
  // The planner fitted it at the character's level: never ask for more than that.
  if (r.fit?.fits && cc != null && (need.level == null || need.level > cc)) need = { level: cc, checked: true };
  const steps = buildSteps(r, ix, need, r.does === 'factory' ? null : programHours, { t: planet?.type ?? null, cc, radiusKm: planet?.radiusKm ?? null });
  const counts = team ? factoryCounts(r, ix, { t: planet?.type ?? null, cc, radiusKm: planet?.radiusKm ?? null }) : null;
  return (
    <ol className="pl-build" data-planets="build-list">
      {counts && <li className="pl-build-n" data-planets="build-counts"><span /><span>Its factories: {counts}.</span></li>}
      {steps.map((st, i) => (
        <li key={st.id} data-planets={`build-step:${st.id}`}>
          <span className="mono">{String(i + 1).padStart(2, '0')}</span>
          <Check bare checked={done.has(st.id)} onChange={(on) => tick(st.id, on)}>{st.text}</Check>
        </li>
      ))}
      <li className="pl-build-n"><span /><span className="note small">{done.size ? `${done.size} of ${steps.length} done` : 'Tick each step off as you place it: kept in this browser until this planet’s layout in the plan changes.'}</span></li>
    </ol>
  );
}

const ICON = { ok: CircleCheck, fault: CircleX, soon: Clock, info: Info } as const;

/** Check my setup's result under a card: a line per character, opening to what's as planned, what to fix and what to see to. */
function CheckResult({ r, s, ix, planet, planets, ctx, keyOf }: { r: Role; s: Setup; ix: PiIndex; planet: SystemPlanet | undefined; planets: SystemPlanet[]; ctx: CheckCtx; keyOf: (r: Role) => string }) {
  const now = useNow(60_000);
  const who = whoChecks(s, r, ctx);
  // A factory planet's feeders, whose own cards say whether what it takes in reaches it (Minor 4 of the review).
  const feeders = r.does === 'factory' ? s.roles.filter((x) => x.does === 'extract' && x.ships.some((sh) => sh.to === r.planetId)) : [];
  return (
    <div className="pl-check" data-planets="check-result">
      {who.map((c) => <CharCheck key={c.charId} c={c} r={r} ix={ix} planet={planet} planets={planets} ctx={ctx} now={now} many={who.length > 1}
        feeders={feeders} chain={s.kind === 'chain' || s.kind === 'team'} keyOf={keyOf} />)}
    </div>
  );
}

/** One role set against one character's colony on its planet, as kept: null with none there. */
const judged = (role: Role, c: IndustryChar, ix: PiIndex, ctx: CheckCtx, now: number, tax: Tax) => {
  const k = ctx.colonies[c.charId]?.colonies.find((x) => x.planetId === role.planetId) ?? null;
  return k ? { k, check: setupCheck(role, colonyChain(k, ix, ctx.sell, now, tax, PI_READING), ix) } : null;
};

function CharCheck({ c, r, ix, planet, planets, ctx, now, many, feeders, chain, keyOf }: {
  c: IndustryChar; r: Role; ix: PiIndex; planet: SystemPlanet | undefined; planets: SystemPlanet[]; ctx: CheckCtx; now: number; many: boolean;
  feeders: Role[]; chain: boolean; keyOf: (r: Role) => string;
}) {
  const tax = planet?.tax ?? NO_TAX;
  // Worked out from the colony as kept, which a fresh read replaces: the result follows the plan and the colony as they are now.
  const got = useMemo(() => judged(r, c, ix, ctx, now, tax), [r, c, ix, ctx, now, tax]);
  const k = got?.k ?? null, result = got?.check ?? null;
  // A factory's card reads "All set" only once every feeder's card has been checked for this character with nothing to fix: a chain's
  // feeders are their own characters'.
  const fed: FeedersChecked | undefined = useMemo(() => {
    if (!feeders.length) return undefined;
    let checkedN = 0, faults = 0;
    for (const f of feeders) {
      if (!checked.has(keyOf(f))) continue;
      checkedN++;
      const owner = chain ? ctx.chars.find((x) => x.charId === f.charId) : c;
      const g = owner ? judged(f, owner, ix, ctx, now, planets.find((p) => p.planetId === f.planetId)?.tax ?? NO_TAX) : null;
      faults += g ? g.check.faults : 1;
    }
    return { of: feeders.length, checked: checkedN, faults };
  }, [feeders, chain, keyOf, c, ix, ctx, now, planets, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<boolean | null>(null);
  const f = fresh.get(c.charId);
  const cant = cantRead(c, ctx);
  const read = ctx.reads[c.charId] ?? { state: 'unread' };
  const readSaid = f?.state === 'reading' ? (c.isMain ? 'Reading your colonies from EVE…' : `The cloud is reading ${c.name}’s colonies…`)
    : f?.state === 'failed' ? `Couldn’t read them just now: ${f.why}.${k ? ' Checked against the colony as last kept.' : ''}`
      : f?.state === 'unpulled' ? `The cloud read it, but this browser couldn’t fetch it yet: ${f.why}.${k ? ' Checked against the colony as last kept, not this read.' : ''}`
      : f?.state === 'read' ? `Read ${ago(new Date(f.at).toISOString(), now)}.`
        : cant ? `${cant.replace(/\.$/, '')}.${k ? ' Checked against the colony as last kept.' : ''}` : null;
  const summary = f?.state === 'reading' && !k ? 'Reading…'
    : !k ? (read.state === 'read' ? 'Nothing built on this planet yet' : cant || f?.state === 'failed' || f?.state === 'unpulled' ? 'Not read' : coloniesWhy(c, read) ?? 'Not read yet')
      : checkSaid(result!, fed);
  const bad = !!result && result.faults > 0;
  const good = !!result && result.known && result.judged > 0 && !bad;
  const shown = open ?? bad;
  return (
    <div className={'pl-check-char' + (bad ? ' bad' : good ? ' good' : '')} data-planets={`check:${c.charId}`}>
      <button type="button" className="pl-check-head" aria-expanded={k ? shown : undefined} disabled={!k} onClick={() => setOpen(!shown)}>
        {bad ? <CircleX aria-hidden="true" /> : good ? <CircleCheck aria-hidden="true" /> : <Info aria-hidden="true" />}
        {many && <b>{c.name}:</b>} <span data-planets="check-said">{summary}</span>
      </button>
      <span className="note small">
        {readSaid}{k ? ` As EVE last saved it, ${ago(k.lastUpdate, now)}.` : ''}
        {k && <Tip title="As EVE last saved it" text={'EVE updates a colony only after you press Submit in game, and ESI holds it about 10 minutes.\n\n• What’s checked is the colony as that save left it, worked out route by route as Colonies does.\n• More factories, heads, storage or launchpads than the plan, or another arrangement that makes what it needs, is never a fault.'} />}
      </span>
      {k && shown && result && (
        <ul className="pl-check-list">
          {result.items.map((x, i) => <CheckLine key={i} x={x} />)}
        </ul>
      )}
    </div>
  );
}

function CheckLine({ x }: { x: CheckItem }) {
  const I = x.kind === 'ok' && x.plus ? CirclePlus : ICON[x.kind];
  return (
    <li className={'pl-check-item ' + x.kind} data-planets="check-item" data-kind={x.plus ? 'plus' : x.kind}>
      <I aria-hidden="true" />
      <span>{x.said}.{x.why?.map((w) => <span key={w} className="pl-why">{w}.</span>)}</span>
    </li>
  );
}

