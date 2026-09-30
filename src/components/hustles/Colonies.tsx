import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Globe, Siren } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { valueOf, type ColonyWarning, type ExtractorState } from '../../lib/colony';
import { iskBig, units } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { PLANETS_SCOPE, readColonies, useColonies } from '../../lib/colonyStore';
import { useTypeName } from '../common';
import { cssVars, ItemIcon, Notice, Th, Tip } from '../ui';
import { Points } from '../Facts';

export const COLONY_WARNING: Record<ColonyWarning, { short: string; why: string; bad: boolean }> = {
  expired: { short: 'Programme ended', bad: true, why: 'An extraction programme has run out.\n\nThe colony looks fine from the outside and the factories finish what’s left, then it earns nothing until you reset the heads. This is the most common way PI money is quietly lost.' },
  endingSoon: { short: 'Ending soon', bad: false, why: 'A programme runs out within a day. Reset it next time you log in and the colony never stops.' },
  noExtractor: { short: 'No extractor', bad: true, why: 'This colony has no extractor control unit at all, so nothing is being pulled out of the ground.' },
  idleExtractor: { short: 'Extractor idle', bad: true, why: 'An extractor is built but has no programme installed. It cost you the powergrid and is doing nothing.' },
  nothingRouted: { short: 'Nothing routed', bad: true, why: 'Material is being extracted but there are no links to carry it anywhere. It has nowhere to go.' },
};

const STATE_C: Record<ExtractorState, string> = { running: 'var(--pos)', endingSoon: 'var(--acc2)', expired: 'var(--neg)', idle: 'var(--neg)' };

/** A countdown that reads like one, from hours. */
export function left(hours: number): string {
  if (!Number.isFinite(hours)) return 'no programme';
  const h = Math.abs(hours);
  const s = h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
  return hours < 0 ? `${s} ago` : s;
}

export function Colonies() {
  const nameOf = useTypeName();
  const now = useNow(60_000);
  const { read, busy, error } = useColonies();
  const [open, setOpen] = useState<number | null>(null);
  const canRead = hasScope(PLANETS_SCOPE);

  const value = useMemo(() => (read ? valueOf(read.colonies, (id) => read.prices[id] ?? null) : null), [read]);
  // Recomputed against the ticking clock, so a programme that lapses while the page is open turns
  // red rather than sitting on a green countdown that has gone negative.
  const live = useMemo(() => (read?.colonies ?? []).map((c) => {
    const extractors = c.extractors.map((e) => {
      if (e.expiry == null) return e;
      const hours = (e.expiry - now) / 3600_000;
      const state: ExtractorState = e.state === 'idle' ? 'idle' : hours <= 0 ? 'expired' : hours <= 24 ? 'endingSoon' : 'running';
      return { ...e, hours, state };
    });
    const warnings = [...c.warnings];
    if (extractors.some((e) => e.state === 'expired') && !warnings.includes('expired')) warnings.push('expired');
    return { ...c, extractors, warnings };
  }), [read, now]);
  const trouble = live.filter((c) => c.warnings.some((w) => COLONY_WARNING[w].bad));

  if (!canRead) {
    return (
      <Notice kind="warn">
        Add <code>esi-planets.manage_planets.v1</code> to your application on developers.eveonline.com and log in again, and this reads your real colonies:
        when each extraction programme runs out, what every extractor is pulling an hour, and what is waiting in the launchpads. Until then the steps below are the best this can do.
      </Notice>
    );
  }

  return (
    <div className="sub-box col" style={{ gap: 12 }}>
      <div className="intro-row">
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <p style={{ margin: 0 }}>Your own colonies, read from the game.</p>
          <Points compact items={[
            { kind: 'good', lead: 'Measured', text: 'every figure below comes from the game, not assumed.' },
            { kind: 'warn', lead: 'Per hour', text: 'is the top of the range: an extraction programme’s output tails off as it runs.' },
          ]} />
        </div>
        <button type="button" className="btn primary tall" disabled={!!busy} onClick={() => readColonies(0)}><Globe aria-hidden="true" />{read ? 'Check again' : 'Read my colonies'}</button>
      </div>
      {busy && <div className="busy-row" role="status"><span className="spinner keep-motion" /><span className="bt">{busy}</span></div>}
      {error && <Notice kind="err">{error}</Notice>}
      {!read ? (
        !busy && <p className="note">Press <b style={{ color: 'var(--figure)' }}>Read my colonies</b>. It lists every planet you have a command centre on, with the countdown to each extraction programme running out.</p>
      ) : !read.colonies.length ? (
        <p className="note">No colonies yet. Pick a product below, put a command centre on a planet, and this fills in.</p>
      ) : (
        <>
          {trouble.length > 0 && (
            <div className="row" style={{ padding: '10px 14px', background: 'rgba(255,107,125,.07)', border: '1px solid rgba(255,107,125,.4)', fontSize: 13, animation: 'rise .3s' }}>
              <Siren aria-hidden="true" style={{ width: 16, height: 16, color: 'var(--neg)' }} />
              <span>
                <b>{trouble.length === 1 ? 'One colony needs you' : `${trouble.length} colonies need you`}:</b>{' '}
                {trouble.map((c) => read.systems[c.head.solarSystemId]?.name ?? `planet ${c.head.planetId}`).join(', ')}. An expired programme earns nothing while it sits there.
              </span>
            </div>
          )}
          {value && (
            <div className="mini-tiles">
              {[
                { l: 'Colonies', v: units(read.colonies.length), n: `${units(read.colonies.reduce((t, c) => t + c.extractors.length, 0))} extractors, ${units(read.colonies.reduce((t, c) => t + c.factories, 0))} factories` },
                { l: 'Coming out an hour', v: iskBig(value.perHour), n: `${iskBig(value.perDay)} a day`, c: 'var(--pos)', tip: 'What your running extractors produce, priced at what it would net you at Jita.\n\n• Each extractor’s per-cycle figure, turned into an hourly rate.\n• Output falls away over a programme, so read this as the top of the range.' },
                { l: 'Waiting to be collected', v: iskBig(value.stored), n: 'Sitting in storage and launchpads', c: value.stored > 0 ? 'var(--pos)' : undefined },
                { l: 'A week of this', v: iskBig(value.perDay * 7), n: 'If nothing runs out', c: 'var(--pos)' },
              ].map((t) => (
                <div key={t.l} className="mini-tile" style={cssVars({ '--c': t.c })}>
                  <div className="tile-l">{t.l}{t.tip && <Tip text={t.tip} title={t.l} />}</div><div className="tile-v">{t.v}</div><div className="tile-n">{t.n}</div>
                </div>
              ))}
            </div>
          )}
          <div className="tbl-scroll">
            <table className="tbl compact" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <Th left>Planet</Th><Th left>Extracting</Th>
                  <Th tip={'When the extraction programme stops.\n\n• It runs for a set time, then stops dead.\n• The colony still looks normal and the factories drain what’s left, but it earns nothing until you reset the heads.'}>Programme ends</Th>
                  <Th>An hour</Th><Th>Stored</Th><Th left>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {live.map((c) => {
                  const sys = read.systems[c.head.solarSystemId];
                  const storedValue = c.stored.reduce((t, x) => t + x.amount * (read.prices[x.typeId] ?? 0), 0);
                  const perHour = c.extractors.reduce((t, e) => t + (e.productTypeId ? e.unitsPerHour * (read.prices[e.productTypeId] ?? 0) : 0), 0);
                  const soonest = c.extractors.filter((e) => e.expiry != null).sort((a, b) => a.hours - b.hours)[0];
                  const isOpen = open === c.head.planetId;
                  return (
                    <Fragment key={c.head.planetId}>
                      <tr className={'hover' + (isOpen ? ' open' : '')}>
                        <td className="l">
                          <button type="button" className="expander" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.head.planetId)}>
                            <ChevronRight className="chev" aria-hidden="true" />
                            <span><span className="name" style={{ display: 'block', fontWeight: 400 }}>{sys?.name ?? `System ${c.head.solarSystemId}`}</span>
                              <span className="sub">{c.head.planetType}{sys && ` · ${sys.security.toFixed(1)}`} · command centre {c.head.upgradeLevel}</span></span>
                          </button>
                        </td>
                        <td className="l txt wrap" style={{ color: 'var(--cell)' }}>{c.extractors.length ? [...new Set(c.extractors.map((e) => (e.productTypeId ? nameOf(e.productTypeId) : 'nothing')))].join(', ') : <span className="neg">nothing</span>}</td>
                        <td style={{ color: soonest ? STATE_C[soonest.state] : 'var(--neg)' }}>{soonest ? left(soonest.hours) : 'no programme'}</td>
                        <td style={{ color: perHour > 0 ? 'var(--pos)' : 'var(--label)' }}>{perHour > 0 ? iskBig(perHour) : '–'}</td>
                        <td>{storedValue > 0 ? iskBig(storedValue) : <span className="faint">empty</span>}</td>
                        <td className="l">
                          <span className="flags" style={{ justifyContent: 'flex-start' }}>
                            {c.warnings.length ? c.warnings.map((w) => <span key={w} className="flag plain" tabIndex={0} data-tip={COLONY_WARNING[w].why} data-tip-title={COLONY_WARNING[w].short} style={cssVars({ '--c': COLONY_WARNING[w].bad ? 'var(--neg)' : 'var(--acc2)' })}>{COLONY_WARNING[w].short}</span>)
                              : <span className="pos" style={{ fontFamily: 'var(--f-body)' }}>Running</span>}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="detail">
                          <td colSpan={6} style={{ paddingLeft: 34 }}>
                            <div className="unfold">
                              <div className="row" style={{ alignItems: 'stretch' }}>
                                {c.extractors.map((e) => (
                                  <div key={e.pinId} style={{ minWidth: 200, padding: '10px 12px', background: 'rgba(2,7,12,.55)', borderLeft: `2px solid ${STATE_C[e.state]}` }}>
                                    <div className="lbl">{e.productTypeId ? nameOf(e.productTypeId) : 'Idle extractor'}</div>
                                    <div className="mono" style={{ fontSize: 14, color: STATE_C[e.state], marginTop: 3 }}>{e.unitsPerHour > 0 ? `${units(Math.round(e.unitsPerHour))}/hour` : '–'}</div>
                                    <div style={{ fontSize: 11.5, color: 'var(--note)' }}>
                                      {e.heads} heads · {units(e.qtyPerCycle)} a cycle{e.cycleSeconds > 0 && ` every ${Math.round(e.cycleSeconds / 60)} min`} · {e.state === 'expired' ? `ended ${left(e.hours)}` : e.state === 'idle' ? 'no programme' : `${left(e.hours)} left`}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {c.stored.length > 0 && (
                                <div style={{ margin: '10px 0 0' }}>
                                  <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>Waiting to be collected{storedValue > 0 ? `: ${iskBig(storedValue)} at Jita, before you haul it there` : ''}</span>
                                  <div className="bonuses">
                                    {c.stored.slice(0, 8).map((x) => <span key={x.typeId} className="bonus drop"><ItemIcon id={x.typeId} size="sm" />{nameOf(x.typeId)}<b style={{ color: 'var(--figure)' }}>{units(x.amount)}</b></span>)}
                                    {c.stored.length > 8 && <span className="bonus drop">and {c.stored.length - 8} more</span>}
                                  </div>
                                </div>
                              )}
                              {c.warnings.length > 0 && <div style={{ margin: '8px 0 0' }}><Points compact items={c.warnings.map((w) => ({ kind: 'warn' as const, lead: COLONY_WARNING[w].short, text: COLONY_WARNING[w].why }))} /></div>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {value && value.unpriced > 0 && <p className="note small">{value.unpriced} item{value.unpriced === 1 ? '' : 's'} could not be priced at Jita, so the totals above are understated rather than wrong.</p>}
        </>
      )}
    </div>
  );
}
