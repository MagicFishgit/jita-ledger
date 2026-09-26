import { useRef, useState, type ChangeEvent } from 'react';
import { effectiveSkills, orderSlots, rates, sanitizeSettings, type Settings as S } from '../lib/fees';
import { ago, pct, plainNum, units } from '../lib/format';
import { clearAll, exportAll, importAll, update, useData } from '../lib/store';
import { confirmAsk } from '../lib/confirm';
import { isConfigured, login, logout } from '../lib/auth';
import { syncCharacter, useSyncState } from '../lib/sync';
import { useAuth } from '../lib/hooks';
import { ALPHA_CAPS, REDIRECT_URI, SCOPE_INFO, SCOPES } from '../lib/config';
import { LevelBoxes, downloadText } from './common';

export function NumField(props: { id: string; label: string; value: number; hint?: string; disabled?: boolean; onChange: (n: number) => void }) {
  const [text, setText] = useState(plainNum(props.value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : plainNum(props.value);
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id} type="text" inputMode="decimal" value={shown} disabled={props.disabled}
        onFocus={() => { setText(plainNum(props.value)); setFocused(true); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value.replace(/,/g, '').replace('%', ''));
          if (Number.isFinite(n)) props.onChange(n);
        }}
      />
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  );
}

export function CloneSwitch(props: { value: 'alpha' | 'omega'; onChange: (v: 'alpha' | 'omega') => void }) {
  return (
    <div className="seg-control" role="group" aria-label="Clone state">
      <button type="button" aria-pressed={props.value === 'alpha'} onClick={() => props.onChange('alpha')}>Alpha</button>
      <button type="button" aria-pressed={props.value === 'omega'} onClick={() => props.onChange('omega')}>Omega</button>
    </div>
  );
}

export function Settings() {
  const d = useData();
  const auth = useAuth();
  const sync = useSyncState();
  const s = d.settings;
  const r = rates(s);
  const eff = effectiveSkills(s);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dataMsg, setDataMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const locked = !!auth && s.fromCharacter;
  const alpha = s.clone === 'alpha';
  const cap = (k: keyof typeof ALPHA_CAPS) => (alpha ? ALPHA_CAPS[k] : null);

  const set = (patch: Partial<S>) => update((x) => ({ settings: sanitizeSettings({ ...x.settings, ...patch }) }));

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importAll(await file.text());
      setDataMsg({ text: 'Imported. Your positions, trades and settings are restored.' });
    } catch (err) {
      setDataMsg({ text: err instanceof Error ? err.message : String(err), err: true });
    }
  }

  const detectedNote = d.meta.cloneDetected
    ? `Read from ${auth?.characterName ?? 'your character'}'s skills on the last sync.`
    : auth
      ? 'ESI doesn’t report clone state directly, and your skills don’t show it yet, so set it here.'
      : 'Alpha clones can’t use Accounting or Advanced Broker Relations, and only use Broker Relations up to level II.';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your character, trade skills and rates. Everything is saved in this browser.</p>
        </div>
      </div>
      <div className="cols even">
        <div className="stack">
          <section className="card stack" aria-label="Character">
            <h2 className="section" style={{ margin: 0 }}>Character</h2>
            {!isConfigured() ? (
              <p className="notice warn" style={{ margin: 0 }}>
                No EVE client ID is set, so login is off. Register an application on developers.eveonline.com with the callback URL
                <br /><code>{REDIRECT_URI}</code><br />and set <code>VITE_EVE_CLIENT_ID</code> as described in the README.
              </p>
            ) : auth ? (
              <>
                <div className="row">
                  <img src={`https://images.evetech.net/characters/${auth.characterId}/portrait?size=128`} alt="" width={64} height={64} style={{ borderRadius: 4 }} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 20 }}>{auth.characterName}</div>
                    <div className="small muted">Last synced {ago(d.meta.lastSync)}</div>
                  </div>
                </div>
                {sync.error && <p className="notice err" style={{ margin: 0 }} role="alert">Sync failed: {sync.error}</p>}
                <div className="row">
                  <button className="btn btn-primary" disabled={sync.running} onClick={() => syncCharacter()}>{sync.running ? 'Syncing…' : 'Sync now'}</button>
                  <button className="btn" onClick={() => logout()}>Log out</button>
                </div>

              </>
            ) : (
              <>
                <p style={{ margin: 0 }}>
                  Log in to fill in your skills, standings and clone state and to track your trades. Everything it asks for
                  is read-only — ESI has no way to place, change or cancel an order, so nothing here can trade for you. The
                  one exception writes nothing: opening a market window in your client.
                </p>

                <div><button className="btn btn-primary" onClick={() => login().catch((e) => setLoginErr(String(e.message ?? e)))}>Log in with EVE Online</button></div>
                {loginErr && <p className="small neg" role="alert" style={{ margin: 0 }}>{loginErr}</p>}
              </>
            )}
            {/* Always shown: when login is off this is the list to tick on your application, and
                when you are logged in it is the list of what you actually granted. */}
            <ScopeList granted={auth?.scopes ?? []} />
            <div>
              <span className="label">Clone state</span>
              <CloneSwitch value={s.clone} onChange={(v) => set({ clone: v })} />
              <p className="hint">{detectedNote}</p>
            </div>
            <label className="check">
              <input type="checkbox" checked={s.fromCharacter} onChange={(e) => set({ fromCharacter: e.target.checked })} />
              <span>Fill skills, standings and clone state from my character when I sync</span>
            </label>
          </section>

          <section className="card" aria-label="Your data">
            <h2 className="section">Your data</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              ESI only returns about 30 days of wallet history and 90 days of order history, so this browser is your long-term record.
              Export a backup now and then, and import it on another device.
            </p>
            <div className="row">
              <button className="btn" onClick={async () => downloadText(`jita-ledger-${new Date().toISOString().slice(0, 10)}.json`, await exportAll())}>Export backup</button>
              <button className="btn" onClick={() => fileRef.current?.click()}>Import backup</button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
              <button className="btn btn-danger" onClick={async () => {
                if (!(await confirmAsk({
                  title: 'Delete everything in this browser?',
                  body: 'Every position, trade and setting goes. Export a backup first if you might want them back.',
                  confirm: 'Delete everything', danger: true,
                }))) return;
                await clearAll();
                setDataMsg({ text: 'Everything was deleted from this browser.' });
              }}>Delete all data</button>
            </div>
            {dataMsg && <p className={'small ' + (dataMsg.err ? 'neg' : 'muted')} role="status">{dataMsg.text}</p>}
          </section>
        </div>

        <div className="stack">
          <section className="card" aria-label="Skills and standings">
            <h2 className="section">Skills and standings</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              {locked ? `Trained levels, filled from ${auth!.characterName} on each sync. ` : 'Set the levels you’ve trained. '}
              {alpha && 'Striped boxes are trained but locked while you’re Alpha; they switch on when you go Omega.'}
            </p>
            <LevelBoxes label="Accounting" help={`Cuts sales tax by 11% per level.${alpha ? ' Omega only.' : ''}`} value={s.acc} cap={cap('acc')} disabled={locked} onChange={(n) => set({ acc: n })} />
            <LevelBoxes label="Broker Relations" help={`Cuts the broker fee by 0.3 points per level.${alpha ? ' Alpha can use up to level II.' : ''}`} value={s.br} cap={cap('br')} disabled={locked} onChange={(n) => set({ br: n })} />
            <LevelBoxes label="Advanced Broker Relations" help={`Cuts the fee for changing an order’s price.${alpha ? ' Omega only.' : ''}`} value={s.abr} cap={cap('abr')} disabled={locked} onChange={(n) => set({ abr: n })} />
            <div className="fields" style={{ marginTop: 10 }}>
              <NumField id="s-fac" label="Caldari State standing" value={s.faction} disabled={locked} onChange={(n) => set({ faction: n })} />
              <NumField id="s-corp" label="Caldari Navy standing" value={s.corp} disabled={locked} onChange={(n) => set({ corp: n })} />
            </div>
            <p className="hint">Base standing from 0 to 10. Skills that boost standings don’t lower the broker fee.</p>
          </section>

          <section className="card" aria-label="Order slots">
            <h2 className="section">Order slots: {units(orderSlots(eff))}</h2>
            <p className="small muted" style={{ marginTop: 0 }}>How many buy and sell orders you can have open at once. You start with 5.</p>
            <LevelBoxes label="Trade" help={`4 more orders per level.${alpha ? ' Alpha can use up to level III.' : ''}`} value={s.trade} cap={cap('trade')} disabled={locked} onChange={(n) => set({ trade: n })} />
            <LevelBoxes label="Retail" help={`8 more orders per level.${alpha ? ' Omega only.' : ''}`} value={s.retail} cap={cap('retail')} disabled={locked} onChange={(n) => set({ retail: n })} />
            <LevelBoxes label="Wholesale" help={`16 more orders per level.${alpha ? ' Omega only.' : ''}`} value={s.wholesale} cap={cap('wholesale')} disabled={locked} onChange={(n) => set({ wholesale: n })} />
            <LevelBoxes label="Tycoon" help={`32 more orders per level.${alpha ? ' Omega only.' : ''}`} value={s.tycoon} cap={cap('tycoon')} disabled={locked} onChange={(n) => set({ tycoon: n })} />
          </section>

          <section className="card stack" aria-label="Rates">
            <h2 className="section" style={{ margin: 0 }}>Rates</h2>
            <div className="fields">
              <NumField id="s-tax" label="Base sales tax %" value={s.taxBase} hint="Before Accounting. Check it against the game." onChange={(n) => set({ taxBase: n })} />
              <NumField id="s-target" label="Target return %" value={s.target} hint="Used to judge each trade." onChange={(n) => set({ target: n })} />
              <NumField id="s-share" label="Share of daily volume %" value={s.share} hint="For the watchlist’s ISK per day estimate." onChange={(n) => set({ share: n })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={s.override} onChange={(e) => {
                const on = e.target.checked;
                const cur = rates({ ...s, override: false });
                set(on ? { override: true, brokerPct: +(cur.f * 100).toFixed(2), taxPct: +(cur.t * 100).toFixed(3) } : { override: false });
              }} />
              <span>Use my exact broker fee and sales tax from the game</span>
            </label>
            {s.override && (
              <div className="fields">
                <NumField id="s-bp" label="Broker fee %" value={s.brokerPct} onChange={(n) => set({ brokerPct: n })} />
                <NumField id="s-tp" label="Sales tax %" value={s.taxPct} onChange={(n) => set({ taxPct: n })} />
              </div>
            )}
            {s.override && <p className="hint" style={{ marginTop: -6 }}>Update these when you switch between Alpha and Omega; exact rates don’t follow your clone state.</p>}
            <dl className="rates-out">
              <dt>Rates as</dt><dd>{alpha ? 'Alpha' : 'Omega'}</dd>
              <dt>Broker fee</dt><dd>{pct(r.f)}</dd>
              <dt>Sales tax</dt><dd>{pct(r.t)}</dd>
              <dt>Changing a price</dt><dd>{pct(r.k)} of order</dd>
              <dt>Break-even spread</dt><dd>{pct(r.be, 1)}</dd>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Which permissions you granted, and what each one is actually for.
 *
 * Scopes are registered on your application at developers.eveonline.com and granted at login, and
 * the two can drift apart --- a scope added to the app after you last logged in is simply absent
 * until you log in again, with no error anywhere. Naming them individually is the difference
 * between "something is missing" and knowing which page is quietly running on less than it could.
 */
function ScopeList({ granted }: { granted: string[] }) {
  const missing = SCOPES.filter((sc) => !granted.includes(sc));
  return (
    <div>
      <span className="label">Permissions</span>
      {granted.length > 0 && (
        <p className="small muted" style={{ margin: '0 0 8px' }}>
          {missing.length === 0
            ? 'All granted. Everything in the app has what it needs.'
            : `${missing.length} of ${SCOPES.length} not granted. Each must be ticked on your application at developers.eveonline.com first, then log out and in again here.`}
        </p>
      )}
      <ul className="scopes">
        {SCOPES.map((sc) => {
          const info = SCOPE_INFO[sc];
          const has = granted.includes(sc);
          return (
            <li key={sc}>
              <span className={'dot ' + (granted.length === 0 ? 'unknown' : has ? 'met' : 'missing')} aria-hidden="true" />
              <div>
                <strong>{info?.label ?? sc}</strong>
                {granted.length > 0 && !has && <span className="flag" style={{ marginLeft: 8 }}>not granted</span>}
                <code className="small muted" style={{ display: 'block' }}>{sc}</code>
                <span className="small muted">{info?.unlocks}</span>
                {granted.length > 0 && !has && info && (
                  <span className="small warn" style={{ display: 'block' }}>Without it: {info.without}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
