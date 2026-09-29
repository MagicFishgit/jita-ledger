// The stargate map, trimmed for the app: every solar system that has a stargate, with its security, its English name
// and the systems its gates lead to. ESI would answer the same one route at a time; the Freelance tab needs jumps from
// Jita to hundreds of systems at once (a job's broadcast systems, its offices), so it walks this instead. Run after a
// game update changes the map:
//
//   unzip mapSolarSystems.jsonl and mapStargates.jsonl from the SDE (see type-materials.mjs) into a folder, then
//   node scripts/universe-graph.mjs <folder> <build>
//
// Writes src/data/universeGraph.json: { build, systems: { systemId: [security, name, [neighbourIds…]] } }.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [dir, build] = process.argv.slice(2);
if (!dir || !build) { console.error('usage: node scripts/universe-graph.mjs <folder> <build>'); process.exit(1); }
async function* lines(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, file)), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) yield JSON.parse(l);
}
const next = new Map();
for await (const g of lines('mapStargates.jsonl')) {
  const from = g.solarSystemID, to = g.destination?.solarSystemID;
  if (!from || !to) continue;
  if (!next.has(from)) next.set(from, new Set());
  next.get(from).add(to);
}
const systems = {};
for await (const s of lines('mapSolarSystems.jsonl')) {
  if (!next.has(s._key)) continue;
  systems[s._key] = [Math.round(s.securityStatus * 1000) / 1000, s.name?.en ?? String(s._key), [...next.get(s._key)].sort((a, b) => a - b)];
}
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/universeGraph.json', JSON.stringify({ build: Number(build), systems }));
console.log(`${Object.keys(systems).length} systems with gates, ${(fs.statSync('src/data/universeGraph.json').size / 1024).toFixed(0)} KB`);
