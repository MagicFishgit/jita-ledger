import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, BellRing, Check, CheckCheck, CircleDollarSign, CircleX, GitPullRequestArrow, HardDriveDownload, Keyboard, Leaf, ListChecks, RefreshCw, RotateCcw, ShieldAlert, Timer, TrendingDown, TriangleAlert } from 'lucide-react';
import { getAuth } from '../lib/auth';
import { breakEvenSpread, rates } from '../lib/fees';
import { ago, iskBig, units } from '../lib/format';
import { navigate, useAuth, useNow } from '../lib/hooks';
import { openMarketWindow } from '../lib/market';
import { checkOrders, costBasis, getOrderCheck, jitaOpen, useOrderCheck, verdicts } from '../lib/orderCheck';
import { computePosition } from '../lib/positions';
import { nearMisses, squeezed } from '../lib/signals';
import { exportAll, getData, update, useData } from '../lib/store';
import { FILL_WINDOW } from '../lib/fills';
import {
  judgeLedger, judgeOrder, judgePi, judgeScam, judgeSqueeze, KIND_LABEL, MINUTES, remember, SESSION_MS, split, summarise, WARNINGS,
  type Entry, type Memory, type TodoItem, type TodoKind,
} from '../lib/todo';
import { PLANETS_SCOPE, readColonies, useColonies } from '../lib/colonyStore';
import { readSignals, trackedTypes, useSignals } from '../lib/watch';
import { BACKUP_DAYS } from '../lib/alertsRunner';
import { JITA_44 } from '../lib/config';
import { toast } from '../lib/toast';
import { canOpenInGame, downloadText, useTypeName } from './common';
import { cssVars, Empty, Guide, PageHead, Ring } from './ui';

const DAY = 86400_000;
const MEM_KEY = 'jita-ledger:todo';
/** Where the old page kept its ticks. Read once more, only to be removed. */
const OLD_KEY = 'jita-ledger:tonight-done';
/** ESI keeps its copy of a market book for five minutes, so a relist can't show sooner than that. */
const BOOK_TTL = 5 * 60_000;
/** Never re-check the orders more often than this from here, whatever the books' expiry says. */
const RECHECK_GAP = 2 * 60_000;
/** Colonies are re-read this often while a PI item is on the list (ESI caches them ten minutes). */
const COLONY_TTL = 10 * 60_000;
/** Finished items shown before "Show all". */
const DONE_SHOWN = 5;

const LOOK: Record<TodoKind, { Icon: typeof Check; c: string }> = {
  move: { Icon: CircleDollarSign, c: 'var(--acc2)' },
  cancel: { Icon: CircleX, c: 'var(--neg)' },
  close: { Icon: ListChecks, c: 'var(--pos)' },
  squeeze: { Icon: TrendingDown, c: 'var(--neg)' },
  piExpired: { Icon: Leaf, c: 'var(--neg)' },
  piEnding: { Icon: Leaf, c: 'var(--acc2)' },
  nearMiss: { Icon: GitPullRequestArrow, c: 'var(--acc)' },
  scam: { Icon: ShieldAlert, c: 'var(--neg-l)' },
  backup: { Icon: HardDriveDownload, c: 'var(--acc2)' },
};

function readMem(): Memory {
  try {
    localStorage.removeItem(OLD_KEY);
    const v = JSON.parse(localStorage.getItem(MEM_KEY) ?? 'null') as { v: number; mem: Memory } | null;
    if (v && v.v === 1 && v.mem && typeof v.mem === 'object') return v.mem;
  } catch { /* private window or bad JSON */ }
  return {};
}
function saveMem(mem: Memory) {
  try { localStorage.setItem(MEM_KEY, JSON.stringify({ v: 1, mem })); } catch { /* private window */ }
}

/** The part of a key after its kind: an order, pin or position ID. */
const idOf = (key: string) => key.slice(key.indexOf(':') + 1).split(':')[0];

export function Todo() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(30_000);
  const name = useTypeName();
  const check = useOrderCheck();
  const sig = useSignals();
  const col = useColonies();
  const [mem, setMem] = useState<Memory>(readMem);
  const [sel, setSel] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const r = rates(d.settings);

  const hasOrders = jitaOpen(d).length > 0;
  const tracked = useMemo(() => trackedTypes(d), [d.positions, d.orders, d.watchlist]); // eslint-disable-line react-hooks/exhaustive-deps
  const canPlanets = (auth?.scopes ?? []).includes(PLANETS_SCOPE);
  const vs = useMemo(() => verdicts(d, check, costBasis(d)), [d, check]);

  // Keep the data current while the page is open, so what you do in game shows up without asking:
  // the orders as soon as ESI has a newer book, colonies every ten minutes while a PI item is waiting,
  // market signals every half hour. Coming back to the tab checks at once. A hidden tab doesn't poll;
  // the alerts, when they're on, keep checking in the background.
  const piWaiting = useRef(false);
  piWaiting.current = Object.values(mem).some((e) => !e.done && (e.item.kind === 'piExpired' || e.item.kind === 'piEnding'));
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const c = getOrderCheck();
      if (getAuth() && jitaOpen(getData()).length && !c.busy) {
        const at = c.checkedAt ? Date.parse(c.checkedAt) : 0;
        const t = Date.now();
        if (!c.checkedAt || (t - at >= RECHECK_GAP && t >= (c.bookFreshAt ?? at + BOOK_TTL))) checkOrders(false).catch(() => undefined);
      }
      if (canPlanets) readColonies(piWaiting.current ? COLONY_TTL : 60 * 60_000).catch(() => undefined);
      if (tracked.length) readSignals(tracked).catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [auth, canPlanets, tracked.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => {
    const out: TodoItem[] = [];
    // Orders the book says are worth moving.
    for (const x of vs) {
      const action = { label: canOpenInGame() ? 'Open in game' : 'Open orders', typeId: x.typeId, route: 'orders' };
      if (x.verdict === 'dry') {
        // A buy trading doesn't reach, where reaching it leaves too little: the ISK is better freed.
        out.push({
          key: `order:${x.orderId}`, ver: `cancel:${x.price}`, kind: 'cancel', source: 'orders', price: x.price, stake: x.atRisk,
          title: `${name(x.typeId)} buy order`,
          detail: `Trading reached your bid on ${x.reach} of the last ${FILL_WINDOW} days, and bidding where it does leaves too little margin. Cancel it to free ${iskBig(x.atRisk)}.`,
          action,
        });
        continue;
      }
      if (x.verdict !== 'move') continue;
      const who = x.isBuy ? 'buyer' : 'seller';
      const by = x.aheadOrders > 5 ? `a crowd of ${x.aheadOrders} ${who}s` : `${x.aheadOrders} ${who}${x.aheadOrders === 1 ? '' : 's'}`;
      out.push({
        key: `order:${x.orderId}`, ver: `move:${x.newPrice}`, kind: 'move', source: 'orders', price: x.price, stake: x.atRisk,
        title: `${name(x.typeId)} ${x.isBuy ? 'buy' : 'sell'} order`,
        detail: x.unreached
          ? `Trading rarely gets down to your bid (${x.reach} of the last ${FILL_WINDOW} days) — move to ${Math.round(x.newPrice).toLocaleString('en-US')} ISK, where it does, costs ${iskBig(x.cost)}.`
          : `Beaten by ${by} — move to ${Math.round(x.newPrice).toLocaleString('en-US')} ISK, costs ${iskBig(x.cost)}.`,
        action,
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
          key: `close:${p.id}`, ver: '', kind: 'close', source: 'ledger', stake: Math.abs(c.realized),
          title: name(p.typeId), detail: `Every unit is sold, ${c.realized >= 0 ? 'for' : 'at'} ${iskBig(c.realized)}${c.realized >= 0 ? ' profit' : ' loss'}. Close it so later trades don’t land in it.`,
          action: { label: 'Open position', route: `positions/${p.id}` },
        });
      }
      const s = sig.signals[p.typeId]?.stats;
      if (c.stock > 0 && s && squeezed(s.range7, be2)) {
        const r7 = s.range7!;
        const first = r7[0], last = r7[r7.length - 1];
        out.push({
          // Seen once, it stays seen until it crosses your break-even, not every morning.
          key: `squeeze:${p.id}`, ver: last < be2 ? 'below' : 'near', kind: 'squeeze', source: 'signals', typeId: p.typeId, stake: c.costOfStock,
          title: `${name(p.typeId)} spread is narrowing`,
          detail: `${first > last ? `Down from ${(first * 100).toFixed(1)}% to ${(last * 100).toFixed(1)}% in ${r7.length - 1} days` : `The daily range is ${(last * 100).toFixed(1)}%`} — ${last < be2 ? 'below' : `${(last / be2).toFixed(1)}×`} your ${(be2 * 100).toFixed(1)}% break-even spread. ${units(c.stock)} still in stock.`,
          action: { label: 'Open position', route: `positions/${p.id}` },
        });
      }
      const nm = nearMisses(p, txs, d.positions, nd, JITA_44);
      if (nm.length) {
        const v = nm.reduce((t, n) => t + n.tx.qty * n.tx.unitPrice, 0);
        out.push({
          key: `near:${p.id}`, ver: nm.map((n) => n.tx.id).join('.'), kind: 'nearMiss', source: 'ledger', stake: v,
          title: name(p.typeId), detail: `${nm.length} trade${nm.length === 1 ? '' : 's'} just outside this position — before it started, or outside Jita 4-4. Count or ignore ${nm.length === 1 ? 'it' : 'them'}.`,
          action: { label: 'Open position', route: `positions/${p.id}` },
        });
      }
    }
    // Colonies: an ended programme earns nothing until the heads are reset.
    for (const c of col.read?.colonies ?? []) {
      const sys = col.read?.systems[c.head.solarSystemId]?.name ?? `Planet ${c.head.planetId}`;
      for (const e of c.extractors) {
        // Timed from the expiry against now, not from when the colonies were read, which may be an
        // hour ago: a programme that ended since then must show as ended.
        if (e.expiry == null || e.state === 'idle') continue;
        const hours = (e.expiry - now) / 3600_000;
        if (hours > 24) continue;
        const ended = hours <= 0;
        const price = e.productTypeId != null ? col.read?.prices[e.productTypeId] ?? 0 : 0;
        const perDay = e.unitsPerHour * 24 * price;
        const product = e.productTypeId != null ? name(e.productTypeId) : 'an extractor';
        out.push({
          key: `pi:${e.pinId}`, ver: `${e.expiry}:${ended ? 'ended' : 'ending'}`, kind: ended ? 'piExpired' : 'piEnding', source: 'colonies', stake: perDay,
          title: `${sys} · ${product}`,
          detail: ended ? 'The extraction programme has ended. It earns nothing until you reset the heads.' : `The programme ends in ${Math.max(1, Math.round(hours))} h. Reset it while you’re on.`,
          action: { label: 'Open planets', route: 'hustles/planets' },
        });
      }
    }
    // Suspicious markets on anything you hold, trade or watch. No ISK: there so you don't act on a trap.
    for (const id of tracked) {
      for (const f of sig.signals[id]?.flags ?? []) {
        out.push({
          key: `scam:${id}:${f}`, ver: '', kind: 'scam', source: 'signals', typeId: id, stake: 0, title: name(id),
          detail: f === 'escrow' ? 'A bid far above anything paid this month — escrow bait. Don’t sell into it.' : f === 'wall' ? 'The best price holds days of the market’s volume — a wall. Don’t queue behind it.' : 'A recent day traded far above normal at an odd price — a spike. Don’t trust the average.',
          action: { label: 'Look closer', route: `calculator?type=${id}` },
        });
      }
    }
    const last = d.meta.lastBackupAt ? Date.parse(d.meta.lastBackupAt) : null;
    if ((Object.keys(d.txs).length || d.positions.length) && (last == null || now - last > BACKUP_DAYS * DAY)) {
      out.push({
        key: 'backup', ver: '', kind: 'backup', source: 'ledger', stake: 0, title: 'Export a backup',
        detail: last == null ? 'You’ve never exported one. ESI only keeps 30 days of wallet history; this browser is the record.' : `The last one was ${Math.floor((now - last) / DAY)} days ago. ESI only keeps 30 days of wallet history.`,
        action: { label: 'Export', exportBackup: true },
      });
    }
    return out;
  }, [d, vs, sig.signals, col.read, tracked, now]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fold each new build into the session: new findings are added, and findings a newer read no longer
  // shows are ticked off with what changed.
  useEffect(() => {
    const t = Date.now();
    const checkedAt = check.checkedAt ? Date.parse(check.checkedAt) : null;
    const readAt = col.read ? Date.parse(col.read.at) : null;
    const seenAt = (x: TodoItem) =>
      x.source === 'orders' ? checkedAt ?? t : x.source === 'colonies' ? readAt ?? t : x.source === 'signals' ? sig.signals[x.typeId!]?.at ?? t : t;
    const byOrder = new Map(vs.map((v) => [v.orderId, v]));
    const position = (id: string) => d.positions.find((p) => p.id === id) ?? null;
    const judge = (e: Entry): string | null => {
      const x = e.item;
      const id = idOf(x.key);
      switch (x.kind) {
        case 'move': case 'cancel': {
          const o = d.orders[Number(id)];
          return judgeOrder(e, {
            open: !!o && o.state === 'open' && o.volumeRemain > 0,
            checked: checkedAt != null,
            bookRead: !!o && !!check.books?.[o.typeId],
            v: byOrder.get(Number(id)),
          });
        }
        case 'piExpired': case 'piEnding': {
          const ex = col.read?.colonies.flatMap((c) => c.extractors).find((z) => String(z.pinId) === id) ?? null;
          return judgePi(e, { readAt, extractor: ex }, t);
        }
        case 'squeeze': {
          const p = position(id);
          return judgeSqueeze(e, { open: p?.status === 'open', stock: p ? computePosition(p, d, d.settings).stock : 0, signalAt: sig.signals[x.typeId!]?.at ?? null });
        }
        case 'scam': return judgeScam(e, { tracked: tracked.includes(x.typeId!), signalAt: sig.signals[x.typeId!]?.at ?? null });
        default: return judgeLedger(e, { position: position(id) });
      }
    };
    setMem((m) => { const next = remember(m, items, seenAt, judge, t); saveMem(next); return next; });
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const present = useMemo(() => new Set(items.map((x) => x.key)), [items]);
  const view = useMemo(() => split(mem, present), [mem, present]);
  const sum = summarise(view);
  const open = view.open;

  const toggle = (key: string) => setMem((m) => {
    const cur = m[key];
    if (!cur || cur.done) return m;
    const next = { ...m, [key]: { ...cur, ticked: cur.ticked ? undefined : { ver: cur.item.ver, at: Date.now() } } };
    saveMem(next);
    return next;
  });

  async function act(x: TodoItem) {
    if (x.action.exportBackup) {
      // Exporting moves the last-backup time, and that alone ticks this off.
      const text = await exportAll();
      const file = `jita-ledger-${new Date().toISOString().slice(0, 10)}.json`;
      downloadText(file, text);
      const at = new Date().toISOString();
      update((y) => ({ meta: { ...y.meta, lastBackupAt: at, backups: [{ at, name: file, bytes: text.length }, ...(y.meta.backups ?? [])].slice(0, 6) } }));
      toast(`Backup saved as ${file}.`);
      return;
    }
    // A beaten order is fixed in the client: open its market window there when we can.
    if (x.action.typeId != null && canOpenInGame()) {
      try {
        await openMarketWindow(x.action.typeId);
        setMem((m) => { if (!m[x.key]) return m; const next = { ...m, [x.key]: { ...m[x.key], openedAt: Date.now() } }; saveMem(next); return next; });
        toast('Opened in your client — switch to the game window.', 'info');
        return;
      } catch { /* fall through to the page */ }
    }
    if (x.action.route) navigate(x.action.route);
  }

  function checkNow() {
    if (auth && hasOrders) checkOrders(true).catch(() => undefined);
    if (canPlanets) readColonies(0).catch(() => undefined);
    if (tracked.length) readSignals(tracked, 0).catch(() => undefined);
  }

  // N steps to the next item; Enter opens the selected one.
  const openRef = useRef(open); openRef.current = open;
  const selRef = useRef(sel); selRef.current = sel;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.closest('input,textarea,select,[contenteditable="true"],dialog') || (e.key === 'Enter' && t.closest('button,a'))))) return;
      const list = openRef.current;
      if (!list.length) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setSel((selRef.current + 1) % list.length);
      } else if (e.key === 'Enter') {
        const x = list[selRef.current];
        if (x) { e.preventDefault(); act(x.e.item); }
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.querySelector('.tn-item.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  useEffect(() => { if (sel >= open.length) setSel(Math.max(0, open.length - 1)); }, [open.length, sel]);

  const loading = !!check.busy || sig.busy || !!col.busy;
  const waiting = (x: TodoItem) =>
    x.source === 'orders' ? (!auth ? 'Log in so this can be checked again.' : check.busy ? 'Checking the market again…' : 'Waiting for the next check of the market.')
      : x.source === 'colonies' ? 'Waiting for the next read of your colonies.'
        : 'Waiting for the next read of this market.';
  const doneShown = allDone ? view.done : view.done.slice(0, DONE_SHOWN);
  const since = (t: number) => ago(new Date(t).toISOString(), now);

  return (
    <div className="page">
      <PageHead
        kicker="00 · Your session" title="To do" wide
        lede={<>Everything worth doing right now, in one list, biggest ISK at stake first. It ticks itself off as you play: move an order in game, close a position, reset your extractors, and the next check sees it. Press <b style={{ color: 'var(--ink)' }}>N</b> to step to the next item and <b style={{ color: 'var(--ink)' }}>Enter</b> to open it.</>}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section className="panel flush" aria-label="To do" data-rv="" style={{ flex: '999 1 560px', minWidth: 0 }} ref={listRef}>
          {!open.length && !view.done.length ? (
            <Empty icon={loading ? Timer : Check}>
              {loading ? 'Checking your orders, positions and colonies…'
                : !auth ? 'Nothing to do yet. Log in and sync, and anything worth your time — beaten orders, finished positions, expired colonies — lands here.'
                  : 'Nothing needs you right now. Your orders are holding, nothing is squeezed, and your backup is recent.'}
            </Empty>
          ) : (
            <>
              {!open.length && (
                <p className="tn-clear"><CheckCheck aria-hidden="true" />{loading ? 'Nothing left so far — still checking.' : 'Nothing left to do.'}</p>
              )}
              {open.map(({ e, checking }, i) => {
                const x = e.item;
                const look = LOOK[x.kind];
                const opened = !checking && e.openedAt != null && now - e.openedAt < 20 * 60_000;
                return (
                  <div key={x.key} className={'tn-item' + (i === sel ? ' sel' : '') + (checking ? ' checking' : '')} onClick={() => setSel(i)} style={cssVars({ '--c': look.c })}>
                    <button type="button" className="tn-box" role="checkbox" aria-checked={false} aria-label={`Done: ${x.title}`} data-tip={WARNINGS.has(x.kind) ? 'Mark as seen. It comes back only if it changes.' : 'Tick it yourself. If it still needs doing, it comes back in 12 hours.'} onClick={(ev) => { ev.stopPropagation(); toggle(x.key); }}><Check aria-hidden="true" /></button>
                    <span className="tn-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="tn-ic"><look.Icon aria-hidden="true" /></span>
                    <span style={{ minWidth: 0 }}>
                      <span className="tn-kind" style={{ display: 'block' }}>{KIND_LABEL[x.kind]}</span>
                      <span className="tn-title" style={{ display: 'block' }}>{x.title}</span>
                      <span className="tn-detail" style={{ display: 'block' }}>{x.detail}</span>
                      {checking && <span className="tn-note" style={{ display: 'block' }}><RefreshCw aria-hidden="true" />No longer in the latest list. {waiting(x)}</span>}
                      {opened && <span className="tn-note" style={{ display: 'block' }}>Opened in game {since(e.openedAt!)}. Once you’ve changed it, this ticks itself off when the market shows it, usually within 5 minutes.</span>}
                    </span>
                    <span className="tn-right">
                      <span className="tn-stake">
                        <span className="v" style={{ display: 'block' }}>{x.stake > 0 ? iskBig(x.stake) : x.kind === 'scam' ? 'A trap' : '–'}</span>
                        <span className="m" style={{ display: 'block' }}>{MINUTES[x.kind] ? `~${MINUTES[x.kind]} min` : 'a glance'}</span>
                      </span>
                      <button type="button" className="btn sm" onClick={(ev) => { ev.stopPropagation(); setSel(i); act(x); }}>{x.action.label}</button>
                    </span>
                  </div>
                );
              })}
              {view.done.length > 0 && (
                <>
                  <div className="tn-head">
                    <span className="lbl">Done · {view.done.length}</span>
                    {view.done.length > DONE_SHOWN && (
                      <button type="button" className="link-btn" onClick={() => setAllDone((v) => !v)}>{allDone ? 'Show fewer' : `Show all ${view.done.length}`}</button>
                    )}
                  </div>
                  {doneShown.map((e) => {
                    const x = e.item;
                    const look = LOOK[x.kind];
                    const byHand = !e.done;
                    return (
                      <div key={x.key} className="tn-item done" style={cssVars({ '--c': look.c })}>
                        <button type="button" className="tn-box" role="checkbox" aria-checked aria-label={`Done: ${x.title}`} aria-disabled={!byHand}
                          data-tip={byHand ? 'Untick to put it back on the list' : 'Ticked off by the data, so it can’t be unticked. If it comes back, it goes back on the list.'}
                          onClick={() => { if (byHand) toggle(x.key); }}><Check aria-hidden="true" /></button>
                        <span className="tn-n" />
                        <span className="tn-ic"><look.Icon aria-hidden="true" /></span>
                        <span style={{ minWidth: 0 }}>
                          <span className="tn-kind" style={{ display: 'block' }}>{KIND_LABEL[x.kind]}</span>
                          <span className="tn-title" style={{ display: 'block' }}>{x.title}</span>
                          <span className="tn-how" style={{ display: 'block' }}>
                            {e.done ? e.done.how : WARNINGS.has(x.kind) ? 'Marked as seen. It comes back only if it changes.' : 'Ticked by hand. If it still needs doing, it comes back 12 hours after you ticked it.'}
                          </span>
                        </span>
                        <span className="tn-right">
                          <span className="tn-stake">
                            <span className="v" style={{ display: 'block' }}>{x.stake > 0 ? iskBig(x.stake) : '–'}</span>
                            <span className="m" style={{ display: 'block' }}>{since(e.done?.at ?? e.ticked?.at ?? now)}</span>
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </section>
        <aside className="panel" data-rv="" aria-label="Progress" style={{ flex: '1 1 260px', maxWidth: 360, gap: 14, position: 'sticky', top: 0 }}>
          <div style={{ margin: '0 auto' }}>
            <Ring frac={sum.frac} color="var(--pos)" r={62}>
              <div style={{ textAlign: 'center' }}>
                <div className="mono" style={{ fontSize: 30, color: 'var(--ink)' }}>{sum.left}</div>
                <div className="lbl" style={{ fontSize: 10 }}>left of {open.length + view.done.length}</div>
              </div>
            </Ring>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'center' }}>
            <div><div className="lbl">Time</div><div className="mono" style={{ fontSize: 17, color: 'var(--ink)', marginTop: 3 }}>~{sum.minutes} min</div></div>
            <div><div className="lbl">At stake</div><div className="mono" style={{ fontSize: 17, color: 'var(--acc2)', marginTop: 3, whiteSpace: 'nowrap' }}>{iskBig(sum.stake).replace(' ISK', '')}</div></div>
          </div>
          {open.length + view.done.length > 0 && sum.left === 0 && <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--pos)' }}>All done. Fly safe.</p>}
          <div className="row tight" style={{ justifyContent: 'center', fontSize: 12, color: 'var(--note)' }}>
            <kbd className="kbd">N</kbd>next<kbd className="kbd">Enter</kbd>open
          </div>
          <p className="note small" style={{ textAlign: 'center', margin: 0 }}>
            {check.busy ? `Checking your orders… ${check.busy.done} of ${check.busy.total}`
              : check.checkedAt ? `Orders checked ${ago(check.checkedAt, now)}. Checked again as the market data refreshes.`
                : hasOrders && auth ? 'Your orders haven’t been checked yet.' : null}
          </p>
          <div className="row tight" style={{ justifyContent: 'center', gap: 18 }}>
            <button type="button" className="link-btn" disabled={!!check.busy} onClick={checkNow}><RefreshCw aria-hidden="true" />Check now</button>
            <button type="button" className="link-btn" onClick={() => { setMem({}); saveMem({}); setSel(0); checkNow(); }}>
              <RotateCcw aria-hidden="true" />Start afresh
            </button>
          </div>
          <p className="note small">
            Things tick themselves off when a newer read of the data no longer shows them. ESI refreshes a market every 5 minutes and your colonies every 10, so a change made in game takes up to that long to show. Finished items stay listed for {SESSION_MS / 3600_000} hours. Minutes are a rough guide per kind of task, not measured. At stake is the order’s value, the stock a squeeze puts at risk, or a day of a colony’s output.
          </p>
        </aside>
      </div>
      <Guide
        title="How to use To do"
        intro="This is your session in one list. Instead of visiting ten pages, work down it from the top — it’s sorted so the things with the most ISK at stake come first — or just play, and let it keep up with you."
        steps={[
          { icon: ArrowDownWideNarrow, title: 'Start at the top', body: 'The first items carry the most ISK. If you only have ten minutes, the top three are usually most of the value.' },
          { icon: Keyboard, title: 'Use N and Enter', body: 'Press N to move to the next item and Enter to open it — a beaten order opens straight into its market window in your client when you’ve granted that permission.' },
          { icon: CheckCheck, title: 'It ticks itself off', body: 'Move an order in game, close a position, reset your extractors or export a backup, and the next check moves it to Done with what changed. Orders are re-checked whenever ESI’s copy of the market refreshes, about every 5 minutes.' },
          { icon: Check, title: 'Tick by hand to skip', body: 'Ticking something yourself hides it: a warning until it changes, a chore for 12 hours. Nothing in game changes.' },
        ]}
        habits={[
          { icon: BellRing, title: 'Pair it with alerts', body: 'Undercut alerts tell you when something new lands here while you’re doing other things, and keep checking while this tab is in the background.' },
          { icon: TriangleAlert, title: 'Warnings aren’t chores', body: 'Suspicious-market items have no ISK at stake — they’re there so you don’t act on a trap.', color: 'var(--acc2)' },
        ]}
      />
    </div>
  );
}
