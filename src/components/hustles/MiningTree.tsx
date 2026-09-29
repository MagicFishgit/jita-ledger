import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Lock, MapPin, Sparkles } from 'lucide-react';
import { iskBig, units } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { jitaBook } from '../../lib/market';
import { EDGES, HULLS, LANE_SAID, nodeState, type HullNode, type NodeState } from '../../lib/miningTree';
import { skillStatus } from '../../lib/skillStatus';
import { useData } from '../../lib/store';
import { hullStats, typeRequirements } from '../../lib/universe';
import { useEnsureNames, useTypeName } from '../common';
import { SkillNeeds } from '../SkillStrip';

/**
 * The mining tree as a flowchart: every hull a node, every path an arrow, left to right by how far along it is. Each node
 * shows whether you can fly it, whether the skills for it are coming in your queue, or how far off it is; the ship you're
 * in glows. Click one and it opens: the hull, what it takes, what it costs, your own pace in it, and its mastery tiers
 * (`MasteryTiers`, passed in). The user asked for "an interactive animated flowchart ... click on nodes and it opens up"
 * (29 September 2026). On a phone it's a list whose rows open the same way.
 */

type HullInfo = { needs: { skill: number; level: number }[]; stats: Awaited<ReturnType<typeof hullStats>> | null; price: number | null };

const COLS = 7, ROWS = 5;
const STATE_SAID: Record<NodeState, string> = { here: 'You’re in it', flyable: 'You can fly it', close: 'Coming in your queue', locked: 'Not yet' };

export function MiningTree({ here, paceOf, children }: {
  /** The hull you're in (ESI), or the one you mined most in lately. */
  here: number | null;
  /** Your measured m³ a minute in a hull, from sessions, with how many. */
  paceOf: (hull: number) => { m3PerMin: number; sessions: number } | null;
  /** What opens under a hull's details: its mastery tiers, given the hull's Jita price. */
  children: (hull: HullNode, price: number | null) => React.ReactNode;
}) {
  const d = useData();
  const now = useNow(60_000);
  const name = useTypeName();
  const [info, setInfo] = useState<Record<number, HullInfo>>({});
  const [open, setOpen] = useState<number | null>(null);
  useEnsureNames(HULLS.map((h) => h.id));
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<number, HullInfo> = {};
      await Promise.all(HULLS.map(async (h) => {
        const [needs, stats, book] = await Promise.all([
          typeRequirements(h.id).catch(() => []), hullStats(h.id).catch(() => null), jitaBook(h.id).catch(() => null),
        ]);
        out[h.id] = { needs, stats, price: book?.bestSell ?? null };
      }));
      if (alive) setInfo(out);
    })();
    return () => { alive = false; };
  }, []);
  // A missing skill counts as coming when your queue takes it to the level needed.
  const queued = (skill: number, level: number) => {
    const s = skillStatus(skill, d.skills?.[skill] ?? 0, d.meta.skillQueue, now);
    return Math.max(s.have, s.training?.level ?? 0, ...s.queued.map((q) => q.level)) >= level;
  };
  const states = useMemo(() => Object.fromEntries(HULLS.map((h) => [h.id, nodeState(info[h.id]?.needs, d.skills, queued, h.id === here)])) as Record<number, NodeState>,
    [info, d.skills, d.meta.skillQueue, here, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const x = (h: HullNode) => ((h.col + 0.5) / COLS) * 100;
  const y = (h: HullNode) => ((h.row + 0.5) / ROWS) * 100;
  const byId = new Map(HULLS.map((h) => [h.id, h]));
  // The paths out of where you are glow: the next steps.
  const from = here ?? HULLS.filter((h) => states[h.id] === 'flyable').sort((a, b) => b.col - a.col)[0]?.id ?? null;
  const openHull = open != null ? byId.get(open)! : null;
  const missing = (h: HullNode) => (info[h.id]?.needs ?? []).filter((n) => (d.skills?.[n.skill] ?? 0) < n.level).length;
  // On a phone the chart is a list, and a ship opens right under its row rather than below all of them.
  const [phone, setPhone] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const detail = openHull && (
    <section key={openHull.id} className="mtree-detail" aria-label={name(openHull.id)}>
      <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <img src={`https://images.evetech.net/types/${openHull.id}/render?size=128`} alt="" width={72} height={72} style={{ background: '#0b1622' }} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="lbl" style={{ display: 'block' }}>{LANE_SAID[openHull.lane]} · {STATE_SAID[states[openHull.id]]}</span>
          <span style={{ fontSize: 18, color: 'var(--ink)' }}>{name(openHull.id)}</span>
          <span className="note small" style={{ display: 'block', margin: 0 }}>{openHull.role}{openHull.note ? ` ${openHull.note}` : ''}</span>
        </span>
      </div>
      <div className="kv-mini" style={{ maxWidth: 520 }}>
        <span>Hull at Jita</span><b>{info[openHull.id]?.price != null ? iskBig(info[openHull.id].price!) : '–'}</b>
        {info[openHull.id]?.stats && <><span>Ore hold</span><b>{units(info[openHull.id].stats!.oreHold)} m³</b>
          <span>Slots</span><b>{info[openHull.id].stats!.high} high{info[openHull.id].stats!.turrets > 0 ? ` (${info[openHull.id].stats!.turrets} for turrets)` : ''}, {info[openHull.id].stats!.mid} mid, {info[openHull.id].stats!.low} low, {info[openHull.id].stats!.rigs} rigs</b></>}
        <span>Your pace in it</span><b>{paceOf(openHull.id) ? `${units(Math.round(paceOf(openHull.id)!.m3PerMin))} m³/min over ${units(paceOf(openHull.id)!.sessions)} session${paceOf(openHull.id)!.sessions === 1 ? '' : 's'}` : 'Not mined in it yet'}</b>
      </div>
      <div>
        <div className="lbl" style={{ marginBottom: 6 }}>To fly it</div>
        <SkillNeeds needs={info[openHull.id]?.needs ?? []} />
      </div>
      {children(openHull, info[openHull.id]?.price ?? null)}
    </section>
  );
  return (
    <div className="mtree-wrap">
      <div className="mtree" role="group" aria-label="Mining ships">
        <svg className="mtree-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {EDGES.map(([a, b]) => {
            const A = byId.get(a)!, B = byId.get(b)!;
            const x1 = x(A), y1 = y(A), x2 = x(B), y2 = y(B), mid = (x1 + x2) / 2;
            const lit = a === from && states[b] !== 'here';
            return <path key={`${a}-${b}`} className={'mtree-edge' + (lit ? ' lit' : '') + (states[a] !== 'locked' && states[b] !== 'locked' ? ' open' : '')}
              d={`M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        {[...new Set(HULLS.map((h) => h.lane))].map((lane) => {
          const first = HULLS.filter((h) => h.lane === lane).sort((a, b) => a.col - b.col)[0];
          return <span key={lane} className="mtree-lane" style={{ left: `${(first.col / COLS) * 100}%`, top: `${(first.row / ROWS) * 100}%` }}>{LANE_SAID[lane]}</span>;
        })}
        {HULLS.map((h) => {
          const st = states[h.id];
          const pace = paceOf(h.id);
          return (
            <button key={h.id} type="button" className={`mtree-node ${st}${open === h.id ? ' sel' : ''}`} style={{ left: `${x(h)}%`, top: `${y(h)}%` }}
              aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)}
              data-tip-title={name(h.id)} data-tip={`${h.role}\n\n${STATE_SAID[st]}${st === 'locked' && info[h.id] ? `: ${missing(h)} skill${missing(h) === 1 ? '' : 's'} to train` : ''}.${pace ? ` Your pace in it: ${units(Math.round(pace.m3PerMin))} m³ a minute.` : ''}`}>
              <img src={`https://images.evetech.net/types/${h.id}/render?size=64`} alt="" width={32} height={32} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <span className="mtree-name">{name(h.id)}</span>
              {st === 'here' ? <MapPin className="mtree-mark" aria-label="You’re in it" /> : st === 'locked' ? <Lock className="mtree-mark" aria-label="Not yet" /> : st === 'close' ? <Sparkles className="mtree-mark" aria-label="Coming in your queue" /> : null}
            </button>
          );
        })}
      </div>

      {/* On a phone the chart is a list: the same hulls, lane by lane. */}
      <div className="mtree-list">
        {HULLS.map((h) => (
          <Fragment key={h.id}>
            <button type="button" className={`mtree-row ${states[h.id]}${open === h.id ? ' sel' : ''}`} aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)}>
              <img src={`https://images.evetech.net/types/${h.id}/render?size=64`} alt="" width={28} height={28} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <span style={{ minWidth: 0 }}><span className="mtree-name">{name(h.id)}</span><span className="sub">{LANE_SAID[h.lane]} · {STATE_SAID[states[h.id]]}</span></span>
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
