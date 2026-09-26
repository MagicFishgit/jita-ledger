import { useEffect, useMemo, useState } from 'react';
import { effectiveSkills, orderSlots, rates } from '../lib/fees';
import { skillDogma } from '../lib/market';
import { feeLeak } from '../lib/wallet';
import { monthlyGain, trainingDays, type Pace } from '../lib/training';
import { SKILL_FALLBACK_IDS, type SkillKey } from '../lib/config';
import type { Data } from '../lib/store';
import { iskBig } from '../lib/format';

const DAY = 86400_000;

export type Payback = { name: string; key: SkillKey; cur: number; next: number; days: number | null; gain: number | null; why: string };

/** The last 30 days of trading, in the terms the fee skills act on. */
export function recentPace(d: Data): Pace {
  const from = Date.now() - 30 * DAY;
  return {
    // Every market sale is taxed, tracked by a position or not.
    sales: Object.values(d.txs).filter((t) => !t.isBuy && t.source === 'esi' && Date.parse(t.date) >= from).reduce((a, t) => a + t.qty * t.unitPrice, 0),
    ordersPlaced: Object.values(d.orders).filter((o) => Date.parse(o.issued) >= from).reduce((a, o) => a + o.price * o.volumeTotal, 0),
    relistFees: feeLeak(Object.values(d.journal), from, new Set(Object.values(d.orders).map((o) => o.orderId))).relists,
  };
}

/**
 * What the next level of each trade skill is worth, ranked by ISK per day of training.
 * Training days come from your attributes and the points already in each skill; the gains from your
 * own last 30 days of trading at Omega rates.
 */
export function useSkillPayback(d: Data): { rows: Payback[]; perDay: (x: Payback) => number; hasAttributes: boolean } {
  const s = d.settings;
  const alpha = s.clone === 'alpha';
  const [train, setTrain] = useState<Record<string, number | null>>({});
  const ids = useMemo(() => ({ ...SKILL_FALLBACK_IDS, ...d.meta.skillIds } as Record<SkillKey, number>), [d.meta.skillIds]);

  useEffect(() => {
    const attrs = d.meta.attributes;
    if (!attrs) return;
    let alive = true;
    (async () => {
      const out: Record<string, number | null> = {};
      for (const k of ['acc', 'br', 'abr', 'trade', 'retail', 'wholesale', 'tycoon'] as SkillKey[]) {
        const lvl = s[k];
        if (lvl >= 5) { out[k] = 0; continue; }
        const dg = await skillDogma(ids[k]).catch(() => null);
        out[k] = dg ? trainingDays(dg, attrs, d.meta.skillSp?.[ids[k]] ?? 0, lvl + 1, alpha) : null;
      }
      if (alive) setTrain(out);
    })();
    return () => { alive = false; };
  }, [d.meta.attributes, d.meta.skillSp, ids, s.acc, s.br, s.abr, s.trade, s.retail, s.wholesale, s.tycoon, alpha]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = useMemo(() => recentPace(d), [d.txs, d.orders, d.journal]); // eslint-disable-line react-hooks/exhaustive-deps
  const openOrders = Object.values(d.orders).filter((o) => o.state === 'open').length;
  const slotsNow = orderSlots(effectiveSkills(s));
  const nearFull = openOrders >= slotsNow * 0.9;
  const fOmega = rates({ ...s, clone: 'omega', override: false }).f;

  const rows: Payback[] = [
    { name: 'Accounting', key: 'acc', cur: s.acc, next: s.acc + 1, days: train.acc ?? null, gain: monthlyGain('acc', s.acc, p, s.taxBase, fOmega), why: `Less sales tax on the ${iskBig(p.sales)} you sold in the last 30 days` },
    { name: 'Broker Relations', key: 'br', cur: s.br, next: s.br + 1, days: train.br ?? null, gain: monthlyGain('br', s.br, p, s.taxBase, fOmega), why: `A lower broker fee on the ${iskBig(p.ordersPlaced)} of orders you placed in 30 days` },
    { name: 'Advanced Broker Relations', key: 'abr', cur: s.abr, next: s.abr + 1, days: train.abr ?? null, gain: monthlyGain('abr', s.abr, p, s.taxBase, fOmega), why: `Cheaper price changes, on the ${iskBig(p.relistFees)} of them you paid in 30 days` },
    ...(['trade', 'retail', 'wholesale', 'tycoon'] as const).map((k) => ({
      name: k[0].toUpperCase() + k.slice(1), key: k as SkillKey, cur: s[k], next: s[k] + 1, days: train[k] ?? null, gain: nearFull ? null : 0,
      why: nearFull
        ? `More order slots. You use ${openOrders} of ${slotsNow}, so slots are what limits you — what the new ones earn depends on what you put in them`
        : `More order slots — but you use ${openOrders} of ${slotsNow}, so extra slots earn nothing yet`,
    })),
  ];
  const perDay = (x: Payback) => (x.cur >= 5 || !x.gain || !x.days ? -1 : x.gain / x.days);
  return { rows: [...rows].sort((a, b) => perDay(b) - perDay(a)), perDay, hasAttributes: !!d.meta.attributes };
}
