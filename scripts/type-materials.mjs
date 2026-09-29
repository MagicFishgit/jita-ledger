// What each market item reprocesses into, from CCP's static data (SDE), trimmed for the app: ESI serves no type
// materials at all. Run after a game update changes materials:
//
//   curl -sS https://developers.eveonline.com/static-data/tranquility/latest.jsonl      # its buildNumber
//   curl -sSO https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-<build>-jsonl.zip
//   unzip the archive's types.jsonl, typeMaterials.jsonl and typeDogma.jsonl into a folder, then
//   node scripts/type-materials.mjs <folder> <build> <releaseDate>
//
// Writes src/data/typeMaterials.json: { build, released, types: { typeId: [portionSize, [[materialId, qty], …], oreSkill?] } }
// for published types on the market that reprocess into something. `oreSkill` is dogma attribute 790
// (reprocessingSkillType): the processing skill an ore, ice or moon ore names, so no ore list needs keeping.
// Prismaticite's randomizedMaterials are left out: what it gives is drawn per batch.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [dir, build, released] = process.argv.slice(2);
if (!dir || !build) { console.error('usage: node scripts/type-materials.mjs <folder> <build> <releaseDate>'); process.exit(1); }

async function* lines(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, file)), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) yield JSON.parse(l);
}

const market = new Map();
for await (const t of lines('types.jsonl')) {
  if (t.published && t.marketGroupID != null) market.set(t._key, t.portionSize ?? 1);
}
const oreSkill = new Map();
for await (const t of lines('typeDogma.jsonl')) {
  if (!market.has(t._key)) continue;
  const a = (t.dogmaAttributes ?? []).find((x) => x.attributeID === 790);
  if (a && a.value > 0) oreSkill.set(t._key, a.value);
}
const types = {};
let n = 0;
for await (const t of lines('typeMaterials.jsonl')) {
  if (!market.has(t._key) || !t.materials?.length) continue;
  const row = [market.get(t._key), t.materials.map((m) => [m.materialTypeID, m.quantity])];
  if (oreSkill.has(t._key)) row.push(oreSkill.get(t._key));
  types[t._key] = row;
  n++;
}
const out = { build: Number(build), released: released ?? null, types };
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/typeMaterials.json', JSON.stringify(out));
console.log(`${n} types, ${oreSkill.size} with an ore processing skill, ${(fs.statSync('src/data/typeMaterials.json').size / 1024).toFixed(0)} KB`);
