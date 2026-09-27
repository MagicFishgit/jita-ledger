import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleAlert, CircleCheck, Eye, Gauge, Hash, ChartLine, Pencil, Play, Radar, RefreshCw, Search,
  SlidersHorizontal, Sparkles, TrendingDown, TriangleAlert,
} from 'lucide-react';
import { calc, calcWith, omegaRates, rates, RELIST_LEFT } from '../lib/fees';
import { inputNum, isk, iskBig, iskBigSigned, iskSigned, parseISK, pct, plainNum, units } from '../lib/format';
import { marketHistory, resolveType, snapshot } from '../lib/market';
import { marketBest } from '../lib/relist';
import { update, useData } from '../lib/store';
import { addToWatchlist, startPosition } from '../lib/actions';
import { navigate, useNow, type Route } from '../lib/hooks';
import { priceDown, priceUp, tickDown, tickUp } from '../lib/tick';
import { buyerShare, competitionShare, returnPerDay, sideVolume, SPLIT_SAID, tradingSplit, type TradingSplit } from '../lib/split';
import { useFlow, watchedDays, watchedFlow } from '../lib/flowStore';
import { relistPace } from '../lib/flow';
import { paceDay } from '../lib/prospects';
import { askReachDays, bidReachDays, FILL_RARE, FILL_WINDOW, reachedBid, recentRange } from '../lib/fills';
import { toast } from '../lib/toast';
import type { HistRow, MarketSnap } from '../lib/types';
import { ItemSearch, OpenInGame } from './common';
import { fmtDay, HistoryChart, HourlyChart, type HourPoint } from './charts';
import { cloudHours, cloudPrices } from '../lib/cloud';
import { busyHours, busySaid, spreadAtHour, type HourBucket } from '../lib/rhythm';
import { cssVars, Guide, ItemIcon, PageHead, Seg, Tip } from './ui';

/** Plain-English notes behind each field, shown in the tooltip over it. */
const TIPS = {
  item: 'Type the item’s name as it’s spelled in the game, then look it up. That fills in:\n\n• your buy and sell prices, from the Jita 4-4 order book;\n• the daily volume: a typical day of the last two weeks;\n• the item’s market panel, beside this.\n\nYou can skip it and type prices in by hand: the maths doesn’t need the name.',
  buy: 'What you’d offer per unit on your buy order.\n\n• Looking an item up fills in one step above the top buy: the smallest raise EVE accepts, which puts you first in line to be sold to.\n• Your buy-side broker fee is charged on it.',
  sell: 'What you’d ask per unit on your sell order.\n\n• Looking an item up fills in one step below the lowest sell: the smallest undercut EVE accepts, so buyers take yours first.\n• Your sell-side broker fee and the sales tax both come out of this price.',
  qty: 'How many units you plan to buy and then sell.\n\n• It scales the totals.\n• With daily volume, it sets your share of a day’s trade.\n• Broker fees have a 100 ISK minimum per order, so a very small quantity pays proportionally more.',
  vol: 'Roughly how many units trade in a day across The Forge: the typical day of the last two weeks (the median, so one huge day doesn’t inflate it).\n\n• It changes none of your profit figures.\n• It feeds “Share of daily volume” and how long the round trip takes.',
  nBuy: 'How many times you expect to raise this buy order’s price after placing it.\n\n• Each change costs a fee on what’s left of the order, assumed to be half on average.\n• That fee is half the broker fee’s percentage, less with Advanced Broker Relations as Omega.\n\nLeave it at 0 if you’ll place the order once and wait.',
  nSell: 'How many times you expect to drop this sell order’s price after placing it.\n\n• Each change costs a fee on what’s left of the order.\n• Every one you add lowers the net profit and raises the break-even and target sell prices.',
};

const T_ROW: Record<string, string> = {
  spread: 'The gap between your two prices, times the quantity: what the trade is worth before anything is charged for it. Every fee and tax below comes out of this.',
  bb: 'What the station charges for placing the buy order: your broker fee rate on the whole order’s value.\n\n• You pay it up front, which is why a trade starts out behind.\n• Never less than 100 ISK.',
  bs: 'The same charge again when you list the goods for sale, on the value of the sell order. You pay a broker fee twice because you place two orders.',
  tx: 'Taken out as your sell order fills. It applies to the sale only and has no minimum. The Accounting skill cuts the rate, but only while you’re Omega.',
  rl: `What it costs to change the price of an order you’ve already placed, once for each change you entered.\n\n• Charged on what’s left of the order, not the original quantity. Some has usually filled by the time you’re undercut, so this assumes ${Math.round(RELIST_LEFT * 100)}% is left.\n• Half the broker fee rate to start with, down to a fifth with Advanced Broker Relations.`,
  net: 'Your spread with the fees and tax above taken off — the ISK you actually keep once both orders have filled.',
};

const T_FIG: Record<string, string> = {
  spread: 'The gap between your sell price and your buy price, as a share of the buy price, before any fees come out. It has to beat the fees to leave you anything.',
  roi: 'Your profit after every fee and tax, divided by what the buy side takes out of your wallet. It’s the number checked against your target return in Settings.',
  put: 'What the buy order takes out of your wallet the moment you place it, before anything has sold. The broker fee never comes back.',
  be: 'The sell price where you come out exactly level: it covers what you paid, both broker fees, the sales tax and any price changes you entered.',
  target: 'The lowest sell price that hits the target return you set in Settings.',
  maxBuy: 'The most you can pay per unit and still hit your target return.',
  share: 'Your quantity against the Daily volume box — a typical day for the whole Forge region, so treat it as a rough guide to how long you’d wait to fill.',
  trip: 'How long the whole trade takes, buying and then selling.\n\n• Your buy order fills only as fast as sellers dump into bids.\n• Your sell order fills only as fast as buyers take listings.\n• Daily volume counts both, so each side gets only its share: read from what the orders in the book have already sold on each side, or what this app has watched, before history’s guess.',
  perDay: 'Return divided by how many days your ISK is committed. A 6% trade that turns round in hours beats a 12% one that takes a week, because the money can go round again.',
  omega: 'The same trade at the rates your Omega skill plan would give you. The difference is what Omega would add per unit, before you pay for Omega itself.',
};

const SEG_C = { bb: 'var(--blue)', bs: 'var(--violet)', tx: 'var(--acc2)', rl: 'var(--coral)' };

type Fields = { buy: string; sell: string; qty: string; vol: string; nBuy: string; nSell: string };
const EMPTY: Fields = { buy: '', sell: '', qty: '1', vol: '', nBuy: '0', nSell: '0' };
const DRAFT_KEY = 'jita-ledger:calc-draft';

function loadDraft(): { f: Fields; item: { id: number; name: string } | null; range: number } {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.f) return { f: { ...EMPTY, ...d.f }, item: d.item ?? null, range: [7, 30, 90].includes(d.range) ? d.range : 90 };
  } catch { /* ignore */ }
  return { f: EMPTY, item: null, range: 90 };
}

function flipT(days: number): string {
  if (!Number.isFinite(days)) return '–';
  if (days < 1 / 24) return '< 1 h';
  if (days < 1) return `${Math.round(days * 24)} h`;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

export function Calculator({ route }: { route: Route }) {
  const d = useData();
  const now = useNow(60_000);
  const [draft] = useState(loadDraft);
  const [f, setF] = useState<Fields>(draft.f);
  const [item, setItem] = useState<{ id: number; name: string } | null>(draft.item);
  const [range, setRange] = useState(draft.range);
  const [snap, setSnap] = useState<MarketSnap | null>(null);
  const [hist, setHist] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  // Bumped by Clear to remount the item search, which empties its text box.
  const [finderKey, setFinderKey] = useState(0);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ f, item, range })); } catch { /* ignore */ }
  }, [f, item, range]);

  const sharePct = d.settings.share;
  // The fields as they are now, for the lookup, which runs after an await.
  const fRef = useRef(f);
  fRef.current = f;
  const load = useCallback(async (t: { id: number; name: string }, fill: boolean, force = false) => {
    setItem(t); setLoading(true); setMsg(null);
    if (!force) { setSnap(null); setHist([]); }
    try {
      const [s, h] = await Promise.all([snapshot(t.id, force), marketHistory(t.id)]);
      setSnap(s); setHist(h);
      if (fill) {
        // One step inside the spread, where a step is the smallest change EVE takes at that price.
        // Prefill against the real market, not against a token order someone has mispriced.
        const bb = marketBest(s.topBuys, true) ?? NaN;
        const bs = marketBest(s.topSells, false) ?? NaN;
        const buy = tickUp(bb), sell = tickDown(bs);
        const day = s.typicalVol ?? s.avgVol7;
        // A quantity you typed stays. An empty one would leave the result blank for every item looked up (a
        // cleared box is kept in the draft), so it takes your share of a typical day.
        const shareQty = day != null && day > 0 ? Math.max(1, Math.round(day * sharePct / 100)) : 1;
        const qtyFilled = !(parseISK(fRef.current.qty) > 0);
        setF((x) => {
          return {
            ...x,
            buy: Number.isFinite(buy) ? inputNum(buy) : x.buy,
            sell: Number.isFinite(sell) ? inputNum(sell) : x.sell,
            vol: day != null ? inputNum(Math.round(day)) : x.vol,
            qty: qtyFilled ? String(shareQty) : x.qty,
          };
        });
        const filled = [
          Number.isFinite(buy) ? `your buy order ${isk(buy - bb)} above the top buy` : null,
          Number.isFinite(sell) ? `your sell order ${isk(bs - sell)} below the lowest sell` : null,
          day != null ? 'a typical day’s volume' : null,
          qtyFilled ? `a quantity of ${units(shareQty)} (your ${sharePct}% share of a typical day)` : null,
        ].filter(Boolean);
        setMsg({
          text: filled.length
            ? `Filled in: ${filled.join(', ')}. EVE order prices carry only four significant figures, so those are the smallest steps you can take here.`
            : 'Jita 4-4 has no orders for this item right now.',
        });
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), err: true });
    } finally {
      setLoading(false);
    }
  }, [sharePct]);

  // #/calculator?type=123 opens an item straight away; ?name= looks one up by its exact name.
  const typeParam = route.query.get('type');
  const nameParam = route.query.get('name');
  useEffect(() => {
    const id = Number(typeParam);
    if (typeParam && Number.isFinite(id) && id > 0) load({ id, name: d.names[id] ?? `Item #${id}` }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeParam]);
  useEffect(() => {
    if (!nameParam) return;
    resolveType(nameParam).then((t) => {
      if (!t) { setMsg({ text: `No item is called “${nameParam}”. Use the exact name from the game.`, err: true }); return; }
      if (!d.names[t.id]) update((x) => ({ names: { ...x.names, [t.id]: t.name } }));
      load(t, true);
    }).catch((e) => setMsg({ text: e instanceof Error ? e.message : String(e), err: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameParam]);

  // Reload the market for a remembered item without overwriting typed prices.
  useEffect(() => {
    if (item && !typeParam && !nameParam && !snap) load(item, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = d.settings;
  const r = rates(s);
  const tr = {
    buy: parseISK(f.buy), sell: parseISK(f.sell), qty: parseISK(f.qty), vol: parseISK(f.vol),
    nBuy: Math.max(0, parseInt(f.nBuy, 10) || 0), nSell: Math.max(0, parseInt(f.nSell, 10) || 0),
  };
  const c = calc(tr, s);
  // What the empty result is waiting for, named, rather than all three fields every time.
  const gaps = [!(tr.buy > 0) ? 'a buy price' : null, !(tr.sell > 0) ? 'a sell price' : null, !(tr.qty > 0) ? 'a quantity' : null].filter(Boolean) as string[];
  const missing = gaps.length > 1 ? `${gaps.slice(0, -1).join(', ')} and ${gaps[gaps.length - 1]}` : gaps[0] ?? 'a buy price, sell price and quantity';
  const asOmega = s.clone === 'alpha' ? calcWith(tr, omegaRates(s, { acc: s.planAcc, br: s.planBr, abr: s.planAbr }), s.target) : null;
  // Who's trading: what the live orders have sold and what this app has watched, before history's guess.
  const flow = useFlow();
  const split = useMemo(() => tradingSplit({
    history: hist.length ? buyerShare(hist.slice(-30)) : null,
    book: snap?.sold, watched: snap ? watchedFlow(snap.typeId) : null, typicalDay: hist.length ? paceDay(hist) : null,
  }), [hist, snap, flow]); // eslint-disable-line react-hooks/exhaustive-deps
  const buyers = split.share;
  // Does the bulk of trading get down to the buy price typed in? Only said when it doesn't.
  const lows = useMemo(() => (hist.length ? recentRange(hist, undefined, undefined, item ? watchedDays(item.id) : undefined).lows : null), [hist, item, flow]); // eslint-disable-line react-hooks/exhaustive-deps
  const reach = lows && Number.isFinite(tr.buy) && tr.buy > 0 ? bidReachDays(lows, tr.buy) : null;
  const reachAt = lows ? reachedBid(lows) : null;
  const set = (k: keyof Fields) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setMsg(null); };
  const tidy = (k: keyof Fields) => () => {
    const n = parseISK(f[k]);
    if (f[k].trim() && Number.isFinite(n)) setF((x) => ({ ...x, [k]: inputNum(n) }));
  };
  const T = plainNum(s.target);
  const rateKind = s.override ? 'Exact' : s.clone === 'alpha' ? 'Alpha' : 'Omega';

  const FIELDS: [keyof Fields, string, string, number, string?][] = [
    ['buy', 'Buy at', 'ISK', 118], ['sell', 'Sell at', 'ISK', 118], ['qty', 'Qty', '', 72],
    ['vol', 'Daily vol', '', 84], ['nBuy', 'Relists buy', '0', 40], ['nSell', 'Relists sell', '0', 40],
  ];

  const clear = () => { setF(EMPTY); setItem(null); setSnap(null); setHist([]); setMsg(null); setFinderKey((k) => k + 1); };

  return (
    <div className="page gap-18" style={{ minHeight: 620 }}>
      <PageHead
        kicker="01 · Trade check" title="Calculator"
        lede={<>Check a trade before you place it. Rates from Settings: <span className="hi">{rateKind} · broker fee {pct(r.f)} · sales tax {pct(r.t, 3)} · target {T}%</span></>}
        actions={<>
          {item && (
            <>
              <button type="button" className="btn primary" onClick={() => navigate(`positions/${startPosition(item.id).id}`)}><Play aria-hidden="true" />Start trading this item</button>
              <button type="button" className="btn" onClick={() => { const added = addToWatchlist(item.id); toast(added ? `Added ${item.name} to your watchlist.` : `${item.name} is already on your watchlist.`, added ? 'ok' : 'warn'); }}><Eye aria-hidden="true" />Add to watchlist</button>
              <OpenInGame typeId={item.id} name={item.name} label="Open in game" variant="btn" />
            </>
          )}
          <button type="button" className="btn quiet" onClick={clear}>Clear</button>
        </>}
      />

      <section className="chipbar solid" aria-label="Trade" data-rv="">
        <span className="chipbar-title"><SlidersHorizontal aria-hidden="true" />Order</span>
        <ItemSearch
          key={finderKey} keep button={loading ? 'Finding…' : 'Look up in Jita'} tip={TIPS.item} tipTitle="Item to look up"
          initial={item && (d.names[item.id] || !item.name.startsWith('Item #')) ? d.names[item.id] ?? item.name : undefined} onFound={(t) => load(t, true)}
        />
        <span className="vrule" aria-hidden="true" />
        {FIELDS.map(([k, label, ph, w]) => (
          <label key={k} htmlFor={`c-${k}`} className="chip" data-tip={TIPS[k]} data-tip-title={label}>
            <span className="cl">{label}</span>
            <input id={`c-${k}`} type="text" inputMode="decimal" value={f[k]} placeholder={ph} onChange={(e) => set(k)(e.target.value)} onBlur={tidy(k)} style={{ width: w }} autoComplete="off" />
          </label>
        ))}
        <Tip text="Type 1.2m, 350k or 2b, or paste prices straight from the market window." glyph="?" title="Typing prices" />
        {msg && (
          <div className="msg" role="status" style={cssVars({ flexBasis: '100%', '--c': msg.err ? 'var(--neg)' : '#9fb3c5' })}>
            {msg.err ? <CircleAlert aria-hidden="true" /> : <Sparkles aria-hidden="true" />}<span>{msg.text}</span>
          </div>
        )}
        {snap?.npcSell && (
          <div className="msg" role="note" style={cssVars({ flexBasis: '100%', '--c': 'var(--neg)' })}>
            <CircleAlert aria-hidden="true" />
            <span><b>NPCs sell this.</b> They sell it in Jita at a fixed price, in unlimited supply. Players rarely sell below that, so a buy order won’t fill, and there’s nothing cheaper to buy and resell. Neither side of this trade works.</span>
          </div>
        )}
        {!snap?.npcSell && reach != null && reach < FILL_RARE && (
          <div className="msg" role="note" style={cssVars({ flexBasis: '100%', '--c': 'var(--acc2)' })}>
            <CircleAlert aria-hidden="true" />
            <span>
              <b>Trading rarely gets down to your buy price.</b> The bulk of the day’s trading reached {isk(tr.buy)} on {reach} of the last {FILL_WINDOW} days. Sellers here list and wait, so this bid may sit for weeks with your ISK held in it.
              {reachAt != null ? ` Trading reached ${isk(reachAt)} on 7 of them.` : ''}
            </span>
          </div>
        )}
      </section>

      <div className="calc-grid">
        <section className="panel" aria-label="Result" data-rv="">
          {!c.ok ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--note)', padding: '40px 20px' }}>
              <div><div className="empty-fig">–</div><p style={{ margin: '8px 0 0', maxWidth: 300 }}>Enter {missing} to see what you’d make.</p></div>
            </div>
          ) : <Readout c={c} asOmega={asOmega} target={s.target} rateKind={rateKind} buyers={buyers} vol={tr.vol} baseShare={s.share} snap={snap} />}
        </section>

        <section className="panel" aria-label="Jita market" data-rv="" style={{ position: 'relative' }}>
          {!item ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--note)', padding: '40px 20px' }}>
              <div><Radar aria-hidden="true" style={{ width: 40, height: 40, color: 'var(--void)' }} /><p style={{ margin: '10px 0 0', maxWidth: 300 }}>Look an item up and its Jita 4-4 order book and 90 days of trading appear here.</p></div>
            </div>
          ) : (
            <Market
              item={item} snap={snap} hist={hist} range={range} setRange={setRange} now={now} loading={loading} buyers={buyers} split={split}
              onRefresh={() => load(item, false, true)}
              overlays={[
                { price: tr.buy, label: 'Buy', color: 'var(--buy)' },
                { price: tr.sell, label: 'Sell', color: 'var(--neg-l)' },
                ...(c.ok ? [{ price: priceUp(c.beSell), label: 'Break-even', color: 'var(--acc2)' }] : []),
              ]}
              buy={tr.buy} sell={tr.sell}
            />
          )}
        </section>
      </div>

      <Guide
        title="How to use the Calculator"
        intro="Check any single trade before you place it. It tells you what you’d really keep after every fee, whether your prices are realistic, and how long your money would be tied up."
        steps={[
          { icon: Search, title: 'Look the item up', body: 'Type the exact in-game name and press Look up. It fills your prices one legal step inside the Jita spread, plus the daily volume.' },
          { icon: Pencil, title: 'Adjust to your plan', body: 'Change quantity, and how many times you expect to relist each side. More relists means more fees — be honest here.' },
          { icon: CircleCheck, title: 'Read the verdict', body: 'Green clears your target return, amber is profitable but under target, red loses money. The bar shows how much of the spread fees eat.' },
          { icon: ChartLine, title: 'Sanity-check the chart', body: 'Your buy and sell lines should sit inside the shaded high–low band. The notes under the chart warn you if either is outside recent trading.' },
          { icon: Gauge, title: 'Compare by return per day', body: 'When choosing between items, look at return per day tied up, not return alone. Fast turnover wins.' },
        ]}
        habits={[
          { icon: Hash, title: 'Paste straight from the game', body: 'You can type 1.2m, 350k or 2b, or paste prices from the market window.' },
          { icon: Play, title: 'Start a position when you commit', body: 'Press Start trading this item so every fill is tracked from the first unit.', color: 'var(--pos)' },
        ]}
      />
    </div>
  );
}

type Ok = Extract<ReturnType<typeof calc>, { ok: true }>;

function Readout({ c, asOmega, target, rateKind, buyers, vol, baseShare, snap }: {
  c: Ok; asOmega: ReturnType<typeof calc> | null; target: number; rateKind: string; buyers: number; vol: number; baseShare: number; snap: MarketSnap | null;
}) {
  const q = c.q;
  const per = c.net / q;
  const pos = c.net >= 0;
  const T = plainNum(target);
  const verdict = c.net < 0
    ? { text: 'Loses money', color: 'var(--neg)', Icon: TrendingDown }
    : c.roi < target / 100
      ? { text: `Profitable, under your ${T}% target`, color: 'var(--acc2)', Icon: TriangleAlert }
      : { text: `Clears your ${T}% target`, color: 'var(--pos)', Icon: CircleCheck };

  const spreadU = c.spread / q, feesU = c.fees / q;
  const mx = Math.max(spreadU, feesU, 1e-9);
  const w = (x: number) => `${((Math.max(0, x) / mx) * 100).toFixed(2)}%`;
  const profitU = spreadU - feesU;
  const start = Math.max(0, spreadU);
  const segs = ([['bb', c.brokerBuy / q], ['bs', c.brokerSell / q], ['tx', c.tax / q], ['rl', c.relist / q]] as const).filter(([, v]) => v > 0);

  const rows: [string, string, number, boolean, string][] = [
    ['spread', 'Spread', c.spread, false, 'color-mix(in oklab,var(--acc) 65%,transparent)'],
    ['bb', 'Broker fee, buy order', c.brokerBuy, true, SEG_C.bb],
    ['bs', 'Broker fee, sell order', c.brokerSell, true, SEG_C.bs],
    ['tx', 'Sales tax', c.tax, true, SEG_C.tx],
  ];
  if (c.relist > 0) rows.push(['rl', 'Price changes, on what’s left', c.relist, true, SEG_C.rl]);

  const figs: { l: string; v: string; n: string; tip: string; c?: string }[] = [
    { l: 'Spread', v: pct(c.spreadPct), n: 'Before any fees come out', tip: T_FIG.spread },
    { l: 'Return on ISK spent', v: pct(c.roi), n: `Checked against your ${T}% target`, tip: T_FIG.roi, c: pos ? 'var(--pos)' : 'var(--neg)' },
    { l: 'ISK you put in', v: iskBig(c.cost + c.brokerBuy), n: 'Buy order plus its broker fee', tip: T_FIG.put },
    { l: 'Break-even sell price', v: isk(priceUp(c.beSell)), n: 'Rounded up to a price EVE accepts', tip: T_FIG.be },
    { l: `Sell price for ${T}% return`, v: isk(priceUp(c.targetSell)), n: 'At your buy price, rounded up', tip: T_FIG.target },
    { l: `Highest buy for ${T}% return`, v: isk(priceDown(c.maxBuy)), n: 'At your sell price, rounded down', tip: T_FIG.maxBuy },
  ];
  if (Number.isFinite(c.volShare)) {
    figs.push({
      l: 'Share of daily volume', v: pct(c.volShare, 1), tip: T_FIG.share, c: c.volShare > 0.25 ? 'var(--acc2)' : undefined,
      n: c.volShare <= 0.1 ? 'Rough guide: a modest slice of the market' : c.volShare <= 0.25 ? 'Rough guide: a big slice, so expect slow fills' : 'Rough guide: likely several days to fill',
    });
  }
  if (vol > 0) {
    // Each side fills at your share of that side alone, scaled for how many orders you queue among.
    const shareIn = snap ? competitionShare(baseShare, snap.buyOrders) : baseShare / 100;
    const shareOut = snap ? competitionShare(baseShare, snap.sellOrders) : baseShare / 100;
    const fillIn = sideVolume(vol, buyers, true) * shareIn;
    const fillOut = sideVolume(vol, buyers, false) * shareOut;
    const days = fillIn > 0 && fillOut > 0 ? q / fillIn + q / fillOut : Infinity;
    figs.push({ l: 'Round trip takes', v: flipT(days), n: `Your buy fills from sellers, your sell from buyers — at your ${plainNum(baseShare)}% share of each side${snap ? ', scaled for the orders you queue among' : ''}`, tip: T_FIG.trip });
    figs.push({ l: 'Return per day tied up', v: pct(returnPerDay(c.roi, days), 2), n: 'Return ÷ days your ISK sits in the trade', tip: T_FIG.perDay, c: c.roi >= 0 ? 'var(--pos)' : 'var(--neg)' });
  }
  if (asOmega?.ok) {
    const o = asOmega.net / q;
    figs.push({ l: 'Profit per unit as Omega', v: iskSigned(o), n: `With your skill plan: ${iskSigned(o - per)} per unit`, tip: T_FIG.omega, c: o >= 0 ? 'var(--pos)' : 'var(--neg)' });
  }

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div className="hero-l">
            Net profit per unit
            <Tip title="Net profit per unit" text={'What one unit leaves you with after the fees and tax in the table below.\n\n• It assumes both orders fill in full at the prices you typed.\n• To compare items that cost very different amounts, look at return on ISK spent instead.'} />
          </div>
          <div className="hero-v" style={cssVars({ '--c': pos ? 'var(--pos)' : 'var(--neg)', '--glow': pos ? 'rgba(110,231,168,.35)' : 'rgba(255,107,125,.35)' })}>{iskSigned(per)}</div>
          <div className="hero-s">after broker fees and sales tax {rateKind === 'Exact' ? 'at the rates you typed in (Settings → Rates & fees)' : `at your ${rateKind} rates`}</div>
          {q > 1 && <div className="hero-t">Total for {units(q)} units: <span style={{ color: pos ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(c.net)}</span></div>}
        </div>
        <div className="verdict" style={cssVars({ '--c': verdict.color })}><verdict.Icon aria-hidden="true" />{verdict.text}</div>
      </div>

      <div aria-hidden="true" className="col" style={{ gap: 6, marginTop: 4 }}>
        <div className="barrow">
          <span>Spread</span>
          <div className="bar16">
            <div className="spread-fill" style={{ width: w(spreadU) }} />
            <div className="marker" style={{ left: w(start) }} />
          </div>
        </div>
        <div className="barrow">
          <span>Fees + tax</span>
          <div className="bar16">
            {segs.map(([k, v]) => <div key={k} style={{ width: w(v), background: SEG_C[k] }} />)}
            {profitU > 0 ? <div style={{ width: w(profitU), background: 'var(--pos)' }} /> : <div className="overshoot" style={{ left: w(start), width: w(feesU - start) }} />}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--sec)' }}>
        {c.spread <= 0
          ? 'Your sell price isn’t above your buy price, so the fees are all loss.'
          : c.net >= 0
            ? `Fees and tax take ${pct(c.fees / c.spread, 0)} of your spread. The green part is yours.`
            : `Fees and tax are ${isk((c.fees - c.spread) / q)} per unit more than your spread.`}
      </p>

      <div className="money" role="table" aria-label="Fees and profit">
        <div className="money-r h" role="row"><span role="columnheader">Per trade</span><span role="columnheader">Per unit</span><span role="columnheader">For {units(q)} units</span></div>
        {rows.map(([k, label, v, cost, sw]) => (
          <div key={k} className="money-r" role="row">
            <span className="ml" role="cell"><span className="swatch" style={cssVars({ '--c': sw, width: 9, height: 9 })} />{label}<Tip text={T_ROW[k]} title={label} /></span>
            <span role="cell" style={{ color: cost ? 'var(--cell)' : 'var(--figure)' }}>{isk((cost ? -v : v) / q)}</span>
            <span role="cell" style={{ color: cost ? 'var(--cell)' : 'var(--figure)' }}>{iskBig(cost ? -v : v)}</span>
          </div>
        ))}
        <div className="money-r net" role="row" style={{ background: pos ? 'rgba(110,231,168,.06)' : 'rgba(255,107,125,.06)' }}>
          <span className="ml" role="cell"><span className="swatch" style={cssVars({ '--c': 'var(--pos)', width: 9, height: 9 })} />Net profit<Tip text={T_ROW.net} title="Net profit" /></span>
          <span role="cell" style={{ color: pos ? 'var(--pos)' : 'var(--neg)' }}>{iskSigned(c.net / q)}</span>
          <span role="cell" style={{ color: pos ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(c.net)}</span>
        </div>
      </div>

      <div className="figs">
        {figs.map((g) => (
          <div key={g.l} className="fig" style={cssVars({ '--c': g.c })}>
            <div className="fig-l">{g.l}<Tip text={g.tip} title={g.l} big /></div>
            <div className="fig-v">{g.v}</div>
            <div className="fig-n">{g.n}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Market(props: {
  item: { id: number; name: string }; snap: MarketSnap | null; hist: HistRow[]; range: number; setRange: (n: number) => void;
  now: number; loading: boolean; buyers: number; split: TradingSplit; onRefresh: () => void;
  overlays: { price: number; label: string; color: string }[]; buy: number; sell: number;
}) {
  const { item, snap, hist, range, now, buyers } = props;
  // The cloud's hour-by-hour record of the Jita book, for items it watches. Nothing shows without it.
  const [hourly, setHourly] = useState<HourPoint[] | null>(null);
  const [hod, setHod] = useState<HourBucket[]>([]);
  useEffect(() => {
    let alive = true;
    setHourly(null); setHod([]);
    cloudPrices(item.id, 24 * 14).then((p) => { if (alive) setHourly(p); }).catch(() => undefined);
    cloudHours(item.id).then((h) => { if (alive) setHod(h); }).catch(() => undefined);
    return () => { alive = false; };
  }, [item.id]);
  const spreadNow = hourly ? spreadAtHour(hourly, now) : null;
  const hourSpan = hourly && hourly.length >= 2 ? hourly[hourly.length - 1].hour - hourly[0].hour : 0;
  const mv = snap ? Math.max(1, ...snap.topBuys.map((x) => x.volume), ...snap.topSells.map((x) => x.volume)) : 1;
  const bookAt = snap ? new Date(snap.fetchedAt) : null;
  const win = hist.filter((h) => Date.parse(h.date + 'T00:00:00Z') >= now - range * 86400_000);
  const last7 = hist.slice(-7);
  const hi7 = last7.length ? Math.max(...last7.map((x) => x.highest)) : NaN;
  const lo7 = last7.length ? Math.min(...last7.map((x) => x.lowest)) : NaN;
  const a7 = last7.length ? last7.reduce((t, x) => t + x.average, 0) / last7.length : NaN;
  const v7 = last7.length ? last7.reduce((t, x) => t + x.volume, 0) / 7 : NaN;
  const avgN = win.length ? win.reduce((t, x) => t + x.average, 0) / win.length : NaN;
  const trend = a7 / avgN - 1;
  const mn = win.length ? Math.min(...win.map((x) => x.lowest)) : NaN;
  const mx = win.length ? Math.max(...win.map((x) => x.highest)) : NaN;

  // Judged the way the rest of the app judges it (fills.ts): on how many recent days the bulk of trading
  // reached the price. One day's extreme isn't enough, and ESI's daily high and low leave out a small
  // share of trades anyway, so "above every trade" was never quite true.
  const reality: { ok: boolean; t: string }[] = [];
  if (last7.length) {
    const { lows, highs } = recentRange(hist, undefined, undefined, watchedDays(item.id));
    if (Number.isFinite(props.sell) && props.sell > 0) {
      const n = askReachDays(highs, props.sell);
      reality.push(n < FILL_RARE
        ? { ok: false, t: `The bulk of trading got up to your sell at ${iskBig(props.sell)} on ${n} of the last ${FILL_WINDOW} days (this week’s high was ${iskBig(hi7)}). It will likely sit until the market comes up to it.` }
        : { ok: true, t: `Trading got up to your sell at ${iskBig(props.sell)} on ${n} of the last ${FILL_WINDOW} days. The average line sits lower because it also counts sales into buy orders.` });
    }
    if (Number.isFinite(props.buy) && props.buy > 0) {
      const n = bidReachDays(lows, props.buy);
      reality.push(n < FILL_RARE
        ? { ok: false, t: `The bulk of trading got down to your buy at ${iskBig(props.buy)} on ${n} of the last ${FILL_WINDOW} days (this week’s low was ${iskBig(lo7)}). Sellers here list and wait.` }
        : { ok: true, t: `Trading got down to your buy at ${iskBig(props.buy)} on ${n} of the last ${FILL_WINDOW} days.` });
    }
  }
  // How often the front is undercut while watched: a heads-up, never a reason against the trade.
  const paces = [relistPace(watchedFlow(item.id), false), relistPace(watchedFlow(item.id), true)].filter((p) => p?.busy);
  if (paces.length) reality.push({ ok: false, t: `Busy relisting. ${paces.map((p) => p!.said).join(' ')} Price patiently, or expect to relist.` });
  // When each side is about, once the cloud has a week of it.
  const offset = -new Date().getTimezoneOffset() / 60;
  for (const side of ['sell', 'buy'] as const) {
    const w = busyHours(hod, side);
    if (w) reality.push({ ok: true, t: busySaid(w, side, offset) });
  }

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="hero-l">Market · Jita 4-4</div>
          <div className="row" style={{ marginTop: 4, flexWrap: 'nowrap' }}>
            <ItemIcon id={item.id} size="lg" />
            <h2 className="ellipsis" style={{ fontFamily: 'var(--f-head)', fontWeight: 600, fontSize: 19, color: 'var(--ink)', letterSpacing: '.03em' }}>{item.name}</h2>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--note)' }}>
            {bookAt ? `Order book from ${String(bookAt.getUTCHours()).padStart(2, '0')}:${String(bookAt.getUTCMinutes()).padStart(2, '0')} EVE. ESI refreshes it every 5 minutes.` : 'Reading the order book…'}
          </p>
        </div>
        <button type="button" className="icon-btn" aria-label="Refresh the order book" onClick={props.onRefresh} disabled={props.loading}>
          <RefreshCw aria-hidden="true" className={props.loading ? 'spinning' : undefined} />
        </button>
      </div>

      {snap && (
        <div className="book">
          {(['b', 's'] as const).map((side) => {
            const lv = side === 'b' ? snap.topBuys : snap.topSells;
            return (
              <div key={side}>
                <div className={'book-h ' + side}><span>{side === 'b' ? 'Buy orders' : 'Sell orders'}</span><span>{units(side === 'b' ? snap.buyOrders : snap.sellOrders)}</span></div>
                {lv.map((x) => (
                  <div key={x.price} className="book-r">
                    <div className="depth" style={side === 'b' ? { right: 0, width: `${(x.volume / mv) * 100}%`, background: 'rgba(110,231,168,.1)' } : { left: 0, width: `${(x.volume / mv) * 100}%`, background: 'rgba(255,107,125,.1)' }} />
                    <span style={{ color: side === 'b' ? 'var(--bid-t)' : 'var(--neg-t)' }}>{isk(x.price).replace(' ISK', '')}</span>
                    <span style={{ color: 'var(--label)' }}>{units(x.volume)}</span>
                  </div>
                ))}
                {!lv.length && <p className="note" style={{ padding: '6px' }}>None in Jita 4-4.</p>}
              </div>
            );
          })}
        </div>
      )}

      <div className="col" style={{ flex: 1, minHeight: 190, gap: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="hero-l" style={{ letterSpacing: '.16em' }}>Last {range} days · The Forge</span>
            {hist.length > 0 && (
              <span
                tabIndex={0} style={{ fontSize: 11.5, color: 'var(--acc2)', cursor: 'help' }} data-tip-title="Who’s trading"
                data-tip={`How much of the daily volume is buyers taking sell orders, the only trades that fill your sell order.\n\n• Daily volume counts both kinds: buyers taking sells, and sellers dumping into buy orders.\n• The round-trip time uses this split.\n• This one is ${SPLIT_SAID[props.split.from]}${props.split.from === 'watched' ? ` (${Math.round(props.split.watchedH)} h of it)` : ''}.`}
              >~{pct(buyers, 0)} of volume is buyers taking sells</span>
            )}
          </span>
          <span className="legend">
            <Seg size="sm" label="Chart range" value={range} onChange={props.setRange} options={[7, 30, 90].map((n) => ({ v: n, label: `${n}D` }))} />
            <span><i style={{ width: 12, height: 2, background: 'var(--acc)' }} />Average</span>
            <span tabIndex={0} style={{ cursor: 'help' }} data-tip-title="Daily high–low" data-tip={'Each day’s lowest and highest trade.\n\n• The top edge is roughly where sell orders filled.\n• The bottom edge is roughly where buy orders filled.\n• The average sits between them, pulled toward whichever side traded more.'}>
              <i style={{ width: 10, height: 8, background: 'color-mix(in oklab,var(--acc) 30%,transparent)', border: '1px solid color-mix(in oklab,var(--acc) 50%,transparent)' }} />High–low
            </span>
            <span><i style={{ width: 8, height: 8, background: 'color-mix(in oklab,var(--acc2) 45%,transparent)' }} />Units traded</span>
          </span>
        </div>
        {hist.length > 0 ? <HistoryChart rows={hist} days={range} overlays={props.overlays} now={now} /> : <div className="chart-box" style={{ height: 220 }} />}
        {reality.length > 0 && (
          <div className="col" style={{ gap: 4 }}>
            {reality.map((x) => (
              <div key={x.t} className="msg" style={cssVars({ '--c': x.ok ? 'var(--pos)' : 'var(--acc2)', animation: 'none' })}>
                {x.ok ? <CircleCheck aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}<span>{x.t}</span>
              </div>
            ))}
          </div>
        )}
        {win.length > 0 && (
          <div className="g-120">
            {[
              ['7-day avg', iskBig(a7), 'var(--figure)'],
              [`Trend vs ${range}d`, `${trend >= 0 ? '+' : ''}${pct(trend, 1)}`, trend >= 0 ? 'var(--pos)' : 'var(--neg)'],
              ['Range', `${iskBig(mn).replace(' ISK', '')} – ${iskBig(mx)}`, 'var(--figure)'],
              ['Units / day, 7d', units(Math.round(v7)), 'var(--acc2)'],
            ].map(([l, v, col]) => (
              <div key={l} className="inset-box" style={{ padding: '8px 10px' }}>
                <div className="lbl" style={{ fontSize: 10 }}>{l}</div>
                <div className="mono" style={{ fontSize: 13, color: col, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
        {hourly && hourly.length >= 2 && (
          <div className="col" style={{ gap: 6, marginTop: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span
                className="hero-l" tabIndex={0} style={{ letterSpacing: '.16em', cursor: 'help' }} data-tip-title="Jita, hour by hour"
                data-tip={'The best bid and best ask in Jita 4-4, as the cloud read the book every five minutes, kept hour by hour.\n\n• ESI’s history is one row a day; this shows the moves inside a day.\n• It is kept for items you have orders, positions or watchlist entries on, from when the cloud first watched them.'}
              >Jita, hour by hour · {hourSpan >= 48 ? `${Math.round(hourSpan / 24)} days` : `${hourSpan} h`}</span>
              <span className="legend">
                <span><i style={{ width: 12, height: 2, background: 'var(--acc2)' }} />Best ask</span>
                <span><i style={{ width: 12, height: 2, background: 'var(--pos)' }} />Best bid</span>
              </span>
            </div>
            <HourlyChart points={hourly} />
            {spreadNow && (
              <span className="note small" style={{ margin: 0, color: spreadNow.now > spreadNow.usual * 1.2 ? 'var(--pos)' : 'var(--sec)' }}>
                Spread now {pct(spreadNow.now, 1)}; usually {pct(spreadNow.usual, 1)} at this hour (the median of {spreadNow.days} days).
              </span>
            )}
          </div>
        )}
        {win.length > 0 && <p className="note small">First day shown: {fmtDay(Date.parse(win[0].date + 'T00:00:00Z'))}. ESI leaves out days nothing traded, so a gap in the band is a quiet day, not missing data.</p>}
      </div>

      {props.loading && (
        <div className="loading-veil">
          <div className="scanline keep-motion" />
          <div><div className="ring keep-motion" /><div className="lt">Reading the Jita book</div></div>
        </div>
      )}
    </>
  );
}
