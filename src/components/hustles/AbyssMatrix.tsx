import { useEffect, useState, type ReactNode } from 'react';
import { Atom, Flame, Moon, Radiation, Zap } from 'lucide-react';
import { ENTRY, filamentFacts, TIER_CHECK, TIERS, WEATHER_PLAY, WEATHER_STRENGTH, WEATHERS, whereItOpens, type Filament, type FilamentFacts, type Tier, type Weather } from '../../lib/abyssal';
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
      <div className="kv-mini" style={{ maxWidth: 640 }}>
        {facts?.penalty && <><span data-tip={WEATHER_STRENGTH}>The weather</span><b><span style={{ color: 'var(--neg-l)' }}>{cap(facts.penalty)}</span>, <span style={{ color: 'var(--pos)' }}>{facts.bonus}</span></b></>}
        <span data-tip={ENTRY.source}>Who goes</span><b style={{ whiteSpace: 'normal' }}>{ENTRY.said}</b>
        {facts?.minutes != null && <><span>Timer</span><b>{facts.minutes} minutes for the whole pocket, three rooms; the ship and pod die when it runs out</b></>}
        {facts && <><span>Where</span><b style={{ whiteSpace: 'normal' }}>{whereItOpens(q.f.tierIndex, facts.suspectIn)}</b></>}
        <span data-tip="EVE University’s rule of thumb for a cruiser (FAQ, February 2026): frigates need less, and Dark about 30% less tank.">Takes about</span><b>{TIER_CHECK[q.f.tierIndex].dps} DPS and {TIER_CHECK[q.f.tierIndex].ehps} EHP a second of tank, for a cruiser</b>
        <span>Costs</span><b>{q.cost != null ? isk(q.cost) : '–'}{q.flipNet != null ? `; a run must beat ${isk(q.flipNet)}, what selling it would net` : ''}</b>
        <span>Traded a day</span><b>{q.perDay != null ? units(Math.round(q.perDay)) : '–'}</b>
        <span>You’ve run it</span><b>{runs ? `${units(runs)} time${runs === 1 ? '' : 's'} (filaments you bought)` : 'Not yet'}</b>
      </div>
      <p className="note small" style={{ margin: 0 }}><b>{q.f.weather}:</b> {WEATHER_PLAY[q.f.weather]} {WEATHER_STRENGTH}</p>
      {!facts && <p className="note small" style={{ margin: 0 }}>Reading the filament’s own text…</p>}
      {facts && <p className="note small" style={{ margin: 0, color: 'var(--faint)' }}>The weather, timer and suspect rule are the filament’s own text in the game (ESI); who goes and where Tranquil opens are EVE University’s and CCP’s, since the game’s text is out of date there; strengths and the rule of thumb are EVE University’s.</p>}
      {children}
    </section>
  );
}
