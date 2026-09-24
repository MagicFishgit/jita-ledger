// End-to-end check of the Prospects funnel against live ESI. Hits the network, so it is
// deliberately not part of `npm run check`.  Run with: node scripts/scan-live.mjs
import { pickPages, statsFrom, passesGate, warningsFor, expectedEdge, DEFAULT_FILTERS } from '../src/lib/prospects.ts';

const H = { 'X-Compatibility-Date': '2026-08-18', 'User-Agent': 'jita-ledger/scan-live' };
const FORGE = 10000002, JITA = 60003760;
const get = async (u) => { const r = await fetch(u, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${u}`); return { d: await r.json(), pages: Number(r.headers.get('X-Pages')) || 1 }; };
const n = (x) => x.toLocaleString('en-US', { maximumFractionDigits: 2 });
const pool = async (items, k, fn) => { let i = 0; const out = []; await Promise.all(Array.from({ length: k }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j]).catch(() => null); } })); return out; };

console.log('Stage 0 — sampling the Jita 4-4 order book');
const first = await get(`https://esi.evetech.net/markets/${FORGE}/orders/?order_type=all&page=1`);
const pages = pickPages(first.pages, 20);
const lists = await pool(pages.slice(1), 4, (p) => get(`https://esi.evetech.net/markets/${FORGE}/orders/?order_type=all&page=${p}`).then((r) => r.d));
const counts = {};
let orders = 0;
for (const l of [first.d, ...lists.filter(Boolean)]) for (const o of l) { orders++; if (o.location_id === JITA) counts[o.type_id] = (counts[o.type_id] ?? 0) + 1; }
const scale = first.pages / pages.length;
const candidates = Object.keys(counts).map(Number).filter((i) => counts[i] >= 3).sort((a, b) => counts[b] - counts[a]);
console.log(`  ${pages.length} of ${first.pages} pages, ${n(orders)} orders, ${n(candidates.length)} candidates with 3+ listings\n`);

const sample = candidates.slice(0, 120);
console.log(`Stage 1 — checking how often the top ${sample.length} actually trade`);
const stats = (await pool(sample, 4, async (id) => statsFrom(id, (await get(`https://esi.evetech.net/markets/${FORGE}/history/?type_id=${id}`)).d))).filter(Boolean);
const passed = stats.filter((s) => passesGate(s, DEFAULT_FILTERS));
const failed = stats.filter((s) => !passesGate(s, DEFAULT_FILTERS));
console.log(`  ${passed.length} trade consistently, ${failed.length} do not, ${sample.length - stats.length} had no recent history`);
const why = (s) => [s.daysTraded < DEFAULT_FILTERS.minDays && `only ${s.daysTraded}/30 days`, s.tradesPerDay < DEFAULT_FILTERS.minTrades && `${n(s.tradesPerDay)} trades/day`, s.spikiness > DEFAULT_FILTERS.maxSpikiness && `${n(s.spikiness * 100)}% on one day`].filter(Boolean).join(', ');
const names = {};
const all = [...passed.slice(0, 8), ...failed.slice(0, 8)].map((s) => s.typeId);
if (all.length) for (const x of await (await fetch('https://esi.evetech.net/universe/names/', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(all) })).json()) names[x.id] = x.name;
console.log('\n  rejected (this is the gate doing its job):');
for (const s of failed.slice(0, 8)) console.log(`    ${(names[s.typeId] ?? s.typeId).padEnd(36)} ${why(s)}`);
console.log('\n  accepted:');
for (const s of passed.slice(0, 8)) console.log(`    ${(names[s.typeId] ?? s.typeId).padEnd(36)} ${s.daysTraded}/30 days, ${n(Math.round(s.tradesPerDay))} trades/day, ${n(s.spikiness * 100)}% peak day`);

const F = 0.015, T = 0.0338; // a plausible Omega broker fee and sales tax, for the arithmetic only
console.log(`\nStage 2 — pricing ${Math.min(12, passed.length)} survivors against the live book`);
const BE = (1 + F) / (1 - F - T) - 1;
const top = passed.map((s) => ({ s, e: expectedEdge(s, BE, 0.1) })).filter((x) => x.e > 0).sort((a, b) => b.e - a.e).slice(0, 12).map((x) => x.s);
console.log(`  break-even spread at these rates is ${n(BE * 100)}%; ${passed.filter((s) => expectedEdge(s, BE, 0.1) > 0).length} of ${passed.length} survivors habitually move further than that in a day`);
for (const x of await (await fetch('https://esi.evetech.net/universe/names/', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(top.map((s) => s.typeId)) })).json()) names[x.id] = x.name;
const books = await pool(top, 4, async (s) => {
  const o = (await get(`https://esi.evetech.net/markets/${FORGE}/orders/?order_type=all&type_id=${s.typeId}`)).d.filter((x) => x.location_id === JITA);
  const buys = o.filter((x) => x.is_buy_order).map((x) => x.price), sells = o.filter((x) => !x.is_buy_order).map((x) => x.price);
  return { s, bestBuy: Math.max(...buys), bestSell: Math.min(...sells), buyOrders: buys.length, sellOrders: sells.length };
});
console.log(`  ${'item'.padEnd(34)} ${'spread'.padStart(8)} ${'net/unit'.padStart(14)} ${'return'.padStart(8)}  flags`);
for (const b of books.filter(Boolean)) {
  if (!isFinite(b.bestBuy) || !isFinite(b.bestSell)) continue;
  const spreadPct = (b.bestSell - b.bestBuy) / b.bestBuy;
  const net = b.bestSell * (1 - F - T) - b.bestBuy * (1 + F);
  const w = warningsFor(b.s, { buyOrders: b.buyOrders, sellOrders: b.sellOrders, topBuys: [], topSells: [] }, spreadPct, (counts[b.s.typeId] ?? 0) * scale);
  console.log(`  ${(names[b.s.typeId] ?? b.s.typeId).toString().padEnd(34)} ${n(spreadPct * 100).padStart(7)}% ${n(net).padStart(14)} ${n((net / (b.bestBuy * (1 + F))) * 100).padStart(7)}%  ${w.join(' ') || '-'}`);
}
