/**
 * Check my setup (docs/notes/planets-board.md): one planet of a plan set against the colony a character has built there, as its chain
 * reads it (colonyChain.ts). It judges the outcome, never the counts: each good the plan needs from the planet made and sent on at the
 * plan's amount a day or more, the factory planet's inputs reaching its factories and its product leaving. More factories, heads,
 * storage or launchpads than planned, another arrangement that works, a line the plan marks Extra doing something else, a higher Command
 * Center Upgrades level: never a fault (the user, 24 October 2026: "just be sure it doesn't moan if i was able to fit 3 factories if it
 * recommends 2 for example because that is better"). Pure: no store, React or DOM.
 */
import type { Chain } from './colonyChain';
import type { Facility, PiIndex } from './piBundle';
import { poorShare } from './piLearn';
import type { Role } from './piPlan';
import { dayCount } from './split';

/** Under this share of the plan's amount a day, a good is clearly short (the user's "not too tight"); from it up, it's made as planned. */
export const SHORT_UNDER = 0.9;
/** At least this much over the plan's amount a day is said as more than planned, once; nearer, it's as planned. */
export const MORE_OVER = 0.05;
const EPS = 1e-6;
const TIERS = ['P0', 'P1', 'P2', 'P3', 'P4'];
const FAC: Record<Facility, [string, string]> = { basic: ['Basic', 'Basic'], advanced: ['Advanced', 'Advanced'], hightech: ['High-Tech', 'High-Tech'] };

/**
 * One line of the result. `ok`: a good the plan needs, made and sent on as planned (`plus` when it's more than planned, said once), or
 * what reaches a factory planet; `fault`: something to fix, with the chain's own words for why (`why`); `soon`: a programme ending, or
 * storage near full, to see to before it costs anything; `info`: said, never a fault (a planet whose own rate is poor, what can't be
 * told yet). `id`: the good it's about, when one.
 */
export type CheckItem = { kind: 'ok' | 'fault' | 'soon' | 'info'; id: number | null; said: string; plus?: true; why?: string[] };
/**
 * `known`: what the colony makes could be worked out (ESI sent each extractor's quantity a cycle). `judged`: how many goods the plan needs
 * were set against it (none: nothing was checked, never "All set"). `factory`: a factory planet's card, which judges only its own routes
 * and products, with what it takes in kept stocked: what reaches it is its feeders' cards' to say.
 */
export type SetupCheck = { known: boolean; items: CheckItem[]; faults: number; soon: number; judged: number; factory: boolean };

const add = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const uniq = (xs: string[]) => [...new Set(xs)];
/** Whether a flag's words name a good: as a whole name, so Water isn't found in Water-Cooled CPU. */
const mentions = (said: string, name: string) => new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(said);

/**
 * What the plan needs from a planet, by good, a day: from an extraction planet that feeds a factory planet, each good it ships to it, at
 * all it sends on of that good (the factory's share and what's sold beside: a line that tops up the factory takes the last 54 a day of
 * 1,920 the planet makes, and the planet built as planned makes 1,920, never "more than the plan's 54"); a good it only sells is extra.
 * From one that sells what it makes, what its factories make of their top tier that the plan ships (a surplus P1 left over beside a P2
 * is a by-product), less a line the plan marks Extra. A factory planet's are its product and its steps, judged apart (`setupCheck`).
 */
export function needsOf(role: Role, ix: PiIndex): Map<number, number> {
  const tier = (id: number) => TIERS.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const need = new Map<number, number>();
  const fed = role.ships.filter((s) => typeof s.to === 'number');
  if (fed.length) { for (const s of role.ships) if (fed.some((f) => f.id === s.id)) add(need, s.id, s.perDay); return need; }
  // The Basics are the extracts' own, in order (keptPlanetsOf reads them the same way): a line marked Extra makes nothing the plan needs.
  const basics = role.makes.filter((m) => m.facility === 'basic');
  const extra = new Set(role.extracts.map((e, i) => (e.extra ? basics[i]?.id : undefined)).filter((x): x is number => x != null));
  const made = role.makes.filter((m) => m.count > 0 && m.perDay > EPS && !extra.has(m.id) && role.ships.some((s) => s.id === m.id));
  const top = Math.max(-1, ...made.map((m) => tier(m.id)));
  for (const m of made) if (tier(m.id) === top) add(need, m.id, m.perDay);
  return need;
}

export function setupCheck(role: Role, chain: Chain, ix: PiIndex): SetupCheck {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  const tier = (id: number) => TIERS.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const items: CheckItem[] = [];
  const known = chain.extracts.every((e) => e.perHour != null) && chain.makes.every((m) => m.perDay != null);

  // What the colony makes a day (its extractors' P0 and its factories' goods), what it sends on, and its factories by product.
  const made = new Map<number, number>(), sent = new Map(chain.exported.map((x) => [x.id, x.perDay] as const));
  for (const m of chain.makes) if (m.perDay != null) add(made, m.id, m.perDay);
  for (const e of chain.extracts) if (e.perHour != null) add(made, e.p0, e.perHour * 24);
  const built = new Map<number, number>();
  for (const m of chain.makes) add(built, m.id, m.count);
  const imported = new Set(chain.imports.map((x) => x.id));

  // The chain's flags at the root, as the reasons for a fault: those about the good or what it's made from, down to P0.
  const related = (g: number): Set<number> => {
    const out = new Set([g]);
    const walk = (x: number) => { for (const i of ix.makes.get(x)?.inputs ?? []) if (!out.has(i.id)) { out.add(i.id); walk(i.id); } };
    walk(g);
    return out;
  };
  const used = new Set<string>();
  const reasons = (g: number, kinds: Chain['flags'][number]['flag'][] = ['starving', 'idle', 'buildingUp']): string[] => {
    const rel = related(g), names = [...rel].map(name);
    const out = uniq(chain.flags.filter((f) => kinds.includes(f.flag) && ((f.id != null && rel.has(f.id)) || (f.id == null && names.some((n) => mentions(f.said, n))))).map((f) => f.said));
    out.forEach((s) => used.add(s));
    return out;
  };
  // An idle pin that names no good (a factory with no schematic chosen): said only where nothing else says why a good isn't made.
  const idleUnnamed = () => uniq(chain.flags.filter((f) => f.flag === 'idle' && !used.has(f.said)).map((f) => f.said));

  // Programmes ended (a fault: reset the heads), ending soon and storage near full (to see to): always said, each once. Programmes that
  // end alike are said together ("The Suspended Plasma and Non-CS Crystals programmes end in 24 h"), in the chain's own words.
  const timed = new Map<string, { kind: CheckItem['kind']; goods: string[]; ids: number[]; said: string }>();
  for (const f of chain.flags) {
    const kind = f.flag === 'expired' ? 'fault' : 'soon';
    if (f.flag !== 'expired' && f.flag !== 'endingSoon' && f.flag !== 'storageFull') continue;
    const m = /^The (.+) programme (ends in|ended) ([^:]+)(:.*)$/.exec(f.said);
    if (!m || f.flag === 'storageFull') { items.push({ kind, id: f.id, said: f.said }); continue; }
    const key = `${f.flag}|${m[2]}|${m[3]}|${m[4]}`, g = timed.get(key);
    if (g) { g.goods.push(m[1]); if (f.id != null) g.ids.push(f.id); } else timed.set(key, { kind, goods: [m[1]], ids: f.id != null ? [f.id] : [], said: f.said });
  }
  for (const [key, g] of timed) {
    if (g.goods.length === 1) { items.push({ kind: g.kind, id: g.ids[0] ?? null, said: g.said }); continue; }
    const [, verb, when, rest] = key.split('|');
    const plural = rest.replace('reset its heads', 'reset their heads').replace('it extracts nothing until its heads are reset', 'they extract nothing until their heads are reset');
    items.push({ kind: g.kind, id: null, said: `The ${listSaid(uniq(g.goods))} programmes ${verb === 'ends in' ? 'end in' : 'ended'} ${when}${plural}` });
  }
  if (!known) {
    items.unshift({ kind: 'info', id: null, said: `What it makes can’t be told yet: ${chain.why ? chain.why.charAt(0).toLowerCase() + chain.why.slice(1) : 'its extractors’ rates aren’t known'}` });
    return done(items, false, 0, role.does === 'factory');
  }

  // Where the colony has fewer heads on a P0, or fewer factories on a good, than the plan: said only beside a shortfall it can explain.
  const headsHint = (g: number): string | null => {
    for (const p0 of [...related(g)].filter((x) => tier(x) === 0)) {
      const want = role.extracts.filter((e) => e.p0 === p0).reduce((n, e) => n + (e.heads ?? 0), 0);
      const ecus = chain.extracts.filter((e) => e.p0 === p0);
      const have = ecus.reduce((n, e) => n + e.heads, 0);
      if (want > 0 && have > 0 && have < want) return `Its ${name(p0)} extractor${ecus.length > 1 ? 's run' : ' runs'} ${have} head${have === 1 ? '' : 's'} where the plan has ${want}`;
    }
    return null;
  };
  const countHint = (g: number, plan: { facility: Facility; count: number } | null): string | null => {
    const n = built.get(g) ?? 0;
    return plan && n < plan.count ? `It has ${n} ${FAC[plan.facility][0]} on ${name(g)} where the plan has ${plan.count}` : null;
  };
  // A good of the same tier made instead of one the plan has is paired with it once.
  const swapped = new Set<number>();

  /** One good the plan needs a day, set against what the colony makes and sends on. `kept`: said as a factory's figure kept stocked. */
  const judge = (g: number, want: number, plan: { facility: Facility; count: number } | null, others: Set<number>, kept = false) => {
    const m = made.get(g) ?? 0, s = sent.get(g) ?? 0;
    if (!(m > EPS)) {
      // A good of the same tier the plan doesn't have, made instead: "makes Precious Metals where the plan has Electrolytes".
      const instead = [...made.keys()].filter((h) => h !== g && tier(h) === tier(g) && !others.has(h) && (made.get(h) ?? 0) > EPS && !swapped.has(h)).sort((a, b) => a - b)[0];
      if (instead != null) {
        swapped.add(instead);
        // The chain's root cause beside it, when it has one (an extractor with no programme, one ended, an input starving, a pin idle).
        const why = reasons(g, ['starving', 'idle', 'buildingUp', 'expired']);
        items.push({ kind: 'fault', id: g, said: `Makes ${name(instead)} where the plan has ${name(g)}`, ...(why.length ? { why } : {}) });
        return;
      }
      const why = reasons(g), n = built.get(g) ?? 0;
      items.push({ kind: 'fault', id: g, said: `Doesn’t make ${name(g)}`, why: why.length ? why : idleUnnamed().length ? idleUnnamed()
        : [n > 0 ? `Its ${n} factor${n === 1 ? 'y' : 'ies'} on ${name(g)} make none` : `No factory on the planet makes ${name(g)}`] });
      return;
    }
    if (s < SHORT_UNDER * want - EPS) {
      const why = s > EPS ? reasons(g) : reasons(g, ['buildingUp', 'starving']);
      if (!(s > EPS)) {
        items.push({ kind: 'fault', id: g, said: `Makes ${dayCount(m)} ${name(g)} a day but sends none on`, why: why.length ? why : [`None of it is routed to storage or a launchpad`] });
        return;
      }
      const hints = [countHint(g, plan), headsHint(g)].filter((x): x is string => !!x);
      items.push({ kind: 'fault', id: g, said: `Sends on ${dayCount(s)} ${name(g)} a day, under the plan’s ${dayCount(want)}${m > s * (1 + MORE_OVER) ? ` (it makes ${dayCount(m)})` : ''}`, why: [...why, ...hints] });
      return;
    }
    const what = kept ? `Can make ${dayCount(s)} ${name(g)} a day kept stocked` : `Makes and sends on ${dayCount(s)} ${name(g)} a day`;
    if (s >= (1 + MORE_OVER) * want) {
      const n = built.get(g) ?? 0;
      const more = plan && n > plan.count ? `: ${n} ${FAC[plan.facility][0]} where the plan has ${plan.count}` : '';
      items.push({ kind: 'ok', id: g, said: `${what}, more than the plan’s ${dayCount(want)}${more}`, plus: true });
    } else items.push({ kind: 'ok', id: g, said: s >= want - EPS ? `${what}, as the plan has` : `${what}, about the plan’s ${dayCount(want)}` });
  };

  // Everything the plan's planet makes or extracts: a good of the same tier made beside these isn't "instead".
  const planGoods = new Set([...role.makes.map((m) => m.id), ...role.extracts.map((e) => e.p0)]);
  const planOf = (g: number) => role.makes.find((m) => m.id === g) ?? null;

  if (role.does === 'factory') {
    // The factory planet: what it sells (its product), the steps that make it, and what's brought in for them.
    const tops = uniq(role.ships.filter((s) => s.to === 'market').map((s) => String(s.id))).map(Number);
    const product = tops.length ? tops : role.makes.filter((m) => tier(m.id) === Math.max(-1, ...role.makes.map((x) => tier(x.id)))).map((m) => m.id);
    if (!product.length) {
      items.push({ kind: 'info', id: null, said: 'The plan sends nothing on from this planet, so nothing here was checked' });
      return done(items, true, 0, true);
    }
    const steps = role.makes.filter((m) => m.count > 0 && !product.includes(m.id)).sort((a, b) => tier(a.id) - tier(b.id) || a.id - b.id);
    // Inputs: made on the planet, brought in (kept stocked), or drawn by a factory that takes it with nothing saying it doesn't reach.
    const takes = (i: number) => chain.makes.some((m) => ix.makes.get(m.id)?.inputs.some((x) => x.id === i));
    const missing = (i: number) => chain.flags.find((f) => f.flag === 'starving' && f.pinId != null && (f.id === i || mentions(f.said, name(i))));
    const productOk = product.every((t) => (made.get(t) ?? 0) >= SHORT_UNDER * (planOf(t)?.perDay ?? 0) - EPS && (sent.get(t) ?? 0) > EPS);
    const inOk: number[] = [];
    for (const imp of role.imports ?? []) {
      const i = imp.id;
      if ((made.get(i) ?? 0) > EPS || imported.has(i)) { inOk.push(i); continue; }
      const flag = missing(i);
      if (flag) { used.add(flag.said); items.push({ kind: 'fault', id: i, said: `${name(i)} isn’t routed into the factories that take it`, why: [flag.said] }); continue; }
      if (takes(i)) { inOk.push(i); continue; }
      // No factory takes it: the colony makes what it goes into another way (brings that in), or the step itself is said below.
    }
    if (inOk.length) items.push({ kind: 'ok', id: null, said: `${listSaid(inOk.map(name))} ${inOk.length === 1 ? 'is' : 'are'} routed into its factories` });
    // A good downstream of a fault already said (an input that doesn't reach, a step not made) waits on it: said so, rather than with
    // the chain's own words for what follows from it.
    const waits = (g: number, m: number): string[] | null => {
      const rel = related(g);
      return items.some((x) => x.kind === 'fault' && x.id != null && x.id !== g && rel.has(x.id))
        ? [m > EPS ? 'It’s short until what’s above reaches its factories' : 'Its factories make none until what’s above reaches them'] : null;
    };
    const stepOk: number[] = [];
    for (const st of steps) {
      const m = made.get(st.id) ?? 0;
      if (m >= SHORT_UNDER * st.perDay - EPS || imported.has(st.id)) { if (m > EPS) stepOk.push(st.id); continue; }
      // Short or missing, but the product comes out as planned: another arrangement that works, never a fault.
      if (productOk) continue;
      const why = waits(st.id, m) ?? [...reasons(st.id), ...(m > EPS ? [countHint(st.id, st)].filter((x): x is string => !!x) : [])];
      if (!(m > EPS)) items.push({ kind: 'fault', id: st.id, said: `Doesn’t make ${name(st.id)}`, why: why.length ? why : [`No factory on the planet makes ${name(st.id)}: the plan has ${st.count} ${FAC[st.facility][0]} on it`] });
      else items.push({ kind: 'fault', id: st.id, said: `Makes ${dayCount(m)} ${name(st.id)} a day, under the plan’s ${dayCount(st.perDay)}`, why });
    }
    if (stepOk.length) items.push({ kind: 'ok', id: null, said: `Makes ${listSaid(stepOk.map(name))} on the planet` });
    for (const t of product) {
      const before = items.length;
      const wait = waits(t, made.get(t) ?? 0);
      judge(t, planOf(t)?.perDay ?? 0, planOf(t), planGoods, (role.imports ?? []).length > 0);
      const it = items[before];
      if (it?.kind === 'fault' && wait) it.why = wait;
    }
    // What this card can't judge (Minor 4 of the review): whether its feeders send what it takes; said, so its summary isn't read as more.
    const bought = (role.imports ?? []).length > 0 && (role.imports ?? []).every((x) => x.from === 'market');
    if ((role.imports ?? []).length) items.push({ kind: 'info', id: null, said: bought
      ? 'Judged here: its routes and what it makes, with what it buys kept stocked'
      : 'Judged here: its routes and what it makes, with what it takes in kept stocked; whether its feeders send that is on their cards' });
    return done(items, true, product.length, true);
  }

  // An extraction planet: each good the plan needs from it.
  const needs = [...needsOf(role, ix)].sort((a, b) => tier(a[0]) - tier(b[0]) || a[0] - b[0]);
  for (const [g, want] of needs) judge(g, want, planOf(g), planGoods);
  if (!needs.length) items.push({ kind: 'info', id: null, said: 'The plan sends nothing on from this planet, so nothing here was checked' });
  // A planet whose own rate is well under its type's (planet rates): said as it is, never a fault (the plan is worked out at it).
  for (const e of role.extracts) {
    const share = poorShare(e.rate);
    if (share != null) items.push({ kind: 'info', id: e.p0, said: `This planet gives about ${Math.round(share * 100)}% a head of your other ${chain.planetType ? `${chain.planetType} ` : ''}planets’ ${name(e.p0)}, learned on it: the plan is worked out at that` });
  }
  return done(items, true, needs.length, false);
}

/** Faults first, then what's to see to, then what's as planned, then what's said for information; counted. */
function done(items: CheckItem[], known: boolean, judged: number, factory: boolean): SetupCheck {
  const order = { fault: 0, soon: 1, ok: 2, info: 3 } as const;
  const seen = new Set<string>();
  const out = items.filter((x) => (seen.has(x.kind + x.said) ? false : (seen.add(x.kind + x.said), true))).sort((a, b) => order[a.kind] - order[b.kind]);
  return { known, items: out, faults: out.filter((x) => x.kind === 'fault').length, soon: out.filter((x) => x.kind === 'soon').length, judged, factory };
}

/** A factory planet's feeders as their own cards judged them for this character: how many there are, how many were checked, their faults. */
export type FeedersChecked = { of: number; checked: number; faults: number };

/**
 * The line a result is summed up in: what's to fix; that it can't be told yet; that nothing was checked; else all set, what's to see to
 * beside it. A factory planet's card judges only its own routes and products, so it reads "Routes set" until every feeder's card has been
 * checked for this character with nothing to fix (Minor 4 of the review); one with no feeders (bought) always reads "Routes set".
 */
export function checkSaid(c: SetupCheck, feeders?: FeedersChecked): string {
  if (c.faults) return `${c.faults} thing${c.faults === 1 ? '' : 's'} to fix`;
  if (!c.known) return 'Can’t tell yet';
  if (!c.judged) return 'Nothing here to check';
  const soon = c.soon ? ` · ${c.soon} to see to` : '';
  if (c.factory) {
    if (!feeders || !feeders.of) return `Routes set${soon}`;
    if (feeders.checked < feeders.of) return `Routes set${soon} · ${feeders.of - feeders.checked} of its ${feeders.of} feeders not checked yet`;
    if (feeders.faults) return `Routes set${soon} · its feeders have ${feeders.faults} thing${feeders.faults === 1 ? '' : 's'} to fix`;
  }
  return `All set${soon}`;
}

/**
 * Whether an alt's copy here was pulled after the cloud read it (Important 1 of the review): null when it was, else why not. The cloud's
 * read can land and the pull after it not (the roster's read failed, the cloud was switched off, the copy is behind the roster's
 * revision): then nothing is judged as fresh. `since`: when the cloud's read came back.
 */
export type AltPullState = {
  error: string | null; rosterAt: number | null; rosterLive: boolean; failedAlt: { charId: number; message: string } | null;
  roster: readonly { charId: number; rev: number }[]; alts: Readonly<Record<number, { rev: number } | undefined>>;
};
export function altPulledWhy(a: AltPullState, id: number, since: number): string | null {
  if (a.failedAlt?.charId === id) return a.failedAlt.message;
  if (a.error) return a.error;
  if (!a.rosterLive || a.rosterAt == null || a.rosterAt < since) return 'the cloud’s list of your characters wasn’t read again';
  const entry = a.roster.find((r) => r.charId === id);
  if (!entry) return 'the cloud no longer lists this character';
  const copy = a.alts[id];
  if (!copy || copy.rev < entry.rev) return 'its copy here is behind the cloud’s';
  return null;
}

/**
 * Whether the main's colonies were read just now (Minor 3 of the review): null when a read finished after the one held before (`before`,
 * its time), else why not. A read already running makes `readColonies` hand back the last one unread.
 */
export function mainReadWhy(before: string | null, after: { read: { at: string } | null; error: string | null; busy: string | null }): string | null {
  if (after.error) return after.error;
  if (after.busy) return 'another read of your colonies was still running';
  if (!after.read || after.read.at === before) return 'no new read of them came back';
  return null;
}
