import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, ExternalLink, Landmark, ListOrdered, MapPin, Pickaxe } from 'lucide-react';
import type { ColoniesDoc } from '../../lib/colonies';
import { iskBig, units } from '../../lib/format';
import { dayCount } from '../../lib/split';
import { secBand } from '../../lib/industry';
import { secText } from '../../lib/industrySites';
import type { Graph } from '../../lib/jumps';
import { resolveIds } from '../../lib/market';
import { PI_LINKS, setupSteps, type PlanetType } from '../../lib/pi';
import type { Facility, PiIndex } from '../../lib/piBundle';
import { PI_UNCHECKED, rateFor, type Learned } from '../../lib/piLearn';
import {
  ALPHA_NO_PI, boughtAtJita, charWhy, RAN_OUT,
  type Bought, type PlanChar, type Role, type Setup, type SetupKind,
} from '../../lib/piPlan';
import { BRAVE_TAX_SOURCE, customsRate, sanitizePlanets, type SystemPrefs, type Tax, type TypedRate } from '../../lib/planetsDoc';
import { update, useData } from '../../lib/store';
import { system as systemInfo } from '../../lib/universe';
import { Points } from '../Facts';
import { Check, Notice, NumChip, Seg, Tiles, Tip } from '../ui';
import type { IndustryChar } from './industryChars';
import { useHomeHubs, useIndustryDoc } from './industryMarket';
import type { SystemPlanet } from './planetsMarket';
import { NO_SYS, usePlanning } from './planetsPlanning';
import { useMainSystem } from './rightNow';

/** An amount a day as a pace is said (N2): whole from 10, one decimal under it, "under 0.1" below that; never a known 0.4 read as 0. */
const aDay = (n: number) => dayCount(n);

/**
 * Plan: give it a system and every way of setting its planets up is ranked by ISK a day for the character shown, with the upkeep
 * beside it, which planet does what, and every output valued (spec "Stage 1: plan a system"). The inputs (customs tax per planet
 * type with a planet's own, extraction rates learned or typed, the program length) are kept in the synced `planets` doc; where it
 * sells is the `industry` doc's, as Industry's finder sells. The ranking is worked out in planetsPlanning.ts, which the Chart reads
 * too, so both sections say the same of a system.
 */

export const KIND: Record<SetupKind, { label: string; tip: string }> = {
  p1: { label: 'P0 → P1 on each planet', tip: 'Each planet extracts two of its P0s and refines them into P1 in Basic factories, and exports the P1.\n\n• The pair on each planet is the one that pays most here.\n• The simplest setup: no Advanced factories, nothing carried between planets.' },
  p2: { label: 'P0 → P2 on each planet', tip: 'Each planet makes the best P2 it can make alone: two extractors, their Basic factories, and Advanced ones making the P2.\n\n• The layout is 2 Advanced + 4 Basic with more heads, or 3 + 6 with fewer: whichever your extraction rate fills.\n• Less management time than a factory planet: each planet is its own island.' },
  feed: { label: 'Planets feeding a factory planet', tip: 'Some planets make P1 (or a P2 alone) and ship it to one factory planet in the system that makes a P2 or P3 from it.\n\n• Includes the P2s no single planet can make.\n• Each feeder pays export tax, the factory half that to import, and the factory is sized to what it is fed.' },
  bought: { label: 'A factory planet on bought inputs', tip: 'Factory planets with no extractors: they buy P1, P2 or P3 at the market and make P2, P3 or P4.\n\n• P4 only on Barren and Temperate planets, in High-Tech Production Plants.\n• Each pays import tax on what it buys and export tax on what it sells, and its launchpad is restocked as it empties.' },
  chain: { label: 'A chain across characters', tip: 'A P4 (or a P3) whose planets are more than one character has: each character in it extracts or builds a part.\n\n• Ranked by ISK a day per character in it, so it compares with one character’s setups like for like.\n• Uses characters whose skills are read, in roster order from the one shown.' },
};
const FAC: Record<Facility, [string, string]> = {
  basic: ['Basic Industry Facility', 'Basic Industry Facilities'],
  advanced: ['Advanced Industry Facility', 'Advanced Industry Facilities'],
  hightech: ['High-Tech Production Plant', 'High-Tech Production Plants'],
};
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
/** "2%", "2.5%": a customs rate as a player types it. */
const pctSaid = (x: number) => `${+(x * 100).toFixed(2)}%`;
const hoursSaid = (h: number) => (h % 24 === 0 ? `${h / 24}-day` : `${+h.toFixed(1)}-hour`);
/** A reason from elsewhere set inside a sentence: its first letter in lower case ("No price at UALX-3" → "no price at UALX-3"). */
const clause = (w: string) => w.charAt(0).toLowerCase() + w.slice(1);
const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** A type's own customs tax (no planet's override), as `customsRate` gives it: planet ID −1 is never a planet. */
const typeTax = (doc: ReturnType<typeof useData>['planets'], systemId: number, sec: number, t: PlanetType, cce: number | null) => customsRate(doc, systemId, sec, t, -1, cce);

/** A customs tax in words: its rate and where it comes from, or why it isn't known. */
function taxSaid(tax: Tax, t: PlanetType | null): string {
  if (tax.interbus) return tax.rate == null ? 'InterBus’s office: its rate is unverified; type it' : `${pctSaid(tax.rate)} · InterBus’s office, unverified`;
  if (tax.rate == null) return 'not known: ranked before it';
  const r = pctSaid(tax.rate);
  if (tax.npc > 0) return `${r} · the owner’s rate plus the NPC part, ${pctSaid(tax.npc)}`;
  return tax.from === 'brave' ? `${r} · Brave’s wiki, 17 Jul 2023` : tax.from === 'planet' ? `${r} · typed for this planet` : `${r} · typed for ${t ?? 'this type'}`;
}

export function PlanetsPlan({ c, chars, colonies, ix, graph, systemId, onSystem, mainName }: {
  c: IndustryChar; chars: IndustryChar[]; colonies: Record<number, ColoniesDoc | undefined>; ix: PiIndex; graph: Graph;
  systemId: number | null; onSystem: (id: number | null) => void; mainName: string;
}) {
  const doc = useData().planets;
  // One ranking from one input, shared with the Chart (planetsPlanning.ts).
  const { planChar, others, cce, sys, value, learned, ownHours, defaultHours, programHours, prefs, morning, market, setups, working, livePass } = usePlanning({ c, chars, colonies, ix, systemId });

  const name = (id: number) => ix.byId.get(id)?.name ?? `type ${id}`;
  const blockedWhy = charWhy(planChar);

  return (
    <section className="col" style={{ gap: 16 }} data-planets="plan">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--body-2)', maxWidth: '72ch' }}>Give it a system: every way of setting its planets up is ranked by ISK a day, with the upkeep beside it and which planet does what.</p>
        <Points compact items={[
          { kind: 'info', icon: ListOrdered, lead: 'Five setups', text: 'P0 → P1 or P0 → P2 on each planet, planets feeding a factory planet, a factory on bought inputs, and chains across characters.' },
          { kind: 'info', icon: Pickaxe, lead: 'Extraction', text: 'is learned from your own extractors by planet type, or typed; with neither, a setup is worked out at what its factories can take, and says so.' },
          { kind: 'info', icon: Landmark, lead: 'Customs', text: 'in sovereign null-sec is the skyhook owner’s rate: Brave’s wiki’s by default, typed over per planet type or planet.' },
        ]} />
      </div>
      <Who c={c} pc={planChar} />
      <SystemChooser c={c} graph={graph} colonies={colonies[c.charId]} systemId={systemId} onSystem={onSystem} mainName={mainName} chosen={value ? value.system.name : null} />
      {systemId != null && (sys.state === 'loading' ? <p className="note small" style={{ margin: 0 }}>Reading the system’s planets…</p>
        : sys.state === 'failed' ? (
          <p className="note small" style={{ margin: 0 }}>The planets couldn’t be read: {sys.error}.{' '}
            <button type="button" className="link-btn" onClick={sys.retry}>{'reload' in sys ? 'Reload to try again' : 'Try again'}</button></p>
        ) : value && (
          <>
            <SystemHead name={value.system.name} security={value.system.security} planets={value.planets} />
            <Selling said={market.said} />
            {blockedWhy ? null : !morning.ready ? <p className="note small" style={{ margin: 0 }} data-planets="waiting">{morning.said}</p> : (
              <Setups setups={setups} working={!working ? null : livePass ? `Working them out again ${market.liveSaid}…` : 'Working them out again…'} ix={ix} planets={value.planets} chars={[planChar, ...others]} shown={planChar} name={name} />
            )}
            <Inputs ix={ix} systemId={value.system.systemId} security={value.system.security} planets={value.planets} prefs={prefs} cce={cce}
              learned={learned} programHours={programHours} defaultHours={defaultHours} ownHours={ownHours.length > 0} typedHours={doc.programHours} />
            <PlanetList ix={ix} systemId={value.system.systemId} security={value.system.security} planets={value.planets} prefs={prefs} learned={learned} />
          </>
        ))}
      <Points compact items={PI_LINKS.map((l) => ({ kind: 'tip' as const, icon: ExternalLink, lead: <a href={l.href} target="_blank" rel="noopener noreferrer">{l.title}</a>, text: l.what }))} />
    </section>
  );
}

/** Whose plan: planets allowed and the level the fits assume, or why nothing can be planned for this character. */
function Who({ c, pc }: { c: IndustryChar; pc: PlanChar }) {
  const why = charWhy(pc);
  const whose = c.isMain ? 'Your' : `${c.name}’s`;
  if (why === ALPHA_NO_PI) {
    return <div data-planets="who"><Notice kind="warn">{ALPHA_NO_PI}: none of the planet skills is in any Alpha clone, so nothing can be planned for {c.isMain ? 'you' : c.name} until {c.isMain ? 'you are' : 'it is'} Omega.</Notice></div>;
  }
  if (why) {
    const reason = c.isMain ? 'they come with the next sync' : c.pilot.lost === 'refused' ? `EVE refused ${c.name}’s login; hand it over again on the Characters page`
      : c.pilot.lost === 'none' ? `the cloud holds no login for ${c.name}; hand one over on the Characters page` : 'they come with the cloud’s first read';
    return <p className="note" style={{ margin: 0 }} data-planets="who">{whose} skills aren’t read yet, so no setup is worked out for {c.isMain ? 'you' : c.name}: {reason}.</p>;
  }
  return (
    <p className="note" style={{ margin: 0 }} data-planets="who">
      {c.isMain ? 'You' : c.name}: <b>{units(pc.planets)} planet{pc.planets === 1 ? '' : 's'}</b> ({pc.planets! > 1 ? `one, plus Interplanetary Consolidation ${ROMAN[pc.planets! - 1] ?? pc.planets! - 1}` : 'one: Interplanetary Consolidation adds one a level'}), each fitted {pc.ccLevel! > 0 ? <>at <b>Command Center Upgrades {ROMAN[pc.ccLevel!] ?? pc.ccLevel}</b></> : 'without Command Center Upgrades'}.
      {pc.alpha == null && ' Clone state not read: worked out as Omega (an Alpha can’t do planetary industry).'}
    </p>
  );
}

/** Choosing the system: by name (the stargate map's names, else ESI's), where the main is, or a system the shown character's colonies are in. */
function SystemChooser({ c, graph, colonies, systemId, onSystem, mainName, chosen }: {
  c: IndustryChar; graph: Graph; colonies: ColoniesDoc | undefined; systemId: number | null; onSystem: (id: number | null) => void; mainName: string; chosen: string | null;
}) {
  const where = useMainSystem();
  const [typed, setTyped] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  // The field follows the system chosen, however it was chosen.
  useEffect(() => { if (chosen) setTyped(chosen); }, [chosen]);
  const byName = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, v] of Object.entries(graph)) m.set(v[1].toLowerCase(), Number(id));
    return m;
  }, [graph]);
  const hints = useMemo(() => {
    const q = typed.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: string[] = [];
    for (const v of Object.values(graph)) { if (v[1].toLowerCase().startsWith(q)) out.push(v[1]); if (out.length >= 12) break; }
    return out;
  }, [typed, graph]);
  const find = async () => {
    const q = typed.trim();
    if (!q) return;
    setSaid(null);
    const known = byName.get(q.toLowerCase());
    if (known) { onSystem(known); return; }
    // Not on the stargate map (a wormhole has no gates): ESI's names.
    try {
      const r = await resolveIds([q]);
      const hit = r.systems?.[0];
      if (hit) onSystem(hit.id); else setSaid(`No system is called “${q}”.`);
    } catch (e) { setSaid(`Couldn’t look “${q}” up: ${e instanceof Error ? e.message : String(e)}.`); }
  };
  // The shown character's colonies' systems, named from the map, else read from ESI (a wormhole).
  const colonySystems = useMemo(() => [...new Set((colonies?.colonies ?? []).map((x) => x.systemId))], [colonies]);
  const [names, setNames] = useState<Record<number, string>>({});
  useEffect(() => {
    const missing = colonySystems.filter((id) => !graph[id] && !names[id]);
    if (!missing.length) return;
    let alive = true;
    Promise.all(missing.map((id) => systemInfo(id).then((s) => [id, s.name] as const).catch(() => null)))
      .then((xs) => { if (alive) setNames((n) => ({ ...n, ...Object.fromEntries(xs.filter((x): x is readonly [number, string] => !!x)) })); });
    return () => { alive = false; };
  }, [colonySystems, graph, names]);
  const sysName = (id: number) => graph[id]?.[1] ?? names[id] ?? null;

  return (
    <div className="col" style={{ gap: 8 }} data-planets="system">
      <div className="row ind-choices">
        <input className="num" style={{ width: 180 }} placeholder="A system’s name" aria-label="System" list="pl-system-names" value={typed}
          onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void find(); }} />
        <datalist id="pl-system-names">{hints.map((h) => <option key={h} value={h} />)}</datalist>
        <button type="button" className="btn" onClick={() => void find()}>Plan it</button>
        {where !== 'noScope' && (
          <button type="button" className="btn" disabled={!where || where === 'failed'} onClick={() => { if (where && where !== 'failed') onSystem(where.systemId); }}
            data-tip={where === 'failed' ? `ESI didn’t say where ${mainName} is just now` : where ? `${mainName} is in ${where.name} (${secText(where.security)})` : `Reading where ${mainName} is…`}>
            <MapPin aria-hidden="true" />Where {mainName} is
          </button>
        )}
        {colonySystems.map((id) => (
          <button key={id} type="button" className={'chip-btn' + (id === systemId ? ' on' : '')} onClick={() => onSystem(id)} data-tip={`${c.isMain ? 'Your' : `${c.name}’s`} colonies are here`}>
            {sysName(id) ?? 'Reading…'}
          </button>
        ))}
      </div>
      {where === 'noScope' && <p className="note small" style={{ margin: 0 }}>Where {mainName} is needs EVE’s permission to read your location, which this login wasn’t given. Log in again and EVE asks for it.</p>}
      {said && <p className="note small" style={{ margin: 0 }}>{said}</p>}
      {systemId == null && <p className="note small" style={{ margin: 0 }}>Choose a system to plan: type its name{where !== 'noScope' ? `, take where ${mainName} is` : ''}{colonySystems.length ? ', or one your colonies are in' : ''}.</p>}
    </div>
  );
}

function SystemHead({ name, security, planets }: { name: string; security: number; planets: SystemPlanet[] }) {
  const band = secBand(security);
  const pi = planets.filter((p) => p.type).length;
  return (
    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
      <span className="panel-title"><MapPin aria-hidden="true" style={{ width: 14, height: 14, color: 'var(--acc)' }} />{name}</span>
      <span className="note small">{secText(security)} · {band === 'null' ? 'null-sec' : band === 'low' ? 'low-sec' : band === 'high' ? 'high-sec' : 'security not known'} · {planets.length} planet{planets.length === 1 ? '' : 's'}{pi < planets.length ? `, ${pi} with planetary industry` : ''}</span>
    </div>
  );
}

/** Where it sells: the Industry doc's home hub and its choice of Jita, the hub or either, as the finder sells. */
export function Selling({ said }: { said: string }) {
  const [doc, setDoc] = useIndustryDoc();
  const { hubs } = useHomeHubs();
  const hub = hubs.find((h) => h.id === doc.hub) ?? null;
  return (
    <div className="col" style={{ gap: 6 }} data-planets="market">
      <div className="row ind-choices">
        <label className="chip h34"><span className="cl">Home hub</span>
          <select aria-label="Home hub" className="ind-sel" value={doc.hub ?? ''} onChange={(e) => setDoc({ hub: e.target.value ? Number(e.target.value) : null })}>
            <option value="">None</option>
            {hubs.map((h) => <option key={h.id} value={h.id}>{h.short}</option>)}
            {doc.hub != null && !hub && <option value={doc.hub}>Not known here</option>}
          </select>
        </label>
        {hub && <Seg size="sm" label="Sell at" value={doc.sell} onChange={(v) => setDoc({ sell: v })}
          options={[{ v: 'jita' as const, label: 'Jita' }, { v: 'home' as const, label: hub.short }, { v: 'best' as const, label: 'Either', tip: 'Each good where it nets more: the hub’s listings and bids and Jita’s, in order of what they pay' }]} />}
      </div>
      <p className="note small" style={{ margin: 0 }}>{said} The freight route and the hub’s broker fee are the Industry tab’s.
        <Tip title="Where it sells" text={'The home hub and Sell at here are the Industry tab’s own settings, not a copy.\n\n• Changing either here changes it for the Industry tab’s finder and To do’s items too, and the other way round.\n• The freight route and the hub’s broker fee are set on the Industry tab.'} /></p>
    </div>
  );
}

const sysPrefs = (doc: ReturnType<typeof useData>['planets'], systemId: number): SystemPrefs => doc.systems[String(systemId)] ?? NO_SYS;
/** Writes one system's prefs into the synced doc, through its sanitizer. */
const setPrefs = (systemId: number, fn: (s: SystemPrefs) => SystemPrefs) => update((x) => ({
  planets: sanitizePlanets({ ...x.planets, systems: { ...x.planets.systems, [String(systemId)]: fn(sysPrefs(x.planets, systemId)) } }),
}));

/** Each planet: its type and the P0s it has, or why it has no planetary industry, and its customs tax with its own override. */
function PlanetList({ ix, systemId, security, planets, prefs, learned }: { ix: PiIndex; systemId: number; security: number; planets: SystemPlanet[]; prefs: SystemPrefs; learned: Partial<Record<PlanetType, Record<string, Learned>>> }) {
  const high = secBand(security) === 'high';
  const name = (id: number) => ix.byId.get(id)?.name ?? `type ${id}`;
  /** How the planet's extraction is known, P0 by P0: learned from your extractors, typed, another P0's learned rate, or none. */
  const extractionSaid = (t: PlanetType): string => {
    const by = { own: [] as string[], typed: [] as string[], other: [] as string[], none: [] as string[] };
    for (const p0 of ix.planetTypes[t].p0) {
      const k = learned[t]?.[String(p0)] ? 'own' : prefs.rates[t]?.[String(p0)] ? 'typed' : rateFor(learned, undefined, t, p0) ? 'other' : 'none';
      by[k].push(name(p0));
    }
    return [
      by.own.length ? `learned for ${listSaid(by.own)}` : null,
      by.typed.length ? `typed for ${listSaid(by.typed)}` : null,
      by.other.length ? `${listSaid(by.other)} at another ${t} P0’s learned rate` : null,
      by.none.length ? `no rate for ${listSaid(by.none)}: worked out at what the factories take, if your extractors deliver that` : null,
    ].filter(Boolean).join('; ');
  };
  return (
    <div className="col pl-planets" style={{ gap: 0 }}>
      <div className="panel-title" style={{ marginBottom: 8 }}>Its planets<Tip title="Its planets" text={'Each planet’s type and the P0s it has, from CCP’s static data.\n\n• Shattered and Scorched Barren planets have no planetary industry.\n• Type a planet’s own customs tax to override its type’s.'} /></div>
      {planets.map((p) => (
        <div key={p.planetId} className="pl-planet" data-planets={`planet:${p.planetId}`}>
          <div className="pl-planet-name"><b>{p.name}</b><span className="sub">{p.type ?? (p.typeName ?? 'A planet').replace(/^Planet \((.+)\)$/, '$1')}</span></div>
          {!p.type ? <span className="note small">No planetary industry here: CCP’s data gives this kind of planet none.</span> : (
            <>
              <span className="col pl-p0s" style={{ gap: 4 }}>
                <span className="row tight">{ix.planetTypes[p.type].p0.map((id) => <span key={id} className="pill-tag">{name(id)}</span>)}</span>
                <span className="note small">Extraction: {extractionSaid(p.type)}.</span>
              </span>
              <span className="row tight pl-tax">
                <NumChip label="Its tax" percent width={44} decimals={2} placeholder="–"
                  value={prefs.planetTax[String(p.planetId)] == null ? null : prefs.planetTax[String(p.planetId)] * 100}
                  onChange={(n) => setPrefs(systemId, (s) => { const planetTax = { ...s.planetTax }; if (n == null) delete planetTax[String(p.planetId)]; else planetTax[String(p.planetId)] = Math.min(100, Math.max(0, n)) / 100; return { ...s, planetTax }; })}
                  tip="This planet’s own customs tax, over its type’s. Empty: its type’s." />
                <span className="note small">{taxSaid(p.tax, p.type)}</span>
                {high && <Check checked={!!prefs.interbus[String(p.planetId)]} onChange={(on) => setPrefs(systemId, (s) => { const interbus = { ...s.interbus }; if (on) interbus[String(p.planetId)] = true; else delete interbus[String(p.planetId)]; return { ...s, interbus }; })}
                  tip="A high-sec planet whose customs office is InterBus’s, not a player’s: what InterBus charges in high-sec today isn’t verified, so type its rate.">InterBus office</Check>}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** The inputs: the program length, customs tax per planet type, Not Brave's space, and the extraction rates. */
function Inputs({ ix, systemId, security, planets, prefs, cce, learned, programHours, defaultHours, ownHours, typedHours }: {
  ix: PiIndex; systemId: number; security: number; planets: SystemPlanet[]; prefs: SystemPrefs; cce: number | null;
  learned: Partial<Record<PlanetType, Record<string, Learned>>>; programHours: number; defaultHours: number; ownHours: boolean; typedHours: number | null;
}) {
  const doc = useData().planets;
  const types = [...new Set(planets.map((p) => p.type).filter((t): t is PlanetType => !!t))];
  const band = secBand(security);
  const name = (id: number) => ix.byId.get(id)?.name ?? `type ${id}`;
  const [edit, setEdit] = useState<{ t: PlanetType; p0: number } | null>(null);
  return (
    <div className="col inset-box" style={{ gap: 12 }} data-planets="inputs">
      <div className="row ind-choices">
        <span data-planets="program" className="row tight">
          <NumChip label="Program, hours" width={60} decimals={1} placeholder="–" value={typedHours}
            onChange={(n) => update((x) => ({ planets: sanitizePlanets({ ...x.planets, programHours: n }) }))}
            tip={'How often you reset, as the extraction program’s length.\n\n• It sets the resets a week in each setup’s upkeep.\n• A learned or typed rate holds at the program length it was measured at: the rows say when yours differs.'} />
          <span className="note small">{typedHours != null ? `${+programHours.toFixed(1)} hours, typed` : ownHours ? `${+defaultHours.toFixed(1)} hours: your own programs’ median` : '3 days until you type one or your colonies show yours'}</span>
        </span>
        {band === 'null' && systemId < 31_000_000 && (
          <span data-planets="notBrave" className="pl-notbrave">
            <Check checked={prefs.notBrave} onChange={(on) => setPrefs(systemId, (s) => ({ ...s, notBrave: on }))}
              tip={`Brave’s wiki’s rates are taken for sovereign null-sec (${BRAVE_TAX_SOURCE}). A system that isn’t Brave’s has no default: type its rates, or it is ranked before tax.`}>Not Brave’s space: no tax assumed</Check>
          </span>
        )}
      </div>
      <div className="col" style={{ gap: 6 }}>
        <div className="panel-title">Customs tax by planet type<Tip title="Customs tax" text={'What the customs office (in sovereign null-sec, the skyhook) takes on what leaves a planet, on CCP’s fixed base value a unit, not the market’s price.\n\n• Exporting pays the rate; importing pays half of it.\n• Null-sec: Brave’s wiki’s rates until you type one: 2% on Barren and Temperate, 5% on the rest.\n• High-sec: a player office’s owner rate plus 10%, less a point a level of Customs Code Expertise.\n• Low-sec: typed.'} /></div>
        <div className="row pl-taxes">
          {types.map((t) => {
            const tax = typeTax(doc, systemId, security, t, cce);
            return (
              <span key={t} className="pl-taxcell" data-planets={`tax:${t}`}>
                <NumChip label={t} percent width={44} decimals={2} placeholder="–"
                  value={prefs.tax[t] == null ? null : prefs.tax[t]! * 100}
                  onChange={(n) => setPrefs(systemId, (s) => { const tx = { ...s.tax }; if (n == null) delete tx[t]; else tx[t] = Math.min(100, Math.max(0, n)) / 100; return { ...s, tax: tx }; })}
                  tip={band === 'high' ? 'The owner’s rate on this type’s planets here: the NPC part is added to it.' : `The customs tax on ${t} planets here. Empty: ${band === 'null' && !prefs.notBrave ? 'Brave’s wiki’s' : 'not known, ranked before it'}.`} />
                <span className="note small">{band === 'high' && cce == null && tax.rate == null && prefs.tax[t] != null ? 'not known: Customs Code Expertise isn’t read' : taxSaid(tax, t)}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="col" style={{ gap: 6 }}>
        <div className="panel-title">Extraction, P0 an hour an extractor<Tip title="Extraction" text={'What one extractor (its control unit and heads) gives an hour, averaged over its program.\n\n• Learned from your own extractors of that planet type, the lower of the two readings of ESI’s figure until the game has been checked once.\n• Typed: the Total the game shows for a program, divided by its hours, with its length and head count.\n• Neither: a setup is worked out at what its factories can take, and says so.'} /></div>
        {types.map((t) => (
          <div key={t} className="pl-rates">
            <b className="pl-rate-type">{t}</b>
            <div className="col" style={{ gap: 4, minWidth: 0 }}>
              {/* A P0 with a rate of its own (learned or typed) is a line; the rest are named together, each a button to type one. */}
              {ix.planetTypes[t].p0.filter((p0) => learned[t]?.[String(p0)] || prefs.rates[t]?.[String(p0)]).map((p0) => {
                const own = learned[t]?.[String(p0)];
                const typed = prefs.rates[t]?.[String(p0)];
                // A learned rate is used before a typed one (rateFor): typing over it would change nothing, so it offers no box.
                return (
                  <span key={p0} className="pl-rate" data-planets={`rate:${t}:${p0}`}>
                    <span><b>{name(p0)}</b> {own ? learnedSaid(own, systemId) : typedSaid(typed!)}{own && typed ? ` · your typed ${units(typed.perHour)} an hour stands aside while a rate is learned` : ''}</span>
                    {!own && <button type="button" className="link-btn" onClick={() => setEdit({ t, p0 })}>Change</button>}
                  </span>
                );
              })}
              {(() => {
                const rest = ix.planetTypes[t].p0.filter((p0) => !learned[t]?.[String(p0)] && !prefs.rates[t]?.[String(p0)]);
                if (!rest.length) return null;
                const other = rateFor(learned, undefined, t, rest[0]);
                return (
                  <span className="pl-rate">
                    <span className="note small">{other ? `At another ${t} P0’s learned rate (${units(other.perHour)} an hour):` : 'No rate, so worked out at what the factories take:'}</span>
                    {rest.map((p0) => <span key={p0} data-planets={`rate:${t}:${p0}`}><button type="button" className="pill-btn" onClick={() => setEdit({ t, p0 })} data-tip={`Type ${name(p0)}’s rate on ${t} planets`}>{name(p0)}</button></span>)}
                  </span>
                );
              })()}
              {edit && edit.t === t && <RateEdit key={`${edit.t}:${edit.p0}`} systemId={systemId} t={t} p0={edit.p0} p0Name={name(edit.p0)} typed={prefs.rates[t]?.[String(edit.p0)]} programHours={programHours} onDone={() => setEdit(null)} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function learnedSaid(l: Learned, systemId: number): string {
  const heads = l.heads > 0 ? `${+l.heads.toFixed(1)} heads` : 'heads not known: the colony didn’t say';
  return [
    `${units(l.perHour)} an hour, learned from ${l.extractors} extractor${l.extractors === 1 ? '' : 's'}`,
    `${hoursSaid(l.programHours)} programs, ${heads}`,
    ...(l.systems.includes(systemId) ? [] : ['learned in another system: richness varies from planet to planet']),
    l.checked ? null : `${PI_UNCHECKED}${l.higher != null ? ` (${units(l.higher)} the other way)` : ''}`,
  ].filter(Boolean).join(' · ');
}
const typedSaid = (r: TypedRate) => `${units(r.perHour)} an hour, typed · ${hoursSaid(r.programHours)} programs, ${+r.heads.toFixed(1)} heads`;

/** Typing a rate: all three figures are needed (the doc keeps none without them), the program length filled in from the one chosen. */
function RateEdit({ systemId, t, p0, p0Name, typed, programHours, onDone }: { systemId: number; t: PlanetType; p0: number; p0Name: string; typed: TypedRate | undefined; programHours: number; onDone: () => void }) {
  const [perHour, setPerHour] = useState(typed ? String(typed.perHour) : '');
  const [hours, setHours] = useState(String(typed?.programHours ?? +programHours.toFixed(1)));
  const [heads, setHeads] = useState(typed ? String(typed.heads) : '');
  const num = (s: string) => { const n = Number(s.replace(/,/g, '').trim()); return Number.isFinite(n) && n > 0 ? n : null; };
  const missing = [num(perHour) == null && 'P0 an hour', num(hours) == null && 'the program’s hours', num(heads) == null && 'its heads'].filter(Boolean) as string[];
  const save = () => {
    if (missing.length) return;
    setPrefs(systemId, (s) => ({ ...s, rates: { ...s.rates, [t]: { ...(s.rates[t] ?? {}), [String(p0)]: { perHour: num(perHour)!, programHours: num(hours)!, heads: num(heads)! } } } }));
    onDone();
  };
  const remove = () => {
    setPrefs(systemId, (s) => { const byP0 = { ...(s.rates[t] ?? {}) }; delete byP0[String(p0)]; return { ...s, rates: { ...s.rates, [t]: byP0 } }; });
    onDone();
  };
  return (
    <div className="col inset-box" style={{ gap: 6 }} data-planets="rate-edit">
      <span className="note small">{t}’s {p0Name}: in game, the extractor’s program shows a Total for it; divide that by the program’s hours, and give the heads it had.</span>
      <div className="row ind-choices">
        <input className="num" style={{ width: 90 }} aria-label="P0 an hour" placeholder="P0 an hour" value={perHour} onChange={(e) => setPerHour(e.target.value)} />
        <input className="num" style={{ width: 80 }} aria-label="Program, hours" placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} />
        <input className="num" style={{ width: 60 }} aria-label="Heads" placeholder="Heads" value={heads} onChange={(e) => setHeads(e.target.value)} />
        <button type="button" className="btn" disabled={missing.length > 0} onClick={save}>Save</button>
        {typed && <button type="button" className="btn" onClick={remove}>Remove</button>}
        <button type="button" className="link-btn" onClick={onDone}>Cancel</button>
      </div>
      {missing.length > 0 && <span className="note small">Still needed: {listSaid(missing)}.</span>}
    </div>
  );
}

/** A fold within a setup's row: the panels' own toggle, a chevron and its words. */
function Toggle({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  return <button type="button" className="panel-toggle pl-toggle" aria-expanded={open} onClick={onToggle}><ChevronRight className="chev" aria-hidden="true" />{children}</button>;
}

/**
 * The setups, ranked, each a row; the user's own P0 → P2 says how far it is from the best. `working`: what's being worked out again,
 * in words (an input changed, or the live books came in), or null.
 */
function Setups({ setups, working, ix, planets, chars, shown, name }: {
  setups: Setup[] | null; working: string | null; ix: PiIndex; planets: SystemPlanet[]; chars: PlanChar[]; shown: PlanChar; name: (id: number) => string;
}) {
  if (!setups) return <p className="note small" style={{ margin: 0 }} data-planets="working">Working out each setup…</p>;
  const best = setups.find((s) => s.iskDay != null) ?? null;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="panel-title">The setups, best first</span>
        {working && <span className="note small" data-planets="working">{working}</span>}
      </div>
      <span className="note small">Worked out at the customs tax, extraction rates and program length below; change any and they are worked out again.</span>
      {setups.map((s, i) => <SetupRow key={s.kind} s={s} rank={i + 1} best={best} ix={ix} planets={planets} chars={chars} shown={shown} name={name} />)}
    </div>
  );
}

function SetupRow({ s, rank, best, ix, planets, chars, shown, name }: {
  s: Setup; rank: number; best: Setup | null; ix: PiIndex; planets: SystemPlanet[]; chars: PlanChar[]; shown: PlanChar; name: (id: number) => string;
}) {
  const [open, setOpen] = useState(false);
  // The best and the user's own P0 → P2 open with their detail; the rest fold to their head, figures and upkeep. A fold the user
  // set holds only for the place it was set in (m3): when a live re-rank makes this row the best, it opens; when it stops being
  // the best, it folds again, unless set by hand in that place too.
  const opensItself = rank === 1 || s.kind === 'p2';
  const [setByHand, setSetByHand] = useState<{ open?: boolean; shut?: boolean }>({});
  const place = opensItself ? 'open' : 'shut';
  const detail = setByHand[place] ?? opensItself;
  const setDetail = (v: boolean) => setSetByHand((x) => ({ ...x, [place]: v }));
  const planet = (id: number) => planets.find((p) => p.planetId === id);
  const pname = (id: number) => planet(id)?.name ?? `planet ${id}`;
  const who = (id: number) => chars.find((x) => x.charId === id);
  const used = s.roles.filter((r) => r.does !== 'unused');
  const unused = s.roles.filter((r) => r.does === 'unused');
  const inChain = s.kind === 'chain' && s.why == null ? s.perChar.map((p) => who(p.charId)?.name ?? `Character ${p.charId}`) : [];
  const label = s.kind === 'chain' && inChain.length === 1 ? `A P4 chain on ${inChain[0]}’s planets` : KIND[s.kind].label;
  const perChar = s.kind === 'chain' && inChain.length > 1;
  const priced = s.why == null && s.iskDay != null;
  const high = s.iskDayHigh != null && s.iskDay != null && Math.abs(s.iskDayHigh - s.iskDay) >= 1;
  const taxedPlanets = new Set(s.taxes.filter((t) => t.perDay == null).map((t) => t.planetId));
  const notes: ReactNode[] = [];
  if (s.why) notes.push(s.why === RAN_OUT ? `${RAN_OUT}: nothing was found within it, which says nothing of what this system can do.` : `${s.why}.`);
  if (s.cut && s.why == null) notes.push('The best of the arrangements tried: the search ran out of its budget first, so it may be well under what this system can do.');
  if (priced && s.before.includes('tax')) notes.push(`Before the customs tax on ${taxedPlanets.size} planet${taxedPlanets.size === 1 ? '' : 's'} whose tax isn’t known: each 1% costs ${iskBig(s.perPct)} a day.`);
  if (priced && s.before.includes('extraction')) notes.push('Some extractors have no rate: worked out at what their factories take, if your extractors deliver that.');
  if (priced && s.unvalued) notes.push(`${s.unvalued} output${s.unvalued === 1 ? '' : 's'} not valued (no price read), so not counted: never as 0.`);
  // A layout that doesn't fit is kept and priced as if it did (the planner's rule): the head says so, not only the planet's line.
  const unfit = s.roles.filter((r) => r.fit && !r.fit.fits);
  if (priced && unfit.length) notes.push(`${unfit.length} planet${unfit.length === 1 ? '’s layout doesn’t' : 's’ layouts don’t'} fit as planned (said on ${unfit.length === 1 ? 'its line' : 'their lines'}): the figure is what ${unfit.length === 1 ? 'it would' : 'they would'} make if ${unfit.length === 1 ? 'it' : 'they'} did.`);
  // What fixes each planet that doesn't fit, a planet at a time (Ruling T11-2): a level is named only for the planets it fixes.
  const lacks = trainSaid(used, pname);
  const gapSaid = s.kind !== 'p2' ? null : !priced ? 'No figure to set against the best here.'
    : best === s || !best || best.iskDay == null ? 'The best here.' : `${iskBig(best.iskDay - s.iskDay!)} a day under the best here${best.kind === 'chain' ? ' (a chain’s figure is per character)' : ''}.`;
  const steps = open ? setupSteps(s.kind, {
    p0s: [...new Set(used.flatMap((r) => r.extracts.map((e) => name(e.p0))))],
    makes: [...new Set(used.filter((r) => r.does === 'factory' || s.kind === 'p2').flatMap((r) => r.makes.filter((m) => m.facility !== 'basic').map((m) => name(m.id))))],
    takesIn: [...new Set(used.flatMap((r) => (r.imports ?? []).filter((x) => x.from === 'market').map((x) => name(x.id))))],
  }) : [];

  return (
    <article className={'pl-setup' + (rank === 1 && priced ? ' best' : '')} data-planets={`setup:${s.kind}`}>
      <div className="pl-setup-head">
        <span className="pl-rank">{rank}</span>
        <div className="pl-setup-name">
          <b>{label}</b>{s.kind === 'p2' && <span className="pl-yours">your setup</span>}<Tip title={KIND[s.kind].label} text={KIND[s.kind].tip} />
          {perChar && <span className="sub">{listSaid(inChain)}: {inChain.length} characters, ranked per character</span>}
        </div>
        <div className="pl-isk">
          {priced ? <><b>{iskBig(s.iskDay)}</b><span className="sub">a day{perChar ? ' per character' : ''}</span></> : <b>–</b>}
          {priced && high && <span className="sub pl-high">up to {iskBig(s.iskDayHigh)} if the game reads extraction the other way</span>}
        </div>
      </div>
      {notes.length > 0 && <div className="col pl-notes">{notes.map((n, i) => <span key={i} className="note small">{n}</span>)}</div>}
      {s.kind === 'chain' && s.why != null && s.perChar.length > 0 && (
        <span className="note small">{(() => {
          const can = s.perChar.filter((p) => !p.lacks.includes('Omega')).map((p) => who(p.charId)?.name ?? `Character ${p.charId}`);
          const alpha = s.perChar.filter((p) => p.lacks.includes('Omega')).map((p) => who(p.charId)?.name ?? `Character ${p.charId}`);
          return [can.length ? `With planetary industry: ${listSaid(can)}.` : null, alpha.length ? `${listSaid(alpha)} could make one up once Omega.` : null].filter(Boolean).join(' ');
        })()}</span>
      )}
      {gapSaid && <span className="note small" data-planets="gap">{gapSaid}</span>}
      {priced && (
        <>
          <div data-planets="upkeep">
            <Tiles min={150} items={upkeepTiles(s)} />
          </div>
          {(s.kind === 'chain' || lacks) && (
            <div className="col pl-lines">
              {s.kind === 'chain' && s.perChar.map((p) => {
                const ch = who(p.charId);
                const n = used.filter((r) => r.charId === p.charId).length;
                const train = trainSaid(used.filter((r) => r.charId === p.charId), pname);
                return <span key={p.charId} className="pl-line"><b>{ch?.name ?? `Character ${p.charId}`}</b>: {n} colon{n === 1 ? 'y' : 'ies'}{p.iskDay != null ? `, ${iskBig(p.iskDay)} a day as its share` : ''}{train ? `; ${train.charAt(0).toLowerCase()}${train.slice(1)}` : ''}{ch?.alpha == null ? '; clone state not read: worked out as Omega' : ''}</span>;
              })}
              {s.kind !== 'chain' && lacks && <span className="pl-line" data-planets="train">{lacks}.</span>}
            </div>
          )}
          <div><Toggle open={detail} onToggle={() => setDetail(!detail)}>What it makes and which planet does what</Toggle></div>
          {detail && <>
          <Outputs s={s} name={name} />
          {s.inputs.length > 0 && (
            <div className="col pl-lines">
              <span className="lbl">Bought</span>
              {s.inputs.map((i) => {
                // At what the market supplies a day (Ruling T11-3): said, so a figure held there reads as the market's limit, not the factories'.
                const atMax = i.bought.max != null && i.perDay >= i.bought.max * (1 - 1e-6);
                return (
                  <span key={i.id} className="pl-line" data-planets={atMax ? 'at-max' : undefined}>{aDay(i.perDay)} {name(i.id)} a day{i.bought.isk == null ? `: can’t be bought (${clause(i.bought.why ?? 'no price')})` : `, ${iskBig(i.bought.isk)} a day at ${boughtWhere(i.bought, i.perDay)}${i.bought.note ? ` (${clause(i.bought.note)})` : ''}`}
                    {atMax && <span className="sub pl-why">All {i.bought.maxAt ?? 'the market'} {(i.bought.maxAt ?? '').includes(' and ') ? 'supply' : 'supplies'}{i.bought.maxSaid ? `: ${i.bought.maxSaid}` : ''}.</span>}
                  </span>
                );
              })}
              {(() => {
                const all = s.inputs.reduce((n, i) => (i.bought.isk == null || n == null ? null : n + i.bought.isk), 0 as number | null);
                return all == null ? null : <span className="pl-line" data-planets="bought-total">In all, <b>{iskBig(all)}</b> a day of purchases{priced ? `, for ${iskBig(s.iskDay)} a day after them` : ''}.</span>;
              })()}
            </div>
          )}
          <div className="col pl-lines">
            <span className="lbl">Which planet does what</span>
            {used.map((r, i) => <RoleLine key={`${r.planetId}:${r.charId}:${i}`} r={r} s={s} planet={planet(r.planetId)} pname={pname} name={name} whose={s.kind === 'chain' || r.charId !== shown.charId ? who(r.charId)?.name ?? null : null} untaxed={taxedPlanets.has(r.planetId)} />)}
            {unused.length > 0 && <span className="note small">Not used: {unusedSaid(unused, pname)}.</span>}
          </div>
          <div>
            <Toggle open={open} onToggle={() => setOpen(!open)}>How to build it</Toggle>
            {open && (
              <ol className="pl-steps">
                {steps.map((st, i) => (
                  <li key={st.title}><span className="mono">{String(i + 1).padStart(2, '0')}</span><div><b>{st.title}</b><p>{st.body}</p>{st.tip && <p className="pl-tip">{st.tip}</p>}</div></li>
                ))}
              </ol>
            )}
          </div>
          </>}
        </>
      )}
    </article>
  );
}

/** Every output: what is made a day, what sells and where, and what builds up; one with no price says why and counts as nothing summed. */
function Outputs({ s, name }: { s: Setup; name: (id: number) => string }) {
  return (
    <div className="col pl-lines">
      <span className="lbl">What it makes, valued</span>
      {s.outputs.map((o) => (
        <span key={o.id} className="pl-line">
          <b>{name(o.id)}</b>: {aDay(o.perDay)} a day
          {o.sold.isk == null ? `, not valued: ${clause(o.sold.why ?? 'no price read')}`
            : `, ${aDay(o.sold.units)} sold at ${o.sold.where.length ? listSaid(o.sold.where.map((w) => (w === 'jita' ? 'Jita' : 'the home hub'))) : 'nowhere (nothing sells at your share)'} for ${iskBig(o.sold.isk)} a day`}
          {o.sold.isk != null && o.buildingUp > 1e-6 && <span className="pl-up">; {aDay(o.buildingUp)} a day build up: the market takes no more at your share</span>}
        </span>
      ))}
    </div>
  );
}

/** One planet's part: what it extracts (each extractor's rate and where it comes from), what its factories make, what it takes in and ships, its customs. */
function RoleLine({ r, s, planet, pname, name, whose, untaxed }: {
  r: Role; s: Setup; planet: SystemPlanet | undefined; pname: (id: number) => string; name: (id: number) => string; whose: string | null; untaxed: boolean;
}) {
  // It doesn't fit, and no Command Center Upgrades level fits it either: judged on this planet alone (Ruling T11-2).
  const noLevel = !!r.fit && !r.fit.fits && !r.lacks;
  const extract = r.extracts.map((e) => {
    const from = !e.rate ? 'no rate: if your extractors deliver it' : e.rate.from === 'typed' ? 'typed' : e.rate.otherP0 ? 'learned for another P0' : 'learned';
    const heads = e.heads != null ? `${e.heads} head${e.heads === 1 ? '' : 's'}` : e.rate && !(e.rate.heads > 0) ? 'heads not known: the colony didn’t say how many' : 'heads not known';
    return `${name(e.p0)} at ${units(e.perHour)} an hour (${from}; ${heads})`;
  });
  const makes = r.makes.filter((m) => m.count > 0 || m.perDay > 0).map((m) => `${m.count} ${FAC[m.facility][m.count === 1 ? 0 : 1]} make${m.count === 1 ? 's' : ''} ${aDay(m.perDay)} ${name(m.id)} a day`);
  const imports = (r.imports ?? []).map((x) => `${aDay(x.perDay)} ${name(x.id)} a day from ${x.from === 'market' ? 'the market' : pname(x.from)}`);
  const ships = r.ships.map((x) => `${aDay(x.perDay)} ${name(x.id)} a day to ${x.to === 'market' ? 'market' : pname(x.to)}`);
  const rows = s.taxes.filter((t) => t.planetId === r.planetId);
  const tax = rows.length === 0 ? null : rows.some((t) => t.perDay == null) ? 'not known: ranked before it' : `${iskBig(rows.reduce((n, t) => n + t.perDay!, 0))} a day (${rows.map((t) => `${t.tier} ${iskBig(t.perDay)}`).join(', ')})`;
  const parts: [string, string][] = [
    ...(extract.length ? [['Extracts', listSaid(extract)] as [string, string]] : []),
    ...(imports.length ? [['Takes in', listSaid(imports)] as [string, string]] : []),
    ...(makes.length ? [['Makes', listSaid(makes)] as [string, string]] : []),
    ...(ships.length ? [['Ships', listSaid(ships)] as [string, string]] : []),
    ...(tax ? [['Customs', tax] as [string, string]] : []),
  ];
  return (
    <div className="pl-role" data-planets={`role:${r.planetId}`}>
      <div className="pl-role-name"><b>{pname(r.planetId)}</b><span className="pl-type">{[planet?.type ?? 'no planetary industry', r.does === 'factory' ? 'factory planet' : null, whose ? `${whose}’s` : null].filter(Boolean).join(' · ')}</span></div>
      <div className="pl-role-parts">
        {parts.map(([k, v]) => <span key={k} className="pl-line"><span className="pl-k">{k}</span> {v}</span>)}
        {r.does === 'factory' && untaxed && <span className="pl-line pl-up">Picked before its customs tax, which isn’t known here.</span>}
        {r.why && <span className="pl-line pl-why">{r.why}.</span>}
        {noLevel && <span className="pl-line pl-up">No Command Center Upgrades level fits it on this planet: {r.extracts.some((e) => e.rate && e.rate.heads > 0) ? 'the heads its rate was measured with are more than this layout leaves room for' : 'its factories are more than the planet holds'}.</span>}
      </div>
    </div>
  );
}

/** Where an input is bought (Ruling T11-7): the home hub, Jita, or both, with how many at Jita when it's both. */
function boughtWhere(b: Bought, perDay: number): string {
  const w = b.where ?? [];
  if (w.length === 2) { const j = boughtAtJita(b, perDay); return `the home hub and Jita (${aDay(perDay - j)} at the home hub, ${aDay(j)} at Jita)`; }
  return w[0] === 'home' ? 'the home hub' : 'Jita';
}

/** Weeks between, said: "1.2 weeks", "56 weeks", "2.1 years". */
function weeksSaid(w: number): string {
  if (w >= 104) return `${+(w / 52).toFixed(1)} years`;
  const n = w < 10 ? +w.toFixed(1) : Math.round(w);
  // "one every week", never "one every 1 weeks" (N2).
  return n === 1 ? 'week' : `${n} weeks`;
}
/** A rate a week: under one, said as time between (m2), as Industry says a slot's day. */
const perWeekSaid = (x: number) => (!(x > 0) ? '0' : x < 1 ? `one every ${weeksSaid(1 / x)}` : (+x.toFixed(1)).toLocaleString('en-US'));

/**
 * A setup's upkeep as tiles (Ruling T11-4): resets; restocks on what's brought in and what's made, across its factory planets; the
 * m³ hauled to market and brought in (and how much of that from Jita); freight contracts each way, "at least" one a week once a
 * week's m³ is over the route's batch (no contract's size is known), else time between; customs.
 */
function upkeepTiles(s: Setup) {
  const u = s.upkeep;
  const factories = s.roles.filter((r) => r.does === 'factory').length;
  const dirs = [
    { to: 'to Jita', m3: u.jitaM3PerWeek, c: u.contractsPerWeek },
    { to: 'from Jita', m3: u.jitaInM3PerWeek, c: u.contractsInPerWeek },
  ].filter((d): d is { to: string; m3: number; c: number } => d.m3 > 0 && d.c != null && d.c > 0);
  const full = dirs.filter((d) => d.c >= 1 - 1e-9).length;
  const fewer = dirs.reduce((t, d) => t + d.c, 0);
  const freightV = u.contractsPerWeek == null ? '–' : !dirs.length ? 'none' : full ? `at least ${full}` : `one every ${weeksSaid(1 / fewer)}`;
  const freightN = u.contractsPerWeek == null ? 'no freight route to Jita picked' : !dirs.length ? 'nothing goes to or from Jita'
    : `${dirs.map((d) => `${units(d.m3)} m³ ${d.to}${d.c < 1 - 1e-9 ? ` (one contract every ${weeksSaid(1 / d.c)})` : ''}`).join(', ')}${full ? `: one contract a week${full > 1 ? ' each way' : ''} at the least, more if one can’t carry it` : ''}`;
  return [
    { l: 'Resets a week', v: perWeekSaid(u.resetsPerWeek), n: u.resetsPerWeek > 0 ? 'a program each extraction planet, at the length chosen' : 'none: it has no extractors' },
    ...(u.restocksPerWeek > 0 ? [{ l: 'Restocks a week', v: perWeekSaid(u.restocksPerWeek),
      n: `a launchpad (10,000 m³) emptied and refilled, on what comes in and what it makes${factories > 1 ? `, across ${factories} factory planets` : ''}` }] : []),
    { l: 'Hauled a week', v: `${units(u.haulM3PerWeek)} m³`, n: 'from the planets to market' },
    ...(u.inM3PerWeek > 0 ? [{ l: 'Brought in a week', v: `${units(u.inM3PerWeek)} m³`,
      n: `to the factory planets, ${u.jitaInM3PerWeek >= u.inM3PerWeek - 1e-6 ? 'all of it bought at Jita' : u.jitaInM3PerWeek > 0 ? `${units(u.jitaInM3PerWeek)} m³ of it bought at Jita` : 'all of it bought at the home hub'}` }] : []),
    { l: 'Freight a week', v: freightV, n: freightN },
    { l: 'Customs a day', v: s.taxDay == null ? '–' : iskBig(s.taxDay), n: s.taxDay == null ? 'some planets’ tax isn’t known' : 'export and import, every planet' },
  ];
}

/**
 * What to train so the planets that don't fit do, grouped by level, each level naming only the planets it fixes ("To fit 5-NZNW II
 * as planned, train Command Center Upgrades V"); null when no planet a level would fix. A planet no level fixes says so on its line.
 */
function trainSaid(roles: Role[], pname: (id: number) => string): string | null {
  const by = new Map<string, string[]>();
  for (const r of roles) if (r.fit && !r.fit.fits && r.lacks) by.set(r.lacks, [...(by.get(r.lacks) ?? []), pname(r.planetId)]);
  if (!by.size) return null;
  return [...by.entries()].map(([lv, ps], i) => `${i ? 'to' : 'To'} fit ${listSaid(ps)} as planned, train ${lv}`).join('; ');
}

/** The planets a setup leaves unused, grouped by why, so one reason isn't said once a planet. */
function unusedSaid(unused: Role[], pname: (id: number) => string): string {
  const by = new Map<string, string[]>();
  for (const r of unused) { const w = r.why ?? 'not needed'; by.set(w, [...(by.get(w) ?? []), pname(r.planetId)]); }
  return [...by.entries()].map(([w, ps]) => `${listSaid(ps)}: ${w.charAt(0).toLowerCase()}${w.slice(1)}`).join('. ');
}
