import { BellOff, BellRing, Cloud, HardDriveDownload } from 'lucide-react';
import { useAlertRunner, BACKUP_DAYS } from '../../lib/alertsRunner';
import { useAuth, useNow, navigate } from '../../lib/hooks';
import { useOrderCheck } from '../../lib/orderCheck';
import { useData } from '../../lib/store';
import { useSyncState } from '../../lib/sync';
import { cloudCovers, useCloud } from '../../lib/cloud';

/** Each route and how long ESI holds it for, which is what the progress bars measure against. */
const WINDOWS: { key: 'orders' | 'books' | 'transactions' | 'journal' | 'assets' | 'skills'; label: string; secs: number }[] = [
  { key: 'orders', label: 'Your market orders', secs: 1200 },
  { key: 'books', label: 'Order books', secs: 300 },
  { key: 'transactions', label: 'Wallet transactions', secs: 3600 },
  { key: 'journal', label: 'Wallet journal', secs: 3600 },
  { key: 'assets', label: 'Assets', secs: 3600 },
  { key: 'skills', label: 'Skills', secs: 120 },
];

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The strip along the bottom: whether ESI answered, when each kind of data can next change, whether
 * alerts are watching, and a nudge when the backup is old. Ticks every second on its own, so nothing
 * else on the page has to.
 */
export function StatusBar() {
  const now = useNow(1000);
  const d = useData();
  const auth = useAuth();
  const sync = useSyncState();
  const check = useOrderCheck();
  const runner = useAlertRunner();

  const failed = !!(sync.error || d.meta.lastSyncError);
  const esi = !auth ? { c: 'var(--faint)', t: 'Not logged in' } : failed ? { c: 'var(--neg)', t: 'ESI unreachable' } : d.meta.lastSync ? { c: 'var(--pos)', t: 'ESI connected' } : { c: 'var(--acc2)', t: 'Not synced yet' };

  const exp = d.meta.expiries ?? {};
  const at = (k: (typeof WINDOWS)[number]['key']) => (k === 'books' ? check.bookFreshAt : exp[k] ? Date.parse(exp[k]!) : null);
  const rows = WINDOWS.map((w) => {
    const t = at(w.key);
    const left = t == null ? null : Math.max(0, t - now);
    return [w.label, left == null ? '—' : left === 0 ? 'ready' : clock(left), left == null ? 0 : 1 - left / (w.secs * 1000), w.secs >= 3600 ? '60 min' : `${w.secs / 60} min`];
  });
  const ord = at('orders'), trd = at('transactions');
  const refresh = sync.running ? 'now'
    : `orders ${ord ? clock(Math.max(0, ord - now)) : '—'} · trades ${trd ? clock(Math.max(0, trd - now)) : '—'}`;

  const al = d.alerts;
  const next = runner.lastRun == null ? al.interval * 60_000 : Math.max(0, runner.lastRun + al.interval * 60_000 - now);
  const alertText = !al.on ? 'Alerts off'
    : !runner.leader ? 'Alerts in another tab'
    : (window.innerWidth >= 1200 && runner.watching ? `Watching ${runner.watching} orders · next check ` : 'Next check ') + clock(next);

  const last = d.meta.lastBackupAt ? Date.parse(d.meta.lastBackupAt) : null;
  const hasData = Object.keys(d.txs).length > 0 || d.positions.length > 0;
  const backupDays = last == null ? null : Math.floor((now - last) / 86400_000);
  const cloud = useCloud();
  const inCloud = cloudCovers(cloud);
  // With the ledger in the cloud there is nothing to remind about; without it, the old reminder stands.
  const backupOld = hasData && !inCloud && (last == null || now - last > BACKUP_DAYS * 86400_000);

  return (
    <footer className="statusbar">
      <span className="item" style={{ ['--c' as string]: esi.c }}><span className="dot" aria-hidden="true" />{esi.t}</span>
      {auth && (
        <span
          className="item wide-only" style={{ cursor: 'help' }} tabIndex={0}
          data-tip="Each kind of data refreshes on its own timer, set by ESI. The app asks for each one the moment it is ready — new trades appear when the wallet refreshes."
          data-tip-title="ESI refresh timers" data-tip-rows={JSON.stringify(rows)}
        >
          Refresh: {refresh}
        </span>
      )}
      <button type="button" onClick={() => navigate('settings/alerts')} style={{ color: al.on ? 'var(--acc)' : '#90a5b8' }}>
        {al.on ? <BellRing aria-hidden="true" /> : <BellOff aria-hidden="true" />}{alertText}
      </button>
      {backupOld && (
        <button type="button" onClick={() => navigate('settings/data')} style={{ color: 'var(--acc2)' }} title="ESI only keeps about 30 days of wallet history, so this browser is your long-term record">
          <HardDriveDownload aria-hidden="true" />
          <span className="wide-only">{backupDays == null ? 'Never backed up' : `Last backup ${backupDays} days ago`}</span>
        </button>
      )}
      {inCloud && (
        <button type="button" onClick={() => navigate('settings/data')} style={{ color: cloud.phase === 'working' ? 'var(--acc)' : 'var(--pos)' }}
          title="Your ledger is kept in the cloud as well as this browser. Changes go up within seconds; other devices' come down every minute.">
          <Cloud aria-hidden="true" />
          <span className="wide-only">{cloud.phase === 'working' ? 'Syncing' : cloud.pending ? `${cloud.pending} changes to send` : 'Saved to cloud'}</span>
        </button>
      )}
      <span className="fine">{inCloud ? 'Your ledger is kept in your cloud copy' : 'Your data stays in this browser'} · Market data from ESI · Not affiliated with CCP</span>
      <span className="keys wide-only"><span>Ctrl K search</span><span>Esc close</span></span>
    </footer>
  );
}
