import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ban, CalendarClock, Hourglass, MapPin, Shuffle, TrendingUp } from 'lucide-react';
import { ago, fmtDate, fmtDateTime, isk, iskBig, pct, units } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import { resolveNames } from '../../lib/market';
import { DATACORE_FEE, DATACORE_OF, RP_PER_DATACORE, type RdAgent, type ResearchRow } from '../../lib/research';
import { yearPercentile, type AgentCard, type ListWhy } from '../../lib/researchTrack';
import { datacoreName, FIELDS } from '../../lib/researchStart';
import { trainSaid } from '../../lib/skillStatus';
import type { HistRow, Prefs } from '../../lib/types';
import { JITA_SYSTEM } from '../../lib/universe';
import { Points } from '../Facts';
import { Check, ItemIcon, NumChip, Tiles } from '../ui';
import { researchWhy, type ResearchChar } from './researchChars';
import type { Book, Read } from './researchMarket';
import { DestButton, secSaid } from './ResearchSteps';
import { countedSaid, TotalsView } from './ResearchTotals';
import { blocksOf, monthMissing, pricedOf, totalsOf, whyNot, worthMissing, type Priced } from './researchWorth';

/**
 * The Research tab's tracking (stage 2 of docs/superpowers/specs/2026-10-03-rd-agents-design.md): a card per running
 * agent for every character, then the totals across them, when to cash in and what the daily missions are. Before
 * anything runs it's one line per character saying where its research stands. Every character shows, whoever the
 * walkthrough is shown for; each card is that character's own (its skills, standings, sales tax).
 *
 * Nothing not known reads as zero: research not read says why (`researchWhy`: not read yet, log in again, hand the login
 * over again); datacores whose book is still being read say "Pricing…", one that couldn't be read or has no bid over the
 * fee "–" with why; the totals count only characters whose research was read, say how many alts that is, and never sum
 * a part. This file reads no store: Research.tsx hands it the characters (the alt store's importers are a fixed list).
 */

type Market = { books: Record<number, Read<Book>>; hist: Record<number, Read<HistRow[]>>; retry: () => void };
/** The cash-in reminder (`prefs.researchCashIn`), handed in by Research.tsx, which writes it: this file reads no store. */
type CashIn = { value: Prefs['researchCashIn']; set: (v: { on: boolean; isk: number | null }) => void };
const DATACORES = Object.values(DATACORE_OF);

/** Where a character's research was read, said in a few words: the main's by its sync, an alt's by the cloud's hourly read. */
function readSaid(c: ResearchChar, now: number): string | null {
  const r = c.research;
  if (r.state !== 'read') return null;
  const when = r.at != null ? ` ${ago(new Date(r.at).toISOString(), now)}` : '';
  return c.isMain ? `As the sync read it${when}; EVE’s copy can be an hour old.` : `As the cloud read it${when}; it reads ${c.name} hourly.`;
}

export function ResearchCards({ chars, mainName, agents, corpName, graph, market, cashIn }: {
  chars: ResearchChar[]; mainName: string; agents: RdAgent[]; corpName: (id: number) => string; graph: Graph; market: Market; cashIn: CashIn;
}) {
  // RP held now ticks: CCP's formula runs on between reads.
  const now = useNow(5_000);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const high = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC), [graph]);

  // Every character's own orders come off the book: selling one character's datacores into another's bid is no sale. The
  // same rules price To do's cash-in items and the Wallet's research card (researchWorth.ts), so the three agree.
  const own = useMemo(() => chars.flatMap((c) => c.own), [chars]);
  const priced = useMemo(() => pricedOf(DATACORES, market.books, market.hist, own, Date.now()), [market.books, market.hist, own]);
  const years = useMemo(() => {
    const out: Record<number, ReturnType<typeof yearPercentile>> = {};
    const at = Date.now();
    for (const dc of Object.values(DATACORE_OF)) { const h = market.hist[dc]; if (h && h !== 'failed') out[dc] = yearPercentile(h, at); }
    return out;
  }, [market.hist]);

  const blocks = blocksOf(chars, byId, priced, now);
  const totals = totalsOf(blocks);
  const running = totals.agents > 0;
  // Why a total isn't summed, agent by agent: a book still read, one that couldn't be (Try again), or one read with no price.
  const worthWhy = whyNot(blocks, priced, worthMissing), monthWhy = whyNot(blocks, priced, monthMissing);

  // The agents' stations by name (ESI's universe names, one request for all of them); a station not named reads as its system.
  const stationKey = [...new Set(blocks.flatMap((b) => b.cards.map((x) => x.agent?.station).filter((s): s is number => s != null)))].sort().join(',');
  const [stations, setStations] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!stationKey) return;
    let alive = true;
    resolveNames(stationKey.split(',').map(Number)).then((n) => { if (alive) setStations(n); }).catch(() => undefined);
    return () => { alive = false; };
  }, [stationKey]);

  if (!running) {
    // Nothing runs anywhere: the walkthrough leads, and each character's research is one line here.
    return (
      <section className="col rd-track" style={{ gap: 4 }} aria-label="Your agents">
        <span className="panel-title">Your agents</span>
        {chars.map((c) => (
          <p key={c.charId} className="note small" data-research={c.isMain ? 'main' : c.charId}>
            <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.name}:</b>{' '}
            {c.research.state === 'read' ? `No agents running. ${c.isMain ? 'The steps below start one, and its card shows here once the sync reads it.' : `Its card shows here once the cloud reads one running.`}` : researchWhy(c)}
          </p>
        ))}
        {chars[0]?.missionAt && <MissionLine at={chars[0].missionAt} now={now} />}
      </section>
    );
  }

  return (
    <section className="col rd-track" style={{ gap: 16 }} aria-label="Your agents">
      {blocks.map(({ c, read, cards }) => (
        <div key={c.charId} className="col" style={{ gap: 8, minWidth: 0 }} data-research={c.isMain ? 'main' : c.charId}>
          <div className="rd-char-head">
            <span className="panel-title">{c.name}</span>
            {read && <span className="note small">{readSaid(c, now)}</span>}
          </div>
          {c.isMain && c.missionAt && <MissionLine at={c.missionAt} now={now} />}
          {!read ? <p className="note small">{researchWhy(c)}</p>
            : !cards.length ? <p className="note small">No agents running.</p>
            : cards.map(({ row, agent, card }) => (
              <AgentCardView key={`${row.agentId}:${row.skillTypeId}`} c={c} mainName={mainName} row={row} agent={agent} card={card} now={now}
                corpName={corpName} graph={graph} jumps={agent ? high.get(agent.system) ?? null : null} station={agent ? stations[agent.station] ?? null : null}
                priced={card.datacore != null ? priced[card.datacore] : undefined} year={card.datacore != null ? years[card.datacore] ?? null : null} retry={market.retry} />
            ))}
        </div>
      ))}
      <TotalsView title="All characters" said={`${totals.agents} agent${totals.agents === 1 ? '' : 's'}: ${countedSaid(totals, chars.length > 1)}.`}
        totals={totals} worthWhy={worthWhy} monthWhy={monthWhy} retry={market.retry} tag="totals" />
      <div className="g-300" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 6, minWidth: 0 }}>
          <span className="panel-title">When to cash in</span>
          <Points compact items={[
            { kind: 'good', icon: Hourglass, lead: 'Points don’t expire', text: 'and no one reports a cap: there’s no hurry.' },
            { kind: 'warn', icon: Ban, lead: 'Before cancelling', text: 'buy every datacore: cancelling loses the points held with that agent.' },
            { kind: 'tip', icon: MapPin, lead: 'When passing', text: 'the agent sells them only in person, docked in its station (Buy Datacores).' },
            { kind: 'tip', icon: TrendingUp, lead: 'When the price is high', text: 'against its year: each card says where its field’s latest day sits.' },
          ]} />
          <CashInControl cashIn={cashIn} />
        </div>
        <div className="col" style={{ gap: 6, minWidth: 0 }}>
          <span className="panel-title">Daily missions</span>
          <Points compact items={[
            { kind: 'info', icon: Shuffle, lead: 'Each agent offers one', text: 'about a day after the last was done or declined (CCP): optional, and it pays a day’s points.' },
            { kind: 'info', icon: CalendarClock, lead: 'Doing every one', text: 'about doubles what the agents make, for a trip a day each (a courier, or 8,100 Tritanium at level 4).' },
            { kind: 'good', lead: 'Declining', text: 'doesn’t cost standing (CCP, 2024). The agent’s mail saying research has halted is wrong: the points keep coming.' },
          ]} />
        </div>
      </div>
    </section>
  );
}

/**
 * The cash-in reminder (the user's choice, 3 October 2026): a To do item for each agent whose datacores waiting are worth
 * more than the amount, at the cards' own worth. Kept in the synced prefs; on only with an amount, and switching it off
 * keeps the amount (sanitizePrefs).
 */
function CashInControl({ cashIn }: { cashIn: CashIn }) {
  const isk = cashIn.value?.isk ?? null, on = !!cashIn.value?.on;
  return (
    <div className="chipbar rd-cashin" aria-label="Cash-in reminder">
      <Check checked={on} disabled={isk == null} onChange={(x) => cashIn.set({ on: x, isk })}
        tip={`${isk == null ? 'Type an amount first. ' : ''}A To do item for each agent whose datacores waiting are worth more than the amount, at Jita’s prices now, as its card says.\n\n• It ticks itself off once a newer read of the research shows them bought, or the research stopped, and goes if the price falls under the amount.\n• Kept with your preferences, so it’s the same on every device. Switching it off keeps the amount.\n• Never mailed.`}>
        Remind me on To do
      </Check>
      <NumChip id="rd-cashin" label="Worth over" value={isk} width={110} decimals={0} placeholder="e.g. 500k" tipTitle="Cash-in reminder"
          tip={'The amount an agent’s datacores waiting must be worth, at Jita’s prices now, before To do lists it: one item per agent. Typed as 500k, 1.2m or 500,000.'}
        onChange={(n) => cashIn.set({ on: on && n != null && n > 0, isk: n != null && n > 0 ? n : null })} />
    </div>
  );
}

/** When EVE last offered a research mission (the main's notifications): only the time, since its text hasn't been seen. */
function MissionLine({ at, now }: { at: string; now: number }) {
  return (
    <p className="note small" data-tip={`EVE’s notification “Research Mission Available” at ${fmtDateTime(at)}. Which agent offered it isn’t said yet: the app keeps only its time until a real one shows what its text carries.\n\nOptional: declining it doesn’t cost standing (CCP, 2024).`}>
      <Shuffle aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 6, color: 'var(--sec)' }} />
      A research mission was offered {ago(at, now)}.
    </p>
  );
}

/** Why a listing can't price datacores, as a clause. */
const listWhySaid = (why: ListWhy | null) => (why === 'noAsk' ? 'nothing is listed in Jita to price a listing against' : 'a listing wouldn’t cover the broker fee, tax and the agent’s fee');

/**
 * What "Worth now" says, like with like (the review of 3 October 2026): the bids' figure, with a listing beside it only
 * when listing them all pays more; the units the bids don't take valued listed, said so; with no bid over the fee,
 * listing as the way out; "Pricing…" while the book is read, "–" with why when nothing prices them.
 */
function worthSaid(card: AgentCard, p: Priced | undefined, retry: () => void): { v: ReactNode; n: ReactNode } {
  const big = (x: number) => iskBig(Math.round(x));
  if (card.datacores == null) return { v: '–', n: 'The points held aren’t known, so neither is what they fetch.' };
  if (card.datacores === 0 && card.datacore != null) return { v: 'Nothing yet', n: 'No whole datacore yet.' };
  if (!p) return { v: '–', n: 'This field makes no datacore.' };
  if (p.state === 'pricing') return { v: <span className="faint">Pricing…</span>, n: 'Reading Jita’s book.' };
  if (p.state === 'failed') return { v: '–', n: <>Jita’s book couldn’t be read just now. <button type="button" className="link-btn" onClick={retry}>Try again</button></> };
  const s = card.sale, w = card.worth;
  if (!s) return { v: '–', n: 'Nothing to sell.' };
  const orListed = s.listPays && s.listed.total != null ? ` Or about ${big(s.listed.total)} listed, if you wait for a buyer.` : '';
  if (s.bids && !s.rest) {
    return {
      v: big(s.bids.total),
      n: s.listPays && s.listed.total != null ? `Into the bids now, or about ${big(s.listed.total)} listed, if you wait for a buyer.`
        : s.listed.total != null ? 'Into the bids now: they pay at least as much as listing.'
        : s.listed.why === 'noAsk' ? 'Into the bids now: nothing is listed in Jita to set a listing against.' : 'Into the bids now: a listing wouldn’t cover its fees.',
    };
  }
  if (s.bids && s.rest) {
    return {
      v: big(w?.total ?? s.bids.total),
      n: s.rest.total != null
        ? `The bids take ${units(s.bids.units)} of ${units(card.datacores)} now (${big(s.bids.total)}); the other ${units(s.rest.units)} valued listed, about ${big(s.rest.total)}, if you wait for a buyer.${orListed}`
        : `The bids take ${units(s.bids.units)} of ${units(card.datacores)} now; the other ${units(s.rest.units)} have no price: ${listWhySaid(s.rest.why)}.`,
    };
  }
  return w
    ? { v: big(w.total), n: `Listed, if you wait for a buyer: no bid in Jita pays more than the ${isk(DATACORE_FEE)} fee after tax, so listing is the way out.` }
    : { v: '–', n: `No bid in Jita pays more than the ${isk(DATACORE_FEE)} fee after tax, and ${listWhySaid(s.listed.why)}.` };
}

function AgentCardView({ c, mainName, row, agent, card, now, corpName, graph, jumps, station, priced, year, retry }: {
  c: ResearchChar; mainName: string; row: ResearchRow; agent: RdAgent | null; card: AgentCard; now: number; corpName: (id: number) => string; graph: Graph;
  jumps: number | null; station: string | null; priced: Priced | undefined; year: ReturnType<typeof yearPercentile>; retry: () => void;
}) {
  const field = FIELDS[card.field]?.name ?? `Field ${card.field}`;
  const whose = c.isMain ? 'your' : `${c.name}’s`;
  const sys = agent ? graph[agent.system] : undefined;
  const where = agent ? [station, sys ? `${sys[1]} ${secSaid(sys[0])}` : `System ${agent.system}`, jumps != null ? `${jumps} jumps from Jita` : 'off a high-sec route from Jita'].filter(Boolean).join(' · ') : null;
  const worth = worthSaid(card, priced, retry);
  // A start that can't be read (a stored copy could carry one): the points held, and all that follows from them, unknown.
  const started = Number.isFinite(Date.parse(row.startedAt));
  const toGo = card.rpNow != null && card.datacores != null ? (card.datacores + 1) * RP_PER_DATACORE - card.rpNow : null;
  const should = card.rpDayShould;

  return (
    <article className="rd-card" aria-label={`${agent?.name ?? `Agent #${row.agentId}`}: ${field}`}>
      <div className="rd-card-head">
        {card.datacore != null && <ItemIcon id={card.datacore} size="sm" />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rd-card-title">{field}</div>
          <div className="rd-card-sub">{agent ? `${agent.name}, level ${agent.level} ${corpName(agent.corp)}` : `Agent #${row.agentId}: not in the app’s list of R&D agents`}</div>
          {where && <div className="rd-card-sub">{where}</div>}
        </div>
        {c.isMain && agent && <DestButton c={c} mainName={mainName} station={agent.station} />}
      </div>
      <Tiles inset min={150} items={[
        {
          l: 'RP a day', v: card.rpDay.toFixed(1), c: card.differs ? 'var(--acc2)' : undefined,
          n: <>{card.differs && should != null ? <>The formula says {should.toFixed(1)}: open the agent to update it. </> : null}
            {card.iskDay != null ? `About ${isk(Math.round(card.iskDay))} a day at Jita’s best bid now` : priced?.state === 'pricing' ? 'ISK a day: pricing…' : null}</>,
          tip: `ESI’s points a day: what accrues now.\n\n• The formula: (1 + (20 + 5 × Negotiation + standing with the agent) ÷ 100) × (field + agent level)², EVE University’s, checked by a player on three characters (2023).\n• At ${whose} skills and standing it gives ${should != null ? should.toFixed(1) : `nothing yet: ${!agent ? 'the agent isn’t in the app’s list' : !c.pilot.skills ? 'skills not read' : 'standings not read'}`}.\n• The game keeps the rate it set when research started, or when the agent was last opened, so a skill or standing gained since shows only once you open the agent. Said when the two differ by more than 2 RP or 2%.`,
        },
        {
          l: 'RP held now', v: card.rpNow != null ? card.rpNow.toFixed(2) : '–',
          n: card.rpNow != null && started ? `Since ${fmtDate(row.startedAt)}, ticking` : 'The read’s start time can’t be read, so the points held aren’t known.',
          tip: `CCP’s formula from ESI: the points ESI read as left over, plus ${card.rpDay.toFixed(1)} a day since the research started${started ? ` (${fmtDateTime(row.startedAt)})` : ''}.\n\n• No one reports a cap: they pile up until bought.\n• What a purchase does to the start and the points left over hasn’t been seen yet.`,
        },
        {
          l: 'Datacores you can buy', v: card.datacores != null ? units(card.datacores) : '–',
          n: `${RP_PER_DATACORE} RP each, assumed: CCP 2012; CCP’s support page says 50–150 by field`,
          tip: `Whole datacores the points held buy, at ${RP_PER_DATACORE} research points and ${isk(DATACORE_FEE)} each, from ${agent?.name ?? 'the agent'} in person (Buy Datacores).\n\n• ${RP_PER_DATACORE} RP is CCP’s 2012 dev blog and the static data; CCP’s support page (2024) says 50, 100 or 150 by field. The app uses ${RP_PER_DATACORE} until a purchase shows otherwise.`,
        },
        {
          l: 'Worth now', v: worth.v, n: worth.n,
          tip: `What the datacores fetch now: sold into Jita’s bids, best first, after ${whose} sales tax and the agent’s ${isk(DATACORE_FEE)} fee each. Bids of any of your characters are left out: selling into your own is no sale.\n\n• What the bids don’t take is valued listed, and with no bid over the fee all of them are: listing is then the way out.\n• Listed: one step under the cheapest listing where trading reaches it (as Orders prices a listing), after sales tax, the broker fee and the fee. It waits for a buyer, and is said beside the bids only when listing them all pays more.\n• Jita’s book is read again every five minutes while this tab is open. Nothing is sold until you buy the datacores from the agent.`,
        },
        {
          l: 'Next datacore in', v: card.nextInMs != null ? trainSaid(card.nextInMs) : '–',
          n: card.nextInMs != null && toGo != null ? `${toGo.toFixed(1)} RP to go` : toGo == null ? 'The points held aren’t known.' : 'No points coming in',
          tip: toGo != null ? `At ESI’s ${card.rpDay.toFixed(1)} RP a day: ${toGo.toFixed(1)} research points to the next ${RP_PER_DATACORE}.` : 'The read’s start time can’t be read, so the points held, and when the next datacore comes, aren’t known.',
        },
      ]} />
      {year && (
        <p className="note small" data-tip={`The Forge’s history: the average of ${fmtDate(year.date)}, the latest day traded, against each of the ${year.days} days traded in the last year. Cash in when it’s high against them, if you’re passing.`}>
          <TrendingUp aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 6, color: 'var(--sec)' }} />
          {card.datacore != null ? datacoreName(card.field) : field}: the latest day traded at {isk(Math.round(year.price))}, {yearSaid(year)}.
        </p>
      )}
    </article>
  );
}

/** Where the latest day sits in its year, in words: never "higher than 0%". */
function yearSaid(y: NonNullable<ReturnType<typeof yearPercentile>>): string {
  if (y.above === 0) return 'as low as any day of its year';
  if (y.above >= (y.days - 1) / y.days) return 'as high as any day of its year';
  return `higher than ${pct(y.above, 0)} of its year’s days`;
}
