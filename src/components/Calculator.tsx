import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { calc, calcWith, omegaRates } from '../lib/fees';
import { inputNum, isk, parseISK } from '../lib/format';
import { marketHistory, snapshot } from '../lib/market';
import { marketBest } from '../lib/relist';
import { useData } from '../lib/store';
import { addToWatchlist, startPosition } from '../lib/actions';
import { navigate, type Route } from '../lib/hooks';
import { tickDown, tickUp } from '../lib/tick';
import type { HistRow, MarketSnap } from '../lib/types';
import { Field, ItemFinder, OpenInGame } from './common';
import { MarketPanel } from './MarketPanel';
import { TradeReadout } from './TradeReadout';

/** Plain-English notes behind the "i" beside each field. */
const TIPS = {
  item: 'Type the item\u2019s name exactly as it\u2019s spelled in the game, then look it up. Your buy and sell prices come from the Jita 4-4 order book, the daily volume from the past week of trading, and the item\u2019s market panel opens below. You can skip this and type prices in by hand \u2014 the maths doesn\u2019t need the name.',
  buy: 'What you\u2019d offer per unit on your buy order. Looking an item up fills in one step above the top buy \u2014 the smallest raise EVE accepts at that price \u2014 which puts you first in line to be sold to. Your buy-side broker fee is charged on it.',
  sell: 'What you\u2019d ask per unit on your sell order. Looking an item up fills in one step below the lowest sell \u2014 the smallest undercut EVE accepts \u2014 so yours is the order buyers take first. Both your sell-side broker fee and the sales tax come out of this price, which is why the whole spread never reaches you.',
  qty: 'How many units you plan to buy and then sell. It scales the totals column in the results, and together with daily volume it sets your share of a day\u2019s trade. Broker fees have a 100 ISK minimum per order, so a very small quantity pays proportionally more.',
  vol: 'Roughly how many units of this item trade in a day. Looking an item up fills in the average of the last 7 days from EVE\u2019s own market history \u2014 that covers the whole of The Forge, the region Jita sits in, rather than Jita 4-4 alone, though most Forge trading happens in Jita anyway. (PLEX is the exception: it trades on one market for the whole game.) It changes none of your profit figures. It only feeds \u201cShare of daily volume\u201d in the results, which tells you whether your quantity is a small slice of a day\u2019s trade or enough to sit unsold for days.',
  nBuy: 'How many times you expect to raise this buy order\u2019s price after placing it, to get back on top when someone outbids you. Each change costs a fee on the whole order\u2019s value, at half the broker fee\u2019s percentage \u2014 less if you\u2019re Omega with Advanced Broker Relations trained \u2014 so every one you add eats into the profit. Leave it at 0 if you\u2019ll place the order once and wait.',
  nSell: 'How many times you expect to drop this sell order\u2019s price after placing it, to be the cheapest again when someone undercuts you. Each change costs a fee on the whole order\u2019s value, at half the broker fee\u2019s percentage \u2014 less if you\u2019re Omega with Advanced Broker Relations trained. Every one you add lowers the net profit and raises the break-even and target sell prices.',
};

type Fields = { buy: string; sell: string; qty: string; vol: string; nBuy: string; nSell: string };
const EMPTY: Fields = { buy: '', sell: '', qty: '1', vol: '', nBuy: '0', nSell: '0' };
const DRAFT_KEY = 'jita-ledger:calc-draft';

function loadDraft(): { f: Fields; item: { id: number; name: string } | null } {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.f) return { f: { ...EMPTY, ...d.f }, item: d.item ?? null };
  } catch { /* ignore */ }
  return { f: EMPTY, item: null };
}

export function Calculator({ route }: { route: Route }) {
  const d = useData();
  const [draft] = useState(loadDraft);
  const [f, setF] = useState<Fields>(draft.f);
  const [item, setItem] = useState<{ id: number; name: string } | null>(draft.item);
  const [snap, setSnap] = useState<MarketSnap | null>(null);
  const [hist, setHist] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  // Bumped by Clear to remount the item finder, which empties its text box, error and busy state.
  const [finderKey, setFinderKey] = useState(0);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ f, item })); } catch { /* ignore */ }
  }, [f, item]);

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
        setF((x) => ({
          ...x,
          buy: Number.isFinite(buy) ? inputNum(buy) : x.buy,
          sell: Number.isFinite(sell) ? inputNum(sell) : x.sell,
          vol: s.avgVol7 != null ? inputNum(Math.round(s.avgVol7)) : x.vol,
        }));
        const filled = [
          Number.isFinite(buy) ? `your buy order ${isk(buy - bb)} above the top buy` : null,
          Number.isFinite(sell) ? `your sell order ${isk(bs - sell)} below the lowest sell` : null,
          s.avgVol7 != null ? 'the 7-day average volume' : null,
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
  }, []);

  // #/calculator?type=123 opens an item straight away.
  const typeParam = route.query.get('type');
  useEffect(() => {
    const id = Number(typeParam);
    if (typeParam && Number.isFinite(id) && id > 0) load({ id, name: d.names[id] ?? `Item #${id}` }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeParam]);

  // Reload the market for a remembered item without overwriting typed prices.
  useEffect(() => {
    if (item && !typeParam && !snap) load(item, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tr = {
    buy: parseISK(f.buy), sell: parseISK(f.sell), qty: parseISK(f.qty), vol: parseISK(f.vol),
    nBuy: Math.max(0, parseInt(f.nBuy, 10) || 0), nSell: Math.max(0, parseInt(f.nSell, 10) || 0),
  };
  const c = calc(tr, d.settings);
  const s = d.settings;
  const asOmega = s.clone === 'alpha' ? calcWith(tr, omegaRates(s, { acc: s.planAcc, br: s.planBr, abr: s.planAbr }), s.target) : null;
  const set = (k: keyof Fields) => (e: ChangeEvent<HTMLInputElement>) => { setF((x) => ({ ...x, [k]: e.target.value })); setMsg(null); };
  const tidy = (k: keyof Fields) => () => {
    const n = parseISK(f[k]);
    if (f[k].trim() && Number.isFinite(n)) setF((x) => ({ ...x, [k]: inputNum(n) }));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Calculator</h1>
          <p>Check a trade before you place it. Your skills and rates come from Settings.</p>
        </div>
      </div>
      <div className="cols">
        <section className="card stack" aria-label="Trade">
          <ItemFinder
            key={finderKey} label="Item to look up" button="Look up in Jita"
            // A deep link to an item this browser has never seen has no real name yet, and
            // "Item #999" in the box would only fail when looked up.
            initial={item && d.names[item.id] ? item.name : undefined}
            tip={TIPS.item} onFound={(t) => load(t, true)}
          />
          <div className="fields">
            <Field id="c-buy" label="Your buy order price" tip={TIPS.buy}>
              <input id="c-buy" type="text" inputMode="decimal" placeholder="ISK" value={f.buy} onChange={set('buy')} onBlur={tidy('buy')} />
            </Field>
            <Field id="c-sell" label="Your sell order price" tip={TIPS.sell}>
              <input id="c-sell" type="text" inputMode="decimal" placeholder="ISK" value={f.sell} onChange={set('sell')} onBlur={tidy('sell')} />
            </Field>
            <Field id="c-qty" label="Quantity" tip={TIPS.qty}>
              <input id="c-qty" type="text" inputMode="decimal" value={f.qty} onChange={set('qty')} onBlur={tidy('qty')} />
            </Field>
            <Field id="c-vol" label="Daily volume" opt="optional" tip={TIPS.vol}>
              <input id="c-vol" type="text" inputMode="decimal" value={f.vol} onChange={set('vol')} onBlur={tidy('vol')} />
            </Field>
            <Field id="c-nb" label="Price changes, buy order" tip={TIPS.nBuy}>
              <input id="c-nb" type="number" min={0} step={1} value={f.nBuy} onChange={set('nBuy')} />
            </Field>
            <Field id="c-ns" label="Price changes, sell order" tip={TIPS.nSell}>
              <input id="c-ns" type="number" min={0} step={1} value={f.nSell} onChange={set('nSell')} />
            </Field>
          </div>
          <p className="hint" style={{ marginTop: -6 }}>Type 1.2m, 350k or 2b, or paste prices from the market window.</p>
          <div className="row">
            {item && (
              <>
                <button className="btn btn-primary" onClick={() => {
                  const r = startPosition(item.id);
                  navigate(`positions/${r.id}`);
                }}>Start trading this item</button>
                <button className="btn" onClick={() => setMsg({ text: addToWatchlist(item.id) ? `Added ${item.name} to your watchlist.` : `${item.name} is already on your watchlist.` })}>Add to watchlist</button>
                <OpenInGame typeId={item.id} name={item.name} />
              </>
            )}
            <button className="btn" onClick={() => { setF(EMPTY); setItem(null); setSnap(null); setHist([]); setMsg(null); setFinderKey((k) => k + 1); }}>Clear</button>
          </div>
          {msg && <p className={'small ' + (msg.err ? 'neg' : 'muted')} role="status" style={{ margin: 0 }}>{msg.text}</p>}
        </section>
        <TradeReadout c={c} s={d.settings} asOmega={asOmega} />
      </div>
      {item && <MarketPanel name={item.name} snap={snap} hist={hist} loading={loading} onRefresh={() => load(item, false, true)} />}
    </div>
  );
}
