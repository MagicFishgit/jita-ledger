import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { getAuth, handleCallback, logout } from './lib/auth';
import { isOwner } from './lib/constants';
import { getData, initStore, update, useData } from './lib/store';
import { refreshBalance, syncCharacter, useSyncState } from './lib/sync';
import { dueForSync } from './lib/schedule';
import { onLeave, useAuth, useRoute } from './lib/hooks';
import { bumpWarp, useMotion } from './lib/motion';
import { THEMES } from './lib/prefs';
import { priceKillmails } from './lib/killmails';
import { startAlerts } from './lib/alertsRunner';
import { keepCloudLogin, startCloud } from './lib/cloud';
import { marketParam, openFromLink, withoutMarket } from './lib/marketLink';
import { setToastLife, toast } from './lib/toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Rail } from './components/shell/Rail';
import { TopBar } from './components/shell/TopBar';
import { StatusBar } from './components/shell/StatusBar';
import { Starfield } from './components/shell/Starfield';
import { TipLayer } from './components/shell/TipLayer';
import { Toasts } from './components/shell/Toasts';
import { Palette } from './components/shell/Palette';
import { pageOf, type PageKey } from './components/shell/nav';
import { Notice } from './components/ui';
import { Landing } from './components/Landing';
import { PullToRefresh } from './components/shell/PullToRefresh';
import { startVersionCheck, useNewerVersion } from './lib/version';
import { reloadApp } from './lib/reload';
import { PageBoundary } from './components/shell/PageBoundary';

/**
 * Each page's code is fetched when it's first opened, so starting the app downloads the shell and the page you land
 * on rather than all sixteen. Once the app is idle the rest are fetched in the background, so moving to another page
 * is still instant.
 */
const loaders: (() => Promise<unknown>)[] = [];
function page<P>(load: () => Promise<Record<string, unknown>>, name: string) {
  const get = () => load().then((m) => {
    try { sessionStorage.removeItem(RELOADED_KEY); } catch { /* storage blocked */ }
    return { default: m[name] as ComponentType<P> };
  }, (e) => {
    // A deploy while the tab was open renames every page's file, so one not fetched yet is gone: load the new
    // version of the app, once. A second failure is real and shows in the page's error box.
    try {
      if (!sessionStorage.getItem(RELOADED_KEY)) { sessionStorage.setItem(RELOADED_KEY, '1'); void reloadApp(); return new Promise<never>(() => {}); }
    } catch { /* storage blocked: show the error */ }
    throw e;
  });
  loaders.push(load);
  return lazy(get);
}
const RELOADED_KEY = 'jita-ledger:reloaded-for-pages';
const Wallet = page<object>(() => import('./components/Wallet'), 'Wallet');
const Todo = page<object>(() => import('./components/Todo'), 'Todo');
const Calculator = page<{ route: ReturnType<typeof useRoute> }>(() => import('./components/Calculator'), 'Calculator');
const Prospects = page<object>(() => import('./components/Prospects'), 'Prospects');
const Watchlist = page<object>(() => import('./components/Watchlist'), 'Watchlist');
const Planner = page<object>(() => import('./components/Planner'), 'Planner');
const Sniper = page<object>(() => import('./components/Sniper'), 'Sniper');
const Arbitrage = page<object>(() => import('./components/Arbitrage'), 'Arbitrage');
const Positions = page<object>(() => import('./components/Positions'), 'Positions');
const PositionDetail = page<{ id: string }>(() => import('./components/PositionDetail'), 'PositionDetail');
const Orders = page<object>(() => import('./components/Orders'), 'Orders');
const Results = page<object>(() => import('./components/Results'), 'Results');
const Loyalty = page<object>(() => import('./components/Loyalty'), 'Loyalty');
const SideHustles = page<{ route: ReturnType<typeof useRoute> }>(() => import('./components/SideHustles'), 'SideHustles');
const Combat = page<object>(() => import('./components/Combat'), 'Combat');
const Omega = page<object>(() => import('./components/Omega'), 'Omega');
const Settings = page<{ route: ReturnType<typeof useRoute> }>(() => import('./components/Settings'), 'Settings');

/** Fetches every page's code once the app has settled, so a click never waits for a download. */
function prefetchPages() {
  const run = () => { for (const l of loaders) l().catch(() => undefined); };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 5000 }); else setTimeout(run, 2000);
}

/** Local testing against a local Worker stands in a character for the login; a real build never sets this. */
const DEV_OWNER = !!import.meta.env.VITE_CLOUD_DEV_TOKEN;

const RAIL_KEY = 'jita-ledger:rail';
const PAGES = new Set<string>(['wallet', 'todo', 'calculator', 'prospects', 'watchlist', 'planner', 'arbitrage', 'sniper', 'positions', 'orders', 'results', 'loyalty', 'hustles', 'combat', 'omega', 'settings']);

function readRail(): boolean {
  try {
    const v = localStorage.getItem(RAIL_KEY);
    if (v != null) return v === '1';
  } catch { /* private window */ }
  return window.innerWidth >= 1180;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [booted, setBooted] = useState(false);
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(readRail);
  const [palette, setPalette] = useState(false);
  const auth = useAuth();
  // The app is the owner's alone: anyone else gets the landing page, and nothing below runs for them.
  const owner = DEV_OWNER || isOwner(auth?.characterId);
  const live = ready && owner;
  const newer = useNewerVersion();
  const route = useRoute();
  const sync = useSyncState();
  const d = useData();
  const motion = useMotion();
  const content = useRef<HTMLDivElement>(null);
  const sweep = useRef<HTMLDivElement>(null);
  const motionRef = useRef(motion);
  motionRef.current = motion;

  const page: PageKey = PAGES.has(route.path[0]) ? (route.path[0] as PageKey) : 'wallet';
  const detailId = page === 'positions' ? route.path[1] : undefined;
  const routeKey = route.path.slice(0, page === 'positions' ? 2 : 1).join('/');

  useEffect(() => {
    const started = Date.now();
    (async () => {
      const cb = await handleCallback();
      if (cb.error) setLoginErr(cb.error);
      // Only the owner's character may use this ledger: anyone else who logs in is logged straight out again.
      const who = getAuth();
      if (who && !isOwner(who.characterId)) { setRefused(who.characterName); await logout(); }
      // A login for the cloud's background jobs goes straight to the Worker; nothing stays here.
      if (cb.cloudKey) {
        keepCloudLogin(cb.cloudKey)
          .then((k) => toast(cb.cloudKey!.purpose === 'main' ? `The cloud now keeps watch as ${k.name}, with this app closed too.` : `The cloud will send alert mail from ${k.name}.`))
          .catch((e) => toast(`The cloud couldn’t keep that login: ${e instanceof Error ? e.message : String(e)}`, 'err'));
      }
      await initStore();
      // "Since your last visit" is measured from when the app was last open, not from this minute.
      const seen = getData().meta.lastSeenAt;
      update((x) => ({ meta: { ...x.meta, prevVisitAt: seen && Date.now() - Date.parse(seen) > 10 * 60_000 ? seen : x.meta.prevVisitAt, lastSeenAt: new Date().toISOString() } }));
      setReady(true);
      // Let the boot bar finish its run when motion is on; there is no point holding it otherwise.
      const hold = motionRef.current === 'Full' ? Math.max(0, 1150 - (Date.now() - started)) : 0;
      setTimeout(() => setBooted(true), hold);
    })();
  }, []);

  // Keep "last seen" current while the app is open, so the next visit knows where it left off.
  useEffect(() => {
    if (!ready) return;
    const mark = () => update((x) => ({ meta: { ...x.meta, lastSeenAt: new Date().toISOString() } }));
    const id = setInterval(mark, 5 * 60_000);
    const onHide = () => { if (document.hidden) mark(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); };
  }, [ready]);

  // The faction theme is two colours on the root; everything tinted is mixed from them.
  useEffect(() => {
    const [a, b] = THEMES[d.prefs.theme] ?? THEMES.Caldari;
    const root = document.documentElement;
    root.style.setProperty('--acc', a);
    root.style.setProperty('--acc2', b);
    root.dataset.motion = motion;
  }, [d.prefs.theme, motion]);

  useEffect(() => {
    try { localStorage.setItem(RAIL_KEY, railOpen ? '1' : '0'); } catch { /* private window */ }
    window.dispatchEvent(new CustomEvent('jl-rail-state', { detail: railOpen }));
  }, [railOpen]);
  // Settings → Appearance flips the same preference from outside the shell.
  useEffect(() => {
    const on = () => setRailOpen(readRail());
    window.addEventListener('jl-rail', on);
    return () => window.removeEventListener('jl-rail', on);
  }, []);
  // The rail folds itself away when the window gets narrow; widening again leaves it as you set it.
  useEffect(() => {
    const on = () => { if (window.innerWidth < 1180) setRailOpen(false); };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // How long toasts stay is a setting; the toast queue lives outside React, so tell it.
  useEffect(() => { setToastLife(d.prefs.toastSeconds); }, [d.prefs.toastSeconds]);

  // Ctrl/Cmd K opens the palette from anywhere.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // Sync when ESI's cache actually lets go, checked once a minute. Asking sooner just returns the
  // same cached body, and the old fixed 15-minute poll could land up to 15 minutes late on top of the
  // hour ESI holds wallet transactions for.
  useEffect(() => {
    if (!live || !auth) return;
    const tick = () => { if (dueForSync(getData().meta)) syncCharacter(); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [live, auth?.characterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The header's wallet is your ISK in game: ESI renews the balance every 2 minutes, so it's read that often while
  // the tab is in view, apart from the full sync (orders and trades are due far less often).
  useEffect(() => {
    if (!live || !auth) return;
    const tick = () => { if (document.visibilityState === 'visible') refreshBalance().catch(() => undefined); };
    const id = setInterval(tick, 120_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [live, auth?.characterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A finished sync may have brought killmails that have never been priced. Price each one once.
  useEffect(() => {
    if (!live || sync.running) return;
    if (Object.values(d.killmails).some((k) => !k.value)) priceKillmails().catch(() => undefined);
  }, [live, sync.running, d.killmails]);

  // Say what a finished sync brought, once, without a page having to.
  const lastAdded = useRef<number | null>(null);
  useEffect(() => {
    if (sync.running || sync.lastAdded == null || lastAdded.current === sync.lastAdded) return;
    lastAdded.current = sync.lastAdded;
    if (sync.lastAdded > 0) toast(`Synced. ${sync.lastAdded} new trade${sync.lastAdded === 1 ? '' : 's'} from your wallet.`);
  }, [sync.running, sync.lastAdded]);
  useEffect(() => { if (sync.error) toast(`Sync failed: ${sync.error}`, 'err'); }, [sync.error]);

  // A newer version of the app going live: noticed, and loaded without interrupting anything (version.ts).
  useEffect(() => startVersionCheck(), []);
  useEffect(() => { if (live) return startAlerts(); }, [live]);
  useEffect(() => { if (live) prefetchPages(); }, [live]);
  // The cloud copy of the ledger: sent as it changes, pulled every minute, restored into an empty browser.
  useEffect(() => { if (live) return startCloud(); }, [live]);

  // A market link from an alert mail (`#orders?market=ID`): open that market in the client, once. The
  // request comes off the address first, so a reload or a failure halfway can't open it again; that
  // doesn't fire hashchange, so the ref is what stops React's second run in development.
  const marketDone = useRef<number | null>(null);
  useEffect(() => {
    if (!live) return;
    const id = marketParam(route.query);
    if (id == null || marketDone.current === id) return;
    marketDone.current = id;
    history.replaceState(null, '', withoutMarket(route.path, route.query));
    openFromLink(id).catch(() => undefined);
  }, [live, route]);

  // Page transitions: the old page warps out before the hash changes, the new one warps in.
  useEffect(() => {
    onLeave((done) => {
      const el = content.current;
      const m = motionRef.current;
      if (!el || m === 'Off' || !el.animate) { done(); return; }
      bumpWarp(m === 'Calm' ? 0.5 : 1.3);
      el.animate(
        [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-10px) scale(.985)', filter: m === 'Calm' ? 'none' : 'blur(6px)' }],
        { duration: m === 'Calm' ? 120 : 170, easing: 'ease-in', fill: 'forwards' },
      );
      setTimeout(done, m === 'Calm' ? 125 : 175);
    });
    return () => onLeave(null);
  }, []);

  useLayoutEffect(() => {
    const el = content.current;
    if (!el || !booted) return;
    el.scrollTop = 0;
    const m = motionRef.current;
    if (!el.animate || m === 'Off') { el.getAnimations?.().forEach((a) => a.cancel()); return; }
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      [{ opacity: 0, transform: 'translateY(16px) scale(1.01)', filter: m === 'Calm' ? 'none' : 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
      { duration: m === 'Calm' ? 300 : 440, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    if (m === 'Full') {
      el.querySelectorAll('[data-rv]').forEach((c, i) => {
        if (i > 14) return;
        c.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 70 + i * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      });
      sweep.current?.animate(
        [{ transform: 'translateY(-140px)', opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: 'translateY(100vh)', opacity: 0 }],
        { duration: 750, easing: 'cubic-bezier(.4,0,.2,1)' },
      );
    }
    // Nothing is left half-animated if the page is changed again quickly.
    const t = setTimeout(() => el.getAnimations({ subtree: true }).forEach((a) => { try { a.finish(); } catch { /* already done */ } }), 900);
    return () => clearTimeout(t);
  }, [routeKey, booted]);

  const meta = pageOf(page);
  const crumbTitle = detailId ? d.names[d.positions.find((p) => p.id === detailId)?.typeId ?? -1] ?? 'Position' : meta.label;
  const mismatch = auth && d.meta.syncedCharacterId && d.meta.syncedCharacterId !== auth.characterId;

  if (ready && !owner) {
    return (
      <>
        <Landing refused={refused} error={loginErr} motion={motion} />
        <Toasts size={d.prefs.alertSize} />
      </>
    );
  }

  return (
    <>
      <div className={'hud' + (railOpen ? '' : ' rail-closed')}>
        <div className="hud-nebula" aria-hidden="true" />
        <Starfield motion={motion} />
        <div className="hud-grid" aria-hidden="true" />
        <Rail page={page} open={railOpen} onToggle={() => setRailOpen((o) => !o)} badges={{}} />
        <TopBar group={detailId ? 'Ledger' : meta.group} title={crumbTitle} onPalette={() => setPalette(true)} />
        <main className="main">
          <div className="sweep" ref={sweep} aria-hidden="true" />
          <div className="content" ref={content} id="content" tabIndex={-1}>
            {newer && (
              <div style={{ marginBottom: 14 }}>
                <Notice kind="info">
                  A new version of Jita Ledger is out.{' '}
                  <button type="button" className="link-btn" onClick={() => void reloadApp()}>Reload now</button>, or it loads by itself when you next leave this tab.
                </Notice>
              </div>
            )}
            {loginErr && <div style={{ marginBottom: 14 }}><Notice kind="err">{loginErr}</Notice></div>}
            {mismatch && (
              <div style={{ marginBottom: 14 }}>
                <Notice kind="warn">This browser holds trades synced from a different character. Positions track one character at a time, so mixed data may not add up.</Notice>
              </div>
            )}
            <PageBoundary key={routeKey}>
            <Suspense fallback={<div className="page" />}>
            {!ready ? null
              : page === 'wallet' ? <Wallet />
              : page === 'todo' ? <Todo />
              : page === 'calculator' ? <Calculator route={route} />
              : page === 'prospects' ? <Prospects />
              : page === 'watchlist' ? <Watchlist />
              : page === 'planner' ? <Planner />
              : page === 'sniper' ? <Sniper />
              : page === 'arbitrage' ? <Arbitrage />
              : page === 'positions' && detailId ? <PositionDetail id={detailId} />
              : page === 'positions' ? <Positions />
              : page === 'orders' ? <Orders />
              : page === 'results' ? <Results />
              : page === 'loyalty' ? <Loyalty />
              : page === 'hustles' ? <SideHustles route={route} />
              : page === 'combat' ? <Combat />
              : page === 'omega' ? <Omega />
              : <Settings route={route} />}
            </Suspense>
            </PageBoundary>
          </div>
        </main>
        <StatusBar />
      </div>
      <PullToRefresh target={content} />
      <TipLayer routeKey={routeKey} />
      <Toasts size={d.prefs.alertSize} />
      <Palette open={palette} onClose={() => setPalette(false)} />
      <ConfirmDialog />
      {!booted && (
        <div className="boot" role="status" aria-label="Loading your ledger">
          <div>
            <div className="boot-name">JITA LEDGER</div>
            <div className="boot-bar"><div /></div>
            <div className="boot-msg">Loading your ledger…</div>
          </div>
        </div>
      )}
    </>
  );
}
