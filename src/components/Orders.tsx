import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, BanknoteArrowDown, ChevronRight, ChevronsUp, CircleDashed, CircleX, Crosshair, Hourglass, LayoutGrid, ListOrdered, MoveVertical, Repeat, Timer } from 'lucide-react';
import { ago, isk, iskBig, plainNum, units, until } from '../lib/format';
import { useAuth, useNow, navigate, useRoute } from '../lib/hooks';
import { checkOrders, costBasis, jitaOpen, sidePace, useOrderCheck, verdicts } from '../lib/orderCheck';
import { rates, effectiveSkills, orderSlots } from '../lib/fees';
import { tickDown } from '../lib/tick';
import { competitionShare, SPLIT_SAID } from '../lib/split';
import { useFlow, watchedFlow, watchedHours } from '../lib/flowStore';
import { busyHours, busySaid } from '../lib/rhythm';
import { getCloudStatus, useCloud } from '../lib/cloud';
import { leaveSaid, TRACK_MIN } from '../lib/track';
import { relistPace } from '../lib/flow';
import { loadCache, rankProspects } from '../lib/scan';
import { DEFAULT_FILTERS } from '../lib/prospects';
import { update, useData } from '../lib/store';
import { byUrgency, FEE_TARGET, type Relist, type TooBig, type UnderCost, type Verdict } from '../lib/relist';
import { FILL_WINDOW } from '../lib/fills';
import type { Prospect } from '../lib/types';
import { BusyRelisting, canOpenInGame, CopyPrice, NameInGame, OpenInGame, useTypeName } from './common';
import { cssVars, Empty, Guide, ItemIcon, Notice, PageHead, Seg, SortTh } from './ui';
import { ScanFreshness } from './ScanFreshness';

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
    Verdict: `Whether this order is worth doing something about.\n\n• Being ${both ? 'beaten' : beat} on its own isn’t a reason to move.\n• What matters is how long the ${both ? 'traders' : rivals} ahead of you will stay ahead.${buy || both ? '\n• A buy order also has to be reached: if the bulk of trading hasn’t been getting down to it, the move is to where it does, and if that leaves too little margin, the advice is to cancel it.' : ''}`,
    'Ahead of you': `How many units are queued in front of your price, and how many separate ${both ? 'traders' : rivals} that is.\n\nOne big order is better news than a crowd: when it goes, you jump straight to the front.`,
    'Clears in': 'How long the stock ahead of you takes to clear, if nobody undercuts you meanwhile.\n\n• Only one side of the trading reaches you: buyers taking listings for a sell order, sellers dumping into bids for a buy.\n• Which side trades is measured. Each check compares the Jita book with the one before and counts what sold from each side. Until an item has been watched for about a day, a first reading carries most of the weight: what the book’s orders have already sold on each side, or history’s guess when the book says little.\n• New orders placed in front of you aren’t counted, and they’re common: in a six-hour watch of 71 beaten orders, 46 were undercut again.\n\nIf it’s shorter than the hours you’ll wait, relisting would just be a wasted fee.',
    'Your price': both ? 'What you are asking, or bidding, right now.' : buy ? 'What you are bidding right now.' : 'What you are asking right now.',
    'Move to': `The price that would put you back in front — one legal step ${both ? 'past the best rival' : past} — and how far that is from your own price.`,
    'Costs you': `What getting back in front would cost:\n\n• the margin you give up by ${both ? 'changing price' : buy ? 'bidding higher' : 'asking less'};\n• plus the fee on the new order value.\n\nHover the number for the split.`,
    'Your stock': `How much of this order is left, and roughly how long that would take to ${buy ? 'fill' : 'sell'} once you reach the front.`,
    'ISK in order': 'The ISK currently tied up in this order at its own price.',
  };
}

const VERDICT: Record<Verdict, { label: string; c: string; Icon: typeof Ban }> = {
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
const ORDER_COLUMNS: [OrderSortKey, string][] = [
  ['ahead', 'Ahead of you'], ['clears', 'Clears in'], ['price', 'Your price'], ['moveTo', 'Move to'], ['costs', 'Costs you'], ['stock', 'Your stock'], ['isk', 'ISK in order'],
];

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

const WEAK_KEY = 'jita-ledger:weakest-open';

export function Orders() {
  const d = useData();
  const auth = useAuth();
  const nameOf = useTypeName();
  const now = useNow();
  const check = useOrderCheck();
  const [side, setSide] = useState<'all' | 'sell' | 'buy'>('all');
  const [sort, setSort] = useState<OrderSort>(loadOrderSort);
  // Orders to bring into view and flash: from a link to one item's orders (`orders?show=TYPE`, a position's "Should I
  // move them?"), or a Weakest slots entry. The user asked for the row to scroll into view and flash with a bright
  // outline, since landing at the top of 105 orders left them hunting for it.
  const route = useRoute();
  const showType = Number(route.query.get('show')) || null;
  const [flash, setFlash] = useState<Set<number>>(() => new Set());
  const flashTimer = useRef<number | undefined>(undefined);
  const focusOrders = (ids: number[], delay = 60) => {
    if (!ids.length) return;
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
  const [better, setBetter] = useState<Prospect[]>([]);

  const open = useMemo(() => Object.values(d.orders).filter((o) => o.state === 'open' && o.volumeRemain > 0), [d.orders]);
  const mine = useMemo(() => jitaOpen(d), [d.orders]); // eslint-disable-line react-hooks/exhaustive-deps
  const elsewhere = open.length - mine.length;
  const cost = useMemo(() => costBasis(d), [d.positions, d.txs, d.journal, d.orders, d.settings, d.stock, d.ignored]); // eslint-disable-line react-hooks/exhaustive-deps
  // The cloud's watched trade feeds each order's pace, so its arrival re-reads the verdicts.
  const flowV = useFlow();
  const all: Relist[] = useMemo(() => verdicts(d, check, cost), [d, check, cost, flowV]); // eslint-disable-line react-hooks/exhaustive-deps
  const leaving = useMemo(() => new Set(d.leave), [d.leave]);
  // How left orders have filled against the pace expected, once the cloud has checked enough of them.
  const leaveRecord = leaveSaid(useCloud().track?.leave);
  const rows = side === 'all' ? all : all.filter((x) => (side === 'buy' ? x.isBuy : !x.isBuy));
  const r = rates(d.settings);
  const slots = orderSlots(effectiveSkills(d.settings));
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
  // Folded away by default on a phone, where it pushed the orders themselves off the first screen; whichever way you
  // leave it is kept in this browser.
  const [weakOpen, setWeakOpen] = useState(() => {
    try { const v = localStorage.getItem(WEAK_KEY); if (v != null) return v === '1'; } catch { /* private window */ }
    return !window.matchMedia?.('(max-width: 640px)').matches;
  });
  const toggleWeak = () => setWeakOpen((o) => { try { localStorage.setItem(WEAK_KEY, o ? '0' : '1'); } catch { /* private window */ } return !o; });
  const tips = tipsFor(side);
  const count = (v: Verdict) => all.filter((x) => x.verdict === v).length;
  // "Cancel it" only earns a card when there's something to cancel.
  const tally = (['bid', 'move', 'dry', 'wait', 'front', 'loss'] as Verdict[]).filter((v) => (v !== 'dry' && v !== 'bid') || count(v) > 0).map((v) => ({ v, n: count(v) }));
  const worth = count('move'), holding = count('wait'), cancel = count('dry');
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
              ? ` Prices checked ${ago(check.checkedAt, now)}: ${worth || cancel ? `${[worth ? `${units(worth)} worth moving` : '', cancel ? `${units(cancel)} to cancel` : '', holding ? `${units(holding)} beaten but clearing on their own` : ''].filter(Boolean).join(', ')}.` : holding ? `nothing worth moving — ${units(holding)} beaten, but the stock ahead should clear shortly.` : 'you are in front on all of them.'}`
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
                <button type="button" className="panel-toggle" aria-expanded={weakOpen} onClick={toggleWeak}>
                  <ChevronRight className="chev" aria-hidden="true" /><span className="panel-title">Weakest slots</span>
                </button>
                <span className="note small">
                  {/* Every open order takes a slot, wherever it is, so the count is all of them. */}
                  {!weakOpen ? `${units(open.length)} of ${units(slots)} slots in use: the ${weakest.length} earning least per slot.`
                    : open.length < slots * 0.9
                    ? `You’re using ${units(open.length)} of ${units(slots)} slots, so none needs freeing yet — but these earn least per slot, and are the first to swap when you get busy.`
                    : `You’re using ${units(open.length)} of ${units(slots)} slots. These earn least per slot; swapping them is how a full book earns more.`}
                </span>
              </div>
              {weakOpen && <ScanFreshness what="what to swap them for" compact />}
              {weakOpen && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 10 }}>
                {weakest.map((x, i) => {
                  const b = better[i];
                  const bv = b ? b.iskPerDay / 2 : null;
                  return (
                    <div key={x.orderId} className="inset-box col" style={{ gap: 4, padding: '10px 12px' }}>
                      <div className="kv"><button type="button" className="name-btn" style={{ color: 'var(--ink)' }} data-tip="Show it in the list below" onClick={() => focusOrders([x.orderId])}>{nameOf(x.typeId)} {x.isBuy ? 'buy' : 'sell'}</button><span className="v" style={{ color: 'var(--acc2)' }}>{iskBig(perSlot[x.orderId])}/day</span></div>
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
              </div>}
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
            {/* Its own scroll box, capped to the screen: a sticky header sticks to its nearest scrolling box, which the
                sideways scroll makes this one, so the header stays in view down a long list only if this box scrolls. */}
            <div className="tbl-scroll capped">
              <table className="tbl" style={{ minWidth: 1360 }}>
                <thead>
                  <tr>
                    <SortTh k="item" label="Item" sort={sort} onSort={sortBy} left />
                    <SortTh k="side" label="Side" sort={sort} onSort={sortBy} left tip={tips.Side} />
                    <SortTh k="verdict" label="Verdict" sort={sort} onSort={sortBy} left tip={tips.Verdict} />
                    {ORDER_COLUMNS.map(([k, h]) => <SortTh key={k} k={k} label={h} sort={sort} onSort={sortBy} tip={tips[h]} />)}
                    <SortTh k="perSlot" label="Per slot" title="ISK per day per slot" sort={sort} onSort={sortBy} tip={'Rough ISK a day this order earns for the order slot it takes.\n\n• Its margin at your rates, times how fast your side of the volume fills it at your share.\n• The lowest are the first to swap out when you run out of slots.'} />
                    <th scope="col" style={{ color: 'var(--faint-2)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((row, i) => {
                    const x = 'unchecked' in row ? null : (row as Relist);
                    const o = row as { orderId: number; typeId: number; isBuy: boolean; price: number; volumeRemain: number };
                    const name = nameOf(o.typeId);
                    const V = x ? VERDICT[x.verdict] : null;
                    const hot = x?.verdict === 'move';
                    // Left behind the front on purpose: the price to get back in front isn't advice for it.
                    const heldBack = !!x?.left && x.verdict === 'wait';
                    const left = leaving.has(o.typeId);
                    // The price shown under Move to: what opening it in game copies, ready for the price box.
                    // A move that would sell under cost ("Not worth it") is no price to move to: shown as "–", never copied. The
                    // user saw 8,499,000 and 999,800 under Move to, with a copy icon, on two snipes it would sell at a loss.
                    const underCostMove = x?.verdict === 'loss';
                    // Your own price is no price to move to (the user's Motley Compound was told to move 4,001 to 4,001).
                    const moveTo = x && !x.intoBids && !heldBack && !underCostMove && Number.isFinite(x.newPrice) && x.newPrice !== x.price ? x.newPrice : null;
                    // What opening it in game copies: the break-even when it's priced under cost, never a move that's
                    // "not worth it" (it would sell under cost), else the price to move to.
                    const copyAt = x?.underCost ? x.underCost.breakEven : x?.verdict === 'loss' ? null : moveTo;
                    return (
                      <tr key={o.orderId} data-order={o.orderId} className={'hover' + (hot ? ' hot' : x && x.verdict !== 'move' ? ' dim' : '') + (flash.has(o.orderId) ? ' flash' : '')}>
                        <td className="l"><span className="cellrow"><ItemIcon id={o.typeId} /><NameInGame typeId={o.typeId} name={name} className="name ellipsis" copy={copyAt} /></span><BusyRelisting typeId={o.typeId} isBuy={o.isBuy} />{x?.underCost && <UnderCostTag u={x.underCost} x={x} />}{x?.tooBig && <TooBigTag t={x.tooBig} x={x} />}</td>
                        <td className="l lbl" style={{ color: o.isBuy ? 'var(--buy)' : 'var(--neg-t)', fontSize: 11.5 }}>{o.isBuy ? 'Buy' : 'Sell'}</td>
                        <td className="l">
                          {V && x ? (
                            <span className="flag" tabIndex={0} data-tip={x.why} data-tip-title={V.label} style={cssVars({ '--c': V.c, fontSize: 11, padding: '3px 9px', animation: `rise .4s ${Math.min(i, 10) * 70}ms both` })}>
                              <V.Icon aria-hidden="true" />{V.label}
                            </span>
                          ) : (
                            <span className="flag plain" style={cssVars({ '--c': '#90a5b8', fontSize: 11, padding: '3px 9px' })} data-tip="Check prices to get a verdict."><CircleDashed aria-hidden="true" />Unchecked</span>
                          )}
                        </td>
                        <td>{x?.beaten ? <>{units(x.aheadUnits)}<span className="sub">{rivalShape(x.aheadOrders, x.topRivalShare, x.isBuy)}</span></> : '–'}</td>
                        <td style={{ color: x?.verdict === 'wait' ? 'var(--pos)' : 'var(--cell)' }}>
                          {x?.unreached
                            ? <span data-tip={x.isBuy
                              ? `The bulk of the day’s trading got down to your price on ${x.reach} of the last ${FILL_WINDOW} days. Sellers here list and wait, so the queue ahead isn’t what’s holding you back.`
                              : `The bulk of the day’s trading got up to your price on ${x.reach} of the last ${FILL_WINDOW} days${x.beaten && !x.left ? ', and not to the front of the queue either' : ''}. Buyers here don’t pay that much, so the queue ahead isn’t what’s holding you back.`} data-tip-title="Rarely reached" tabIndex={0} style={{ color: 'var(--neg)' }}>rarely reached<span className="sub">{x.reach} of {FILL_WINDOW} days</span></span>
                            : !x?.beaten ? '–' : !Number.isFinite(x.hoursToFront) ? <span className="faint">barely trades</span> : <PaceNote x={x} hours={hours} />}
                        </td>
                        <td data-tip={x ? (x.live ? 'Read from the live book just now' : 'From your last sync; ESI caches orders for twenty minutes') : undefined}>
                          {isk(x?.price ?? o.price)}{(!x || !x.live) && <span className="sub">from last sync</span>}
                        </td>
                        {x?.intoBids ? (
                          <>
                            <td><span style={{ color: 'var(--acc2)' }}>{isk(x.intoBids.top)}</span><span className="sub">top bid</span></td>
                            <td data-tip="What the standing buy orders pay for your stock now, after sales tax. Selling into a bid costs no broker fee.">{iskBig(x.intoBids.proceeds)}<span className="sub">you get</span></td>
                          </>
                        ) : (
                          <>
                            <td>
                              <span style={{ color: hot ? 'var(--pos)' : 'var(--cell)' }}>{moveTo != null ? isk(moveTo) : '–'}</span>{moveTo != null && <CopyPrice price={moveTo} />}
                              {moveTo != null && x && x.cutPct > 0 && <span className="sub mono" style={{ color: x.cutPct >= 0.02 ? 'var(--neg)' : 'var(--label)' }}>{x.isBuy ? '+' : '−'}{(x.cutPct * 100).toFixed(x.cutPct < 0.1 ? 1 : 0)}%</span>}
                              {underCostMove && Number.isFinite(x!.newPrice) && <span className="sub" style={{ color: 'var(--neg)' }} data-tip={`Getting in front at ${isk(x!.newPrice)} would sell under what it cost you. ${x!.why}.`}>under cost</span>}
                            </td>
                            <td data-tip={x && !heldBack && !underCostMove && x.cost > 0 ? `${isk(x.give)} of margin plus a ${isk(x.fee)} fee` : undefined}>{x && !heldBack && !underCostMove && x.cost > 0 ? iskBig(x.cost) : '–'}</td>
                          </>
                        )}
                        <td>{units(x?.volumeRemain ?? o.volumeRemain)}{x?.intoBids
                          ? <span className="sub">{x.intoBids.daysToSell > 365 ? 'over a year' : hours(x.intoBids.daysToSell * 24)} listed</span>
                          : x && Number.isFinite(x.yourHours) && !x.unreached && <span className="sub">{hours(x.yourHours)} to {x.isBuy ? 'fill' : 'sell'}</span>}</td>
                        <td>{iskBig((x?.price ?? o.price) * (x?.volumeRemain ?? o.volumeRemain))}</td>
                        <td style={{ color: 'var(--acc)' }}>{x && Number.isFinite(perSlot[x.orderId]) ? iskBig(perSlot[x.orderId]) : '–'}</td>
                        <td>
                          <span className="acts">
                            <OpenInGame typeId={o.typeId} name={name} copy={copyAt} />
                            <button type="button" className="link-btn dim" onClick={() => navigate(`calculator?type=${o.typeId}`)}>Calc</button>
                            <button type="button" className={'link-btn' + (left ? '' : ' dim')} style={left ? { color: 'var(--pos)' } : undefined}
                              data-tip={left
                                ? `You’re leaving ${name}’s orders where they are: nothing tells you to get back in front, only if trading stops reaching their price. Click to go back to the usual advice.${leaveRecord ? `\n\n${leaveRecord}` : ''}`
                                : `Leave ${name}’s orders where they are, behind the front on purpose: no more “move it”, on this page, To do or in alert mail, unless trading stops reaching their price.`}
                              onClick={() => update((d2) => ({ leave: left ? d2.leave.filter((t) => t !== o.typeId) : [...new Set([...d2.leave, o.typeId])] }))}>
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
          { icon: MoveVertical, title: 'Move the amber ones', body: 'Move it means the queue ahead won’t clear in time. Move to shows the price that puts you back in front.' },
          { icon: Ban, title: 'Leave the red ones', body: 'Not worth it means getting in front would cost more margin than it’s worth.' },
          { icon: LayoutGrid, title: 'Mind the weakest slots', body: 'When you run out of order slots, swap the lowest per-slot earners first.' },
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
