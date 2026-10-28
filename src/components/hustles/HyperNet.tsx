import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Clock, Coins, Copy, Gem, LogIn, RefreshCw, Ticket, TrendingDown } from 'lucide-react';
import { SCOPE } from '../../lib/config';
import { fmtDateTime, isk, iskBig, iskBigSigned, pct, units, until } from '../../lib/format';
import { navigate, useAuth, useNow } from '../../lib/hooks';
import {
  average, coresFor, HYPERCORE, LSI, NODE_COUNTS, OFFER_DAYS, offersOf, outcomes, OWN_RATE_MIN, RELAY_FEE, SELL_OUT_REPORTED, sellOutRate, tableRows,
  unreadRaffles, type Offer, type TableRow,
} from '../../lib/hypernet';
import { jitaOrders } from '../../lib/market';
import { sanitizePrefs } from '../../lib/prefs';
import { update, useData } from '../../lib/store';
import { toast } from '../../lib/toast';
import { Points } from '../Facts';
import { ItemSearch, NameInGame, plainPrice, useEnsureNames, useTypeName } from '../common';
import { usePlexPrice } from '../plexPrice';
import { ItemIcon, NumChip, Seg, Tiles, Tip } from '../ui';

/**
 * HyperNet: hosting an offer on the HyperNet Relay so it pays even when someone else wins (design:
 * docs/superpowers/specs/2026-10-28-hypernet-trader-design.md; the rules and the maths are hypernet.ts's). The user
 * (28 October 2026): "I need a tool that can tell me if I pick an item and buy it off the market and the hypercores off
 * the market what I should price it as etc so I still make a profit if someone else wins. Of course the price should be
 * reasonable or a bargain enough so people actually buy tickets." They chose the table, a row per node count, as the
 * easiest to read at a glance, and a record of the offers the main hosts (from EVE's notices kept by the cloud and the
 * sync). The main only; no phone layout.
 */

const ITEM_KEY = 'jita-ledger:hypernet-item';
const readItem = (): number => { try { const v = Number(localStorage.getItem(ITEM_KEY)); return Number.isInteger(v) && v > 0 ? v : LSI; } catch { return LSI; } };
const keepItem = (id: number) => { try { localStorage.setItem(ITEM_KEY, String(id)); } catch { /* just not kept */ } };

/** The pot as a multiple of what you pay: 1.5× is what one high-volume host reported sells (October 2025). */
const MULTS = ['1.3', '1.4', '1.5', '1.6'] as const;
type PotMode = (typeof MULTS)[number] | 'isk';

/** Others' cheapest Jita 4-4 listing of an item, your own orders taken off the book. */
type Cheapest = { state: 'loading' } | { state: 'read'; price: number | null; at: number } | { state: 'failed'; error: string };

function useCheapest(typeId: number | null, own: number[]): [Cheapest, () => void] {
  const [s, setS] = useState<Cheapest>({ state: 'loading' });
  const [again, setAgain] = useState(0);
  const key = own.join(',');
  useEffect(() => {
    if (typeId == null) return;
    let alive = true;
    setS({ state: 'loading' });
    const mine = new Set(own);
    jitaOrders(typeId, again > 0).then((r) => {
      if (!alive) return;
      const sells = r.orders.filter((o) => !o.isBuy && !mine.has(o.id)).map((o) => o.price);
      setS({ state: 'read', price: sells.length ? Math.min(...sells) : null, at: Date.now() });
    }).catch((e) => { if (alive) setS({ state: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [typeId, key, again]); // eslint-disable-line react-hooks/exhaustive-deps
  return [s, () => setAgain((n) => n + 1)];
}

const priceOf = (c: Cheapest) => (c.state === 'read' ? c.price : null);
/** Why a book's price isn't there, in words. */
const cheapestWhy = (c: Cheapest, what: string) => (c.state === 'loading' ? 'Pricing…' : c.state === 'failed' ? `Its Jita book couldn’t be read: ${c.error}` : `Nobody else lists ${what} in Jita 4-4`);

/** Green for a gain, red for a loss, a figure signed. */
function Signed({ v, children }: { v: number | null; children?: ReactNode }) {
  if (v == null || !Number.isFinite(v)) return <span className="faint">–</span>;
  return <span style={{ color: v >= 0 ? 'var(--pos)' : 'var(--neg-t)' }}>{iskBigSigned(Math.abs(v) < 0.005 ? 0 : v)}{children}</span>;
}

async function copyNode(price: number) {
  try {
    await navigator.clipboard.writeText(plainPrice(price));
    toast(`Node price copied: ${plainPrice(price)}`, 'ok', { lifeMs: 2500 });
  } catch { toast('Couldn’t copy: your browser refused. Type it carefully.', 'err'); }
}

export function HyperNet() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(30_000);
  const name = useTypeName();
  const plex = usePlexPrice();
  const own = useMemo(() => Object.values(d.orders).map((o) => o.orderId).sort((a, b) => a - b), [d.orders]);

  const [typeId, setTypeId] = useState<number>(readItem);
  const pick = (id: number) => { setTypeId(id); keepItem(id); };
  const [item, againItem] = useCheapest(typeId, own);
  const [core, againCore] = useCheapest(HYPERCORE, own);

  // The record: every offer the main hosted, from the notices kept (records of kind `raffles`) and the journal.
  const corePrice = priceOf(core);
  const offers = useMemo(() => offersOf(d.raffles ?? {}, d.journal, d.txs, {
    now, me: auth?.characterId ?? null, won: d.prefs.hypernet?.won,
    coreCount: plex.price ? (pot: number) => coresFor(pot, plex.price!) : null, corePrice,
  }), [d.raffles, d.journal, d.txs, now, auth?.characterId, d.prefs.hypernet?.won, plex.price, corePrice]);
  const unread = useMemo(() => unreadRaffles(d.raffles ?? {}).length, [d.raffles]);
  useEnsureNames(useMemo(() => [typeId, HYPERCORE, ...offers.map((o) => o.typeId)], [typeId, offers]));

  // The chance an offer sells out: typed (kept in prefs), else your own rate from enough finished offers, else the report.
  const rate = sellOutRate(offers);
  const ownRate = rate.finished >= OWN_RATE_MIN ? rate.sold / rate.finished : null;
  const typedS = d.prefs.hypernet?.sellOut ?? null;
  const sellOut = typedS ?? ownRate ?? SELL_OUT_REPORTED;
  const sellOutFrom = typedS != null ? 'as you typed it'
    : ownRate != null ? `your own rate: ${units(rate.sold)} of your ${units(rate.finished)} finished offers sold out`
      : 'one high-volume host reported about one offer in two sells out, October 2025';
  const setSellOut = (v: number | null) => update((x) => {
    const h = { ...(x.prefs.hypernet ?? {}) };
    if (v == null) delete h.sellOut; else h.sellOut = v;
    return { prefs: sanitizePrefs({ ...x.prefs, hypernet: h }) };
  });

  const quick = useMemo(() => [...new Set([LSI, ...offers.map((o) => o.typeId)])].slice(0, 6), [offers]);
  const notesScope = (auth?.scopes ?? []).includes(SCOPE.notifications);

  return (
    <>
      <div className="intro-row">
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <p style={{ margin: 0 }}>Host an item on the HyperNet Relay and keep some of its nodes yourself: <b>priced so you never lose ISK when someone else wins</b>, and win the item back to host again when you do.</p>
          <Points compact items={[
            { kind: 'warn', icon: Coins, lead: 'The fees', text: 'HyperCores are paid when you create it and lost if it expires; the relay keeps 5% of the pot only when every node sells.',
              tip: 'The relay’s 5% is taken from the payout when the offer sells out, and nothing is taken when it expires (CCP).\n\nThe HyperCores are spent when the offer is created and never refunded (CCP). How many it asks for isn’t published: the count here is fitted on three players’ measurements from 2019 to 2025, about one core per two PLEX of pot. Type the count the game’s window shows.' },
            { kind: 'warn', icon: Clock, lead: '3 days', text: 'an offer runs three days and can’t be cancelled; unsold, every buyer is refunded and the item comes back.' },
            { kind: 'info', icon: Ticket, lead: 'Your own nodes', text: 'don’t change the buyers’ odds: each node is one chance, whoever holds it.' },
            { kind: 'tip', icon: TrendingDown, lead: 'Every node you keep', text: 'lowers what you make on average; it only helps the offer sell out, and makes you likelier to win the item back.',
              tip: 'Sold out, you win your share of the nodes and someone else the rest. Each node you keep costs its price (less the 5% that comes back in the payout) and adds a share of the item, which is worth less than the pot: so the average falls by the sell-out chance × (pot − the item’s cost) ÷ the nodes for every node kept.' },
          ]} />
        </div>
      </div>

      <Calculator typeId={typeId} pick={pick} quick={quick} item={item} againItem={againItem} core={core} againCore={againCore}
        plex={plex.price} plexLoading={plex.loading} name={name} sellOut={sellOut} sellOutFrom={sellOutFrom} typedS={typedS} setSellOut={setSellOut} />

      <YourOffers offers={offers} unread={unread} now={now} name={name} notesScope={notesScope} loggedIn={!!auth} />
    </>
  );
}

function Calculator(props: {
  typeId: number; pick: (id: number) => void; quick: number[]; item: Cheapest; againItem: () => void; core: Cheapest; againCore: () => void;
  plex: number | null; plexLoading: boolean; name: (id: number) => string;
  sellOut: number; sellOutFrom: string; typedS: number | null; setSellOut: (v: number | null) => void;
}) {
  const { typeId, item, core, plex, name } = props;
  // What you typed you paid is for the item it was typed for: another item starts from its Jita price.
  const [costTyped, setCost] = useState<number | null>(null);
  useEffect(() => { setCost(null); }, [typeId]);
  const [mode, setMode] = useState<PotMode>('1.5');
  const [potTyped, setPotTyped] = useState<number | null>(null);
  const [coresTyped, setCoresTyped] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const jita = priceOf(item);
  const cost = costTyped ?? jita;
  const pot = mode === 'isk' ? potTyped : cost != null ? cost * Number(mode) : null;
  const estimate = pot != null && plex != null ? coresFor(pot, plex) : null;
  const coreCount = coresTyped ?? estimate;
  const corePrice = priceOf(core);
  const coresIsk = coreCount != null && corePrice != null ? coreCount * corePrice : null;
  const scale = coresTyped == null && plex != null && corePrice != null ? { plexPrice: plex, corePrice } : undefined;
  const rows: TableRow[] | null = pot != null && pot > 0 && cost != null && coresIsk != null ? tableRows({ pot, cost, cores: coresIsk, scale }) : null;
  const itemName = name(typeId);

  // What the table is waiting for, in words.
  const waiting = cost == null ? `What you pay: ${cheapestWhy(item, itemName)}${item.state === 'loading' ? '' : '. Type what it cost you.'}`
    : pot == null || pot <= 0 ? 'Type the pot in ISK.'
      : coreCount == null ? (props.plexLoading ? 'The HyperCores: reading PLEX’s price…' : 'The HyperCores: PLEX’s price isn’t read, so the count can’t be estimated. Type the count the game’s window shows.')
        : corePrice == null ? `The HyperCores’ price: ${cheapestWhy(core, 'HyperCores')}` : null;

  return (
    <div className="col" style={{ gap: 12 }} data-hypernet="calculator">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <ItemSearch key={typeId} keep button="Price it" initial={itemName.startsWith('Item #') ? undefined : itemName} tip="The item to host: one repackaged item, in an NPC station" tipTitle="Item"
          onFound={(t) => props.pick(t.id)} />
        {props.quick.filter((id) => id !== typeId).map((id) => (
          <button key={id} type="button" className="link-btn" onClick={() => props.pick(id)} data-tip={id === LSI ? 'A popular item to host, not too dear to commit to' : 'An item you hosted before'}>{name(id)}</button>
        ))}
      </div>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 4 }}>
          <NumChip label="You pay" value={cost} onChange={setCost} width={130} tipTitle="What the item costs you"
            tip="Jita 4-4’s cheapest listing from others (your own orders taken off the book), or what it cost you: type it." />
          <span className="note small" style={{ margin: 0 }} data-hypernet="cost-said">
            {costTyped != null ? <>Typed. <button type="button" className="link-btn" onClick={() => setCost(null)}>Use Jita’s cheapest</button></>
              : jita != null ? 'Jita’s cheapest listing now' : cheapestWhy(item, itemName)}
            {item.state === 'failed' && <> <button type="button" className="link-btn" onClick={props.againItem}><RefreshCw aria-hidden="true" />Try again</button></>}
          </span>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="lbl">Pot</span>
            <Seg size="sm" label="The pot" value={mode} onChange={setMode} options={[
              ...MULTS.map((m) => ({ v: m as PotMode, label: `${m}×`, tip: m === '1.5' ? 'What sells, one high-volume host reported (October 2025): a pot of about 1.45 to 1.55 times the item’s market price' : `A pot of ${m} times what you pay` })),
              { v: 'isk' as PotMode, label: 'ISK', tip: 'Type the pot yourself' },
            ]} />
            {mode === 'isk' && <NumChip label="Pot" value={potTyped} onChange={setPotTyped} width={130} tip="The total of every node’s price" />}
          </div>
          <span className="note small" style={{ margin: 0 }} data-hypernet="pot-said">
            {pot == null ? '–' : <>{iskBig(pot)}{jita != null ? `: ${(pot / jita).toFixed(2)}× Jita’s cheapest listing` : ''}</>}
          </span>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <NumChip label="HyperCores" value={coreCount} onChange={setCoresTyped} width={70} decimals={0} tipTitle="HyperCores"
            tip={'How many the offer asks for: the count the game’s window shows, when you create it.\n\nUntil you type it, an estimate: about one core per two PLEX of pot (at least one), fitted on three players’ measurements from 2019 to 2025. CCP doesn’t publish the rule.'} />
          <span className="note small" style={{ margin: 0 }} data-hypernet="cores-said">
            {coresTyped != null ? <>Typed. <button type="button" className="link-btn" onClick={() => setCoresTyped(null)}>Estimate it</button> · </>
              : estimate != null ? `Estimated from PLEX at ${isk(plex)} · ` : ''}
            {corePrice != null ? `× ${isk(corePrice)} (Jita’s cheapest)` : cheapestWhy(core, 'HyperCores')}
            {coresIsk != null && <> = <b style={{ color: 'var(--neg-t)' }}>{iskBig(coresIsk)}</b>, lost if it expires</>}
            {core.state === 'failed' && <> <button type="button" className="link-btn" onClick={props.againCore}><RefreshCw aria-hidden="true" />Try again</button></>}
          </span>
        </div>
      </div>

      {!rows ? <p className="note" style={{ margin: 0 }} data-hypernet="waiting">{waiting}</p> : (
        <div className="tbl-scroll" style={{ flex: 'none' }}>
          <table className="tbl compact" data-hypernet="table">
            <thead><tr>
              <th scope="col" className="l"><span className="th">Nodes</span></th>
              <th scope="col"><span className="th">Node price<Tip title="Node price" text="The pot over the nodes, rounded up to a whole ISK: what you type into the game’s window. The figures here are worked out on that price times the nodes." /></span></th>
              <th scope="col"><span className="th">Keep at most<Tip title="Keep at most" text={'The most nodes you can buy yourself and still not lose ISK when someone else wins.\n\n• Someone else wins: the payout (the pot less the relay’s 5%), less the cores, your own nodes and what the item cost.\n• Never more than all but one node.'} /></span></th>
              <th scope="col"><span className="th">Your chance<Tip title="Your chance" text="Your share of the nodes: your chance of winning the item back once every node sells." /></span></th>
              <th scope="col"><span className="th">Someone else wins</span></th>
              <th scope="col"><span className="th">You win<Tip title="You win" text="The payout less the cores and your own nodes, and the item comes back to host again." /></span></th>
              <th scope="col"><span className="th">Expires<Tip title="Expires" text={`Not every node sold in ${OFFER_DAYS} days: every buyer is refunded, you included, the item comes back, and the cores are lost.`} /></span></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.nodes}>
                  <tr className={'click' + (open === r.nodes ? ' open' : '')} data-hypernet={`row:${r.nodes}`} onClick={() => setOpen(open === r.nodes ? null : r.nodes)}>
                    <td className="l">
                      <button type="button" className="panel-toggle" aria-expanded={open === r.nodes} onClick={(e) => { e.stopPropagation(); setOpen(open === r.nodes ? null : r.nodes); }}>
                        <ChevronRight className="chev" aria-hidden="true" /><span className="name">{units(r.nodes)} nodes</span>
                      </button>
                    </td>
                    <td>{isk(r.nodePrice)}<span className="sub">pot {iskBig(r.pot)}</span></td>
                    {r.keep == null || !r.outcome ? (
                      <td colSpan={5} className="l wrap" style={{ color: 'var(--neg-t)' }} data-hypernet={`unsafe:${r.nodes}`}>
                        No share is safe at this pot{r.raiseTo != null ? <>: raise it to <b>{iskBig(r.raiseTo)}</b>{cost ? ` (${(r.raiseTo / cost).toFixed(2)}× what you pay)` : ''}</> : ''}.
                        <span className="sub">Even keeping none loses when someone else wins: <Signed v={outcomes({ pot: r.pot, nodes: r.nodes, keep: 0, cost: cost!, cores: coresIsk! })?.other ?? null} /></span>
                      </td>
                    ) : (
                      <>
                        <td data-hypernet={`keep:${r.nodes}`}>{units(r.keep)}<span className="sub">of {units(r.nodes)}</span></td>
                        <td>{pct(r.outcome.chance, 1)}</td>
                        <td data-hypernet={`other:${r.nodes}`}><Signed v={r.outcome.other} /></td>
                        <td data-hypernet={`win:${r.nodes}`}><Signed v={r.outcome.win} /><span className="sub">and the {itemName} back</span></td>
                        <td data-hypernet={`expires:${r.nodes}`}><Signed v={r.outcome.expires} /></td>
                      </>
                    )}
                  </tr>
                  {open === r.nodes && (
                    <tr className="open"><td colSpan={7} className="l" style={{ whiteSpace: 'normal', height: 'auto', padding: '12px 16px 16px' }}>
                      <RowDetail row={r} cost={cost!} cores={coresIsk!} itemName={itemName} sellOut={props.sellOut} sellOutFrom={props.sellOutFrom} typedS={props.typedS} setSellOut={props.setSellOut} />
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && <span className="note small" style={{ margin: 0 }}>Click a row to choose how many to keep and copy its node price. The node counts are the ones players report the relay offers ({NODE_COUNTS.join(', ')}).</span>}
    </div>
  );
}

function RowDetail({ row, cost, cores, itemName, sellOut, sellOutFrom, typedS, setSellOut }: {
  row: TableRow; cost: number; cores: number; itemName: string; sellOut: number; sellOutFrom: string; typedS: number | null; setSellOut: (v: number | null) => void;
}) {
  const safe = row.keep;
  const [keep, setKeep] = useState<number>(safe ?? 0);
  const k = Math.max(0, Math.min(row.nodes - 1, keep));
  const o = outcomes({ pot: row.pot, nodes: row.nodes, keep: k, cost, cores });
  const avg = o ? average({ outcome: o, sellOut }) : null;
  const perNode = sellOut * (row.pot - cost) / row.nodes;
  const over = safe == null || k > safe;
  return (
    <div className="col" style={{ gap: 12, fontFamily: 'var(--f-body)' }} data-hypernet={`detail:${row.nodes}`}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="lbl">Keep</span>
          <input type="range" min={0} max={row.nodes - 1} step={1} value={k} onChange={(e) => setKeep(Number(e.target.value))} style={{ width: 260 }}
            aria-label={`Nodes to keep, of ${row.nodes}`} list={`hn-safe-${row.nodes}`} />
          {safe != null && <datalist id={`hn-safe-${row.nodes}`}><option value={safe} label="safe" /></datalist>}
          <b className="mono" style={{ color: over ? 'var(--neg-t)' : 'var(--ink)' }} data-hypernet="keep-choice">{units(k)} of {units(row.nodes)}</b>
        </label>
        <span className="note small" style={{ margin: 0 }}>
          {safe == null ? 'No share is safe at this pot.' : k === safe ? 'The most that never loses when someone else wins.' : k < safe ? `Safe: up to ${units(safe)} never loses.` : `Over the ${units(safe)} that never loses: someone else winning costs you ISK.`}
          {safe != null && k !== safe && <> <button type="button" className="link-btn" onClick={() => setKeep(safe)}>Keep {units(safe)}</button></>}
        </span>
        <button type="button" className="btn" onClick={() => void copyNode(row.nodePrice)} data-tip="Copies the node price as plain digits, for the game’s window" data-hypernet="copy">
          <Copy aria-hidden="true" />Copy node price {isk(row.nodePrice)}
        </button>
      </div>
      {o && <Tiles min={170} inset items={[
        { l: 'Someone else wins', v: <Signed v={o.other} />, n: `${pct(1 - o.chance, 1)} of the time it sells out` },
        { l: 'You win', v: <Signed v={o.win} />, n: `and the ${itemName} back; ${pct(o.chance, 1)} of the time` },
        { l: 'Expires', v: <Signed v={o.expires} />, n: 'the cores lost; the item and your nodes come back' },
        { l: 'On average', v: <Signed v={avg} />, n: `at a ${pct(sellOut, 0)} chance it sells out`,
          tip: `Sold out (a ${pct(sellOut, 0)} chance), you win ${pct(o.chance, 1)} of the time and someone else the rest; otherwise it expires.\n\nEvery node you keep lowers this by ${iskBig(Math.max(0, perNode))}: keeping nodes only helps the offer sell out.` },
      ]} />}
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <NumChip label="Sells out" percent value={+(sellOut * 100).toFixed(1)} decimals={1} width={52}
          onChange={(n) => setSellOut(n == null ? null : n > 0 && n <= 100 ? n / 100 : typedS)} tipTitle="The chance it sells out"
          tip="How likely every node is to sell within the three days. Only what you type here is kept; until then it’s your own rate once 5 of your offers have finished, else what one high-volume host reported." />
        <span className="note small" style={{ margin: 0 }} data-hypernet="sellout-said">
          {sellOutFrom}{typedS != null && <> <button type="button" className="link-btn" onClick={() => setSellOut(null)}>Forget it</button></>}
        </span>
      </div>
    </div>
  );
}

const STATE_SAID: Record<Offer['state'], string> = { open: 'Open', soldOut: 'Sold out', expired: 'Expired', unknown: 'Not known yet' };

function setWon(id: string, v: boolean | null) {
  update((x) => {
    const won = { ...(x.prefs.hypernet?.won ?? {}) };
    if (v == null) delete won[id]; else won[id] = v;
    return { prefs: sanitizePrefs({ ...x.prefs, hypernet: { ...(x.prefs.hypernet ?? {}), won } }) };
  });
}

/** What's an estimate in an offer's result, in words, for its tip. */
function estimatesSaid(o: Offer): string {
  const out: string[] = [];
  if (o.estimates.includes('cores')) out.push(`• The cores: ${o.cores.count != null ? units(o.cores.count) : '?'} estimated from the pot at today’s PLEX price, ${o.cores.priceFrom === 'bought' ? 'priced at your own HyperCore purchases before it' : 'priced at Jita’s cheapest HyperCore now'}${o.cores.isk != null ? ` (${iskBig(o.cores.isk)})` : ''}.`);
  if (o.estimates.includes('fee')) out.push(`• The relay’s fee: 5% of the pot (${iskBig(RELAY_FEE * o.pot)}), taken as charged: no fee entry was found beside a payout of the whole pot.`);
  if (o.estimates.includes('refunds')) out.push(`• ${units(o.refunds.assumed)} of your nodes taken as refunded: their refunds aren’t in your journal yet.`);
  if (o.cost) out.push(`• The item at your purchase of ${fmtDateTime(o.cost.at)}: ${iskBig(o.cost.unit)}.`);
  return out.length ? `How it’s worked out:\n\n${out.join('\n')}` : '';
}

function YourOffers({ offers, unread, now, name, notesScope, loggedIn }: { offers: Offer[]; unread: number; now: number; name: (id: number) => string; notesScope: boolean; loggedIn: boolean }) {
  const rate = sellOutRate(offers);
  const known = offers.filter((o) => o.result != null);
  const total = known.reduce((s, o) => s + o.result!, 0);
  const notKnown = offers.length - known.length;
  return (
    <div className="col" style={{ gap: 10 }} data-hypernet="offers">
      <b style={{ color: 'var(--ink)' }}>Your offers <span className="faint" style={{ fontWeight: 400 }}>· the main’s</span></b>
      {!notesScope && (
        <p className="note" style={{ margin: 0 }} data-hypernet="no-scope">
          {loggedIn ? 'Your login doesn’t include the notifications permission, so no offer of yours can be read: log in again to grant it.' : 'Log in to read your offers.'}{' '}
          <button type="button" className="link-btn" onClick={() => navigate('settings/account')}><LogIn aria-hidden="true" />Log in again</button>
        </p>
      )}
      {unread > 0 && <p className="note small" style={{ margin: 0 }} data-hypernet="unread">{units(unread)} HyperNet notice{unread === 1 ? '' : 's'} of an offer couldn’t be read (no item, nodes or node price in its text), so {unread === 1 ? 'it isn’t' : 'they aren’t'} listed.</p>}
      {!offers.length ? (
        <p className="note" style={{ margin: 0 }} data-hypernet="offers-empty">
          Each offer you host will be listed here: its nodes and node price, how it ended, your own nodes, who won and what it made. It’s read from EVE’s notice of
          it: the cloud reads your notifications hourly, and this browser on every sync, both with the notifications permission.
        </p>
      ) : (
        <>
          <Tiles min={200} items={[
            { l: 'Offers', v: units(offers.length), n: `${units(offers.filter((o) => o.state === 'open').length)} open now` },
            { l: 'Sold out', v: rate.finished ? `${units(rate.sold)} of ${units(rate.finished)}` : '–', n: rate.finished ? `of those finished: ${pct(rate.sold / rate.finished, 0)}` : 'none finished yet',
              tip: `Once ${OWN_RATE_MIN} of your offers have finished, this rate is the calculator’s sell-out chance.` },
            { l: 'Result in all', v: known.length ? <Signed v={total} /> : '–', n: notKnown ? `over ${units(known.length)} of ${units(offers.length)}: ${units(notKnown)} not known yet` : `over all ${units(offers.length)}`,
              c: known.length ? (total >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined,
              tip: 'What the offers whose result is known made: the payout less the relay’s fee, your own nodes (less refunds), the cores, and the item when someone else won it. One still running, whose end isn’t known, or whose winner isn’t marked isn’t in it.' },
          ]} />
          <div className="tbl-scroll" style={{ flex: 'none' }}>
            <table className="tbl compact" data-hypernet="offers-table">
              <thead><tr>
                <th scope="col" className="l"><span className="th">Item</span></th>
                <th scope="col"><span className="th">Nodes × node price</span></th>
                <th scope="col" className="l"><span className="th">Created</span></th>
                <th scope="col" className="l"><span className="th">State</span></th>
                <th scope="col"><span className="th">Your nodes<Tip title="Your nodes" text="Ticket entries in your journal of exactly its node price while it ran: the nodes you bought yourself." /></span></th>
                <th scope="col" className="l"><span className="th">Who won</span></th>
                <th scope="col"><span className="th">Result</span></th>
              </tr></thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id} className="hover" data-hypernet={`offer:${o.id}`}>
                    <td className="l" style={{ whiteSpace: 'normal', minWidth: 180 }}>
                      <span className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}><ItemIcon id={o.typeId} size="sm" /><NameInGame typeId={o.typeId} name={name(o.typeId)} className="name" /></span>
                    </td>
                    <td>{units(o.nodes)} × {isk(o.nodePrice)}<span className="sub">pot {iskBig(o.pot)}</span></td>
                    <td className="l">{fmtDateTime(o.created)}</td>
                    <td className="l" data-hypernet={`state:${o.id}`}>
                      {STATE_SAID[o.state]}
                      <span className="sub">{o.state === 'open' ? `ends ${until(o.endsAt, now) ?? ''}` : o.state === 'unknown' ? 'no notice or payout read past its 3 days' : o.endedAt ? fmtDateTime(o.endedAt) : ''}</span>
                    </td>
                    <td>{units(o.own.nodes)}<span className="sub">{o.own.nodes ? `${iskBig(o.own.isk)}${o.state === 'expired' ? ', refunded' : ''}` : 'none'}</span></td>
                    <td className="l" style={{ whiteSpace: 'normal' }} data-hypernet={`won:${o.id}`}><Winner o={o} /></td>
                    <td data-hypernet={`result:${o.id}`}>
                      {o.result != null ? <Signed v={o.result} />
                        : o.ifWon != null && o.ifOther != null ? <><Signed v={o.ifOther} /><span className="sub">if someone else won</span><span className="sub"><Signed v={o.ifWon} /> if you did</span></>
                          : <span className="faint">–</span>}
                      {o.result == null && o.why.result && !(o.ifWon != null && o.ifOther != null) && <span className="sub">{o.why.result}</span>}
                      {(o.result != null || o.ifWon != null) && estimatesSaid(o) && <Tip title="Result" text={estimatesSaid(o)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <span className="note small" style={{ margin: 0 }}><Gem aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: '-2px' }} /> The Wallet files your own nodes, the payouts and the relay’s fee as HyperNet hosting, a business; tickets in other people’s offers stay play.</span>
    </div>
  );
}

function Winner({ o }: { o: Offer }) {
  if (o.wonFrom === 'notice') return <>{o.won ? 'You' : 'Someone else'}<span className="sub">from EVE’s notice</span></>;
  if (o.state !== 'soldOut') return <span className="faint" data-tip={o.state === 'expired' ? 'Nobody: it expired' : o.state === 'open' ? 'Still running' : 'How it ended isn’t known yet'}>–</span>;
  if (o.wonFrom === 'marked') return (
    <>{o.won ? 'You' : 'Someone else'}<span className="sub">as you marked it · <button type="button" className="link-btn" onClick={() => setWon(o.id, null)}>Change</button></span></>
  );
  return (
    <span className="col" style={{ gap: 2, alignItems: 'flex-start' }}>
      <button type="button" className="link-btn" onClick={() => setWon(o.id, true)} data-hypernet="mark-won">You won it</button>
      <button type="button" className="link-btn" onClick={() => setWon(o.id, false)} data-hypernet="mark-other">Someone else won</button>
    </span>
  );
}
