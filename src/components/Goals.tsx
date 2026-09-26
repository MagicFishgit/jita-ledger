import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Package, Plus, ShoppingCart, Target, TrendingUp, Trophy, X } from 'lucide-react';
import { fmtDate, isk, iskBig, iskBigSigned, pct, rid, units } from '../lib/format';
import { useNow } from '../lib/hooks';
import { jitaBook, skillDogma } from '../lib/market';
import { marketBest } from '../lib/relist';
import { goalProgress, normalizeGoal, onPace, type GoalContext, type GoalProgress } from '../lib/goals';
import { spForLevel, trainingDays } from '../lib/training';
import { PLEX_TYPE } from '../lib/config';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import type { Goal, GoalMeasure } from '../lib/types';
import { ItemSearch, useTypeName } from './common';
import { cssVars, NumChip, Panel, Seg } from './ui';

const DAY = 86400_000;
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
type Kind = Goal['kind'];

const KIND: Record<Kind, { label: string; Icon: typeof Target; c: string }> = {
  afford: { label: 'Afford', Icon: ShoppingCart, c: 'var(--acc)' },
  hold: { label: 'Hold', Icon: Package, c: '#a98bff' },
  isk: { label: 'Save ISK', Icon: Target, c: 'var(--acc)' },
  earn: { label: 'Earn', Icon: TrendingUp, c: '#6ee7a8' },
  skill: { label: 'Train', Icon: GraduationCap, c: 'var(--acc2)' },
};
const MEASURE: Record<GoalMeasure, { label: string; words: string }> = {
  wallet: { label: 'Wallet', words: 'your wallet' },
  liquid: { label: 'Wallet + orders', words: 'your wallet and orders' },
  nw: { label: 'Net worth', words: 'your net worth' },
};

const startOfMonth = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const nextMonth = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1000; };

/**
 * Goals of five kinds: afford something at today's price, hold an amount of an item, save ISK, earn a
 * profit, train a skill. Each is measured from live data; see lib/goals.ts for how.
 */
export function Goals(props: {
  funds: Record<GoalMeasure, number | null>;
  growth: Record<GoalMeasure, number | null>;
  earned: (source: 'trading' | 'cashflow', from: number, to: number) => number;
}) {
  const d = useData();
  const now = useNow(60_000);
  const name = useTypeName();
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const goals = useMemo(() => d.goals.map(normalizeGoal).filter((g): g is Goal => !!g), [d.goals]);

  // Live prices for whatever the open afford goals want to buy, re-read every five minutes, which
  // is how often ESI has a new book.
  const priceIds = [...new Set(goals.filter((g) => g.kind === 'afford' && !g.doneAt).map((g) => (g as Extract<Goal, { kind: 'afford' }>).typeId))];
  const [prices, setPrices] = useState<Record<number, number | null>>({});
  const priceKey = priceIds.join(',');
  useEffect(() => {
    if (!priceKey) return;
    let alive = true;
    const read = async () => {
      const out: Record<number, number | null> = {};
      await Promise.all(priceKey.split(',').map(Number).map(async (id) => {
        try { out[id] = marketBest((await jitaBook(id, true)).topSells, false); } catch { out[id] = null; }
      }));
      if (alive) setPrices(out);
    };
    read();
    const t = setInterval(read, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [priceKey]);

  // Skill goals: trained level, how far through the target level's points, and training time left.
  const skillGoals = goals.filter((g): g is Extract<Goal, { kind: 'skill' }> => g.kind === 'skill' && !g.doneAt);
  const skillKey = skillGoals.map((g) => `${g.skillId}:${g.level}`).join(',');
  const [skills, setSkills] = useState<Record<string, { level: number; frac: number | null; days: number | null }>>({});
  useEffect(() => {
    if (!skillKey || !d.skills) return;
    let alive = true;
    (async () => {
      const out: Record<string, { level: number; frac: number | null; days: number | null }> = {};
      for (const k of skillKey.split(',')) {
        const [id, lvl] = k.split(':').map(Number);
        const level = d.skills?.[id] ?? 0;
        const sp = d.meta.skillSp?.[id] ?? 0;
        const dg = await skillDogma(id).catch(() => null);
        const need = dg ? spForLevel(dg.rank, lvl) : null;
        out[k] = {
          level,
          frac: need ? Math.min(1, sp / need) : null,
          days: level >= lvl ? 0 : dg && d.meta.attributes ? trainingDays(dg, d.meta.attributes, sp, lvl, d.settings.clone === 'alpha') : null,
        };
      }
      if (alive) setSkills(out);
    })();
    return () => { alive = false; };
  }, [skillKey, d.skills, d.meta.skillSp, d.meta.attributes, d.settings.clone]);

  const inSellOrders = (id: number) => Object.values(d.orders).filter((o) => o.state === 'open' && !o.isBuy && o.typeId === id).reduce((t, o) => t + o.volumeRemain, 0);
  const ctx: GoalContext = {
    now, funds: props.funds, growth: props.growth,
    price: (id) => prices[id] ?? null,
    held: (id) => (d.stock ? (d.stock.total[id] ?? 0) + inSellOrders(id) : null),
    txs: Object.values(d.txs),
    earned: props.earned,
    skill: (id, lvl) => (d.skills ? skills[`${id}:${lvl}`] ?? { level: d.skills[id] ?? 0, frac: null, days: null } : null),
  };
  const measured = goals.map((g) => ({ g, p: goalProgress(g, ctx) }));
  const open = measured.filter((x) => !x.g.doneAt);
  const reached = measured.filter((x) => x.g.doneAt).sort((a, b) => (b.g.doneAt ?? '').localeCompare(a.g.doneAt ?? ''));

  // A goal reached stays reached, even if the wallet dips again. Mark it once and say so once.
  const newly = open.filter((x) => x.p.done).map((x) => x.g.id).join(',');
  useEffect(() => {
    if (!newly) return;
    const ids = new Set(newly.split(','));
    const at = new Date().toISOString();
    const names = goals.filter((g) => ids.has(g.id)).map((g) => g.label);
    update((x) => ({ goals: x.goals.map((g) => (ids.has((g as Goal).id) && !(g as Goal).doneAt ? { ...normalizeGoal(g)!, doneAt: at } : g)) }));
    toast(`Goal reached: ${names.join(', ')}.`, 'ok');
  }, [newly]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = (id: string) => update((x) => ({ goals: x.goals.filter((g) => (g as Goal).id !== id) }));

  return (
    <Panel title="Goals" sub={open.length ? `${open.length} open${reached.length ? ` · ${reached.length} reached` : ''}` : undefined}>
      {!goals.length && !adding && (
        <p className="note">Something to work towards — 500 PLEX, a ship, a year of Omega, a skill, a month’s profit. Each is measured from your own data, and the date is worked out from how fast you’re actually getting there.</p>
      )}
      {open.length > 0 && (
        <div className="goal-grid">
          {open.map(({ g, p }) => <GoalCard key={g.id} g={g} p={p} name={name} now={now} onRemove={() => remove(g.id)} />)}
        </div>
      )}
      {adding ? <GoalBuilder onDone={() => setAdding(false)} /> : (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><Plus aria-hidden="true" />Add a goal</button>
      )}
      {reached.length > 0 && (
        <div>
          <button type="button" className="link-btn" onClick={() => setShowDone(!showDone)}><Trophy aria-hidden="true" />{showDone ? 'Hide' : 'Show'} reached goals ({reached.length})</button>
          {showDone && (
            <div style={{ marginTop: 8 }}>
              {reached.map(({ g }) => (
                <div key={g.id} className="lrow">
                  <span><span className="lt">{g.label}</span><span className="ls">{KIND[g.kind].label} · reached {fmtDate(g.doneAt!)}</span></span>
                  <button type="button" className="icon-btn" aria-label={`Remove ${g.label}`} onClick={() => remove(g.id)}><X aria-hidden="true" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/** "12 days (9 Oct)", "under a day", or the reason there's no date. */
function when(days: number | null, now: number): string | null {
  if (days == null || !Number.isFinite(days)) return null;
  if (days <= 0) return 'now';
  const date = fmtDate(now + days * DAY).replace(/ \d{4}$/, '');
  return days < 1 ? 'under a day' : `about ${units(Math.ceil(days))} day${Math.ceil(days) === 1 ? '' : 's'} (${date})`;
}

function perDay(v: number | null, unit: GoalProgress['unit']): string {
  if (v == null || !Number.isFinite(v)) return '–';
  return unit === 'isk' ? `${iskBig(v)} a day` : `${units(Math.round(v * 10) / 10)} a day`;
}

function GoalCard({ g, p, name, now, onRemove }: { g: Goal; p: GoalProgress; name: (id: number) => string; now: number; onRemove: () => void }) {
  const k = KIND[g.kind];
  const c = p.done || p.affordable ? 'var(--pos)' : k.c;
  const lines: { t: string; c?: string }[] = [];
  let figure = '';

  if (g.kind === 'isk') {
    figure = p.have == null ? 'Waiting for your wallet' : `${iskBig(p.have)} of ${iskBig(g.target)}`;
    lines.push({ t: `Counting ${MEASURE[g.measure].words}.` });
  } else if (g.kind === 'afford') {
    const item = name(g.typeId);
    figure = `${units(p.acquired ?? 0)} of ${units(g.qty)} ${item} bought`;
    if ((p.remaining ?? 0) > 0) {
      lines.push({ t: p.price == null ? `The ${units(p.remaining!)} left can’t be priced right now.` : `The ${units(p.remaining!)} left cost ${iskBig(p.costLeft!)} at ${isk(p.price)} each, today’s price.` });
      if (p.funds != null && p.costLeft != null) {
        lines.push(p.affordable
          ? { t: `${MEASURE[g.measure].words[0].toUpperCase()}${MEASURE[g.measure].words.slice(1)} has ${iskBig(p.funds)}: you can buy the rest now.`, c: 'var(--pos)' }
          : { t: `${MEASURE[g.measure].words[0].toUpperCase()}${MEASURE[g.measure].words.slice(1)} has ${iskBig(p.funds)} — ${iskBig(p.costLeft - p.funds)} short.` });
      }
    }
    lines.push({ t: `Any ${item} you buy on the market counts as you go.` });
  } else if (g.kind === 'hold') {
    const item = name(g.typeId);
    figure = p.have == null ? `Waiting for your assets` : `${units(Math.floor(p.have))} of ${units(g.qty)} ${item}`;
    lines.push({
      t: g.typeId === PLEX_TYPE
        ? `Your count of ${units(g.startCount ?? 0)} when you set this, plus PLEX bought on the market since. ESI can’t see the PLEX vault, so PLEX from anywhere else isn’t counted.`
        : p.missing === 'assets' ? 'Needs the assets permission to count what you hold.' : 'Counted in your hangars and sell orders, as of the last sync.',
    });
  } else if (g.kind === 'earn') {
    figure = `${iskBigSigned(p.have ?? 0)} of ${iskBig(g.target)}`;
    lines.push({ t: `${g.source === 'trading' ? 'Profit your positions realized' : 'Net cash flow'} since ${fmtDate(g.from)}.` });
  } else {
    figure = p.have == null ? 'Waiting for your skills' : `${name(g.skillId)} ${ROMAN[p.have]} of ${ROMAN[g.level]}`;
    if (!p.done && p.etaDays != null) lines.push({ t: `${p.etaDays.toFixed(1)} days of training left, from your attributes and the points already in it.` });
    else if (!p.done && p.have != null) lines.push({ t: 'Training time needs your attributes, which a sync with the skills permission brings.' });
  }

  // The status line: a deadline's pace if there is one, otherwise when it gets there at today's pace.
  const pace = onPace(p);
  let status: { t: string; c?: string };
  if (p.done) status = { t: 'Reached', c: 'var(--pos)' };
  else if (p.missing === 'price') status = { t: 'Waiting for a price' };
  else if (p.missing) status = { t: 'Not enough data yet' };
  else if (p.daysLeft != null && g.kind !== 'skill') {
    status = p.daysLeft <= 0
      ? { t: `Deadline passed ${fmtDate(g.deadline!)}`, c: 'var(--neg)' }
      : { t: `By ${fmtDate(g.deadline!)}: needs ${perDay(p.needPerDay, g.kind === 'afford' ? 'isk' : p.unit)}, going at ${perDay(p.nowPerDay, g.kind === 'afford' ? 'isk' : p.unit)}`, c: pace ? 'var(--pos)' : 'var(--acc2)' };
  } else if (p.daysLeft != null) {
    status = { t: `By ${fmtDate(g.deadline!)}: ${pace ? 'on track' : 'training takes longer than that'}`, c: pace ? 'var(--pos)' : 'var(--acc2)' };
  } else if (g.kind === 'skill') {
    const w = when(p.etaDays, now);
    status = { t: w ? `Trained in ${w}, if it trains without a break` : 'No date until the training time is known' };
  } else {
    const w = when(p.etaDays, now);
    status = { t: w === 'now' ? 'Within reach now' : w ? `At your current pace, ${w}` : 'Not moving at the moment, so no date', c: w === 'now' ? 'var(--pos)' : undefined };
  }

  return (
    <div className="goal" style={cssVars({ '--c': c })}>
      <div className="goal-head">
        <span className="goal-ic"><k.Icon aria-hidden="true" /></span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="lbl" style={{ display: 'block', color: k.c }}>{k.label}</span>
          <span className="goal-name">{g.label}</span>
        </span>
        <button type="button" className="icon-btn" aria-label={`Remove goal ${g.label}`} onClick={onRemove}><X aria-hidden="true" /></button>
      </div>
      <div className="kv"><span style={{ color: 'var(--body)' }}>{figure}</span><span className="v" style={{ color: c }}>{p.affordable && !p.done ? 'Ready' : pct(p.frac, 0)}</span></div>
      <div className="track h8"><span className="fill" style={{ width: `${p.frac * 100}%`, background: c, boxShadow: `0 0 8px ${c}` }} /></div>
      {lines.map((l) => <p key={l.t} className="note small" style={l.c ? { color: l.c } : undefined}>{l.t}</p>)}
      <p className="goal-status" style={status.c ? { color: status.c } : undefined}>{status.t}</p>
    </div>
  );
}

/** The form for a new goal. Its fields follow the kind, and it names the goal if you don't. */
function GoalBuilder({ onDone }: { onDone: () => void }) {
  const now = Date.now();
  const [kind, setKind] = useState<Kind>('afford');
  const [label, setLabel] = useState('');
  const [item, setItem] = useState<{ id: number; name: string } | null>({ id: PLEX_TYPE, name: 'PLEX' });
  const [qty, setQty] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [measure, setMeasure] = useState<GoalMeasure>('wallet');
  const [target, setTarget] = useState<number | null>(null);
  const [source, setSource] = useState<'trading' | 'cashflow'>('trading');
  const [period, setPeriod] = useState<'month' | 'now'>('month');
  const [skill, setSkill] = useState<{ id: number; name: string } | null>(null);
  const [level, setLevel] = useState(5);
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);

  const auto = (): string => {
    if (kind === 'afford') return `Afford ${qty ? units(qty) : '…'} ${item?.name ?? '…'}`;
    if (kind === 'hold') return `Hold ${qty ? units(qty) : '…'} ${item?.name ?? '…'}`;
    if (kind === 'isk') return `${target ? iskBig(target) : '…'} in ${MEASURE[measure].label.toLowerCase()}`;
    if (kind === 'earn') return `${target ? iskBig(target) : '…'} ${source === 'trading' ? 'trading profit' : 'cash flow'}${period === 'month' ? ' this month' : ''}`;
    return `${skill?.name ?? '…'} ${ROMAN[level]}`;
  };

  async function add() {
    const createdAt = new Date().toISOString();
    const dl = deadline ? `${deadline}T23:59:59Z` : undefined;
    if (dl && Date.parse(dl) <= Date.now()) { toast('Pick a deadline in the future, or leave it blank.', 'warn'); return; }
    const base = { id: rid(), label: label.trim() || auto(), createdAt, deadline: dl };
    let g: Goal | null = null;
    if (kind === 'afford' || kind === 'hold') {
      if (!item) { toast('Pick an item first.', 'warn'); return; }
      if (!qty || qty <= 0) { toast('How many? Enter a quantity above zero.', 'warn'); return; }
      g = kind === 'afford'
        ? { ...base, kind, typeId: item.id, qty, measure }
        : { ...base, kind, typeId: item.id, qty, startCount: item.id === PLEX_TYPE ? start ?? 0 : undefined };
    } else if (kind === 'isk' || kind === 'earn') {
      if (!target || target <= 0) { toast('Enter a target above zero.', 'warn'); return; }
      g = kind === 'isk'
        ? { ...base, kind, measure, target }
        : { ...base, kind, source, target, from: period === 'month' ? new Date(startOfMonth(now)).toISOString() : createdAt, deadline: dl ?? (period === 'month' ? new Date(nextMonth(now)).toISOString() : undefined) };
    } else {
      if (!skill) { toast('Pick a skill first.', 'warn'); return; }
      setBusy(true);
      const dg = await skillDogma(skill.id).catch(() => null);
      setBusy(false);
      if (!dg) { toast(`${skill.name} isn’t a skill — use the skill’s exact name.`, 'warn'); return; }
      g = { ...base, kind, skillId: skill.id, level };
    }
    update((x) => ({ goals: [...x.goals, g!] }));
    toast(`Goal added: ${g.label}.`, 'ok');
    onDone();
  }

  const quick = (t: { id: number; name: string }) => (
    <button type="button" className={'chip-btn' + (item?.id === t.id ? ' on' : '')} onClick={() => setItem(t)}>{t.name}</button>
  );

  return (
    <div className="goal-builder">
      <Seg label="Kind of goal" value={kind} onChange={setKind} options={(Object.keys(KIND) as Kind[]).map((v) => ({ v, label: KIND[v].label }))} />
      <p className="note small">
        {kind === 'afford' ? 'Have the ISK to buy a quantity of something at today’s price. Anything of it you buy on the market along the way comes off what’s left.'
          : kind === 'hold' ? 'Own a quantity of an item. Counted in your hangars and sell orders — for PLEX, which ESI can’t see in the vault, from your count now plus what you buy on the market.'
            : kind === 'isk' ? 'An amount of ISK in your wallet, your wallet and orders, or your net worth.'
              : kind === 'earn' ? 'Make a profit over a period: what your positions realize, or your net cash flow.'
                : 'Train a skill to a level. The date comes from your attributes and the points already in it.'}
      </p>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {(kind === 'afford' || kind === 'hold') && (
          <>
            {quick({ id: PLEX_TYPE, name: 'PLEX' })}
            <ItemSearch keep initial={item && item.id !== PLEX_TYPE ? item.name : ''} button="Pick" placeholder="Or any item" onFound={setItem} width={220} />
            <NumChip label="How many" value={qty} onChange={setQty} width={90} decimals={0} placeholder="500" />
            {kind === 'hold' && item?.id === PLEX_TYPE && (
              <NumChip label="PLEX you have now" value={start} onChange={setStart} width={80} decimals={0} placeholder="0" tip="ESI can’t see the PLEX vault, so this is where the count starts. PLEX you buy or sell on the market after this is added automatically." />
            )}
            {kind === 'afford' && <Seg label="Paid from" value={measure} onChange={setMeasure} options={(['wallet', 'liquid', 'nw'] as GoalMeasure[]).map((v) => ({ v, label: MEASURE[v].label }))} />}
          </>
        )}
        {kind === 'isk' && (
          <>
            <Seg label="Counting" value={measure} onChange={setMeasure} options={(['wallet', 'liquid', 'nw'] as GoalMeasure[]).map((v) => ({ v, label: MEASURE[v].label }))} />
            <NumChip label="Target" value={target} onChange={setTarget} width={110} decimals={0} placeholder="1.2b" />
          </>
        )}
        {kind === 'earn' && (
          <>
            <Seg label="Counting" value={source} onChange={setSource} options={[{ v: 'trading' as const, label: 'Trading profit' }, { v: 'cashflow' as const, label: 'Net cash flow' }]} />
            <NumChip label="Target" value={target} onChange={setTarget} width={110} decimals={0} placeholder="1b" />
            <Seg label="Period" value={period} onChange={setPeriod} options={[{ v: 'month' as const, label: 'This month' }, { v: 'now' as const, label: 'From today' }]} />
          </>
        )}
        {kind === 'skill' && (
          <>
            <ItemSearch keep initial={skill?.name ?? ''} button="Pick" placeholder="Skill, e.g. Accounting" onFound={setSkill} width={240} busyLabel="Checking…" />
            <Seg label="Level" value={level} onChange={setLevel} options={[1, 2, 3, 4, 5].map((v) => ({ v, label: ROMAN[v] }))} />
          </>
        )}
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <label className="chip h34"><span className="cl">Name</span><input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={auto()} style={{ width: 220 }} /></label>
        <label className="chip h34" data-tip={kind === 'earn' && period === 'month' ? 'Blank means the end of this month.' : 'Optional. With a deadline the goal shows the pace it needs against the pace you have.'}>
          <span className="cl">By</span><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ width: 150 }} />
        </label>
        <button type="button" className="btn sm primary" disabled={busy} onClick={add}>{busy ? 'Checking…' : 'Add'}</button>
        <button type="button" className="btn sm" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
