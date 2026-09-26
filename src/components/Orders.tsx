import { useEffect, useMemo, useState } from 'react';
import { Ban, ChevronsUp, CircleDashed, Crosshair, Hourglass, LayoutGrid, ListOrdered, MoveVertical, Repeat, Timer } from 'lucide-react';
import { ago, isk, iskBig, plainNum, units, until } from '../lib/format';
import { useAuth, useNow, navigate } from '../lib/hooks';
import { checkOrders, costBasis, jitaOpen, useOrderCheck, verdicts } from '../lib/orderCheck';
import { rates, effectiveSkills, orderSlots } from '../lib/fees';
import { tickDown } from '../lib/tick';
import { competitionShare, EVEN_SPLIT, sideVolume } from '../lib/split';
import { loadCache, rankProspects } from '../lib/scan';
import { DEFAULT_FILTERS } from '../lib/prospects';
import { update, useData } from '../lib/store';
import type { Relist, Verdict } from '../lib/relist';
import type { Prospect } from '../lib/types';
import { canOpenInGame, OpenInGame, useTypeName } from './common';
import { cssVars, Empty, Guide, ItemIcon, Notice, PageHead, Seg, Th } from './ui';

/**
 * Plain-English notes behind the "i" on each column, phrased for whichever side you are reading.
 * A buy order is beaten from above and a sell from below, so a column means the mirror image of
 * itself depending on the tab, and wording it for sells while you read the buy tab is just wrong.
 */
function tipsFor(side: 'all' | 'sell' | 'buy'): Record<string, string> {
  const buy = side === 'buy';
  const both = side === 'all';
  const rivals = buy ? 'buyers' : 'sellers';
  const beat = buy ? 'outbid' : 'undercut';
  const past = buy ? 'above the best bid' : 'below the cheapest offer';
  const gets = buy ? 'bought from first' : 'sold to first';
  return {
    Side: `Whether you are buying or selling. A buy order is beaten from above and must go up; a sell is beaten from below and must come down. Either way, being at the front means being ${gets}.`,
    Verdict: `Whether this order is worth doing something about. Being ${both ? 'beaten' : beat} on its own is not a reason to move — what matters is how long the ${both ? 'traders' : rivals} ahead of you will stay ahead.`,
    'Ahead of you': `How many units are queued in front of your price, and how many separate ${both ? 'traders' : rivals} that is. One big order is better news than a crowd: when it goes you jump straight to the front.`,
    'Clears in': 'How long the stock ahead of you takes to clear. Only one side of daily volume reaches you — buyers taking listings for a sell order, sellers dumping into bids for a buy — so this uses that side alone, estimated from where each day’s average sits between its low and high. If it is shorter than the hours you’ll wait, relisting would just be a wasted fee.',
    'Your price': both ? 'What you are asking, or bidding, right now.' : buy ? 'What you are bidding right now.' : 'What you are asking right now.',
    'Move to': `The price that would put you back in front — one legal step ${both ? 'past the best rival' : past} — and how far that is from your own price.`,
    'Costs you': `What getting back in front would cost: the margin you give up by ${both ? 'changing price' : buy ? 'bidding higher' : 'asking less'}, plus the fee on the new order value. Hover the number for the split.`,
    'Your stock': `How much of this order is left, and roughly how long that would take to ${buy ? 'fill' : 'sell'} once you reach the front.`,
    'ISK in order': 'The ISK currently tied up in this order at its own price.',
  };
}

const VERDICT: Record<Verdict, { label: string; c: string; Icon: typeof Ban }> = {
  move: { label: 'Move it', c: 'var(--acc2)', Icon: MoveVertical },
  wait: { label: 'Leave it', c: 'var(--pos)', Icon: Hourglass },
  front: { label: 'In front', c: 'var(--acc)', Icon: ChevronsUp },
  loss: { label: 'Not worth it', c: 'var(--neg)', Icon: Ban },
};

function rivalShape(orders: number, topShare: number, isBuy: boolean): string {
  const who = isBuy ? 'buyer' : 'seller';
  if (orders === 0) return '';
  if (orders === 1) return `one ${who}`;
  if (topShare >= 0.6) return `${orders} ${who}s, mostly one order`;
  if (orders >= 10) return `a crowd of ${orders} ${who}s`;
  return `${orders} ${who}s`;
}

function hours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

export function Orders() {
  const d = useData();
  const auth = useAuth();
  const nameOf = useTypeName();
  const now = useNow();
  const check = useOrderCheck();
  const [side, setSide] = useState<'all' | 'sell' | 'buy'>('all');
  const [better, setBetter] = useState<Prospect[]>([]);

  const open = useMemo(() => Object.values(d.orders).filter((o) => o.state === 'open' && o.volumeRemain > 0), [d.orders]);
  const mine = useMemo(() => jitaOpen(d), [d.orders]); // eslint-disable-line react-hooks/exhaustive-deps
  const elsewhere = open.length - mine.length;
  const cost = useMemo(() => costBasis(d), [d.positions, d.txs, d.journal, d.orders, d.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const all: Relist[] = useMemo(() => verdicts(d, check, cost), [d, check, cost]);
  const rows = side === 'all' ? all : all.filter((x) => (side === 'buy' ? x.isBuy : !x.isBuy));
  const r = rates(d.settings);
  const slots = orderSlots(effectiveSkills(d.settings));
  const checked = !!check.checkedAt && all.length > 0;

  // What each slot earns a day: the margin on a unit, times the units your side fills for you.
  const perSlot = useMemo(() => {
    const out: Record<number, number> = {};
    if (!check.books) return out;
    for (const x of all) {
      const book = check.books[x.typeId] ?? [];
      const bids = book.filter((o) => o.isBuy && o.id !== x.orderId).map((o) => o.price);
      const asks = book.filter((o) => !o.isBuy && o.id !== x.orderId).map((o) => o.price);
      const avg = cost[x.typeId];
      // A sell's margin is against what the stock cost, when a position knows; otherwise against the
      // best bid you would be buying at. A buy's margin is against where it could be listed.
      const margin = x.isBuy
        ? (asks.length ? tickDown(Math.min(...asks)) * (1 - r.f - r.t) - x.price * (1 + r.f) : NaN)
        : x.price * (1 - r.f - r.t) - (avg ?? (bids.length ? Math.max(...bids) * (1 + r.f) : NaN));
      const daily = check.daily[x.typeId];
      const sideOrders = book.filter((o) => o.isBuy === x.isBuy).length;
      const fills = daily ? sideVolume(daily, check.buyers[x.typeId] ?? EVEN_SPLIT, x.isBuy) * competitionShare(d.settings.share, sideOrders) : 0;
      out[x.orderId] = Number.isFinite(margin) ? margin * Math.min(fills, x.volumeRemain) : NaN;
    }
    return out;
  }, [all, check, cost, r.f, r.t, d.settings.share]);

  // Items from the last scan that would earn more per slot, for the swap suggestions.
  useEffect(() => {
    let alive = true;
    loadCache().then((cache) => {
      const held = new Set(mine.map((o) => o.typeId));
      const list = rankProspects(cache, d.settings, { ...DEFAULT_FILTERS, budget: 100_000_000, partial: true })
        .filter((p) => !held.has(p.typeId) && !p.warnings.length)
        .sort((a, b) => b.iskPerDay - a.iskPerDay);
      if (alive) setBetter(list);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [mine, d.settings]);

  const weakest = all.filter((x) => Number.isFinite(perSlot[x.orderId])).sort((a, b) => perSlot[a.orderId] - perSlot[b.orderId]).slice(0, 3);
  const tips = tipsFor(side);
  const tally = (['move', 'wait', 'front', 'loss'] as Verdict[]).map((v) => ({ v, n: all.filter((x) => x.verdict === v).length }));
  const worth = tally[0].n, holding = tally[1].n;
  const pct = check.busy ? (check.busy.done / Math.max(1, check.busy.total)) * 100 : 0;

  return (
    <div className="page" style={{ minHeight: 600 }}>
      <PageHead
        kicker="05 · Order triage" title="Orders" wide
        lede="Your open orders checked against the live Jita 4-4 book. ESI can’t place or change an order — and automating the client is a bannable offence — so this finds the work and you do the clicking."
        actions={auth && (
          <button type="button" className="btn primary" style={{ position: 'relative', overflow: 'hidden', height: 40, padding: '0 22px', minWidth: 190 }}
            disabled={!!check.busy || !mine.length} onClick={() => checkOrders(true)}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'rgba(255,255,255,.35)', transition: 'width .3s' }} />
            <Crosshair aria-hidden="true" style={{ position: 'relative' }} />
            <span style={{ position: 'relative' }}>{check.busy ? `Checking ${check.busy.done} of ${check.busy.total}…` : check.checkedAt ? 'Check again' : 'Check prices'}</span>
          </button>
        )}
      />

      {!auth ? (
        <Empty icon={ListOrdered}>Log in with EVE Online to see your orders. They come from your character, so there is nothing to check until then.</Empty>
      ) : !open.length ? (
        <Empty icon={ListOrdered}>No open market orders. They come from your last sync — ESI holds them for twenty minutes, so an order you placed a moment ago may take that long to appear.</Empty>
      ) : !mine.length ? (
        <Empty icon={ListOrdered}>All {units(elsewhere)} of your open orders are in other stations. Jita Ledger only knows the Jita 4-4 book, so it can’t tell you whether those have been beaten.</Empty>
      ) : (
        <>
          <div data-rv="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            {tally.map(({ v, n }) => {
              const V = VERDICT[v];
              return (
                <div key={v} className="row" style={{ gap: 12, padding: '12px 14px', background: 'var(--panel)', border: '1px solid var(--line-2)', borderBottom: `2px solid ${V.c}`, flexWrap: 'nowrap' }}>
                  <V.Icon aria-hidden="true" style={{ width: 20, height: 20, color: V.c, flex: 'none' }} />
                  <div>
                    <div className="mono" style={{ fontSize: 22, lineHeight: 1, color: 'var(--ink)' }}>{checked ? n : '–'}</div>
                    <div className="lbl" style={{ letterSpacing: '.14em', color: V.c, marginTop: 3, fontWeight: 400 }}>{V.label}</div>
                  </div>
                </div>
              );
            })}
            <div className="row" style={{ gridColumn: 'span 2', gap: 10, padding: '10px 14px', background: 'rgba(3,8,14,.6)', border: '1px solid var(--line-2)' }}>
              <Timer aria-hidden="true" style={{ width: 18, height: 18, color: 'var(--acc2)', flex: 'none' }} />
              <label htmlFor="o-wait" style={{ fontSize: 13, color: 'var(--dim)' }}>Leave orders that clear within</label>
              <input id="o-wait" className="input num" type="number" min={0} max={168} step={1} style={{ width: 64, height: 32, colorScheme: 'dark' }}
                value={plainNum(d.settings.waitHours)}
                onChange={(e) => { const n = parseFloat(e.target.value); update((x) => ({ settings: { ...x.settings, waitHours: Number.isFinite(n) ? Math.min(168, Math.max(0, n)) : 0 } })); }} />
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>hours</span>
            </div>
          </div>

          <p data-rv="" style={{ fontSize: 12.5, color: 'var(--label)', textWrap: 'pretty' }}>
            {units(mine.length)} order{mine.length > 1 ? 's' : ''} in Jita 4-4, from your last sync ({ago(d.meta.lastSync, now)}).
            {check.checkedAt
              ? ` Prices checked ${ago(check.checkedAt, now)}: ${worth ? `${units(worth)} worth moving${holding ? `, ${units(holding)} beaten but clearing on their own` : ''}.` : holding ? `nothing worth moving — ${units(holding)} beaten, but the stock ahead should clear shortly.` : 'you are in front on all of them.'}`
              : ' Check prices to see which are worth moving.'}
            {check.checkedAt && check.changed !== null && (check.changed > 0
              ? ` ${units(check.changed)} ${check.changed === 1 ? 'book' : 'books'} moved since the last check.`
              : check.bookFreshAt && check.bookFreshAt > Date.now()
                ? ` Nothing had changed — ESI holds the order book for five minutes, so a relist made in game shows up ${until(new Date(check.bookFreshAt).toISOString(), now) ?? 'shortly'}.`
                : ' Nothing had changed since the last check.')}
            {until(d.meta.nextSyncAt, now) && ` Your own order list refreshes ${until(d.meta.nextSyncAt, now)}.`}
            {elsewhere > 0 && ` ${units(elsewhere)} more ${elsewhere > 1 ? 'are' : 'is'} in other stations and can’t be checked here.`}
            {check.failed > 0 && ` ${units(check.failed)} couldn’t be read from ESI — check again.`}
          </p>
          {!canOpenInGame() && (
            <Notice kind="warn">Your login predates the “In game” button. Add <code>esi-ui.open_window.v1</code> to your application on developers.eveonline.com, then log out and in again, and each row will open that item’s market window in your client.</Notice>
          )}

          {checked && weakest.length > 0 && (
            <section className="panel" data-rv="" style={{ padding: '12px 16px', clipPath: 'none' }}>
              <div className="panel-head">
                <span className="panel-title">Weakest slots</span>
                <span className="note small">
                  {/* Every open order takes a slot, wherever it is, so the count is all of them. */}
                  {open.length < slots * 0.9
                    ? `You’re using ${units(open.length)} of ${units(slots)} slots, so none needs freeing yet — but these earn least per slot, and are the first to swap when you get busy.`
                    : `You’re using ${units(open.length)} of ${units(slots)} slots. These earn least per slot; swapping them is how a full book earns more.`}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 10 }}>
                {weakest.map((x, i) => {
                  const b = better[i];
                  const bv = b ? b.iskPerDay / 2 : null;
                  return (
                    <div key={x.orderId} className="inset-box col" style={{ gap: 4, padding: '10px 12px' }}>
                      <div className="kv"><span style={{ color: 'var(--ink)' }}>{nameOf(x.typeId)} {x.isBuy ? 'buy' : 'sell'}</span><span className="v" style={{ color: 'var(--acc2)' }}>{iskBig(perSlot[x.orderId])}/day</span></div>
                      {b && bv != null ? (
                        <>
                          <div className="kv" style={{ fontSize: 12.5, color: 'var(--sec)' }}>
                            <span className="row tight" style={{ flexWrap: 'nowrap', minWidth: 0 }}><Repeat aria-hidden="true" style={{ width: 12, height: 12, color: 'var(--acc)', flex: 'none' }} /><span className="ellipsis">{nameOf(b.typeId)} · {iskBig(bv)}/day</span></span>
                            <span className="v" style={{ color: bv > perSlot[x.orderId] ? 'var(--pos)' : 'var(--sec)' }}>{bv > perSlot[x.orderId] ? `+${iskBig(bv - perSlot[x.orderId])}/day` : 'no better'}</span>
                          </div>
                          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate(`calculator?type=${b.typeId}`)}>Check it in the calculator</button>
                        </>
                      ) : <span className="note small">Run a scan on Prospects to find what could earn more in this slot.</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="panel flush" data-rv="" style={{ flex: 1, minHeight: 260 }}>
            <div className="panel-bar">
              <Seg label="Which orders to show" value={side} onChange={setSide} size="md" options={[
                { v: 'all', label: 'All', n: units(checked ? all.length : mine.length) },
                { v: 'sell', label: 'Sell orders', n: units((checked ? all : mine).filter((x) => !x.isBuy).length) },
                { v: 'buy', label: 'Buy orders', n: units((checked ? all : mine).filter((x) => x.isBuy).length) },
              ]} />
            </div>
            <div className="tbl-scroll">
              <table className="tbl" style={{ minWidth: 1360 }}>
                <thead>
                  <tr>
                    <Th left>Item</Th>
                    <Th left tip={tips.Side}>Side</Th>
                    <Th left tip={tips.Verdict}>Verdict</Th>
                    {(['Ahead of you', 'Clears in', 'Your price', 'Move to', 'Costs you', 'Your stock', 'ISK in order'] as const).map((h) => <Th key={h} tip={tips[h]}>{h}</Th>)}
                    <Th title="ISK per day per slot" tip="Rough ISK a day this order earns for the slot it takes: its margin at your rates times how fast your side of the volume fills it at your share. Low numbers are the first to swap when you run out of slots.">Per slot</Th>
                    <th scope="col" style={{ color: 'var(--faint-2)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(checked ? rows : mine.filter((o) => side === 'all' || (side === 'buy' ? o.isBuy : !o.isBuy)).map((o) => ({ ...o, unchecked: true as const }))).map((row, i) => {
                    const x = 'unchecked' in row ? null : (row as Relist);
                    const o = row as { orderId: number; typeId: number; isBuy: boolean; price: number; volumeRemain: number };
                    const name = nameOf(o.typeId);
                    const V = x ? VERDICT[x.verdict] : null;
                    const hot = x?.verdict === 'move';
                    return (
                      <tr key={o.orderId} className={'hover' + (hot ? ' hot' : x && x.verdict !== 'move' ? ' dim' : '')}>
                        <td className="l"><span className="cellrow"><ItemIcon id={o.typeId} /><span className="name ellipsis">{name}</span></span></td>
                        <td className="l lbl" style={{ color: o.isBuy ? 'var(--buy)' : 'var(--neg-t)', fontSize: 11.5 }}>{o.isBuy ? 'Buy' : 'Sell'}</td>
                        <td className="l">
                          {V && x ? (
                            <span className="flag" tabIndex={0} data-tip={x.why} data-tip-title={V.label} style={cssVars({ '--c': V.c, fontSize: 11, padding: '3px 9px', animation: `rise .4s ${i * 70}ms both` })}>
                              <V.Icon aria-hidden="true" />{V.label}
                            </span>
                          ) : (
                            <span className="flag plain" style={cssVars({ '--c': '#90a5b8', fontSize: 11, padding: '3px 9px' })} data-tip="Check prices to get a verdict."><CircleDashed aria-hidden="true" />Unchecked</span>
                          )}
                        </td>
                        <td>{x?.beaten ? <>{units(x.aheadUnits)}<span className="sub">{rivalShape(x.aheadOrders, x.topRivalShare, x.isBuy)}</span></> : '–'}</td>
                        <td style={{ color: x?.verdict === 'wait' ? 'var(--pos)' : 'var(--cell)' }}>
                          {!x?.beaten ? '–' : !Number.isFinite(x.hoursToFront) ? <span className="faint">barely trades</span> : hours(x.hoursToFront)}
                        </td>
                        <td data-tip={x ? (x.live ? 'Read from the live book just now' : 'From your last sync; ESI caches orders for twenty minutes') : undefined}>
                          {isk(x?.price ?? o.price)}{(!x || !x.live) && <span className="sub">from last sync</span>}
                        </td>
                        <td>
                          <span style={{ color: hot ? 'var(--pos)' : 'var(--cell)' }}>{x && Number.isFinite(x.newPrice) ? isk(x.newPrice) : '–'}</span>
                          {x && x.cutPct > 0 && <span className="sub mono" style={{ color: x.cutPct >= 0.02 ? 'var(--neg)' : 'var(--label)' }}>{x.isBuy ? '+' : '−'}{(x.cutPct * 100).toFixed(x.cutPct < 0.1 ? 1 : 0)}%</span>}
                        </td>
                        <td data-tip={x && x.cost > 0 ? `${isk(x.give)} of margin plus a ${isk(x.fee)} fee` : undefined}>{x && x.cost > 0 ? iskBig(x.cost) : '–'}</td>
                        <td>{units(x?.volumeRemain ?? o.volumeRemain)}{x && Number.isFinite(x.yourHours) && <span className="sub">{hours(x.yourHours)} to {x.isBuy ? 'fill' : 'sell'}</span>}</td>
                        <td>{iskBig((x?.price ?? o.price) * (x?.volumeRemain ?? o.volumeRemain))}</td>
                        <td style={{ color: 'var(--acc)' }}>{x && Number.isFinite(perSlot[x.orderId]) ? iskBig(perSlot[x.orderId]) : '–'}</td>
                        <td>
                          <span className="acts">
                            <OpenInGame typeId={o.typeId} name={name} />
                            <button type="button" className="link-btn dim" onClick={() => navigate(`calculator?type=${o.typeId}`)}>Calc</button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <Guide
        title="How to use Orders"
        intro="Your open orders checked against the live book, with a verdict on each. Being undercut isn’t always a reason to move."
        steps={[
          { icon: Crosshair, title: 'Check prices', body: 'Reads the live book for every order. ESI refreshes it every five minutes, so checking more often shows nothing new.' },
          { icon: Hourglass, title: 'Set how long you’ll wait', body: 'If the stock ahead of you clears within that many hours, the verdict is Leave it — relisting would just be a fee.' },
          { icon: MoveVertical, title: 'Move the amber ones', body: 'Move it means the queue ahead won’t clear in time. Move to shows the price that puts you back in front.' },
          { icon: Ban, title: 'Leave the red ones', body: 'Not worth it means getting in front would cost more margin than it’s worth.' },
          { icon: LayoutGrid, title: 'Mind the weakest slots', body: 'When you run out of order slots, swap the lowest per-slot earners first.' },
        ]}
      />
    </div>
  );
}
