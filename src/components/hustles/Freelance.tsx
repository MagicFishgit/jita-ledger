import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Coins, Copy, MapPin, Radio, Route, ShoppingCart } from 'lucide-react';
import { SCOPE } from '../../lib/config';
import { esi } from '../../lib/esi';
import { ago, fmtDateTime, fmtShort, isk, iskBig, units } from '../../lib/format';
import {
  afterTax, bestDeliver, bestOffice, deliverFlags, FILTER_HIDES, isRunning, jobHistory, possessive, readDeliverJob, taxPct, whereToAccept,
  type CorpTax, type DeliverCall, type DeliverFlag, type DeliverJob, type JobRow, type JoinedJob, type Office, type RawFreelanceJob, type RewardRead,
} from '../../lib/freelance';
import { refreshJobHistory } from '../../lib/freelanceStore';
import { rates } from '../../lib/fees';
import { getAuth, hasScope } from '../../lib/auth';
import { useAuth, useNow } from '../../lib/hooks';
import { reachFrom, routeTo, type Graph, type Reach } from '../../lib/jumps';
import { pool } from '../../lib/lootMarket';
import { jitaOrders, setDestination } from '../../lib/market';
import { countedIn } from '../../lib/positions';
import { loadCache } from '../../lib/scan';
import { useData } from '../../lib/store';
import { toast } from '../../lib/toast';
import { endpoint, groupTypes, JITA_SYSTEM, typeInfo } from '../../lib/universe';
import { GANK_SYSTEMS } from '../../lib/arbitrage';
import { useEnsureNames, useTypeName, copyMultibuy } from '../common';
import { Check, Flag, Th, Tip } from '../ui';
import { Figures, Points } from '../Facts';
import { multibuy } from '../../lib/combat';

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

type Accept = { fromJita: boolean; near: string | null; jumps: number | null };
type Row = DeliverCall & { office: Office; offices: number; flags: DeliverFlag[]; m3: number | null; accept: Accept };
/** A job worth a look before tax, with where it's delivered and accepted: priced at render, after the tax read then. */
type Cand = { job: DeliverJob; typeIds: number[]; office: Office; offices: number; flags: DeliverFlag[]; accept: Accept };
/** What a look at the board found: the candidates, the Jita books they were priced on, and each item's m³ a unit. */
type Found = { cands: Cand[]; books: Map<number, { price: number; volume: number }[]>; vol: Map<number, number | null>; jobs: number; deliver: number; at: number };

let graphP: Promise<Graph> | null = null;
/** The stargate map (src/data/universeGraph.json, a chunk of its own), loaded once. */
const loadGraph = () => (graphP ??= import('../../data/universeGraph.json').then((m) => (m.default as unknown as { systems: Graph }).systems));

/**
 * Freelance "Deliver" jobs that pay more for an item than Jita sells it for (lib/freelance.ts), and the ones you've
 * done with what they cost and paid. Every open job is read from ESI and priced against the live Jita book (a group job
 * across all its items) after your corporation's tax as the last sync read it; each is delivered to its nearest office and
 * split by where it can be accepted (within 5 jumps of a system it's broadcast in), with distances worked out on the
 * stargate map (jumps.ts).
 */
export function Freelance() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const name = useTypeName();
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Your corporation's tax, as the last sync read it. Each job is priced after it at render, so a sync that reads a new
  // corporation or rate re-prices what's shown without looking again (courier contracts are judged the same way).
  const corp: CorpTax | null = d.meta.corp ?? null;
  const rate = corp?.taxRate ?? 0;
  const rows = useMemo<Row[] | null>(() => {
    if (!found) return null;
    const out: Row[] = [];
    for (const c of found.cands) {
      const call = bestDeliver(c.job, c.typeIds, (t) => found.books.get(t), rate);
      if (!call || call.profit <= 0) continue;
      let m3 = 0, known = true;
      for (const t of call.types) { const v = found.vol.get(t.typeId); if (v == null) known = false; else m3 += v * t.units; }
      out.push({ ...call, office: c.office, offices: c.offices, flags: c.flags, m3: known ? m3 : null, accept: c.accept });
    }
    return out.sort((a, b) => b.profit - a.profit);
  }, [found, rate]);
  const stats = found && rows ? { jobs: found.jobs, deliver: found.deliver, under: found.deliver - rows.length, at: found.at } : null;
  // The user's defaults: high-sec all the way, round the gank systems, and only offices you can dock at.
  const [only, setOnly] = useState({ highsec: true, gank: true, dock: true });
  useEnsureNames((rows ?? []).flatMap((r) => r.types.map((t) => t.typeId)));
  const canDest = (auth?.scopes ?? []).includes(SCOPE.waypoint);

  // Every job you took part in, read again when the tab opens (the journal's rewards name them; the joined list needs
  // the freelance permission) and kept for the Wallet and Results, merged with what's kept, never replacing it.
  const canMine = hasScope(SCOPE.freelance);
  useEffect(() => {
    const a = getAuth();
    if (!a) return;
    refreshJobHistory(a.characterId, canMine).catch(() => undefined);
  }, [canMine]);
  const mine = d.meta.freelance?.jobs;
  const inJob = useMemo(() => new Map((mine ?? []).filter((j) => j.standing === 'Committed' && j.state === 'Active' && j.joined !== false).map((j) => [j.id, j])), [mine]);

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
      // Every job that pays before tax: the rate is applied at render, and it can only take jobs away.
      const priced = deliver.map((j) => bestDeliver(j, typesOf.get(j.id) ?? [], (t) => books.get(t))).filter((c): c is DeliverCall => c != null && c.profit > 0);
      // Where to deliver and where to accept, on the stargate map.
      setBusy('Finding where they’re delivered…');
      const graph = await loadGraph();
      const reach: Reach = reachFrom(graph, JITA_SYSTEM, GANK_SYSTEMS);
      const cands: Cand[] = [];
      const vol = new Map<number, number | null>();
      await pool(priced, 4, async (c) => {
        const offices: Office[] = [];
        for (const t of c.job.to) {
          const e = await endpoint(t.id);
          const r = e.systemId != null ? routeTo(reach, e.systemId) : { jumps: null, anyJumps: null, throughGank: false, aroundExtra: null };
          offices.push({ id: t.id, name: e.name, systemId: e.systemId, security: e.security, unseen: e.kind === 'structure' && e.systemId == null ? (e.unchecked ? 'unchecked' : 'cantSee') : null, ...r });
        }
        const office = bestOffice(offices)!;
        const acc = whereToAccept(c.job.broadcast, (s) => reach.any.get(s) ?? null);
        // Every item bought before tax: after it, a job buys the same items or fewer.
        for (const t of c.types) {
          if (vol.has(t.typeId)) continue;
          const info = await typeInfo(t.typeId).catch(() => null);
          vol.set(t.typeId, info ? info.packagedVolume ?? info.volume : null);
        }
        cands.push({
          job: c.job, typeIds: typesOf.get(c.job.id) ?? [], office, offices: offices.length, flags: deliverFlags(office, c.job.expires, Date.now()),
          accept: { fromJita: acc.fromJita, near: acc.nearest != null ? graph[acc.nearest]?.[1] ?? null : null, jumps: acc.jumps },
        });
      });
      setFound({ cands, books, vol, jobs: jobs.length, deliver: deliver.length, at: Date.now() });
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
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <p style={{ margin: 0 }}>Jobs that pay more for an item than Jita sells it for: <b>buy it here, haul it, deliver it.</b></p>
          <Points compact items={[
            { kind: 'info', icon: Coins, lead: 'Paid per unit', text: 'a fixed reward from a pool its owner funded up front.' },
            { kind: 'info', icon: Radio, lead: 'Accept it', text: 'within 5 jumps of a system it’s broadcast in (Opportunities → Freelance Jobs).' },
            { kind: 'tip', icon: ShoppingCart, lead: 'Buy in Jita', text: 'whichever system you accept it from.' },
          ]} />
        </div>
        <button type="button" className="btn primary tall" disabled={!!busy} onClick={() => void find()}><Briefcase aria-hidden="true" />{busy ?? (rows ? 'Look again' : 'Find jobs')}</button>
      </div>

      <JobHistory now={now} />

      {rows && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Check checked={only.highsec} onChange={(v) => setOnly({ ...only, highsec: v })} tip="Hides jobs delivered below 0.5, or with no route from Jita that stays in high-sec">High-sec all the way{hides('highsec') ? ` (${units(hides('highsec'))} hidden)` : ''}</Check>
          <Check checked={only.gank} onChange={(v) => setOnly({ ...only, gank: v })} tip="Hides jobs whose only high-sec route runs through Uedama or Sivala. One that can go round them stays, with the extra jumps said.">Avoid Uedama & Sivala{hides('gank') ? ` (${units(hides('gank'))} hidden)` : ''}</Check>
          <Check checked={only.dock} onChange={(v) => setOnly({ ...only, dock: v })} tip="Hides jobs delivered to a player structure ESI won’t describe to you (you may not be able to dock) or that it wasn’t asked about">Only offices I can dock at{hides('dock') ? ` (${units(hides('dock'))} hidden)` : ''}</Check>
        </div>
      )}
      {stats && (
        <div className="col" style={{ gap: 4 }}>
          <Figures items={[
            { key: 'jobs', value: units(stats.jobs), label: 'open jobs' },
            { key: 'want', value: units(stats.deliver), label: 'want an item' },
            { key: 'under', value: units(stats.under), label: `of those pay no more than Jita${corp ? ' after tax' : ''}, or want something nobody lists` },
          ]} />
          <span className="note small" style={{ margin: 0 }}>Priced against the live Jita book {ago(new Date(stats.at).toISOString(), now)}. Profits are {afterTax(corp)}.</span>
        </div>
      )}
      {rows && <JobTable title="Accept from Jita" sub="Broadcast within 5 jumps of Jita: accept it here, buy, haul, deliver" rows={fromJita} name={name} now={now} inJob={inJob} copy={copy} go={canDest ? go : null} corp={corp} />}
      {rows && <JobTable title="Accept elsewhere" sub="Not listed in Jita: accept it within 5 jumps of the system named, and still buy everything in Jita" rows={elsewhere} name={name} now={now} inJob={inJob} copy={copy} go={canDest ? go : null} corp={corp} elsewhere />}
      <Points compact items={[
        { kind: 'warn', icon: Route, lead: 'Before the trip', text: 'the profit leaves out your time: weigh it against the jumps.' },
        { kind: 'info', lead: 'Pool and cap', text: 'a nearly empty pool or a cap per player limits what you can deliver; both are counted.' },
        { kind: 'info', icon: MapPin, lead: 'Nearest office', text: 'a job with several is priced to the nearest you can reach in high-sec, on CCP’s stargate map.' },
        { kind: 'tip', lead: 'Prices move', text: 'check the Jita book before buying in bulk.' },
      ]} />
    </>
  );
}

function JobTable({ title, sub, rows, name, now, inJob, copy, go, corp, elsewhere }: {
  title: string; sub: string; rows: Row[]; name: (id: number) => string; now: number; inJob: Map<string, JoinedJob>;
  copy: (text: string) => void; go: ((id: number) => void) | null; corp: CorpTax | null; elsewhere?: boolean;
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
              <Th tip="What the job pays per unit, before your corporation’s tax, and the range of prices the units cost from the cheapest Jita listings">Pays / costs</Th>
              <Th tip={'How many you can deliver: the smallest of three limits, and the line under the number says which one it is.\n\n• Needed: what the job still wants.\n• Your cap: the most one player may deliver, when the job sets one.\n• Under the reward: how many Jita sells for less than a unit pays after your corporation’s tax; past that, buying costs more than it pays.'}>Units</Th>
              <Th tip={corp
                ? `The rewards ${afterTax(corp)}, less what buying the units costs. Before the haul.\n\n• Your corporation takes its tax before a reward reaches your wallet; the rate is the one ESI gives for ${corp.name}, read on each sync.\n• No broker fee or tax on buying from listings.`
                : `The rewards less what buying the units costs, ${afterTax(null)}. Before the haul.\n\n• Your corporation takes its tax before a reward reaches your wallet; the next sync reads its rate.\n• No broker fee or tax on buying from listings.`}>Profit</Th>
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
                  <td><span data-tip={`${isk(r.net)} a unit to you ${afterTax(corp)}`}>{isk(r.job.perUnit)}</span><span className="sub" data-tip={`Average ${isk(r.cost / r.units)}`}>costs {r.low === r.high ? isk(r.low) : `${isk(r.low)}–${isk(r.high)}`}</span></td>
                  <td>{units(r.units)}<span className="sub">{r.limit === 'player' ? 'your cap on the job' : r.limit === 'left' ? 'all the job still needs' : 'all Jita sells under the reward'}</span></td>
                  <td style={{ color: 'var(--pos)', whiteSpace: 'normal', minWidth: 150 }}>{iskBig(r.profit)}
                    <span className="sub" style={{ whiteSpace: 'normal' }}>{afterTax(corp)}</span>
                    {r.office.jumps ? <span className="sub">{iskBig(r.profit / r.office.jumps)} a jump</span> : null}
                  </td>
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
                      <button type="button" className="link-btn dim" onClick={() => void copyMultibuy(multibuy(r.types.map((t) => ({ name: name(t.typeId), qty: t.units }))), r.types.length, r.cost)}
                        data-tip={`Copy what to buy for this job for the Multibuy window: ${r.types.map((t) => `${name(t.typeId)} ×${big(t.units)}`).join(', ')}, about ${iskBig(r.cost)} at the listings just read. Multibuy buys from the cheapest listings at once, with no price limit, so check its total before you press Buy.`}><ShoppingCart aria-hidden="true" />Multibuy</button>
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

/** Why a payment's units, and so its tax, aren't known, in words. */
const WHY: Record<NonNullable<RewardRead['why']>, string> = {
  rate: 'ESI won’t describe the job, so what it paid a unit isn’t known',
  history: 'your journal doesn’t give its tax, and the corporations you were in then haven’t been read',
  fits: 'your journal doesn’t give its tax, and it doesn’t come out exact at the rate of the corporation you were in then (or comes out exact at two)',
};

/** An amount to the cent, as the journal has it: "231,057,235.19". */
const cent = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Each payment, its tax and how it's known, at most a dozen: a tip. */
function paymentLines(row: JobRow): string {
  const shown = row.rewards.slice(-12);
  const lines = shown.map((r) => {
    const head = `• ${fmtDateTime(r.at)}: ${cent(r.amount)} ISK`;
    const aside = r.journalTax != null ? ` Your journal’s tax, ${cent(r.journalTax)} ISK, didn’t come out a whole number of units at the job’s rate, so it was set aside.` : '';
    if (r.units == null) return `${head}, tax not recorded: ${WHY[r.why ?? 'fits']}.${aside}`;
    const rate = r.rate != null ? taxPct(r.rate) : '?';
    return `${head} for ${units(r.units)} units, after ${rate}${r.how === 'esi' ? ' (from your journal)' : ` (${r.corp ? `${possessive(r.corp)}, ` : ''}worked out)`}.${aside}`;
  });
  const lead = row.rewards.length > 12 ? `Its last 12 payments of ${units(row.rewards.length)}, each after your corporation’s tax:` : 'Each payment, after your corporation’s tax:';
  const ex = shown.find((r) => r.how === 'derived' && r.units != null && r.rate != null);
  const worked = ex ? `\n\nWorked out where your journal doesn’t give the tax: the rate of the corporation ESI says you were in then, and only when the payment comes out a whole number of units at it (${units(ex.units)} × ${isk(row.job.perUnit)} less ${taxPct(ex.rate!)} is exactly ${cent(ex.amount)} ISK).` : '';
  return `${lead}\n\n${lines.join('\n')}${worked}`;
}

const when = (row: JobRow, now: number) => {
  const j = row.job;
  if (isRunning(j, now)) return { main: j.created ? `since ${fmtShort(j.created)}` : 'running', sub: j.expires ? `ends ${ends(j.expires, now)}` : '' };
  if (j.created && j.finished) return { main: fmtShort(j.created) === fmtShort(j.finished) ? fmtShort(j.finished) : `${fmtShort(j.created)} – ${fmtShort(j.finished)}`, sub: j.state };
  const last = row.rewards[row.rewards.length - 1];
  return { main: last ? `paid ${fmtShort(last.at)}` : '–', sub: j.described === false ? '' : j.state };
};

/**
 * Every job you did (freelance.ts jobHistory): what it paid, the tax taken, the units delivered, what the ones you bought
 * cost, what's left over and the profit, running jobs first, newest first, with a total. The user asked for the tab to
 * be where you see the runs you did, their cost and the profit made. Trades a position counts, or tagged, aren't a job's,
 * as on the Wallet.
 */
function JobHistory({ now }: { now: number }) {
  const d = useData();
  const jobs = d.meta.freelance?.jobs;
  const corps = d.meta.freelance?.corps;
  const hist = useMemo(() => {
    const takes = new Set((jobs ?? []).flatMap((j) => j.types));
    const txs = Object.values(d.txs).filter((t) => t.source === 'esi' && takes.has(t.typeId));
    const skip = new Set([...d.ignored, ...txs.filter((t) => t.id in d.tags || d.positions.some((p) => countedIn(p, t))).map((t) => t.id)]);
    return jobHistory({ jobs: jobs ?? [], journal: Object.values(d.journal), txs, skip, corps, salesTax: rates(d.settings).t, now });
  }, [jobs, corps, d.txs, d.journal, d.ignored, d.tags, d.positions, d.settings, Math.floor(now / 3600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const { rows, total } = hist;
  if (!rows.length) return null;
  const running = rows.filter((r) => isRunning(r.job, now)).length;
  // Nothing not known reads as a zero: no payment's tax recorded, or no job paid whose units are known, is "–".
  const noTax = total.payments > 0 && total.taxUnknown === total.payments;
  const noUnits = total.unknown > 0 && rows.every((r) => r.delivered == null || r.rewards.length === 0);
  return (
    <div className="col fl-history" style={{ gap: 6 }}>
      <b style={{ color: 'var(--ink)' }}>Every job you did <span className="faint" style={{ fontWeight: 400 }}>· {units(rows.length)}{running ? `, ${units(running)} running` : ''}</span></b>
      <Figures items={[
        { key: 'paid', value: iskBig(total.received), label: 'paid to you', tip: 'Every reward your journal names a job for, after your corporation’s tax.' },
        { key: 'tax', value: noTax ? '–' : iskBig(total.tax), label: noTax ? 'tax taken: not recorded' : total.taxUnknown ? `tax taken; ${units(total.taxUnknown)} payment${total.taxUnknown === 1 ? '' : 's'} not recorded` : 'tax taken',
          tip: 'What your corporation took from the rewards before they reached your wallet: from your journal, or worked out from the corporation ESI says you were in then. Each job’s tax has its payments in its tip.' },
        { key: 'profit', value: noUnits ? '–' : iskBig(total.profit), label: noUnits ? 'profit: units delivered not known' : total.unknown ? `profit, ${units(total.unknown)} job${total.unknown === 1 ? '' : 's'} not counted` : 'profit',
          tip: 'The rewards, less what the delivered units you bought cost, plus anything bought for a job and sold again. Units delivered from stock you didn’t buy for the job have no cost here, and units sold that weren’t bought for one are left out. A job whose units aren’t known isn’t counted.' },
        { key: 'held', value: total.held ? iskBig(total.heldCost) : noUnits ? '–' : 'None', label: total.held ? `bought, not delivered (${units(total.held)} units)` : 'bought, not delivered',
          tip: 'Bought while a job ran and never delivered or sold, at what it cost: still yours, so not in the profit. A job whose units delivered aren’t known isn’t counted: what it bought can’t be said to be left over.' },
      ]} />
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl compact flh-table">
          <thead><tr>
            <Th left tip="Who posted it, and when it began and was done (EVE time), or since when it runs and when it ends">Job</Th>
            <th scope="col" className="flh-wide"><span className="th">Delivered<Tip title="Delivered" text={'Units delivered, as the rewards say: each reward and its tax ÷ what the job pays a unit before tax.\n\n• The tax from your journal when it gives one; else worked out from your corporation then.\n• – when a payment’s tax can’t be told: its tip says why.'} /></span></th>
            <th scope="col" className="flh-wide"><span className="th">Rewards<Tip title="Rewards" text="The rewards your journal says the job paid, after your corporation’s tax" /></span></th>
            <th scope="col" className="flh-wide"><span className="th">Tax<Tip title="Tax" text={'What your corporation took before each reward reached your wallet.\n\n• From your journal when it gives the tax.\n• Worked out when it doesn’t: the rate of the corporation ESI’s history says you were in then, only when the reward comes out a whole number of units at it.\n• Not recorded otherwise: no rate is assumed.'} /></span></th>
            <th scope="col" className="flh-wide"><span className="th">Cost<Tip title="Cost" text={'What the delivered units you bought cost. Each delivery takes what you bought most recently before it, of the items the job takes, while it ran, and a purchase counts once, even when two jobs ran at once.\n\n• Units delivered beyond that came from stock you didn’t buy for it (mined, contracted from another character, looted, bought before it began): they have no cost here, and it says how many.'} /></span></th>
            <th scope="col" className="flh-wide"><span className="th">Left over<Tip title="Left over" text="Bought while it ran and not delivered or sold, at what it cost. Kept with the job paid next after the purchase." /></span></th>
            <th scope="col" className="flh-wide"><span className="th">Profit<Tip title="Profit" text={'The rewards, less what the delivered units you bought cost, plus anything bought for it and sold again (after sales tax, less what it cost).\n\n• A sale takes what was left over first, oldest first, and counts for the job it was bought for.\n• Units sold while it ran that weren’t bought for a job (mined, contracted, looted) are said apart and left out.'} /></span></th>
          </tr></thead>
          <tbody>{rows.map((r) => <JobLine key={r.job.id} r={r} now={now} />)}</tbody>
          <tfoot><tr>
            <td className="l">All {units(rows.length)}
              <div className="flh-phone">
                <b style={{ color: noUnits ? undefined : total.profit >= 0 ? 'var(--pos)' : 'var(--neg-t)' }}>{noUnits ? 'Profit not known' : `Profit ${iskBig(total.profit)}`}{!noUnits && total.unknown ? `, ${units(total.unknown)} not counted` : ''}</b>
                <span>{noUnits ? '' : `${units(total.delivered)} delivered · `}{iskBig(total.received)} paid · {noTax ? 'tax not recorded' : `${iskBig(total.tax)} tax`}{noUnits ? '' : ` · ${iskBig(total.cost)} cost`}{total.held ? ` · ${units(total.held)} left over` : ''}</span>
              </div>
            </td>
            <td className="flh-wide">{noUnits ? '–' : units(total.delivered)}{total.unknown > 0 && <span className="sub">{units(total.unknown)} job{total.unknown === 1 ? '' : 's'} not known</span>}</td>
            <td className="flh-wide">{iskBig(total.received)}</td>
            <td className="flh-wide">{noTax ? 'Not recorded' : iskBig(total.tax)}{!noTax && total.taxUnknown > 0 && <span className="sub">{units(total.taxUnknown)} not recorded</span>}</td>
            <td className="flh-wide">{noUnits ? '–' : iskBig(total.cost)}{total.fromStock > 0 && <span className="sub">{units(total.fromStock)} not bought for it</span>}</td>
            <td className="flh-wide">{total.held ? <>{units(total.held)}<span className="sub">{iskBig(total.heldCost)} at cost</span></> : '–'}</td>
            <td className="flh-wide" style={{ color: noUnits ? undefined : total.profit >= 0 ? 'var(--pos)' : 'var(--neg-t)' }}>{noUnits ? '–' : iskBig(total.profit)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

/** Units sold while it ran that weren't bought for a job: said, and out of the profit. */
const otherSold = (r: JobRow) => `${units(r.soldOther)} sold for ${iskBig(r.soldOtherRevenue)} that weren’t bought for it: left out of the profit`;

/** A price without its unit, for the lines under a figure: "11.76–11.91". */
const bare = (n: number | null) => isk(n).replace(/ ISK$/, '');

/** One job's line. On a phone (styles.css, `.flh-table`) only the job and its profit keep a column; the rest folds under the name. */
function JobLine({ r, now }: { r: JobRow; now: number }) {
  const w = when(r, now);
  const live = isRunning(r.job, now);
  const left = live && r.job.perPlayer != null ? Math.max(0, r.job.perPlayer - r.job.delivered) : null;
  const allUnknown = r.rewards.length > 0 && r.taxUnknown === r.rewards.length;
  const taxSaid = !r.rewards.length ? '–' : allUnknown ? 'Not recorded' : iskBig(r.tax);
  const taxSub = !r.rewards.length ? '' : allUnknown ? 'tip says why' : [
    [...new Set(r.rewards.filter((x) => x.rate != null).map((x) => taxPct(x.rate!)))].join(', '),
    r.rewards.some((x) => x.how === 'derived') ? 'worked out' : 'from your journal',
    r.taxUnknown ? `${units(r.taxUnknown)} not recorded` : '',
  ].filter(Boolean).join(' · ');
  const range = r.low == null ? '' : r.low === r.high ? bare(r.low) : `${bare(r.low)}–${bare(r.high)}`;
  const stock = r.fromStock > 0 ? `${units(r.fromStock)} from stock you didn’t buy for it: no cost counted` : '';
  const unsure = r.unsure ? 'may be off: a job taking the same items has a payment whose units aren’t known' : '';
  const tax = (cls?: string) => r.rewards.length
    ? <span className={cls} tabIndex={0} data-tip={paymentLines(r)} data-tip-title={`${r.job.name}: its payments`}>{taxSaid}{cls ? (taxSub ? ` (${taxSub})` : '') : <span className="sub">{taxSub}</span>}</span>
    : <>–</>;
  return (
    <tr>
      <td className="l flh-job">
        <span className="name">{r.job.name}</span>
        <span className="sub">{r.job.described === false ? 'ESI won’t describe it: its rewards are all that’s known'
          : [r.job.by?.character, r.job.by?.corp].filter(Boolean).join(' · ')}</span>
        <span className="sub">{w.main}{w.sub ? ` · ${w.sub}` : ''}{left != null ? ` · ${units(left)} left for you` : ''}</span>
        {live && <span className="flags"><Flag color="var(--pos)" title="Running" why={r.job.joined !== false ? 'Still taking deliveries, and on your list of joined jobs.' : 'Still taking deliveries.'}>Running</Flag></span>}
        <div className="flh-phone">
          <b style={{ color: r.profit == null ? undefined : r.profit >= 0 ? 'var(--pos)' : 'var(--neg-t)' }}>{r.profit == null ? 'Profit not known: units not known' : `Profit ${iskBig(r.profit)}`}{r.sold > 0 ? `, with ${units(r.sold)} sold again for ${iskBig(r.revenue)}` : ''}</b>
          {r.soldOther > 0 && <span style={{ color: 'var(--acc2)' }}>{otherSold(r)}</span>}
          <span>{r.delivered != null ? `${units(r.delivered)} delivered` : 'Delivered: not known'}{r.job.perUnit > 0 ? ` at ${bare(r.job.perUnit)} a unit` : ''}</span>
          <span>{r.received ? `${iskBig(r.received)} paid in ${units(r.rewards.length)} payment${r.rewards.length === 1 ? '' : 's'}` : 'Nothing paid yet'} · tax {tax('flh-tax')}</span>
          {r.delivered != null && <span>Cost {iskBig(r.cost)}{range ? ` at ${range} a unit` : ''}</span>}
          {stock && <span style={{ color: 'var(--acc2)' }}>{stock}</span>}
          {unsure && <span style={{ color: 'var(--acc2)' }}>{unsure}</span>}
          {r.delivered != null && r.held > 0 && <span>Left over: {units(r.held)}, {iskBig(r.heldCost)} at cost</span>}
        </div>
      </td>
      <td className="flh-wide">{units(r.delivered)}<span className="sub">{r.job.perUnit > 0 ? `at ${bare(r.job.perUnit)} a unit` : 'rate a unit not known'}</span></td>
      <td className="flh-wide" style={{ color: r.received ? 'var(--pos)' : undefined }}>{r.received ? iskBig(r.received) : '–'}<span className="sub">{r.rewards.length ? `${units(r.rewards.length)} payment${r.rewards.length === 1 ? '' : 's'}` : 'none yet'}</span></td>
      <td className="flh-wide">{tax()}</td>
      <td className="flh-wide flh-cost">
        {r.delivered == null ? '–' : iskBig(r.cost)}
        {r.delivered != null && range && <span className="sub">at {range} a unit</span>}
        {stock && <span className="sub" style={{ color: 'var(--acc2)' }}>{stock}</span>}
        {unsure && <span className="sub" style={{ color: 'var(--acc2)' }}>{unsure}</span>}
      </td>
      <td className="flh-wide">{r.delivered == null ? '–' : r.held ? <>{units(r.held)}<span className="sub">{iskBig(r.heldCost)} at cost</span></> : '–'}</td>
      <td className="flh-wide flh-profit" style={{ color: r.profit == null ? undefined : r.profit >= 0 ? 'var(--pos)' : 'var(--neg-t)' }}>
        {r.profit == null ? '–' : iskBig(r.profit)}
        {r.profit == null && r.rewards.length > 0 && <span className="sub">units not known</span>}
        {r.sold > 0 && <span className="sub">{units(r.sold)} sold again for {iskBig(r.revenue)}</span>}
        {r.soldOther > 0 && <span className="sub" style={{ color: 'var(--acc2)' }}>{otherSold(r)}</span>}
      </td>
    </tr>
  );
}
