import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react';
import { askedScopes, hasScope, loginAltForCloud } from '../lib/auth';
import { altLedger } from '../lib/altLedger';
import { refreshAlts, useAlts } from '../lib/altStore';
import { cloudAlts, cloudEnabled, cloudRemoveAlt, setCloudEnabled } from '../lib/cloud';
import { SCOPE, SCOPE_INFO, SCOPES } from '../lib/config';
import { chooseAsk } from '../lib/confirm';
import { ago, fmtDate, fmtDateTime, iskBig, iskBigSigned, units } from '../lib/format';
import { useAuth, useNow } from '../lib/hooks';
import type { IncomeRow } from '../lib/income';
import { minedTotal, type MiningRecord } from '../lib/mining';
import { altFacts, altReadState, charFacts, emptyAlt, failingJobs, idleQueueSaid, jobOk, lastRead, loginState, type CharFacts, type CloneState, type RosterEntry } from '../lib/roster';
import { ROMAN, trainSaid } from '../lib/skillStatus';
import { update, useData, type Data } from '../lib/store';
import { toast } from '../lib/toast';
import { PERIOD_DAYS, periodStart, type Days } from '../lib/wallet';
import { useCharIncome, useMinedWorth } from './charIncome';
import { useEnsureNames, useTypeName } from './common';
import { Empty, Flag, Notice, PageHead, Panel, Seg, Tiles, Tip, type TileData } from './ui';

/**
 * Your characters: the one logged in here, and the alts the cloud reads for you (docs/notes/characters.md). An alt
 * is a character on another of your accounts. It never logs in to the app: its login is handed to the cloud once,
 * from here, and what the cloud reads for it is kept apart from this ledger, under its own name.
 */

const CLONE_SAID: Record<CloneState, string> = { alpha: 'Alpha', omega: 'Omega', unknown: 'Can’t tell' };
const CLOUD_OFF = 'The cloud copy is switched off in this browser, and the cloud is what reads other characters.';
const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The period Earned and Mined cover, kept per browser; the Wallet's periods and its rule for where one starts. */
const DAYS_KEY = 'jita-ledger:chars-days';
function readDays(): Days {
  try { const v = Number(localStorage.getItem(DAYS_KEY)); if ((PERIOD_DAYS as number[]).includes(v)) return v as Days; } catch { /* private window */ }
  return 7;
}
/** Ores are priced for the longest period, whichever is shown, so switching periods doesn't price them again. */
const LONGEST = PERIOD_DAYS[PERIOD_DAYS.length - 1];
const dateOf = (t: number) => new Date(t).toISOString().slice(0, 10);
/** One empty copy for every alt not pulled yet, so altLedger's answer for it is worked out once, not on every render. */
const NO_ALT = emptyAlt();

type MinedWorth = ReturnType<typeof useMinedWorth>;

/**
 * What the character earned in the period, by the Wallet's rules: yours is the Wallet's "All income" for the same period.
 * "–" with why while the item groups are read, and for an alt whose wallet the cloud hasn't read. `readAt`: an alt's,
 * when the cloud last read its wallet and journal (its `archive` job), since its figure runs to then, not to now.
 */
function earnedTile(inc: ReturnType<typeof useCharIncome>, period: string, alt: boolean, unread: boolean, readAt: number | null, now: number): TileData {
  if (unread) return { l: 'Earned', v: '–', n: 'Not read yet', tip: 'The cloud hasn’t read this character’s wallet yet, so what it earned isn’t known.' };
  const tip = earnedTip(inc.rows, period, alt, inc.failed, readAt, now);
  if (!inc.ready) return { l: 'Earned', v: '–', n: 'Reading which items belong to which activity…', tip };
  if (!inc.rows.length) return { l: 'Earned', v: '–', n: `Nothing earned in ${period}`, tip };
  return { l: 'Earned', v: iskBigSigned(inc.earned), n: `In the last ${period}`, c: inc.earned >= 0 ? 'var(--pos)' : 'var(--neg)', tip };
}

function earnedTip(rows: IncomeRow[], period: string, alt: boolean, failed: boolean, readAt: number | null, now: number): string {
  const parts = [alt
    ? `Everything it earned in the last ${period}, by the Wallet’s rules, from its own trades and journal as the cloud last read them${readAt != null ? `, ${ago(new Date(readAt).toISOString(), now)}` : ''}: anything since isn’t in it yet.`
    : `Everything you earned in the last ${period}: the Wallet’s “All income” for the same period, by the same rules.`];
  if (rows.length) parts.push(rows.map((r) => `• ${r.said}: ${iskBigSigned(r.isk)}`).join('\n'));
  if (alt) {
    parts.push('What it leaves out:\n\n'
      + '• Ships it lost: the cloud doesn’t read an alt’s killmails.\n'
      + '• What it bought for freelance jobs: an alt’s jobs aren’t read, so a job’s reward counts in full, with nothing set against it.\n'
      + '• Ore it hauled to you and you sold: that’s yours when you sell it.');
  }
  if (failed) parts.push('ESI’s item groups couldn’t be read, so abyssal, planets, loyalty and things never bought aren’t counted.');
  return parts.join('\n\n');
}

const MINED_TIP = 'What the ore mined is worth now, at your own valuation.\n\n'
  + '• The Mining tab’s: the best of selling it raw, compressed or reprocessed at your skills, after tax.\n'
  + '• Beside what was earned, never added to it: ore becomes ISK when it’s sold, and then it counts where it’s sold.';
/** EVE records mining by the day, so a rolling 24 hours takes all of yesterday's and today's. */
const MINED_DAY = '\n• Mining is recorded by the day (EVE time), so for 24 hours this is yesterday’s and today’s.';

/**
 * What the character mined in the period, at today's prices: never 0 ISK for ore that couldn't be priced, and "pricing"
 * while names or prices are still coming. `unread`: why its mining isn't known (an alt not read yet or without the
 * permission, or your mining ledger never read), so none mined isn't claimed. `oneDay`: the 24-hour period, which for
 * mining runs from the start of yesterday.
 */
function minedTile(recs: MiningRecord[], w: MinedWorth, period: string, oneDay: boolean, unread: string | null): TileData {
  const tip = MINED_TIP + (oneDay ? MINED_DAY : '');
  if (unread) return { l: 'Mined', v: '–', n: unread, tip };
  if (!recs.length) return { l: 'Mined', v: '–', n: `Nothing mined ${oneDay ? 'since yesterday (EVE time)' : `in ${period}`}`, tip };
  const t = minedTotal(recs, w.volumeOf, w.worthOf);
  const amount = t.m3 != null ? `${units(Math.round(t.m3))} m³` : `${units(t.units)} units`;
  const state = w.pricing && t.priced < t.ores ? 'pricing at Jita…'
    : t.priced ? `${t.priced} of ${t.ores} ore${t.ores === 1 ? '' : 's'} priced` : 'not priced';
  return { l: 'Mined', v: t.priced ? iskBig(t.isk) : '–', n: `${amount}${oneDay ? ' since yesterday (EVE time)' : ''}, ${state}`, tip };
}

/**
 * Wallet, net worth and the skill in training: a figure, or "–" with why, never a zero for "not known". `entry`: an
 * alt's roster entry, whose wallet is as of the cloud's last read of its sheet; absent for the character logged in here.
 */
function tiles(f: CharFacts, now: number, skill: (id: number) => string, entry?: RosterEntry): TileData[] {
  const t = f.training;
  // An alt's wallet is read with its sheet, hourly. Its meta's walletAt isn't that time: the cloud pushes the sheet,
  // with walletAt set to now, whenever anything else in it moves, and not when only the time would.
  const sheetAt = entry?.jobs.find((j) => j.job === 'sheet')?.lastOk ?? null;
  const readAt = entry ? (sheetAt != null ? new Date(sheetAt).toISOString() : null) : f.walletAt;
  return [
    {
      l: 'Wallet', v: f.wallet != null ? iskBig(f.wallet) : '–',
      n: f.wallet == null ? 'Not read yet' : readAt ? `Read ${ago(readAt, now)}` : 'Time not known',
      tip: entry ? 'The ISK this character held when the cloud last read it. The cloud reads it every hour, and the time under the figure is that read.' : 'The ISK this character holds in game, read every 2 minutes while the app is open.',
    },
    {
      l: 'Net worth', v: f.netWorth ? iskBig(f.netWorth.total) : '–', n: f.netWorth ? `The ${fmtDate(f.netWorth.date)} point` : 'No daily point yet',
      tip: 'Wallet, escrow, stock on sell orders and everything it holds, at CCP’s rough average prices.\n\n• One point a day, kept when it moves by half a percent.\n• This is the newest point; its date is under the figure.\n• The Wallet page works your own out live, so that figure is newer than this one.',
    },
    {
      l: 'Training', v: t ? `${skill(t.skillId)} ${ROMAN[t.level] ?? t.level}` : '–',
      n: !t ? idleQueueSaid(f) : !t.finish ? 'The queue is paused' : `Done in ${trainSaid(Date.parse(t.finish) - now)}${f.queueEnds && f.queueEnds !== t.finish ? `; the queue ends ${fmtDate(f.queueEnds)}` : ''}`,
    },
  ];
}

function Card(props: {
  id: number; name: string; facts: CharFacts; now: number; skill: (id: number) => string;
  /** The character's ledger: yours, or an alt's copy as altLedger builds it (read-only). */
  ledger: Data;
  /** Its mining records in the period, and what each ore is worth. */
  mined: MiningRecord[]; worth: MinedWorth;
  /**
   * Where the period starts, and how it's said ("7 days", "24 hours"), and the time it runs to, rounded to the minute
   * (`incomeNow`) so the income isn't worked out again every time the page redraws. `oneDay`: the 24-hour period.
   */
  since: number; period: string; incomeNow: number; oneDay: boolean;
  /** An alt whose wallet the cloud hasn't read: no trades or journal kept, and no read of them that worked. */
  earnedUnread?: boolean;
  /** Why its mining isn't known, when it isn't. */
  miningUnread?: string;
  /** What it earned, for the all-characters total: null while not known. */
  onEarned: (id: number, isk: number | null) => void;
  /** The alt's roster entry; absent for the character logged in here. */
  entry?: RosterEntry;
  /** A clone state set by hand (an alt's) or in Settings (the main's), for one ESI can't tell apart. */
  byHand?: 'alpha' | 'omega';
  onClone?: (v: 'alpha' | 'omega' | undefined) => void;
  onHandOver?: () => void; onRemove?: () => void; busy?: boolean; cloudOff?: boolean;
}) {
  const { id, name, facts, now, entry, onEarned } = props;
  const [imgOk, setImgOk] = useState(true);
  const income = useCharIncome(props.ledger, props.since, props.incomeNow, id);
  // Reported up for the all-characters total only when it changes: the page's state holds it, so an effect keyed on the
  // value (not on every render) keeps the two from setting each other in a loop.
  const known = !props.earnedUnread && income.ready;
  useEffect(() => { onEarned(id, known ? income.earned : null); }, [id, known, income.earned, onEarned]);
  const login = entry ? loginState(entry, [...SCOPES, ...askedScopes()]) : null;
  const failing = entry ? failingJobs(entry) : [];
  const read = entry ? lastRead(entry) : null;
  const unread = !!entry && facts.totalSp == null;
  const clone: CloneState = facts.clone !== 'unknown' ? facts.clone : props.byHand ?? 'unknown';
  const cloneColor = clone === 'alpha' ? 'var(--acc2)' : clone === 'omega' ? 'var(--acc)' : 'var(--note)';
  const cloneWhy = facts.clone !== 'unknown'
    ? (entry ? 'Worked out from its skills: Alpha when a skill is usable below the level trained, Omega when one is usable above what an Alpha may use.' : 'Read from your skills on the last sync.')
    : !entry ? 'The clone state set in Settings, because the last sync couldn’t tell.'
    : unread ? 'The cloud hasn’t read this character’s skills yet, so its clone state isn’t known.'
    : 'ESI has no field for it, and this character has trained nothing past what an Alpha may use, so its skills look the same either way. Say which it is, if you like: it’s a label only.';
  return (
    <Panel label={name}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
        <div className="pilot">
          <div className="avatar">{imgOk && <img src={`https://images.evetech.net/characters/${id}/portrait?size=64`} alt="" onError={() => setImgOk(false)} />}</div>
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div className="pilot-name" style={{ whiteSpace: 'normal' }}>{name}</div>
            <div className="pilot-sub" style={{ whiteSpace: 'normal' }}>{entry ? 'Read by the cloud' : 'Logged in here: this ledger’s character'}</div>
          </div>
        </div>
        <div className="row tight">
          <Flag color={unread ? 'var(--note)' : cloneColor} title="Clone state"
            why={cloneWhy}>
            {unread ? 'Not read yet' : CLONE_SAID[clone]}{facts.clone === 'unknown' && props.byHand ? (entry ? ' (you said)' : ' (as set in Settings)') : ''}{facts.cloneSince ? ` since ${fmtDate(facts.cloneSince)}` : ''}
          </Flag>
          {login?.state === 'refused' && <Flag color="var(--neg)" title="Login refused" why={`EVE has refused the cloud’s login for ${name} since ${fmtDateTime(entry!.refusedAt!)}${entry!.refused ? ` (${entry!.refused})` : ''}. Nothing is read for it until you hand it over again.`}>Login refused</Flag>}
          {login?.state === 'none' && <Flag color="var(--neg)" title="No login" why="The cloud holds no login for this character, so nothing is read for it. Hand it over again.">No login</Flag>}
          {login?.state === 'working' && login.missing.length === 0 && (
            <Flag color="var(--pos)" title="Login working" why={entry!.at ? `The cloud last used this login ${ago(new Date(entry!.at).toISOString(), now)}.` : 'The cloud holds a login for this character.'}>Login working</Flag>
          )}
          {login?.state === 'working' && login.missing.length > 0 && (
            <Flag color="var(--acc2)" title="Permissions missing"
              why={`This login was handed over before the app asked for these. It keeps working; what needs them doesn’t, until you hand it over again:\n\n${login.missing.map((s) => `• ${SCOPE_INFO[s]?.label ?? s}`).join('\n')}`}>
              {login.missing.length} permission{login.missing.length === 1 ? '' : 's'} missing
            </Flag>
          )}
        </div>
      </div>
      <Tiles inset min={170} items={[
        ...tiles(facts, now, props.skill, entry),
        earnedTile(income, props.period, !!entry, !!props.earnedUnread, entry ? jobOk(entry, 'archive') : null, now),
        minedTile(props.mined, props.worth, props.period, props.oneDay, props.miningUnread ?? null),
      ]} />
      {entry && !unread && facts.clone === 'unknown' && props.onClone && (
        <div className="row tight">
          <span className="note small">Alpha or Omega?</span>
          {(['alpha', 'omega'] as const).map((k) => (
            <button key={k} type="button" className="btn xs" aria-pressed={props.byHand === k} onClick={() => props.onClone!(props.byHand === k ? undefined : k)}
              style={props.byHand === k ? { borderColor: 'var(--acc)', color: 'var(--ink)' } : undefined}>{CLONE_SAID[k]}</button>
          ))}
        </div>
      )}
      {entry && (
        <p className="note small">
          {login?.state === 'refused' || login?.state === 'none'
            ? `${read ? `The cloud last read it ${ago(new Date(read).toISOString(), now)}. Nothing more is read` : 'The cloud hasn’t read it, and nothing is read'} until its login is handed over again.`
            : read ? `The cloud read it ${ago(new Date(read).toISOString(), now)}.` : 'The cloud hasn’t read it yet: its first full read runs when it’s added, then hourly at 37 minutes past.'}
          {entry.ship && entry.shipAt ? ` In ${props.skill(entry.ship)} at its mining read ${ago(new Date(entry.shipAt).toISOString(), now)}.` : ''}
          {failing.map((j) => ` ${j.job === 'mining' ? 'Its mining read' : j.job === 'sheet' ? 'Its skills read' : 'Its wallet and assets read'} is failing: ${j.lastError}.`).join('')}
        </p>
      )}
      {entry && (
        <div className="row">
          {(login?.state !== 'working' || (login?.missing.length ?? 0) > 0) && (
            <button type="button" className="btn sm primary" disabled={props.busy || props.cloudOff} title={props.cloudOff ? CLOUD_OFF : undefined} onClick={props.onHandOver}><Cloud aria-hidden="true" />Hand the cloud this login again</button>
          )}
          <button type="button" className="btn sm quiet" disabled={props.busy || props.cloudOff} title={props.cloudOff ? CLOUD_OFF : undefined} onClick={props.onRemove}><Trash2 aria-hidden="true" />Remove</button>
        </div>
      )}
    </Panel>
  );
}

export function Characters() {
  const d = useData();
  const auth = useAuth();
  const alts = useAlts();
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const cloudOn = cloudEnabled();
  // A redirect to EVE's login can be restored from the back-forward cache with the page as it was left: mid-hand-over.
  useEffect(() => {
    const back = (e: PageTransitionEvent) => { if (e.persisted) setBusy(false); };
    window.addEventListener('pageshow', back);
    return () => window.removeEventListener('pageshow', back);
  }, []);

  const [days, setDaysState] = useState<Days>(readDays);
  const setDays = (v: Days) => { setDaysState(v); try { localStorage.setItem(DAYS_KEY, String(v)); } catch { /* private window */ } };
  // The income runs to the minute, not to the 30-second clock the page's other times keep: it's worked out again
  // whenever its window moves, and a rolling 24 hours moves its start with it (the final review of stage 2b).
  const incomeNow = Math.floor(now / 60_000) * 60_000;
  const since = periodStart(days, incomeNow);
  const period = days === 1 ? '24 hours' : `${days} days`;
  // Mining records are one a day, so the period takes whole days: every record from the day it starts (from yesterday,
  // for 24 hours).
  const fromDate = dateOf(since), pricedFrom = dateOf(periodStart(LONGEST, incomeNow));

  const mainId = auth?.characterId ?? 0;
  const mine = charFacts({ ...d.meta, cloneSince: undefined }, d.netWorth, now);
  const myMining = useMemo(() => Object.values(d.mining).filter((r) => r.charId === mainId), [d.mining, mainId]);
  const wanted = [...SCOPES, ...askedScopes()];
  const others = alts.roster.map((entry) => {
    const saved = alts.alts[entry.charId] ?? NO_ALT;
    const facts = altFacts(saved, now);
    const byHand = d.chars[String(entry.charId)]?.clone;
    // The alt's copy as a ledger, the same object until its revision moves (altLedger), so its income is worked out once.
    const ledger = altLedger(saved, byHand);
    // Each part is known once that part was read (altReadState), never because something else was.
    const read = altReadState(saved, entry, wanted, SCOPE.mining);
    const miningUnread = read.mining === 'read' ? undefined : read.mining === 'permission' ? 'Needs the Mining ledger permission' : 'Not read yet';
    return { entry, facts, byHand, ledger, mining: Object.values(ledger.mining), earnedUnread: !read.earned, miningUnread };
  });
  const everyone = [mine, ...others.map((o) => o.facts)];
  // Ore names from your ledger, or the alt's own copy when yours hasn't one.
  const worth = useMinedWorth([myMining, ...others.map((o) => o.mining)].flat().filter((r) => r.date >= pricedFrom).map((r) => r.typeId), others.map((o) => o.ledger.names));

  // Each card's Earned, as it reports it: null while not known (being worked out, or an alt not read yet).
  const [earnedBy, setEarnedBy] = useState<Record<number, number | null>>({});
  const onEarned = useCallback((id: number, v: number | null) => setEarnedBy((x) => (x[id] === v ? x : { ...x, [id]: v })), []);
  useEnsureNames([...everyone.flatMap((f) => (f.training ? [f.training.skillId] : [])), ...alts.roster.flatMap((r) => (r.ship ? [r.ship] : []))]);
  const skill = useTypeName();

  const known = (pick: (f: CharFacts) => number | null) => everyone.map(pick).filter((x): x is number => x != null);
  // Only the characters on the page: an alt removed meanwhile leaves its last figure behind, and it isn't counted.
  const earnedAll = [mainId, ...others.map((o) => o.entry.charId)].map((id) => earnedBy[id]).filter((x): x is number => x != null);
  const wallets = known((f) => f.wallet), worths = known((f) => f.netWorth?.total ?? null);
  const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
  const total: TileData[] = [
    { l: 'Characters', v: String(everyone.length), n: others.length ? `You and ${others.length} the cloud reads` : 'Only the one logged in here' },
    {
      l: 'All wallets', v: wallets.length ? iskBig(sum(wallets)) : '–', n: `${wallets.length} of ${everyone.length} read`,
      tip: 'Every character’s ISK in game, added up.\n\n• Yours is read every 2 minutes while the app is open.\n• An alt’s is as the cloud last read it, hourly.\n• A character not read yet adds nothing, and the count under the figure says how many were.',
    },
    {
      l: 'All net worth', v: worths.length ? iskBig(sum(worths)) : '–', n: `${worths.length} of ${everyone.length} have a daily point`,
      tip: 'Each character’s newest daily net-worth point, added up.\n\n• A point is wallet, escrow, stock on sell orders and everything held, at CCP’s rough average prices.\n• The points can be from different days: each card says its own.\n• Your own ledger’s net worth, live, is on the Wallet page and is not changed by this.',
    },
    {
      l: 'Earned, all characters', v: earnedAll.length ? iskBigSigned(sum(earnedAll)) : '–', n: `In the last ${period}: ${earnedAll.length} of ${everyone.length} counted`,
      c: earnedAll.length ? (sum(earnedAll) >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined,
      tip: `What every character earned in the last ${period}, added up.\n\n• Each by the Wallet’s rules, as on its card: yours is the Wallet’s “All income”.\n• An alt’s leaves out ships it lost, and counts a freelance reward without what was bought for the job: the cloud reads neither for an alt.\n• A character not read yet, or still being worked out, adds nothing, and the count under the figure says how many did.\n• A card’s figure can be partial: when ESI’s item groups couldn’t be read, it leaves out abyssal, planets, loyalty and things never bought, and its own tip says so.`,
    },
  ];

  /** Send the owner to EVE for an alt's login, but not for one the cloud couldn't keep. */
  async function handOver() {
    setBusy(true);
    try {
      await cloudAlts();
    } catch (e) {
      setBusy(false);
      toast((e as { status?: number }).status === 404
        ? 'The cloud isn’t ready for other characters yet: its Worker is a version behind this app. Try again in a few minutes.'
        : `The cloud couldn’t be reached, so no login would be kept: ${said(e)}`, 'err');
      return;
    }
    loginAltForCloud().catch((e) => { setBusy(false); toast(said(e), 'err'); });
  }

  async function remove(entry: RosterEntry) {
    const name = entry.name ?? `Character ${entry.charId}`;
    const a = await chooseAsk({
      title: `Remove ${name}?`,
      body: `The cloud stops reading ${name} and its login is revoked at EVE. What it has read so far can be kept in the cloud or deleted.\n\nKept data isn’t shown anywhere until you add ${name} again, and can only be deleted after that. ${name} stays on your list of characters either way.`,
      confirm: 'Remove and delete its data', alt: 'Remove, keep its data', danger: true,
    });
    if (a === 'no') return;
    setBusy(true);
    try {
      await cloudRemoveAlt(entry.charId, a === 'yes' ? 'delete' : 'keep');
      toast(`${name} is no longer read by the cloud.${a === 'yes' ? ' What it had read is deleted.' : ' What it had read is kept.'}`, 'info');
      await refreshAlts();
    } catch (e) {
      toast(`Couldn’t remove ${name}: ${said(e)}`, 'err');
    } finally {
      setBusy(false);
    }
  }

  /** The roster on disk can be ahead of `chars` (no live read this session), so a click starts from the entry's name. */
  const setClone = (entry: RosterEntry, v: 'alpha' | 'omega' | undefined) => update((x) => {
    const id = String(entry.charId);
    const { clone: _was, ...rest } = x.chars[id] ?? { name: entry.name ?? `Character ${entry.charId}` };
    return { chars: { ...x.chars, [id]: v ? { ...rest, clone: v } : rest } };
  });

  const add = (
    <button type="button" className="btn primary" disabled={busy || !cloudOn || !auth} onClick={handOver}>
      <UserPlus aria-hidden="true" />Add a character
    </button>
  );
  // Said beside the button, not only in a tip: on a phone a tap on the button goes to EVE before any tip could show,
  // and signing out there first is what keeps EVE from handing back the main or the mail character instead.
  const empty = alts.ready && !others.length && cloudOn && !alts.behind && (alts.rosterAt != null || !alts.error);
  const addHint = (
    <span className="note small" style={{ whiteSpace: 'normal' }}>
      On another account? Sign out on EVE’s login page first.{' '}
      <Tip title="Adding a character"
        text={'EVE’s login asks for an account, then which of its characters, and remembers the account you used last.\n\n• For a character on another account, sign out on EVE’s login page first, then sign in with that account.\n• If it offers your main and your mail character, you’re still signed in to your main account.\n• Not in a private window: the login has to come back to this tab.\n\nThe login goes straight to the cloud. Nothing of it is kept in this browser.'} />
    </span>
  );

  return (
    <div className="page">
      <PageHead kicker="Pilot" title="Characters"
        lede="The character logged in here, and the ones on your other accounts that the cloud reads for you. Each keeps its own wallet, skills and mining under its own name; none of it enters this ledger."
        actions={<><Seg label="Period" value={days} onChange={setDays} options={PERIOD_DAYS.map((v) => ({ v, label: v === 1 ? '24 hours' : `${v} days` }))} />{alts.busy && <span className="note small"><RefreshCw aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> Reading…</span>}{!empty && addHint}{add}</>} />

      {!cloudOn && (
        <Notice kind="warn" icon={CloudOff}>
          Other characters are read by the cloud, and the cloud copy is switched off in this browser.{' '}
          <button type="button" className="link-btn" onClick={() => { setCloudEnabled(true); refreshAlts().catch(() => undefined); }}>Switch it on</button>
        </Notice>
      )}
      {cloudOn && alts.behind && <Notice kind="warn">The cloud isn’t ready for other characters yet: its Worker is a version behind this app. It catches up within a few minutes of a release.</Notice>}
      {cloudOn && alts.error && !alts.behind && (
        <Notice kind="warn">
          The cloud couldn’t be reached just now ({alts.error}).{alts.rosterAt ? ` What’s below is as read ${ago(new Date(alts.rosterAt).toISOString(), now)}.` : ''}
        </Notice>
      )}
      {cloudOn && alts.failedAlt && !alts.behind && (
        <Notice kind="warn">
          Reading {alts.failedAlt.name ?? `Character ${alts.failedAlt.charId}`} failed: {alts.failedAlt.message}{/[.!?]$/.test(alts.failedAlt.message) ? '' : '.'}
        </Notice>
      )}

      <Tiles items={total} min={220} />

      <Card id={mainId} name={auth?.characterName ?? 'Your character'} facts={mine} now={now} skill={skill} byHand={d.settings.clone}
        ledger={d} mined={myMining.filter((r) => r.date >= fromDate)} worth={worth} since={since} period={period} incomeNow={incomeNow} oneDay={days === 1} onEarned={onEarned}
        miningUnread={!myMining.length && !hasScope(SCOPE.mining) ? 'Needs the Mining ledger permission' : undefined} />
      {others.map(({ entry, facts, byHand, ledger, mining, earnedUnread, miningUnread }) => (
        <Card key={entry.charId} id={entry.charId} name={entry.name ?? `Character ${entry.charId}`} facts={facts} now={now} skill={skill} entry={entry} busy={busy} cloudOff={!cloudOn}
          ledger={ledger} mined={mining.filter((r) => r.date >= fromDate)} worth={worth} since={since} period={period} incomeNow={incomeNow} oneDay={days === 1}
          earnedUnread={earnedUnread} miningUnread={miningUnread} onEarned={onEarned}
          byHand={byHand} onClone={(v) => setClone(entry, v)} onHandOver={handOver} onRemove={() => remove(entry)} />
      ))}
      {empty && (
        <Panel>
          <Empty icon={Users} action={<>{add}<p>{addHint}</p></>}>
            No other characters yet. Add one and the cloud reads its wallet, assets, skills and mining every hour, with this app closed too.
          </Empty>
        </Panel>
      )}
    </div>
  );
}
