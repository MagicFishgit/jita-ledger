import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { handleCallback } from './lib/auth';
import { getData, initStore, update, useData } from './lib/store';
import { syncCharacter, useSyncState } from './lib/sync';
import { dueForSync } from './lib/schedule';
import { onLeave, useAuth, useRoute } from './lib/hooks';
import { bumpWarp, useMotion } from './lib/motion';
import { THEMES } from './lib/prefs';
import { priceKillmails } from './lib/killmails';
import { startAlerts } from './lib/alertsRunner';
import { toast } from './lib/toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Rail } from './components/shell/Rail';
import { TopBar } from './components/shell/TopBar';
import { StatusBar } from './components/shell/StatusBar';
import { Starfield } from './components/shell/Starfield';
import { TipLayer } from './components/shell/TipLayer';
import { Toasts } from './components/shell/Toasts';
import { Palette } from './components/shell/Palette';
import { pageOf, type PageKey } from './components/shell/nav';
import { Wallet } from './components/Wallet';
import { Tonight } from './components/Tonight';
import { Calculator } from './components/Calculator';
import { Prospects } from './components/Prospects';
import { Watchlist } from './components/Watchlist';
import { Planner } from './components/Planner';
import { Arbitrage } from './components/Arbitrage';
import { Positions } from './components/Positions';
import { PositionDetail } from './components/PositionDetail';
import { Orders } from './components/Orders';
import { Results } from './components/Results';
import { Loyalty } from './components/Loyalty';
import { SideHustles } from './components/SideHustles';
import { Combat } from './components/Combat';
import { Omega } from './components/Omega';
import { Settings } from './components/Settings';
import { Notice } from './components/ui';

const RAIL_KEY = 'jita-ledger:rail';
const PAGES = new Set<string>(['wallet', 'tonight', 'calculator', 'prospects', 'watchlist', 'planner', 'arbitrage', 'positions', 'orders', 'results', 'loyalty', 'hustles', 'combat', 'omega', 'settings']);

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
  const [railOpen, setRailOpen] = useState(readRail);
  const [palette, setPalette] = useState(false);
  const auth = useAuth();
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
    if (!ready || !auth) return;
    const tick = () => { if (dueForSync(getData().meta)) syncCharacter(); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [ready, auth?.characterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A finished sync may have brought killmails that have never been priced. Price each one once.
  useEffect(() => {
    if (!ready || sync.running) return;
    if (Object.values(d.killmails).some((k) => !k.value)) priceKillmails().catch(() => undefined);
  }, [ready, sync.running, d.killmails]);

  // Say what a finished sync brought, once, without a page having to.
  const lastAdded = useRef<number | null>(null);
  useEffect(() => {
    if (sync.running || sync.lastAdded == null || lastAdded.current === sync.lastAdded) return;
    lastAdded.current = sync.lastAdded;
    if (sync.lastAdded > 0) toast(`Synced. ${sync.lastAdded} new trade${sync.lastAdded === 1 ? '' : 's'} from your wallet.`);
  }, [sync.running, sync.lastAdded]);
  useEffect(() => { if (sync.error) toast(`Sync failed: ${sync.error}`, 'err'); }, [sync.error]);

  useEffect(() => { if (ready) return startAlerts(); }, [ready]);

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
            {loginErr && <div style={{ marginBottom: 14 }}><Notice kind="err">{loginErr}</Notice></div>}
            {mismatch && (
              <div style={{ marginBottom: 14 }}>
                <Notice kind="warn">This browser holds trades synced from a different character. Positions track one character at a time, so mixed data may not add up.</Notice>
              </div>
            )}
            {!ready ? null
              : page === 'wallet' ? <Wallet />
              : page === 'tonight' ? <Tonight />
              : page === 'calculator' ? <Calculator route={route} />
              : page === 'prospects' ? <Prospects />
              : page === 'watchlist' ? <Watchlist />
              : page === 'planner' ? <Planner />
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
          </div>
        </main>
        <StatusBar />
      </div>
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
