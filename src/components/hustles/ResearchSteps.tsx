import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Anchor, Ban, BookOpen, Lock, MapPin, MessageSquare, Navigation, Shuffle, Undo2 } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { SCOPE } from '../../lib/config';
import { isk, iskBig, pct, units } from '../../lib/format';
import { resolveNames, setDestination } from '../../lib/market';
import {
  ACCESS, CORP_BELOW_FACTION, DATACORE_FEE, DATACORE_OF, RP_PER_DATACORE, effectiveStanding, openLevel, rpPerDay,
  type HelperAgent, type RankedAgent, type RdAgent,
} from '../../lib/research';
import { datacoreName, fieldYear, FIELDS, SKILL, SKILL_NAMES, skillGaps, startLevel, trainingPlan, type CorpReach } from '../../lib/researchStart';
import { ROMAN, trainSaid } from '../../lib/skillStatus';
import { toast } from '../../lib/toast';
import type { HistRow } from '../../lib/types';
import { Points } from '../Facts';
import { SkillStrip, type SkillLine } from '../SkillStrip';
import { Notice, Seg, Sparkline, Th } from '../ui';
import { standingsWhy, type ResearchChar } from './researchChars';
import type { Book, Read } from './researchMarket';

/** Everything the four steps read, worked out once by the walkthrough (Research.tsx) for the character shown. */
export type Walk = {
  c: ResearchChar; mainName: string; bundle: { agents: RdAgent[]; helpers: HelperAgent[] };
  /** A corporation's or faction's name, from the bundle. */
  name: (id: number) => string;
  sys: (id: number) => { name: string; sec: number } | null;
  /** High-sec jumps from Jita (null: no route that stays in high-sec), and jumps by any route. */
  jumpsTo: (system: number) => number | null; anyJumps: (system: number) => number | null;
  ranked: RankedAgent[]; rankedV: RankedAgent[]; corps: CorpReach[]; listed: RankedAgent[];
  pick: RankedAgent | null; choose: (r: RankedAgent) => void;
  /** Whether the pick is one chosen here (kept), rather than the best open one. */
  kept: boolean;
  books: Record<number, Read<Book>>; hist: Record<number, Read<HistRow[]>>;
  /** What one datacore fetches after tax and the fee, by the datacore's type; missing while its book is read. */
  net: Record<number, number | null>;
  pricing: boolean; failed: number; retry: () => void; now: number;
};

function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <section className="step-card rd-step" aria-label={`Step ${n}: ${title}`}>
      <span className="hexn" aria-hidden="true">{done ? '✓' : n}</span>
      <div className="st">{title}</div>
      <div className="col" style={{ gap: 12, minWidth: 0 }}>{children}</div>
    </section>
  );
}

const who = (c: ResearchChar) => (c.isMain ? 'you' : c.name);
const whose = (c: ResearchChar) => (c.isMain ? 'your' : `${c.name}’s`);
/** Security as the game shows it: one decimal, 0.45 and up rounding to 0.5. */
const secSaid = (s: number) => (Math.round(s * 10) / 10).toFixed(1);
const raw = (c: ResearchChar, type: 'agent' | 'npc_corp' | 'faction', id: number): number | null =>
  c.standings.state === 'read' ? c.standings.list.find((r) => r.type === type && r.id === id)?.standing ?? null : null;
const eff = (c: ResearchChar, r: number | null) => effectiveStanding(r, c.pilot.skills?.[SKILL.connections] ?? 0, c.pilot.skills?.[SKILL.diplomacy] ?? 0);

/** A standing as the page says it: effective to two places, "no standing", or why it isn't known. */
function standingSaid(c: ResearchChar, rawV: number | null, effV: number | null): { text: string; sub: string | null; tip?: string } {
  if (c.standings.state !== 'read') return { text: 'Not read yet', sub: null };
  if (rawV == null || effV == null) return { text: 'no standing', sub: null, tip: 'Never had any: Connections lifts nothing until a first mission moves it.' };
  return { text: signed(effV), sub: Math.abs(effV - rawV) >= 0.005 ? `${signed(rawV)} raw` : null };
}

/** What a datacore fetches: the figure, "Pricing…" while its book is read, or "–" with why. */
function netSaid(w: Walk, datacore: number, perDay?: number | null): ReactNode {
  const b = w.books[datacore];
  const v = perDay !== undefined ? perDay : w.net[datacore];
  if (v != null) return isk(Math.round(v));
  if (b === undefined) return <span className="faint">Pricing…</span>;
  return <span className="faint" data-tip={b === 'failed' ? 'Jita’s book couldn’t be read just now.' : `No bid in Jita pays more than the ${isk(DATACORE_FEE)} fee after tax.`}>–</span>;
}

/** A skillbook's price where it's cheapest in The Forge: Jita's cheapest listing, or NPCs' elsewhere when lower. */
function bookSaid(w: Walk, id: number): string {
  const b = w.books[id];
  if (b === undefined) return 'pricing…';
  if (b === 'failed') return 'no price just now';
  const best = [b.ask, b.npc].filter((x): x is number => x != null);
  if (!best.length) return 'none listed in The Forge';
  const p = Math.min(...best);
  return `${iskBig(p)} ${b.npc != null && p === b.npc && p !== b.ask ? 'from NPCs in The Forge' : 'in Jita'}`;
}

// ---- Step 1 ---------------------------------------------------------------------------------------------------

/**
 * Train: Science V, the pick's field prerequisite and its field to the agent's level, then the skills for more agents and
 * more points. Each skillbook not injected has its price. The strips are the app's own (pips, queue, times), at the
 * character the tab is shown for (the PilotProvider above).
 */
export function TrainStep({ w }: { w: Walk }) {
  const { c, pick } = w;
  const skills = c.pilot.skills;
  const has = (id: number) => skills?.[id] ?? 0;
  const priced = (id: number, text: string) => (skills && skills[id] == null ? `${text} Book: ${bookSaid(w, id).replace(/([^…])$/, '$1.')}` : text);
  const agentStanding = pick ? eff(c, raw(c, 'agent', pick.agent.id)) : null;
  const neg = has(SKILL.negotiation);
  const fieldAt = pick ? Math.max(has(pick.field), pick.agent.level) : 0;
  const rpAt = (field: number, negotiation: number) => (pick ? rpPerDay({ field, agentLevel: pick.agent.level, negotiation, agentStanding }) : 0);
  const gaps = pick ? skillGaps(pick.field, pick.agent.level, skills) : null;
  const plan = pick && skills ? trainingPlan(gaps ?? [], { skills, sp: c.pilot.skillSp, attrs: c.pilot.attributes, alpha: false }) : null;

  const first: SkillLine[] = pick ? [
    { name: 'Science', id: SKILL.science, what: priced(SKILL.science, 'Every R&D agent asks for Science V; Alpha clones stop at IV.') },
    { name: SKILL_NAMES[FIELDS[pick.field].needs], id: FIELDS[pick.field].needs, what: priced(FIELDS[pick.field].needs, `${FIELDS[pick.field].name} asks for it at V.`) },
    {
      name: FIELDS[pick.field].name, id: pick.field,
      what: priced(pick.field, `The field ${pick.agent.name} researches, to ${ROMAN[pick.agent.level]}: an agent is assumed to ask for its field at its own level (EVE University’s example; a 2023 player report disagrees). Points a day grow with (field + agent level)².`),
      next: (l) => (l < pick.agent.level ? `${pick.agent.name} asks for ${ROMAN[pick.agent.level]}` : `${rpAt(l, neg).toFixed(1)} RP a day at ${pick.agent.name}`),
    },
  ] : [{ name: 'Science', id: SKILL.science, what: priced(SKILL.science, 'Every R&D agent asks for Science V; Alpha clones stop at IV.') }];
  const faction = pick?.agent.faction, corp = pick?.agent.corp;
  const more: SkillLine[] = [
    { name: 'Laboratory Operation', id: SKILL.labOp, what: priced(SKILL.labOp, 'Research Project Management asks for it at V.') },
    { name: 'Research', id: SKILL.research, what: priced(SKILL.research, 'Research Project Management asks for it at V.') },
    { name: 'Research Project Management', id: SKILL.rpm, what: priced(SKILL.rpm, 'One more agent at once a level: six at V.'), next: (l) => `${1 + l} agents at once` },
    {
      name: 'Negotiation', id: SKILL.negotiation, what: priced(SKILL.negotiation, 'Adds 5 to the formula’s first part a level.'),
      next: pick ? (l) => `+${(rpAt(fieldAt, l) - rpAt(fieldAt, l - 1)).toFixed(1)} RP a day at ${pick.agent.name}` : undefined,
    },
    {
      name: 'Connections', id: SKILL.connections,
      what: priced(SKILL.connections, 'Lifts a standing you have by 4% of its gap to 10 a level; one you’ve never had stays at none until it first moves. It raises what an agent opens and, with the agent’s own standing, its points.'),
      next: pick && faction && corp ? (l) => {
        const f = raw(c, 'faction', faction), co = raw(c, 'npc_corp', corp);
        if (c.standings.state !== 'read') return null;
        const fe = effectiveStanding(f, l, has(SKILL.diplomacy)), ce = effectiveStanding(co, l, has(SKILL.diplomacy));
        const open = openLevel(ce, fe), before = openLevel(eff(c, co), eff(c, f));
        const said = [fe != null ? `${w.name(faction)} ${fe.toFixed(2)}` : null, ce != null ? `${w.name(corp)} ${ce.toFixed(2)}` : null].filter(Boolean).join(', ');
        return said ? `${said}${open > before ? `: opens level ${open}` : ''}` : null;
      } : undefined,
    },
  ];

  return (
    <Step n={1} title="Train" done={!!gaps && gaps.length === 0}>
      {c.clone === 'alpha' && <Notice kind="warn">{c.isMain ? 'You’re' : `${c.name} is`} Alpha: R&D agents need Science V, which Alpha stops at IV, and a field skill, which Alpha can’t train. Omega opens them.</Notice>}
      {!skills && c.isMain && <p className="note small" style={{ margin: 0 }}>Your skills come with the next sync.</p>}
      <SkillStrip title={pick ? `For ${pick.agent.name}` : 'To use any R&D agent'} lines={first} />
      {plan && plan.levels.length > 0 && (
        <p className="note small" style={{ margin: 0 }}>
          To a first agent, at {whose(c)} attributes: {plan.levels.map((x) => `${SKILL_NAMES[x.id] ?? `skill ${x.id}`} ${ROMAN[x.from]} → ${ROMAN[x.to]} (${trainSaid(x.days * 86_400_000)})`).join(', ')}: <b>{trainSaid(plan.days * 86_400_000)}</b>.
        </p>
      )}
      <SkillStrip title="More agents, more points" lines={more} />
    </Step>
  );
}

// ---- Step 2 ---------------------------------------------------------------------------------------------------

/** A standing to two places, with a true minus sign. */
const signed = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;

/** The R&D access rule for a level, in words: the corporation alone, or the faction with the corporation 2 under. */
function needSaid(level: 1 | 2 | 3 | 4, corpName: string, factionName: string): string {
  const n = ACCESS[level];
  return `${corpName} ${signed(n)}, or ${factionName} ${signed(n)} with ${corpName} ${signed(n - CORP_BELOW_FACTION)}`;
}

/** What the next level asks of a corporation's standings, and, once they're read, what each has and what's missing. */
function nextSaid(w: Walk, r: CorpReach): string {
  const n = r.next!, corp = w.name(r.corp), fac = w.name(r.faction);
  if (w.c.standings.state !== 'read') return `Level ${n.level}: ${needSaid(n.level, corp, fac)}`;
  const has = (v: number | null) => (v == null ? 'none' : signed(v));
  if ((r.factionEff ?? 0) >= n.viaFaction.faction) return `Level ${n.level}: ${corp} at ${signed(n.viaFaction.corp)} (it has ${has(r.corpEff)}); ${fac}’s ${has(r.factionEff)} covers the rest`;
  return `Level ${n.level}: ${corp} at ${signed(n.corp)} (it has ${has(r.corpEff)}), or ${fac} at ${signed(n.viaFaction.faction)} (it has ${has(r.factionEff)}) with ${corp} at ${signed(n.viaFaction.corp)}`;
}

/**
 * Reach the agents: each corporation with R&D agents at the character's standings (effective, as access reads them),
 * the level that opens, what the next asks, and its own security and distribution agents this character can use now,
 * whose missions are how that standing rises. Ordered by the faction's standing, then the nearest agent.
 */
export function ReachStep({ w }: { w: Walk }) {
  const { c } = w;
  const [all, setAll] = useState(false);
  const why = standingsWhy(c);
  const start = startLevel(w.corps);
  const rows = all ? w.corps : w.corps.slice(0, 5);
  return (
    <Step n={2} title="Reach the agents" done={c.standings.state === 'read' && start >= 2}>
      {why && <Notice kind="warn">{why} Until then only level 1 agents, which take any standing over −2.00, show as open.</Notice>}
      <Points compact items={[
        c.standings.state === 'read'
          ? { kind: 'tip', lead: start ? `Start with a level ${start} agent:` : 'No R&D agent', text: start ? `the highest open to ${who(c)} now.` : `is open to ${who(c)} at these standings.` }
          : { kind: 'tip', lead: 'Start with a level 1 agent:', text: `open to anyone; what more opens waits on ${whose(c)} standings.` },
        { kind: 'info', lead: 'An R&D agent', text: `asks its corporation for −2, 1, 3 or 5 at levels 1 to 4, or its faction for that with the corporation no more than 2 under.` },
        { kind: 'info', lead: 'Standing rises', text: 'with missions for the corporation’s security and distribution agents, listed here where they’re open now.' },
      ]} />
      <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
        <table className="tbl compact rd-table">
          <thead>
            <tr>
              <Th left tip="Each corporation with R&D agents (CCP’s static data), its faction, and how far its nearest agent is from Jita on a route that stays in high-sec. Its name’s tip counts its agents by level.">Corporation</Th>
              <Th className="rd-wide" tip="Effective: the raw standing lifted by Connections (or Diplomacy, when negative). No standing stays none, whatever the skills.">Faction</Th>
              <Th className="rd-wide">Corporation</Th>
              <Th className="rd-wide">Open now</Th>
              <Th left className="rd-wide">Next level asks</Th>
              <Th left className="rd-wide" tip="Its security and distribution agents open to this character now, best level first, then nearest. Their missions raise the corporation’s standing.">Raise it with</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const f = standingSaid(c, r.factionRaw, r.factionEff), co = standingSaid(c, r.corpRaw, r.corpEff);
              const nearest = r.nearest != null ? `${r.nearest} jumps` : 'no high-sec route';
              return (
                <tr key={r.corp}>
                  <td className="l rd-main">
                    <span className="name" style={{ display: 'block' }} data-tip={`R&D agents at levels 1 to 4: ${r.byLevel[1]}, ${r.byLevel[2]}, ${r.byLevel[3]} and ${r.byLevel[4]}.`}>{w.name(r.corp)}</span><span className="sub">{w.name(r.faction)} · nearest {nearest}</span>
                    <span className="rd-phone">
                      <span>{w.name(r.faction)}: <b>{f.text}</b>{f.sub ? ` (${f.sub})` : ''} · corporation: <b>{co.text}</b>{co.sub ? ` (${co.sub})` : ''}</span>
                      <span>{r.open ? <b>Level {r.open} open now</b> : 'Nothing open now'}{r.next ? `. ${nextSaid(w, r)}` : ''}</span>
                      {r.helpers[0] && <span>Raise it with {r.helpers[0].name}: level {r.helpers[0].level} {r.helpers[0].division}, {w.sys(r.helpers[0].system)?.name ?? `system ${r.helpers[0].system}`}{r.helpers[0].jumps != null ? `, ${r.helpers[0].jumps} jumps` : ''}{r.helpers.length > 1 ? `, and ${r.helpers.length - 1} more` : ''}</span>}
                    </span>
                  </td>
                  <td className="rd-wide"><span data-tip={f.tip}>{f.text}</span>{f.sub && <span className="sub">{f.sub}</span>}</td>
                  <td className="rd-wide"><span data-tip={co.tip}>{co.text}</span>{co.sub && <span className="sub">{co.sub}</span>}</td>
                  <td className="rd-wide">{r.open ? `Level ${r.open}` : <span className="faint">None</span>}{c.standings.state !== 'read' && <span className="sub">at least</span>}</td>
                  <td className="l wrap rd-wide" style={{ minWidth: 180 }}>{r.next ? nextSaid(w, r) : <span className="faint">Every level is open</span>}</td>
                  <td className="l wrap rd-wide" style={{ minWidth: 180 }}>
                    {r.helpers.length ? r.helpers.slice(0, 2).map((h) => (
                      <span key={h.id} className="sub" style={{ whiteSpace: 'normal' }}>{h.name}: level {h.level} {h.division}, {w.sys(h.system)?.name ?? `system ${h.system}`}{h.jumps != null ? `, ${h.jumps} jumps` : ', off a high-sec route'}</span>
                    )) : <span className="faint">None open yet</span>}
                    {r.helpers.length > 2 && <span className="sub">and {r.helpers.length - 2} more</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {w.corps.length > rows.length && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(true)}>Show all {w.corps.length} corporations</button>}
    </Step>
  );
}

// ---- Step 3 ---------------------------------------------------------------------------------------------------

/** Whether a listed agent can be started now, and what stands in the way when not. */
function forYou(w: Walk, r: RankedAgent): { ok: boolean; text: string } {
  const gaps = skillGaps(r.field, r.agent.level, w.c.pilot.skills);
  if (!r.open) return { ok: false, text: `Needs ${needSaid(r.agent.level, w.name(r.agent.corp), w.name(r.agent.faction))}` };
  if (gaps == null) return { ok: false, text: 'Open; skills not read yet' };
  if (gaps.length) return { ok: false, text: `Open; train ${gaps.map((g) => `${SKILL_NAMES[g.id] ?? g.id} ${ROMAN[g.level]}`).join(', ')}` };
  return { ok: true, text: 'Open now' };
}

/** Set as the destination in the logged-in character's client: the main's, whoever the tab is shown for. */
export function DestButton({ w, station, label, narrow }: { w: Walk; station: number; label?: string; narrow?: boolean }) {
  if (!hasScope(SCOPE.waypoint)) return null;
  const said = w.c.isMain ? (label ?? 'Set destination') : `Sets ${w.mainName}’s destination`;
  const go = async () => {
    try { await setDestination(station); toast(`Destination set in ${w.c.isMain ? 'your' : `${w.mainName}’s`} client.`, 'info'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
  };
  return (
    <button type="button" className="dest-btn" style={narrow ? { whiteSpace: 'normal', maxWidth: 140, textAlign: 'right' } : undefined} onClick={() => void go()} data-tip-title="Set destination"
      data-tip={w.c.isMain ? 'Plots the route to the agent’s station in game. It doesn’t fly anything.' : `ESI sets the logged-in character’s destination, which is ${w.mainName}, not ${w.c.name}. It plots the route; it doesn’t fly anything.`}>
      {said}<MapPin aria-hidden="true" />
    </button>
  );
}

/**
 * Pick agents and a field: each field's datacore (its bid after tax and the fee, its year, how much trades, the
 * skillbook's price, how many agents open to this character research it), then the agents open now or nearly, ranked by
 * ISK a day at this character's skills.
 */
export function PickStep({ w }: { w: Walk }) {
  const { c, pick } = w;
  const [every, setEvery] = useState(false);
  const [all, setAll] = useState(false);
  const fields = useMemo(() => Object.keys(FIELDS).map(Number).map((f) => {
    const dc = DATACORE_OF[f];
    const h = w.hist[dc];
    return {
      f, dc,
      net: w.net[dc] ?? null,
      year: h && h !== 'failed' ? fieldYear(h, w.now) : h,
      open: new Set(w.listed.filter((r) => r.field === f && r.open).map((r) => r.agent.id)).size,
      nearly: new Set(w.listed.filter((r) => r.field === f && !r.open).map((r) => r.agent.id)).size,
    };
  }).sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity) || b.open - a.open || a.f - b.f), [w.listed, w.net, w.hist, w.now]);
  const bestFor = (f: number) => w.listed.find((r) => r.field === f) ?? null;

  const rows = useMemo(() => {
    if (!every && pick) return w.listed.filter((r) => r.field === pick.field);
    const seen = new Set<number>();
    return w.listed.filter((r) => (seen.has(r.agent.id) ? false : (seen.add(r.agent.id), true)));
  }, [w.listed, every, pick]);
  const shown = all ? rows : rows.slice(0, 12);

  return (
    <Step n={3} title="Pick agents and a field" done={w.kept}>
      <Points compact items={[
        { kind: 'info', lead: 'The field', text: 'barely changes what a day pays: most datacores sit near one price. Its skillbook’s price and how many agents near you research it matter more.' },
        { kind: 'warn', lead: 'One field at several agents', text: 'isn’t confirmed: no source says two agents can’t research the same field, and none says they can.' },
      ]} />
      <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
        <table className="tbl compact rd-table">
          <thead>
            <tr>
              <Th left>Field</Th>
              <Th className="rd-wide" tip={`What one datacore fetches sold into Jita’s best bid now, after ${whose(c)} sales tax and the agent’s ${isk(DATACORE_FEE)} fee.`}>A datacore</Th>
              <Th className="rd-wide" tip="The last 30 days’ volume-weighted price against the same a year ago (335–395 days back), with each month of the year drawn. The Forge’s history.">Its year</Th>
              <Th className="rd-wide" tip="Units traded a day in The Forge over the last 30 days: far more than an agent makes, so selling never moves the price.">A day</Th>
              <Th className="rd-wide" tip="The field’s skillbook, where it’s cheapest in The Forge now: Jita’s cheapest listing, or NPCs’ in another station. Read only for books not injected.">Its book</Th>
              <Th className="rd-wide" tip={`Distinct agents in this field open to ${who(c)} now, and one level past (nearly).`}>Agents</Th>
              <th scope="col" aria-label="Pick" />
            </tr>
          </thead>
          <tbody>
            {fields.map((x) => {
              const on = pick?.field === x.f;
              const best = bestFor(x.f);
              const y = x.year;
              return (
                <tr key={x.f} className={on ? 'chosen' : 'hover'}>
                  <td className="l rd-main">
                    <span className="name" style={{ display: 'block' }}>{FIELDS[x.f].name}</span><span className="sub rd-wide">{datacoreName(x.f)}</span>
                    <span className="rd-phone">
                      <span>A datacore: <b>{netSaid(w, x.dc)}</b>{y && y !== 'failed' && y.change != null ? ` · ${y.change >= 0 ? '+' : ''}${pct(y.change, 0)} on a year` : ''}</span>
                      <span>{x.open} agents open, {x.nearly} nearly · book: {c.pilot.skills?.[x.f] != null ? 'injected' : bookSaid(w, x.f)}</span>
                    </span>
                  </td>
                  <td className="rd-wide">{netSaid(w, x.dc)}</td>
                  <td className="rd-wide" style={{ minWidth: 150 }}>
                    {y === undefined ? <span className="faint">Reading…</span> : y === 'failed' ? <span className="faint" data-tip="The Forge’s history couldn’t be read just now.">–</span>
                      : <>{y.change != null ? <span style={{ color: y.change >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{y.change >= 0 ? '+' : ''}{pct(y.change, 0)}</span> : <span className="faint" data-tip="No trading a year ago to compare with.">–</span>}
                        <Sparkline values={y.months.map((m) => m.price)} label={`${FIELDS[x.f].name} datacore, a year of monthly prices`} /></>}
                  </td>
                  <td className="rd-wide">{y && y !== 'failed' && y.perDay != null ? units(Math.round(y.perDay)) : <span className="faint">–</span>}</td>
                  <td className="rd-wide">{c.pilot.skills?.[x.f] != null ? <span className="faint" data-tip={`${who(c) === 'you' ? 'You' : c.name} already ${c.isMain ? 'have' : 'has'} it injected, at ${ROMAN[c.pilot.skills[x.f]]}.`}>Injected</span> : bookSaid(w, x.f)}</td>
                  <td className="rd-wide">{x.open} open{x.nearly ? <span className="sub">{x.nearly} nearly</span> : null}</td>
                  <td>{best ? <button type="button" className="pick-btn" aria-pressed={on} onClick={() => w.choose(best)}>{on ? 'Chosen' : 'Choose'}</button> : <span className="faint" data-tip={`No agent open to ${who(c)} or nearly researches it.`}>No agent</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {w.failed > 0 && <p className="note small" style={{ margin: 0 }}>{w.failed} of the books and histories couldn’t be read from ESI just now. <button type="button" className="link-btn" onClick={w.retry}>Try again</button></p>}

      <div className="row" style={{ gap: '8px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {pick && <Seg size="sm" label="Which agents" value={every ? 'every' : 'field'} onChange={(v) => setEvery(v === 'every')}
          options={[{ v: 'field', label: `In ${FIELDS[pick.field].name}` }, { v: 'every', label: 'Every field', tip: 'Each agent once, in its best-paying field' }]} />}
        <span className="note small" style={{ margin: 0 }}>Open to {who(c)} now, and one level past (nearly), best ISK a day first.</span>
      </div>
      {rows.length ? (
        <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
          <table className="tbl compact rd-table">
            <thead>
              <tr>
                <Th left>Agent</Th>
                <Th left className="rd-wide" tip="Its system and security, and jumps from Jita on a route that stays in high-sec (the bundled stargate map).">Where</Th>
                <Th left className="rd-wide" tip="Every field it researches; the row’s in bold. You pick one when you start it, fixed until you cancel.">Its fields</Th>
                <Th className="rd-wide" tip={`RP a day at ${whose(c)} skills, the field at least at the agent’s level: (1 + (20 + 5 × Negotiation + standing with the agent) ÷ 100) × (field + level)².`}>RP a day</Th>
                <Th className="rd-wide" tip={`RP a day ÷ ${RP_PER_DATACORE} × what a datacore fetches after tax and the fee.`}>ISK a day</Th>
                <Th left className="rd-wide">For {who(c)}</Th>
                <th scope="col" aria-label="Pick" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const s = w.sys(r.agent.system);
                const on = pick?.agent.id === r.agent.id && pick.field === r.field;
                const y = forYou(w, r);
                const anyJ = w.anyJumps(r.agent.system);
                return (
                  <tr key={`${r.agent.id}:${r.field}`} className={on ? 'chosen' : r.open ? 'hover' : 'hover dim'}>
                    <td className="l rd-main">
                      <span className="name" style={{ display: 'block' }}>{r.agent.name}</span><span className="sub">Level {r.agent.level} · {w.name(r.agent.corp)}</span>
                      <span className="rd-phone">
                        <span>{s ? `${s.name} ${secSaid(s.sec)}` : `System ${r.agent.system}`} · {r.jumps != null ? `${r.jumps} jumps` : <span style={{ color: 'var(--acc2)' }}>off a high-sec route</span>}</span>
                        <span>{FIELDS[r.field]?.name}: <b>{r.rpDay.toFixed(1)} RP</b>, <b>{netSaid(w, r.datacore, r.iskDay)}</b> a day</span>
                        <span style={{ color: y.ok ? 'var(--pos)' : undefined }}>{y.text}</span>
                        <span><DestButton w={w} station={r.agent.station} /></span>
                      </span>
                    </td>
                    <td className="l rd-wide">
                      <span style={{ display: 'block' }}>{s ? `${s.name} ${secSaid(s.sec)}` : `System ${r.agent.system}`}</span>
                      <span className="sub">{r.jumps != null ? `${r.jumps} jumps` : <span style={{ color: 'var(--acc2)' }} data-tip={anyJ != null ? `No route from Jita stays in high-sec: ${anyJ} jumps through low-sec or worse.` : 'No route from Jita on the stargate map.'}>Off a high-sec route</span>}</span>
                    </td>
                    <td className="l wrap rd-wide" style={{ minWidth: 150, fontFamily: 'var(--f-body)', fontSize: 12.5, lineHeight: 1.35 }}>
                      {r.agent.fields.map((f) => (f === r.field ? <b key={f} style={{ color: 'var(--ink)', fontWeight: 600 }}>{FIELDS[f]?.name ?? f}</b> : <span key={f}>{FIELDS[f]?.name ?? f}</span>)).reduce<ReactNode[]>((a, x, i) => (i ? [...a, ', ', x] : [x]), [])}
                    </td>
                    <td className="rd-wide">{r.rpDay.toFixed(1)}</td>
                    <td className="rd-wide">{netSaid(w, r.datacore, r.iskDay)}</td>
                    <td className="l wrap rd-wide" style={{ minWidth: 130, color: y.ok ? 'var(--pos)' : undefined }}>{y.text}</td>
                    <td>
                      <div className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
                        <button type="button" className="pick-btn" aria-pressed={on} onClick={() => w.choose(r)}>{on ? 'Picked' : 'Pick'}</button>
                        <span className="rd-wide"><DestButton w={w} station={r.agent.station} narrow /></span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>No agent is open to {who(c)} or one level past it.</p>}
      {rows.length > shown.length && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(true)}>Show all {rows.length} agents</button>}
    </Step>
  );
}

// ---- Step 4 ---------------------------------------------------------------------------------------------------

/**
 * The research read that ticks step 4 off (stage 2): the permission isn't asked for yet. One place, so the step that adds
 * it rewires this alone.
 */
function tickNote(c: ResearchChar): string {
  return c.isMain
    ? 'once the app reads your research. That needs EVE’s permission to read research agents, which the app doesn’t ask for yet: switch on the permission when it does, by logging in again once.'
    : `once the cloud reads ${c.name}’s research. That needs EVE’s permission to read research agents, which the app doesn’t ask for yet: switch on the permission when it does, by handing the cloud ${c.name}’s login again.`;
}

/** Start: what to do at the agent, in order, and what still stands in the way. */
export function StartStep({ w }: { w: Walk }) {
  const { c, pick } = w;
  const [station, setStation] = useState<string | null>(null);
  useEffect(() => {
    setStation(null);
    if (!pick) return;
    let alive = true;
    resolveNames([pick.agent.station]).then((n) => { if (alive) setStation(n[pick.agent.station] ?? null); }).catch(() => undefined);
    return () => { alive = false; };
  }, [pick?.agent.station]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pick) {
    return (
      <Step n={4} title="Start">
        <div className="locked"><Lock aria-hidden="true" />Pick an agent first: none is open to {who(c)} at {whose(c)} standings yet.</div>
      </Step>
    );
  }
  const s = w.sys(pick.agent.system);
  const y = forYou(w, pick);
  const field = FIELDS[pick.field].name;
  return (
    <Step n={4} title="Start">
      {!y.ok && <Notice kind="warn">{pick.agent.name} isn’t ready for {who(c)} yet: {y.text.replace(/^Open; /, '')}.</Notice>}
      <Points items={[
        { kind: 'tip', icon: Navigation, lead: 'Travel', text: <>to {s ? `${s.name} (${secSaid(s.sec)})` : `system ${pick.agent.system}`}, {pick.jumps != null ? `${pick.jumps} jumps from Jita` : 'off a high-sec route from Jita'}. <DestButton w={w} station={pick.agent.station} /></> },
        { kind: 'tip', icon: Anchor, lead: 'Dock', text: <>at {station ?? 'its station'}: the agent only talks in person.</> },
        { kind: 'tip', icon: MessageSquare, lead: 'Start Research', text: `in ${pick.agent.name}’s conversation (the station’s Agents tab).` },
        { kind: 'tip', icon: BookOpen, lead: 'Choose', text: `${field}: fixed until you cancel. Its points buy only its datacore, from this agent.` },
        { kind: 'info', icon: Shuffle, lead: 'A daily mission', text: 'is offered about once a day: optional, and declining it doesn’t cost standing (CCP). Doing it adds a day’s points.' },
        { kind: 'warn', icon: Ban, lead: 'Cancelling', text: 'loses every point held with the agent: buy its datacores first.' },
        { kind: 'info', icon: Undo2, lead: 'Ticks itself off', text: tickNote(c) },
      ]} />
    </Step>
  );
}
