import { useEffect, useMemo, useState } from 'react';
import { loadTypeSets } from '../lib/attribution';
import { classify } from '../lib/killmails';
import { activityEvents, type LossActs } from '../lib/income';
import { computePosition } from '../lib/positions';
import type { TypeSets } from '../lib/results';
import { useData, type Data } from '../lib/store';
import type { Activity } from '../lib/types';
import { useEnsureNames } from './common';

/**
 * Every ISK movement attributed to an activity by Results' rules (lib/income.ts), for Results and for the Wallet's "All
 * income against play": this reads what the rules need (the item groups that say which activity a trade is, positions'
 * realized profit, ships lost by what they were doing) and hands it in. Also the sales no activity counts (`others`), which
 * only the Wallet adds. The main's ledger unless one is given.
 */

export const ACTIVITY_COLOR: Record<Activity, string> = {
  Trading: 'var(--acc)', Loyalty: '#a98bff', Planets: '#6ee7a8', Hauling: 'var(--acc2)', Abyssal: '#ff8d9a', Combat: '#7aa6ff', Freelance: '#f5b86b',
};

export function useActivityEvents(ledger?: Data) {
  const live = useData();
  const d = ledger ?? live;
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

  const [lossActs, setLossActs] = useState<LossActs>({});
  const lossKey = Object.values(d.killmails).filter((k) => k.kind === 'loss').map((k) => k.id).join(',');
  useEffect(() => {
    let alive = true;
    classify(Object.values(d.killmails).filter((k) => k.kind === 'loss')).then((m) => { if (alive) setLossActs(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, [lossKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const posCalc = useMemo(() => d.positions.map((p) => ({ p, c: computePosition(p, d, d.settings) })), [d.positions, d.txs, d.journal, d.settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const acts = useMemo(() => activityEvents(d, sets, failed, lossActs, posCalc), [sets, failed, d.txs, d.journal, d.positions, d.names, d.killmails, lossActs, posCalc, d.settings, d.meta.freelance, d.ignored]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = !!sets || failed;
  /**
   * `typeSets`: the item groups each activity counts, mutaplasmids with the abyssal loot; null until read (or when ESI failed).
   * One object while nothing it holds changed, so a page's useMemo on it (the Wallet's income sum) keeps its answer.
   */
  return useMemo(() => ({ ...acts, failed, posCalc, lossActs, ready }), [acts, failed, posCalc, lossActs, ready]);
}
