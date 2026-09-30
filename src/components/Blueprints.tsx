import { useMemo, useState } from 'react';
import { ClipboardList, Copy, ExternalLink, FileSearch, ScrollText, Tags } from 'lucide-react';
import { getAuth, hasScope } from '../lib/auth';
import { comparables, kindKey, quoteBlueprint, readBlueprints, SCAM_SAID, unusedPrice, type BpKind, type BpQuote, type OwnedBlueprint, type RawBlueprint } from '../lib/blueprints';
import type { BpContract } from '../lib/bpContracts';
import { cloudBlueprintMarket, cloudEnabled } from '../lib/cloud';
import { SCOPE } from '../lib/config';
import { esi, esiAllPages } from '../lib/esi';
import { ago, isk, iskBig, units } from '../lib/format';
import { navigate, useAuth, useNow } from '../lib/hooks';
import { jitaOrders, openContractWindow, resolveNames } from '../lib/market';
import { toast } from '../lib/toast';
import { isStation, isStructure, structureInfo } from '../lib/universe';
import { copyPrice, plainPrice, useEnsureNames, useTypeName } from './common';
import { Empty, Flag, Guide, ItemIcon, Notice, PageHead, Panel, SortTh, Th, Tiles } from './ui';
import { Points } from './Facts';
import { SkillStrip } from './SkillStrip';
import { useData } from '../lib/store';
import { contractsAllowed } from '../lib/skillStatus';

type Row = {
  key: string; kind: BpKind; unused: boolean; count: number;
  /** Where they sit: container, ship or station names, with how many in each. */
  where: { name: string; n: number }[];
  quote: BpQuote | null;
  /** For unused originals, which can go on the market: its Jita book. */
  market: { bid: number | null; ask: number | null } | null;
};
type SortKey = 'item' | 'count' | 'asks' | 'sold' | 'suggest' | 'worth';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

const kindSaid = (k: BpKind, unused: boolean) =>
  k.copy ? `Copy · ${units(k.runs ?? 0)} run${k.runs === 1 ? '' : 's'} · ME ${k.me} / TE ${k.te}` : unused ? 'Original, unused' : `Original · ME ${k.me} / TE ${k.te}`;

/**
 * Your blueprints, priced for selling (lib/blueprints.ts, lib/bpContracts.ts). Read what you hold from ESI, then price
 * them on demand against The Forge's blueprint contracts: what others ask for the same kind and what vanished before
 * expiry in the last three days, from EVE Ref's public contract snapshot via the cloud. The user asked for buttons, not
 * a live scanner: nothing runs until pressed.
 */
export function Blueprints() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const name = useTypeName();
  const [owned, setOwned] = useState<OwnedBlueprint[] | null>(null);
  const [places, setPlaces] = useState<Map<number, string>>(() => new Map());
  const [market, setMarket] = useState<{ at: string | null; since: string | null; current: BpContract[]; vanished: BpContract[] } | null>(null);
  const [books, setBooks] = useState<Map<number, { bid: number | null; ask: number | null }>>(() => new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'worth', dir: 'desc' });
  useEnsureNames((owned ?? []).map((b) => b.typeId));
  const can = hasScope(SCOPE.blueprints);
  const cloud = cloudEnabled();

  const read = async () => {
    const a = getAuth();
    if (!a) return;
    setBusy('Reading your blueprints…');
    try {
      const rows = readBlueprints(await esiAllPages<RawBlueprint>(`/characters/${a.characterId}/blueprints/`, { auth: true }));
      // Where each sits: a station or structure by name, a container or ship by the name you gave it.
      setBusy('Naming where they are…');
      const ids = [...new Set(rows.map((b) => b.locationId))];
      const out = new Map<number, string>();
      const stations = ids.filter(isStation);
      if (stations.length) Object.entries(await resolveNames(stations).catch(() => ({} as Record<number, string>))).forEach(([id, n]) => out.set(Number(id), n));
      for (const id of ids.filter(isStructure)) { const s = await structureInfo(id); if (s.status === 'found') out.set(id, s.name); }
      const items = ids.filter((id) => !isStation(id) && !isStructure(id));
      for (let i = 0; i < items.length; i += 1000) {
        try {
          const { data } = await esi<{ item_id: number; name: string }[]>(`/characters/${a.characterId}/assets/names/`, { auth: true, method: 'POST', body: items.slice(i, i + 1000) });
          for (const n of data) if (n.name && n.name !== 'None') out.set(n.item_id, n.name);
        } catch { /* named as a container */ }
      }
      setPlaces(out); setOwned(rows); setMarket(null); setBooks(new Map());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally { setBusy(null); }
  };

  const price = async () => {
    if (!owned?.length) return;
    setBusy('Fetching The Forge’s blueprint contracts (about ten seconds)…');
    try {
      const types = [...new Set(owned.map((b) => b.typeId))];
      setMarket(await cloudBlueprintMarket(types));
      // Unused originals can go on the market too: their Jita book.
      const unused = [...new Set(owned.filter((b) => b.unused).map((b) => b.typeId))];
      const got = new Map<number, { bid: number | null; ask: number | null }>();
      for (const t of unused) {
        try {
          const o = (await jitaOrders(t)).orders;
          const bids = o.filter((x) => x.isBuy).map((x) => x.price), asks = o.filter((x) => !x.isBuy).map((x) => x.price);
          got.set(t, { bid: bids.length ? Math.max(...bids) : null, ask: asks.length ? Math.min(...asks) : null });
        } catch { /* no book */ }
      }
      setBooks(got);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally { setBusy(null); }
  };

  const rows = useMemo((): Row[] => {
    if (!owned) return [];
    const cur = market ? comparables(market.current) : [], gone = market ? comparables(market.vanished) : [];
    const by = new Map<string, Row>();
    for (const b of owned) {
      const kind: BpKind = { typeId: b.typeId, copy: b.copy, me: b.me, te: b.te, runs: b.runs };
      const key = `${kindKey(kind)}|${b.unused ? 'u' : ''}`;
      const where = places.get(b.locationId) ?? (isStation(b.locationId) || isStructure(b.locationId) ? 'A station' : 'A container');
      const r = by.get(key) ?? { key, kind, unused: b.unused, count: 0, where: [], quote: market ? quoteBlueprint(kind, cur, gone) : null, market: b.unused ? books.get(b.typeId) ?? null : null };
      r.count += b.count;
      const w = r.where.find((x) => x.name === where);
      if (w) w.n += b.count; else r.where.push({ name: where, n: b.count });
      by.set(key, r);
    }
    return [...by.values()];
  }, [owned, places, market, books]);

  // The price to sell at: an unused original's is capped by the market (unusedPrice), anything else's is the contracts'.
  const listAt = (r: Row): { price: number | null; where: 'market' | 'contract' | null } =>
    r.unused ? unusedPrice(r.quote, r.market?.ask ?? null) : { price: r.quote?.suggest ?? null, where: r.quote?.suggest != null ? 'contract' : null };
  const worth = (r: Row) => (listAt(r).price ?? 0) * r.count;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const s = sort.dir === 'asc' ? 1 : -1;
    const v = (r: Row): number | string | null => {
      switch (sort.key) {
        case 'item': return name(r.kind.typeId).toLowerCase();
        case 'count': return r.count;
        case 'asks': return r.quote?.asks ?? null;
        case 'sold': return r.quote?.sold ?? null;
        case 'suggest': return listAt(r).price;
        default: return worth(r) || null;
      }
    };
    return rows.filter((r) => !needle || name(r.kind.typeId).toLowerCase().includes(needle) || r.where.some((w) => w.name.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const x = v(a), y = v(b);
        if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
        return typeof x === 'string' ? s * x.localeCompare(y as string) : s * (x - (y as number));
      });
  }, [rows, q, sort, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const sortBy = (key: SortKey) => setSort((x) => (x.key === key ? { key, dir: x.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'item' ? 'asc' : 'desc' }));

  const priced = rows.filter((r) => listAt(r).price != null);
  // Your contracts out now, from the last read of them (Contracting caps how many; lib/contracts.ts).
  const outstanding = d.meta.contracts && auth ? d.meta.contracts.list.filter((c) => c.status === 'outstanding' && c.issuer === auth.characterId).length : null;
  const total = rows.reduce((n, r) => n + r.count, 0);
  const open = async (id: number) => {
    try { await openContractWindow(id); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
  };

  const verdict = (r: Row) => {
    const l = listAt(r);
    if (l.where === 'market') {
      return { c: 'var(--acc)', label: 'Market', why: `An unused original can go on the market, and nobody pays more on a contract than its cheapest Jita listing (${isk(r.market!.ask!)}): list it one step under that. The best bid is ${r.market!.bid != null ? isk(r.market!.bid) : 'none'}.` };
    }
    if (l.price != null) return { c: 'var(--pos)', label: 'Contract', why: 'List it as an item exchange contract in Jita at the price shown.' };
    return { c: 'var(--label)', label: 'No buyers seen', why: 'Nobody in The Forge lists this kind of blueprint, and none vanished in three days: keep it, price it yourself, or let it go.' };
  };

  return (
    <div className="page">
      <PageHead kicker="Ledger" title="Blueprints"
        lede="Every blueprint you hold, priced for selling: what others in The Forge ask for the same kind and what sold in the last three days. Nothing runs until you press a button." />

      {!auth ? <Notice kind="warn">Log in to read your blueprints.</Notice>
        : !can ? <Notice kind="warn">Reading your blueprints needs the blueprints permission. <button type="button" className="link-btn" onClick={() => navigate('settings/account')}>Settings → Account</button> lists it: log out and in again to grant it.</Notice>
        : null}

      <Panel title="Your blueprints" sub={owned ? `${units(total)} blueprint${total === 1 ? '' : 's'} in ${units(rows.length)} kind${rows.length === 1 ? '' : 's'}${market?.at ? `, priced on contracts as of ${ago(market.at, now)}` : ''}` : 'Read them from EVE, then price them'}>
        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn primary" disabled={!!busy || !auth || !can} onClick={() => void read()}><ScrollText aria-hidden="true" />{owned ? 'Read them again' : 'Read my blueprints'}</button>
            <button type="button" className="btn" disabled={!!busy || !owned?.length || !cloud} onClick={() => void price()}
              data-tip="Fetches The Forge's blueprint contracts through the cloud, from EVE Ref's public snapshot of every contract (twice an hour, from ESI)"><Tags aria-hidden="true" />{market ? 'Price again' : 'Price them'}</button>
            {owned && <input className="num" placeholder="Find a blueprint or container" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240, maxWidth: '100%' }} aria-label="Find a blueprint or container" />}
            {busy && <span className="note small" style={{ margin: 0 }}>{busy}</span>}
          </div>
          {!cloud && owned && <p className="note small" style={{ margin: 0 }}>Pricing needs the cloud copy on (Settings → Your data): EVE Ref’s snapshot can only be fetched from there.</p>}
        </div>
      </Panel>

      {!owned ? <Empty icon={ClipboardList}>Press “Read my blueprints”. Then “Price them” to see what they’re worth.</Empty>
        : !rows.length ? <Empty icon={ClipboardList}>No blueprints on this character.</Empty>
          : (
            <>
              {market && (
                <Tiles items={[
                  { l: 'Worth listing', v: iskBig(rows.reduce((n, r) => n + worth(r), 0)), c: 'var(--pos)', n: `${units(priced.length)} kinds at the prices shown` },
                  { l: 'Sold lately', v: units(rows.filter((r) => (r.quote?.sold ?? 0) > 0).length), n: 'kinds with some gone before expiry in 3 days', tip: 'A contract that vanished before it expired, and whose blueprint didn’t come back from the same seller at a new price: most likely sold, though a seller who cancelled and kept it looks the same.' },
                  { l: 'Nothing to compare', v: units(rows.length - priced.length), n: 'kinds nobody lists in The Forge' },
                ]} />
              )}
              {market && priced.length > 0 && (
                <SkillStrip lines={[{
                  name: 'Contracting',
                  what: (have) => `How many contracts you can have out at once: ${units(contractsAllowed(have))}${outstanding != null ? `, ${units(outstanding)} out now` : ''}, against ${units(priced.length)} kind${priced.length === 1 ? '' : 's'} worth listing.`,
                  next: (l) => `${units(contractsAllowed(l))} at once`,
                }]} />
              )}
              <section className="panel flush" data-rv="">
                <div className="tbl-scroll capped">
                  <table className="tbl" style={{ minWidth: 1100 }}>
                    <thead><tr>
                      <SortTh k="item" label="Blueprint" sort={sort} onSort={sortBy} left />
                      <Th left>Kind</Th>
                      <SortTh k="count" label="You hold" sort={sort} onSort={sortBy} />
                      <SortTh k="asks" label="Others ask" sort={sort} onSort={sortBy} tip="How many contracts in The Forge sell the same kind (item, copy or original, ME, TE; a copy's other runs scaled), with the cheapest quarter and the middle ask, per blueprint" />
                      <SortTh k="sold" label="Sold, 3 days" sort={sort} onSort={sortBy} tip="Contracts of the same kind that vanished before they expired in the last three days, and their middle price: most likely sold" />
                      <SortTh k="suggest" label="List at" sort={sort} onSort={sortBy} tip="Per blueprint: what sold lately (never over the middle ask) when two or more did, else the cheapest quarter of asks. Rounded down to three figures." />
                      <SortTh k="worth" label="Worth" sort={sort} onSort={sortBy} tip="List at, times how many you hold" />
                      <Th left>Verdict</Th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr></thead>
                    <tbody>
                      {shown.map((r) => {
                        const V = verdict(r);
                        const qt = r.quote;
                        return (
                          <tr key={r.key} className="hover">
                            <td className="l" style={{ whiteSpace: 'normal', minWidth: 220 }}>
                              <span className="cellrow"><ItemIcon id={r.kind.typeId} bp={r.kind.copy ? 'bpc' : 'bp'} /><span className="name">{name(r.kind.typeId)}</span></span>
                              <span className="sub">{r.where.map((w) => `${w.name}${r.where.length > 1 || w.n > 1 ? ` ×${units(w.n)}` : ''}`).join(' · ')}</span>
                            </td>
                            <td className="l">{kindSaid(r.kind, r.unused)}</td>
                            <td>{units(r.count)}</td>
                            <td>{!qt ? '–' : qt.asks ? <>{units(qt.asks)}<span className="sub">{qt.low != null ? `${iskBig(qt.low)} – ${iskBig(qt.median!)}` : ''}{qt.basis === 'runs' ? ' · other runs' : qt.basis === 'research' ? ' · other ME/TE' : ''}</span></> : '0'}</td>
                            <td>{!qt ? '–' : qt.sold ? <>{units(qt.sold)}<span className="sub">{qt.soldMedian != null ? iskBig(qt.soldMedian) : ''}</span></> : '0'}</td>
                            <td>{(() => { const l = listAt(r); return l.price != null ? (
                              <span className="cellrow" style={{ justifyContent: 'flex-end' }}>
                                {isk(l.price)}
                                <button type="button" className="link-btn dim" aria-label={`Copy ${plainPrice(l.price)}`} data-tip="Copy the price, to paste into the game rather than type it" onClick={() => copyPrice(l.price!)}><Copy aria-hidden="true" /></button>
                              </span>
                            ) : '–'; })()}</td>
                            <td style={{ color: worth(r) ? 'var(--pos)' : undefined }}>{worth(r) ? iskBig(worth(r)) : '–'}</td>
                            <td className="l" style={{ whiteSpace: 'normal', minWidth: 150 }}>
                              {qt ? <Flag color={V.c} title={V.label} why={V.why}>{V.label}</Flag> : <span className="faint">Not priced</span>}
                              {qt?.cheapest && qt.cheapest.flags.length > 0 && <span className="flags">{qt.cheapest.flags.map((f) => <Flag key={f} color="var(--neg-t)" title="The cheapest one" why={`${SCAM_SAID[f]}: its price may not be what it seems.`}>{f === 'notJita' ? 'Cheapest not in Jita' : 'Cheapest misleads'}</Flag>)}</span>}
                            </td>
                            <td>
                              {qt?.cheapest && (
                                <button type="button" className="link-btn dim" onClick={() => void open(qt.cheapest!.contractId)}
                                  data-tip={`Open the cheapest comparable contract in game: ${isk(qt.cheapest.each)} each${qt.cheapest.count > 1 ? ` for ${units(qt.cheapest.count)}` : ''}, “${qt.cheapest.title || 'no title'}”`}>
                                  <ExternalLink aria-hidden="true" />Cheapest
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              {market && (
                <Points compact items={[
                  { kind: 'info', lead: 'Contracts', text: `from EVE Ref’s public snapshot of every region’s (docs.everef.net, from ESI, twice an hour), as of ${market.at ? ago(market.at, now) : '–'}${market.since ? `, set against ${ago(market.since, now)}` : ''}.` },
                  { kind: 'info', lead: 'Counted', text: 'only contracts selling one kind of blueprint and nothing else, your own left out.' },
                  { kind: 'info', lead: 'Other runs', text: 'a copy with other runs is scaled by runs^0.79: 10 runs ask about 6.1× one.' },
                  { kind: 'warn', lead: 'Vanished', text: 'a contract that vanished may have been cancelled, not sold.' },
                  { kind: 'warn', lead: 'Titles', text: 'never trust one: a flag says when the cheapest contract’s claims don’t match its item.' },
                ]} />
              )}
            </>
          )}

      <Guide title="How to use Blueprints" intro="Turn a hangar of forgotten blueprints into sales, without sifting contracts by hand."
        steps={[
          { icon: ScrollText, title: 'Read them', body: 'Reads every blueprint you hold from EVE, with where it sits: container names are the ones you gave them.' },
          { icon: Tags, title: 'Price them', body: 'Fetches The Forge’s blueprint contracts on demand and sets each kind against what others ask and what sold in three days.' },
          { icon: FileSearch, title: 'List or open', body: 'Copy the price into an item exchange contract in game, or open the cheapest comparable to see what you’re up against.' },
        ]} />
    </div>
  );
}
