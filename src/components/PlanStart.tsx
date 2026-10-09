import { useMemo } from 'react';
import { Ban, Check, ChevronRight, ClipboardList, Copy, Play, Smartphone, Tag, X } from 'lucide-react';
import { startPosition } from '../lib/actions';
import { confirmAsk } from '../lib/confirm';
import { fmtShort, isk, iskBig, iskBigSigned, pct, rid, units } from '../lib/format';
import { navigate, useNow } from '../lib/hooks';
import { computePosition, planPosition } from '../lib/positions';
import { droppedNote, droppedState, leaveForPlan, newPlan, placementNote, planItemState, planLeaveSince, planListSaid, planProgress, PLANS_KEPT } from '../lib/plans';
import type { Plan } from '../lib/planner';
import { horizonShort } from '../lib/prospects';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import { CopyPrice, NameInGame, useEnsureNames, useTypeName } from './common';
import { ItemIcon } from './ui';
import { Points } from './Facts';
import { usePlanListing, type PricedRow } from './planListing';

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
    // For Place and leave, since when each item's orders are the plan's: its start, or the opening of a position opened for
    // it within the day before with nothing traded (planLeaveSince), where the checklist counts a bid placed then too.
    const since: Record<string, string> = {};
    if (patient) for (const x of taken) {
      const pos = d.positions.find((p) => p.typeId === x.typeId && p.status === 'open');
      if (!pos) continue;
      const c = computePosition(pos, d, d.settings);
      since[x.typeId] = planLeaveSince(pos, { at }, c.buys.length + c.sells.length > 0);
    }
    const tp = newPlan(plan.rows, {
      id: rid(), at, deployed: plan.deployed, horizonDays: days, patient,
      name: `${fmtShort(Date.parse(at))} · ${iskBig(plan.deployed)} in ${units(n)} item${n === 1 ? '' : 's'}`,
    }, (typeId) => startPosition(typeId, at, true).id);
    const items = tp.items;
    update((x) => ({
      plans: [tp, ...x.plans].slice(0, PLANS_KEPT),
      // Its own orders: those placed since it started, or since a position opened for it (`isLeft`). An item already left
      // by hand stays left whole.
      ...(patient ? leaveForPlan(x.leave, x.leaveFrom, items.map((i) => i.typeId), at, since) : {}),
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

/**
 * Each plan's checklist: the buy orders still to place, for a week (each ticked off once it shows in your orders), and then
 * what the plan bought and hasn't listed (`PlanListPart`), for as long as there is some. An item whose bid you cancelled
 * with nothing bought, or whose position you closed, the plan no longer places: it's said and greyed, never asked for
 * again, and a plan with nothing else waiting is done placing (`planItemState`).
 */
export function PlacingChecklist() {
  const d = useData();
  const name = useTypeName();
  const orders = useMemo(() => Object.values(d.orders), [d.orders]);
  // Your trades too: a bid at or over the cheapest listing buys at once and shows no order until your order history does.
  const trades = useMemo(() => ({ txs: Object.values(d.txs), ignored: d.ignored }), [d.txs, d.ignored]);
  // The note on a bid that bought some at once changes once ESI would show the rest standing (ORDERS_LAG_MS).
  const now = useNow(60_000);
  const listing = usePlanListing();
  const placing = new Set(d.plans.filter((p) => Date.now() - Date.parse(p.at) < CHECKLIST_DAYS * 86400_000 && planProgress(p, orders, d.positions, trades).waiting.length > 0).map((p) => p.id));
  const shown = d.plans.filter((p) => placing.has(p.id) || listing.some((x) => x.plan.id === p.id));
  useEnsureNames(shown.flatMap((p) => p.items.map((i) => i.typeId)));
  if (!shown.length) return null;
  return (
    <>
      {shown.map((p) => {
        const prog = planProgress(p, orders, d.positions, trades);
        const still = placing.has(p.id);
        const rows = listing.filter((x) => x.plan.id === p.id);
        return (
          <section key={p.id} id="placing" className="panel" aria-label={still ? `Placing ${p.name}` : p.name} style={{ padding: 18, gap: 12, clipPath: 'none' }}>
            <div className="panel-head">
              <span className="panel-title"><ClipboardList aria-hidden="true" style={{ width: 16, height: 16, marginRight: 6, verticalAlign: '-3px' }} />{still ? `Placing ${p.name}` : p.name}</span>
              <span className="mono" style={{ color: 'var(--acc)' }}>{still ? `${units(prog.placed)} of ${units(prog.of)} placed${prog.dropped.length ? `, ${units(prog.dropped.length)} dropped` : ''}` : `${units(rows.length)} to list`}</span>
            </div>
            {still && (
              <>
                <div className="track h10"><span className="fill" style={{ width: `${((prog.placed + prog.dropped.length) / Math.max(1, prog.of)) * 100}%` }} /></div>
                <div className="ladder" aria-label="For each item">
                  {['Open it in game (price copied)', 'Place Buy Order', 'Paste the price', 'Paste the quantity', p.patient ? 'A long duration' : 'Set the duration'].map((x, i) => (
                    <span key={x} className="step">{i > 0 && <ChevronRight aria-hidden="true" />}<span>{x}</span></span>
                  ))}
                </div>
                <Points compact items={[
                  { kind: 'good', lead: 'Ticks off', text: 'once the order shows in your orders (ESI holds them up to 20 minutes), or its trade does when the bid bought at once (up to an hour).' },
                  { kind: 'warn', icon: Smartphone, lead: 'On the phone', text: 'the copies land on the phone: place them from the PC.' },
                  ...(prog.dropped.length ? [{ kind: 'info' as const, icon: Ban, lead: 'Dropped', text: 'a bid you cancelled with nothing bought, or an item whose position you closed: the plan doesn’t ask for it again.' }] : []),
                ]} />
                <div className="tbl-scroll">
                  <table className="tbl" style={{ minWidth: 640 }}>
                    <thead><tr><th scope="col" className="l">Item</th><th scope="col">Quantity</th><th scope="col">Buy at</th><th scope="col">In escrow</th><th scope="col" className="l">Placed</th></tr></thead>
                    <tbody>
                      {p.items.map((i) => {
                        const st = planItemState(i, p, orders, d.positions, trades);
                        const pl = st.state === 'placed' ? st.placement : null;
                        const note = pl ? placementNote(i, pl, now) : null;
                        const dropped = droppedState(st) ? droppedNote(st) : null;
                        return (
                          <tr key={i.typeId} style={{ opacity: pl || dropped ? 0.55 : 1 }}>
                            <td className="l"><span className="cellrow"><ItemIcon id={i.typeId} /><NameInGame typeId={i.typeId} name={name(i.typeId)} className="name ellipsis" copy={i.buyAt} copyAs="the bid to place" /></span></td>
                            <td>{units(i.units)} <button type="button" className="link-btn dim copy-price" aria-label={`Copy ${i.units}`} data-tip="Copy the quantity" onClick={() => void copyQty(i.units)}><Copy aria-hidden="true" /></button></td>
                            <td>{isk(i.buyAt)} <CopyPrice price={i.buyAt} /></td>
                            <td>{iskBig(i.units * i.buyAt)}</td>
                            <td className="l">{pl && note ? <span style={{ color: 'var(--pos)' }}><span className="row tight" style={{ whiteSpace: 'normal', flexWrap: 'nowrap', alignItems: 'flex-start' }}><Check aria-hidden="true" style={{ width: 14, height: 14, flex: 'none', marginTop: 2 }} />{note.lead} at {isk(pl.price)}</span>{[note.atOnce, note.short].filter(Boolean).map((x) => <span key={x} className="note small" style={{ display: 'block', margin: 0, whiteSpace: 'normal', minWidth: 220, maxWidth: 320 }}>{x}</span>)}</span>
                              : dropped ? <span className="faint"><span className="row tight" style={{ whiteSpace: 'normal', flexWrap: 'nowrap', alignItems: 'flex-start' }}><Ban aria-hidden="true" style={{ width: 14, height: 14, flex: 'none', marginTop: 2 }} />{dropped.lead}</span>{dropped.sub && <span className="note small" style={{ display: 'block', margin: 0, whiteSpace: 'normal', minWidth: 220, maxWidth: 320 }}>{dropped.sub}</span>}</span>
                                : <span className="faint">Not yet</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {rows.length > 0 && <PlanListPart rows={rows} />}
          </section>
        );
      })}
    </>
  );
}

/**
 * "Bought: list it", the list step: one row per item the plan bought and hasn't listed, with the price to list at (the
 * plan's own for Place and leave, today's listing price at the front, never under break-even: `planListPrice`), the figure
 * beside it, and the profit after fees. Its name opens the item in game with the price copied, as To do and Orders do. The
 * user asked how to price the sell "so I don't mess up the intelligence the plan set out to accomplish" (2 October 2026).
 */
export function PlanListPart({ rows, planName }: { rows: PricedRow[]; planName?: string }) {
  const name = useTypeName();
  if (!rows.length) return null;
  const patient = rows[0].plan.patient;
  const wrap = { display: 'block', margin: 0, whiteSpace: 'normal', minWidth: 200, maxWidth: 320 } as const;
  return (
    <div className="plan-list" aria-label={`Bought: list it${planName ? `, ${planName}` : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div className="panel-head">
        <span className="panel-title"><Tag aria-hidden="true" style={{ width: 15, height: 15 }} />Bought: list it{planName ? ` · ${planName}` : ''}</span>
        <span className="mono" style={{ color: 'var(--acc)' }}>{units(rows.length)} item{rows.length === 1 ? '' : 's'} to list</span>
      </div>
      <Points compact items={[
        patient
          ? { kind: 'info', icon: Tag, lead: 'Place and leave', text: 'lists at the plan’s own price and waits there, never under what it cost. Today’s List patiently is beside it.' }
          : { kind: 'info', icon: Tag, lead: 'At the front', text: 'lists one step under today’s cheapest listing, where trading reaches, never under what it cost. The plan’s price is beside it.' },
        { kind: 'good', lead: 'Ticks off', text: 'once a sell order for it shows in your orders (ESI holds them up to 20 minutes), or it sells.' },
      ]} />
      <div className="tbl-scroll">
        <table className="tbl" style={{ minWidth: 680 }}>
          <thead><tr>
            <th scope="col" className="l">Item</th><th scope="col">To list</th><th scope="col" className="l">List at</th>
            <th scope="col" className="l">{patient ? 'Today' : 'The plan'}</th>
            <th scope="col" data-tip="If they all sell at the price: after the broker fee and sales tax, against what they cost you, the buy’s fee included.">Profit after fees</th>
          </tr></thead>
          <tbody>
            {rows.map((x) => {
              const p = x.priced;
              const said = p ? planListSaid(p, patient) : null;
              const reading = !x.read;
              return (
                <tr key={`${x.plan.id}:${x.item.typeId}`}>
                  <td className="l"><span className="cellrow"><ItemIcon id={x.item.typeId} /><NameInGame typeId={x.item.typeId} name={name(x.item.typeId)} className="name ellipsis" copy={p?.price ?? null} copyAs="the price to list at" /></span></td>
                  <td>{units(x.units)} <button type="button" className="link-btn dim copy-price" aria-label={`Copy ${x.units}`} data-tip="Copy the quantity" onClick={() => void copyQty(x.units)}><Copy aria-hidden="true" /></button></td>
                  <td className="l">
                    {p?.price != null ? <>{isk(p.price)} <CopyPrice price={p.price} /></> : <span className="faint">{reading ? 'Reading its book…' : '–'}</span>}
                    {said && !(reading && p?.price == null) && <span className="note small" style={wrap}>{p!.from === 'breakEven' ? said.floor : said.from}</span>}
                  </td>
                  <td className="l">
                    {reading && patient ? <span className="faint">Reading today’s market…</span> : said ? <span style={{ whiteSpace: 'normal' }}>{said.other}</span> : null}
                    {said?.moved && !reading && <span className="note small" style={{ ...wrap, color: 'var(--acc2)' }}>{said.moved}</span>}
                  </td>
                  <td style={{ color: p?.profit == null ? undefined : p.profit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                    {p?.profit != null ? iskBigSigned(p.profit) : '–'}
                    {p?.ret != null && <span className="sub">{p.ret >= 0 ? '+' : ''}{pct(p.ret, 1)} on {iskBig(x.units * (x.unitCost ?? 0))}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
  // What each plan bought and hasn't listed: the same list step as the planner's checklist.
  const listing = usePlanListing();
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
                <td>{units(prog.placed)} of {units(prog.of)}{prog.dropped.length > 0 && (
                  <span className="sub" tabIndex={0} data-tip-title="Dropped from the plan" data-tip="Items whose bid you cancelled with nothing bought, or whose position you closed or deleted. The plan doesn’t ask for them again; a new bid for one still counts as placing it.">{units(prog.dropped.length)} dropped</span>
                )}</td>
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
      {d.plans.map((p) => {
        const mine = listing.filter((x) => x.plan.id === p.id);
        return mine.length ? <PlanListPart key={p.id} rows={mine} planName={p.name} /> : null;
      })}
    </section>
  );
}
