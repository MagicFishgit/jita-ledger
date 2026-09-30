import { useEffect, useState, type ReactNode } from 'react';
import { Atom, Flame, Info, MapPin, Moon, Radiation, Rocket, Timer, Zap } from 'lucide-react';
import { ENTRY, ENTRY_OPTIONS, filamentFacts, TIER_CHECK, TIERS, WEATHER_PLAY, WEATHER_STRENGTH, WEATHERS, type Filament, type FilamentFacts, type Tier, type Weather } from '../../lib/abyssal';
import { Figures, Points, type PointLike } from '../Facts';
import { isk, iskBig, units } from '../../lib/format';
import { typeDescription } from '../../lib/universe';
import { OpenInGame } from '../common';

/**
 * Abyssal Deadspace as a grid: the seven tiers down, the five weathers across, one filament a cell, with what it costs
 * at Jita and how many you've run. Pick one and it says what the game says about it (the filament's own text: the ships
 * it takes, the weather's penalty and bonus, the timer, where it can't be opened and where it flags you suspect), how it
 * trades, and, through `children`, what the page knows about running it. The user asked for Abyssal "by difficulty tier
 * and then weather type and then the fits that specialize for those and progression" (30 September 2026).
 */

export type FilamentQuote = { f: Filament; cost: number | null; flipNet: number | null; perDay: number | null };
export type Cell = { tier: Tier; weather: Weather };

export const WEATHER_ICON: Record<Weather, typeof Zap> = { Dark: Moon, Electrical: Zap, Exotic: Atom, Firestorm: Flame, Gamma: Radiation };

export function AbyssMatrix({ quotes, runs, cell, onCell, cellNote }: {
  quotes: FilamentQuote[];
  /** Filaments you've bought, all time, by type: runs you've started. */
  runs: Record<number, number>;
  cell: Cell | null; onCell: (c: Cell) => void;
  /** A short line for a cell from what the page knows (Abyss Tracker's figures), or null. */
  cellNote?: (c: Cell) => string | null;
}) {
  const at = (tier: Tier, weather: Weather) => quotes.find((q) => q.f.tier === tier && q.f.weather === weather) ?? null;
  return (
    <div className="tbl-scroll abyss-grid-wrap">
      <table className="abyss-grid" aria-label="Filaments by tier and weather">
        <thead>
          <tr>
            <th scope="col" className="corner">Tier</th>
            {WEATHERS.map((w) => { const I = WEATHER_ICON[w]; return <th key={w} scope="col"><I aria-hidden="true" />{w}</th>; })}
          </tr>
        </thead>
        <tbody>
          {TIERS.map((tier, ti) => (
            <tr key={tier}>
              <th scope="row"><span className="t-num">T{ti}</span>{tier}</th>
              {WEATHERS.map((weather) => {
                const q = at(tier, weather);
                const sel = cell?.tier === tier && cell?.weather === weather;
                const mine = q ? runs[q.f.typeId] ?? 0 : 0;
                const note = cellNote?.({ tier, weather }) ?? null;
                return (
                  <td key={weather}>
                    <button type="button" className={'abyss-cell' + (sel ? ' sel' : '') + (mine ? ' mine' : '')} aria-pressed={sel}
                      onClick={() => onCell({ tier, weather })} aria-label={`${tier} ${weather}`}>
                      <span className="c-cost">{q?.cost != null ? iskBig(q.cost) : '–'}</span>
                      {mine > 0 && <span className="c-mine">you: {units(mine)}</span>}
                      {note && <span className="c-note">{note}</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One filament picked: what its own text says, and how it trades. `children` adds what the page knows beyond ESI. */
export function AbyssCell({ q, runs, children }: { q: FilamentQuote; runs: number; children?: ReactNode }) {
  const [facts, setFacts] = useState<FilamentFacts | null>(null);
  useEffect(() => {
    let alive = true;
    setFacts(null);
    typeDescription(q.f.typeId).then((t) => { if (alive) setFacts(filamentFacts(t)); }).catch(() => undefined);
    return () => { alive = false; };
  }, [q.f.typeId]);
  const I = WEATHER_ICON[q.f.weather];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <section className="abyss-cell-detail" aria-label={q.f.name}>
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <img src={`https://images.evetech.net/types/${q.f.typeId}/icon?size=64`} alt="" width={40} height={40} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="lbl" style={{ display: 'block' }}>T{q.f.tierIndex} · <I aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-1px' }} /> {q.f.weather}</span>
          <span style={{ fontSize: 17, color: 'var(--ink)' }}>{q.f.name}</span>
        </span>
        <OpenInGame typeId={q.f.typeId} name={q.f.name} />
      </div>
      {/* What it does: the weather, where it opens, the timer; then who can go, drawn; then the figures. */}
      {facts ? <Points items={[
        ...(facts.penalty ? [{ kind: 'warn', icon: I, lead: q.f.weather, tip: WEATHER_STRENGTH, text: <><span style={{ color: 'var(--neg-l)' }}>{cap(facts.penalty)}</span>; <span style={{ color: 'var(--pos)' }}>{facts.bonus}</span>.</> } as PointLike] : []),
        { kind: 'tip', lead: 'How it plays', text: WEATHER_PLAY[q.f.weather] },
        { kind: 'info', icon: MapPin, lead: 'Opens', text: q.f.tierIndex === 0 ? 'Anywhere, 1.0 and 0.9 included.' : 'Not in 1.0 or 0.9 systems.',
          tip: q.f.tierIndex === 0 ? 'Since patch 23.02; the filament’s own text still says otherwise.' : undefined },
        ...(facts.suspectIn.length ? [{ kind: 'warn', lead: 'Suspect', text: `Opening it in ${facts.suspectIn.join(', ')} flags you suspect.` } as PointLike] : []),
        ...(facts.minutes != null ? [{ kind: 'warn', icon: Timer, lead: `${facts.minutes} minutes`, text: 'for all three rooms; ship and pod die when it runs out.' } as PointLike] : []),
      ]} /> : <p className="note small" style={{ margin: 0 }}>Reading the filament’s own text…</p>}
      <div>
        <span className="lbl" style={{ display: 'block', marginBottom: 6 }} data-tip={ENTRY.source}>Who can go</span>
        <div className="entry-opts">
          {ENTRY_OPTIONS.map((o) => (
            <div key={o.hull} className="entry-opt" data-tip={o.note}>
              <span className="ships" aria-hidden="true">{Array.from({ length: o.n }, (_, i) => <Rocket key={i} />)}</span>
              <b>{o.n} {o.hull}</b>
              <span>loot ×{o.loot}</span>
            </div>
          ))}
        </div>
      </div>
      <Figures items={[
        { value: `${TIER_CHECK[q.f.tierIndex].dps} DPS`, label: `and ${TIER_CHECK[q.f.tierIndex].ehps} EHP a second of tank, for a cruiser`, tip: 'EVE University’s rule of thumb for a cruiser (FAQ, February 2026): frigates need less, and Dark about 30% less tank.' },
        { value: q.cost != null ? isk(q.cost) : '–', label: 'a filament at Jita' },
        ...(q.flipNet != null ? [{ value: isk(q.flipNet), label: 'a run must beat: what selling it would net', tip: 'After the broker fee and sales tax: the loot has to beat this, or selling the filament paid better.' }] : []),
        { value: q.perDay != null ? units(Math.round(q.perDay)) : '–', label: 'traded a day' },
        { value: runs ? units(runs) : 'None', label: runs === 1 ? 'run by you' : 'run by you (filaments you bought)' },
      ]} />
      {facts && <p className="note small" style={{ margin: 0, color: 'var(--faint)' }}><Info aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-1px' }} /> <span data-tip="The weather, timer and suspect rule are the filament’s own text in the game (ESI). Who goes and where Tranquil opens are EVE University’s and CCP’s, since the game’s text is out of date there. Strengths and the rule of thumb are EVE University’s.">Where these come from</span></p>}
      {children}
    </section>
  );
}
