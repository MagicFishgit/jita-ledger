import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Globe, Siren } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { colonyOfKept } from '../../lib/colonies';
import { byAttention, valueOf, type ColonyWarning, type Extractor, type ExtractorState } from '../../lib/colony';
import { ago, iskBig, units } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { PLANETS_SCOPE, readColonies, useColonies } from '../../lib/colonyStore';
import type { PiIndex } from '../../lib/piBundle';
import { readings } from '../../lib/piExtraction';
import { PI_READING, PI_UNCHECKED } from '../../lib/piLearn';
import { useData } from '../../lib/store';
import { system } from '../../lib/universe';
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

/** Each system's name and security, read publicly (and kept, as the universe module keeps them): for colonies drawn from the document. */
function useSystems(ids: number[]): Record<number, { name: string; security: number }> {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const [got, setGot] = useState<Record<number, { name: string; security: number }>>({});
  useEffect(() => {
    let alive = true;
    for (const id of key ? key.split(',').map(Number) : []) {
      system(id).then((s) => { if (alive) setGot((g) => (g[id] ? g : { ...g, [id]: { name: s.name, security: s.security } })); }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [key]);
  return got;
}

/**
 * An extractor's programme total both ways (piExtraction.ts): by CCP's formula, and as ESI's figure a cycle times the cycles. Until
 * the in-game check (Task 13) says which the game reads, both are said and marked not yet checked; the Plan section ranks on the lower.
 */
function ProgramTotal({ e }: { e: Extractor }) {
  const r = e.install != null && e.expiry != null ? readings({ qtyPerCycle: e.qtyPerCycle, cycleSeconds: e.cycleSeconds, install: e.install, expiry: e.expiry }) : null;
  const cycles = r && e.cycleSeconds > 0 ? Math.floor((r.hours * 3600) / e.cycleSeconds) : null;
  return (
    <div style={{ fontSize: 11.5, color: 'var(--note)', marginTop: 4, maxWidth: 320, whiteSpace: 'normal' }} data-planets={`program:${e.pinId}`}>
      {!r ? 'Its programme’s total isn’t known: ESI gave no install time, expiry or quantity for it.' : (
        <>Programme total: <b style={{ color: 'var(--figure)' }}>{units(r.formula.total)}</b> by CCP’s formula, <b style={{ color: 'var(--figure)' }}>{units(r.perCycle.total)}</b> as {units(e.qtyPerCycle)} × {units(cycles)} cycles
          {PI_READING == null ? <>: {PI_UNCHECKED}.</> : <>: the game reads it {PI_READING === 'formula' ? 'by the formula' : 'as the figure a cycle'}.</>}</>
      )}
    </div>
  );
}

export function Colonies({ goods }: { goods?: PiIndex | null }) {
  // The planets' bundle names every planetary good, so kept colonies (whose names no read has looked up here) never say "Item #…".
  const typeName = useTypeName();
  const nameOf = (id: number) => goods?.byId.get(id)?.name ?? typeName(id);
  const now = useNow(60_000);
  const { read, busy, error } = useColonies();
  const keptDoc = useData().colonies;
  const [open, setOpen] = useState<number | null>(null);
  const canRead = hasScope(PLANETS_SCOPE);

  // With no read in memory, the colonies the main's document keeps (this browser's last read, or the cloud's hourly one): they
  // come with no prices, and each says when EVE last updated it, not when it was read.
  const kept = useMemo(() => (!read && keptDoc?.colonies.length ? keptDoc.colonies.map((k) => colonyOfKept(k, now)).sort(byAttention) : null), [read, keptDoc, now]);
  const keptSystems = useSystems(kept ? kept.map((c) => c.head.solarSystemId) : []);
  const shown = read?.colonies ?? kept;
  const systems = read?.systems ?? keptSystems;
  const prices = read?.prices ?? null;
  const newest = kept ? kept.reduce((t, c) => Math.max(t, Date.parse(c.head.lastUpdate) || 0), 0) : 0;

  const value = useMemo(() => (read ? valueOf(read.colonies, (id) => read.prices[id] ?? null) : null), [read]);
  // Recomputed against the ticking clock, so a programme that lapses while the page is open turns
  // red rather than sitting on a green countdown that has gone negative.
  const live = useMemo(() => (shown ?? []).map((c) => {
    const extractors = c.extractors.map((e) => {
      if (e.expiry == null) return e;
      const hours = (e.expiry - now) / 3600_000;
      const state: ExtractorState = e.state === 'idle' ? 'idle' : hours <= 0 ? 'expired' : hours <= 24 ? 'endingSoon' : 'running';
      return { ...e, hours, state };
    });
    const warnings = [...c.warnings];
    if (extractors.some((e) => e.state === 'expired') && !warnings.includes('expired')) warnings.push('expired');
    return { ...c, extractors, warnings };
  }), [shown, now]);
  const trouble = live.filter((c) => c.warnings.some((w) => COLONY_WARNING[w].bad));

  const noScope = (
    <Notice kind="warn">
        Add <code>esi-planets.manage_planets.v1</code> to your application on developers.eveonline.com and log in again, and this reads your real colonies:
        when each extraction programme runs out, what every extractor is pulling an hour, and what is waiting in the launchpads. Until then Plan learns no extraction rates from them: it works a system out at rates you type, or at what its factories could take.
    </Notice>
  );
  if (!canRead && !kept) return noScope;

  return (
    <div className="sub-box col" style={{ gap: 12 }} data-planets="colonies">
      {!canRead && noScope}
      <div className="intro-row">
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <p style={{ margin: 0 }}>Your own colonies, read from the game.</p>
          <Points compact items={[
            { kind: 'good', lead: 'Measured', text: 'every figure below comes from the game, not assumed.' },
            { kind: 'warn', lead: 'Per hour', text: `is ESI’s figure a cycle turned into an hour, unconfirmed on cycles over 15 minutes: each extractor gives its programme’s total both ways, ${PI_UNCHECKED}.` },
          ]} />
        </div>
        {canRead && <button type="button" className="btn primary tall" disabled={!!busy} onClick={() => readColonies(0)}><Globe aria-hidden="true" />{read ? 'Check again' : kept ? 'Read them now' : 'Read my colonies'}</button>}
      </div>
      {busy && <div className="busy-row" role="status"><span className="spinner keep-motion" /><span className="bt">{busy}</span></div>}
      {error && <Notice kind="err">{error}</Notice>}
      {kept && (
        <p className="note small" style={{ margin: 0 }} data-planets="kept">
          As kept from the last read (this browser’s, or the cloud’s hourly one): each colony as EVE last updated it{newest > 0 ? `, the newest ${ago(new Date(newest).toISOString(), now)}` : ''}. Nothing is priced until you read them{canRead ? ' again' : ''}.
        </p>
      )}
      {!shown ? (
        !busy && <p className="note">Press <b style={{ color: 'var(--figure)' }}>Read my colonies</b>. It lists every planet you have a command centre on, with the countdown to each extraction programme running out.</p>
      ) : !shown.length ? (
        <p className="note">No colonies yet. Find what pays on Plan, put a command centre on a planet, and this fills in.</p>
      ) : (
        <>
          {trouble.length > 0 && (
            <div className="row" style={{ padding: '10px 14px', background: 'rgba(255,107,125,.07)', border: '1px solid rgba(255,107,125,.4)', fontSize: 13, animation: 'rise .3s' }}>
              <Siren aria-hidden="true" style={{ width: 16, height: 16, color: 'var(--neg)' }} />
              <span>
                <b>{trouble.length === 1 ? 'One colony needs you' : `${trouble.length} colonies need you`}:</b>{' '}
                {trouble.map((c) => systems[c.head.solarSystemId]?.name ?? `planet ${c.head.planetId}`).join(', ')}. An expired programme earns nothing while it sits there.
              </span>
            </div>
          )}
          {(
            <div className="mini-tiles">
              {[
                { l: 'Colonies', v: units(shown.length), n: `${units(shown.reduce((t, c) => t + c.extractors.length, 0))} extractors, ${units(shown.reduce((t, c) => t + c.factories, 0))} factories` },
                ...(value ? [
                  { l: 'Coming out an hour', v: iskBig(value.perHour), n: `${iskBig(value.perDay)} a day`, c: 'var(--pos)', tip: 'What your running extractors produce, priced at what it would net you at Jita.\n\n• Each extractor’s per-cycle figure from ESI, turned into an hourly rate.\n• Unconfirmed on cycles over 15 minutes: CCP’s formula reads the same programme differently (each extractor gives both totals), and neither is yet checked against the game’s total.' },
                  { l: 'Waiting to be collected', v: iskBig(value.stored), n: 'Sitting in storage and launchpads', c: value.stored > 0 ? 'var(--pos)' : undefined },
                  { l: 'A week of this', v: iskBig(value.perDay * 7), n: 'If nothing runs out', c: 'var(--pos)' },
                ] : [
                  // Kept colonies come with no prices: said, never 0.
                  { l: 'Coming out an hour', v: '–', n: 'Priced when you read your colonies', tip: undefined },
                  { l: 'Waiting to be collected', v: '–', n: 'Priced when you read your colonies' },
                ]),
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
                  const sys = systems[c.head.solarSystemId];
                  const storedValue = prices ? c.stored.reduce((t, x) => t + x.amount * (prices[x.typeId] ?? 0), 0) : null;
                  const perHour = prices ? c.extractors.reduce((t, e) => t + (e.productTypeId ? e.unitsPerHour * (prices[e.productTypeId] ?? 0) : 0), 0) : null;
                  const running = c.extractors.some((e) => e.unitsPerHour > 0);
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
                        <td style={{ color: perHour != null && perHour > 0 ? 'var(--pos)' : 'var(--label)' }}>{perHour == null ? (running ? <span className="faint" data-tip="Priced when you read your colonies">not priced</span> : '–') : perHour > 0 ? iskBig(perHour) : '–'}</td>
                        <td>{!c.stored.length ? <span className="faint">empty</span> : storedValue == null ? <span className="faint" data-tip="Priced when you read your colonies; open the colony for what’s there">not priced</span> : storedValue > 0 ? iskBig(storedValue) : <span className="faint">empty</span>}</td>
                        <td className="l">
                          <span className="flags" style={{ justifyContent: 'flex-start' }}>
                            {c.warnings.length ? c.warnings.map((w) => <span key={w} className="flag plain" tabIndex={0} data-tip={COLONY_WARNING[w].why} data-tip-title={COLONY_WARNING[w].short} style={cssVars({ '--c': COLONY_WARNING[w].bad ? 'var(--neg)' : 'var(--acc2)' })}>{COLONY_WARNING[w].short}</span>)
                              : <span className="pos" style={{ fontFamily: 'var(--f-body)' }}>Running</span>}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="detail">
                          <td colSpan={6} className="col-detail">
                            {/* On a phone the opened colony keeps to the table's visible width (styles.css `.col-unfold`), so an
                                extractor's programme totals, the reading check's one figure, aren't cut off past the edge. */}
                            <div className="unfold col-unfold">
                              <div className="row" style={{ alignItems: 'stretch' }}>
                                {c.extractors.map((e) => (
                                  <div key={e.pinId} className="col-ex" style={{ padding: '10px 12px', background: 'rgba(2,7,12,.55)', borderLeft: `2px solid ${STATE_C[e.state]}` }}>
                                    <div className="lbl">{e.productTypeId ? nameOf(e.productTypeId) : 'Idle extractor'}</div>
                                    <div className="mono" style={{ fontSize: 14, color: STATE_C[e.state], marginTop: 3 }}>{e.unitsPerHour > 0 ? `${units(Math.round(e.unitsPerHour))}/hour` : '–'}</div>
                                    <div style={{ fontSize: 11.5, color: 'var(--note)' }}>
                                      {e.heads} heads · {units(e.qtyPerCycle)} a cycle{e.cycleSeconds > 0 && ` every ${Math.round(e.cycleSeconds / 60)} min`} · {e.state === 'expired' ? `ended ${left(e.hours)}` : e.state === 'idle' ? 'no programme' : `${left(e.hours)} left`}
                                    </div>
                                    {e.state !== 'idle' && <ProgramTotal e={e} />}
                                  </div>
                                ))}
                              </div>
                              {c.stored.length > 0 && (
                                <div style={{ margin: '10px 0 0' }}>
                                  <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>Waiting to be collected{storedValue != null && storedValue > 0 ? `: ${iskBig(storedValue)} at Jita, before you haul it there` : ''}</span>
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
