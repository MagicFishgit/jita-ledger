import { useEffect, useMemo, useState } from 'react';
import { Gem, GraduationCap, RefreshCw, Scale } from 'lucide-react';
import { effectiveSkills, omegaRates, orderSlots, rates, sanitizeSettings, type Rates, type Settings as S } from '../lib/fees';
import { ago, iskBig, iskBigSigned, pct, share, units } from '../lib/format';
import { computePosition, countedIn, realizedBetween } from '../lib/positions';
import { jitaBook } from '../lib/market';
import { update, useData } from '../lib/store';
import { useAuth, useNow } from '../lib/hooks';
import { JITA_44, PLEX_TYPE } from '../lib/config';
import { bumpWarp } from '../lib/motion';
import { toast } from '../lib/toast';
import { LevelBoxes } from './common';
import { cssVars, Guide, NumChip, PageHead, Seg } from './ui';
import { useSkillPayback } from './payback';

const DAY = 86400_000;
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const PACKS = ['1', '3', '6', '12'] as const;

export function CloneSwitch({ value, onChange }: { value: 'alpha' | 'omega'; onChange: (v: 'alpha' | 'omega') => void }) {
  return (
    <div className="seg" role="group" aria-label="Clone state">
      {(['alpha', 'omega'] as const).map((k) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          style={{ height: 34, padding: '0 18px', fontWeight: 700, fontSize: 12, letterSpacing: '.14em', ...(value === k ? { background: k === 'alpha' ? 'var(--acc2)' : 'var(--acc)' } : {}) }}>
          {k === 'alpha' ? 'Alpha' : 'Omega'}
        </button>
      ))}
    </div>
  );
}

export function Omega() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const s = d.settings;
  const [loading, setLoading] = useState(false);
  const set = (patch: Partial<S>) => update((x) => ({ settings: sanitizeSettings({ ...x.settings, ...patch }) }));

  async function fetchPlex() {
    setLoading(true);
    try {
      const b = await jitaBook(PLEX_TYPE, true);
      update((x) => ({ meta: { ...x.meta, plex: { price: b.bestSell, buy: b.bestBuy, at: new Date().toISOString() } } }));
    } catch (e) {
      toast(`Couldn’t load the PLEX price: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const at = d.meta.plex?.at ? Date.parse(d.meta.plex.at) : 0;
    if (Date.now() - at > 30 * 60_000) fetchPlex();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const plexPrice = s.plexPrice > 0 ? s.plexPrice : d.meta.plex?.price ?? null;
  const monthCost = plexPrice ? plexPrice * s.plexPerMonth : null;
  const wallet = d.meta.walletBalance ?? null;
  const months = monthCost && wallet != null ? wallet / monthCost : null;
  const alpha = s.clone === 'alpha';
  const plan = { acc: s.planAcc, br: s.planBr, abr: s.planAbr };
  const rNow = rates(s);
  const rPlan = omegaRates(s, plan);

  // The last 30 days of trading, across all positions.
  const pace = useMemo(() => {
    const now = Date.now(), from = now - 30 * DAY;
    let realized = 0, stockAtCost = 0;
    const sells = new Map<string, number>();
    for (const p of d.positions) {
      const c = computePosition(p, d, s);
      realized += realizedBetween(c.series, from, now);
      stockAtCost += c.costOfStock;
      for (const row of c.rows) {
        if ((row.match !== 'auto' && row.match !== 'included') || row.tx.isBuy) continue;
        if (Date.parse(row.tx.date) >= from) sells.set(row.tx.id, row.tx.qty * row.tx.unitPrice);
      }
    }
    const types = new Set(d.positions.map((p) => p.typeId));
    let orderValue = 0, escrow = 0;
    for (const o of Object.values(d.orders)) {
      if (o.state === 'open' && o.isBuy) escrow += o.escrow ?? o.price * o.volumeRemain;
      if (!types.has(o.typeId) || o.locationId !== JITA_44 || Date.parse(o.issued) < from) continue;
      if (d.positions.some((p) => p.typeId === o.typeId && Date.parse(o.issued) >= Date.parse(p.openedAt))) orderValue += o.price * o.volumeTotal;
    }
    const sellValue = [...sells.values()].reduce((a, b) => a + b, 0);
    return { realized, stockAtCost, sellValue, orderValue, escrow };
  }, [d, s]);

  const savings = pace.sellValue * Math.max(0, rNow.t - rPlan.t) + pace.orderValue * Math.max(0, rNow.f - rPlan.f);
  const asOmega = pace.realized + savings;
  const hasTrades = d.positions.some((p) => Object.values(d.txs).some((t) => countedIn(p, t)));

  const alphaS = { ...s, clone: 'alpha' as const, override: false };
  const omegaS = { ...s, clone: 'omega' as const, override: false };
  const cols: { label: string; r: Rates; slots: number; now: boolean }[] = [
    { label: 'Alpha', r: rates(alphaS), slots: orderSlots(effectiveSkills(alphaS)), now: alpha },
    { label: 'Omega, trained', r: rates(omegaS), slots: orderSlots(effectiveSkills(omegaS)), now: !alpha },
    { label: 'Omega, your plan', r: rPlan, slots: orderSlots(effectiveSkills(omegaS)), now: false },
  ];

  // Skill payback: what the next level of each trade skill would have saved on the same 30 days.
  const { rows: ranked, perDay } = useSkillPayback(d);

  const packPlex = d.prefs.omegaPacks;
  const pack = d.prefs.omegaPack;
  const packTotal = packPlex[pack];
  const monthly = packPlex['1'] ?? 500;
  const choosePack = (k: (typeof PACKS)[number]) => {
    update((x) => ({ prefs: { ...x.prefs, omegaPack: k } }));
    const total = packPlex[k];
    if (total) set({ plexPerMonth: Math.round(total / Number(k)) });
  };

  const C = 2 * Math.PI * 84;
  const ringC = months != null && months >= 1 ? 'var(--pos)' : 'var(--acc2)';
  const frac = months == null ? 0 : months >= 1 ? 1 : months;
  const partial = months == null ? 0 : months >= 1 ? months % 1 : 0;

  return (
    <div className="page">
      <PageHead
        kicker="09 · Clone economics" title={alpha ? 'Road to Omega' : 'Staying Omega'} wide
        lede="What a month of Omega costs in PLEX, how far your wallet gets you, and whether your trading could pay for it. As Alpha you can’t use Accounting or Advanced Broker Relations, and Broker Relations stops at level II."
        actions={<><span className="lbl" style={{ fontSize: 11, letterSpacing: '.18em' }}>You are</span><CloneSwitch value={s.clone} onChange={(v) => { set({ clone: v }); bumpWarp(0.6); }} /></>}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>
        <section className="panel" aria-label="Wallet" data-rv="" style={{ flex: '1 1 340px', padding: 22, gap: 16, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 210, height: 210 }}>
            <svg viewBox="0 0 200 200" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }} aria-hidden="true">
              <circle cx={100} cy={100} r={84} fill="none" stroke="rgba(130,185,225,.1)" strokeWidth={10} />
              <circle cx={100} cy={100} r={84} fill="none" stroke={ringC} strokeWidth={10} strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`} style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${ringC})` }} />
              {partial > 0 && <circle cx={100} cy={100} r={84} fill="none" stroke="var(--acc2)" strokeWidth={4} strokeDasharray={`${(partial * C).toFixed(1)} ${C.toFixed(1)}`} />}
              <circle cx={100} cy={100} r={68} fill="none" stroke="rgba(130,185,225,.12)" strokeWidth={1} strokeDasharray="2 6" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <div>
                <div className="mono" style={{ fontSize: 44, lineHeight: 1, color: 'var(--ink)' }}>{months == null ? '–' : months >= 1 ? months.toFixed(1) : pct(months, 0)}</div>
                <div className="lbl" style={{ fontSize: 12, letterSpacing: '.2em', color: ringC, marginTop: 4 }}>{months != null && months >= 1 ? 'months' : ''}</div>
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, color: 'var(--body-2)' }}>{months == null ? (monthCost ? `${iskBig(monthCost)} for a month of Omega` : 'Waiting for the PLEX price') : months >= 1 ? 'of Omega your wallet could buy' : 'of a month of Omega is in your wallet'}</div>
            <div style={{ fontSize: 12, color: 'var(--note)', marginTop: 4, textWrap: 'pretty' }}>
              {wallet != null && monthCost ? `${iskBig(wallet)} in your wallet (${ago(d.meta.walletAt, now)}), ${iskBig(monthCost)} for ${units(s.plexPerMonth)} PLEX.` : auth ? 'Sync to read your wallet balance.' : 'Log in and sync to compare this with your wallet.'}
            </div>
          </div>
          <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="lbl">Subscription length</div>
            <Seg label="Subscription length" value={pack} onChange={choosePack} size="md" options={PACKS.map((k) => ({ v: k, label: k === '1' ? '1 month' : `${k} months` }))} />
            <p style={{ fontSize: 12, color: 'var(--sec)', textWrap: 'pretty' }}>
              {pack === '1'
                ? 'Paying month by month. Longer packs cost less per month, if you know you’ll stay.'
                : !packTotal
                  ? `The ${pack}-month pack’s PLEX price changes with store sales and isn’t in any API. Type it from the store below and this works out the monthly cost.`
                  : `${units(packTotal)} PLEX up front, ${units(Math.round(packTotal / Number(pack)))} a month${plexPrice ? ` — ${iskBig((monthly - packTotal / Number(pack)) * plexPrice)} a month ${monthly - packTotal / Number(pack) >= 0 ? 'cheaper' : 'dearer'} than paying monthly. You need ${iskBig(packTotal * plexPrice)} at once` : ''}.`}
            </p>
            {pack !== '1' && (
              <NumChip label={`PLEX for ${pack} months`} width={90} decimals={0} value={packPlex[pack]} placeholder="from the store"
                onChange={(n) => { update((x) => ({ prefs: { ...x.prefs, omegaPacks: { ...x.prefs.omegaPacks, [pack]: n && n > 0 ? n : null } } })); if (n && n > 0) set({ plexPerMonth: Math.round(n / Number(pack)) }); }} />
            )}
          </div>
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, textAlign: 'left' }}>
            <div className="field">
              <label htmlFor="o-n" style={{ fontSize: 10.5 }}>PLEX for 30 days</label>
              <input id="o-n" className="num" inputMode="decimal" value={s.plexPerMonth} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) set({ plexPerMonth: n }); }} />
              <span className="hint" style={{ fontSize: 11 }}>{monthly} in the store, less in sales</span>
            </div>
            <div className="field">
              <label htmlFor="o-p" style={{ fontSize: 10.5 }}>PLEX price override</label>
              <input id="o-p" className="num" inputMode="decimal" value={s.plexPrice} onChange={(e) => { const n = parseFloat(e.target.value.replace(/,/g, '')); set({ plexPrice: Number.isFinite(n) ? n : 0 }); }} />
              <span className="hint" style={{ fontSize: 11 }}>0 uses the market price</span>
            </div>
          </div>
          <button type="button" className="btn sm" disabled={loading} onClick={fetchPlex}><RefreshCw aria-hidden="true" className={loading ? 'spinning' : undefined} />{loading ? 'Refreshing…' : 'Refresh PLEX price'}</button>
        </section>

        <div className="col" style={{ gap: 14, flex: '2 1 560px' }}>
          <div data-rv="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            {[
              { l: 'PLEX price', v: plexPrice ? iskBig(plexPrice) : '–', n: s.plexPrice > 0 ? 'Your price' : d.meta.plex ? `Lowest sell on the Global PLEX Market, ${ago(d.meta.plex.at, now)}` : 'Loading…' },
              { l: 'A month of Omega', v: iskBig(monthCost), n: `${units(s.plexPerMonth)} PLEX for 30 days` },
              { l: 'Tied up in trading', v: iskBig(pace.escrow + pace.stockAtCost), n: 'Buy order escrow plus stock at cost' },
            ].map((t) => (
              <div key={t.l} className="tile" style={cssVars({ '--c': 'var(--acc)', padding: '12px 14px', borderColor: 'var(--line-2)', borderTopColor: 'var(--acc)' })}>
                <div className="tile-l">{t.l}</div><div className="tile-v" style={{ color: 'var(--ink)' }}>{t.v}</div><div className="tile-n" style={{ fontSize: 11.5 }}>{t.n}</div>
              </div>
            ))}
          </div>
          <section className="panel" aria-label="Trading pace" data-rv="" style={{ clipPath: 'none' }}>
            <div className="panel-title">Could trading pay for it?</div>
            {!hasTrades ? (
              <p className="note">Once your positions have some sales, this shows your last 30 days of profit against the cost of Omega.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 2 }}>
                  {[
                    { l: 'Realized profit, last 30 days', v: iskBigSigned(pace.realized), c: pace.realized >= 0 ? 'var(--pos)' : 'var(--neg)', n: monthCost && pace.realized > 0 ? `${share(pace.realized / monthCost)} of a month of Omega` : '' },
                    ...(alpha ? [
                      { l: 'Fees Omega would have saved', v: iskBig(savings), c: 'var(--figure)', n: 'Same trades at your plan’s rates' },
                      { l: 'The same 30 days as Omega', v: iskBigSigned(asOmega), c: asOmega >= 0 ? 'var(--pos)' : 'var(--neg)', n: monthCost && asOmega > 0 ? `${share(asOmega / monthCost)} of a month of Omega` : '' },
                    ] : []),
                  ].map((t) => (
                    <div key={t.l}><div className="lbl">{t.l}</div><div className="mono" style={{ fontSize: 19, color: t.c, marginTop: 4 }}>{t.v}</div><div style={{ fontSize: 11.5, color: 'var(--note)' }}>{t.n}</div></div>
                  ))}
                </div>
                {monthCost && (
                  <>
                    <div style={{ position: 'relative', height: 8, marginTop: 14, background: 'var(--track)', border: '1px solid var(--line-3)' }}>
                      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, ((alpha ? asOmega : pace.realized) / monthCost) * 100))}%`, background: 'linear-gradient(90deg,var(--acc),var(--pos))', boxShadow: '0 0 12px color-mix(in oklab,var(--acc) 60%,transparent)', transition: 'width 1s cubic-bezier(.2,.8,.2,1)' }} />
                      <span className="lbl" style={{ position: 'absolute', right: 0, top: 12, fontSize: 10, letterSpacing: '.14em', color: 'var(--note)', fontWeight: 400 }}>One month of Omega</span>
                    </div>
                    <p style={{ margin: '26px 0 0', fontSize: 13, color: '#9fb3c5', textWrap: 'pretty' }}>
                      {alpha
                        ? asOmega >= monthCost ? `At your last 30 days’ pace, trading as Omega would cover the subscription and leave about ${iskBig(asOmega - monthCost)} a month.`
                          : asOmega > 0 ? `At your last 30 days’ pace, trading as Omega would cover ${share(asOmega / monthCost)} of the subscription.` : 'Your last 30 days of trading didn’t make a profit yet, even at Omega rates.'
                        : pace.realized >= monthCost ? `Your last 30 days of trading covered Omega with ${iskBig(pace.realized - monthCost)} to spare.`
                          : pace.realized > 0 ? `Your last 30 days of trading covered ${share(pace.realized / monthCost)} of a month of Omega.` : 'Your last 30 days of trading didn’t make a profit yet.'}
                      {' '}That’s a look back, not a forecast. Price-change fees aren’t in the savings estimate.
                    </p>
                  </>
                )}
              </>
            )}
          </section>
          <div data-rv="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 14 }}>
            <section aria-label="Alpha and Omega compared" className="panel flush" style={{ clipPath: 'none', overflow: 'auto' }}>
              <table className="tbl short" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th className="l" scope="col">Alpha and Omega compared</th>
                    {cols.map((c) => <th key={c.label} scope="col" style={{ color: c.now ? 'var(--acc)' : undefined }}>{c.label}{c.now ? ' · you' : ''}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Broker fee', (x: Rates) => pct(x.f)], ['Sales tax', (x: Rates) => pct(x.t)], ['Changing a price', (x: Rates) => pct(x.k)],
                    ['Break-even spread', (x: Rates) => pct(x.be, 1)], ['Fees on a 100 M ISK flip', (x: Rates) => iskBig(1e8 * (2 * x.f + x.t))],
                  ] as const).map(([l, fn]) => (
                    <tr key={l}>
                      <td className="l txt" style={{ color: 'var(--dim)', fontSize: 13 }}>{l}</td>
                      {cols.map((c) => <td key={c.label} style={{ color: c.now ? '#fff' : 'var(--cell)', background: c.now ? 'color-mix(in oklab,var(--acc) 10%,transparent)' : undefined }}>{fn(c.r)}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <td className="l txt" style={{ color: 'var(--dim)', fontSize: 13 }}>Order slots</td>
                    {cols.map((c) => <td key={c.label} style={{ color: c.now ? '#fff' : 'var(--cell)', background: c.now ? 'color-mix(in oklab,var(--acc) 10%,transparent)' : undefined }}>{units(c.slots)}</td>)}
                  </tr>
                </tbody>
              </table>
            </section>
            <section className="panel" style={{ clipPath: 'none', padding: 16 }}>
              <div className="panel-title">Your Omega skill plan</div>
              <LevelBoxes label="Accounting" value={s.planAcc} onChange={(n) => set({ planAcc: n })} />
              <LevelBoxes label="Broker Relations" value={s.planBr} onChange={(n) => set({ planBr: n })} />
              <LevelBoxes label="Advanced Broker Relations" value={s.planAbr} onChange={(n) => set({ planAbr: n })} />
            </section>
          </div>
        </div>
      </div>

      <section className="panel" aria-label="Skill payback" data-rv="">
        <div className="panel-head">
          <span className="panel-title">Skill payback</span>
          <span className="panel-sub">What the next level of each trade skill adds at your last 30 days of trading, ranked by ISK per day of training.</span>
        </div>
        {!d.meta.attributes && <p className="note small">Training times need your attributes, which come with the skills permission on the next sync. Until then the table ranks by what each level would add.</p>}
        <div className="tbl-scroll">
          <table className="tbl compact" style={{ minWidth: 900 }}>
            <thead><tr><th className="l">Skill</th><th className="l">Level</th><th>Training</th><th>Adds</th><th>Payback</th><th className="l">Why</th></tr></thead>
            <tbody>
              {ranked.map((x, i) => {
                const maxed = x.cur >= 5;
                const pd = perDay(x);
                return (
                  <tr key={x.key} style={{ opacity: maxed ? 0.5 : 1 }}>
                    <td className="l"><span className="row tight" style={{ flexWrap: 'nowrap' }}><span className="name" style={{ fontWeight: 400 }}>{x.name}</span>{i === 0 && pd > 0 && <span className="lbl" style={{ padding: '1px 7px', fontSize: 10, letterSpacing: '.08em', color: '#03121a', background: 'var(--pos)' }}>Train next</span>}</span></td>
                    <td className="l" style={{ color: 'var(--sec)' }}>{maxed ? `${ROMAN[x.cur]} · maxed` : `${ROMAN[x.cur]} → ${ROMAN[x.next]}`}</td>
                    <td>{maxed ? '—' : x.days == null ? '–' : `${x.days.toFixed(1)} days`}</td>
                    <td style={{ color: x.gain && x.gain > 0 ? 'var(--pos)' : '#90a5b8' }}>{maxed ? '—' : x.gain == null ? 'depends' : x.gain > 0 ? `${iskBig(x.gain)} / mo` : 'nothing yet'}</td>
                    <td style={{ color: 'var(--acc)' }}>{pd > 0 ? `${iskBig(pd)} per training day` : maxed ? '' : '—'}</td>
                    <td className="l wrap txt" style={{ color: 'var(--note)', paddingTop: 8, paddingBottom: 8 }}>{x.why}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {alpha && <p style={{ fontSize: 12.5, color: 'var(--acc2)' }}>As Alpha, Accounting and Advanced Broker Relations do nothing until you go Omega — the table uses your Omega rates.</p>}
      </section>

      <Guide
        title="How to use Omega"
        intro="What Omega costs, whether your trading pays for it, and which skills repay their training fastest."
        steps={[
          { icon: Gem, title: 'Pick a subscription length', body: 'Longer packs cost less per month, but you pay up front.' },
          { icon: Scale, title: 'Compare Alpha and Omega', body: 'Omega cuts broker fees and tax. The comparison shows what that’s worth on your own trading.' },
          { icon: GraduationCap, title: 'Train by payback', body: 'Skill payback ranks the next level of each trade skill by ISK per training day. Train the top one next.' },
        ]}
      />
    </div>
  );
}
