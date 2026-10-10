// Industry's static data, trimmed for the app: ESI serves no blueprints, rigs, structure bonuses or station services, so
// they come from CCP's static data (SDE). Run after a game update changes blueprints:
//
//   node scripts/industry-bundle.mjs <folder>
//   SDE_ZIP=<a build's JSONL zip> node scripts/industry-bundle.mjs     (that build, already downloaded; nothing fetched)
//
// It reads the SDE's current build from developers.eveonline.com, downloads that build's JSONL zip into <folder> unless
// it's already there (User-Agent "jita-ledger"; ~99 MB), reads what it needs straight from the zip, and writes three files:
//
// src/data/industry.json (the Industry tab's own chunk; types in src/lib/industry.ts):
//   { build, released, source,
//     bps:        [bp, maxRuns, manufacturing, copying, researchMaterial, researchTime, invention][]   sorted by bp
//                 each activity 0 or [time, [[material, qty]], [[skill, level]], [[product, qty, probability?]]]
//     types:      { id: [name, group, category, packagedVolume, basePrice, mineable] }
//     groups:     { id: [name, category] }                   every group those types are in
//     filters:    { id: [name, categories[], groups[]] }      which products a rig helps (industryTargetFilters)
//     rigs:       [type, size, tech, [[activity, kind, filter]], [time, material, cost], [high, low, null]][]
//     structures: { type: [material, cost, time] }            Raitaru, Azbel, Sotiyo: dogma 2600, 2601, 2602
//     stations:   [station, system, services][]               services 1 a Factory, 2 a Laboratory, 3 both
//     skills:     { id: [rank, primary, secondary, bonusAttribute, bonus] } }
// src/data/industryEiv.json: { build, eiv: { bp: [[material, qty]] } }, every published blueprint's ME 0 manufacturing
//   materials: what a job's estimated item value is worked out from (stage 2 keeps a job's EIV at first sight).
// src/data/industryTypes.json: { build, watch: number[], bpos: number[] }, the type IDs the cloud reads for the tab: the
//   watch set (every Tech I product and its materials) and the blueprints whose NPC sellers the morning scan keeps.
//
// Which blueprints: every published blueprint on the market whose product is on the market too (Tech I and the 68 old
// Tech II originals among them), and every blueprint those invent (Tech II). A blueprint that's an invention product is
// Tech II wherever it's sold: the tab costs it through invention, never as an original you'd buy.
// Rigs: the engineering rigs of Tech I and Tech II (metaGroup 54 and 53) with their size (dogma 1547: 2 M-Set, 3 L-Set,
// 4 XL-Set). A modifier source's own dogmaAttributeID names the structure's attribute it moves (2538…), which the rig
// doesn't carry: its value is the rig's 2593 (time), 2594 (material) or 2595 (cost), times 2355/2356/2357 by security.
// Thukker and faction rigs (metaGroup 52) and the faction citadels are left out.
// Every list is sorted, so a rebuild of the same SDE build changes nothing.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

const [dir] = process.argv.slice(2);
const given = process.env.SDE_ZIP;
if (!dir && !given) { console.error('usage: node scripts/industry-bundle.mjs <folder for the SDE zip>, or SDE_ZIP=<zip> node scripts/industry-bundle.mjs'); process.exit(1); }
const SDE = 'https://developers.eveonline.com/static-data/tranquility';
const HEADERS = { 'User-Agent': 'jita-ledger' };

const ACTIVITIES = ['manufacturing', 'copying', 'research_material', 'research_time', 'invention'];
const RIG_ACTIVITIES = new Set(['manufacturing', 'copying', 'invention', 'researchMaterial', 'researchTime']);
const RIG_KINDS = new Set(['material', 'time', 'cost']);
const TECH = { 54: 1, 53: 2 };
const STRUCTURES = [35825, 35826, 35827];
/** Minerals, ice products and moon materials: what mining (and reprocessing what's mined) makes. */
const MINEABLE_GROUPS = new Set([18, 423, 427]);
/** The skills the tab names whether or not a blueprint asks for them. */
const INDUSTRY_SKILLS = [3380, 3387, 3388, 3402, 3403, 3406, 3409, 22242, 24624, 24625];
/** A skill's bonus, the first of these it carries: Industry 440, Advanced Industry 1961, a science or construction skill's
 *  1982 (manufacturing time a level, on what requires it), Science 452, Research 453, Metallurgy 468, slots 450 and 471. */
const BONUS_ATTRS = [440, 1961, 1982, 452, 453, 468, 450, 471];

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

let sde = null;
for await (const s of lines('_sde.jsonl')) sde = s;
const types = await all('types.jsonl');
const groups = await all('groups.jsonl');
const bps = await all('blueprints.jsonl');

const man = (b) => { const m = b.activities?.manufacturing; return m?.products?.length ? m : null; };
const onMarket = (id) => types.get(id)?.marketGroupID != null;

// Tech I (sold on the market, its product too) and Tech II (what they invent).
const t1 = new Set(), t2 = new Set();
for (const [id, b] of bps) {
  const m = man(b);
  if (m && types.get(id)?.published && onMarket(id) && onMarket(m.products[0].typeID)) t1.add(id);
}
for (const id of t1) for (const p of bps.get(id).activities.invention?.products ?? []) if (bps.has(p.typeID) && man(bps.get(p.typeID))) t2.add(p.typeID);
const kept = [...new Set([...t1, ...t2])].sort((a, b) => a - b);

const wanted = new Set(INDUSTRY_SKILLS);
const activity = (a) => {
  if (!a) return 0;
  const mats = (a.materials ?? []).map((m) => [m.typeID, m.quantity]);
  const skills = (a.skills ?? []).map((s) => [s.typeID, s.level]);
  const products = (a.products ?? []).map((p) => (p.probability != null ? [p.typeID, p.quantity, p.probability] : [p.typeID, p.quantity]));
  for (const [t] of [...mats, ...skills, ...products]) wanted.add(t);
  return [a.time ?? 0, mats, skills, products];
};
const outBps = kept.map((id) => {
  const b = bps.get(id);
  wanted.add(id);
  return [id, b.maxProductionLimit ?? 0, ...ACTIVITIES.map((n) => activity(b.activities?.[n]))];
});

// Rigs: their dogma, then the modifier sources of the Tech I and Tech II engineering rigs.
const sources = [];
for await (const m of lines('industryModifierSources.jsonl')) sources.push(m);
const want = new Set([...sources.map((m) => m._key), ...STRUCTURES]);
const dogma = new Map();
for await (const t of lines('typeDogma.jsonl')) if (want.has(t._key) || wanted.has(t._key)) dogma.set(t._key, Object.fromEntries((t.dogmaAttributes ?? []).map((a) => [a.attributeID, a.value])));
const rigs = [];
for (const m of sources) {
  const t = types.get(m._key), d = dogma.get(m._key) ?? {};
  const tech = TECH[t?.metaGroupID];
  const size = d[1547];
  if (!t?.published || !tech || ![2, 3, 4].includes(size)) continue;
  const mods = [];
  for (const [act, kinds] of Object.entries(m)) {
    if (act === '_key' || !RIG_ACTIVITIES.has(act)) continue;
    for (const [kind, list] of Object.entries(kinds)) {
      if (!RIG_KINDS.has(kind)) continue;
      for (const x of list) mods.push([act, kind, x.filterID ?? 0]);
    }
  }
  if (!mods.length) continue;
  mods.sort((a, b) => `${a[0]}:${a[1]}:${a[2]}`.localeCompare(`${b[0]}:${b[1]}:${b[2]}`));
  rigs.push([m._key, size, tech, mods, [d[2593] ?? 0, d[2594] ?? 0, d[2595] ?? 0], [d[2355] ?? 1, d[2356] ?? 1, d[2357] ?? 1]]);
  wanted.add(m._key);
}
rigs.sort((a, b) => a[0] - b[0]);

const structures = {};
for (const id of STRUCTURES) {
  const d = dogma.get(id);
  if (!d || d[2600] == null || d[2601] == null || d[2602] == null) throw new Error(`structure ${id} has no engineering bonuses`);
  structures[id] = [d[2600], d[2601], d[2602]];
}

const filters = {};
for await (const f of lines('industryTargetFilters.jsonl')) filters[f._key] = [f.name, [...(f.categoryIDs ?? [])].sort((a, b) => a - b), [...(f.groupIDs ?? [])].sort((a, b) => a - b)];

const outTypes = {};
for (const id of [...wanted].sort((a, b) => a - b)) {
  const t = types.get(id);
  if (!t) throw new Error(`type ${id} isn't in types.jsonl`);
  const g = groups.get(t.groupID);
  outTypes[id] = [t.name?.en ?? `Item #${id}`, t.groupID, g?.categoryID ?? 0, t.packagedVolume ?? t.volume ?? 0, t.basePrice ?? 0, MINEABLE_GROUPS.has(t.groupID) ? 1 : 0];
}

// The groups those types are in, named: the finder sorts products into kinds by them (a ship rig's group is "Rig …").
const outGroups = {};
for (const t of Object.values(outTypes)) if (!outGroups[t[1]]) outGroups[t[1]] = [groups.get(t[1])?.name?.en ?? `Group #${t[1]}`, t[2]];

const skills = {};
for (const id of Object.keys(outTypes).map(Number)) {
  if (groups.get(types.get(id).groupID)?.categoryID !== 16) continue;
  const d = dogma.get(id);
  if (!d || d[275] == null) throw new Error(`skill ${id} has no rank`);
  const attr = BONUS_ATTRS.find((a) => d[a] != null) ?? 0;
  skills[id] = [d[275], d[180], d[181], attr, attr ? d[attr] : 0];
}

const service = new Map();
for await (const s of lines('stationServices.jsonl')) service.set(s._key, s.serviceName?.en);
const ops = await all('stationOperations.jsonl');
const stations = [];
for await (const s of lines('npcStations.jsonl')) {
  const names = new Set((ops.get(s.operationID)?.services ?? []).map((x) => service.get(x)));
  const services = (names.has('Factory') ? 1 : 0) + (names.has('Laboratory') ? 2 : 0);
  if (services) stations.push([s._key, s.solarSystemID, services]);
}
stations.sort((a, b) => a[0] - b[0]);

// Every published blueprint's ME 0 manufacturing materials, for a job's estimated item value.
const eiv = {};
for (const [id, b] of [...bps].sort((a, b) => a[0] - b[0])) {
  const m = man(b);
  if (m && types.get(id)?.published) eiv[id] = (m.materials ?? []).map((x) => [x.typeID, x.quantity]);
}

// The watch set: every Tech I product and its materials. The blueprints whose NPC sellers the scan keeps: Tech I only.
const watch = new Set(), bpos = [];
for (const id of [...t1].filter((x) => !t2.has(x)).sort((a, b) => a - b)) {
  const m = man(bps.get(id));
  watch.add(m.products[0].typeID);
  for (const x of m.materials ?? []) watch.add(x.typeID);
  bpos.push(id);
}

const released = sde.releaseDate;
const out = { build: sde.buildNumber, released, source: `CCP static data build ${sde.buildNumber}, released ${released}`, bps: outBps, types: outTypes, groups: outGroups, filters, rigs, structures, stations, skills };
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/industry.json', JSON.stringify(out));
fs.writeFileSync('src/data/industryEiv.json', JSON.stringify({ build: sde.buildNumber, eiv }));
fs.writeFileSync('src/data/industryTypes.json', JSON.stringify({ build: sde.buildNumber, watch: [...watch].sort((a, b) => a - b), bpos }));

const kb = (f) => `${(fs.statSync(f).size / 1024).toFixed(1)} KB, ${(zlib.gzipSync(fs.readFileSync(f)).length / 1024).toFixed(1)} KB gzipped`;
console.log(out.source);
console.log(`${outBps.length} blueprints (${t1.size} on the market, ${t2.size} Tech II, ${[...t1].filter((x) => t2.has(x)).length} both), ${Object.keys(outTypes).length} types in ${Object.keys(outGroups).length} groups, ${rigs.length} rigs, ${stations.length} stations, ${Object.keys(skills).length} skills`);
console.log(`src/data/industry.json: ${kb('src/data/industry.json')}`);
console.log(`src/data/industryEiv.json: ${Object.keys(eiv).length} blueprints, ${kb('src/data/industryEiv.json')}`);
console.log(`src/data/industryTypes.json: ${watch.size} watched, ${bpos.length} blueprints, ${kb('src/data/industryTypes.json')}`);
