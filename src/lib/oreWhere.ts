// Where in New Eden each ore is found, and the rule that ranks ores for one place. Pure: no React, no DOM, no ./config.
//
// Every entry is transcribed from the 1 October 2026 research (EVE University's Asteroids and ore, Ice harvesting and
// Moon mining pages; CCP's Catalyst and 23.01 notes), never from memory. Where the sources disagree the entry says so in
// `disputed` rather than picking a side. The belt tables are by region quarter and null-sec security class, so `where`
// says that in words; it shows in a table cell, and anything longer is in `detail` for the row's tip.

import { median } from './mining';
import { oreBase } from './miningFits';

export type Place = 'highsec' | 'lowsec' | 'nullsec' | 'pochven' | 'wormhole' | 'moon' | 'ice';

export const PLACES: { key: Place; label: string }[] = [
  { key: 'highsec', label: 'High-sec' },
  { key: 'lowsec', label: 'Low-sec' },
  { key: 'nullsec', label: 'Null-sec' },
  { key: 'pochven', label: 'Pochven' },
  { key: 'wormhole', label: 'Wormholes' },
  { key: 'moon', label: 'Moons' },
  { key: 'ice', label: 'Ice' },
];

export type How = 'belt' | 'anomaly' | 'rare' | 'sov' | 'drill' | 'ice belt';

export type Found = { place: Place; how: How; where: string; detail?: string };

export type OreWhere = { kind: 'asteroid' | 'moon' | 'ice'; found: Found[]; disputed?: string };

const f = (place: Place, how: How, where: string, detail?: string): Found => (detail ? { place, how, where, detail } : { place, how, where });

// Shared wording.
const BORDER_HIGH = f('highsec', 'rare', 'Rare anomalies in 0.5 systems bordering low-sec', 'The Empire Border Rare Asteroids anomaly; it can also border null-sec.');
const BORDER_NULL = f('nullsec', 'rare', 'Rare anomalies on null-sec and low-sec borders, and at blue (A0) stars', 'Nullsec Border Rare Asteroids and the Blue A0 Rare Asteroids sites.');
const A0_WORMHOLE = f('wormhole', 'rare', 'Rare anomalies at a blue (A0) star', 'W-Space Blue A0 Rare Asteroids.');
const WORMHOLE_SITES = (types?: string) => f('wormhole', 'anomaly', types ? `Wormhole sites: ${types}` : 'Wormhole sites', 'From EVE University’s Wormhole sites page.');
const ALL_WH_SITES = WORMHOLE_SITES('Perimeter, Frontier, Core and Shattered');
const SOV = (array: string, tiers?: string) => f('nullsec', 'sov', `Sov upgrade: ${array}${tiers ? ` (${tiers})` : ''}`, 'Added with the 2024 sov overhaul (patch 22.01, 30 October 2024): a deposit that comes with the upgrade.');
const POCHVEN = f('pochven', 'anomaly', 'Anomalies in Pochven: border, internal and home systems', 'Quality climbs from border to internal to home systems; home systems give the best yield. There are no belts in Pochven.');

const RARE_NULL_DISPUTE = 'EVE University’s array text still says arrays give Crokite, but its post-Equinox array list leaves it out; its null-sec presence is only in the border and blue-star rare sites.';
const PRE_EQUINOX = 'EVE University labels this ore’s null-sec anomalies "Pre-Equinox" and does not say whether they survived the sov overhaul; its belt table is stated plainly.';
const HIGHSEC_MOON = 'EVE University’s rarity table ticks high-sec for R4 moon ores, but its text says a refinery anchors in "0.5 space or below" and its Metenox page says low-sec, null-sec and wormholes only. High-sec moon mining is not confirmed.';
const LOWSEC_ICE = 'EVE University’s table puts this ice at 0.0 and lower (null-sec), but its text says standard ice is in "low-sec and nullsec". Low-sec presence is unclear.';

const moonR = (rarity: string, where: string): Found =>
  f('moon', 'drill', where, `${rarity}. Mined only from a moon drill, never from a belt. The security bands are EVE University’s rarity table; Pochven is not mentioned.`);
const UBIQUITOUS = moonR('Ubiquitous (R4)', 'Moon drills in low-sec, null-sec and wormholes (Metenox)');
const COMMON = moonR('Common (R8)', 'Moon drills in low-sec and null-sec only');
const UNCOMMON = moonR('Uncommon (R16)', 'Moon drills in low-sec and null-sec only');
const RARE = moonR('Rare (R32)', 'Moon drills in low-sec and null-sec only');
const EXCEPTIONAL = moonR('Exceptional (R64)', 'Moon drills in low-sec and null-sec only');
const moon = (found: Found, disputed?: string): OreWhere => (disputed ? { kind: 'moon', found: [found], disputed } : { kind: 'moon', found: [found] });

const ice = (where: string, detail: string, disputed?: string): OreWhere => {
  const o: OreWhere = { kind: 'ice', found: [f('ice', 'ice belt', where, detail)] };
  if (disputed) o.disputed = disputed;
  return o;
};
const FACTION_ICE = 'Only in a few systems with ice belts (one to three each). EVE University’s table lists it at "1.0 and lower" and gives no high-sec floor, so which empire systems hold it is not in the sources.';
const ENRICHED_ICE = 'Also in Shattered Ice Fields in Shattered wormholes.';

export const ORE_WHERE: Record<string, OreWhere> = {
  Veldspar: {
    kind: 'asteroid',
    found: [
      f('highsec', 'belt', 'Belts in every quarter, 1.0 to 0.5', 'Starter and career-agent systems also have a gated Managed Asteroid Belt (Catalyst), and Catalyst adds Veldspar deposits to Faction Warfare headquarters systems; its wording on where is vague. Not in low-sec belts.'),
      f('nullsec', 'sov', 'Sov upgrade: Tritanium Prospecting Array', 'Removed from null-sec belts on 17 December 2019; now only by a sov upgrade.'),
    ],
  },
  Scordite: { kind: 'asteroid', found: [f('highsec', 'belt', 'Belts in every quarter, 1.0 to 0.5', 'Not in the low-sec or null-sec belt tables.')] },
  Pyroxeres: {
    kind: 'asteroid',
    found: [
      f('highsec', 'belt', 'Amarr and Caldari space, 0.9 to 0.5', 'Not in Gallente or Minmatar high-sec, and none in 1.0 systems.'),
      f('lowsec', 'belt', 'Amarr and Caldari space, 0.4 to 0.1'),
      f('nullsec', 'belt', 'Null-sec belts by security class: H and J at 0.0 and lower, G at -0.4, F at -0.7', 'The class is a property of the system, so you need to know it.'),
      ALL_WH_SITES,
    ],
  },
  Plagioclase: {
    kind: 'asteroid',
    found: [f('highsec', 'belt', 'Gallente and Minmatar space, 0.9 to 0.5; Caldari space at 0.7 and below', 'Not in Amarr space. No low-sec Plagioclase in the table.')],
  },
  Mordunium: {
    kind: 'asteroid',
    found: [
      f('highsec', 'rare', 'Rare small deposits in 0.5 systems bordering low-sec'),
      f('lowsec', 'rare', 'Rare deposits in low-sec outside Faction Warfare'),
      f('nullsec', 'sov', 'Sov upgrade: Pyerite Prospecting Array', 'Also in the null-sec border and blue-star rare sites.'),
      A0_WORMHOLE,
    ],
    disputed: 'CCP’s 31 July 2025 notes put the small deposit in low-sec and the medium in 0.5 border systems; the 1 August fix says they were flipped. Read as the fix and EVE University have it.',
  },
  Hedbergite: {
    kind: 'asteroid',
    found: [
      f('lowsec', 'belt', 'Caldari and Minmatar space, 0.2 to 0.1'),
      f('lowsec', 'anomaly', 'Hedbergite, Hemorphite and Jaspet anomalies', 'EVE University lists them in low-sec.'),
      f('nullsec', 'sov', 'Sov upgrade: Pyerite Prospecting Array (Mordunium Deposit)', 'A companion ore in the Mordunium Deposit.'),
    ],
  },
  Hemorphite: {
    kind: 'asteroid',
    found: [f('lowsec', 'belt', 'Amarr and Gallente space, 0.2 to 0.1'), f('lowsec', 'anomaly', 'Hedbergite, Hemorphite and Jaspet anomalies')],
  },
  Jaspet: {
    kind: 'asteroid',
    found: [f('lowsec', 'belt', 'Amarr and Gallente space, 0.4 to 0.1'), f('lowsec', 'anomaly', 'Jaspet and mixed anomalies')],
  },
  Kernite: {
    kind: 'asteroid',
    found: [
      f('highsec', 'rare', 'Rare anomalies, 0.5 to 0.8', 'Kernite and Omber anomalies returned to high-sec with Catalyst (CCP, 14 November 2025). Not in high-sec belts.'),
      f('lowsec', 'belt', 'Amarr, Caldari and Minmatar space, 0.4 to 0.1'),
      f('nullsec', 'belt', 'Null-sec belts by security class: G at 0.0 and lower, H at -0.5, I at -0.9'),
      WORMHOLE_SITES(),
    ],
  },
  Omber: {
    kind: 'asteroid',
    found: [
      f('highsec', 'rare', 'Rare anomalies, 0.5 to 0.8', 'Omber and Kernite-and-Omber anomalies returned to high-sec with Catalyst (CCP, 14 November 2025). Not in high-sec belts.'),
      f('lowsec', 'belt', 'Gallente and Minmatar space, 0.4 to 0.1'),
      WORMHOLE_SITES(),
    ],
  },
  Ytirium: { kind: 'asteroid', found: [BORDER_HIGH, BORDER_NULL, A0_WORMHOLE] },
  Eifyrium: { kind: 'asteroid', found: [BORDER_HIGH, BORDER_NULL, A0_WORMHOLE] },
  Ducinium: { kind: 'asteroid', found: [BORDER_HIGH, BORDER_NULL, A0_WORMHOLE] },
  Griemeer: { kind: 'asteroid', found: [SOV('Isogen Prospecting Array', 'tier 2')] },
  Nocxite: { kind: 'asteroid', found: [SOV('Nocxium Prospecting Array', 'tier 2')] },
  Kylixium: { kind: 'asteroid', found: [SOV('Mexallon Prospecting Array', 'tier 2')] },
  Hezorime: { kind: 'asteroid', found: [SOV('Zydrine Prospecting Array', 'tiers 1 to 3')] },
  Ueganite: { kind: 'asteroid', found: [SOV('Megacyte Prospecting Array', 'tiers 1 to 3')] },
  Crokite: {
    kind: 'asteroid',
    found: [
      f('lowsec', 'anomaly', 'Crokite and Dark Ochre anomalies', 'Also Crokite, Dark Ochre and Gneiss anomalies.'),
      f('nullsec', 'rare', 'Rare anomalies on null-sec borders and at blue (A0) stars', 'Not in the null-sec belt table.'),
    ],
    disputed: RARE_NULL_DISPUTE,
  },
  'Dark Ochre': {
    kind: 'asteroid',
    found: [
      f('lowsec', 'anomaly', 'Dark Ochre and Gneiss anomalies', 'Also Crokite and Dark Ochre anomalies, and with Gneiss.'),
      f('nullsec', 'rare', 'Rare anomalies on null-sec borders and at blue (A0) stars', 'IV-Grade there. Not in belts.'),
    ],
  },
  Gneiss: {
    kind: 'asteroid',
    found: [f('lowsec', 'anomaly', 'Low-sec anomalies: small, hidden, average and large', 'Not in the null-sec belt table.'), ALL_WH_SITES],
  },
  Arkonor: {
    kind: 'asteroid',
    found: [
      f('nullsec', 'belt', 'Null-sec belts by security class: F at -0.6, I at -0.7, J at -0.9', 'Dronelands (class K) belts have it too; the threshold varies by region.'),
      WORMHOLE_SITES('Perimeter, Frontier and Core'),
    ],
    disputed: PRE_EQUINOX,
  },
  Bistot: {
    kind: 'asteroid',
    found: [
      f('nullsec', 'belt', 'Null-sec belts by security class: F and J at -0.5, G at -0.6, H at -0.9', 'Dronelands (class K) belts vary.'),
      WORMHOLE_SITES(),
    ],
    disputed: PRE_EQUINOX,
  },
  Spodumain: {
    kind: 'asteroid',
    found: [POCHVEN],
  },
  Bezdnacine: { kind: 'asteroid', found: [POCHVEN] },
  Rakovene: { kind: 'asteroid', found: [POCHVEN] },
  Talassonite: { kind: 'asteroid', found: [POCHVEN] },
  Mercoxit: {
    kind: 'asteroid',
    found: [
      f('nullsec', 'belt', 'Null-sec belts at -0.8 and lower in every class (Dronelands from about -0.5)', 'The class-K threshold depends on the region. Needs Deep Core Mining.'),
      f('nullsec', 'sov', 'Mercoxit deposits beside sov arrays'),
      f('pochven', 'anomaly', 'Anomalies in Pochven home systems only'),
    ],
  },
  Zeolites: moon(UBIQUITOUS, HIGHSEC_MOON),
  Sylvite: moon(UBIQUITOUS, HIGHSEC_MOON),
  Bitumens: moon(UBIQUITOUS, HIGHSEC_MOON),
  Coesite: moon(UBIQUITOUS, HIGHSEC_MOON),
  Cobaltite: moon(COMMON),
  Euxenite: moon(COMMON),
  Titanite: moon(COMMON),
  Scheelite: moon(COMMON),
  Otavite: moon(UNCOMMON),
  Sperrylite: moon(UNCOMMON),
  Vanadinite: moon(UNCOMMON),
  Chromite: moon(UNCOMMON),
  Carnotite: moon(RARE),
  Zircon: moon(RARE),
  Pollucite: moon(RARE),
  Cinnabar: moon(RARE),
  Xenotime: moon(EXCEPTIONAL),
  Monazite: moon(EXCEPTIONAL),
  Loparite: moon(EXCEPTIONAL),
  Ytterbite: moon(EXCEPTIONAL),
  'Clear Icicle': ice('Amarr space ice belts, in a few systems', FACTION_ICE),
  'White Glaze': ice('Caldari space ice belts, in a few systems', FACTION_ICE),
  'Blue Ice': ice('Gallente space ice belts, in a few systems', FACTION_ICE),
  'Glacial Mass': ice('Minmatar space ice belts, in a few systems', FACTION_ICE),
  'Enriched Clear Icicle': ice('Amarr-quarter null-sec ice belts, 0.0 and lower', ENRICHED_ICE),
  'Pristine White Glaze': ice('Caldari-quarter null-sec ice belts, 0.0 and lower', ENRICHED_ICE),
  'Thick Blue Ice': ice('Gallente-quarter null-sec ice belts, 0.0 and lower', ENRICHED_ICE),
  'Smooth Glacial Mass': ice('Minmatar-quarter null-sec ice belts, 0.0 and lower', ENRICHED_ICE),
  'Glare Crust': ice('Ice belts in every quarter, 0.4 and lower', 'Standard ice. Also in Shattered Ice Fields in wormholes.'),
  'Dark Glitter': ice('Ice belts in every quarter, 0.1 and lower', 'Standard ice. Also in Shattered Ice Fields in wormholes.'),
  Gelidus: ice('Ice belts in null-sec, 0.0 and lower', 'Standard ice. Also in Shattered Ice Fields in wormholes.', LOWSEC_ICE),
  Krystallos: ice('Ice belts in null-sec, 0.0 and lower', 'Standard ice. Also in Shattered Ice Fields in wormholes.', LOWSEC_ICE),
};

export const ORE_WHERE_SOURCE: { name: string; url: string; read: string; caveat: string }[] = [
  {
    name: 'EVE University: Asteroids and ore',
    url: 'https://wiki.eveuniversity.org/Asteroids_and_ore',
    read: '1 October 2026',
    caveat: 'Carries a banner saying it needs an overhaul for Catalyst, and no second source confirms its belt tables.',
  },
  {
    name: 'EVE University: Ice harvesting',
    url: 'https://wiki.eveuniversity.org/Ice_harvesting',
    read: '1 October 2026',
    caveat: 'Last updated 7 November 2025; a banner asks for review against the December 2021 mining changes.',
  },
  {
    name: 'EVE University: Moon mining',
    url: 'https://wiki.eveuniversity.org/Moon_mining',
    read: '1 October 2026',
    caveat: 'Its rarity table and its text disagree about high-sec, and it does not mention Pochven.',
  },
  {
    name: 'CCP: Catalyst expansion notes',
    url: 'https://www.eveonline.com/news/view/catalyst-expansion-notes',
    read: '1 October 2026',
    caveat: 'Kernite and Omber return to high-sec anomalies (14 November 2025); the wording on Faction Warfare headquarters is vague.',
  },
  {
    name: 'CCP: Patch notes 23.01',
    url: 'https://www.eveonline.com/news/view/patch-notes-version-23-01',
    read: '1 October 2026',
    caveat: 'Added Mordunium on 31 July 2025; its small and medium locations were flipped, fixed on 1 August.',
  },
];

export type OreRow = { base: string; iskPerM3: number | null; iskPerHour: number | null };

/**
 * The rows found in `place`, best first: by ISK an hour when every one of them has it, else by ISK a m³. Rows
 * with no figure for the one used come last, in name order; ties go to the name.
 */
export function rankOres(rows: OreRow[], place: Place): OreRow[] {
  const here = rows.filter((r) => ORE_WHERE[r.base]?.found.some((x) => x.place === place));
  const byHour = here.length > 0 && here.every((r) => r.iskPerHour != null);
  const val = (r: OreRow) => (byHour ? r.iskPerHour : r.iskPerM3);
  return here.slice().sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x == null || y == null) return x == null && y == null ? (a.base < b.base ? -1 : a.base > b.base ? 1 : 0) : x == null ? 1 : -1;
    return y - x || (a.base < b.base ? -1 : a.base > b.base ? 1 : 0);
  });
}

// --- ISK an hour: which pace a row can take ------------------------------------------------------------------------------

/**
 * What mines a row, for its pace: ordinary ore (asteroid or moon: one fit's lasers mine them all), Mercoxit (deep-core
 * lasers only) or ice (an ice harvester, a block a cycle). A crystal of one kind mines every family alike (ESI, 1 October
 * 2026: Type A II is 1.8× yield, 1.0× cycle and 3.6 residue points for Simple, Complex, Abyssal and Rare Moon; Type B II
 * 1.8×, 0.8×, 30 for Simple, Variegated and Ubiquitous Moon), so one ore fit's m³ a minute holds for every ore but Mercoxit.
 */
export type OreKind = 'ore' | 'mercoxit' | 'ice';

/** A row's kind, by its base (an ice type is its own base); null for a name the table doesn't know. */
export function kindOfBase(base: string): OreKind | null {
  const o = ORE_WHERE[base];
  return !o ? null : o.kind === 'ice' ? 'ice' : base === 'Mercoxit' ? 'mercoxit' : 'ore';
}

/** A mined type's kind by its name ("Scordite II-Grade", "Brimful Zeolites", "Clear Icicle"); null when it isn't one. */
export function kindOfName(name: string): OreKind | null {
  const n = name.trim();
  if (ORE_WHERE[n]?.kind === 'ice') return 'ice';
  const b = oreBase(n);
  return b ? kindOfBase(b) : null;
}

/**
 * A session's kind from its ores' names: the one kind they all are, else null (two kinds in one session, or a name not
 * read yet): its pace says nothing certain about either.
 */
export function sessionKind(names: (string | null | undefined)[]): OreKind | null {
  const kinds = new Set(names.map((n) => (n ? kindOfName(n) : null)));
  if (kinds.size !== 1) return null;
  return [...kinds][0];
}

/** The tier Scaling up shows: its m³ a minute at the shown character's skills, and what it can mine. */
export type FitPace = {
  from: 'fit';
  /** "Hulk", "Solid", and whose skills it's at: "at your skills", "at Miner Two’s skills", "with every skill at V". */
  hull: string; tier: string; at: string;
  /** Null while it's worked out, or for a fit that mines only with its drones (`drones`). */
  m3PerMin: number | null; drones: boolean;
  /** An ice harvester's fit; the Mercoxit version of a fit (deep-core lasers). */
  ice: boolean; mercoxit: boolean;
};
/** What sessions measured, one kind at a time: in the ship the pilot is in when it has any there, else in any. */
export type MeasuredPace = { m3PerMin: number; sessions: number; ship: number | null };
export type Measured = { from: 'measured'; by: Partial<Record<OreKind, MeasuredPace>> };
export type Pace = FitPace | Measured;

/** Why a row has no ISK an hour; the words are the panel's. */
export type NoPace = 'none' | 'loading' | 'drones' | 'fitIsIce' | 'fitIsOre' | 'fitIsMercoxit' | 'needMercoxit' | 'notMeasured';
export type RowPace = { m3PerMin: number } | { m3PerMin: null; why: NoPace };

/**
 * The m³ a minute a row of `kind` is worked out at, or why there's none: a fit mines only its own kind (an ore fit no ice,
 * an ice fit no ore, Mercoxit only its deep-core version, which then speaks for no other ore), and a measured pace only
 * the kind its sessions mined. Never a pace the row's ore can't be mined at.
 */
export function paceFor(kind: OreKind, pace: Pace | null): RowPace {
  const no = (why: NoPace): RowPace => ({ m3PerMin: null, why });
  if (!pace) return no('none');
  if (pace.from === 'measured') {
    const m = pace.by[kind];
    return m ? { m3PerMin: m.m3PerMin } : no('notMeasured');
  }
  if (pace.ice !== (kind === 'ice')) return no(pace.ice ? 'fitIsIce' : 'fitIsOre');
  if (kind === 'mercoxit' && !pace.mercoxit) return no('needMercoxit');
  if (kind === 'ore' && pace.mercoxit) return no('fitIsMercoxit');
  if (pace.m3PerMin == null) return no(pace.drones ? 'drones' : 'loading');
  return { m3PerMin: pace.m3PerMin };
}

/**
 * The pace sessions measured for each kind: the middle of that kind's sessions in `here` (the ship the pilot is in) when
 * there are any, else of all its sessions; the sessions given are the ones long enough to say a pace. Sessions whose
 * kind isn't known are left out.
 */
export function measuredByKind(sessions: { ship: number | null; kind: OreKind | null; m3PerMin: number }[], here: number | null): Partial<Record<OreKind, MeasuredPace>> {
  const out: Partial<Record<OreKind, MeasuredPace>> = {};
  for (const kind of ['ore', 'mercoxit', 'ice'] as OreKind[]) {
    const all = sessions.filter((s) => s.kind === kind);
    const inHere = here != null ? all.filter((s) => s.ship === here) : [];
    const use = inHere.length ? inHere : all;
    const m = median(use.map((s) => s.m3PerMin));
    if (m != null) out[kind] = { m3PerMin: m, sessions: use.length, ship: inHere.length ? here : null };
  }
  return out;
}
