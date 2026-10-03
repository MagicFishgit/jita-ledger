import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ban, CalendarClock, Hourglass, MapPin, Shuffle, TrendingUp } from 'lucide-react';
import { FILL_WINDOW, listingPrice, recentRange } from '../../lib/fills';
import { ago, fmtDate, fmtDateTime, isk, iskBig, pct, units } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import { resolveNames } from '../../lib/market';
import { DATACORE_FEE, DATACORE_OF, RP_PER_DATACORE, type RdAgent, type ResearchRow } from '../../lib/research';
import { agentCard, listedWorth, othersSide, researchTotals, yearPercentile, type AgentCard } from '../../lib/researchTrack';
import { datacoreName, FIELDS } from '../../lib/researchStart';
import { trainSaid } from '../../lib/skillStatus';
import type { BookLevel, HistRow } from '../../lib/types';
import { JITA_SYSTEM } from '../../lib/universe';
import { Points } from '../Facts';
import { ItemIcon, Tiles } from '../ui';
import { researchWhy, type ResearchChar } from './researchChars';
import type { Book, Read } from './researchMarket';
import { DestButton, secSaid } from './ResearchSteps';

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
/** A datacore's market as the cards weigh it: everyone else's bids (all your characters' left out), where a listing would sell. */
type Priced = { state: 'pricing' } | { state: 'failed' } | { state: 'read'; bids: BookLevel[]; listAt: number | null };

/** Where a character's research was read, said in a few words: the main's by its sync, an alt's by the cloud's hourly read. */
function readSaid(c: ResearchChar, now: number): string | null {
  const r = c.research;
  if (r.state !== 'read') return null;
  const when = r.at != null ? ` ${ago(new Date(r.at).toISOString(), now)}` : '';
  return c.isMain ? `As the sync read it${when}; EVE’s copy can be an hour old.` : `As the cloud read it${when}; it reads ${c.name} hourly.`;
}

export function ResearchCards({ chars, mainName, agents, corpName, graph, market }: {
  chars: ResearchChar[]; mainName: string; agents: RdAgent[]; corpName: (id: number) => string; graph: Graph; market: Market;
}) {
  // RP held now ticks: CCP's formula runs on between reads.
  const now = useNow(5_000);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const high = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC), [graph]);

  // Every character's own orders come off the book: selling one character's datacores into another's bid is no sale.
  const own = useMemo(() => chars.flatMap((c) => c.own), [chars]);
  const priced = useMemo(() => {
    const out: Record<number, Priced> = {};
    const at = Date.now();
    for (const dc of Object.values(DATACORE_OF)) {
      const b = market.books[dc];
      if (b === undefined) { out[dc] = { state: 'pricing' }; continue; }
      if (b === 'failed') { out[dc] = { state: 'failed' }; continue; }
      const bids = othersSide(b.bids, own, dc, true), asks = othersSide(b.asks, own, dc, false);
      const h = market.hist[dc];
      const highs = h && h !== 'failed' ? recentRange(h, FILL_WINDOW, at).highs : null;
      out[dc] = { state: 'read', bids, listAt: listingPrice(asks[0]?.price ?? null, bids[0]?.price ?? null, highs) };
    }
    return out;
  }, [market.books, market.hist, own]);
  const years = useMemo(() => {
    const out: Record<number, ReturnType<typeof yearPercentile>> = {};
    const at = Date.now();
    for (const dc of Object.values(DATACORE_OF)) { const h = market.hist[dc]; if (h && h !== 'failed') out[dc] = yearPercentile(h, at); }
    return out;
  }, [market.hist]);

  const blocks = chars.map((c) => {
    const r = c.research;
    const standings = c.standings.state === 'read' ? c.standings.list : null;
    const rows = r.state === 'read' ? r.agents : [];
    return {
      c, read: r.state === 'read',
      cards: rows.map((row) => {
        const dc = DATACORE_OF[row.skillTypeId];
        const p = dc != null ? priced[dc] : undefined;
        return { row, agent: byId.get(row.agentId) ?? null, card: agentCard(row, byId.get(row.agentId) ?? null, c.pilot.skills, standings, p?.state === 'read' ? p.bids : null, c.tax, now) };
      }),
    };
  });
  const totals = researchTotals(blocks.map((b) => ({ charId: b.c.charId, isMain: b.c.isMain, read: b.read, cards: b.cards.map((x) => x.card) })));
  const running = totals.agents > 0;

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
      <Totals totals={totals} anyPricing={blocks.some((b) => b.cards.some((x) => x.card.datacore != null && priced[x.card.datacore]?.state === 'pricing'))}
        alts={chars.length > 1} retry={market.retry} />
      <div className="g-300" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 6, minWidth: 0 }}>
          <span className="panel-title">When to cash in</span>
          <Points compact items={[
            { kind: 'good', icon: Hourglass, lead: 'Points don’t expire', text: 'and no one reports a cap: there’s no hurry.' },
            { kind: 'warn', icon: Ban, lead: 'Before cancelling', text: 'buy every datacore: cancelling loses the points held with that agent.' },
            { kind: 'tip', icon: MapPin, lead: 'When passing', text: 'the agent sells them only in person, docked in its station (Buy Datacores).' },
            { kind: 'tip', icon: TrendingUp, lead: 'When the price is high', text: 'against its year: each card says where its field’s latest day sits.' },
          ]} />
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

/** When EVE last offered a research mission (the main's notifications): only the time, since its text hasn't been seen. */
function MissionLine({ at, now }: { at: string; now: number }) {
  return (
    <p className="note small" data-tip={`EVE’s notification “Research Mission Available” at ${fmtDateTime(at)}. Which agent offered it isn’t said yet: the app keeps only its time until a real one shows what its text carries.\n\nOptional: declining it doesn’t cost standing (CCP, 2024).`}>
      <Shuffle aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 6, color: 'var(--sec)' }} />
      A research mission was offered {ago(at, now)}.
    </p>
  );
}

/** What a datacore figure says when it isn't one: "Pricing…" while the book is read, "–" with why when it can't be priced. */
function unpricedSaid(p: Priced | undefined, retry: () => void): { v: ReactNode; n: ReactNode } {
  if (!p) return { v: '–', n: 'This field makes no datacore.' };
  if (p.state === 'pricing') return { v: <span className="faint">Pricing…</span>, n: 'Reading Jita’s book.' };
  if (p.state === 'failed') return { v: '–', n: <>Jita’s book couldn’t be read just now. <button type="button" className="link-btn" onClick={retry}>Try again</button></> };
  return { v: '–', n: `No bid in Jita pays more than the ${isk(DATACORE_FEE)} fee after tax.` };
}

function AgentCardView({ c, mainName, row, agent, card, now, corpName, graph, jumps, station, priced, year, retry }: {
  c: ResearchChar; mainName: string; row: ResearchRow; agent: RdAgent | null; card: AgentCard; now: number; corpName: (id: number) => string; graph: Graph;
  jumps: number | null; station: string | null; priced: Priced | undefined; year: ReturnType<typeof yearPercentile>; retry: () => void;
}) {
  const field = FIELDS[card.field]?.name ?? `Field ${card.field}`;
  const whose = c.isMain ? 'your' : `${c.name}’s`;
  const sys = agent ? graph[agent.system] : undefined;
  const where = agent ? [station, sys ? `${sys[1]} ${secSaid(sys[0])}` : `System ${agent.system}`, jumps != null ? `${jumps} jumps from Jita` : 'off a high-sec route from Jita'].filter(Boolean).join(' · ') : null;
  const no = unpricedSaid(priced, retry);
  const listed = priced?.state === 'read' && card.datacores > 0 ? listedWorth(card.datacores, priced.listAt, c.tax, c.broker) : null;
  const toGo = (card.datacores + 1) * RP_PER_DATACORE - card.rpNow;
  const should = card.rpDayShould;

  const worthV: ReactNode = card.datacores === 0 ? 'Nothing yet' : card.worth ? iskBig(Math.round(card.worth.total)) : no.v;
  const worthN: ReactNode = card.datacores === 0 ? 'No whole datacore yet.'
    : !card.worth ? no.n
    : <>{card.worth.units < card.datacores ? `The bids take ${units(card.worth.units)} of ${units(card.datacores)}. ` : ''}Listed: {listed ? `about ${iskBig(Math.round(listed.total))}` : '–'}</>;

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
            {card.iskDay != null ? `About ${isk(Math.round(card.iskDay))} a day at today’s bid` : priced?.state === 'pricing' ? 'ISK a day: pricing…' : null}</>,
          tip: `ESI’s points a day: what accrues now.\n\n• The formula: (1 + (20 + 5 × Negotiation + standing with the agent) ÷ 100) × (field + agent level)², EVE University’s, checked by a player on three characters (2023).\n• At ${whose} skills and standing it gives ${should != null ? should.toFixed(1) : `nothing yet: ${!agent ? 'the agent isn’t in the app’s list' : !c.pilot.skills ? 'skills not read' : 'standings not read'}`}.\n• The game keeps the rate it set when research started, or when the agent was last opened, so a skill or standing gained since shows only once you open the agent. Said when the two differ by more than 2 RP or 2%.`,
        },
        {
          l: 'RP held now', v: card.rpNow.toFixed(2),
          n: `Since ${fmtDate(row.startedAt)}, ticking`,
          tip: `CCP’s formula from ESI: the points ESI read as left over, plus ${card.rpDay.toFixed(1)} a day since the research started (${fmtDateTime(row.startedAt)}).\n\n• No one reports a cap: they pile up until bought.\n• What a purchase does to the start and the points left over hasn’t been seen yet.`,
        },
        {
          l: 'Datacores you can buy', v: units(card.datacores),
          n: `${RP_PER_DATACORE} RP each, assumed: CCP 2012; CCP’s support page says 50–150 by field`,
          tip: `Whole datacores the points held buy, at ${RP_PER_DATACORE} research points and ${isk(DATACORE_FEE)} each, from ${agent?.name ?? 'the agent'} in person (Buy Datacores).\n\n• ${RP_PER_DATACORE} RP is CCP’s 2012 dev blog and the static data; CCP’s support page (2024) says 50, 100 or 150 by field. The app uses ${RP_PER_DATACORE} until a purchase shows otherwise.`,
        },
        {
          l: 'Worth now', v: worthV, n: worthN,
          tip: `Sold into Jita’s bids now, best first, after ${whose} sales tax and the agent’s ${isk(DATACORE_FEE)} fee each. Bids of any of your characters are left out: selling into your own is no sale.\n\n• Listed: one step under the cheapest listing where trading reaches it (as Orders prices a listing), after sales tax, the broker fee and the fee. More, but it waits for a buyer.\n• Today’s prices: the datacores aren’t sold until you buy them from the agent.`,
        },
        {
          l: 'Next datacore in', v: card.nextInMs != null ? trainSaid(card.nextInMs) : '–',
          n: card.nextInMs != null ? `${toGo.toFixed(1)} RP to go` : 'No points coming in',
          tip: `At ESI’s ${card.rpDay.toFixed(1)} RP a day: ${toGo.toFixed(1)} research points to the next ${RP_PER_DATACORE}.`,
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

/** The totals across characters: only those whose research was read, the count said; a part unpriced is no sum. */
function Totals({ totals: t, anyPricing, alts, retry }: { totals: ReturnType<typeof researchTotals>; anyPricing: boolean; alts: boolean; retry: () => void }) {
  const counted = [t.mainRead ? 'yours' : 'yours not read', alts ? `${t.alts.read} of ${t.alts.of} alt${t.alts.of === 1 ? '' : 's'} read` : null].filter(Boolean).join(', ');
  const missing = (n: number, v: number | null): { v: ReactNode; n: ReactNode } => (v != null ? { v: iskBig(Math.round(v)), n: null }
    : anyPricing ? { v: <span className="faint">Pricing…</span>, n: null }
    : { v: '–', n: <>{n} agent{n === 1 ? '’s' : 's’'} datacores couldn’t be priced, so nothing is summed. <button type="button" className="link-btn" onClick={retry}>Try again</button></> });
  const worth = missing(t.unpriced, t.worth), month = missing(t.monthUnpriced, t.iskMonth);
  return (
    <div className="col" style={{ gap: 8 }} data-research="totals">
      <div className="rd-char-head">
        <span className="panel-title">All characters</span>
        <span className="note small">{t.agents} agent{t.agents === 1 ? '' : 's'}: {counted}.</span>
      </div>
      <Tiles min={170} items={[
        { l: 'RP a day', v: t.rpDay.toFixed(1), n: 'ESI’s rates, added up', tip: 'Every running agent’s points a day as ESI gives them, for the characters whose research was read.' },
        { l: 'Datacores waiting', v: units(t.datacores), n: `Whole, at ${RP_PER_DATACORE} RP each (assumed)`, tip: 'Each agent’s whole datacores, added up: points held with one agent buy only its own field’s datacores.' },
        { l: 'Worth now', v: worth.v, n: worth.n ?? 'Sold into Jita’s bids after tax and the fee', tip: 'Each agent’s datacores walked down its field’s bids in Jita, after its character’s sales tax and the 10,000 ISK fee each. Nothing is summed while any agent’s datacores can’t be priced.' },
        { l: 'A month', v: month.v, n: month.n ?? 'At today’s rates and bids', tip: 'Thirty days of every running agent at ESI’s points a day, each datacore at today’s best bid in Jita after tax and the fee. Daily missions would add about as much again; nothing here counts them.' },
      ]} />
    </div>
  );
}

