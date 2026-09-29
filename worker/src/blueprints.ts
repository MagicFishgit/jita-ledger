import { blueprintContracts, TAR_DONE, TarSink, vanishedSince, type BpContract } from '../../src/lib/bpContracts';
import { THE_FORGE } from '../../src/lib/constants';
import { bunzipTo } from './vendor/bunzip';

/**
 * The Forge's blueprint contracts for the blueprint tool, on demand (POST /v1/blueprints/market). EVE Ref publishes
 * every region's public contracts with their items' ME, TE and runs twice an hour; ESI's own list would need ~20,000
 * item calls. Its server sends no CORS header, so the browser can't fetch it: the cloud does, unpacks the latest
 * snapshot and the one nearest three days ago (one at a time, so only one is ever in memory), and returns the
 * contracts holding the blueprints asked about, and those that vanished before expiry in between. Nothing runs until
 * asked: the user wanted this on a button, not a live scanner.
 */
const BASE = 'https://data.everef.net/public-contracts';
const LATEST = `${BASE}/public-contracts-latest.v2.tar.bz2`;
const WANT = ['meta.json', 'contracts.csv', 'contract_items.csv'];
const DAY = 86400_000;
/** How far back to look for what sold. */
export const VANISHED_DAYS = 3;
const UA = { 'User-Agent': 'Jita Ledger (a personal EVE trading tool)' };

async function snapshot(url: string, types: ReadonlySet<number>, now: number): Promise<{ contracts: BpContract[]; at: string | null }> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`EVE Ref answered ${res.status} for ${url.split('/').pop()}`);
  const sink = new TarSink(WANT);
  try { bunzipTo(new Uint8Array(await res.arrayBuffer()), sink); } catch (e) { if (e !== TAR_DONE) throw e; }
  return blueprintContracts(sink.files, { region: THE_FORGE, now, types });
}

/** The history snapshot nearest a moment: EVE Ref lists each day's, every 30 minutes, in the day's index. */
async function historyNear(t: number): Promise<{ url: string; at: number } | null> {
  const day = new Date(t).toISOString().slice(0, 10);
  const res = await fetch(`${BASE}/history/${day.slice(0, 4)}/${day}/index.json`, { headers: UA });
  if (!res.ok) return null;
  const idx = (await res.json()) as { files?: { url: string; file_time: string }[] };
  let best: { url: string; at: number } | null = null;
  for (const f of idx.files ?? []) {
    const at = Date.parse(f.file_time);
    if (Number.isFinite(at) && (!best || Math.abs(at - t) < Math.abs(best.at - t))) best = { url: f.url, at };
  }
  return best;
}

export type BlueprintMarket = {
  /** When the latest snapshot was taken, and the older one. */
  at: string | null; since: string | null;
  current: BpContract[];
  vanished: BpContract[];
};

export async function blueprintMarket(types: number[], you: number, now = Date.now()): Promise<BlueprintMarket> {
  const want = new Set(types.filter((t) => Number.isFinite(t) && t > 0));
  if (!want.size) return { at: null, since: null, current: [], vanished: [] };
  // Your own contracts aren't what others ask.
  const cur = await snapshot(LATEST, want, now);
  const current = cur.contracts.filter((c) => c.issuer !== you);
  const old = await historyNear(now - VANISHED_DAYS * DAY).catch(() => null);
  if (!old) return { at: cur.at, since: null, current, vanished: [] };
  const before = await snapshot(old.url, want, old.at);
  const vanished = vanishedSince(before.contracts, cur.contracts, now).filter((c) => c.issuer !== you);
  return { at: cur.at, since: before.at ?? new Date(old.at).toISOString(), current, vanished };
}
