import { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, RefreshCw, Tags } from 'lucide-react';
import { effectiveSkills, orderSlots, rates } from '../lib/fees';
import { loadFlow } from '../lib/flowStore';
import { ago, isk, iskBig, iskBigSigned, units } from '../lib/format';
import { useNow, useRoute } from '../lib/hooks';
import { IN_USE_CATEGORIES, judgeStock, priceBlock, type StockCall } from '../lib/lootList';
import { pool, readLootMarket } from '../lib/lootMarket';
import { hangarCosts } from '../lib/orderCheck';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import { typeKind } from '../lib/universe';
import { useEnsureNames } from './common';
import { Check, Flag, ItemIcon, Notice, Panel, Seg, Th } from './ui';
import { SellWindowBanner } from './SellWindowBanner';

const MARK_KEY = 'jita-ledger:loot-mark';

/**
 * "List your stock in one paste": everything you bought that sits loose in your Jita hangar (a position's fills, a
 * planner buy, a snipe), priced as Orders prices a new listing and never under what it cost, copied for the Sell
 * window's "Import prices from clipboard". The hangar is unlisted stock by definition: a sell order holds its own
 * goods. Loot, never bought, is List loot's. Ships and things in use are left out, as there.
 */
export function ListStock() {
  const d = useData();
  const now = useNow(15_000);
  const route = useRoute();
  const costs = useMemo(() => hangarCosts(d), [d.stock, d.positions, d.txs, d.journal, d.ignored, d.orders, d.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  useEnsureNames([...costs.keys()]);
  const [calls, setCalls] = useState<StockCall[] | null>(null);
  const [left, setLeft] = useState<{ typeId: number; why: string }[]>([]);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [pick, setPick] = useState<Map<number, boolean>>(() => new Map());
  const [mark, setMarkState] = useState<'point' | 'comma'>(() => { try { return localStorage.getItem(MARK_KEY) === 'comma' ? 'comma' : 'point'; } catch { return 'point'; } });
  const setMark = (m: 'point' | 'comma') => { setMarkState(m); try { localStorage.setItem(MARK_KEY, m); } catch { /* this visit only */ } };

  const r = rates(d.settings);
  const openOrders = Object.values(d.orders).filter((o) => o.state === 'open' && o.volumeRemain > 0);
  const free = Math.max(0, orderSlots(effectiveSkills(d.settings)) - openOrders.length);
  const name = (id: number) => d.names[id] ?? `Item #${id}`;

  // Arriving from a link (`positions?list=stock`, the Sniper's and the planner's): into view, once.
  useEffect(() => {
    if (route.query.get('list') !== 'stock') return;
    history.replaceState(null, '', '#/positions');
    window.setTimeout(() => document.getElementById('list-stock')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 500);
  }, [route]);

  const price = async () => {
    const ids = [...costs.keys()];
    setBusy({ done: 0, total: ids.length });
    try {
      const out: { typeId: number; why: string }[] = [];
      const want: { typeId: number; qty: number }[] = [];
      const names: Record<number, string> = {};
      await pool(ids, 8, async (id) => {
        try {
          const k = await typeKind(id);
          if (!d.names[id]) names[id] = k.name;
          if (k.ship) { out.push({ typeId: id, why: 'a ship: list ships by hand' }); return; }
          const qty = d.stock?.jita[id] ?? 0;
          // Assembled containers, deployables and structures are in use; anything holding other things can't be sold as it is.
          const inUse = IN_USE_CATEGORIES.has(k.category) ? (d.stock?.assembled ? d.stock.assembled[id] ?? 0 : qty) : 0;
          const n = qty - Math.min(qty, Math.max(inUse, d.stock?.holding?.[id] ?? 0));
          if (n > 0) want.push({ typeId: id, qty: n });
          else out.push({ typeId: id, why: 'in use' });
        } catch { out.push({ typeId: id, why: 'its type couldn’t be read' }); }
      });
      if (Object.keys(names).length) update((x) => ({ names: { ...x.names, ...names } }));
      await loadFlow();
      const mine = new Set(openOrders.map((o) => o.orderId));
      const res: StockCall[] = [];
      let done = 0;
      setBusy({ done: 0, total: want.length });
      await pool(want, 4, async (w) => {
        let m = null;
        try { m = (await readLootMarket(w.typeId, mine)).market; } catch { /* judged as unread */ }
        res.push(judgeStock({ typeId: w.typeId, name: d.names[w.typeId] ?? names[w.typeId] ?? `Item #${w.typeId}`, qty: w.qty }, m, costs.get(w.typeId)!.cost, r, d.settings.share));
        setBusy({ done: ++done, total: want.length });
      });
      setCalls(res.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity)));
      setLeft(out); setReadAt(Date.now()); setPick(new Map());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(null);
    }
  };

  const ticked = (c: StockCall) => c.price != null && (pick.get(c.typeId) ?? !c.under);
  const chosen = (calls ?? []).filter(ticked);
  const stale = readAt != null && now - readAt > 5 * 60_000;
  const copy = async () => {
    const block = priceBlock(chosen.map((c) => ({ name: c.name, price: c.price! })), mark);
    if (!block) return;
    try { await navigator.clipboard.writeText(block); toast(`Copied ${units(chosen.length)} price${chosen.length === 1 ? '' : 's'}: in the Sell window, Import prices from clipboard (${mark === 'point' ? 'Decimal Point' : 'Decimal Comma'}).`); }
    catch { toast('Your browser wouldn’t let the page copy.', 'err'); }
  };

  if (!costs.size) return null;
  const waiting = [...costs.entries()];
  return (
    <div id="list-stock">
      <Panel title="List your stock in one paste" sub="What you bought that sits in your Jita hangar: positions’ fills, planner buys, snipes">
        <div className="col" style={{ gap: 12 }}>
          <SellWindowBanner compact />
          {!calls ? (
            <>
              <p className="note" style={{ margin: 0 }}>{units(waiting.length)} item{waiting.length === 1 ? '' : 's'} you bought {waiting.length === 1 ? 'is' : 'are'} loose in your Jita hangar, not listed:</p>
              <div className="bonuses">
                {waiting.slice(0, 6).map(([id]) => <span key={id} className="bonus drop"><ItemIcon id={id} size="sm" />{name(id)}</span>)}
                {waiting.length > 6 && <span className="bonus drop">and {units(waiting.length - 6)} more</span>}
              </div>
              <p className="note small" style={{ margin: 0 }}>Price them where a listing sells now, never under what they cost, and list them all through the Sell window in one paste.</p>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn primary" disabled={!!busy} onClick={() => void price()}><Tags aria-hidden="true" />{busy ? `Pricing ${busy.done} of ${busy.total}…` : 'Price them'}</button>
              </div>
            </>
          ) : (
            <>
              {stale && <Notice kind="warn">Prices are over five minutes old. Price again before pasting.</Notice>}
              {chosen.length > free && <Notice kind="warn">{units(chosen.length)} ticked for {units(free)} free order slot{free === 1 ? '' : 's'}: each line of the paste takes a slot. Untick the ones to keep for later.</Notice>}
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl compact" style={{ minWidth: 860 }}>
                  <thead><tr>
                    <Th left>List</Th><Th left>Item</Th><Th>Qty</Th>
                    <Th tip="What a unit cost you: the position’s average cost, or your latest buys of it, broker fees on buy orders included">Cost</Th>
                    <Th tip="The least listing price that gets the cost back after the broker fee and sales tax">Break-even</Th>
                    <Th tip="Where a listing sells now, as Orders prices a new listing; break-even when that’s under it">List at</Th>
                    <Th tip="What all of it makes over its cost at that price, after the broker fee and sales tax">Profit</Th>
                    <Th tip="Roughly how long it takes to sell at your share of the buyers taking listings">Sells in</Th>
                  </tr></thead>
                  <tbody>
                    {calls.map((c) => {
                      const k = costs.get(c.typeId);
                      return (
                        <tr key={c.typeId} className={ticked(c) ? undefined : 'dim'}>
                          <td className="l">{c.price != null
                            ? <Check bare checked={ticked(c)} onChange={(on) => setPick((p) => new Map(p).set(c.typeId, on))} tip={c.why}>{ticked(c) ? 'Yes' : 'No'}</Check>
                            : <span className="faint">–</span>}</td>
                          <td className="l"><span className="cellrow"><ItemIcon id={c.typeId} size="sm" /><span className="name ellipsis">{c.name}</span></span></td>
                          <td>{units(c.qty)}{k && k.bought < k.held && <span className="sub" data-tip="Your buys cover only these; the rest came from elsewhere (loot), and all of it is costed at what the bought ones cost.">bought {units(k.bought)} of {units(k.held)}</span>}</td>
                          <td>{isk(c.cost)}</td>
                          <td>{isk(c.breakEven)}</td>
                          <td>{c.price == null ? <span className="faint" data-tip={c.why}>no price</span>
                            : c.under ? <Flag color="var(--neg-t)" title="Under cost" why={c.why}>{isk(c.price)}</Flag>
                            : isk(c.price)}</td>
                          <td style={{ color: c.profit == null ? undefined : c.profit >= 0 ? 'var(--pos)' : 'var(--neg-t)' }}>{c.profit != null ? iskBigSigned(c.profit) : '–'}</td>
                          <td>{c.days != null ? (c.days < 1 ? `${Math.max(1, Math.round(c.days * 24))} h` : c.days > 365 ? 'over a year' : `${Math.round(c.days)} d`) : '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="note small" style={{ margin: 0 }}>
                Select the ticked items in your Jita hangar, press Sell, pick a duration, then Import prices from clipboard ({mark === 'point' ? 'Decimal Point' : 'Decimal Comma'}).
                {' '}{units(chosen.length)} ticked, {iskBig(chosen.reduce((t, c) => t + (c.profit ?? 0), 0))} over cost when they sell. Priced {ago(new Date(readAt!).toISOString(), now)}.
              </p>
              {left.length > 0 && <p className="note small" style={{ margin: 0 }}>Left out: {left.map((x) => `${name(x.typeId)} (${x.why})`).join(', ')}.</p>}
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn primary" disabled={!chosen.length} onClick={() => void copy()}><ClipboardCopy aria-hidden="true" />Copy prices for the Sell window</button>
                <Seg label="Number format" size="sm" value={mark} onChange={setMark} options={[{ v: 'point', label: 'Decimal point' }, { v: 'comma', label: 'Decimal comma' }]} />
                <button type="button" className="btn" disabled={!!busy} onClick={() => void price()}><RefreshCw aria-hidden="true" />{busy ? `Pricing ${busy.done} of ${busy.total}…` : 'Price again'}</button>
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
