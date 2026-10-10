import { useMemo, useState } from 'react';
import { Building2, ChevronRight, Factory, Truck } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { SCOPE } from '../../lib/config';
import { iskBig, pct } from '../../lib/format';
import { toast } from '../../lib/toast';
import { KIND_SAID, kindOfType, type Indexed, type SiteKind } from '../../lib/industry';
import { NEAR_JITA_JUMPS } from '../../lib/industryRank';
import { FREIGHT_PRESETS, HOME_SYSTEMS, homeSite, JITA_SYSTEM, quietStations, rigsFitting, routeBetween, secText, siteFacts, stationLabel, stationSite, structureSite } from '../../lib/industrySites';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import { MAX_ROUTES, MAX_SITES, type FreightRoute, type IndustrySite } from '../../lib/prefs';
import { Points } from '../Facts';
import { FindStructure } from '../FindStructure';
import { NumChip, Seg, Th } from '../ui';
import type { IndustryChar } from './industryChars';
import { useIndices, useIndustryDoc, useStationNames } from './industryMarket';

/**
 * Where you build (docs/notes/industry.md): the build sites in the synced `industry` doc, each with what's known of it
 * (its system, band, jumps from Jita, ESI's index) and what's yours to type (a structure's kind, rigs and facility tax);
 * three ways to add one (a quiet NPC station near Jita, a structure found by name, a home typed by you); and freight
 * routes between sites and markets, Brave Freight's offered as presets and none used until picked.
 */
const STRUCTURE_KINDS: SiteKind[] = ['raitaru', 'azbel', 'sotiyo', 'astrahus', 'fortizar', 'keepstar', 'other'];
/** A kind as a choice in a list: short, since a select is as wide as its longest option. */
const KIND_PICK: Record<SiteKind, string> = { npc: 'NPC station', raitaru: 'Raitaru', azbel: 'Azbel', sotiyo: 'Sotiyo', astrahus: 'Astrahus', fortizar: 'Fortizar', keepstar: 'Keepstar', other: 'Other, no bonus' };
/** A rig's name without the "Standup " every engineering rig's name starts with. */
const rigName = (ix: Indexed, id: number) => (ix.b.types[id]?.[0] ?? `Rig #${id}`).replace(/^Standup /, '');
type Adding = 'near' | 'name' | 'home';

export function IndustrySites({ c, ix, graph, mainName }: { c: IndustryChar; ix: Indexed; graph: Graph; mainName: string }) {
  const [doc, setDoc] = useIndustryDoc();
  const indices = useIndices();
  const idx = indices.state === 'ok' ? indices.value : null;
  const jitaHigh = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC), [graph]);
  const [adding, setAdding] = useState<Adding>('near');
  const add = (s: IndustrySite) => {
    if (doc.sites.some((x) => x.id === s.id) || doc.sites.length >= MAX_SITES) return;
    setDoc({ sites: [...doc.sites, s], site: doc.site ?? s.id });
  };
  const change = (id: string, patch: Partial<IndustrySite>) => setDoc({ sites: doc.sites.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const remove = (id: string) => setDoc({ sites: doc.sites.filter((s) => s.id !== id), site: doc.site === id ? (doc.sites.find((s) => s.id !== id)?.id ?? null) : doc.site });
  const sysName = (id: number) => graph[id]?.[1] ?? `System #${id}`;

  return (
    <section className="col" style={{ gap: 12 }} aria-label="Where you build" data-industry="sites">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Where you build decides a job’s cost, how long it takes, and what it costs to reach a market.</p>
        <Points compact items={[
          { kind: 'info', icon: Building2, lead: 'An NPC station', text: 'charges a 0.25% facility tax and takes no rigs: what high-sec near Jita offers.' },
          { kind: 'good', icon: Factory, lead: 'An engineering complex', text: 'cuts a job’s time, materials and cost, and its rigs cut more; its owner sets the tax.' },
          { kind: 'warn', lead: 'Not in ESI', text: 'a structure’s tax and rigs: typed by you, and said wherever they’re used.' },
        ]} />
      </div>

      {doc.sites.length ? (
        <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
          <table className="tbl compact rd-table ind-sites" data-industry="site-list">
            <thead>
              <tr>
                <Th left>Site</Th>
                <Th left className="rd-wide">Where</Th>
                <Th left className="rd-wide" tip="An engineering complex (Raitaru, Azbel, Sotiyo) cuts time, materials and cost; a citadel takes rigs but has no role bonus.">Kind</Th>
                <Th left className="rd-wide" tip="Engineering rigs of the structure’s size, at most three. Each helps the products its group names, more in low-sec (×1.9) and null-sec (×2.1).">Rigs</Th>
                <Th className="rd-wide" tip="Set by a structure’s owner and shown in the game’s Industry window; an NPC station’s is 0.25% (EVE University). Not in ESI.">Facility tax</Th>
                <Th className="rd-wide" tip="ESI’s manufacturing cost index for the system, read hourly: the busier the system, the dearer a job.">Index</Th>
              </tr>
            </thead>
            <tbody>
              {doc.sites.map((s) => {
                const f = siteFacts(s, graph, jitaHigh, idx);
                const place = `${f.system ?? sysName(s.systemId)}${f.security != null ? ` ${secText(f.security)}` : ''}`;
                const jumps = f.jitaJumps != null ? `${f.jitaJumps} high-sec jump${f.jitaJumps === 1 ? '' : 's'} from Jita` : 'no high-sec route from Jita';
                const where = `${place} · ${jumps}`;
                const kind = s.kind === 'npc' ? (s.lab ? 'NPC station with a Laboratory' : 'NPC station') : KIND_SAID[s.kind];
                const tax = f.tax != null ? `${pct(f.tax)}${s.kind === 'npc' ? '' : ' typed by you'}` : '–: type it from the Industry window';
                const index = f.index ? pct(f.index.manufacturing) : f.indexWhy;
                const fitting = rigsFitting(ix, s.kind).filter((r) => !s.rigs.includes(r[0]));
                return (
                  <tr key={s.id} data-site={s.id}>
                    <td className="l rd-main">
                      <span className="nm">{s.name}</span>
                      <span className="ind-acts">
                        {doc.site === s.id ? <span className="ind-default">Default</span>
                          : <button type="button" className="link-btn" onClick={() => setDoc({ site: s.id })}>Make it the default</button>}
                        <button type="button" className="link-btn" onClick={() => remove(s.id)}>Remove</button>
                      </span>
                      {!s.structureId && s.kind !== 'npc' && <span className="sub">Typed by you: with no structure ID, the app knows nothing held there.</span>}
                      <span className="rd-phone"><span>{where}</span><span>{kind}</span><span>Tax: {tax}</span><span>Index: {index}</span></span>
                    </td>
                    <td className="l rd-wide">{place}<span className="sub">{jumps}</span></td>
                    <td className="l rd-wide">
                      {s.kind === 'npc' ? kind : (
                        <select className="ind-sel" aria-label={`Kind of ${s.name}`} value={s.kind} onChange={(e) => change(s.id, { kind: e.target.value as SiteKind, rigs: [] })}>
                          {STRUCTURE_KINDS.map((k) => <option key={k} value={k}>{KIND_PICK[k]}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="l rd-wide ind-rigs">
                      {s.kind === 'npc' ? 'none' : (
                        <span className="col" style={{ gap: 4 }}>
                          {s.rigs.map((r) => (
                            <span key={r} className="ind-rig">{rigName(ix, r)}
                              <button type="button" className="link-btn" aria-label={`Take off ${rigName(ix, r)}`} onClick={() => change(s.id, { rigs: s.rigs.filter((x) => x !== r) })}>×</button>
                            </span>
                          ))}
                          {s.rigs.length < 3 && fitting.length > 0 && (
                            <select className="ind-sel" aria-label={`Add a rig to ${s.name}`} value="" onChange={(e) => change(s.id, { rigs: [...s.rigs, Number(e.target.value)] })}>
                              <option value="">Add a rig…</option>
                              {fitting.map((r) => <option key={r[0]} value={r[0]}>{rigName(ix, r[0])}</option>)}
                            </select>
                          )}
                          {!fitting.length && !s.rigs.length && <span className="faint">takes no rigs the app knows</span>}
                        </span>
                      )}
                    </td>
                    <td className="rd-wide">
                      {s.kind === 'npc' ? tax : (
                        <NumChip label="Facility tax" hideLabel percent width={60} value={s.tax != null ? +(s.tax * 100).toFixed(4) : null} placeholder="–"
                          onChange={(n) => change(s.id, { tax: n == null ? null : n / 100 })} tip={s.tax == null ? 'Not typed: the finder ranks before it and says what each 1% costs a day.' : 'Typed by you.'} />
                      )}
                    </td>
                    <td className="rd-wide">{index}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>No build sites yet: add a quiet station near Jita, a structure you can see, or your home.</p>}

      {doc.sites.length < MAX_SITES ? (
        <div className="col" style={{ gap: 10 }} data-industry="add-site">
          <Seg size="sm" label="Add a site" value={adding} onChange={setAdding}
            options={[{ v: 'near', label: 'A station near Jita' }, { v: 'name', label: 'A structure by name' }, { v: 'home', label: 'Home' }]} />
          {adding === 'near' && <NearJita ix={ix} graph={graph} indices={indices} sites={doc.sites} add={add} />}
          {adding === 'name' && (hasScope(SCOPE.search) && hasScope(SCOPE.structures) ? (
            <div className="col" style={{ gap: 6 }}>
              <FindStructure label="Find a structure to build in by name" onPick={(f) => add(structureSite(f))}
                describe={(f) => { const k = kindOfType(f.typeId); return k === 'other' ? 'no manufacturing bonus the app knows' : KIND_SAID[k]; }} />
              <p className="note small" style={{ margin: 0 }}>Searches as {c.isMain ? 'you' : mainName}: the structures EVE lets {c.isMain ? 'you' : mainName} see.{c.isMain ? '' : ` ${c.name}’s own aren’t searched here.`}</p>
            </div>
          ) : <p className="note small" style={{ margin: 0 }}>Log in again: finding a structure by name needs EVE’s permission to search structures.</p>)}
          {adding === 'home' && <AddHome graph={graph} sites={doc.sites} add={add} />}
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>{MAX_SITES} sites is the most kept: remove one to add another.</p>}

      <Freight graph={graph} routes={doc.freight} setRoutes={(freight) => setDoc({ freight })} />
    </section>
  );
}

/** The quietest high-sec NPC stations within NEAR_JITA_JUMPS of Jita, with a Factory or with a Laboratory, each with its index. */
function NearJita({ ix, graph, indices, sites, add }: { ix: Indexed; graph: Graph; indices: ReturnType<typeof useIndices>; sites: IndustrySite[]; add: (s: IndustrySite) => void }) {
  const [lab, setLab] = useState(false);
  const list = useMemo(() => (indices.state === 'ok' ? quietStations(ix.b.stations, graph, indices.value, { maxJumps: NEAR_JITA_JUMPS, need: lab ? 'lab' : 'factory', limit: 6 }) : []), [ix, graph, indices, lab]);
  const names = useStationNames(list.map((x) => x.stationId));
  if (indices.state === 'loading') return <p className="note small" style={{ margin: 0 }}>Reading the industry indices…</p>;
  if (indices.state === 'failed') return <p className="note small" style={{ margin: 0 }}>Couldn’t read ESI’s industry indices just now. <button type="button" className="link-btn" onClick={indices.retry}>Try again</button></p>;
  return (
    <div className="col" style={{ gap: 6 }} data-industry="near-jita">
      <p className="note small" style={{ margin: 0 }}>The quietest high-sec stations within {NEAR_JITA_JUMPS} jumps of Jita: a lower index is a cheaper job.</p>
      <Seg size="sm" label="Station services" value={lab ? 'lab' : 'factory'} onChange={(v) => setLab(v === 'lab')}
        options={[{ v: 'factory', label: 'With a Factory', tip: 'For building: 2,259 NPC stations have one.' }, { v: 'lab', label: 'With a Laboratory', tip: 'For research, copying and invention: only 510 NPC stations have one.' }]} />
      {list.length ? list.map((p) => {
        const id = `npc:${p.stationId}`, have = sites.some((s) => s.id === id), read = names[p.stationId], name = stationLabel(read, p.system);
        return (
          <div key={p.stationId} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span className="nm">{name}</span>
            <span className="faint">{p.system} {secText(p.security)} · {p.jumps} jump{p.jumps === 1 ? '' : 's'} · {lab ? 'ME research' : 'manufacturing'} index {pct(p.index)}{p.lab && !lab ? ' · has a Laboratory' : ''}</span>
            {have ? <span className="faint">Added</span> : read === undefined ? <button type="button" className="btn sm" disabled>Reading names…</button>
              : <button type="button" className="btn sm" onClick={() => add(stationSite(p, name))}>Add</button>}
            {!have && read === null && <span className="faint">ESI gave no name: saved as “{name}”</span>}
          </div>
        );
      }) : <p className="note small" style={{ margin: 0 }}>No station with {lab ? 'a Laboratory' : 'a Factory'} within {NEAR_JITA_JUMPS} high-sec jumps has an index ESI lists.</p>}
    </div>
  );
}

/** A home typed by you: a system (UALX-3 offered first) and the kind of structure you'd build in there. */
function AddHome({ graph, sites, add }: { graph: Graph; sites: IndustrySite[]; add: (s: IndustrySite) => void }) {
  const [system, setSystem] = useState<number>(HOME_SYSTEMS[0].systemId);
  const [typed, setTyped] = useState('');
  const [kind, setKind] = useState<SiteKind>('azbel');
  const found = typed.trim() ? Object.entries(graph).find(([, v]) => v[1].toLowerCase() === typed.trim().toLowerCase()) : null;
  const pick = typed.trim() ? (found ? Number(found[0]) : null) : system;
  const have = pick != null && sites.some((s) => s.id === `home:${pick}`);
  return (
    <div className="col" style={{ gap: 8 }} data-industry="add-home">
      <Seg size="sm" label="Home system" value={typed.trim() ? 0 : system} onChange={(v) => { setSystem(v); setTyped(''); }}
        options={[...HOME_SYSTEMS.map((h) => ({ v: h.systemId, label: h.name })), ...(typed.trim() ? [{ v: 0, label: 'Typed' }] : [])]} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="num" style={{ width: 160 }} placeholder="Or a system’s name" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="A home system by name" />
        <select className="ind-sel" aria-label="Kind of structure" value={kind} onChange={(e) => setKind(e.target.value as SiteKind)}>
          {STRUCTURE_KINDS.map((k) => <option key={k} value={k}>{KIND_PICK[k]}</option>)}
        </select>
        <button type="button" className="btn sm" disabled={pick == null || have} onClick={() => pick != null && add(homeSite(pick, graph[pick]?.[1] ?? `System #${pick}`, kind))}>{have ? 'Added' : 'Add'}</button>
      </div>
      {typed.trim() && !found && <p className="note small" style={{ margin: 0 }}>No system by that name on the map.</p>}
      <p className="note small" style={{ margin: 0 }}>Typed by you: a home with no structure ID holds nothing the app can read, and its tax and rigs are yours to type.</p>
    </div>
  );
}

/** Freight routes: Brave Freight's offered with their source, typed ones kept, none used until it's in this list. */
function Freight({ graph, routes, setRoutes }: { graph: Graph; routes: FreightRoute[]; setRoutes: (r: FreightRoute[]) => void }) {
  const [open, setOpen] = useState(routes.length > 0);
  const [a, setA] = useState(''), [b, setB] = useState('');
  const [perM3, setPerM3] = useState<number | null>(null), [coll, setColl] = useState<number | null>(null), [min, setMin] = useState<number | null>(null);
  const sys = (name: string) => { const e = Object.entries(graph).find(([, v]) => v[1].toLowerCase() === name.trim().toLowerCase()); return e ? Number(e[0]) : null; };
  const name = (id: number) => graph[id]?.[1] ?? `System #${id}`;
  const add = (r: FreightRoute) => {
    const have = routeBetween(routes, r.a, r.b);
    if (have) { toast(`You already have a route between ${name(r.a)} and ${name(r.b)}: ${have.name}. Remove it to use another.`, 'warn'); return; }
    if (routes.length < MAX_ROUTES) setRoutes([...routes, r]);
  };
  const sa = sys(a), sb = sys(b);
  const said = (r: FreightRoute) => `${r.perM3.toLocaleString('en-US')} ISK a m³${r.collateral ? `, ${pct(r.collateral)} of the goods’ value` : ''}, ${r.min != null ? `${iskBig(r.min)} minimum` : 'no minimum stated'}`;
  return (
    <div className="col" style={{ gap: 8 }} data-industry="freight">
      <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight className="chev" aria-hidden="true" /><span className="panel-title"><Truck aria-hidden="true" /> Freight</span>
      </button>
      {open && (
        <>
          <p className="note small" style={{ margin: 0 }}>What a hauler charges between two systems: ISK a m³ of packaged volume, a share of the goods’ value, a minimum a contract. None is used until it’s listed here; from a high-sec station within {NEAR_JITA_JUMPS} jumps of Jita you carry it yourself, for no ISK.</p>
          {routes.map((r) => (
            <div key={r.id} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }} data-route={r.id}>
              <span className="nm">{r.name}</span><span className="faint">{said(r)}{r.source ? ` · ${r.source}` : ' · typed by you'}</span>
              <button type="button" className="link-btn" onClick={() => setRoutes(routes.filter((x) => x.id !== r.id))}>Remove</button>
            </div>
          ))}
          {FREIGHT_PRESETS.filter((p) => !routeBetween(routes, p.a, p.b)).map((p) => (
            <div key={p.id} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>{p.name}</span><span className="faint">{said(p)} · {p.source}</span>
              <button type="button" className="btn sm" onClick={() => add(p)}>Use it</button>
            </div>
          ))}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }} data-industry="route-form">
            <input className="num" style={{ width: 120 }} placeholder="From" value={a} onChange={(e) => setA(e.target.value)} aria-label="Route from (a system)" />
            <input className="num" style={{ width: 120 }} placeholder="To" value={b} onChange={(e) => setB(e.target.value)} aria-label="Route to (a system)" />
            <NumChip label="ISK a m³" width={70} value={perM3} onChange={setPerM3} />
            <NumChip label="Of the value" percent width={50} value={coll} onChange={setColl} />
            <NumChip label="Minimum" width={90} value={min} onChange={setMin} placeholder="none" />
            <button type="button" className="btn sm" disabled={sa == null || sb == null || sa === sb || perM3 == null}
              onClick={() => { add({ id: `typed:${sa}:${sb}`, name: `${name(sa!)} ↔ ${name(sb!)}`, a: sa!, b: sb!, perM3: perM3!, collateral: (coll ?? 0) / 100, min, source: null }); setA(''); setB(''); }}>Add a route</button>
          </div>
          {(a.trim() && sa == null) || (b.trim() && sb == null) ? <p className="note small" style={{ margin: 0 }}>No system by that name on the map.</p> : null}
        </>
      )}
    </div>
  );
}
