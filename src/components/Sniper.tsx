import { useEffect, useMemo, useState } from 'react';
import { Calculator as CalcIcon, Clock, Crosshair, Eye, Hand, Mail, Repeat, ShieldAlert, SlidersHorizontal, Tag } from 'lucide-react';
import { cloudEnabled, cloudSendsMail, cloudSnipes, useCloud } from '../lib/cloud';
import { rates } from '../lib/fees';
import { ago, isk, iskBig, pct, units, until } from '../lib/format';
import { navigate, useNow } from '../lib/hooks';
import { sanitizeAlerts } from '../lib/prefs';
import { DOUBT_SAID, judgeBids, judgeListings, type HeldBidRow, type SnipeRead, type SnipeRow } from '../lib/snipe';
import { update, useData } from '../lib/store';
import { OpenInGame, useEnsureNames, useTypeName } from './common';
import { flip } from './Prospects';
import { Empty, Flag, Guide, ItemIcon, NumChip, PageHead, Panel } from './ui';

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
  const rows = useMemo(() => (read ? judgeListings(read.listings, r, d.settings.share, bar) : []), [read, r.f, r.t, d.settings.share, bar.minIsk, bar.minPct]); // eslint-disable-line react-hooks/exhaustive-deps
  const held = useMemo(() => (read ? judgeBids(read.bids, r, d.stock?.jita ?? {}, bar) : []), [read, r.f, r.t, d.stock, bar.minIsk, bar.minPct]); // eslint-disable-line react-hooks/exhaustive-deps
  const worth = rows.filter((x) => x.worth);
  const small = rows.filter((x) => !x.worth && !x.doubts.length);
  const doubted = rows.filter((x) => x.doubts.length);
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
              <td>{isk(x.resale)}<span className="sub">{x.resale < x.fair && x.nextAsk != null ? `next listing ${isk(x.nextAsk)}` : `trades to ${isk(x.fair)}`}</span></td>
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
              tip={'The least a snipe must make after your fees to count, and to be mailed.\n\n• The same bar applies to bids for what you hold: how much more selling into one gets than listing.'} />
            <NumChip id="sn-pct" label="Return at least" value={bar.minPct} onChange={(v) => setBar({ minPct: v ?? 0 })} width={60} decimals={1} percent
              tip="Profit as a share of what buying it out costs, after your fees" />
            <span className="note small" style={{ margin: 0 }}>
              {read === undefined ? 'Asking the cloud…'
                : error ? `Couldn’t reach the cloud: ${error}.`
                  : !read ? 'The cloud hasn’t read the book yet: its first read comes within five minutes of it starting.'
                    : <>Read {ago(read.at, now)}, all {units(read.pages)} pages of The Forge’s book.{nextRead && until(nextRead, now) ? ` Next read ${until(nextRead, now)}.` : ''}</>}
            </span>
          </div>
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
