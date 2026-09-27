import { useCallback, useMemo, useState } from 'react';
import { CircleCheck, Skull, SlidersHorizontal, Truck } from 'lucide-react';
import {
  byUsefulness, effectiveCapacity, HAULERS, judgeCourier, ORE_NOTE, roundTrips, tally, UNSAFE,
  type CourierContract, type CourierFlag, type Endpoint,
} from '../../lib/courier';
import { gankLineFor } from '../../lib/combat';
import { iskBig, parseISK, units } from '../../lib/format';
import { publicContracts } from '../../lib/market';
import { endpoint, secureRoute } from '../../lib/universe';
import { THE_FORGE } from '../../lib/config';
import { update, useData } from '../../lib/store';
import { toast } from '../../lib/toast';
import { HAULING_SKILLS } from '../../lib/skills';
import { Check, cssVars, NumChip, Th, Tip } from '../ui';
import { SkillPanel, useSkillIds } from './SkillPanel';
import { useLearnedGankLines } from '../gank';

const FLAG: Record<CourierFlag, { short: string; why: string }> = {
  endUnknown: { short: 'Can’t see destination', why: 'The delivery point is a player structure that ESI won’t describe without docking access.\n\nThis is the classic hauling scam: you fly the cargo out, find you can’t dock, and the collateral is theirs. Never take one of these.' },
  startUnknown: { short: 'Can’t see pickup', why: 'The pickup point is a player structure you may not be able to dock at. You can’t even start the job, and if you accept it the clock still runs.' },
  endUnchecked: { short: 'Destination unchecked', why: 'The delivery point is a player structure, and your login can’t ask ESI whether you can dock there.\n\nAdd the esi-universe.read_structures.v1 permission (Settings lists it) and this becomes a real check. Until then, look it up in game before accepting.' },
  startUnchecked: { short: 'Pickup unchecked', why: 'The pickup point is a player structure, and without esi-universe.read_structures.v1 the app couldn’t ask ESI whether you can dock there. Check it in game before accepting.' },
  lowsec: { short: 'Not high-sec', why: 'One end sits below 0.5. Gate camps do not care that you are only passing through, and the collateral goes with the ship.' },
  noSafeRoute: { short: 'No high-sec route', why: 'There is no way to make this trip without leaving high-sec, whatever the two endpoints look like. ESI was asked for a high-sec-only route and there isn’t one.' },
  tooBig: { short: 'Too big', why: 'The cargo is larger than the hauler you picked. Nothing wrong with the contract; you just can’t carry it.' },
  collateralOverLimit: { short: 'Over your collateral', why: 'You would have to front more ISK than the limit you set. That ISK is locked up and at risk until you deliver.' },
  collateralHeavy: { short: 'Collateral dwarfs reward', why: 'More than fifty times the reward is held as collateral. Even an honest contract of this shape is a poor bargain — you carry all the risk for a thin fee.' },
  thinReward: { short: 'Pays too little', why: 'Below the per-jump rate you said was worth the trip.' },
  rushed: { short: 'Not enough time', why: 'More than fifteen jumps a day to make the deadline. Miss it and you forfeit the collateral, which is sometimes the whole point of the contract.' },
  expiringSoon: { short: 'Expiring', why: 'This contract disappears within six hours. Fine if you are undocking now.' },
  gankBait: { short: 'Gank bait', why: 'The collateral is above the gank line for your hull, and the route runs through Uedama or Sivala, where gank fleets wait.\n\nTake it in a tougher hull, split the load, or bring a webbing alt.' },
};

type Raw = { c: CourierContract; start: Endpoint; end: Endpoint; jumps: number | null; route: number[] | null };

export function Courier() {
  const d = useData();
  const skillIds = useSkillIds(HAULERS.flatMap((h) => (h.bonuses ?? []).flatMap((b) => b.anyOf)));
  const levelOf = useCallback((name: string) => d.skills?.[skillIds[name] ?? -1] ?? 0, [d.skills, skillIds]);
  // What was fetched, kept separate from what it means. Judging happens at render against the
  // current limits, so changing your hauler re-reads the whole list instead of needing a rescan.
  const [raw, setRaw] = useState<Raw[] | null>(null);
  const [vol, setVol] = useState('55,000');
  const [coll, setColl] = useState('500,000,000');
  const [safeOnly, setSafeOnly] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const { gankIds, learned } = useLearnedGankLines(d);

  const withSkills = useMemo(() => HAULERS.map((h) => ({ ...h, ...effectiveCapacity(h, levelOf) })), [levelOf]);
  const maxVolume = parseISK(vol) || 0;
  const chosen = withSkills.find((h) => h.m3 === maxVolume) ?? null;
  const hull: string = chosen?.cls ?? 'Custom';
  const gank = gankLineFor(hull, d.prefs.gankLines, learned, d.prefs.learnFromLosses);
  const limits = { maxVolume, maxCollateral: parseISK(coll) || 0, minRewardPerJump: d.prefs.perJump };

  const load = useCallback(async () => {
    setBusy('Reading public contracts…');
    try {
      const all = await publicContracts(THE_FORGE);
      const couriers = all.filter((c) => c.type === 'courier' && c.start_location_id && c.end_location_id);
      setScanned(all.length);
      const out: Raw[] = [];
      let i = 0, done = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (i < couriers.length) {
          const c = couriers[i++];
          const [start, end] = await Promise.all([endpoint(c.start_location_id!), endpoint(c.end_location_id!)]);
          // Only ask for a route when both ends are places we could actually identify.
          const route = start.systemId != null && end.systemId != null ? await secureRoute(start.systemId, end.systemId).catch(() => null) : null;
          out.push({
            c: {
              contractId: c.contract_id, reward: c.reward ?? 0, collateral: c.collateral ?? 0, volume: c.volume ?? 0,
              daysToComplete: c.days_to_complete ?? 0, dateExpired: c.date_expired, startId: c.start_location_id!, endId: c.end_location_id!, title: c.title ?? '',
            },
            start, end, route, jumps: route ? route.length - 1 : null,
          });
          setBusy(`Checking ${++done} of ${couriers.length} courier contracts…`);
        }
      }));
      setRaw(out);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(null);
    }
  }, []);

  const rows = useMemo(
    () => (raw ?? []).map((x) => judgeCourier(x.c, x.start, x.end, x.jumps, limits, Date.now(), { through: !!x.route?.some((s) => gankIds.has(s)), line: gank.line })).sort(byUsefulness),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, limits.maxVolume, limits.maxCollateral, limits.minRewardPerJump, gankIds, gank.line],
  );
  const trips = useMemo(() => roundTrips(rows), [rows]);
  const run = useMemo(() => tally(rows, 5), [rows]);
  const shown = rows.filter((v) => !safeOnly || v.safe);
  const unsafeCount = rows.filter((v) => !v.safe).length;
  const short = (n: string | null) => n?.split(' ')[0] ?? '?';

  const setLine = (n: number | null) => {
    update((x) => {
      const lines = { ...x.prefs.gankLines };
      if (n != null && n > 0) lines[hull] = n; else delete lines[hull];
      return { prefs: { ...x.prefs, gankLines: lines } };
    });
  };

  return (
    <>
      <div className="intro-row">
        <p>Public courier contracts in The Forge, with the bait taken out. A contract is only called safe if both ends are stations that can actually be looked up, both sit in high-sec, and ESI can find a route that never leaves high-sec. Anything that fails one of those is hidden by default and labelled with why.</p>
        <button type="button" className="btn primary tall" disabled={!!busy} onClick={load}><Truck aria-hidden="true" />{raw ? 'Check again' : 'Find contracts'}</button>
      </div>

      <div className="chipbar">
        <span className="chipbar-title"><SlidersHorizontal aria-hidden="true" />Your hauler</span>
        <label htmlFor="h-ship" className="chip h34" data-tip-title="What you haul in"
          data-tip={`${withSkills.some((h) => h.from.length) ? 'Grown by your own skills, from the game data.' : 'Base hull capacity from the game data.'}${chosen?.from.length ? ` Includes ${chosen.from.map((b) => `${b.skill} ${b.level}`).join(' and ')}.` : ''}`}>
          <select id="h-ship" value={chosen ? chosen.m3 : ''} onChange={(e) => setVol(Number(e.target.value).toLocaleString('en-US'))}>
            {!chosen && <option value="">Your own figure</option>}
            {withSkills.map((h) => <option key={h.name} value={h.m3}>{h.name} — {units(h.m3)} m³</option>)}
          </select>
        </label>
        <label htmlFor="h-vol" className="chip h34" data-tip="Expanders, rigs and skills move this a long way — your fitting window has the real number">
          <span className="cl">Cargo m³</span><input id="h-vol" type="text" inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} style={{ width: 86 }} />
        </label>
        <label htmlFor="h-coll" className="chip h34" data-tip="ISK locked up until you deliver">
          <span className="cl">Max collateral</span><input id="h-coll" type="text" inputMode="decimal" value={coll} onChange={(e) => setColl(e.target.value)} style={{ width: 118 }} />
        </label>
        <NumChip id="h-jump" label="Min per jump" width={90} value={d.prefs.perJump} decimals={0}
          tip="The trip is the cost, so the reward has to beat this. Shared with Hub arbitrage and the Planets trip home."
          onChange={(n) => update((x) => ({ prefs: { ...x.prefs, perJump: n ?? 0 } }))} />
        <NumChip id="h-gank" key={hull} label="Gank line" width={118} decimals={0} value={d.prefs.gankLines[hull] ?? null}
          placeholder={learned[hull] ? iskBig(learned[hull].value).replace(' ISK', '') : 'not set'} tipTitle="Gank line"
          tip={`The collateral above which a contract counts as gank bait, for a ${hull === 'Custom' ? 'hull of your own figure' : hull}.\n\n• Only on routes through Uedama or Sivala.\n• There’s no published figure, since it depends on your fit, so it’s yours to set.${learned[hull] ? `\n• Your own losses put it no higher than ${iskBig(learned[hull].value)}.` : ''}`}
          onChange={setLine} />
        <Check checked={safeOnly} onChange={setSafeOnly} tip="Only show contracts that pass the safety checks">Safe only</Check>
        <span style={{ flexBasis: '100%', fontSize: 11.5, color: gank.line != null ? 'var(--acc2)' : 'var(--note)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Skull aria-hidden="true" style={{ width: 13, height: 13 }} />
          {gank.line == null
            ? `No gank line for a ${hull === 'Custom' ? 'custom hold' : hull}: set one above and contracts through Uedama or Sivala worth more than it are flagged.`
            : `Gank line for a ${hull === 'Custom' ? 'custom hold' : hull}: about ${iskBig(gank.line)} of collateral through Uedama or Sivala${gank.from === 'learned' ? ' — lowered by your own loss there, from your killmails' : ''}.`}
        </span>
      </div>
      <p className="note small">{ORE_NOTE}</p>

      {busy && <div className="busy-row" role="status"><span className="spinner keep-motion" /><span className="bt">{busy}</span></div>}

      {!raw ? (
        !busy && <div className="dashed-empty"><p>Nothing checked yet. This reads every public contract in The Forge, keeps the courier ones, resolves both endpoints, and asks ESI for a high-sec-only route between them. Courier contracts are a small slice of the total, so expect a short list rather than a long one.</p></div>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--label)' }}>
            {units(shown.length)} of {units(rows.length)} courier contracts shown, from {units(scanned)} public contracts in The Forge.
            {unsafeCount > 0 && ` ${units(unsafeCount)} failed the safety checks${safeOnly ? ' and are hidden' : ''}.`}{' '}
            <b style={{ color: 'var(--figure)' }}>{units(rows.filter((v) => v.takeable).length)}</b> are ones you could leave with now, and those are listed first.
          </p>
          {(run.count > 1 || trips.length > 0) && (
            <div className="g-300" style={{ gap: 14, animation: 'rise .4s ease-out' }}>
              {run.count > 1 && (
                <div style={{ padding: '14px 16px', background: 'linear-gradient(160deg,rgba(110,231,168,.08),rgba(7,13,21,.9) 60%)', border: '1px solid rgba(110,231,168,.3)' }}>
                  <div className="lbl">Best haul you can carry</div>
                  <div className="mono" style={{ fontSize: 26, color: 'var(--pos)', marginTop: 4 }}>{iskBig(run.reward)}</div>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#9fb3c5' }}>
                    Taking the best {run.count} you can carry pays that much over {units(run.jumps)} jumps{run.collateral > 0 && ` and ties up ${iskBig(run.collateral)} of collateral while you fly them`}.
                  </p>
                </div>
              )}
              {trips.length > 0 && (
                <div className="sub-box">
                  <div className="panel-title">
                    Don’t fly home empty
                    <Tip title="Don’t fly home empty" text={'A job going out, and another coming straight back to where you started.\n\n• You were making the return jumps anyway, so the second reward is close to free.\n• Matched on the system rather than the station.'} />
                  </div>
                  <div className="col" style={{ gap: 8, marginTop: 10 }}>
                    {trips.slice(0, 4).map((t) => (
                      <div key={t.out.c.contractId} className="row" style={{ fontSize: 13 }}>
                        <b style={{ color: 'var(--ink)' }}>{short(t.out.start.name)} ⇄ {short(t.out.end.name)}</b>
                        <span style={{ color: 'var(--label)' }}>{iskBig(t.out.c.reward)} out, {iskBig(t.back.c.reward)} back,</span>
                        <b className="mono pos" style={{ fontWeight: 500 }}>{iskBig(t.reward)}</b>
                        <span style={{ color: 'var(--label)' }}>for {units(t.jumps)} jumps</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {!shown.length ? (
            <div className="dashed-empty"><p>{unsafeCount > 0 ? 'None of the courier contracts on offer passed the safety checks. That is a normal evening — untick Safe only to see them and what was wrong with each.' : 'No courier contracts are on offer in The Forge right now. They come and go; check again later.'}</p></div>
          ) : (
            <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
              <table className="tbl compact" style={{ minWidth: 1060 }}>
                <thead><tr><Th left>From → to</Th><Th>Jumps</Th><Th>Reward</Th><Th>Per jump</Th><Th>Cargo</Th><Th>Collateral</Th><Th>Time</Th><Th left>Notes</Th></tr></thead>
                <tbody>
                  {shown.slice(0, 80).map((v) => (
                    <tr key={v.c.contractId} className={'hover' + (v.takeable ? '' : ' dimmer')}>
                      <td className="l wrap" style={{ fontFamily: 'var(--f-body)', paddingTop: 8, paddingBottom: 8, maxWidth: 380 }}>
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--ink)' }}>{v.start.name ?? 'Unknown structure'}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--label)' }}>→ {v.end.name ?? 'Unknown structure'}</span>
                      </td>
                      <td style={{ color: v.jumps == null ? 'var(--neg)' : 'var(--cell)' }}>{v.jumps ?? 'none'}</td>
                      <td className="pos">{iskBig(v.c.reward)}</td>
                      <td>{v.jumps ? iskBig(v.rewardPerJump) : '–'}</td>
                      <td>{units(Math.round(v.c.volume))} m³</td>
                      <td>{v.c.collateral > 0 ? iskBig(v.c.collateral) : <span className="faint">none</span>}</td>
                      <td style={{ color: 'var(--dim)' }}>{v.c.daysToComplete} d</td>
                      <td className="l">
                        <span className="flags" style={{ justifyContent: 'flex-start' }}>
                          {v.flags.length ? v.flags.map((f) => (
                            <span key={f} className="flag plain" tabIndex={0} data-tip={FLAG[f].why} data-tip-title={FLAG[f].short} style={cssVars({ '--c': UNSAFE.includes(f) ? 'var(--neg)' : 'var(--acc2)' })}>{FLAG[f].short}</span>
                          )) : <span className="row tight pos" style={{ fontFamily: 'var(--f-body)' }}><CircleCheck aria-hidden="true" style={{ width: 13, height: 13 }} />Clean</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <SkillPanel title="Skills this wants" needs={HAULING_SKILLS}
        note="Evasive Maneuvering is the one to train first and the one people skip. Align time is what decides whether a gank has time to land, and it costs nothing to fly a ship that aligns quickly." />
    </>
  );
}
