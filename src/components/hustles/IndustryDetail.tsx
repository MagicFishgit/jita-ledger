import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { SCOPE } from '../../lib/config';
import { isk, iskBig, iskBigSigned, pct, units } from '../../lib/format';
import { heldCost } from '../../lib/heldCost';
import { navigate } from '../../lib/hooks';
import { DAY_S, KIND_SAID, NPC_FACILITY_TAX, secBand, SKILL, structureBonus, rigFor, type Indexed } from '../../lib/industry';
import { bestOreFor, meLevels, payback, shoppingList, startUp, type Held, type LabSite, type Row } from '../../lib/industryRank';
import { JITA_SYSTEM, nearestLab } from '../../lib/industrySites';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import { setDestination } from '../../lib/market';
import { oreBaseIds } from '../../lib/orePricing';
import { yieldOf, type Materials } from '../../lib/reprocess';
import { SPLIT_SAID } from '../../lib/split';
import { toast } from '../../lib/toast';
import { typeInfo } from '../../lib/universe';
import { copyMultibuy, copyPrice } from '../common';
import { Tiles } from '../ui';
import type { IndustryChar } from './industryChars';
import { bpoSaid, useStationSaid, type Finder } from './industryFinder';
import { NPC_REGIONS, regionSellers, useIndices, type RegionSeller } from './industryMarket';

/**
 * A finder row's detail (docs/notes/industry.md): every material with its sources, the job's time and cost broken down,
 * the sale and its pace, profit at each ME level with the research it takes, where NPCs sell the original (The Forge from
 * the morning scan, the regions the research found them in on asking), what starting costs, the shopping list with Copy
 * for Multibuy, and the steps. Everything is the finder's own figures for the row; nothing is guessed to fill a gap.
 */
const SOURCE_SAID = { jita: 'Jita', home: 'home hub', mined: 'mined' } as const;

export function IndustryDetail({ c, ix, graph, row, finder, mainName }: { c: IndustryChar; ix: Indexed; graph: Graph; row: Row; finder: Finder; mainName: string }) {
  const input = finder.input!;
  const site = finder.site!, facts = finder.facts!;
  const indices = useIndices();
  const idx = indices.state === 'ok' ? indices.value : null;
  const name = (id: number) => ix.b.types[id]?.[0] ?? `Item #${id}`;
  const jitaAny = useMemo(() => jumpsFrom(graph, JITA_SYSTEM), [graph]);
  const jitaHigh = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, s) => s >= HIGH_SEC), [graph]);
  const fromSite = useMemo(() => jumpsFrom(graph, site.systemId), [graph, site.systemId]);

  // What's held where the site is: the builder's loose stock there, at what its own latest buys cost it.
  const loc = site.stationId ?? site.structureId ?? null;
  // Held is known only for a place with an ID and assets that were read: never 0 for not known.
  const heldKnown = loc != null && c.stock != null;
  const here = heldKnown ? c.stock!.byLocation[loc!] ?? {} : {};
  const held: Held = {
    units: (t) => here[t] ?? 0,
    cost: (t, n) => heldCost(c.buys.filter((b) => b.typeId === t), n, new Set(), c.broker),
  };

  // Research runs at the site when it has a Laboratory, else at the nearest one.
  const lab = useMemo((): { at: string; site: LabSite } | null => {
    if (facts.canScience) return { at: site.name, site: { kind: site.kind, rigs: site.rigs, band: facts.band, tax: facts.tax, index: facts.index } };
    const n = nearestLab(ix.b.stations, graph, site.systemId);
    if (!n) return null;
    const sys = graph[n.systemId];
    return { at: `the nearest Laboratory, in ${sys?.[1] ?? `system ${n.systemId}`} (${n.jumps} jump${n.jumps === 1 ? '' : 's'})`, site: { kind: 'npc', rigs: [], band: secBand(sys?.[0]), tax: NPC_FACILITY_TAX, index: idx?.[n.systemId] ?? null } };
  }, [facts, site, ix, graph, idx]);
  const bpRow = ix.bp.get(row.bp)!;
  const levels = useMemo(() => (lab ? meLevels({ ...input, bp: bpRow }, lab.site) : null), [input, bpRow, lab]);
  const assumed = levels?.find((l) => l.me === input.me && l.te === input.te) ?? null;
  const w = finder.bpo(row.bp);
  const bpo = w.state === 'forge' ? w.price : null;
  const su = startUp(row, { bpo, research: assumed?.cost ?? null, held });
  const shop = shoppingList(row, held);
  const jitaLines = shop.filter((x) => x.source === 'jita');
  const station = useStationSaid(w.state === 'forge' ? w.stations : [], ix, graph);
  const b = bpoSaid(w, finder.npc, (id) => station(id));

  // Other regions NPCs seed originals in, read on asking.
  const [regions, setRegions] = useState<{ sellers: RegionSeller[]; failed: number; read: number[] } | 'reading' | 'failed' | null>(null);
  const regionStation = useStationSaid(regions && typeof regions === 'object' ? regions.sellers.slice(0, 8).map((s) => s.station) : [], ix, graph);
  const lookElsewhere = () => { setRegions('reading'); regionSellers(row.bp).then((r) => setRegions(r.read.length ? r : 'failed'), () => setRegions('failed')); };

  // The ore that gives the most of a mineral, on asking (CCP's reprocessing table is a chunk of its own, 481 KB).
  const [ores, setOres] = useState<Record<number, { name: string; perM3: number } | null> | 'reading' | 'failed' | null>(null);
  const mineable = row.materials.filter((m) => ix.b.types[m.type]?.[5] === 1).map((m) => m.type);
  const whichOre = async () => {
    setOres('reading');
    try {
      const [tm, base] = await Promise.all([import('../../data/typeMaterials.json').then((m) => (m.default as unknown as { types: Record<string, Materials> }).types), oreBaseIds()]);
      const ids = Object.values(base).filter((id) => tm[id]?.[2] != null);
      const vols = await Promise.all(ids.map((id) => typeInfo(id).then((t) => ({ id, name: t.name, volume: t.volume }), () => null)));
      const list = vols.filter((x): x is { id: number; name: string; volume: number } => !!x).map((x) => ({ ...x, mats: tm[x.id] }));
      const y = (m: Materials) => yieldOf(m, c.pilot.skills ?? {}, { kind: 'station', base: 0.5, tax: 0 });
      const out: Record<number, { name: string; perM3: number } | null> = {};
      for (const t of mineable) { const best = bestOreFor(t, list, y); out[t] = best ? { name: list.find((x) => x.id === best.id)!.name, perM3: best.perM3 } : null; }
      setOres(out);
    } catch { setOres('failed'); }
  };

  // The research's cost leaves out an untyped lab tax and an Alpha tax whose clone state isn't read, as the job's does.
  const researchLeft = lab && (lab.site.tax == null || input.clone === 'unknown')
    ? `; research leaves out ${[lab.site.tax == null ? 'the lab’s tax, not typed' : '', input.clone === 'unknown' ? 'the Alpha tax, clone state not read' : ''].filter(Boolean).join(' and ')}` : '';
  const job = row.job;
  const sb = structureBonus(ix, site.kind);
  const rig = rigFor(ix, site.rigs, site.kind, facts.band, row.product, 'manufacturing');
  const sale = row.sale;
  const listPrice = sale?.list ?? null;
  // Goonmetrics stamps each type's own `updated`: a thin item's upload from days before the cloud's read says so, not read as fresh.
  const homeAt = finder.home.status === 'ok' ? Date.parse(finder.home.at) : NaN, typeAt = Date.parse(input.market(row.product).home?.at ?? '');
  const staleFigure = Number.isFinite(homeAt) && Number.isFinite(typeAt) && homeAt - typeAt > 24 * 3600_000
    ? ` · Goonmetrics’ figure for it is from ${new Date(typeAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : '';
  const setDest = async (id: number) => {
    try { await setDestination(id); toast(`Destination set in ${c.isMain ? 'your' : `${mainName}’s`} client.`, 'info'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
  };
  const destLabel = c.isMain ? 'Set destination' : `Sets ${mainName}’s destination`;
  const time = (s: number) => (s >= DAY_S ? `${(s / DAY_S).toFixed(1)} days` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);

  return (
    <div className="col ind-detail" style={{ gap: 14 }} data-industry="detail">
      <div className="col" style={{ gap: 6 }}>
        <span className="lbl">Materials for a day’s {units(row.runs)} runs at ME {input.me}</span>
        <div className="tbl-scroll">
          <table className="tbl compact rd-table">
            <thead><tr><th className="l">Material</th><th>A day</th><th className="l rd-wide">Each source, delivered</th><th className="l rd-wide">Picked</th><th className="rd-wide">Held here</th></tr></thead>
            <tbody>
              {row.materials.map((m) => {
                const said = m.options.map((o) => `${SOURCE_SAID[o.source]}: ${o.price != null ? isk(o.price) : '–'} (${o.why})`).join(' · ');
                const pick = m.pick ? `${SOURCE_SAID[m.pick]}, ${isk(m.price)}` : 'nothing can be picked';
                const ore = ores && typeof ores === 'object' ? ores[m.type] : undefined;
                return (
                  <tr key={m.type}>
                    <td className="l rd-main"><span className="nm">{name(m.type)}</span>
                      {m.patient != null && <span className="sub">{isk(m.patient)} if you wait for a bid to fill</span>}
                      {ore !== undefined && <span className="sub">{ore ? `Mined: ${ore.name} gives the most, ${ore.perM3.toFixed(1)} a m³ at ${c.isMain ? 'your' : `${c.name}’s`} yield` : 'No ore the app knows refines into it'}</span>}
                      <span className="rd-phone"><span>{said}</span><span>Picked: {pick}</span></span>
                    </td>
                    <td>{units(m.qty)}</td>
                    <td className="l rd-wide ind-wrap">{said}</td>
                    <td className="l rd-wide">{pick}</td>
                    <td className="rd-wide">{heldKnown ? units(held.units(m.type)) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loc == null && <p className="note small" style={{ margin: 0 }}>A home typed by you has no structure ID, so nothing held there is known.</p>}
        {loc != null && c.stock == null && <p className="note small" style={{ margin: 0 }}>{c.isMain ? 'Your' : `${c.name}’s`} assets aren’t read yet, so what’s held here isn’t known: {c.isMain ? 'the next sync reads them' : 'the cloud reads them hourly'}.</p>}
        {mineable.length > 0 && ores == null && <button type="button" className="link-btn" onClick={() => void whichOre()}>Which ore gives the most of {mineable.length === 1 ? 'it' : 'each'}?</button>}
        {ores === 'reading' && <p className="note small" style={{ margin: 0 }}>Reading CCP’s reprocessing table and the ores…</p>}
        {ores === 'failed' && <p className="note small" style={{ margin: 0 }}>Couldn’t read the ores just now. <button type="button" className="link-btn" onClick={() => void whichOre()}>Try again</button></p>}
        {mineable.length > 0 && <p className="note small" style={{ margin: 0 }}>Mined materials are valued at what they’d sell for, never free. <button type="button" className="link-btn" onClick={() => navigate('hustles/mining')}>Mining’s Best ore</button> says which ore pays most where you are.</p>}
      </div>

      <Tiles min={180} items={[
        { l: 'A run', v: time(row.time), n: `${units(row.runs)} runs a day, ${units(row.makes)} made · ${KIND_SAID[site.kind]}${sb.time < 1 ? ` ×${sb.time}` : ''}${rig.time < 1 ? `, rigs ×${rig.time.toFixed(3)}` : ''}` },
        {
          l: 'The job', v: job ? iskBig(job.total) : '–',
          n: job ? `index ${pct(input.site.index!.manufacturing)} → ${iskBig(job.index)}${job.bonus ? `, bonuses ${iskBigSigned(job.bonus)}` : ''} · facility tax ${job.tax != null ? iskBig(job.tax) : 'not typed'} · SCC ${iskBig(job.scc)} · ${job.alpha == null ? 'Clone state not read: the 0.25% Alpha tax is left out' : job.alpha ? `Alpha tax ${iskBig(job.alpha)}` : 'no Alpha tax'}` : 'not costed',
          tip: 'The game charges a job on its estimated item value (the ME 0 materials at CCP’s adjusted prices) × runs:\n\n• × the system’s index, less the structure’s and rigs’ cost bonuses on that part;\n• + the facility tax, the 4% SCC surcharge, and 0.25% more for an Alpha.',
        },
        ...(row.sales.length ? row.sales : [null]).map((s) => s ? ({
          l: s.place === 'home' ? `The sale at ${input.hubName}` : 'The sale in Jita', v: s.list != null ? iskBig(s.list) : '–',
          n: s.why ?? `nets ${iskBig(s.listNet)} listed${s.brokerKnown ? '' : ' (before the broker fee: not typed)'}, ${iskBig(s.bidNet)} into the best bid · ${units(s.pace)} a day, ${pct(s.split, 0)} buyers taking listings (${s.paceFrom === 'goonmetrics' ? 'Goonmetrics’ weekly movement ÷ 7, at an even split, until the home history is read' : SPLIT_SAID[s.splitFrom as Exclude<typeof s.splitFrom, 'goonmetrics'>]})${s.place === 'home' ? ` · Goonmetrics: ${((w) => (w != null ? units(w) : '–'))(input.market(row.product).home?.weekly)} a week${staleFigure}` : ''}${s.freight ? ` · freight ${isk(s.freight)} a unit` : ''}`,
        }) : { l: 'The sale', v: '–', n: 'not sold anywhere you said' }),
        { l: 'Profit a day, one slot', v: iskBigSigned(row.day?.profit), n: ((r) => (r.length ? `${r.join('; ')}` : row.day ? `${units(row.day.units)} sold of ${units(row.makes)} made` : ''))([row.taxPerPct != null && `before the facility tax; each 1% costs ${iskBig(row.taxPerPct)} a day`, row.brokerPerPct != null && `before the broker fee at ${input.hubName}; each 1% costs ${iskBig(row.brokerPerPct)} a day`].filter(Boolean)) + (row.costKnown === false && row.taxPerPct == null ? '; before the Alpha tax, since the clone state isn’t read' : '') },
      ]} />

      {levels && (
        <div className="col" style={{ gap: 6 }}>
          <span className="lbl">Researching it first, at {lab!.at}</span>
          <div className="tbl-scroll">
            <table className="tbl compact rd-table" data-industry="me-levels">
              <thead><tr><th className="l nowrap">ME / TE</th><th>Profit a day</th><th className="rd-wide" title="One lab slot">Research time</th><th className="rd-wide">Research ISK</th></tr></thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={`${l.me}/${l.te}`} className={l.me === input.me && l.te === input.te ? 'on' : undefined}>
                    <td className="l nowrap rd-main">ME {l.me} / TE {l.te}
                      <span className="rd-phone"><span>Research: {l.days == null ? '–' : l.days === 0 ? 'none' : `${l.days.toFixed(1)} days`}, {l.cost == null ? (lab!.site.index ? '–' : 'no index for the lab’s system') : l.cost === 0 ? 'no ISK' : iskBig(l.cost)}</span></span>
                    </td>
                    <td>{iskBigSigned(l.profit)}</td>
                    <td className="rd-wide">{l.days == null ? '–' : l.days === 0 ? 'none' : `${l.days.toFixed(1)} days`}</td>
                    <td className="rd-wide">{l.cost == null ? (lab!.site.index ? '–' : 'no index for the lab’s system') : l.cost === 0 ? 'none' : iskBig(l.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note small" style={{ margin: 0 }}>At {c.isMain ? 'your' : `${c.name}’s`} skills: Metallurgy {c.pilot.skills?.[SKILL.metallurgy] ?? 0}, Research {c.pilot.skills?.[SKILL.research] ?? 0}, Advanced Industry {c.pilot.skills?.[SKILL.advancedIndustry] ?? 0}. ME 8 takes about 18% of ME 10’s time.</p>
          {(lab!.site.tax == null || input.clone === 'unknown') && <p className="note small" style={{ margin: 0 }} data-industry="research-left-out">Research ISK and the profit after it leave out{lab!.site.tax == null ? ' the lab’s facility tax, which isn’t typed' : ''}{lab!.site.tax == null && input.clone === 'unknown' ? ' and' : ''}{input.clone === 'unknown' ? ' the Alpha tax, since the clone state isn’t read' : ''}.</p>}
        </div>
      )}
      {!lab && <p className="note small" style={{ margin: 0 }}>No Laboratory can be reached on the map from {site.name}, so research isn’t worked out.</p>}

      <div className="col" style={{ gap: 6 }} data-industry="bpo-places">
        <span className="lbl">The original</span>
        <p style={{ margin: 0 }}>{b.v !== '–' ? `${b.v} ${b.n}` : b.n}.</p>
        {w.state === 'forge' && w.stations.map((s) => {
          const sysId = findSystem(ix, s);
          const sys = sysId != null ? graph[sysId] : undefined;
          // Two stations whose names weren't read say the same ("A station in Itamo"): numbered, and the system said once.
          const label = station(s), same = w.stations.filter((x) => station(x) === label);
          const said = same.length > 1 ? `${label} (${same.indexOf(s) + 1} of ${same.length})` : label;
          const sysText = sys ? `${label.includes(sys[1]) ? '' : `${sys[1]} `}${sys[0].toFixed(1)}` : '';
          return <div key={s} className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span>{said}</span>
            <span className="faint">{sysText}{sysId != null ? ` · ${jitaHigh.get(sysId) ?? jitaAny.get(sysId) ?? '–'} jumps from Jita, ${fromSite.get(sysId) ?? '–'} from ${site.name}` : ''}</span>
            {hasScope(SCOPE.waypoint) && <button type="button" className="link-btn" onClick={() => void setDest(s)}>{destLabel}</button>}
          </div>;
        })}
        {regions == null && <button type="button" className="link-btn" onClick={lookElsewhere}>Look in the regions NPCs seed originals in</button>}
        {regions === 'reading' && <p className="note small" style={{ margin: 0 }}>Reading {Object.keys(NPC_REGIONS).length} regions’ markets…</p>}
        {regions === 'failed' && <p className="note small" style={{ margin: 0 }}>Couldn’t read the regions just now. <button type="button" className="link-btn" onClick={lookElsewhere}>Try again</button></p>}
        {regions && typeof regions === 'object' && (regions.sellers.length ? regions.sellers.slice(0, 8).map((x) => (
          <div key={`${x.region}:${x.station}`} className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span>{regionStation(x.station, x.system)}</span>
            <span className="faint">{NPC_REGIONS[x.region]} · {iskBig(x.price)} · {jitaAny.get(x.system) ?? '–'} jumps from Jita, {fromSite.get(x.system) ?? '–'} from {site.name}</span>
          </div>
        )) : <p className="note small" style={{ margin: 0 }}>NPCs don’t sell it in {regions.read.map((r) => NPC_REGIONS[r]).join(', ')}{w.state === 'forge' ? ' either' : ''}.</p>)}
        {regions && typeof regions === 'object' && regions.failed > 0 && <p className="note small" style={{ margin: 0 }}>{regions.failed} {regions.failed === 1 ? 'region' : 'regions'} couldn’t be read ({Object.keys(NPC_REGIONS).map(Number).filter((r) => !regions.read.includes(r)).map((r) => NPC_REGIONS[r]).join(', ')}). <button type="button" className="link-btn" onClick={lookElsewhere}>Try again</button></p>}
      </div>

      <Tiles min={180} items={[
        { l: 'Start-up', v: iskBig(su.total), n: su.total == null ? (bpo == null ? 'no NPC price for the original' : su.research == null ? 'research not worked out' : 'a material can’t be priced') : `original ${iskBig(su.bpo)} · research to ME ${input.me} / TE ${input.te} ${su.research ? iskBig(su.research) : 'none'} · a day’s materials ${iskBig(su.materials)}${su.research ? researchLeft : ''}` },
        { l: 'Held here', v: heldKnown ? units(su.heldUnits) : '–', n: su.heldUnits ? `cost you ${su.heldCost != null ? iskBig(su.heldCost) : '– (not all bought: no cost)'}; counted in start-up and the list, never in the profit a day` : !heldKnown ? (loc == null ? 'nothing known at a home typed by you' : 'assets not read yet') : 'none of its materials held here' },
        { l: 'Payback', v: payback(bpo, row.day?.profit) != null ? `${payback(bpo, row.day?.profit)!.toFixed(1)} days` : '–', n: 'the original at NPCs’ price, out of one slot’s profit a day' },
      ]} />

      <div className="col" style={{ gap: 6 }}>
        <span className="lbl">Shopping list, beyond what’s held</span>
        {shop.length ? shop.map((x) => <div key={x.type} className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span>{units(x.qty)} {name(x.type)}</span><span className="faint">{x.source ? `${SOURCE_SAID[x.source]}, ${isk(x.price)} each` : 'nothing can be picked'}</span>
        </div>) : <p className="note small" style={{ margin: 0 }}>Everything a day’s job needs is held here.</p>}
        {jitaLines.length > 0 && (
          <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => void copyMultibuy(jitaLines.map((x) => `${name(x.type)} ${x.qty}`).join('\n'), jitaLines.length, jitaLines.reduce((s, x) => s + x.qty * (input.market(x.type).jita?.ask ?? 0), 0))}>Copy for Multibuy</button>
        )}
      </div>

      <div className="col" style={{ gap: 6 }} data-industry="steps">
        <span className="lbl">The steps</span>
        <div className="ladder">
          {[
            w.state === 'forge' ? `Buy the original at ${station(w.stations[0])}` : `Find an original: ${w.state === 'notForge' ? 'no NPC sells it in The Forge' : b.n}`,
            input.me || input.te ? `Research it to ME ${input.me} / TE ${input.te} at ${lab?.at ?? 'a Laboratory'}${assumed?.days ? `, ${assumed.days.toFixed(1)} days` : ''}` : 'No research: build at ME 0',
            'Buy the materials',
            `Install the job at ${site.name}`,
            sale ? `List at ${sale.place === 'home' ? input.hubName ?? 'home' : 'Jita 4-4'}${listPrice != null ? ` at ${isk(listPrice)}` : ''}` : 'Nowhere you said it may be sold',
          ].map((x, i) => <span key={x} className="step">{i > 0 && <ArrowRight aria-hidden="true" />}<span>{x}</span></span>)}
        </div>
        {listPrice != null && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => void copyPrice(listPrice)}>Copy the price to list at</button>}
      </div>
    </div>
  );
}

/** A station's system, from the bundle's stations. */
const findSystem = (ix: Indexed, station: number): number | null => ix.b.stations.find((s) => s[0] === station)?.[1] ?? null;
