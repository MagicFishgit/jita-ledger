import { useMemo } from 'react';
import { Check, ChevronRight, ClipboardList, Copy, Play, Smartphone, X } from 'lucide-react';
import { startPosition } from '../lib/actions';
import { confirmAsk } from '../lib/confirm';
import { fmtShort, isk, iskBig, iskBigSigned, rid, units } from '../lib/format';
import { navigate, useNow } from '../lib/hooks';
import { planPosition } from '../lib/positions';
import { newPlan, placementNote, planPlacement, planProgress, PLANS_KEPT } from '../lib/plans';
import type { Plan } from '../lib/planner';
import { horizonShort } from '../lib/prospects';
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
  // Items with a position open already: the plan follows it, counted from the plan's start (planView in lib/plans.ts).
  const taken = plan.rows.flatMap((a) => {
    const pos = d.positions.find((p) => p.typeId === a.p.typeId && p.status === 'open');
    return pos ? [{ typeId: a.p.typeId, since: pos.openedAt }] : [];
  });
  const start = async () => {
    const n = plan.rows.length, k = taken.length, one = k === 1;
    const takenSaid = taken.slice(0, 5).map((x, i) => `${name(x.typeId)} (${i ? 'since' : 'open since'} ${fmtShort(x.since)})`).join(', ')
      + (k > 5 ? ` and ${units(k - 5)} more` : '');
    const ok = await confirmAsk({
      title: 'Start this plan?',
      body: [
        `${units(n)} items, ${iskBig(plan.deployed)} in buy orders. ${!k ? 'A position opens for each item now, grouped' : n - k === 0 ? 'No new position opens: every item has one, and they’re grouped' : `${units(n - k)} new position${n - k === 1 ? ' opens' : 's open'} now, grouped`} as one plan on Positions.`,
        ...(k ? [`${one ? 'One item already has an open position' : `${units(k)} items already have an open position`}: ${takenSaid}. The plan follows ${one ? 'it' : 'them'} but counts from now: what ${one ? 'it' : 'they'} traded before isn’t the plan’s, and what ${one ? 'it holds' : 'they hold'} now sells first and isn’t the plan’s either.`] : []),
        `${patient ? 'They’re marked “Leave alone”, as a Place-and-leave plan. ' : ''}Then place the buy orders from the checklist here or from To do: each opens in game with its price copied. Nothing is placed for you: the game doesn’t allow it.`,
      ].join('\n\n'),
      confirm: 'Start it',
    });
    if (!ok) return;
    const at = new Date().toISOString();
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
  // Your trades too: a bid at or over the cheapest listing buys at once and shows no order until your order history does.
  const trades = useMemo(() => ({ txs: Object.values(d.txs), ignored: d.ignored }), [d.txs, d.ignored]);
  // The note on a bid that bought some at once changes once ESI would show the rest standing (ORDERS_LAG_MS).
  const now = useNow(60_000);
  const recent = d.plans.filter((p) => Date.now() - Date.parse(p.at) < CHECKLIST_DAYS * 86400_000 && planProgress(p, orders, d.positions, trades).placed < p.items.length);
  useEnsureNames(recent.flatMap((p) => p.items.map((i) => i.typeId)));
  if (!recent.length) return null;
  return (
    <>
      {recent.map((p) => {
        const prog = planProgress(p, orders, d.positions, trades);
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
              { kind: 'good', lead: 'Ticks off', text: 'once the order shows in your orders (ESI holds them up to 20 minutes), or its trade does when the bid bought at once (up to an hour).' },
              { kind: 'warn', icon: Smartphone, lead: 'On the phone', text: 'the copies land on the phone: place them from the PC.' },
            ]} />
            <div className="tbl-scroll">
              <table className="tbl" style={{ minWidth: 640 }}>
                <thead><tr><th scope="col" className="l">Item</th><th scope="col">Quantity</th><th scope="col">Buy at</th><th scope="col">In escrow</th><th scope="col" className="l">Placed</th></tr></thead>
                <tbody>
                  {p.items.map((i) => {
                    const pl = planPlacement(i, p, orders, d.positions, trades);
                    const note = pl ? placementNote(i, pl, now) : null;
                    return (
                      <tr key={i.typeId} style={{ opacity: pl ? 0.55 : 1 }}>
                        <td className="l"><span className="cellrow"><ItemIcon id={i.typeId} /><NameInGame typeId={i.typeId} name={name(i.typeId)} className="name ellipsis" copy={i.buyAt} /></span></td>
                        <td>{units(i.units)} <button type="button" className="link-btn dim copy-price" aria-label={`Copy ${i.units}`} data-tip="Copy the quantity" onClick={() => void copyQty(i.units)}><Copy aria-hidden="true" /></button></td>
                        <td>{isk(i.buyAt)} <CopyPrice price={i.buyAt} /></td>
                        <td>{iskBig(i.units * i.buyAt)}</td>
                        <td className="l">{pl && note ? <span style={{ color: 'var(--pos)' }}><span className="row tight" style={{ whiteSpace: 'normal', flexWrap: 'nowrap', alignItems: 'flex-start' }}><Check aria-hidden="true" style={{ width: 14, height: 14, flex: 'none', marginTop: 2 }} />{note.lead} at {isk(pl.price)}</span>{[note.atOnce, note.short].filter(Boolean).map((x) => <span key={x} className="note small" style={{ display: 'block', margin: 0, whiteSpace: 'normal', minWidth: 220, maxWidth: 320 }}>{x}</span>)}</span> : <span className="faint">Not yet</span>}</td>
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
  const trades = useMemo(() => ({ txs: Object.values(d.txs), ignored: d.ignored }), [d.txs, d.ignored]);
  // Each plan as it counts its positions: one it took over from earlier trading only from the plan's start.
  const rows = useMemo(() => d.plans.map((p) => {
    const ps = p.items.map((i) => d.positions.find((x) => x.id === i.positionId)).filter((x): x is NonNullable<typeof x> => !!x);
    const vs = ps.map((x) => planPosition(x, p, d, d.settings));
    const cs = vs.map((v) => v.c);
    return {
      p, prog: planProgress(p, orders, d.positions, trades),
      bought: cs.reduce((t, c) => t + c.boughtValue, 0), sold: cs.reduce((t, c) => t + c.soldValue, 0),
      realized: cs.reduce((t, c) => t + c.realized, 0), stock: cs.reduce((t, c) => t + c.costOfStock, 0),
      shared: vs.filter((v) => v.shared).length, oversold: cs.reduce((t, c) => t + c.oversold, 0),
    };
  }), [d.plans, d.positions, d.txs, d.journal, d.orders, d.settings, trades]); // eslint-disable-line react-hooks/exhaustive-deps
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
            {rows.map(({ p, prog, bought, sold, realized, stock, shared, oversold }) => (
              <tr key={p.id} className={shown === p.id ? 'open' : undefined}>
                <td className="l">{p.name}<span className="sub">{p.patient ? 'Place and leave' : 'At the front'}, {horizonShort(p.horizonDays)} horizon</span>
                  {shared > 0 && (
                    <span className="sub" tabIndex={0} data-tip-title="Counted from the plan’s start"
                      data-tip={`${shared === 1 ? 'One of its items already had a position' : `${units(shared)} of its items already had a position`}, open before the plan with earlier trading in it (orders or trades), and the plan follows ${shared === 1 ? 'it' : 'them'}.\n\n• The plan counts ${shared === 1 ? 'it' : 'each'} from its start: what was bought and sold before isn’t the plan’s.\n• What ${shared === 1 ? 'it' : 'each'} held then sells first, and isn’t the plan’s either.\n• Show its positions to see them as the plan counts them; open one for the whole position.`}>
                      {units(shared)} shared with earlier trading, counted from the plan’s start
                    </span>
                  )}
                </td>
                <td>{units(prog.placed)} of {units(prog.of)}</td>
                <td>{iskBig(bought)}</td>
                <td>{iskBig(sold)}{oversold > 0 && <span className="sub" tabIndex={0} data-tip-title="Left out of the profit" data-tip={'Units sold beyond what the plan bought, and beyond what a position it took over held at its start (that stock is the earlier trading’s, and sells first).\n\nThey came from stock no position counted: loot, gifts, units bought before the position opened. They have no recorded cost, so they’re left out of the profit rather than given one. Their sales are in Sold.'}>{units(oversold)} sold beyond what it bought, left out of the profit</span>}</td>
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
