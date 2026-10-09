import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, BanknoteArrowDown, ChevronsUp, CircleDashed, CircleX, ClipboardList, Crosshair, Hand, Hourglass, LayoutGrid, ListOrdered, MoveVertical, Timer } from 'lucide-react';
import { ago, fmtDateTime, isk, iskBig, plainNum, units, until } from '../lib/format';
import { useAuth, useNow, navigate, useRoute } from '../lib/hooks';
import { checkOrders, costBasis, jitaOpen, sidePace, useOrderCheck, verdicts } from '../lib/orderCheck';
import { rates } from '../lib/fees';
import { tickDown } from '../lib/tick';
import { competitionShare, SPLIT_SAID } from '../lib/split';
import { useFlow, watchedDays, watchedFlow, watchedHours } from '../lib/flowStore';
import { busyHours, busySaid } from '../lib/rhythm';
import { getCloudStatus, useCloud } from '../lib/cloud';
import { leaveSaid, TRACK_MIN } from '../lib/track';
import { othersUndercutRate, ownFrontMoves, relistPace } from '../lib/flow';
import { update, useData } from '../lib/store';
import { afterMove, afterMoveSaid, byUrgency, FEE_TARGET, feedsQueueSaid, feedsQueueTag, movesToFront, PLAN_KEEP, PLAN_KEEP_SAID, shownVerdict, type FeedsQueue, type OverResale, type Relist, type ShownVerdict, type TooBig, type UnderCost } from '../lib/relist';
import { tileRows } from '../lib/tileFilter';
import { isLeft, leaveByHand, stopLeaving, type TradePlan } from '../lib/plans';
import { FILL_WINDOW } from '../lib/fills';
import type { Order } from '../lib/types';
import { BusyRelisting, canOpenInGame, CopyPrice, NameInGame, OpenInGame, useTypeName } from './common';
import { cssVars, Empty, Guide, ItemIcon, Notice, PageHead, pressProps, Seg, SortTh, SortThPair, TileShowing, useTileFilter } from './ui';
import { Figures } from './Facts';
import { TradeSkillsLine } from './SkillStrip';

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
    Verdict: `Whether this order is worth doing something about.\n\n• Being ${both ? 'beaten' : beat} on its own isn’t a reason to move.\n• What matters is how long the ${both ? 'traders' : rivals} ahead of you will stay ahead.${buy || both ? `\n• A buy order also has to be reached: if the bulk of trading hasn’t been getting down to it, the move is to where it does, and if that leaves too little margin, the advice is to cancel it.\n• A buy is never told to raise into a loss. Keep it means raising would leave less than ${PLAN_KEEP_SAID} of what its plan expected (or your target, if that’s lower), or for a buy no plan priced, would lose, selling on where a listing sells now.` : ''}`,
    'Ahead of you': `How many units are queued in front of your price, and how many separate ${both ? 'traders' : rivals} that is.\n\nOne big order is better news than a crowd: when it goes, you jump straight to the front.`,
    'Clears in': 'How long the stock ahead of you takes to clear, if nobody undercuts you meanwhile.\n\n• Only one side of the trading reaches you: buyers taking listings for a sell order, sellers dumping into bids for a buy.\n• Which side trades is measured. Each check compares the Jita book with the one before and counts what sold from each side. Until an item has been watched for about a day, a first reading carries most of the weight: what the book’s orders have already sold on each side, or history’s guess when the book says little.\n• New orders placed in front of you aren’t counted, and they’re common: in a six-hour watch of 71 beaten orders, 46 were undercut again.\n\nIf it’s shorter than the hours you’ll wait, relisting would just be a wasted fee.',
    'Your price': both ? 'What you are asking, or bidding, right now.' : buy ? 'What you are bidding right now.' : 'What you are asking right now.',
    'Move to': `The price that would put you back in front — one legal step ${both ? 'past the best rival' : past} — and how far that is from your own price.`,
    'Costs you': `What getting back in front would cost:\n\n• the margin you give up by ${both ? 'changing price' : buy ? 'bidding higher' : 'asking less'};\n• plus the fee on the new order value.\n\nHover the number for the split.`,
    'Your stock': `How much of this order is left, and roughly how long that would take to ${buy ? 'fill' : 'sell'} once you reach the front.`,
    'ISK in order': 'The ISK currently tied up in this order at its own price.',
  };
}

/**
 * What the verdict column shows (`shownVerdict`): the verdict, except that a buy's raise refused by the guard (`keep`)
 * reads "Keep it", in a warning's amber, rather than "Not worth it". The user was told to raise Praxis three times into a
 * loss and asked for this to be easy to see.
 */
type Shown = ShownVerdict;
const shown = shownVerdict;

const VERDICT: Record<Shown, { label: string; c: string; Icon: typeof Ban }> = {
  keep: { label: 'Keep it', c: 'var(--acc2)', Icon: Hand },
  move: { label: 'Move it', c: 'var(--acc2)', Icon: MoveVertical },
  wait: { label: 'Leave it', c: 'var(--pos)', Icon: Hourglass },
  front: { label: 'In front', c: 'var(--acc)', Icon: ChevronsUp },
  loss: { label: 'Not worth it', c: 'var(--neg)', Icon: Ban },
  dry: { label: 'Cancel it', c: 'var(--neg)', Icon: CircleX },
  bid: { label: 'Sell to bids', c: 'var(--acc2)', Icon: BanknoteArrowDown },
};

function rivalShape(orders: number, topShare: number, isBuy: boolean): string {
  const who = isBuy ? 'buyer' : 'seller';
  if (orders === 0) return '';
  if (orders === 1) return `one ${who}`;
  if (topShare >= 0.6) return `${orders} ${who}s, mostly one order`;
  if (orders >= 10) return `a crowd of ${orders} ${who}s`;
  return `${orders} ${who}s`;
}

/**
 * The columns Orders sorts by. The user asked for every column to sort ascending or descending in one click, with
 * the header in view down a long list (105 orders). The default is the verdict: most urgent first, as before.
 */
type OrderSortKey = 'item' | 'side' | 'verdict' | 'ahead' | 'clears' | 'price' | 'moveTo' | 'costs' | 'stock' | 'isk' | 'perSlot';
type OrderSort = { key: OrderSortKey; dir: 'asc' | 'desc' };
const ORDER_SORT_KEYS: OrderSortKey[] = ['item', 'side', 'verdict', 'ahead', 'clears', 'price', 'moveTo', 'costs', 'stock', 'isk', 'perSlot'];
/** Words and the verdict read top to bottom on a first click; figures biggest first. */
const ORDER_SORT_UP = new Set<OrderSortKey>(['item', 'side', 'verdict']);
const ORDER_SORT_STORE = 'jita-ledger:orders-sort';

function loadOrderSort(): OrderSort {
  try {
    const s = JSON.parse(localStorage.getItem(ORDER_SORT_STORE) ?? 'null') as OrderSort | null;
    if (s && ORDER_SORT_KEYS.includes(s.key) && (s.dir === 'asc' || s.dir === 'desc')) return s;
  } catch { /* the default below */ }
  return { key: 'verdict', dir: 'asc' };
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
  // The verdict tile (or the figure under it) filtering the table, if one is: one at a time, on top of the side shown,
  // for this visit only (lib/tileFilter.ts). It replaced "Keep it"'s count flashing its rows.
  const { on: tile, setOn: setTile, press: pressTileOf } = useTileFilter<Shown>('orders-table');
  const [sort, setSort] = useState<OrderSort>(loadOrderSort);
  // Orders to bring into view and flash: from a link to one item's orders (`orders?show=TYPE`, a position's "Should I
  // move them?"), or To do's "Open orders". The user asked for the row to scroll into view and flash with a bright
  // outline, since landing at the top of 105 orders left them hunting for it.
  const route = useRoute();
  const showType = Number(route.query.get('show')) || null;
  const [flash, setFlash] = useState<Set<number>>(() => new Set());
  const flashTimer = useRef<number | undefined>(undefined);
  const focusOrders = (ids: number[], delay = 60) => {
    if (!ids.length) return;
    // Every side and no tile's filter, or the row to show may be one they hide.
    setSide('all');
    setTile(null);
    window.setTimeout(() => {
      document.querySelector(`tr[data-order="${ids[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // The flash starts once the smooth scroll has mostly arrived, so it's seen, not spent on the way.
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => {
        setFlash(new Set(ids));
        flashTimer.current = window.setTimeout(() => setFlash(new Set()), 2600);
      }, 450);
    }, delay);
  };
  const sortBy = (key: OrderSortKey) => setSort((s) => {
    const next: OrderSort = s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: ORDER_SORT_UP.has(key) ? 'asc' : 'desc' };
    try { localStorage.setItem(ORDER_SORT_STORE, JSON.stringify(next)); } catch { /* remembered for this visit only */ }
    return next;
  });

  const open = useMemo(() => Object.values(d.orders).filter((o) => o.state === 'open' && o.volumeRemain > 0), [d.orders]);
  const mine = useMemo(() => jitaOpen(d), [d.orders]); // eslint-disable-line react-hooks/exhaustive-deps
  const elsewhere = open.length - mine.length;
  const cost = useMemo(() => costBasis(d), [d.positions, d.txs, d.journal, d.orders, d.settings, d.stock, d.ignored]); // eslint-disable-line react-hooks/exhaustive-deps
  // The cloud's watched trade feeds each order's pace, so its arrival re-reads the verdicts.
  const flowV = useFlow();
  const all: Relist[] = useMemo(() => verdicts(d, check, cost), [d, check, cost, flowV]); // eslint-disable-line react-hooks/exhaustive-deps
  // How left orders have filled against the pace expected, once the cloud has checked enough of them.
  const leaveRecord = leaveSaid(useCloud().track?.leave);
  const sideRows = side === 'all' ? all : all.filter((x) => (side === 'buy' ? x.isBuy : !x.isBuy));
  const rows = tileRows(sideRows, tile, (x, k) => shown(x) === k);
  const r = rates(d.settings);
  const checked = !!check.checkedAt && all.length > 0;

  // Arriving with `?show=TYPE`: once, when that item's orders are there to show (every side, so none is filtered out).
  // Taken off the address so a reload doesn't do it again; the wait lets the page finish arriving first.
  const shownFor = useRef<number | null>(null);
  useEffect(() => {
    if (!showType || shownFor.current === showType) return;
    const ids = mine.filter((o) => o.typeId === showType).map((o) => o.orderId);
    if (!ids.length) return;
    shownFor.current = showType;
    setSide('all');
    history.replaceState(null, '', '#/orders');
    focusOrders(ids, 500);
  }, [showType, mine]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const side = sidePace(check, x.typeId, x.isBuy).perDay;
      const sideOrders = book.filter((o) => o.isBuy === x.isBuy).length;
      // A buy the bulk of trading doesn't reach isn't filling at the usual pace: it earns next to nothing.
      const unreached = x.unreached;
      const fills = side && !unreached ? side * competitionShare(d.settings.share, sideOrders) : 0;
      out[x.orderId] = Number.isFinite(margin) ? margin * Math.min(fills, x.volumeRemain) : NaN;
    }
    return out;
  }, [all, check, cost, r.f, r.t, d.settings.share]);

  // The list in the order asked for. A blank cell ("–") always sorts last, whichever way; ties keep the urgency order.
  type Row = Relist | (typeof mine[number] & { unchecked: true });
  const listed: Row[] = useMemo(() => {
    const base: Row[] = checked ? rows : mine.filter((o) => side === 'all' || (side === 'buy' ? o.isBuy : !o.isBuy)).map((o) => ({ ...o, unchecked: true as const }));
    const judged = (row: Row) => ('unchecked' in row ? null : row);
    const value = (row: Row): number | string | null => {
      const x = judged(row);
      switch (sort.key) {
        case 'item': return nameOf(row.typeId);
        case 'side': return row.isBuy ? 'Buy' : 'Sell';
        case 'verdict': return null;
        case 'ahead': return x ? (x.beaten ? x.aheadUnits : 0) : null;
        // "Rarely reached" and "barely trades" are the longest waits of all.
        case 'clears': return x ? (x.unreached ? Infinity : !x.beaten ? 0 : Number.isFinite(x.hoursToFront) ? x.hoursToFront : Infinity) : null;
        case 'price': return x?.price ?? row.price;
        case 'moveTo': return x?.intoBids ? x.intoBids.top : x && !(x.left && x.verdict === 'wait') && Number.isFinite(x.newPrice) && x.newPrice !== x.price ? x.newPrice : null;
        case 'costs': return x?.intoBids ? x.intoBids.proceeds : x && !(x.left && x.verdict === 'wait') && x.cost > 0 ? x.cost : null;
        case 'stock': return x?.volumeRemain ?? row.volumeRemain;
        case 'isk': return (x?.price ?? row.price) * (x?.volumeRemain ?? row.volumeRemain);
        case 'perSlot': return x && Number.isFinite(perSlot[x.orderId]) ? perSlot[x.orderId] : null;
      }
    };
    const sign = sort.dir === 'asc' ? 1 : -1;
    const urgency = (a: Row, b: Row) => { const xa = judged(a), xb = judged(b); return xa && xb ? byUrgency(xa, xb) : 0; };
    return [...base].sort((a, b) => {
      if (sort.key === 'verdict') return sign * urgency(a, b);
      const va = value(a), vb = value(b);
      if (va == null || vb == null) return va == null && vb == null ? urgency(a, b) : va == null ? 1 : -1;
      const c = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va === vb ? 0 : va < vb ? -1 : 1;
      return sign * c || urgency(a, b);
    });
  }, [checked, rows, mine, side, sort, perSlot, nameOf]);

  const tips = tipsFor(side);
  const count = (v: Shown) => all.filter((x) => shown(x) === v).length;
  // "Cancel it", "Sell to bids" and "Keep it" only earn a card when there's something to show.
  const tally = (['bid', 'move', 'keep', 'dry', 'wait', 'front', 'loss'] as Shown[]).filter((v) => (v !== 'dry' && v !== 'bid' && v !== 'keep') || count(v) > 0).map((v) => ({ v, n: count(v) }));
  const worth = count('move'), holding = count('wait'), cancel = count('dry'), keeping = count('keep');
  // A verdict tile, and the figure under it that counts the same orders, filters the table by that verdict: pressed again,
  // it lets go. Before a check there's nothing to count, so nothing to press.
  const press = (v: Shown) => pressTileOf(v, checked ? count(v) : 0);
  const planOf = new Map((d.plans ?? []).map((p) => [p.id, p]));
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
              const p = press(v);
              return (
                <button key={v} type="button" className="vtile press" style={cssVars({ '--c': V.c })} {...pressProps(p)}>
                  <V.Icon aria-hidden="true" />
                  <span>
                    <span className="vt-n">{checked ? n : '–'}</span>
                    <span className="vt-l lbl">{V.label}</span>
                  </span>
                </button>
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

          {/* What the check found, as tiles; when and how fresh, as one line under them. */}
          <div data-rv="" className="col" style={{ gap: 6 }}>
          <Figures items={[
            { key: 'n', value: units(mine.length), label: `order${mine.length > 1 ? 's' : ''} in Jita 4-4, synced ${ago(d.meta.lastSync, now)}` },
            ...(check.checkedAt ? (worth || cancel || holding || keeping ? [
              ...(worth ? [{ key: 'move', value: <span style={{ color: 'var(--acc)' }}>{units(worth)}</span>, label: 'worth moving', press: press('move') }] : []),
              // Keep it rows sort below every Move it, so the count sits beside "worth moving".
              ...(keeping ? [{
                key: 'keep',
                value: <span style={{ color: 'var(--acc2)' }}>{units(keeping)}</span>,
                label: `keep it: raising would cut below what ${keeping === 1 ? 'it' : 'they'} should make`,
                tip: `Buy orders a raise would cut below what they should make, so they say Keep it rather than Move it.\n\n`
                  + `• A plan’s buy: under ${PLAN_KEEP_SAID} of what its plan expected, or your ${Number(d.settings.target.toFixed(1))}% target if that’s lower\n`
                  + `• Any other buy: a loss after every fee, the price changes already paid included\n\nClick to show only ${keeping === 1 ? 'it' : 'them'} in the list below, and again to show every order.`,
                press: press('keep'),
              }] : []),
              ...(cancel ? [{ key: 'cancel', value: <span style={{ color: 'var(--neg)' }}>{units(cancel)}</span>, label: 'to cancel', press: press('dry') }] : []),
              ...(holding ? [{ key: 'hold', value: units(holding), label: worth || cancel ? 'beaten but clearing on their own' : 'beaten, but the stock ahead should clear shortly', press: press('wait') }] : []),
            ] : [{ key: 'front', value: <span style={{ color: 'var(--pos)' }}>All</span>, label: 'in front' }]) : []),
            ...(elsewhere > 0 ? [{ key: 'else', value: units(elsewhere), label: `in other stations: can’t be checked here` }] : []),
          ]} />
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--label)', textWrap: 'pretty' }}>
            {check.checkedAt ? `Prices checked ${ago(check.checkedAt, now)}.` : 'Check prices to see which are worth moving.'}
            {check.checkedAt && check.changed !== null && (check.changed > 0
              ? ` ${units(check.changed)} ${check.changed === 1 ? 'book' : 'books'} moved since the last check.`
              : check.bookFreshAt && check.bookFreshAt > Date.now()
                ? ` Nothing had changed — ESI holds the order book for five minutes, so a relist made in game shows up ${until(new Date(check.bookFreshAt).toISOString(), now) ?? 'shortly'}.`
                : ' Nothing had changed since the last check.')}
            {until(d.meta.nextSyncAt, now) && ` Your own order list refreshes ${until(d.meta.nextSyncAt, now)}.`}
            {check.failed > 0 && ` ${units(check.failed)} couldn’t be read from ESI — check again.`}
          </p>
          </div>
          <TradeSkillsLine />
          {!canOpenInGame() && (
            <Notice kind="warn">Your login predates the “In game” button. Add <code>esi-ui.open_window.v1</code> to your application on developers.eveonline.com, then log out and in again, and each row will open that item’s market window in your client.</Notice>
          )}

          <section id="orders-table" className="panel flush" data-rv="" style={{ flex: 1, minHeight: 260, scrollMarginTop: 12 }}>
            <div className="panel-bar">
              <Seg label="Which orders to show" value={side} onChange={setSide} size="md" options={[
                { v: 'all', label: 'All', n: units(checked ? all.length : mine.length) },
                { v: 'sell', label: 'Sell orders', n: units((checked ? all : mine).filter((x) => !x.isBuy).length) },
                { v: 'buy', label: 'Buy orders', n: units((checked ? all : mine).filter((x) => x.isBuy).length) },
              ]} />
              {checked && tile && <TileShowing shown={rows.length} of={sideRows.length} what={VERDICT[tile].label} onClear={() => setTile(null)} />}
            </div>
            {/* Its own scroll box, capped to the screen: a sticky header sticks to its nearest scrolling box, which the
                sideways scroll makes this one, so the header stays in view down a long list only if this box scrolls. */}
            <div className="tbl-scroll capped">
              {/* Fits the page at 1440 px with the sidebar open (2 October 2026): it had a fixed 1,360 px minimum and ran
                  to 2,157 px checked, so the actions at the right were cut off. Side sits under the item's name and what a
                  move costs under its price, the ISK in an order under its stock, each header stacked to match, every sort
                  and "i" kept. */}
              <table className="tbl ord">
                <thead>
                  <tr>
                    <SortThPair left sort={sort} onSort={sortBy} top={{ k: 'item', label: 'Item' }} bottom={{ k: 'side', label: 'Side', tip: tips.Side }} />
                    <SortTh k="verdict" label="Verdict" sort={sort} onSort={sortBy} left tip={tips.Verdict} />
                    <SortTh k="ahead" label="Ahead of you" sort={sort} onSort={sortBy} tip={tips['Ahead of you']} />
                    <SortTh k="clears" label="Clears in" sort={sort} onSort={sortBy} tip={tips['Clears in']} />
                    <SortTh k="price" label="Your price" sort={sort} onSort={sortBy} tip={tips['Your price']} />
                    <SortThPair sort={sort} onSort={sortBy} top={{ k: 'moveTo', label: 'Move to', tip: tips['Move to'] }} bottom={{ k: 'costs', label: 'Costs you', tip: tips['Costs you'] }} />
                    <SortThPair sort={sort} onSort={sortBy} top={{ k: 'stock', label: 'Stock', title: 'Your stock', tip: tips['Your stock'] }} bottom={{ k: 'isk', label: 'ISK', title: 'ISK in order', tip: tips['ISK in order'] }} />
                    <SortTh k="perSlot" label="Per slot" title="ISK per day per slot" sort={sort} onSort={sortBy} tip={'Rough ISK a day this order earns for the order slot it takes.\n\n• Its margin at your rates, times how fast your side of the volume fills it at your share.\n• The lowest are the first to swap out when you run out of slots.'} />
                    <th scope="col" style={{ color: 'var(--faint-2)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((row, i) => {
                    const x = 'unchecked' in row ? null : (row as Relist);
                    const o = row as { orderId: number; typeId: number; isBuy: boolean; price: number; volumeRemain: number };
                    const name = nameOf(o.typeId);
                    const V = x ? VERDICT[shown(x)] : null;
                    const hot = x?.verdict === 'move';
                    // A raise refused because it would leave too little: never a price to move to, the reason in full.
                    const keep = !!x?.keep && x.verdict === 'loss';
                    // Left behind the front on purpose: the price to get back in front isn't advice for it.
                    const heldBack = !!x?.left && x.verdict === 'wait';
                    // Left alone: by hand, every order of the item; by a Place-and-leave plan, only those placed since it started.
                    const left = isLeft(d.orders[o.orderId] ?? { typeId: o.typeId, issued: '' }, d.leave, d.leaveFrom);
                    const leftSince = !left && d.leave.includes(o.typeId) ? d.leaveFrom[o.typeId] : undefined;
                    // The price shown under Move to: what opening it in game copies, ready for the price box.
                    // A move that would sell under cost ("Not worth it") is no price to move to: shown as "–", never copied. The
                    // user saw 8,499,000 and 999,800 under Move to, with a copy icon, on two snipes it would sell at a loss.
                    const underCostMove = x?.verdict === 'loss' && !keep;
                    // Your own price is no price to move to (the user's Motley Compound was told to move 4,001 to 4,001).
                    const moveTo = x && !x.intoBids && !heldBack && !underCostMove && !keep && Number.isFinite(x.newPrice) && x.newPrice !== x.price ? x.newPrice : null;
                    // What opening it in game copies: the break-even when it's priced under cost, never a move that's
                    // "not worth it" (it would sell under cost), else the price to move to.
                    const copyAt = x?.underCost ? x.underCost.breakEven : x?.verdict === 'loss' ? null : moveTo;
                    return (
                      <tr key={o.orderId} data-order={o.orderId} className={'hover' + (hot ? ' hot' : x && x.verdict !== 'move' && !keep ? ' dim' : '') + (flash.has(o.orderId) ? ' flash' : '')}>
                        <td className="l"><span className="cellrow"><ItemIcon id={o.typeId} /><span className="ord-id"><NameInGame typeId={o.typeId} name={name} className="name" copy={copyAt} /><span className="ord-side lbl" style={{ color: o.isBuy ? 'var(--buy)' : 'var(--neg-t)' }}>{o.isBuy ? 'Buy' : 'Sell'}</span></span></span>{x?.plan && <PlanChip x={x} plan={planOf.get(x.plan.planId)} target={d.settings.target / 100} />}<BusyRelisting typeId={o.typeId} isBuy={o.isBuy} />{x?.underCost && <UnderCostTag u={x.underCost} x={x} />}{x?.overResale && <OverResaleTag u={x.overResale} x={x} r={r} />}{x?.tooBig && <TooBigTag t={x.tooBig} x={x} />}{x?.feeds && <FeedsQueueTag q={x.feeds} />}</td>
                        <td className="l">
                          {V && x ? (
                            <>
                              <span className="flag" tabIndex={0} data-tip={x.why} data-tip-title={V.label} style={cssVars({ '--c': V.c, animation: `rise .4s ${Math.min(i, 10) * 70}ms both` })}>
                                <V.Icon aria-hidden="true" />{V.label}
                              </span>
                              {keep && <span className="sub keep-why">{x.why}.</span>}
                            </>
                          ) : (
                            <span className="flag plain" style={cssVars({ '--c': '#90a5b8' })} data-tip="Check prices to get a verdict."><CircleDashed aria-hidden="true" />Unchecked</span>
                          )}
                        </td>
                        <td>{x?.beaten ? <>{units(x.aheadUnits)}<span className="sub">{rivalShape(x.aheadOrders, x.topRivalShare, x.isBuy)}</span></> : '–'}</td>
                        <td style={{ color: x?.verdict === 'wait' ? 'var(--pos)' : 'var(--cell)' }}>
                          {x?.unreached
                            ? <span data-tip={x.isBuy
                              ? `The bulk of the day’s trading got down to your price on ${x.reach} of the last ${FILL_WINDOW} days. Sellers here list and wait, so the queue ahead isn’t what’s holding you back.`
                              : `The bulk of the day’s trading got up to your price on ${x.reach} of the last ${FILL_WINDOW} days${x.beaten && !x.left ? ', and not to the front of the queue either' : ''}. Buyers here don’t pay that much, so the queue ahead isn’t what’s holding you back.`} data-tip-title="Rarely reached" tabIndex={0} className="words" style={{ color: 'var(--neg)' }}>rarely reached<span className="sub">{x.reach} of {FILL_WINDOW} days</span></span>
                            : !x?.beaten ? '–' : !Number.isFinite(x.hoursToFront) ? <span className="faint words">barely trades</span> : <PaceNote x={x} hours={hours} />}
                        </td>
                        <td data-tip={x ? (x.live ? 'Read from the live book just now' : 'From your last sync; ESI caches orders for twenty minutes') : undefined}>
                          {isk(x?.price ?? o.price)}{(!x || !x.live) && <span className="sub">from last sync</span>}
                        </td>
                        {/* Move to, and what it costs under it: the price that puts you back in front, how far that is from
                            yours, and the margin and fee it takes. Selling into the bids, the top bid and what they pay. */}
                        {x?.intoBids ? (
                          <td>
                            <span style={{ color: 'var(--acc2)' }}>{isk(x.intoBids.top)}</span>
                            <span className="sub">top bid · <span className="nowrap" tabIndex={0} data-tip="What the standing buy orders pay for your stock now, after sales tax. Selling into a bid costs no broker fee.">you get {iskBig(x.intoBids.proceeds)}</span></span>
                          </td>
                        ) : (
                          <td>
                            <span style={{ color: hot ? 'var(--pos)' : 'var(--cell)' }}>{moveTo != null ? isk(moveTo) : '–'}</span>{moveTo != null && <CopyPrice price={moveTo} />}
                            {(() => {
                              const cut = moveTo != null && x && x.cutPct > 0;
                              const costs = x && !heldBack && !underCostMove && !keep && x.cost > 0;
                              if (!cut && !costs) return null;
                              return (
                                <span className="sub">
                                  {cut && <span className="mono" style={{ color: x!.cutPct >= 0.02 ? 'var(--neg)' : 'var(--label)' }}>{x!.isBuy ? '+' : '−'}{(x!.cutPct * 100).toFixed(x!.cutPct < 0.1 ? 1 : 0)}%</span>}
                                  {cut && costs && ' · '}
                                  {costs && <span className="nowrap" tabIndex={0} data-tip={`${isk(x!.give)} of margin plus a ${isk(x!.fee)} fee`}>costs {iskBig(x!.cost)}</span>}
                                </span>
                              );
                            })()}
                            {hot && moveTo != null && movesToFront(x!) && <AfterMoveLine x={x!} orders={d.orders} flowV={flowV} />}
                            {underCostMove && Number.isFinite(x!.newPrice) && <span className="sub" style={{ color: 'var(--neg)' }} data-tip={`Getting in front at ${isk(x!.newPrice)} would sell under what it cost you. ${x!.why}.`}>under cost</span>}
                          </td>
                        )}
                        {/* What's left on the order, in units and in the ISK it holds at its own price, then how long it takes. */}
                        <td>{units(x?.volumeRemain ?? o.volumeRemain)}
                          <span className="sub mono ord-isk">{iskBig((x?.price ?? o.price) * (x?.volumeRemain ?? o.volumeRemain))}</span>
                          {x?.intoBids
                            ? <span className="sub">{x.intoBids.daysToSell > 365 ? 'over a year' : hours(x.intoBids.daysToSell * 24)} listed</span>
                            : x && Number.isFinite(x.yourHours) && !x.unreached && <span className="sub">{hours(x.yourHours)} to {x.isBuy ? 'fill' : 'sell'}</span>}</td>
                        <td style={{ color: 'var(--acc)' }}>{x && Number.isFinite(perSlot[x.orderId]) ? iskBig(perSlot[x.orderId]) : '–'}</td>
                        <td>
                          <span className="acts">
                            <OpenInGame typeId={o.typeId} name={name} copy={copyAt} />
                            <button type="button" className="link-btn dim" onClick={() => navigate(`calculator?type=${o.typeId}`)}>Calc</button>
                            <button type="button" className={'link-btn' + (left ? '' : ' dim')} style={left ? { color: 'var(--pos)' } : undefined}
                              data-tip={left
                                ? `You’re leaving ${name}’s orders${d.leaveFrom[o.typeId] ? ` placed since its Place-and-leave plan started, ${fmtDateTime(d.leaveFrom[o.typeId])},` : ''} where they are: nothing tells you to get back in front, only if trading stops reaching their price. Click to go back to the usual advice${d.leaveFrom[o.typeId] ? ' for all of them' : ''}.${leaveRecord ? `\n\n${leaveRecord}` : ''}`
                                : leftSince
                                  ? `A Place-and-leave plan leaves only ${name}’s orders placed since it started, ${fmtDateTime(leftSince)}. This one was placed before it, so it gets the usual advice.\n\nClick to leave every ${name} order where it is, this one too: no more “move it”, on this page, To do or in alert mail, unless trading stops reaching their price.`
                                  : `Leave ${name}’s orders where they are, behind the front on purpose: no more “move it”, on this page, To do or in alert mail, unless trading stops reaching their price.`}
                              onClick={() => update((d2) => (left ? stopLeaving : leaveByHand)(d2.leave, d2.leaveFrom, [o.typeId]))}>
                              {left ? 'Leaving it' : 'Leave alone'}
                            </button>
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
          { icon: MoveVertical, title: 'Move the ones marked Move it', body: 'Move it means the queue ahead won’t clear in time. Move to shows the price that puts you back in front.' },
          { icon: Hand, title: 'Keep the ones marked Keep it', body: `A buy raised to the front would leave too little: under ${PLAN_KEEP_SAID} of what its plan expected or your target, whichever is lower, or a loss. It says the price to keep it at.` },
          { icon: Ban, title: 'Leave the red ones', body: 'Not worth it means getting in front would cost more margin than it’s worth.' },
          { icon: LayoutGrid, title: 'Mind what each slot earns', body: 'When you run out of order slots, sort by Per slot and swap the lowest earners first.' },
        ]}
      />
    </div>
  );
}

/**
 * A "Clears in" figure, with what it rests on: a typical day's trading split by the book (or history),
 * how long the app has watched this book, and how often someone has listed in front since. The watching
 * carries half the weight after about a day of it.
 */
/** A sell order priced so every sale loses against what the stock cost (`underCost` in relist.ts). */
function UnderCostTag({ u, x }: { u: UnderCost; x: Relist }) {
  const tip = `Every unit this order sells loses money against what it cost you.\n\n`
    + `• Listed at ${isk(x.price)}, a sale gets ${isk(Math.round(u.net))} after the broker fee and sales tax\n`
    + `• Each unit cost you ${isk(Math.round(u.cost))}: ${isk(Math.round(u.lossPerUnit))} lost on each, ${iskBig(u.loss)} on the ${units(x.volumeRemain)} left\n`
    + `• It breaks even at ${isk(u.breakEven)}\n\n`
    + `Consider raising it: a price typed a digit short looks exactly like this. If you mean to sell at a loss to get out, leave it.`;
  return (
    <span className="sub" tabIndex={0} style={{ color: 'var(--neg)', fontWeight: 600 }} data-tip-title="Priced under cost" data-tip={tip}>
      Priced under cost: breaks even at {isk(u.breakEven)}
    </span>
  );
}

/** A buy whose own price already costs more than what it buys resells for (`overResale` in relist.ts). */
function OverResaleTag({ u, x, r }: { u: OverResale; x: Relist; r: { f: number; t: number } }) {
  const tip = `What this order buys resells for less than it costs you.\n\n`
    + `• Listed where a listing sells now, ${isk(u.resale)}, a unit gets ${isk(Math.round(u.resale * (1 - r.f - r.t)))} after the broker fee and sales tax\n`
    + `• Bought at ${isk(x.price)}, it costs ${isk(Math.round(x.price * (1 + r.f) + u.paid))} with the broker fee${u.paid > 0 ? ` and the ${iskBig(Math.round(u.paid))} a unit already paid to change its price` : ''}: ${(-u.ret * 100).toFixed(1)}% lost on each\n`
    + `• It breaks even at a bid of ${isk(u.breakEven)}\n\n`
    + `Consider lowering it or cancelling it: every unit it buys at this price loses.`;
  return (
    <span className="sub" tabIndex={0} style={{ color: 'var(--neg)', fontWeight: 600 }} data-tip-title="Pays more than it resells for" data-tip={tip}>
      Pays more than it resells for: breaks even at {isk(u.breakEven)}
    </span>
  );
}

/** The plan this order's item belongs to (`planTargets`): its name, and the prices and return it was priced at. */
function PlanChip({ x, plan, target }: { x: Relist; plan?: TradePlan; target: number }) {
  const p = x.plan!;
  const tip = `Part of a plan you started${plan ? ` on ${new Date(plan.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}, while its position is open.\n\n`
    + `• The plan bids ${isk(p.buyAt)} and sells at ${isk(p.sellAt)}: ${(p.expected * 100).toFixed(1)}% after fees\n`
    + (x.isBuy
      ? `• A raise must still leave ${p.expected * PLAN_KEEP > target ? `your ${Number((target * 100).toFixed(1))}% target, lower than ${PLAN_KEEP_SAID} of that` : `${PLAN_KEEP_SAID} of that, ${(Math.max(0, p.expected * PLAN_KEEP) * 100).toFixed(1)}%`}, selling on at the plan’s price or where a listing sells now, whichever is lower; otherwise it says Keep it`
      : '• A move is never told to sell under what the stock cost you; one under the plan’s price says so');
  return (
    <span className="sub" style={{ marginTop: 2 }}>
      <span className="flag plain" tabIndex={0} data-tip-title={plan?.name ?? 'A plan'} data-tip={tip} style={cssVars({ '--c': 'var(--acc)', fontSize: 10, padding: '1px 6px' })}>
        <ClipboardList aria-hidden="true" />Plan
      </span>
    </span>
  );
}

/**
 * An order so big that moving it costs more than a move wins (`tooBigToMove`): the user's 50,000-unit Ghoul buy,
 * placed to sit and buy up over time, paid ~250,000 ISK a price change for ~40 units a change.
 */
function TooBigTag({ t, x }: { t: TooBig; x: Relist }) {
  const days = !Number.isFinite(t.daysToFill) ? 'no telling how long' : t.daysToFill > 365 ? 'over a year' : t.daysToFill < 2 ? hours(t.daysToFill * 24) : `${Math.round(t.daysToFill)} days`;
  const wins = t.from === 'own'
    ? `about ${units(Math.round(t.unitsPerChange))} units, ${iskBig(Math.round(t.profitPerChange))} of profit (your last ${t.changes} price changes)`
    : `at most about ${units(Math.round(t.unitsPerChange))} units, ${iskBig(Math.round(t.profitPerChange))} of profit, if you held the front until the next ${x.isBuy ? 'outbid' : 'undercut'}`;
  const tip = `A price change is charged on all ${units(x.volumeRemain)} left on this order, but only wins what ${x.isBuy ? 'fills' : 'sells'} before someone beats the front again.\n\n`
    + `• One price change: about ${iskBig(Math.round(t.changeFee))}\n`
    + `• What it wins: ${wins}\n`
    + `• What’s left takes ${t.paceFrom === 'own' ? days : `at least ${days}`} to ${x.isBuy ? 'fill' : 'sell'}${t.paceFrom === 'own' ? ' at the pace it has' : ', even if everything reaching your side came to you'}, holding ${iskBig(Math.round(t.held))}${x.isBuy ? ' in escrow' : ''}\n\n`
    + `For example: an order of about ${units(t.suggest)} would cost about ${iskBig(Math.round(t.suggestFee))} a price change, about ${Math.round(FEE_TARGET * 100)}% of what it wins. `
    + `Cancelling is free and ${x.isBuy ? 'the escrow comes back at once' : 'the stock goes back to your hangar'}; place ${x.isBuy ? 'another' : 'the rest'} when it ${x.isBuy ? 'fills' : 'sells'}.`;
  return (
    <span className="sub" tabIndex={0} style={{ color: 'var(--neg)' }} data-tip-title="Too big to keep moving" data-tip={tip}>
      Too big to keep moving
    </span>
  );
}

/**
 * A buy that keeps adding stock to a sell queue weeks long (`feedingQueue` in relist.ts): the user's Arbalest buy, still
 * buying thousands while they held 2,338 and buyers took about 200 a day from listings. Amber, like a warning.
 */
function FeedsQueueTag({ q }: { q: FeedsQueue }) {
  // Wraps within the item's column, like every line under a name on Orders, so it doesn't widen the table.
  return (
    <span className="sub" tabIndex={0} style={{ color: 'var(--acc2)', fontWeight: 600 }} data-tip-title="Feeds a long queue" data-tip={feedsQueueSaid(q)}>
      {feedsQueueTag(q)}
    </span>
  );
}

/**
 * Under a move to the front: how long moves to the front lasted on markets about as busy as this one (`afterMove`), a
 * typical figure and never a forecast for this order. The user chose it from the Clears-in research (3 October 2026):
 * the undercuts watched don't sharpen Clears in, but they do say whether a move's fee buys more than an hour in front.
 */
function AfterMoveLine({ x, orders, flowV }: { x: Relist; orders: Record<string, Order>; flowV: number }) {
  const said = useMemo(() => {
    const rate = othersUndercutRate(watchedDays(x.typeId), ownFrontMoves(Object.values(orders), x.typeId, x.isBuy), x.isBuy, Date.now());
    const a = afterMove(rate?.perH);
    return a && rate ? afterMoveSaid(a, rate, x.isBuy) : null;
  }, [x.typeId, x.isBuy, orders, flowV]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!said) return null;
  return <span className="sub" tabIndex={0} data-tip-title="After a move" data-tip={said.tip}>{said.line}</span>;
}

function PaceNote({ x, hours }: { x: Relist; hours: (h: number) => string }) {
  const check = useOrderCheck();
  const p = sidePace(check, x.typeId, x.isBuy);
  const who = x.isBuy ? 'sellers dumping into bids' : 'buyers taking listings';
  const prior = `a typical day’s trading, with the split ${SPLIT_SAID[p.splitFrom]}`;
  // A slow item's pace is a fraction of a unit a day, which rounds to a misleading 0.
  const n = p.perDay ?? 0;
  const perDay = n < 10 ? String(Math.round(n * 10) / 10) : units(Math.round(n));
  const basis = p.watchedH >= 1
    ? `${perDay} a day reaching you: ${who} at Jita over the ${Math.round(p.watchedH)} h this app has watched the book, blended with ${prior}.`
    : `${perDay} a day reaching you: ${prior}. The app hasn’t watched this book long enough to measure it yet.`;
  // How often the front was undercut while watched: the queue can grow again after you move.
  const rp = relistPace(watchedFlow(x.typeId), x.isBuy);
  const cuts = rp ? `\n\n${rp.said} This figure assumes nobody undercuts you meanwhile.` : '';
  // When your side is most active, once there's a week of it: the time to be listed at the front.
  const side = x.isBuy ? 'buy' : 'sell';
  const busy = busyHours(watchedHours(x.typeId), side);
  const when = busy ? `\n\n${busySaid(busy, side, -new Date().getTimezoneOffset() / 60)}` : '';
  // How this estimate has done on your own orders, once the cloud has checked enough of them.
  const tr = getCloudStatus().track;
  const record = tr && tr.checked >= TRACK_MIN
    ? `\n\nChecked on your orders over 30 days: ${units(tr.within2x)} of ${units(tr.checked)} reached the front within twice the time it said.`
    : '';
  return (
    <span tabIndex={0} data-tip={basis + cuts + when + record} data-tip-title="What this rests on">
      {hours(x.hoursToFront)}<span className="sub">{p.watchedH >= 1 ? `${Math.round(p.watchedH)} h watched` : p.splitFrom === 'book' ? 'from the book' : 'from history'}</span>
    </span>
  );
}
