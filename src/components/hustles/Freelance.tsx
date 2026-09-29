import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Copy, MapPin } from 'lucide-react';
import { SCOPE } from '../../lib/config';
import { esi } from '../../lib/esi';
import { ago, isk, iskBig, units } from '../../lib/format';
import {
  bestDeliver, bestOffice, deliverFlags, FILTER_HIDES, jobLedgers, readDeliverJob, whereToAccept,
  type DeliverCall, type DeliverFlag, type JoinedJob, type Office, type RawFreelanceJob,
} from '../../lib/freelance';
import { readJoinedJobs } from '../../lib/freelanceStore';
import { getAuth, hasScope } from '../../lib/auth';
import { useAuth, useNow } from '../../lib/hooks';
import { reachFrom, routeTo, type Graph, type Reach } from '../../lib/jumps';
import { pool } from '../../lib/lootMarket';
import { jitaOrders, setDestination } from '../../lib/market';
import { countedIn } from '../../lib/positions';
import { loadCache } from '../../lib/scan';
import { update, useData } from '../../lib/store';
import { toast } from '../../lib/toast';
import { endpoint, groupTypes, JITA_SYSTEM, typeInfo } from '../../lib/universe';
import { GANK_SYSTEMS } from '../../lib/arbitrage';
import { useEnsureNames, useTypeName } from '../common';
import { Check, Flag, Th } from '../ui';

const FLAG: Record<DeliverFlag, { short: string; why: string }> = {
  cantSee: { short: 'Can’t see it', why: 'The delivery point is a player structure ESI won’t describe to you, which usually means you can’t dock there. Check in game before buying anything for it.' },
  unchecked: { short: 'Structure unchecked', why: 'The delivery point is a player structure, and your login can’t ask ESI whether you can dock there (the structures permission). Check in game first.' },
  lowsec: { short: 'Not high-sec', why: 'It’s delivered below 0.5: gate camps don’t care what you’re carrying.' },
  noRoute: { short: 'No high-sec route', why: 'There’s no way there from Jita without leaving high-sec.' },
  gank: { short: 'Through Uedama/Sivala', why: 'The only high-sec route runs through the gank systems. A valuable load there is bait.' },
  expiring: { short: 'Ends within a day', why: 'The job closes within 24 hours: deliver before then or the goods are yours to keep.' },
};

/** When a job ends, in days once it's more than two away. */
const ends = (iso: string, now: number) => {
  const h = (Date.parse(iso) - now) / 3600_000;
  return !(h > 0) ? 'ended' : h < 1 ? 'within the hour' : h < 48 ? `in ${Math.round(h)} h` : `in ${Math.round(h / 24)} days`;
};
const big = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : units(n));

type Row = DeliverCall & { office: Office; offices: number; flags: DeliverFlag[]; m3: number | null; accept: { fromJita: boolean; near: string | null; jumps: number | null } };

let graphP: Promise<Graph> | null = null;
/** The stargate map (src/data/universeGraph.json, a chunk of its own), loaded once. */
const loadGraph = () => (graphP ??= import('../../data/universeGraph.json').then((m) => (m.default as unknown as { systems: Graph }).systems));

/**
 * Freelance "Deliver" jobs that pay more for an item than Jita sells it for (lib/freelance.ts), and the ones you've
 * done with what they cost and paid. Every open job is read from ESI and priced against the live Jita book (a group job
 * across all its items); each is delivered to its nearest office and split by where it can be accepted (within 5 jumps
 * of a system it's broadcast in), with distances worked out on the stargate map (jumps.ts).
 */
export function Freelance() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const name = useTypeName();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stats, setStats] = useState<{ jobs: number; deliver: number; under: number; at: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The user's defaults: high-sec all the way, round the gank systems, and only offices you can dock at.
  const [only, setOnly] = useState({ highsec: true, gank: true, dock: true });
  useEnsureNames((rows ?? []).flatMap((r) => r.types.map((t) => t.typeId)));
  const canDest = (auth?.scopes ?? []).includes(SCOPE.waypoint);

  // The jobs you've joined, read fresh when the tab opens (and kept for the Wallet and Results).
  const canMine = hasScope(SCOPE.freelance);
  const [mine, setMine] = useState<JoinedJob[] | null>(d.meta.freelance?.jobs ?? null);
  useEffect(() => {
    const a = getAuth();
    if (!a || !canMine) return;
    let live = true;
    readJoinedJobs(a.characterId).then((jobs) => {
      if (!live) return;
      setMine(jobs);
      update((x) => ({ meta: { ...x.meta, freelance: { at: new Date().toISOString(), jobs } } }));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [canMine]);
  const inJob = useMemo(() => new Map((mine ?? []).filter((j) => j.standing === 'Committed' && j.state === 'Active').map((j) => [j.id, j])), [mine]);

  const find = async () => {
    setBusy('Reading the job board…');
    try {
      // Every open job, newest first, paged back with the `before` cursor.
      const raw: { id: string }[] = [];
      let before: string | undefined;
      for (let page = 0; page < 30; page++) {
        const { data } = await esi<{ freelance_jobs: { id: string; state: string }[]; cursor?: { before?: string } }>('/freelance-jobs', { query: { limit: 100, before } });
        raw.push(...data.freelance_jobs.filter((j) => j.state === 'Active'));
        if (!data.freelance_jobs.length || !data.cursor?.before || data.cursor.before === before) break;
        before = data.cursor.before;
      }
      const jobs: RawFreelanceJob[] = [];
      let done = 0;
      await pool(raw, 8, async (j) => {
        try { jobs.push((await esi<RawFreelanceJob>(`/freelance-jobs/${j.id}`)).data); } catch { /* one job unread */ }
        setBusy(`Reading ${++done} of ${raw.length} jobs…`);
      });
      // A job you're in counts only what's left of your share.
      const deliver = jobs.map(readDeliverJob).filter((j): j is NonNullable<typeof j> => j != null).map((j) => {
        const m = inJob.get(j.id);
        return m && j.perPlayer != null ? { ...j, perPlayer: Math.max(0, j.perPlayer - m.delivered) } : j;
      }).filter((j) => j.perPlayer == null || j.perPlayer > 0);
      // What each job takes: its item, or every item in its group.
      setBusy('Looking up what they want…');
      const typesOf = new Map<string, number[]>();
      await pool(deliver, 6, async (j) => {
        const ids = j.item.kind === 'type' ? j.item.ids : (await Promise.all(j.item.ids.map((g) => groupTypes(g).catch(() => [] as number[])))).flat();
        typesOf.set(j.id, ids);
      });
      // Priced on the live Jita book. The last full scan, when there is one, says which items have no Jita sellers at
      // all (a group's unpublished types, things nobody lists), so they aren't read for nothing.
      const cache = await loadCache();
      const scanned = Object.keys(cache.books).length > 0;
      const need = [...new Set([...typesOf.values()].flat())].filter((t) => !scanned || (cache.books[t]?.topSells?.length ?? 0) > 0);
      const books = new Map<number, { price: number; volume: number }[]>();
      done = 0;
      await pool(need, 6, async (t) => {
        try { books.set(t, (await jitaOrders(t)).orders.filter((o) => !o.isBuy)); } catch { /* left unpriced */ }
        setBusy(`Reading ${++done} of ${need.length} Jita books…`);
      });
      const priced = deliver.map((j) => bestDeliver(j, typesOf.get(j.id) ?? [], (t) => books.get(t))).filter((c): c is DeliverCall => c != null && c.profit > 0);
      // Where to deliver and where to accept, on the stargate map.
      setBusy('Finding where they’re delivered…');
      const graph = await loadGraph();
      const reach: Reach = reachFrom(graph, JITA_SYSTEM, GANK_SYSTEMS);
      const out: Row[] = [];
      await pool(priced, 4, async (c) => {
        const offices: Office[] = [];
        for (const t of c.job.to) {
          const e = await endpoint(t.id);
          const r = e.systemId != null ? routeTo(reach, e.systemId) : { jumps: null, anyJumps: null, throughGank: false, aroundExtra: null };
          offices.push({ id: t.id, name: e.name, systemId: e.systemId, security: e.security, unseen: e.kind === 'structure' && e.systemId == null ? (e.unchecked ? 'unchecked' : 'cantSee') : null, ...r });
        }
        const office = bestOffice(offices)!;
        const acc = whereToAccept(c.job.broadcast, (s) => reach.any.get(s) ?? null);
        let m3 = 0, known = true;
        for (const t of c.types) {
          const info = await typeInfo(t.typeId).catch(() => null);
          if (info) m3 += (info.packagedVolume ?? info.volume) * t.units; else known = false;
        }
        out.push({
          ...c, office, offices: offices.length, flags: deliverFlags(office, c.job.expires, Date.now()), m3: known ? m3 : null,
          accept: { fromJita: acc.fromJita, near: acc.nearest != null ? graph[acc.nearest]?.[1] ?? null : null, jumps: acc.jumps },
        });
      });
      setRows(out.sort((a, b) => b.profit - a.profit));
      setStats({ jobs: jobs.length, deliver: deliver.length, under: deliver.length - priced.length, at: Date.now() });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(null);
    }
  };

  const hidden = (r: Row) => (Object.keys(FILTER_HIDES) as (keyof typeof FILTER_HIDES)[]).some((k) => only[k] && r.flags.some((f) => (FILTER_HIDES[k] as readonly string[]).includes(f)));
  const hides = (k: keyof typeof FILTER_HIDES) => (rows ?? []).filter((r) => r.flags.some((f) => (FILTER_HIDES[k] as readonly string[]).includes(f))).length;
  const shown = (rows ?? []).filter((r) => !hidden(r));
  const fromJita = shown.filter((r) => r.accept.fromJita), elsewhere = shown.filter((r) => !r.accept.fromJita);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(`Copied “${text}”: search for it under Opportunities → Freelance Jobs.`); }
    catch { toast('Your browser wouldn’t let the page copy.', 'err'); }
  };
  const go = async (id: number) => {
    try { await setDestination(id); toast('Destination set in your client.', 'info'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
  };

  return (
    <>
      <div className="intro-row">
        <p>
          Freelance jobs that pay more for an item than Jita sells it for: buy it here, haul it, deliver it. Each job pays a fixed reward per unit from a pool
          its owner funded up front. The game lists a job only within 5 jumps of a system it’s broadcast in, so that’s where you accept it (a few at a time,
          Opportunities → Freelance Jobs); you can still buy everything in Jita.
        </p>
        <button type="button" className="btn primary tall" disabled={!!busy} onClick={() => void find()}><Briefcase aria-hidden="true" />{busy ?? (rows ? 'Look again' : 'Find jobs')}</button>
      </div>

      {canMine && mine && mine.length > 0 && <YourJobs jobs={mine} now={now} />}

      {rows && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Check checked={only.highsec} onChange={(v) => setOnly({ ...only, highsec: v })} tip="Hides jobs delivered below 0.5, or with no route from Jita that stays in high-sec">High-sec all the way{hides('highsec') ? ` (${units(hides('highsec'))} hidden)` : ''}</Check>
          <Check checked={only.gank} onChange={(v) => setOnly({ ...only, gank: v })} tip="Hides jobs whose only high-sec route runs through Uedama or Sivala. One that can go round them stays, with the extra jumps said.">Avoid Uedama & Sivala{hides('gank') ? ` (${units(hides('gank'))} hidden)` : ''}</Check>
          <Check checked={only.dock} onChange={(v) => setOnly({ ...only, dock: v })} tip="Hides jobs delivered to a player structure ESI won’t describe to you (you may not be able to dock) or that it wasn’t asked about">Only offices I can dock at{hides('dock') ? ` (${units(hides('dock'))} hidden)` : ''}</Check>
        </div>
      )}
      {stats && (
        <p className="note small" style={{ margin: 0 }}>
          {units(stats.jobs)} open jobs, {units(stats.deliver)} wanting an item; {units(stats.under)} of those pay no more than Jita sells it for, or want
          something nobody lists there. Priced against the live Jita book, {ago(new Date(stats.at).toISOString(), now)}.
        </p>
      )}
      {rows && <JobTable title="Accept from Jita" sub="Broadcast within 5 jumps of Jita: accept it here, buy, haul, deliver" rows={fromJita} name={name} now={now} inJob={inJob} copy={copy} go={canDest ? go : null} />}
      {rows && <JobTable title="Accept elsewhere" sub="Not listed in Jita: accept it within 5 jumps of the system named, and still buy everything in Jita" rows={elsewhere} name={name} now={now} inJob={inJob} copy={copy} go={canDest ? go : null} elsewhere />}
      <p className="note small" style={{ margin: 0 }}>
        The profit is before the trip: weigh it against the jumps. A reward is paid per unit delivered from the job’s own pool, so a nearly empty pool or a
        cap per player limits what you can deliver, and both are counted. A job with several offices is priced to the nearest one you can reach in high-sec.
        Distances come from CCP’s stargate map. Prices move: check the Jita book before buying in bulk.
      </p>
    </>
  );
}

function JobTable({ title, sub, rows, name, now, inJob, copy, go, elsewhere }: {
  title: string; sub: string; rows: Row[]; name: (id: number) => string; now: number; inJob: Map<string, JoinedJob>;
  copy: (text: string) => void; go: ((id: number) => void) | null; elsewhere?: boolean;
}) {
  const [all, setAll] = useState(false);
  const list = all ? rows : rows.slice(0, 15);
  return (
    <div className="col" style={{ gap: 6 }}>
      <b style={{ color: 'var(--ink)' }}>{title} <span className="faint" style={{ fontWeight: 400 }}>· {units(rows.length)}</span></b>
      <span className="note small" style={{ margin: 0 }}>{sub}</span>
      {!rows.length ? <p className="note small" style={{ margin: 0 }}>None right now{elsewhere ? '' : ' within the filters'}.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl compact" style={{ minWidth: 1060 }}>
            <thead><tr>
              <Th left>Job</Th><Th left>Deliver</Th>
              <Th tip="What the job pays per unit, and the range of prices the units cost from the cheapest Jita listings">Pays / costs</Th>
              <Th tip="What you can deliver: bought while a unit costs less than the reward, up to your cap on the job and what it still wants">Units</Th>
              <Th tip="The rewards less what buying them costs. No broker fee or tax on buying from listings. Before the haul.">Profit</Th>
              <Th tip="What you’d carry">m³</Th>
              <Th left tip="The nearest office you can reach in high-sec, and the high-sec route from Jita">Deliver to</Th>
              {elsewhere && <Th left tip="The nearest system it’s broadcast in: be within 5 jumps of it to accept">Accept near</Th>}
              <Th>Ends</Th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.job.id} className="hover">
                  <td className="l" style={{ whiteSpace: 'normal', minWidth: 180 }}>
                    <span className="name">{r.job.name}</span>
                    <span className="sub">{r.job.corp}{r.job.corp === 'Game Masters' ? ' (CCP)' : ''}{inJob.has(r.job.id) ? ` · you’re in it, ${units(inJob.get(r.job.id)!.delivered)} delivered` : ''}</span>
                  </td>
                  <td className="l" style={{ whiteSpace: 'normal', minWidth: 170 }}>
                    {r.types.length === 1 ? name(r.typeId) : r.types.slice(0, 3).map((t) => `${name(t.typeId)} ×${big(t.units)}`).join(', ')}
                    {r.job.item.kind === 'group' && <span className="sub">{r.types.length === 1 ? 'any of its group: the only one under the reward' : `${units(r.types.length)} of its group under the reward`}</span>}
                  </td>
                  <td>{isk(r.job.perUnit)}<span className="sub" data-tip={`Average ${isk(r.cost / r.units)}`}>costs {r.low === r.high ? isk(r.low) : `${isk(r.low)}–${isk(r.high)}`}</span></td>
                  <td>{units(r.units)}<span className="sub">{r.limit === 'player' ? 'your cap' : r.limit === 'left' ? 'all it wants' : 'all listed under it'}</span></td>
                  <td style={{ color: 'var(--pos)' }}>{iskBig(r.profit)}<span className="sub">{r.office.jumps ? `${iskBig(r.profit / r.office.jumps)} a jump` : ''}</span></td>
                  <td>{r.m3 != null ? units(Math.ceil(r.m3)) : '–'}</td>
                  <td className="l" style={{ whiteSpace: 'normal', minWidth: 180 }}>
                    {r.office.name ?? 'A player structure'}
                    <span className="sub">
                      {r.office.jumps != null ? `${units(r.office.jumps)} jump${r.office.jumps === 1 ? '' : 's'} in high-sec` : r.office.anyJumps != null ? `${units(r.office.anyJumps)} jumps, not all high-sec` : ''}
                      {r.office.security != null ? ` · ${r.office.security.toFixed(1)}` : ''}
                      {r.office.aroundExtra ? ` · +${r.office.aroundExtra} to go round Uedama/Sivala` : ''}
                      {r.offices > 1 ? ` · nearest of ${r.offices}` : ''}
                    </span>
                    {r.flags.length > 0 && <span className="flags">{r.flags.map((f) => <Flag key={f} color={f === 'expiring' ? 'var(--acc2)' : 'var(--neg-t)'} title={FLAG[f].short} why={FLAG[f].why}>{FLAG[f].short}</Flag>)}</span>}
                  </td>
                  {elsewhere && <td className="l">{r.accept.near ?? 'Not broadcast'}{r.accept.jumps != null && <span className="sub">{units(r.accept.jumps)} jumps from Jita</span>}</td>}
                  <td>{r.job.expires ? ends(r.job.expires, now) : '–'}</td>
                  <td>
                    <span className="acts">
                      <button type="button" className="link-btn dim" onClick={() => copy(r.job.name)} data-tip="Copy the job’s name, to search for it in game"><Copy aria-hidden="true" />Name</button>
                      {go && <button type="button" className="link-btn dim" onClick={() => go(r.office.id)} data-tip="Set the delivery office as your destination in game"><MapPin aria-hidden="true" />Route</button>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 15 && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? 'Show the best 15' : `Show all ${units(rows.length)}`}</button>}
    </div>
  );
}

/**
 * The jobs you've done, in ISK: rewards from your journal (each names its job), what the items cost you, profit on what's
 * delivered, and what's bought and not yet delivered (jobLedgers). Trades a position counts, or tagged Personal, aren't
 * a job's.
 */
function YourJobs({ jobs, now }: { jobs: JoinedJob[]; now: number }) {
  const d = useData();
  const types = useMemo(() => new Set(jobs.flatMap((j) => j.types)), [jobs]);
  const ledgers = useMemo(() => {
    const txs = Object.values(d.txs).filter((t) => types.has(t.typeId));
    const skip = new Set([...d.ignored, ...txs.filter((t) => d.positions.some((p) => countedIn(p, t))).map((t) => t.id)]);
    return jobLedgers(jobs, Object.values(d.journal), txs, skip);
  }, [jobs, d.txs, d.journal, d.ignored, d.positions, types]);
  const sum = (f: (l: NonNullable<ReturnType<typeof ledgers.get>>) => number) => jobs.reduce((t, j) => t + f(ledgers.get(j.id)!), 0);
  return (
    <div className="col" style={{ gap: 6 }}>
      <b style={{ color: 'var(--ink)' }}>Your jobs <span className="faint" style={{ fontWeight: 400 }}>· {iskBig(sum((l) => l.profit))} profit so far</span></b>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl compact" style={{ minWidth: 900 }}>
          <thead><tr>
            <Th left>Job</Th><Th left>State</Th><Th tip="Delivered, as the rewards paid at the job’s rate say">Delivered</Th>
            <Th tip="The rewards your journal says the job paid">Rewards</Th>
            <Th tip="What you bought of the items it takes since it began (not counted by a position, not tagged Personal)">Spent</Th>
            <Th tip="Rewards, less the delivered units at your average cost, plus anything of it you sold again">Profit so far</Th>
            <Th tip="Bought and not yet delivered or sold, at your average cost">Still holding</Th>
            <Th tip="What’s left of your cap on the job; – when it sets none">Left for you</Th><Th>Ends</Th>
          </tr></thead>
          <tbody>{jobs.map((j) => {
            const l = ledgers.get(j.id)!;
            const left = j.perPlayer != null ? Math.max(0, j.perPlayer - j.delivered) : null;
            return (
              <tr key={j.id}>
                <td className="l" style={{ whiteSpace: 'normal', minWidth: 200 }}><span className="name">{j.name}</span></td>
                <td className="l">{j.state === 'Active' ? (j.standing === 'Committed' ? 'In it' : j.standing) : j.state}</td>
                <td>{units(Math.max(l.delivered, j.delivered))}</td>
                <td style={{ color: l.rewards ? 'var(--pos)' : undefined }}>{l.rewards ? iskBig(l.rewards) : '–'}<span className="sub">{l.payments ? `${units(l.payments)} payment${l.payments === 1 ? '' : 's'}` : ''}</span></td>
                <td>{l.cost ? iskBig(l.cost) : '–'}<span className="sub">{l.bought ? `${big(l.bought)} bought` : ''}{l.sold ? `, ${big(l.sold)} sold again` : ''}</span></td>
                <td style={{ color: l.profit >= 0 ? 'var(--pos)' : 'var(--neg-t)' }}>{l.rewards || l.cost ? iskBig(l.profit) : '–'}</td>
                <td>{l.heldUnits ? <>{big(l.heldUnits)}<span className="sub">{iskBig(l.heldCost)} at cost</span></> : '–'}</td>
                <td>{left != null ? units(left) : '–'}</td>
                <td>{j.expires ? ends(j.expires, now) : '–'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
