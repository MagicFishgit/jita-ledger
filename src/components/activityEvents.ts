import { useEffect, useMemo, useState } from 'react';
import { loadTypeSets } from '../lib/attribution';
import { netLoss, type CombatActivity } from '../lib/combat';
import { rates } from '../lib/fees';
import { isFreelanceTrade } from '../lib/freelance';
import { classify } from '../lib/killmails';
import { computePosition, countedIn } from '../lib/positions';
import { nettedJournal } from '../lib/refunds';
import { attribute, otherSales, type DayEvent, type TypeSets } from '../lib/results';
import { useData } from '../lib/store';
import type { Activity } from '../lib/types';
import { useEnsureNames } from './common';

/**
 * Every ISK movement attributed to an activity by Results' rules (lib/results.ts), for Results and for the Wallet's "All
 * income against play": the item groups that say which activity a trade is, positions' realized profit, ships lost by what
 * they were doing, freelance trades. Also the sales no activity counts (`others`), which only the Wallet adds.
 */

export const ACTIVITY_COLOR: Record<Activity, string> = {
  Trading: 'var(--acc)', Loyalty: '#a98bff', Planets: '#6ee7a8', Hauling: 'var(--acc2)', Abyssal: '#ff8d9a', Combat: '#7aa6ff', Freelance: '#f5b86b',
};
export const ACTIVITY_WHAT: Record<Activity, string> = {
  Trading: 'Realized profit from your positions',
  Loyalty: 'Loyalty-store goods sold, less the ISK the store took',
  Planets: 'Planetary goods sold, less customs tax',
  Hauling: 'Courier rewards, less haulers lost',
  Abyssal: 'Abyssal loot sold, less filaments bought and ships lost',
  Combat: 'Bounties and missions, less ships lost',
  Freelance: 'Freelance job rewards, less everything bought for the jobs (stock not yet delivered included; the Freelance tab shows profit on what’s delivered)',
};
const LOSS_ACTIVITY: Record<CombatActivity, Activity> = { Abyssal: 'Abyssal', Hauling: 'Hauling', PvP: 'Combat', PvE: 'Combat' };
/** The activities counted without ESI's item groups. */
const WITHOUT_SETS = new Set<Activity>(['Trading', 'Hauling', 'Freelance', 'Combat']);

export function useActivityEvents() {
  const d = useData();
  const corps = (d.meta.lpBalances ?? []).map((b) => b.corporationId);
  const [sets, setSets] = useState<TypeSets | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadTypeSets(corps).then((s) => { if (alive) setSets(s); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [corps.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutaplasmids have no market group of their own, so they need names before they can be recognised.
  const traded = useMemo(() => [...new Set(Object.values(d.txs).map((t) => t.typeId))], [d.txs]);
  useEnsureNames(traded);

  const [lossActs, setLossActs] = useState<Record<number, CombatActivity>>({});
  const lossKey = Object.values(d.killmails).filter((k) => k.kind === 'loss').map((k) => k.id).join(',');
  useEffect(() => {
    let alive = true;
    classify(Object.values(d.killmails).filter((k) => k.kind === 'loss')).then((m) => { if (alive) setLossActs(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, [lossKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const posCalc = useMemo(() => d.positions.map((p) => ({ p, c: computePosition(p, d, d.settings) })), [d.positions, d.txs, d.journal, d.settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const { events, others, typeSets } = useMemo<{ events: DayEvent[]; others: { t: number; isk: number; typeId: number }[]; typeSets: TypeSets | null }>(() => {
    // Without the item groups (ESI failed), only what needs none is counted: positions, courier rewards, freelance, bounties.
    // Every sale would look like an "other sale" then, so there are none.
    const have = sets ?? (failed ? { filaments: new Set<number>(), abyssLoot: new Set<number>(), pi: new Set<number>(), lpGoods: new Set<number>() } : null);
    if (!have) return { events: [], others: [], typeSets: null };
    const txs = Object.values(d.txs).filter((t) => t.source === 'esi');
    const tracked = new Set(txs.filter((t) => d.positions.some((p) => countedIn(p, t))).map((t) => t.id));
    const abyssLoot = new Set(have.abyssLoot);
    for (const [id, n] of Object.entries(d.names)) if (/Mutaplasmid$/.test(n)) abyssLoot.add(Number(id));
    const realized: { t: number; isk: number }[] = [];
    for (const { c } of posCalc) {
      let prev = 0;
      for (const s of c.series) { if (s.realized !== prev) realized.push({ t: s.t, isk: s.realized - prev }); prev = s.realized; }
    }
    const losses = Object.values(d.killmails)
      .filter((k) => k.kind === 'loss' && k.value && lossActs[k.id])
      .map((k) => ({ t: Date.parse(k.time), activity: LOSS_ACTIVITY[lossActs[k.id]], isk: netLoss(k) }));
    const jobs = d.meta.freelance?.jobs ?? [];
    const personal = new Set(d.ignored);
    const freelance = (tx: { id: string; typeId: number; date: string }) => !personal.has(tx.id) && isFreelanceTrade(jobs, tx);
    const inp = { txs, journal: Object.values(nettedJournal(d.journal)), tracked, realized, losses, sets: { ...have, abyssLoot }, freelance, salesTax: rates(d.settings).t };
    if (!sets) return { events: attribute(inp).filter((e) => WITHOUT_SETS.has(e.activity)), others: [], typeSets: null };
    return { events: attribute(inp), others: otherSales(inp, personal), typeSets: inp.sets };
  }, [sets, failed, d.txs, d.journal, d.positions, d.names, d.killmails, lossActs, posCalc, d.settings, d.meta.freelance, d.ignored]); // eslint-disable-line react-hooks/exhaustive-deps

  /** `typeSets`: the item groups each activity counts, mutaplasmids with the abyssal loot; null until read (or when ESI failed). */
  return { events, others, typeSets, failed, posCalc, lossActs, ready: !!sets || failed };
}
