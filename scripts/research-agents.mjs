// CCP's research (R&D) agents, trimmed for the app: ESI has no route for agents at all, so who they are, where they sit
// and what they research come from the static data (SDE). Run after a game update moves or changes agents:
//
//   node scripts/research-agents.mjs <folder>
//
// It reads the SDE's current build from developers.eveonline.com, downloads that build's JSONL zip into <folder> unless
// it's already there (User-Agent "jita-ledger"; ~99 MB), reads what it needs straight from the zip (no unzip needed), and
// writes src/data/researchAgents.json:
//
//   { built, source, agents: RdAgent[], helpers: HelperAgent[] }   (types in src/lib/research.ts)
//
// - agents: every research agent, picked by agent type 4 (ResearchAgent in agentTypes.jsonl), never by the R&D division
//   (18), which also holds event-mission and epic-arc agents. Each with its level, corporation, the corporation's faction,
//   station, system, and its fields: the skills in its `skills` list that a datacore requires (dogma 182 on a published
//   datacore, group 333). Astronautic Engineering and Hypernet Science make no datacore, so they're never offered.
// - helpers: the ordinary mission agents (BasicAgent, type 2) of the security (24) and distribution (22) divisions,
//   levels 1–4, of every corporation that has a research agent: running their missions is how standing with it rises.
//   Storyline, event and epic-arc agents are left out (they don't hand out missions you can walk up and run).
//
// Both lists are sorted by ID and each agent's fields ascending, so a rebuild of the same SDE build changes only `built`.
// Security isn't kept: the app reads it, with jumps, from the bundled stargate map (universeGraph.json), and this says
// which agents' systems that map lacks.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

const [dir] = process.argv.slice(2);
if (!dir) { console.error('usage: node scripts/research-agents.mjs <folder for the SDE zip>'); process.exit(1); }
const SDE = 'https://developers.eveonline.com/static-data/tranquility';
const HEADERS = { 'User-Agent': 'jita-ledger' };

const RESEARCH_AGENT = 4, BASIC_AGENT = 2;
const DIVISIONS = { 24: 'security', 22: 'distribution' };
const DATACORES = 333, REQUIRED_SKILL_1 = 182;

const latest = JSON.parse((await (await fetch(`${SDE}/latest.jsonl`, { headers: HEADERS })).text()).trim().split('\n')[0]);
const zipPath = path.join(dir, `eve-online-static-data-${latest.buildNumber}-jsonl.zip`);
if (!fs.existsSync(zipPath)) {
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

let sde = null;
for await (const s of lines('_sde.jsonl')) sde = s;

// Fields that make a datacore: the skill a published datacore requires.
const datacores = new Map();
for await (const t of lines('types.jsonl')) if (t.groupID === DATACORES && t.published) datacores.set(t._key, t.name?.en);
const datacoreOf = new Map();
for await (const t of lines('typeDogma.jsonl')) {
  if (!datacores.has(t._key)) continue;
  const req = (t.dogmaAttributes ?? []).find((a) => a.attributeID === REQUIRED_SKILL_1);
  if (!req) continue;
  if (datacoreOf.has(req.value)) throw new Error(`skill ${req.value} is required by two datacores: ${datacoreOf.get(req.value)} and ${t._key}`);
  datacoreOf.set(req.value, t._key);
}

const station = new Map();
for await (const s of lines('npcStations.jsonl')) station.set(s._key, s.solarSystemID);
const faction = new Map();
for await (const c of lines('npcCorporations.jsonl')) faction.set(c._key, c.factionID ?? null);
const system = new Map();
for await (const s of lines('mapSolarSystems.jsonl')) system.set(s._key, { name: s.name?.en, sec: s.securityStatus });

const npcs = [];
for await (const c of lines('npcCharacters.jsonl')) if (c.agent) npcs.push(c);

const where = (c) => {
  const sys = station.get(c.locationID);
  if (sys == null) throw new Error(`agent ${c._key} (${c.name?.en}) isn't in a station: ${c.locationID}`);
  return { station: c.locationID, system: sys };
};
const skipped = new Map();
const agents = npcs.filter((c) => c.agent.agentTypeID === RESEARCH_AGENT).map((c) => {
  const listed = (c.skills ?? []).map((s) => s.typeID);
  for (const f of listed) if (!datacoreOf.has(f)) skipped.set(f, (skipped.get(f) ?? 0) + 1);
  const corp = c.corporationID;
  if (faction.get(corp) == null) throw new Error(`agent ${c._key}'s corporation ${corp} has no faction`);
  return {
    id: c._key, name: c.name?.en ?? `Agent #${c._key}`, level: c.agent.level, corp, faction: faction.get(corp), ...where(c),
    fields: listed.filter((f) => datacoreOf.has(f)).sort((a, b) => a - b),
  };
}).sort((a, b) => a.id - b.id);

const rdCorps = new Set(agents.map((a) => a.corp));
const helpers = npcs.filter((c) => c.agent.agentTypeID === BASIC_AGENT && DIVISIONS[c.agent.divisionID] && rdCorps.has(c.corporationID)
  && c.agent.level >= 1 && c.agent.level <= 4).map((c) => ({
  id: c._key, name: c.name?.en ?? `Agent #${c._key}`, level: c.agent.level, corp: c.corporationID, division: DIVISIONS[c.agent.divisionID], ...where(c),
})).sort((a, b) => a.id - b.id);

const out = {
  built: new Date().toISOString().slice(0, 10),
  source: `CCP static data build ${sde.buildNumber}, released ${sde.releaseDate}`,
  agents, helpers,
};
const file = 'src/data/researchAgents.json';
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync(file, JSON.stringify(out));

// What was built, to check against the research.
const by = (xs, key) => xs.reduce((m, x) => ({ ...m, [key(x)]: (m[key(x)] ?? 0) + 1 }), {});
const offered = new Set(agents.flatMap((a) => a.fields));
const skillName = new Map();
for await (const t of lines('types.jsonl')) if (datacoreOf.has(t._key) || skipped.has(t._key)) skillName.set(t._key, t.name?.en);
const graph = JSON.parse(fs.readFileSync('src/data/universeGraph.json', 'utf8')).systems;
const offMap = agents.filter((a) => !graph[a.system]);
const band = (s) => (s >= 0.45 ? 'high' : s > 0 ? 'low' : 'null');
console.log(`${out.source}`);
console.log(`${agents.length} research agents by level ${JSON.stringify(by(agents, (a) => a.level))}, in ${rdCorps.size} corporations; by security ${JSON.stringify(by(agents, (a) => band(system.get(a.system).sec)))}`);
console.log(`${helpers.length} helpers: ${JSON.stringify(by(helpers, (h) => `${h.division} ${h.level}`))}`);
console.log(`${offered.size} fields offered, each with its datacore:`);
for (const f of [...offered].sort((a, b) => a - b)) console.log(`  ${f} ${skillName.get(f)} → ${datacoreOf.get(f)} ${datacores.get(datacoreOf.get(f))}`);
console.log(`listed but making no datacore: ${[...skipped].map(([f, n]) => `${skillName.get(f) ?? f} (${n})`).join(', ') || 'none'}`);
console.log(`agents whose system isn't on the stargate map: ${offMap.map((a) => `${a.name} (${system.get(a.system)?.name})`).join(', ') || 'none'}`);
console.log(`${file}: ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
