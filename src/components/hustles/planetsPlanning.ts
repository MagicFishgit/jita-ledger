import { useEffect, useMemo, useState } from 'react';
import type { ColoniesDoc } from '../../lib/colonies';
import type { PlanetType } from '../../lib/pi';
import type { PiIndex } from '../../lib/piBundle';
import { assumedHeads, learnedRates, PI_READING, rateFor, type Learned } from '../../lib/piLearn';
import { customsLevel, planCharOf, planSteps, rankSetups, SETUP_KINDS, type PlanChar, type PlanInput, type Setup, type Steps } from '../../lib/piPlan';
import type { SystemPrefs } from '../../lib/planetsDoc';
import { useStable } from '../../lib/hooks';
import { useData } from '../../lib/store';
import type { IndustryChar } from './industryChars';
import { usePlanetMarket, useSystemPlanets, type PlanetMarket, type SystemPlanets, type SystemState } from './planetsMarket';

/**
 * A system's setups for the character shown, worked out once for whichever section asks (Plan ranks them, the Chart says which of
 * them make a good), so the two always read one ranking from one input. The inputs (customs tax per planet type with a planet's
 * own, extraction rates learned or typed, the program length) are the synced `planets` doc's; where it sells is the `industry`
 * doc's. The planner (piPlan.ts) runs on a timer once the inputs settle, in slices of a few milliseconds, the last ranking shown
 * meanwhile, first on the morning's books and then again on the live books of the goods that ranking names. Only one section draws
 * at a time, so switching works the ranking out again (debounced, marked as working).
 */

/** The spec's default program length when the character has none of its own: 3 days. */
export const DEFAULT_PROGRAM_HOURS = 72;
/** How long the inputs must stay still before the setups are worked out again (the planner takes up to most of a second). */
const SETTLE_MS = 350;
/**
 * How long one slice of the planner may hold the page before handing it back (Ruling T11-13): each setup is worked out a step at a
 * time (`planSteps`), as many steps a slice as fit in this, so the chain's search of most of a second never runs as one task.
 */
const SLICE_MS = 8;
export const NO_SYS: SystemPrefs = { tax: {}, planetTax: {}, interbus: {}, notBrave: false, rates: {} };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export type LearnedFrom = {
  learned: Partial<Record<PlanetType, Record<string, Learned>>>; ownHours: number[]; defaultHours: number; programHours: number;
  /** The heads a line whose heads aren't known sits on: the median of the learned rates' heads (Ruling T15b-5). */
  heads: number | null;
};
/**
 * What the planet gives, learned from every character's kept colonies (Task 16: the main's, and each alt's the cloud keeps,
 * a refused alt's last read among them), by planet type and P0, and the program length they run: Plan and Colonies both read it, so
 * a colony is set against the planner's best on the rates Plan ranks on. Keyed on the documents' contents: Planets.tsx rebuilds the
 * map of them whenever the characters are.
 */
export function useLearned(colonies: Record<number, ColoniesDoc | undefined>, ix: PiIndex): LearnedFrom {
  const doc = useData().planets;
  const docs = useStable(Object.keys(colonies).map(Number).sort((a, b) => a - b).map((id) => colonies[id]).filter((x): x is ColoniesDoc => !!x));
  const learned = useMemo(() => learnedRates(docs, ix, PI_READING), [docs, ix]);
  const ownHours = useMemo(() => Object.values(learned).flatMap((byP0) => Object.values(byP0 ?? {}).map((l) => l.programHours)), [learned]);
  const defaultHours = ownHours.length ? median(ownHours) : DEFAULT_PROGRAM_HOURS;
  const heads = useMemo(() => assumedHeads(learned), [learned]);
  const programHours = doc.programHours ?? defaultHours;
  // One object while nothing in it moves: Colonies plans each colony's best again when it does.
  return useMemo(() => ({ learned, ownHours, defaultHours, programHours, heads }), [learned, ownHours, defaultHours, programHours, heads]);
}

type Planned = { setups: Setup[] | null; working: boolean };
/**
 * The five setups for an input, worked out once the input has stayed the same `SETTLE_MS`, in slices of `SLICE_MS` (each setup's
 * steps, one after another) so the page keeps drawing between them, and ranked. Between slices the page has its turn: a message
 * posted to itself, which nested timers would clamp to 4 ms each. An input that changes drops the run between two slices (its steps
 * are never asked for again). The last ranking stays (marked as being worked out again) until the new one lands; a different
 * `scope` (another system) drops it, since its planets are another system's.
 */
function usePlanned(input: PlanInput | null, scope: string | number | null): Planned {
  const [st, setSt] = useState<{ setups: Setup[] | null; for: PlanInput | null; scope: string | number | null }>({ setups: null, for: null, scope: null });
  useEffect(() => {
    if (!input) return;
    const of = input;
    let alive = true;
    const done: Setup[] = [];
    let steps: Steps<Setup> | null = null;
    const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slice = () => {
      if (!alive) return;
      const until = performance.now() + SLICE_MS;
      do {
        steps ??= planSteps(of, SETUP_KINDS[done.length]);
        const r = steps.next();
        if (r.done) {
          done.push(r.value);
          steps = null;
          if (done.length === SETUP_KINDS.length) { setSt({ setups: rankSetups(done), for: of, scope }); return; }
        }
      } while (performance.now() < until);
      if (channel) channel.port2.postMessage(null); else timer = setTimeout(slice, 0);
    };
    if (channel) channel.port1.onmessage = slice;
    timer = setTimeout(slice, SETTLE_MS);
    return () => { alive = false; clearTimeout(timer); if (channel) { channel.port1.onmessage = null; channel.port1.close(); channel.port2.close(); } };
  }, [input, scope]);
  const mine = st.scope === scope ? st.setups : null;
  return { setups: input ? mine : null, working: !!input && st.for !== input };
}

/** The goods a ranking names (what its setups sell and buy), sorted, so the same goods keep one array. */
function goodsOf(setups: Setup[] | null): string {
  if (!setups) return '';
  const ids = new Set<number>();
  for (const s of setups) { for (const o of s.outputs) ids.add(o.id); for (const i of s.inputs) ids.add(i.id); }
  return [...ids].sort((a, b) => a - b).join(',');
}

export type Planning = {
  planChar: PlanChar; others: PlanChar[]; cce: number | null;
  sys: SystemState; value: SystemPlanets | null;
  learned: Partial<Record<PlanetType, Record<string, Learned>>>; ownHours: number[]; defaultHours: number; programHours: number; prefs: SystemPrefs;
  /** Prices on the morning's books (the first ranking's), and on the live books of the goods that ranking names. */
  morning: PlanetMarket; market: PlanetMarket;
  setups: Setup[] | null; working: boolean;
  /** The ranking is being worked out again only on the live books (the second pass), not for an input that changed. */
  livePass: boolean;
  /**
   * Plan it: the setups held to the good chosen (`only`), ranked, beside the ranking of every product above (which says what
   * choosing it costs); null while they're worked out, and with no good chosen. `heldWorking` and `heldLive` as `working` and
   * `livePass` for them.
   */
  held: Setup[] | null; heldWorking: boolean; heldLive: boolean;
};

export function usePlanning({ c, chars, colonies, ix, systemId, only = null }: {
  c: IndustryChar; chars: IndustryChar[]; colonies: Record<number, ColoniesDoc | undefined>; ix: PiIndex; systemId: number | null;
  /** Plan it: the good the Plan section is held to, or null for every product (the Chart passes none). */
  only?: number | null;
}): Planning {
  const doc = useData().planets;
  // Keyed on what the planner reads (the final review's I2), never on the character objects: those are rebuilt on every write to
  // the ledger (meta every few minutes: the last visit, the balance, each sync), which worked the planner out again for nothing.
  // A PlanChar is the ID, the name, the PI skills' levels and the clone, so equal ones are the same planner input.
  const planChar = useStable(planCharOf({ charId: c.charId, name: c.name, skills: c.pilot.skills, clone: c.clone }));
  const others = useStable(chars.filter((x) => x.charId !== c.charId).map((x) => planCharOf({ charId: x.charId, name: x.name, skills: x.pilot.skills, clone: x.clone })));
  const cce = customsLevel(c.pilot.skills);
  const sys = useSystemPlanets(systemId, ix, cce);
  const value = sys.state === 'ok' ? sys.value : null;

  const { learned, ownHours, defaultHours, programHours, heads } = useLearned(colonies, ix);
  const prefs = (systemId != null ? doc.systems[String(systemId)] : undefined) ?? NO_SYS;
  const rateOf = useMemo(() => (t: PlanetType, p0: number) => rateFor(learned, prefs.rates[t]?.[String(p0)], t, p0), [learned, prefs.rates]);

  const morning = usePlanetMarket(c, ix);
  const planets = value?.planets ?? null;
  const inputM = useMemo((): PlanInput | null => (planets && morning.ready
    ? { ix, planets, char: planChar, others, rateOf, heads, sell: morning.sell, buy: morning.buy, programHours, freight: morning.freight } : null),
  [ix, planets, planChar, others, rateOf, heads, morning.ready, morning.sell, morning.buy, morning.freight, programHours]);
  const first = usePlanned(inputM, systemId);
  // The goods to read live come from the ranking on the morning's books, never the live one: each live re-rank could name more.
  const goodsKey = goodsOf(first.setups);
  const live = useMemo(() => (goodsKey ? goodsKey.split(',').map(Number) : []), [goodsKey]);
  const market = usePlanetMarket(c, ix, { live });
  const inputL = useMemo((): PlanInput | null => (inputM && market.live && market.ready ? { ...inputM, sell: market.sell, buy: market.buy, freight: market.freight } : null),
    [inputM, market.live, market.ready, market.sell, market.buy, market.freight]);
  const second = usePlanned(inputL, systemId);
  const setups = (inputL && second.setups) ? second.setups : first.setups;
  const working = first.working || (!!inputL && second.working);
  const livePass = !first.working && !!inputL && second.working;

  // Plan it: the same input held to one good, worked out beside the ranking of every product (whose best the head line compares it
  // with), on live books of its own: one live set for both would read the held ranking's goods into the full ranking's prices and work
  // it out again for nothing. Scoped to the system and the good, so another good's held ranking never stands in for this one.
  const inputMO = useMemo((): PlanInput | null => (inputM && only != null ? { ...inputM, only } : null), [inputM, only]);
  const heldScope = `${systemId}:${only}`;
  const firstO = usePlanned(inputMO, heldScope);
  const goodsKeyO = goodsOf(firstO.setups);
  const liveO = useMemo(() => (goodsKeyO ? goodsKeyO.split(',').map(Number) : []), [goodsKeyO]);
  const marketO = usePlanetMarket(c, ix, { live: liveO });
  const inputLO = useMemo((): PlanInput | null => (inputMO && marketO.live && marketO.ready ? { ...inputMO, sell: marketO.sell, buy: marketO.buy, freight: marketO.freight } : null),
    [inputMO, marketO.live, marketO.ready, marketO.sell, marketO.buy, marketO.freight]);
  const secondO = usePlanned(inputLO, heldScope);
  const held = only == null ? null : (inputLO && secondO.setups) ? secondO.setups : firstO.setups;
  const heldWorking = only != null && (firstO.working || (!!inputLO && secondO.working));
  const heldLive = only != null && !firstO.working && !!inputLO && secondO.working;

  return { planChar, others, cce, sys, value, learned, ownHours, defaultHours, programHours, prefs, morning, market, setups, working, livePass, held, heldWorking, heldLive };
}
