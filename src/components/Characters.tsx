import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react';
import { askedScopes, loginAltForCloud } from '../lib/auth';
import { refreshAlts, useAlts } from '../lib/altStore';
import { cloudAlts, cloudEnabled, cloudRemoveAlt, setCloudEnabled } from '../lib/cloud';
import { SCOPE_INFO, SCOPES } from '../lib/config';
import { chooseAsk } from '../lib/confirm';
import { ago, fmtDate, fmtDateTime, iskBig } from '../lib/format';
import { useAuth, useNow } from '../lib/hooks';
import { altFacts, charFacts, failingJobs, lastRead, loginState, type CharFacts, type CloneState, type RosterEntry } from '../lib/roster';
import { ROMAN, trainSaid } from '../lib/skillStatus';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import { useEnsureNames, useTypeName } from './common';
import { Empty, Flag, Notice, PageHead, Panel, Tiles, type TileData } from './ui';

/**
 * Your characters: the one logged in here, and the alts the cloud reads for you (docs/notes/characters.md). An alt
 * is a character on another of your accounts. It never logs in to the app: its login is handed to the cloud once,
 * from here, and what the cloud reads for it is kept apart from this ledger, under its own name.
 */

const CLONE_SAID: Record<CloneState, string> = { alpha: 'Alpha', omega: 'Omega', unknown: 'Can’t tell' };
const CLOUD_OFF = 'The cloud copy is switched off in this browser, and the cloud is what reads other characters.';
const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Wallet, net worth and the skill in training: a figure, or "–" with why, never a zero for "not known". */
function tiles(f: CharFacts, now: number, skill: (id: number) => string, live: boolean): TileData[] {
  const t = f.training;
  return [
    {
      l: 'Wallet', v: f.wallet != null ? iskBig(f.wallet) : '–',
      n: f.wallet == null ? 'Not read yet' : !f.walletAt ? 'Time not known' : live ? `Read ${ago(f.walletAt, now)}` : `As last changed, ${ago(f.walletAt, now)}`,
      tip: live ? 'The ISK this character holds in game, read every 2 minutes while the app is open.' : 'The ISK this character held when the cloud last read it. The cloud reads it every hour; the time is when the balance last changed.',
    },
    {
      l: 'Net worth', v: f.netWorth ? iskBig(f.netWorth.total) : '–', n: f.netWorth ? `The ${fmtDate(f.netWorth.date)} point` : 'No daily point yet',
      tip: 'Wallet, escrow, stock on sell orders and everything it holds, at CCP’s rough average prices.\n\n• One point a day, kept when it moves by half a percent.\n• This is the newest point; its date is under the figure.\n• The Wallet page works your own out live, so that figure is newer than this one.',
    },
    {
      l: 'Training', v: t ? `${skill(t.skillId)} ${ROMAN[t.level] ?? t.level}` : '–',
      n: !t ? 'Nothing in the queue' : !t.finish ? 'The queue is paused' : `Done in ${trainSaid(Date.parse(t.finish) - now)}${f.queueEnds && f.queueEnds !== t.finish ? `; the queue ends ${fmtDate(f.queueEnds)}` : ''}`,
    },
  ];
}

function Card(props: {
  id: number; name: string; facts: CharFacts; now: number; skill: (id: number) => string;
  /** The alt's roster entry; absent for the character logged in here. */
  entry?: RosterEntry;
  /** A clone state set by hand (an alt's) or in Settings (the main's), for one ESI can't tell apart. */
  byHand?: 'alpha' | 'omega';
  onClone?: (v: 'alpha' | 'omega' | undefined) => void;
  onHandOver?: () => void; onRemove?: () => void; busy?: boolean; cloudOff?: boolean;
}) {
  const { id, name, facts, now, entry } = props;
  const [imgOk, setImgOk] = useState(true);
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
      <Tiles inset min={170} items={tiles(facts, now, props.skill, !entry)} />
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
          {read ? `The cloud read it ${ago(new Date(read).toISOString(), now)}.` : 'The cloud hasn’t read it yet: its first full read runs when it’s added, then hourly at 37 minutes past.'}
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

  const mine = charFacts({ ...d.meta, cloneSince: undefined }, d.netWorth, now);
  const others = alts.roster.map((entry) => ({ entry, facts: altFacts(alts.alts[entry.charId] ?? { rev: 0, records: {}, docs: {} }, now) }));
  const everyone = [mine, ...others.map((o) => o.facts)];
  useEnsureNames([...everyone.flatMap((f) => (f.training ? [f.training.skillId] : [])), ...alts.roster.flatMap((r) => (r.ship ? [r.ship] : []))]);
  const skill = useTypeName();

  const known = (pick: (f: CharFacts) => number | null) => everyone.map(pick).filter((x): x is number => x != null);
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
    <button type="button" className="btn primary" disabled={busy || !cloudOn || !auth} onClick={handOver}
      data-tip-title="Adding a character"
      data-tip={'EVE’s login asks for an account, then which of its characters, and remembers the account you used last.\n\n• For a character on another account, sign out on EVE’s login page first, then sign in with that account.\n• If it offers your main and your mail character, you’re still signed in to your main account.\n• Not in a private window: the login has to come back to this tab.\n\nThe login goes straight to the cloud. Nothing of it is kept in this browser.'}>
      <UserPlus aria-hidden="true" />Add a character
    </button>
  );

  return (
    <div className="page">
      <PageHead kicker="Pilot" title="Characters"
        lede="The character logged in here, and the ones on your other accounts that the cloud reads for you. Each keeps its own wallet, skills and mining under its own name; none of it enters this ledger."
        actions={<>{alts.busy && <span className="note small"><RefreshCw aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> Reading…</span>}{add}</>} />

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

      <Card id={auth?.characterId ?? 0} name={auth?.characterName ?? 'Your character'} facts={mine} now={now} skill={skill} byHand={d.settings.clone} />
      {others.map(({ entry, facts }) => (
        <Card key={entry.charId} id={entry.charId} name={entry.name ?? `Character ${entry.charId}`} facts={facts} now={now} skill={skill} entry={entry} busy={busy} cloudOff={!cloudOn}
          byHand={d.chars[String(entry.charId)]?.clone} onClone={(v) => setClone(entry, v)} onHandOver={handOver} onRemove={() => remove(entry)} />
      ))}
      {alts.ready && !others.length && cloudOn && !alts.behind && (alts.rosterAt != null || !alts.error) && (
        <Panel>
          <Empty icon={Users} action={add}>
            No other characters yet. Add one and the cloud reads its wallet, assets, skills and mining every hour, with this app closed too.
          </Empty>
        </Panel>
      )}
    </div>
  );
}
