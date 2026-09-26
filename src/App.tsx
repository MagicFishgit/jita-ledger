import { useEffect, useMemo, useState } from 'react';
import { handleCallback, isConfigured, login } from './lib/auth';
import { initStore, useData } from './lib/store';
import { syncCharacter, useSyncState } from './lib/sync';
import { dueForSync } from './lib/schedule';
import { unassigned } from './lib/positions';
import { ago } from './lib/format';
import { useAuth, useNow, useRoute } from './lib/hooks';
import { APP_NAME } from './lib/config';
import { Calculator } from './components/Calculator';
import { Prospects } from './components/Prospects';
import { Watchlist } from './components/Watchlist';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Orders } from './components/Orders';
import { Positions } from './components/Positions';
import { PositionDetail } from './components/PositionDetail';
import { Inbox } from './components/Inbox';
import { Settings } from './components/Settings';
import { Omega } from './components/Omega';
import { Loyalty } from './components/Loyalty';
import { SideHustles } from './components/SideHustles';



export function App() {
  const [ready, setReady] = useState(false);
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const auth = useAuth();
  const route = useRoute();
  const sync = useSyncState();
  const now = useNow();
  const d = useData();

  useEffect(() => {
    (async () => {
      const cb = await handleCallback();
      if (cb.error) setLoginErr(cb.error);
      await initStore();
      setReady(true);
    })();
  }, []);

  // Sync when ESI's cache actually lets go, checked once a minute. Asking sooner just returns the
  // same cached body, and the old fixed 15-minute poll could land up to 15 minutes late on top of
  // the hour ESI holds wallet transactions for.
  useEffect(() => {
    if (!ready || !auth) return;
    const tick = () => { if (dueForSync(d.meta)) syncCharacter(); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [ready, auth?.characterId, d.meta.lastSync, d.meta.nextSyncAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const inboxCount = useMemo(() => (ready ? unassigned(d).length : 0), [ready, d]);
  const page = route.path[0];
  const mismatch = auth && d.meta.syncedCharacterId && d.meta.syncedCharacterId !== auth.characterId;

  const nav: [string, string][] = [
    ['calculator', 'Calculator'], ['prospects', 'Prospects'], ['watchlist', 'Watchlist'], ['positions', 'Positions'], ['orders', 'Orders'], ['inbox', 'Inbox'], ['loyalty', 'Loyalty'], ['hustles', 'Side hustles'], ['omega', 'Omega'], ['settings', 'Settings'],
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <p className="brand">{APP_NAME}</p>
          <nav className="nav" aria-label="Main">
            {nav.map(([key, label]) => (
              <a key={key} href={`#/${key}`} aria-current={page === key ? 'page' : undefined}>
                {label}
                {key === 'inbox' && inboxCount > 0 && <span className="count" aria-label={`${inboxCount} new`}>{inboxCount > 99 ? '99+' : inboxCount}</span>}
              </a>
            ))}
          </nav>
          <div className="account">
            {auth ? (
              <>
                <img src={`https://images.evetech.net/characters/${auth.characterId}/portrait?size=64`} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <div className="who">
                  {auth.characterName} <span className="muted small">{d.settings.clone === 'alpha' ? 'Alpha' : 'Omega'}</span>
                  <small aria-live="polite">
                    {sync.running ? <><span className="spinner" aria-hidden="true" />{sync.message}</> : sync.error ? <span className="neg">Sync failed</span> : `Synced ${ago(d.meta.lastSync, now)}`}
                  </small>
                </div>
                <button className="btn btn-small" disabled={sync.running} onClick={() => syncCharacter()}>Sync</button>
              </>
            ) : isConfigured() ? (
              <button className="btn btn-small btn-primary" onClick={() => login().catch((e) => setLoginErr(String(e.message ?? e)))}>Log in with EVE Online</button>
            ) : null}
          </div>
        </div>
      </header>

      {loginErr && <div className="page" style={{ paddingBottom: 0 }}><p className="notice err" role="alert">{loginErr}</p></div>}
      {mismatch && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <p className="notice warn">This browser holds trades synced from a different character. Positions track one character at a time, so mixed data may not add up.</p>
        </div>
      )}

      {!ready ? (
        <div className="page"><p className="muted"><span className="spinner" aria-hidden="true" />Loading your ledger…</p></div>
      ) : page === 'prospects' ? <Prospects />
        : page === 'watchlist' ? <Watchlist />
        : page === 'positions' && route.path[1] ? <PositionDetail id={route.path[1]} />
        : page === 'orders' ? <Orders />
        : page === 'positions' ? <Positions />
        : page === 'inbox' ? <Inbox />
        : page === 'loyalty' ? <Loyalty />
        : page === 'hustles' ? <SideHustles route={route} />
        : page === 'omega' ? <Omega />
        : page === 'settings' ? <Settings />
        : <Calculator route={route} />}

      <ConfirmDialog />

      <footer className="foot">
        <p>Your data stays in this browser. Market data from ESI. Not affiliated with EVE Online’s developer; EVE Online and related materials belong to their owner.</p>
      </footer>
    </>
  );
}
