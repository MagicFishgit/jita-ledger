import type { ReactNode } from 'react';
import { iskBig, units } from '../../lib/format';
import { RP_PER_DATACORE } from '../../lib/research';
import type { ResearchTotals } from '../../lib/researchTrack';
import { Tiles } from '../ui';
import type { Why } from './researchWorth';

/**
 * Running agents added up: RP a day, datacores waiting, what they're worth now and a month at today's prices. The
 * Research tab's totals across characters, and the Wallet's research card (yours, and across characters). Only the
 * characters whose research was read count; a part unpriced is no sum (the Six agents tile's lesson, research.md): any
 * agent's datacores unpriced leaves the worth "–" with how many and why, and "Try again" only for a book that couldn't
 * be read.
 */

const agentsSaid = (n: number, one: string, many: string) => `${n} agent${n === 1 ? one : many}`;

/** Whose agents a total counts, in a few words: "yours, 1 of 4 alts read" (alts only said when there are any). */
export function countedSaid(t: ResearchTotals, alts: boolean): string {
  return [t.mainRead ? 'yours' : 'yours not read', alts ? `${t.alts.read} of ${t.alts.of} alt${t.alts.of === 1 ? '' : 's'} read` : null].filter(Boolean).join(', ');
}

export function TotalsView({ title, said, totals: t, worthWhy, monthWhy, retry, tag }: {
  title: string; said: string; totals: ResearchTotals; worthWhy: Why; monthWhy: Why; retry: () => void; tag?: string;
}) {
  const unknownSaid = t.unknown ? `${agentsSaid(t.unknown, '’s', 's’')} points can’t be worked out (the read’s start time can’t be read)` : null;
  // "Try again" only for a book that couldn't be read; a book read with nothing in it to price says so, with nothing to retry.
  const missing = (v: number | null, why: Why, noPrice: string, unknown: string | null): { v: ReactNode; n: ReactNode } => {
    if (v != null) return { v: iskBig(Math.round(v)), n: null };
    if (why.pricing) return { v: <span className="faint">Pricing…</span>, n: null };
    const parts = [why.failed ? `${agentsSaid(why.failed, '’s book', 's’ books')} couldn’t be read just now` : null, why.noPrice ? `${agentsSaid(why.noPrice, '', 's')} ${noPrice}` : null, unknown].filter(Boolean);
    return { v: '–', n: <>{parts.join('; ')}, so nothing is summed.{why.failed ? <> <button type="button" className="link-btn" onClick={retry}>Try again</button></> : null}</> };
  };
  const worth = missing(t.worth, worthWhy, `${worthWhy.noPrice === 1 ? 'has' : 'have'} no price in Jita now: no bid over the fee, and no listing to price them at that covers the fees`, unknownSaid);
  const month = missing(t.iskMonth, monthWhy, `${monthWhy.noPrice === 1 ? 'has' : 'have'} no bid over the fee in Jita now`, null);
  return (
    <div className="col" style={{ gap: 8 }} data-research={tag}>
      <div className="rd-char-head">
        <span className="panel-title">{title}</span>
        <span className="note small">{said}</span>
      </div>
      <Tiles min={170} items={[
        { l: 'RP a day', v: t.rpDay.toFixed(1), n: 'ESI’s rates, added up', tip: 'Every running agent’s points a day as ESI gives them, for the characters whose research was read.' },
        { l: 'Datacores waiting', v: t.datacores != null ? units(t.datacores) : '–', n: t.datacores != null ? `Whole, at ${RP_PER_DATACORE} RP each (assumed)` : `${unknownSaid}, so nothing is summed.`, tip: 'Each agent’s whole datacores, added up: points held with one agent buy only its own field’s datacores.' },
        { l: 'Worth now', v: worth.v, n: worth.n ?? 'Into Jita’s bids, the rest listed', tip: 'Each agent’s Worth now, added up: its datacores sold into its field’s bids in Jita after its character’s sales tax and the 10,000 ISK fee each, and any the bids don’t take valued listed. Nothing is summed while any agent’s can’t be.\n\nJita’s books are read again every five minutes while the page is open.' },
        { l: 'A month', v: month.v, n: month.n ?? 'At ESI’s rates and Jita’s best bids now', tip: 'Thirty days of every running agent at ESI’s points a day, each datacore at Jita’s best bid now, after tax and the fee. Daily missions would add about as much again; nothing here counts them.' },
      ]} />
    </div>
  );
}
