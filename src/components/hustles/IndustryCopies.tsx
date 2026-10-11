import { useCallback, useMemo, useState } from 'react';
import { FlaskConical, Scale, Store } from 'lucide-react';
import { copyKindKey, INTERRUPTED, type CopySummary } from '../../lib/copyMarket';
import { copyReadings, copyRows, countingSaid, gapSaid, heldOriginal, readingsSaid, RESEARCH_LONG_DAYS, type CheckedJob, type CopyFinderRow } from '../../lib/copyFinder';
import { ago, fmtDate, iskBig, pct, units, until } from '../../lib/format';
import { navigate, useNow } from '../../lib/hooks';
import { nameOf, rigFor, secBand, type Indexed } from '../../lib/industry';
import { finderSkills } from '../../lib/industryLadder';
import { bpoWhere, buildRow } from '../../lib/industryRank';
import { jobPlace } from '../../lib/industryTrack';
import type { Graph } from '../../lib/jumps';
import type { IndustrySite } from '../../lib/prefs';
import { copiesSaid, copyState, type CopyContract, type CopyState } from '../../lib/copyContracts';
import { hasScope } from '../../lib/auth';
import { SCOPE } from '../../lib/config';
import { blueprintKinds, jobPlaceSaid, readWhy } from '../../lib/industryOwned';
import { isStationId, type JobRecord } from '../../lib/industryTrack';
import { jobWaiting } from '../../lib/todo';
import { tileRows } from '../../lib/tileFilter';
import { useData } from '../../lib/store';
import { useEnsureNames } from '../common';
import { Points } from '../Facts';
import { Th, Tiles, TileShowing, useTileFilter } from '../ui';
import { skillsWhy, type IndustryChar } from './industryChars';
import { aDaySaid, bpoSaid, useFinder, useStationSaid } from './industryFinder';
import { useAdjusted, useCopyMarket, useIndices, useIndustryDoc } from './industryMarket';

/** Rows shown before "Show more": a week's kinds run to two thousand. */
const SHOWN = 50;
/**
 * A round stamps INTERRUPTED before it reads, so a read in progress looks like a failed one for a few minutes: say it's reading.
 * After one the cloud stopped, the next try waits the full six hours (copies.ts); after any other failure, the next hourly cron.
 */
const READING_MS = 3 * 60_000;
const readingNow = (tried: string | null, error: string | null, now: number) => error === INTERRUPTED && tried != null && now - Date.parse(tried) < READING_MS && now >= Date.parse(tried);
const retrySaid = (error: string | null) => (error === INTERRUPTED ? 'It tries again on its next six-hourly round' : 'It tries again within the hour');
const daysSaid = (d: number) => (d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${Math.round(d * 10) / 10} d`);

/**
 * Copies (docs/notes/industry.md, stage 3): which copies are worth making for one lab slot, from what the cloud counted sold
 * in The Forge this week, at the shown character's skills, clone and lab; Task 15A adds Your copy business below. Reads each
 * alt's pulled copy through `chars`, writes nothing.
 */
export function IndustryCopies({ c, chars, ix, graph }: { c: IndustryChar; chars: IndustryChar[]; ix: Indexed; graph: Graph }) {
  const now = useNow(60_000);
  const [doc] = useIndustryDoc();
  const f = useFinder(c, ix, graph);
  const market = useCopyMarket();
  const adjusted = useAdjusted();
  const indices = useIndices();
  const [more, setMore] = useState(0);
  // Each input held steady, so the minute's tick doesn't work every kind out again (a buildRow a kind, as the finder ranks).
  const skills = useMemo(() => finderSkills(c.pilot.skills, c.clone), [c.pilot.skills, c.clone]);
  const bandOf = (s: IndustrySite) => secBand(graph[s.systemId]?.[0]);
  const owned = c.blueprints.state === 'read' ? c.blueprints.value : null;
  const summary = market.status === 'ok' ? market.summary : null;
  const input = f.input;
  const npcRows = f.npc.status === 'ok' ? f.npc.rows : null;
  // A kind's blueprint is a Tech I original (copyRow leaves invention products out): NPCs' price is its own, as Build says it.
  const bpoOf = useCallback((bp: number) => bpoWhere(npcRows, bp, ix.b.types[bp]?.[4] ?? 0), [npcRows, ix]);
  const built = useMemo(() => (input ? (bp: number, me: number, te: number) => { const x = ix.bp.get(bp); return x ? buildRow({ ...input, bp: x, me, te }).day?.profit ?? null : null; } : () => null), [input, ix]);
  const got = useMemo(() => (summary && skills && adjusted.state === 'ok'
    ? copyRows({ ix, summary, skills, clone: c.clone, lab: f.lab?.site ?? null, adjusted: adjusted.value, share: doc.share, heldOf: (t) => heldOriginal(owned, t), bpoOf, build: () => null })
    : null), [summary, skills, adjusted, ix, c.clone, f.lab, doc.share, owned, bpoOf]);
  // What real copy and research jobs say about the cost (every character's, newest first): correction 15.
  const checked: CheckedJob[] = useMemo(() => chars.flatMap((x) => (x.jobs.state === 'read' ? x.jobs.value.map((job) => ({ job, place: jobPlace(job, doc.sites, bandOf), clone: x.clone, who: x.isMain ? 'Your' : `${x.name}’s` })) : [])), [chars, doc.sites]); // eslint-disable-line react-hooks/exhaustive-deps
  const readings = useMemo(() => copyReadings(ix, checked), [ix, checked]);
  const lab = f.lab?.site ?? null;
  const labCostRig = !!lab && rigFor(ix, lab.rigs, lab.kind, lab.band, null, 'copying').cost < 1;
  const costTip = readingsSaid(readings, labCostRig, fmtDate);
  const station = useStationSaid((got?.rows ?? []).slice(0, SHOWN + more).flatMap((r) => { const w = bpoOf(r.bp); return w.state === 'forge' ? [w.stations[0]] : []; }), ix, graph);
  const before = got?.rows.some((r) => r.costKnown === false) ? (lab?.tax == null ? 'before the lab’s facility tax' : 'before the Alpha tax') : null;

  // The cloud's four answers, told apart by `at` (useCopyMarket): none yet, switched off, tried with nothing read, a summary.
  const marketSaid = market.status === 'off' ? 'What copies sell is counted by the cloud, which isn’t on in this browser: switch it on in Settings, Your data.'
    : market.status === 'loading' ? 'Reading what copies sold from the cloud…'
      : market.status === 'behind' ? 'The cloud is a version behind: what copies sell comes once it’s updated.'
        : market.status === 'switched' ? 'The cloud has its reads of EVE Ref switched off, so what copies sell isn’t counted.'
          : market.status === 'none' ? 'The cloud hasn’t read the copy market yet: its first read comes on its next six-hourly round, and counting starts six hours after that.'
            : market.status === 'tried' ? (readingNow(market.tried, market.error, now) ? 'The cloud is reading the copy market now: what it finds comes on the next look, and counting starts six hours after a read lands.'
              : `The cloud tried to read the copy market ${ago(market.tried, now)}${market.error ? ` and it failed: ${market.error}` : ' and has nothing to show yet'}. ${retrySaid(market.error)}, and counting starts six hours after a read lands.`)
              : market.status === 'failed' ? `Couldn’t read what copies sold from the cloud: ${market.error}`
                : null;
  // What the rows wait for, as the finder says it (useFinder's own states): a site, the skills, the indices, the adjusted prices.
  const waiting: { text: string; retry?: () => void } | null = !f.site ? { text: 'Pick where you build first (Build, Where you build): copies are made at its Laboratory, or the nearest one.' }
    : !skills ? { text: skillsWhy(c) }
      : indices.state === 'loading' ? { text: 'Reading the industry indices…' }
        : indices.state === 'failed' ? { text: 'Couldn’t read ESI’s industry indices just now, so no copy can be costed.', retry: indices.retry }
          : adjusted.state === 'loading' ? { text: 'Reading CCP’s adjusted prices…' }
            : adjusted.state === 'failed' ? { text: 'Couldn’t read CCP’s adjusted prices just now, so no copy can be costed.', retry: adjusted.retry }
              : null;
  const rows = got?.rows ?? [];
  const shown = useMemo(() => rows.slice(0, SHOWN + more), [rows, more]);
  // Building instead, for the rows shown only (M10): a buildRow a kind for every kind sold would run on each live-book flush.
  const buildDays = useMemo(() => new Map(shown.map((r) => [copyKindKey(r.kind), built(r.bp, r.kind.me, r.kind.te)])), [shown, built]);
  const leftSaid = got ? [
    got.left.notInBundle ? `${units(got.left.notInBundle)} ${got.left.notInBundle === 1 ? 'kind' : 'kinds'} of copy of blueprints NPCs don’t sell (faction and exploration copies: nobody makes them by copying)` : null,
    got.left.invented ? `${units(got.left.invented)} ${got.left.invented === 1 ? 'kind' : 'kinds'} of Tech II copy (made by invention: Build ranks Tech II)` : null,
    got.left.noCopying ? `${units(got.left.noCopying)} ${got.left.noCopying === 1 ? 'kind' : 'kinds'} whose blueprint can’t be copied` : null,
  ].filter(Boolean).join('; ') : '';

  return (
    <section className="col" style={{ gap: 16 }} aria-label="Copies" data-industry="copies">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Researched originals can make copies that sell on contract.</p>
        <Points compact items={[
          { kind: 'info', icon: FlaskConical, lead: 'Buyers pay for the research', text: 'so the copies that sell are ME 10 / TE 20.' },
          { kind: 'good', icon: Scale, lead: 'A lab slot copying', text: 'adds to building rather than replacing it.' },
          { kind: 'info', icon: Store, lead: 'Copies sell in The Forge', text: 'not at home: Brave gives its members copies free.' },
        ]} />
      </div>

      {marketSaid ? (
        <p className="note small" data-industry="copy-state" style={{ margin: 0 }}>{marketSaid}
          {market.status === 'failed' && <> <button type="button" className="link-btn" onClick={market.retry}>Try again</button></>}</p>
      ) : summary && market.status === 'ok' && (
        <p className="note small" data-industry="copy-state" style={{ margin: 0 }}>
          {market.error ? (readingNow(market.tried, market.error, now) ? `The cloud is reading the copy market now; these figures are from the read of ${ago(summary.at, now)}. `
            : `The cloud’s last read failed (tried ${market.tried ? ago(market.tried, now) : 'just now'}): ${market.error}. ${retrySaid(market.error)}. These figures are from the read of ${ago(summary.at, now)}. `) : ''}
          {`From EVE Ref’s snapshot of The Forge’s public contracts, ${ago(summary.at, now)}; a contract that vanished before it expired counts as sold. `}
          {[countingSaid(summary), gapSaid(summary),
            market.note ? `${market.note}.` : null,
            !market.error && market.stale ? `EVE Ref’s newest snapshot is still the one of ${ago(market.stale, now)}; the cloud tries again hourly.` : null].filter(Boolean).join(' ')}
        </p>
      )}

      {/* Before a read has compared two sets the line above says counting has begun: no count, no table (I3). */}
      {summary && summary.reads > 0 && (waiting ? (
        <p className="note small" data-industry="copy-wait" style={{ margin: 0 }}>{waiting.text}
          {waiting.retry && <> <button type="button" className="link-btn" onClick={waiting.retry}>Try again</button></>}</p>
      ) : got && !rows.length ? (
        <p className="note small" data-industry="copy-none" style={{ margin: 0 }}>{`No copies of blueprints you can copy sold in what’s been counted${leftSaid ? ` (left out: ${leftSaid})` : ''}.`}</p>
      ) : got && (
        <>
          <p className="note small" data-industry="copy-count" style={{ margin: 0 }}>
            {`${units(summary.sold.length)} kinds sold ${summary.days >= 7 ? 'in the last week' : 'so far'}, ${units(rows.length)} of them made by copying${leftSaid ? `; left out: ${leftSaid}` : ''}. `}
            {f.lab ? `Copied at ${f.lab.at}, at ${c.isMain ? 'your' : `${c.name}’s`} skills, selling ${pct(doc.share / 100, doc.share % 1 ? 1 : 0)} of what sold.`
              : `No Laboratory can be reached from where you build, so no copy is costed. Selling ${pct(doc.share / 100, doc.share % 1 ? 1 : 0)} of what sold.`}
          </p>
          <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
            <table className="tbl compact rd-table ind-copies" data-industry="copy-finder">
              <thead><tr>
                <Th left className="ind-c-name">Copy of</Th>
                <Th className="rd-wide ind-c-sold" tip={'Contracts of this kind that vanished before they expired this week, read every six hours.\n\n• A contract listed and sold between two reads is never seen, so this counts fewer than sold.\n• Sellers: how many different ones; one seller is one person’s prices.'}>Sold</Th>
                <Th className="rd-wide ind-c-price" tip={'A run’s price: the median of what sold, or the median ask now when that’s lower.\n\nFor example: a kind that sold at 1.78 M a run, now asked at 1.69 M, is priced at 1.69 M.'}>Price a run</Th>
                <Th className="rd-wide ind-c-cost" tip={['A run’s copy job at the lab: 2% of the product’s estimated item value × (the copying index × the bonuses + the facility tax + the SCC + the Alpha tax).', ...costTip.map((l) => `• ${l}`)].join('\n\n')}>Copy cost a run</Th>
                <Th className="ind-c-day" tip={`What one lab slot copying it makes a day: your runs a day × (the price − the copy cost). Your runs a day are your share of what sold a day, or what a lab slot makes, whichever is less. Contract fees aren’t modelled.${before ? ` Worked out ${before}, which isn’t known.` : ''}`}>{before ? `ISK a day, ${before}` : 'ISK a day, one lab slot'}</Th>
                <Th className="rd-wide ind-c-bpo" tip="The original: one you hold needs no purchase; else NPCs’ price in The Forge. Research is to the kind’s ME and TE at the lab, from what you hold or 0/0, at your skills.">Original and research</Th>
                <Th className="rd-wide ind-c-pay" tip={'Payback: days for the original and its research to pay for themselves out of ISK a day.\n\nBuilding instead: the finder’s profit a day for one factory slot building from this blueprint at the kind’s ME and TE, the slot you’d build with instead.'}>Payback, and building instead</Th>
              </tr></thead>
              <tbody>
                {shown.map((r) => <CopyRowView key={copyKindKey(r.kind)} r={r} name={nameOf(ix, r.bp)} bpo={bpoSaid(bpoOf(r.bp), f.npc, (id) => station(id))} costTip={costTip} buildDay={buildDays.get(copyKindKey(r.kind)) ?? null} buildWhy={input ? 'the finder can’t price building it' : 'the Build finder isn’t ready yet'} ix={ix} />)}
              </tbody>
            </table>
          </div>
          {rows.length > shown.length && <button type="button" className="link-btn" onClick={() => setMore((m) => m + SHOWN)}>Show {units(Math.min(SHOWN, rows.length - shown.length))} more</button>}
        </>
      ))}
      <CopyBusiness c={c} ix={ix} graph={graph} summary={summary} />
    </section>
  );
}

/** Why a payback isn't a figure, in the order the figures it needs come. */
function paybackWhy(r: CopyFinderRow): string {
  if (r.research === 'held') return 'original held: nothing to pay back';
  if (r.bpoPrice == null) return 'no NPC price for the original';
  if (r.research.cost == null) return 'research cost not known';
  if (r.iskDay == null) return 'no ISK a day to pay it back from';
  return 'copying it makes nothing a day';
}

function CopyRowView({ r, name, bpo, costTip, buildDay, buildWhy, ix }: { r: CopyFinderRow; name: string; bpo: { v: string; n: string }; costTip: string[]; buildDay: number | null; buildWhy: string; ix: Indexed }) {
  const k = r.kind;
  const research = r.research === 'held' ? { v: 'None', n: 'you hold the original at that ME and TE' }
    : { v: r.research.days != null ? daysSaid(r.research.days) : '–', n: `ME ${r.research.me[0]} → ${r.research.me[1]}, TE ${r.research.te[0]} → ${r.research.te[1]}${r.research.cost != null ? ` · ${iskBig(r.research.cost)}` : r.research.days == null ? ' · no Laboratory reached, or its index isn’t read' : ' · cost not known'}` };
  const costWhy = r.eiv == null ? 'CCP’s adjusted prices lack one of its materials' : 'no Laboratory reached, or its index isn’t read';
  const after = r.research !== 'held' && r.research.days != null ? ` after ${daysSaid(r.research.days)} of research` : '';
  const long = r.research !== 'held' && r.research.days != null && r.research.days > RESEARCH_LONG_DAYS ? `Research: ${Math.round(r.research.days)} days first` : null;
  const train = r.lacking.length ? `${r.lacking.length} to train` : null;
  const trainTip = r.lacking.map((x) => `${nameOf(ix, x.id)} ${x.level}`).join(', ');
  const phonePay = r.payback != null ? `payback ${units(Math.round(r.payback))} d${after}` : `payback not known: ${paybackWhy(r)}`;
  return (
    <tr data-kind={copyKindKey(k)}>
      <td className="l rd-main">
        <span className="nm">{name}</span>
        <div className="note small">{`ME ${k.me} / TE ${k.te} · ${units(k.runs)} run${k.runs === 1 ? '' : 's'} a copy`}{r.thin && <span className="flag warn">{r.thin}</span>}{long && <span className="flag warn" data-industry="copy-long">{long}</span>}{train && <span className="flag warn" data-industry="copy-train" data-tip={`Skills to train before you can copy or research it: ${trainTip}`}>{train}</span>}</div>
        <div className="rd-phone note small">{`${r.price.from === 'asks' ? 'asked' : 'sold'} at ${iskBig(r.price.perRun)} a run · ${r.research === 'held' ? 'original held' : `research ${r.research.days != null ? daysSaid(r.research.days) : 'time not known'}`} · ${phonePay}`}</div>
      </td>
      <td className="rd-wide"><div>{units(k.contracts)}</div><div className="note small">{`${units(k.copies)} cop${k.copies === 1 ? 'y' : 'ies'} · ${units(k.sellers)} seller${k.sellers === 1 ? '' : 's'}`}</div></td>
      <td className="rd-wide"><div>{iskBig(r.price.perRun)}</div><div className="note small">{r.price.from === 'asks' ? `median ask now, under what sold (${iskBig(k.perRun)})` : 'median sold'}</div></td>
      <td className="rd-wide"><span data-industry="copy-cost" data-tip={costTip.join('\n\n')}>{r.cost ? iskBig(r.cost.total) : '–'}</span>{!r.cost && <div className="note small">{costWhy}</div>}</td>
      <td data-industry="copy-isk"><div>{r.iskDay != null ? iskBig(r.iskDay) : '–'}</div><div className="note small">{`${aDaySaid(r.yourRuns)} · ${r.limit === 'slot' ? 'the lab slot' : 'the market'} limits it (a slot makes ${aDaySaid(r.labRuns)})`}</div></td>
      <td className="rd-wide"><div>{r.bpoPrice === 0 ? 'Held: you hold one' : `${bpo.v} ${bpo.n}`}</div><div className="note small">{`Research: ${research.v} · ${research.n}`}</div></td>
      <td className="rd-wide"><div>{r.payback != null ? `${units(Math.round(r.payback))} d` : '–'}</div><div className="note small">{r.payback != null ? `from the purchase${after}` : paybackWhy(r)}</div><div className="note small">{buildDay != null ? `Building: ${iskBig(buildDay)} a day` : `Building: – (${buildWhy})`}</div></td>
    </tr>
  );
}

/**
 * Your copy business (spec): the shown character's copy jobs and copies held, and the main's own copy contracts with their state
 * and the cheapest ask of their kind now. An alt's contracts aren't read: said, never "none".
 */
function CopyBusiness({ c, ix, graph, summary }: { c: IndustryChar; ix: Indexed; graph: Graph; summary: CopySummary | null }) {
  const d = useData();
  const now = useNow(60_000);
  const jobs = c.jobs.state === 'read' ? c.jobs.value.filter((j) => j.activity === 5) : null;
  const doc = c.isMain ? d.copyContracts : undefined;
  // Names the bundle lacks (copies of faction or exploration blueprints) are asked of ESI, "…" while they're read (IndustryOwned's way).
  const looking = useEnsureNames([...new Set([...(jobs ?? []).map((j) => j.blueprintTypeId), ...(doc?.list ?? []).flatMap((x) => x.copies.map(([t]) => t))])].filter((t) => !ix.b.types[t]));
  const name = (t: number) => ix.b.types[t]?.[0] ?? d.names[t] ?? (looking ? '…' : `Item #${t}`);
  const running = (jobs ?? []).filter((j) => j.status === 'active' || j.status === 'paused' || j.status === 'ready').sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  const done = (jobs ?? []).filter((j) => (j.status === 'delivered' || j.status === 'cancelled' || j.status === 'reverted') && now - Date.parse(j.completed ?? j.end) <= 30 * 86_400_000)
    .sort((a, b) => Date.parse(b.completed ?? b.end) - Date.parse(a.completed ?? a.end));
  const held = c.blueprints.state === 'read' ? blueprintKinds([{ charId: c.charId, name: c.name, owned: c.blueprints.value }]).filter((k) => k.copy) : null;
  // Stations only: /universe/names refuses a batch holding a structure's ID, and a job's structure is named by jobPlaceSaid (M11).
  const station = useStationSaid([...new Set((jobs ?? []).map((j) => j.stationId).filter(isStationId))], ix, graph);
  const place = (j: JobRecord) => jobPlaceSaid(j, { names: c.places, jobPlaces: c.jobPlaces, station, system: (id) => graph[id]?.[1] ?? null });
  const tile = useTileFilter<'listed' | 'expired' | 'sold'>('copy-contracts');
  const TILE_SAID = { listed: 'Listed', expired: 'Expired', sold: 'Sold, 30 days' } as const;
  const contracts = (doc?.list ?? []).map((x) => ({ x, st: copyState(x, now) }))
    .filter(({ x, st }) => st === 'listed' || st === 'expired' || now - Date.parse(x.completed ?? x.issued) <= 30 * 86_400_000)
    .sort((a, b) => b.x.id - a.x.id);
  const count = (s: 'listed' | 'expired' | 'sold') => contracts.filter((r) => r.st === s).length;
  const shown = tileRows(contracts, tile.on, (r, k) => r.st === k);
  const kindSaid = (x: CopyContract) => (Array.isArray(x.kinds) ? x.kinds.map((k) => `${k[4]}× ME ${k[1]} / TE ${k[2]}, ${k[3]} run${k[3] === 1 ? '' : 's'}`).join('; ')
    : x.kinds === 'private' ? 'kinds not known: a private contract isn’t public'
      : x.kinds === 'gone' ? 'kinds not known: it left the public list before they were read'
        : 'kinds are read with the next sync');
  const askSaid = (x: CopyContract) => {
    if (!Array.isArray(x.kinds) || x.kinds.length !== 1 || !summary) return null;
    const k = x.kinds[0], a = summary.asks[copyKindKey({ typeId: k[0], me: k[1], te: k[2], runs: k[3] })];
    const mine = x.price / (k[4] * k[3]);
    return a ? `${iskBig(mine)} a run; others’ cheapest ${iskBig(a[0])} (${units(a[2])} listed)${mine > a[0] ? ': undercut' : ''}` : `${iskBig(mine)} a run; nobody else lists this kind now`;
  };
  const stateSaid = (x: CopyContract, st: CopyState) => st === 'listed' ? `Listed until ${fmtDate(x.expires)}`
    : st === 'expired' ? `Expired ${fmtDate(x.expires)}: delete it in game to get the copies back`
      : st === 'sold' ? `Sold ${x.completed ? fmtDate(x.completed) : ''}`.trim()
        : st === 'deleted' ? 'Deleted' : x.status.replace(/_/g, ' ');
  // ESI lists contracts only 30 days back (M7): one that left it while outstanding may still hold its copies.
  const goneSaid = (x: CopyContract) => (!x.gone ? '' : x.status === 'outstanding' ? '. No longer in your contracts: ESI lists them only 30 days back, so if you didn’t delete it in game, its copies are still in it' : ' (past ESI’s 30 days)');

  return (
    <div className="col" style={{ gap: 10 }} data-industry="copy-business">
      <span className="lbl">Your copy business</span>
      <span className="lbl small">Copy jobs</span>
      {jobs == null ? <p className="note small" style={{ margin: 0 }}>{readWhy(c, c.jobs, 'jobs')}</p>
        : !running.length && !done.length ? <p className="note small" style={{ margin: 0 }}>No copy jobs running, or finished in the last 30 days.</p>
          : (
            <div className="tbl-scroll"><table className="tbl compact rd-table" data-industry="copy-jobs">
              <thead><tr><Th left>Blueprint</Th><Th className="rd-wide">Copies</Th><Th className="rd-wide">Where</Th><Th>State</Th><Th className="rd-wide" tip="What EVE charged for the job (ESI’s cost).">Cost</Th></tr></thead>
              <tbody>{[...running, ...done].map((j) => (
                <tr key={j.jobId}>
                  <td className="l rd-main">{name(j.blueprintTypeId)}<div className="rd-phone note small">{`${units(j.runs)} × ${j.licensedRuns != null ? units(j.licensedRuns) : '?'} runs · ${place(j)}`}</div></td>
                  <td className="rd-wide">{`${units(j.runs)} × ${j.licensedRuns != null ? units(j.licensedRuns) : '?'} runs`}</td>
                  <td className="rd-wide">{place(j)}</td>
                  <td>{jobWaiting(j, now) ? 'Ready to deliver' : j.status === 'active' || j.status === 'paused' ? `Done ${until(j.end, now) ?? 'any moment now'}` : `${j.status.charAt(0).toUpperCase()}${j.status.slice(1)} ${fmtDate(j.completed ?? j.end)}`}</td>
                  <td className="rd-wide">{j.cost != null ? iskBig(j.cost) : '–'}</td>
                </tr>))}</tbody>
            </table></div>
          )}
      <span className="lbl small">Copies held</span>
      {held == null ? <p className="note small" style={{ margin: 0 }}>{readWhy(c, c.blueprints, 'blueprints')}</p>
        : !held.length ? <p className="note small" style={{ margin: 0 }}>{c.isMain ? 'You hold' : `${c.name} holds`} no copies.</p>
          : (
            <div className="col" style={{ gap: 4 }} data-industry="copies-held">{held.map((k) => (
              <div key={k.key}>{`${units(k.count)}× ${name(k.typeId)} · ME ${k.me} / TE ${k.te} · ${k.runs != null ? `${units(k.runs)} runs` : 'runs –'}`}
                {c.isMain && <> · <button type="button" className="link-btn" onClick={() => navigate(`blueprints?type=${k.typeId}`)}>Price for selling</button></>}</div>))}</div>
          )}
      <span className="lbl small">Your copy contracts</span>
      {!c.isMain ? <p className="note small" data-industry="copy-contracts-alt" style={{ margin: 0 }}>{`${c.name}’s contracts aren’t read: the cloud reads an alt’s wallet, orders and assets, not its contracts.`}</p>
        : !doc ? <p className="note small" style={{ margin: 0 }}>{hasScope(SCOPE.contracts) ? 'Not read yet: your contracts come with the next sync.' : 'Log in again: this login wasn’t given EVE’s permission to read your contracts.'}</p>
          : !contracts.length ? <p className="note small" style={{ margin: 0 }}>No copy contracts listed, expired, or finished in the last 30 days.</p>
            : (
              <>
                <Tiles min={150} items={[
                  { l: 'Listed', v: units(count('listed')), press: tile.press('listed', count('listed')) },
                  { l: 'Expired', v: units(count('expired')), c: count('expired') ? 'var(--acc2)' : undefined, tip: 'Past their expiry: the copies stay in them until you delete the contract in game.', press: tile.press('expired', count('expired')) },
                  { l: 'Sold, 30 days', v: units(count('sold')), press: tile.press('sold', count('sold')) },
                ]} />
                {tile.on && <TileShowing shown={shown.length} of={contracts.length} what={TILE_SAID[tile.on]} onClear={() => tile.setOn(null)} />}
                <div className="tbl-scroll" id="copy-contracts"><table className="tbl compact rd-table" data-industry="copy-contracts">
                  <thead><tr><Th left>Copies</Th><Th className="rd-wide">Kinds</Th><Th>Price</Th><Th left className="rd-wide">State</Th></tr></thead>
                  <tbody>{shown.map(({ x, st }) => (
                    <tr key={x.id} data-contract={x.id}>
                      <td className="l rd-main">{copiesSaid(x.copies, name)}<div className="rd-phone note small">{kindSaid(x)}</div><div className="rd-phone note small">{stateSaid(x, st)}{goneSaid(x)}</div></td>
                      <td className="rd-wide">{kindSaid(x)}</td>
                      <td><div>{iskBig(x.price)}</div>{askSaid(x) && <div className="note small">{askSaid(x)}</div>}</td>
                      <td className="l rd-wide" style={{ whiteSpace: 'normal', minWidth: 200 }}>{stateSaid(x, st)}{goneSaid(x)}</td>
                    </tr>))}</tbody>
                </table></div>
              </>
            )}
    </div>
  );
}
