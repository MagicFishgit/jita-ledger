import { useEffect, useMemo, useState } from 'react';
import { Calculator, Coins, History, Pickaxe, Timer, TrendingUp, Users } from 'lucide-react';
import { useAlts } from '../../lib/altStore';
import { hasScope } from '../../lib/auth';
import { cloudEnabled } from '../../lib/cloud';
import { SCOPE } from '../../lib/config';
import { rates } from '../../lib/fees';
import { fmtDateTime, fmtShort, isk, iskBig, units } from '../../lib/format';
import { navigate, useAuth, useNow } from '../../lib/hooks';
import { resolveIds } from '../../lib/market';
import {
  altRightNow, bestWay, byDay, byOre, median, minedTotal, perCharacter, sessionsByCharacter, sessionStats, SESSION_GAP_MS,
  type CharSession, type CharTick, type MiningRecord, type OreWorth, type SessionStats, type Way,
} from '../../lib/mining';
import { FAMILIES, gradeLabel, gradeRank, isMinedForm, oreBase, oreFamily } from '../../lib/miningFits';
import { HULLS } from '../../lib/miningTree';
import { priceOres } from '../../lib/orePricing';
import { skillsUnread, whose } from '../../lib/pilot';
import { useData } from '../../lib/store';
import { groupTypes, system, typeInfo } from '../../lib/universe';
import { useEnsureNames, useTypeName } from '../common';
import { PilotProvider, usePilot } from '../pilot';
import { SkillStrip } from '../SkillStrip';
import { MasteryTiers } from './MasteryTiers';
import { MiningTree } from './MiningTree';
import { useMiningFleet, type AltTicks, type FleetChar } from './miningFleet';
import { useRightNow, type Live } from './rightNow';
import { Empty, ItemIcon, Notice, Panel, Seg, Th, Tiles } from '../ui';
import { Points } from '../Facts';
import { TreeLegend } from '../ShipTree';

/**
 * Mining: what you mined and what it was worth, your sessions and ISK an hour, and the next step up. The user's plan
 * (29 September 2026): a solo side income on days they feel like mining, growing later into a multiboxed fleet. The
 * ledger is ESI's (lib/mining.ts; kept past its 30 days as records), sessions are the cloud's ten-minute reads of it, and
 * every price is Jita's now. Nothing is estimated that could be read: the ship you're in is ESI's, and yields are worked
 * out from ESI's dogma for each hull and fit (lib/miningYield.ts) beside what your own sessions measured.
 *
 * Across characters (stage 3, docs/notes/characters.md): every alt the cloud reads mines beside you. A filter shows one
 * of them or all; a table sets them side by side; sessions are built one character at a time, so two mining at once are
 * two sessions; and Scaling up is shown for one character, its own skills, ship and pace (a PilotProvider). An alt's
 * mining is only read here, never written to the ledger; its ore is valued the main's way (your skills, standing, tax).
 */

const DAYS = 30;
const WAY_SAID: Record<Way, string> = { raw: 'Sold as it is', compressed: 'Compressed', reprocessed: 'Reprocessed' };
/** Scordite: the ore Scaling up prices for before you've mined anything. It spawns in every high-sec system (EVE University). */
const SCORDITE = 1228;
const MINING_HULLS = new Set(HULLS.map((h) => h.id));
/** Sessions this long or longer say something about a pace: a single read is ten minutes of guesswork. */
const LONG_MIN = 20;

/** The filter and Scaling up's "Show for", kept per browser. */
const CHAR_KEY = 'jita-ledger:mining-char';
const SHOW_KEY = 'jita-ledger:mining-show';
/** A kept character ID, or 'all'; null when nothing is kept or the browser won't say. */
function readKept(key: string): number | 'all' | null {
  try {
    const v = localStorage.getItem(key);
    if (v === 'all') return 'all';
    const n = Number(v);
    return v != null && Number.isInteger(n) && n > 0 ? n : null;
  } catch { return null; }
}
const keep = (key: string, v: number | 'all') => { try { localStorage.setItem(key, String(v)); } catch { /* the pick just isn't kept */ } };

const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
/** A read's time: "14:20 ET" today (EVE time), with the day when it's older, since an alt's last read can be days old. */
const asOf = (at: number, now: number) => (new Date(at).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10) ? `${hm.format(at)} ET` : fmtDateTime(at));

type Row = { s: CharSession; st: SessionStats };
/** "a Venture", "an Orca". */
const aShip = (n: string) => `${/^[AEIOU]/i.test(n) ? 'an' : 'a'} ${n}`;

/** The hull a character mined the most m³ in lately, from its sessions. */
function mostMinedIn(rows: Row[]): number | null {
  const by = new Map<number, number>();
  for (const { s, st } of rows) if (s.ship != null && MINING_HULLS.has(s.ship)) by.set(s.ship, (by.get(s.ship) ?? 0) + st.m3);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Why a character's mining isn't known, or null when it is. */
const unreadSaid = (c: FleetChar): string | null => (c.mining === 'read' ? null : c.mining === 'permission' ? 'Needs the Mining ledger permission' : 'Not read yet');

export function Mining() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const name = useTypeName();
  // Every character's mining (miningFleet.ts). The alt store is read here because this is the page allowed to read it.
  const alts = useAlts();
  const fleet = useMiningFleet(DAYS, alts);
  const { chars } = fleet;
  const main = chars[0];
  const many = chars.length > 1;
  const r = rates(d.settings);
  const canRead = hasScope(SCOPE.mining);
  const today = new Date(now).toISOString().slice(0, 10);
  const since = new Date(now - (DAYS - 1) * 86400_000).toISOString().slice(0, 10);

  // Which character the tab shows. A kept one no longer yours (taken off the roster) falls back to All; the kept value
  // isn't overwritten meanwhile, since the roster loads after the page draws.
  const [keptFilter, setKeptFilter] = useState(() => readKept(CHAR_KEY));
  const filter: number | 'all' = typeof keptFilter === 'number' && chars.some((c) => c.charId === keptFilter) ? keptFilter : 'all';
  const chooseFilter = (v: number | 'all') => { setKeptFilter(v); keep(CHAR_KEY, v); };
  const filtered = filter === 'all' ? null : chars.find((c) => c.charId === filter) ?? null;

  const recentOf = useMemo(() => new Map(chars.map((c) => [c.charId, c.records.filter((x) => x.date >= since)])), [chars, since]);
  const allRecent = useMemo(() => [...recentOf.values()].flat(), [recentOf]);
  const recent = useMemo(() => (filter === 'all' ? allRecent : recentOf.get(filter) ?? []), [filter, allRecent, recentOf]);
  // Every character's ores are priced at once, so changing the filter doesn't price them again.
  const ores = useMemo(() => [...new Set(allRecent.map((x) => x.typeId))].sort((a, b) => a - b), [allRecent]);
  useEnsureNames(ores);

  // Volumes, and what each ore is worth three ways (lib/mining.ts bestWay), at your own skills, standing and tax.
  const [vol, setVol] = useState<Record<number, number>>({});
  const [worth, setWorth] = useState<Record<number, OreWorth>>({});
  const [pricing, setPricing] = useState(false);
  // An ore is priced once it has a name: a compressed form is found by name ("Compressed Scordite"). The named ones are
  // priced, not all or none: with every character's ores in the set, one alt ore whose name never came would otherwise
  // leave yours unpriced too (what stage 2b found and fixed on the Characters page, components/charIncome.ts).
  const named = useMemo(() => ores.filter((t) => !!d.names[t]), [ores, d.names]);
  const key = named.join(',');
  useEffect(() => {
    if (!named.length) return;
    let alive = true;
    setPricing(true);
    priceOres(named, name, d.skills ?? {}, d.settings.corp, r.t)
      // Kept beside what was priced before, so an ore that leaves the set and comes back is still known meanwhile.
      .then(({ vols, worth: out }) => { if (alive) { setVol((x) => ({ ...x, ...vols })); setWorth((x) => ({ ...x, ...out })); setPricing(false); } })
      .catch(() => { if (alive) setPricing(false); });
    // A run cut off by a new set of ores isn't pricing any more.
    return () => { alive = false; setPricing(false); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // A volume ESI couldn't give is not known (null), never 0 m³.
  const val = useMemo(() => ({
    volumeOf: (t: number): number | null => vol[t] || null,
    worthOf: (t: number): number | null => (worth[t] ? bestWay(worth[t])?.perUnit ?? null : null),
  }), [vol, worth]);
  const days = useMemo(() => byDay(recent, DAYS, today, val.volumeOf, val.worthOf), [recent, today, val]);
  const oreRows = useMemo(() => byOre(recent, val.volumeOf, val.worthOf), [recent, val]);
  const total = useMemo(() => minedTotal(recent, val.volumeOf, val.worthOf), [recent, val]);
  const best = days.reduce((b, x) => (x.isk > (b?.isk ?? 0) ? x : b), null as (typeof days)[number] | null);
  const minedDays = days.filter((x) => x.units > 0).length;
  const notPriced = pricing ? 'Pricing at Jita…' : 'Not priced yet';

  // Sessions, from the cloud's ten-minute reads of each character's ledger, built one character at a time.
  const charIds = chars.map((c) => c.charId).join(',');
  const allSessions = useMemo<Row[]>(() => {
    if (!fleet.ticks) return [];
    const ids = new Set(charIds.split(',').map(Number));
    return sessionsByCharacter(fleet.ticks.filter((t) => ids.has(t.charId))).map((s) => ({ s, st: sessionStats(s, val.volumeOf, val.worthOf) })).reverse();
  }, [fleet.ticks, charIds, val]);
  const sessions = useMemo(() => (filter === 'all' ? allSessions : allSessions.filter(({ s }) => s.charId === filter)), [filter, allSessions]);
  useEnsureNames(sessions.flatMap(({ s }) => [...Object.keys(s.byType).map(Number), ...(s.ship ? [s.ship] : [])]));
  const long = sessions.filter(({ st }) => st.minutes >= LONG_MIN);
  const iskPerHour = median(long.map(({ st }) => st.iskPerHour));
  const nameOf = (id: number) => chars.find((c) => c.charId === id)?.name ?? `Character ${id}`;

  // Scaling up, for one character: kept, else the filter's character, else you.
  const [keptShow, setKeptShow] = useState(() => { const v = readKept(SHOW_KEY); return typeof v === 'number' ? v : null; });
  const shown = chars.find((c) => c.charId === keptShow) ?? filtered ?? main;
  const chooseShow = (v: number) => { setKeptShow(v); keep(SHOW_KEY, v); };
  const live = useRightNow();
  const shownSessions = useMemo(() => allSessions.filter(({ s }) => s.charId === shown.charId), [allSessions, shown.charId]);
  // The ship it's in: yours from ESI; an alt's at the cloud's last mining read; else the one it mined most in lately.
  const altShip = shown.entry?.ship != null && MINING_HULLS.has(shown.entry.ship) ? shown.entry.ship : null;
  const liveShip = shown.isMain && live?.ship != null && MINING_HULLS.has(live.ship) ? live.ship : null;
  const here = liveShip ?? altShip ?? mostMinedIn(shownSessions);
  const paceOf = (hull: number) => {
    const xs = shownSessions.filter(({ s, st }) => s.ship === hull && st.minutes >= LONG_MIN).map(({ st }) => st.m3PerMin);
    const m = median(xs);
    return m != null ? { m3PerMin: m, sessions: xs.length } : null;
  };
  const measured = median(shownSessions.filter(({ st }) => st.minutes >= LONG_MIN).map(({ st }) => st.m3PerMin));
  // What Scaling up prices for until you pick another: the ore it mined most, or Scordite before it has mined any.
  const shownRecent = recentOf.get(shown.charId) ?? [];
  const mostMined = useMemo(() => {
    const by = new Map<number, number>();
    for (const x of shownRecent) by.set(x.typeId, (by.get(x.typeId) ?? 0) + x.qty);
    return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? SCORDITE;
  }, [shownRecent]);
  const minedBases = new Set([...new Set(shownRecent.map((x) => x.typeId))].map((t) => (d.names[t] ? oreBase(name(t)) : null)).filter((x): x is string => !!x));
  useEnsureNames(chars.flatMap((c) => (c.entry?.ship ? [c.entry.ship] : [])));
  const inShip = shown.isMain
    ? (here != null ? 'The ship you’re in; its paths out are your next steps' : 'The ship you’re in, once you mine')
    : here != null && here === altShip && shown.entry?.shipAt != null ? `${shown.name}’s ship at the cloud’s last read, as of ${asOf(shown.entry.shipAt, now)}; its paths out are its next steps`
      : here != null ? `The ship ${shown.name} mined most in lately; its paths out are its next steps`
        : `${shown.name}’s ship, once the cloud sees it mine`;

  const whoMined = filtered ? (filtered.isMain ? 'you' : filtered.name) : many ? 'your characters' : 'you';
  const unreadCount = chars.filter((c) => c.mining !== 'read').length;
  // Why the figures shown aren't known: the character picked, or, with All, every one of them.
  const unread = filtered ? unreadSaid(filtered) : unreadCount === chars.length ? unreadSaid(main) : null;

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--body)', textWrap: 'pretty' }}>What you mined and what it was worth, your sessions, and the next step up.</p>
        <Points compact items={[
          { kind: 'good', icon: Coins, lead: 'Worth', text: 'each ore sold the best of three ways (as it is, compressed or reprocessed), after tax.' },
          { kind: 'info', icon: Timer, lead: 'Sessions', text: 'how long you mined and ISK an hour, from the cloud’s reads every ten minutes.' },
          ...(many ? [{ kind: 'info' as const, icon: Users, lead: 'Characters', text: 'every one the cloud reads, apart or added up; their ore is valued your way.' }] : []),
          { kind: 'tip', icon: TrendingUp, lead: 'Scaling up', text: 'every mining ship, what it costs and how many hours of mining pay for it.' },
          { kind: 'info', icon: History, lead: 'Kept', text: 'EVE keeps 30 days of your mining ledger; the app keeps it from then on.' },
        ]} />
      </div>
      {!auth ? <Notice kind="warn">Log in to read your mining ledger.</Notice>
        : !canRead ? (
          <Notice kind="warn">
            The app needs the <b>Mining ledger</b> permission: log in again to grant it (<button type="button" className="link-btn" onClick={() => navigate('settings/account')}>Settings → Account</button>),
            then hand the cloud your login again (Settings → Your data) so it can follow your sessions with the app closed.
          </Notice>
        ) : null}

      {!many && <RightNow now={live} />}

      {many && (
        <Panel title="Your characters" sub={`The last ${DAYS} days, each character’s own ledger, its ore valued your way`}>
          <CharTable chars={chars} recent={allRecent} val={val} pricing={pricing} sessions={allSessions} ticks={fleet.ticks} mainTicks={fleet.mainTicks} altTicks={fleet.altTicks} live={live} now={now} />
        </Panel>
      )}

      {many && (
        <Seg label="Character" value={filter} onChange={chooseFilter}
          options={[{ v: 'all' as const, label: 'All' }, ...chars.map((c) => ({ v: c.charId, label: c.name }))]} />
      )}

      <Tiles min={170} items={[
        unread ? { l: `Mined, ${DAYS} days`, v: '–', n: unread, c: 'var(--acc)' }
          : { l: `Mined, ${DAYS} days`, v: total.m3 != null ? `${units(Math.round(total.m3))} m³` : `${units(total.units)} units`,
            n: `${total.m3 != null ? `${units(total.units)} units on ` : 'on '}${units(minedDays)} day${minedDays === 1 ? '' : 's'}${filter === 'all' && unreadCount ? `; ${chars.length - unreadCount} of ${chars.length} characters read` : ''}`, c: 'var(--acc)' },
        {
          l: 'Worth now', v: unread ? '–' : total.priced ? iskBig(total.isk) : total.units ? '–' : iskBig(0),
          n: unread ?? (pricing ? 'Pricing at Jita…' : total.units > 0 && total.priced < total.ores ? (total.priced ? `${total.priced} of ${total.ores} ores priced` : notPriced) : 'Each ore the best of three ways, after tax'), c: 'var(--pos)',
          tip: 'What it would fetch now.\n\n• Each ore the best of three ways: as it is, compressed, or reprocessed at Jita 4-4, after tax.\n• At your own skills, standing and tax, whoever mined it.',
        },
        { l: 'Best day', v: best ? iskBig(best.isk) : '–', n: unread ?? (best ? fmtShort(best.date) : total.units ? notPriced : 'Nothing mined yet') },
        { l: 'ISK an hour', v: iskPerHour != null ? iskBig(iskPerHour) : '–', n: iskPerHour != null ? `The middle of ${units(long.length)} sessions` : unread ?? `Once the cloud has seen ${whoMined} mine`,
          tip: 'Measured, not assumed: the cloud reads each character’s mining ledger every 10 minutes and times each session from what grew between reads. Good to about ten minutes either way, which is ESI’s cache.' },
      ]} />

      <Panel title={filtered && !filtered.isMain ? `What ${filtered.name} mined` : filter === 'all' && many ? 'What your characters mined' : 'What you mined'} sub={`The last ${DAYS} days, at today’s best price for each ore`}>
        {!recent.length ? (
          <Empty icon={Pickaxe}>{filtered && !filtered.isMain
            ? (filtered.mining === 'unread' ? `Not read yet: the cloud hasn’t read ${filtered.name}’s mining ledger.`
              : filtered.mining === 'permission' ? `${filtered.name}’s login was handed to the cloud without the Mining ledger permission: hand it over again from the Characters page.`
                : `Nothing mined by ${filtered.name} in the last ${DAYS} days.`)
            : canRead ? `Nothing mined in the last ${DAYS} days. It shows here after your next sync, or within 10 minutes of mining when the cloud holds the permission.` : 'Nothing to show until the app can read your mining ledger.'}</Empty>
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
                    const m3Known = val.volumeOf(o.typeId) != null;
                    return (
                      <tr key={o.typeId}>
                        <td className="l"><span className="cellrow"><ItemIcon id={o.typeId} /><span className="name">{name(o.typeId)}</span></span>{b && <span className="sub">best: {WAY_SAID[b.way].toLowerCase()}</span>}</td>
                        <td>{units(o.units)}</td>
                        <td>{m3Known ? units(Math.round(o.m3)) : '–'}</td>
                        {cell('raw')}{cell('compressed')}{cell('reprocessed')}
                        <td style={{ color: 'var(--pos)' }}>{b ? iskBig(o.isk) : '–'}</td>
                        <td>{b && o.m3 > 0 ? isk(o.isk / o.m3) : '–'}</td>
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

      <Panel title="Sessions" sub={many ? 'When each character mined and how fast, from the cloud’s reads of its ledger' : 'When you mined and how fast, from the cloud’s reads of your ledger'}>
        {!cloudEnabled() ? <p className="note">Sessions come from the cloud, which reads your ledger every 10 minutes whether or not the app is open. Turn on the cloud copy (Settings → Your data).</p>
          : !fleet.ticks && (fleet.mainTicks === 'loading' || fleet.altTicks === 'loading') ? <p className="note">Reading sessions from the cloud…</p>
            : !sessions.length ? <p className="note">{filtered && !filtered.isMain
              ? `No sessions seen for ${filtered.name} yet. Each time it mines shows here within 10 minutes of the cloud reading its ledger.`
              : fleet.mainTicks === 'failed' ? 'Your sessions couldn’t be read from the cloud just now.'
                : 'No sessions seen yet. Once the cloud holds the Mining ledger permission, each time you mine shows here within 10 minutes: when, how long, how much, and ISK an hour.'}</p>
              : (
                <div className="tbl-scroll">
                  <table className="tbl" style={{ minWidth: many ? 860 : 760 }}>
                    <thead><tr>
                      {many && <Th left>Who</Th>}
                      <Th left>When</Th><Th left tip={many ? 'The ship most of it was mined in, read by the cloud with that character’s ledger' : 'The ship most of it was mined in, read by the cloud with your ledger'}>Ship</Th>
                      <Th>Length</Th><Th>m³</Th><Th>m³ a minute</Th><Th>Worth</Th><Th>ISK an hour</Th><Th left>Ore</Th>
                    </tr></thead>
                    <tbody>
                      {sessions.slice(0, 20).map(({ s, st }) => (
                        <tr key={`${s.charId}:${s.start}`}>
                          {many && <td className="l">{nameOf(s.charId)}</td>}
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
        {many && cloudEnabled() && (filtered == null || !filtered.isMain) && <AltTicksLine state={fleet.altTicks} />}
      </Panel>

      <PilotProvider value={shown.pilot}>
        <ScalingUp here={here} paceOf={paceOf} measured={measured} mostMined={mostMined} minedBases={minedBases} inShip={inShip}
          chars={chars} shownId={shown.charId} onShow={chooseShow} />
      </PilotProvider>
    </div>
  );
}

/** What the read of the other characters' ticks said, when it can't show them: one line, never an error. */
function AltTicksLine({ state }: { state: AltTicks }) {
  if (state === 'behind') return <p className="note small" style={{ margin: 0 }}>The cloud isn’t ready to show other characters’ sessions yet: its Worker is a version behind this app.</p>;
  if (state === 'failed') return <p className="note small" style={{ margin: 0 }}>Other characters’ sessions couldn’t be read just now.</p>;
  return null;
}

/**
 * Every character side by side: what each mined in the 30 days and what it's worth, the days, its sessions and ISK an
 * hour, and where it is right now; then the fleet's total. A character whose mining was never read says so across its
 * figures, never zeros.
 */
function CharTable({ chars, recent, val, pricing, sessions, ticks, mainTicks, altTicks, live, now }: {
  chars: FleetChar[]; recent: MiningRecord[];
  val: { volumeOf: (t: number) => number | null; worthOf: (t: number) => number | null };
  pricing: boolean; sessions: Row[]; ticks: CharTick[] | null; mainTicks: AltTicks; altTicks: AltTicks; live: Live | null; now: number;
}) {
  const name = useTypeName();
  const per = useMemo(() => perCharacter(recent, val.volumeOf, val.worthOf), [recent, val]);
  const all = useMemo(() => minedTotal(recent, val.volumeOf, val.worthOf), [recent, val]);
  const allDays = new Set(recent.map((x) => x.date)).size;
  const longOf = (rows: Row[]) => rows.filter(({ st }) => st.minutes >= LONG_MIN);
  // Sessions are known for the main once its ticks were read, for an alt once the alts' were: a read that failed is "–",
  // never none.
  const known = (c: FleetChar) => (c.isMain ? mainTicks : altTicks) === 'ok';
  const knownChars = chars.filter(known);
  const knownSessions = sessions.filter(({ s }) => knownChars.some((c) => c.charId === s.charId));
  const read = chars.filter((c) => c.mining === 'read');
  const mined = (t: { units: number; m3: number | null }) => (t.m3 != null ? `${units(Math.round(t.m3))} m³` : `${units(t.units)} units`);
  const worthSaid = (t: { isk: number; priced: number; ores: number }) => (t.priced ? iskBig(t.isk) : pricing ? 'Pricing…' : '–');
  const pace = (rows: Row[]) => { const m = median(longOf(rows).map(({ st }) => st.iskPerHour)); return m != null ? iskBig(m) : '–'; };
  return (
    <div className="tbl-scroll">
      <table className="tbl" style={{ minWidth: 820 }}>
        <thead><tr>
          <Th left>Character</Th>
          <Th tip="What it mined in the last 30 days: m³ where every ore’s volume is known, else units">Mined</Th>
          <Th tip="What it would fetch now, each ore the best of three ways after tax, at your own skills, standing and tax">Worth now</Th>
          <Th>Days</Th>
          <Th tip="Sessions the cloud saw in the last 30 days">Sessions</Th>
          <Th tip={'The middle of its sessions of 20 minutes or more.\n\n• Timed from what grew between the cloud’s reads, ten minutes apart.\n• A shorter session is a single read or two: too little to say a pace.'}>ISK an hour</Th>
          <Th left tip={'Where each character is now.\n\n• Yours: read live from ESI when the page opened.\n• An alt’s: its ship at the cloud’s last read of its mining ledger, every ten minutes, and “mining” when its ledger grew in that read or the one before.\n• Where an alt is, and whether it’s logged in, aren’t read.'}>Right now</Th>
        </tr></thead>
        <tbody>
          {chars.map((c) => {
            const t = per.get(c.charId);
            const rows = sessions.filter(({ s }) => s.charId === c.charId);
            const why = unreadSaid(c);
            return (
              <tr key={c.charId}>
                <td className="l">{c.name}{c.isMain && <span className="sub">Logged in here</span>}</td>
                {why ? <td colSpan={5} className="faint" style={{ textAlign: 'center' }}>{why}</td> : !t ? (
                  <><td colSpan={3} className="faint" style={{ textAlign: 'center' }}>Nothing mined in {DAYS} days</td>
                    <td>{known(c) ? units(rows.length) : '–'}</td><td>{known(c) ? pace(rows) : '–'}</td></>
                ) : (
                  <>
                    <td>{mined(t)}{t.m3 != null && <span className="sub">{units(t.units)} units</span>}</td>
                    <td style={{ color: t.priced ? 'var(--pos)' : undefined }}>{worthSaid(t)}{t.priced > 0 && t.priced < t.ores && <span className="sub">{t.priced} of {t.ores} ores priced</span>}</td>
                    <td>{units(t.days)}</td>
                    <td>{known(c) ? units(rows.length) : '–'}</td>
                    <td style={{ color: 'var(--pos)' }}>{known(c) ? pace(rows) : '–'}</td>
                  </>
                )}
                <td className="l">{c.isMain ? <MainNow now={live} /> : <AltNow c={c} ticks={ticks} altTicks={altTicks} now={now} name={name} />}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td className="l"><b>All {chars.length}</b>{read.length < chars.length && <span className="sub">{read.length} of {chars.length} read</span>}</td>
            {recent.length ? (
              <>
                <td><b>{mined(all)}</b>{all.m3 != null && <span className="sub">{units(all.units)} units</span>}</td>
                <td style={{ color: all.priced ? 'var(--pos)' : undefined }}><b>{worthSaid(all)}</b></td>
                <td>{units(allDays)}</td>
              </>
            ) : <td colSpan={3} className="faint" style={{ textAlign: 'center' }}>{read.length ? `Nothing mined in ${DAYS} days` : 'Not read yet'}</td>}
            <td>{knownChars.length ? units(knownSessions.length) : '–'}{knownChars.length > 0 && knownChars.length < chars.length && <span className="sub">{knownChars.length} of {chars.length} read</span>}</td>
            <td style={{ color: 'var(--pos)' }}>{knownChars.length ? pace(knownSessions) : '–'}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Your right now, read live from ESI as the page opened (useRightNow): online or not, and the ship. */
function MainNow({ now }: { now: Live | null }) {
  const name = useTypeName();
  useEnsureNames(now?.ship ? [now.ship] : []);
  if (!now || (now.ship == null && now.online == null)) return <span className="faint" data-tip="Needs the location permissions, read live from ESI">–</span>;
  const on = now.online == null ? null : now.online ? 'Online' : 'Offline';
  return <>{on}{now.ship ? `${on ? ', in' : 'In'} ${aShip(name(now.ship))}` : ''}{now.system ? <span className="sub">{now.system}</span> : null}</>;
}

/**
 * An alt's right now, from the cloud: its ship at its last mining read and whether its ledger grew in that read or the
 * one before (altRightNow), always with the read's time. A read older than a session's gap is said in the past tense
 * ("Was mining"), never as now: the cloud stops reading an alt whose login was refused, and its last read stays.
 */
function AltNow({ c, ticks, altTicks, now, name }: { c: FleetChar; ticks: CharTick[] | null; altTicks: AltTicks; now: number; name: (t: number) => string }) {
  const e = c.entry!;
  const rn = altRightNow(e, (ticks ?? []).filter((t) => t.charId === c.charId));
  if (rn.at == null || rn.ship == null) return <span className="faint" data-tip="The cloud hasn’t read its ship yet: it does with its mining ledger, every ten minutes.">–</span>;
  const fresh = now - rn.at <= SESSION_GAP_MS;
  // Whether it was mining is known only when the alts' ticks were read.
  const mining = altTicks === 'ok' && rn.mining;
  const ship = aShip(name(rn.ship));
  const text = mining ? `${fresh ? 'Mining' : 'Was mining'} in ${ship}, as of ${asOf(rn.at, now)}` : `${fresh ? 'In' : 'Was in'} ${ship} as of ${asOf(rn.at, now)}`;
  const tip = [
    'From the cloud’s last read of its mining ledger, every ten minutes.',
    '',
    '• Its ship at that read; “mining” when its ledger grew in that read or the one before.',
    '• Where it is, and whether it’s logged in, aren’t read.',
    ...(altTicks !== 'ok' ? ['• Whether it was mining isn’t known just now: its sessions couldn’t be read.'] : []),
    ...(e.refusedAt != null ? ['• EVE refused its login, so the cloud stopped reading it: this is as of its last read.'] : []),
  ].join('\n');
  return <span data-tip={tip} style={{ color: fresh ? undefined : 'var(--sec)' }}>{text}</span>;
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
 *
 * Shown for one character ("Show for"), whose pilot the page provides above it: its skills, queue and clone state on the
 * tree and the tiers, its ship, its pace and the ore it mines most. The ore's worth stays yours (your skills, standing
 * and tax), whoever mines it.
 */
function ScalingUp({ here, paceOf, measured, mostMined, minedBases, inShip, chars, shownId, onShow }: {
  here: number | null; paceOf: (hull: number) => { m3PerMin: number; sessions: number } | null;
  measured: number | null; mostMined: number; minedBases: Set<string>;
  /** What the legend says the lit ship is, for whoever it's shown for. */
  inShip: string;
  /** Who it can be shown for, and who it is. */
  chars: FleetChar[]; shownId: number; onShow: (charId: number) => void;
}) {
  const d = useData();
  const name = useTypeName();
  const pilot = usePilot();
  const r = rates(d.settings);
  const fromRate = (here != null ? paceOf(here)?.m3PerMin : null) ?? measured;
  const mines = pilot.isMain ? 'you mine' : `${pilot.name} mines`;

  // The ore the tiers are priced for: yours to pick (kept in this browser), else the one you mine most.
  const [chosen, setChosen] = useState<number | null>(readOre);
  const ore = chosen ?? mostMined;
  const choose = (t: number | null) => { setChosen(t); saveOre(t); };
  useEnsureNames([ore, mostMined]);
  const oreName = d.names[ore] ? name(ore).trim() : null;
  const base = oreName ? oreBase(oreName) : null;
  const family = (oreName ? oreFamily(oreName) : null) ?? 'Simple';

  const [worth, setWorth] = useState<Record<number, { m3: number; worth: OreWorth }>>({});
  // A read that priced it no way at all (ESI down: every bid failed) isn't kept, or it would say "Pricing at Jita…" for
  // good: it says so, with Try again (it did during the daily downtime, 30 September 2026).
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!oreName || worth[ore]) return;
    let alive = true;
    priceOres([ore], name, d.skills ?? {}, d.settings.corp, r.t)
      .then(({ vols, worth: w }) => {
        if (!alive) return;
        const ok = !!w[ore] && !!bestWay(w[ore]);
        setFailed((x) => ({ ...x, [ore]: !ok }));
        if (ok) setWorth((x) => ({ ...x, [ore]: { m3: vols[ore], worth: w[ore] } }));
      })
      .catch(() => { if (alive) setFailed((x) => ({ ...x, [ore]: true })); });
    return () => { alive = false; };
  }, [ore, oreName, retry]); // eslint-disable-line react-hooks/exhaustive-deps
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
      <TreeLegend inShip={inShip}
        extra={skillsUnread(pilot) ? <span data-tip="Worked out from ESI’s own figures for each hull, laser, crystal and upgrade, with every skill at V until the cloud has read this character’s skills."><Calculator aria-hidden="true" />Yields at V, from ESI</span>
          : <span data-tip={`Worked out from ESI’s own figures for each hull, laser, crystal and upgrade, at ${whose(pilot)} skills.`}><Calculator aria-hidden="true" />Yields at {whose(pilot)} skills, from ESI</span>} />
      <div className="row" style={{ gap: '8px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {chars.length > 1 && (
          <Seg size="sm" label="Show for" value={shownId} onChange={onShow}
            options={chars.map((c) => ({ v: c.charId, label: c.name, tip: c.isMain ? 'Your skills, ship and pace' : `${c.name}’s skills, ship and pace, as the cloud last read them`, tipTitle: `Show for ${c.name}` }))} />
        )}
        <label htmlFor="mine-ore" className="chip h34" data-tip-title="Ore to price the fits for"
          data-tip={'Which crystals every fit loads, and what ISK an hour and payback are worked out at: a m³ of this ore sold the best of three ways in Jita now, after tax.\n\nThe m³ a minute doesn’t change: a crystal of the right kind mines any ore of its family alike.'}>
          <span className="cl">Ore</span>
          <select id="mine-ore" value={base ?? ''} onChange={(e) => { const id = ids?.[e.target.value]; if (id) choose(id); }} style={{ minWidth: 190 }}>
            {!base && <option value="">{oreName ?? 'Loading…'}</option>}
            {FAMILIES.map(([f, ores]) => (
              <optgroup key={f} label={f.endsWith('Moon') ? `${f} ore` : `${f} ores`}>
                {ores.filter((o) => ids?.[o] || o === base).map((o) => <option key={o} value={o}>{o}{minedBases.has(o) ? ` · ${mines} it` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {base && grades.length > 1 && (
          <Seg size="sm" label="Grade" value={ore} onChange={(v) => choose(v)}
            options={grades.map((g) => ({ v: g.id, label: gradeLabel(g.name.trim(), base) }))} />
        )}
        <span className="note small" style={{ margin: 0 }}>
          {iskPerM3 != null && best ? `${isk(iskPerM3)} a m³ (${WAY_SAID[best.way].toLowerCase()}, after tax) · ${family} crystals`
            : oreName && failed[ore] ? <>Couldn’t price it at Jita just now. <button type="button" className="link-btn" onClick={() => { setFailed((x) => ({ ...x, [ore]: false })); setRetry((n) => n + 1); }}>Try again</button></>
              : oreName ? 'Pricing at Jita…' : ''}
        </span>
        {chosen != null && chosen !== mostMined && (
          <button type="button" className="link-btn" onClick={() => choose(null)}>Back to {name(mostMined).trim()}{minedBases.size ? `, what ${mines} most` : ''}</button>
        )}
      </div>
      <MiningTree here={here} paceOf={paceOf}>
        {(hull, price) => <MasteryTiers hull={hull} family={family} ore={oreName ?? 'your ore'} oreId={ore} iskPerM3={iskPerM3} fromRate={fromRate} hullPrice={price} />}
      </MiningTree>
      <SkillStrip title={`Skills that raise ${whose(pilot)} yield`} lines={[
        { name: 'Mining', id: 3386, what: '+5% ore yield a level, in every ship.' },
        { name: 'Astrogeology', id: 3410, what: '+5% ore yield a level. Needs Mining IV; Astrogeology III opens the barges.' },
        { name: 'Mining Barge', id: 17940, what: 'The barges’ own bonus a level; V opens the exhumers.' },
        { name: 'Exhumers', id: 22551, what: 'The exhumers’ own bonus a level.' },
      ]} />
    </Panel>
  );
}
