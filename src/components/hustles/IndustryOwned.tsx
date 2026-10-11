import { useMemo } from 'react';
import { Factory, FlaskConical, ScrollText } from 'lucide-react';
import { fmtShort, iskBig, iskBigSigned, pct, units } from '../../lib/format';
import { navigate, useNow } from '../../lib/hooks';
import { secBand, type Indexed } from '../../lib/industry';
import { beforeSaid, finderSkills } from '../../lib/industryLadder';
import { blueprintKinds, charInput, charRows, fleetTotals, jobPlaceSaid, nextResearch, placeSaid as placeName, readWhy, type CharIn } from '../../lib/industryOwned';
import { buildRow } from '../../lib/industryRank';
import { ACTIVITY_SAID, isStationId, jobCheck, jobPlace as jobSite, type JobRecord } from '../../lib/industryTrack';
import type { IndustrySite } from '../../lib/prefs';
import type { Graph } from '../../lib/jumps';
import { lostSaid } from '../../lib/pilot';
import { ROMAN, trainSaid } from '../../lib/skillStatus';
import { jobWaiting } from '../../lib/todo';
import { Points } from '../Facts';
import { useEnsureNames } from '../common';
import { useData } from '../../lib/store';
import { tileRows } from '../../lib/tileFilter';
import { Seg, Th, TileShowing, Tiles, useTileFilter } from '../ui';
import { MISSING_SAID } from './IndustryBuild';
import type { IndustryChar } from './industryChars';
import { useFinder, useStationSaid } from './industryFinder';
import { useIndustryDoc } from './industryMarket';

const DAY = 86_400_000;

/**
 * Blueprints & jobs (docs/notes/industry.md, stage 2): what each character holds and has running. Your characters (slots,
 * jobs ready, blueprints, the skills for the next rung), the filter's tiles, every blueprint kind with what it builds at
 * the default site (worked out at its own character's skills and fees, under All too), and every job. Reads each alt's
 * pulled copy through `chars`, writes nothing.
 */
export function IndustryOwned({ chars, filter, onFilter, shown, ix, graph }: {
  chars: IndustryChar[]; filter: number | 'all'; onFilter: (v: number | 'all') => void; shown: IndustryChar; ix: Indexed; graph: Graph;
}) {
  const now = useNow(60_000);
  const [doc] = useIndustryDoc();
  const bandOf = (s: IndustrySite) => secBand(graph[s.systemId]?.[0]);
  const picked = filter === 'all' ? chars : chars.filter((c) => c.charId === filter);
  const ins: CharIn[] = useMemo(() => chars.map((c) => ({
    charId: c.charId, name: c.name, isMain: c.isMain, clone: c.clone, skills: finderSkills(c.pilot.skills, c.clone),
    sp: c.pilot.skillSp, attrs: c.pilot.attributes, jobs: c.jobs, blueprints: c.blueprints, lost: c.pilot.lost,
  })), [chars]);
  const rows = useMemo(() => charRows(ix, ins, now), [ix, ins, now]);
  const shownRows = rows.filter((r) => picked.some((c) => c.charId === r.charId));
  // The table's totals are every character's; the tiles follow the filter.
  const fleetAll = fleetTotals(rows), fleet = fleetTotals(shownRows);
  // Every character's open orders come off the books, so a row worked out for one isn't selling into another's bid.
  const own = useMemo(() => chars.flatMap((c) => c.own), [chars]);
  // The finder's inputs from a character whose skills and fee are read: the shown one when they are, else the first that has
  // them (pre-flight M11). Each row is then worked out at its own character's (charInput); one whose character's skills
  // aren't read says so on the row.
  const readOk = (c: IndustryChar) => !!finderSkills(c.pilot.skills, c.clone) && c.feeKnown;
  const base = (readOk(shown) ? shown : chars.find(readOk)) ?? shown;
  const f = useFinder(base, ix, graph, { own });
  const kinds = useMemo(() => blueprintKinds(picked.flatMap((c) => (c.blueprints.state === 'read' ? [{ charId: c.charId, name: c.name, owned: c.blueprints.value }] : []))), [picked]);
  const jobs = useMemo(() => picked.flatMap((c) => (c.jobs.state === 'read' ? c.jobs.value.map((j) => ({ c, j })) : [])), [picked]);
  const stationIds = useMemo(() => [...new Set([...kinds.flatMap((k) => k.where.map((w) => w[0])), ...jobs.map((x) => x.j.stationId)].filter(isStationId))], [kinds, jobs]);
  const station = useStationSaid(stationIds, ix, graph);
  // Names for the types the bundle lacks (1,346 published blueprints aren't in it), as the Blueprints page asks for them.
  const wantedTypes = useMemo(() => [...new Set([...kinds.map((k) => k.typeId), ...jobs.flatMap(({ j }) => [j.blueprintTypeId, j.productTypeId ?? j.blueprintTypeId])])].filter((id) => !ix.b.types[id]), [kinds, jobs, ix]);
  const looking = useEnsureNames(wantedTypes);
  const named = useData().names;
  const nm = (id: number): string => ix.b.types[id]?.[0] ?? named[id] ?? (looking ? '…' : `Item #${id}`);
  const systemName = (id: number): string | null => graph[id]?.[1] ?? null;
  const jobPlace = (c: IndustryChar, j: JobRecord): string => jobPlaceSaid(j, { names: c.places, jobPlaces: c.jobPlaces, station, system: systemName });
  const whose = (c: IndustryChar) => (c.isMain ? 'your' : `${c.name}’s`);
  /** A place by its name: a station by ESI's, a container, ship or structure by the character's blueprints doc (industryOwned.ts placeSaid). */
  const placeSaid = (c: IndustryChar, id: number): string => placeName(c, id, { names: c.places, items: c.placeItems }, station);
  const charOf = (id: number) => chars.find((c) => c.charId === id)!;
  const many = chars.length > 1;
  const all = filter === 'all';

  const tile = useTileFilter<'ready'>('ind-jobs-running');
  const running = jobs.filter(({ j }) => j.status === 'active' || j.status === 'paused' || j.status === 'ready').sort((a, b) => Date.parse(a.j.end) - Date.parse(b.j.end));
  const waitingRows = running.filter(({ j }) => jobWaiting(j, now));
  const shownRunning = tileRows(running, tile.on, ({ j }) => jobWaiting(j, now));
  const done = jobs.filter(({ j }) => (j.status === 'delivered' || j.status === 'cancelled' || j.status === 'reverted') && now - Date.parse(j.completed ?? j.end) <= 30 * DAY)
    .sort((a, b) => Date.parse(b.j.completed ?? b.j.end) - Date.parse(a.j.completed ?? a.j.end));
  const product = (j: JobRecord) => nm(j.productTypeId ?? j.blueprintTypeId);
  const slotSaid = (s: { used: number | null; of: number } | null) => (s ? (s.used != null ? `${units(s.used)} of ${units(s.of)} in use` : `– of ${units(s.of)} in use`) : '–');

  return (
    <section className="col" style={{ gap: 14 }} aria-label="Blueprints & jobs" data-industry="owned">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>What your characters hold and have running.</p>
        <Points compact items={[
          { kind: 'info', icon: ScrollText, lead: 'Blueprints', text: 'as each character holds them, with what each builds at your build site.' },
          { kind: 'info', icon: Factory, lead: 'Slots in use', text: 'count jobs running and ones finished but not delivered: a finished job holds its slot until delivered.' },
          { kind: 'info', icon: FlaskConical, lead: 'Read', text: 'your blueprints with each sync; your jobs with each sync and hourly by the cloud; an alt’s both hourly by the cloud.' },
        ]} />
      </div>
      {many && (
        <div data-industry="char-filter">
          <Seg<number | 'all'> size="sm" label="Characters" value={filter} onChange={onFilter}
            options={[{ v: 'all', label: 'All', tip: 'Every character’s blueprints and jobs' }, ...chars.map((c) => ({ v: c.charId, label: c.name, tip: `${c.name}’s blueprints and jobs; Show for follows` }))]} />
        </div>
      )}

      <span className="lbl">Your characters</span>
      <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
        <table className="tbl compact rd-table ind-chars" data-industry="chars">
          <thead><tr>
            <Th left>Character</Th>
            <Th className="rd-wide" tip={'Factory slots in use of the slots its skills give.\n\n• In use: jobs running, and ones finished but not delivered: a finished job holds its slot until it’s delivered.\n• Slots: 1, plus Mass Production and Advanced Mass Production.'}>Factory slots</Th>
            <Th className="rd-wide" tip="Science slots (research, copying, invention) in use of the slots Laboratory Operation and Advanced Laboratory Operation give.">Science slots</Th>
            <Th className="rd-wide">Jobs ready</Th>
            <Th className="rd-wide">Originals</Th>
            <Th className="rd-wide">Copies</Th>
            <Th left className="rd-wide" tip="The first rung of Start’s ladder whose skills it lacks, and the training time to it at its attributes.">Next rung</Th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const nothing = r.factory == null && r.ready == null && r.originals == null;
              const next = r.next === 'top' ? 'Every rung’s skills trained' : r.next == null ? '–'
                : `${r.next.title}: ${r.next.lacking.map((l) => `${l.name} ${ROMAN[l.level]}${l.omega ? ' (needs Omega)' : ''}`).join(', ')}${r.next.days != null ? ` · ${trainSaid(r.next.days * DAY)}` : ''}`;
              return (
                <tr key={r.charId} data-char={r.charId}>
                  <td className="l rd-main">
                    <span className="nm">{r.name}</span>
                    {r.why && (nothing ? <span className="rd-phone"><span>{r.why}</span></span> : <span className="sub">{r.why}</span>)}
                    {!nothing && <span className="rd-phone"><span>Factory: {slotSaid(r.factory)}</span><span>Science: {slotSaid(r.science)}</span><span>Ready: {r.ready ?? '–'} · Originals: {r.originals ?? '–'} · Copies: {r.copies ?? '–'}</span><span>{next}</span></span>}
                  </td>
                  {nothing ? <td className="l rd-wide note small" colSpan={6}>{r.why}</td> : (<>
                    <td className="rd-wide">{slotSaid(r.factory)}</td>
                    <td className="rd-wide">{slotSaid(r.science)}</td>
                    <td className="rd-wide">{r.ready ?? '–'}</td>
                    <td className="rd-wide">{r.originals ?? '–'}</td>
                    <td className="rd-wide">{r.copies ?? '–'}</td>
                    <td className="l rd-wide">{next}</td>
                  </>)}
                </tr>
              );
            })}
            {many && (
              <tr className="ind-total" data-char="all">
                <td className="l rd-main"><span className="nm">All characters</span><span className="sub">{`Jobs read for ${fleetAll.jobsRead} of ${fleetAll.of}, blueprints for ${fleetAll.bpsRead} of ${fleetAll.of}`}</span>
                  <span className="rd-phone"><span>Factory: {slotSaid(fleetAll.factory)}</span><span>Science: {slotSaid(fleetAll.science)}</span><span>Ready: {fleetAll.ready ?? '–'} · Originals: {fleetAll.originals ?? '–'} · Copies: {fleetAll.copies ?? '–'}</span></span></td>
                <td className="rd-wide">{fleetAll.factory ? `${units(fleetAll.factory.used)} of ${units(fleetAll.factory.of)} in use` : '–'}</td>
                <td className="rd-wide">{fleetAll.science ? `${units(fleetAll.science.used)} of ${units(fleetAll.science.of)} in use` : '–'}</td>
                <td className="rd-wide">{fleetAll.ready ?? '–'}</td>
                <td className="rd-wide">{fleetAll.originals ?? '–'}</td>
                <td className="rd-wide">{fleetAll.copies ?? '–'}</td>
                <td className="rd-wide" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div data-industry="owned-tiles">
        <Tiles min={170} items={[
          { l: 'Originals', v: fleet.originals != null ? units(fleet.originals) : '–', n: fleet.bpsRead < fleet.of ? `${fleet.bpsRead} of ${fleet.of} read` : all && many ? 'every character' : undefined },
          { l: 'Copies', v: fleet.copies != null ? units(fleet.copies) : '–', n: fleet.bpsRead < fleet.of ? `${fleet.bpsRead} of ${fleet.of} read` : undefined },
          { l: 'Factory slots', v: fleet.factory ? `${units(fleet.factory.used)} / ${units(fleet.factory.of)}` : '–', n: fleet.slotsRead < fleet.of ? `in use of slots; ${fleet.slotsRead} of ${fleet.of} read` : 'in use of slots' },
          { l: 'Science slots', v: fleet.science ? `${units(fleet.science.used)} / ${units(fleet.science.of)}` : '–', n: fleet.slotsRead < fleet.of ? `in use of slots; ${fleet.slotsRead} of ${fleet.of} read` : 'in use of slots' },
          { l: 'Jobs ready', v: fleet.ready != null ? units(fleet.ready) : '–', n: fleet.jobsRead < fleet.of ? `${fleet.jobsRead} of ${fleet.of} read` : 'to deliver in the Industry window',
            press: tile.press('ready', waitingRows.length) },
        ]} />
      </div>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="lbl">Blueprints</span>
      </div>
      {f.waiting && <p className="note small" style={{ margin: 0 }} data-industry="owned-wait">{f.waiting.text}</p>}
      {kinds.length ? (
        <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
          <table className="tbl compact rd-table ind-bps" data-industry="bp-list">
            <thead><tr>
              <Th left>Blueprint</Th><Th className="rd-wide">Held</Th><Th left className="rd-wide">Where</Th>
              <Th className="rd-wide" tip={`What it makes a day in one factory slot at ${f.site?.name ?? 'your build site'}, at its own ME, TE and runs, at its own character’s skills and fees.`}>Builds a day</Th>
              <Th left className="rd-wide">Next research</Th>
            </tr></thead>
            <tbody>
              {kinds.map((k) => {
                const c = charOf(k.charId);
                const bp = ix.bp.get(k.typeId);
                const sk = finderSkills(c.pilot.skills, c.clone);
                const inp = f.input ? charInput(f.input, { skills: sk, clone: c.clone, broker: c.broker, tax: c.tax, mines: c.mines }) : null;
                const row = bp && bp[2] && inp ? buildRow({ ...inp, bp, me: k.me, te: k.te, copyRuns: k.copy ? k.runs : null, held: true }) : null;
                const builds = !bp || !bp[2] ? '–: the finder ranks blueprints sold on the market, and Tech II' : !f.input ? '–' : !sk ? `–: ${whose(c)} skills aren’t read` : row?.day ? `${iskBigSigned(row.day.profit)}${beforeSaid([row], f.hub?.short).length ? `, before ${beforeSaid([row], f.hub?.short).join(' and ')}` : ''}${row.lacking.length ? ` · ${row.lacking.length} to train` : ''}` : row?.missing ? `–: it ${MISSING_SAID[row.missing](true)}${row.lacking.length ? ` · ${row.lacking.length} to train` : ''}` : '–: not priced at this site';
                const step = bp ? nextResearch({ ix, bp, me: k.me, te: k.te, copy: k.copy, skills: sk ?? {}, clone: c.clone, lab: f.lab?.site ?? null, adjusted: f.input?.adjusted ?? null }) : 'none';
                const stepSaid = step === 'copy' ? 'a copy can’t be researched' : step === 'done' ? 'fully researched' : step === 'none' ? '–'
                  : `${step.what.toUpperCase()} ${step.from} → ${step.to}: ${trainSaid(step.seconds * 1000)}${step.cost != null ? ` and ${iskBig(step.cost)}` : ''} at ${f.lab?.at ?? 'an NPC station with a Laboratory'}${sk ? '' : ' (skills not read: at none)'}`;
                const kind = k.copy ? `Copy · ${units(k.runs ?? 0)} run${k.runs === 1 ? '' : 's'} · ME ${k.me} / TE ${k.te}` : k.unused ? 'Original, unused' : `Original · ME ${k.me} / TE ${k.te}`;
                const where = k.where.map(([id, n]) => `${placeSaid(c, id)}${k.where.length > 1 ? ` (${units(n)})` : ''}`).join(', ');
                return (
                  <tr key={k.key} data-bp-kind={k.typeId}>
                    <td className="l rd-main">
                      <span className="nm">{nm(k.typeId)}</span>
                      <span className="sub">{kind}{all && many ? ` · ${k.name}` : ''}</span>
                      {/* Each kind to the Blueprints page, which prices it (spec: "Price for selling"). That page reads your own
                          blueprints only, so an alt's kinds have no link: its tip says so. */}
                      {c.isMain
                        ? <button type="button" className="link-btn" data-industry="price-for-selling" onClick={() => navigate(`blueprints?type=${k.typeId}`)}>Price for selling</button>
                        : <span className="sub" data-tip={`The Blueprints page prices your own blueprints; ${c.name}’s are read by the cloud and aren’t priced there.`}>Price for selling: the Blueprints page prices yours only</span>}
                      <span className="rd-phone"><span>{units(k.count)} held · {where}</span><span>Builds: {builds}</span>{step !== 'none' && <span>{stepSaid}</span>}</span>
                    </td>
                    <td className="rd-wide">{units(k.count)}</td>
                    <td className="l rd-wide">{where}</td>
                    <td className="rd-wide">{builds}</td>
                    <td className="l rd-wide">{stepSaid}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="note small" style={{ margin: 0 }} data-industry="bp-none">
          {picked.every((c) => c.blueprints.state === 'read') && all && many ? 'None of your characters holds a blueprint.'
            : picked.map((c) => (c.blueprints.state === 'read' ? `${c.isMain ? 'You hold' : `${c.name} holds`} no blueprints.` : readWhy(c, c.blueprints, 'blueprints') ?? '')).filter(Boolean).join(' ')}
        </p>
      )}

      <span className="lbl">Jobs running and ready</span>
      {tile.on && <TileShowing shown={shownRunning.length} of={running.length} what="Jobs ready" onClear={() => tile.setOn(null)} />}
      {running.length ? (
        <div id="ind-jobs-running" className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
          <table className="tbl compact rd-table ind-jobs" data-industry="jobs-running">
            <thead><tr><Th left>Job</Th><Th className="rd-wide">Runs</Th><Th left className="rd-wide">Where</Th><Th className="rd-wide">Time left</Th></tr></thead>
            <tbody>
              {shownRunning.map(({ c, j }) => {
                const left = jobWaiting(j, now) ? 'Ready to deliver' : j.status === 'paused' ? 'Paused (the facility is offline)' : trainSaid(Date.parse(j.end) - now);
                return (
                  <tr key={`${c.charId}:${j.jobId}`} data-job={j.jobId}>
                    <td className="l rd-main"><span className="nm">{ACTIVITY_SAID[j.activity] ?? 'Job'}: {product(j)}</span>{all && many && <span className="sub">{c.name}</span>}
                      <span className="rd-phone"><span>{units(j.runs)} run{j.runs === 1 ? '' : 's'} · {jobPlace(c, j)}</span><span>{left}</span></span></td>
                    <td className="rd-wide">{units(j.runs)}</td>
                    <td className="l rd-wide">{jobPlace(c, j)}</td>
                    <td className="rd-wide">{left}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="note small" style={{ margin: 0 }} data-industry="jobs-none">{picked.every((c) => c.jobs.state === 'read') ? 'Nothing running or waiting to be delivered.' : picked.map((c) => readWhy(c, c.jobs, 'jobs') ?? '').filter(Boolean).join(' ')}</p>}

      {done.length > 0 && (<>
        <span className="lbl">Finished in the last 30 days</span>
        <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
          <table className="tbl compact rd-table ind-jobs" data-industry="jobs-done">
            <thead><tr><Th left>Job</Th><Th className="rd-wide">Runs</Th><Th left className="rd-wide">Where</Th><Th className="rd-wide">Finished</Th><Th className="rd-wide" tip="What EVE charged for the job: its installation fee and the facility tax (ESI's own figure).">What it cost</Th><Th left className="rd-wide" tip={'The app’s cost for the job, worked out from what was kept when it was first seen running, against what EVE charged.\n\n• Only a job first seen within 90 minutes of its start: the index and prices move hourly.\n• At one of your build sites or an NPC station: elsewhere its bonuses aren’t known.'}>Checked</Th></tr></thead>
            <tbody>
              {done.map(({ c, j }) => {
                const k = jobCheck(ix, j, jobSite(j, doc.sites, bandOf), c.clone);
                const scc = k.state === 'checked' && k.sccShare != null ? ` · the SCC here came to ${pct(k.sccShare)} of the job’s base` : '';
                const said = k.state === 'unchecked' ? `Not checked: ${k.why}` : k.differs ? `The app worked out ${iskBig(k.app)}; EVE charged ${iskBig(k.charged)}` : `Matches what EVE charged${scc}`;
                return (
                <tr key={`${c.charId}:${j.jobId}`} data-job={j.jobId}>
                  <td className="l rd-main"><span className="nm">{ACTIVITY_SAID[j.activity] ?? 'Job'}: {product(j)}</span><span className="sub">{j.status === 'delivered' ? 'Delivered' : j.status === 'cancelled' ? 'Cancelled' : 'Reverted'}{all && many ? ` · ${c.name}` : ''}</span>
                    <span className="rd-phone"><span>{units(j.runs)} run{j.runs === 1 ? '' : 's'} · {jobPlace(c, j)}</span><span>{fmtShort(j.completed ?? j.end)} · cost {j.cost != null ? iskBig(j.cost) : '–'}</span><span>{said}</span></span></td>
                  <td className="rd-wide">{units(j.runs)}</td>
                  <td className="l rd-wide">{jobPlace(c, j)}</td>
                  <td className="rd-wide">{fmtShort(j.completed ?? j.end)}</td>
                  <td className="rd-wide" data-cost={j.jobId}>{j.cost != null ? iskBig(j.cost) : '–'}</td>
                  <td className="l rd-wide" data-industry="check" data-off={k.state === 'checked' && k.differs ? '1' : undefined}
                    data-tip={k.state === 'checked' ? `Index ${iskBig(k.parts.index)}, bonuses ${iskBig(k.parts.bonus)}, facility tax ${iskBig(k.parts.tax ?? 0)}, SCC ${iskBig(k.parts.scc)}, Alpha tax ${iskBig(k.parts.alpha ?? 0)}: ${iskBig(k.app)}.${scc}` : undefined}>{said}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>)}
      {picked.map((c) => (c.jobs.state === 'read' && c.pilot.lost ? <p key={c.charId} className="note small" style={{ margin: 0 }}>{c.name}: as the cloud last read it. {lostSaid(c)}</p> : null))}
    </section>
  );
}
