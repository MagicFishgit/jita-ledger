import { useSyncExternalStore } from 'react';
import { getAuth } from './auth';
import { ALERT_LABELS, shouldAlert, tidyEvery, type Finding } from './alerts';
import { readColonies } from './colonyStore';
import { breakEvenSpread, rates } from './fees';
import { iskBig } from './format';
import { canMail, cleanupAlertMails, sendAlertMail } from './mailAlerts';
import { checkOrders, costBasis, getOrderCheck, jitaOpen, verdicts } from './orderCheck';
import { squeezed } from './signals';
import { getData, update } from './store';
import { toast } from './toast';
import { readSignals, trackedTypes } from './watch';
import type { AlertEvent, AlertLogEntry } from './types';

/**
 * Checking in the background while the tab is open.
 *
 * A web page cannot run when it is closed, so this only watches while Jita Ledger is open somewhere.
 * Each check asks the same questions the pages do --- orders against the live book, positions'
 * margins, colonies, suspicious markets on what you hold, the age of your backup --- and raises what
 * the rules in alerts.ts say is worth raising.
 */

type State = {
  startedAt: number; lastRun: number | null; running: boolean; watching: number;
  /** Why the last alert mail couldn't be sent or tidied away, until one next succeeds. */
  mailError: string | null;
  /** Whether this tab is the one doing the checking. Only one tab does, so nothing is raised twice. */
  leader: boolean;
};
let state: State = { startedAt: Date.now(), lastRun: null, running: false, watching: 0, mailError: null, leader: false };
const listeners = new Set<() => void>();
const setState = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export function useAlertRunner(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

const DAY = 86400_000;
export const BACKUP_DAYS = 14;

function raise(f: Finding, test = false): void {
  const entry: AlertLogEntry = { at: new Date().toISOString(), kind: f.kind, key: f.key, title: f.title, text: f.text, test: test || undefined };
  update((d) => ({ alertLog: [entry, ...d.alertLog].slice(0, 200) }));
  // The system notification rides on the toast, so it queues and times out by the same settings.
  const cfg = getData().alerts;
  toast((test ? 'Test alert — ' : '') + f.text, f.kind === 'move' || f.kind === 'scam' || f.kind === 'squeeze' ? 'warn' : 'info',
    { system: cfg.browser ? { title: `Jita Ledger · ${f.title}`, tag: f.key, heading: (test ? 'Test · ' : '') + f.title } : undefined });
}

export function testAlert() {
  raise({ kind: 'move', key: 'test', title: ALERT_LABELS.move.label, text: 'This is how an order worth moving will be announced.' }, true);
}

const SEND_FAILED = 'Couldn’t send the alert mail: ';
const TIDY_FAILED = 'Couldn’t delete old alert mails: ';
const mailFailed = (prefix: string, e: unknown) => {
  const msg = prefix + (e instanceof Error ? e.message : String(e));
  // Said once, not every check: the error stays on Settings until the next success.
  if (msg !== state.mailError) toast(msg, 'err');
  setState({ mailError: msg });
};

/** Mail everything one check raised, as a single mail. */
async function mailFindings(raised: Finding[]): Promise<void> {
  const cfg = getData().alerts;
  const send = raised.filter((f) => cfg.mailEv[f.kind]);
  if (!cfg.mail || !send.length || !canMail()) return;
  try { await sendAlertMail(send); setState({ mailError: null }); } catch (e) { mailFailed(SEND_FAILED, e); }
}

/**
 * A test mail, about an item you actually have an order on if there is one, so its link can be tried.
 * Returns true once ESI has accepted it.
 */
export async function testMail(): Promise<boolean> {
  const d = getData();
  const o = Object.values(d.orders).find((x) => x.state === 'open') ?? null;
  const typeId = o?.typeId ?? 34;
  const name = d.names[typeId] ?? (o ? `Item #${typeId}` : 'Tritanium');
  try {
    await sendAlertMail([{
      kind: 'move', key: 'test', title: ALERT_LABELS.move.label, typeId, name,
      text: `${name}: this is how an order worth moving will be announced. The item’s name opens it in game, one click from its market.`,
    }], true);
    setState({ mailError: null });
    return true;
  } catch (e) { mailFailed(SEND_FAILED, e); return false; }
}

/** One check. Findings that pass the rules are raised; the rest are dropped quietly. */
export async function runChecks(): Promise<void> {
  const d0 = getData();
  if (!d0.alerts.on || state.running) return;
  setState({ running: true });
  const findings: Finding[] = [];
  try {
    const d = getData();
    const ev = d.alerts.ev;
    const names = (id: number) => d.names[id] ?? `Item #${id}`;
    const r = rates(d.settings);

    if (getAuth() && (ev.move || ev.clearing) && jitaOpen(d).length) {
      await checkOrders(false);
      const list = verdicts(getData(), getOrderCheck(), costBasis(getData()));
      setState({ watching: list.length });
      for (const x of list) {
        const side = x.isBuy ? 'buy' : 'sell';
        if (x.verdict === 'move') {
          findings.push({ kind: 'move', key: `move:${x.orderId}:${x.newPrice}`, isk: x.atRisk, title: ALERT_LABELS.move.label, typeId: x.typeId, name: names(x.typeId),
            text: `${names(x.typeId)} ${side} order beaten — worth moving to ${Math.round(x.newPrice).toLocaleString('en-US')} ISK (costs ${iskBig(x.cost)}).` });
        } else if (x.verdict === 'wait' && x.beaten) {
          findings.push({ kind: 'clearing', key: `clear:${x.orderId}:${x.best}`, isk: x.atRisk, title: ALERT_LABELS.clearing.label, typeId: x.typeId, name: names(x.typeId),
            text: `${names(x.typeId)} ${side} order is beaten, but ${x.why.charAt(0).toLowerCase() + x.why.slice(1)}.` });
        }
      }
    }

    if (ev.squeeze || ev.scam) {
      const types = trackedTypes(d);
      const sig = await readSignals(types);
      if (ev.squeeze) {
        const be2 = breakEvenSpread(r, 2);
        for (const p of d.positions.filter((x) => x.status === 'open')) {
          const s = sig[p.typeId]?.stats;
          if (s && squeezed(s.range7, be2)) {
            const last = s.range7![s.range7!.length - 1];
            findings.push({ kind: 'squeeze', key: `squeeze:${p.id}:${new Date().toISOString().slice(0, 10)}`, title: ALERT_LABELS.squeeze.label, typeId: p.typeId, name: names(p.typeId),
              text: `${names(p.typeId)}: the daily range is down to ${(last * 100).toFixed(1)}%, close to the ${(be2 * 100).toFixed(1)}% you need after fees.` });
          }
        }
      }
      if (ev.scam) {
        for (const id of types) {
          for (const f of sig[id]?.flags ?? []) {
            findings.push({ kind: 'scam', key: `scam:${id}:${f}`, title: ALERT_LABELS.scam.label, typeId: id, name: names(id),
              text: `${names(id)}: ${f === 'escrow' ? 'a bid far above anything paid this month — escrow bait' : f === 'wall' ? 'the best price holds days of the market’s volume — a wall' : 'a recent day traded far above normal at an odd price — a spike'}.` });
          }
        }
      }
    }

    if (ev.pi) {
      const read = await readColonies(60 * 60_000);
      for (const c of read?.colonies ?? []) {
        const sys = read?.systems[c.head.solarSystemId]?.name ?? `Planet ${c.head.planetId}`;
        for (const e of c.extractors) {
          if (e.expiry == null) continue;
          const h = (e.expiry - Date.now()) / 3600_000;
          if (h <= 0) findings.push({ kind: 'pi', key: `pi:${e.pinId}:${e.expiry}:ended`, title: 'PI programme ended', text: `${sys}: an extraction programme has ended. It earns nothing until you reset the heads.` });
          else if (h <= 24) findings.push({ kind: 'pi', key: `pi:${e.pinId}:${e.expiry}:soon`, title: 'PI programme ending', text: `${sys}: an extraction programme ends in ${Math.max(1, Math.round(h))} h.` });
        }
      }
    }

    if (ev.backup) {
      const last = d.meta.lastBackupAt ? Date.parse(d.meta.lastBackupAt) : null;
      const hasData = Object.keys(d.txs).length > 0 || d.positions.length > 0;
      if (hasData && (last == null || Date.now() - last > BACKUP_DAYS * DAY)) {
        findings.push({ kind: 'backup', key: `backup:${new Date().toISOString().slice(0, 10)}`, title: ALERT_LABELS.backup.label,
          text: last == null ? 'You have never exported a backup. ESI only keeps 30 days of wallet history.' : `Your last backup was ${Math.floor((Date.now() - last) / DAY)} days ago.` });
      }
    }

    const cfg = getData().alerts;
    const log = getData().alertLog;
    const now = Date.now();
    const raised = findings.filter((f) => shouldAlert(f, cfg, log, now));
    raised.forEach((f) => raise(f));
    await mailFindings(raised);
  } finally {
    setState({ running: false, lastRun: Date.now() });
  }
}

let tidying = false;

/**
 * Delete old alert mails, on a cadence set by how long they're kept. Runs even with alerts switched
 * off, so mails already sent still go on schedule, but only while there is something of ours to look for.
 */
function tidyMail() {
  const d = getData();
  const keep = d.alerts.mailKeepMin;
  if (tidying || keep == null || !getAuth()) return;
  if (!d.alerts.mail && !d.meta.alertMails?.some((m) => m.char === getAuth()?.characterId)) return;
  const last = d.meta.mailCleanAt ? Date.parse(d.meta.mailCleanAt) : 0;
  if (Date.now() - last < tidyEvery(keep)) return;
  tidying = true;
  cleanupAlertMails()
    .then(() => { if (state.mailError?.startsWith(TIDY_FAILED)) setState({ mailError: null }); })
    .catch((e) => mailFailed(TIDY_FAILED, e))
    .finally(() => { tidying = false; });
}

/** The lock the checking tab holds. Web Locks are shared by every tab of the app, and freed when one closes. */
export const ALERTS_LOCK = 'jita-ledger:alerts';
export const isAlertLeader = () => state.leader;

/**
 * Start watching. Runs a check whenever the interval has passed since the last one.
 *
 * Only one tab watches. Each tab asks for the same lock and the first to get it does the checking; the
 * rest wait in line and one takes over when that tab closes. Two tabs used to raise, and mail, every
 * finding twice, and every click on an alert mail's market link opens another tab.
 */
export function startAlerts(): () => void {
  let stopped = false;
  let release: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let first: ReturnType<typeof setTimeout> | null = null;
  const begin = () => {
    setState({ startedAt: Date.now(), leader: true });
    const tick = () => {
      const cfg = getData().alerts;
      tidyMail();
      if (!cfg.on) return;
      const due = state.lastRun == null || Date.now() - state.lastRun >= cfg.interval * 60_000;
      if (due) runChecks().catch(() => undefined);
    };
    timer = setInterval(tick, 15_000);
    first = setTimeout(tick, 5_000);
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks) {
    // Held for as long as the promise is pending: until this tab stops watching or closes.
    locks.request(ALERTS_LOCK, () => new Promise<void>((resolve) => {
      // Granted after this watcher was already stopped (React runs effects twice in development).
      if (stopped) { resolve(); return; }
      release = resolve;
      begin();
    })).catch(() => undefined);
  } else {
    begin();
  }
  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    if (first) clearTimeout(first);
    if (release) { release(); setState({ leader: false }); }
  };
}

export const EVENT_KEYS: AlertEvent[] = ['move', 'clearing', 'squeeze', 'pi', 'scam', 'backup'];
