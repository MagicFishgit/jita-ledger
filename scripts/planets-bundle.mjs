// Planetary Interaction's static data, trimmed for the app: ESI serves no schematic inputs, pin costs, command centre
// levels or planet radii, so they come from CCP's static data (SDE). Run after a game update changes PI:
//
//   node scripts/planets-bundle.mjs <folder>
//   SDE_ZIP=<a build's JSONL zip> node scripts/planets-bundle.mjs     (that build, already downloaded; nothing fetched)
//
// Writes three files (types in src/lib/piBundle.ts):
// src/data/planets.json: { build, released, commodities, schematics, planetTypes, link, maxHeads, extraction }
//   commodities: every P0-P4 good [{ id, name, tier, volume, taxBase }] (groups 1032/1033/1035 P0, 1042 P1, 1034 P2, 1040 P3,
//     1041 P4; taxBase is exportTaxMultiplier); schematics: planetSchematics.jsonl with the facility and the planet types
//     whose pins can run it; planetTypes: each of the eight PI planet types' P0 (group 1026's harvesterType), command centre
//     levels 0-5 (group 1027: cpuOutput, powerOutput) and pins (1028 factories, 1029 storage, 1030 launchpads, 1063 ECUs:
//     cpuLoad, powerLoad, capacity, ecuExtractorHeadCPU / Power); link: type 2280's cpuLoad, powerLoad and per-km loads.
// src/data/planetRadii.json: { "<systemId>": [firstId, v0, delta id1, v1, ...] } the planets of the eight PI types only,
//   sorted by ID, ids delta-encoded (the plain pairs were 1.21 MB raw, 362 KB gzipped). Each v is the radius in whole km times
//   ten plus the planet's type, an index into PI_TYPE_IDS (its last digit): the smallest gzipped of the encodings tried for the
//   system finder (24 October 2026; a third number a planet, the type ID, the radius times eight, a type string a system).
// src/data/planetRegions.json: [[regionId, name, [firstSystemId, delta id1, ...], names?, securities?], ...] every region with a
//   system holding PI planets, sorted by ID, its systems those of planetRadii.json, sorted and delta-encoded. A region with a system
//   no stargate reaches (wormhole space, and the closed Jove regions) carries every system's name and security (to 3 decimals, as
//   the stargate map rounds them) in the same order, since the stargate map (universeGraph.json) has neither for them.
// Every list is sorted, so a rebuild of the same SDE build changes nothing.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

const [dir] = process.argv.slice(2);
const given = process.env.SDE_ZIP;
if (!dir && !given) { console.error('usage: node scripts/planets-bundle.mjs <folder for the SDE zip>, or SDE_ZIP=<zip> node scripts/planets-bundle.mjs'); process.exit(1); }
const SDE = 'https://developers.eveonline.com/static-data/tranquility';
const HEADERS = { 'User-Agent': 'jita-ledger' };

const latest = given ? null : JSON.parse((await (await fetch(`${SDE}/latest.jsonl`, { headers: HEADERS })).text()).trim().split('\n')[0]);
const zipPath = given ?? path.join(dir, `eve-online-static-data-${latest.buildNumber}-jsonl.zip`);
if (!fs.existsSync(zipPath)) {
  if (given) throw new Error(`${given} isn't there`);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`downloading build ${latest.buildNumber}…`);
  const res = await fetch(`${SDE}/eve-online-static-data-${latest.buildNumber}-jsonl.zip`, { headers: HEADERS });
  if (!res.ok) throw new Error(`the SDE zip answered ${res.status}`);
  fs.writeFileSync(`${zipPath}.part`, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(`${zipPath}.part`, zipPath);
}

// A zip's members, from its central directory (every SDE member is deflated, method 8; stored ones are read as they are).
const zip = fs.readFileSync(zipPath);
const members = new Map();
{
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error(`${zipPath} isn't a zip`);
  let at = zip.readUInt32LE(eocd + 16);
  const count = zip.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('a broken central directory');
    const method = zip.readUInt16LE(at + 10), size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28), extraLen = zip.readUInt16LE(at + 30), commentLen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    members.set(zip.toString('utf8', at + 46, at + 46 + nameLen), { method, size, local });
    at += 46 + nameLen + extraLen + commentLen;
  }
}
async function* lines(name) {
  const m = members.get(name);
  if (!m) throw new Error(`${name} isn't in the zip`);
  const start = m.local + 30 + zip.readUInt16LE(m.local + 26) + zip.readUInt16LE(m.local + 28);
  const raw = Readable.from([zip.subarray(start, start + m.size)]);
  const input = m.method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
  for await (const l of readline.createInterface({ input, crlfDelay: Infinity })) if (l.trim()) yield JSON.parse(l);
}
const all = async (name) => { const out = new Map(); for await (const r of lines(name)) out.set(r._key, r); return out; };


// Two figures aren't in the SDE.
/** Shortest link a planet takes, as a share of its radius: EVE University's "experimental testing" (Planetary Industry, edited 4
 *  Sep 2025), as .playwright-mcp/research/planets/mechanics.md gives it. */
const MIN_LINK_KM_PER_RADIUS_KM = 0.012008578;
/** Heads an extractor control unit takes at most: CCP, Planetary Interaction changes brought with Incursion 1.1.0, 28 January 2011. */
const MAX_HEADS = 10;

const PLANETS = { 11: 'Temperate', 12: 'Ice', 13: 'Gas', 2014: 'Oceanic', 2015: 'Lava', 2016: 'Barren', 2017: 'Storm', 2063: 'Plasma' };
/** The planet types in planetRadii.json's last digit, in this order: src/lib/piBundle.ts's PI_TYPE_IDS is the same list. */
const PI_TYPE_IDS = [11, 12, 13, 2014, 2015, 2016, 2017, 2063];
const TIER = { 1032: 'P0', 1033: 'P0', 1035: 'P0', 1042: 'P1', 1034: 'P2', 1040: 'P3', 1041: 'P4' };
const FACILITY = { 'Basic Industry Facility': 'basic', 'Advanced Industry Facility': 'advanced', 'High-Tech Production Plant': 'hightech' };

let sde = null;
for await (const s of lines('_sde.jsonl')) sde = s;
const types = await all('types.jsonl');
const attrs = await all('dogmaAttributes.jsonl');
const dogma = await all('typeDogma.jsonl');
const av = (id) => {
  const out = {};
  for (const a of dogma.get(id)?.dogmaAttributes ?? []) { const n = attrs.get(a.attributeID)?.name; if (n) out[n] = a.value; }
  return out;
};
const name = (id) => types.get(id).name.en;
const need = (v, what) => { if (v == null) throw new Error(`${what} isn't in the SDE`); return v; };

const commodities = [];
for (const [id, t] of types) {
  const tier = TIER[t.groupID];
  if (!tier) continue;
  commodities.push({ id, name: name(id), tier, volume: need(t.volume, `${name(id)}'s volume`), taxBase: need(av(id).exportTaxMultiplier, `${name(id)}'s tax`) });
}
commodities.sort((a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name) || a.id - b.id);
const tierOf = new Map(commodities.map((c) => [c.id, c.tier]));

const p0 = {}, cc = {}, pins = {};
for (const pt of Object.values(PLANETS)) { p0[pt] = new Set(); cc[pt] = []; pins[pt] = {}; }
const planetOf = (id) => PLANETS[need(av(id).planetRestriction, `${name(id)}'s planet`)];
for (const [id, t] of types) {
  const g = t.groupID;
  if (g === 1026) { const a = av(id); if (a.planetRestriction != null) p0[PLANETS[a.planetRestriction]].add(a.harvesterType); continue; }
  if (![1027, 1028, 1029, 1030, 1063].includes(g)) continue;
  const a = av(id), pt = PLANETS[a.planetRestriction];
  if (!pt) continue;
  if (g === 1027) { cc[pt][a.metaLevelOld ?? 0] = { level: a.metaLevelOld ?? 0, cpu: a.cpuOutput, pg: a.powerOutput }; continue; }
  const cost = { cpu: a.cpuLoad, pg: a.powerLoad };
  if (g === 1028) { const n = name(id); pins[pt][n.includes('Basic') ? 'basic' : n.includes('Advanced') ? 'advanced' : 'hightech'] = cost; }
  else if (g === 1029) pins[pt].storage = { ...cost, capacity: t.capacity };
  else if (g === 1030) pins[pt].launchpad = { ...cost, capacity: t.capacity };
  else pins[pt].ecu = { ...cost, headCpu: need(a.ecuExtractorHeadCPU, 'a head CPU'), headPg: need(a.ecuExtractorHeadPower, 'a head powergrid') };
}
const planetTypes = {};
for (const [typeId, pt] of Object.entries(PLANETS)) {
  const c = cc[pt];
  if (c.length !== 6 || c.some((x) => !x)) throw new Error(`${pt} lacks a command centre level`);
  for (const k of ['basic', 'advanced', 'storage', 'launchpad', 'ecu']) need(pins[pt][k], `${pt}'s ${k}`);
  planetTypes[pt] = { typeId: Number(typeId), p0: [...p0[pt]].sort((a, b) => a - b), cc: c, pins: { basic: pins[pt].basic, advanced: pins[pt].advanced, hightech: pins[pt].hightech ?? null, storage: pins[pt].storage, launchpad: pins[pt].launchpad, ecu: pins[pt].ecu } };
}

const schematics = [];
for await (const s of lines('planetSchematics.jsonl')) {
  const outs = s.types.filter((x) => !x.isInput), ins = s.types.filter((x) => x.isInput);
  if (outs.length !== 1) throw new Error(`schematic ${s._key} makes ${outs.length} goods`);
  const facs = new Set(s.pins.map((p) => FACILITY[name(p).split(' ').slice(1).join(' ')]));
  if (facs.size !== 1 || facs.has(undefined)) throw new Error(`schematic ${s._key} runs in ${[...facs]}`);
  schematics.push({
    id: s._key, name: s.name.en, tier: need(tierOf.get(outs[0]._key), 'a schematic output'), facility: [...facs][0], cycleSeconds: s.cycleTime,
    inputs: ins.map((x) => ({ id: x._key, qty: x.quantity })).sort((a, b) => a.id - b.id),
    out: { id: outs[0]._key, qty: outs[0].quantity },
    planetTypes: [...new Set(s.pins.map(planetOf))].sort(),
  });
}
schematics.sort((a, b) => a.id - b.id);

const lk = av(2280);
const link = { cpu: need(lk.cpuLoad, 'the link'), pg: need(lk.powerLoad, 'the link'), cpuPerKm: need(lk.cpuLoadPerKm, 'the link'), pgPerKm: need(lk.powerLoadPerKm, 'the link'), minKmPerRadiusKm: MIN_LINK_KM_PER_RADIUS_KM };
// The depletion decay and noise are the defaults of attributes 1683 (ecuDecayFactor) and 1687 (ecuNoiseFactor): no type carries them.
const extraction = { decay: need(attrs.get(1683)?.defaultValue, 'ecuDecayFactor'), noise: need(attrs.get(1687)?.defaultValue, 'ecuNoiseFactor') };

const planetsOut = { build: sde.buildNumber, released: sde.releaseDate, commodities, schematics, planetTypes, link, maxHeads: MAX_HEADS, extraction };

// Radii and types: per system, the planets of the eight PI types, sorted by ID, delta-encoded, radius × 10 + type.
const bySystem = new Map();
for await (const p of lines('mapPlanets.jsonl')) {
  if (!PLANETS[p.typeID]) continue;
  if (!bySystem.has(p.solarSystemID)) bySystem.set(p.solarSystemID, []);
  bySystem.get(p.solarSystemID).push([p._key, Math.round(p.radius / 1000), PI_TYPE_IDS.indexOf(p.typeID)]);
}
const radii = {};
for (const sys of [...bySystem.keys()].sort((a, b) => a - b)) {
  const ps = bySystem.get(sys).sort((a, b) => a[0] - b[0]);
  const row = [];
  ps.forEach(([id, km, t], i) => row.push(i ? id - ps[i - 1][0] : id, km * 10 + t));
  radii[sys] = row;
}

// Regions: every region holding a system of radii, its systems sorted and delta-encoded; names and securities where a system has no gate.
const regionNames = new Map();
for await (const r of lines('mapRegions.jsonl')) regionNames.set(r._key, r.name.en);
const byRegion = new Map();
const sysInfo = new Map();
for await (const s of lines('mapSolarSystems.jsonl')) {
  if (!bySystem.has(s._key)) continue;
  sysInfo.set(s._key, { name: s.name.en, security: Math.round(s.securityStatus * 1000) / 1000, gated: (s.stargateIDs?.length ?? 0) > 0 });
  if (!byRegion.has(s.regionID)) byRegion.set(s.regionID, []);
  byRegion.get(s.regionID).push(s._key);
}
if ([...bySystem.keys()].some((id) => !sysInfo.has(id))) throw new Error('a system with planets isn’t in mapSolarSystems');
const regionsOut = [];
for (const reg of [...byRegion.keys()].sort((a, b) => a - b)) {
  const ss = byRegion.get(reg).sort((a, b) => a - b);
  const row = [reg, need(regionNames.get(reg), `region ${reg}’s name`), ss.map((id, i) => (i ? id - ss[i - 1] : id))];
  if (ss.some((id) => !sysInfo.get(id).gated)) row.push(ss.map((id) => sysInfo.get(id).name), ss.map((id) => sysInfo.get(id).security));
  regionsOut.push(row);
}

const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'data');
const a = JSON.stringify(planetsOut), r = JSON.stringify(radii), g = JSON.stringify(regionsOut);
fs.writeFileSync(path.join(out, 'planets.json'), a);
fs.writeFileSync(path.join(out, 'planetRadii.json'), r);
fs.writeFileSync(path.join(out, 'planetRegions.json'), g);
const gz = (s) => zlib.gzipSync(s).length;
console.log(`build ${sde.buildNumber}: planets.json ${a.length} B (${gz(a)} gzipped); planetRadii.json ${r.length} B (${gz(r)} gzipped), ${bySystem.size} systems; planetRegions.json ${g.length} B (${gz(g)} gzipped), ${regionsOut.length} regions`);
