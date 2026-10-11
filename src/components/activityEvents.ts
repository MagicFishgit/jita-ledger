import { useEffect, useMemo, useState } from 'react';
import { loadTypeSets } from '../lib/attribution';
import { classify } from '../lib/killmails';
import { activityEvents, type BuiltInputs, type LossActs } from '../lib/income';
import { materialsFor, rigFor, secBand, structureBonus, type Indexed, type SecBand } from '../lib/industry';
import { jobPlace, type MatsOf } from '../lib/industryTrack';
import { computePosition } from '../lib/positions';
import type { IndustrySite } from '../lib/prefs';
import type { TypeSets } from '../lib/results';
import { useData, type Data } from '../lib/store';
import { useAuth } from '../lib/hooks';
import { reloadApp } from '../lib/reload';
import { ownIds } from '../lib/roster';
import type { Activity } from '../lib/types';
import { system } from '../lib/universe';
import { useEnsureNames } from './common';
import { loadIndustry } from './hustles/industryBundle';

/**
 * Every ISK movement attributed to an activity by Results' rules (lib/income.ts), for Results and for the Wallet's "All
 * income against play": this reads what the rules need (the item groups that say which activity a trade is, positions'
 * realized profit, ships lost by what they were doing) and hands it in. Also the sales no activity counts (`others`), which
 * only the Wallet adds. The main's ledger unless one is given.
 *
 * Entries naming two of your characters (`mine`) are left out. A courier reward names the Secure Commerce Commission as
 * its payer (the contract's escrow, 1000132 in the user's journal), not the issuer, so it stays Hauling even when your
 * own character issued it. Without a ledger the set is the logged-in character and the ledger's `chars`, as the Wallet
 * builds it; with one, the caller hands it in (the Characters page gives every card the same family, an alt's copy
 * holding no `chars` of its own), memoised, since a new set works the events out again. Absent: as before.
 */

export const ACTIVITY_COLOR: Record<Activity, string> = {
  Trading: 'var(--acc)', Loyalty: '#a98bff', Planets: '#6ee7a8', Hauling: 'var(--acc2)', Abyssal: '#ff8d9a', Combat: '#7aa6ff', Freelance: '#f5b86b', Industry: '#5fd0c0', Rewards: '#e9e37a',
};

/**
 * Industry's materials for a ledger (correction 10 of the stage-2 plan): the bundle (its own chunk, loadIndustry) is loaded
 * only when the ledger holds a manufacturing job with a recorded ME, and a structure site's security (`system`, one public
 * read) only when it has rigs. `state` is `loading` while either is loading for a ledger that needs them, `none` for one
 * that doesn't. The sites are the main's `industry` doc (yours, whichever character ran the job). Where a job ran is Task
 * 11's rule (`jobPlace`): an NPC station has no material bonus, so a job at any is known; a structure only when it is one
 * of your sites with a structure ID (a home typed in has none) and its kind's bonuses and rigs could be applied.
 */
function useBuiltInputs(d: Data, sites: readonly IndustrySite[]): BuiltInputs & { retry: () => void } {
  const needs = useMemo(() => Object.values(d.jobs ?? {}).some((j) => j.activity === 1 && j.first?.me != null && j.status !== 'cancelled' && j.status !== 'reverted'), [d.jobs]);
  const rigged = useMemo(() => [...new Set(sites.filter((s) => s.kind !== 'npc' && s.rigs.length).map((s) => s.systemId))].sort((a, b) => a - b).join(','), [sites]);
  const [ix, setIx] = useState<Indexed | 'failed' | null>(null);
  const [bands, setBands] = useState<Record<number, SecBand> | null>(null);
  useEffect(() => {
    if (!needs) return;
    let alive = true;
    loadIndustry().then((x) => { if (alive) setIx(x); }, () => { if (alive) setIx('failed'); });
    return () => { alive = false; };
  }, [needs]);
  useEffect(() => {
    if (!needs) return;
    let alive = true;
    Promise.all((rigged ? rigged.split(',').map(Number) : []).map((id) => system(id).then((s) => [id, secBand(s.security)] as const).catch(() => [id, 'unknown' as SecBand] as const)))
      .then((r) => { if (alive) setBands(Object.fromEntries(r)); });
    return () => { alive = false; };
  }, [needs, rigged]);
  const mats = useMemo((): MatsOf | null => {
    if (!needs || !ix || ix === 'failed' || !bands) return null;
    return (j) => {
      const m = ix.bp.get(j.blueprintTypeId)?.[2];
      const me = j.first?.me;
      if (!m || me == null) return null;
      const place = jobPlace(j, sites, (s) => bands[s.systemId] ?? 'unknown');
      // Not at a site the app knows (a structure that isn't one of your sites, or a home you typed in): no bonuses applied, said.
      if (!place) return { mats: materialsFor(m[1], j.runs, me, 1, 1), atSite: false };
      const sb = structureBonus(ix, place.kind).material;
      const rig = rigFor(ix, place.rigs, place.kind, place.band, j.productTypeId, 'manufacturing').material;
      // A site of kind Other has no bonuses the app knows, and a site with rigs whose system's security couldn't be read takes
      // none of them (rigFor's 'unknown'): both said with the jobs not at a site, never left out unsaid.
      const unknown = place.kind === 'other' || (place.kind !== 'npc' && place.rigs.length > 0 && place.band === 'unknown');
      return { mats: materialsFor(m[1], j.runs, me, sb, rig), atSite: !unknown };
    };
  }, [needs, ix, bands, sites]);
  const state: BuiltInputs['state'] = !needs ? 'none' : ix === 'failed' ? 'failed' : ix && bands ? 'ready' : 'loading';
  return { state, mats, retry: retryBuilt };
}
/**
 * Trying again after the blueprints failed to load reloads the app: Chromium keeps a failed dynamic import for the life of
 * the document and answers every later `import()` of it with the same failure, never asking again (probed 11 October 2026,
 * on Vite's dev server and on the production build's chunk: one request, then none in the same document, then loaded after a
 * reload; gotchas.md),
 * so asking `loadIndustry` again in place would do nothing. `reloadApp` writes what's waiting to be saved first.
 */
const retryBuilt = () => { void reloadApp(); };

export function useActivityEvents(ledger?: Data, mine?: Set<number>) {
  const live = useData();
  const auth = useAuth();
  const d = ledger ?? live;
  const ownMain = useMemo(() => (auth?.characterId != null ? ownIds(auth.characterId, live.chars) : undefined), [auth?.characterId, live.chars]);
  const own = ledger ? mine : ownMain;
  const corps = (d.meta.lpBalances ?? []).map((b) => b.corporationId);
  const [sets, setSets] = useState<TypeSets | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadTypeSets(corps).then((s) => { if (alive) setSets(s); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [corps.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutaplasmids have no market group of their own, so they need names before they can be recognised.
  const traded = useMemo(() => [...new Set(Object.values(d.txs).map((t) => t.typeId))], [d.txs]);
  useEnsureNames(traded);

  const [lossActs, setLossActs] = useState<LossActs>({});
  const lossKey = Object.values(d.killmails).filter((k) => k.kind === 'loss').map((k) => k.id).join(',');
  useEffect(() => {
    let alive = true;
    classify(Object.values(d.killmails).filter((k) => k.kind === 'loss')).then((m) => { if (alive) setLossActs(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, [lossKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const posCalc = useMemo(() => d.positions.map((p) => ({ p, c: computePosition(p, d, d.settings) })), [d.positions, d.txs, d.journal, d.settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const built = useBuiltInputs(d, live.industry.sites);
  const acts = useMemo(() => activityEvents(d, sets, failed, lossActs, posCalc, own, { state: built.state, mats: built.mats }), [sets, failed, d.txs, d.journal, d.positions, d.names, d.killmails, lossActs, posCalc, d.settings, d.meta.freelance, d.ignored, d.tags, own, d.jobs, d.copyContracts, built.state, built.mats]); // eslint-disable-line react-hooks/exhaustive-deps
  // The materials Industry couldn't cost are named in its note: they may be types nothing else here names (mined, looted).
  useEnsureNames(acts.industry?.unbought.map((u) => u.typeId) ?? []);

  // Ready once the item groups are in (or failed) and Industry's inputs aren't still loading for a ledger that needs them.
  const ready = (!!sets || failed) && built.state !== 'loading';
  // What it's still reading, said where the figures would be (the Wallet, a Characters card): pre-flight M12.
  const waiting = !(sets || failed) ? 'Reading which items belong to which activity…' : built.state === 'loading' ? 'Reading the blueprints, to cost what you built…' : null;
  /**
   * `typeSets`: the item groups each activity counts, mutaplasmids with the abyssal loot; null until read (or when ESI failed).
   * `industry`: Industry's state (industrySaid says it); `industryRetry` reloads the app to read the blueprints again after a
   * failed load (`retryBuilt`). `waiting`: what it's still reading while not `ready`.
   * One object while nothing it holds changed, so a page's useMemo on it (the Wallet's income sum) keeps its answer.
   */
  return useMemo(() => ({ ...acts, failed, posCalc, lossActs, ready, waiting, industryRetry: built.retry }), [acts, failed, posCalc, lossActs, ready, waiting, built.retry]);
}
