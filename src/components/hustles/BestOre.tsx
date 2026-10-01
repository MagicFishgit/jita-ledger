import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Coins, Gauge, MapPin } from 'lucide-react';
import { rates } from '../../lib/fees';
import { isk, iskBig, units } from '../../lib/format';
import { bestWay, WAY_SAID, type OreWorth } from '../../lib/mining';
import { gradeLabel, gradeRank } from '../../lib/miningFits';
import { MASTERY } from '../../lib/miningMastery';
import { HULLS } from '../../lib/miningTree';
import { gradesOf, oreBaseIds, priceOres } from '../../lib/orePricing';
import {
  kindOfBase, ORE_WHERE, ORE_WHERE_SOURCE, paceFor, PLACES, rankOres,
  type Found, type How, type NoPace, type OreKind, type Pace, type Place,
} from '../../lib/oreWhere';
import { whose, whoseStart } from '../../lib/pilot';
import { useData } from '../../lib/store';
import { Points } from '../Facts';
import { usePilot } from '../pilot';
import { Flag, ItemIcon, Panel, Seg, Tip } from '../ui';

/**
 * Which ore pays best where you are: every ore and ice type found in a place (lib/oreWhere.ts, from EVE University's tables
 * and CCP's notes: ESI doesn't say where ores spawn), each priced as Scaling up prices it (`priceOres`: the best of selling
 * it as it is, compressed or reprocessed at Jita 4-4, after tax, at your skills and standing whoever mines it), ranked by
 * ISK an hour at the pace Scaling up shows, else by ISK a m³. The user asked for it (30 September 2026): "what the most
 * profitable ore is to farm for the different ore categories", by where it's found, both measures, the plain grade with
 * the higher ones inside. Only the plain grades are priced when the panel shows; a row's grades when it opens.
 */

const PLACE_KEY = 'jita-ledger:best-ore-place';
function readPlace(): Place {
  try {
    const v = localStorage.getItem(PLACE_KEY);
    return PLACES.some((p) => p.key === v) ? (v as Place) : 'highsec';
  } catch { return 'highsec'; }
}
const keepPlace = (p: Place) => { try { localStorage.setItem(PLACE_KEY, p); } catch { /* the pick just isn't kept */ } };

const HOW_SAID: Record<How, string> = { belt: 'Belt', anomaly: 'Anomaly', rare: 'Rare anomaly', sov: 'Sov upgrade', drill: 'Moon drill', 'ice belt': 'Ice belt' };
/** Which page each kind's places come from. */
const SOURCE_OF: Record<'asteroid' | 'moon' | 'ice', (typeof ORE_WHERE_SOURCE)[number]> = {
  asteroid: ORE_WHERE_SOURCE.find((s) => /Asteroids and ore/.test(s.name))!,
  moon: ORE_WHERE_SOURCE.find((s) => /Moon mining/.test(s.name))!,
  ice: ORE_WHERE_SOURCE.find((s) => /Ice harvesting/.test(s.name))!,
};
/** The hulls Scaling up has ice fits for, read from the fits themselves. */
const ICE_HULLS = HULLS.filter((h) => (MASTERY[h.id] ?? []).some((t) => t.high.some((x) => /Ice/.test(x.name)))).map((h) => h.name);
const KIND_SAID: Record<OreKind, string> = { ore: 'ore', mercoxit: 'Mercoxit', ice: 'ice' };
/** Where, beside its tag: "Sov upgrade: Pyerite Prospecting Array" under the Sov upgrade tag says it twice, so the tag's words go. */
const whereSaid = (x: Found) => x.where.replace(new RegExp(`^${HOW_SAID[x.how]}: `), '');

const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

/** A type's price as read: its figures (`partial` when some book for it couldn't be read, so they may be low), or why none. */
type Priced = { state: 'priced'; vol: number; worth: OreWorth; partial: boolean } | { state: 'failed' } | { state: 'none' };
/** A row's grades: being read, read (the higher ones only), or not readable just now. */
type Grades = 'reading' | 'failed' | { id: number; name: string }[];

export function BestOre({ pace, onPick, minedBases }: {
  /** The pace ISK an hour is worked out at: the tier open in Scaling up, else what sessions measured, else none. */
  pace: Pace | null;
  /** Sends an ore (or one of its grades) to Scaling up's Ore picker. */
  onPick: (typeId: number) => void;
  /** Ores (by base) and ice types (by name) the shown character mines. */
  minedBases: Set<string>;
}) {
  const d = useData();
  const pilot = usePilot();
  const [place, setPlace] = useState<Place>(readPlace);
  const choosePlace = (p: Place) => { setPlace(p); keepPlace(p); };

  // Every base ore's and ice type's ID, by name: null while read, 'failed' when ESI couldn't say.
  const [ids, setIds] = useState<Record<string, number> | 'failed' | null>(null);
  const [idsTry, setIdsTry] = useState(0);
  useEffect(() => {
    let alive = true;
    setIds(null);
    oreBaseIds().then((x) => { if (alive) setIds(x); }).catch(() => { if (alive) setIds('failed'); });
    return () => { alive = false; };
  }, [idsTry]);
  const idOf = (base: string) => (ids && ids !== 'failed' ? ids[base] : undefined);

  // Prices by type, the types being priced now, and when the last run finished.
  const [prices, setPrices] = useState<Record<number, Priced>>({});
  const [busy, setBusy] = useState<Set<number>>(() => new Set());
  const [readAt, setReadAt] = useState<number | null>(null);
  const names = useRef<Record<number, string>>({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const price = (types: number[], fresh = false) => {
    if (!types.length) return;
    setBusy((b) => new Set([...b, ...types]));
    priceOres(types, (t) => names.current[t] ?? '', d.skills ?? {}, d.settings.corp, rates(d.settings).t, { fresh })
      .then(({ vols, worth, failed }) => {
        if (!alive.current) return;
        const lost = new Set(failed);
        // "Read at" only when something was: a run that priced nothing isn't a reading of Jita's bids.
        if (types.some((t) => worth[t] && bestWay(worth[t]))) setReadAt(Date.now());
        setPrices((x) => {
          const y = { ...x };
          for (const t of types) {
            const w = worth[t];
            y[t] = w && bestWay(w) ? { state: 'priced', vol: vols[t] ?? 0, worth: w, partial: lost.has(t) } : lost.has(t) ? { state: 'failed' } : { state: 'none' };
          }
          return y;
        });
      })
      .catch(() => { if (alive.current) setPrices((x) => ({ ...x, ...Object.fromEntries(types.map((t) => [t, { state: 'failed' } as Priced])) })); })
      .finally(() => {
        if (!alive.current) return;
        setBusy((b) => { const y = new Set(b); for (const t of types) y.delete(t); return y; });
      });
  };

  // The plain grades (and every ice type), once their IDs are known: once a visit.
  const plain = useMemo(() => (ids && ids !== 'failed' ? Object.keys(ORE_WHERE).flatMap((base) => (ids[base] ? [ids[base]] : [])) : []), [ids]);
  const started = useRef(false);
  useEffect(() => {
    if (!ids || ids === 'failed' || started.current) return;
    started.current = true;
    for (const [n, id] of Object.entries(ids)) names.current[id] = n;
    price(plain);
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  // A row opened to its higher grades, read and priced when first opened.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [grades, setGrades] = useState<Record<string, Grades>>({});
  const readGrades = (base: string) => {
    const id = idOf(base);
    if (!id) return;
    setGrades((g) => ({ ...g, [base]: 'reading' }));
    gradesOf(base, id)
      .then((all) => {
        if (!alive.current) return;
        const higher = all.filter((g) => gradeRank(gradeLabel(g.name.trim(), base), base) > 0);
        for (const g of higher) names.current[g.id] = g.name.trim();
        setGrades((x) => ({ ...x, [base]: higher }));
        price(higher.map((g) => g.id).filter((t) => !prices[t]));
      })
      .catch(() => { if (alive.current) setGrades((x) => ({ ...x, [base]: 'failed' })); });
  };
  const toggle = (base: string) => {
    setOpen((o) => { const y = new Set(o); if (y.has(base)) y.delete(base); else y.add(base); return y; });
    if (!open.has(base) && (!grades[base] || grades[base] === 'failed')) readGrades(base);
  };

  // What's priced so far: the plain grades and every opened row's grades.
  const priced = useMemo(() => [...plain, ...Object.values(grades).flatMap((g) => (Array.isArray(g) ? g.map((x) => x.id) : []))], [plain, grades]);
  const failedTypes = priced.filter((t) => !busy.has(t) && (prices[t]?.state === 'failed' || (prices[t]?.state === 'priced' && (prices[t] as { partial: boolean }).partial)));

  const figures = (t: number | undefined) => {
    const p = t != null ? prices[t] : undefined;
    if (!p || p.state !== 'priced') return null;
    const b = bestWay(p.worth);
    return b ? { best: b, perM3: p.vol > 0 ? b.perUnit / p.vol : null, partial: p.partial, worth: p.worth } : null;
  };
  const hourOf = (kind: OreKind, perM3: number | null) => {
    const r = paceFor(kind, pace);
    return { r, isk: r.m3PerMin != null && perM3 != null ? r.m3PerMin * 60 * perM3 : null };
  };

  const rows = useMemo(() => {
    const base = Object.keys(ORE_WHERE).map((b) => {
      const f = figures(idOf(b));
      const kind = kindOfBase(b)!;
      return { base: b, iskPerM3: f?.perM3 ?? null, iskPerHour: hourOf(kind, f?.perM3 ?? null).isk };
    });
    return rankOres(base, place);
  }, [place, prices, ids, pace]); // eslint-disable-line react-hooks/exhaustive-deps

  const mines = pilot.isMain ? 'you mine it' : `${pilot.name} mines it`;
  // Whose pace and which fit, for the column's header.
  const paceSaid = !pace ? 'Open a ship in Scaling up'
    : pace.from === 'fit' ? `${pace.tier} ${pace.hull}${pace.mercoxit ? ' (its Mercoxit version)' : ''}, ${pace.at}`
      : `From ${whose(pilot)} sessions`;
  const whyNot = (why: NoPace, kind: OreKind): string => {
    const fit = pace?.from === 'fit' ? `the ${pace.tier} ${pace.hull}` : 'the fit';
    switch (why) {
      case 'none': return 'No pace to work it out at: open a ship in Scaling up below, and ISK an hour follows its fit.';
      case 'loading': return 'Working out the fit’s pace…';
      case 'drones': return `${fit[0].toUpperCase()}${fit.slice(1)} mines only with its drones, which aren’t worked out here.`;
      case 'fitIsIce': return `${fit[0].toUpperCase()}${fit.slice(1)} harvests ice, not ${KIND_SAID[kind]}: open an ore fit in Scaling up for its pace.`;
      case 'fitIsOre': return `${fit[0].toUpperCase()}${fit.slice(1)} mines ore, not ice: open an ice fit in Scaling up${ICE_HULLS.length ? ` (the ${ICE_HULLS.join(' or ')})` : ''}.`;
      case 'fitIsMercoxit': return `Scaling up shows ${fit}’s Mercoxit version, with deep-core lasers: pick another ore there for this one’s pace.`;
      case 'needMercoxit': return 'Mercoxit takes deep-core lasers: click its name to pick it in Scaling up, which shows each fit’s Mercoxit version.';
      case 'notMeasured': return `${whoseStart(pilot)} sessions haven’t measured a pace on ${KIND_SAID[kind]}: open a ship in Scaling up below${kind === 'mercoxit' ? ', with Mercoxit picked there' : ''}.`;
    }
  };

  const pricing = busy.size > 0;
  const status = ids === 'failed'
    ? <>Couldn’t read the ores’ names from ESI just now, so nothing is priced. <button type="button" className="link-btn" onClick={() => setIdsTry((n) => n + 1)}>Try again</button></>
    : !ids ? 'Reading the ores from ESI…'
      : pricing ? `Pricing ${units(busy.size)} at Jita…`
        : <>
          {readAt != null && <>Jita’s bids read at {hm.format(readAt)} ET. </>}
          {failedTypes.length > 0 && <>{units(failedTypes.length)} couldn’t be priced in full just now. <button type="button" className="link-btn" onClick={() => price(failedTypes)}>Try again</button>{' · '}</>}
          <button type="button" className="link-btn" onClick={() => price(priced, true)}>Price again</button>
        </>;

  return (
    <Panel title="Best ore to mine" sub="Every ore and ice type by where it’s found, at Jita’s bids now">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--body)', textWrap: 'pretty' }}>What each ore earns where you mine, best first.</p>
        <Points compact items={[
          { kind: 'good', icon: Coins, lead: 'Priced', text: 'as Scaling up prices it: the best of selling it as it is, compressed or reprocessed at Jita, after tax.' },
          { kind: 'info', icon: MapPin, lead: 'Where', text: 'from EVE University’s tables and CCP’s patch notes, read 1 October 2026: ESI doesn’t say where ores spawn.' },
          { kind: 'tip', icon: Gauge, lead: 'ISK an hour', text: 'follows the ship and fit open in Scaling up below, at its character’s skills; with none open, the pace your sessions measured.' },
        ]} />
      </div>
      <div className="row" style={{ gap: '8px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Seg size="sm" label="Where it’s found" value={place} onChange={choosePlace}
          options={PLACES.map((p) => ({ v: p.key, label: p.label, n: Object.values(ORE_WHERE).filter((o) => o.found.some((x) => x.place === p.key)).length }))} />
        <span className="note small" style={{ margin: 0 }}>{status}</span>
      </div>
      <div className="tbl-scroll">
        <table className="tbl" style={{ minWidth: 900 }}>
          <thead><tr>
            <th scope="col" className="l" style={{ width: 36 }}>#</th>
            <th scope="col" className="l"><span className="th">Ore</span></th>
            <th scope="col" className="l"><span className="th">Found here<Tip title="Found here" text={'Where in this kind of space it’s found, and how.\n\n• From EVE University’s Asteroids and ore, Moon mining and Ice harvesting pages and CCP’s patch notes, read 1 October 2026: ESI doesn’t say.\n• Hover a row for the detail and the page it comes from; a flag marks where the sources disagree.'} /></span></th>
            <th scope="col" className="l"><span className="th">Best way<Tip title="Best way" text={'Of three ways to sell it at Jita 4-4, after tax, whichever fetches most.\n\n• As it is: into its own bids.\n• Compressed: its compressed form into its bids. Compressing keeps one unit for one at a hundredth of the volume; it takes a Porpoise, an Orca or a structure.\n• Reprocessed: at your skills at Jita 4-4, the minerals into their bids, after the station’s tax.'} /></span></th>
            <th scope="col"><span className="th">ISK a m³<Tip title="ISK a m³" text="What a cubic metre of it fetches the best way, after tax: what fills an ore hold best." /></span></th>
            <th scope="col">
              <span className="th">ISK an hour<Tip title="ISK an hour" text={'A m³ of it at the pace Scaling up shows, for an hour.\n\n• With a ship open there: its tier’s m³ a minute at that character’s skills, from ESI’s figures, without boosts.\n• One ore fit’s pace holds for every ore but Mercoxit: a crystal of one kind mines every family alike (ESI’s figures for each family’s crystals agree).\n• An ore fit mines no ice and an ice fit no ore; Mercoxit takes deep-core lasers, so it has a pace only with Mercoxit picked there.\n• With no ship open: what your sessions measured, on the same kind of ore.'} /></span>
              <span className="sub" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>{paceSaid}</span>
            </th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const o = ORE_WHERE[r.base];
              const kind = kindOfBase(r.base)!;
              const id = idOf(r.base);
              const isOpen = open.has(r.base);
              const g = grades[r.base];
              const src = SOURCE_OF[o.kind];
              return (
                <Fragment key={r.base}>
                  <tr className={isOpen ? 'open' : undefined}>
                    <td className="l faint">{i + 1}</td>
                    <td className="l">
                      <span className="cellrow">
                        {kind !== 'ice' ? (
                          <button type="button" className="expander" aria-expanded={isOpen} onClick={() => toggle(r.base)} disabled={!id}
                            aria-label={`${r.base}: ${isOpen ? 'hide' : 'show'} its higher grades`} data-tip={id ? undefined : 'Its grades show once its name is read from ESI.'}>
                            <ChevronRight className="chev" aria-hidden="true" />
                          </button>
                        ) : <span style={{ width: 14, flex: 'none' }} aria-hidden="true" />}
                        {id ? <ItemIcon id={id} /> : <span className="ticon" aria-hidden="true" />}
                        <span style={{ minWidth: 0 }}>
                          <OreName name={r.base} id={id} kind={kind} onPick={onPick} />
                          {minedBases.has(r.base) && <span className="sub">{mines}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="l wrap" style={{ minWidth: 260, maxWidth: 420 }}>
                      {o.found.filter((x) => x.place === place).map((x, k) => (
                        <span key={k} style={{ display: 'block' }} data-tip-title={`${r.base}: ${HOW_SAID[x.how].toLowerCase()}`}
                          data-tip={[x.detail ?? '', `From ${src.name}, read ${src.read}.`, ...(o.disputed ? [`The sources disagree: ${o.disputed}`] : [])].filter(Boolean).join('\n\n')}>
                          <span className="lbl" style={{ marginRight: 6 }}>{HOW_SAID[x.how]}</span><span className="txt">{whereSaid(x)}</span>
                        </span>
                      ))}
                      {o.disputed && <span className="flags" style={{ justifyContent: 'flex-start', marginTop: 4 }}><Flag why={o.disputed} title="Sources disagree" color="var(--acc2)">Sources disagree</Flag></span>}
                    </td>
                    <PriceCells t={id} kind={kind} prices={prices} busy={busy} figures={figures} hourOf={hourOf} whyNot={whyNot} named={!!ids && ids !== 'failed'} />
                  </tr>
                  {isOpen && (g === 'reading' || g === 'failed' || (Array.isArray(g) && !g.length)) && (
                    <tr className="detail"><td colSpan={6}>
                      {g === 'reading' ? <span className="note small">Reading its grades from ESI…</span>
                        : g === 'failed' ? <span className="note small">Couldn’t read its grades from ESI just now. <button type="button" className="link-btn" onClick={() => readGrades(r.base)}>Try again</button></span>
                          : <span className="note small">No higher grades on the market.</span>}
                    </td></tr>
                  )}
                  {isOpen && Array.isArray(g) && g.map((x) => (
                    <tr key={x.id} className="open">
                      <td />
                      <td className="l">
                        <span className="cellrow" style={{ paddingLeft: 24 }}>
                          <ItemIcon id={x.id} />
                          <OreName name={x.name.trim()} id={x.id} kind={kind} onPick={onPick} />
                        </span>
                      </td>
                      <td />
                      <PriceCells t={x.id} kind={kind} prices={prices} busy={busy} figures={figures} hourOf={hourOf} whyNot={whyNot} named />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note small" style={{ margin: 0, color: 'var(--faint)' }}>
        <BookOpen aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 4 }} />
        Where each ore is found: EVE University’s{' '}
        {[SOURCE_OF.asteroid, SOURCE_OF.moon, SOURCE_OF.ice].map((s, k, all) => (
          <span key={s.url}><a className="link-btn" href={s.url} target="_blank" rel="noopener noreferrer" data-tip={s.caveat}>{s.name.replace(/^EVE University: /, '')}</a>{k < all.length - 2 ? ', ' : k === all.length - 2 ? ' and ' : ''}</span>
        ))}
        {' '}pages and CCP’s{' '}
        {ORE_WHERE_SOURCE.filter((s) => s.name.startsWith('CCP')).map((s, k, all) => (
          <span key={s.url}><a className="link-btn" href={s.url} target="_blank" rel="noopener noreferrer" data-tip={s.caveat}>{s.name.replace(/^CCP: /, '')}</a>{k < all.length - 1 ? ' and ' : ''}</span>
        ))}
        , read {SOURCE_OF.asteroid.read}. The Asteroids and ore page itself asks for an update since Catalyst.
      </p>
    </Panel>
  );
}

/**
 * An ore's name, which sends it to Scaling up's Ore picker. Ice isn't an ore there (its fits load no crystal, and an ore
 * fit's worth would be worked out at ice's price), so an ice type's name only says how to see its pace.
 */
function OreName({ name, id, kind, onPick }: { name: string; id: number | undefined; kind: OreKind; onPick: (t: number) => void }) {
  if (kind === 'ice') {
    return <span className="name" data-tip={`Scaling up’s Ore picker is for ore. Open an ice fit there${ICE_HULLS.length ? ` (the ${ICE_HULLS.join(' or ')})` : ''} and ISK an hour here follows it.`}>{name}</span>;
  }
  if (!id) return <span className="name">{name}</span>;
  return (
    <button type="button" className="name-btn name" onClick={() => onPick(id)} data-tip={`Price Scaling up’s fits for ${name}: its crystals, worth and payback.`}>
      {name}
    </button>
  );
}

/** Best way, ISK a m³ and ISK an hour for one type: what's known, "Pricing…" while it's read, or why there's nothing. */
function PriceCells({ t, kind, prices, busy, figures, hourOf, whyNot, named }: {
  t: number | undefined; kind: OreKind; prices: Record<number, Priced>; busy: Set<number>;
  figures: (t: number | undefined) => { best: NonNullable<ReturnType<typeof bestWay>>; perM3: number | null; partial: boolean; worth: OreWorth } | null;
  hourOf: (kind: OreKind, perM3: number | null) => { r: ReturnType<typeof paceFor>; isk: number | null };
  whyNot: (why: NoPace, kind: OreKind) => string;
  /** Whether the ores' names were read: without them nothing could be priced. */
  named: boolean;
}) {
  const f = figures(t);
  const p = t != null ? prices[t] : undefined;
  if (!f) {
    const said = !named ? 'Not priced: its name couldn’t be read from ESI'
      : t == null ? 'ESI doesn’t know it by this name'
        : busy.has(t) || !p ? 'Pricing…'
          : p.state === 'none' ? 'No bids at Jita for it, its compressed form or its minerals'
            : 'Couldn’t price it at Jita just now';
    return <td colSpan={3} className="faint" style={{ textAlign: 'center' }}>{said === 'Pricing…' ? said : <>– <span className="txt">{said}</span></>}</td>;
  }
  const w = f.worth;
  const ways = `As it is ${w.raw != null ? isk(w.raw) : '–'}, compressed ${w.compressed != null ? isk(w.compressed) : '–'}, reprocessed ${w.reprocessed != null && w.reprocessed > 0 ? isk(w.reprocessed) : '–'} a unit, after tax.`;
  const low = f.partial ? '\n\nSome of Jita’s books for it couldn’t be read just now, so this may be low: Try again above.' : '';
  const h = hourOf(kind, f.perM3);
  return (
    <>
      <td className="l" data-tip={ways + low}>{WAY_SAID[f.best.way]}{f.partial && <span className="sub">may be low</span>}</td>
      <td data-tip={f.perM3 == null ? 'Its volume couldn’t be read from ESI just now.' : `${isk(f.best.perUnit)} a unit, ${units(Math.round((f.best.perUnit / f.perM3) * 1000) / 1000)} m³ each.${low}`}>
        {f.perM3 != null ? isk(f.perM3) : '–'}
      </td>
      <td style={{ color: h.isk != null ? 'var(--pos)' : undefined }}
        data-tip={h.isk != null && h.r.m3PerMin != null && f.perM3 != null ? `${units(Math.round(h.r.m3PerMin))} m³ a minute × 60 × ${isk(f.perM3)} a m³.${low}` : h.r.m3PerMin == null ? whyNot(h.r.why, kind) : 'Its volume couldn’t be read from ESI just now.'}>
        {h.isk != null ? iskBig(h.isk) : h.r.m3PerMin == null && h.r.why === 'loading' ? '…' : <span className="faint">–</span>}
      </td>
    </>
  );
}
