import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Coins, Moon } from 'lucide-react';
import { useAlts } from '../../lib/altStore';
import { isk, iskBig } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import { DATACORE_FEE, DATACORE_OF, RP_PER_DATACORE, datacoreValue, rankAgents, type HelperAgent, type RankedAgent, type RdAgent } from '../../lib/research';
import { bestAgents, corpReach, FIELDS, listedAgents, MAX_AGENTS, pickDefault, SKILL, skillGaps, trainingPlan } from '../../lib/researchStart';
import { ROMAN, trainSaid } from '../../lib/skillStatus';
import { JITA_SYSTEM } from '../../lib/universe';
import { Points } from '../Facts';
import { PilotProvider } from '../pilot';
import { Seg, Tiles } from '../ui';
import { useResearchChars, type ResearchChar } from './researchChars';
import { useResearchMarket, type Want } from './researchMarket';
import { PickStep, ReachStep, StartStep, TrainStep, type Walk } from './ResearchSteps';

/**
 * Research: R&D agents, which turn a field skill into research points every day, logged in or not, that buy that
 * field's datacores. The user (2 October 2026): "great to just have going passively and forget about and cache in
 * later. I have never done this so I would like this page teach you about them and help you get them going and of
 * course track them." Stage 1 (docs/superpowers/specs/2026-10-03-rd-agents-design.md) is the walkthrough: what it pays
 * at the shown character's skills, then four steps (train, reach the agents, pick an agent and a field, start), all
 * following one pick. Stage 2, the cards for agents running, comes above it once the app reads research.
 *
 * The agents come from CCP's static data (src/data/researchAgents.json, its own chunk: ESI has no agent route), the
 * distances from the bundled stargate map, standings from each character's `meta.standings` (the main's sync, an alt's
 * hourly read by the cloud), and the datacores' prices from Jita's books now. The alt store is read here, the one page
 * of this tab allowed to (docs/notes/characters.md); everything of an alt's is only read.
 */

/** "Show for" and the pick, kept per browser. */
const SHOW_KEY = 'jita-ledger:research-show';
const PICK_KEY = 'jita-ledger:research-pick';
const readKept = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const keep = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* just not kept */ } };

type Bundle = { built: string; source: string; agents: RdAgent[]; helpers: HelperAgent[]; names?: Record<string, string> };
let bundleP: Promise<Bundle> | null = null;
let graphP: Promise<Graph> | null = null;
/** The agents bundle and the stargate map, each a chunk of its own, loaded once (a failed load is asked again next time). */
const loadBundle = () => (bundleP ??= import('../../data/researchAgents.json').then((m) => m.default as unknown as Bundle).catch((e) => { bundleP = null; throw e; }));
const loadGraph = () => (graphP ??= import('../../data/universeGraph.json').then((m) => (m.default as unknown as { systems: Graph }).systems).catch((e) => { graphP = null; throw e; }));

/** Every skill at V, for the "at all V" figures: every field, and the social skills the formula and access read. */
const ALL_V: Record<number, number> = Object.fromEntries([...Object.keys(FIELDS).map(Number), ...Object.values(SKILL)].map((id) => [id, 5]));

export function Research() {
  // The alt store is read here because this is the tab allowed to read it (scripts/check.mjs keeps the list).
  const alts = useAlts();
  const chars = useResearchChars(alts);
  const main = chars[0];
  const [keptShow, setKeptShow] = useState(() => Number(readKept(SHOW_KEY)) || null);
  // A kept character no longer on the roster falls back to the main, without forgetting the kept one: the roster loads
  // after the tab first draws.
  const shown = chars.find((c) => c.charId === keptShow) ?? main;
  const chooseShow = (id: number) => { setKeptShow(id); keep(SHOW_KEY, String(id)); };

  const [bundle, setBundle] = useState<Bundle | 'failed' | null>(null);
  const [graph, setGraph] = useState<Graph | 'failed' | null>(null);
  const [loadTry, setLoadTry] = useState(0);
  useEffect(() => {
    let alive = true;
    loadBundle().then((b) => { if (alive) setBundle(b); }, () => { if (alive) setBundle('failed'); });
    loadGraph().then((g) => { if (alive) setGraph(g); }, () => { if (alive) setGraph('failed'); });
    return () => { alive = false; };
  }, [loadTry]);

  return (
    <>
      <div className="intro-row">
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <p style={{ margin: 0 }}>An R&D agent turns one of your science skills into <b>research points every day, logged in or not</b>, which buy that field’s datacores from it.</p>
          <Points compact items={[
            { kind: 'info', icon: Coins, lead: 'A datacore', text: `costs ${RP_PER_DATACORE} research points and ${isk(DATACORE_FEE)}, bought from the agent in person.` },
            { kind: 'good', icon: Moon, lead: 'Nothing to do', text: 'once it runs: points pile up with no cap anyone reports, until you cash them in.' },
            { kind: 'warn', lead: 'Cancelling', text: 'loses every point held with that agent: buy its datacores first.' },
          ]} />
        </div>
        {chars.length > 1 && (
          <Seg size="sm" label="Show for" value={shown.charId} onChange={chooseShow}
            options={chars.map((c) => ({ v: c.charId, label: c.name, tip: c.isMain ? 'Your skills and standings' : `${c.name}’s skills and standings, as the cloud last read them`, tipTitle: `Show for ${c.name}` }))} />
        )}
      </div>
      {bundle === 'failed' || graph === 'failed' ? (
        <p className="note small" style={{ margin: 0 }}>Couldn’t load {bundle === 'failed' ? 'the list of agents' : 'the stargate map'} just now. <button type="button" className="link-btn" onClick={() => { setBundle(null); setGraph(null); setLoadTry((n) => n + 1); }}>Try again</button></p>
      ) : !bundle || !graph ? (
        <p className="note small" style={{ margin: 0 }}>Loading the agents and the map…</p>
      ) : (
        <PilotProvider value={shown.pilot}>
          <Walkthrough key={shown.charId} c={shown} mainName={main.name} bundle={bundle} graph={graph} />
        </PilotProvider>
      )}
    </>
  );
}

/** The walkthrough for one character: its pick, the tiles, and the four steps. */
function Walkthrough({ c, mainName, bundle, graph }: { c: ResearchChar; mainName: string; bundle: Bundle; graph: Graph }) {
  const now = useNow(3600_000);
  const skills = c.pilot.skills;
  const lvl = (id: number) => skills?.[id] ?? 0;
  const standings = c.standings.state === 'read' ? c.standings.list : null;

  // Jumps from Jita on a route that stays in high-sec; an agent off it is flagged, with its jumps by any route.
  const high = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC), [graph]);
  const any = useMemo(() => jumpsFrom(graph, JITA_SYSTEM), [graph]);
  const jumpsTo = useMemo(() => (s: number) => high.get(s) ?? null, [high]);

  // The 17 datacores' books first (they rank the agents), then their histories (the field picker), then the skillbooks.
  const datacores = useMemo(() => Object.values(DATACORE_OF), []);
  const books = useMemo(() => [...Object.keys(FIELDS).map(Number), SKILL.science, SKILL.labOp, SKILL.research, SKILL.rpm, SKILL.negotiation, SKILL.connections, SKILL.mechanics, SKILL.cpu, SKILL.powerGrid]
    .filter((id) => skills?.[id] == null), [skills]);
  const wants = useMemo<Want[]>(() => [...datacores.map((t) => `b:${t}` as const), ...datacores.map((t) => `h:${t}` as const), ...books.map((t) => `b:${t}` as const)], [datacores, books]);
  const market = useResearchMarket(wants);

  // What one datacore fetches at the top bid after this character's sales tax and the fee; missing while unread.
  const net = useMemo(() => {
    const out: Record<number, number | null> = {};
    for (const t of datacores) {
      const b = market.books[t];
      if (b && b !== 'failed') out[t] = datacoreValue(b.bids, 0, c.tax)?.perUnit ?? null;
    }
    return out;
  }, [datacores, market.books, c.tax]);
  const pricing = datacores.some((t) => market.books[t] === undefined);

  const base = { standings, netPerDatacore: net, jumpsTo };
  const ranked = useMemo(() => rankAgents(bundle.agents, { ...base, skills: skills ?? {}, connections: lvl(SKILL.connections), diplomacy: lvl(SKILL.diplomacy), negotiation: lvl(SKILL.negotiation) }),
    [bundle, skills, standings, net, jumpsTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const rankedV = useMemo(() => rankAgents(bundle.agents, { ...base, skills: ALL_V, connections: 5, diplomacy: 5, negotiation: 5 }),
    [bundle, standings, net, jumpsTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const corps = useMemo(() => corpReach(bundle.agents, bundle.helpers, { standings, connections: lvl(SKILL.connections), diplomacy: lvl(SKILL.diplomacy), jumpsTo }),
    [bundle, skills, standings, jumpsTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const listed = useMemo(() => listedAgents(ranked, corps), [ranked, corps]);

  // The pick: kept (one this character can reach or nearly can), else its best open agent and field.
  const [kept, setKept] = useState(() => readKept(PICK_KEY));
  const keptPick = kept ? listed.find((r) => `${r.agent.id}:${r.field}` === kept) ?? null : null;
  const pick = keptPick ?? pickDefault(ranked);
  const choose = (r: RankedAgent) => { const k = `${r.agent.id}:${r.field}`; setKept(k); keep(PICK_KEY, k); };

  const name = (id: number) => bundle.names?.[id] ?? `Corporation #${id}`;
  const sys = (id: number) => { const s = graph[id]; return s ? { name: s[1], sec: s[0] } : null; };
  const anyJumps = (id: number) => any.get(id) ?? null;

  const w: Walk = { c, mainName, bundle, name, sys, jumpsTo, anyJumps, ranked, rankedV, corps, listed, pick, choose, kept: !!keptPick,
    books: market.books, hist: market.hist, net, pricing, failed: market.failed, retry: market.retry, now };

  return (
    <>
      <LeadTiles w={w} />
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--body-2)', maxWidth: '72ch' }}>
          {pick ? <>Steps 1 to 3 follow one pick: <b>{pick.agent.name}</b>, level {pick.agent.level} {name(pick.agent.corp)}, in <b>{FIELDS[pick.field]?.name}</b>{w.kept ? '' : ', the best open to ' + (c.isMain ? 'you' : c.name)}. Change it in step 3.</>
            : <>No R&D agent is open to {c.isMain ? 'you' : c.name} at {c.isMain ? 'your' : 'its'} standings: step 2 says what opens one.</>}
        </p>
        <div className="ladder" aria-label="The steps">
          {['1 Train', '2 Reach the agents', '3 Pick agents and a field', '4 Start'].map((x, i) => (
            <span key={x} className="step">{i > 0 && <ArrowRight aria-hidden="true" />}<span>{x}</span></span>
          ))}
        </div>
      </div>
      <TrainStep w={w} />
      <ReachStep w={w} />
      <PickStep w={w} />
      <StartStep w={w} />
    </>
  );
}

/**
 * What it pays, for the pick at the shown character's skills, with every skill at V beside: an agent-day, six agents a
 * month, and the training to a first agent. Nothing not known reads as a zero: "Pricing…" while the books are read, "–"
 * with why when one can't be, "Not read yet" for skills the cloud hasn't read.
 */
function LeadTiles({ w }: { w: Walk }) {
  const { c, pick } = w;
  const who = c.isMain ? 'your' : `${c.name}’s`;
  const skills = c.pilot.skills;
  const alpha = c.clone === 'alpha';
  const atV = pick ? w.rankedV.find((r) => r.agent.id === pick.agent.id && r.field === pick.field) ?? null : null;
  const dayOf = (r: RankedAgent | null): ReactNode => {
    if (!r) return '–';
    if (r.iskDay != null) return isk(Math.round(r.iskDay));
    return w.books[r.datacore] === undefined ? 'Pricing…' : '–';
  };
  const fieldHas = pick ? skills?.[pick.field] ?? 0 : 0;
  const onceTrained = pick && fieldHas < pick.agent.level ? ` once ${FIELDS[pick.field]?.name} reaches ${ROMAN[pick.agent.level]}` : '';

  const six = bestAgents(w.ranked), sixV = bestAgents(w.rankedV);
  const month = (xs: RankedAgent[]) => xs.reduce((n, r) => n + (r.iskDay ?? 0), 0) * 30;
  const sixSaid = (xs: RankedAgent[]) => (w.pricing ? 'Pricing…' : xs.length ? iskBig(month(xs)) : '–');

  const plan = pick && skills ? trainingPlan(skillGaps(pick.field, pick.agent.level, skills) ?? [], { skills, sp: c.pilot.skillSp, attrs: c.pilot.attributes, alpha: false }) : null;
  const planSix = pick && skills ? trainingPlan([...(skillGaps(pick.field, pick.agent.level, skills) ?? []), { id: SKILL.rpm, level: 5 }], { skills, sp: c.pilot.skillSp, attrs: c.pilot.attributes, alpha: false }) : null;
  const daysSaid = (p: { days: number } | null) => (p == null ? '–' : p.days <= 0 ? 'Ready' : trainSaid(p.days * 86_400_000));
  const trainWhy = alpha ? `${c.isMain ? 'You’re' : `${c.name} is`} Alpha: Science V and every field skill need Omega.`
    : !skills ? (c.isMain ? 'Your skills come with the next sync.' : c.pilot.lost ? `${c.name}’s skills aren’t read: hand its login over again on the Characters page.` : `Not read yet: ${c.name}’s skills come with the cloud’s first read.`)
      : !c.pilot.attributes ? `${c.isMain ? 'Your' : `${c.name}’s`} attributes aren’t read yet, so no training time can be worked out.` : null;

  return (
    <Tiles min={220} items={[
      {
        l: 'An agent-day', v: dayOf(pick),
        n: pick ? <>{pick.rpDay.toFixed(1)} RP a day{onceTrained} · at all V: {dayOf(atV)}</> : 'Nothing open yet',
        tip: `What one day of ${pick ? pick.agent.name : 'the pick'}’s research fetches: its RP a day ÷ ${RP_PER_DATACORE} a datacore × what one sells for into Jita’s best bid after ${who} sales tax, less the ${isk(DATACORE_FEE)} fee.\n\n• RP a day = (1 + (20 + 5 × Negotiation + standing with the agent) ÷ 100) × (field skill + agent level)², EVE University’s formula, checked by a player on three characters (2023).\n• At ${who} skills, with the field at least at the agent’s level (assumed to be what it asks for).\n• ${RP_PER_DATACORE} RP a datacore is assumed: CCP 2012; CCP’s support page says 50–150 by field.\n• At all V: field, Negotiation and Connections at V, standings as read.`,
      },
      {
        l: 'Six agents, a month', v: sixSaid(six),
        n: <>{six.length && six.length < MAX_AGENTS ? `${six.length} open, not six · ` : ''}at all V: {sixSaid(sixV)}</>,
        tip: `Thirty days of the ${MAX_AGENTS} best-paying agents open to ${c.isMain ? 'you' : c.name} on a high-sec route from Jita, each in its best field, at today’s bids.\n\n• Six needs Research Project Management V: one agent, and one more a level.\n• Whether two agents may research one field at once isn’t confirmed.\n• Doing each agent’s daily mission would add about as much again; nothing here counts it.`,
      },
      {
        l: 'Training to a first agent', v: alpha ? 'Needs Omega' : daysSaid(plan),
        n: trainWhy ?? <>to six agents: {daysSaid(planSix)}</>,
        tip: `Science V, ${pick ? `${FIELDS[pick.field]?.name}’s prerequisite at V and the field to the agent’s level` : 'the field’s prerequisite and the field'}, at ${who} attributes from the points already trained. Six agents add Laboratory Operation V, Research V and Research Project Management V.\n\nStandings can take longer than skills: step 2 says what each level asks.`,
      },
    ]} />
  );
}
