import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgePercent, Coins, ListOrdered, MonitorUp, Search, Store, Tag } from 'lucide-react';
import { getAuth, hasScope } from '../lib/auth';
import { CALDARI_NAVY, SCOPE } from '../lib/config';
import { rates } from '../lib/fees';
import { isk, iskBig, parseISK, plainNum, units } from '../lib/format';
import { navigate } from '../lib/hooks';
import { loyaltyPoints, openMarketWindow, resolveNames } from '../lib/market';
import {
  byIskPerLp, daysToClear, instantPrice, LAZY_DAYS, LAZY_WARN_DAYS, lazyPicks, notesFor, patientPrice, planFor, spendPlan, valueOffer,
  type LpNote, type LpOffer, type LpPlan, type LpValue, type Quote, type UnitPrice,
} from '../lib/loyalty';
import { median } from '../lib/prospects';
import { PRICE_TOP, priceRest, priceStore, sellPerDay } from '../lib/lpStore';
import { tickDown } from '../lib/tick';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import { OpenInGame, useTypeName, canOpenInGame } from './common';
import { flip } from './Prospects';
import { Check, cssVars, Expander, Guide, ItemIcon, Notice, PageHead, SortTh, Tip } from './ui';

const LOYALTY_SCOPE = SCOPE.loyalty;
/** How many of the best-looking offers get real Jita prices rather than a global average. */
/** Rows shown. Past this the rate is poor enough that the rest is noise. */
const SHOW = 60;

const TIPS: Record<string, string> = {
  rate: 'What each loyalty point is worth if you take this offer: the profit divided by the points it costs. Points are the scarce thing, so this ranks the list.',
  instant: 'The same rate if you dump the goods into the standing buy orders the moment you get them instead of listing and waiting.',
  outlay: 'The loyalty points, the store’s own ISK price, and the cost of buying any items the offer demands first.',
  revenue: 'What the offer hands over, and what selling it would really net you after broker fee and sales tax.',
  profit: 'What is left once everything you paid is taken off what you got.',
  days: 'How many of these change hands at Jita on an average day, and how long one purchase would take to sell.\n\n• A sell order only fills from buyers taking listings. The day’s count also includes sellers dumping into buy orders, so only the buyers’ part is used, estimated from where each day’s average sits between its low and high.\n• Of that, you get your share (Settings).',
  total: 'How many times to buy this offer, capped by what can actually be sold inside the time you allowed.',
};

export const NOTE: Record<LpNote, { short: string; why: string; bad?: boolean }> = {
  loss: { short: 'Loses money', why: 'The goods are worth less than the offer costs. Taking it would turn loyalty points into a loss.', bad: true },
  topRate: { short: 'Best rate', why: 'Well above the typical rate in this store — half again or better. This is where the points are worth spending.' },
  poorRate: { short: 'Poor rate', why: 'Under half the typical rate in this store. The same points do far better further up this list.' },
  fast: { short: 'Sells fast', why: 'One purchase sells within a day at your usual share of the buyers, so the ISK comes back quickly and you can go round again.' },
  slow: { short: 'Slow to sell', why: 'More than a week to sell what one purchase gives you, at your usual share of the buyers. Fine once; not something to repeat.', bad: true },
  illiquid: { short: 'Barely trades', why: 'No recent trading history to judge by. The price may be real, but there may be nobody to sell to.', bad: true },
  needsItems: { short: 'Buy items first', why: 'A quarter or more of what you get back goes on the items the store demands before it will trade. You have to front that ISK, and those prices can move against you.' },
  capped: { short: 'Market-limited', why: 'Your points could buy this more times than the market will take in the time you allowed.' },
  capitalHeavy: { short: 'Ties up ISK', why: 'Most of what you get back is money you had to put in first. Your ISK is committed until the goods sell.' },
  unpriced: { short: 'Cost incomplete', why: 'Something this offer demands could not be priced, so what you pay is understated and the profit shown is too high.', bad: true },
  rough: { short: 'Rough price', why: 'Valued on a global average rather than the live Jita book, because only the best offers get priced properly.' },
  patienceMatters: { short: 'Worth listing', why: 'Selling into the standing buy orders gets less than half what listing does. This one wants an order and some patience.' },
};

type Row = { v: LpValue; instant: LpValue | null; notes: LpNote[]; plan: LpPlan; live: boolean; perDay: number | null; sellDay: number | null; runDays: number };
type SortKey = 'name' | 'rate' | 'instant' | 'outlay' | 'revenue' | 'profit' | 'days' | 'total';
const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = { name: 'asc', rate: 'desc', instant: 'desc', outlay: 'asc', revenue: 'desc', profit: 'desc', days: 'asc', total: 'desc' };

export function Loyalty() {
  const d = useData();
  const nameOf = useTypeName();
  const auth = getAuth();
  const [balances, setBalances] = useState<{ corporationId: number; points: number }[] | null>(d.meta.lpBalances ?? null);
  const [corp, setCorp] = useState<number>(CALDARI_NAVY);
  const [manualLp, setManualLp] = useState('');
  const [offers, setOffers] = useState<LpOffer[] | null>(null);
  const [quotes, setQuotes] = useState<Record<number, Quote>>({});
  const [live, setLive] = useState<Set<number>>(new Set());
  const [vol, setVol] = useState<Record<number, number | null>>({});
  const [buyers, setBuyers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  /** The second pass, pricing the rest of the store in the background. */
  const [more, setMore] = useState<string | null>(null);
  const pass = useRef(0);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [hideLosses, setHideLosses] = useState(true);
  const [horizon, setHorizon] = useState('7');
  const [iskText, setIskText] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rate', dir: 'desc' });
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] }));

  const r = rates(d.settings);
  const canRead = hasScope(LOYALTY_SCOPE);
  const days = Math.max(1, parseFloat(horizon) || 1);
  const iskCap = iskText.trim() ? parseISK(iskText) : Infinity;

  // Loyalty balances, when the character will tell us.
  useEffect(() => {
    if (!auth || !canRead) return;
    let alive = true;
    loyaltyPoints(auth.characterId)
      .then(async (b) => {
        if (!alive || !b.length) return;
        setBalances(b);
        update((x) => ({ meta: { ...x.meta, lpBalances: b } }));
        if (!b.some((x) => x.corporationId === CALDARI_NAVY)) setCorp(b[0].corporationId);
        const missing = b.map((x) => x.corporationId).filter((id) => !d.names[id]);
        if (!missing.length) return;
        const n = await resolveNames(missing).catch(() => ({}));
        if (alive && Object.keys(n).length) update((x) => ({ names: { ...x.names, ...n } }));
      })
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.characterId, canRead]);

  const held = balances?.find((b) => b.corporationId === corp)?.points ?? 0;
  const lp = held || Math.max(0, parseFloat(manualLp.replace(/[^0-9.]/g, '')) || 0);

  // Names for everything on show. The Jita pass only names what it prices.
  useEffect(() => {
    if (!offers) return;
    const missing = [...new Set(offers.map((o) => o.typeId))].filter((id) => !d.names[id]).slice(0, 500);
    if (!missing.length) return;
    let alive = true;
    resolveNames(missing).then((n) => { if (alive && Object.keys(n).length) update((x) => ({ names: { ...x.names, ...n } })); }).catch(() => undefined);
    return () => { alive = false; };
  }, [offers, d.names]);

  const load = useCallback(async () => {
    setBusy('Reading the store…'); setOpen(null);
    const mine = ++pass.current;
    try {
      const p = await priceStore(corp, lp, r, (done, total) => setBusy(`Pricing ${done} of ${total} against Jita…`));
      setOffers(p.offers); setQuotes(p.quotes); setLive(p.live); setVol(p.vol); setBuyers(p.buyers);
      setBusy(null);
      // Then everything else that looks worth taking, in the background: the table and the lazy picks
      // fill in with live prices and paces as it goes. A newer look-up makes this one stand down.
      setMore('Pricing the rest of the store…');
      const rest = await priceRest(p, lp, r, (done, total) => { if (pass.current === mine) setMore(`Pricing the rest against Jita: ${done} of ${total}…`); });
      if (pass.current === mine) { setQuotes(rest.quotes); setLive(rest.live); setVol(rest.vol); setBuyers(rest.buyers); }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(null);
      if (pass.current === mine) setMore(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corp, lp, r.f, r.t]);

  const all = useMemo<Row[]>(() => {
    if (!offers) return [];
    const patient = (id: number) => (quotes[id] ? patientPrice(quotes[id], r.f, r.t) : null);
    const instant = (id: number): UnitPrice | null => (quotes[id] ? instantPrice(quotes[id], r.t) : null);
    const valued = offers.map((o) => ({ o, v: valueOffer(o, patient, lp) })).filter((x): x is { o: LpOffer; v: LpValue } => !!x.v);
    const medianRate = median(valued.filter((x) => x.v.profit > 0).map((x) => x.v.iskPerLp));
    return valued.map(({ o, v }) => {
      const inst = valueOffer(o, instant, lp);
      const isLive = live.has(v.typeId);
      const perDay = vol[v.typeId] ?? null;
      // What sells store goods is buyers taking listings, not the whole volume.
      const sellDay = sellPerDay({ vol, buyers }, v.typeId);
      const plan = planFor(v, sellDay, days, d.settings.share);
      const runDays = daysToClear(v.quantity, sellDay, d.settings.share);
      return { v, instant: inst, live: isLive, plan, perDay, sellDay, runDays, notes: notesFor(v, { medianRate, plan, runDays, live: isLive, instantPerLp: inst?.iskPerLp ?? null }) };
    });
  }, [offers, quotes, live, vol, buyers, lp, r.f, r.t, days, d.settings.share]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keep = (hideLosses ? all.filter((x) => x.v.profit > 0) : all)
      .filter((x) => !needle || nameOf(x.v.typeId).toLowerCase().includes(needle));
    const val = (x: Row): number => {
      switch (sort.key) {
        case 'rate': return x.v.iskPerLp;
        case 'instant': return x.instant?.iskPerLp ?? -Infinity;
        case 'outlay': return x.v.outlay;
        case 'revenue': return x.v.revenue;
        case 'profit': return x.v.profit;
        case 'days': return x.runDays;
        case 'total': return x.plan.profit;
        default: return 0;
      }
    };
    const sorted = [...keep].sort((a, b) => (sort.key === 'name' ? nameOf(a.v.typeId).localeCompare(nameOf(b.v.typeId)) : val(a) - val(b) || nameOf(a.v.typeId).localeCompare(nameOf(b.v.typeId))));
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, sort, hideLosses, d.names, q]);

  // All the points on one item, listed as one sell order and left alone.
  const lazy = useMemo(() => lazyPicks(
    all.filter((x) => x.live && x.sellDay != null).map((x) => ({
      v: x.v,
      sideUnitsPerDay: x.sellDay,
      listAt: tickDown(quotes[x.v.typeId]?.bestSell ?? NaN),
    })),
    d.settings.share, lp,
  ), [all, quotes, lp, d.settings.share]);

  const profitable = all.filter((x) => x.v.profit > 0).length;
  const best = [...all].sort((a, b) => byIskPerLp(a.v, b.v)).find((x) => x.v.profit > 0);
  // Best rate first, until the market, the points or the ISK run out. Only live-priced offers with a
  // trading history: a plan built on a global average and an unknown pace spends on paper.
  const spend = useMemo(
    () => (lp > 0 ? spendPlan(all.filter((x) => x.live && x.plan.absorbable != null).map((x) => ({ v: x.v, unitsAllowed: (x.plan.absorbable ?? 0) * x.v.quantity })), lp, Number.isFinite(iskCap) ? iskCap : Infinity) : []),
    [all, lp, iskCap],
  );
  const spendTotal = spend.reduce((t, p) => t + p.profit, 0);
  const spentLp = spend.reduce((t, p) => t + p.lpSpent, 0);
  const spentIsk = spend.reduce((t, p) => t + p.iskSpent, 0);

  // Keep the realistic rate for the Wallet's net worth: what the plan turns a point into, not the
  // headline best, and how many points the plan could actually place. Points beyond that have no
  // market in the plan's own terms, so the Wallet doesn't value them at this rate.
  useEffect(() => {
    if (!spentLp || !live.size) return;
    const rate = spendTotal / spentLp;
    update((x) => ({ meta: { ...x.meta, lpRate: { ...x.meta.lpRate, [corp]: { rate, lp: spentLp, at: new Date().toISOString() } } } }));
  }, [spendTotal, spentLp, live.size, corp]);

  const corpName = (id: number) => d.names[id] ?? (id === CALDARI_NAVY ? 'Caldari Navy' : `Corporation #${id}`);

  return (
    <div className="page">
      <PageHead
        kicker="07 · LP store" title="Loyalty" wide
        lede="What your loyalty points are worth in ISK, and which offer to spend them on. Every offer is costed in full — points, the store’s ISK price, and any items it demands — and ranked per point, because points are the scarce thing."
        actions={<button type="button" className="btn primary" style={{ height: 40, minWidth: 200 }} disabled={!!busy} onClick={load}><BadgePercent aria-hidden="true" />{busy ?? (offers ? 'Check again' : 'Look up the store')}</button>}
      />

      <div className="chipbar" data-rv="">
        <span className="chipbar-title"><Store aria-hidden="true" />Store</span>
        <label htmlFor="lp-corp" className="chip h34" data-tip="Every corporation you hold points with">
          <img src={`https://images.evetech.net/corporations/${corp}/logo?size=32`} alt="" style={{ width: 20, height: 20, margin: '0 2px 0 8px' }} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          <select id="lp-corp" value={corp} onChange={(e) => { setCorp(Number(e.target.value)); setOffers(null); }} style={{ borderLeft: 0, minWidth: 220 }}>
            {!balances?.some((b) => b.corporationId === CALDARI_NAVY) && <option value={CALDARI_NAVY}>Caldari Navy</option>}
            {balances?.map((b) => <option key={b.corporationId} value={b.corporationId}>{corpName(b.corporationId)} — {units(b.points)} LP</option>)}
          </select>
        </label>
        <label htmlFor="lp-have" className="chip h34" data-tip={held > 0 ? 'Your balance with this corporation' : 'Type a figure to see what it would be worth'}>
          <span className="cl">Points</span>
          <input id="lp-have" type="text" inputMode="numeric" value={held ? units(held) : manualLp} disabled={held > 0} placeholder="e.g. 250000"
            onChange={(e) => setManualLp(e.target.value)} style={{ width: 110, color: held ? 'var(--acc2)' : undefined }} />
        </label>
        <label htmlFor="lp-h" className="chip h34" data-tip={`Caps how many times you buy each offer at what the market will take, at ${plainNum(d.settings.share)}% of the buyers taking listings each day`}>
          <span className="cl">Sell within, days</span>
          <input id="lp-h" type="text" inputMode="decimal" value={horizon} onChange={(e) => setHorizon(e.target.value)} style={{ width: 56 }} />
        </label>
        <label htmlFor="lp-isk" className="chip h34" data-tip="Store ISK and any items an offer demands come out of this. Leave it empty for no limit.">
          <span className="cl">ISK to put in</span>
          <input id="lp-isk" type="text" inputMode="decimal" value={iskText} placeholder="no limit" onChange={(e) => setIskText(e.target.value)} style={{ width: 160 }} />
        </label>
        <Check checked={hideLosses} onChange={setHideLosses} tip="Most of a store’s offers lose money">Hide losing offers</Check>
      </div>

      {!canRead && (
        <Notice kind="warn">Add <code>esi-characters.read_loyalty.v1</code> to your application on developers.eveonline.com and log in again to have your point balances read for you. The store itself is public, so everything else here works without it — type a figure in and it will do the sums.</Notice>
      )}
      {busy && (
        <div role="status" className="busy" style={{ gap: 14 }}>
          <span className="spinner keep-motion" style={{ width: 22, height: 22 }} />
          <span className="busy-t">{busy}</span>
        </div>
      )}

      {!offers ? (
        <div data-rv="" style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--label)', border: '1px dashed var(--line-strong)' }}>
          <BadgePercent aria-hidden="true" style={{ width: 34, height: 34, color: 'var(--void)' }} />
          <p style={{ margin: '12px auto 0', maxWidth: 620, textWrap: 'pretty' }}>
            Nothing looked up yet. Pick a store and press <b style={{ color: 'var(--figure)' }}>Look up the store</b>. Every offer is ranked on a rough
            global price, then the best {PRICE_TOP} are priced properly against the live Jita book — a few seconds in all.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
          <div className="col" style={{ flex: '1 1 320px', minWidth: 0, gap: 14 }}>
          <section data-rv="" style={{ minWidth: 0, position: 'relative', padding: 18, overflow: 'hidden', background: 'linear-gradient(160deg,color-mix(in oklab,var(--acc2) 12%,rgba(7,13,21,.92)),rgba(7,13,21,.92) 60%)', border: '1px solid color-mix(in oklab,var(--acc2) 35%,transparent)', clipPath: 'var(--cut)' }}>
            <div className="hero-l" style={{ color: 'var(--acc2)' }}>
              Spend it like this
              <Tip title="Spend it like this" text={'How to spend your points for the most ISK:\n\n• the best rate first, as many times as its buyers will take in the days you allowed, at your share of the buyers taking listings;\n• then the next best, until the points or the ISK run out.\n\nOnly offers priced against the live Jita book, with a trading history to judge the pace by, are used.'} />
            </div>
            {!spend.length ? (
              <p className="note" style={{ marginTop: 10 }}>{lp > 0 ? 'Nothing priced against the live book is worth taking with these points and this much ISK.' : 'Type how many points you have, or log in with the loyalty scope, and this becomes a plan.'}</p>
            ) : (
              <>
                <div className="mono" style={{ fontSize: 34, color: 'var(--pos)', marginTop: 8, textShadow: '0 0 24px rgba(110,231,168,.3)' }}>{iskBig(spendTotal)}</div>
                <p style={{ margin: '4px 0 14px', fontSize: 12.5, color: '#9fb3c5', textWrap: 'pretty' }}>
                  {units(spentLp)} of {units(lp)} points across {spend.length} offer{spend.length === 1 ? '' : 's'} turns into about that much profit — {units(Math.round(spendTotal / spentLp))} ISK a point overall, selling over the next {plainNum(days)} days.
                </p>
                <p style={{ margin: '-8px 0 12px', fontSize: 12, color: 'var(--label)' }}>
                  Uses {iskBig(spentIsk)}{Number.isFinite(iskCap) ? ` of the ${iskBig(iskCap)} you set aside` : ' up front'}
                  {spentLp < lp * 0.95 ? `; ${units(lp - spentLp)} points wait for ${Number.isFinite(iskCap) ? 'more ISK or ' : ''}better offers.` : '.'}
                </p>
                <div className="col" style={{ gap: 10 }}>
                  {spend.slice(0, 8).map((p, i) => (
                    <div key={p.offerId} style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'center' }}>
                      <span className="mono" style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', fontSize: 11, color: '#1a0f02', background: 'var(--acc2)', clipPath: 'var(--hex)' }}>{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="ellipsis" style={{ fontSize: 13, color: 'var(--ink)' }}><b className="mono" style={{ color: 'var(--acc2)', fontWeight: 500 }}>{units(p.runs)}×</b> {nameOf(p.typeId)}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--label)' }}>{units(p.lpSpent)} LP + {iskBig(p.iskSpent)} for {iskBig(p.profit)}</div>
                        <div className="track h3" style={{ marginTop: 4 }}><span className="fill" style={{ width: `${(p.lpSpent / Math.max(1, lp)) * 100}%`, background: 'var(--acc2)' }} /></div>
                      </div>
                      {canOpenInGame() && (
                        <button type="button" className="icon-btn plain" aria-label={`Open ${nameOf(p.typeId)} in game`} onClick={() => openMarketWindow(p.typeId).then(() => toast(`Opened ${nameOf(p.typeId)}’s market window in your client.`, 'info')).catch((e) => toast(String(e.message ?? e), 'err'))}>
                          <MonitorUp aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                  {spend.length > 8 && <p className="note small">And {spend.length - 8} smaller ones in the table.</p>}
                </div>
              </>
            )}
          </section>

          <section data-rv="" className="panel" aria-label="All on one item" style={{ padding: 18, gap: 10, clipPath: 'none' }}>
            <div className="hero-l" style={{ color: 'var(--acc)' }}>
              All on one item
              <Tip title="All on one item" text={`The best few items to spend all your points on: one trip to the store, one sell order, left to sell in its own time.\n\n• All your points go on the one item, bought as many times as they cover, so they’re ranked by what that makes: your points times its ISK a point.\n• What keeps a pick reasonable is how long the whole pile takes to sell at your share of the buyers taking listings: within ${LAZY_DAYS} days first. Slower ones only fill in when there aren’t enough, anything over ${LAZY_WARN_DAYS} days is flagged, and nothing that would take months is suggested.\n• Offers under half the store’s typical rate per point are left out.\n\nPrices are from the live Jita book; the time to sell is from the last week’s trading at your share (Settings).`} />
            </div>
            {!lazy.length ? (
              <p className="note">{more ? 'Pricing the rest of the store; picks appear as it finishes.' : lp > 0 ? 'Nothing this store sells would sell within three months at your share, or your points don’t cover buying one.' : 'Nothing priced against the live book sells within three months at your share.'}</p>
            ) : (
              <div className="col" style={{ gap: 12 }}>
                {lazy.map((p) => (
                  <div key={p.v.offerId} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="ellipsis" style={{ fontSize: 13, color: 'var(--ink)' }}><b className="mono" style={{ color: 'var(--acc)', fontWeight: 500 }}>{units(p.units)}× </b>{nameOf(p.v.typeId)}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--label)' }}>
                        {p.runs > 1 ? `Buy it ${units(p.runs)} times: ` : ''}{units(p.lp)} LP + {iskBig(p.isk)}{Number.isFinite(p.listAt) ? `, list at ${isk(p.listAt)}` : ''} → <b style={{ color: 'var(--pos)', fontWeight: 500 }}>{iskBig(p.profit)}</b> ({units(Math.round(p.v.iskPerLp))} a point)
                      </div>
                      <div style={{ fontSize: 11.5, color: p.slow ? 'var(--acc2)' : 'var(--sec)' }}>
                        {p.slow ? `Slow: about ${flip(p.sellDays)} to sell, at your share` : `Sells in about ${flip(p.sellDays)}, at your share`}
                      </div>
                    </div>
                    {canOpenInGame() && (
                      <button type="button" className="icon-btn plain" aria-label={`Open ${nameOf(p.v.typeId)} in game`} onClick={() => openMarketWindow(p.v.typeId).then(() => toast(`Opened ${nameOf(p.v.typeId)}’s market window in your client.`, 'info')).catch((e) => toast(String(e.message ?? e), 'err'))}>
                        <MonitorUp aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
                {lp <= 0 && <p className="note small">Sized to one purchase each: type how many points you have to size them to all of them.</p>}
              </div>
            )}
          </section>
          </div>

          <div data-rv="" className="col" style={{ flex: '3 1 640px', minWidth: 0 }}>
            <p style={{ fontSize: 12.5, color: 'var(--label)', textWrap: 'pretty' }}>
              {units(all.length)} offers valued, {units(profitable)} of them worth taking{lp > 0 && <> with {units(lp)} points</>}.
              {more ? ` ${more}` : live.size > 0 ? ` ${units(live.size)} items priced against the live Jita book; anything left on a global average is marked rough.` : ' All on a global average so far.'}
              {best && <> Best rate: <b style={{ color: 'var(--figure)' }}>{units(Math.round(best.v.iskPerLp))} ISK per point on {nameOf(best.v.typeId)}</b>.</>}
            </p>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <label className="chip h34" style={{ flex: '0 1 320px' }}>
                <Search aria-hidden="true" style={{ width: 14, height: 14, color: 'var(--dim)' }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item, e.g. augmentation" aria-label="Find an item in this store" style={{ border: 0, background: 'transparent', color: 'var(--ink)', width: '100%', outline: 'none' }} />
              </label>
              {rows.length > SHOW && (
                <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>{showAll ? `Show the top ${SHOW}` : `Show all ${units(rows.length)}`}</button>
              )}
            </div>
            <section className="panel flush">
              <div className="tbl-scroll" style={{ maxHeight: 'calc(100vh - 380px)', minHeight: 300 }}>
                {!rows.length ? (
                  <p className="note" style={{ padding: 20 }}>{q.trim() ? `Nothing here matches “${q.trim()}”${hideLosses ? ' among the offers worth taking. Untick “Hide losing offers” to search them all' : ''}.` : 'Nothing in this store is worth taking at current Jita prices. Untick “Hide losing offers” to see the numbers anyway.'}</p>
                ) : (
                  <table className="tbl" style={{ minWidth: 1180 }}>
                    <thead>
                      <tr>
                        <SortTh k="name" label="Item" sort={sort} onSort={sortBy} left />
                        <SortTh k="rate" label="ISK per LP" sort={sort} onSort={sortBy} tip={TIPS.rate} />
                        <SortTh k="instant" label="Sell now" sort={sort} onSort={sortBy} tip={TIPS.instant} />
                        <SortTh k="outlay" label="You pay" sort={sort} onSort={sortBy} tip={TIPS.outlay} />
                        <SortTh k="revenue" label="You get" sort={sort} onSort={sortBy} tip={TIPS.revenue} />
                        <SortTh k="profit" label="Profit" sort={sort} onSort={sortBy} tip={TIPS.profit} />
                        <SortTh k="days" label="Trades a day" sort={sort} onSort={sortBy} tip={TIPS.days} />
                        <SortTh k="total" label="Times to buy" sort={sort} onSort={sortBy} tip={TIPS.total} />
                        <th scope="col" className="l">Why</th>
                        <th scope="col" style={{ color: 'var(--faint-2)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAll ? rows : rows.slice(0, SHOW)).map((row) => (
                        <OfferRow key={row.v.offerId} row={row} name={nameOf(row.v.typeId)} lp={lp} open={open === row.v.offerId}
                          onToggle={() => setOpen(open === row.v.offerId ? null : row.v.offerId)} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
            {rows.length > SHOW && !showAll && <p className="note small">Showing the top {SHOW} of {units(rows.length)}. Search above, or show them all.</p>}
          </div>
        </div>
      )}

      <Guide
        title="How to use Loyalty"
        intro="Turn loyalty points into ISK at the best rate the market can actually absorb."
        steps={[
          { icon: Store, title: 'Pick your store', body: 'Your balances load automatically. Caldari Navy is the usual Jita trader’s store.' },
          { icon: Coins, title: 'Set the ISK you can put in', body: 'Many offers want ISK and items as well as points. The plan won’t spend more than you set.' },
          { icon: ListOrdered, title: 'Follow the spend plan', body: 'Best rate first, bought as many times as the market takes, then the next best. Listing 600 of something that sells five a day only competes with yourself.' },
        ]}
        habits={[{ icon: Tag, title: 'Worth listing vs sell now', body: 'Sell now dumps into buy orders instantly; listing pays more but takes time.' }]}
      />
    </div>
  );
}

function OfferRow({ row, name, lp, open, onToggle }: { row: Row; name: string; lp: number; open: boolean; onToggle: () => void }) {
  const { v, instant, notes, plan, perDay, runDays } = row;
  const perUnit = v.revenue / v.quantity;
  const det: { l: string; v: string; n: string; c?: string }[] = [
    { l: 'Each purchase', v: `${units(v.lpCost)} LP${v.iskCost > 0 ? ` + ${iskBig(v.iskCost)}` : ''}`, n: `Gives ${units(v.quantity)} × ${name}` },
    { l: 'Items to buy first', v: v.itemsCost > 0 ? iskBig(v.itemsCost) : 'None', n: v.itemsCost > 0 ? 'At the cheapest Jita listings' : 'This offer wants points and ISK only' },
    { l: 'Listed and waited', v: iskBig(v.revenue), n: v.quantity > 1 ? `${isk(perUnit)} each after fees` : 'After your broker fee and sales tax', c: 'var(--pos)' },
    { l: 'Sold now instead', v: instant ? iskBig(instant.revenue) : 'Nothing bidding', n: instant ? `${units(Math.round(instant.iskPerLp))} ISK per point` : 'No buy orders to sell into' },
    { l: 'Per point', v: `${units(Math.round(v.iskPerLp))} ISK`, n: `${iskBig(v.profit)} profit ÷ ${units(v.lpCost)} LP`, c: v.iskPerLp > 0 ? 'var(--pos)' : 'var(--neg)' },
    {
      l: 'What limits it', v: plan.limitedBy === 'market' ? 'The market' : plan.limitedBy === 'points' ? 'Your points' : 'Not known',
      n: plan.limitedBy === 'market' ? `Your points buy it ${units(plan.affordable)} times; the market takes ${units(plan.absorbable ?? 0)} in the time allowed`
        : plan.limitedBy === 'points' ? `Your points buy it ${units(Math.floor(lp / v.lpCost))} times, and the market would take ${units(plan.absorbable ?? 0)}`
          : 'No recent trading history, so there is nothing to judge the pace by',
    },
  ];
  return (
    <>
      <tr className={'hover' + (open ? ' open' : '')}>
        <td className="l">
          <Expander open={open} onToggle={onToggle} label={`${name}: ${open ? 'hide' : 'show'} details`}>
            <ItemIcon id={v.typeId} />
            <span style={{ minWidth: 0 }}>
              <span className="name ellipsis" style={{ display: 'block', maxWidth: 260 }}>{name}</span>
              {v.quantity > 1 && <span className="sub">{units(v.quantity)} per purchase</span>}
            </span>
          </Expander>
        </td>
        <td style={{ color: v.iskPerLp > 0 ? 'var(--pos)' : 'var(--neg)', fontSize: 14 }}>{units(Math.round(v.iskPerLp))}</td>
        <td style={{ color: 'var(--dim)' }}>{instant ? units(Math.round(instant.iskPerLp)) : '–'}</td>
        <td>{units(v.lpCost)} LP<span className="sub">{v.outlay > 0 ? iskBig(v.outlay) : 'no ISK'}{v.itemsCost > 0 && `, ${iskBig(v.itemsCost)} of it items`}</span></td>
        <td>{iskBig(v.revenue)}</td>
        <td style={{ color: v.profit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBig(v.profit)}</td>
        <td>{perDay != null && perDay > 0 ? <>{units(Math.round(perDay))}<span className="sub">one purchase sells in {flip(runDays)}</span></> : <span className="faint" data-tip="No trades recorded in the last week">–</span>}</td>
        <td>{plan.runs > 0 ? <>{units(plan.runs)}<span className="sub">{iskBig(plan.profit)} in all</span></> : <span className="faint">–</span>}</td>
        <td className="l">
          <span className="flags" style={{ justifyContent: 'flex-start' }}>
            {notes.length ? notes.map((n) => <span key={n} className="flag plain" tabIndex={0} data-tip={NOTE[n].why} data-tip-title={NOTE[n].short} style={cssVars({ '--c': NOTE[n].bad ? 'var(--acc2)' : 'var(--acc)' })}>{NOTE[n].short}</span>) : <span className="faint">–</span>}
          </span>
        </td>
        <td>
          <span className="acts">
            <button type="button" className="link-btn" onClick={() => navigate(`calculator?type=${v.typeId}`)}>Calc</button>
            <OpenInGame typeId={v.typeId} name={name} variant="dim" />
          </span>
        </td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={10}>
            <div className="unfold">
              <div className="dgrid">
                {det.map((x) => (
                  <div key={x.l} className="dcard"><div className="lbl">{x.l}</div><div className="dv" style={x.c ? { color: x.c } : undefined}>{x.v}</div><div className="dn">{x.n}</div></div>
                ))}
              </div>
              {notes.map((n) => <p key={n} style={{ margin: '8px 0 0', fontSize: 12.5, color: '#9fb3c5' }}><b style={{ color: NOTE[n].bad ? 'var(--acc2)' : 'var(--ink)' }}>{NOTE[n].short}.</b> {NOTE[n].why}</p>)}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
