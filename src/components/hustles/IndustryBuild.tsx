import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Coins, Scale, Store } from 'lucide-react';
import { ago, iskBig, iskBigSigned, pct, units } from '../../lib/format';
import { HOME_HUBS } from '../../lib/homeMarket';
import { navigate, useNow } from '../../lib/hooks';
import type { Indexed } from '../../lib/industry';
import { payback, productKind, type BpoWhere, type Row } from '../../lib/industryRank';
import type { Graph } from '../../lib/jumps';
import { ASSUME_CHOICES } from '../../lib/prefs';
import { Points } from '../Facts';
import { Check, NumChip, Seg, Th } from '../ui';
import type { IndustryChar } from './industryChars';
import { IndustryDetail } from './IndustryDetail';
import { bpoSaid, FINDER_KINDS, homeSaid, KIND_LABEL, useFinder, useFinderView, useStationSaid, type Finder } from './industryFinder';
import { useIndustryDoc } from './industryMarket';
import { IndustrySites } from './IndustrySites';

/**
 * Build (docs/notes/industry.md): the finder, every Tech I blueprint sold on the market worked out for the default site,
 * the shown character's skills and fees and where it'd sell, best profit a day for one factory slot first; then where you
 * build. A row opens to its detail. Choices that are decisions (the site, the share, the ships switch, the ME/TE assumed)
 * are the synced `industry` doc's; the kind, "Can build now", "BPO up to", the sort and the open row are this browser's.
 */
const OPEN_KEY = 'jita-ledger:industry-open';
const SHOWN = 50;
/** Why rows aren't priced, by how many: "1,650 have no Jita book this morning", "1 has nowhere it may be sold". */
const MISSING_SAID: Record<NonNullable<Row['missing']>, (one: boolean) => string> = {
  noBook: (one) => `${one ? 'has' : 'have'} no Jita book this morning`,
  noIndex: () => 'can’t be costed: no index for the site',
  noAdjusted: () => 'can’t be costed: no adjusted price for a material',
  noRoute: () => 'can’t be costed: no freight route to bring materials from Jita',
  noMaterials: (one) => `${one ? 'needs' : 'need'} a material nobody lists where it can be bought`,
  noSale: (one) => `${one ? 'has' : 'have'} nowhere ${one ? 'it' : 'they'} may be sold`,
};
/** Units a day: a thin market sells a fraction of one, which "0" would hide beside a profit that rests on it. */
const perDay = (n: number) => (n >= 10 ? units(n) : n >= 1 ? n.toFixed(1) : n.toFixed(2));
const lcfirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

const bpoPrice = (w: BpoWhere) => (w.state === 'forge' ? w.price : null);
const unitProfit = (r: Row) => (r.day && r.day.units > 0 ? r.day.profit / r.day.units : r.sale && r.costUnit != null ? (r.sale.listNet ?? r.sale.bidNet ?? NaN) - r.costUnit : null);

export function IndustryBuild({ c, ix, graph, mainName }: { c: IndustryChar; ix: Indexed; graph: Graph; mainName: string }) {
  const [doc, setDoc] = useIndustryDoc();
  const f = useFinder(c, ix, graph);
  const [view, setView] = useFinderView();
  const [open, setOpen] = useState<number | null>(() => { try { return Number(localStorage.getItem(OPEN_KEY)) || null; } catch { return null; } });
  const toggle = (bp: number) => { const n = open === bp ? null : bp; setOpen(n); try { if (n) localStorage.setItem(OPEN_KEY, String(n)); else localStorage.removeItem(OPEN_KEY); } catch { /* just not kept */ } };
  const [more, setMore] = useState(0);
  // Shut once there's a site, open while there's none; decided as the section opens, so adding the first site doesn't fold it
  // away under you. A choice made here is kept.
  const [openAtStart] = useState(() => doc.sites.length === 0);
  const sitesOpen = view.sitesOpen ?? openAtStart;

  const priced = useMemo(() => f.rows.filter((r) => r.day), [f.rows]);
  const shown = useMemo(() => {
    const keep = priced.filter((r) => (view.kind === 'all' || productKind(ix, r.product) === view.kind) && (!view.canBuild || !r.lacking.length)
      && (view.bpoUpTo == null || ((p) => p != null && p <= view.bpoUpTo!)(bpoPrice(f.bpo(r.bp)))));
    const pb = (r: Row) => payback(bpoPrice(f.bpo(r.bp)), r.day?.profit) ?? Infinity;
    return [...keep].sort(view.sort === 'unit' ? (a, b) => (unitProfit(b) ?? -Infinity) - (unitProfit(a) ?? -Infinity)
      : view.sort === 'payback' ? (a, b) => pb(a) - pb(b) : (a, b) => b.day!.profit - a.day!.profit);
  }, [priced, view, ix, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const unpriced = f.rows.length - priced.length;
  const why = useMemo(() => {
    // A row with nowhere to sell says why by its sale's own words (no history to pace it, no freight route to Jita, nothing
    // listed), and "nowhere it may be sold" only when no place was allowed at all.
    const n = new Map<string, { n: number; said: (one: boolean) => string }>();
    for (const r of f.rows) {
      if (r.day || !r.missing) continue;
      // Every place it was allowed to sell says why not ("no freight route to Jita; not read at UALX-3 yet"), not only the first.
      const own = r.missing === 'noSale' && r.sales.length ? [...new Set(r.sales.map((x) => x.why).filter((w): w is string => !!w))].map(lcfirst).join('; ') || null : null;
      const key = own ? `noSale:${own}` : r.missing;
      const e = n.get(key) ?? { n: 0, said: own ? () => `can’t be sold: ${own}` : r.missing === 'noBook' && f.hub && doc.sell !== 'jita' ? (one) => `${one ? 'has' : 'have'} no Jita book this morning and no price at ${f.hub!.short}` : MISSING_SAID[r.missing] };
      e.n++; n.set(key, e);
    }
    return [...n.values()].map((e) => `${units(e.n)} ${e.said(e.n === 1)}`).join(', ');
  }, [f.rows, f.hub, doc.sell]);
  const noRoute = f.rows.some((r) => r.missing === 'noRoute');
  const keptHome = f.rows.filter((r) => r.shipsKeptHome).length;
  const station = useStationSaid(shown.slice(0, SHOWN + more).flatMap((r) => { const w = f.bpo(r.bp); return w.state === 'forge' ? [w.stations[0]] : []; }), ix, graph);
  const beforeTax = f.facts != null && f.facts.tax == null;
  // Ranked before the hub's broker fee when a row shown sells at home and the fee isn't typed.
  const beforeBroker = shown.slice(0, SHOWN + more).some((r) => r.brokerPerPct != null);
  const before = [beforeTax && 'the facility tax', beforeBroker && `the broker fee at ${f.hub?.short}`].filter(Boolean).join(' and ');
  const headSaid = before ? `Profit a day, before ${before}` : 'Profit a day, one slot';
  const now = useNow(60_000);
  const homeLine = homeSaid(f, now, ago);
  // A job's total leaves out an Alpha tax whose clone state isn't read (jobCostOf): every figure built on it says so.
  const cloneUnread = c.clone === 'unknown';

  return (
    <section className="col" style={{ gap: 16 }} aria-label="Build" data-industry="build">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Every blueprint sold on the market, worked out for your build site, your skills and where you’d sell.</p>
        <Points compact items={[
          { kind: 'info', icon: Scale, lead: 'Profit a day', text: `is for one factory slot, capped by what the market takes at your industry share (${pct(doc.share / 100, doc.share % 1 ? 1 : 0)}).` },
          { kind: 'info', icon: Coins, lead: 'Materials', text: 'come from wherever is cheapest delivered.' },
          { kind: 'good', icon: Store, lead: 'Nothing is sold', text: 'where you said you wouldn’t.' },
        ]} />
      </div>

      <div className="row ind-choices" data-industry="choices">
        {doc.sites.length > 1 && (
          <label className="chip h34"><span className="cl">Build at</span>
            <select value={f.site?.id ?? ''} onChange={(e) => setDoc({ site: e.target.value })} aria-label="Build at">
              {doc.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <NumChip label="Industry share" percent width={44} value={doc.share} onChange={(n) => { if (n != null && n > 0) setDoc({ share: n }); }}
          tip={'The part of each market’s daily trade you’d sell.\n\n• The research used 10%.\n• Profit a day is linear in it: doubling it doubles a market-limited row.'} />
        <Seg size="sm" label="ME and TE of an original you’d buy" value={`${doc.assume.me}/${doc.assume.te}`} onChange={(v) => { const [me, te] = v.split('/').map(Number); setDoc({ assume: { me, te } }); }}
          options={ASSUME_CHOICES.map((a) => ({ v: `${a.me}/${a.te}`, label: `ME ${a.me} / TE ${a.te}`, tip: a.me === 0 ? 'As NPCs sell it: unresearched.' : 'Researched first: the detail says how long it takes and what it costs.' }))} />
        <label className="chip h34"><span className="cl">Home hub</span>
          <select value={doc.hub ?? ''} onChange={(e) => setDoc({ hub: e.target.value ? Number(e.target.value) : null })} aria-label="Home hub">
            <option value="">None</option>
            {HOME_HUBS.map((h) => <option key={h.id} value={h.id}>{h.short}</option>)}
          </select>
        </label>
        {f.hub && (
          <Seg size="sm" label="Sell at" value={doc.sell} onChange={(v) => setDoc({ sell: v })}
            options={[{ v: 'jita', label: 'Jita' }, { v: 'home', label: f.hub.short }, { v: 'best', label: 'Either', tip: 'Whichever pays more a day, for each item.' }]} />
        )}
        {f.hub && (
          <NumChip label={`Broker fee at ${f.hub.short}`} percent width={50} value={doc.hubFees[f.hub.id] != null ? +(doc.hubFees[f.hub.id] * 100).toFixed(4) : null} placeholder="–"
            onChange={(n) => { const next = { ...doc.hubFees }; if (n == null) delete next[f.hub!.id]; else next[f.hub!.id] = n / 100; setDoc({ hubFees: next }); }}
            tip={'A structure’s broker fee is set by its owner and isn’t in ESI.\n\n• Typed by you.\n• Blank: the finder ranks before it and says what each 1% costs a day.'} />
        )}
        <Check checked={doc.noShipsToJita} onChange={(v) => setDoc({ noShipsToJita: v })}
          tip={`Your words: ships are “too bulky expensive and risky” to haul to Jita. On, a ship built outside high-sec or more than 10 high-sec jumps from Jita sells at home or not at all.`}>Never haul ships to Jita</Check>
      </div>
      <div className="row ind-choices">
        <label className="chip h34"><span className="cl">Kind</span>
          <select value={view.kind} onChange={(e) => setView({ kind: e.target.value as typeof view.kind })} aria-label="Kind">
            {FINDER_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <Check checked={view.canBuild} onChange={(v) => setView({ canBuild: v })} tip={c.isMain ? 'Only what your skills build now.' : `Only what ${c.name}’s skills build now.`}>Can build now</Check>
        <NumChip label="BPO up to" width={90} value={view.bpoUpTo} onChange={(n) => setView({ bpoUpTo: n })} placeholder="no cap" tip="The most you’d pay NPCs for an original. Blank: no cap. An original NPCs don’t sell in The Forge has no price, so a cap leaves it out." />
        <Seg size="sm" label="Sort" value={view.sort} onChange={(v) => setView({ sort: v })}
          options={[{ v: 'day', label: 'Profit a day' }, { v: 'unit', label: 'Profit a unit' }, { v: 'payback', label: 'Payback' }]} />
      </div>

      {homeLine && <p className="note small" style={{ margin: 0 }} data-industry="home-said">{homeLine}</p>}
      {f.waiting ? (
        <p className="note small" style={{ margin: 0 }} data-industry="finder-wait">
          {f.waiting.text}
          {f.waiting.retry && <> <button type="button" className="link-btn" onClick={f.waiting.retry}>Try again</button></>}
          {f.waiting.text.startsWith('No market scan') && <> <button type="button" className="link-btn" onClick={() => navigate('prospects')}>Open Prospects</button></>}
        </p>
      ) : (
        <div className="col" style={{ gap: 8 }} data-industry="finder">
          <p className="note small" style={{ margin: 0 }} data-industry="finder-count">
            {units(shown.length)} of {units(priced.length)} priced at {f.site?.name}{f.live ? '; the top rows on Jita’s books now, the rest on this morning’s' : ', on this morning’s Jita books'}{f.hub && doc.sell !== 'jita' ? `; a sale at ${f.hub.short} on Goonmetrics’ prices` : ''}.
            {unpriced > 0 && ` ${units(unpriced)} aren’t priced: ${why}.`}
            {keptHome > 0 && doc.noShipsToJita && ` ${units(keptHome)} ${keptHome === 1 ? 'ship stays' : 'ships stay'} home: never haul ships to Jita is on${f.facts?.band === 'high' && f.facts.jitaJumps == null ? ` (no high-sec route from ${f.site?.name} to Jita on the map)` : f.facts?.band === 'unknown' ? ` (${f.site?.name}’s security isn’t known, so its ships stay home)` : ''}.`}
            {beforeTax && ` Profit a day is before the facility tax: ${f.site?.name}’s isn’t typed.`}
            {beforeBroker && ` Profit a day is before the broker fee at ${f.hub?.short}: it isn’t typed.`}
            {cloneUnread && ' Clone state not read: the 0.25% Alpha tax is left out of every job’s cost.'}
            {noRoute && ` No freight route between ${f.site?.name} and Jita is picked, so no material can be brought from Jita: `}
            {noRoute && <button type="button" className="link-btn" onClick={() => { setView({ sitesOpen: true }); setTimeout(() => document.querySelector('[data-industry="sites"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150); }} data-industry="pick-route">pick one under Where you build</button>}
            {noRoute && '.'}
          </p>
          <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
            <table className="tbl compact rd-table ind-finder">
              <thead>
                <tr>
                  <Th left className="ind-c-name">Product</Th>
                  <Th left className="rd-wide ind-c-bpo" tip="NPCs’ price for the original in The Forge this morning, and where; or why there isn’t one.">BPO</Th>
                  <Th className="rd-wide ind-c-unit" tip="What one unit makes after its materials, the job, fees and freight, on the better side it sells on.">Profit a unit</Th>
                  <Th className="rd-wide" tip="A day’s job: what one factory slot makes, and what the market takes at your industry share, and which of the two limits it.">One slot a day</Th>
                  <Th className="rd-wide ind-c-day" tip={`What one factory slot earns a day.${before ? `\n\n• Before ${before}: not typed. Each row says what each 1% costs a day.` : ''}`}>{headSaid}</Th>
                  <Th className="rd-wide" tip="Days for one slot’s profit to pay for the original at NPCs’ price.">Payback</Th>
                  <Th className="rd-wide" tip="Skills the blueprint asks for that aren’t trained to its level.">Skills</Th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, SHOWN + more).map((r) => {
                  const w = f.bpo(r.bp), b = bpoSaid(w, f.npc, (id) => station(id));
                  const pb = payback(bpoPrice(w), r.day?.profit);
                  const up = unitProfit(r);
                  const name = ix.b.types[r.product]?.[0] ?? `Item #${r.product}`;
                  const tax = [r.taxPerPct != null && `each 1% of tax: ${iskBig(r.taxPerPct)} a day`, r.brokerPerPct != null && `each 1% of broker fee at ${f.hub?.short}: ${iskBig(r.brokerPerPct)} a day`].filter(Boolean).join(' · ') || null;
                  const book = !r.sale || !f.input ? null : r.sale.place === 'home' ? `sold at ${f.hub?.short}, Goonmetrics’ prices` : f.input.market(r.product).jita?.live ? 'Jita’s book now' : 'this morning’s book';
                  return (
                    <Fragment key={r.bp}>
                      <tr className={open === r.bp ? 'open' : undefined} data-bp={r.bp}>
                        <td className="l rd-main">
                          <button type="button" className="expander" aria-expanded={open === r.bp} onClick={() => toggle(r.bp)}>
                            <ChevronRight className="chev" aria-hidden="true" /><span className="nm">{name}</span>
                          </button>
                          <span className="sub">{KIND_LABEL[productKind(ix, r.product)]}{book ? ` · ${book}` : ''}</span>
                          <span className="rd-phone">
                            <span>BPO: {b.v} {b.n}</span>
                            <span>Profit a day{before ? `, before ${before}` : ''}: {iskBigSigned(r.day!.profit)}{r.costKnown === false && r.taxPerPct == null ? ' (before the Alpha tax)' : ''}</span>
                            <span>Profit a unit: {iskBigSigned(up)}{r.brokerPerPct != null ? ' (before the broker fee)' : ''}</span>
                            <span>One slot: {perDay(r.day!.units)} of {units(r.makes)} a day, the {r.day!.limit === 'market' ? 'market' : 'slot'} limits it</span>
                            {tax && <span>{tax}</span>}
                            <span>Payback: {pb != null ? `${pb.toFixed(1)} days` : '–'}</span>
                          </span>
                        </td>
                        <td className="l rd-wide"><span>{b.v}</span><span className="sub">{b.n}</span></td>
                        <td className="rd-wide"><span className="ind-fig">{iskBigSigned(up)}</span>{r.brokerPerPct != null && <span className="sub">before the broker fee at {f.hub?.short}</span>}</td>
                        <td className="rd-wide">{perDay(r.day!.units)} / {units(r.makes)}<span className="sub">the {r.day!.limit === 'market' ? 'market' : 'slot'} limits it</span></td>
                        <td className="rd-wide"><span className="ind-fig">{iskBigSigned(r.day!.profit)}</span>{tax && <span className="sub">{tax}</span>}{r.costKnown === false && r.taxPerPct == null && <span className="sub">before the Alpha tax: clone state not read</span>}</td>
                        <td className="rd-wide">{pb != null ? `${pb.toFixed(1)} days` : '–'}<span className="sub">{pb != null ? '' : bpoPrice(w) == null ? 'no NPC price' : 'never, at a loss'}</span></td>
                        <td className="rd-wide">{r.lacking.length ? `${r.lacking.length} to train` : 'trained'}</td>
                      </tr>
                      {open === r.bp && f.input && (
                        <tr className="detail"><td colSpan={7}><IndustryDetail c={c} ix={ix} graph={graph} row={r} finder={f as Finder} mainName={mainName} /></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!shown.length && <p className="note small" style={{ margin: 0 }}>Nothing priced fits these choices: widen the kind, untick Can build now, or raise BPO up to.</p>}
          {shown.length > SHOWN + more && <button type="button" className="link-btn" onClick={() => setMore(more + SHOWN)}>Show {Math.min(SHOWN, shown.length - SHOWN - more)} more</button>}
        </div>
      )}

      <div className="col" style={{ gap: 10 }}>
        <button type="button" className="panel-toggle" aria-expanded={sitesOpen} onClick={() => setView({ sitesOpen: !sitesOpen })}>
          <ChevronRight className="chev" aria-hidden="true" /><span className="panel-title">Where you build</span>
        </button>
        {sitesOpen && <IndustrySites c={c} ix={ix} graph={graph} mainName={mainName} />}
      </div>
    </section>
  );
}
