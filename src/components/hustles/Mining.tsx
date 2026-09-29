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
import {
  bestWay, byDay, byOre, median, miningSessions, paybackHours, RUNGS, sessionStats,
  type MiningTick, type OreWorth, type Rung, type Way,
} from '../../lib/mining';
import { stationTax, unitValue, yieldOf, type Materials, type Site } from '../../lib/reprocess';
import { useData } from '../../lib/store';
import { system, typeInfo, typeRequirements } from '../../lib/universe';
import { useEnsureNames, useTypeName } from '../common';
import { SkillNeeds, SkillStrip } from '../SkillStrip';
import { Empty, ItemIcon, Notice, Panel, Th, Tiles } from '../ui';

/**
 * Mining: what you mined and what it was worth, your sessions and ISK an hour, and the next step up. The user's plan
 * (29 September 2026): a solo side income on days they feel like mining, growing later into a multiboxed fleet. The
 * ledger is ESI's (lib/mining.ts; kept past its 30 days as records), sessions are the cloud's ten-minute reads of it, and
 * every price is Jita's now. Nothing is estimated that could be read: yields on the ladder are EVE University's published
 * figures, said as such, until your own sessions measure yours.
 */

const DAYS = 30;
const WAY_SAID: Record<Way, string> = { raw: 'Sold as it is', compressed: 'Compressed', reprocessed: 'Reprocessed' };
/** Scordite: the ladder's ISK per m³ before you've mined anything. It spawns in every high-sec system (EVE University). */
const SCORDITE = 1228;

type Bundle = { types: Record<string, Materials> };

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
  useEnsureNames([...ores, ...RUNGS.flatMap((g) => [g.ship, ...g.alternatives.map((a) => a.typeId), ...(g.module ? [g.module.typeId] : [])])]);

  // Volumes, and what each ore is worth three ways (lib/mining.ts bestWay).
  const [vol, setVol] = useState<Record<number, number>>({});
  const [worth, setWorth] = useState<Record<number, OreWorth>>({});
  const [pricing, setPricing] = useState(false);
  // Unique: ESI's name lookup refuses a list with a name twice, and Scordite is both mined and the fallback.
  const priced = [...new Set([...ores, SCORDITE])];
  // Priced once every name is known: a compressed form is found by name ("Compressed Scordite").
  const named = priced.every((t) => !!d.names[t]);
  const key = `${priced.join(',')}:${named}`;
  useEffect(() => {
    if (!named) return;
    let alive = true;
    setPricing(true);
    (async () => {
      const [bundle, adjusted, station] = await Promise.all([
        import('../../data/typeMaterials.json').then((m) => m.default as unknown as Bundle).catch(() => null),
        adjustedPricesShared().catch(() => ({} as Record<number, number>)),
        esi<{ reprocessing_efficiency?: number }>(`/universe/stations/${JITA_44}/`).then(({ data }) => data.reprocessing_efficiency ?? 0.5).catch(() => 0.5),
      ]);
      const site: Site = { kind: 'station', base: station, tax: stationTax(d.settings.corp) };
      const bid = new Map<number, number | null>();
      const bidOf = async (t: number) => { if (!bid.has(t)) bid.set(t, (await jitaBook(t).catch(() => null))?.bestBuy ?? null); return bid.get(t) ?? null; };
      const vols: Record<number, number> = {}, out: Record<number, OreWorth> = {};
      const compressedIds = await resolveIds([...new Set(priced.map((t) => `Compressed ${name(t)}`))]).then((x) => x.inventory_types ?? []).catch(() => []);
      for (const t of priced) {
        vols[t] = (await typeInfo(t).catch(() => null))?.volume ?? 0;
        const raw = await bidOf(t);
        const cid = compressedIds.find((c) => c.name === `Compressed ${name(t)}`)?.id;
        const comp = cid ? await bidOf(cid) : null;
        const m = bundle?.types[String(t)];
        let reprocessed: number | null = null;
        if (m) {
          for (const [mat] of m[1]) await bidOf(mat);
          reprocessed = unitValue(m, yieldOf(m, d.skills ?? {}, site), (id) => bid.get(id) ?? null, (id) => adjusted[id] ?? null, site.tax, r.t);
        }
        out[t] = { raw: raw != null ? raw * (1 - r.t) : null, compressed: comp != null ? comp * (1 - r.t) : null, reprocessed };
      }
      if (alive) { setVol(vols); setWorth(out); setPricing(false); }
    })().catch(() => { if (alive) setPricing(false); });
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
  useEnsureNames(sessions.flatMap(({ s }) => Object.keys(s.byType).map(Number)));
  // Only sessions long enough to say something: a single read is ten minutes of guesswork.
  const measured = median(sessions.filter(({ st }) => st.minutes >= 20).map(({ st }) => st.m3PerMin));
  const iskPerHour = median(sessions.filter(({ st }) => st.minutes >= 20).map(({ st }) => st.iskPerHour));

  // ISK a m³: what yours was worth, or Scordite's until there's some.
  const iskPerM3 = total.m3 > 0 && total.isk > 0 ? total.isk / total.m3 : (worthOf(SCORDITE) != null && vol[SCORDITE] ? worthOf(SCORDITE)! / vol[SCORDITE] : null);
  const perM3From = total.m3 > 0 && total.isk > 0 ? 'your own ore' : 'Scordite, until you’ve mined something';

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
                  <thead><tr><Th left>When</Th><Th>Length</Th><Th>m³</Th><Th>m³ a minute</Th><Th>Worth</Th><Th>ISK an hour</Th><Th left>Ore</Th></tr></thead>
                  <tbody>
                    {sessions.slice(0, 20).map(({ s, st }) => (
                      <tr key={s.start}>
                        <td className="l">{fmtDateTime(s.start)}</td>
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

      <Ladder measured={measured} iskPerM3={iskPerM3} perM3From={perM3From} />
    </div>
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

type RungInfo = { rung: Rung; needs: { skill: number; level: number }[]; cost: number | null; flyable: boolean };

/**
 * The ladder: where you are and what's next. Each rung's ship and mining modules priced at the cheapest Jita listings,
 * the skills they need (from ESI) with your levels and queue, and how many hours of mining the step pays back in, at
 * your measured pace when there is one and at ISK a m³ of your own ore.
 */
function Ladder({ measured, iskPerM3, perM3From }: { measured: number | null; iskPerM3: number | null; perM3From: string }) {
  const d = useData();
  const name = useTypeName();
  const [info, setInfo] = useState<RungInfo[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: RungInfo[] = [];
      for (const rung of RUNGS) {
        const [shipReq, modReq] = await Promise.all([typeRequirements(rung.ship).catch(() => []), rung.module ? typeRequirements(rung.module.typeId).catch(() => []) : Promise.resolve([])]);
        const needs = [...shipReq, ...modReq].reduce<{ skill: number; level: number }[]>((acc, n) => {
          const cur = acc.find((x) => x.skill === n.skill);
          if (cur) cur.level = Math.max(cur.level, n.level); else acc.push({ ...n });
          return acc;
        }, []);
        const [hull, mod] = await Promise.all([jitaBook(rung.ship).catch(() => null), rung.module ? jitaBook(rung.module.typeId).catch(() => null) : Promise.resolve(null)]);
        const cost = hull?.bestSell != null ? hull.bestSell + (rung.module ? (mod?.bestSell ?? NaN) * rung.module.count : 0) : null;
        out.push({ rung, needs, cost: cost != null && Number.isFinite(cost) ? cost : null, flyable: false });
      }
      if (alive) setInfo(out);
    })().catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const rows = (info ?? []).map((x) => ({ ...x, flyable: !!d.skills && x.needs.every((n) => (d.skills![n.skill] ?? 0) >= n.level) }));
  // Where you are: the highest rung you can fly and fit (the fleet rung is a goal, not a ship you mine in).
  const at = rows.filter((x) => x.rung.key !== 'fleet' && x.flyable).pop() ?? null;
  const fromRate = measured ?? at?.rung.m3PerMin ?? 0;
  const atIndex = at ? RUNGS.indexOf(at.rung) : -1;

  return (
    <Panel title="Scaling up" sub="From a Venture to a boosted fleet: what each step takes, costs, and pays back in">
      <div className="ladder-bar" aria-label="Where you are on the ladder">
        {RUNGS.map((g, i) => (
          <span key={g.key} className={'ladder-step' + (i <= atIndex ? ' done' : '') + (i === atIndex ? ' here' : '')}>
            <span className="dot" aria-hidden="true" />{g.title}
          </span>
        ))}
      </div>
      <p className="note small" style={{ margin: 0 }}>
        {at ? `You can fly and fit the ${name(at.rung.ship)} now.` : 'You can’t fly any of these yet: the Venture is the first step.'}
        {' '}{measured != null ? `Your measured pace is ${units(Math.round(measured))} m³ a minute (the middle of your sessions).` : at?.rung.m3PerMin ? `Until the cloud times your sessions, the figures are EVE University’s for an average pilot.` : ''}
        {iskPerM3 != null ? ` Payback is at ${isk(iskPerM3)} a m³, ${perM3From}.` : ''}
      </p>
      {!info ? <p className="note">Reading ships, modules and their skills…</p> : (
        <div className="ladder">
          {rows.map((x, i) => {
            const pay = i > atIndex && x.cost != null && iskPerM3 != null && x.rung.m3PerMin != null ? paybackHours(x.cost, fromRate, x.rung.m3PerMin, iskPerM3) : null;
            return (
              <div key={x.rung.key} className={'ladder-card' + (i === atIndex ? ' here' : '') + (i < atIndex ? ' done' : '')}>
                <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
                  <ItemIcon id={x.rung.ship} />
                  <span style={{ minWidth: 0 }}>
                    <span className="lbl" style={{ display: 'block' }}>{i === atIndex ? 'You are here' : i < atIndex ? 'Behind you' : i === atIndex + 1 ? 'Next' : 'Later'}</span>
                    <span style={{ fontSize: 15, color: 'var(--ink)' }}>{x.rung.title}</span>
                  </span>
                </div>
                <p className="note small" style={{ margin: 0 }}>{x.rung.what}</p>
                <div className="kv-mini">
                  <span>Costs</span><b>{x.cost != null ? iskBig(x.cost) : '–'}</b>
                  {x.rung.module && <><span>Fit</span><b>{x.rung.module.count} × {name(x.rung.module.typeId)}</b></>}
                  <span>Yield</span><b>{x.rung.m3PerMin != null ? `~${units(x.rung.m3PerMin)} m³/min` : '–'}</b>
                  {pay != null && <><span>Pays back</span><b style={{ color: 'var(--pos)' }}>{pay < 1 ? 'under an hour' : `${units(Math.round(pay))} h of mining`}</b></>}
                </div>
                {x.rung.source && <p className="note small" style={{ margin: 0, color: 'var(--faint)' }}>{x.rung.source}</p>}
                <SkillNeeds needs={x.needs} />
                {x.rung.alternatives.length > 0 && <p className="note small" style={{ margin: 0 }}>Or {x.rung.alternatives.map((a) => a.why).join('; or ')}.</p>}
              </div>
            );
          })}
        </div>
      )}
      <SkillStrip title="Skills that raise your yield" lines={[
        { name: 'Mining', id: 3386, what: '+5% ore yield a level, in every ship.' },
        { name: 'Astrogeology', id: 3410, what: '+5% ore yield a level. Needs Mining IV; Astrogeology III opens the barges.' },
        { name: 'Mining Barge', id: 17940, what: 'The barges’ own bonus a level; V opens the exhumers.' },
        { name: 'Exhumers', id: 22551, what: 'The exhumers’ own bonus a level.' },
      ]} />
      <p className="note small" style={{ margin: 0 }}><Gem aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: '-2px' }} /> Costs are the hull and its mining modules at the cheapest Jita listings now; tank, rigs and drones aren’t in them. A fleet on several accounts is where this goes next: the app will follow each account’s mining.</p>
    </Panel>
  );
}
