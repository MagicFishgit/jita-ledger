import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow, BellRing, Check, CircleDollarSign, GitPullRequestArrow, HardDriveDownload, Keyboard, Leaf, ListChecks, RotateCcw, ShieldAlert, Timer, TrendingDown, TriangleAlert,
} from 'lucide-react';
import { breakEvenSpread, rates } from '../lib/fees';
import { iskBig, units } from '../lib/format';
import { navigate, useAuth, useNow } from '../lib/hooks';
import { openMarketWindow } from '../lib/market';
import { checkOrders, costBasis, jitaOpen, useOrderCheck, verdicts } from '../lib/orderCheck';
import { computePosition } from '../lib/positions';
import { nearMisses, squeezed } from '../lib/signals';
import { exportAll, update, useData } from '../lib/store';
import { KIND_LABEL, MINUTES, orderTonight, summarise, type TonightItem, type TonightKind } from '../lib/tonight';
import { PLANETS_SCOPE, readColonies, useColonies } from '../lib/colonyStore';
import { readSignals, trackedTypes, useSignals } from '../lib/watch';
import { BACKUP_DAYS } from '../lib/alertsRunner';
import { JITA_44 } from '../lib/config';
import { toast } from '../lib/toast';
import { canOpenInGame, downloadText, useTypeName } from './common';
import { cssVars, Empty, Guide, PageHead, Ring } from './ui';

const DAY = 86400_000;
const DONE_KEY = 'jita-ledger:tonight-done';
/** A session's ticks are kept this long, then the list starts clean. */
const DONE_TTL = 12 * 3600_000;

const LOOK: Record<TonightKind, { Icon: typeof Check; c: string; act: string }> = {
  move: { Icon: CircleDollarSign, c: 'var(--acc2)', act: 'Open' },
  close: { Icon: ListChecks, c: 'var(--pos)', act: 'Close' },
  squeeze: { Icon: TrendingDown, c: 'var(--neg)', act: 'Review' },
  piExpired: { Icon: Leaf, c: 'var(--neg)', act: 'Planets' },
  piEnding: { Icon: Leaf, c: 'var(--acc2)', act: 'Planets' },
  nearMiss: { Icon: GitPullRequestArrow, c: 'var(--acc)', act: 'Review' },
  scam: { Icon: ShieldAlert, c: 'var(--neg-l)', act: 'Look' },
  backup: { Icon: HardDriveDownload, c: 'var(--acc2)', act: 'Export' },
};

function readDone(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) ?? 'null') as { at: number; ids: string[] } | null;
    if (v && Date.now() - v.at < DONE_TTL) return new Set(v.ids);
  } catch { /* private window or bad JSON */ }
  return new Set();
}
function saveDone(ids: Set<string>) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify({ at: Date.now(), ids: [...ids] })); } catch { /* private window */ }
}

export function Tonight() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const name = useTypeName();
  const check = useOrderCheck();
  const sig = useSignals();
  const col = useColonies();
  const [done, setDone] = useState<Set<string>>(readDone);
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const r = rates(d.settings);

  // Everything here comes from the shared checks, fetched only when they're missing or old.
  const hasOrders = jitaOpen(d).length > 0;
  useEffect(() => {
    if (auth && hasOrders && (!check.checkedAt || Date.now() - Date.parse(check.checkedAt) > 5 * 60_000)) checkOrders(false).catch(() => undefined);
  }, [auth, hasOrders]); // eslint-disable-line react-hooks/exhaustive-deps
  const tracked = useMemo(() => trackedTypes(d), [d.positions, d.orders, d.watchlist]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tracked.length) readSignals(tracked).catch(() => undefined); }, [tracked.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const canPlanets = (auth?.scopes ?? []).includes(PLANETS_SCOPE);
  useEffect(() => { if (canPlanets) readColonies(60 * 60_000).catch(() => undefined); }, [canPlanets]);

  const items = useMemo(() => {
    const out: TonightItem[] = [];
    // Orders the book says are worth moving.
    for (const x of verdicts(d, check, costBasis(d))) {
      if (x.verdict !== 'move') continue;
      out.push({
        id: `move:${x.orderId}:${x.newPrice}`, kind: 'move', stake: x.atRisk,
        title: `${name(x.typeId)} ${x.isBuy ? 'buy' : 'sell'} order`,
        detail: `Beaten. Move to ${Math.round(x.newPrice).toLocaleString('en-US')} ISK — costs ${iskBig(x.cost)}.`,
        action: { label: 'Open', typeId: x.typeId, route: 'orders' },
      });
    }
    const be2 = breakEvenSpread(r, 2);
    const txs = Object.values(d.txs);
    const nd = new Set(d.nearDone);
    for (const p of d.positions) {
      if (p.status !== 'open') continue;
      const c = computePosition(p, d, d.settings);
      if (c.bought > 0 && c.stock <= 0 && c.sold > 0) {
        out.push({
          id: `close:${p.id}`, kind: 'close', stake: Math.abs(c.realized),
          title: name(p.typeId), detail: `Every unit is sold, ${c.realized >= 0 ? 'for' : 'at'} ${iskBig(c.realized)}${c.realized >= 0 ? ' profit' : ' loss'}. Close it so later trades don’t land in it.`,
          action: { label: 'Close', route: `positions/${p.id}` },
        });
      }
      const s = sig.signals[p.typeId]?.stats;
      if (c.stock > 0 && s && squeezed(s.range7, be2)) {
        const last = s.range7![s.range7!.length - 1];
        out.push({
          id: `squeeze:${p.id}:${new Date(now).toISOString().slice(0, 10)}`, kind: 'squeeze', stake: c.costOfStock,
          title: name(p.typeId), detail: `The daily range is down to ${(last * 100).toFixed(1)}%, close to the ${(be2 * 100).toFixed(1)}% you need after fees. ${units(c.stock)} still in stock.`,
          action: { label: 'Review', route: `positions/${p.id}` },
        });
      }
      const nm = nearMisses(p, txs, d.positions, nd, JITA_44);
      if (nm.length) {
        const v = nm.reduce((t, n) => t + n.tx.qty * n.tx.unitPrice, 0);
        out.push({
          id: `near:${p.id}:${nm.map((n) => n.tx.id).join('.')}`, kind: 'nearMiss', stake: v,
          title: name(p.typeId), detail: `${nm.length} trade${nm.length === 1 ? '' : 's'} just outside this position — before it started, or outside Jita 4-4. Count or ignore ${nm.length === 1 ? 'it' : 'them'}.`,
          action: { label: 'Review', route: `positions/${p.id}` },
        });
      }
    }
    // Colonies: an ended programme earns nothing until the heads are reset.
    for (const c of col.read?.colonies ?? []) {
      const sys = col.read?.systems[c.head.solarSystemId]?.name ?? `Planet ${c.head.planetId}`;
      for (const e of c.extractors) {
        if (e.expiry == null || (e.state !== 'expired' && e.state !== 'endingSoon')) continue;
        const price = e.productTypeId != null ? col.read?.prices[e.productTypeId] ?? 0 : 0;
        const perDay = e.unitsPerHour * 24 * price;
        const product = e.productTypeId != null ? name(e.productTypeId) : 'an extractor';
        out.push({
          id: `pi:${e.pinId}:${e.expiry}`, kind: e.state === 'expired' ? 'piExpired' : 'piEnding', stake: perDay,
          title: `${sys} · ${product}`,
          detail: e.state === 'expired' ? 'The extraction programme has ended. It earns nothing until you reset the heads.' : `The programme ends in ${Math.max(1, Math.round(e.hours))} h. Reset it while you’re on.`,
          action: { label: 'Planets', route: 'hustles/planets' },
        });
      }
    }
    // Suspicious markets on anything you hold, trade or watch. No ISK: there so you don't act on a trap.
    for (const id of tracked) {
      for (const f of sig.signals[id]?.flags ?? []) {
        out.push({
          id: `scam:${id}:${f}`, kind: 'scam', stake: 0, title: name(id),
          detail: f === 'escrow' ? 'A bid far above anything paid this month — escrow bait. Don’t sell into it.' : f === 'wall' ? 'One price holds most of the stock on show — a wall. Don’t chase it.' : 'A recent day traded far above normal at an odd price — a spike. Don’t trust the average.',
          action: { label: 'Look', route: `calculator?type=${id}` },
        });
      }
    }
    const last = d.meta.lastBackupAt ? Date.parse(d.meta.lastBackupAt) : null;
    if ((Object.keys(d.txs).length || d.positions.length) && (last == null || now - last > BACKUP_DAYS * DAY)) {
      out.push({
        id: `backup:${new Date(now).toISOString().slice(0, 10)}`, kind: 'backup', stake: 0, title: 'Export a backup',
        detail: last == null ? 'You’ve never exported one. ESI only keeps 30 days of wallet history; this browser is the record.' : `The last one was ${Math.floor((now - last) / DAY)} days ago. ESI only keeps 30 days of wallet history.`,
        action: { label: 'Export', exportBackup: true },
      });
    }
    return orderTonight(out);
  }, [d, check, sig.signals, col.read, tracked, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const sum = summarise(items, done);
  const toggle = (id: string) => setDone((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveDone(next);
    return next;
  });

  async function act(x: TonightItem) {
    if (x.action.exportBackup) {
      const text = await exportAll();
      const file = `jita-ledger-${new Date().toISOString().slice(0, 10)}.json`;
      downloadText(file, text);
      const at = new Date().toISOString();
      update((y) => ({ meta: { ...y.meta, lastBackupAt: at, backups: [{ at, name: file, bytes: text.length }, ...(y.meta.backups ?? [])].slice(0, 6) } }));
      toast(`Backup saved as ${file}.`);
      toggle(x.id);
      return;
    }
    // A beaten order is fixed in the client: open its market window there when we can.
    if (x.action.typeId != null && canOpenInGame()) {
      try { await openMarketWindow(x.action.typeId); toast('Opened in your client — switch to the game window.', 'info'); return; } catch { /* fall through to the page */ }
    }
    if (x.action.route) navigate(x.action.route);
  }

  // N steps to the next item not yet ticked; Enter opens the selected one.
  const itemsRef = useRef(items); itemsRef.current = items;
  const selRef = useRef(sel); selRef.current = sel;
  const doneRef = useRef(done); doneRef.current = done;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.closest('input,textarea,select,[contenteditable="true"],dialog') || (e.key === 'Enter' && t.closest('button,a'))))) return;
      const list = itemsRef.current;
      if (!list.length) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        for (let k = 1; k <= list.length; k++) {
          const i = (selRef.current + k) % list.length;
          if (!doneRef.current.has(list[i].id)) { setSel(i); return; }
        }
      } else if (e.key === 'Enter') {
        const x = list[selRef.current];
        if (x) { e.preventDefault(); act(x); }
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.querySelector('.tn-item.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  useEffect(() => { if (sel >= items.length) setSel(Math.max(0, items.length - 1)); }, [items.length, sel]);

  const loading = !!check.busy || sig.busy || !!col.busy;

  return (
    <div className="page">
      <PageHead
        kicker="00 · Your session" title="Tonight’s run" wide
        lede={<>Everything worth doing right now, in one list, biggest ISK at stake first. Press <b style={{ color: 'var(--ink)' }}>N</b> to step to the next item and <b style={{ color: 'var(--ink)' }}>Enter</b> to open it.</>}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section className="panel flush" aria-label="Tonight’s list" data-rv="" style={{ flex: '999 1 560px', minWidth: 0 }} ref={listRef}>
          {!items.length ? (
            <Empty icon={loading ? Timer : Check}>
              {loading ? 'Checking your orders, positions and colonies…'
                : !auth ? 'Nothing to do yet. Log in and sync, and anything worth your time — beaten orders, finished positions, expired colonies — lands here.'
                  : 'Nothing needs you right now. Your orders are holding, nothing is squeezed, and your backup is recent.'}
            </Empty>
          ) : items.map((x, i) => {
            const look = LOOK[x.kind];
            const isDone = done.has(x.id);
            return (
              <div key={x.id} className={'tn-item' + (i === sel ? ' sel' : '') + (isDone ? ' done' : '')} onClick={() => setSel(i)} style={cssVars({ '--c': look.c })}>
                <button type="button" className="tn-box" role="checkbox" aria-checked={isDone} aria-label={`Done: ${x.title}`} onClick={(e) => { e.stopPropagation(); toggle(x.id); }}><Check aria-hidden="true" /></button>
                <span className="tn-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="tn-ic"><look.Icon aria-hidden="true" /></span>
                <span style={{ minWidth: 0 }}>
                  <span className="tn-kind" style={{ display: 'block' }}>{KIND_LABEL[x.kind]}</span>
                  <span className="tn-title" style={{ display: 'block' }}>{x.title}</span>
                  <span className="tn-detail" style={{ display: 'block' }}>{x.detail}</span>
                </span>
                <span className="tn-right">
                  <span className="tn-stake">
                    <span className="v" style={{ display: 'block' }}>{x.stake > 0 ? iskBig(x.stake) : x.kind === 'scam' ? 'A trap' : '–'}</span>
                    <span className="m" style={{ display: 'block' }}>{MINUTES[x.kind] ? `~${MINUTES[x.kind]} min` : 'a glance'}</span>
                  </span>
                  <button type="button" className="btn sm" onClick={(e) => { e.stopPropagation(); setSel(i); act(x); }}>{x.action.label}</button>
                </span>
              </div>
            );
          })}
        </section>
        <aside className="panel" data-rv="" aria-label="Progress" style={{ flex: '1 1 260px', maxWidth: 360, gap: 14, position: 'sticky', top: 0 }}>
          <div style={{ margin: '0 auto' }}>
            <Ring frac={sum.frac} color="var(--pos)" r={62}>
              <div style={{ textAlign: 'center' }}>
                <div className="mono" style={{ fontSize: 30, color: 'var(--ink)' }}>{sum.left}</div>
                <div className="lbl" style={{ fontSize: 10 }}>left of {items.length}</div>
              </div>
            </Ring>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'center' }}>
            <div><div className="lbl">Time</div><div className="mono" style={{ fontSize: 17, color: 'var(--ink)', marginTop: 3 }}>~{sum.minutes} min</div></div>
            <div><div className="lbl">At stake</div><div className="mono" style={{ fontSize: 17, color: 'var(--acc2)', marginTop: 3, whiteSpace: 'nowrap' }}>{iskBig(sum.stake).replace(' ISK', '')}</div></div>
          </div>
          {items.length > 0 && sum.left === 0 && <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--pos)' }}>All done. Fly safe.</p>}
          <div className="row tight" style={{ justifyContent: 'center', fontSize: 12, color: 'var(--note)' }}>
            <kbd className="kbd">N</kbd>next<kbd className="kbd">Enter</kbd>open
          </div>
          {loading && <p className="note small" style={{ textAlign: 'center' }}>Still checking — more may appear.</p>}
          <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => { setDone(new Set()); saveDone(new Set()); setSel(0); if (auth && hasOrders) checkOrders(true).catch(() => undefined); }}>
            <RotateCcw aria-hidden="true" />Reset the list
          </button>
          <p className="note small">Minutes are a rough guide per kind of task, not measured. At stake is the order’s value, the stock a squeeze puts at risk, or a day of a colony’s output.</p>
        </aside>
      </div>
      <Guide
        title="How to use Tonight’s run"
        intro="This is your session in one list. Instead of visiting ten pages, work down it from the top — it’s sorted so the things with the most ISK at stake come first."
        steps={[
          { icon: ArrowDownWideNarrow, title: 'Start at the top', body: 'The first items carry the most ISK. If you only have ten minutes, the top three are usually most of the value.' },
          { icon: Keyboard, title: 'Use N and Enter', body: 'Press N to move to the next item and Enter to open it — a beaten order opens straight into its market window in your client when you’ve granted that permission.' },
          { icon: Check, title: 'Tick things off', body: 'Ticking an item doesn’t change anything in game; it just keeps your place. Reset the list next session and it rebuilds from fresh data.' },
          { icon: Timer, title: 'Mind the time estimate', body: 'Each item shows roughly how long it takes. The ring shows what’s left, so you can decide when to stop.' },
        ]}
        habits={[
          { icon: BellRing, title: 'Pair it with alerts', body: 'Undercut alerts tell you when something new lands here while you’re doing other things.' },
          { icon: TriangleAlert, title: 'Warnings aren’t chores', body: 'Suspicious-market items have no ISK at stake — they’re there so you don’t act on a trap.', color: 'var(--acc2)' },
        ]}
      />
    </div>
  );
}
