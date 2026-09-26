import { useState } from 'react';
import { ChevronRight, LogIn, Search } from 'lucide-react';
import { isConfigured, login } from '../../lib/auth';
import { ago } from '../../lib/format';
import { useAuth, useNow } from '../../lib/hooks';
import { useData } from '../../lib/store';
import { syncCharacter, useSyncState } from '../../lib/sync';
import { toast } from '../../lib/toast';

const pad = (n: number) => String(n).padStart(2, '0');

/** EVE time is UTC, and the calendar is Yoke City: year 1898 is YC0. Ticks on its own. */
function EveClock() {
  const now = useNow(1000);
  const d = new Date(now);
  return (
    <div className="eve-clock wide-only">
      <div className="k">EVE TIME · YC{d.getUTCFullYear() - 1898} {pad(d.getUTCMonth() + 1)}.{pad(d.getUTCDate())}</div>
      <div className="v">{pad(d.getUTCHours())}:{pad(d.getUTCMinutes())}:{pad(d.getUTCSeconds())}</div>
    </div>
  );
}

export function TopBar({ group, title, onPalette }: { group: string; title: string; onPalette: () => void }) {
  const d = useData();
  const auth = useAuth();
  const sync = useSyncState();
  const now = useNow(15_000);
  const [imgOk, setImgOk] = useState(true);
  const alpha = d.settings.clone === 'alpha';
  const failed = !sync.running && !!(sync.error || d.meta.lastSyncError);

  return (
    <header className="topbar">
      <div className="crumbs">
        <div className="station-line wide-only">Jita IV · Moon 4 · Caldari Navy Assembly Plant</div>
        <div className="crumb"><span className="grp">{group}</span><ChevronRight aria-hidden="true" /><span className="pg">{title}</span></div>
      </div>
      <button type="button" className="palette-btn" onClick={onPalette} aria-label="Find an item or jump to a page (Ctrl K)">
        <Search aria-hidden="true" />
        <span className="ph">Find an item or jump to a page…</span>
        <span className="kbd">Ctrl K</span>
      </button>
      <div className="top-right">
        <EveClock />
        <div className="vsep wide-only" />
        {auth ? (
          <button
            type="button" className="sync-btn" disabled={sync.running} onClick={() => syncCharacter()}
            title={failed ? `The last sync failed: ${sync.error ?? d.meta.lastSyncError}` : 'Sync with ESI now'}
          >
            <span className="sync-dot" aria-hidden="true" style={{ ['--c' as string]: failed ? 'var(--neg)' : 'var(--pos)' }}>
              {sync.running ? <span className="spin" /> : <><span className="ok" /><span className="ok-ring" /></>}
            </span>
            <span className="sync-text mid-only" aria-live="polite">
              <span className="k">{sync.running ? 'Syncing' : failed ? 'Sync failed' : 'Synced'}</span>
              <span className="v">{sync.running ? sync.message : d.meta.lastSync ? ago(d.meta.lastSync, now) : 'not yet'}</span>
            </span>
          </button>
        ) : isConfigured() ? (
          <button type="button" className="btn primary sm" onClick={() => login().catch((e) => toast(String(e.message ?? e), 'err'))}>
            <LogIn aria-hidden="true" />Log in
          </button>
        ) : null}
        {auth && d.meta.walletBalance != null && (
          <div className="wallet-top wide-only">
            <div className="k">WALLET</div>
            <div className="v">{Math.round(d.meta.walletBalance).toLocaleString('en-US')} ISK</div>
          </div>
        )}
        {auth && (
          <div className="pilot">
            <div className="avatar">
              {imgOk && <img src={`https://images.evetech.net/characters/${auth.characterId}/portrait?size=64`} alt="" onError={() => setImgOk(false)} />}
              <span className="clone-tag" style={{ background: alpha ? 'var(--acc2)' : 'var(--acc)' }} aria-label={alpha ? 'Alpha clone' : 'Omega clone'}>{alpha ? 'α' : 'Ω'}</span>
            </div>
            <div className="wide-only" style={{ lineHeight: 1.15 }}>
              <div className="pilot-name">{auth.characterName}</div>
              <div className="pilot-sub">Caldari Navy · {d.settings.corp.toFixed(1)} standing</div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
