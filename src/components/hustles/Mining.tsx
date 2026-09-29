import { useEffect, useMemo, useState } from 'react';
import { Gem, Pickaxe } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { cloudEnabled, cloudMiningTicks, useCloud } from '../../lib/cloud';
import { JITA_44, SCOPE } from '../../lib/config';
import { esi } from '../../lib/esi';
import { rates } from '../../lib/fees';
import { fmtDateTime, fmtShort, isk, iskBig, units } from '../../lib/format';
import { navigate, useAuth, useNow } from '../../lib/hooks';
import { adjustedPricesShared, jitaBook, resolveIds } from '../../lib/market';
import { bestWay, byDay, byOre, median, miningSessions, sessionStats, type MiningTick, type OreWorth, type Way } from '../../lib/mining';
import { FAMILIES, gradeLabel, gradeRank, isMinedForm, oreBase, oreFamily } from '../../lib/miningFits';
import { HULLS } from '../../lib/miningTree';
import { stationTax, unitValue, yieldOf, type Materials, type Site } from '../../lib/reprocess';
import { useData } from '../../lib/store';
import { groupTypes, system, typeInfo } from '../../lib/universe';
import { useEnsureNames, useTypeName } from '../common';
import { SkillStrip } from '../SkillStrip';
import { MasteryTiers } from './MasteryTiers';
import { MiningTree } from './MiningTree';
import { Empty, ItemIcon, Notice, Panel, Seg, Th, Tiles } from '../ui';

/**
 * Mining: what you mined and what it was worth, your sessions and ISK an hour, and the next step up. The user's plan
 * (29 September 2026): a solo side income on days they feel like mining, growing later into a multiboxed fleet. The
 * ledger is ESI's (lib/mining.ts; kept past its 30 days as records), sessions are the cloud's ten-minute reads of it, and
 * every price is Jita's now. Nothing is estimated that could be read: the ship you're in is ESI's, and yields are worked
 * out from ESI's dogma for each hull and fit (lib/miningYield.ts) beside what your own sessions measured.
 */

const DAYS = 30;
const WAY_SAID: Record<Way, string> = { raw: 'Sold as it is', compressed: 'Compressed', reprocessed: 'Reprocessed' };
/** Scordite: the ore Scaling up prices for before you've mined anything. It spawns in every high-sec system (EVE University). */
const SCORDITE = 1228;

type Bundle = { types: Record<string, Materials> };

/**
 * What each ore is worth three ways, after tax (lib/mining.ts `bestWay`): into its own Jita bids, compressed into
 * the compressed form's bids ("Compressed " + its name, trimmed: ESI names Scordite 0-Grade with a trailing space), or
 * reprocessed at your skills at Jita 4-4 and the minerals sold into their bids. With each ore's volume a unit.
 */
async function priceOres(types: number[], nameOf: (t: number) => string, skills: Record<number, number>, corp: Parameters<typeof stationTax>[0], tax: number) {
  const [bundle, adjusted, station] = await Promise.all([
    import('../../data/typeMaterials.json').then((m) => m.default as unknown as Bundle).catch(() => null),
    adjustedPricesShared().catch(() => ({} as Record<number, number>)),
    esi<{ reprocessing_efficiency?: number }>(`/universe/stations/${JITA_44}/`).then(({ data }) => data.reprocessing_efficiency ?? 0.5).catch(() => 0.5),
  ]);
  const site: Site = { kind: 'station', base: station, tax: stationTax(corp) };
  const bid = new Map<number, number | null>();
  const bidOf = async (t: number) => { if (!bid.has(t)) bid.set(t, (await jitaBook(t).catch(() => null))?.bestBuy ?? null); return bid.get(t) ?? null; };
  const vols: Record<number, number> = {}, worth: Record<number, OreWorth> = {};
  const compressed = (t: number) => `Compressed ${nameOf(t).trim()}`;
  const compressedIds = await resolveIds([...new Set(types.map(compressed))]).then((x) => x.inventory_types ?? []).catch(() => []);
  for (const t of types) {
    vols[t] = (await typeInfo(t).catch(() => null))?.volume ?? 0;
    const raw = await bidOf(t);
    const cid = compressedIds.find((c) => c.name === compressed(t))?.id;
    const comp = cid ? await bidOf(cid) : null;
    const m = bundle?.types[String(t)];
    let reprocessed: number | null = null;
    if (m) {
      for (const [mat] of m[1]) await bidOf(mat);
      reprocessed = unitValue(m, yieldOf(m, skills, site), (id) => bid.get(id) ?? null, (id) => adjusted[id] ?? null, site.tax, tax);
    }
    worth[t] = { raw: raw != null ? raw * (1 - tax) : null, compressed: comp != null ? comp * (1 - tax) : null, reprocessed };
  }
  return { vols, worth };
}

export function Mining() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const name = useTypeName();
  const cloud = useCloud();
  const r = rates(d.settings);
  const canRead = hasScope(SCOPE.mining);
  const today = new Date(now).toISOString().slice(0, 10);
  const since = new Date(now - (DAYS - 1) * 86400_000).toISOString().slice(0, 10);
  const recent = useMemo(() => Object.values(d.mining).filter((x) => x.date >= since), [d.mining, since]);
  const ores = useMemo(() => [...new Set(recent.map((x) => x.typeId))], [recent]);
  useEnsureNames(ores);

  // Volumes, and what each ore is worth three ways (lib/mining.ts bestWay).
  const [vol, setVol] = useState<Record<number, number>>({});
  const [worth, setWorth] = useState<Record<number, OreWorth>>({});
  const [pricing, setPricing] = useState(false);
  const priced = ores;
  // Priced once every name is known: a compressed form is found by name ("Compressed Scordite").
  const named = priced.every((t) => !!d.names[t]);
  const key = `${priced.join(',')}:${named}`;
  useEffect(() => {
    if (!named) return;
    let alive = true;
    setPricing(true);
    priceOres(priced, name, d.skills ?? {}, d.settings.corp, r.t)
      .then(({ vols, worth: out }) => { if (alive) { setVol(vols); setWorth(out); setPricing(false); } })
      .catch(() => { if (alive) setPricing(false); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const volumeOf = (t: number) => vol[t] ?? null;
  const worthOf = (t: number) => (worth[t] ? bestWay(worth[t])?.perUnit ?? null : null);
  const days = useMemo(() => byDay(recent, DAYS, today, volumeOf, worthOf), [recent, today, vol, worth]); // eslint-disable-line react-hooks/exhaustive-deps
  const oreRows = useMemo(() => byOre(recent, volumeOf, worthOf), [recent, vol, worth]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = days.reduce((t, x) => ({ units: t.units + x.units, m3: t.m3 + x.m3, isk: t.isk + x.isk }), { units: 0, m3: 0, isk: 0 });
  const best = days.reduce((b, x) => (x.isk > (b?.isk ?? 0) ? x : b), null as (typeof days)[number] | null);
  const minedDays = days.filter((x) => x.units > 0).length;

  // Sessions, from the cloud's ten-minute reads of the ledger.
  const [ticks, setTicks] = useState<MiningTick[] | null>(null);
  useEffect(() => {
    if (!cloudEnabled() || !cloud.started) return;
    cloudMiningTicks(DAYS).then(setTicks).catch(() => setTicks(null));
  }, [cloud.started]);
  const sessions = useMemo(() => (ticks ? miningSessions(ticks).map((s) => ({ s, st: sessionStats(s, volumeOf, worthOf) })).reverse() : []), [ticks, vol, worth]); // eslint-disable-line react-hooks/exhaustive-deps
  useEnsureNames(sessions.flatMap(({ s }) => [...Object.keys(s.byType).map(Number), ...(s.ship ? [s.ship] : [])]));
  // Only sessions long enough to say something: a single read is ten minutes of guesswork.
  const measured = median(sessions.filter(({ st }) => st.minutes >= 20).map(({ st }) => st.m3PerMin));
  const iskPerHour = median(sessions.filter(({ st }) => st.minutes >= 20).map(({ st }) => st.iskPerHour));

  // What Scaling up prices for until you pick another: the ore you mined most, or Scordite before you've mined any.
  const mostMined = [...oreRows].sort((a, b) => b.units - a.units)[0]?.typeId ?? SCORDITE;
  const minedBases = new Set(oreRows.map((o) => (d.names[o.typeId] ? oreBase(name(o.typeId)) : null)).filter((x): x is string => !!x));

  // The ship you're in, from ESI; else the one you've mined most in lately. Your pace in each, from sessions.
  const live = useRightNow();
  const mining = new Set(HULLS.map((h) => h.id));
  const here = useMemo(() => {
    if (live?.ship != null && mining.has(live.ship)) return live.ship;
    const by = new Map<number, number>();
    for (const { s, st } of sessions) if (s.ship != null && mining.has(s.ship)) by.set(s.ship, (by.get(s.ship) ?? 0) + st.m3);
    return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [live?.ship, sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const paceOf = (hull: number) => {
    const xs = sessions.filter(({ s, st }) => s.ship === hull && st.minutes >= 20).map(({ st }) => st.m3PerMin);
    const m = median(xs);
    return m != null ? { m3PerMin: m, sessions: xs.length } : null;
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--body)', textWrap: 'pretty' }}>
        What you mined and what it was worth, sold the best of three ways; your sessions and ISK an hour; and the next step up,
        with what it costs and how many hours of mining pay for it. Your mining ledger comes from EVE, which keeps 30 days; the app keeps it from then on.
      </p>
      {!auth ? <Notice kind="warn">Log in to read your mining ledger.</Notice>
        : !canRead ? (
          <Notice kind="warn">
            The app needs the <b>Mining ledger</b> permission: log in again to grant it (<button type="button" className="link-btn" onClick={() => navigate('settings/account')}>Settings → Account</button>),
            then hand the cloud your login again (Settings → Your data) so it can follow your sessions with the app closed.
          </Notice>
        ) : null}

      <RightNow now={live} />

      <Tiles min={170} items={[
        { l: `Mined, ${DAYS} days`, v: `${units(Math.round(total.m3))} m³`, n: `${units(total.units)} units on ${units(minedDays)} day${minedDays === 1 ? '' : 's'}`, c: 'var(--acc)' },
        { l: 'Worth now', v: iskBig(total.isk), n: pricing ? 'Pricing at Jita…' : 'Each ore the best of three ways, after tax', c: 'var(--pos)' },
        { l: 'Best day', v: best ? iskBig(best.isk) : '–', n: best ? fmtShort(best.date) : 'Nothing mined yet' },
        { l: 'ISK an hour', v: iskPerHour != null ? iskBig(iskPerHour) : '–', n: iskPerHour != null ? `The middle of ${units(sessions.filter(({ st }) => st.minutes >= 20).length)} sessions` : 'Once the cloud has seen you mine',
          tip: 'Measured, not assumed: the cloud reads your mining ledger every 10 minutes and times each session from what grew between reads. Good to about ten minutes either way, which is ESI’s cache.' },
      ]} />

      <Panel title="What you mined" sub={`The last ${DAYS} days, at today’s best price for each ore`}>
        {!recent.length ? (
          <Empty icon={Pickaxe}>{canRead ? `Nothing mined in the last ${DAYS} days. It shows here after your next sync, or within 10 minutes of mining when the cloud holds the permission.` : 'Nothing to show until the app can read your mining ledger.'}</Empty>
        ) : (
          <>
            <DayBars days={days} />
            <div className="tbl-scroll">
              <table className="tbl" style={{ minWidth: 900 }}>
                <thead><tr>
                  <Th left>Ore</Th><Th>Units</Th><Th>m³</Th>
                  <Th tip="Into its own Jita bids, after sales tax">As it is</Th>
                  <Th tip="Its compressed form into the Jita bids, after sales tax. Compressing keeps one unit for one at a hundredth of the volume; it takes a Porpoise, an Orca or a structure.">Compressed</Th>
                  <Th tip="Reprocessed at your skills at Jita 4-4, the minerals sold into the bids, after the station’s tax and sales tax">Reprocessed</Th>
                  <Th>Worth</Th><Th tip="What a m³ of it fetched: what decides which ore to mine">ISK a m³</Th><Th left>Where</Th>
                </tr></thead>
                <tbody>
                  {oreRows.map((o) => {
                    const w = worth[o.typeId], b = w ? bestWay(w) : null;
                    const cell = (way: Way) => <td style={{ color: b?.way === way ? 'var(--pos)' : 'var(--sec)' }}>{w?.[way] != null ? isk(w[way]!) : '–'}</td>;
                    return (
                      <tr key={o.typeId}>
                        <td className="l"><span className="cellrow"><ItemIcon id={o.typeId} /><span className="name">{name(o.typeId)}</span></span>{b && <span className="sub">best: {WAY_SAID[b.way].toLowerCase()}</span>}</td>
                        <td>{units(o.units)}</td>
                        <td>{units(Math.round(o.m3))}</td>
                        {cell('raw')}{cell('compressed')}{cell('reprocessed')}
                        <td style={{ color: 'var(--pos)' }}>{iskBig(o.isk)}</td>
                        <td>{o.m3 > 0 ? isk(o.isk / o.m3) : '–'}</td>
                        <td className="l"><Systems ids={o.systems} /><span className="sub">{units(o.days)} day{o.days === 1 ? '' : 's'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Sessions" sub="When you mined and how fast, from the cloud’s reads of your ledger">
        {!cloudEnabled() ? <p className="note">Sessions come from the cloud, which reads your ledger every 10 minutes whether or not the app is open. Turn on the cloud copy (Settings → Your data).</p>
          : !sessions.length ? <p className="note">No sessions seen yet. Once the cloud holds the Mining ledger permission, each time you mine shows here within 10 minutes: when, how long, how much, and ISK an hour.</p>
            : (
              <div className="tbl-scroll">
                <table className="tbl" style={{ minWidth: 760 }}>
                  <thead><tr><Th left>When</Th><Th left tip="The ship most of it was mined in, read by the cloud with your ledger">Ship</Th><Th>Length</Th><Th>m³</Th><Th>m³ a minute</Th><Th>Worth</Th><Th>ISK an hour</Th><Th left>Ore</Th></tr></thead>
                  <tbody>
                    {sessions.slice(0, 20).map(({ s, st }) => (
                      <tr key={s.start}>
                        <td className="l">{fmtDateTime(s.start)}</td>
                        <td className="l">{s.ship ? name(s.ship) : <span className="faint">–</span>}</td>
                        <td>{st.minutes >= 60 ? `${Math.floor(st.minutes / 60)} h ${Math.round(st.minutes % 60)} min` : `${Math.round(st.minutes)} min`}</td>
                        <td>{units(Math.round(st.m3))}</td>
                        <td>{units(Math.round(st.m3PerMin))}</td>
                        <td>{iskBig(st.isk)}</td>
                        <td style={{ color: 'var(--pos)' }}>{iskBig(st.iskPerHour)}</td>
                        <td className="l">{Object.keys(s.byType).map((t) => name(Number(t))).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </Panel>

      <ScalingUp here={here} paceOf={paceOf} measured={measured} mostMined={mostMined} minedBases={minedBases} />
    </div>
  );
}

/**
 * Where you are right now, read live when the page opens (ESI caches the ship and location 5 seconds, online a minute):
 * the ship you're in, the system, and whether you're logged in. Needs the location permissions; says nothing without.
 */
type Live = { ship: number | null; system: string | null; online: boolean | null };

function useRightNow(): Live | null {
  const auth = useAuth();
  const [now, setNow] = useState<Live | null>(null);
  useEffect(() => {
    if (!auth || !(hasScope(SCOPE.shipType) || hasScope(SCOPE.location) || hasScope(SCOPE.online))) return;
    let alive = true;
    (async () => {
      const cid = auth.characterId;
      const [ship, loc, on] = await Promise.all([
        hasScope(SCOPE.shipType) ? esi<{ ship_type_id: number }>(`/characters/${cid}/ship/`, { auth: true }).then((r) => r.data.ship_type_id).catch(() => null) : null,
        hasScope(SCOPE.location) ? esi<{ solar_system_id: number }>(`/characters/${cid}/location/`, { auth: true }).then((r) => system(r.data.solar_system_id)).then((x) => `${x.name} ${x.security.toFixed(1)}`).catch(() => null) : null,
        hasScope(SCOPE.online) ? esi<{ online: boolean }>(`/characters/${cid}/online/`, { auth: true }).then((r) => r.data.online).catch(() => null) : null,
      ]);
      if (alive) setNow({ ship, system: loc, online: on });
    })();
    return () => { alive = false; };
  }, [auth?.characterId]); // eslint-disable-line react-hooks/exhaustive-deps
  return now;
}

function RightNow({ now }: { now: Live | null }) {
  const name = useTypeName();
  useEnsureNames(now?.ship ? [now.ship] : []);
  if (!now || (now.ship == null && now.system == null && now.online == null)) return null;
  return (
    <p className="row tight" style={{ margin: 0, fontSize: 13, color: 'var(--sec)', gap: 8 }}>
      <span className="dot" aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: now.online ? 'var(--pos)' : 'var(--faint)', boxShadow: now.online ? '0 0 6px var(--pos)' : 'none' }} />
      <span>Right now: {now.online == null ? '' : now.online ? 'online' : 'offline'}{now.ship ? `${now.online != null ? ', ' : ''}in a ${name(now.ship)}` : ''}{now.system ? ` in ${now.system}` : ''}.</span>
    </p>
  );
}

/** ISK a day, the last 30 days. */
function DayBars({ days }: { days: { date: string; units: number; m3: number; isk: number }[] }) {
  const top = Math.max(1, ...days.map((x) => x.isk));
  const bw = (600 / days.length) * 0.7;
  return (
    <div className="chart-box" style={{ height: 150 }}>
      <svg className="plot" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40H600M0 80H600" stroke="rgba(130,185,225,.07)" vectorEffect="non-scaling-stroke" fill="none" />
        {days.map((x, i) => x.isk > 0 && <rect key={x.date} x={(i * 600) / days.length + (600 / days.length - bw) / 2} y={116 - (x.isk / top) * 108} width={bw} height={(x.isk / top) * 108} fill="var(--acc)" opacity={0.85} />)}
      </svg>
      {days.map((x, i) => (
        <span key={x.date} className="hit" style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i / days.length) * 100}%`, width: `${100 / days.length}%` }}
          data-tip-title={fmtShort(x.date)} data-tip={x.units ? `${units(x.units)} units, ${units(Math.round(x.m3))} m³, worth ${iskBig(x.isk)}` : 'Nothing mined'} />
      ))}
      <span className="ax" style={{ left: 8, top: 6 }}>{iskBig(top)}</span>
      <span className="ax f" style={{ left: 8, bottom: 4 }}>{fmtShort(days[0].date)}</span>
      <span className="ax f" style={{ right: 8, bottom: 4 }}>today</span>
    </div>
  );
}

/** Solar system names, for where an ore was mined. */
function Systems({ ids }: { ids: number[] }) {
  const [names, setNames] = useState<string[]>([]);
  const key = ids.join(',');
  useEffect(() => {
    let alive = true;
    Promise.all(ids.slice(0, 3).map((id) => system(id).then((s) => `${s.name} ${s.security.toFixed(1)}`).catch(() => `#${id}`))).then((n) => { if (alive) setNames(n); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{names.join(', ') || '…'}{ids.length > 3 ? ` and ${ids.length - 3} more` : ''}</>;
}

const ORE_KEY = 'jita-ledger:mining-ore';
const readOre = (): number | null => { try { const v = Number(localStorage.getItem(ORE_KEY)); return v > 0 ? v : null; } catch { return null; } };
const saveOre = (t: number | null) => { try { if (t == null) localStorage.removeItem(ORE_KEY); else localStorage.setItem(ORE_KEY, String(t)); } catch { /* the pick just isn't kept */ } };

/** Every base ore's ID, resolved once by name. */
let baseIds: Promise<Record<string, number>> | null = null;
function oreBaseIds(): Promise<Record<string, number>> {
  baseIds ??= resolveIds(FAMILIES.flatMap(([, ores]) => ores))
    .then((x) => Object.fromEntries((x.inventory_types ?? []).map((t) => [t.name, t.id])))
    .catch((e) => { baseIds = null; throw e; });
  return baseIds;
}

/**
 * An ore's grades, poorest first, from its inventory group: the market types named for it that aren't a compressed form.
 * A moon ore's group holds all four ores of its rarity, hence the name check.
 */
async function gradesOf(base: string, baseId: number): Promise<{ id: number; name: string }[]> {
  const types = await groupTypes((await typeInfo(baseId)).groupId);
  const infos = await Promise.all(types.map(async (id) => ({ id, info: await typeInfo(id).catch(() => null) })));
  return infos.filter((x) => x.info && x.info.marketGroupId != null && isMinedForm(x.info.name) && oreBase(x.info.name) === base)
    .map((x) => ({ id: x.id, name: x.info!.name }))
    .sort((a, b) => gradeRank(gradeLabel(a.name.trim(), base), base) - gradeRank(gradeLabel(b.name.trim(), base), base) || a.id - b.id);
}

/**
 * Scaling up: every mining hull as a node in a flowchart (MiningTree), the one you're in glowing, and under the one you
 * open its mastery tiers (MasteryTiers). The user asked for "an interactive animated flowchart design so you can click on
 * nodes and it opens up" with every path, the new destroyers and all three exhumers, mining upgrades and crystals on each
 * ship, and tiers from "just able to hop into one to getting the max out of it" (29 September 2026).
 */
function ScalingUp({ here, paceOf, measured, mostMined, minedBases }: {
  here: number | null; paceOf: (hull: number) => { m3PerMin: number; sessions: number } | null;
  measured: number | null; mostMined: number; minedBases: Set<string>;
}) {
  const d = useData();
  const name = useTypeName();
  const r = rates(d.settings);
  const fromRate = (here != null ? paceOf(here)?.m3PerMin : null) ?? measured;

  // The ore the tiers are priced for: yours to pick (kept in this browser), else the one you mine most.
  const [chosen, setChosen] = useState<number | null>(readOre);
  const ore = chosen ?? mostMined;
  const choose = (t: number | null) => { setChosen(t); saveOre(t); };
  useEnsureNames([ore, mostMined]);
  const oreName = d.names[ore] ? name(ore).trim() : null;
  const base = oreName ? oreBase(oreName) : null;
  const family = (oreName ? oreFamily(oreName) : null) ?? 'Simple';

  const [worth, setWorth] = useState<Record<number, { m3: number; worth: OreWorth }>>({});
  useEffect(() => {
    if (!oreName || worth[ore]) return;
    let alive = true;
    priceOres([ore], name, d.skills ?? {}, d.settings.corp, r.t)
      .then(({ vols, worth: w }) => { if (alive) setWorth((x) => ({ ...x, [ore]: { m3: vols[ore], worth: w[ore] } })); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [ore, oreName]); // eslint-disable-line react-hooks/exhaustive-deps
  const priced = worth[ore];
  const best = priced ? bestWay(priced.worth) : null;
  const iskPerM3 = best && priced.m3 > 0 ? best.perUnit / priced.m3 : null;

  // Every ore by its family, and the grades of the one picked, from ESI.
  const [ids, setIds] = useState<Record<string, number> | null>(null);
  useEffect(() => { oreBaseIds().then(setIds).catch(() => setIds({})); }, []);
  const [grades, setGrades] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (!base || !ids?.[base]) { setGrades([]); return; }
    let alive = true;
    gradesOf(base, ids[base]).then((g) => { if (alive) setGrades(g); }).catch(() => { if (alive) setGrades([]); });
    return () => { alive = false; };
  }, [base, ids]);

  return (
    <Panel title="Scaling up" sub="Every mining ship and the paths between them: click one to see what it takes, costs and mines">
      <p className="note small" style={{ margin: 0 }}>
        {here != null ? 'The ship you’re in glows; the paths out of it are your next steps. ' : 'Once you mine, the ship you’re in glows and the paths out of it light up. '}
        Lit ships you can fly now, a spark marks one your skill queue brings, a lock one that’s further off. Yields are worked out from ESI’s own figures for each hull, laser, crystal and upgrade, at your skills.
      </p>
      <div className="row" style={{ gap: '8px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <label htmlFor="mine-ore" className="chip h34" data-tip-title="Ore to price the fits for"
          data-tip={'Which crystals every fit loads, and what ISK an hour and payback are worked out at: a m³ of this ore sold the best of three ways in Jita now, after tax.\n\nThe m³ a minute doesn’t change: a crystal of the right kind mines any ore of its family alike.'}>
          <span className="cl">Ore</span>
          <select id="mine-ore" value={base ?? ''} onChange={(e) => { const id = ids?.[e.target.value]; if (id) choose(id); }} style={{ minWidth: 190 }}>
            {!base && <option value="">{oreName ?? 'Loading…'}</option>}
            {FAMILIES.map(([f, ores]) => (
              <optgroup key={f} label={f.endsWith('Moon') ? `${f} ore` : `${f} ores`}>
                {ores.filter((o) => ids?.[o] || o === base).map((o) => <option key={o} value={o}>{o}{minedBases.has(o) ? ' · you mine it' : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {base && grades.length > 1 && (
          <Seg size="sm" label="Grade" value={ore} onChange={(v) => choose(v)}
            options={grades.map((g) => ({ v: g.id, label: gradeLabel(g.name.trim(), base) }))} />
        )}
        <span className="note small" style={{ margin: 0 }}>
          {iskPerM3 != null && best ? `${isk(iskPerM3)} a m³ (${WAY_SAID[best.way].toLowerCase()}, after tax) · ${family} crystals` : oreName ? 'Pricing at Jita…' : ''}
        </span>
        {chosen != null && chosen !== mostMined && (
          <button type="button" className="link-btn" onClick={() => choose(null)}>Back to {name(mostMined).trim()}{minedBases.size ? ', what you mine most' : ''}</button>
        )}
      </div>
      <MiningTree here={here} paceOf={paceOf}>
        {(hull, price) => <MasteryTiers hull={hull} family={family} ore={oreName ?? 'your ore'} oreId={ore} iskPerM3={iskPerM3} fromRate={fromRate} hullPrice={price} />}
      </MiningTree>
      <SkillStrip title="Skills that raise your yield" lines={[
        { name: 'Mining', id: 3386, what: '+5% ore yield a level, in every ship.' },
        { name: 'Astrogeology', id: 3410, what: '+5% ore yield a level. Needs Mining IV; Astrogeology III opens the barges.' },
        { name: 'Mining Barge', id: 17940, what: 'The barges’ own bonus a level; V opens the exhumers.' },
        { name: 'Exhumers', id: 22551, what: 'The exhumers’ own bonus a level.' },
      ]} />
      <p className="note small" style={{ margin: 0 }}><Gem aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: '-2px' }} /> A fleet on several accounts is where this goes next: the app will follow each account’s mining.</p>
    </Panel>
  );
}
