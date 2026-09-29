import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Copy, MapPin } from 'lucide-react';
import { SCOPE } from '../../lib/config';
import { esi } from '../../lib/esi';
import { ago, isk, iskBig, units } from '../../lib/format';
import { bestDeliver, deliverFlags, myShare, readDeliverJob, type DeliverCall, type DeliverFlag, type MyJob, type RawFreelanceJob } from '../../lib/freelance';
import { getAuth, hasScope } from '../../lib/auth';
import { useAuth, useNow } from '../../lib/hooks';
import { pool } from '../../lib/lootMarket';
import { jitaOrders, setDestination } from '../../lib/market';
import { loadCache } from '../../lib/scan';
import { useData } from '../../lib/store';
import { toast } from '../../lib/toast';
import { endpoint, groupTypes, JITA_SYSTEM, secureRoute, typeInfo } from '../../lib/universe';
import type { Endpoint } from '../../lib/courier';
import { useEnsureNames, useTypeName } from '../common';
import { useLearnedGankLines } from '../gank';
import { Flag, Th } from '../ui';

const FLAG: Record<DeliverFlag, { short: string; why: string }> = {
  cantSee: { short: 'Can’t see it', why: 'The delivery point is a player structure ESI won’t describe to you, which usually means you can’t dock there. Check in game before buying anything for it.' },
  unchecked: { short: 'Structure unchecked', why: 'The delivery point is a player structure, and your login can’t ask ESI whether you can dock there (the structures permission). Check in game first.' },
  lowsec: { short: 'Not high-sec', why: 'It’s delivered below 0.5: gate camps don’t care what you’re carrying.' },
  noRoute: { short: 'No high-sec route', why: 'There’s no way there from Jita without leaving high-sec.' },
  gank: { short: 'Through Uedama/Sivala', why: 'The high-sec route runs through the gank systems. A valuable load there is bait.' },
  expiring: { short: 'Ends within a day', why: 'The job closes within 24 hours: deliver before then or the goods are yours to keep.' },
};

/** When a job ends, in days once it's more than two away. */
const ends = (iso: string, now: number) => {
  const h = (Date.parse(iso) - now) / 3600_000;
  return !(h > 0) ? 'ended' : h < 1 ? 'within the hour' : h < 48 ? `in ${Math.round(h)} h` : `in ${Math.round(h / 24)} days`;
};

type Row = DeliverCall & { dest: Endpoint; destId: number; jumps: number | null; flags: DeliverFlag[]; m3: number | null };

/**
 * Freelance "Deliver" jobs that pay more for an item than Jita sells it for (lib/freelance.ts). Every open job is read
 * from ESI; the ones wanting an item are priced against the live Jita book, and each delivery point is looked up with
 * the route to it from Jita.
 */
export function Freelance() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const name = useTypeName();
  const { gankIds } = useLearnedGankLines(d);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stats, setStats] = useState<{ jobs: number; deliver: number; under: number; at: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  useEnsureNames((rows ?? []).map((r) => r.typeId));
  const canDest = (auth?.scopes ?? []).includes(SCOPE.waypoint);
  // The jobs you've joined, read when the tab opens: what you've delivered, and what's left of your share.
  const [mine, setMine] = useState<MyJob[] | null>(null);
  const canMine = hasScope(SCOPE.freelance);
  useEffect(() => {
    const a = getAuth();
    if (!a || !canMine) return;
    let live = true;
    (async () => {
      const { data } = await esi<{ freelance_jobs: { id: string; name: string; state: string }[] }>(`/characters/${a.characterId}/freelance-jobs`, { auth: true });
      const out: MyJob[] = [];
      await pool(data.freelance_jobs ?? [], 4, async (j) => {
        const [part, detail] = await Promise.all([
          esi<{ contributed: number; state: string }>(`/characters/${a.characterId}/freelance-jobs/${j.id}/participation`, { auth: true }).then((r) => r.data).catch(() => null),
          esi<RawFreelanceJob>(`/freelance-jobs/${j.id}`).then((r) => r.data).catch(() => null),
        ]);
        out.push({
          id: j.id, name: j.name, state: j.state, delivered: part?.contributed ?? 0, standing: part?.state ?? 'Unspecified',
          perUnit: detail?.contribution?.reward_per_contribution ?? null, perPlayer: detail?.contribution?.contribution_per_participant_limit ?? null,
          expires: detail?.details?.expires ?? null,
        });
      });
      if (live) setMine(out.sort((x, y) => (x.state === 'Active' ? 0 : 1) - (y.state === 'Active' ? 0 : 1) || x.name.localeCompare(y.name)));
    })().catch(() => { if (live) setMine([]); });
    return () => { live = false; };
  }, [canMine]);
  const inJob = useMemo(() => new Map((mine ?? []).filter((j) => j.standing === 'Committed').map((j) => [j.id, j])), [mine]);

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
      const all = deliver.map((j) => bestDeliver(j, typesOf.get(j.id) ?? [], (t) => books.get(t)));
      const priced = all.filter((c): c is DeliverCall => c != null && c.profit > 0);
      setBusy('Finding where they’re delivered…');
      const out: Row[] = [];
      await pool(priced, 4, async (c) => {
        const destId = c.job.to[0].id;
        const dest = await endpoint(destId);
        const route = dest.systemId != null ? await secureRoute(JITA_SYSTEM, dest.systemId).catch(() => null) : null;
        const info = await typeInfo(c.typeId).catch(() => null);
        const each = info ? info.packagedVolume ?? info.volume : null;
        out.push({
          ...c, dest, destId, jumps: route ? route.length - 1 : null,
          flags: deliverFlags(dest, route ? route.length - 1 : null, !!route?.some((s) => gankIds.has(s)), c.job.expires, Date.now()),
          m3: each != null ? each * c.units : null,
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

  const shown = useMemo(() => (all ? rows ?? [] : (rows ?? []).slice(0, 15)), [rows, all]);
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
          its owner funded up front. Accept the job in game first (Opportunities → Freelance Jobs; a few at a time), and mind the ones delivered to player
          structures: you have to be able to dock there.
        </p>
        <button type="button" className="btn primary tall" disabled={!!busy} onClick={() => void find()}><Briefcase aria-hidden="true" />{busy ?? (rows ? 'Look again' : 'Find jobs')}</button>
      </div>
      {canMine && mine && mine.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          <b style={{ color: 'var(--ink)' }}>Your jobs</b>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl compact" style={{ minWidth: 640 }}>
              <thead><tr><Th left>Job</Th><Th left>State</Th><Th>Delivered</Th><Th tip="What’s left of your cap on the job; – when it sets none">Left for you</Th><Th tip="What you’ve delivered, at the job’s reward per unit">Earned</Th><Th>Ends</Th></tr></thead>
              <tbody>{mine.map((j) => {
                const s = myShare(j);
                return (
                  <tr key={j.id}>
                    <td className="l"><span className="name">{j.name}</span></td>
                    <td className="l">{j.state === 'Active' ? (j.standing === 'Committed' ? 'In it' : j.standing) : j.state}</td>
                    <td>{units(j.delivered)}</td>
                    <td>{s.left != null ? units(s.left) : '–'}</td>
                    <td style={{ color: s.earned ? 'var(--pos)' : undefined }}>{s.earned != null ? iskBig(s.earned) : '–'}</td>
                    <td>{j.expires ? ends(j.expires, now) : '–'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}
      {stats && (
        <p className="note small" style={{ margin: 0 }}>
          {units(stats.jobs)} open jobs, {units(stats.deliver)} wanting an item; {units(stats.under)} of those pay no more than Jita sells it for, or want
          something nobody lists there. Priced against the live Jita book, {ago(new Date(stats.at).toISOString(), now)}.
        </p>
      )}
      {rows && (rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl compact" style={{ minWidth: 1000 }}>
            <thead><tr>
              <Th left>Job</Th><Th left>Deliver</Th>
              <Th tip="What the job pays per unit, against what the units cost you from the cheapest Jita listings">Pays / costs</Th>
              <Th tip="What you can deliver: bought while a unit costs less than the reward, up to your cap on the job and what it still wants">Units</Th>
              <Th tip="The rewards less what buying them costs. No broker fee or tax on buying from listings. Before the haul.">Profit</Th>
              <Th tip="What you’d carry">m³</Th>
              <Th left tip="Where it’s delivered, and the high-sec route from Jita">To</Th>
              <Th>Ends</Th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.job.id} className="hover">
                  <td className="l" style={{ whiteSpace: 'normal', minWidth: 180 }}>
                    <span className="name">{r.job.name}</span>
                    <span className="sub">{r.job.corp}{r.job.corp === 'Game Masters' ? ' (CCP)' : ''}{inJob.has(r.job.id) ? ` · you’re in it, ${units(inJob.get(r.job.id)!.delivered)} delivered` : ''}</span>
                  </td>
                  <td className="l" style={{ whiteSpace: 'normal' }}>{name(r.typeId)}{r.job.item.kind === 'group' && <span className="sub">any of its group: this pays most</span>}</td>
                  <td>{isk(r.job.perUnit)}<span className="sub">costs {isk(r.cost / r.units)}</span></td>
                  <td>{units(r.units)}<span className="sub">{r.limit === 'player' ? 'your cap' : r.limit === 'left' ? 'all it wants' : 'all listed under it'}</span></td>
                  <td style={{ color: 'var(--pos)' }}>{iskBig(r.profit)}<span className="sub">{r.jumps ? `${iskBig(r.profit / r.jumps)} a jump` : ''}</span></td>
                  <td>{r.m3 != null ? units(Math.ceil(r.m3)) : '–'}</td>
                  <td className="l" style={{ whiteSpace: 'normal', minWidth: 170 }}>
                    {r.dest.name ?? (r.dest.kind === 'structure' ? 'A player structure' : 'A station')}
                    <span className="sub">
                      {r.jumps != null ? `${units(r.jumps)} jump${r.jumps === 1 ? '' : 's'}` : r.dest.systemId != null ? 'no high-sec route' : ''}{r.dest.security != null ? ` · ${r.dest.security.toFixed(1)}` : ''}
                    </span>
                    {r.flags.length > 0 && <span className="flags">{r.flags.map((f) => <Flag key={f} color={f === 'expiring' ? 'var(--acc2)' : 'var(--neg-t)'} title={FLAG[f].short} why={FLAG[f].why}>{FLAG[f].short}</Flag>)}</span>}
                  </td>
                  <td>{r.job.expires ? ends(r.job.expires, now) : '–'}</td>
                  <td>
                    <span className="acts">
                      <button type="button" className="link-btn dim" onClick={() => void copy(r.job.name)} data-tip="Copy the job’s name, to search for it in game"><Copy aria-hidden="true" />Name</button>
                      {canDest && <button type="button" className="link-btn dim" onClick={() => void go(r.destId)} data-tip="Set the delivery point as your destination in game"><MapPin aria-hidden="true" />Route</button>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="note">No open job pays more for an item than Jita sells it for right now.</p>)}
      {rows && rows.length > 15 && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? 'Show the best 15' : `Show all ${units(rows.length)}`}</button>}
      <p className="note small" style={{ margin: 0 }}>
        The profit is before the trip: weigh it against the jumps. A reward is paid per unit delivered from the job’s own pool, so a nearly empty pool or a
        cap per player limits what you can deliver, and both are counted. Prices move: check the Jita book before buying in bulk.
      </p>
    </>
  );
}
