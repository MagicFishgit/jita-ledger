import { useEffect, useMemo, useState } from 'react';
import {
  Calculator as CalcIcon, Gauge, Hourglass, Info, Layers, LayoutGrid, ListChecks, Pause, Radar, RefreshCw, Scale, Shield, ShieldAlert, SlidersHorizontal, TrendingUp, Wallet,
} from 'lucide-react';
import { effectiveSkills, orderSlots } from '../lib/fees';
import { isk as iskFmt, iskBig, pct, units } from '../lib/format';
import { navigate } from '../lib/hooks';
import { allocate, PLANNER_EXCLUDES, PLANNER_HORIZONS, plannerFilters, SLOTS_PER_ITEM } from '../lib/planner';
import { horizonSaid, horizonShort, snapHorizon } from '../lib/prospects';
import { loadCache, rankProspects, useScanState, type ScanCache } from '../lib/scan';
import { update, useData } from '../lib/store';
import type { ProspectFilters } from '../lib/types';
import { BusyRelisting, useEnsureNames, useTypeName } from './common';
import { flip, WARNING } from './Prospects';
import { Empty, Flag, Guide, ItemIcon, NumChip, PageHead, Panel, Seg, Tiles } from './ui';
import { ScanFreshness } from './ScanFreshness';
import { ShareCheck } from './ShareCheck';
import { useCloud } from '../lib/cloud';
import { leaveSaid } from '../lib/track';
import { PlacingChecklist, StartPlanButton } from './PlanStart';

const KEY = 'jita-ledger:planner';
/** ISK and slots typed in on this visit: they hold until the tab closes, then the planner follows the wallet again. */
const SESSION_KEY = 'jita-ledger:planner-session';
const COLS = ['var(--acc)', '#a98bff', '#6ee7a8', 'var(--acc2)', '#ff8d9a', '#7aa6ff', '#eed79a', '#5fe0b5', '#ff9f6b', '#c7d2de'];

/** Kept between visits: the horizon, the cap per item and how to price. ISK and slots are read fresh each visit. */
type Inputs = { days: number | null; maxPct: number | null; patient?: boolean };
function readInputs(): Partial<Inputs> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Inputs>; } catch { return {}; }
}
type Override = { isk?: number | null; slots?: number | null };
function readOverride(): Override {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}') as Override; } catch { return {}; }
}
/** The Prospects page's own saved filters, which the planner draws from (see plannerFilters). */
function savedProspectFilters(): Partial<ProspectFilters> | null {
  try { return JSON.parse(localStorage.getItem('jita-ledger:prospects') || 'null')?.f ?? null; } catch { return null; }
}

export function Planner() {
  const d = useData();
  // How left orders have filled against the pace this plan's pricing expects, once the cloud has checked enough.
  const leaveRecord = leaveSaid(useCloud().track?.leave);
  const name = useTypeName();
  const scan = useScanState();
  const totalSlots = orderSlots(effectiveSkills(d.settings));
  const openList = Object.values(d.orders).filter((o) => o.state === 'open');
  const openOrders = openList.length;
  const openSells = openList.filter((o) => !o.isBuy).length;
  const freeSlots = Math.max(0, totalSlots - openOrders);
  // The wallet is what you can spend: buy orders' escrow has already left it. Rounded down to the million.
  const walletIsk = d.meta.walletBalance && d.meta.walletBalance > 0 ? Math.floor(d.meta.walletBalance / 1e6) * 1e6 : null;
  const saved = readInputs();
  const [inp, setInp] = useState<Inputs>({
    // Snapped onto the choices: a typed-in horizon from before they existed lands on the nearest.
    days: snapHorizon(saved.days ?? 3) ?? 3,
    maxPct: saved.maxPct ?? 25,
    patient: !!saved.patient,
  });
  const set = (p: Partial<Inputs>) => setInp((cur) => {
    const next = { ...cur, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window */ }
    return next;
  });
  // ISK and slots follow the wallet and your open orders, so the planner opens on what you have now. Once, both
  // were saved the first time they were typed and kept for good: the user found "ISK to deploy" at half a wallet
  // that had long since changed. A figure typed now holds for this visit only.
  const [over, setOver] = useState<Override>(readOverride);
  const override = (p: Override) => setOver((cur) => {
    const next = { ...cur, ...p };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* private window */ }
    return next;
  });
  const iskIn = over.isk != null ? over.isk : walletIsk;
  const slotsIn = over.slots != null ? over.slots : freeSlots;

  const [cache, setCache] = useState<ScanCache | null>(null);
  useEffect(() => { loadCache().then(setCache).catch(() => setCache({ stats: {}, books: {} })); }, [scan.saved, scan.phase]);

  const isk = iskIn ?? 0, slots = slotsIn, days = inp.days ?? 3, maxShare = Math.max(0, Math.min(100, inp.maxPct ?? 100)) / 100;
  const patient = !!inp.patient;
  const { plan, pool, excluded, unchecked } = useMemo(() => {
    if (!cache || !isk) return { plan: null, pool: 0, excluded: 0, unchecked: 0 };
    // Every market's own limit, not just those that could take the whole budget.
    const list = rankProspects(cache, d.settings, plannerFilters(savedProspectFilters(), isk, days, patient));
    const bad = list.filter((p) => p.warnings.some((w) => PLANNER_EXCLUDES.includes(w))).length;
    // Items scanned before the sell side and price jumps were judged: their spread hasn't been checked for either.
    const old = list.filter((p) => p.stats.lastMove === undefined || !p.stats.highs14).length;
    return { plan: allocate(list, { isk, slots, horizonDays: days, maxShare }), pool: list.length, excluded: bad, unchecked: old };
  }, [cache, d.settings, isk, slots, days, maxShare, patient]);

  useEnsureNames(plan?.rows.map((a) => a.p.typeId) ?? []);
  // What you already have working in each item, so the mix doesn't quietly double you up.
  const inOrders = useMemo(() => {
    const m = new Map<number, number>();
    for (const o of Object.values(d.orders)) if (o.state === 'open') m.set(o.typeId, (m.get(o.typeId) ?? 0) + o.price * o.volumeRemain);
    return m;
  }, [d.orders]);
  const inPositions = useMemo(() => new Set(d.positions.filter((p) => p.status === 'open').map((p) => p.typeId)), [d.positions]);
  const scanned = cache ? Object.keys(cache.books).length : 0;
  // Items whose orders you're leaving where they are (Orders and the To do list then leave them alone too).
  const leaving = new Set(d.leave);
  const planTypes = plan?.rows.map((a) => a.p.typeId) ?? [];
  const allLeft = planTypes.length > 0 && planTypes.every((t) => leaving.has(t));
  const idleWhy = !plan ? '' : plan.limit === 'slots'
    ? `Out of order slots — each item takes ${SLOTS_PER_ITEM}. Train Wholesale or free some up to put the rest to work.`
    : 'Every market that passes your Prospects filters is already at what it can take in your horizon. Allow longer, raise the cap per item, or run a deep scan.';

  return (
    <div className="page">
      <PageHead
        kicker="02b · Put ISK to work" title="Capital planner" wide
        lede="Tell it how much ISK and how many order slots you have free, and it builds a mix from your Prospects — best payback first (or, when free slots run out before the ISK, the markets that make the most a day), never more than a market can take, and never too much in one item. Anything flagged as a wall, spike, fluke, escrow bait or a price that just moved is left out."
      />
      <ScanFreshness what="the plan" />
      <ShareCheck what="Each market’s limit" />
      <div className="chipbar" data-rv="">
        <span className="chipbar-title"><SlidersHorizontal aria-hidden="true" />Budget</span>
        <NumChip id="pl-isk" label="ISK to deploy" value={iskIn} onChange={(v) => override({ isk: v })} width={160} decimals={0} placeholder="2b"
          tip={'Starts at your wallet, rounded down to the million: the ISK you can spend, since buy orders’ escrow has already left it.\n\n• Change it for this visit; next time it starts from your wallet again.\n• Put in less to keep some back for relisting, a bargain, or Omega.'} />
        {over.isk != null && walletIsk != null
          ? <button type="button" className="link-btn" onClick={() => override({ isk: null })}>Use my wallet ({iskBig(walletIsk)})</button>
          : walletIsk != null && <span className="note small" style={{ margin: 0 }}>From your wallet</span>}
        <NumChip id="pl-slots" label="Free slots" value={slotsIn} onChange={(v) => override({ slots: v })} width={60} decimals={0} tip={`Each item uses one buy and one sell order slot. You have ${totalSlots}, ${openOrders} in use, so ${freeSlots} free. Change it for this visit to plan as if you'd freed some.`} />
        {over.slots != null && <button type="button" className="link-btn" onClick={() => override({ slots: null })}>Use free slots ({freeSlots})</button>}
        <NumChip id="pl-max" label="Max per item" value={inp.maxPct} onChange={(v) => set({ maxPct: v })} width={60} decimals={0} percent tip="Caps how much of the budget can go into one market" />
        <div className="row" style={{ flexBasis: '100%', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="lbl" style={{ fontSize: 10.5 }} tabIndex={0} data-tip-title="Horizon"
            data-tip={'How long you’ll leave the money in, from buying in to selling out.\n\n• Each market gets as much as it can take in this time at your share of its trade, never more than your cap per item.\n• A longer horizon lets slow markets take more; a shorter one keeps to the fast ones.\n\nThe hour choices are for fast flips. Speeds come from daily volume, so they mean “on an average day”.'}>Horizon</span>
          <Seg size="sm" label="Horizon" value={days} onChange={(v) => set({ days: v })} options={PLANNER_HORIZONS.map((h) => ({ v: h, label: horizonShort(h) }))} />
          <span className="note small">Money back in about {horizonSaid(days)}.</span>
        </div>
        <div className="row" style={{ flexBasis: '100%', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="lbl" style={{ fontSize: 10.5 }} tabIndex={0} data-tip-title="Pricing"
            data-tip={'Where each order goes.\n\n• At the front: one step over the best bid and under the best ask. Fastest, but bots undercut you within minutes, so it means relisting to stay there.\n• Place and leave: where the bulk of trading reached on about half of the last 14 days, on both sides, behind the front on purpose. Sellers dumping into bids reach it every other day or so, and it fills a bit each time. Slower and with a wider margin, and Orders, To do and alert mail stop telling you to move these, unless trading stops reaching your price.\n\nFor example: an item bid at 100 and traded down to 92 on half of the last 14 days is bought at 92, not 100.01.'}>Pricing</span>
          <Seg size="sm" label="Pricing" value={patient ? 1 : 0} onChange={(v) => set({ patient: v === 1 })} options={[{ v: 0, label: 'At the front' }, { v: 1, label: 'Place and leave' }]} />
          <span className="note small">{patient ? 'Priced where trading reaches on half the days: no relisting to stay in front.' : 'One step inside the best prices: fastest, but you relist to stay there.'}</span>
        </div>
      </div>

      {unchecked > 0 && (
        <p className="row tight" style={{ fontSize: 13, color: 'var(--acc2)', margin: 0 }}>
          <Radar aria-hidden="true" style={{ width: 14, height: 14, flex: 'none' }} />
          <span>
            Scan again before investing: {units(unchecked)} of these items were scanned before the plan checked sell prices and sudden price moves, so their margins may be ones trading can’t reach. A quick scan is enough.{' '}
            <button type="button" className="link-btn" onClick={() => navigate('prospects')}>Open Prospects</button>
          </span>
        </p>
      )}
      <PlacingChecklist />

      {slots < SLOTS_PER_ITEM * 3 && (
        <p className="row tight" style={{ fontSize: 13, color: 'var(--acc2)', margin: 0 }}>
          <LayoutGrid aria-hidden="true" style={{ width: 14, height: 14, flex: 'none' }} />
          <span>
            {slots < SLOTS_PER_ITEM ? 'No room for an item: ' : `Room for ${Math.floor(slots / SLOTS_PER_ITEM)} item${Math.floor(slots / SLOTS_PER_ITEM) === 1 ? '' : 's'} only: `}
            {slots} free order slot{slots === 1 ? '' : 's'}, and each item takes {SLOTS_PER_ITEM}. {openSells} of your {openOrders} open orders are sell orders; the listings Orders marks <b>Sell to bids</b> are the first worth freeing.{' '}
            <button type="button" className="link-btn" onClick={() => navigate('orders')}>Open Orders</button>
          </span>
        </p>
      )}
      {!cache ? null : !scanned ? (
        <Empty icon={Radar} action={<button type="button" className="btn primary" onClick={() => navigate('prospects')}>Scan on Prospects</button>}>
          The planner builds from the items a Prospects scan found. Nothing has been scanned in this browser yet.
        </Empty>
      ) : !isk ? (
        <Empty icon={Wallet}>Put in how much ISK you want working and the mix appears here.</Empty>
      ) : plan && (
        <>
          <Tiles min={190} items={[
            { l: 'Deployed', v: iskBig(plan.deployed), n: `${pct(plan.deployed / Math.max(isk, 1), 0)} of your ISK`, c: 'var(--acc)' },
            { l: 'Expected ISK / day', v: iskBig(plan.perDay), n: 'While every order keeps filling at your share', c: 'var(--pos)' },
            { l: 'Blended return / day', v: plan.deployed ? pct(plan.perDay / plan.deployed, 2) : '–', n: 'Across the whole mix', c: 'var(--pos)' },
            { l: 'Slots used', v: `${plan.slotsUsed} of ${slots}`, n: 'One buy and one sell each' },
          ]} />
          <Panel title="The mix" sub={`Chosen from ${units(pool)} items that pass your Prospects filters${excluded ? `, ${excluded} left out for a warning flag` : ''}.`}>
            {plan.other != null && plan.rows.length > 0 && (
              <p className="note small" style={{ margin: '0 0 10px' }}>
                {plan.ranked === 'isk'
                  ? `Order slots run out before the ISK does, so each pair goes to the markets that make the most ISK a day, not the best return: ${iskBig(plan.perDay)} a day, against ${iskBig(plan.other)} filling best return first.`
                  : `Order slots run out before the ISK does. Filling by best return first still makes the most a day: ${iskBig(plan.perDay)}, against ${iskBig(plan.other)} going for the biggest markets.`}
              </p>
            )}
            {!plan.rows.length ? (
              <p className="note">Nothing fits. {slots < SLOTS_PER_ITEM ? `You need at least ${SLOTS_PER_ITEM} free slots for one item.` : 'No scanned market can take a meaningful share of this budget at your share of its volume. Try a longer horizon, or a deep scan on Prospects.'}</p>
            ) : (
              <>
                <div className="bar16" style={{ height: 22 }} aria-hidden="true">
                  {plan.rows.map((a, i) => <div key={a.p.typeId} data-tip={`${name(a.p.typeId)} — ${iskBig(a.isk)} (${pct(a.isk / isk, 0)})`} style={{ width: `${(a.isk / Math.max(isk, 1)) * 100}%`, background: COLS[i % COLS.length] }} />)}
                </div>
                <div className="tbl-scroll">
                  <table className="tbl" style={{ minWidth: 980 }}>
                    <thead><tr>
                      <th scope="col" className="l">Item</th><th scope="col">ISK in</th><th scope="col">Share</th><th scope="col">Units</th>
                      <th scope="col" data-tip={patient ? 'Your buy order’s price: where trading reached on about half of the last 14 days' : 'Your buy order’s price'}>Buy at</th>
                      <th scope="col" data-tip={patient ? 'Your sell order’s price: where trading got up to on about half of the last 14 days' : 'Your sell order’s price'}>Sell at</th>
                      <th scope="col" data-tip="How long this much takes to buy in and sell out at your share of the slower side">Turns in</th>
                      <th scope="col">ISK / day</th><th scope="col">Return / day</th>
                      <th scope="col" data-tip="Flags that don’t keep an item out but are worth reading first. Hover one for what it means.">Flags</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr></thead>
                    <tbody>
                      {plan.rows.map((a, i) => (
                        <tr key={a.p.typeId} className="hover">
                          <td className="l">
                            <span className="cellrow">
                              <span style={{ width: 10, height: 10, flex: 'none', background: COLS[i % COLS.length] }} /><ItemIcon id={a.p.typeId} /><span className="name ellipsis">{name(a.p.typeId)}</span><BusyRelisting typeId={a.p.typeId} />
                              {leaving.has(a.p.typeId) && <Flag color="var(--pos)" title="Leaving it" why="Its orders are left where they are: Orders, To do and alert mail only speak up if trading stops reaching their price.">Leaving it</Flag>}
                              {(inOrders.has(a.p.typeId) || inPositions.has(a.p.typeId)) && (
                                <Flag color="var(--acc)" title="You already trade this"
                                  why={`${inOrders.has(a.p.typeId) ? `You have ${iskBig(inOrders.get(a.p.typeId)!)} in open orders on it` : 'You have an open position on it'}. This would be on top of that, and it takes two more order slots.`}>
                                  Already trading
                                </Flag>
                              )}
                            </span>
                          </td>
                          <td>{iskBig(a.isk)}</td>
                          <td style={{ color: 'var(--sec)' }}>{pct(a.isk / isk, 0)}</td>
                          <td>{units(a.units)}</td>
                          <td>{iskFmt(a.p.buy)}</td>
                          <td>{iskFmt(a.p.sell)}</td>
                          <td>{flip(a.days)}</td>
                          <td style={{ color: 'var(--pos)' }}>{iskBig(a.perDay)}</td>
                          <td style={{ color: 'var(--acc)' }}>{pct(a.perDay / a.isk, 2)}</td>
                          <td>{a.p.warnings.length ? <span className="flags">{a.p.warnings.map((w) => <Flag key={w} why={WARNING[w].why} title={WARNING[w].short}>{WARNING[w].short}</Flag>)}</span> : <span style={{ color: 'var(--ghost)' }}>–</span>}</td>
                          <td><button type="button" className="link-btn" onClick={() => navigate(`calculator?type=${a.p.typeId}`)}><CalcIcon aria-hidden="true" />Calc</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {plan.idle > isk * 0.05 ? (
              <p className="row tight" style={{ fontSize: 13, color: 'var(--acc2)' }}><Info aria-hidden="true" style={{ width: 14, height: 14, flex: 'none' }} /><span><b>{iskBig(plan.idle)}</b> left idle. {idleWhy}</span></p>
            ) : plan.rows.length > 0 && <p className="note small">Nearly everything is working.</p>}
            <StartPlanButton plan={plan} days={days} patient={patient} />
            {patient && plan.rows.length > 0 && (
              <div className="sub-box" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  {allLeft ? (
                    <>
                      <span style={{ fontSize: 13, color: 'var(--pos)' }}>You’re leaving all {units(planTypes.length)} of these: their orders won’t be told to get back in front.</span>
                      <button type="button" className="link-btn" onClick={() => update((x) => ({ leave: x.leave.filter((t) => !planTypes.includes(t)) }))}>Stop leaving them</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn sm primary" onClick={() => update((x) => ({ leave: [...new Set([...x.leave, ...planTypes])] }))}>Leave these orders alone</button>
                      <span className="note small" style={{ margin: 0 }}>Once you’ve placed them. Orders, To do and alert mail then only speak up if trading stops reaching their price. Change it per item on Orders.</span>
                    </>
                  )}
                </div>
                <div className="note small" style={{ margin: 0 }}>
                  <b>Before you leave big orders for weeks:</b> if the price moves up and away, your bid is left behind and stops filling (the order check tells you where trading reaches now); if it falls, you fill fastest just as it gets cheaper; the ISK sits in escrow the whole time; and a buy order runs out after 90 days at most.
                  {leaveRecord && <> {leaveRecord}</>}
                </div>
              </div>
            )}
            <p className="note small" style={{ margin: 0 }}>
              Once the buys fill, price what’s in your Jita hangar to list, never under what it cost:{' '}
              <button type="button" className="link-btn" onClick={() => navigate('positions?list=stock')}>List your stock (Positions)</button>
            </p>
            <p className="note small">Each market’s limit is your share of its slower side over the horizon ({d.settings.share}% of volume, scaled for how many orders you queue among), at the prices the last scan found (the banner above says how old). {patient ? 'Priced to place and leave: each order fills only on the days trading reaches it, so its pace is scaled by how often that was. That’s rough: daily figures can’t show how deep each day’s trading went. Items without the history to say where trading reaches are left out.' : 'An item flagged “Bids not reached” is priced where trading actually reaches, not at the best bid.'} Check each in the Calculator before placing anything.</p>
          </Panel>
        </>
      )}

      <Guide
        title="How to use the planner"
        intro={<>The planner answers one question: <b style={{ color: 'var(--ink)' }}>if I had to spread this ISK across the market right now, where would it earn the most per day without getting stuck?</b> It’s a starting point for your own judgement, not an order to follow.</>}
        groups={[
          {
            title: 'Setting it up', steps: [
              { icon: Wallet, title: 'Only count ISK you can leave alone', body: 'It starts from your whole wallet. Lower it to what you can have tied up for the whole horizon: keep some back for relisting, for a bargain that turns up, and for Omega if you pay for it with ISK.' },
              { icon: LayoutGrid, title: 'Free slots are the real limit', body: 'Every item needs a buy order and later a sell order, so each one costs two slots. With six free you can only run three items, however much ISK you have. It counts your free slots from your open orders; plan as if you’d freed some by typing a bigger number.' },
              { icon: Hourglass, title: 'The horizon is your patience', body: 'Three days means “I want this money back in about three days.” A longer horizon lets the planner put more into each market, because a slow market absorbs more over a week than over a day.' },
              { icon: Shield, title: 'The cap per item is your safety net', body: 'Never let one market hold too much of your money. If a price drops or a rival floods it, a 25% cap means it hurts but doesn’t sink you. New to trading? Go lower — 10 to 15%.' },
            ],
          },
          {
            title: 'Reading the result', steps: [
              { icon: Gauge, title: 'Return per day beats return', body: 'The mix is ranked by what each item earns per day your ISK is in it. A 6% trade that turns over in a day is worth far more than a 12% trade that takes a week, because the quick one can go round again.' },
              { icon: Pause, title: 'Idle ISK is fine', body: 'If the planner leaves money unspent, the good markets are already full at your share. Forcing the rest into weaker items usually earns less than keeping it. Try a deep scan in Prospects to find more candidates.' },
              { icon: TrendingUp, title: 'Expected ISK per day is a best case', body: 'It assumes every order keeps filling at your share and prices hold. Real days are lumpier: you get undercut, a market goes quiet, prices move. Plan on somewhere between half and all of it.' },
            ],
          },
        ]}
        habits={[
          { icon: CalcIcon, title: 'Check each item before you buy', body: 'Click Calc on any row. The Calculator shows the order book, whether your prices sit inside recent trading, and your break-even.' },
          { icon: Layers, title: 'Start one position per item', body: 'Once the buy orders are placed, start a position for each item so your fills are tracked from the first unit. That’s how Results can later tell you what worked.', color: '#6ee7a8' },
          { icon: RefreshCw, title: 'Re-run it as things fill', body: 'As orders fill and ISK comes back, run the planner again with what’s free. The best items change daily.', color: 'var(--acc2)' },
          { icon: ShieldAlert, title: 'Trust the flags', body: 'Items marked Wall, Spike, Fluke, Escrow bait or Price just moved are left out on purpose. Others, like Bids not reached, Sells not reached or Thin, stay in but show in the Flags column, priced where trading actually reaches: hover one before you commit.', color: '#ff8d9a' },
          { icon: ListChecks, title: 'Let To do handle the upkeep', body: 'Once the orders are placed, the daily work is moving the ones that get beaten. The To do list and the undercut alerts tell you which.' },
          { icon: Scale, title: 'Spread beats size', body: 'Ten modest markets are safer than two big ones at the same expected profit. When unsure, lower the cap per item.', color: '#a98bff' },
        ]}
      />
    </div>
  );
}
