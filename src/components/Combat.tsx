import { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, CalendarCheck, ChevronRight, ClipboardCopy, Clock, Crosshair, ExternalLink, MapPin, Wrench, Zap } from 'lucide-react';
import { getAuth, hasScope } from '../lib/auth';
import { esi } from '../lib/esi';
import { typeKind } from '../lib/universe';
import { pool } from '../lib/lootMarket';
import { fmtDate, iskBig, iskBigSigned, pct, units } from '../lib/format';
import { useAuth, useNow } from '../lib/hooks';
import { CARGO_FLAGS, combatStats, finalBlow, fittingFromLoss, fleetShips, gankLineFor, isAbyssalSystem, multibuy, netLoss, type CombatActivity, type FittingItem } from '../lib/combat';
import { classify, usePricingState } from '../lib/killmails';
import { jitaBook, resolveNames } from '../lib/market';
import { marketBest } from '../lib/relist';
import { update, useData } from '../lib/store';
import { system } from '../lib/universe';
import { SCOPE } from '../lib/config';
import { toast } from '../lib/toast';
import type { KillParty, Killmail } from '../lib/types';
import { useEnsureNames, useTypeName } from './common';
import { useLearnedGankLines } from './gank';
import { Busy, Check, Empty, PageHead, Panel, Seg, Tiles } from './ui';

const DAY = 86400_000;
const KILLMAIL_SCOPE = SCOPE.killmails;
const ACT_COLOR: Record<CombatActivity, string> = { Abyssal: '#ff8d9a', Hauling: 'var(--acc2)', PvP: '#a98bff', PvE: '#7aa6ff' };

type SysInfo = { name: string; security: number };

export function Combat() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const name = useTypeName();
  const pricing = usePricingState();
  const [days, setDays] = useState<30 | 90>(30);
  const [filter, setFilter] = useState<'all' | 'kill' | 'loss'>('all');
  const [open, setOpen] = useState<number | null>(null);
  const all = useMemo(() => Object.values(d.killmails), [d.killmails]);
  const list = all.filter((k) => now - Date.parse(k.time) <= days * DAY);

  const [acts, setActs] = useState<Record<number, CombatActivity>>({});
  const key = all.map((k) => k.id).join(',');
  useEffect(() => {
    let alive = true;
    classify(all).then((m) => { if (alive) setActs(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const [systems, setSystems] = useState<Record<number, SysInfo>>({});
  const sysKey = [...new Set(list.map((k) => k.systemId).filter((id) => !isAbyssalSystem(id)))].join(',');
  useEffect(() => {
    if (!sysKey) return;
    let alive = true;
    Promise.all(sysKey.split(',').map(Number).map((id) => system(id).then((s) => [id, { name: s.name, security: s.security }] as const).catch(() => null)))
      .then((rows) => { if (alive) setSystems(Object.fromEntries(rows.filter((r): r is NonNullable<typeof r> => !!r))); });
    return () => { alive = false; };
  }, [sysKey]);
  useEnsureNames(list.flatMap((k) => [k.victim.shipTypeId ?? 0, ...k.attackers.flatMap((a) => [a.shipTypeId ?? 0, a.weaponTypeId ?? 0]), ...k.items.map((i) => i.typeId)]).filter(Boolean));

  const withAct = list.map((k) => ({ ...k, activity: acts[k.id] ?? (k.kind === 'loss' ? 'PvE' : 'PvP') as CombatActivity }));
  const st = combatStats(withAct);
  const shown = withAct.filter((k) => filter === 'all' || k.kind === filter).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const byAct = (['Abyssal', 'Hauling', 'PvP', 'PvE'] as CombatActivity[]).map((a) => ({ a, v: withAct.filter((k) => k.kind === 'loss' && k.activity === a).reduce((t, k) => t + netLoss(k), 0) }));
  const amax = Math.max(1, ...byAct.map((x) => x.v));
  const pvpPays = st.pvpDropped - st.pvpLost;

  const { learned, hulls } = useLearnedGankLines(d);
  const learnedList = Object.entries(learned);

  if (!all.length) {
    return (
      <div className="page">
        <Head days={days} setDays={setDays} />
        <Empty icon={Crosshair}>
          {!auth ? 'Log in to see your kills and losses. They come from your killmails, which only you can read.'
            : !(auth.scopes ?? []).includes(KILLMAIL_SCOPE) ? 'Your login doesn’t include the killmails permission. Add esi-killmails.read_killmails.v1 to your application, then log out and in again — Settings has the details.'
              : 'No killmails yet. ESI keeps your recent ones; they appear here after the next sync.'}
        </Empty>
      </div>
    );
  }

  const where = (k: Killmail) => {
    if (isAbyssalSystem(k.systemId)) return 'Abyssal deadspace';
    const s = systems[k.systemId];
    return s ? `${s.name} · ${s.security.toFixed(1)}` : '…';
  };

  return (
    <div className="page">
      <Head days={days} setDays={setDays} />
      {pricing.running && <Busy title="Pricing killmails at Jita on the day each happened" done={pricing.done} total={pricing.total} />}
      <Tiles min={190} items={[
        { l: 'ISK destroyed', v: iskBig(st.destroyed), n: `${st.kills} kill${st.kills === 1 ? '' : 's'}`, c: 'var(--pos)' },
        { l: 'ISK lost', v: st.lost ? `−${iskBig(st.lost)}` : '0', n: `${st.losses} loss${st.losses === 1 ? '' : 'es'}, net of insurance`, c: 'var(--neg)' },
        { l: 'Efficiency', v: st.efficiency == null ? '–' : pct(st.efficiency, 0), n: 'ISK destroyed ÷ all ISK involved', c: st.efficiency != null && st.efficiency >= 0.5 ? 'var(--pos)' : 'var(--acc2)' },
        { l: 'Does PvP pay?', v: iskBigSigned(pvpPays), n: 'Everything that dropped from PvP kills, less PvP losses — the most it could have paid', c: 'var(--acc)', tip: 'Loot only pays if you picked it up, and only half of what a ship carries drops. So this is the ceiling: if it is negative even here, PvP is costing you.' },
      ]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16, alignItems: 'start' }}>
        <section className="panel flush" data-rv="" aria-label="Timeline" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-bar">
            <span className="panel-title">Timeline</span>
            <Seg label="Show" value={filter} onChange={setFilter} options={[
              { v: 'all' as const, label: `All ${list.length}` },
              { v: 'kill' as const, label: `Kills ${list.filter((k) => k.kind === 'kill').length}` },
              { v: 'loss' as const, label: `Losses ${list.filter((k) => k.kind === 'loss').length}` },
            ]} />
          </div>
          {!shown.length ? <p className="note" style={{ padding: 30, textAlign: 'center' }}>Nothing in this period.</p> : (
            <div className="tbl-scroll">
              <table className="tbl" style={{ minWidth: 820 }}>
                <thead><tr>
                  <th scope="col" style={{ width: 30 }}><span className="sr-only">Expand</span></th>
                  <th scope="col" className="l">Ship</th><th scope="col" className="l">Where</th><th scope="col" className="l">Activity</th>
                  <th scope="col">When</th><th scope="col">ISK</th>
                </tr></thead>
                <tbody>
                  {shown.map((k) => {
                    const loss = k.kind === 'loss';
                    const isOpen = open === k.id;
                    const ago = Math.floor((now - Date.parse(k.time)) / DAY);
                    return [
                      <tr key={k.id} className={'click' + (isOpen ? ' open' : '')} onClick={() => setOpen(isOpen ? null : k.id)} aria-expanded={isOpen}>
                        <td><ChevronRight aria-hidden="true" style={{ width: 14, height: 14, color: 'var(--acc)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .25s' }} /></td>
                        <td className="l">
                          <span className="cellrow">
                            {k.victim.shipTypeId && <img src={`https://images.evetech.net/types/${k.victim.shipTypeId}/render?size=64`} alt="" width={36} height={36} style={{ background: '#0b1622', flex: 'none' }} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />}
                            <span style={{ minWidth: 0 }}>
                              <span className="row tight">
                                <span className="flag" style={{ fontSize: 10, color: loss ? 'var(--neg)' : 'var(--pos)', borderColor: loss ? 'var(--neg)' : 'var(--pos)' }}>{loss ? 'Loss' : 'Kill'}</span>
                                <span className="name">{k.victim.shipTypeId ? name(k.victim.shipTypeId) : 'Unknown ship'}</span>
                              </span>
                              <span className="sub">{loss ? (k.value ? (k.insurance ? `Fit ${iskBig(k.value.total)}, insurance ${iskBig(k.insurance)}` : `Fit ${iskBig(k.value.total)}, no insurance`) : 'Being priced') : `${k.attackers.length} attacker${k.attackers.length === 1 ? '' : 's'}`}
                                {loss && (() => { const f = finalBlow(k.attackers); return f?.shipTypeId ? ` · final blow from a ${name(f.shipTypeId)}${k.attackers.length > 1 ? `, ${units(k.attackers.length)} on the kill` : ''}` : ''; })()}</span>
                            </span>
                          </span>
                        </td>
                        <td className="l txt">{where(k)}</td>
                        <td className="l txt">{k.activity}</td>
                        <td style={{ color: 'var(--sec)' }}>{ago < 1 ? 'Today' : `${ago} day${ago === 1 ? '' : 's'} ago`}</td>
                        <td style={{ color: loss ? 'var(--neg-t)' : '#bff3d6' }}>{k.value ? `${loss ? '−' : '+'}${iskBig(loss ? netLoss(k) : k.value.total)}` : '…'}</td>
                      </tr>,
                      isOpen && <tr key={`${k.id}-x`} className="detail"><td colSpan={6} style={{ whiteSpace: 'normal', textAlign: 'left', padding: 0 }}><Detail k={k} where={where(k)} /></td></tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <Panel title="Losses by activity">
          <div className="col" style={{ gap: 9 }}>
            {byAct.map((x) => (
              <div key={x.a}>
                <div className="kv" style={{ fontSize: 13 }}><span style={{ color: 'var(--body)' }}>{x.a}</span><span className="v" style={{ color: 'var(--neg-t)' }}>{x.v ? `−${iskBig(x.v)}` : '0'}</span></div>
                <div className="track" style={{ marginTop: 4 }}><span className="fill" style={{ width: `${(x.v / amax) * 100}%`, background: ACT_COLOR[x.a] }} /></div>
              </div>
            ))}
          </div>
          <p className="note">These losses are charged to the activity they happened in, so Results and Side hustles show what each really earns once dying is included. An abyssal pocket is its own system; a hauler lost is a hauling loss whoever shot it.</p>
        </Panel>
        <Panel title="Learn from losses">
          <Check bare checked={d.prefs.learnFromLosses} onChange={(v) => update((x) => ({ prefs: { ...x.prefs, learnFromLosses: v } }))} desc="Lowers the gank line when you’ve been ganked">Adjust hauling risk from my losses</Check>
          <p className="note" style={{ color: '#b6c6d4' }}>
            {!d.prefs.learnFromLosses ? 'Turned off — the Hauling tab uses only the gank lines you set yourself.'
              : !learnedList.length ? 'None of your losses was a hauler ganked in Uedama or Sivala with cargo aboard, so there is nothing to learn yet.'
                : learnedList.map(([hull, l]) => {
                  const km = d.killmails[String(l.killmailId)];
                  const set = gankLineFor(hull, d.prefs.gankLines, learned, true);
                  return `Your ${km?.victim.shipTypeId ? name(km.victim.shipTypeId) : hull} was ganked in ${systems[l.systemId]?.name ?? 'a gank system'} carrying ${iskBig(l.value)}. The Hauling tab treats ${iskBig(set.line)} as the gank line for a ${hull}${set.from === 'learned' ? ', lower than any line you set' : ', the line you set being lower still'}.`;
                }).join(' ')}
          </p>
          {Object.keys(hulls).length > 0 && <p className="note small">Only players count: dying to rats says nothing about gankers.</p>}
        </Panel>
      </div>
      {hasScope(SCOPE.fittingsRead) && <SavedFits />}
    </div>
  );
}

type SavedFit = { fitting_id: number; name: string; ship_type_id: number; items: FittingItem[] };

/**
 * Your saved fittings, priced at today's Jita prices on a button (esi-fittings.read_fittings.v1): the hull and every
 * item at the cheapest listing that's the market (marketBest, as the refit list prices), with a Multibuy list for each.
 */
function SavedFits() {
  const name = useTypeName();
  const [fits, setFits] = useState<SavedFit[] | null>(null);
  const [prices, setPrices] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEnsureNames((fits ?? []).flatMap((f) => [f.ship_type_id, ...f.items.map((i) => i.type_id)]));
  const read = async () => {
    const a = getAuth();
    if (!a) return;
    setBusy('Reading your fittings…');
    try {
      const { data } = await esi<SavedFit[]>(`/characters/${a.characterId}/fittings/`, { auth: true });
      const types = [...new Set(data.flatMap((f) => [f.ship_type_id, ...f.items.map((i) => i.type_id)]))];
      const out: Record<number, number | null> = {};
      let done = 0;
      await pool(types, 6, async (t) => {
        try { out[t] = marketBest((await jitaBook(t)).topSells, false); } catch { out[t] = null; }
        setBusy(`Pricing ${++done} of ${types.length} items…`);
      });
      setPrices(out); setFits(data);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
    finally { setBusy(null); }
  };
  const lines = (f: SavedFit) => {
    const m = new Map<number, number>([[f.ship_type_id, 1]]);
    for (const i of f.items) m.set(i.type_id, (m.get(i.type_id) ?? 0) + i.quantity);
    return [...m.entries()].map(([typeId, qty]) => ({ typeId, qty }));
  };
  const cost = (f: SavedFit) => lines(f).reduce((t, l) => t + (prices[l.typeId] ?? 0) * l.qty, 0);
  const missing = (f: SavedFit) => lines(f).filter((l) => prices[l.typeId] == null).length;
  const copy = (f: SavedFit) => {
    const text = multibuy(lines(f).map((l) => ({ name: name(l.typeId), qty: l.qty })));
    navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it into the multibuy window in game.'), () => toast('Your browser wouldn’t let the page copy.', 'err'));
  };
  return (
    <Panel title="Your saved fittings" sub="What buying each one costs in Jita today">
      <div className="col" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn" disabled={!!busy} onClick={() => void read()}><Wrench aria-hidden="true" />{fits ? 'Price them again' : 'Price my saved fits'}</button>
          {busy && <span className="note small" style={{ margin: 0 }}>{busy}</span>}
        </div>
        {fits && (fits.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl compact" style={{ minWidth: 560 }}>
              <thead><tr><th scope="col" className="l">Fitting</th><th scope="col" className="l">Ship</th><th scope="col">Items</th><th scope="col" data-tip="The hull and every item at the cheapest Jita listing that is the market">Costs now</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{[...fits].sort((x, y) => cost(y) - cost(x)).map((f) => (
                <tr key={f.fitting_id}>
                  <td className="l"><span className="name">{f.name}</span></td>
                  <td className="l">{name(f.ship_type_id)}</td>
                  <td>{units(f.items.reduce((n, i) => n + i.quantity, 0))}</td>
                  <td>{iskBig(cost(f))}{missing(f) > 0 && <span className="sub">{units(missing(f))} not listed</span>}</td>
                  <td><button type="button" className="link-btn dim" onClick={() => copy(f)}><ClipboardCopy aria-hidden="true" />Multibuy</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="note">No saved fittings on this character.</p>)}
      </div>
    </Panel>
  );
}

function Head({ days, setDays }: { days: 30 | 90; setDays: (v: 30 | 90) => void }) {
  return (
    <PageHead
      kicker="09 · Kills & losses" title="Combat" wide
      lede="Your kills and losses from your killmails. Each one is priced at Jita on the day it happened and that value is kept, so a loss from three months ago shows what it cost you then — not what it would cost today. Refits use today’s prices, because that’s what you’d pay now."
      actions={<Seg label="Period" value={days} onChange={setDays} options={[{ v: 30 as const, label: '30 days' }, { v: 90 as const, label: '90 days' }]} />}
    />
  );
}

/** One killmail opened up: when and where, who was involved, and for a loss, the fit and a refit list. */
function Detail({ k, where }: { k: Killmail; where: string }) {
  const name = useTypeName();
  const loss = k.kind === 'loss';
  const [people, setPeople] = useState<Record<number, string>>({});
  useEffect(() => {
    const ids = [k.victim, ...k.attackers].flatMap((p) => [p.characterId, p.corporationId, p.allianceId, p.factionId]).filter((x): x is number => x != null);
    let alive = true;
    resolveNames(ids).then((n) => { if (alive) setPeople(n); }).catch(() => undefined);
    return () => { alive = false; };
  }, [k.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The fit, less anything that was only cargo: that is what you'd buy to fly it again.
  const fit = useMemo(() => {
    const m = new Map<number, { typeId: number; qty: number; dropped: number }>();
    if (k.victim.shipTypeId) m.set(k.victim.shipTypeId, { typeId: k.victim.shipTypeId, qty: 1, dropped: 0 });
    for (const i of k.items) {
      if (CARGO_FLAGS.has(i.flag)) continue;
      const cur = m.get(i.typeId) ?? { typeId: i.typeId, qty: 0, dropped: 0 };
      cur.qty += i.dropped + i.destroyed;
      cur.dropped += i.dropped;
      m.set(i.typeId, cur);
    }
    return [...m.values()];
  }, [k]);
  const [today, setToday] = useState<Record<number, number | null> | null>(null);
  useEffect(() => {
    if (!loss) return;
    let alive = true;
    (async () => {
      const out: Record<number, number | null> = {};
      await Promise.all(fit.map(async (f) => {
        try { out[f.typeId] = marketBest((await jitaBook(f.typeId)).topSells, false); } catch { out[f.typeId] = null; }
      }));
      if (alive) setToday(out);
    })();
    return () => { alive = false; };
  }, [k.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const then = (typeId: number) => (typeId === k.victim.shipTypeId ? k.value?.ship : k.value?.items[typeId]) ?? null;
  const thenT = fit.reduce((t, f) => t + (then(f.typeId) ?? 0) * f.qty, 0);
  const nowT = today ? fit.reduce((t, f) => t + (today[f.typeId] ?? 0) * f.qty, 0) : null;
  const unpricedNow = today ? fit.filter((f) => today[f.typeId] == null).length : 0;
  const text = multibuy(fit.map((f) => ({ name: name(f.typeId), qty: f.qty })));
  // Saving it as a fitting in game: charges loaded in guns go to the cargo, told apart by their category (8, Charge).
  const [saving, setSaving] = useState(false);
  const saveFit = async () => {
    const a = getAuth();
    if (!a || !k.victim.shipTypeId) return;
    setSaving(true);
    try {
      const cats = new Map<number, number>();
      await pool([...new Set(k.items.map((i) => i.typeId))], 6, async (t) => { try { cats.set(t, (await typeKind(t)).category); } catch { /* treated as a module */ } });
      const body = fittingFromLoss(k, name(k.victim.shipTypeId), where, (t) => cats.get(t) === 8);
      if (!body) return;
      await esi<{ fitting_id: number }>(`/characters/${a.characterId}/fittings/`, { auth: true, method: 'POST', body });
      toast(`Saved as “${body.name}” in your fittings. In game: the fitting window, Personal, then Buy All.`);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
    finally { setSaving(false); }
  };
  const totalDmg = k.attackers.reduce((t, a) => t + a.damage, 0) || 1;
  // The 12 who did most damage, and the final blow always, first when it isn't one of them.
  const shownAttackers = useMemo(() => {
    const top = [...k.attackers].sort((a, b) => b.damage - a.damage).slice(0, 12);
    const fb = finalBlow(k.attackers);
    return fb && !top.includes(fb) ? [fb, ...top] : top;
  }, [k]);
  const person = (p: KillParty) => (p.characterId ? people[p.characterId] ?? '…' : p.factionId ? people[p.factionId] ?? 'NPC' : 'NPC');
  const org = (p: KillParty) => [p.corporationId ? people[p.corporationId] : null, p.allianceId ? people[p.allianceId] : null].filter(Boolean).join(' · ') || '—';

  return (
    <div className="col" style={{ gap: 14, padding: '14px 16px 18px 46px', fontFamily: 'var(--f-body)', animation: 'unfold .3s ease-out' }}>
      <div className="row" style={{ gap: '8px 22px', fontSize: 12.5, color: 'var(--sec)' }}>
        <span className="row tight"><Clock aria-hidden="true" style={{ width: 13, height: 13, color: 'var(--acc)' }} />{k.time.slice(0, 16).replace('T', ' ')} EVE</span>
        <span className="row tight"><MapPin aria-hidden="true" style={{ width: 13, height: 13, color: 'var(--acc)' }} />{where}</span>
        <span className="row tight"><Zap aria-hidden="true" style={{ width: 13, height: 13, color: 'var(--acc)' }} />{units(k.victim.damage)} damage {loss ? 'taken' : 'dealt in total'}</span>
        {k.value && <span className="row tight" style={{ color: 'var(--acc2)' }}><CalendarCheck aria-hidden="true" style={{ width: 13, height: 13 }} />Priced at Jita on {fmtDate(k.value.priceDate)}{k.value.priceDate !== k.time.slice(0, 10) ? ', the nearest day anything traded' : ', the day it happened'}</span>}
        <a className="row tight link-btn" href={`https://zkillboard.com/kill/${k.id}/`} target="_blank" rel="noopener noreferrer" data-tip="This killmail on zKillboard, which also lists the fights around it">
          <ExternalLink aria-hidden="true" style={{ width: 13, height: 13 }} />zKillboard</a>
      </div>
      {k.value && k.value.unpriced.length > 0 && <p className="note small">{k.value.unpriced.length} item{k.value.unpriced.length === 1 ? '' : 's'} had no Jita trades near the day and count for nothing: {k.value.unpriced.slice(0, 4).map(name).join(', ')}{k.value.unpriced.length > 4 ? '…' : ''}.</p>}
      <div className="party" style={{ gridTemplateColumns: '34px minmax(0,1fr) auto', background: 'rgba(2,7,12,.5)', padding: '10px 12px' }}>
        {k.victim.characterId ? <img src={`https://images.evetech.net/characters/${k.victim.characterId}/portrait?size=64`} alt="" /> : <span className="ini">?</span>}
        <span style={{ minWidth: 0 }}>
          <span className="lbl" style={{ display: 'block' }}>{loss ? 'You' : 'Victim'}</span>
          <span style={{ display: 'block', fontSize: 14.5, color: 'var(--ink)' }}>{person(k.victim)}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--note)' }}>{org(k.victim)}</span>
        </span>
        <span style={{ textAlign: 'right' }}>
          <span className="lbl" style={{ display: 'block' }}>Ship</span>
          <span style={{ fontSize: 13, color: 'var(--body)' }}>{k.victim.shipTypeId ? name(k.victim.shipTypeId) : '—'}</span>
        </span>
      </div>
      <div>
        <div className="lbl" style={{ marginBottom: 6 }}>Involved · {units(k.attackers.length)}</div>
        {k.attackers.length > 3 && (() => {
          // A fleet gank can put hundreds on one killmail: the ships, counted, say more than a list of each.
          const f = fleetShips(k.attackers);
          return <p className="note small" style={{ margin: '0 0 8px' }}>Ships: {f.ships.map((x) => `${units(x.n)} ${name(x.typeId)}`).join(', ')}{f.rest ? `, and ${units(f.rest)} in other ships` : ''}{f.unknown ? `; ${units(f.unknown)} without a ship on record` : ''}.</p>;
        })()}
        <p className="note small" style={{ margin: '0 0 8px' }}>A killmail records each attacker’s ship and the weapon they used, not their fit. A pilot’s zKillboard page shows their own losses, and those show how they fit their ships.</p>
        <div style={{ overflowX: 'auto', border: '1px solid var(--line-3)' }}>
          <div style={{ minWidth: 640, padding: '0 12px' }}>
            {shownAttackers.map((a, i) => (
              <div key={i} className="party">
                {a.characterId ? <img src={`https://images.evetech.net/characters/${a.characterId}/portrait?size=64`} alt="" /> : <span className="ini">NPC</span>}
                <span style={{ minWidth: 0 }}>
                  <span className="row tight" style={{ fontSize: 13.5, color: 'var(--ink)' }}>{person(a)}{a.finalBlow && <span className="flag" style={{ fontSize: 9.5, color: 'var(--acc2)', borderColor: 'var(--acc2)' }}>Final blow</span>}
                    {a.characterId && <a className="link-btn dim" href={`https://zkillboard.com/character/${a.characterId}/`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      data-tip="Their kills and losses on zKillboard. Their losses show the fits they fly.">zKill</a>}</span>
                  <span className="ellipsis" style={{ display: 'block', fontSize: 12, color: 'var(--note)' }}>{org(a)}</span>
                </span>
                <span className="opt" style={{ minWidth: 0 }}>
                  <span className="ellipsis" style={{ display: 'block', fontSize: 13, color: 'var(--body)' }}>{a.shipTypeId ? name(a.shipTypeId) : '—'}</span>
                  <span className="ellipsis" style={{ display: 'block', fontSize: 12, color: 'var(--note)' }}>{a.weaponTypeId ? name(a.weaponTypeId) : '—'}</span>
                </span>
                <span className="opt row tight" style={{ flexWrap: 'nowrap' }} data-tip="Share of the damage dealt">
                  <span className="track" style={{ flex: 1 }}><span className="fill" style={{ width: `${(a.damage / totalDmg) * 100}%`, background: '#ff8d9a' }} /></span>
                  <span className="mono" style={{ fontSize: 12 }}>{pct(a.damage / totalDmg, 0)}</span>
                </span>
                <span className="mono" data-tip="Security status" style={{ textAlign: 'right', fontSize: 12, color: a.security != null && a.security < 0 ? '#ff8d9a' : '#6ee7a8' }}>{a.security != null ? a.security.toFixed(1) : ''}</span>
              </div>
            ))}
            {k.attackers.length > shownAttackers.length && <p className="note small" style={{ padding: '8px 0' }}>And {units(k.attackers.length - shownAttackers.length)} more.</p>}
          </div>
        </div>
      </div>
      {loss && fit.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 14 }}>
          <div style={{ border: '1px solid var(--line-3)', overflowX: 'auto' }}>
            <table className="tbl short">
              <thead><tr>
                <th scope="col" className="l">Lost fit</th><th scope="col">Qty</th><th scope="col" className="l">Fate</th>
                <th scope="col" data-tip="Jita price on the day you lost it — this is what the loss cost you">Then</th>
                <th scope="col" data-tip="Jita price today — what a refit costs now">Today</th>
              </tr></thead>
              <tbody>
                {fit.map((f) => (
                  <tr key={f.typeId}>
                    <td className="l txt" style={{ whiteSpace: 'normal', color: 'var(--body)' }}>{name(f.typeId)}</td>
                    <td>{units(f.qty)}</td>
                    <td className="l" style={{ fontFamily: 'var(--f-body)', fontSize: 11.5, color: f.dropped ? 'var(--acc2)' : 'var(--sec)' }}>{f.dropped === f.qty && f.dropped ? 'Dropped' : f.dropped ? `${f.dropped} dropped` : 'Destroyed'}</td>
                    <td>{then(f.typeId) != null ? iskBig(then(f.typeId)! * f.qty) : '–'}</td>
                    <td style={{ color: 'var(--sec)' }}>{!today ? '…' : today[f.typeId] != null ? iskBig(today[f.typeId]! * f.qty) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="col" style={{ gap: 10, padding: 14, background: 'rgba(2,7,12,.5)', border: '1px solid var(--line-3)' }}>
            <div className="kv" style={{ alignItems: 'baseline' }}>
              <span className="lbl">Refit at today’s prices</span>
              <span style={{ textAlign: 'right' }}>
                <span className="mono" style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>{nowT == null ? '…' : iskBig(nowT)}</span>
                {nowT != null && thenT > 0 && <span style={{ display: 'block', fontSize: 11.5, color: nowT > thenT ? '#ffc4cb' : '#6ee7a8' }}>{nowT >= thenT ? '+' : ''}{pct(nowT / thenT - 1, 1)} vs when you lost it</span>}
              </span>
            </div>
            {unpricedNow > 0 && <p className="note small">{unpricedNow} item{unpricedNow === 1 ? ' has' : 's have'} no sell orders in Jita right now and {unpricedNow === 1 ? 'isn’t' : 'aren’t'} in the total.</p>}
            <pre style={{ margin: 0, padding: 10, maxHeight: 180, overflow: 'auto', background: 'rgba(0,0,0,.35)', border: '1px solid var(--line-3)', fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--sec)', whiteSpace: 'pre-wrap' }}>{text}</pre>
            <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn primary sm" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it into the multibuy window in game.'), () => toast('Your browser wouldn’t let the page copy. Select the list and copy it by hand.', 'warn'))}>
                <ClipboardCopy aria-hidden="true" />Copy for multibuy
              </button>
              {hasScope(SCOPE.fittingsWrite) && <button type="button" className="btn sm" disabled={saving} onClick={() => void saveFit()}
                data-tip="Adds this fit to your fittings in game, so the fitting window’s Buy All re-buys it. It never changes or deletes a fitting."><BookmarkPlus aria-hidden="true" />{saving ? 'Saving…' : 'Save this fit in game'}</button>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
