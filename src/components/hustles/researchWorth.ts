import { useEffect, useMemo, useState } from 'react';
import { FILL_WINDOW, listingPrice, recentRange } from '../../lib/fills';
import { DATACORE_OF, type RdAgent, type ResearchRow } from '../../lib/research';
import { agentCard, othersSide, researchTotals, type AgentCard, type OwnOrder, type ResearchTotals } from '../../lib/researchTrack';
import type { BookLevel, HistRow } from '../../lib/types';
import { loadBundle, type Bundle } from './researchBundle';
import type { ResearchChar } from './researchChars';
import { useResearchMarket, type Book, type Read, type Want } from './researchMarket';

/**
 * What every running agent's datacores are worth, worked out one way for the Research tab's cards, To do's cash-in items
 * and the Wallet's research card, so the three agree (docs/notes/research.md): each datacore's Jita bids and asks with
 * every character's own orders taken off (`othersSide`), a listing priced as Orders prices one (`listingPrice`, with the
 * fortnight's highs), then `agentCard` for each agent at its own character's skills, standings, sales tax and broker fee.
 *
 * The tab reads all 17 datacores' books (they rank the agents too); To do and the Wallet read only the fields being
 * researched (`useRunningResearch`), each read shared in flight with the tab's (`jitaBook`, `regionHistory`). Nothing is
 * read, and the agents bundle isn't loaded, while no character's read shows an agent running.
 */

/** A datacore's market as the cards weigh it: everyone else's bids (all your characters' left out), where a listing would sell. */
export type Priced = { state: 'pricing' } | { state: 'failed' } | { state: 'read'; bids: BookLevel[]; listAt: number | null };

export function pricedOf(datacores: number[], books: Record<number, Read<Book>>, hist: Record<number, Read<HistRow[]>>, own: OwnOrder[], at: number): Record<number, Priced> {
  const out: Record<number, Priced> = {};
  for (const dc of datacores) {
    const b = books[dc];
    if (b === undefined) { out[dc] = { state: 'pricing' }; continue; }
    if (b === 'failed') { out[dc] = { state: 'failed' }; continue; }
    const bids = othersSide(b.bids, own, dc, true), asks = othersSide(b.asks, own, dc, false);
    const h = hist[dc];
    const highs = h && h !== 'failed' ? recentRange(h, FILL_WINDOW, at).highs : null;
    out[dc] = { state: 'read', bids, listAt: listingPrice(asks[0]?.price ?? null, bids[0]?.price ?? null, highs) };
  }
  return out;
}

export type AgentRow = { row: ResearchRow; agent: RdAgent | null; card: AgentCard };
/** One character's running agents as cards; `read` false when its research isn't read (then it has none). */
export type Block = { c: ResearchChar; read: boolean; cards: AgentRow[] };

/**
 * Each character's cards. They come from the research read alone (an agent the bundle doesn't hold, or a bundle not
 * loaded yet, is a card with no agent), so a judge reading them never takes an agent for gone while the bundle loads.
 */
export function blocksOf(chars: ResearchChar[], byId: Map<number, RdAgent>, priced: Record<number, Priced>, now: number): Block[] {
  return chars.map((c) => {
    const r = c.research;
    const standings = c.standings.state === 'read' ? c.standings.list : null;
    const rows = r.state === 'read' ? r.agents : [];
    return {
      c, read: r.state === 'read',
      cards: rows.map((row) => {
        const dc = DATACORE_OF[row.skillTypeId];
        const p = dc != null ? priced[dc] : undefined;
        const read = p?.state === 'read' ? p : null;
        const agent = byId.get(row.agentId) ?? null;
        return { row, agent, card: agentCard(row, agent, c.pilot.skills, standings, read?.bids ?? null, c.tax, now, { at: read?.listAt ?? null, brokerFee: c.broker }) };
      }),
    };
  });
}

export const totalsOf = (blocks: Block[]): ResearchTotals => researchTotals(blocks.map((b) => ({ charId: b.c.charId, isMain: b.c.isMain, read: b.read, cards: b.cards.map((x) => x.card) })));

/** Why a total isn't summed, agent by agent: a book still read, one that couldn't be (Try again), or one read with no price. */
export type Why = { pricing: number; failed: number; noPrice: number };
export function whyNot(blocks: Block[], priced: Record<number, Priced>, missing: (x: AgentCard) => boolean): Why {
  const out: Why = { pricing: 0, failed: 0, noPrice: 0 };
  for (const x of blocks.filter((b) => b.read).flatMap((b) => b.cards.map((y) => y.card)).filter(missing)) {
    const st = x.datacore != null ? priced[x.datacore]?.state : undefined;
    if (st === 'pricing') out.pricing++; else if (st === 'failed') out.failed++; else out.noPrice++;
  }
  return out;
}
/** A card the worth can't count: datacores waiting and no worth. */
export const worthMissing = (x: AgentCard) => x.datacores != null && x.datacores > 0 && x.worth == null;
/** A card the month can't count: no ISK a day. */
export const monthMissing = (x: AgentCard) => x.iskDay == null;

/** Any character's read shows an agent running. */
export const anyRunning = (chars: ResearchChar[]) => chars.some((c) => c.research.state === 'read' && c.research.agents.length > 0);

/**
 * The agents that run, for To do and the Wallet: the bundle (loaded only once one runs), the books and histories of the
 * fields being researched (the books read again every five minutes while the page is in view, as the tab does, so RP held
 * and the worth keep up), and every character's cards and the totals. `enabled` false reads nothing and gives no cards (To
 * do with the cash-in reminder off). `now` is the page's own clock.
 */
export function useRunningResearch(chars: ResearchChar[], now: number, enabled = true) {
  const running = enabled && anyRunning(chars);
  // The fields' datacores, sorted, as one key: a new read listing the same fields asks nothing new.
  const dcKey = running ? [...new Set(chars.flatMap((c) => (c.research.state === 'read' ? c.research.agents : []).map((r) => DATACORE_OF[r.skillTypeId]).filter((d): d is number => d != null)))].sort((a, b) => a - b).join(',') : '';
  const datacores = useMemo(() => (dcKey ? dcKey.split(',').map(Number) : []), [dcKey]);
  const wants = useMemo<Want[]>(() => [...datacores.map((t) => `b:${t}` as const), ...datacores.map((t) => `h:${t}` as const)], [datacores]);
  const reread = useMemo<Want[]>(() => datacores.map((t) => `b:${t}` as const), [datacores]);
  const market = useResearchMarket(wants, reread);

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [bundleTry, setBundleTry] = useState(0);
  useEffect(() => {
    if (!running || bundle) return;
    let alive = true, again: ReturnType<typeof setTimeout> | undefined;
    // A chunk that didn't load (a deploy in between) is asked again in half a minute; the items wait, they aren't judged gone.
    loadBundle().then((b) => { if (alive) setBundle(b); }, () => { if (alive) again = setTimeout(() => setBundleTry((n) => n + 1), 30_000); });
    return () => { alive = false; clearTimeout(again); };
  }, [running, bundle, bundleTry]);
  const byId = useMemo(() => new Map((bundle?.agents ?? []).map((a) => [a.id, a])), [bundle]);

  const own = useMemo(() => chars.flatMap((c) => c.own), [chars]);
  const priced = useMemo(() => pricedOf(datacores, market.books, market.hist, own, Date.now()), [datacores, market.books, market.hist, own]);
  // Every character's, whenever enabled, agents or none: a read that no longer lists an agent is what tells To do it stopped.
  const blocks = useMemo(() => (enabled ? blocksOf(chars, byId, priced, now) : []), [enabled, chars, byId, priced, now]);
  const totals = useMemo(() => totalsOf(blocks), [blocks]);
  return { running, bundle, priced, blocks, totals, retry: market.retry };
}
