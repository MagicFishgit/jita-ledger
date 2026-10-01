import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Crosshair, Lock, MapPin, Sparkles, type LucideIcon } from 'lucide-react';
import { iskBig } from '../lib/format';
import { useNow } from '../lib/hooks';
import { jitaBook } from '../lib/market';
import type { TypeDogma } from '../lib/miningYield';
import { edgeShape, nodeState, type NodeState, type Point, type Stat, type TreeNode } from '../lib/shipTree';
import { skillStatus } from '../lib/skillStatus';
import { hullStats, typeDogma, typeRequirements } from '../lib/universe';
import { useEnsureNames, useTypeName } from './common';
import { skillsUnread, who, whose, whoseStart, type Pilot } from '../lib/pilot';
import { usePilot } from './pilot';
import { SkillNeeds } from './SkillStrip';
import { Bonuses, Points, ResistBars, Stats } from './Facts';

/**
 * A progression tree as a flowchart (Mining, Abyssal, Hauling): every hull a node, every path an arrow, left to right by
 * how far along it is. Each node shows whether you can fly it, whether the skills for it are coming in your queue, or how
 * far off it is; the ship you're in glows, and the paths out of it flow. A page can mark nodes that suit a choice made
 * elsewhere on it (`picked`: Abyssal's tier and weather). Click one and it opens: the hull, its Jita price, slots, the
 * page's own facts, the skills to fly it, and whatever the page puts under it (its fits). The user asked for "an
 * interactive animated flowchart ... click on nodes and it opens up" (29 September 2026). On a phone it's a list whose
 * rows open under themselves.
 */

/** A phrase made to start a sentence: "your" → "Your". */
const startOf = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The chart's marks, as a legend under its panel's title: the ship you're in, lit, coming in your queue, further off. For
 * whoever the tree is shown for (the pilot): Mining's Scaling up can be an alt's, and an alt whose skills the cloud hasn't
 * read has no marks to explain, so the legend says that instead.
 */
export function TreeLegend({ inShip, extra }: { inShip: ReactNode; extra?: ReactNode }) {
  const pilot = usePilot();
  return (
    <div className="tree-legend">
      <span><MapPin aria-hidden="true" />{inShip}</span>
      {skillsUnread(pilot) ? <span><Lock aria-hidden="true" style={{ color: 'var(--faint)' }} />Not read yet: {pilot.name}’s skills come with the cloud’s first read</span> : (
        <>
          <span><span className="sw flyable" aria-hidden="true" />Lit: {who(pilot)} can fly it</span>
          <span><Sparkles aria-hidden="true" style={{ color: 'var(--acc2)' }} />{whoseStart(pilot)} skill queue brings it</span>
          <span><Lock aria-hidden="true" style={{ color: 'var(--faint)' }} />Further off</span>
        </>
      )}
      {extra}
    </div>
  );
}

type HullInfo = { needs: { skill: number; level: number }[]; stats: Awaited<ReturnType<typeof hullStats>> | null; price: number | null; dogma: TypeDogma | null };
export type HullStats = Awaited<ReturnType<typeof hullStats>>;

/** A node's state as drawn: the rules' (lib/shipTree.ts), or `unread` for an alt whose skills the cloud hasn't read. */
type Shown = NodeState | 'unread';
/** A node's state in words, for whoever the tree is shown for: "You can fly it", "Miner Two can fly it". */
function stateSaid(st: Shown, p: Pick<Pilot, 'isMain' | 'name'>): string {
  switch (st) {
    case 'here': return p.isMain ? 'You’re in it' : `${p.name}’s ship`;
    case 'flyable': return `${startOf(who(p))} can fly it`;
    case 'close': return `Coming in ${whose(p)} queue`;
    case 'locked': return 'Not yet';
    case 'unread': return 'Skills not read yet';
  }
}

export function ShipTree<N extends TreeNode>({ label, nodes, edges, lanes, cols, rows, here, picked, pickedSaid, nodeTip, facts, resists, about, iconOf, pointsOf, statsOf, children }: {
  /** What the chart is, for screen readers ("Mining ships"). */
  label: string;
  nodes: N[]; edges: [number, number][]; lanes: Record<string, string>;
  /** The grid: columns left to right, rows top to bottom. */
  cols: number; rows: number;
  /** The hull you're in, or the one the page knows you use. */
  here: number | null;
  /** Hulls that suit a choice made elsewhere on the page, marked with a crosshair; and what that choice is, for the tip. */
  picked?: Set<number> | null; pickedSaid?: string;
  /** A line for a node's tooltip, after its state. */
  nodeTip?: (n: N) => string | null;
  /** The page's own facts about a hull, shown after its price and slots. */
  facts?: (n: N, stats: HullStats | null, dogma: TypeDogma | null) => [string, ReactNode][];
  /** Draw each hull's base resists (Abyssal, Hauling: where its tank decides things). */
  resists?: boolean;
  /** The page's own picture of a hull, beside its points (Abyssal: where it's most run). */
  about?: (n: N) => ReactNode;
  /** An icon for a point whose lead the page knows (a weather's own). */
  iconOf?: (p: Point) => LucideIcon | undefined;
  /** Points and research figures the page adds to a hull's own (Hauling: how its kind gets ganked). */
  pointsOf?: (n: N) => Point[];
  statsOf?: (n: N) => Stat[];
  /** What opens under a hull's details, given its Jita price. */
  children: (n: N, price: number | null) => ReactNode;
}) {
  const pilot = usePilot();
  const now = useNow(60_000);
  const name = useTypeName();
  const [info, setInfo] = useState<Record<number, HullInfo>>({});
  const [open, setOpen] = useState<number | null>(null);
  const ids = nodes.map((h) => h.id).join(',');
  useEnsureNames(nodes.map((h) => h.id));
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<number, HullInfo> = {};
      await Promise.all(nodes.map(async (h) => {
        const [needs, stats, book, dogma] = await Promise.all([
          typeRequirements(h.id).catch(() => []), hullStats(h.id).catch(() => null), jitaBook(h.id).catch(() => null), typeDogma(h.id).catch(() => null),
        ]);
        out[h.id] = { needs, stats, price: book?.bestSell ?? null, dogma };
      }));
      if (alive) setInfo(out);
    })();
    return () => { alive = false; };
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  // A missing skill counts as coming when your queue takes it to the level needed.
  const queued = (skill: number, level: number) => {
    const s = skillStatus(skill, pilot.skills?.[skill] ?? 0, pilot.skillQueue, now);
    return Math.max(s.have, s.training?.level ?? 0, ...s.queued.map((q) => q.level)) >= level;
  };
  // An alt whose skills aren't read is drawn neither flyable nor locked: nothing is known either way.
  const unread = skillsUnread(pilot);
  const states = useMemo(() => Object.fromEntries(nodes.map((h) => [h.id, unread && h.id !== here ? 'unread' : nodeState(info[h.id]?.needs, pilot.skills, queued, h.id === here)])) as Record<number, Shown>,
    [info, pilot.skills, pilot.skillQueue, here, now, ids, unread]); // eslint-disable-line react-hooks/exhaustive-deps
  const x = (h: N) => ((h.col + 0.5) / cols) * 100;
  const y = (h: N) => ((h.row + 0.5) / rows) * 100;
  const byId = new Map(nodes.map((h) => [h.id, h]));
  // The paths out of where you are glow: the next steps.
  const from = here ?? nodes.filter((h) => states[h.id] === 'flyable').sort((a, b) => b.col - a.col)[0]?.id ?? null;
  const openHull = open != null ? byId.get(open) ?? null : null;
  const missing = (h: N) => (info[h.id]?.needs ?? []).filter((n) => (pilot.skills?.[n.skill] ?? 0) < n.level).length;
  // On a phone the chart is a list, and a ship opens right under its row rather than below all of them.
  const [phone, setPhone] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const isPicked = (h: N) => !!picked?.has(h.id);

  const detail = openHull && (
    <section key={openHull.id} className="mtree-detail" aria-label={name(openHull.id)}>
      <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <img src={`https://images.evetech.net/types/${openHull.id}/render?size=128`} alt="" width={72} height={72} style={{ background: '#0b1622' }} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="lbl" style={{ display: 'block' }}>{lanes[openHull.lane]} · {stateSaid(states[openHull.id], pilot)}{isPicked(openHull) && pickedSaid ? ` · ${pickedSaid}` : ''}</span>
          <span style={{ fontSize: 18, color: 'var(--ink)' }}>{name(openHull.id)}</span>
          <span className="note small" style={{ display: 'block', margin: 0 }}>{openHull.role}</span>
        </span>
      </div>
      {openHull.bonuses?.length ? <Bonuses items={openHull.bonuses} /> : null}
      {(() => {
        // What to know about the hull, beside its resists and the page's own picture of it; a plain note where there are
        // no points. The note runs the full width under the picture: beside it, a long one made a narrow column on a phone.
        const dg = info[openHull.id]?.dogma;
        const own = about?.(openHull) ?? null;
        const side = [resists && dg ? <div key="res"><span className="lbl">Resists, the bare hull</span><ResistBars dogma={dg} /></div> : null, own ? <Fragment key="about">{own}</Fragment> : null].filter(Boolean);
        const points = [...(openHull.points ?? []), ...(pointsOf?.(openHull) ?? [])];
        const main = points.length ? <Points items={points} iconOf={iconOf} /> : openHull.note ? <p className="note small" style={{ margin: 0 }}>{openHull.note}</p> : null;
        if (!side.length) return main;
        // With nothing to say beside them, the resists and the page's picture take the width themselves.
        if (!main) return <div className="about-side">{side}</div>;
        return <div className="about-grid">{main}<div className="about-side">{side}</div></div>;
      })()}
      {(() => {
        const stats = [...(openHull.stats ?? []), ...(statsOf?.(openHull) ?? [])];
        return stats.length ? <Stats items={stats} /> : null;
      })()}
      <div className="kv-mini" style={{ maxWidth: 560 }}>
        <span>Hull at Jita</span><b>{info[openHull.id]?.price != null ? iskBig(info[openHull.id].price!) : '–'}</b>
        {info[openHull.id]?.stats && <><span>Slots</span><b>{info[openHull.id].stats!.high} high{info[openHull.id].stats!.turrets > 0 ? ` (${info[openHull.id].stats!.turrets} for turrets)` : ''}, {info[openHull.id].stats!.mid} mid, {info[openHull.id].stats!.low} low, {info[openHull.id].stats!.rigs} rigs</b></>}
        {(facts?.(openHull, info[openHull.id]?.stats ?? null, info[openHull.id]?.dogma ?? null) ?? []).map(([k, v]) => <Fragment key={k}><span>{k}</span><b>{v}</b></Fragment>)}
      </div>
      <div>
        <div className="lbl" style={{ marginBottom: 6 }}>To fly it</div>
        <SkillNeeds needs={info[openHull.id]?.needs ?? []} />
      </div>
      {children(openHull, info[openHull.id]?.price ?? null)}
    </section>
  );
  const mark = (st: Shown) => (st === 'here' ? <MapPin className="mtree-mark" aria-label={stateSaid(st, pilot)} />
    : st === 'locked' ? <Lock className="mtree-mark" aria-label={stateSaid(st, pilot)} />
      : st === 'close' ? <Sparkles className="mtree-mark" aria-label={stateSaid(st, pilot)} /> : null);

  return (
    <div className="mtree-wrap">
      <div className="mtree-scroll">
        <div className="mtree" role="group" aria-label={label} style={{ minWidth: cols * 168, aspectRatio: `${cols} / ${rows * 0.68}` }}>
          <svg className="mtree-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {edges.map(([a, b]) => {
              const A = byId.get(a), B = byId.get(b);
              if (!A || !B) return null;
              const e = edgeShape(A, B), X = (v: number) => (v / cols) * 100, Y = (v: number) => (v / rows) * 100;
              const lit = a === from && states[b] !== 'here';
              const known = (st: Shown) => st !== 'locked' && st !== 'unread';
              return <path key={`${a}-${b}`} className={'mtree-edge' + (lit ? ' lit' : '') + (known(states[a]) && known(states[b]) ? ' open' : '')}
                d={`M${X(e.x1)} ${Y(e.y1)} H${X(e.xa)} C${X(e.m)} ${Y(e.y1)}, ${X(e.m)} ${Y(e.y2)}, ${X(e.xb)} ${Y(e.y2)} H${X(e.x2)}`} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          {[...new Set(nodes.map((h) => h.lane))].map((lane) => {
            const first = nodes.filter((h) => h.lane === lane).sort((a, b) => a.col - b.col || a.row - b.row)[0];
            // A lane's name sits over its first node and wraps within that column, clear of the paths between columns.
            return <span key={lane} className="mtree-lane" style={{ left: `${(first.col / cols) * 100}%`, top: `${(first.row / rows) * 100}%`, maxWidth: `${100 / cols}%` }}>{lanes[lane]}</span>;
          })}
          {nodes.map((h) => {
            const st = states[h.id];
            const extra = nodeTip?.(h);
            return (
              <button key={h.id} type="button" className={`mtree-node ${st}${open === h.id ? ' sel' : ''}${isPicked(h) ? ' pick' : ''}`} style={{ left: `${x(h)}%`, top: `${y(h)}%`, width: `${91 / cols}%` }}
                aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)}
                data-tip-title={name(h.id)} data-tip={`${h.role}\n\n${stateSaid(st, pilot)}${st === 'locked' && info[h.id] ? `: ${missing(h)} skill${missing(h) === 1 ? '' : 's'} to train` : ''}.${isPicked(h) && pickedSaid ? ` ${pickedSaid}.` : ''}${extra ? ` ${extra}` : ''}`}>
                <img src={`https://images.evetech.net/types/${h.id}/render?size=64`} alt="" width={32} height={32} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <span className="mtree-name">{name(h.id)}</span>
                {mark(st)}
                {isPicked(h) && <Crosshair className="mtree-pick" aria-label={pickedSaid ?? 'Suits your choice'} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* On a phone the chart is a list: the same hulls, lane by lane. */}
      <div className="mtree-list">
        {nodes.map((h) => (
          <Fragment key={h.id}>
            <button type="button" className={`mtree-row ${states[h.id]}${open === h.id ? ' sel' : ''}${isPicked(h) ? ' pick' : ''}`} aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)}>
              <img src={`https://images.evetech.net/types/${h.id}/render?size=64`} alt="" width={28} height={28} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <span style={{ minWidth: 0 }}><span className="mtree-name">{name(h.id)}</span><span className="sub">{lanes[h.lane]} · {stateSaid(states[h.id], pilot)}{isPicked(h) && pickedSaid ? ` · ${pickedSaid}` : ''}</span></span>
              <ChevronRight className="chev" aria-hidden="true" />
            </button>
            {phone && open === h.id && detail}
          </Fragment>
        ))}
      </div>

      {!phone && detail}
    </div>
  );
}
