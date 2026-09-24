import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { calc, calcWith, omegaRates } from '../lib/fees';
import { inputNum, isk, parseISK } from '../lib/format';
import { marketHistory, snapshot } from '../lib/market';
import { useData } from '../lib/store';
import { addToWatchlist, startPosition } from '../lib/actions';
import { navigate, type Route } from '../lib/hooks';
import { tickDown, tickUp } from '../lib/tick';
import type { HistRow, MarketSnap } from '../lib/types';
import { ItemFinder } from './common';
import { MarketPanel } from './MarketPanel';
import { TradeReadout } from './TradeReadout';

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
        const bb = s.bestBuy ?? NaN, bs = s.bestSell ?? NaN;
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
          <ItemFinder label="Item to look up" button="Look up in Jita" initial={item?.name} onFound={(t) => load(t, true)} />
          <div className="fields">
            <div className="field">
              <label htmlFor="c-buy">Your buy order price</label>
              <input id="c-buy" type="text" inputMode="decimal" placeholder="ISK" value={f.buy} onChange={set('buy')} onBlur={tidy('buy')} />
            </div>
            <div className="field">
              <label htmlFor="c-sell">Your sell order price</label>
              <input id="c-sell" type="text" inputMode="decimal" placeholder="ISK" value={f.sell} onChange={set('sell')} onBlur={tidy('sell')} />
            </div>
            <div className="field">
              <label htmlFor="c-qty">Quantity</label>
              <input id="c-qty" type="text" inputMode="decimal" value={f.qty} onChange={set('qty')} onBlur={tidy('qty')} />
            </div>
            <div className="field">
              <label htmlFor="c-vol">Daily volume <span className="opt">optional</span></label>
              <input id="c-vol" type="text" inputMode="decimal" value={f.vol} onChange={set('vol')} onBlur={tidy('vol')} />
            </div>
            <div className="field">
              <label htmlFor="c-nb">Price changes, buy order</label>
              <input id="c-nb" type="number" min={0} step={1} value={f.nBuy} onChange={set('nBuy')} />
            </div>
            <div className="field">
              <label htmlFor="c-ns">Price changes, sell order</label>
              <input id="c-ns" type="number" min={0} step={1} value={f.nSell} onChange={set('nSell')} />
            </div>
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
              </>
            )}
            <button className="btn" onClick={() => { setF(EMPTY); setItem(null); setSnap(null); setHist([]); setMsg(null); }}>Clear</button>
          </div>
          {msg && <p className={'small ' + (msg.err ? 'neg' : 'muted')} role="status" style={{ margin: 0 }}>{msg.text}</p>}
        </section>
        <TradeReadout c={c} s={d.settings} asOmega={asOmega} />
      </div>
      {item && <MarketPanel name={item.name} snap={snap} hist={hist} loading={loading} onRefresh={() => load(item, false, true)} />}
    </div>
  );
}
