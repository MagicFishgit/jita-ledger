import { Fragment, useCallback, useMemo, useState } from 'react';
import { getAuth, hasScope } from '../../lib/auth';
import {
  byAttention, readColony, typesIn, valueOf,
  type Colony, type ColonyWarning, type ExtractorState,
} from '../../lib/colony';
import { rates } from '../../lib/fees';
import { iskBig, plainNum, units } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { colonyLayout, jitaBook, myPlanets, resolveNames } from '../../lib/market';
import { marketBest } from '../../lib/relist';
import { system } from '../../lib/universe';
import { update, useData } from '../../lib/store';
import { Explain, useTypeName } from '../common';

const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';

const WARNING: Record<ColonyWarning, { short: string; why: string; bad: boolean }> = {
  expired: {
    short: 'Programme ended', bad: true,
    why: 'An extraction programme has run out. The colony looks fine from the outside, the factories finish what is left, and then it earns nothing at all until you reset the heads. This is the most common way PI money is quietly lost.',
  },
  endingSoon: {
    short: 'Ending soon', bad: false,
    why: 'A programme runs out within a day. Reset it next time you log in and the colony never stops.',
  },
  noExtractor: {
    short: 'No extractor', bad: true,
    why: 'This colony has no extractor control unit at all, so nothing is being pulled out of the ground.',
  },
  idleExtractor: {
    short: 'Extractor idle', bad: true,
    why: 'An extractor is built but has no programme installed. It cost you the powergrid and is doing nothing.',
  },
  nothingRouted: {
    short: 'Nothing routed', bad: true,
    why: 'Material is being extracted but there are no links to carry it anywhere. It has nowhere to go.',
  },
};

const STATE: Record<ExtractorState, string> = {
  running: 'pos', endingSoon: 'warn', expired: 'neg', idle: 'neg',
};

/** A countdown that reads like one, from hours. */
function left(hours: number): string {
  if (!Number.isFinite(hours)) return 'no programme';
  const h = Math.abs(hours);
  const s = h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
  return hours < 0 ? `${s} ago` : s;
}

export function Colonies() {
  const d = useData();
  const auth = getAuth();
  const nameOf = useTypeName();
  const now = useNow(60_000);
  const r = rates(d.settings);
  const [colonies, setColonies] = useState<Colony[] | null>(null);
  const [systems, setSystems] = useState<Record<number, { name: string; security: number }>>({});
  const [prices, setPrices] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const canRead = hasScope(PLANETS_SCOPE);

  const load = useCallback(async () => {
    if (!auth) return;
    setBusy('Reading your colonies…'); setErr(null);
    try {
      const heads = await myPlanets(auth.characterId);
      const built: Colony[] = [];
      for (const h of heads) {
        setBusy(`Reading colony ${built.length + 1} of ${heads.length}…`);
        const raw = await colonyLayout(auth.characterId, h.planetId);
        built.push(readColony(h, raw, Date.now()));
      }
      built.sort(byAttention);
      setColonies(built);

      const sys: Record<number, { name: string; security: number }> = {};
      await Promise.all([...new Set(heads.map((h) => h.solarSystemId))].map(async (id) => {
        try { const s = await system(id); sys[id] = { name: s.name, security: s.security }; } catch { /* named later */ }
      }));
      setSystems(sys);

      // One pass over every type the colonies touch: what it nets you sold at Jita.
      const ids = typesIn(built);
      const got: Record<number, number> = {};
      await Promise.all(ids.map(async (id) => {
        try {
          const book = await jitaBook(id);
          const sell = marketBest(book.topSells, false);
          const buy = marketBest(book.topBuys, true);
          if (sell != null) got[id] = sell * (1 - r.f - r.t);
          else if (buy != null) got[id] = buy * (1 - r.t);
        } catch { /* left unpriced */ }
      }));
      setPrices(got);

      const missing = ids.filter((id) => !d.names[id]);
      if (missing.length) {
        const n = await resolveNames(missing).catch(() => ({}));
        if (Object.keys(n).length) update((x) => ({ names: { ...x.names, ...n } }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [auth?.characterId, r.f, r.t, d.names]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => (colonies ? valueOf(colonies, (id) => prices[id] ?? null) : null),
    [colonies, prices],
  );

  // Recomputed against the ticking clock, so a programme that lapses while the page is open turns
  // red rather than sitting on a green countdown that has gone negative.
  const live = useMemo(
    () => (colonies ?? []).map((c) => {
      const extractors = c.extractors.map((e) => {
        if (e.expiry == null) return e;
        const hours = (e.expiry - now) / 3600_000;
        const state = hours <= 0 ? 'expired' : hours <= 24 ? 'endingSoon' : 'running';
        return { ...e, hours, state: e.state === 'idle' ? e.state : (state as ExtractorState) };
      });
      const warnings = [...c.warnings];
      if (extractors.some((e) => e.state === 'expired') && !warnings.includes('expired')) warnings.push('expired');
      return { ...c, extractors, warnings };
    }),
    [colonies, now],
  );
  const trouble = live.filter((c) => c.warnings.some((w) => WARNING[w].bad));

  if (!canRead) {
    return (
      <p className="notice warn">
        Add <code>esi-planets.manage_planets.v1</code> to your application on developers.eveonline.com
        and log in again, and this reads your real colonies: when each extraction programme runs out,
        what every extractor is pulling an hour, and what is waiting in the launchpads. Until then the
        estimator below is the best this can do.
      </p>
    );
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <p className="small muted" style={{ margin: 0, maxWidth: '62ch' }}>
          Your own colonies, read from the game. The figures below are measured rather than assumed —
          the only estimate left is that an extraction programme’s output tails off as it runs, so the
          per-hour rate is the top of the range rather than a flat line.
        </p>
        <button className="btn btn-primary" disabled={!!busy} onClick={load}>
          {busy ? busy : colonies ? 'Check again' : 'Read my colonies'}
        </button>
      </div>

      {err && <p className="notice err" role="alert">{err}</p>}

      {!colonies ? (
        <p className="empty">
          Press <strong>Read my colonies</strong>. It lists every planet you have a command centre on,
          with the countdown to each extraction programme running out.
        </p>
      ) : !colonies.length ? (
        <p className="empty">
          No colonies yet. Pick a planet below, put a command centre on it, and this fills in.
        </p>
      ) : (
        <>
          {trouble.length > 0 && (
            <p className="notice err" role="status">
              <strong>{trouble.length === 1 ? 'One colony needs you' : `${trouble.length} colonies need you`}:</strong>{' '}
              {trouble.map((c) => systems[c.head.solarSystemId]?.name ?? `planet ${c.head.planetId}`).join(', ')}.
              An expired programme earns nothing while it sits there.
            </p>
          )}

          {value && (
            <dl className="figures" style={{ marginBottom: 16 }}>
              <div className="stat">
                <dt>Colonies</dt>
                <dd>{units(colonies.length)}<small>{units(colonies.reduce((t, c) => t + c.extractors.length, 0))} extractors, {units(colonies.reduce((t, c) => t + c.factories, 0))} factories</small></dd>
              </div>
              <div className="stat">
                <dt>
                  Coming out an hour
                  <Explain term="Coming out an hour">
                    Every running extractor’s per-cycle figure turned into an hourly rate and priced at
                    what it would net you at Jita. Output falls away over a programme, so read it as the
                    top of the range.
                  </Explain>
                </dt>
                <dd className="pos">{iskBig(value.perHour)}<small>{iskBig(value.perDay)} a day</small></dd>
              </div>
              <div className="stat">
                <dt>Waiting to be collected</dt>
                <dd className={value.stored > 0 ? 'pos' : undefined}>
                  {iskBig(value.stored)}
                  <small>Sitting in storage and launchpads</small>
                </dd>
              </div>
              <div className="stat">
                <dt>A week of this</dt>
                <dd className="pos">{iskBig(value.perDay * 7)}<small>If nothing runs out</small></dd>
              </div>
            </dl>
          )}

          <div className="table-wrap">
            <table className="data wide">
              <thead>
                <tr>
                  <th scope="col">Planet</th>
                  <th scope="col">Extracting</th>
                  <th scope="col">
                    Programme ends
                    <Explain term="Programme ends">
                      An extraction programme runs for a set time and then stops dead. The colony looks
                      normal, the factories drain what is left, and it earns nothing until you reset the
                      heads. This column is the whole reason for reading your colonies at all.
                    </Explain>
                  </th>
                  <th scope="col">An hour</th>
                  <th scope="col">Stored</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {live.map((c) => {
                  const sys = systems[c.head.solarSystemId];
                  const storedValue = c.stored.reduce((t, x) => t + x.amount * (prices[x.typeId] ?? 0), 0);
                  const perHour = c.extractors.reduce(
                    (t, e) => t + (e.productTypeId ? e.unitsPerHour * (prices[e.productTypeId] ?? 0) : 0), 0);
                  const soonest = c.extractors.filter((e) => e.expiry != null).sort((a, b) => a.hours - b.hours)[0];
                  const isOpen = open === c.head.planetId;
                  return (
                    <Fragment key={c.head.planetId}>
                      <tr>
                        <td className="name">
                          <button className="link-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.head.planetId)}>
                            {sys?.name ?? `System ${c.head.solarSystemId}`}
                          </button>
                          <small className="sub">
                            {c.head.planetType}
                            {sys && <> · {sys.security.toFixed(1)}</>}
                            {' · '}command centre {c.head.upgradeLevel}
                          </small>
                        </td>
                        <td style={{ whiteSpace: 'normal' }}>
                          {c.extractors.length
                            ? [...new Set(c.extractors.map((e) => (e.productTypeId ? nameOf(e.productTypeId) : 'nothing')))].join(', ')
                            : <span className="neg">nothing</span>}
                        </td>
                        <td className={soonest ? STATE[soonest.state] : 'neg'}>
                          {soonest ? left(soonest.hours) : 'no programme'}
                        </td>
                        <td className={perHour > 0 ? 'pos' : 'muted'}>{perHour > 0 ? iskBig(perHour) : '–'}</td>
                        <td>{storedValue > 0 ? iskBig(storedValue) : <span className="muted">empty</span>}</td>
                        <td>
                          {c.warnings.length
                            ? c.warnings.map((w) => (
                              <span key={w} className={'flag' + (WARNING[w].bad ? ' v-loss' : '')} title={WARNING[w].why}>
                                {WARNING[w].short}
                              </span>
                            ))
                            : <span className="pos">Running</span>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="detail-row">
                          <td colSpan={6}>
                            <dl className="figures">
                              {c.extractors.map((e) => (
                                <div className="stat" key={e.pinId}>
                                  <dt>{e.productTypeId ? nameOf(e.productTypeId) : 'Idle extractor'}</dt>
                                  <dd className={STATE[e.state]}>
                                    {e.unitsPerHour > 0 ? `${plainNum(Math.round(e.unitsPerHour))}/hour` : '–'}
                                    <small>
                                      {e.heads} heads, {units(e.qtyPerCycle)} a cycle
                                      {e.cycleSeconds > 0 && ` every ${Math.round(e.cycleSeconds / 60)} min`}
                                      {' · '}{e.state === 'expired' ? `ended ${left(e.hours)}` : e.state === 'idle' ? 'no programme' : `${left(e.hours)} left`}
                                    </small>
                                  </dd>
                                </div>
                              ))}
                            </dl>
                            {c.stored.length > 0 && (
                              <p className="small muted" style={{ margin: '10px 0 0' }}>
                                <strong>Waiting to be collected:</strong>{' '}
                                {c.stored.slice(0, 8).map((x) => `${units(x.amount)} × ${nameOf(x.typeId)}`).join(', ')}
                                {c.stored.length > 8 && ` and ${c.stored.length - 8} more`}
                                {storedValue > 0 && <> — {iskBig(storedValue)} at Jita, before you haul it there.</>}
                              </p>
                            )}
                            {c.warnings.map((w) => (
                              <p key={w} className="small muted" style={{ margin: '6px 0 0' }}>
                                <strong className={WARNING[w].bad ? 'warn' : undefined}>{WARNING[w].short}.</strong> {WARNING[w].why}
                              </p>
                            ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {value && value.unpriced > 0 && (
            <p className="small muted" style={{ marginTop: 10 }}>
              {value.unpriced} item{value.unpriced === 1 ? '' : 's'} could not be priced at Jita, so the
              totals above are understated rather than wrong.
            </p>
          )}
        </>
      )}
    </div>
  );
}
