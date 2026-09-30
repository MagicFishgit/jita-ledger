import type { LucideIcon } from 'lucide-react';
import { Ban, ChevronsUp, CircleCheck, Info, Lightbulb, Quote, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { TypeDogma } from '../lib/miningYield';
import type { Point, PointKind, Stat } from '../lib/shipTree';
import { cssVars } from './ui';

/**
 * Facts drawn to be read at a glance rather than as a paragraph: points with an icon for their kind, a hull's bonuses as
 * chips, research figures with their source, and a hull's resists as bars. The user found the ship notes, a paragraph of
 * bonuses, resists, run counts and quotes, "really hard to read or understand at a glance" (30 September 2026).
 */

export const POINT_KIND: Record<PointKind, { icon: LucideIcon; color: string; said: string }> = {
  good: { icon: CircleCheck, color: 'var(--pos)', said: 'Suits it' },
  avoid: { icon: Ban, color: 'var(--neg)', said: 'Keep it out of' },
  hole: { icon: ShieldAlert, color: 'var(--acc2)', said: 'Weak spot' },
  tip: { icon: Lightbulb, color: 'var(--acc)', said: 'Tip' },
  warn: { icon: TriangleAlert, color: 'var(--acc2)', said: 'Careful' },
  quote: { icon: Quote, color: 'var(--faint)', said: 'In its fit’s own words' },
  info: { icon: Info, color: 'var(--sec)', said: 'Worth knowing' },
};

/** Points a line each: the kind's icon (or the page's own for a lead it knows, a weather's), the lead in bold, the clause. */
export function Points({ items, iconOf }: { items: Point[]; iconOf?: (p: Point) => LucideIcon | undefined }) {
  return (
    <ul className="points">
      {items.map((p, i) => {
        const k = POINT_KIND[p.kind];
        const Icon = iconOf?.(p) ?? k.icon;
        return (
          <li key={i} className={'pt ' + p.kind} style={cssVars({ '--c': k.color })}>
            <Icon aria-hidden="true" />
            <span><span className="sr-only">{k.said}: </span>{p.lead && <b>{p.lead}</b>}{p.lead && ' '}{p.kind === 'quote' ? <q>{p.text}</q> : p.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A hull's bonuses as chips. */
export function Bonuses({ items }: { items: string[] }) {
  return (
    <div className="bonuses" aria-label="Hull bonuses">
      {items.map((b) => <span key={b} className="bonus"><ChevronsUp aria-hidden="true" />{b}</span>)}
    </div>
  );
}

/** Research figures: each its number and what it counts, with its source and date in its tip, and a line saying they aren't live. */
export function Stats({ items }: { items: Stat[] }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="stats">
        {items.map((s) => (
          <span key={s.label} className="stat" tabIndex={0} data-tip={`${s.source}.`} data-tip-title={`${s.value} ${s.label}`}>
            <b>{s.value}</b><span>{s.label}</span>
          </span>
        ))}
      </div>
      <span className="note small" style={{ margin: 0, color: 'var(--faint)' }}>From research, not live: each figure’s tip says where and when it was measured.</span>
    </div>
  );
}

/** The four damage types in the order the game lists them, each layer's resonance attributes in the same order. */
const DAMAGE = [
  { said: 'EM', short: 'EM', c: 'var(--dmg-em)' }, { said: 'Thermal', short: 'Th', c: 'var(--dmg-th)' },
  { said: 'Kinetic', short: 'Kin', c: 'var(--dmg-kin)' }, { said: 'Explosive', short: 'Exp', c: 'var(--dmg-exp)' },
];
const LAYERS: { said: string; attrs: [number, number, number, number] }[] = [
  { said: 'Shield', attrs: [271, 274, 273, 272] },
  { said: 'Armour', attrs: [267, 270, 269, 268] },
];

/**
 * A hull's shield and armour resists as bars, from its dogma (1 − each resonance): the hull alone, before skills and
 * modules. Each layer's weakest is marked, the hole a fit has to cover.
 */
export function ResistBars({ dogma }: { dogma: TypeDogma }) {
  return (
    <div className="resists" role="group" aria-label="Base resists, before skills and modules">
      {LAYERS.map((l) => {
        const r = l.attrs.map((a) => Math.max(0, 1 - (dogma.attrs[a] ?? 1)));
        const low = Math.min(...r);
        return (
          <div key={l.said} className="res-row">
            <span className="res-l">{l.said}</span>
            {r.map((x, i) => {
              const hole = x === low && r.some((y) => y > low + 0.05);
              return (
                <span key={i} className={'res' + (hole ? ' hole' : '')} style={cssVars({ '--c': DAMAGE[i].c })}
                  data-tip={`${l.said} ${DAMAGE[i].said}: ${Math.round(x * 100)}% before skills and modules${hole ? '. Its weakest, the hole a fit covers.' : '.'}`}>
                  <span className="res-bar"><span style={{ width: `${Math.round(x * 100)}%` }} /></span>
                  <span className="res-n"><span className="sr-only">{DAMAGE[i].said} </span>{Math.round(x * 100)}%</span>
                </span>
              );
            })}
          </div>
        );
      })}
      <div className="res-key" aria-hidden="true">
        <span />{DAMAGE.map((d) => <span key={d.said} style={cssVars({ '--c': d.c })}><i /><span className="k-full">{d.said}</span><span className="k-short">{d.short}</span></span>)}
      </div>
    </div>
  );
}
