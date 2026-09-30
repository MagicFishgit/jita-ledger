import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, Crosshair, FileSpreadsheet, Flame, HandCoins, Image as ImageIcon, MapPin, ShieldCheck, TriangleAlert, Wallet as WalletIcon,
} from 'lucide-react';
import { JITA_44, SCOPE } from '../lib/config';
import { fmtDate, fmtDateTime, fmtShort, isk, iskBig, iskBigSigned, pct, units } from '../lib/format';
import { navigate, useAuth, useNow } from '../lib/hooks';
import { resolveNames, roughPricesShared, setDestination } from '../lib/market';
import { priceStore, storeRate } from '../lib/lpStore';
import { rates } from '../lib/fees';
import { computePosition, countedIn, feeMatchesFor, realizedBetween, type SeriesPoint } from '../lib/positions';
import { startPosition } from '../lib/actions';
import { update, useData, type Data } from '../lib/store';
import { toast } from '../lib/toast';
import { isStation, isStructure, isSystem, structureInfo, system, type StructureRead } from '../lib/universe';
import { isAbyssalSystem, netLoss } from '../lib/combat';
import {
  autoTag, balanceAt, balanceSeries, csvCell, describeRef, feeLeak, fittedShips, flows, multibuys, nextTag, RUNNING, runwayDays, unusual,
  type Line, type Multibuy, type TradeClass,
} from '../lib/wallet';
import type { JournalEntry, Position, Tx, UntrackedTag } from '../lib/types';
import { AreaLine, MiniLine } from './charts';
import { Goals } from './Goals';
import { AssetSafety } from './AssetSafety';
import { downloadBlob, downloadText, useEnsureNames, useShipTypes, useTypeName } from './common';
import { contractSaid, type ContractItem } from '../lib/contracts';
import { isFreelanceTrade } from '../lib/freelance';
import { BarLine, cssVars, Empty, Figure, PageHead, Panel, Seg, Tiles, Tip } from './ui';
import { ACTIVITY_COLOR, ACTIVITY_WHAT, useActivityEvents } from './activityEvents';
import { Points } from './Facts';
import { everyItemCalcs } from '../lib/everyItem';
import { isTrade, isUnbought, itemResult } from '../lib/longRange';
import { ACTIVITIES } from '../lib/prefs';
import { nettedJournal, refundsIn } from '../lib/refunds';

const DAY = 86400_000;
/** How old a loyalty-point valuation can get before the Wallet prices the store again. */
const LP_STALE = 12 * 3600_000;
/** Stores tried this session, so a failing one isn't hammered on every visit. */
const lpTried = new Map<number, number>();
const WALLET_SCOPE = SCOPE.wallet, KILLMAIL_SCOPE = SCOPE.killmails;
type Days = 1 | 7 | 30 | 90;
const DAYS_KEY = 'jita-ledger:wallet-days';

const IN_COLOR: Record<string, string> = {
  freelance: '#f5b86b', freelanceSales: '#f5b86b', trading: 'var(--acc)', contracts: 'var(--acc2)', loot: '#eed79a', bounties: '#ff8d9a', courier: '#a98bff', insurance: '#90a5b8', donation: '#6ee7a8',
};
const OUT_COLOR: Record<string, string> = {
  freelanceBuys: '#f5b86b', stock: 'var(--acc)', personal: '#ff8d9a', fees: 'var(--acc2)', couriers: '#a98bff', rent: '#90a5b8', clones: '#90a5b8', skills: '#ff8d9a', travel: '#ff8d9a', lp: '#a98bff',
};
const TAG_LOOK: Record<UntrackedTag, { sell: string; buy: string; c: string }> = {
  loot: { sell: 'Loot sale', buy: 'Loot', c: '#eed79a' },
  personal: { sell: 'Personal', buy: 'Personal', c: '#ff8d9a' },
  trading: { sell: 'Trading', buy: 'Trading', c: 'var(--acc)' },
  other: { sell: 'Other sale', buy: 'Other buy', c: '#adbfcf' },
};

const startOfUtcDay = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);

function readDays(): Days {
  try { const v = Number(localStorage.getItem(DAYS_KEY)); if (v === 1 || v === 7 || v === 30 || v === 90) return v; } catch { /* private window */ }
  return 30;
}

/**
 * One line of money in or out that opens to what's behind it: the kinds of journal entry it holds, each opening to
 * the entries themselves, or the items its trades were in. The user wanted "Other income" and "Other spending" to show
 * what they were rather than stay a lump, so every line can open, and nothing is folded into "everything else".
 */
function FlowLine({ l, sign, frac, color, kindColor, contractItems }: { l: Line; sign: '+' | '−'; frac: number; color: string; kindColor?: string; contractItems?: Record<number, ContractItem[]> }) {
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<string | null>(null);
  const name = useTypeName();
  // What a contract held, when your contracts are read: "3× Rifter Blueprint" beside its ISK.
  useEnsureNames(open && contractItems ? l.parts.flatMap((p) => (p.entries ?? []).flatMap((e) => (e.contract ? contractItems[e.contract] ?? [] : []).map((i) => i.typeId))) : []);
  const label = l.parts.length ? (
    <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <ChevronRight className="chev" aria-hidden="true" />{l.label}
    </button>
  ) : l.label;
  return (
    <div>
      <BarLine label={label} value={`${sign}${iskBig(l.amount)}`} frac={frac} color={color} kind={l.kind} kindColor={kindColor} />
      {open && (
        <div className="flow-parts">
          {l.parts.map((p) => (
            <div key={p.key}>
              <div className="kv">
                {p.entries?.length ? (
                  <button type="button" className="panel-toggle" aria-expanded={part === p.key} onClick={() => setPart(part === p.key ? null : p.key)}>
                    <ChevronRight className="chev" aria-hidden="true" /><span>{p.label}</span>
                  </button>
                ) : <span>{p.typeId != null ? name(p.typeId) : p.label}</span>}
                <span className="v">{units(p.count)}× · {sign}{iskBig(p.amount)}</span>
              </div>
              {part === p.key && p.entries && (
                <div className="flow-entries">
                  {p.entries.map((e) => (
                    <div key={e.id} className="kv">
                      <span><span className="mono faint">{fmtShort(Date.parse(e.date))}</span> {(e.contract && contractSaid(contractItems?.[e.contract], name)) || e.text || '–'}</span>
                      <span className="v">{sign}{iskBig(e.amount)}</span>
                    </div>
                  ))}
                  {p.count > p.entries.length && <p className="note small" style={{ margin: 0 }}>The {units(p.entries.length)} biggest of {units(p.count)}.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Wallet() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const name = useTypeName();
  const [days, setDaysState] = useState<Days>(readDays);
  const setDays = (v: Days) => { setDaysState(v); try { localStorage.setItem(DAYS_KEY, String(v)); } catch { /* private window */ } };
  const since = days === 1 ? now - DAY : startOfUtcDay(now) - (days - 1) * DAY;
  // Fees a GM refunded, and the refunds, count as nothing (refunds.ts); the note under the flows says so.
  const journal = useMemo(() => Object.values(nettedJournal(d.journal)), [d.journal]);
  const refunds = useMemo(() => refundsIn(d.journal), [d.journal]);
  const txList = useMemo(() => Object.values(d.txs).filter((t) => t.source === 'esi'), [d.txs]);
  const hasWallet = (auth?.scopes ?? []).includes(WALLET_SCOPE);

  // Which trades a position counts, worked out once rather than per panel.
  const tracked = useMemo(() => new Set(txList.filter((t) => d.positions.some((p) => countedIn(p, t))).map((t) => t.id)), [txList, d.positions]);
  const everBought = useMemo(() => new Set(txList.filter((t) => t.isBuy).map((t) => t.typeId)), [txList]);
  // Each position's profit history, worked out once per change to the ledger rather than on every tick.
  const posSeries = useMemo(() => d.positions.map((p) => ({ p, series: computePosition(p, d, d.settings).series })),
    [d.positions, d.txs, d.journal, d.orders, d.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const ignored = useMemo(() => new Set(d.ignored), [d.ignored]);
  // Purchases made in one go (the Multibuy window, a fitting's "Buy all") are one row; one with a ship in it is a fit
  // to fly, guessed Personal until you say otherwise (wallet.ts, `multibuys`).
  const multis = useMemo(() => multibuys(txList), [txList]);
  const ships = useShipTypes(useMemo(() => multis.flatMap((g) => g.typeIds), [multis]));
  const fitted = useMemo(() => fittedShips(multis, (t) => ships.has(t)), [multis, ships]);
  const tagOf = (tx: Tx): UntrackedTag => (ignored.has(tx.id) ? 'personal' : d.tags[tx.id] ?? autoTag(tx, everBought, fitted));
  // Trades for a freelance job you've joined (its items, after it began) count under Freelance unless you said otherwise.
  const joined = d.meta.freelance?.jobs ?? [];
  const freelance = (tx: Tx) => !ignored.has(tx.id) && !(tx.id in d.tags) && isFreelanceTrade(joined, tx);
  const classOf = (tx: Tx): TradeClass => ({ tracked: tracked.has(tx.id), tag: tagOf(tx), freelance: freelance(tx) });

  const f = useMemo(() => flows(journal, txList, classOf, since), [journal, txList, tracked, ignored, d.tags, fitted, d.meta.freelance, since]); // eslint-disable-line react-hooks/exhaustive-deps
  const f30 = useMemo(() => flows(journal, txList, classOf, now - 30 * DAY), [journal, txList, tracked, ignored, d.tags, fitted, d.meta.freelance, Math.floor(now / 3600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(() => balanceSeries(journal, since), [journal, since]);
  const wallet = d.meta.walletBalance ?? series[series.length - 1]?.balance ?? null;
  const startBal = useMemo(() => balanceAt(journal, since), [journal, since]);
  const oldest = useMemo(() => journal.reduce((m, e) => Math.min(m, Date.parse(e.date)), Infinity), [journal]);

  // ---- Net worth: what each part is, from what ESI and the rough price list say.
  const [rough, setRough] = useState<Record<number, number> | null>(null);
  const stockTypes = d.stock ? Object.keys(d.stock.total).length : 0;
  useEffect(() => {
    if (!stockTypes) return;
    let alive = true;
    roughPricesShared().then((p) => { if (alive) setRough(p); }).catch(() => undefined);
    return () => { alive = false; };
  }, [stockTypes]);
  const value = (items: Record<number, number> | undefined) => {
    if (!items || !rough) return 0;
    let t = 0;
    for (const [id, q] of Object.entries(items)) t += (rough[Number(id)] ?? 0) * q;
    return t;
  };
  const open = Object.values(d.orders).filter((o) => o.state === 'open');
  const sellValue = open.filter((o) => !o.isBuy).reduce((t, o) => t + o.price * o.volumeRemain, 0);
  const escrow = open.filter((o) => o.isBuy).reduce((t, o) => t + (o.escrow ?? o.price * o.volumeRemain), 0);
  const assets = value(d.stock?.total);
  // Only the points the Loyalty page's plan could place are valued at its rate; the rest have no market
  // it found, so they count for nothing rather than for the same rate.
  const lp = (d.meta.lpBalances ?? []).map((b) => {
    // A rate saved before the plan's reach was kept says nothing about how many points it covers.
    const saved = d.meta.lpRate?.[b.corporationId];
    const r = saved?.lp != null ? saved : null;
    const valued = r ? Math.min(b.points, r.lp!) : 0;
    return { ...b, rate: r?.rate ?? null, valued };
  });
  const lpValue = lp.reduce((t, b) => t + (b.rate != null ? b.valued * b.rate : 0), 0);

  // Points are valued by what the Loyalty page's spend plan would make from them. Rather than wait for
  // someone to open that page, the Wallet prices each store itself when it has no usable rate or the
  // rate is over twelve hours old: the same pricing, run in the background.
  const [lpPricing, setLpPricing] = useState(false);
  const lpDue = (d.meta.lpBalances ?? []).filter((b) => {
    if (b.points <= 0) return false;
    const r = d.meta.lpRate?.[b.corporationId];
    return !r || r.lp == null || Date.now() - Date.parse(r.at) > LP_STALE;
  });
  const lpKey = lpDue.map((b) => b.corporationId).join(',');
  useEffect(() => {
    const due = lpDue.filter((b) => !(Date.now() - (lpTried.get(b.corporationId) ?? 0) < 30 * 60_000));
    if (!due.length) return;
    let alive = true;
    setLpPricing(true);
    (async () => {
      const r = rates(d.settings);
      for (const b of due) {
        lpTried.set(b.corporationId, Date.now());
        try {
          const p = await priceStore(b.corporationId, b.points, r);
          const got = storeRate(p, b.points, r, 7, d.settings.share);
          const at = new Date().toISOString();
          // Nothing profitable is still an answer: those points are worth nothing to sell right now.
          update((x) => ({ meta: { ...x.meta, lpRate: { ...x.meta.lpRate, [b.corporationId]: got ? { rate: got.rate, lp: got.lp, at, types: got.types } : { rate: 0, lp: 0, at } } } }));
        } catch { /* tried again later */ }
      }
    })().finally(() => { if (alive) setLpPricing(false); });
    return () => { alive = false; };
  }, [lpKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const lpHeld = lp.some((b) => b.points > 0);
  const lpUnpriced = lp.some((b) => b.points > 0 && b.rate == null);
  const nwParts: { l: string; v: number; c: string; text?: string }[] = [
    { l: 'Wallet', v: wallet ?? 0, c: 'var(--acc)' },
    { l: 'Stock in sell orders', v: sellValue, c: '#6ee7a8' },
    { l: 'Assets at rough prices', v: assets, c: '#a98bff' },
    { l: 'Buy order escrow', v: escrow, c: 'var(--acc2)' },
    { l: 'Loyalty points', v: lpValue, c: '#ff8d9a', text: lpHeld && lpUnpriced ? (lpPricing ? 'Pricing…' : 'Not priced yet') : undefined },
  ];
  const nwTotal = nwParts.reduce((t, p) => t + p.v, 0);
  // The ISK you could free up without selling anything: wallet, buy-order escrow, and sell orders.
  const liquid = wallet != null ? wallet + escrow + sellValue : null;
  const nwReady = wallet != null && (!stockTypes || rough != null);

  // One point a day is kept, so the trend has a history of its own beyond ESI's 30 days.
  useEffect(() => {
    if (!nwReady || !nwTotal) return;
    const today = dayKey(Date.now());
    const cur = d.netWorth.find((p) => p.date === today);
    if (cur && Math.abs(cur.total - nwTotal) < nwTotal * 0.005) return;
    update((x) => ({ netWorth: [...x.netWorth.filter((p) => p.date !== today), { date: today, total: nwTotal, wallet: wallet ?? 0, liquid: liquid ?? undefined }].sort((a, b) => a.date.localeCompare(b.date)).slice(-730) }));
  }, [nwReady, Math.round(nwTotal / 1e5)]); // eslint-disable-line react-hooks/exhaustive-deps

  const nwPoints = d.netWorth.filter((p) => Date.parse(p.date) >= startOfUtcDay(since));
  const nwBase = nwPoints[0] ?? null;
  const nwGrowPerDay = (() => {
    const base = d.netWorth.find((p) => Date.parse(p.date) >= now - 30 * DAY);
    if (!base || !nwReady) return null;
    const span = (now - Date.parse(base.date)) / DAY;
    return span >= 1 ? (nwTotal - base.total) / span : null;
  })();
  // Only snapshots from after it was first recorded carry it, so this has no answer for a while.
  const liquidGrowPerDay = (() => {
    const base = d.netWorth.find((p) => p.liquid != null && Date.parse(p.date) >= now - 30 * DAY);
    if (!base || liquid == null) return null;
    const span = (now - Date.parse(base.date)) / DAY;
    return span >= 1 ? (liquid - base.liquid!) / span : null;
  })();
  const walletGrowPerDay = (() => {
    const b = balanceAt(journal, now - 30 * DAY);
    return wallet != null && b != null ? (wallet - b) / 30 : null;
  })();

  // What a goal counts as earned: trading profit from positions, or net cash flow, between two moments.
  const earned = (source: 'trading' | 'cashflow', from: number, to: number) => {
    if (source === 'trading') return posSeries.reduce((t, x) => t + realizedBetween(x.series, from, to), 0);
    const f = flows(journal, txList, classOf, from, to);
    return f.inTotal - f.outTotal;
  };

  if (!journal.length && !txList.length) {
    return (
      <div className="page">
        <WalletHead days={days} setDays={setDays} />
        <Empty icon={WalletIcon} action={<button type="button" className="btn primary" onClick={() => navigate('settings/account')}>{auth ? 'Check permissions' : 'Log in'}</button>}>
          {!auth ? 'Your wallet appears here once you log in. It is built from your wallet journal, which ESI only lets a logged-in character read.'
            : !hasWallet ? 'Your login doesn’t include the wallet permission, so there is nothing to show. Settings says how to add it.'
              : 'Nothing synced yet. The first sync reads your journal and trades; it starts on its own.'}
        </Empty>
        <AssetSafety d={d} rough={rough} />
      </div>
    );
  }

  // ---- Today strip
  const today0 = startOfUtcDay(now);
  const todayStart = balanceAt(journal, today0 - 1);
  const todaySales = txList.filter((t) => !t.isBuy && Date.parse(t.date) >= today0);
  const bySold = new Map<number, { v: number; n: number }>();
  for (const t of todaySales) { const c = bySold.get(t.typeId) ?? { v: 0, n: 0 }; c.v += t.qty * t.unitPrice; c.n++; bySold.set(t.typeId, c); }
  const topSold = [...bySold.entries()].sort((a, b) => b[1].v - a[1].v)[0];
  const fToday = flows(journal, [], classOf, today0);
  const topCost = fToday.outs[0];
  const prev = d.meta.prevVisitAt;
  const prevBal = prev ? balanceAt(journal, Date.parse(prev)) : null;
  const today = [
    { l: 'Wallet today', v: wallet != null && todayStart != null ? iskBigSigned(wallet - todayStart) : '–', n: 'Change since 00:00 EVE', c: wallet != null && todayStart != null ? (wallet >= todayStart ? 'var(--pos)' : 'var(--neg)') : undefined },
    { l: 'Most sold today', v: topSold ? name(topSold[0]) : 'Nothing yet', n: topSold ? `${iskBig(topSold[1].v)} from ${topSold[1].n} sale${topSold[1].n === 1 ? '' : 's'}` : 'No sales since 00:00 EVE' },
    { l: 'Biggest cost today', v: topCost ? topCost.label : 'None', n: topCost ? `−${iskBig(topCost.amount)} on ${topCost.count} entr${topCost.count === 1 ? 'y' : 'ies'}` : 'No fees, taxes or spending yet', c: topCost ? 'var(--neg-t)' : undefined },
    { l: 'Since your last visit', v: wallet != null && prevBal != null ? iskBigSigned(wallet - prevBal) : '–', n: prev ? `Wallet change since ${fmtDateTime(prev)}` : 'This is your first visit from this browser', c: wallet != null && prevBal != null ? (wallet >= prevBal ? 'var(--pos)' : 'var(--neg)') : undefined },
  ];

  // ---- Balance chart
  const pts = [
    ...(startBal != null ? [{ t: since, v: startBal }] : []),
    ...series.map((p) => ({ t: p.t, v: p.balance })),
  ];
  if (!pts.length && wallet != null) pts.push({ t: since, v: wallet });
  const vs = pts.map((p) => p.v);
  const inWindow = journal.filter((e) => Date.parse(e.date) >= since && e.balance != null);
  const bigOnes = [...inWindow].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).filter((e) => wallet == null || Math.abs(e.amount) >= Math.abs(wallet) * 0.01).slice(0, 8);
  const describe = (e: JournalEntry) => {
    if (e.refType === 'market_transaction' && e.contextId != null) {
      const tx = d.txs[String(e.contextId)];
      if (tx) return `${tx.isBuy ? 'Bought' : 'Sold'} ${units(tx.qty)} × ${name(tx.typeId)}`;
    }
    return describeRef(e.refType);
  };
  const events = bigOnes.map((e) => ({
    t: Date.parse(e.date), v: e.balance as number, color: e.amount < 0 ? 'var(--neg)' : 'var(--pos)',
    tip: `${e.amount < 0 ? '−' : '+'}${iskBig(Math.abs(e.amount))} · ${describe(e)}`, title: fmtDateTime(e.date),
  }));
  const balChange = wallet != null && startBal != null ? wallet - startBal : null;
  const periodWords = days === 1 ? 'in 24 hours' : `in ${days} days`;
  // No journal at all (trades synced before the journal was kept) leaves `oldest` infinite: no note.
  const histNote = Number.isFinite(oldest) && oldest > since + DAY
    ? `ESI returns 30 days of journal. This browser has kept it since ${fmtDate(oldest)}, so the window starts there.`
    : null;

  // ---- Flows
  const ins = f.ins;
  const outs = f.outs;
  const fmax = Math.max(1, ins[0]?.amount ?? 0, outs[0]?.amount ?? 0);
  const net = f.inTotal - f.outTotal;

  // ---- Fee leak
  const relistIds = feeMatchesFor(d, d.settings).relistIds;
  const leak = feeLeak(journal, since, relistIds);
  const tradingIn = f.ins.find((l) => l.key === 'trading')?.amount ?? 0;
  const leakRows = [
    ['Sales tax', leak.sales], ['Broker fees', leak.broker], ['Price changes', leak.relists], ['Planetary customs tax', leak.pi], ['Jump clone fees', leak.clones],
  ] as const;
  const leakMax = Math.max(1, ...leakRows.map((r) => r[1]));

  // ---- Trading against play
  const profit = posSeries.reduce((t, x) => t + realizedBetween(x.series, since, now), 0);
  const play = f.outs.filter((l) => l.kind === 'Personal').reduce((t, l) => t + l.amount, 0);
  const left = profit - play;
  // ---- All income against play: every activity counted as Results counts it, and sales no activity counts.
  const acts = useActivityEvents();

  // ---- Runway: personal spending plus the running costs, over the last 30 days.
  const burn30 = f30.outs.filter((l) => l.kind === 'Personal' || RUNNING.has(l.key)).reduce((t, l) => t + l.amount, 0);
  const runway = wallet != null ? runwayDays(wallet, burn30 / 30) : null;
  const net30 = f30.inTotal - f30.outTotal;

  // ---- Running costs
  const running = f30.outs.filter((l) => RUNNING.has(l.key));
  const runningT = running.reduce((t, l) => t + l.amount, 0);
  const RUN_NOTE: Record<string, (n: number) => string> = {
    rent: (n) => `${n} payment${n === 1 ? '' : 's'}`,
    couriers: (n) => `${n} contract fee${n === 1 ? '' : 's'} and rewards paid`,
    planets: (n) => `${n} customs payment${n === 1 ? '' : 's'}`,
    clones: (n) => `${n} clone fee${n === 1 ? '' : 's'}`,
  };

  // ---- Report for this calendar month
  const m0 = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)).getTime();
  const monthName = new Date(m0).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });

  return (
    <div className="page">
      <WalletHead days={days} setDays={setDays} />
      {histNote && days === 90 && <p style={{ margin: '-6px 0 0', fontSize: 12.5, color: 'var(--acc2)' }}>{histNote}</p>}
      {auth && !hasWallet && <p className="note" style={{ color: 'var(--acc2)' }}>Your login no longer includes the wallet permission, so this is what was synced before. Settings says how to add it back.</p>}
      <Tiles items={today} />

      <div className="g-440">
        <Panel title="Wallet balance">
          <Figure value={wallet != null ? iskBig(wallet) : '–'} sub={balChange != null ? `${iskBigSigned(balChange)} ${periodWords}` : 'No balance before this window'} color="var(--ink)" />
          {pts.length > 0 && (
            <AreaLine points={pts} from={since} to={now} events={events} step
              labels={{ max: iskBig(Math.max(...vs)), min: iskBig(Math.min(...vs)), start: days === 1 ? '24 h ago' : fmtShort(since), end: 'now' }} />
          )}
          <p className="note">{events.length ? 'Hover a dot to see what moved the balance.' : 'Nothing large moved the balance in this window.'} The line is the balance ESI records after every journal entry, not a reconstruction.</p>
        </Panel>
        <NetWorth parts={nwParts} total={nwTotal} ready={nwReady} points={nwPoints} base={nwBase} periodWords={periodWords} growPerDay={nwGrowPerDay} windowStart={startOfUtcDay(since)}
          hasAssets={!!d.stock} unpricedLp={lp.filter((b) => b.rate == null && b.points > 0).length} lpHeld={lpHeld} />
      </div>

      <div className="g-440">
        <Panel title="Where it came from, where it went">
          <div className="g-240">
            <div>
              <div className="kv" style={{ marginBottom: 8 }}><span className="lbl">Money in</span><span className="v" style={{ color: 'var(--pos)' }}>+{iskBig(f.inTotal)}</span></div>
              <div className="col" style={{ gap: 9 }}>
                {ins.length ? ins.map((l) => <FlowLine key={l.key} l={l} sign="+" frac={l.amount / fmax} color={IN_COLOR[l.key] ?? '#adbfcf'} contractItems={d.meta.contracts?.items} />) : <p className="note">Nothing came in.</p>}
              </div>
            </div>
            <div>
              <div className="kv" style={{ marginBottom: 8 }}><span className="lbl">Money out</span><span className="v" style={{ color: 'var(--neg-t)' }}>−{iskBig(f.outTotal)}</span></div>
              <div className="col" style={{ gap: 9 }}>
                {outs.length ? outs.map((l) => (
                  <FlowLine key={l.key} l={l} sign="−" frac={l.amount / fmax} color={OUT_COLOR[l.key] ?? '#adbfcf'} kindColor={l.kind === 'Personal' ? '#ff8d9a' : '#90a5b8'} contractItems={d.meta.contracts?.items} />
                )) : <p className="note">Nothing went out.</p>}
              </div>
            </div>
          </div>
          <div className="kv" style={{ padding: '10px 12px', background: 'rgba(2,7,12,.5)', border: '1px solid var(--line-3)', alignItems: 'baseline' }}>
            <span className="lbl">Net cash flow</span>
            <span className="v" style={{ fontSize: 16, color: net >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(net)}</span>
          </div>
          <Points compact items={[
            { kind: 'good', lead: 'Complete', text: 'everything that moved ISK is in the journal.' },
            { kind: 'info', lead: 'Trades', text: 'read from your transactions, which name the item; buy-order escrow is left out so no purchase counts twice.' },
            { kind: 'warn', lead: 'Picked up, not bought', text: 'loot, salvage and ore show only once you sell them.' },
          ]} />
          {refunds.length > 0 && (
            <p className="note small" style={{ margin: 0 }}>
              {refunds.map((p) => `A GM refunded ${isk(p.amount)} of ${p.refType === 'brokers_fee' ? 'broker fees' : 'sales tax'} on ${fmtShort(Date.parse(p.refundAt))}${p.reason ? ` (${p.reason})` : ''}`).join('; ')}: {refunds.length === 1 ? 'the fee and the refund are' : 'those fees and refunds are'} both left out of these figures, and everywhere else a fee counts.
            </p>
          )}
        </Panel>
        <WhereItSits d={d} value={value} rough={rough} sellValue={sellValue} escrow={escrow} lp={lp} now={now} hasAssets={!!d.stock} />
      </div>

      <AssetSafety d={d} rough={rough} />

      <Untracked d={d} txs={txList.filter((t) => !tracked.has(t.id) && Date.parse(t.date) >= since)} tagOf={tagOf} explicit={(id) => ignored.has(id) || id in d.tags}
        multis={multis} ships={ships} freelance={freelance} periodWords={periodWords} />

      <div className="g-300">
        <Panel title="The fee leak">
          <Figure value={`−${iskBig(leak.total)}`} sub={tradingIn > 0 && leak.total <= tradingIn ? `${pct(leak.total / tradingIn, 1)} of your trading income ${periodWords}`
            // Past 100% a share reads as nonsense ("71170.1%"): fees are paid on every order, loot's too, while trading income
            // is what positions' sales brought in.
            : tradingIn > 0 ? `${periodWords}: more than the ${iskBig(tradingIn)} your positions’ sales brought in` : `${periodWords}, with no trading income to set it against`} color="var(--acc2)" />
          <div className="col" style={{ gap: 7 }}>
            {leakRows.map(([l, v]) => (
              <div key={l} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) minmax(64px,auto)', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ color: 'var(--body)' }}>{l}</span>
                <span className="track"><span className="fill" style={{ width: `${(v / leakMax) * 100}%`, background: 'var(--acc2)' }} /></span>
                <span className="mono" style={{ textAlign: 'right', color: 'var(--neg-t)', whiteSpace: 'nowrap' }}>{v ? `−${iskBig(v).replace(' ISK', '')}` : '0'}</span>
              </div>
            ))}
          </div>
          <p className="note small">Price changes are split out: they’re the fee most underestimated. <span data-tip="The fees matched to a change in one of your orders’ prices, by the second they were charged. Changes the app didn’t see (before it kept order history, or two between syncs) sit in broker fees." style={{ textDecoration: 'underline dotted', cursor: 'help' }}>How they’re found</span></p>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('omega')}>Which skills would cut this — Skill payback</button>
        </Panel>
        <Panel title="Trading against play">
          <div className="col" style={{ gap: 6 }}>
            <div className="kv" style={{ fontSize: 13.5 }}><span style={{ color: 'var(--body)' }}>Trading profit</span><span className="v" style={{ color: profit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(profit)}</span></div>
            <div className="kv" style={{ fontSize: 13.5 }}><span style={{ color: 'var(--body)' }}>Spent on play</span><span className="v" style={{ color: '#ff8d9a' }}>−{iskBig(play)}</span></div>
            <div className="kv" style={{ fontSize: 13.5 }}><span style={{ color: 'var(--body)' }}>What’s left</span><span className="v" style={{ color: 'var(--acc)' }}>{iskBigSigned(left)}</span></div>
          </div>
          <div style={{ position: 'relative', height: 14, background: 'rgba(110,231,168,.25)', border: '1px solid var(--line-3)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${profit > 0 ? Math.min(100, (play / profit) * 100) : play > 0 ? 100 : 0}%`, background: '#ff8d9a' }} />
          </div>
          <p className="note">
            {!d.positions.length ? 'No positions yet, so there is no trading profit to measure. Start one on the Positions page.'
              : profit <= 0 ? (play > 0 ? 'Trading hasn’t made a profit in this window, so play is coming out of savings.' : 'Trading hasn’t made a profit in this window.')
                : play <= profit ? `Your trading pays for your flying, with ${iskBig(left)} left over.`
                  : `You spent ${iskBig(play - profit)} more on play than trading made.`}
            {' '}Profit is what your positions realized {periodWords}; play is everything marked Personal.
          </p>
        </Panel>
        <AllIncome d={d} acts={acts} play={play} since={since} now={now} periodWords={periodWords} />
        <Panel title="Runway">
          <Figure value={runway == null ? '–' : !Number.isFinite(runway) ? 'No spending' : `${units(Math.round(runway))} days`} sub="of spending covered" color="var(--acc)" />
          <div className="track h10"><span className="fill" style={{ width: `${runway == null ? 0 : Math.min(100, (runway / 365) * 100)}%` }} /></div>
          <div className="row" style={{ justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--faint)' }}><span>0</span><span>6 months</span><span>1 year</span></div>
          <p className="note">
            {burn30 > 0
              ? `At your last 30 days of personal spending and running costs (${iskBig(burn30)} a month), your wallet alone lasts this long${net30 > 0 ? ' — and you’re currently earning more than you spend.' : '.'}`
              : 'Nothing personal or recurring was spent in the last 30 days, so the wallet isn’t being drawn down.'}
          </p>
        </Panel>
      </div>

      <Goals
        funds={{ wallet, liquid, nw: nwReady ? nwTotal : null }}
        growth={{ wallet: walletGrowPerDay, liquid: liquidGrowPerDay, nw: nwGrowPerDay }}
        earned={earned}
      />

      <div className="g-300">
        <Panel title="Running costs">
          <Figure value={`${iskBig(runningT)} a month`} sub={f30.inTotal > 0 ? `${pct(runningT / f30.inTotal, 1)} of your income keeps the lights on` : 'In the last 30 days'} color="var(--ink)" />
          <div>
            <div className="lrow"><span><span className="lt" style={{ fontSize: 13 }}>Omega</span><span className="ls">Paid with real money or PLEX — not counted</span></span><span className="lv" style={{ color: '#90a5b8' }}>–</span></div>
            {running.map((l) => (
              <div key={l.key} className="lrow"><span><span className="lt" style={{ fontSize: 13 }}>{l.label}</span><span className="ls">{RUN_NOTE[l.key]?.(l.count) ?? `${l.count} entries`}</span></span><span className="lv">{iskBig(l.amount)}</span></div>
            ))}
            {!running.length && <p className="note" style={{ marginTop: 8 }}>No rent, couriers, planet tax or clone fees in the last 30 days.</p>}
          </div>
        </Panel>
        <ShipsLost d={d} now={now} hasScope={(auth?.scopes ?? []).includes(KILLMAIL_SCOPE)} />
        <Unusual d={d} journal={journal} now={now} />
      </div>

      <Report journal={journal} txList={txList} classOf={classOf} m0={m0} now={now} monthName={monthName} describe={describe} characterName={auth?.characterName ?? null} posSeries={posSeries} />
    </div>
  );
}

function WalletHead({ days, setDays }: { days: Days; setDays: (d: Days) => void }) {
  return (
    <PageHead
      kicker="00 · Home" title="Wallet" wide
      lede="Where your ISK comes from, where it goes, and what you’re really worth. Built from your wallet journal, which records the balance after every single entry."
      actions={<Seg label="Period" value={days} onChange={setDays} options={([1, 7, 30, 90] as Days[]).map((v) => ({ v, label: v === 1 ? '24 hours' : `${v} days` }))} />}
    />
  );
}

function NetWorth(props: {
  parts: { l: string; v: number; c: string; text?: string }[]; total: number; ready: boolean; points: { date: string; total: number }[]; base: { date: string; total: number } | null;
  periodWords: string; growPerDay: number | null; hasAssets: boolean; unpricedLp: number; windowStart: number; lpHeld: boolean;
}) {
  const { parts, total, ready, points, base } = props;
  const change = ready && base ? total - base.total : null;
  // The history may not reach back to the start of the window; say where it really starts.
  const partial = !!base && Date.parse(base.date) > props.windowStart + DAY;
  return (
    <Panel title="Net worth">
      <Figure
        value={ready ? iskBig(total) : 'Pricing…'} color="var(--pos)"
        sub={change != null && points.length > 1
          ? `${iskBigSigned(change)} ${partial ? `since ${fmtShort(base!.date)}` : props.periodWords}${props.growPerDay != null ? ` · ${iskBigSigned(props.growPerDay)} a day` : ''}`
          : 'The trend starts today: this browser records your net worth once a day'}
      />
      {points.length > 1 && <MiniLine values={[...points.map((p) => p.total), ...(ready ? [total] : [])]} />}
      <div className="bar16" aria-hidden="true">
        {parts.filter((p) => p.v > 0).map((p) => <div key={p.l} data-tip={`${p.l} — ${iskBig(p.v)}`} style={{ width: `${(p.v / Math.max(1, total)) * 100}%`, background: p.c }} />)}
      </div>
      <div className="g-220">
        {parts.map((p) => (
          <div key={p.l} className="kv" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-4)' }}>
            <span className="row tight" style={{ color: 'var(--body)' }}><span style={{ width: 8, height: 8, flex: 'none', background: p.c }} />{p.l}</span>
            <span className="v" style={{ color: p.text ? 'var(--note)' : 'var(--sec)' }}>{p.text ?? iskBig(p.v)}</span>
          </div>
        ))}
      </div>
      <p className="note">
        Buying stock lowers your wallet but not your net worth — this is the number that shows real growth.
        {props.hasAssets ? ' Assets use CCP’s rough average prices, which flatter anything hard to sell; blueprint copies are left out.' : ' Assets aren’t counted: that needs the assets permission.'}
        {props.lpHeld && ' Loyalty points count at what the Loyalty page’s spend plan would make from them after fees, and only as many as the markets can take; they’re re-priced every twelve hours.'}
      </p>
    </Panel>
  );
}

type Place = { k: string; l: string; v: number | null; d: string; flag?: string; dest?: number; named?: boolean };

function WhereItSits(props: {
  d: Data; value: (x: Record<number, number> | undefined) => number; rough: Record<number, number> | null; sellValue: number; escrow: number;
  lp: { corporationId: number; points: number; rate: number | null; valued: number }[]; now: number; hasAssets: boolean;
}) {
  const { d, value, rough, now } = props;
  const auth = useAuth();
  const canDest = (auth?.scopes ?? []).includes(SCOPE.waypoint);
  const byLoc = d.stock?.byLocation ?? {};
  const locIds = Object.keys(byLoc).map(Number).filter((id) => id !== JITA_44);
  const corpIds = props.lp.filter((b) => b.points > 0).map((b) => b.corporationId);
  const [names, setNames] = useState<Record<number, string>>({});
  // Stations and solar systems have public names; corporations too.
  const idKey = [...locIds.filter((id) => isStation(id) || isSystem(id)), ...corpIds].join(',');
  useEffect(() => {
    const ids = idKey ? idKey.split(',').map(Number) : [];
    if (!ids.length) return;
    let alive = true;
    resolveNames(ids).then((n) => { if (alive) setNames(n); }).catch(() => undefined);
    return () => { alive = false; };
  }, [idKey]);
  // Player structures only answer to a login with the structures permission, and only if you're on
  // their access list.
  const [structs, setStructs] = useState<Record<number, StructureRead>>({});
  const structKey = locIds.filter(isStructure).join(',');
  useEffect(() => {
    const ids = structKey ? structKey.split(',').map(Number) : [];
    if (!ids.length) return;
    let alive = true;
    Promise.all(ids.map(async (id) => [id, await structureInfo(id)] as const))
      .then((list) => { if (alive) setStructs(Object.fromEntries(list)); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [structKey, auth?.scopes.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastTradeAt = (loc: number) => Object.values(d.txs).filter((t) => t.locationId === loc).reduce((m, t) => Math.max(m, Date.parse(t.date)), 0);
  const place = (id: number): { l: string; named: boolean; note?: string } => {
    if (isStation(id)) return names[id] ? { l: names[id], named: true } : { l: 'A station', named: false };
    // Named for the row, but not for "the stock at …" in the note, where it wouldn't read.
    if (isSystem(id)) return { l: `In space${names[id] ? ` · ${names[id]}` : ''}`, named: false };
    if (isStructure(id)) {
      const r = structs[id];
      if (r?.status === 'found') return { l: r.name, named: true };
      if (r?.status === 'refused') return { l: 'A structure you can’t see into', named: false, note: 'ESI says you’re not on its access list, so you may not be able to dock there to fetch this' };
      if (r?.status === 'unchecked') return { l: 'A player structure', named: false, note: 'Add the structure-names permission in Settings to see which' };
      return { l: 'A player structure', named: false };
    }
    return { l: `Location ${id}`, named: false };
  };

  const rows: Place[] = [];
  const jitaItems = byLoc[JITA_44] ?? d.stock?.jita;
  if (d.stock) rows.push({ k: 'jita', l: 'Jita 4-4 hangar', v: rough ? value(jitaItems) : null, d: `${units(Object.keys(jitaItems ?? {}).length)} kinds of item, loose`, dest: JITA_44, named: true });
  rows.push({ k: 'sell', l: 'In sell orders', v: props.sellValue, d: 'Working' });
  rows.push({ k: 'escrow', l: 'Buy order escrow', v: props.escrow, d: 'Working' });
  for (const id of locIds) {
    const v = rough ? value(byLoc[id]) : null;
    const last = lastTradeAt(id);
    const idle = now - last > 30 * DAY;
    const p = place(id);
    const traded = last ? `Last traded there ${fmtDate(last)}` : 'No trades there that this browser has seen';
    rows.push({ k: `loc:${id}`, l: p.l, v, d: p.note ? `${p.note}. ${traded}` : traded, flag: idle ? 'Idle' : undefined, dest: id, named: p.named });
  }
  if (d.stock?.nested && Object.keys(d.stock.nested).length) rows.push({ k: 'nested', l: 'Inside ships and containers', v: rough ? value(d.stock.nested) : null, d: 'Fitted to ships or packed away' });
  const wraps = d.stock?.safety ?? [];
  if (wraps.length) {
    const inWraps: Record<number, number> = {};
    for (const w of wraps) for (const [id, q] of Object.entries(w.items)) inWraps[Number(id)] = (inWraps[Number(id)] ?? 0) + q;
    const waiting = wraps.filter((w) => w.state === 'waiting').length;
    rows.push({ k: 'safety', l: 'In asset safety', v: rough ? value(inWraps) : null, flag: 'Idle',
      d: waiting ? `${units(wraps.length)} wrap${wraps.length === 1 ? '' : 's'}, ${waiting === wraps.length ? 'waiting to be delivered' : `${units(waiting)} waiting to be delivered`}: see below` : 'Delivered, waiting to be unpacked: see below' });
  }
  for (const b of props.lp.filter((x) => x.points > 0)) {
    rows.push({
      k: `lp:${b.corporationId}`,
      l: `Loyalty points${names[b.corporationId] ? ` · ${names[b.corporationId]}` : ''}`, v: b.rate != null ? b.valued * b.rate : null, flag: 'Idle',
      d: b.rate == null ? `${units(b.points)} LP, being priced from the store`
        : b.rate === 0 ? `${units(b.points)} LP — nothing in the store turns them into a profit right now`
        : b.valued < b.points ? `${units(b.valued)} of ${units(b.points)} LP at ${b.rate.toFixed(0)} ISK a point — as many as the store’s markets can take now`
          : `${units(b.points)} LP at ${b.rate.toFixed(0)} ISK a point: what the store’s best offers would make from them now`,
    });
  }
  const sorted = rows.sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  const [allPlaces, setAllPlaces] = useState(false);
  const shown = allPlaces ? sorted : sorted.slice(0, 8);
  const idleNames = shown.filter((r) => r.flag === 'Idle' && r.k.startsWith('loc:') && r.named).map((r) => r.l);
  const idleElsewhere = shown.some((r) => r.flag === 'Idle' && r.k.startsWith('loc:') && !r.named);
  const idleLp = shown.some((r) => r.flag === 'Idle' && r.k.startsWith('lp:'));
  const anyPlace = shown.some((r) => r.dest != null);

  async function go(r: Place) {
    if (r.dest == null) return;
    try {
      await setDestination(r.dest);
      const what = /^A (player )?structure/.test(r.l) ? 'that structure' : r.l.replace(/^In space · /, '');
      toast(`Destination set to ${what} in your client. Switch to the game to undock.`, 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    }
  }

  return (
    <Panel title="Where your wealth sits">
      <div>
        {shown.map((r) => (
          <div key={r.k} className="lrow">
            <span style={{ minWidth: 0 }}>
              <span className="lt" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {r.dest != null && canDest ? (
                  <button type="button" className="dest-btn" onClick={() => go(r)} data-tip="Set as your autopilot destination in game. It plots the route; you still fly it." data-tip-title="Set destination">
                    {r.l}<MapPin aria-hidden="true" />
                  </button>
                ) : r.l}
                {r.flag && <span className="flag" style={{ fontSize: 10, color: 'var(--acc2)', borderColor: 'color-mix(in oklab,var(--acc2) 50%,transparent)' }}>{r.flag}</span>}
              </span>
              <span className="ls">{r.d}</span>
            </span>
            <span className="lv">{r.v == null ? (rough || !props.hasAssets ? '–' : 'Pricing…') : iskBig(r.v)}</span>
          </div>
        ))}
        {sorted.length > 8 && (
          <button type="button" className="link-btn" style={{ marginTop: 8 }} onClick={() => setAllPlaces(!allPlaces)}>
            {allPlaces ? 'Show the biggest 8' : `Show all ${sorted.length}: ${sorted.length - shown.length} smaller place${sorted.length - shown.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
      <p className="note">
        {!d.stock ? 'Hangars aren’t counted: that needs the assets permission.'
          : !d.stock.byLocation ? 'Sync again to see stock at other stations — this sync predates the per-station count.'
            : idleNames.length || idleElsewhere || idleLp
              ? `Idle ISK earns nothing.${idleNames.length || idleElsewhere ? ` The stock at ${idleNames.length ? idleNames.slice(0, 2).join(' and ') : 'the places marked idle'}${idleNames.length > 2 || (idleNames.length && idleElsewhere) ? ' and elsewhere' : ''} could be hauled to Jita${idleLp ? ',' : '.'}` : ''}${idleLp ? `${idleNames.length || idleElsewhere ? ' and the' : ' The'} loyalty points spent from the Loyalty page.` : ''}`
              : 'Everything is either working in orders or at hand in Jita.'}
        {anyPlace && (canDest ? ' Click a place to set it as your destination in game.' : ' With the set-destination permission, clicking a place would plot a route to it in game.')}
      </p>
    </Panel>
  );
}

/** A row of "Trades no position tracks": one trade, or purchases made in one go. */
type UntrackedRow = { kind: 'tx'; tx: Tx; at: string } | { kind: 'multi'; g: Multibuy; txs: Tx[]; at: string };

function Untracked(props: { d: Data; txs: Tx[]; tagOf: (tx: Tx) => UntrackedTag; explicit: (id: string) => boolean; multis: Multibuy[]; ships: ReadonlySet<number>; freelance: (tx: Tx) => boolean; periodWords: string }) {
  const { d, txs, tagOf } = props;
  const name = useTypeName();
  const [all, setAll] = useState(false);
  const [openMulti, setOpenMulti] = useState<Set<string>>(() => new Set());
  // A multibuy is one row while at least two of its purchases are here; each opens to its purchases.
  const rows = useMemo(() => {
    const here = new Map(txs.map((t) => [t.id, t]));
    const out: UntrackedRow[] = [];
    for (const g of props.multis) {
      const ts = g.txIds.map((id) => here.get(id)).filter((t): t is Tx => !!t);
      if (ts.length < 2) continue;
      ts.forEach((t) => here.delete(t.id));
      out.push({ kind: 'multi', g, txs: ts.sort((a, b) => b.qty * b.unitPrice - a.qty * a.unitPrice), at: g.at });
    }
    for (const tx of here.values()) out.push({ kind: 'tx', tx, at: tx.date });
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [txs, props.multis]);
  const shown = all ? rows : rows.slice(0, 8);
  const setTags = (list: Tx[], tag: UntrackedTag) => update((x) => {
    const ids = new Set(list.map((t) => t.id));
    const tags = { ...x.tags };
    for (const id of ids) { delete tags[id]; if (tag !== 'personal') tags[id] = tag; }
    const rest = x.ignored.filter((i) => !ids.has(i));
    return { tags, ignored: tag === 'personal' ? [...rest, ...ids] : rest };
  });
  const setTag = (tx: Tx, tag: UntrackedTag) => setTags([tx], tag);
  const why = (tx: Tx, tag: UntrackedTag) => {
    if (props.explicit(tx.id)) return tag === 'personal' ? 'You marked it personal' : 'You said what it was';
    return tag === 'loot' ? 'Sold without ever buying one — loot or a drop' : 'No position counts it';
  };
  const start = (tx: Tx) => {
    const res = startPosition(tx.typeId, new Date(Date.parse(tx.date) - 1000).toISOString(), tx.locationId === JITA_44);
    if (res.existed) toast(`You already have an open position for ${name(tx.typeId)}. This trade may fall outside its dates.`, 'warn');
    else if (res.movedTo) toast(`It starts ${res.movedTo.slice(0, 16).replace('T', ' ').replace(/-/g, '.')} EVE, when your last ${name(tx.typeId)} position closed, so this trade isn’t in it.`, 'warn');
    navigate(`positions/${res.id}`);
  };
  const txRow = (tx: Tx, inGroup = false) => {
    const tag = tagOf(tx);
    const look = TAG_LOOK[tag];
    const hasOpen = d.positions.some((p) => p.typeId === tx.typeId && p.status === 'open');
    return (
      <tr key={tx.id} className="hover">
        <td className="l" style={inGroup ? { paddingLeft: 40 } : undefined}><span className="name" style={{ fontWeight: 400, fontSize: 13.5 }}>{name(tx.typeId)}</span></td>
        <td className="l" style={{ color: 'var(--sec)', fontFamily: 'var(--f-body)' }}>{tx.isBuy ? 'Bought' : 'Sold'} <span style={{ color: 'var(--faint)' }}>{fmtShort(tx.date)}</span></td>
        <td>{units(tx.qty)}</td>
        <td className="l" style={{ color: 'var(--note)', fontFamily: 'var(--f-body)', whiteSpace: 'normal' }}>{inGroup && !props.explicit(tx.id) ? '' : props.freelance(tx) ? `${tx.isBuy ? 'Bought' : 'Sold'} for a freelance job you’re in: counted under Freelance` : why(tx, tag)}</td>
        <td style={{ color: tx.isBuy ? 'var(--neg-t)' : 'var(--pos)' }}>{tx.isBuy ? '−' : '+'}{iskBig(tx.qty * tx.unitPrice)}</td>
        <td className="l">
          <button type="button" className="tag-btn" style={cssVars({ '--c': props.freelance(tx) ? '#f5b86b' : look.c })} onClick={() => setTag(tx, nextTag(tag))}
            data-tip="Click to change what this counts as: loot sale, personal, trading, or other.">{props.freelance(tx) ? 'Freelance' : tx.isBuy ? look.buy : look.sell}</button>
        </td>
        <td>{!inGroup && (tag === 'trading' || tag === 'other') && !hasOpen && <button type="button" className="link-btn" onClick={() => start(tx)}>Start a position</button>}</td>
      </tr>
    );
  };
  return (
    <Panel title="Trades no position tracks" sub="Sorted automatically. Click a tag if it guessed wrong." label="Untracked trades">
      {!rows.length ? <p className="note">Every trade {props.periodWords} is counted by a position.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl compact" style={{ minWidth: 720 }}>
            <thead><tr><th scope="col" className="l">Item</th><th scope="col" className="l">Trade</th><th scope="col">Qty</th><th scope="col" className="l">Why it’s here</th><th scope="col">Value</th><th scope="col" className="l">Counts as</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.flatMap((r) => {
                if (r.kind === 'tx') return [txRow(r.tx)];
                const tags = [...new Set(r.txs.map(tagOf))];
                const tag = tags.length === 1 ? tags[0] : null;
                const guessed = r.txs.every((t) => !props.explicit(t.id));
                const ship = r.txs.find((t) => props.ships.has(t.typeId));
                const open = openMulti.has(r.g.key);
                const value = r.txs.reduce((v, t) => v + t.qty * t.unitPrice, 0);
                const look = tag ? TAG_LOOK[tag] : null;
                return [
                  <tr key={r.g.key} className="hover">
                    <td className="l" style={{ whiteSpace: 'normal' }}>
                      <button type="button" className="panel-toggle" aria-expanded={open}
                        onClick={() => setOpenMulti((s) => { const n = new Set(s); if (n.has(r.g.key)) n.delete(r.g.key); else n.add(r.g.key); return n; })}>
                        <ChevronRight className="chev" aria-hidden="true" />
                        <span className="name" style={{ fontWeight: 400, fontSize: 13.5 }}>
                          {ship ? `${name(ship.typeId)} and its fitting` : `${units(r.txs.length)} items in one go`}
                          <span className="faint"> · {units(r.txs.length)} purchases</span>
                        </span>
                      </button>
                    </td>
                    <td className="l" style={{ color: 'var(--sec)', fontFamily: 'var(--f-body)' }}>Bought <span style={{ color: 'var(--faint)' }}>{fmtShort(r.at)}</span></td>
                    <td>–</td>
                    <td className="l" style={{ color: 'var(--note)', fontFamily: 'var(--f-body)', whiteSpace: 'normal' }}>
                      {!guessed ? 'You said what they were' : ship ? 'Bought in one go with a ship: a fit to fly, most likely' : 'Bought in one go (the Multibuy window, or a fitting’s Buy all)'}
                    </td>
                    <td style={{ color: 'var(--neg-t)' }}>−{iskBig(value)}</td>
                    <td className="l">
                      <span className="row tight" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <button type="button" className="tag-btn" style={cssVars({ '--c': look?.c ?? 'var(--sec)' })} onClick={() => setTags(r.txs, nextTag(tag ?? 'other'))}
                          data-tip="Click to change what all of these count as: loot, personal, trading, or other. Open the row to set one on its own.">{look ? look.buy : 'Mixed'}</button>
                        {guessed && tag && (
                          <button type="button" className="link-btn" onClick={() => setTags(r.txs, tag)}
                            data-tip={`Keep the guess: marks all ${r.txs.length} as ${look!.buy.toLowerCase()} for good, so every page counts them that way, not only the Wallet.`}>Confirm</button>
                        )}
                      </span>
                    </td>
                    <td />
                  </tr>,
                  ...(open ? r.txs.map((t) => txRow(t, true)) : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 8 && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
      <p className="note">Loot you sell from missions and abyssals lands in “Loot &amp; other sales” above. Anything marked personal counts as play in Trading against play below.</p>
    </Panel>
  );
}

function ShipsLost({ d, now, hasScope }: { d: Data; now: number; hasScope: boolean }) {
  const name = useTypeName();
  const losses = Object.values(d.killmails).filter((k) => k.kind === 'loss' && now - Date.parse(k.time) <= 30 * DAY).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const total = losses.reduce((t, k) => t + netLoss(k), 0);
  const [systems, setSystems] = useState<Record<number, string>>({});
  const sysKey = [...new Set(losses.map((k) => k.systemId).filter((id) => !isAbyssalSystem(id)))].join(',');
  useEffect(() => {
    if (!sysKey) return;
    let alive = true;
    Promise.all(sysKey.split(',').map(Number).map((id) => system(id).then((s) => [id, s.name] as const).catch(() => [id, ''] as const)))
      .then((list) => { if (alive) setSystems(Object.fromEntries(list)); });
    return () => { alive = false; };
  }, [sysKey]);
  return (
    <Panel title="Ships lost">
      <Figure value={losses.length ? `−${iskBig(total)}` : '0'} sub="lost in the last 30 days, net of insurance" color="var(--neg-t)" />
      {!hasScope && !Object.keys(d.killmails).length ? <p className="note">Needs the killmails permission. Settings says how to add it.</p> : !losses.length ? (
        <p className="note row tight" style={{ color: 'var(--pos)' }}><ShieldCheck aria-hidden="true" style={{ width: 16, height: 16 }} />No ships lost in the last 30 days.</p>
      ) : (
        <div>
          {losses.slice(0, 4).map((k) => (
            <div key={k.id} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line-4)' }}>
              <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', border: '1px solid var(--neg)', color: 'var(--neg)' }}><Flame aria-hidden="true" style={{ width: 16, height: 16 }} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{k.victim.shipTypeId ? name(k.victim.shipTypeId) : 'A ship'} <span style={{ color: 'var(--note)' }}>· {isAbyssalSystem(k.systemId) ? 'Abyssal deadspace' : systems[k.systemId] || '…'}</span></span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--note)' }}>{fmtShort(k.time)} · {k.value ? `Fit worth ${iskBig(k.value.total)}${k.insurance ? ` · insurance paid ${iskBig(k.insurance)}` : ' · no insurance paid'}` : 'Being priced'}</span>
              </span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--neg-t)' }}>{k.value ? `−${iskBig(netLoss(k))}` : '…'}</span>
            </div>
          ))}
        </div>
      )}
      <p className="note small">From your killmails, priced at Jita on the day each happened. Open Combat for the fits and a refit list.</p>
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('combat')}><Crosshair aria-hidden="true" />Open Combat</button>
    </Panel>
  );
}

function Unusual({ d, journal, now }: { d: Data; journal: JournalEntry[]; now: number }) {
  const list = useMemo(() => unusual(journal, now - 30 * DAY), [journal, Math.floor(now / 3600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = list.filter((u) => !d.unusualOk.includes(u.id));
  const [open, setOpen] = useState<string | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const other = (e: JournalEntry) => (e.amount > 0 ? e.firstPartyId : e.secondPartyId);
  const idKey = [...new Set(shown.map((u) => other(u.entry)).filter((x): x is number => x != null))].join(',');
  useEffect(() => {
    if (!idKey) return;
    let alive = true;
    resolveNames(idKey.split(',').map(Number)).then((n) => { if (alive) setNames(n); }).catch(() => undefined);
    return () => { alive = false; };
  }, [idKey]);
  const who = (e: JournalEntry) => { const id = other(e); return id != null ? names[id] ?? 'someone' : 'someone'; };
  return (
    <Panel title="Unusual activity" sub="A light safety net against scams and account theft">
      {!shown.length ? (
        <p className="note row tight" style={{ color: 'var(--pos)' }}><ShieldCheck aria-hidden="true" style={{ width: 16, height: 16 }} />Nothing unusual in the last 30 days.</p>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {shown.map((u) => {
            const e = u.entry;
            const look = u.kind === 'donationIn'
              ? { Icon: HandCoins, c: 'var(--acc2)', t: 'Donation received', d: `${iskBig(e.amount)} from ${who(e)} — you’ve never dealt with them before. Often the opening of a scam.` }
              : u.kind === 'donationOut'
                ? { Icon: TriangleAlert, c: 'var(--neg)', t: 'Large donation sent', d: `${iskBig(-e.amount)} to ${who(e)}. If that wasn’t you, someone else can use your account.` }
                : { Icon: TriangleAlert, c: 'var(--neg)', t: 'Contract at an unusual hour', d: `A contract ${e.amount < 0 ? 'payment' : 'receipt'} of ${iskBig(Math.abs(e.amount))} at ${hhmm(e.date)} EVE — an hour you’re almost never active.` };
            return (
              <div key={u.id} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'rgba(2,7,12,.5)', borderLeft: `2px solid ${look.c}` }}>
                <look.Icon aria-hidden="true" style={{ width: 18, height: 18, color: look.c, flex: 'none', marginTop: 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{look.t}</div>
                  <div style={{ fontSize: 12.5, color: '#b6c6d4', marginTop: 2 }}>{look.d}</div>
                  {open === u.id && (
                    <div className="col" style={{ gap: 4, marginTop: 8, fontSize: 12.5, animation: 'unfold .25s ease-out' }}>
                      <div className="kv"><span style={{ color: 'var(--dim)' }}>When</span><span className="v">{fmtDateTime(e.date)}</span></div>
                      <div className="kv"><span style={{ color: 'var(--dim)' }}>Journal type</span><span className="v">{e.refType}</span></div>
                      <div className="kv"><span style={{ color: 'var(--dim)' }}>Amount</span><span className="v">{iskBigSigned(e.amount)}</span></div>
                      {e.balance != null && <div className="kv"><span style={{ color: 'var(--dim)' }}>Balance after</span><span className="v">{iskBig(e.balance)}</span></div>}
                      {e.description && <div style={{ color: 'var(--sec)' }}>{e.description}</div>}
                      {e.reason && <div style={{ color: 'var(--sec)' }}>Reason given: “{e.reason}”</div>}
                      {u.kind !== 'donationIn' && <p className="note small">If this wasn’t you: change your EVE password, then remove any third-party applications you don’t recognise from your account page.</p>}
                    </div>
                  )}
                  <div className="row" style={{ gap: 14, marginTop: 8 }}>
                    <button type="button" className="link-btn" onClick={() => { update((x) => ({ unusualOk: [...x.unusualOk, u.id] })); toast('Marked as expected.', 'info'); }}>That was me</button>
                    <button type="button" className="link-btn" onClick={() => setOpen(open === u.id ? null : u.id)}>{open === u.id ? 'Hide details' : 'Look into it'}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="note small">Flags ISK from someone you’ve never dealt with, large ISK sent to another player, and big contracts at hours you’re never otherwise active. Prompts, not verdicts.</p>
    </Panel>
  );
}

function Report(props: {
  journal: JournalEntry[]; txList: Tx[]; classOf: (tx: Tx) => TradeClass; m0: number; now: number; monthName: string;
  describe: (e: JournalEntry) => string; characterName: string | null;
  posSeries: { p: Position; series: SeriesPoint[] }[];
}) {
  const { journal, txList, classOf, m0, now, monthName } = props;
  const name = useTypeName();
  const fm = flows(journal, txList, classOf, m0);
  const net = fm.inTotal - fm.outTotal;
  // Weeks of the month from the 1st, so the last one may be short.
  const weeks: { from: number; to: number; net: number }[] = [];
  for (let s = m0; s < now; s += 7 * DAY) {
    const to = Math.min(s + 7 * DAY, now);
    const w = flows(journal, txList, classOf, s, to);
    weeks.push({ from: s, to, net: w.inTotal - w.outTotal });
  }
  const best = weeks.length > 1 ? [...weeks].sort((a, b) => b.net - a.net)[0] : null;
  const earners = props.posSeries.map(({ p, series }) => ({ p, v: realizedBetween(series, m0, now) })).sort((a, b) => b.v - a.v);
  const top = earners[0] && earners[0].v > 0 ? earners[0] : null;
  const fees = feeLeak(journal, m0).total;
  const tiles = [
    { l: 'Net', v: iskBigSigned(net), c: net >= 0 ? 'var(--pos)' : 'var(--neg)' },
    { l: 'Best week', v: best ? `${new Date(best.from).getUTCDate()}–${new Date(best.to - 1).getUTCDate()} ${new Date(best.from).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}` : '–' },
    { l: 'Top earner', v: top ? name(top.p.typeId) : '–' },
    { l: 'Fees paid', v: iskBig(fees), c: 'var(--acc2)' },
  ];
  const stamp = new Date(m0).toISOString().slice(0, 7);

  const csv = () => {
    const rows = journal.filter((e) => Date.parse(e.date) >= m0).sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || Number(a.id) - Number(b.id));
    const lines = [['Date (EVE)', 'What', 'Journal type', 'Amount', 'Balance after', 'Description'].join(',')];
    for (const e of rows) lines.push([e.date.replace('T', ' ').replace('Z', ''), props.describe(e), e.refType, e.amount.toFixed(2), e.balance?.toFixed(2) ?? '', e.description ?? ''].map(csvCell).join(','));
    downloadText(`jita-ledger-${stamp}.csv`, lines.join('\n'), 'text/csv');
    toast(`Saved jita-ledger-${stamp}.csv with ${units(rows.length)} journal entries.`);
  };

  const image = async () => {
    const W = 1200, H = 630;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!g) return;
    await document.fonts?.ready;
    const css = getComputedStyle(document.documentElement);
    const acc = css.getPropertyValue('--acc').trim() || '#4fd1ff';
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b1622'); bg.addColorStop(1, '#03070c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = acc; g.lineWidth = 2; g.strokeRect(24, 24, W - 48, H - 48);
    g.fillStyle = acc; g.font = '600 22px "Chakra Petch", sans-serif';
    g.fillText('JITA LEDGER', 64, 88);
    g.fillStyle = '#eef6fc'; g.font = '600 52px "Chakra Petch", sans-serif';
    g.fillText(`${monthName.toUpperCase()} ${new Date(m0).getUTCFullYear()}`, 64, 156);
    if (props.characterName) { g.fillStyle = '#adbfcf'; g.font = '400 24px Barlow, sans-serif'; g.fillText(props.characterName, 64, 196); }
    tiles.forEach((t, i) => {
      const x = 64 + (i % 2) * 540, y = 280 + Math.floor(i / 2) * 150;
      g.fillStyle = '#a8bbcc'; g.font = '600 18px "Chakra Petch", sans-serif';
      g.fillText(t.l.toUpperCase(), x, y);
      g.fillStyle = t.c?.startsWith('var(') ? (t.c === 'var(--pos)' ? '#6ee7a8' : t.c === 'var(--neg)' ? '#ff6b7d' : css.getPropertyValue('--acc2').trim() || '#ffb454') : '#eef6fc';
      g.font = '500 44px "JetBrains Mono", monospace';
      g.fillText(String(t.v), x, y + 56);
    });
    g.fillStyle = '#6f8599'; g.font = '400 16px Barlow, sans-serif';
    g.fillText('Built from the wallet journal. Market data from ESI. Not affiliated with CCP.', 64, H - 56);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Report image copied to your clipboard.');
    } catch {
      downloadBlob(`jita-ledger-${stamp}.png`, blob);
      toast(`Saved jita-ledger-${stamp}.png.`);
    }
  };

  return (
    <Panel title={`${monthName} report`} sub={
      <span className="row" style={{ gap: 14 }}>
        <button type="button" className="link-btn" onClick={csv}><FileSpreadsheet aria-hidden="true" />Export CSV</button>
        <button type="button" className="link-btn" onClick={image}><ImageIcon aria-hidden="true" />Share as image</button>
      </span>
    }>
      <div className="g-170">
        {tiles.map((t) => (
          <div key={t.l} style={{ padding: '12px 14px', background: 'rgba(2,7,12,.5)', border: '1px solid var(--line-3)', minWidth: 0 }}>
            <div className="lbl">{t.l}</div>
            <div className="mono ellipsis" style={{ fontSize: 18, color: t.c ?? 'var(--figure)', marginTop: 4 }}>{t.v}</div>
          </div>
        ))}
      </div>
      <p className="note small">From the 1st of {monthName} to now. Top earner is the position that realized the most profit this month.</p>
    </Panel>
  );
}

/**
 * Everything you earned against what you spent on play: the user's ask beside "Trading against play", which counts only
 * positions ("I have other income as well", 30 September 2026). Trading is every item bought and sold again, by its
 * profit, as Results' "Every item traded" counts it (positions, snipes and the rest); each other activity by Results' own
 * rules; and what was sold but never bought (loot, ore, datacores) by what it sold for after tax. An item an activity counts (filaments, abyssal
 * loot, planetary and loyalty-store goods) is that activity's alone, so nothing is counted twice. Play is the same
 * Personal spending as beside.
 */
function AllIncome({ d, acts, play, since, now, periodWords }: { d: Data; acts: ReturnType<typeof useActivityEvents>; play: number; since: number; now: number; periodWords: string }) {
  const calcs = useMemo(() => everyItemCalcs(d), [d.txs, d.journal, d.orders, d.settings, d.meta.rateHistory, d.ignored]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => calcs.map((c) => itemResult(c, since - 1, now)), [calcs, since, now]);
  const inWindow = (t: number) => t >= since && t <= now;
  const sets = acts.typeSets;
  const activityItem = (id: number) => !!sets && (sets.filaments.has(id) || sets.abyssLoot.has(id) || sets.pi.has(id) || sets.lpGoods.has(id));
  const trading = items.filter((r) => isTrade(r) && !activityItem(r.typeId)).reduce((t, r) => t + r.profit, 0);
  const neverBought = new Set(items.filter((r) => isUnbought(r) && !activityItem(r.typeId)).map((r) => r.typeId));
  const loot = acts.others.filter((e) => inWindow(e.t) && neverBought.has(e.typeId)).reduce((t, e) => t + e.isk, 0);
  const rows = [
    { key: 'trading', said: 'Trading, every item', color: ACTIVITY_COLOR.Trading, isk: trading,
      tip: 'Every item you bought and sold again, by its profit: positions, snipes and anything traded without one, as Results’ “Every item traded” counts it. Personal trades are left out.' },
    ...ACTIVITIES.filter((a) => a !== 'Trading').map((a) => ({ key: a as string, said: a as string, color: ACTIVITY_COLOR[a], tip: ACTIVITY_WHAT[a], isk: acts.events.filter((e) => e.activity === a && inWindow(e.t)).reduce((t, e) => t + e.isk, 0) })),
    { key: 'loot', said: 'Sold, never bought', color: '#adbfcf', isk: loot,
      tip: 'Things you sold that you never bought: loot, salvage, ore, datacores, gifts, by what they sold for after sales tax. Abyssal loot, planetary and loyalty-store goods count with their activities, and Personal sales are left out. Something bought before the app’s records begin would count here too.' },
  ].filter((r) => Math.abs(r.isk) >= 1).sort((a, b) => b.isk - a.isk);
  const earned = rows.reduce((t, r) => t + r.isk, 0);
  const left = earned - play;
  const plus = rows.filter((r) => r.isk > 0);
  const scale = Math.max(1, plus.reduce((t, r) => t + r.isk, 0), play);
  return (
    <Panel title={<span className="row tight" style={{ gap: 6 }}>All income against play<Tip title="All income against play" text={'Everything you earned, against what you spent on play.\n\n• Trading is every item you bought and sold again, by its profit, not only your positions.\n• Each other activity is counted as on Results: freelance rewards less what the jobs cost, abyssal loot less filaments and ships lost, bounties less ships lost.\n• What you sold but never bought (loot, ore, datacores) counts by what it sold for, after tax.\n• Play is everything marked Personal, as in Trading against play.'} /></span>}>
      {!acts.ready ? <p className="note">Reading which items belong to which activity…</p> : (
        <>
          <div className="col" style={{ gap: 6 }}>
            {rows.length ? rows.map((r) => (
              <div key={r.key} className="kv" style={{ fontSize: 13.5 }} data-tip={r.tip} data-tip-title={r.said}>
                <span className="row tight" style={{ color: 'var(--body)', gap: 7 }}><span aria-hidden="true" style={{ width: 9, height: 9, background: r.color, flex: 'none' }} />{r.said}</span>
                <span className="v" style={{ color: r.isk >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(r.isk)}</span>
              </div>
            )) : <p className="note" style={{ margin: 0 }}>Nothing earned {periodWords}.</p>}
            <div className="kv" style={{ fontSize: 13.5, borderTop: '1px solid var(--line-3)', paddingTop: 6 }}><span style={{ color: 'var(--ink)' }}>All income</span><span className="v" style={{ color: earned >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(earned)}</span></div>
            <div className="kv" style={{ fontSize: 13.5 }}><span style={{ color: 'var(--body)' }}>Spent on play</span><span className="v" style={{ color: '#ff8d9a' }}>−{iskBig(play)}</span></div>
            <div className="kv" style={{ fontSize: 13.5 }}><span style={{ color: 'var(--body)' }}>What’s left</span><span className="v" style={{ color: 'var(--acc)' }}>{iskBigSigned(left)}</span></div>
          </div>
          {/* What came in, by source, above what play took, on one scale. */}
          <div className="col" style={{ gap: 4 }} aria-hidden="true">
            <div className="row tight" style={{ gap: 8 }}>
              <span className="lbl" style={{ width: 46, flex: 'none' }}>In</span>
              <div style={{ flex: 1, display: 'flex', height: 12, background: 'var(--track)' }}>
                {plus.map((r) => <span key={r.key} data-tip={`${r.said}: ${iskBigSigned(r.isk)}`} style={{ width: `${(r.isk / scale) * 100}%`, background: r.color }} />)}
              </div>
            </div>
            <div className="row tight" style={{ gap: 8 }}>
              <span className="lbl" style={{ width: 46, flex: 'none' }}>Play</span>
              <div style={{ flex: 1, height: 12, background: 'var(--track)' }}><span style={{ display: 'block', height: '100%', width: `${(play / scale) * 100}%`, background: '#ff8d9a' }} /></div>
            </div>
          </div>
          <p className="note" style={{ margin: 0 }}>
            {earned <= 0 ? (play > 0 ? 'Nothing earned more than it cost in this window, so play is coming out of savings.' : 'Nothing earned in this window.')
              : play <= earned ? `Everything you do pays for your flying, with ${iskBig(left)} left over.`
                : `You spent ${iskBig(play - earned)} more on play than you earned.`}
            {acts.failed ? ' The item groups couldn’t be read from ESI, so abyssal, planets, loyalty and things never bought aren’t counted; it tries again next visit.' : ''}
          </p>
        </>
      )}
    </Panel>
  );
}
