import { useMemo, useState } from 'react';
import { ClipboardCopy, ClipboardPaste, PackageOpen, RefreshCw, Tags, Warehouse } from 'lucide-react';
import { effectiveSkills, orderSlots, rates } from '../lib/fees';
import { FILL_WINDOW, recentRange } from '../lib/fills';
import { loadFlow, watchedDays, watchedFlow } from '../lib/flowStore';
import { ago, isk, iskBig, units } from '../lib/format';
import { useAuth, useNow } from '../lib/hooks';
import { importBlock, judgeLoot, parseLoot, planLoot, type LootCall, type LootMarket, type LootRow } from '../lib/lootList';
import { jitaOrders, marketHistory, resolveIds } from '../lib/market';
import { jitaOpen } from '../lib/orderCheck';
import { paceDay } from '../lib/prospects';
import { buyerShare, tradingSplit } from '../lib/split';
import { useData } from '../lib/store';
import { toast } from '../lib/toast';
import { Empty, Flag, Guide, ItemIcon, Notice, PageHead, Panel, Seg, Tiles } from './ui';

type Item = { typeId: number; name: string; qty: number };
const MARK_KEY = 'jita-ledger:loot-mark';

const VERDICT: Record<LootCall['verdict'], { label: string; c: string }> = {
  list: { label: 'List it', c: 'var(--pos)' },
  noSlot: { label: 'No slot', c: 'var(--acc2)' },
  bids: { label: 'Sell to bids', c: 'var(--acc)' },
  skip: { label: 'Skip', c: 'var(--label)' },
  held: { label: 'Left out', c: 'var(--faint)' },
};

/**
 * List loot in bulk through the game's Sell window (lootList.ts). Paste the hangar (list view, Ctrl+C) or the Sell
 * window's export; each item is priced where a listing sells and set against what the bids pay now; the listings that
 * gain most per slot fill your free order slots, and their prices are copied for "Import prices from clipboard".
 */
export function Loot() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(15_000);
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [markets, setMarkets] = useState<Record<number, LootMarket | null>>({});
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [included, setIncluded] = useState<Set<number>>(() => new Set());
  const [mark, setMarkState] = useState<'point' | 'comma'>(() => { try { return localStorage.getItem(MARK_KEY) === 'comma' ? 'comma' : 'point'; } catch { return 'point'; } });
  const setMark = (m: 'point' | 'comma') => { setMarkState(m); try { localStorage.setItem(MARK_KEY, m); } catch { /* this visit only */ } };

  const r = rates(d.settings);
  const openOrders = Object.values(d.orders).filter((o) => o.state === 'open' && o.volumeRemain > 0);
  const slots = orderSlots(effectiveSkills(d.settings));
  const free = Math.max(0, slots - openOrders.length);
  // Left out unless included: an open position, or a sell order of yours already on it.
  const heldFor = useMemo(() => {
    const m = new Map<number, 'position' | 'listed'>();
    for (const o of jitaOpen(d)) if (!o.isBuy) m.set(o.typeId, 'listed');
    for (const p of d.positions) if (p.status === 'open') m.set(p.typeId, 'position');
    return m;
  }, [d.positions, d.orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = async (rows: LootRow[]) => {
    if (!rows.length) { toast('Nothing to read there. Paste the hangar (list view, Ctrl+C) or the Sell window’s export.', 'warn'); return; }
    setBusy({ done: 0, total: rows.length });
    try {
      // Names to type IDs, for a hangar paste: ESI names things in English, as the client's names are.
      const need = [...new Set(rows.filter((x) => x.typeId == null).map((x) => x.name))];
      const found = new Map<string, number>();
      for (let i = 0; i < need.length; i += 500) {
        const res = await resolveIds(need.slice(i, i + 500));
        for (const t of res.inventory_types ?? []) found.set(t.name.toLowerCase(), t.id);
      }
      const merged = new Map<number, Item>();
      const missing: string[] = [];
      for (const x of rows) {
        const id = x.typeId ?? found.get(x.name.toLowerCase());
        if (id == null) { missing.push(x.name); continue; }
        const was = merged.get(id);
        merged.set(id, was ? { ...was, qty: was.qty + x.qty } : { typeId: id, name: x.name, qty: x.qty });
      }
      const list = [...merged.values()];
      setItems(list); setUnknown(missing); setBusy({ done: 0, total: list.length });
      await loadFlow();
      const mine = new Set(openOrders.map((o) => o.orderId));
      const out: Record<number, LootMarket | null> = {};
      let next = 0, done = 0;
      await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => {
        while (next < list.length) {
          const it = list[next++];
          try {
            const [book, h] = await Promise.all([jitaOrders(it.typeId), marketHistory(it.typeId).catch(() => [])]);
            const perDay = h.length ? paceDay(h) : null;
            out[it.typeId] = {
              // Your own orders aren't the market you'd list into.
              others: book.orders.filter((o) => !mine.has(o.id)),
              highs: h.length ? recentRange(h, FILL_WINDOW, Date.now(), watchedDays(it.typeId)).highs : null,
              perDay,
              buyers: tradingSplit({ history: h.length ? buyerShare(h.slice(-30)) : null, book: book.sold, watched: watchedFlow(it.typeId), typicalDay: perDay }).share,
            };
          } catch { out[it.typeId] = null; }
          setBusy({ done: ++done, total: list.length });
        }
      }));
      setMarkets(out); setReadAt(Date.now());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(null);
    }
  };

  const fromPaste = () => { const p = parseLoot(text); if (p.bad.length) toast(`${units(p.bad.length)} line${p.bad.length === 1 ? '' : 's'} didn’t read as an item and quantity.`, 'warn'); void read(p.rows); };
  const fromHangar = () => void read(Object.entries(d.stock?.jita ?? {}).filter(([, q]) => q > 0).map(([id, q]) => ({ typeId: Number(id), name: d.names[Number(id)] ?? `Item #${id}`, qty: q })));

  const calls = useMemo(() => planLoot(items.map((it) => judgeLoot(it, markets[it.typeId] ?? null, r, d.settings.share, d.settings.target / 100, heldFor.get(it.typeId))), free, included),
    [items, markets, r.f, r.t, d.settings.share, d.settings.target, heldFor, free, included]); // eslint-disable-line react-hooks/exhaustive-deps
  const by = (v: LootCall['verdict']) => calls.filter((c) => c.verdict === v);
  const listed = by('list'), toBids = by('bids'), noSlot = by('noSlot'), skipped = by('skip'), held = by('held');
  const sorted = useMemo(() => {
    const rank: Record<LootCall['verdict'], number> = { list: 0, noSlot: 1, bids: 2, skip: 3, held: 4 };
    return [...calls].sort((a, b) => rank[a.verdict] - rank[b.verdict] || (b.perSlotDay ?? b.bidsNet) - (a.perSlotDay ?? a.bidsNet));
  }, [calls]);
  const stale = readAt != null && now - readAt > 5 * 60_000;

  const copy = async () => {
    const block = importBlock(listed, mark);
    if (!block) return;
    try { await navigator.clipboard.writeText(block); toast(`Copied ${units(listed.length)} price${listed.length === 1 ? '' : 's'}: in the Sell window, Import prices from clipboard (${mark === 'point' ? 'Decimal Point' : 'Decimal Comma'}).`); }
    catch { toast('Your browser wouldn’t let the page copy.', 'err'); }
  };
  const toggle = (id: number) => setIncluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="page">
      <PageHead kicker="Loot" title="List loot"
        lede="Price your loot where it actually sells, list the best of it through the game's Sell window in one paste, and sell the rest into the bids. Items you hold a position on, or already sell, are left out unless you include them." />

      {!auth && <Notice kind="warn">Log in to read your orders and free order slots.</Notice>}

      <Panel title="Your loot" sub="Paste it from the game, or use what your last sync saw in your Jita hangar">
        <div className="col" style={{ gap: 10 }}>
          <label htmlFor="loot-paste" style={{ fontSize: 13, color: 'var(--body)' }}>
            In your hangar (list view) select the loot and press Ctrl+C, then paste here. The Sell window’s export works too.
          </label>
          <textarea id="loot-paste" className="num" rows={6} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'Positron Cord\t734\nScoped Compounds\t39\n…'} style={{ width: '100%', fontFamily: 'var(--f-mono)', resize: 'vertical' }} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" disabled={!!busy || !text.trim()} onClick={fromPaste}><ClipboardPaste aria-hidden="true" />{busy ? `Pricing ${busy.done} of ${busy.total}…` : 'Price these'}</button>
            <button type="button" className="btn" disabled={!!busy || !d.stock} onClick={fromHangar}
              data-tip="What your last sync saw loose in your Jita hangar. Items inside containers aren't in it: paste those from the game."><Warehouse aria-hidden="true" />Use my Jita hangar</button>
            {readAt != null && <button type="button" className="btn" disabled={!!busy} onClick={() => void read(items)}><RefreshCw aria-hidden="true" />Price again</button>}
          </div>
          {unknown.length > 0 && <p className="note small" style={{ margin: 0 }}>Not found by name: {unknown.join(', ')}.</p>}
        </div>
      </Panel>

      {!calls.length ? (
        <Empty icon={PackageOpen}>Nothing priced yet. Paste your loot above and press “Price these”.</Empty>
      ) : (
        <>
          <Tiles items={[
            { l: 'List', v: `${units(listed.length)} of ${units(free)} free slot${free === 1 ? '' : 's'}`, n: listed.length ? `${iskBig(listed.reduce((t, c) => t + (c.listNet ?? 0), 0))} when they sell` : 'Nothing worth a slot', c: 'var(--pos)',
              tip: `Your ${units(slots)} order slots, ${units(openOrders.length)} in use. The listings that gain most over the bids per day of the slot go first.` },
            { l: 'Sell into bids', v: units(toBids.length), n: toBids.length ? `${iskBig(toBids.reduce((t, c) => t + c.bidsNet, 0))} now, after tax` : '–', c: 'var(--acc)' },
            { l: 'Waiting for a slot', v: units(noSlot.length), n: noSlot.length ? 'Worth listing if you free a slot (Orders: Weakest slots)' : '–', c: 'var(--acc2)' },
            { l: 'Skip / left out', v: `${units(skipped.length)} / ${units(held.length)}`, n: held.length ? 'Left out: an open position or your own listing' : '–' },
          ]} />

          <Panel title="In game" sub={readAt != null ? `Priced ${ago(new Date(readAt).toISOString(), now)}${stale ? ': the book has moved since, price again before you sell' : ''}` : undefined}>
            <div className="col" style={{ gap: 12 }}>
              {stale && <Notice kind="warn">Prices are over five minutes old. Press “Price again” before pasting, so nothing lists under a bid that has moved up.</Notice>}
              <div className="col" style={{ gap: 6 }}>
                <b style={{ color: 'var(--ink)' }}><Tags aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: -2, color: 'var(--pos)' }} /> List these {units(listed.length)}</b>
                {listed.length ? (
                  <>
                    <p className="note small" style={{ margin: 0 }}>Select them in your hangar and press Sell, pick a duration, then Import prices from clipboard ({mark === 'point' ? 'Decimal Point' : 'Decimal Comma'}): {listed.map((c) => c.name).join(', ')}.</p>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn primary" onClick={() => void copy()}><ClipboardCopy aria-hidden="true" />Copy prices for the Sell window</button>
                      <Seg label="Number format" size="sm" value={mark} onChange={setMark} options={[{ v: 'point', label: 'Decimal point' }, { v: 'comma', label: 'Decimal comma' }]} />
                    </div>
                  </>
                ) : <p className="note small" style={{ margin: 0 }}>{free === 0 ? 'No free order slots: free some on Orders (Weakest slots), or sell into the bids.' : 'Nothing here gains enough over the bids to be worth a slot.'}</p>}
              </div>
              {toBids.length > 0 && (
                <div className="col" style={{ gap: 6 }}>
                  <b style={{ color: 'var(--ink)' }}>Sell these {units(toBids.length)} into the bids</b>
                  <p className="note small" style={{ margin: 0 }}>Select them, press Sell and choose Immediate: the window prices each at the bids, with no broker fee. {toBids.map((c) => c.name).join(', ')}.</p>
                </div>
              )}
            </div>
          </Panel>

          <section className="panel flush" data-rv="">
            <div className="tbl-scroll">
              <table className="tbl" style={{ minWidth: 980 }}>
                <thead><tr>
                  <th scope="col" className="l">Item</th><th scope="col" className="l">Verdict</th><th scope="col">Qty</th><th scope="col">List at</th>
                  <th scope="col" data-tip="What listing all of it gets when it sells, after the broker fee and sales tax">Listed gets</th>
                  <th scope="col" data-tip="What the standing bids pay for it now, after sales tax (no broker fee)">Bids pay now</th>
                  <th scope="col" data-tip="What listing gains over selling into the bids">Listing gains</th><th scope="col">Sells in</th>
                  <th scope="col" className="l">Include</th>
                </tr></thead>
                <tbody>
                  {sorted.map((c) => {
                    const V = VERDICT[c.verdict];
                    return (
                      <tr key={c.typeId} className={c.verdict === 'held' || c.verdict === 'skip' ? 'dim' : undefined}>
                        <td className="l"><span className="cellrow"><ItemIcon id={c.typeId} /><span className="name ellipsis">{c.name}</span></span></td>
                        <td className="l"><Flag color={V.c} title={V.label} why={c.why}>{V.label}</Flag></td>
                        <td>{units(c.qty)}</td>
                        <td>{c.listAt != null ? isk(c.listAt) : '–'}</td>
                        <td>{c.listNet != null ? iskBig(c.listNet) : '–'}</td>
                        <td>{c.bidsUnits > 0 ? <>{iskBig(c.bidsNet)}{c.bidsUnits < c.qty && <span className="sub">for {units(c.bidsUnits)}</span>}</> : '–'}</td>
                        <td style={{ color: c.gain != null && c.gain > 0 ? 'var(--pos)' : 'var(--cell)' }}>{c.gain != null ? iskBig(c.gain) : '–'}</td>
                        <td>{c.days != null ? (c.days < 1 ? `${Math.max(1, Math.round(c.days * 24))} h` : c.days > 365 ? 'over a year' : `${Math.round(c.days)} d`) : '–'}</td>
                        <td className="l">{heldFor.has(c.typeId)
                          ? <button type="button" className={'link-btn' + (included.has(c.typeId) ? '' : ' dim')} onClick={() => toggle(c.typeId)}
                              data-tip={heldFor.get(c.typeId) === 'position' ? 'You hold an open position on it, so it is left out. Include it to sell it here.' : 'You already have a sell order on it, so it is left out. Include it to list more.'}>
                              {included.has(c.typeId) ? 'Included' : 'Include'}
                            </button>
                          : <span className="faint">–</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <Guide title="How to use List loot" intro="Turn a hangar of loot into sell orders at prices that sell, without dumping it all into the bids."
        steps={[
          { icon: ClipboardPaste, title: 'Paste your loot', body: 'Select the loot in your hangar (list view), Ctrl+C, paste it here and press Price these.' },
          { icon: Tags, title: 'List the best', body: 'The items that gain most over the bids per day of a slot fill your free order slots. Copy their prices, select them in game, Sell, then Import prices from clipboard.' },
          { icon: PackageOpen, title: 'Dump the rest', body: 'What isn’t worth a slot goes into the bids: select it, Sell, Immediate.' },
        ]} />
    </div>
  );
}
