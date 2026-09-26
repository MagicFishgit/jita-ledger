import { useSyncExternalStore } from 'react';
import { getAuth } from './auth';
import { ALERT_LABELS, shouldAlert, type Finding } from './alerts';
import { readColonies } from './colonyStore';
import { breakEvenSpread, rates } from './fees';
import { iskBig } from './format';
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

type State = { startedAt: number; lastRun: number | null; running: boolean; watching: number };
let state: State = { startedAt: Date.now(), lastRun: null, running: false, watching: 0 };
const listeners = new Set<() => void>();
const setState = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export function useAlertRunner(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

const DAY = 86400_000;
export const BACKUP_DAYS = 14;

function raise(f: Finding, test = false) {
  const entry: AlertLogEntry = { at: new Date().toISOString(), kind: f.kind, key: f.key, title: f.title, text: f.text, test: test || undefined };
  update((d) => ({ alertLog: [entry, ...d.alertLog].slice(0, 200) }));
  // The system notification rides on the toast, so it queues and times out by the same settings.
  const cfg = getData().alerts;
  toast((test ? 'Test alert — ' : '') + f.text, f.kind === 'move' || f.kind === 'scam' || f.kind === 'squeeze' ? 'warn' : 'info',
    { system: cfg.browser ? { title: `Jita Ledger · ${f.title}`, tag: f.key } : undefined });
}

export function testAlert() {
  raise({ kind: 'move', key: 'test', title: ALERT_LABELS.move.label, text: 'This is how an order worth moving will be announced.' }, true);
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
          findings.push({ kind: 'move', key: `move:${x.orderId}:${x.newPrice}`, isk: x.atRisk, title: ALERT_LABELS.move.label,
            text: `${names(x.typeId)} ${side} order beaten — worth moving to ${Math.round(x.newPrice).toLocaleString('en-US')} ISK (costs ${iskBig(x.cost)}).` });
        } else if (x.verdict === 'wait' && x.beaten) {
          findings.push({ kind: 'clearing', key: `clear:${x.orderId}:${x.best}`, isk: x.atRisk, title: ALERT_LABELS.clearing.label,
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
            findings.push({ kind: 'squeeze', key: `squeeze:${p.id}:${new Date().toISOString().slice(0, 10)}`, title: ALERT_LABELS.squeeze.label,
              text: `${names(p.typeId)}: the daily range is down to ${(last * 100).toFixed(1)}%, close to the ${(be2 * 100).toFixed(1)}% you need after fees.` });
          }
        }
      }
      if (ev.scam) {
        for (const id of types) {
          for (const f of sig[id]?.flags ?? []) {
            findings.push({ kind: 'scam', key: `scam:${id}:${f}`, title: ALERT_LABELS.scam.label,
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
    for (const f of findings) if (shouldAlert(f, cfg, log, now)) raise(f);
  } finally {
    setState({ running: false, lastRun: Date.now() });
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start watching. Runs a check whenever the interval has passed since the last one. */
export function startAlerts(): () => void {
  if (timer) return () => undefined;
  setState({ startedAt: Date.now() });
  const tick = () => {
    const cfg = getData().alerts;
    if (!cfg.on) return;
    const due = state.lastRun == null || Date.now() - state.lastRun >= cfg.interval * 60_000;
    if (due) runChecks().catch(() => undefined);
  };
  timer = setInterval(tick, 15_000);
  setTimeout(tick, 5_000);
  return () => { if (timer) clearInterval(timer); timer = null; };
}

export const EVENT_KEYS: AlertEvent[] = ['move', 'clearing', 'squeeze', 'pi', 'scam', 'backup'];
