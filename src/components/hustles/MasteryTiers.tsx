import { useEffect, useMemo, useState } from 'react';
import { isk, iskBig, units } from '../../lib/format';
import { resolveIds } from '../../lib/market';
import { paybackHours } from '../../lib/mining';
import { MASTERY } from '../../lib/miningMastery';
import { crystalName, DEEP_CORE, DEEP_CORE_RIG, mercoxitTier, TIER_SAID, type Family, type FitItem, type MercoxitFit, type Tier, type TierKey } from '../../lib/miningFits';
import type { HullNode } from '../../lib/miningTree';
import { ALL_FIVE, fitYield, SKILL, YIELD_SKILLS, type FitYield, type TypeDogma } from '../../lib/miningYield';
import { useData } from '../../lib/store';
import { typeDogma } from '../../lib/universe';
import { fitCosts, FitActions, FitGrid, FitSkills, useFitData } from '../FitParts';
import { Seg } from '../ui';

/**
 * A hull's mastery tiers, under its node in the mining tree: the fit, what it costs at Jita, what it asks you to train,
 * and what it mines a minute, worked out from ESI's dogma at your skills and at the tier's. Copies the fit for the
 * fitting window, copies the shopping list for Multibuy, or saves it in game as a fitting.
 */

const LASER_GROUPS = new Set([54, 464, 483]);
const TIER_ORDER: TierKey[] = ['start', 'solid', 'max'];

type Loaded = {
  ids: Record<string, number>;
  price: Record<string, number | null>;
  dogma: Record<number, TypeDogma>;
  needs: { skill: number; level: number }[];
  /** For a Mercoxit fit: the chance of a gas cloud (the ore's own, 522) and what Deep Core Mining takes off it a level (543). */
  cloud: { base: number; perLevel: number } | null;
};

export function MasteryTiers({ hull, family, ore, oreId, iskPerM3, fromRate, hullPrice }: {
  hull: HullNode;
  /** The crystal family to show, and the ore it's for: the one picked above the tree, else what you mine most. */
  family: Family; ore: string; oreId: number;
  /** ISK a m³ of that ore, for ISK an hour and payback. */
  iskPerM3: number | null;
  /** Your m³ a minute now (measured, or worked out for the ship you're in), for payback. */
  fromRate: number | null;
  hullPrice: number | null;
}) {
  const tiers = MASTERY[hull.id] ?? [];
  const [key, setKey] = useState<TierKey>(tiers.find((t) => t.key === 'solid')?.key ?? tiers[0]?.key ?? 'start');
  const tier = tiers.find((t) => t.key === key) ?? tiers[0];
  // Mercoxit takes deep-core lasers: each tier's Mercoxit version (lib/miningFits.ts mercoxitTier), once the hull's
  // calibration and its rigs' costs are read.
  const merc = family === 'Mercoxit';
  const [mercs, setMercs] = useState<Record<string, MercoxitFit | null> | null>(null);
  useEffect(() => {
    if (!merc || !tiers.length) { setMercs(null); return; }
    let alive = true;
    (async () => {
      const hd = await typeDogma(hull.id);
      const rigNames = [...new Set([...tiers.flatMap((t) => t.rigs.map((x) => x.name)), DEEP_CORE_RIG])];
      const res = await resolveIds(rigNames).catch(() => null);
      const cost: Record<string, number> = {};
      await Promise.all((res?.inventory_types ?? []).map(async (x) => {
        const dg = await typeDogma(x.id).catch(() => null);
        if (dg?.attrs[1153] != null) cost[x.name] = dg.attrs[1153];
      }));
      const out = Object.fromEntries(tiers.map((t) => [t.key, mercoxitTier(t, (nm) => cost[nm] ?? null, hd.attrs[1132] ?? 0, hd.attrs[1547] === 2)]));
      if (alive) setMercs(out);
    })().catch(() => { if (alive) setMercs({}); });
    return () => { alive = false; };
  }, [hull.id, merc]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tier) return null;
  const m = merc && mercs ? mercs[tier.key] ?? null : null;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="lbl">Mastery</span>
        <Seg size="sm" label="Mastery tier" value={tier.key} onChange={setKey}
          options={TIER_ORDER.filter((k) => tiers.some((t) => t.key === k)).map((k) => ({ v: k, label: TIER_SAID[k] }))} />
      </div>
      {merc && !mercs ? <p className="note small">Working out the Mercoxit fits…</p> : (
        <>
          {merc && !m && <p className="note small" style={{ margin: 0 }}>{tier.high.some((x) => /Ice/.test(x.name))
            ? 'No Mercoxit version: this fit mines ice. Mercoxit takes deep-core lasers.'
            : 'No Mercoxit version to make: this fit boosts rather than mines, and boosts a Mercoxit fleet the same.'}</p>}
          <TierView key={`${hull.id}:${tier.key}:${family}:${m ? 'merc' : ''}`} hull={hull} tier={m?.tier ?? tier} base={m ? tier : undefined} merc={m ?? undefined}
            family={family} ore={ore} oreId={oreId} iskPerM3={iskPerM3} fromRate={fromRate} hullPrice={hullPrice} />
        </>
      )}
    </div>
  );
}

function TierView({ hull, tier, base, merc, family, ore, oreId, iskPerM3, fromRate, hullPrice }: {
  hull: HullNode; tier: Tier; family: Family; ore: string; oreId: number; iskPerM3: number | null; fromRate: number | null; hullPrice: number | null;
  /** A Mercoxit version, and the tier it was made from. */
  base?: Tier; merc?: MercoxitFit;
}) {
  const d = useData();
  const crystal = tier.crystal ? crystalName(family, tier.crystal.kind) : null;
  const oldLasers = useMemo(() => (merc ? merc.swapped.map(([old]) => old) : []), [merc]);
  const data = useFitData(hull.id, tier, crystal, { dogmaNames: oldLasers, dogmaIds: YIELD_SKILLS });
  // Mercoxit's gas-cloud chance: the ore's own (522) and what Deep Core Mining takes off it a level (543).
  const [cloud, setCloud] = useState<Loaded['cloud']>(null);
  useEffect(() => {
    if (!merc) { setCloud(null); return; }
    let alive = true;
    Promise.all([typeDogma(oreId).catch(() => null), typeDogma(SKILL.deepCoreMining).catch(() => null)]).then(([o, dcm]) => {
      if (alive) setCloud(o?.attrs[522] != null ? { base: o.attrs[522], perLevel: dcm?.attrs[543] ?? 0 } : null);
    });
    return () => { alive = false; };
  }, [merc, oreId]);
  const got: Loaded | null = data ? { ...data, cloud } : null;

  // What it mines: the fit's lasers (the first kind in the highs), everything else fitted and the implants as extras.
  const yieldAt = (skills: Record<number, number>): FitYield | null => {
    if (!got) return null;
    const hullD = got.dogma[hull.id];
    const laserItem = tier.high.find((x) => { const id = got.ids[x.name]; return id && LASER_GROUPS.has(got.dogma[id]?.group); });
    if (!hullD || !laserItem) return null;
    const laser = got.dogma[got.ids[laserItem.name]];
    const cr = crystal && got.ids[crystal] ? got.dogma[got.ids[crystal]] ?? null : null;
    const extras = [...tier.mid, ...tier.low, ...tier.rigs, ...(tier.implants ?? []).map((i): FitItem => ({ name: i }))]
      .flatMap((x) => Array.from({ length: x.qty ?? 1 }, () => got.dogma[got.ids[x.name]])).filter(Boolean);
    const skillDogma = Object.fromEntries(YIELD_SKILLS.map((s) => [s, got.dogma[s]]));
    return fitYield(hullD, laser, laserItem.qty ?? 1, cr, extras, skills, skillDogma);
  };
  const mine = yieldAt(d.skills ?? {});
  const ceiling = yieldAt(ALL_FIVE);
  const { fitCost, total, unpriced } = fitCosts(tier, crystal, data, hullPrice);
  const pay = total != null && mine && mine.kind === 'ore' && iskPerM3 != null && fromRate != null ? paybackHours(total, fromRate, mine.m3PerMin, iskPerM3) : null;
  const label = `Jita Ledger ${TIER_SAID[tier.key]}`;

  return (
    <div className="col" style={{ gap: 12 }}>
      {merc && base ? <MercoxitNote merc={merc} base={base} got={got} /> : <p className="note small" style={{ margin: 0 }}>{tier.what}</p>}
      <div className="kv-mini" style={{ maxWidth: 620 }}>
        <span>Mines</span>
        <b>{!got ? 'Working it out…' : !mine ? 'Only with its drones, which aren’t worked out here: what it’s for is the boosts and compression it gives a fleet.' : mine.kind === 'ice'
          ? `a block of ice every ${Math.round(mine.cycle / mine.lasers)} s (${units(Math.round((3600 / mine.cycle) * mine.lasers))} an hour) at your skills${ceiling && Math.round(ceiling.cycle) < Math.round(mine.cycle) ? `, every ${Math.round(ceiling.cycle / ceiling.lasers)} s with every skill at V` : ''}`
          : `${units(Math.round(mine.m3PerMin))} m³ a minute at your skills${ceiling && Math.round(ceiling.m3PerMin) > Math.round(mine.m3PerMin) ? `, ${units(Math.round(ceiling.m3PerMin))} with every skill at V` : ''}`}</b>
        {mine?.kind === 'ore' && iskPerM3 != null && <><span>Worth</span><b style={{ color: 'var(--pos)' }}>about {iskBig(mine.m3PerMin * 60 * iskPerM3)} an hour</b></>}
        {mine && mine.critShare > 0 && <><span data-tip="Every cycle has a chance to crit, which adds the cycle’s yield again twice over. Worked out from the laser’s and hull’s dogma.">Critical hits</span><b>{Math.round(mine.critChance * 1000) / 10}% of cycles, +{Math.round(mine.critShare * 1000) / 10}% on average</b></>}
        {merc && got?.cloud && (() => {
          const at = (lvl: number) => Math.max(0, got.cloud!.base * (1 + (got.cloud!.perLevel * lvl) / 100));
          const lvl = d.skills?.[SKILL.deepCoreMining] ?? 0;
          return <><span data-tip="Mining Mercoxit can release a toxic gas cloud that damages your ship. The chance is the ore’s own (ESI), and Deep Core Mining cuts it by a tenth a level.">Gas clouds</span>
            <b>{Math.round(at(lvl) * 1000) / 10}% chance at your Deep Core Mining {lvl}{lvl < 5 ? `, ${Math.round(at(5) * 1000) / 10}% at V` : ''}</b></>;
        })()}
        {mine && mine.residueChance > 0 && <><span data-tip="Residue is ore the asteroid loses, not ore you lose: it matters when a belt or moon is shared or scarce. Tech II lasers and Type B and C crystals raise it.">Residue</span><b>{Math.round(mine.residueChance * 1000) / 10}% of cycles, {units(Math.round(mine.residuePerMin))} m³ a minute wasted from the rock</b></>}
        <span>Costs</span>
        <b>{total != null ? `${iskBig(total)} (hull ${iskBig(hullPrice!)}, fit ${iskBig(fitCost!)})` : got ? `–${unpriced.length ? ` (no Jita listing for ${unpriced.join(', ')})` : ''}` : '…'}</b>
        {pay != null && <><span>Pays back</span><b style={{ color: 'var(--pos)' }}>{pay < 1 ? 'in under an hour' : `in ${units(Math.round(pay))} h of mining`} over what you mine now</b></>}
      </div>
      <p className="note small" style={{ margin: 0, color: 'var(--faint)' }}>
        Worked out from ESI’s figures for the hull, lasers, crystal and upgrades. Boosts, drones and heat aren’t in it; a fleet’s Mining Foreman burst shortens every cycle further.
        {iskPerM3 != null ? ` ISK an hour is at ${isk(iskPerM3)} a m³.` : ''}
      </p>
      <FitGrid fit={tier} crystal={crystal} data={data} />
      <FitActions hullId={hull.id} hullName={hull.name} label={label} fit={tier} crystal={crystal} data={data} total={total} />
      <FitSkills data={data} />
      <p className="note small" style={{ margin: 0, color: 'var(--faint)' }}>Fit: {tier.source}. {crystal ? `Crystals: the ${family} kind, for ${ore}.` : ''}</p>
    </div>
  );
}

/**
 * What the Mercoxit version changed: the lasers, whether they take more CPU or powergrid than the fit's own (ESI's figures;
 * the app doesn't fit ships, so it says to check in game), and the deep-core rig.
 */
function MercoxitNote({ merc, base, got }: { merc: MercoxitFit; base: Tier; got: Loaded | null }) {
  const fit = (nm: string) => { const dg = got?.ids[nm] ? got.dogma[got.ids[nm]] : undefined; return dg ? { cpu: dg.attrs[50] ?? 0, pg: dg.attrs[30] ?? 0 } : null; };
  let cpu = 0, pg = 0, known = !!got;
  for (const x of base.high) {
    const to = DEEP_CORE[x.name];
    if (!to) continue;
    const a = fit(x.name), b = fit(to);
    if (!a || !b) { known = false; continue; }
    cpu += (b.cpu - a.cpu) * (x.qty ?? 1); pg += (b.pg - a.pg) * (x.qty ?? 1);
  }
  const lasers = [...new Map(merc.swapped.map(([a, b]) => [a, b])).entries()].map(([a, b]) => `${a} → ${b}`).join('; ');
  const more = [cpu > 0 ? `${units(cpu)} more CPU` : '', pg > 0 ? `${units(pg)} more powergrid` : ''].filter(Boolean).join(' and ');
  return (
    <p className="note small" style={{ margin: 0, borderLeft: '2px solid var(--acc)', paddingLeft: 10 }}>
      <b>Mercoxit version of this fit.</b> Mercoxit takes deep-core lasers, so they’re swapped like for like{lasers ? `: ${lasers}` : ''}, loaded with Mercoxit Type A crystals, the kind lost Mercoxit miners carry.
      {known ? (more ? ` They take ${more} than the fit’s own: check it fits in the fitting window.` : ' They take no more CPU or powergrid than the fit’s own.') : ''}
      {merc.rig.added ? ` The ${DEEP_CORE_RIG} (+16% on deep-core lasers) takes the place of a ${merc.rig.replaced}.`
        : merc.rig.why === 'noRoom' ? ` No room for the ${DEEP_CORE_RIG} (+16% on deep-core lasers, 250 of the hull’s 400 calibration) beside this fit’s rigs without dropping its processor rig.`
          : ' There’s no deep-core rig for a small hull.'}
    </p>
  );
}
