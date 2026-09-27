import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { get } from 'idb-keyval';
import {
  BellRing, Database, Download, GraduationCap, HardDriveDownload, LogIn, LogOut, Mail, Palette, Percent, RefreshCw, Send, Trash2, Upload, UserRound,
} from 'lucide-react';
import { effectiveSkills, orderSlots, rates, RELIST_LEFT, sanitizeSettings, type Settings as S } from '../lib/fees';
import { ago, iskBig, iskBigSigned, pct, plainNum, units } from '../lib/format';
import { cacheStore, clearAll, exportAll, importAll, parseBackup, update, useData } from '../lib/store';
import { confirmAsk } from '../lib/confirm';
import { isConfigured, login, loginMailer, logout, logoutMailer } from '../lib/auth';
import { syncCharacter, useSyncState } from '../lib/sync';
import { navigate, useAuth, useMailer, useNow, type Route } from '../lib/hooks';
import { ALPHA_CAPS, REDIRECT_URI, SCOPE, SCOPE_INFO, SCOPES } from '../lib/config';
import { ALERT_EVENTS, ALERT_SIZES, MAIL_KEEP, THEMES, TOAST_SECONDS } from '../lib/prefs';
import { ALERT_LABELS, tidyEvery } from '../lib/alerts';
import { testAlert, testMail, useAlertRunner, BACKUP_DAYS } from '../lib/alertsRunner';
import { useMotion, bumpWarp } from '../lib/motion';
import { toast } from '../lib/toast';
import type { Motion, Theme } from '../lib/types';
import { downloadText, LevelBoxes } from './common';
import { CloneSwitch } from './Omega';
import { useSkillPayback } from './payback';
import { Check, cssVars, Notice, NumChip, PageHead, Seg } from './ui';

type Tab = 'account' | 'skills' | 'rates' | 'alerts' | 'appearance' | 'data';
const TABS: Tab[] = ['account', 'skills', 'rates', 'alerts', 'appearance', 'data'];
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

/** A plain labelled number field for the settings forms. Tidies itself when you leave it. */
function NumField(props: { id: string; label: string; value: number; hint?: string; disabled?: boolean; onChange: (n: number) => void }) {
  const [text, setText] = useState(plainNum(props.value));
  const [focused, setFocused] = useState(false);
  return (
    <div className="field">
      <label htmlFor={props.id} style={{ fontSize: 10.5, letterSpacing: '.06em', color: 'var(--dim)' }}>{props.label}</label>
      <input
        id={props.id} className="num" inputMode="decimal" value={focused ? text : plainNum(props.value)} disabled={props.disabled}
        onFocus={() => { setText(plainNum(props.value)); setFocused(true); }} onBlur={() => setFocused(false)}
        onChange={(e) => { setText(e.target.value); const n = parseFloat(e.target.value.replace(/,/g, '').replace('%', '')); if (Number.isFinite(n)) props.onChange(n); }}
        style={{ height: 34 }}
      />
      {props.hint && <span className="hint" style={{ fontSize: 11.5, color: 'var(--faint)' }}>{props.hint}</span>}
    </div>
  );
}

function Card({ title, children, right, style }: { title: ReactNode; children: ReactNode; right?: ReactNode; style?: React.CSSProperties }) {
  return (
    <section className="panel" style={{ clipPath: 'none', padding: '16px 18px', ...style }}>
      <div className="panel-head"><span className="panel-title">{title}</span>{right}</div>
      {children}
    </section>
  );
}

export function Settings({ route }: { route: Route }) {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const tab: Tab = TABS.includes(route.path[1] as Tab) ? (route.path[1] as Tab) : 'account';
  const s = d.settings;
  const r = rates(s);
  const slots = orderSlots(effectiveSkills(s));
  const missing = SCOPES.filter((sc) => !(auth?.scopes ?? []).includes(sc)).length;
  const last = d.meta.lastBackupAt ? Date.parse(d.meta.lastBackupAt) : null;
  const backupDays = last == null ? null : Math.floor((now - last) / 86400_000);
  const backupOld = last == null || now - last > BACKUP_DAYS * 86400_000;
  const motion = useMotion();

  const tabs: { k: Tab; label: string; Icon: typeof UserRound; sub: string; dot?: string }[] = [
    { k: 'account', label: 'Account', Icon: UserRound, sub: auth ? `${auth.characterName}${missing ? ` · ${missing} permission${missing === 1 ? '' : 's'} missing` : ''}` : 'Not logged in', dot: auth && missing ? 'var(--acc2)' : undefined },
    { k: 'skills', label: 'Skills & slots', Icon: GraduationCap, sub: `${slots} order slots` },
    { k: 'rates', label: 'Rates & fees', Icon: Percent, sub: `Broker ${pct(r.f)} · tax ${pct(r.t)}` },
    { k: 'alerts', label: 'Alerts', Icon: BellRing, sub: d.alerts.on ? `On · every ${d.alerts.interval} min` : 'Off', dot: d.alerts.on ? 'var(--pos)' : undefined },
    { k: 'appearance', label: 'Appearance', Icon: Palette, sub: `${d.prefs.theme} · motion ${motion.toLowerCase()}` },
    { k: 'data', label: 'Your data', Icon: Database, sub: backupDays == null ? 'Never backed up' : `Last backup ${backupDays} day${backupDays === 1 ? '' : 's'} ago`, dot: backupOld ? 'var(--acc2)' : undefined },
  ];

  return (
    <div className="page">
      <PageHead kicker="10 · Pilot configuration" title="Settings" lede="Your character, trade skills and rates. Everything is saved in this browser." />
      <div className="set-layout">
        <nav className="set-nav panel" aria-label="Settings sections" role="tablist" data-rv="" style={{ padding: 10, gap: 4 }}>
          {tabs.map((t) => (
            <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className="set-tab" onClick={() => navigate(`settings/${t.k}`)} style={cssVars({ '--c': t.dot })}>
              <t.Icon aria-hidden="true" />
              <span style={{ minWidth: 0 }}><span className="st">{t.label}</span><span className="ss">{t.sub}</span></span>
              <span className="sd" aria-hidden="true" style={t.dot ? { boxShadow: `0 0 8px ${t.dot}` } : undefined} />
            </button>
          ))}
        </nav>
        <div className="col" style={{ gap: 16, minWidth: 0 }} role="tabpanel" key={tab}>
          {tab === 'account' ? <Account /> : tab === 'skills' ? <Skills /> : tab === 'rates' ? <RatesTab /> : tab === 'alerts' ? <Alerts /> : tab === 'appearance' ? <Appearance /> : <DataTab />}
        </div>
      </div>
    </div>
  );
}

const set = (patch: Partial<S>) => update((x) => ({ settings: sanitizeSettings({ ...x.settings, ...patch }) }));
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 16, alignItems: 'stretch', animation: 'rise .35s cubic-bezier(.2,.8,.2,1)' } as const;
const gridC = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 16, alignContent: 'start', animation: 'rise .45s cubic-bezier(.2,.8,.2,1)' } as const;

function Account() {
  const d = useData();
  const auth = useAuth();
  const sync = useSyncState();
  const now = useNow(60_000);
  const [imgOk, setImgOk] = useState(true);
  const granted = auth?.scopes ?? [];
  const missing = SCOPES.filter((sc) => !granted.includes(sc));
  const s = d.settings;
  const detected = d.meta.cloneDetected
    ? `Read from ${auth?.characterName ?? 'your character'}’s skills on the last sync.`
    : auth ? 'ESI doesn’t report clone state directly, and your skills don’t show it yet, so set it here.'
      : 'Alpha clones can’t use Accounting or Advanced Broker Relations, and only use Broker Relations up to level II.';

  return (
    <>
      <div style={grid2}>
        <section className="panel" aria-label="Character" style={{ padding: 18, gap: 14 }}>
          <div className="panel-title">Character</div>
          {!isConfigured() ? (
            <div className="notice warn">
              <div>No EVE client ID is set, so login is off. Register an application on developers.eveonline.com with the callback URL <code>{REDIRECT_URI}</code> and set <code>VITE_EVE_CLIENT_ID</code> as the README describes.</div>
            </div>
          ) : auth ? (
            <>
              <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
                <div style={{ position: 'relative', width: 64, height: 64, flex: 'none' }}>
                  <div className="keep-motion" style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: '1px solid color-mix(in oklab,var(--acc) 40%,transparent)', borderRightColor: 'var(--acc)', animation: 'spin 6s linear infinite' }} />
                  {imgOk
                    ? <img src={`https://images.evetech.net/characters/${auth.characterId}/portrait?size=128`} alt="" width={64} height={64} style={{ borderRadius: '50%', display: 'block' }} onError={() => setImgOk(false)} />
                    : <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 35% 30%,color-mix(in oklab,var(--acc) 35%,#0b1622),#050b12)', fontFamily: 'var(--f-head)', fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>{auth.characterName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--f-head)', fontWeight: 600, fontSize: 20, color: 'var(--ink)' }}>{auth.characterName}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--label)' }}>Last synced {ago(d.meta.lastSync, now)}</div>
                </div>
              </div>
              {sync.error && <div className="notice err" role="alert"><div>Sync failed: {sync.error}</div></div>}
              <div className="row">
                <button type="button" className="btn primary" disabled={sync.running} onClick={() => syncCharacter()}><RefreshCw aria-hidden="true" className={sync.running ? 'spinning' : undefined} />{sync.running ? 'Syncing…' : 'Sync now'}</button>
                <button type="button" className="btn" onClick={async () => {
                  if (!(await confirmAsk({ title: 'Log out of EVE Online?', body: 'Your ledger stays in this browser. You’ll need to log in again to sync new trades.', confirm: 'Log out' }))) return;
                  await logout(); toast('Logged out. The refresh token was revoked.', 'info');
                }}><LogOut aria-hidden="true" />Log out</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13.5 }}>
                Log in to fill in your skills, standings and clone state and to track your trades. Everything it asks for is read-only — ESI has no way to place,
                change or cancel an order, so nothing here can trade for you. The one exception writes nothing: opening a market window in your client.
              </p>
              <div><button type="button" className="btn primary" onClick={() => login().catch((e) => toast(String(e.message ?? e), 'err'))}><LogIn aria-hidden="true" />Log in with EVE Online</button></div>
            </>
          )}
          <div>
            <div className="lbl" style={{ fontSize: 11, letterSpacing: '.18em', marginBottom: 6 }}>Permissions</div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--label)', textWrap: 'pretty' }}>
              {!granted.length
                ? 'Tick each of these on your application at developers.eveonline.com. Each one is read-only.'
                : !missing.length ? 'All granted. Everything in the app has what it needs.'
                  : `${missing.length} of ${SCOPES.length} not granted. Each must be ticked on your application at developers.eveonline.com first, then log out and in again here.`}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 4 }}>
              {SCOPES.map((sc) => {
                const info = SCOPE_INFO[sc];
                const has = granted.includes(sc);
                const dot = !granted.length ? 'var(--faint)' : has ? 'var(--pos)' : 'var(--acc2)';
                return (
                  <div key={sc} style={{ display: 'flex', gap: 10, padding: '8px 10px', background: 'rgba(2,7,12,.4)', borderLeft: `2px solid ${dot}` }}>
                    <span style={{ width: 7, height: 7, marginTop: 6, borderRadius: '50%', flex: 'none', background: dot, boxShadow: `0 0 6px ${dot}` }} aria-hidden="true" />
                    <div style={{ minWidth: 0 }}>
                      <div className="row tight"><b style={{ fontSize: 13, fontWeight: 600, color: 'var(--figure)' }}>{info?.label ?? sc}</b>{granted.length > 0 && !has && <span className="flag plain" style={{ fontSize: 10 }}>not granted</span>}</div>
                      <code style={{ display: 'block', fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--faint-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc}</code>
                      <span style={{ fontSize: 12, color: 'var(--label)' }}>{info?.unlocks}</span>
                      {granted.length > 0 && !has && info && <span style={{ display: 'block', fontSize: 12, color: 'var(--acc2)' }}>Without it: {info.without}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="lbl" style={{ fontSize: 11, letterSpacing: '.18em', marginBottom: 6 }}>Clone state</div>
            <CloneSwitch value={s.clone} onChange={(v) => set({ clone: v })} />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--note)' }}>{detected}</p>
          </div>
          <Check bare checked={s.fromCharacter} onChange={(v) => set({ fromCharacter: v })}>Fill skills, standings and clone state from my character when I sync</Check>
        </section>
      </div>
      <div style={gridC}>
        <Card title="Sync history">
          {!d.meta.syncLog?.length ? <p className="note">No syncs yet{auth ? '. The first one starts on its own within a minute.' : ' — log in first.'}</p> : (
            <div>
              {d.meta.syncLog.map((x) => (
                <div key={x.at} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0,1fr) auto', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--line-4)' }}>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--faint)' }}>{new Date(x.at).toISOString().slice(5, 16).replace('T', ' ')}</span>
                  <span style={{ fontSize: 13, color: 'var(--body)', textTransform: 'capitalize' }}>{x.what}</span>
                  <span style={{ fontSize: 11.5, color: x.ok ? 'var(--pos)' : 'var(--neg)', whiteSpace: 'nowrap' }}>{x.ok ? `OK${x.added ? ` · ${x.added} trade${x.added === 1 ? '' : 's'}` : ''}` : 'Failed'}</span>
                </div>
              ))}
            </div>
          )}
          <p className="note small">Times in EVE time. ESI decides when each kind of data can change; the app asks the moment it can.</p>
        </Card>
      </div>
    </>
  );
}

function Skills() {
  const d = useData();
  const auth = useAuth();
  const s = d.settings;
  const alpha = s.clone === 'alpha';
  const locked = !!auth && s.fromCharacter;
  const cap = (k: keyof typeof ALPHA_CAPS) => (alpha ? ALPHA_CAPS[k] : null);
  const slots = orderSlots(effectiveSkills(s));
  const used = Object.values(d.orders).filter((o) => o.state === 'open').length;
  const { rows, perDay } = useSkillPayback(d);
  const next = rows.filter((x) => perDay(x) > 0).slice(0, 2);

  return (
    <>
      <div style={grid2}>
        <section className="panel" aria-label="Skills and standings" style={{ padding: 18, gap: 14, clipPath: 'none' }}>
          <div className="panel-title">Skills and standings</div>
          <p style={{ margin: '-6px 0 0', fontSize: 12, color: 'var(--label)', textWrap: 'pretty' }}>
            {locked ? `Trained levels, filled from ${auth!.characterName} on each sync. ` : 'Set the levels you’ve trained. '}
            {alpha && 'Striped boxes are trained but locked while you’re Alpha; they switch on when you go Omega.'}
          </p>
          <LevelBoxes label="Accounting" help={`Cuts sales tax by 11% per level.${alpha ? ' Omega only.' : ''}`} value={s.acc} cap={cap('acc')} disabled={locked} onChange={(n) => set({ acc: n })} />
          <LevelBoxes label="Broker Relations" help={`Cuts the broker fee by 0.3 points per level.${alpha ? ' Alpha can use up to level II.' : ''}`} value={s.br} cap={cap('br')} disabled={locked} onChange={(n) => set({ br: n })} />
          <LevelBoxes label="Advanced Broker Relations" help={`Cuts the fee for changing an order’s price.${alpha ? ' Omega only.' : ''}`} value={s.abr} cap={cap('abr')} disabled={locked} onChange={(n) => set({ abr: n })} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
            <NumField id="s-fac" label="Caldari State standing" value={s.faction} disabled={locked} onChange={(n) => set({ faction: n })} />
            <NumField id="s-corp" label="Caldari Navy standing" value={s.corp} disabled={locked} onChange={(n) => set({ corp: n })} />
          </div>
          <p style={{ margin: '-4px 0 0', fontSize: 11.5, color: 'var(--faint)' }}>Base standing from 0 to 10. Skills that boost standings don’t lower the broker fee.</p>
        </section>
        <section className="panel" aria-label="Order slots" style={{ padding: 18, gap: 14, clipPath: 'none' }}>
          <div className="panel-head"><span className="panel-title">Order slots</span><span className="mono" style={{ fontSize: 26, color: 'var(--acc)' }}>{slots}</span></div>
          <p style={{ margin: '-8px 0 0', fontSize: 12, color: 'var(--label)' }}>How many buy and sell orders you can have open at once. You start with 5.</p>
          <LevelBoxes label="Trade" help={`4 more orders per level.${alpha ? ' Alpha can use up to level III.' : ''}`} value={s.trade} cap={cap('trade')} disabled={locked} onChange={(n) => set({ trade: n })} />
          <LevelBoxes label="Retail" help={`8 more orders per level.${alpha ? ' Omega only.' : ''}`} value={s.retail} cap={cap('retail')} disabled={locked} onChange={(n) => set({ retail: n })} />
          <LevelBoxes label="Wholesale" help={`16 more orders per level.${alpha ? ' Omega only.' : ''}`} value={s.wholesale} cap={cap('wholesale')} disabled={locked} onChange={(n) => set({ wholesale: n })} />
          <LevelBoxes label="Tycoon" help={`32 more orders per level.${alpha ? ' Omega only.' : ''}`} value={s.tycoon} cap={cap('tycoon')} disabled={locked} onChange={(n) => set({ tycoon: n })} />
        </section>
      </div>
      <div style={gridC}>
        <Card title="Order slots in use">
          <div className="row" style={{ alignItems: 'baseline' }}><span className="mono" style={{ fontSize: 34, color: 'var(--acc)' }}>{used}</span><span style={{ fontSize: 13, color: 'var(--sec)' }}>of {slots} slots</span></div>
          <div className="track h10" style={{ height: 14 }}><span className="fill" style={{ width: `${Math.min(100, (used / Math.max(1, slots)) * 100)}%` }} /></div>
          <p className="note">{used < slots * 0.8 ? 'Plenty of room — more slots won’t earn you anything until you’re close to full.' : 'You’re close to full. Slot skills are worth training now.'}</p>
        </Card>
        <Card title="Train next">
          {!next.length ? <p className="note">Nothing to rank yet. Skill payback needs your last 30 days of trading and your attributes, which a sync with the skills permission brings.</p> : (
            <div>
              {next.map((x) => (
                <div key={x.key} className="lrow">
                  <span><span className="lt">{x.name} <span style={{ color: 'var(--sec)' }}>{ROMAN[x.cur]} → {ROMAN[x.next]}</span></span><span className="ls">{x.days != null ? `${x.days.toFixed(1)} days of training` : 'Training time unknown'}</span></span>
                  <span className="lv" style={{ color: 'var(--pos)' }}>+{iskBig(x.gain ?? 0)} / mo</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('omega')}>See all on the Omega page</button>
        </Card>
      </div>
    </>
  );
}

function RatesTab() {
  const d = useData();
  const s = d.settings;
  const r = rates(s);
  const alpha = s.clone === 'alpha';
  const bb = Math.max(100, r.f * 1e8), bs = Math.max(100, r.f * 1.1e8), tx = r.t * 1.1e8;
  const rl = r.k * RELIST_LEFT * (1e8 + 1.1e8);
  const total = bb + bs + tx + rl;
  const bePct = Math.min(100, (r.be / 0.2) * 100);
  return (
    <>
      <div style={grid2}>
        <section className="panel" aria-label="Rates" style={{ padding: 18, gap: 14, clipPath: 'none' }}>
          <div className="panel-title">Rates</div>
          <NumField id="s-tax" label="Base sales tax %" value={s.taxBase} hint="Before Accounting. Check it against the game." onChange={(n) => set({ taxBase: n })} />
          <NumField id="s-target" label="Target return %" value={s.target} hint="Used to judge each trade." onChange={(n) => set({ target: n })} />
          <NumField id="s-share" label="Share of daily volume %" value={s.share} hint="Your guess at the share of one side of the volume you capture. It is scaled for how many orders you queue among." onChange={(n) => set({ share: n })} />
          <NumField id="s-wait" label="Hours you’ll wait before relisting" value={s.waitHours} hint="Orders whose queue clears inside this are told to wait." onChange={(n) => set({ waitHours: n })} />
          <Check bare checked={s.override} onChange={(on) => {
            const cur = rates({ ...s, override: false });
            set(on ? { override: true, brokerPct: +(cur.f * 100).toFixed(2), taxPct: +(cur.t * 100).toFixed(3) } : { override: false });
          }}>Use my exact broker fee and sales tax from the game</Check>
          {s.override && (
            <div className="col" style={{ gap: 8, animation: 'unfold .3s ease-out' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                <NumField id="s-bp" label="Broker fee %" value={s.brokerPct} onChange={(n) => set({ brokerPct: n })} />
                <NumField id="s-tp" label="Sales tax %" value={s.taxPct} onChange={(n) => set({ taxPct: n })} />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--acc2)' }}>Update these when you switch between Alpha and Omega; exact rates don’t follow your clone state.</p>
            </div>
          )}
          <div style={{ padding: '12px 14px', background: 'color-mix(in oklab,var(--acc) 6%,rgba(2,7,12,.6))', border: '1px solid color-mix(in oklab,var(--acc) 25%,transparent)' }}>
            {[['Rates as', s.override ? 'Exact' : alpha ? 'Alpha' : 'Omega'], ['Broker fee', pct(r.f)], ['Sales tax', pct(r.t)], ['Changing a price', `${pct(r.k)} of what’s left`], ['Break-even spread', pct(r.be, 1)]].map(([l, v]) => (
              <div key={l} className="kv" style={{ padding: '4px 0' }}><span style={{ color: 'var(--dim)' }}>{l}</span><span className="v" style={{ color: 'var(--ink)', fontSize: 13 }}>{v}</span></div>
            ))}
          </div>
        </section>
      </div>
      <div style={gridC}>
        <Card title="On a 100 M ISK flip">
          <div>
            {[
              ['Broker fee, buy order', 'On the 100 M buy', `−${iskBig(bb)}`],
              ['Broker fee, sell order', 'On the 110 M sell', `−${iskBig(bs)}`],
              ['Sales tax', 'On the 110 M sell', `−${iskBig(tx)}`],
              ['Two price changes', `One on each order, on the ${Math.round(RELIST_LEFT * 100)}% assumed left`, `−${iskBig(rl)}`],
            ].map(([l, n, v]) => <div key={l} className="lrow"><span><span className="lt" style={{ fontSize: 13 }}>{l}</span><span className="ls">{n}</span></span><span className="lv" style={{ color: 'var(--neg-t)', fontSize: 12.5 }}>{v}</span></div>)}
            <div className="lrow"><span><span className="lt" style={{ fontSize: 13 }}><b>Fees and tax in total</b></span><span className="ls">Out of a 10 M spread</span></span><span className="lv" style={{ color: 'var(--acc2)', fontSize: 12.5 }}>−{iskBig(total)}</span></div>
            <div className="lrow"><span><span className="lt" style={{ fontSize: 13 }}><b>You keep</b></span><span className="ls">After everything</span></span><span className="lv" style={{ color: 'var(--pos)', fontSize: 12.5 }}>{iskBigSigned(1e7 - total)}</span></div>
          </div>
        </Card>
        <Card title="Break-even spread">
          <div className="row" style={{ alignItems: 'baseline' }}><span className="mono" style={{ fontSize: 34, color: 'var(--acc)' }}>{pct(r.be, 2)}</span><span style={{ fontSize: 13, color: 'var(--sec)' }}>the smallest spread that pays anything</span></div>
          <div style={{ position: 'relative', height: 14, background: 'var(--track)', border: '1px solid var(--line-2)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${bePct}%`, background: 'linear-gradient(90deg,var(--neg),var(--acc2))' }} />
            <div style={{ position: 'absolute', left: `${bePct}%`, top: -4, bottom: -4, width: 2, background: '#fff' }} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--faint)' }}><span>0%</span><span>10%</span><span>20%</span></div>
          <p className="note">Anything left of the marker loses money after fees. Every level of Broker Relations or Accounting moves it left.</p>
        </Card>
      </div>
    </>
  );
}

function Alerts() {
  const d = useData();
  const a = d.alerts;
  const now = useNow(1000);
  const runner = useAlertRunner();
  const setA = (patch: Partial<typeof a>) => update((x) => ({ alerts: { ...x.alerts, ...patch } }));
  const next = runner.lastRun == null ? a.interval * 60_000 : Math.max(0, runner.lastRun + a.interval * 60_000 - now);
  const mm = Math.floor(next / 60_000), ss = String(Math.floor((next % 60_000) / 1000)).padStart(2, '0');
  const day = d.alertLog.filter((l) => !l.test && now - Date.parse(l.at) < 86400_000);
  const counts = ALERT_EVENTS.map((k) => ({ k, n: day.filter((l) => l.kind === k).length }));
  const mx = Math.max(1, ...counts.map((c) => c.n));
  const COL: Record<string, string> = { move: 'var(--acc2)', clearing: '#90a5b8', squeeze: 'var(--neg)', pi: 'var(--pos)', scam: 'var(--neg-l)', backup: 'var(--acc2)' };
  const z = d.prefs.alertSize;

  // Only switch on what can actually fire: a box ticked while the browser blocks notifications
  // would promise alerts that never come.
  const toggleBrowser = async () => {
    if (a.browser) { setA({ browser: false }); return; }
    if (typeof Notification === 'undefined') { toast('This browser can’t show notifications from a web page.', 'warn'); return; }
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* the browser said no */ }
    }
    if (Notification.permission !== 'granted') { toast('Your browser is blocking notifications for this site. Allow them in its site settings, then tick this again.', 'warn'); return; }
    setA({ browser: true });
  };

  return (
    <>
      <div style={grid2}>
        <section className="panel" aria-label="Alerts" style={{ padding: 18, gap: 14 }}>
          <div className="panel-head"><span className="panel-title">Undercut alerts</span><button type="button" className="link-btn" onClick={testAlert}><Send aria-hidden="true" />Send a test</button></div>
          <Check bare checked={a.on} onChange={(v) => setA({ on: v })} desc="Turn off to stop every alert below">Watch my orders while this tab is open</Check>
          <p style={{ margin: '-4px 0 0', fontSize: 12, color: 'var(--note)', textWrap: 'pretty' }}>
            {a.on && !runner.leader ? 'Another Jita Ledger tab is doing the checking, so nothing is raised twice. This one takes over if that tab closes.'
              : a.on ? `ESI refreshes the order book every 5 minutes, so checking more often can’t show anything new. Next check in ${mm}:${ss}.` : 'Nothing is being checked. Turn alerts on to watch your orders while this tab is open — a web page cannot watch anything once it is closed.'}
          </p>
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Check</div>
            <Seg label="How often to check" value={a.interval} onChange={(v) => setA({ interval: v })} options={[5, 15, 30, 60].map((m) => ({ v: m, label: m === 5 ? 'Every book refresh (5 min)' : `${m} min` }))} />
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Alert size</div>
            <div className="row wide">
              <Seg label="Alert size" value={z} onChange={(v) => { update((x) => ({ prefs: { ...x.prefs, alertSize: v } })); toast(`This is how alerts will look at ${ALERT_SIZES.find((s2) => s2.value === v)?.label.toLowerCase()} size.`, 'info'); }}
                options={ALERT_SIZES.map((s2) => ({ v: s2.value, label: s2.label }))} />
              <span className="note small">Makes alerts bigger and easier to read. See the preview below.</span>
            </div>
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Alerts stay for</div>
            <div className="row wide">
              {/* Seg takes numbers, so "until closed" travels as 0 and is stored as null. */}
              <Seg label="How long alerts stay" value={d.prefs.toastSeconds ?? 0} onChange={(v) => update((x) => ({ prefs: { ...x.prefs, toastSeconds: v === 0 ? null : v } }))}
                options={TOAST_SECONDS.map((o) => ({ v: o.value ?? 0, label: o.label }))} />
              <span className="note small">Several at once queue behind each other; the next comes forward as each one goes. Hovering holds the clock.</span>
            </div>
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 8 }}>Tell me when</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: '12px 24px', opacity: a.on ? 1 : 0.45 }}>
              {ALERT_EVENTS.map((k) => (
                <Check key={k} bare checked={a.ev[k]} onChange={(v) => setA({ ev: { ...a.ev, [k]: v } })} desc={ALERT_LABELS[k].what}>{ALERT_LABELS[k].label}</Check>
              ))}
            </div>
          </div>
          <div><NumChip label="Only if at least" width={120} decimals={0} value={a.minIsk} onChange={(n) => setA({ minIsk: n ?? 0 })} tip="Ignore orders with less ISK than this at stake. Applies to the order alerts only." /></div>
          <Check bare checked={a.browser} onChange={toggleBrowser} desc="Shows even when this tab isn’t in front. Your browser will ask first.">Also send browser notifications</Check>
          <Check bare checked={a.quiet} onChange={(v) => setA({ quiet: v })} desc="Hold alerts overnight">Quiet hours, 23:00–07:00 EVE</Check>
        </section>
        <MailAlerts />
      </div>
      <div style={gridC}>
        <Card title="Alerts in the last 24 h">
          <div className="row" style={{ alignItems: 'baseline' }}><span className="mono" style={{ fontSize: 34, color: 'var(--acc)' }}>{day.length}</span><span style={{ fontSize: 13, color: 'var(--sec)' }}>raised by your settings</span></div>
          <div className="col" style={{ gap: 7 }}>
            {counts.map(({ k, n }) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) 32px', gap: 10, alignItems: 'center', fontSize: 12.5, opacity: a.on && a.ev[k] ? 1 : 0.4 }}>
                <span className="ellipsis" style={{ color: 'var(--body)' }}>{ALERT_LABELS[k].label}</span>
                <span className="track"><span className="fill" style={{ width: `${(n / mx) * 100}%`, background: COL[k] }} /></span>
                <span className="mono" style={{ textAlign: 'right', color: COL[k] }}>{n}</span>
              </div>
            ))}
          </div>
          <p className="note">{!a.on ? 'Alerts are off, so nothing is being raised.' : counts.find((c) => c.k === 'clearing')!.n > day.length / 2 ? '“Beaten but clearing” is most of that — it’s usually noise. Turning it off would quieten things.' : 'Raise “Only if at least” to cut the small ones further.'}</p>
        </Card>
        <Card title="Recent alerts">
          {!d.alertLog.length ? <p className="note">None yet. They appear here as they are raised, test ones included.</p> : (
            <div>
              {d.alertLog.slice(0, 8).map((l) => (
                <div key={l.at + l.key} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--line-4)' }}>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--faint)' }}>{new Date(l.at).toISOString().slice(11, 16)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="lbl" style={{ display: 'block', color: COL[l.kind] }}>{l.test ? 'Test · ' : ''}{l.title}</span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--body)' }}>{l.text}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="What an alert looks like">
          <div className="toast" style={cssVars({ '--c': 'var(--acc2)', position: 'relative', maxWidth: `${Math.round(340 * Math.min(z, 1.6))}px`, animation: 'none', '--tf': `${(13 * z).toFixed(1)}px`, '--ti': `${Math.round(17 * z)}px`, '--tg': `${Math.round(12 * z)}px`, '--tp': `${Math.round(12 * z)}px ${Math.round(14 * z)}px ${Math.round(14 * z)}px` })}>
            <BellRing aria-hidden="true" /><span className="tmsg">Hammerhead II sell order beaten — worth moving (costs 2.14 M). An example; your own alerts use your orders.</span>
          </div>
          <p className="note">In-app alerts slide in at the bottom right and stay {d.prefs.toastSeconds == null ? 'until you close them' : `for ${TOAST_SECONDS.find((o) => o.value === d.prefs.toastSeconds)?.label ?? `${d.prefs.toastSeconds} s`}`}. When several arrive together they wait behind each other and come forward one at a time. With browser notifications on, the same text also appears as a system notification while this tab is in the background.</p>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn primary" onClick={testAlert}><Send aria-hidden="true" />Send a test alert</button>
            {a.browser && (
              // A system notification only shows while this tab is in the background, so give time to switch away.
              <button type="button" className="btn" onClick={() => { toast('Switch to another window or tab now — the test notification arrives in 5 seconds.', 'info'); setTimeout(testAlert, 5000); }}>
                <BellRing aria-hidden="true" />Test a system notification
              </button>
            )}
          </div>
          {a.browser && <p className="note small">Your system draws those notifications, so it decides their look. The app gives them its icon and, where the system shows pictures (Chrome on Windows and Android), a picture of the alert in the app’s style.</p>}
        </Card>
      </div>
    </>
  );
}

/** Alerts as EVE mail to yourself, and how long those mails are kept. */
function MailAlerts() {
  const d = useData();
  const a = d.alerts;
  const auth = useAuth();
  const mailer = useMailer();
  const runner = useAlertRunner();
  const now = useNow(30_000);
  const [sending, setSending] = useState(false);
  const setA = (patch: Partial<typeof a>) => update((x) => ({ alerts: { ...x.alerts, ...patch } }));
  const has = (s: string) => !!auth?.scopes.includes(s);
  // A second character that can send, and isn't the one being mailed.
  const alt = mailer && auth && mailer.characterId !== auth.characterId && mailer.scopes.includes(SCOPE.mailSend) ? mailer : null;
  const canSend = !!auth && (!!alt || has(SCOPE.mailSend)), canDelete = has(SCOPE.mailOrganize), canRead = has(SCOPE.mailRead);
  const signInAlt = () => loginMailer().catch((e) => toast(e instanceof Error ? e.message : String(e), 'err'));
  const dropAlt = async () => {
    if (!(await confirmAsk({ title: 'Stop sending from this character?', body: `Alert mail will come from ${auth?.characterName ?? 'you'} to itself, which EVE only shows after you log in again. Nothing else changes.`, confirm: 'Stop', danger: true }))) return;
    await logoutMailer();
    toast(`${mailer?.characterName ?? 'That character'} no longer sends alert mail.`, 'info');
  };
  const sendTest = async () => {
    setSending(true);
    const ok = await testMail();
    setSending(false);
    if (ok) toast('Test mail sent. It can take a minute to reach your inbox in game.');
  };
  const pending = d.meta.alertMails?.filter((m) => m.char === auth?.characterId).length ?? 0;
  return (
    <section className="panel" aria-label="EVE mail alerts" style={{ padding: 18, gap: 14 }}>
      <div className="panel-head">
        <span className="panel-title">EVE mail</span>
        <button type="button" className="link-btn" onClick={sendTest} disabled={!canSend || sending}><Mail aria-hidden="true" />{sending ? 'Sending…' : 'Send a test mail'}</button>
      </div>
      <Check bare checked={a.mail} disabled={!canSend} onChange={(v) => setA({ mail: v })}
        desc="Reaches you inside the game, where browser notifications may not. One mail per check, holding everything it found.">
        Also send alerts as an EVE mail
      </Check>
      {!auth ? <Notice>Log in to send alert mail. It only ever goes to the character you log in with.</Notice>
        : !canSend ? <Notice kind="warn">Sending needs a character to send from. Log one in below.</Notice>
          : null}
      {auth && (
        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>Sent from</div>
          {alt ? (
            <div className="row wide" style={{ alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--body)', flex: 1, minWidth: 200 }}>From <b>{alt.characterName}</b> to <b>{auth.characterName}</b>, so it arrives like any other mail.</span>
              <button type="button" className="btn sm" onClick={signInAlt}>Change</button>
              <button type="button" className="link-btn dim" onClick={dropAlt}>Stop</button>
            </div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--body)', textWrap: 'pretty' }}>
                Mail {auth.characterName} sends itself reaches the inbox but EVE doesn’t tell the game, so it only shows after you log in again. Send it from another of your characters instead and it arrives like any other mail. Any character works, on this account or another. It doesn’t need to be online, and it only gets permission to send mail and delete what it sent.
              </p>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <button type="button" className="btn sm" onClick={signInAlt}><LogIn aria-hidden="true" />Log in a character to send from</button>
                <span className="note small">EVE’s login page asks which character. Pick the other one, not {auth.characterName}.</span>
              </div>
            </div>
          )}
        </div>
      )}
      <p style={{ margin: '-4px 0 0', fontSize: 12, color: 'var(--note)', textWrap: 'pretty' }}>
        In the mail, an item’s name opens its info in game, and “Open its market in game” opens its market window through this app. Nothing opens on its own. Quiet hours and “Only if at least” apply here too, and like every alert it only checks while a tab is open. If your character charges for mail from strangers (CSPA), add the sending character as a contact.
      </p>
      <div>
        <div className="lbl" style={{ marginBottom: 8 }}>Mail me about</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: '10px 24px', opacity: a.mail ? 1 : 0.45 }}>
          {ALERT_EVENTS.map((k) => (
            <Check key={k} bare checked={a.mailEv[k] && a.ev[k]} disabled={!a.ev[k]} onChange={(v) => setA({ mailEv: { ...a.mailEv, [k]: v } })}
              desc={!a.ev[k] ? 'Turned off under “Tell me when”' : undefined}>{ALERT_LABELS[k].label}</Check>
          ))}
        </div>
        <p className="note small" style={{ marginTop: 8 }}>By default only the two you can act on from inside the game: an order worth moving, and a planet about to stop.</p>
      </div>
      <div>
        <div className="lbl" style={{ marginBottom: 6 }}>Delete alert mails after</div>
        <div className="row wide">
          {/* Seg takes numbers, so "keep them" travels as 0 and is stored as null. */}
          <Seg label="Delete alert mails after" value={a.mailKeepMin ?? 0} onChange={(v) => setA({ mailKeepMin: v === 0 ? null : v })}
            options={MAIL_KEEP.map((o) => ({ v: o.value ?? 0, label: o.label }))} />
        </div>
        <p className="note small" style={{ marginTop: 8, textWrap: 'pretty' }}>
          {a.mailKeepMin == null ? 'Alert mails stay in your inbox until you delete them.'
            : !canDelete ? <>Deleting needs the <b>Delete EVE mail</b> permission, which this login doesn’t have. Until it does, alert mails stay.</>
              : <>Deleted whether you’ve read them or not, checked every {Math.round(tidyEvery(a.mailKeepMin) / 60_000)} minutes while the app is open. Only the app’s own alert mails go: {canRead ? `from ${alt ? `${alt.characterName} or yourself` : 'yourself'}, with a subject starting “Jita Ledger:”${alt ? `, and ${alt.characterName}’s sent copy with them` : ''}.` : 'the ones this browser sent. With the Read EVE mail headers permission it could also find ones sent from another browser.'}</>}
          {a.mailKeepMin != null && canDelete && d.meta.mailCleanAt ? ` Last tidied ${ago(d.meta.mailCleanAt, now)}${pending ? `; ${pending} sent from here still ${pending === 1 ? 'waits' : 'wait'} ${pending === 1 ? 'its' : 'their'} turn` : ''}.` : ''}
        </p>
      </div>
      {runner.mailError && <Notice kind="err">{runner.mailError}</Notice>}
    </section>
  );
}

function Appearance() {
  const d = useData();
  const motion = useMotion();
  const chosen = d.prefs.motion;
  const setP = (patch: Partial<typeof d.prefs>) => update((x) => ({ prefs: { ...x.prefs, ...patch } }));
  const DESC: Record<Motion, string> = { Full: 'Starfield drift and warp jumps between pages', Calm: 'Slow drift, gentle transitions', Off: 'Still stars, instant page changes' };
  const railOpen = (() => { try { return localStorage.getItem('jita-ledger:rail') !== '0'; } catch { return true; } })();
  const [rail, setRail] = useState(railOpen);
  // The rail's own toggle changes this too, so follow it rather than showing what it was on arrival.
  useEffect(() => {
    const on = (e: Event) => setRail(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener('jl-rail-state', on);
    return () => window.removeEventListener('jl-rail-state', on);
  }, []);
  return (
    <>
      <div style={grid2}>
        <section className="panel" aria-label="Appearance" style={{ padding: 18, gap: 14, background: 'linear-gradient(160deg,color-mix(in oklab,var(--acc) 10%,rgba(7,13,21,.9)),rgba(7,13,21,.9) 60%)', borderColor: 'color-mix(in oklab,var(--acc) 35%,transparent)' }}>
          <div className="panel-title">Appearance</div>
          <div>
            <div className="lbl" style={{ marginBottom: 8 }}>Faction theme</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(Object.entries(THEMES) as [Theme, [string, string]][]).map(([n, [c1, c2]]) => {
                const on = d.prefs.theme === n;
                return (
                  <button key={n} type="button" aria-pressed={on} onClick={() => { setP({ theme: n }); bumpWarp(0.8); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: on ? `color-mix(in oklab,${c1} 12%,transparent)` : 'rgba(2,7,12,.45)', border: `1px solid ${on ? c1 : 'rgba(130,185,225,.18)'}`, textAlign: 'left', transition: 'all .25s' }}>
                    <span style={{ position: 'relative', width: 30, height: 30, flex: 'none' }} aria-hidden="true">
                      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(${c1} 0 60%,${c2} 60% 100%)`, boxShadow: `0 0 12px ${c1}` }} />
                      <span style={{ position: 'absolute', inset: 6, borderRadius: '50%', background: '#050b12' }} />
                    </span>
                    <span style={{ fontFamily: 'var(--f-head)', fontWeight: 600, fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase', color: on ? '#fff' : 'var(--dim)' }}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 8 }}>Motion</div>
            <Seg label="Motion" value={chosen ?? motion} onChange={(m) => setP({ motion: m })} options={(['Full', 'Calm', 'Off'] as Motion[]).map((m) => ({ v: m, label: m, tip: DESC[m] }))} />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--note)' }}>
              {DESC[motion]}.{chosen == null ? ' Following your system’s motion setting.' : ''}
              {chosen != null && <> <button type="button" className="link-btn" style={{ fontSize: 10.5 }} onClick={() => setP({ motion: undefined })}>Follow the system instead</button></>}
            </p>
          </div>
          <Check bare checked={rail} onChange={(v) => { setRail(v); try { localStorage.setItem('jita-ledger:rail', v ? '1' : '0'); } catch { /* private window */ } window.dispatchEvent(new Event('jl-rail')); }}>Show labels in the side menu</Check>
        </section>
      </div>
      <div style={gridC}>
        <Card title="Preview">
          <div style={{ padding: 14, background: 'rgba(2,7,12,.55)', border: '1px solid var(--line-2)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 14, alignItems: 'center' }}>
            <div>
              <div className="lbl">Net profit per unit</div>
              <div className="mono" style={{ fontSize: 24, color: 'var(--pos)', marginTop: 4 }}>+66,217 ISK</div>
              <div className="row tight" style={{ marginTop: 10 }}>
                <span className="btn primary" style={{ height: 30, padding: '0 12px', fontSize: 10.5 }}>Start trading</span>
                <span className="btn" style={{ height: 30, padding: '0 12px', fontSize: 10.5 }}>Watch</span>
              </div>
            </div>
            <svg viewBox="0 0 200 70" preserveAspectRatio="none" style={{ width: '100%', height: 80 }} aria-hidden="true">
              <path d="M0 50 L20 44 L40 48 L60 36 L80 40 L100 28 L120 32 L140 20 L160 26 L180 14 L200 18 L200 70 L0 70Z" fill="color-mix(in oklab,var(--acc) 14%,transparent)" />
              <path d="M0 50 L20 44 L40 48 L60 36 L80 40 L100 28 L120 32 L140 20 L160 26 L180 14 L200 18" fill="none" stroke="var(--acc)" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 4px var(--acc))' }} />
              <path d="M0 34 H200" stroke="var(--acc2)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <p className="note">Accent colour for actions and charts, second colour for warnings and your price lines. Profit and loss colours never change, so they always mean the same thing. The preview figures are an illustration, not your data.</p>
        </Card>
      </div>
    </>
  );
}

function DataTab() {
  const d = useData();
  const now = useNow(60_000);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanBytes, setScanBytes] = useState<number | null>(null);
  useEffect(() => { get('prospects', cacheStore).then((v) => setScanBytes(v ? JSON.stringify(v).length : 0)).catch(() => setScanBytes(null)); }, []);
  const last = d.meta.lastBackupAt ? Date.parse(d.meta.lastBackupAt) : null;
  const days = last == null ? null : Math.floor((now - last) / 86400_000);
  const old = last == null || now - last > BACKUP_DAYS * 86400_000;

  const sizes = useMemo(() => {
    const b = (x: unknown) => JSON.stringify(x ?? null).length;
    const rows: { l: string; n: string; bytes: number }[] = [
      { l: 'Trades and wallet journal', n: `${units(Object.keys(d.txs).length)} trades, ${units(Object.keys(d.journal).length)} journal entries`, bytes: b(d.txs) + b(d.journal) },
      { l: 'Positions and orders', n: `${units(d.positions.length)} positions, ${units(Object.keys(d.orders).length)} orders`, bytes: b(d.positions) + b(d.orders) },
      { l: 'Scan cache', n: 'Prospects history and books', bytes: scanBytes ?? 0 },
      { l: 'Order book snapshots', n: 'Watchlist', bytes: b(d.watchlist) },
      { l: 'Killmails', n: `${units(Object.keys(d.killmails).length)} kills and losses, priced on the day`, bytes: b(d.killmails) },
      { l: 'Settings and names', n: 'Skills, rates, item names, alerts', bytes: b(d.settings) + b(d.names) + b(d.meta) + b(d.prefs) + b(d.alerts) + b(d.alertLog) },
    ];
    return rows;
  }, [d, scanBytes]);
  const mx = Math.max(1, ...sizes.map((x) => x.bytes));
  const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

  async function doExport() {
    const text = await exportAll();
    const name = `jita-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    downloadText(name, text);
    const at = new Date().toISOString();
    update((x) => ({ meta: { ...x.meta, lastBackupAt: at, backups: [{ at, name, bytes: text.length }, ...(x.meta.backups ?? [])].slice(0, 6) } }));
    toast(`Backup saved as ${name}.`);
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const { data, exportedAt } = parseBackup(text);
      const t = Object.keys(data.txs ?? {}).length, p = data.positions?.length ?? 0;
      // Importing replaces what is here wholesale, so say exactly what will be replaced and with what.
      if (!(await confirmAsk({
        title: 'Replace this browser’s ledger with the backup?',
        body: `The backup${exportedAt ? ` from ${exportedAt.slice(0, 10)}` : ''} holds ${units(t)} trades and ${units(p)} positions. What is in this browser now (${units(Object.keys(d.txs).length)} trades, ${units(d.positions.length)} positions) is replaced, not merged. Export first if you might want it.`,
        confirm: 'Replace with backup', danger: true,
      }))) return;
      await importAll(text);
      toast('Imported. Your positions, trades and settings are restored.');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err');
    }
  }

  return (
    <>
      <div style={grid2}>
        <section className="panel" aria-label="Your data" style={{ padding: 18, gap: 12, clipPath: 'none' }}>
          <div className="panel-title">Your data</div>
          <p style={{ fontSize: 12, color: 'var(--label)', textWrap: 'pretty' }}>ESI only returns about 30 days of wallet history and 90 days of order history, so this browser is your long-term record. Export a backup now and then.</p>
          <p className="row tight" style={{ fontSize: 12.5, color: old ? 'var(--acc2)' : 'var(--pos)' }}>
            <HardDriveDownload aria-hidden="true" style={{ width: 14, height: 14 }} />
            {days == null ? 'You have never exported a backup from this browser.' : `Last backup ${days} day${days === 1 ? '' : 's'} ago${old ? ' — time for another.' : '.'}`}
          </p>
          <div className="row">
            <button type="button" className="btn sm" onClick={doExport}><Download aria-hidden="true" />Export backup</button>
            <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}><Upload aria-hidden="true" />Import backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
            <button type="button" className="btn sm danger" onClick={async () => {
              if (!(await confirmAsk({ title: 'Delete everything in this browser?', body: 'Every position, trade and setting goes. Export a backup first if you might want them back.', confirm: 'Delete everything', danger: true }))) return;
              await clearAll();
              toast('Everything was deleted from this browser.', 'err');
            }}><Trash2 aria-hidden="true" />Delete all data</button>
          </div>
        </section>
      </div>
      <div style={gridC}>
        <Card title="What’s stored in this browser">
          <div className="col" style={{ gap: 8 }}>
            {sizes.map((x) => (
              <div key={x.l} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr) 70px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                <span><span style={{ display: 'block', color: 'var(--body)' }}>{x.l}</span><span style={{ display: 'block', fontSize: 11.5, color: 'var(--faint)' }}>{x.n}</span></span>
                <span className="track"><span className="fill" style={{ width: `${(x.bytes / mx) * 100}%` }} /></span>
                <span className="mono" style={{ textAlign: 'right', color: 'var(--sec)' }}>{fmt(x.bytes)}</span>
              </div>
            ))}
          </div>
          <p className="note">{fmt(sizes.reduce((t, x) => t + x.bytes, 0))} in total, measured as saved. Trades older than ESI’s 30 days exist only here.</p>
        </Card>
        <Card title="Backups">
          {!d.meta.backups?.length ? <p className="note">None exported from this browser yet.</p> : (
            <div>
              {d.meta.backups.map((b) => (
                <div key={b.at} className="lrow"><span><span className="lt" style={{ fontSize: 13 }}>{b.name}</span><span className="ls">{ago(b.at, now)}</span></span><span className="lv" style={{ fontSize: 12, color: 'var(--sec)' }}>{fmt(b.bytes)}</span></div>
              ))}
            </div>
          )}
          <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={doExport}><Download aria-hidden="true" />Export a backup now</button>
        </Card>
      </div>
    </>
  );
}
