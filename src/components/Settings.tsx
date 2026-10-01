import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { get } from 'idb-keyval';
import {
  Bell, BellRing, Cloud, Database, Download, Eye, GraduationCap, HardDriveDownload, LogIn, LogOut, Mail, MessageSquare, MousePointerClick, Palette, Percent, Radar, RefreshCw, Send, ShieldCheck, Trash2, Upload, UserRound,
} from 'lucide-react';
import { effectiveSkills, orderSlots, rateAt, rates, RELIST_LEFT, sanitizeSettings, type Settings as S } from '../lib/fees';
import { brokerFeesPaid, measuredRates, standingsWorth } from '../lib/standings';
import { feeMatchesFor } from '../lib/positions';
import { ago, fmtDate, fmtDateTime, iskBig, iskBigSigned, pct, plainNum, units, until } from '../lib/format';
import { cacheStore, clearAll, exportAll, importAll, parseBackup, update, useData } from '../lib/store';
import { confirmAsk } from '../lib/confirm';
import { askedScopes, isConfigured, login, loginForCloud, loginMailer, loginMailerForCloud, logout, logoutMailer, setAsked } from '../lib/auth';
import { syncCharacter, useSyncState } from '../lib/sync';
import { navigate, useAuth, useMailer, useNow, type Route } from '../lib/hooks';
import { tradeSkillsComing } from '../lib/skillQueue';
import { errorPredatesLogin, scopesMissing } from '../lib/watchdog';
import { useTradeQueue } from './SkillStrip';
import { ALPHA_CAPS, JITA_44, OPTIONAL_SCOPES, REDIRECT_URI, SCOPE, SCOPE_INFO, SCOPES, type SkillKey } from '../lib/config';
import { marketHistory } from '../lib/market';
import { measureShare, MIN_SIDE_DAYS, sharedTypes, SHARE_DAYS, type ShareMeasure } from '../lib/share';
import { ALERT_EVENTS, ALERT_SIZES, MAIL_KEEP, REPEAT_HOURS, THEMES, TOAST_SECONDS } from '../lib/prefs';
import { ALERT_LABELS, tidyEvery } from '../lib/alerts';
import { testAlert, testMail, useAlertRunner, BACKUP_DAYS } from '../lib/alertsRunner';
import { useMotion, bumpWarp } from '../lib/motion';
import { toast } from '../lib/toast';
import { cloudAlertLog, cloudCovers, cloudEnabled, cloudEsiCheck, cloudSendsMail, cloudSummary, cloudTestMail, dropCloudLogin, runCloudArchive, setCloudEnabled, syncCloudNow, useCloud, useCloudScanStatus } from '../lib/cloud';
import { loadCache, useScanState } from '../lib/scan';
import type { ScanRuns } from '../lib/prospects';
import type { AlertEvent, Motion, Theme } from '../lib/types';
import { StandingsChart } from './charts';
import { downloadText, LevelBoxes } from './common';
import { CloneSwitch } from './Omega';
import { useSkillPayback } from './payback';
import { Check, cssVars, Notice, NumChip, PageHead, Seg, Tip } from './ui';
import { Points } from './Facts';
import { nettedJournal } from '../lib/refunds';

type Tab = 'account' | 'skills' | 'rates' | 'alerts' | 'appearance' | 'data' | 'scan';
const TABS: Tab[] = ['account', 'skills', 'rates', 'alerts', 'appearance', 'data', 'scan'];
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

/**
 * One setting on a line: what it is and a plain hint on the left, a short number box with its unit on
 * the right. The old full-width boxes put the number at the far end of the page from its label.
 */
function SetRow(props: { id: string; label: string; hint?: ReactNode; unit: string; value: number; onChange: (n: number) => void; action?: ReactNode }) {
  const [text, setText] = useState(plainNum(props.value));
  const [focused, setFocused] = useState(false);
  return (
    <div className="setrow">
      <label htmlFor={props.id}>
        <span className="sl">{props.label}</span>
        {props.hint && <span className="sh">{props.hint}</span>}
      </label>
      <span className="sv">
        {props.action}
        <input
          id={props.id} className="input num" inputMode="decimal" value={focused ? text : plainNum(props.value)}
          onFocus={() => { setText(plainNum(props.value)); setFocused(true); }} onBlur={() => setFocused(false)}
          onChange={(e) => { setText(e.target.value); const n = parseFloat(e.target.value.replace(/,/g, '').replace('%', '')); if (Number.isFinite(n)) props.onChange(n); }}
        />
        <span className="su">{props.unit}</span>
      </span>
    </div>
  );
}

/** Measures your real share of the market from your wallet, and offers it as the setting. */
function MeasureShare({ onUse }: { onUse: (pct: number) => void }) {
  const d = useData();
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [m, setM] = useState<ShareMeasure | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setErr(null); setM(null);
    const txs = Object.values(d.txs);
    const types = sharedTypes(txs, JITA_44);
    if (!types.length) { setErr(`No trades in Jita 4-4 in the last ${SHARE_DAYS} days to measure from.`); return; }
    setBusy({ done: 0, total: types.length });
    const history: Record<number, Awaited<ReturnType<typeof marketHistory>>> = {};
    let i = 0, done = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (i < types.length) {
        const id = types[i++];
        try { history[id] = await marketHistory(id); } catch { /* measured from the rest */ }
        setBusy({ done: ++done, total: types.length });
      }
    }));
    setBusy(null);
    setM(measureShare(txs, history, JITA_44));
  };
  const pc = (x: number | null) => (x == null ? '–' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
  // The cloud measures the same thing every day; its latest shows until you measure here.
  const daily = useCloud().track?.share;
  const fromCloud = !m && !!daily;
  const shown: ShareMeasure | null = m ?? (daily ? { buyDays: daily.buyDays, sellDays: daily.sellDays, buyMedian: daily.buyMedian, sellMedian: daily.sellMedian, suggested: daily.suggested, enough: daily.suggested != null } : null);
  return (
    <div className="col" style={{ gap: 8, padding: '10px 0 12px', borderBottom: '1px solid var(--line-4)' }}>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" className="btn sm" onClick={run} disabled={!!busy}>
          <Percent aria-hidden="true" />{busy ? `Measuring ${busy.done} of ${busy.total}…` : 'Measure my share'}
        </button>
        <span className="note small">From your own Jita trades over the last {SHARE_DAYS} days.{fromCloud ? ` The cloud measures it every day; this is its reading of ${daily!.day}.` : ''}</span>
      </div>
      {err && <p className="note small" style={{ margin: 0 }}>{err}</p>}
      {shown && (shown.suggested == null ? (
        <p className="note small" style={{ margin: 0 }}>
          {shown.buyDays + shown.sellDays === 0
            ? 'None of your trades could be matched to a day of market history, so there’s nothing to measure yet.'
            : `Only ${shown.buyDays + shown.sellDays} day${shown.buyDays + shown.sellDays === 1 ? '' : 's'} of trading to go on, too few to suggest a setting from. Measure again once you’ve traded more.`}
        </p>
      ) : (
        <div className="notice" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            On days you traded, your orders caught a median{' '}
            {[
              shown.buyDays >= MIN_SIDE_DAYS ? <><b>{pc(shown.buyMedian)}</b> of what sellers sold into bids ({units(shown.buyDays)} days of buying)</> : null,
              shown.sellDays >= MIN_SIDE_DAYS ? <><b>{pc(shown.sellMedian)}</b> of what buyers took from listings ({units(shown.sellDays)} days of selling)</> : null,
            ].filter(Boolean).map((x, i) => <Fragment key={i}>{i ? ' and ' : ''}{x}</Fragment>)}.
            {' '}The app scales your setting up to 1.5× on markets with few orders, so <b>{shown.suggested}%</b> reproduces that. Only days you traded are counted, so if anything this reads high.
          </div>
          <button type="button" className="btn primary sm" onClick={() => { onUse(shown.suggested!); toast(`Share set to ${shown.suggested}%.`); }} disabled={d.settings.share === shown.suggested}>
            {d.settings.share === shown.suggested ? 'In use' : `Use ${shown.suggested}%`}
          </button>
        </div>
      ))}
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
  const cloudOk = cloudCovers(useCloud());
  const motion = useMotion();
  const scan = useCloudScanStatus().status;

  const tabs: { k: Tab; label: string; Icon: typeof UserRound; sub: string; dot?: string }[] = [
    { k: 'account', label: 'Account', Icon: UserRound, sub: auth ? `${auth.characterName}${missing ? ` · ${missing} permission${missing === 1 ? '' : 's'} missing` : ''}` : 'Not logged in', dot: auth && missing ? 'var(--acc2)' : undefined },
    { k: 'skills', label: 'Skills & slots', Icon: GraduationCap, sub: `${slots} order slots` },
    { k: 'rates', label: 'Rates & fees', Icon: Percent, sub: `Broker ${pct(r.f)} · tax ${pct(r.t)}` },
    { k: 'alerts', label: 'Alerts', Icon: BellRing, sub: d.alerts.on ? `On · every ${d.alerts.interval} min` : 'Off', dot: d.alerts.on ? 'var(--pos)' : undefined },
    { k: 'appearance', label: 'Appearance', Icon: Palette, sub: `${d.prefs.theme} · motion ${motion.toLowerCase()}` },
    { k: 'data', label: 'Your data', Icon: Database, sub: cloudOk ? 'Kept in the cloud' : backupDays == null ? 'Never backed up' : `Last backup ${backupDays} day${backupDays === 1 ? '' : 's'} ago`, dot: backupOld && !cloudOk ? 'var(--acc2)' : undefined },
    {
      k: 'scan', label: 'Market scan', Icon: Radar,
      sub: scan?.progress ? 'Running now' : scan?.lastError ? 'Last run failed' : scan?.last ? `Last full scan ${ago(scan.last.at, now)}` : 'Every order, once a day',
      dot: scan?.progress ? 'var(--acc)' : scan?.lastError ? 'var(--neg)' : undefined,
    },
  ];

  return (
    <div className="page">
      <PageHead kicker="10 · Pilot configuration" title="Settings" lede={`Your character, trade skills and rates. Everything is saved in this browser${cloudOk ? ', and kept in the cloud' : ''}.`} />
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
          {tab === 'account' ? <Account /> : tab === 'skills' ? <Skills /> : tab === 'rates' ? <RatesTab /> : tab === 'alerts' ? <Alerts /> : tab === 'appearance' ? <Appearance /> : tab === 'scan' ? <ScanTab /> : <DataTab />}
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
  const [asked, setAskedState] = useState<string[]>(askedScopes);
  const ask = (sc: string, on: boolean) => { setAsked(sc, on); setAskedState(askedScopes()); };
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
              <Points items={[
                { kind: 'info', icon: UserRound, lead: 'Log in', text: 'to fill in your skills, standings and clone state, and to track your trades.' },
                { kind: 'good', icon: ShieldCheck, lead: 'Read-only', text: 'ESI can’t place, change or cancel an order, so nothing here can trade for you.' },
                { kind: 'info', icon: MousePointerClick, lead: 'The one exception', text: 'opens a market window in your client, and writes nothing.' },
              ]} />
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
            {OPTIONAL_SCOPES.length > 0 && <>
            <div className="lbl" style={{ fontSize: 11, letterSpacing: '.18em', margin: '14px 0 6px' }}>Optional</div>
            <div style={{ margin: '0 0 10px' }}>
              <Points compact items={[
                { kind: 'info', lead: 'Asked for', text: 'only once you switch it on here.' },
                { kind: 'warn', lead: 'Tick it first', text: 'on your application at developers.eveonline.com: EVE’s login refuses one it doesn’t have, and says so only after you sign in.' },
              ]} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 4 }}>
              {OPTIONAL_SCOPES.map((sc) => {
                const info = SCOPE_INFO[sc];
                const has = granted.includes(sc), on = asked.includes(sc);
                const dot = has ? 'var(--pos)' : on ? 'var(--acc2)' : 'var(--faint)';
                return (
                  <div key={sc} style={{ display: 'flex', gap: 10, padding: '8px 10px', background: 'rgba(2,7,12,.4)', borderLeft: `2px solid ${dot}` }}>
                    <span style={{ width: 7, height: 7, marginTop: 6, borderRadius: '50%', flex: 'none', background: dot, boxShadow: `0 0 6px ${dot}` }} aria-hidden="true" />
                    <div style={{ minWidth: 0 }} className="col tight">
                      <div className="row tight"><b style={{ fontSize: 13, fontWeight: 600, color: 'var(--figure)' }}>{info?.label ?? sc}</b>{has && <span className="flag plain" style={{ fontSize: 10, color: 'var(--pos)' }}>granted</span>}</div>
                      <code style={{ display: 'block', fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--faint-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc}</code>
                      <span style={{ fontSize: 12, color: 'var(--label)' }}>{info?.unlocks}</span>
                      <span className="row tight" style={{ gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                        {!on ? (
                          <button type="button" className="btn sm" onClick={() => ask(sc, true)}>Ask for it at login</button>
                        ) : !has ? (
                          <>
                            <span style={{ fontSize: 12, color: 'var(--acc2)' }}>Asked for at your next login.</span>
                            {auth && <button type="button" className="btn sm primary" onClick={() => login().catch((e) => toast(String(e.message ?? e), 'err'))}><LogIn aria-hidden="true" />Log in again</button>}
                            <button type="button" className="link-btn dim" onClick={() => ask(sc, false)}
                              data-tip="If EVE’s login refused it (not ticked on your application), stop asking so logging in works as before.">Stop asking</button>
                          </>
                        ) : (
                          <button type="button" className="link-btn dim" onClick={() => ask(sc, false)} data-tip="Your next login won’t ask for it, so the app stops using it then.">Stop asking</button>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            </>}
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
  const tq = useTradeQueue();
  const qOf = (k: SkillKey) => (tq[k]?.text ? tq[k] : undefined);

  return (
    <>
      <div style={grid2}>
        <section className="panel" aria-label="Skills and standings" style={{ padding: 18, gap: 14, clipPath: 'none' }}>
          <div className="panel-title">Skills and standings</div>
          <p style={{ margin: '-6px 0 0', fontSize: 12, color: 'var(--label)', textWrap: 'pretty' }}>
            {locked ? `Trained levels, filled from ${auth!.characterName} on each sync. ` : 'Set the levels you’ve trained. '}
            {alpha && 'Striped boxes are trained but locked while you’re Alpha; they switch on when you go Omega.'}
          </p>
          <LevelBoxes label="Accounting" help={`Cuts sales tax by 11% per level.${alpha ? ' Omega only.' : ''}`} value={s.acc} cap={cap('acc')} disabled={locked} onChange={(n) => set({ acc: n })} queue={qOf('acc')} />
          <LevelBoxes label="Broker Relations" help={`Cuts the broker fee by 0.3 points per level.${alpha ? ' Alpha can use up to level II.' : ''}`} value={s.br} cap={cap('br')} disabled={locked} onChange={(n) => set({ br: n })} queue={qOf('br')} />
          <LevelBoxes label="Advanced Broker Relations" help={`Cuts the fee for changing an order’s price.${alpha ? ' Omega only.' : ''}`} value={s.abr} cap={cap('abr')} disabled={locked} onChange={(n) => set({ abr: n })} queue={qOf('abr')} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
            <NumField id="s-fac" label="Caldari State standing" value={s.faction} disabled={locked} onChange={(n) => set({ faction: n })} />
            <NumField id="s-corp" label="Caldari Navy standing" value={s.corp} disabled={locked} onChange={(n) => set({ corp: n })} />
          </div>
          <p style={{ margin: '-4px 0 0', fontSize: 11.5, color: 'var(--faint)' }}>Base standing from 0 to 10. Skills that boost standings don’t lower the broker fee.</p>
          <p style={{ margin: '-4px 0 0', fontSize: 11.5, color: 'var(--faint)' }}>
            <span data-tip="Marketing, Procurement, Daytrading and Visibility set how far from an order’s station you can place or change it (Daytrading, changing it from elsewhere), which the app doesn’t weigh. Docked in Jita 4-4 they change nothing." style={{ textDecoration: 'underline dotted', cursor: 'help' }}>Range skills aren’t here</span>: docked in Jita 4-4 they change nothing.
          </p>
        </section>
        <section className="panel" aria-label="Order slots" style={{ padding: 18, gap: 14, clipPath: 'none' }}>
          <div className="panel-head"><span className="panel-title">Order slots</span><span className="mono" style={{ fontSize: 26, color: 'var(--acc)' }}>{slots}</span></div>
          <p style={{ margin: '-8px 0 0', fontSize: 12, color: 'var(--label)' }}>How many buy and sell orders you can have open at once. You start with 5.</p>
          <LevelBoxes label="Trade" help={`4 more orders per level.${alpha ? ' Alpha can use up to level III.' : ''}`} value={s.trade} cap={cap('trade')} disabled={locked} onChange={(n) => set({ trade: n })} queue={qOf('trade')} />
          <LevelBoxes label="Retail" help={`8 more orders per level.${alpha ? ' Omega only.' : ''}`} value={s.retail} cap={cap('retail')} disabled={locked} onChange={(n) => set({ retail: n })} queue={qOf('retail')} />
          <LevelBoxes label="Wholesale" help={`16 more orders per level.${alpha ? ' Omega only.' : ''}`} value={s.wholesale} cap={cap('wholesale')} disabled={locked} onChange={(n) => set({ wholesale: n })} queue={qOf('wholesale')} />
          <LevelBoxes label="Tycoon" help={`32 more orders per level.${alpha ? ' Omega only.' : ''}`} value={s.tycoon} cap={cap('tycoon')} disabled={locked} onChange={(n) => set({ tycoon: n })} queue={qOf('tycoon')} />
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
                  <span><span className="lt">{x.name} <span style={{ color: 'var(--sec)' }}>{ROMAN[x.cur]} → {ROMAN[x.next]}</span></span><span className="ls" style={tq[x.key]?.run ? { color: 'var(--acc)' } : undefined}>{tq[x.key]?.run || tq[x.key]?.queued.length ? tq[x.key]!.text : x.days != null ? `${x.days.toFixed(1)} days of training` : 'Training time unknown'}</span></span>
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

/**
 * What standings are worth: every broker fee in the ledger, each over the rate you had when you paid it, priced at
 * other Caldari State and Caldari Navy standings. Drawn only once the app knows your standings: an unsynced 0 and 0
 * would put "you" confidently at the worst rate.
 */
function StandingsWorth() {
  const d = useData();
  const auth = useAuth();
  const now = useNow(60_000);
  const s = d.settings;
  const r = rates(s);
  const br = effectiveSkills(s).br;
  const known = s.faction !== 0 || s.corp !== 0 || (s.fromCharacter && !!auth?.scopes.includes(SCOPE.standings));
  // Each day's rate is measured from that day's placements matched to their orders; days with too few fall back to
  // the rate on record.
  const matches = feeMatchesFor(d, s);
  const measured = useMemo(() => measuredRates(matches.byOrder, d.journal), [matches, d.journal]);
  const fp = useMemo(() => brokerFeesPaid(nettedJournal(d.journal), now, (iso) => rateAt(d.meta.rateHistory, Date.parse(iso), r).f, measured),
    [d.journal, d.meta.rateHistory, r.f, now, measured]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = [...measured.keys()].sort();
  const w = useMemo(() => standingsWorth(fp.base, br, s.faction, s.corp), [fp.base, br, s.faction, s.corp]);
  const you = w.cases.find((c) => c.key === 'you')!;
  const both = w.cases.find((c) => c.key === 'both');
  const st = (n: number) => (Math.round(n * 100) / 100).toString();
  return (
    <Card title="What your standings are worth"
      right={<Tip title="What your standings are worth" text={'Your broker fee at Jita 4-4 is 3%, less 0.3% for each level of Broker Relations, less 0.03% × your Caldari State standing and 0.02% × your Caldari Navy standing, never under 1%. Caldari Navy counts because it owns the Jita 4-4 station: the station owner’s standing takes 0.02% off per point. Its security missions raise it directly, and the storylines they trigger raise Caldari State.\n\n• Every broker charge, price changes included, is that rate times the order’s value.\n• So each fee you paid, divided by the rate you had when you paid it, is the trading behind it. The chart prices that same trading at other standings.\n• Sales tax depends only on Accounting, so standings don’t change it.\n\nFor example: at Broker Relations V, Caldari State going from 0 to 10 takes 0.3% off every order you place.'} />}>
      {!fp.count ? <p className="note">No broker fees in your ledger yet. Once you’ve placed orders, this shows what your standings save you.</p>
        : !known ? <p className="note">The app doesn’t know your standings yet. Grant the Standings permission (Settings → Account) and sync, and this shows what they’re worth to you.</p>
          : (
            <>
              <p className="note" style={{ margin: 0 }}>
                Every broker fee you’ve paid since {fmtDate(fp.from!)}: <b>{iskBig(fp.paid)}</b> over {units(fp.count)} orders and price changes.
                {' '}At your standings now (Caldari State {st(s.faction)}, Caldari Navy {st(s.corp)}) your broker fee is <b>{pct(w.rateNow)}</b>. The same trading at other standings:
              </p>
              <StandingsChart height={180}
                lines={[
                  { label: 'Caldari Navy at 0', color: 'var(--neg)', dashed: true, points: w.curve(0) },
                  { label: `Caldari Navy at ${st(s.corp)} (yours)`, color: 'var(--acc)', points: w.curve(s.corp) },
                  ...(s.corp < 10 ? [{ label: 'Caldari Navy at 10', color: 'var(--pos)', dashed: true, points: w.curve(10) }] : []),
                ]}
                you={{ x: s.faction, fees: you.fees, tip: `Caldari State ${st(s.faction)}, Caldari Navy ${st(s.corp)}: ${pct(w.rateNow)}, ${iskBig(you.fees)} on all your trading so far.` }}
              />
              <div className="row" style={{ flexWrap: 'wrap', gap: '4px 16px', fontSize: 11.5, color: 'var(--label)' }}>
                <span><span style={{ color: 'var(--neg)' }}>╌</span> Caldari Navy at 0</span>
                <span><span style={{ color: 'var(--acc)' }}>━</span> Caldari Navy at {st(s.corp)}, yours</span>
                {s.corp < 10 && <span><span style={{ color: 'var(--pos)' }}>╌</span> Caldari Navy at 10</span>}
                <span><span style={{ color: 'var(--acc)' }}>●</span> you</span>
              </div>
              <div>
                {w.cases.map((c) => (
                  <div key={c.key} className="lrow">
                    <span><span className="lt" style={{ fontSize: 13 }}>{c.key === 'you' ? <b>{c.label}</b> : c.label}</span><span className="ls">Caldari State {st(c.faction)} · Caldari Navy {st(c.corp)} · broker fee {pct(c.rate)}</span></span>
                    <span className="lv" style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span>{iskBig(c.fees)}</span>
                      <span style={{ fontSize: 11.5, color: c.key === 'you' ? 'var(--faint)' : c.diff > 0 ? 'var(--neg-t)' : 'var(--pos)' }}>{c.key === 'you' ? 'now' : iskBigSigned(c.diff)}</span>
                    </span>
                  </div>
                ))}
              </div>
              {both && both.diff < 0 && (
                <p className="note" style={{ margin: 0 }}>At the pace you’ve traded since {fmtDate(fp.from!)}, both standings at 10 would save about <b>{iskBig(-both.diff * 30 / fp.days)}</b> a month.</p>
              )}
              <p className="note small" style={{ margin: 0 }}>
                {days.length
                  ? <>Every fee is read at the broker fee you actually paid that day, measured from your own orders ({days.length === 1 ? `${pct(measured.get(days[0])!)} on ${fmtDate(days[0])}` : `${pct(measured.get(days[0])!)} on ${fmtDate(days[0])}, ${pct(measured.get(days[days.length - 1])!)} on ${fmtDate(days[days.length - 1])}`}){fp.exact < fp.count ? `; ${units(fp.count - fp.exact)} on days with too few orders to measure are read at the fee the app had on record` : ''}.</>
                  : 'Each fee is read at the broker fee the app had on record when it was charged.'}
                {' '}Standings are as ESI reports them.
              </p>
            </>
          )}
    </Card>
  );
}

/** What the trade skills in your queue will change when they finish (skillQueue.ts). */
function ComingSkills() {
  const d = useData();
  const now = useNow(60_000);
  const coming = tradeSkillsComing(d.meta.skillQueue ?? [], d.meta.skillIds ?? {}, d.settings, now);
  if (!coming.length) return null;
  const said = (e: { what: 'tax' | 'broker' | 'relist' | 'slots'; before: number; after: number }) =>
    e.what === 'slots' ? `order slots ${e.before} → ${e.after}`
      : `${e.what === 'tax' ? 'sales tax' : e.what === 'broker' ? 'broker fee' : 'a price change'} ${(e.before * 100).toFixed(e.what === 'tax' ? 3 : 2)}% → ${(e.after * 100).toFixed(e.what === 'tax' ? 3 : 2)}%`;
  const when = (iso: string | null) => {
    if (!iso) return 'once your queue runs again (it’s paused)';
    const h = (Date.parse(iso) - now) / 3600_000;
    return `${h < 48 ? `in ${Math.max(1, Math.round(h))} h` : `in ${Math.round(h / 24)} days`} (${fmtDateTime(Date.parse(iso))})`;
  };
  return (
    <div className="notice" style={{ margin: 0 }}>
      <GraduationCap aria-hidden="true" />
      <div>
        <b>Coming up in your skill queue</b>
        {coming.map((c) => (
          <div key={`${c.key}${c.level}`} style={{ fontSize: 13 }}>{c.name} {['', 'I', 'II', 'III', 'IV', 'V'][c.level]}, {when(c.finish)}: {c.effects.map(said).join(', ')}.</div>
        ))}
        {d.settings.override && <div className="note small" style={{ margin: '4px 0 0' }}>Your fees are typed in, so they won’t change on their own: update them when it finishes.</div>}
      </div>
    </div>
  );
}

function RatesTab() {
  const d = useData();
  const s = d.settings;
  const r = rates(s);
  const alpha = s.clone === 'alpha';
  // What the skills and standings synced from the character give, to set beside figures typed in by hand.
  const auto = rates({ ...s, override: false });
  const autoBp = +(auto.f * 100).toFixed(2), autoTp = +(auto.t * 100).toFixed(3);
  const typedDiffers = s.override && (Math.abs(autoBp - s.brokerPct) >= 0.005 || Math.abs(autoTp - s.taxPct) >= 0.0005);
  const bb = Math.max(100, r.f * 1e8), bs = Math.max(100, r.f * 1.1e8), tx = r.t * 1.1e8;
  const rl = r.k * RELIST_LEFT * (1e8 + 1.1e8);
  const total = bb + bs + tx + rl;
  const bePct = Math.min(100, (r.be / 0.2) * 100);
  return (
    <>
      <div style={grid2}>
        <section className="panel" aria-label="Rates" style={{ padding: 18, gap: 14, clipPath: 'none' }}>
          <div className="panel-title">Rates</div>
          <ComingSkills />
          <div className="rates-grid">
            <div className="col" style={{ gap: 0, minWidth: 0 }}>
              <SetRow id="s-tax" label="Base sales tax" unit="%" value={s.taxBase} hint="Before your Accounting skill. Check it against the game." onChange={(n) => set({ taxBase: n })} />
              <SetRow id="s-target" label="Target return" unit="%" value={s.target} hint="What you want each trade to make after fees and tax. Trades are judged against it." onChange={(n) => set({ target: n })} />
              <SetRow id="s-share" label="Share of the market" unit="%" value={s.share}
                hint="How much of the trading on your side your orders catch. Scaled up to 1.5× on markets with few orders, down on crowded ones." onChange={(n) => set({ share: n })} />
              <MeasureShare onUse={(n) => set({ share: n })} />
              <SetRow id="s-wait" label="Wait before relisting" unit="h" value={s.waitHours} hint="An order whose queue clears within this is told to wait rather than move." onChange={(n) => set({ waitHours: n })} />
              <div style={{ padding: '12px 0 4px' }}>
                <Check bare checked={s.override} onChange={(on) => {
                  const cur = rates({ ...s, override: false });
                  set(on ? { override: true, brokerPct: +(cur.f * 100).toFixed(2), taxPct: +(cur.t * 100).toFixed(3) } : { override: false });
                }} desc={s.override
                  ? 'On: the two figures below are used exactly as typed and never update. A new skill level or standing changes nothing until you change them.'
                  : 'Off: worked out from your skills and standings, which update every time the app syncs your character.'}>
                  Type in my broker fee and sales tax myself
                </Check>
              </div>
              {s.override && (
                <div className="col" style={{ gap: 0, animation: 'unfold .3s ease-out' }}>
                  <SetRow id="s-bp" label="Broker fee" unit="%" value={s.brokerPct} hint="Typed in by you, copied from the game’s market window. It doesn’t update itself." onChange={(n) => set({ brokerPct: n })} />
                  <SetRow id="s-tp" label="Sales tax" unit="%" value={s.taxPct} hint="Typed in by you, as the game shows it. It doesn’t update itself." onChange={(n) => set({ taxPct: n })} />
                  {typedDiffers && (
                    <p className="note" style={{ margin: '8px 0 0' }}>
                      Your skills and standings now give a broker fee of <b>{autoBp}%</b> and sales tax of <b>{autoTp}%</b>.{' '}
                      <button type="button" className="link-btn" onClick={() => { set({ brokerPct: autoBp, taxPct: autoTp }); toast(`Broker fee ${autoBp}%, sales tax ${autoTp}%.`); }}>Use these</button>
                    </p>
                  )}
                  <p style={{ fontSize: 11.5, color: 'var(--acc2)', margin: '8px 0 0' }}>Update these when you switch between Alpha and Omega; typed-in rates don’t follow your clone state.</p>
                </div>
              )}
            </div>
            <div style={{ padding: '12px 14px', background: 'color-mix(in oklab,var(--acc) 6%,rgba(2,7,12,.6))', border: '1px solid color-mix(in oklab,var(--acc) 25%,transparent)' }}>
              <div className="lbl" style={{ marginBottom: 6 }}>What you pay</div>
              {[['Rates as', s.override ? 'Typed in by you' : alpha ? 'Alpha' : 'Omega'], ['Broker fee', pct(r.f)], ['Sales tax', pct(r.t)], ['Changing a price', `${pct(r.k)} of what’s left`], ['Break-even spread', pct(r.be, 1)]].map(([l, v]) => (
                <div key={l} className="kv" style={{ padding: '4px 0' }}><span style={{ color: 'var(--dim)' }}>{l}</span><span className="v" style={{ color: 'var(--ink)', fontSize: 13 }}>{v}</span></div>
              ))}
            </div>
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
      <StandingsWorth />
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
  // What the cloud mailed: this browser's own log holds only what it raised itself, so a new phone said "0" while
  // mail was going out all day. Read every minute while this is open.
  const [mailed, setMailed] = useState<Awaited<ReturnType<typeof cloudAlertLog>> | null>(null);
  useEffect(() => {
    if (!cloudEnabled()) return;
    let alive = true;
    const load = () => cloudAlertLog().then((r) => { if (alive) setMailed(r); }).catch(() => undefined);
    void load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const mailedDay = (mailed ?? []).filter((m) => now - m.at < 86400_000);
  const day = d.alertLog.filter((l) => !l.test && now - Date.parse(l.at) < 86400_000);
  const counts = ALERT_EVENTS.map((k) => ({ k, n: day.filter((l) => l.kind === k).length + mailedDay.filter((m) => m.kind === k).length }));
  const total = day.length + mailedDay.length;
  const recent = [
    ...d.alertLog.map((l) => ({ ...l, mail: false })),
    ...(mailed ?? []).map((m) => ({ at: new Date(m.at).toISOString(), kind: m.kind, key: `cloud:${m.key}`, title: m.title, text: m.text, test: false, mail: true })),
  ].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 8);
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
            <div className="lbl" style={{ marginBottom: 6 }}>Remind me again after</div>
            <div className="row wide">
              <Seg label="Remind me again after" value={a.repeatH} onChange={(v) => setA({ repeatH: v })} options={REPEAT_HOURS.map((h) => ({ v: h, label: `${h} h` }))} />
              <span className="note small">The same alert about an order waits this long before it comes again. Something new comes at once: here, a fresh undercut; by mail, a new price of yours, so a bot war doesn’t fill your inbox.</span>
            </div>
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
                <WithTip key={k} k={k}>
                  <Check bare checked={a.ev[k]} onChange={(v) => setA({ ev: { ...a.ev, [k]: v } })} desc={ALERT_LABELS[k].what}>{ALERT_LABELS[k].label}</Check>
                </WithTip>
              ))}
            </div>
          </div>
          <div><NumChip label="Only if at least" width={150} decimals={0} value={a.minIsk} onChange={(n) => setA({ minIsk: n ?? 0 })} tip="Ignore orders with less ISK than this at stake. Applies to the order alerts only." /></div>
          <Check bare checked={a.browser} onChange={toggleBrowser} desc="Shows even when this tab isn’t in front. Your browser will ask first.">Also send browser notifications</Check>
          <Check bare checked={a.quiet} onChange={(v) => setA({ quiet: v })} desc="Hold alerts overnight">Quiet hours, 23:00–07:00 EVE</Check>
        </section>
        <MailAlerts />
      </div>
      <div style={gridC}>
        <Card title="Alerts in the last 24 h">
          <div className="row" style={{ alignItems: 'baseline' }}><span className="mono" style={{ fontSize: 34, color: 'var(--acc)' }}>{total}</span><span style={{ fontSize: 13, color: 'var(--sec)' }}>raised by your settings</span></div>
          {mailed && <p className="note small" style={{ margin: '-6px 0 0' }}>{units(mailedDay.length)} mailed by the cloud, {units(day.length)} shown in this browser. Each device keeps its own list of what it showed; the mail is counted once, wherever you look.</p>}
          <div className="col" style={{ gap: 7 }}>
            {counts.map(({ k, n }) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) 32px', gap: 10, alignItems: 'center', fontSize: 12.5, opacity: a.on && a.ev[k] ? 1 : 0.4 }}>
                <span className="ellipsis" style={{ color: 'var(--body)' }}>{ALERT_LABELS[k].label}</span>
                <span className="track"><span className="fill" style={{ width: `${(n / mx) * 100}%`, background: COL[k] }} /></span>
                <span className="mono" style={{ textAlign: 'right', color: COL[k] }}>{n}</span>
              </div>
            ))}
          </div>
          <p className="note">{!a.on ? 'Alerts are off, so nothing is being raised.' : counts.find((c) => c.k === 'clearing')!.n > total / 2 ? '“Beaten but clearing” is most of that — it’s usually noise. Turning it off would quieten things.' : 'Raise “Only if at least” to cut the small ones further.'}</p>
        </Card>
        <Card title="Recent alerts">
          {!recent.length ? <p className="note">None yet. They appear here as they are raised, test ones included, and the cloud’s mails with them.</p> : (
            <div>
              {recent.map((l) => (
                <div key={l.at + l.key} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--line-4)' }}>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--faint)' }}>{new Date(l.at).toISOString().slice(11, 16)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="lbl" style={{ display: 'block', color: COL[l.kind] }}>{l.test ? 'Test · ' : ''}{l.mail ? 'Mail · ' : ''}{l.title}</span>
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
          <Points items={[
            { kind: 'info', icon: MessageSquare, lead: 'In the app', text: `alerts slide in at the bottom right and stay ${d.prefs.toastSeconds == null ? 'until you close them' : `for ${TOAST_SECONDS.find((o) => o.value === d.prefs.toastSeconds)?.label ?? `${d.prefs.toastSeconds} s`}`}; several at once come forward one at a time.` },
            { kind: 'info', icon: Bell, lead: 'Browser notifications', text: 'show the same text as a system notification while this tab is in the background.' },
          ]} />
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn primary" onClick={testAlert}><Send aria-hidden="true" />Send a test alert</button>
            {a.browser && (
              // A system notification only shows while this tab is in the background, so give time to switch away.
              <button type="button" className="btn" onClick={() => { toast('Switch to another window or tab now — the test notification arrives in 5 seconds.', 'info'); setTimeout(testAlert, 5000); }}>
                <BellRing aria-hidden="true" />Test a system notification
              </button>
            )}
          </div>
          {a.browser && <p className="note small">Your system draws those notifications and decides their look. <span data-tip="The app gives them its icon and, where the system shows pictures (Chrome on Windows and Android), a picture of the alert in the app’s style." style={{ textDecoration: 'underline dotted', cursor: 'help' }}>What the app adds</span></p>}
        </Card>
      </div>
    </>
  );
}

/**
 * An alert's checkbox with its "i" beside the name. The tip sits outside the checkbox, since a button
 * can't hold another button, and on the first line when the checkbox has a description under it.
 */
function WithTip({ k, children }: { k: AlertEvent; children: ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 7, minWidth: 0 }}>
      {children}
      <span style={{ marginTop: 1 }}><Tip text={ALERT_LABELS[k].tip} title={ALERT_LABELS[k].label} /></span>
    </span>
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
  // The cloud holding a sender does all the mailing, from any device: then no browser needs a sender of its own. The
  // user logged their sender in again on a new phone because this panel only looked at the browser's own logins.
  const cloud = useCloud();
  const cloudSender = cloudSendsMail(cloud) ? cloud.background?.keys.find((k) => k.purpose === 'mailer') ?? null : null;
  const canSend = !!auth && (!!cloudSender || !!alt || has(SCOPE.mailSend)), canDelete = has(SCOPE.mailOrganize), canRead = has(SCOPE.mailRead);
  const signInAlt = () => loginMailer().catch((e) => toast(e instanceof Error ? e.message : String(e), 'err'));
  const dropAlt = async () => {
    if (!(await confirmAsk({ title: 'Stop sending from this character?', body: `Alert mail will come from ${auth?.characterName ?? 'you'} to itself, which EVE only shows after you log in again. Nothing else changes.`, confirm: 'Stop', danger: true }))) return;
    await logoutMailer();
    toast(`${mailer?.characterName ?? 'That character'} no longer sends alert mail.`, 'info');
  };
  const sendTest = async () => {
    setSending(true);
    if (cloudSender) {
      try {
        const r = await cloudTestMail();
        toast(`The cloud sent a test mail from ${cloudSender.name}${r.about ? ` about ${r.about}` : ''}. It should arrive in game in a moment.`);
      } catch (e) {
        toast(`The cloud couldn’t send the test mail: ${e instanceof Error ? e.message : String(e)}`, 'err');
      }
      setSending(false);
      return;
    }
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
          {cloudSender ? (
            <div className="row wide" style={{ alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--body)', flex: 1, minWidth: 200 }}>
                From <b>{cloudSender.name}</b> to <b>{auth.characterName}</b>, sent by the cloud whether or not any browser is open. Nothing to log in here, on this device or any other.
              </span>
              <button type="button" className="link-btn" onClick={() => navigate('settings/data')}>Change it in Your data</button>
            </div>
          ) : alt ? (
            <div className="row wide" style={{ alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--body)', flex: 1, minWidth: 200 }}>From <b>{alt.characterName}</b> to <b>{auth.characterName}</b>, so it arrives like any other mail.</span>
              <button type="button" className="btn sm" onClick={signInAlt}>Change</button>
              <button type="button" className="link-btn dim" onClick={dropAlt}>Stop</button>
            </div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              <Points items={[
                { kind: 'warn', lead: 'Mail to itself', text: `from ${auth.characterName} reaches the inbox, but the game only shows it after you log in again.` },
                { kind: 'good', icon: Send, lead: 'From another character', text: 'it arrives like any other mail: any of yours, on this account or another, online or not.' },
                { kind: 'info', icon: ShieldCheck, lead: 'Its permissions', text: 'only to send mail and delete what it sent.' },
              ]} />
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <button type="button" className="btn sm" onClick={signInAlt}><LogIn aria-hidden="true" />Log in a character to send from</button>
                <span className="note small">EVE’s login page asks which character. Pick the other one, not {auth.characterName}.</span>
              </div>
            </div>
          )}
        </div>
      )}
      <Points compact items={[
        { kind: 'info', icon: MousePointerClick, lead: 'Item names', text: 'in a mail open the item’s market in game: EVE hands the link to your browser and the app opens the window. Nothing opens on its own.' },
        { kind: 'info', lead: 'Quiet hours', text: 'and “Only if at least” apply to mail too.' },
        { kind: 'good', icon: Cloud, lead: 'All day', text: 'once the cloud holds a sending character (Settings → Your data); until then, while a tab is open.' },
        { kind: 'tip', lead: 'CSPA', text: 'if your character charges strangers for mail, add the sending character as a contact.' },
      ]} />
      <div>
        <div className="lbl" style={{ marginBottom: 8 }}>Mail me about</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: '10px 24px', opacity: a.mail ? 1 : 0.45 }}>
          {ALERT_EVENTS.map((k) => (
            <WithTip key={k} k={k}>
              <Check bare checked={a.mailEv[k] && a.ev[k]} disabled={!a.ev[k]} onChange={(v) => setA({ mailEv: { ...a.mailEv, [k]: v } })}
                desc={!a.ev[k] ? 'Turned off under “Tell me when”' : undefined}>{ALERT_LABELS[k].label}</Check>
            </WithTip>
          ))}
        </div>
        <p className="note small" style={{ marginTop: 8 }}>By default only what you can act on from inside the game: an order worth moving, a planet about to stop, and from the cloud a trade worth a look, a mistake listing, and word when one of its jobs keeps failing.</p>
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
              : <>Deleted read or not, checked every {Math.round(tidyEvery(a.mailKeepMin) / 60_000)} minutes while the app is open. <span data-tip={`Only the app’s own alert mails go: ${canRead ? `from ${alt ? `${alt.characterName} or yourself` : 'yourself'}, with a subject starting “Jita Ledger:”${alt ? `, and ${alt.characterName}’s sent copy with them` : ''}.` : 'the ones this browser sent. With the Read EVE mail headers permission it could also find ones sent from another browser.'}`} style={{ textDecoration: 'underline dotted', cursor: 'help' }}>Only its own</span>.</>}
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
            <div className="theme-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
          <Points compact items={[
            { kind: 'info', icon: Palette, lead: 'Accent', text: 'actions and charts; the second colour, warnings and your price lines.' },
            { kind: 'good', lead: 'Profit and loss', text: 'keep their colours whatever the theme, so they always mean the same.' },
            { kind: 'info', icon: Eye, lead: 'The preview', text: 'is an illustration, not your data.' },
          ]} />
        </Card>
      </div>
    </>
  );
}

/**
 * The cloud copy of the ledger: whether it's on, when it last saved and checked, and what it holds. The
 * database keeps every change for 30 days and can be rewound to any minute in them, so the dated copies are
 * the database's own history rather than files.
 */
const KIND_SAID: Record<string, [string, string]> = {
  txs: ['trade', 'trades'], journal: ['journal entry', 'journal entries'], orders: ['order', 'orders'], names: ['item name', 'item names'],
  killmails: ['killmail', 'killmails'], tags: ['trade tag', 'trade tags'], positions: ['position', 'positions'], goals: ['goal', 'goals'],
  watchlist: ['watchlist item', 'watchlist items'], netWorth: ['net-worth day', 'net-worth days'],
};
const kindSaid = (kind: string, n: number) => { const w = KIND_SAID[kind] ?? [kind, kind]; return `${units(n)} ${n === 1 ? w[0] : w[1]}`; };
function CloudPanel() {
  const c = useCloud();
  const now = useNow(30_000);
  const [on, setOn] = useState(cloudEnabled);
  const [held, setHeld] = useState<{ kinds: { kind: string; n: number }[]; rev: number } | null>(null);
  const bg = c.background;
  const alerts = useData().alerts;
  const ready = on && c.phase !== 'waiting' && c.phase !== 'off';
  const refreshBg = () => cloudSummary().then((s) => { setHeld(s); }).catch(() => undefined);
  useEffect(() => { if (ready) refreshBg(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const watcher = bg?.keys.find((k) => k.purpose === 'main');
  const sender = bg?.keys.find((k) => k.purpose === 'mailer');
  const archiveJob = bg?.jobs.find((j) => j.job === 'archive');
  const alertsJob = bg?.jobs.find((j) => j.job === 'alerts');
  // A login error from before the login last worked is old news (the ledger copy runs only at :07), and permissions this
  // browser's login has that the cloud's lacks mean the cloud's is about to stop, or has.
  const archiveStale = !!archiveJob && !!watcher && errorPredatesLogin(archiveJob, [watcher]);
  const alertsStale = !!alertsJob && !!watcher && errorPredatesLogin(alertsJob, [watcher, ...(sender ? [sender] : [])]);
  const auth = useAuth();
  const missing = scopesMissing(auth?.scopes ?? [], watcher?.scopeNames);
  const stopWatchEl = () => (
    <button type="button" className="link-btn" disabled={!!busy} onClick={() => run('stop', async () => {
      if (!(await confirmAsk({ title: 'Stop keeping watch?', body: 'The cloud forgets its EVE login and stops reading your wallet while the app is closed. Your ledger in the cloud stays.', confirm: 'Stop' }))) return;
      await dropCloudLogin('main'); await refreshBg();
    })}>Stop</button>
  );
  const [esi, setEsi] = useState<{ url: string; status: number; ms: number; headers: Record<string, string> }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const last = Math.max(c.lastPushAt ?? 0, c.lastPullAt ?? 0);
  const covered = cloudCovers(c);
  const line =
    c.phase === 'off' ? 'Off in this browser. Your ledger lives only here until you turn it on.'
      : c.phase === 'waiting' ? 'Log in with EVE to keep your ledger in the cloud.'
        : c.phase === 'error' ? `The last attempt failed: ${c.error}. It tries again every minute.`
          : c.phase === 'working' ? `${c.doing ?? 'Working'}…`
            : last ? `In sync. Checked ${ago(new Date(last).toISOString(), now)}${c.pending ? `, ${units(c.pending)} change${c.pending === 1 ? '' : 's'} waiting to go up` : ''}.` : 'Connected.';
  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    try { await job(); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); } finally { setBusy(null); }
  };
  return (
    <section className="panel" aria-label="Cloud copy" style={{ padding: 18, gap: 12, clipPath: 'none' }}>
      <div className="panel-title">
        Cloud copy
        <Tip title="Cloud copy" text={'Your ledger is kept in the cloud as well as in this browser: trades, journal, orders, positions, goals, settings.\n\n• Every change goes up a few seconds after you make it, and anything changed on another device comes down every minute.\n• Log in on a new browser or PC and your ledger is there. Clear this browser and it comes back.\n• The cloud keeps every change for 30 days and can be rewound to any minute in them.\n\nIt’s stored in a Cloudflare database, and only your EVE login can read it.'} />
      </div>
      <p className="row tight" style={{ fontSize: 12.5, color: c.phase === 'error' ? 'var(--neg)' : covered ? 'var(--pos)' : 'var(--label)' }}>
        <Cloud aria-hidden="true" style={{ width: 14, height: 14 }} />{line}
      </p>
      <p className="note" style={{ margin: 0 }}>
        Other characters of yours can be read by the cloud too: <button type="button" className="link-btn" onClick={() => navigate('characters')}>Characters</button>.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <Check checked={on} onChange={(v) => { setOn(v); setCloudEnabled(v); }} tip="Each browser can be switched off on its own; the cloud copy stays either way.">Keep this browser in sync</Check>
        <button type="button" className="btn sm" disabled={!on || c.phase === 'waiting' || !!busy} onClick={() => run('sync', () => syncCloudNow())}><RefreshCw aria-hidden="true" />Sync now</button>
        <button type="button" className="btn sm" disabled={!on || c.phase === 'waiting' || !!busy} onClick={() => run('held', refreshBg)}><Database aria-hidden="true" />What’s in the cloud</button>
        <button type="button" className="link-btn" disabled={!on || c.phase === 'waiting' || !!busy} onClick={() => run('esi', async () => setEsi(await cloudEsiCheck()))}>Check ESI from the cloud</button>
      </div>
      <div className="sub-box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Keeping watch while the app is closed
          <Tip title="Keeping watch" text={'The cloud reads your wallet, journal, orders and assets every hour and keeps a net-worth point each day, whether or not a browser is open.\n\n• ESI only keeps 30 days of wallet history; with this on, a month away loses nothing.\n• It needs its own EVE login, held encrypted by the cloud. This browser keeps nothing extra.\n• Stop it any time here, or revoke it on EVE’s third-party applications page.'} />
        </div>
        {!ready ? <p className="note" style={{ margin: 0 }}>Turn on the cloud copy and log in first.</p>
          : !watcher ? (
            <>
              <p className="note" style={{ margin: 0 }}>Off. Your ledger only updates while a browser has the app open.</p>
              <button type="button" className="btn sm primary" style={{ alignSelf: 'flex-start' }} onClick={() => loginForCloud()}><Cloud aria-hidden="true" />Let the cloud keep watch</button>
            </>
          ) : watcher.refusedAt ? (
            <>
              <p className="note" style={{ margin: 0, color: 'var(--neg)' }}>
                {`On, as ${watcher.name}, but EVE has refused its login since ${fmtDateTime(watcher.refusedAt)}${watcher.refused ? ` (${watcher.refused})` : ''}. `}
                Nothing the cloud does with it works until you hand it over again: copying your ledger, reading your orders and planets, and the alerts about them.
              </p>
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn sm primary" onClick={() => loginForCloud()}><Cloud aria-hidden="true" />Hand the cloud your login again</button>
                {stopWatchEl()}
              </div>
            </>
          ) : (
            <>
              {missing.length > 0 && (
                <p className="note" style={{ margin: 0, color: 'var(--acc2)' }}>
                  {`You’re logged in here with ${missing.length === 1 ? 'a permission' : `${units(missing.length)} permissions`} the cloud’s login lacks, and logging in with new ones stops the cloud’s login: hand it over again. `}
                  <button type="button" className="link-btn" onClick={() => loginForCloud()}>Hand the cloud your login again</button>
                </p>
              )}
              <p className="note" style={{ margin: 0, color: archiveJob?.lastError && !archiveStale ? 'var(--neg)' : 'var(--pos)' }}>
                {`On, as ${watcher.name}. `}
                {!archiveJob ? 'The first hourly run is due soon.'
                  : archiveJob.lastError && archiveStale ? `The login works again (${fmtDateTime(watcher.at)}); the last run, at ${fmtDateTime(archiveJob.lastRun)}, was before that and failed. The next runs at 7 past the hour, or run it now.`
                  : archiveJob.lastError ? `The last run failed: ${archiveJob.lastError}.`
                    : `Last run ${ago(new Date(archiveJob.lastRun).toISOString(), now)}${archiveJob.detail ? `: ${[
                      ['trades', 'new trade'], ['journal', 'journal entry'], ['orders', 'order change'], ['names', 'name'],
                    ].map(([k, w]) => { const n = Number(archiveJob.detail?.[k] ?? 0); return n ? `${units(n)} ${n === 1 ? w : w === 'journal entry' ? 'journal entries' : w + 's'}` : null; }).filter(Boolean).join(', ') || 'nothing new'}` : ''}.`}
              </p>
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn sm" disabled={!!busy} onClick={() => run('archive', async () => { const r = await runCloudArchive(); toast(`Archived: ${units(r.trades)} new trades, ${units(r.journal)} journal entries, ${units(r.orders)} order changes.`); await syncCloudNow(); await refreshBg(); })}>
                  <RefreshCw aria-hidden="true" />{busy === 'archive' ? 'Running…' : 'Run it now'}
                </button>
                {stopWatchEl()}
              </div>
            </>
          )}
      </div>
      {ready && watcher && (
        <div className="sub-box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Alert mail while the app is closed
            <Tip title="Alert mail from the cloud" text={'With a character to send from, the cloud checks your orders against the Jita books it reads every five minutes, and your colonies every hour, and mails you in game, whether or not a browser is open.\n\n• It judges an order by the same rules as the Orders page, and mails what your Alerts settings say to mail: the same kinds, the same minimum, quiet hours and check interval.\n• An order is mailed about once at each price of yours. Move it and get beaten again, and you hear again; leave it, and you are reminded after ' + alerts.repeatH + ' hours (Alerts → Remind me again after).\n• While the cloud mails, this browser doesn’t, so nothing arrives twice. Old alert mails are deleted on the same schedule.\n• Squeeze and suspicious-market alerts still come only from an open app.'} />
          </div>
          {!sender ? (
            <>
              <p className="note" style={{ margin: 0 }}>Off. Alert mail goes out only while a browser has the app open. Log in your second character here and the cloud sends from it, day and night.</p>
              {!alerts.on || !alerts.mail ? <p className="note" style={{ margin: 0, color: 'var(--acc2)' }}>Alert mail is switched off under Alerts, so nothing would be sent yet.</p> : null}
              <button type="button" className="btn sm primary" style={{ alignSelf: 'flex-start' }} onClick={() => loginMailerForCloud()}><Cloud aria-hidden="true" />Let the cloud send alert mail</button>
            </>
          ) : (
            <>
              <p className="note" style={{ margin: 0, color: sender.refusedAt || (alertsJob?.lastError && !alertsStale) ? 'var(--neg)' : !alerts.on || !alerts.mail ? 'var(--acc2)' : 'var(--pos)' }}>
                {`From ${sender.name} to ${watcher.name}. `}
                {sender.refusedAt ? `EVE has refused ${sender.name}’s login since ${fmtDateTime(sender.refusedAt)}${sender.refused ? ` (${sender.refused})` : ''}, so no alert mail can be sent until you hand it over again.`
                  : !alerts.on || !alerts.mail ? 'Alerts or alert mail are switched off under Alerts, so nothing is sent.'
                  : !alertsJob ? 'The first check is due within five minutes.'
                    : alertsJob.lastError && alertsStale ? `The logins work again; the last check, at ${fmtDateTime(alertsJob.lastRun)}, was before that and failed. The next is within five minutes.`
                    : alertsJob.lastError ? `The last check failed: ${alertsJob.lastError}.`
                      : `Last check ${ago(new Date(alertsJob.lastRun).toISOString(), now)}: ${units(Number(alertsJob.detail?.judged ?? 0))} orders judged, ${Number(alertsJob.detail?.mailed ?? 0) ? `${units(Number(alertsJob.detail?.mailed))} alert${Number(alertsJob.detail?.mailed) === 1 ? '' : 's'} mailed` : 'nothing new to mail'}.`}
              </p>
              <div className="row" style={{ gap: 10 }}>
                {sender.refusedAt && <button type="button" className="btn sm primary" onClick={() => loginMailerForCloud()}><Cloud aria-hidden="true" />Hand the cloud {sender.name}’s login again</button>}
                <button type="button" className="btn sm" disabled={!!busy} onClick={() => run('cloudmail', async () => {
                  const r = await cloudTestMail();
                  toast(`The cloud sent a test mail${r.about ? ` about ${r.about}` : ''}. It should arrive in game in a moment.`);
                })}>
                  <Mail aria-hidden="true" />{busy === 'cloudmail' ? 'Sending…' : 'Send a test mail'}
                </button>
                <button type="button" className="link-btn" disabled={!!busy} onClick={() => run('stopmail', async () => {
                  if (!(await confirmAsk({ title: 'Stop cloud alert mail?', body: `The cloud forgets ${sender.name}’s login. Alert mail goes back to coming from an open app.`, confirm: 'Stop' }))) return;
                  await dropCloudLogin('mailer'); await refreshBg();
                })}>Stop</button>
              </div>
            </>
          )}
        </div>
      )}
      {held && (
        <p className="note" style={{ margin: 0 }}>
          {held.kinds.length ? `${held.kinds.map((k) => kindSaid(k.kind, k.n)).join(', ')}.` : 'Nothing yet.'} Revision {units(held.rev)}.
        </p>
      )}
      {esi && (
        <div className="note" style={{ margin: 0 }}>
          {esi.map((x) => (
            <div key={x.url} className="mono" style={{ fontSize: 11.5 }}>
              {x.status} in {x.ms} ms · {x.url.replace('https://esi.evetech.net', '')}{Object.keys(x.headers).length ? ` · ${Object.entries(x.headers).filter(([k]) => /limit|remain/i.test(k)).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const SCAN_STEP = {
  pages: { n: 1, what: 'Reading every order in The Forge', unit: 'pages' },
  history: { n: 2, what: 'Checking price history', unit: 'items' },
  saving: { n: 2, what: 'Saving the results', unit: 'items' },
} as const;
const took = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`);

/**
 * The cloud's daily full-market scan: when it last ran and what it covered, where a running one has got to, and
 * when the next one is due.
 */
function ScanTab() {
  const c = useCloud();
  const now = useNow(15_000);
  const { status: s, error } = useCloudScanStatus();
  const saved = useScanState().saved;
  const [runs, setRuns] = useState<ScanRuns | undefined>();
  useEffect(() => { loadCache().then((x) => setRuns(x.runs)).catch(() => undefined); }, [saved, s?.last?.at]);
  const ready = cloudEnabled() && c.phase !== 'waiting' && c.phase !== 'off';
  const p = s?.progress ?? null;
  const last = s?.last ?? null;
  const step = p ? SCAN_STEP[p.phase] : null;
  const share = p ? (p.phase === 'saving' ? 1 : p.total ? p.done / p.total : 0) : 0;
  const local = [runs?.quick && { at: runs.quick, depth: 'quick' }, runs?.deep && { at: runs.deep, depth: 'deep' }]
    .filter((x): x is { at: string; depth: string } => !!x).sort((a, b) => b.at.localeCompare(a.at))[0];
  const nextCatchUp = s ? new Date(s.next).getUTCMinutes() === 7 : false;
  const line = !ready ? null
    : p ? `Running now: started ${ago(p.startedAt, now)}.`
      : s?.lastError ? `The last run failed: ${s.lastError}. It tries again at the next hourly check.`
        : last ? `Last ran ${fmtDateTime(last.at)}, ${ago(last.at, now)}. It took ${took(last.seconds)}.`
          : s ? 'No full scan has run yet.' : error ? `Couldn’t reach the cloud: ${error}.` : 'Asking the cloud…';
  return (
    <div style={grid2}>
      <section className="panel" aria-label="Full-market scan" style={{ padding: 18, gap: 12, clipPath: 'none' }}>
        <div className="panel-title">
          Full-market scan
          <Tip title="Full-market scan" text={'Once a day the cloud reads every order in The Forge and checks the price history of every item a trade could pay on. Prospects and the Capital planner open on it, so you don’t have to scan.\n\n• It runs at 11:25 EVE time, 20 minutes after ESI publishes the day’s trading history.\n• A run that is missed, or stops at its time limit, carries on at the next hourly check (7 minutes past).\n• Between runs the cloud re-reads the prices of the best 150 candidates every five minutes, so the top of the list stays current.\n• Quick and Deep scan on Prospects still work. They sample part of the book from this browser, and whichever scan is newest is the one used.'} />
        </div>
        {!ready ? (
          <p className="note" style={{ margin: 0 }}>Turn on the cloud copy and log in (Settings → Your data) to see it here. The scan runs either way.</p>
        ) : (
          <>
            <p className="row tight" style={{ fontSize: 12.5, color: p ? 'var(--acc)' : s?.lastError ? 'var(--neg)' : last ? 'var(--pos)' : 'var(--label)' }}>
              <Radar aria-hidden="true" style={{ width: 14, height: 14 }} />{line}
            </p>
            {p && step && (
              <div className="sub-box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="lbl">Step {step.n} of 2 · {step.what}</div>
                <span className="track h8" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
                  <span className="fill glow" style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
                <div className="note small" style={{ margin: 0 }}>
                  {p.phase === 'saving' ? 'Nearly done.' : `${units(p.done)} of ${units(p.total)} ${step.unit} (${Math.round(share * 100)}%).`}
                  {p.phase === 'pages' ? ' Then it checks the price history of every item worth a look.' : ''}
                </div>
              </div>
            )}
            {s && (
              <p className="note" style={{ margin: 0 }}>
                Next run: <b>{fmtDateTime(s.next)}</b>, {until(s.next, now)}{!p && nextCatchUp ? ', catching up on today’s' : ''}.
              </p>
            )}
            {last && !p && (
              <p className="note" style={{ margin: 0 }}>
                {runs?.cloud === last.at ? 'This browser is using it: Prospects and the Capital planner open on it.'
                  : local && local.at > last.at ? `This browser is using the ${local.depth} scan you ran here ${ago(local.at, now)}, since it’s newer. The next full scan takes over.`
                    : 'This browser is taking it now.'}
              </p>
            )}
          </>
        )}
      </section>
      {ready && last && (
        <Card title="What the last run covered">
          <div>
            {[
              { l: 'Order book pages read', h: 'All of The Forge, every order', v: last.pagesFailed ? `${units(last.pages - last.pagesFailed)} of ${units(last.pages)}` : `${units(last.pages)} of ${units(last.pages)}` },
              { l: 'Items for sale or wanted in Jita', h: 'At Jita 4-4, plus PLEX', v: units(last.jitaTypes) },
              { l: 'With both buyers and sellers', h: 'Items NPCs sell are left out: nothing undercuts them', v: units(last.twoSided) },
              { l: 'Price history checked', h: `Every item whose buy and sell prices are far enough apart to pay the fees, and the ${units(300)} busiest`, v: units(last.checked) },
              { l: 'In Prospects', h: 'Those with trading history to judge them by', v: units(last.kept) },
            ].map((x) => (
              <div key={x.l} className="lrow"><span><span className="lt" style={{ fontSize: 13 }}>{x.l}</span><span className="ls">{x.h}</span></span><span className="lv mono" style={{ fontSize: 13 }}>{x.v}</span></div>
            ))}
          </div>
          {last.partial && (
            <p className="note" style={{ color: 'var(--acc2)' }}>
              It stopped at its time limit with {units(last.history.remaining)} items still to check. The next hourly check carries on from there.
            </p>
          )}
          {!!last.history.failed && (
            <p className="note">ESI didn’t answer for {units(last.history.failed)} item{last.history.failed === 1 ? '' : 's'}. {last.history.failed === 1 ? 'It keeps its' : 'Each keeps its'} history from the check before, where there was one.</p>
          )}
        </Card>
      )}
    </div>
  );
}

function DataTab() {
  const d = useData();
  const cloud = useCloud();
  const covered = cloudCovers(cloud);
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
        <CloudPanel />
        <section className="panel" aria-label="Your data" style={{ padding: 18, gap: 12, clipPath: 'none' }}>
          <div className="panel-title">Your data</div>
          <p style={{ fontSize: 12, color: 'var(--label)', textWrap: 'pretty' }}>
            {covered
              ? 'ESI only returns about 30 days of wallet history and 90 days of order history. Your ledger is kept in the cloud, so a backup file is optional: one to keep for yourself, or to move to a character the cloud doesn’t know.'
              : 'ESI only returns about 30 days of wallet history and 90 days of order history, so this browser is your long-term record. Export a backup now and then, or keep a copy in the cloud.'}
          </p>
          <p className="row tight" style={{ fontSize: 12.5, color: covered ? 'var(--label)' : old ? 'var(--acc2)' : 'var(--pos)' }}>
            <HardDriveDownload aria-hidden="true" style={{ width: 14, height: 14 }} />
            {days == null ? 'You have never exported a backup file from this browser.' : `Last backup file ${days} day${days === 1 ? '' : 's'} ago${old && !covered ? ' — time for another.' : '.'}`}
          </p>
          <div className="row">
            <button type="button" className="btn sm" onClick={doExport}><Download aria-hidden="true" />Export backup</button>
            <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}><Upload aria-hidden="true" />Import backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
            <button type="button" className="btn sm danger" onClick={async () => {
              if (!(await confirmAsk({ title: 'Delete everything in this browser?', body: (covered ? 'Every position, trade and setting goes from this browser. The cloud copy stays and comes straight back down, so this starts the browser afresh from the cloud. Turn cloud sync off first if you want this browser to stay empty.' : 'Every position, trade and setting goes. Export a backup first if you might want them back.') + (Object.keys(d.chars ?? {}).length ? ' Your other characters’ copy in this browser goes too; the cloud keeps theirs.' : ''), confirm: 'Delete everything', danger: true }))) return;
              await clearAll();
              toast(covered ? 'Everything was deleted from this browser. The cloud’s copy is coming back down.' : 'Everything was deleted from this browser.', 'err');
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
          <p className="note">{fmt(sizes.reduce((t, x) => t + x.bytes, 0))} in total, measured as saved. {covered ? 'Trades older than ESI’s 30 days are kept here and in the cloud.' : 'Trades older than ESI’s 30 days exist only here.'}</p>
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
