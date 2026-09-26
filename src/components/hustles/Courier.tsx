import { useCallback, useMemo, useState } from 'react';
import {
  byUsefulness, HAULERS, judgeCourier, roundTrips, tally, UNSAFE,
  type CourierContract, type CourierFlag, type CourierLimits, type Endpoint,
} from '../../lib/courier';
import { iskBig, plainNum, units } from '../../lib/format';
import { Explain } from '../common';
import { publicContracts } from '../../lib/market';
import { endpoint, secureJumps } from '../../lib/universe';
import { THE_FORGE } from '../../lib/config';
import { SkillPanel } from './SkillPanel';
import { HAULING_SKILLS } from '../../lib/skills';

const FLAG: Record<CourierFlag, { short: string; why: string }> = {
  endUnknown: {
    short: 'Can’t see destination',
    why: 'The delivery point is a player structure ESI won’t describe without docking access. This is the classic hauling scam: you fly the cargo out, find you can’t dock, and the collateral is theirs. Never take one of these.',
  },
  startUnknown: {
    short: 'Can’t see pickup',
    why: 'The pickup point is a player structure you may not be able to dock at. You can’t even start the job, and if you accept it the clock still runs.',
  },
  lowsec: {
    short: 'Not high-sec',
    why: 'One end sits below 0.5. Gate camps do not care that you are only passing through, and the collateral goes with the ship.',
  },
  noSafeRoute: {
    short: 'No high-sec route',
    why: 'There is no way to make this trip without leaving high-sec, whatever the two endpoints look like. ESI was asked for a high-sec-only route and there isn’t one.',
  },
  tooBig: {
    short: 'Too big',
    why: 'The cargo is larger than the hauler you picked. Nothing wrong with the contract; you just can’t carry it.',
  },
  collateralOverLimit: {
    short: 'Over your collateral',
    why: 'You would have to front more ISK than the limit you set. That ISK is locked up and at risk until you deliver.',
  },
  collateralHeavy: {
    short: 'Collateral dwarfs reward',
    why: 'More than fifty times the reward is held as collateral. Even an honest contract of this shape is a poor bargain — you carry all the risk for a thin fee.',
  },
  thinReward: {
    short: 'Pays too little',
    why: 'Below the per-jump rate you said was worth the trip.',
  },
  rushed: {
    short: 'Not enough time',
    why: 'More than fifteen jumps a day to make the deadline. Miss it and you forfeit the collateral, which is sometimes the whole point of the contract.',
  },
  expiringSoon: {
    short: 'Expiring',
    why: 'This contract disappears within six hours. Fine if you are undocking now.',
  },
};

const DEFAULTS: CourierLimits = { maxVolume: 62000, maxCollateral: 500_000_000, minRewardPerJump: 500_000 };

export function Courier() {
  // What was fetched, kept separate from what it means. Judging happens at render against the
  // current limits, so changing your hauler re-reads the whole list instead of needing a rescan.
  const [raw, setRaw] = useState<{ c: CourierContract; start: Endpoint; end: Endpoint; jumps: number | null }[] | null>(null);
  const [limits, setLimits] = useState<CourierLimits>(DEFAULTS);
  const [safeOnly, setSafeOnly] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);

  const load = useCallback(async () => {
    setBusy('Reading public contracts…'); setErr(null);
    try {
      const all = await publicContracts(THE_FORGE);
      const couriers = all.filter((c) => c.type === 'courier' && c.start_location_id && c.end_location_id);
      setScanned(all.length);

      const out: { c: CourierContract; start: Endpoint; end: Endpoint; jumps: number | null }[] = [];
      let i = 0, done = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (i < couriers.length) {
          const c = couriers[i++];
          const [start, end] = await Promise.all([endpoint(c.start_location_id!), endpoint(c.end_location_id!)]);
          // Only ask for a route when both ends are places we could actually identify.
          const jumps = start.systemId != null && end.systemId != null
            ? await secureJumps(start.systemId, end.systemId).catch(() => null)
            : null;
          out.push({
            c: {
              contractId: c.contract_id,
              reward: c.reward ?? 0,
              collateral: c.collateral ?? 0,
              volume: c.volume ?? 0,
              daysToComplete: c.days_to_complete ?? 0,
              dateExpired: c.date_expired,
              startId: c.start_location_id!,
              endId: c.end_location_id!,
              title: c.title ?? '',
            },
            start, end, jumps,
          });
          setBusy(`Checking ${++done} of ${couriers.length} courier contracts…`);
        }
      }));
      setRaw(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const rows = useMemo(
    () => (raw ?? []).map((x) => judgeCourier(x.c, x.start, x.end, x.jumps, limits)).sort(byUsefulness),
    [raw, limits],
  );

  const trips = useMemo(() => roundTrips(rows), [rows]);
  const run = useMemo(() => tally(rows, 5), [rows]);
  const shown = rows.filter((v) => !safeOnly || v.safe);
  const unsafeCount = rows.filter((v) => !v.safe).length;

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <p className="small muted" style={{ margin: 0, maxWidth: '62ch' }}>
          Public courier contracts in The Forge, with the bait taken out. A contract is only called
          safe if both ends are stations that can actually be looked up, both sit in high-sec, and
          ESI can find a route that never leaves high-sec. Anything that fails one of those is hidden
          by default and labelled with why.
        </p>
        <button className="btn btn-primary" disabled={!!busy} onClick={load}>
          {busy ? busy : raw ? 'Check again' : 'Find contracts'}
        </button>
      </div>

      {err && <p className="notice err" role="alert">{err}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="fields">
          <div className="field">
            <label htmlFor="h-ship">What you haul in</label>
            <select
              id="h-ship" value={limits.maxVolume}
              onChange={(e) => setLimits((l) => ({ ...l, maxVolume: Number(e.target.value) }))}
            >
              {HAULERS.map((h) => <option key={h.name} value={h.m3}>{h.name} — {units(h.m3)} m³</option>)}
            </select>
            <span className="hint">Contracts bigger than this are marked too big</span>
          </div>
          <div className="field">
            <label htmlFor="h-coll">Most collateral I’ll front</label>
            <input
              id="h-coll" type="text" inputMode="decimal" value={plainNum(limits.maxCollateral)}
              onChange={(e) => {
                const n = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
                setLimits((l) => ({ ...l, maxCollateral: Number.isFinite(n) ? n : 0 }));
              }}
            />
            <span className="hint">ISK locked up until you deliver</span>
          </div>
          <div className="field">
            <label htmlFor="h-jump">Least I’ll take per jump</label>
            <input
              id="h-jump" type="text" inputMode="decimal" value={plainNum(limits.minRewardPerJump)}
              onChange={(e) => {
                const n = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
                setLimits((l) => ({ ...l, minRewardPerJump: Number.isFinite(n) ? n : 0 }));
              }}
            />
            <span className="hint">The trip is the cost, so this is what the reward has to beat</span>
          </div>
        </div>
        <label className="check" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={safeOnly} onChange={(e) => setSafeOnly(e.target.checked)} />
          <span>Only show contracts that pass the safety checks</span>
        </label>
      </div>

      {busy && <p className="notice" role="status"><span className="spinner" aria-hidden="true" />{busy}</p>}

      {!raw ? (
        <p className="empty">
          Nothing checked yet. This reads every public contract in The Forge, keeps the courier ones,
          resolves both endpoints, and asks ESI for a high-sec-only route between them. Courier
          contracts are a small slice of the total, so expect a short list rather than a long one.
        </p>
      ) : !shown.length ? (
        <p className="empty">
          {unsafeCount > 0
            ? `None of the ${units(rows.length)} courier contracts on offer passed the safety checks. That is a normal evening — untick the box above to see them and what was wrong with each.`
            : 'No courier contracts are on offer in The Forge right now. They come and go; check again later.'}
        </p>
      ) : (
        <>
          <p className="small muted" style={{ margin: '0 0 14px' }}>
            {units(shown.length)} of {units(rows.length)} courier contracts shown, from {units(scanned)} public
            contracts in The Forge.
            {unsafeCount > 0 && <> {units(unsafeCount)} failed the safety checks{safeOnly ? ' and are hidden' : ''}.</>}
            {' '}<strong>{units(shown.filter((v) => v.takeable).length)}</strong> are ones you could leave with now,
            and those are listed first.
          </p>
          {(trips.length > 0 || run.count > 1) && (
            <div className="card" style={{ marginBottom: 20 }}>
              {run.count > 1 && (
                <p className="small" style={{ margin: '0 0 10px' }}>
                  Taking the best <strong>{run.count}</strong> you can carry pays{' '}
                  <strong className="pos">{iskBig(run.reward)}</strong> over {units(run.jumps)} jumps
                  {run.collateral > 0 && <> and ties up {iskBig(run.collateral)} of collateral while you fly them</>}.
                </p>
              )}
              {trips.length > 0 && (
                <>
                  <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>
                    Don’t fly home empty
                    <Explain term="Don’t fly home empty">
                      A job going out and another coming straight back to where you started. The return
                      jumps are ones you were making anyway, so the second reward is close to free.
                      Matched on the system rather than the station — a different station in the same
                      system is an undock, not a trip.
                    </Explain>
                  </h2>
                  <ol className="plan">
                    {trips.slice(0, 4).map((t) => (
                      <li key={t.out.c.contractId}>
                        <strong>{t.out.start.name?.split(' - ')[0] ?? '?'} ⇄ {t.out.end.name?.split(' - ')[0] ?? '?'}</strong>
                        <span className="muted small">
                          {' '}— {iskBig(t.out.c.reward)} out, {iskBig(t.back.c.reward)} back,{' '}
                          <strong className="pos">{iskBig(t.reward)}</strong> for {units(t.jumps)} jumps
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}

          <div className="table-wrap">
            <table className="data wide">
              <thead>
                <tr>
                  <th scope="col">From → to</th>
                  <th scope="col">Jumps</th>
                  <th scope="col">Reward</th>
                  <th scope="col">Per jump</th>
                  <th scope="col">Cargo</th>
                  <th scope="col">Collateral</th>
                  <th scope="col">Time</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 60).map((v) => (
                  <tr key={v.c.contractId} className={v.takeable ? '' : 'muted'}>
                    <td className="name" style={{ whiteSpace: 'normal' }}>
                      {v.start.name ?? 'Unknown structure'}
                      <small className="sub" style={{ whiteSpace: 'normal' }}>→ {v.end.name ?? 'Unknown structure'}</small>
                    </td>
                    <td>{v.jumps ?? <span className="neg">none</span>}</td>
                    <td className="pos">{iskBig(v.c.reward)}</td>
                    <td>{iskBig(v.rewardPerJump)}</td>
                    <td>{units(Math.round(v.c.volume))} m³</td>
                    <td>{v.c.collateral > 0 ? iskBig(v.c.collateral) : <span className="muted">none</span>}</td>
                    <td>{v.c.daysToComplete} d</td>
                    <td>
                      {v.flags.length
                        ? v.flags.map((f) => (
                          <span key={f} className={'flag' + (UNSAFE.includes(f) ? ' v-loss' : '')} title={FLAG[f].why}>
                            {FLAG[f].short}
                          </span>
                        ))
                        : <span className="pos">Clean</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SkillPanel
        title="Skills this wants"
        needs={HAULING_SKILLS}
        note="Evasive Maneuvering is the one to train first and the one people skip. Align time is what decides whether a gank has time to land, and it costs nothing to fly a ship that aligns quickly."
      />
    </>
  );
}
