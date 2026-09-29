import { useEffect, useMemo, useState } from 'react';
import { Calculator as CalcIcon, Clock, Copy, Crosshair, Eye, Hand, Mail, Repeat, ShieldAlert, SlidersHorizontal, Tag } from 'lucide-react';
import { cloudEnabled, cloudSendsMail, cloudSightings, cloudSnipes, useCloud } from '../lib/cloud';
import { TRACK_MIN } from '../lib/track';
import { rateAt, rates } from '../lib/fees';
import { reachedAsk, recentRange } from '../lib/fills';
import { ago, fmtDateTime, isk, iskBig, iskBigSigned, pct, units, until } from '../lib/format';
import { marketHistory } from '../lib/market';
import { feeMatchesFor } from '../lib/positions';
import { followSnipe, groupBuys, instantBuys, judgeTaken, notSnipeIds, type Sighting } from '../lib/sniped';
import { JITA_44 } from '../lib/constants';
import type { HistRow } from '../lib/types';
import { navigate, useNow } from '../lib/hooks';
import { sanitizeAlerts } from '../lib/prefs';
import { DOUBT_SAID, judgeBids, judgeListings, notYours, type HeldBidRow, type SnipeRead, type SnipeRow } from '../lib/snipe';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import { copyPrice, OpenInGame, plainPrice, useEnsureNames, useTypeName } from './common';
import { flip } from './Prospects';
import { Empty, Flag, Guide, ItemIcon, NumChip, PageHead, Panel, Tiles } from './ui';


/**
 * The snipes you've taken, found in your wallet (sniped.ts), and what each made since, following only its own units
 * (`followSnipe`): the first sold after the snipe, the listing fees of your sell orders placed after it shared by
 * units, and the sales tax matched to each sale. Shown only here, never on Positions.
 */
function YourSnipes({ now }: { now: number }) {
  const d = useData();
  const name = useTypeName();
  const cloud = useCloud();
  const r = rates(d.settings);
  const groups = useMemo(() => groupBuys(instantBuys(Object.values(d.txs), Object.values(d.journal), new Set(d.ignored), notSnipeIds(Object.values(d.txs), d.notSnipes))), [d.txs, d.journal, d.ignored, d.notSnipes]);
  const types = useMemo(() => [...new Set(groups.map((g) => g.typeId))], [groups]);
  const key = types.join(',');
  const [hist, setHist] = useState<Record<number, HistRow[]> | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<number, HistRow[]> = {};
      let i = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (i < types.length) { const t = types[i++]; try { out[t] = await marketHistory(t); } catch { /* left out */ } }
      }));
      if (alive) setHist(out);
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [seen, setSeen] = useState<Sighting[]>([]);
  useEffect(() => {
    if (!types.length || !cloudEnabled() || !cloud.started) return;
    cloudSightings(types).then(setSeen).catch(() => undefined);
  }, [key, cloud.started]); // eslint-disable-line react-hooks/exhaustive-deps
  const taken = useMemo(() => (hist ? judgeTaken(groups, (t) => hist[t], (iso) => rateAt(d.meta.rateHistory, Date.parse(iso), r), seen) : []),
    [groups, hist, seen, d.meta.rateHistory, r.f, r.t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEnsureNames(taken.map((x) => x.typeId));
  // One outcome per item, from its first snipe on, so two snipes of one item aren't counted twice.
  const items = useMemo(() => {
    const matches = feeMatchesFor(d, d.settings);
    const personal = new Set(d.ignored);
    const byType = new Map<number, typeof taken>();
    for (const x of taken) byType.set(x.typeId, [...(byType.get(x.typeId) ?? []), x]);
    return [...byType].map(([typeId, list]) => {
      const first = list.reduce((a, b) => (Date.parse(a.at) < Date.parse(b.at) ? a : b));
      const t0 = Date.parse(first.at);
      const units = list.reduce((n, x) => n + x.units, 0), cost = list.reduce((n, x) => n + x.cost, 0);
      const sales = Object.values(d.txs).filter((t) => t.typeId === typeId && !t.isBuy && t.source === 'esi' && (t.locationId == null || t.locationId === JITA_44) && !personal.has(t.id));
      // Your sell orders placed since the snipe, with every fee matched to them (placing and price changes).
      const listings = Object.values(d.orders)
        .filter((o) => o.typeId === typeId && !o.isBuy && o.locationId === JITA_44 && Date.parse((o.seen?.[0] ?? o).issued) >= t0 - 60_000)
        .map((o) => { const f = matches.byOrder.get(o.orderId); return { units: o.volumeTotal, fees: f ? f.placement.amount + f.relists.reduce((n, x) => n + x.amount, 0) : 0 }; });
      const rows = hist?.[typeId];
      const fairNow = rows ? reachedAsk(recentRange(rows, undefined, now).highs) : null;
      const out = followSnipe({ units, cost, at: first.at }, sales, listings, (id) => matches.taxByTx.get(id), r, fairNow);
      return {
        typeId, list, latest: list[0], units, cost, expected: list.reduce((n, x) => n + x.expected, 0), byTool: list.some((x) => x.byTool),
        ...out, fairNow,
      };
    }).sort((a, b) => Date.parse(b.latest.at) - Date.parse(a.latest.at));
  }, [taken, d, hist, now, r.f, r.t]);
  const sum = (f: (x: (typeof items)[number]) => number) => items.reduce((n, x) => n + f(x), 0);
  const worse = items.filter((x) => x.inTheEnd != null && x.inTheEnd < x.expected * 0.5).length;
  const endKnown = items.every((x) => x.inTheEnd != null);

  return (
    <Panel title="Your snipes" sub="Found in your wallet: buys of yours from a listing in Jita at 5%+ under where the item traded, after fees, whether the Sniper found them or you did.">
      {!hist ? <p className="note">Checking {units(groups.length)} of your buys from listings against market history…</p>
        : !items.length ? <p className="note">No snipes in your wallet yet. A buy of yours from a listing in Jita, far enough under where the item traded to pay 5% after fees, counts. ESI hands wallet trades over up to an hour after you make them.</p>
          : (
            <>
              <Tiles min={170} items={[
                { l: 'Snipes taken', v: units(taken.length), n: `${units(sum((x) => (x.byTool ? x.list.length : 0)))} found by the Sniper`, c: 'var(--acc)' },
                { l: 'Paid for them', v: iskBig(sum((x) => x.cost)), n: `Looked like ${iskBigSigned(sum((x) => x.expected))} profit after fees` },
                { l: 'Profit so far', v: iskBigSigned(sum((x) => x.madeSoFar)), n: 'On sniped units sold, after the fees on them', c: sum((x) => x.madeSoFar) >= 0 ? 'var(--pos)' : 'var(--neg-t)' },
                // The user read "In the end +255.56 M" beside "ISK put in 1.25 B" as what would come back: it's profit on
                // top, so what comes back is said too.
                { l: 'Profit in the end', v: iskBigSigned(sum((x) => x.inTheEnd ?? x.madeSoFar)),
                  n: `About ${iskBig(sum((x) => x.cost + (x.inTheEnd ?? x.madeSoFar)))} back for the ${iskBig(sum((x) => x.cost))}${endKnown ? ', if what’s left sells where it trades now' : ', where the price is known'}`,
                  tip: 'Profit, not what comes back: what the sniped units sold for less their cost, sales tax and listing fees, plus what’s left if it sells where the item trades now (after tax, and a listing fee unless one is paid already). What comes back is that plus what you paid.',
                  c: sum((x) => x.inTheEnd ?? x.madeSoFar) >= 0 ? 'var(--pos)' : 'var(--neg-t)' },
              ]} />
              <p className="note small" style={{ margin: 0 }}>
                Sniped stock in your Jita hangar can be listed in one paste, never under what it cost:{' '}
                <button type="button" className="link-btn" onClick={() => navigate('positions?list=stock')}>List your stock (Positions)</button>
              </p>
              {worse > 0 && <p className="note small" style={{ margin: 0, color: 'var(--acc2)' }}>{units(worse)} {worse === 1 ? 'is' : 'are'} heading for less than half what {worse === 1 ? 'it' : 'they'} looked like: a price that moved, or fees on the relist.</p>}
              <div className="tbl-scroll">
                <table className="tbl" style={{ minWidth: 980 }}>
                  <thead><tr>
                    <th scope="col" className="l">Item</th>
                    <th scope="col">Sniped</th>
                    <th scope="col" data-tip="Relisted where it had been trading, after your fees at the time">Looked like</th>
                    <th scope="col" data-tip="Of the units you sniped: the first sold after the snipe count as its own. Sales of stock you already had are shown apart and kept out of its profit.">Sold</th>
                    <th scope="col" data-tip="On the sniped units that sold: the sales less their tax, their cost and their share of the listing fees">Profit so far</th>
                    <th scope="col" data-tip="Listing fees already paid for sniped units still unsold: charged as they sell">Fees on unsold</th>
                    <th scope="col" data-tip="Profit so far, less those fees, plus what's left if it sells where the item trades now">Profit in the end</th>
                  </tr></thead>
                  <tbody>
                    {items.map((x) => (
                      <tr key={x.typeId} className="hover">
                        <td className="l"><span className="cellrow"><ItemIcon id={x.typeId} /><span className="name ellipsis">{name(x.typeId)}</span>
                          {x.byTool ? <Flag color="var(--acc)" title="Found by the Sniper" why="The cloud’s Sniper had shown this listing when you bought it.">Sniper</Flag>
                            : <Flag color="var(--label)" title="Found by hand" why="The Sniper hadn’t shown it (or it was before the Sniper existed): you found this one yourself.">By hand</Flag>}
                          {x.list.length > 1 && <span className="sub">{x.list.length} snipes</span>}
                          <button type="button" className="link-btn dim" data-tip="It was bought cheap, but not as a snipe (to use, or for a job). It leaves Your snipes, and List loot stops setting it aside as one. It can be put back under Not snipes."
                            onClick={() => markNotSnipe(x.list.flatMap((g) => g.txIds), name(x.typeId))}>Not a snipe</button></span></td>
                        <td>{units(x.units)} at {isk(x.cost / x.units)}<span className="sub">{fmtDateTime(x.latest.at)} · {pct(x.latest.under, 0)} under</span></td>
                        <td>{iskBigSigned(x.expected)}</td>
                        <td>{units(x.soldUnits)} of {units(x.units)}
                          {(x.avgSale != null || x.extraSold > 0) && <span className="sub">{[x.avgSale != null ? `at ${isk(x.avgSale)}` : '', x.extraSold > 0 ? `+${units(x.extraSold)} you already had` : ''].filter(Boolean).join(' · ')}</span>}</td>
                        <td style={{ color: x.madeSoFar >= 0 ? 'var(--pos)' : 'var(--neg-t)' }}>{iskBigSigned(x.madeSoFar)}</td>
                        <td style={{ color: x.feesOnUnsold > 0 ? 'var(--acc2)' : 'var(--ghost)' }}>{x.feesOnUnsold > 0 ? iskBig(x.feesOnUnsold) : '–'}</td>
                        <td style={{ color: (x.inTheEnd ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg-t)' }}>{x.inTheEnd != null ? iskBigSigned(x.inTheEnd) : '–'}{x.left > 0 && <span className="sub">{units(x.left)} left{x.fairNow ? ` at ${isk(x.fairNow)}` : ''}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note small" style={{ margin: 0 }}>Only the units you sniped are followed: the first sold after a snipe count as its own, and listing fees are shared by units between them and anything of your own listed alongside. Left out: buys tagged Personal, ones you said weren’t snipes, and anything bought in one go with other items (a fitting’s Buy All, the Multibuy window).</p>
            </>
          )}
      <NotSnipes />
    </Panel>
  );
}

/** Marks purchases as not snipes (a synced list of trade IDs), saying so with the way back. */
function markNotSnipe(txIds: string[], what: string) {
  update((x) => ({ notSnipes: [...new Set([...x.notSnipes, ...txIds])] }));
  toast(`${what} is no longer counted as a snipe. It’s under “Not snipes” if you change your mind.`);
}

/** Purchases you said weren't snipes, by item, each with the way back. */
function NotSnipes() {
  const d = useData();
  const name = useTypeName();
  const byType = useMemo(() => {
    const m = new Map<number, { ids: string[]; units: number; cost: number; at: string }>();
    for (const id of d.notSnipes) {
      const t = d.txs[id];
      if (!t) continue;
      const cur = m.get(t.typeId) ?? { ids: [], units: 0, cost: 0, at: t.date };
      cur.ids.push(id); cur.units += t.qty; cur.cost += t.qty * t.unitPrice; if (t.date > cur.at) cur.at = t.date;
      m.set(t.typeId, cur);
    }
    return [...m].sort((a, b) => b[1].at.localeCompare(a[1].at));
  }, [d.notSnipes, d.txs]);
  useEnsureNames(byType.map(([id]) => id));
  if (!byType.length) return null;
  return (
    <details className="sub-box">
      <summary className="lbl" style={{ cursor: 'pointer' }}>Not snipes ({units(byType.length)})</summary>
      <div className="col" style={{ gap: 6, marginTop: 8 }}>
        {byType.map(([typeId, x]) => (
          <div key={typeId} className="row" style={{ gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
            <ItemIcon id={typeId} /><span style={{ color: 'var(--ink)' }}>{name(typeId)}</span>
            <span className="note small" style={{ margin: 0 }}>{units(x.units)} for {iskBig(x.cost)}, {fmtDateTime(x.at)}</span>
            <button type="button" className="link-btn" onClick={() => update((y) => ({ notSnipes: y.notSnipes.filter((id) => !x.ids.includes(id)) }))}>It was a snipe</button>
          </div>
        ))}
      </div>
    </details>
  );
}

/** The cloud reads the book a minute after each of ESI's refreshes: a minute after the one it read expires. */
const NEXT_AFTER_MS = 90_000;
/** Look for a newer read this often while the page is open. */
const POLL_MS = 60_000;

/**
 * The Sniper: listings someone priced well under where the item trades, worth buying out and relisting, and bids
 * well over where it trades for things you hold. The cloud reads every order every five minutes (worker/src/snipe.ts);
 * this page shows its latest read, judged at your own fees and bar (src/lib/snipe.ts).
 */
export function Sniper() {
  const d = useData();
  const cloud = useCloud();
  const name = useTypeName();
  const now = useNow(15_000);
  const on = cloudEnabled() && cloud.phase !== 'off' && cloud.phase !== 'waiting';
  const [read, setRead] = useState<SnipeRead | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [showSmall, setShowSmall] = useState(false);
  const [showDoubted, setShowDoubted] = useState(false);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => cloudSnipes()
      .then((r) => { if (alive) { setRead(r); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) timer = setTimeout(look, POLL_MS); });
    look();
    return () => { alive = false; clearTimeout(timer); };
  }, [on]);

  const r = rates(d.settings);
  const bar = { minIsk: d.alerts.snipeMinIsk, minPct: d.alerts.snipeMinPct };
  // Your own orders aren't snipes for you, or bids to sell into (notYours).
  const theirs = useMemo(() => (read ? notYours(read, new Set(Object.values(d.orders).filter((o) => o.state === 'open').map((o) => o.orderId))) : null), [read, d.orders]);
  const rows = useMemo(() => (theirs ? judgeListings(theirs.listings, r, d.settings.share, bar) : []), [theirs, r.f, r.t, d.settings.share, bar.minIsk, bar.minPct]); // eslint-disable-line react-hooks/exhaustive-deps
  const held = useMemo(() => (theirs ? judgeBids(theirs.bids, r, d.stock?.jita ?? {}, bar) : []), [theirs, r.f, r.t, d.stock, bar.minIsk, bar.minPct]); // eslint-disable-line react-hooks/exhaustive-deps
  const worth = rows.filter((x) => x.worth);
  const small = rows.filter((x) => !x.worth && !x.doubts.length);
  const doubted = rows.filter((x) => x.doubts.length);
  // Which half of the bar holds each clean listing back: the user found the two controls seemed "to be fighting for the
  // same things". Both are floors on profit, one in ISK and one on what buying it out costs, and both must hold.
  const underIsk = (x: SnipeRow) => x.profit < bar.minIsk, underPct = (x: SnipeRow) => x.pct * 100 < bar.minPct;
  const clean = rows.filter((x) => !x.doubts.length);
  const shortIsk = clean.filter((x) => underIsk(x) && !underPct(x)).length, shortPct = clean.filter((x) => !underIsk(x) && underPct(x)).length;
  const shortBoth = clean.filter((x) => underIsk(x) && underPct(x)).length;
  useEnsureNames([...rows.map((x) => x.typeId), ...held.map((x) => x.typeId)]);
  const setBar = (p: Partial<typeof bar>) => update((x) => ({ alerts: sanitizeAlerts({ ...x.alerts, snipeMinIsk: p.minIsk ?? x.alerts.snipeMinIsk, snipeMinPct: p.minPct ?? x.alerts.snipeMinPct }) }));
  const mailing = cloudSendsMail() && d.alerts.on && d.alerts.mail && d.alerts.ev.snipe && d.alerts.mailEv.snipe;
  const nextRead = read?.expires ? new Date(Date.parse(read.expires) + NEXT_AFTER_MS).toISOString() : undefined;

  const listed = (x: SnipeRow) => (
    <>
      {units(x.units)} at {isk(x.cheapest)}{x.top !== x.cheapest && <> to {isk(x.top)}</>}
      <span className="sub">{x.orderIds.length === 1 ? 'one order' : `${x.orderIds.length} orders`}{x.partly ? ', part bought' : ''}</span>
    </>
  );
  const table = (list: SnipeRow[], withDoubts = false) => (
    <div className="tbl-scroll">
      <table className="tbl" style={{ minWidth: 980 }}>
        <thead><tr>
          <th scope="col" className="l">Item</th>
          <th scope="col" data-tip="The cheap orders to buy out. Buying from a listing costs no broker fee and no tax.">Listed</th>
          <th scope="col" data-tip="When the cheapest was priced. ESI moves this whenever the price changes, so it may be a reprice.">Priced</th>
          <th scope="col" data-tip="Where to relist: one step under the next listing, never above where the bulk of trading got up to on half the last 14 days">Relist at</th>
          <th scope="col">Costs</th>
          <th scope="col" data-tip="After your broker fee and sales tax on the relist">Profit</th>
          <th scope="col" data-tip="How long the relisted stock takes to sell at your share of the item's trading">Sells in</th>
          {withDoubts && <th scope="col" className="l">Why not</th>}
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          {list.map((x) => (
            <tr key={x.orderIds[0]} className="hover">
              <td className="l"><span className="cellrow"><ItemIcon id={x.typeId} /><span className="name ellipsis">{name(x.typeId)}</span></span></td>
              <td>{listed(x)}</td>
              <td style={{ color: now - Date.parse(x.pricedAt) < 3600_000 ? 'var(--pos)' : 'var(--cell)' }}>{ago(x.pricedAt, now)}</td>
              <td>
                <span className="cellrow" style={{ justifyContent: 'flex-end' }}>
                  {isk(x.resale)}
                  <button type="button" className="link-btn dim" aria-label={`Copy ${plainPrice(x.resale)}`} data-tip="Copy the price, to paste into the game rather than type it" onClick={() => copyPrice(x.resale)}><Copy aria-hidden="true" /></button>
                </span>
                <span className="sub">{x.resale < x.fair && x.nextAsk != null ? `next listing ${isk(x.nextAsk)}` : `trades to ${isk(x.fair)}`}</span>
              </td>
              <td>{iskBig(x.cost)}</td>
              <td style={{ color: x.profit > 0 ? 'var(--pos)' : 'var(--neg-t)' }}>{iskBig(x.profit)}<span className="sub">{pct(x.pct, 0)}</span></td>
              <td>{Number.isFinite(x.sellDays) ? flip(x.sellDays) : '–'}</td>
              {withDoubts && <td className="l"><span className="flags">{x.doubts.map((k) => <Flag key={k} title={DOUBT_SAID[k].short} why={DOUBT_SAID[k].why}>{DOUBT_SAID[k].short}</Flag>)}</span></td>}
              <td>
                <span className="acts">
                  <OpenInGame typeId={x.typeId} name={name(x.typeId)} label="Market" />
                  <button type="button" className="link-btn dim" onClick={() => navigate(`calculator?type=${x.typeId}`)}><CalcIcon aria-hidden="true" />Calc</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const heldTable = (list: HeldBidRow[]) => (
    <div className="tbl-scroll">
      <table className="tbl" style={{ minWidth: 820 }}>
        <thead><tr>
          <th scope="col" className="l">Item</th><th scope="col">You hold</th>
          <th scope="col" data-tip="The best Jita bid, and the fewest units it takes at once">Bid</th>
          <th scope="col" data-tip="Selling into a bid costs sales tax, no broker fee">You get</th>
          <th scope="col" data-tip="More than listing where the bulk of trading got up to on half the last 14 days would get, after fees">Over listing</th>
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          {list.map((x) => (
            <tr key={x.orderId} className={'hover' + (x.worth ? ' hot' : '')}>
              <td className="l"><span className="cellrow"><ItemIcon id={x.typeId} /><span className="name ellipsis">{name(x.typeId)}</span>
                {x.doubts.map((k) => <Flag key={k} title={DOUBT_SAID[k].short} why={DOUBT_SAID[k].why}>{DOUBT_SAID[k].short}</Flag>)}</span></td>
              <td>{units(x.held)}</td>
              <td>{isk(x.price)}<span className="sub">{x.minVolume > 1 ? `at least ${units(x.minVolume)}` : `${units(x.units)} wanted`}</span></td>
              <td>{iskBig(x.proceeds)}<span className="sub">for {units(x.qty)}</span></td>
              <td style={{ color: 'var(--pos)' }}>+{iskBig(x.gain)}<span className="sub">{pct(x.pct, 0)} more</span></td>
              <td><span className="acts"><OpenInGame typeId={x.typeId} name={name(x.typeId)} label="Market" /></span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page">
      <PageHead
        kicker="02d · Mistake listings" title="Sniper" wide
        lede="Listings someone priced well under where the item trades, worth buying out and relisting at the going rate, and bids well over it for things in your hangar. The cloud reads every order in The Forge a minute after each of ESI’s five-minute refreshes; this shows its latest read at your fees."
      />
      {!on ? (
        <Empty icon={Crosshair} action={<button type="button" className="btn primary" onClick={() => navigate('settings/data')}>Open Settings → Your data</button>}>
          The sniper runs in the cloud, which reads the whole market every five minutes. Turn on the cloud copy and log in to see what it finds.
        </Empty>
      ) : (
        <>
          <div className="chipbar" data-rv="">
            <span className="chipbar-title"><SlidersHorizontal aria-hidden="true" />Your bar</span>
            <NumChip id="sn-isk" label="Profit at least" value={bar.minIsk} onChange={(v) => setBar({ minIsk: v ?? 0 })} width={140} decimals={0} placeholder="5m"
              tip={'The least a snipe must make after your fees to count, and to be mailed. It keeps out small change that isn’t worth the clicks.\n\n• Return at least must hold as well: both are floors, and a snipe has to clear both.\n• The same bar applies to bids for what you hold: how much more selling into one gets than listing.'} />
            <NumChip id="sn-pct" label="Return at least" value={bar.minPct} onChange={(v) => setBar({ minPct: v ?? 0 })} width={60} decimals={1} percent
              tip={'Profit as a share of what buying it out costs, after your fees. It keeps out big buys on a thin edge, where a price a few percent off where it really trades wipes the profit out.\n\n• Profit at least must hold as well: both are floors, and a snipe has to clear both.'} />
            <span className="note small" style={{ margin: 0 }}>
              {read === undefined ? 'Asking the cloud…'
                : error ? `Couldn’t reach the cloud: ${error}.`
                  : !read ? 'The cloud hasn’t read the book yet: its first read comes within five minutes of it starting.'
                    : <>Read {ago(read.at, now)}, all {units(read.pages)} pages of The Forge’s book.{nextRead && until(nextRead, now) ? ` Next read ${until(nextRead, now)}.` : ''}</>}
            </span>
          </div>
          <p className="note small" style={{ margin: 0 }}>
            A snipe counts when it clears both: at least {iskBig(bar.minIsk)} profit <b>and</b> at least {bar.minPct}% of what buying it out costs.
            {bar.minPct > 0 && bar.minIsk > 0 && ` So the ISK decides for anything costing under ${iskBig(bar.minIsk / (bar.minPct / 100))}, and the % above that.`}
            {read && clean.length > 0 && ` In this read, of ${units(clean.length)} listing${clean.length === 1 ? '' : 's'} without doubts: ${units(worth.length)} clear both, ${units(shortIsk)} fall short on the ISK alone, ${units(shortPct)} on the % alone, ${units(shortBoth)} on both.`}
          </p>
          <p className="row tight" style={{ fontSize: 12.5, color: mailing ? 'var(--pos)' : 'var(--label)', margin: 0 }}>
            <Mail aria-hidden="true" style={{ width: 14, height: 14, flex: 'none' }} />
            <span>
              {mailing
                ? 'Anything that clears your bar is mailed to you in game as the cloud finds it, once per listing and price. The item’s name in the mail opens its market.'
                : cloudSendsMail()
                  ? <>Not mailed: turn on “Mistake listing” mail in <button type="button" className="link-btn" onClick={() => navigate('settings/alerts')}>Settings → Alerts</button>.</>
                  : <>Not mailed: the cloud needs a character to send from (<button type="button" className="link-btn" onClick={() => navigate('settings/data')}>Settings → Your data</button>).</>}
            </span>
          </p>

          {read && (
            <>
              <Panel title="Worth sniping" sub={worth.length ? `${units(worth.length)} clear your bar. They may already be gone: open the market to check before you buy.` : undefined}>
                {worth.length ? table(worth) : (
                  <p className="note">Nothing clears your bar in this read. Mistakes come and go within minutes, and the cloud looks again every five.{small.length ? ` ${units(small.length)} smaller ones are below.` : ''}</p>
                )}
              </Panel>
              <YourSnipes now={now} />

              {small.length > 0 && (
                <Panel title="Under your bar" sub="Nothing doubts these, but they make less than you asked for.">
                  <button type="button" className="link-btn" onClick={() => setShowSmall(!showSmall)}>{showSmall ? 'Hide them' : `Show ${units(small.length)}`}</button>
                  {showSmall && table(small)}
                </Panel>
              )}

              <Panel title="High bids for what you hold" sub="Bids well over where the item trades, for things loose in your Jita hangar: selling into one beats listing.">
                {held.length ? heldTable(held) : <p className="note">No bid for anything in your Jita hangar is well over where it trades right now.{d.stock ? '' : ' Your hangar hasn’t been read yet: it comes with a sync once the assets permission is granted.'}</p>}
              </Panel>

              {doubted.length > 0 && (
                <Panel title="Probably not mistakes" sub="Cheap on paper, but something says the market already knows: hover a flag for why. Never mailed.">
                  <button type="button" className="link-btn" onClick={() => setShowDoubted(!showDoubted)}>{showDoubted ? 'Hide them' : `Show ${units(doubted.length)}`}</button>
                  {showDoubted && table(doubted, true)}
                </Panel>
              )}
            </>
          )}
        </>
      )}

      {on && <SnipeRecord />}

      <Guide
        title="How to snipe"
        intro={<>Someone lists 10 units at half price by mistake: you buy them and list them again at the going rate. The cloud finds these; <b style={{ color: 'var(--ink)' }}>you still have to be quicker than everyone else watching the market.</b></>}
        steps={[
          { icon: Eye, title: 'Check it’s still there', body: 'The book the cloud reads is up to five minutes old, and players watching the market in game see mistakes at once. Open the market first.' },
          { icon: Tag, title: 'Buy the listed units', body: 'Buying from a listing costs nothing but its price: no broker fee, no tax. Buy the cheap orders shown, not the ones above them.' },
          { icon: Repeat, title: 'Relist at the price shown', body: 'One step under the next listing, never above where trading reaches on half the days. The profit already counts your broker fee and sales tax.' },
          { icon: Hand, title: 'Or sell into a high bid', body: 'A bid well over the going rate for something in your hangar pays at once, for tax only. Watch the minimum a bid takes at a time.' },
          { icon: ShieldAlert, title: 'Why some are left out', body: 'A flood (days of the item’s trading at one price), an item whose price just moved, a thin history, a listing days old or several sellers at one price all mean the market may know better than the history does.' },
          { icon: Clock, title: 'It runs while you play', body: 'Every five minutes, whether or not the app is open. Mail brings the ones that clear your bar into the game.' },
        ]}
      />
    </div>
  );
}

/**
 * The Sniper checked against what happened: a week after each listing it showed, did the item trade up to the
 * relist price it gave? Clean listings against doubted ones, and each doubt on its own, which is the test of
 * whether the doubts are right. Nothing shows until the cloud has settled enough of them.
 */
function SnipeRecord() {
  const t = useCloud().track?.snipes;
  if (!t || t.clean.n + t.doubted.n < TRACK_MIN) return null;
  const share = (x: { n: number; reached: number }) => (x.n ? `${units(x.reached)} of ${units(x.n)} (${Math.round((x.reached / x.n) * 100)}%)` : 'none yet');
  const doubts = Object.entries(t.byDoubt).filter(([k]) => k in DOUBT_SAID) as [keyof typeof DOUBT_SAID, { n: number; reached: number }][];
  return (
    <Panel title="Checked against what traded after" sub="Each listing shown in the last 30 days: did its item trade up to the relist price given, within a week?">
      <div className="col" style={{ gap: 6, maxWidth: 560 }}>
        <div className="kv"><span style={{ color: 'var(--body)' }}>Nothing doubted them</span><span className="v" style={{ color: 'var(--ink)' }}>{share(t.clean)}{t.clean.medianDays != null ? `, day ${t.clean.medianDays} typically` : ''}</span></div>
        <div className="kv"><span style={{ color: 'var(--body)' }}>Doubted</span><span className="v" style={{ color: 'var(--ink)' }}>{share(t.doubted)}</span></div>
        {doubts.map(([k, x]) => (
          <div key={k} className="kv"><span style={{ color: 'var(--dim)', paddingLeft: 14 }}>{DOUBT_SAID[k].short}</span><span className="v">{share(x)}</span></div>
        ))}
      </div>
      <p className="note small">A day counts when the bulk of its trading got up to the price (ESI trims each day’s extremes). The relist price is one step under the next listing, never above where trading reached on half the last 14 days. A listing with several doubts counts under each.</p>
    </Panel>
  );
}
