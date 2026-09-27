import { useEffect, useMemo, useState } from 'react';
import { GitPullRequestArrow, Hourglass, Inbox, Layers, Lock, Play, Plus, RefreshCw, TrendingDown } from 'lucide-react';
import { computePosition } from '../lib/positions';
import { ago, isk, iskBig, iskBigSigned, pct, units, until } from '../lib/format';
import { useData } from '../lib/store';
import { syncCharacter, useSyncState } from '../lib/sync';
import { breakEvenSpread, effectiveSkills, orderSlots, rates } from '../lib/fees';
import { startPosition } from '../lib/actions';
import { navigate, useAuth, useNow } from '../lib/hooks';
import { nearMisses, squeezed } from '../lib/signals';
import { JITA_44 } from '../lib/constants';
import { readSignals, useSignals } from '../lib/watch';
import { toast } from '../lib/toast';
import { ItemSearch, useTypeName } from './common';
import { nearSummary } from './NearMisses';
import { Check, cssVars, Empty, Guide, ItemIcon, PageHead, Seg, Sparkline, Th } from './ui';

const todayUTC = () => new Date().toISOString().slice(0, 10);
const fmtD = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');

export function Positions() {
  const d = useData();
  const auth = useAuth();
  const nameOf = useTypeName();
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [from, setFrom] = useState(todayUTC);
  const [jitaOnly, setJitaOnly] = useState(true);
  const sync = useSyncState();
  const sig = useSignals();
  const now = useNow();
  const r = rates(d.settings);
  const be2 = breakEvenSpread(r, 2);

  const all = useMemo(
    () => d.positions.map((p) => ({ p, c: computePosition(p, d, d.settings) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.positions, d.txs, d.journal, d.orders, d.settings],
  );
  const done = useMemo(() => new Set(d.nearDone), [d.nearDone]);
  const txs = useMemo(() => Object.values(d.txs), [d.txs]);

  // The margin line needs each open position's recent history.
  const openTypes = useMemo(() => [...new Set(d.positions.filter((p) => p.status === 'open').map((p) => p.typeId))], [d.positions]);
  useEffect(() => { if (openTypes.length) readSignals(openTypes).catch(() => undefined); }, [openTypes]);

  const shown = all.filter(({ p }) => filter === 'all' || p.status === filter);
  const realized = all.reduce((s, x) => s + x.c.realized, 0);
  const atCost = all.reduce((s, x) => s + x.c.costOfStock, 0);
  const openN = all.filter((x) => x.p.status === 'open').length;
  const openOrders = Object.values(d.orders).filter((o) => o.state === 'open').length;
  const slots = orderSlots(effectiveSkills(d.settings));

  function create(t: { id: number; name: string }) {
    const openedAt = from ? `${from}T00:00:00Z` : new Date().toISOString();
    const res = startPosition(t.id, openedAt, jitaOnly);
    if (res.existed) toast(`You already have an open position for ${t.name}.`, 'warn');
    navigate(`positions/${res.id}`);
  }

  const tiles = [
    { l: 'Realized profit, all positions', v: iskBigSigned(realized), c: realized >= 0 ? 'var(--pos)' : 'var(--neg)', n: 'Across open and closed' },
    { l: 'Stock held, at cost', v: iskBig(atCost), n: 'What your unsold units cost you' },
    { l: 'Open positions', v: units(openN), n: `${units(all.length - openN)} closed` },
    ...(Object.keys(d.orders).length ? [{ l: 'Market orders open', v: `${units(openOrders)} of ${units(slots)}`, c: openOrders >= slots ? 'var(--acc2)' : undefined, n: `Order slots as ${d.settings.clone === 'alpha' ? 'Alpha' : 'Omega'}` }] : []),
  ];

  return (
    <div className="page" style={{ minHeight: 620 }}>
      <PageHead
        kicker="04 · Your book" title="Positions"
        lede="A position is an item you’re trading. From its start date, your buys and sells of that item in Jita 4-4 count towards it. Anything else you buy stays out."
        actions={auth && (
          <button type="button" className="btn tall" disabled={sync.running} onClick={() => syncCharacter()}>
            <RefreshCw aria-hidden="true" className={sync.running ? 'spinning' : undefined} />{sync.running ? 'Checking…' : 'Check for new trades'}
          </button>
        )}
      />

      {all.length > 0 && (
        <div data-rv="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          {tiles.map((t) => (
            <div key={t.l} className="gtile" style={cssVars({ '--c': t.c })}>
              <div className="tile-l">{t.l}</div><div className="tile-v">{t.v}</div><div className="tile-n">{t.n}</div>
            </div>
          ))}
        </div>
      )}

      <div data-rv="" style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <section className="newpos" aria-label="Start a position">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 6 }}>
            <span className="kicker">New position</span>
            <span style={{ fontSize: 12, color: 'var(--label)' }}>Set the start before your first buy</span>
          </div>
          <div className="field" style={{ width: 170 }}>
            <label htmlFor="p-from">Count trades from <span style={{ color: 'var(--faint)', textTransform: 'none' }}>EVE time</span></label>
            <input id="p-from" type="date" className="num" value={from} onChange={(e) => setFrom(e.target.value)} style={{ colorScheme: 'dark' }} />
          </div>
          <Check checked={jitaOnly} onChange={setJitaOnly} bare>Only Jita 4-4 trades</Check>
          <div className="field" style={{ flex: '1 1 320px' }}>
            <span>Item</span>
            <ItemSearch onFound={create} button="Start position" placeholder="e.g. Hammerhead II" width={280} />
          </div>
        </section>
        <div className="infobox">
          <Hourglass aria-hidden="true" />
          <span>
            <b>Trades arrive on EVE’s schedule, not yours.</b> ESI holds wallet transactions for an hour before it hands over new ones, so a fill won’t show here straight away.
            {' '}{d.meta.lastSync ? `Last checked ${ago(d.meta.lastSync, now)}.` : 'Not checked yet.'}
            {until(d.meta.tradesFreshAt, now) && ` New trades can appear ${until(d.meta.tradesFreshAt, now)}.`}
            {d.stock && d.stock.inContainers > 0 && ` ${units(d.stock.inContainers)} items sit in containers or ships, which ESI reports against the container rather than a station, so stock checks leave them out.`}
          </span>
        </div>
      </div>

      <section className="panel flush" data-rv="" style={{ flex: 1, minHeight: 240 }}>
        <div className="panel-bar">
          <Seg label="Show" value={filter} onChange={setFilter} size="md" options={[
            { v: 'open', label: 'Open', n: units(all.filter((x) => x.p.status === 'open').length) },
            { v: 'closed', label: 'Closed', n: units(all.filter((x) => x.p.status === 'closed').length) },
            { v: 'all', label: 'All', n: units(all.length) },
          ]} />
          <span className="note small">Click a row to open the position</span>
        </div>
        {!shown.length ? (
          <Empty icon={Layers} action={!all.length ? <button type="button" className="btn primary" onClick={() => document.getElementById('p-from')?.focus()}><Plus aria-hidden="true" />Start one above</button> : undefined}>
            {all.length ? 'No positions here.' : 'Start a position for an item you want to trade. Your ESI trades for it will be matched automatically after each sync.'}
          </Empty>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl" style={{ minWidth: 1250 }}>
              <thead>
                <tr>
                  <Th left>Item</Th><Th left>Status</Th><Th>Since</Th><Th>Bought</Th><Th>Sold</Th><Th>In stock</Th>
                  <Th>Avg buy</Th><Th>Avg sell</Th><Th>Realized profit</Th><Th>Return</Th>
                  <Th title="Margin squeeze" tip={'How much room is left to trade this item profitably.\n\n• Each day’s high-to-low range over the last week, as a share of its average: what trading both sides can capture.\n• The dashed line is your break-even spread, allowing two price changes.\n\nWhen the range narrows toward the line, competition is squeezing you out. Sell down before you’re stuck holding stock.'}>Margin, 7 d</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ p, c }) => {
                  const name = nameOf(p.typeId);
                  const nm = nearMisses(p, txs, d.positions, done, JITA_44);
                  const s = sig.signals[p.typeId]?.stats;
                  const range = s?.range7;
                  const last = range?.length ? range[range.length - 1] : null;
                  const sq = p.status === 'open' && squeezed(range, be2);
                  const mc = sq ? 'var(--neg)' : 'var(--acc)';
                  return (
                    <tr key={p.id} className="click" onClick={() => navigate(`positions/${p.id}`)}>
                      <td className="l">
                        <span className="cellrow">
                          <ItemIcon id={p.typeId} />
                          <span style={{ minWidth: 0 }}>
                            <a href={`#/positions/${p.id}`} className="name ellipsis" style={{ display: 'block', color: 'var(--ink)' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`positions/${p.id}`); }}>{name}</a>
                            {nm.length > 0 && (
                              <span className="near" tabIndex={0} data-tip-title="Trades this position skipped"
                                data-tip={`${nearSummary(nm, p)} Open the position to review, count or ignore them.`}>
                                <GitPullRequestArrow aria-hidden="true" />{nm.length} {nm.length === 1 ? 'trade' : 'trades'} nearby
                              </span>
                            )}
                            <span className="prog" aria-hidden="true"><span style={{ width: `${c.bought ? Math.min(100, (c.sold / c.bought) * 100) : 0}%` }} /></span>
                          </span>
                        </span>
                      </td>
                      <td className="l"><span className="status-tag" style={cssVars({ '--c': p.status === 'open' ? 'var(--acc)' : 'var(--label)' })}>{p.status === 'open' ? 'Open' : 'Closed'}</span></td>
                      <td style={{ color: 'var(--dim)' }}>{fmtD(p.openedAt)}</td>
                      <td>{units(c.bought)}</td>
                      <td>{units(c.sold)}</td>
                      <td>{units(c.stock)}</td>
                      <td>{isk(c.avgBuy)}</td>
                      <td>{isk(c.avgSell)}</td>
                      <td style={{ color: c.realized >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(c.realized)}</td>
                      <td style={{ color: c.roi == null ? 'var(--label)' : c.roi >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{pct(c.roi, 1)}</td>
                      <td style={{ width: 150 }}>
                        {p.status !== 'open' ? <span className="faint">–</span> : !range?.length ? <span className="faint">{sig.busy ? '…' : '–'}</span> : (
                          <span tabIndex={0} data-tip-title="Margin, 7 days"
                            data-tip={sq
                              ? `The daily range fell from ${pct(range[0], 1)} to ${pct(last, 1)} in ${range.length} days, close to the ${pct(be2, 1)} you need after fees and a couple of relists.\n\nConsider selling down before it closes.`
                              : `Daily range over the last ${range.length} trading days. The dashed line is your break-even spread with two price changes, ${pct(be2, 1)}.`}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <span style={{ width: 64 }}><Sparkline values={range} baseline={be2} color={mc} label="Daily range, last week" /></span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <span style={{ color: mc }}>{pct(last, 1)}</span>
                              {sq && <span className="lbl" style={{ fontSize: 9.5, color: 'var(--neg)', letterSpacing: '.08em' }}>Squeezed</span>}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Guide
        title="How to use Positions"
        intro="A position is one item you’re trading, from its first buy to its last sell. It’s how the app works out what you actually made."
        steps={[
          { icon: Play, title: 'Start before you buy', body: 'Set the start date to before your first buy order, so every fill counts. Trades before it are flagged on the position as “trades nearby”, so you can count or ignore them.' },
          { icon: Layers, title: 'One open position per item', body: 'Close it when everything has sold, then start a new one next time. That keeps each result clean.' },
          { icon: TrendingDown, title: 'Watch the margin column', body: 'It shows the daily range over the last week against your break-even. “Squeezed” means competition is closing the gap — sell down before you’re stuck.' },
          { icon: Lock, title: 'Close to lock in', body: 'Closing freezes the result, which is what Results and the To do list use.' },
        ]}
        habits={[{ icon: Inbox, title: 'Personal purchases stay out', body: 'Anything you bought for yourself can be excluded inside a position, or tagged Personal on the Wallet page.' }]}
      />
    </div>
  );
}

