import { useMemo, useState } from 'react';
import { CalendarClock, Check, MapPin, Package, PackageCheck, RefreshCw, Scale, Search, Skull, Truck, ShoppingCart } from 'lucide-react';
import { rates } from '../lib/fees';
import { isk, iskBig, iskBigSigned, iskSigned, pct, units } from '../lib/format';
import { navigate } from '../lib/hooks';
import { jitaBook, publicContracts, regionHistory, resolveIds, stationBook } from '../lib/market';
import { paceDay } from '../lib/prospects';
import { buyerShare, tradingSplit } from '../lib/split';
import { marketBest } from '../lib/relist';
import { FILL_WINDOW, recentRange } from '../lib/fills';
import { loadCache } from '../lib/scan';
import { update, useData } from '../lib/store';
import { secureRoute, stationPlace, typeInfo, JITA_SYSTEM } from '../lib/universe';
import { GANK_SYSTEMS, goingRate, HUBS, priceHub, scanBusiest, shipment, type BuyMode, type HubQuote } from '../lib/arbitrage';
import { JITA_44, THE_FORGE } from '../lib/config';
import { toast } from '../lib/toast';
import { useEnsureNames, useTypeName, copyMultibuy } from './common';
import { flip } from './Prospects';
import { Busy, Empty, Guide, ItemIcon, NumChip, PageHead, Seg } from './ui';
import { ScanFreshness } from './ScanFreshness';
import { multibuy } from '../lib/combat';

type Haul = 'pushx' | 'own' | 'courier';
type Saved = { hub: string; haul: Haul; buy: BuyMode; quote: number | null; reward: number | null; delivery: number | null; sellDays: number | null; picked: Record<string, number[]> };
const KEY = 'jita-ledger:arbitrage';
const DEFAULTS: Saved = { hub: 'Amarr', haul: 'pushx', buy: 'sells', quote: null, reward: null, delivery: null, sellDays: 3, picked: {} };
function readSaved(): Saved {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULTS; }
}
/** How many items to price per hub: two requests each at the hub, so this keeps a check to a minute. */
const CANDIDATES = 40;

type Place = { stationId: number; regionId: number; systemId: number; jumps: number | null; gank: string[] };
type Loaded = { at: number; place: Place; quotes: HubQuote[] };
const loaded = new Map<string, Loaded>();

async function placeOf(hub: string): Promise<Place> {
  const { stationId } = HUBS.find((h) => h.name === hub)!;
  const [ids, p] = await Promise.all([resolveIds(GANK_SYSTEMS), stationPlace(stationId)]);
  const route = await secureRoute(JITA_SYSTEM, p.systemId).catch(() => null);
  const gankIds = new Map((ids.systems ?? []).map((s) => [s.id, s.name]));
  return {
    stationId, regionId: p.regionId, systemId: p.systemId,
    jumps: route ? route.length - 1 : null,
    gank: route ? route.filter((id) => gankIds.has(id)).map((id) => gankIds.get(id)!) : [],
  };
}

export function Arbitrage() {
  const d = useData();
  const name = useTypeName();
  const r = rates(d.settings);
  const [s, setS] = useState<Saved>(readSaved);
  const set = (p: Partial<Saved>) => setS((cur) => { const n = { ...cur, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* private window */ } return n; });
  const [data, setData] = useState<Loaded | null>(() => loaded.get(s.hub) ?? null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [going, setGoing] = useState<{ rate: number | null; n: number } | null>(null);
  const [goingBusy, setGoingBusy] = useState(false);

  /** `fresh` when someone asked to price again: the browser's HTTP cache would otherwise answer. */
  async function load(hub = s.hub, fresh = false) {
    setBusy({ done: 0, total: 0 });
    try {
      const place = await placeOf(hub);
      const cache = await loadCache();
      // The busiest items from the last scan, plus everything you trade or watch.
      const busiest = scanBusiest(cache.stats, cache.books, CANDIDATES);
      const mine = [...d.positions.filter((p) => p.status === 'open').map((p) => p.typeId), ...d.watchlist.map((w) => w.typeId)];
      const ids = [...new Set([...busiest, ...mine])];
      if (!ids.length) { setData({ at: Date.now(), place, quotes: [] }); loaded.set(hub, { at: Date.now(), place, quotes: [] }); return; }
      setBusy({ done: 0, total: ids.length });
      const quotes: HubQuote[] = [];
      let i = 0, done = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (i < ids.length) {
          const id = ids[i++];
          try {
            const cached = cache.books[id];
            const useCache = !fresh && cached && Date.now() - Date.parse(cached.at) < 60 * 60_000;
            const [hub2, hist, info, jita] = await Promise.all([
              stationBook(id, place.regionId, place.stationId, fresh),
              regionHistory(id, place.regionId).catch(() => []),
              typeInfo(id),
              useCache ? Promise.resolve(null) : jitaBook(id, fresh),
            ]);
            const jb = useCache ? cached : jita!;
            quotes.push({
              typeId: id, m3: info.packagedVolume ?? info.volume,
              jitaBestBuy: marketBest(jb.topBuys, true), jitaBestSell: marketBest(jb.topSells, false),
              // Listing at the hub is a price you act on, so one fat-fingered order can't set it.
              hubBestSell: marketBest(hub2.topSells, false),
              hubBestBuy: marketBest(hub2.topBuys, true),
              hubHighs: hist.length ? recentRange(hist, FILL_WINDOW, Date.now()).highs : null,
              hubUnitsPerDay: paceDay(hist),
              // Who buys at the hub: what its live orders have sold, before history's guess.
              hubBuyers: tradingSplit({ history: hist.length ? buyerShare(hist.slice(-30)) : null, book: hub2.sold }).share,
            });
          } catch { /* priced next time */ }
          setBusy({ done: ++done, total: ids.length });
        }
      }));
      const out = { at: Date.now(), place, quotes };
      loaded.set(hub, out);
      setData(out);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(null);
    }
  }

  const sellDays = Math.max(0.25, s.sellDays ?? 3);
  const rows = useMemo(() => (data?.quotes ?? [])
    .map((q) => priceHub(q, s.buy, r, d.settings.share, sellDays))
    .filter((x): x is NonNullable<typeof x> => !!x && x.lot >= 1)
    .sort((a, b) => b.gross / b.cost - a.gross / a.cost), [data, s.buy, r.f, r.t, d.settings.share, sellDays]); // eslint-disable-line react-hooks/exhaustive-deps
  useEnsureNames(rows.map((x) => x.typeId));
  const picked = s.picked[s.hub] ?? rows.slice(0, 5).map((x) => x.typeId);
  const chosen = rows.filter((x) => picked.includes(x.typeId));
  const place = data?.place;
  const ownCost = place?.jumps != null ? place.jumps * 2 * d.prefs.perJump : null;
  const haul = s.haul === 'pushx' ? s.quote : s.haul === 'own' ? ownCost : s.reward;
  const ship = shipment(chosen, haul ?? 0, s.delivery ?? 0);
  const toggle = (id: number) => set({ picked: { ...s.picked, [s.hub]: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] } });

  async function findGoing() {
    if (!place) return;
    setGoingBusy(true);
    try {
      const all = await publicContracts(THE_FORGE);
      const lanes = all.filter((c) => c.type === 'courier' && c.start_location_id === JITA_44 && c.end_location_id === place.stationId && (c.volume ?? 0) > 0)
        .map((c) => ({ reward: c.reward ?? 0, volume: c.volume ?? 0 }));
      setGoing({ rate: goingRate(lanes), n: lanes.length });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setGoingBusy(false);
    }
  }

  const ready = haul != null && haul >= 0 && chosen.length > 0;
  const tiles = [
    { l: 'Cargo', v: `${units(Math.round(ship.m3))} m³`, n: `${chosen.length} item${chosen.length === 1 ? '' : 's'}` },
    { l: 'Collateral', v: iskBig(ship.collateral), n: 'What you pay in Jita — the hauler holds this' },
    { l: 'Haul cost', v: haul == null ? '–' : iskBig(haul), n: s.haul === 'pushx' ? (s.quote != null ? 'Your PushX quote' : 'Paste PushX’s quote above') : s.haul === 'own' ? (place?.jumps != null ? `${place.jumps * 2} jumps at your ${iskBig(d.prefs.perJump)} each` : 'Route unknown') : s.reward != null ? 'Your courier reward' : 'Set a reward above', c: 'var(--acc2)' },
    { l: 'Net profit', v: ready ? iskBigSigned(ship.net) : '–', n: 'After both hubs’ fees, sales tax and hauling', c: ready ? (ship.net >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined },
    { l: 'Return', v: ready && ship.collateral ? pct(ship.roi, 1) : '–', n: 'On the collateral', c: ready ? (ship.net >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined },
    { l: 'Return / day', v: ready && ship.collateral ? pct(ship.roiPerDay, 2) : '–', n: `Delivery ${s.delivery != null ? flip(s.delivery) : 'not set'} + selling ${flip(Math.max(0, ...chosen.map((x) => (Number.isFinite(x.sellDays) ? x.sellDays : 0))))}`, c: 'var(--acc)' },
  ];

  return (
    <div className="page">
      <PageHead
        kicker="02c · Buy here, sell there" title="Hub arbitrage" wide
        lede="Items that sell for more in another trade hub than they cost in Jita, after both hubs’ fees, sales tax and getting them there. Build a shipment, price it with PushX, your own hauler or a public courier, and see what it really clears."
      />
      <ScanFreshness what="the candidate list" />
      <div className="chipbar" data-rv="" style={{ gap: 16 }}>
        <span className="row tight"><span className="lbl">Sell in</span>
          <Seg label="Destination hub" value={s.hub} onChange={(v) => { set({ hub: v }); setData(loaded.get(v) ?? null); setGoing(null); }} options={HUBS.map((h) => ({ v: h.name, label: h.name }))} />
        </span>
        <span className="row tight"><span className="lbl">Haul with</span>
          <Seg label="How it gets there" value={s.haul} onChange={(v) => set({ haul: v })} options={[{ v: 'pushx' as const, label: 'PushX' }, { v: 'own' as const, label: 'Fly it myself' }, { v: 'courier' as const, label: 'Public courier' }]} />
        </span>
        <span className="row tight"><span className="lbl">In Jita</span>
          <Seg label="How you buy in Jita" value={s.buy} onChange={(v) => set({ buy: v })} options={[{ v: 'sells' as const, label: 'Buy from sell orders now' }, { v: 'order' as const, label: 'Place a buy order' }]} />
        </span>
        <NumChip label="Sell within, days" value={s.sellDays} onChange={(v) => set({ sellDays: v })} width={48} decimals={1} tip="Caps each lot at what the hub takes in this many days at your share of its volume" />
      </div>

      {busy ? (
        <Busy title={`Pricing ${s.hub} against Jita`} done={busy.done} total={busy.total} sub="Two requests per item at the hub: its book and its history." />
      ) : !data ? (
        <Empty icon={Search} action={<button type="button" className="btn primary" onClick={() => load()}><RefreshCw aria-hidden="true" />Price {s.hub}</button>}>
          Prices the busiest items from your last Prospects scan, plus your positions and watchlist, in {s.hub} against Jita. About {CANDIDATES} items, two requests each.
        </Empty>
      ) : !data.quotes.length ? (
        <Empty icon={Search} action={<button type="button" className="btn primary" onClick={() => navigate('prospects')}>Scan on Prospects</button>}>
          Nothing to price: this needs a Prospects scan, a watchlist or positions to know which items to look at.
        </Empty>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <section className="panel flush" data-rv="" style={{ flex: '999 1 640px', minWidth: 0 }}>
            <div className="panel-bar">
              <span className="note small">{rows.length} of {data.quotes.length} items clear a profit before hauling. Priced {new Date(data.at).toISOString().slice(11, 16)} EVE.</span>
              <button type="button" className="link-btn" onClick={() => load(s.hub, true)}><RefreshCw aria-hidden="true" />Price again</button>
            </div>
            {!rows.length ? <p className="note" style={{ padding: 16 }}>Nothing is cheaper in Jita than it sells for in {s.hub} after fees and tax right now.</p> : (
              <div className="tbl-scroll">
                <table className="tbl" style={{ minWidth: 1000 }}>
                  <thead><tr>
                    <th scope="col"><span className="sr-only">In shipment</span></th>
                    <th scope="col" className="l">Item</th><th scope="col">m³</th><th scope="col">Jita cost</th><th scope="col">Hub sell</th>
                    <th scope="col" data-tip="Per unit after the hub’s broker fee and sales tax, before hauling">Gross / unit</th>
                    <th scope="col" data-tip="Hauling spread over the shipment by volume">Haul / unit</th>
                    <th scope="col">Lot</th><th scope="col">Gross for lot</th>
                    <th scope="col" data-tip="At your share of the buyers in the hub’s region">Sells in</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((x) => {
                      const on = picked.includes(x.typeId);
                      return (
                        <tr key={x.typeId} className={'click' + (on ? ' chosen' : '')} onClick={() => toggle(x.typeId)}>
                          <td><button type="button" className="tn-box" role="checkbox" aria-checked={on} aria-label={`Carry ${name(x.typeId)}`} onClick={(e) => { e.stopPropagation(); toggle(x.typeId); }} style={{ width: 20, height: 20 }}><Check aria-hidden="true" /></button></td>
                          <td className="l"><span className="cellrow"><ItemIcon id={x.typeId} /><span className="name ellipsis">{name(x.typeId)}</span></span></td>
                          <td style={{ color: 'var(--sec)' }}>{x.m3 < 1 ? x.m3.toFixed(2) : units(x.m3)}</td>
                          <td>{isk(x.cost)}</td>
                          <td style={{ color: 'var(--neg-t)' }}>{isk(x.listAt)}</td>
                          <td><span style={{ display: 'block', color: 'var(--pos)' }}>{iskSigned(x.gross)}</span><span style={{ display: 'block', fontSize: 11, color: 'var(--note)' }}>{pct(x.gross / x.cost, 1)}</span></td>
                          <td style={{ color: 'var(--acc2)' }}>{on && haul != null && ship.m3 ? isk(ship.haulPerUnit[x.typeId]) : '–'}</td>
                          <td>{units(x.lot)}</td>
                          <td style={{ color: 'var(--pos)' }}>{iskBig(x.lot * x.gross)}</td>
                          <td style={{ color: 'var(--sec)' }}>{flip(x.sellDays)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="note small" style={{ padding: '10px 14px' }}>
              {ship.m3 && haul != null ? `Hauling works out at ${isk(haul / ship.m3)} per m³ — small, dense items carry it best. ` : 'Pick items to build a shipment. '}
              Lots are capped at what the hub’s region trades in {flip(sellDays)} at your {d.settings.share}% share. Click a row to add or remove it.
            </p>
          </section>
          <aside className="panel" data-rv="" aria-label="Shipment" style={{ flex: '1 1 300px', maxWidth: 400, gap: 12 }}>
            <div className="panel-title">Shipment</div>
            {s.haul === 'pushx' && (
              <div className="col" style={{ gap: 8 }}>
                <div className="lbl row tight"><PackageCheck aria-hidden="true" style={{ width: 14, height: 14 }} />PushX quote</div>
                <NumChip label="ISK" value={s.quote} onChange={(v) => set({ quote: v })} width={140} decimals={0} placeholder="Paste the quote" />
                <p className="note small">PushX prices by volume, collateral and route. Put {units(Math.round(ship.m3))} m³ and {iskBig(ship.collateral)} collateral into their quote page and paste the figure here — nothing is estimated for you.</p>
              </div>
            )}
            {s.haul === 'own' && (
              <div className="col" style={{ gap: 8, fontSize: 12.5, color: 'var(--sec)' }}>
                <span>{place?.jumps != null ? `${place.jumps} jumps each way on the safest route, at your ${iskBig(d.prefs.perJump)} per jump.` : 'No high-sec route found to this hub.'}</span>
                <NumChip label="Your time per jump" value={d.prefs.perJump} onChange={(v) => update((x) => ({ prefs: { ...x.prefs, perJump: v ?? 0 } }))} width={100} decimals={0} tip="The same figure as on the Hauling tab" />
                {place && place.gank.length > 0 && (
                  <div className="row tight" style={{ color: 'var(--neg-l)' }}><Skull aria-hidden="true" style={{ width: 14, height: 14 }} />
                    The route runs through {place.gank.join(' and ')}. Carrying {iskBig(ship.collateral)} there is only safe below your hull’s gank line — see Hauling.
                  </div>
                )}
              </div>
            )}
            {s.haul === 'courier' && (
              <div className="col" style={{ gap: 8 }}>
                <NumChip label="Reward" value={s.reward} onChange={(v) => set({ reward: v })} width={130} decimals={0} placeholder="Your offer" />
                {going ? (
                  <p className="note small">
                    {going.rate == null ? `No public couriers from Jita 4-4 to ${s.hub} up right now to compare against.`
                      : <>Going rate on {going.n} public couriers Jita 4-4 → {s.hub}: {isk(going.rate)} per m³, or {iskBig(going.rate * ship.m3)} for this cargo. <button type="button" className="link-btn" onClick={() => set({ reward: Math.round(going.rate! * ship.m3) })}>Use it</button></>}
                  </p>
                ) : (
                  <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} disabled={goingBusy} onClick={findGoing}><Search aria-hidden="true" />{goingBusy ? 'Reading public contracts…' : 'Find the going rate'}</button>
                )}
                <p className="note small">What you’ll offer on a public courier contract. Cheaper than PushX, but it may sit untaken — and you’re trusting a stranger with the collateral.</p>
              </div>
            )}
            {s.buy === 'sells' && chosen.length > 0 && (
              <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }}
                onClick={() => void copyMultibuy(multibuy(chosen.map((x) => ({ name: name(x.typeId), qty: x.lot }))), chosen.length, ship.collateral)}
                data-tip={'Copies the shipment for the Multibuy window (in Jita: Multibuy, Import from clipboard), which buys it all at once from the cheapest listings.\n\n• It has no price limit, so check its total against the one here before you press Buy: a book that moved shows there.\n• Only for buying from sell orders now; a buy order can’t go through Multibuy.'}>
                <ShoppingCart aria-hidden="true" />Copy the shipment for Multibuy
              </button>
            )}
            <NumChip label="Delivery, days" value={s.delivery} onChange={(v) => set({ delivery: v })} width={60} decimals={1} tip="How long until it’s listed at the hub. Added to selling time for the return per day." />
            <div>
              {tiles.map((t) => (
                <div key={t.l} className="lrow">
                  <span><span className="lbl" style={{ display: 'block' }}>{t.l}</span><span className="ls">{t.n}</span></span>
                  <span className="lv" style={{ fontSize: 15, color: t.c ?? 'var(--figure)' }}>{t.v}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      <Guide
        title="How to use Hub arbitrage"
        intro="Buy in Jita, sell in another hub where the item is dearer. The profit only counts once hauling is paid for, so the shipment panel does the real sums."
        steps={[
          { icon: MapPin, title: 'Pick a destination hub', body: 'Each hub prices things differently. Amarr is the busiest after Jita; Dodixie, Rens and Hek are smaller. Sales speed is read from the hub’s whole region, which is mostly the hub.' },
          { icon: Package, title: 'Build a shipment', body: 'Tick the items you’d carry. Small, dense, valuable items carry hauling costs best — look at haul per unit.' },
          { icon: Truck, title: 'Choose how it gets there', body: 'PushX is the safe default: paste the quote from their site for an exact cost. Flying it yourself costs your time and risks a gank. A public courier is cheapest, but it may sit untaken.' },
          { icon: CalendarClock, title: 'Judge by return per day', body: 'The shipment panel adds delivery time to selling time. A big profit that takes two weeks can be worse than a Jita flip.' },
        ]}
        habits={[
          { icon: Skull, title: 'Collateral is what gankers see', body: 'A fat cargo through Uedama or Sivala in a weak hull is bait. That’s what PushX is for.', color: '#ff8d9a' },
          { icon: Scale, title: 'Don’t flood a small hub', body: 'Lots are capped at a few days of the hub’s volume. Sending more just means competing with yourself.', color: 'var(--acc2)' },
        ]}
      />
    </div>
  );
}
