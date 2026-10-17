import { useMemo, useState } from 'react';
import { Building2, Store } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { cloudDropHomeMarket, cloudReadHome, cloudSetHomeMarket } from '../../lib/cloud';
import { SCOPE } from '../../lib/config';
import { useNow } from '../../lib/hooks';
import { fmtShort, pct } from '../../lib/format';
import { HOME_HUBS, HOME_STALE_MS, homeAgo, homeSpeaks, hubFeeRate, hubShort, ownMarketSaid, ownRead, type HubFee, type HubState } from '../../lib/homeMarket';
import { taxesDiffer } from '../../lib/industryTrack';
import { secText } from '../../lib/industrySites';
import type { Graph } from '../../lib/jumps';
import { toast } from '../../lib/toast';
import { Points } from '../Facts';
import { FindStructure } from '../FindStructure';
import { NumChip, Seg, Th } from '../ui';
import type { IndustryChar } from './industryChars';
import { refreshHomeMarkets, useHomeBook, useHomeMarkets, useHomePrices, useIndustryDoc, type MarketsState } from './industryMarket';

/** A row: Goonmetrics' two always, then the hubs you added, as the cloud lists them. */
type HubRow = { id: number; name: string; systemId: number; gm: boolean; state: HubState | null };

/**
 * A hub as this section names it (Ruling 2): its structure's name with its system's beside it, "1st Byzantigoon (UALX-3)",
 * "Ceci n’est pas une keeptar (C-J6MT)", "Mothership Bellicose (UALX-3)". Everywhere else Goonmetrics' two are UALX-3 and C-J6MT
 * and a hub you added its structure's name (`HomeHub.short`).
 */
export const sectionName = (name: string): string => { const p = sectionParts(name); return p.system ? `${p.hub} (${p.system})` : p.hub; };
/** sectionName's two parts, drawn apart so the system in brackets never breaks at its hyphen ("(C-" / "J6MT)"). */
const sectionParts = (name: string): { hub: string; system: string | null } => { const i = name.indexOf(' - '); return i > 0 ? { hub: hubShort(name), system: name.slice(0, i) } : { hub: name, system: null }; };

/**
 * What your orders at a hub paid as broker fee (hubFeeRate), the newest of any character's: offered with Use this, never applied by
 * itself (the measured facility tax's pattern); "about the same" within ±0.05% of the fee typed.
 */
export function HubFeeLine({ hub, chars, typed, onUse, para, phone }: { hub: number; chars: IndustryChar[]; typed: number | null; onUse: (rate: number) => void; para?: string; phone?: boolean }) {
  const m = useMemo(() => chars.map((x) => ({ c: x, f: hubFeeRate(hub, x.orders, x.journal) })).filter((x): x is { c: IndustryChar; f: HubFee } => !!x.f)
    .sort((a, b) => Date.parse(b.f.newest) - Date.parse(a.f.newest))[0] ?? null, [hub, chars]);
  // Nothing measured draws nothing, not an empty paragraph (Build shows a hub on every load, most with no order placed there).
  if (!m) return null;
  const whose = m.c.isMain ? 'Your' : `${m.c.name}’s`;
  const what = m.f.orders === 1 ? `order there of ${fmtShort(m.f.newest)} paid` : `${m.f.orders} orders there (the newest of ${fmtShort(m.f.newest)}) paid`;
  const spread = taxesDiffer(m.f.low, m.f.high) ? ` (${pct(m.f.low)} to ${pct(m.f.high)})` : '';
  // The phone fold's copy is marked apart: two copies of one marker in a row would make a strict lookup find neither.
  const mark = (k: string) => (phone ? `${k}-phone` : k);
  const line = typed != null && !taxesDiffer(typed, m.f.rate)
    ? <span className="sub" data-industry={mark('hub-fee-agrees')}>{whose} {what} about the same ({pct(m.f.rate)}).</span>
    : (
      <span className="sub" data-industry={mark('hub-fee-measured')}>
        {whose} {what} {pct(m.f.rate)}{spread}:{' '}
        <button type="button" className="link-btn" onClick={() => onUse(Math.round(m.f.rate * 1e6) / 1e6)}>Use this</button>
      </span>
    );
  // `para`: drawn as a paragraph of its own with that data-industry (Build, under the home hub's words); else a line in a cell.
  return para ? <p className="note small" style={{ margin: 0 }} data-industry={para}>{line}</p> : line;
}

/** Why the cloud's list isn't here, as a sentence; null once it is. Goonmetrics' two are listed either way. */
function listWhy(m: MarketsState): string | null {
  return m.status === 'off' ? 'Home markets, Goonmetrics’ prices among them, are read by the cloud, which isn’t on in this browser (Settings → Your data).'
    : m.status === 'loading' ? 'Reading your home markets from the cloud…'
      : m.status === 'behind' ? 'The cloud is a version behind: reading a market with your characters comes once it’s updated.'
        : m.status === 'failed' ? `Couldn’t read your home markets from the cloud: ${m.error}.`
          : null;
}

const errorSaid = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Home markets (docs/notes/industry.md, stage 4): every hub the tab prices at home, in every state. Goonmetrics' two are always
 * listed and read with the main unless you choose otherwise; a hub you add is found by a character who can see it, who reads it.
 * Each row says what prices it now, what its own market's read says and its broker fee, and lets you pick its reader, read it now,
 * stop reading it (a default) or remove it (one you added), and make it the finder's home hub. The characters come from
 * Industry.tsx (`chars`): this file reads no alt store, and writes only through the cloud's routes (with the logins the cloud
 * already holds: it never starts or hands over a login) and the synced `industry` doc's `hub` and `hubFees`.
 */
export function IndustryHome({ c, chars, graph }: { c: IndustryChar; chars: IndustryChar[]; graph: Graph }) {
  const now = useNow(60_000);
  const markets = useHomeMarkets();
  const [doc, setDoc] = useIndustryDoc();
  const [busy, setBusy] = useState(false);
  const [searchAs, setSearchAs] = useState<number>(c.charId);
  const list = markets.status === 'ok' ? markets.list : null;
  const rows: HubRow[] = [
    ...HOME_HUBS.map((h) => ({ id: h.id, name: h.name, systemId: h.systemId, gm: true, state: list?.find((x) => x.id === h.id) ?? null })),
    ...(list ?? []).filter((x) => x.kept === 'added' && !x.off && !HOME_HUBS.some((h) => h.id === x.id))
      .map((x) => ({ id: x.id, name: x.name, systemId: x.systemId, gm: false, state: x })),
  ];
  const act = async (job: () => Promise<unknown>) => {
    setBusy(true);
    try { await job(); }
    catch (e) { toast((e as { status?: number }).status === 404 ? 'The cloud is a version behind: home markets come once it’s updated.' : errorSaid(e), 'err'); }
    finally { refreshHomeMarkets(); setBusy(false); }
  };
  const searcher = chars.find((x) => x.charId === searchAs) ?? c;
  const listSaid = listWhy(markets);
  const bellicose = rows.some((r) => /Bellicose/i.test(r.name));
  const canSearch = !searcher.isMain || (hasScope(SCOPE.search) && hasScope(SCOPE.structures));
  return (
    <section className="col" style={{ gap: 16 }} aria-label="Home markets" data-industry="home">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Prices at home, from Goonmetrics until a character of yours can read the market itself.</p>
        <Points compact items={[
          { kind: 'info', icon: Store, lead: 'Goonmetrics', text: 'prices 1st Byzantigoon (UALX-3) and Ceci n’est pas une keeptar (C-J6MT) from its members’ uploads; the cloud reads it every six hours.' },
          { kind: 'good', icon: Building2, lead: 'A market’s own read', text: 'is the cloud reading it every hour with the character you pick; it prices the hub while under two hours old.' },
          { kind: 'warn', lead: 'Not in ESI', text: 'a structure’s broker fee: type it, or place an order there and the app measures it.' },
        ]} />
      </div>
      {listSaid && <p className="note small" style={{ margin: 0 }} data-industry="home-list-said">{listSaid}</p>}
      <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
        <table className="tbl compact rd-table ind-home" data-industry="home-list">
          <thead>
            <tr>
              <Th left>Hub</Th>
              <Th left className="rd-wide" tip={'What prices the hub now.\n\n• Its own market’s read, while under two hours old.\n• Else Goonmetrics’, with how old it is.\n• Else nothing, said.'}>Prices now</Th>
              <Th left className="rd-wide" tip="The cloud reads the hub’s own market every hour with this character’s login, once EVE lets that character use the market, for the items the Industry tab watches.">Its own market</Th>
              <Th className="rd-wide" tip="Set by the structure’s owner and not in ESI: typed by you, or measured from your own orders there.">Broker fee</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <HubLine key={r.id} r={r} chars={chars} graph={graph} now={now} busy={busy} act={act} listOk={!!list} listLoading={markets.status === 'loading'} isHome={doc.hub === r.id}
                fee={doc.hubFees[r.id] ?? null} setFee={(n) => { const next = { ...doc.hubFees }; if (n == null) delete next[r.id]; else next[r.id] = n; setDoc({ hubFees: next }); }}
                makeHome={() => setDoc({ hub: r.id })} onRemoved={() => { if (doc.hub === r.id) setDoc({ hub: null }); }} />
            ))}
          </tbody>
        </table>
      </div>
      {list && !bellicose && <p className="note small" style={{ margin: 0 }} data-industry="bellicose">Brave’s market at UALX-3, Mothership Bellicose: add it once one of your characters can see it.</p>}
      {list && (
        <div className="col" style={{ gap: 8 }} data-industry="home-add">
          <div className="lbl">Add a market</div>
          {chars.length > 1 && <Seg size="sm" label="Search as" value={searcher.charId} onChange={setSearchAs} options={chars.map((x) => ({ v: x.charId, label: x.name }))} />}
          {canSearch ? (
            <FindStructure label="Find a market structure by name" as={searcher}
              describe={(f) => (rows.some((r) => r.id === f.id) ? 'already listed' : `read with ${searcher.isMain ? 'your' : `${searcher.name}’s`} login`)}
              onPick={(f) => {
                if (rows.some((r) => r.id === f.id)) return;
                void act(async () => {
                  await cloudSetHomeMarket({ hub: f.id, name: f.name, systemId: f.systemId, reader: searcher.charId });
                  // Added, whatever the read then does; and what the read did, said as it is (read, refused, skipped for a login that
                  // can't, failing): never a read claimed. An added hub is one Goonmetrics doesn't track.
                  let said: string;
                  try { said = ownMarketSaid(await cloudReadHome(f.id), Date.now(), false); }
                  catch (e) { said = `Couldn’t read its market just now (${errorSaid(e)}): the cloud reads it hourly.`; }
                  toast(`Added ${hubShort(f.name)}. ${said}`, 'info');
                });
              }} />
          ) : <p className="note small" style={{ margin: 0 }}>Log in again: finding a structure by name needs EVE’s permission to search structures.</p>}
          <p className="note small" style={{ margin: 0 }} data-industry="home-search-as">{searcher.isMain ? 'Searches as you: the structures EVE lets you see.' : `Searches as ${searcher.name}, through the cloud with ${searcher.name}’s own login.`} Whoever finds it reads it; change that on its row.</p>
        </div>
      )}
    </section>
  );
}

/** One hub's row: what prices it now (its own read, Goonmetrics', or nothing), its own market in words, its reader, its broker fee. */
function HubLine({ r, chars, graph, now, busy, act, listOk, listLoading, isHome, fee, setFee, makeHome, onRemoved }: {
  r: HubRow; chars: IndustryChar[]; graph: Graph; now: number; busy: boolean; act: (job: () => Promise<unknown>) => Promise<void>; listOk: boolean; listLoading: boolean;
  isHome: boolean; fee: number | null; setFee: (n: number | null) => void; makeHome: () => void; onRemoved: () => void;
}) {
  const gm = useHomePrices(r.gm ? r.id : null);
  // Not asked for a default switched to Nobody: its last read prices nothing (ownRead below says the same, for the finder too).
  const book = useHomeBook(listOk && !r.state?.off ? r.id : null);
  // Goonmetrics as ownMarketSaid takes it: its prices read (they stand in), tracked but not read, or not tracked at all.
  const gmSaid: boolean | 'tracked' = !r.gm ? false : gm.status === 'ok' ? true : 'tracked';
  // A default switched to Nobody keeps its last read in the cloud: it doesn't price the hub once you stopped reading it.
  const speaks = homeSpeaks(ownRead(book.status === 'ok' ? book : null, r.state), r.gm && gm.status === 'ok' ? gm : null, now);
  // Its own read still coming from the cloud (only asked once the list is in): nothing is said to price it meanwhile, so Goonmetrics'
  // line never shows for a moment and then gives way.
  const bookPending = listOk && !!r.state && !r.state.off && book.status === 'loading';
  const short = HOME_HUBS.find((h) => h.id === r.id)?.short ?? hubShort(r.name);
  const named = sectionParts(r.name);
  const sys = graph[r.systemId];
  const where = [sys ? `${sys[1]} ${secText(sys[0])}` : '', r.gm ? 'Goonmetrics tracks it' : 'added by you'].filter(Boolean).join(' · ');
  const prices = bookPending ? 'Reading its own market from the cloud…'
    : speaks?.source === 'structure' ? `Its own market, read ${homeAgo(speaks.at, now)}`
      : speaks ? `Goonmetrics, read ${homeAgo(speaks.at, now)}${now - Date.parse(speaks.at) > HOME_STALE_MS ? ': older than a day' : ''}`
        : !r.gm ? (book.status === 'failed' ? `Nothing: couldn’t read its own market from the cloud (${book.error})`
          : book.status === 'behind' ? 'Nothing: the cloud is a version behind'
            : 'Nothing: Goonmetrics doesn’t track it, and its own market has no read under two hours old')
          : gm.status === 'loading' ? 'Reading Goonmetrics’ prices…'
            : gm.status === 'none' ? 'Not read yet: Goonmetrics every six hours'
              : gm.status === 'switched' ? 'Nothing: the cloud has Goonmetrics switched off'
                : gm.status === 'behind' ? 'The cloud is a version behind'
                  : gm.status === 'off' ? 'The cloud isn’t on in this browser'
                    : gm.status === 'failed' ? `Couldn’t read Goonmetrics’ prices: ${gm.error}` : '–';
  const own = r.state ? ownMarketSaid(r.state, now, gmSaid) : listLoading ? 'Reading…' : listOk ? '–' : 'Not known here: see above.';
  // The select shows only once the list is in, and the cloud always lists Goonmetrics' two and every hub you added with its state, so
  // the main as a fallback is never what a row with no state shows as its reader.
  const reader = r.state ? (r.state.off ? 0 : r.state.reader) : chars[0].charId;
  // A reader the cloud keeps who isn't among your characters here (off the roster): listed as itself, so the control never shows
  // another character as the one reading.
  const stranger = r.state && !r.state.off && !chars.some((x) => x.charId === r.state!.reader) ? r.state : null;
  const canRead = !!r.state && !r.state.off && r.state.login === 'ok';
  // A read asked for here says what it did: the hub's own market in words, as the row says it, never a read it didn't make.
  const readNow = async () => {
    let said: string;
    try { said = ownMarketSaid(await cloudReadHome(r.id), Date.now(), gmSaid); }
    catch (e) { if ((e as { status?: number }).status === 404) throw e; said = `Couldn’t read ${short}’s market just now (${errorSaid(e)}): the cloud reads it hourly.`; }
    toast(said, 'info');
  };
  // The broker fee typed, in the fee cell and, on a phone (where that cell is hidden), in the row's fold.
  const feeChip = (
    <NumChip label={`Broker fee at ${short}`} hideLabel percent width={56} value={fee != null ? +(fee * 100).toFixed(4) : null} placeholder="–"
      onChange={(n) => setFee(n == null ? null : n / 100)}
      tip={fee == null ? 'Not typed: the finder ranks before it and says what each 1% costs a day. Type it from the market window in game, or place an order there and the app measures it.' : 'Typed by you.'} />
  );
  return (
    <tr data-hub={r.id}>
      <td className="l rd-main">
        <span className="nm">{named.hub}{named.system && <> <span className="ind-sys">({named.system})</span></>}</span>
        <span className="sub">{where}</span>
        <span className="ind-acts">
          {isHome ? <span className="ind-default">Home hub</span> : <button type="button" className="link-btn" onClick={makeHome}>Make it the home hub</button>}
          {listOk && (
            <select className="ind-sel" aria-label={`Who reads ${short}’s market`} value={reader} disabled={busy}
              onChange={(e) => {
                const v = Number(e.target.value);
                void act(v === 0 ? () => cloudDropHomeMarket(r.id) : async () => { await cloudSetHomeMarket({ hub: r.id, reader: v }); await readNow(); });
              }}>
              {r.gm && <option value={0}>Nobody: Goonmetrics only</option>}
              {chars.map((x) => <option key={x.charId} value={x.charId}>{x.isMain ? `${x.name} (you)` : x.name}</option>)}
              {stranger && <option value={stranger.reader}>{stranger.readerName ?? `Character ${stranger.reader}`}</option>}
            </select>
          )}
          {canRead && <button type="button" className="link-btn" disabled={busy} onClick={() => void act(readNow)}>Read it now</button>}
          {!r.gm && listOk && <button type="button" className="link-btn" disabled={busy} onClick={() => void act(async () => { await cloudDropHomeMarket(r.id); onRemoved(); })}>Remove</button>}
        </span>
        <span className="rd-phone"><span>Prices now: {prices}</span><span>{own}</span><span>Broker fee {feeChip}</span><HubFeeLine hub={r.id} chars={chars} typed={fee} onUse={(n) => setFee(n)} phone /></span>
      </td>
      <td className="l rd-wide ind-said" data-industry="hub-prices">{prices}</td>
      <td className="l rd-wide ind-said" data-industry="hub-own">{own}</td>
      <td className="rd-wide" data-industry="hub-fee">{feeChip}<HubFeeLine hub={r.id} chars={chars} typed={fee} onUse={(n) => setFee(n)} /></td>
    </tr>
  );
}
