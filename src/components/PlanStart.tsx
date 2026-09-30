import { useMemo } from 'react';
import { Check, ChevronRight, ClipboardList, Copy, Play, Smartphone, X } from 'lucide-react';
import { startPosition } from '../lib/actions';
import { confirmAsk } from '../lib/confirm';
import { fmtShort, isk, iskBig, iskBigSigned, rid, units } from '../lib/format';
import { navigate } from '../lib/hooks';
import { computePosition } from '../lib/positions';
import { newPlan, placedOrder, planProgress, PLANS_KEPT } from '../lib/plans';
import type { Plan } from '../lib/planner';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import { CopyPrice, NameInGame, useEnsureNames, useTypeName } from './common';
import { ItemIcon } from './ui';
import { Points } from './Facts';

/**
 * Starting a Capital planner mix, and following it. The game can't place several buy orders at once (Multibuy only buys
 * from listings, and ESI places nothing), so "Start this plan" does the rest in one go: a position for every item,
 * grouped as one plan, the items marked "Leave alone" when it's a Place-and-leave plan, and a checklist that opens each
 * item in game with its price copied and ticks off once its buy order shows up (lib/plans.ts).
 */

/** Plans still being placed show their checklist for this long. */
const CHECKLIST_DAYS = 7;

const copyQty = async (n: number) => {
  try { await navigator.clipboard.writeText(String(n)); toast(`Copied ${units(n)}: paste it into the quantity box.`); }
  catch { toast('Couldn’t copy: your browser refused. Type it carefully.', 'err'); }
};

export function StartPlanButton({ plan, days, patient }: { plan: Plan; days: number; patient: boolean }) {
  const d = useData();
  const name = useTypeName();
  if (!plan.rows.length) return null;
  const already = plan.rows.filter((a) => d.positions.some((p) => p.typeId === a.p.typeId && p.status === 'open')).length;
  const start = async () => {
    const ok = await confirmAsk({
      title: 'Start this plan?',
      body: `${units(plan.rows.length)} items, ${iskBig(plan.deployed)} in buy orders. `
        + `${already ? `${units(plan.rows.length - already)} new positions open now (${units(already)} already have one, which will follow its order)` : `A position opens for each item now`}, grouped as one plan on Positions. `
        + `${patient ? 'They’re marked “Leave alone”, as a Place-and-leave plan. ' : ''}`
        + 'Then place the buy orders from the checklist here or from To do: each opens in game with its price copied. Nothing is placed for you: the game doesn’t allow it.',
      confirm: 'Start it',
    });
    if (!ok) return;
    const at = new Date().toISOString();
    const n = plan.rows.length;
    const tp = newPlan(plan.rows, {
      id: rid(), at, deployed: plan.deployed, horizonDays: days, patient,
      name: `${fmtShort(Date.parse(at))} · ${iskBig(plan.deployed)} in ${units(n)} item${n === 1 ? '' : 's'}`,
    }, (typeId) => startPosition(typeId, at, true).id);
    const items = tp.items;
    update((x) => ({
      plans: [tp, ...x.plans].slice(0, PLANS_KEPT),
      ...(patient ? { leave: [...new Set([...x.leave, ...items.map((i) => i.typeId)])] } : {}),
    }));
    toast(`Plan started: ${units(items.length)} positions. Place the buy orders from the checklist, starting with ${name(items[0].typeId)}.`);
    requestAnimationFrame(() => document.getElementById('placing')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  return (
    <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" className="btn primary" onClick={() => void start()}><Play aria-hidden="true" />Start this plan</button>
      <span className="note small" style={{ margin: 0 }}>A position for each item, grouped as one plan, and a checklist for its buy orders: the game can’t place them all at once.</span>
    </div>
  );
}

/** The plans still being placed: each item's buy order, with what to paste, ticked off once it shows in your orders. */
export function PlacingChecklist() {
  const d = useData();
  const name = useTypeName();
  const orders = useMemo(() => Object.values(d.orders), [d.orders]);
  const recent = d.plans.filter((p) => Date.now() - Date.parse(p.at) < CHECKLIST_DAYS * 86400_000 && planProgress(p, orders).placed < p.items.length);
  useEnsureNames(recent.flatMap((p) => p.items.map((i) => i.typeId)));
  if (!recent.length) return null;
  return (
    <>
      {recent.map((p) => {
        const prog = planProgress(p, orders);
        return (
          <section key={p.id} id="placing" className="panel" aria-label={`Placing ${p.name}`} style={{ padding: 18, gap: 12, clipPath: 'none' }}>
            <div className="panel-head">
              <span className="panel-title"><ClipboardList aria-hidden="true" style={{ width: 16, height: 16, marginRight: 6, verticalAlign: '-3px' }} />Placing {p.name}</span>
              <span className="mono" style={{ color: 'var(--acc)' }}>{units(prog.placed)} of {units(prog.of)} placed</span>
            </div>
            <div className="track h10"><span className="fill" style={{ width: `${(prog.placed / Math.max(1, prog.of)) * 100}%` }} /></div>
            <div className="ladder" aria-label="For each item">
              {['Open it in game (price copied)', 'Place Buy Order', 'Paste the price', 'Paste the quantity', p.patient ? 'A long duration' : 'Set the duration'].map((x, i) => (
                <span key={x} className="step">{i > 0 && <ChevronRight aria-hidden="true" />}<span>{x}</span></span>
              ))}
            </div>
            <Points compact items={[
              { kind: 'good', lead: 'Ticks off', text: 'once the order shows in your orders; ESI holds them for up to 20 minutes.' },
              { kind: 'warn', icon: Smartphone, lead: 'On the phone', text: 'the copies land on the phone: place them from the PC.' },
            ]} />
            <div className="tbl-scroll">
              <table className="tbl" style={{ minWidth: 640 }}>
                <thead><tr><th scope="col" className="l">Item</th><th scope="col">Quantity</th><th scope="col">Buy at</th><th scope="col">In escrow</th><th scope="col" className="l">Placed</th></tr></thead>
                <tbody>
                  {p.items.map((i) => {
                    const o = placedOrder(i, p, orders);
                    return (
                      <tr key={i.typeId} style={{ opacity: o ? 0.55 : 1 }}>
                        <td className="l"><span className="cellrow"><ItemIcon id={i.typeId} /><NameInGame typeId={i.typeId} name={name(i.typeId)} className="name ellipsis" copy={i.buyAt} /></span></td>
                        <td>{units(i.units)} <button type="button" className="link-btn dim copy-price" aria-label={`Copy ${i.units}`} data-tip="Copy the quantity" onClick={() => void copyQty(i.units)}><Copy aria-hidden="true" /></button></td>
                        <td>{isk(i.buyAt)} <CopyPrice price={i.buyAt} /></td>
                        <td>{iskBig(i.units * i.buyAt)}</td>
                        <td className="l">{o ? <span className="row tight" style={{ color: 'var(--pos)' }}><Check aria-hidden="true" style={{ width: 14, height: 14 }} />{units(o.volumeTotal)} at {isk(o.price)}</span> : <span className="faint">Not yet</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}

/**
 * Plans on the Positions page: each plan's positions added up, how many of its buy orders are placed, and a way to
 * show only its positions. Removing the grouping leaves the positions as they are.
 */
export function PlanGroups({ shown, onShow }: { shown: string | null; onShow: (id: string | null) => void }) {
  const d = useData();
  const orders = useMemo(() => Object.values(d.orders), [d.orders]);
  const rows = useMemo(() => d.plans.map((p) => {
    const ps = p.items.map((i) => d.positions.find((x) => x.id === i.positionId)).filter((x): x is NonNullable<typeof x> => !!x);
    const cs = ps.map((x) => computePosition(x, d, d.settings));
    return {
      p, prog: planProgress(p, orders),
      bought: cs.reduce((t, c) => t + c.boughtValue, 0), sold: cs.reduce((t, c) => t + c.soldValue, 0),
      realized: cs.reduce((t, c) => t + c.realized, 0), stock: cs.reduce((t, c) => t + c.costOfStock, 0),
    };
  }), [d.plans, d.positions, d.txs, d.journal, d.orders, d.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return null;
  return (
    <section className="panel" aria-label="Plans" data-rv="" style={{ padding: 18, gap: 10, clipPath: 'none' }}>
      <div className="panel-head">
        <span className="panel-title">Plans</span>
        <button type="button" className="link-btn" onClick={() => navigate('planner')}>Capital planner</button>
      </div>
      <div className="tbl-scroll">
        <table className="tbl" style={{ minWidth: 820 }}>
          <thead><tr>
            <th scope="col" className="l">Plan</th><th scope="col">Orders placed</th><th scope="col">Bought</th><th scope="col">Sold</th>
            <th scope="col" data-tip="Its positions’ realized profit, fees included">Profit</th><th scope="col" data-tip="What’s bought and not yet sold, at cost">In stock</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {rows.map(({ p, prog, bought, sold, realized, stock }) => (
              <tr key={p.id} className={shown === p.id ? 'open' : undefined}>
                <td className="l">{p.name}<span className="sub">{p.patient ? 'Place and leave' : 'At the front'}, {units(p.horizonDays)}-day horizon</span></td>
                <td>{units(prog.placed)} of {units(prog.of)}</td>
                <td>{iskBig(bought)}</td>
                <td>{iskBig(sold)}</td>
                <td style={{ color: realized >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(realized)}</td>
                <td>{iskBig(stock)}</td>
                <td>
                  <span className="row tight" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <button type="button" className="link-btn" onClick={() => onShow(shown === p.id ? null : p.id)}>{shown === p.id ? 'Show all positions' : 'Show its positions'}</button>
                    <button type="button" className="link-btn dim" aria-label={`Remove the grouping for ${p.name}`}
                      data-tip="Removes the grouping and the checklist. The positions stay as they are."
                      onClick={async () => {
                        if (!(await confirmAsk({ title: 'Remove this plan?', body: 'Its positions stay as they are; only the grouping and its checklist go.', confirm: 'Remove' }))) return;
                        if (shown === p.id) onShow(null);
                        update((x) => ({ plans: x.plans.filter((y) => y.id !== p.id) }));
                      }}><X aria-hidden="true" /></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
