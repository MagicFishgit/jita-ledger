import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ClipboardList, PackageSearch, RefreshCw } from 'lucide-react';
import { getAuth, hasScope } from '../lib/auth';
import { JITA_44, SCOPE } from '../lib/config';
import { esi, esiAllPages } from '../lib/esi';
import type { RawAsset } from '../lib/esiRecords';
import { ago, fmtDateTime, units } from '../lib/format';
import { assetsTakenAt, flagLabel, hangarCheck, holderIds, pathLabel, readPlaces, resolvePick, whereLabel, type HangarPick, type Place, type Spot, type TrackedRow, type Where } from '../lib/hangarCheck';
import { navigate, useNow } from '../lib/hooks';
import { resolveNames } from '../lib/market';
import { useData } from '../lib/store';
import { isStation, isStructure, isSystem, structureInfo, type StructureRead } from '../lib/universe';
import { NameInGame, useEnsureNames } from './common';
import { Points } from './Facts';
import { cssVars, ItemIcon, Notice, Th } from './ui';

/** The last place looked at, kept in this browser: a place and one of its spots (`HangarPick`). */
const PICK_KEY = 'jita-ledger:hangar-pick';
const keptPick = (): HangarPick | null => {
  try {
    const v = JSON.parse(localStorage.getItem(PICK_KEY) ?? 'null') as HangarPick | null;
    return v && Number.isFinite(v.place) && typeof v.spot === 'string' ? v : null;
  } catch { return null; }
};
const keepPick = (p: HangarPick) => { try { localStorage.setItem(PICK_KEY, JSON.stringify(p)); } catch { /* this visit only */ } };

type Read = { raw: RawAsset[]; names: Map<number, string>; namesFailed: boolean; expires: number | null };

/**
 * Your assets, read fresh (ESI still holds them an hour), and the names you gave the containers and ships among them, in
 * calls of their own a thousand at a time, so a refused one leaves the assets and the other names. Nothing is saved.
 */
async function readHangar(cid: number): Promise<Read> {
  const ex = { at: null as number | null };
  const raw = await esiAllPages<RawAsset>(`/characters/${cid}/assets/`, { auth: true, fresh: true, onExpires: (at) => { ex.at = at; } });
  const ids = holderIds(raw);
  const names = new Map<number, string>();
  let namesFailed = false;
  for (let i = 0; i < ids.length; i += 1000) {
    try {
      const { data } = await esi<{ item_id: number; name: string }[]>(`/characters/${cid}/assets/names/`, { auth: true, method: 'POST', body: ids.slice(i, i + 1000) });
      for (const n of data) names.set(n.item_id, n.name);
    } catch { namesFailed = true; }
  }
  return { raw, names, namesFailed, expires: ex.at };
}

/** "Check my hangar" on Positions: the button, and the dialog behind it. */
export function HangarCheckButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn tall" onClick={() => setOpen(true)}
        data-tip-title="Check my hangar" data-tip="Reads what you hold, fresh from EVE, and lists what a position of yours could count: loot of an item you trade, say, which a sale would take from the position’s own stock.">
        <PackageSearch aria-hidden="true" />Check my hangar
      </button>
      {open && <HangarCheckDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function HangarCheckDialog({ onClose }: { onClose: () => void }) {
  const d = useData();
  const now = useNow();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const can = hasScope(SCOPE.assets);
  const [read, setRead] = useState<Read | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  const load = async () => {
    const cid = getAuth()?.characterId;
    if (!cid) return;
    setBusy(true); setErr(null);
    try { setRead(await readHangar(cid)); setReadAt(Date.now()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (can) void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const places = useMemo(() => (read ? readPlaces(read.raw, read.names) : null), [read]);
  const [kept, setKept] = useState<HangarPick | null>(keptPick);
  const pick = places ? resolvePick(places, kept) : null;
  const choose = (p: HangarPick) => { setKept(p); keepPick(p); };

  // Stations and systems by their public names; structures as far as ESI will say (the Wallet's "Where your wealth sits").
  const [placeNames, setPlaceNames] = useState<Record<number, string>>({});
  const [structs, setStructs] = useState<Record<number, StructureRead>>({});
  const placeKey = (places ?? []).map((p) => p.id).filter((id) => id !== JITA_44).join(',');
  useEffect(() => {
    const ids = placeKey ? placeKey.split(',').map(Number) : [];
    let alive = true;
    const pub = ids.filter((id) => isStation(id) || isSystem(id));
    if (pub.length) resolveNames(pub).then((n) => { if (alive) setPlaceNames(n); }).catch(() => undefined);
    const st = ids.filter(isStructure);
    if (st.length) Promise.all(st.map(async (id) => [id, await structureInfo(id)] as const)).then((l) => { if (alive) setStructs(Object.fromEntries(l)); }).catch(() => undefined);
    return () => { alive = false; };
  }, [placeKey]);
  /** A place's name, and how it reads mid-sentence. */
  const placeOf = (id: number): { l: string; said: string } => {
    if (id === JITA_44) return { l: 'Jita 4-4', said: 'Jita 4-4' };
    if (isStation(id)) return placeNames[id] ? { l: placeNames[id], said: placeNames[id] } : { l: 'A station', said: 'a station' };
    if (isSystem(id)) return placeNames[id] ? { l: `In space · ${placeNames[id]}`, said: `space in ${placeNames[id]}` } : { l: 'In space', said: 'space' };
    if (isStructure(id)) {
      const r = structs[id];
      if (r?.status === 'found') return { l: r.name, said: r.name };
      if (r?.status === 'refused') return { l: 'A structure you can’t see into', said: 'a structure you can’t see into' };
      return { l: 'A player structure', said: 'a player structure' };
    }
    return { l: `Location ${id}`, said: `location ${id}` };
  };

  const place = places?.find((p) => p.id === pick?.place) ?? null;
  const spot = place?.spots.find((s) => s.key === pick?.spot) ?? null;
  const ordersKnown = Object.keys(d.orders).length > 0 || (hasScope(SCOPE.orders) && !!d.meta.lastSync);
  const result = useMemo(
    () => (places && pick ? hangarCheck({ d, s: d.settings, places, pick, ordersKnown }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places, pick?.place, pick?.spot, d.positions, d.plans, d.orders, d.txs, d.journal, d.settings, ordersKnown],
  );

  // Names: the containers' and ships' types (for any you didn't name) and every item listed.
  const holderTypes = (places ?? []).flatMap((p) => p.spots.flatMap((s) => s.path.map((h) => h.typeId)));
  const rowTypes = [...(result?.tracked ?? []), ...(result?.ordersOnly ?? [])].map((r) => r.typeId);
  useEnsureNames([...holderTypes, ...rowTypes]);
  const typeName = (id: number) => d.names[id] ?? 'A container or ship';
  const itemName = (id: number) => d.names[id] ?? `Item #${id}`;
  // Each names its place, so the closed list says where: "Jita 4-4 hangar", "Lewds" (in Jita), "Lewds · Amarr VIII …".
  const spotLabel = (s: Spot, p: Place) => {
    const at = placeOf(p.id).l;
    if (s.kind === 'hangar') return `${at} hangar`;
    if (s.kind === 'flag') return `${at} ${flagLabel(s.flag!).toLowerCase()}`;
    if (s.kind === 'holder') return pathLabel(s.path, typeName) + (p.id === JITA_44 ? '' : ` · ${at}`);
    return `Everything in ${at}`;
  };
  /** The spot in a sentence: "your hangar at Jita 4-4", "Lewds", "Jita 4-4". */
  const spotSaid = (s: Spot, p: Place) => {
    const at = placeOf(p.id).said;
    return s.kind === 'hangar' ? `your hangar at ${at}` : s.kind === 'flag' ? `your ${flagLabel(s.flag!).toLowerCase()} at ${at}` : s.kind === 'holder' ? pathLabel(s.path, typeName) : at;
  };
  const whereSaid = (ws: Where[]) => ws.map((w) => `${whereLabel(w, typeName)} ${units(w.q)}`).join(' · ');

  const taken = read ? assetsTakenAt(read.expires) : null;
  const close = () => ref.current?.close();
  const open = (id: string) => { close(); navigate(`positions/${id}`); };
  const notOurs = result?.tracked.filter((r) => (r.notPositions ?? 0) > 0) ?? [];
  const jitaOnlyHere = !!result?.outside && result.tracked.some((r) => !r.countsHere);

  return (
    <dialog className="confirm" ref={ref} aria-labelledby="hc-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) close(); }}>
      <div className="dlg hc" role="document">
        <div className="dlg-head"><PackageSearch aria-hidden="true" /><span>Check my hangar</span></div>
        <div className="dlg-body">
          <h2 id="hc-title">What you hold that a position could count</h2>
          <p>A position counts every Jita 4-4 sale of its item after it opened, and EVE’s trades don’t say which stack a unit came from: sell loot of an item you trade and the position takes it from its own stock.</p>
          <Points compact items={[
            { kind: 'info', lead: 'Read fresh from EVE', text: 'each time it opens; nothing here is saved or changes your ledger.' },
            { kind: 'warn', lead: 'Personal on the Wallet', text: 'doesn’t keep a sale out of a position: only Exclude on the position’s page does.' },
          ]} />

          {!can ? (
            <div style={{ marginTop: 14 }}><Notice kind="warn">Reading your hangar needs EVE’s permission to read your assets, which this login wasn’t given. Log in again and EVE asks for it.</Notice></div>
          ) : (
            <div className="hc-read">
              {busy && !read ? <span className="note small">Reading your assets from EVE…</span>
                : err ? <Notice kind="err">Couldn’t read your assets: {err}</Notice>
                  : read && (
                    <span className="note small" style={{ margin: 0 }}>
                      {taken != null ? `ESI’s copy of your assets was taken ${fmtDateTime(taken)} (${ago(new Date(taken).toISOString(), now)}); it holds them an hour, so what you moved since shows ${new Date(read.expires!).getTime() > now ? `once it lets go, ${fmtDateTime(read.expires!)}` : 'when you read again'}.`
                        : `Read ${readAt ? ago(new Date(readAt).toISOString(), now) : 'just now'}; ESI holds your assets up to an hour, so something moved lately may not show yet.`}
                      {read.namesFailed && ' The names you gave your containers and ships couldn’t be read just now, so they go by their type.'}
                    </span>
                  )}
              <button type="button" className="btn sm" disabled={busy} onClick={() => void load()}><RefreshCw aria-hidden="true" className={busy ? 'spinning' : undefined} />{busy ? 'Reading…' : 'Read again'}</button>
            </div>
          )}

          {places && pick && place && spot && result && (
            <>
              <div className="hc-pick">
                <label htmlFor="hc-where" className="chip h34" data-tip-title="Where to look"
                  data-tip={'Every place you hold things, Jita 4-4 first: its hangar, each container or ship by the name you gave it, and the whole place.\n\nAsset safety is left out: it has its own panel on the Wallet. Kept in this browser for next time.'}>
                  <span className="cl">Where to look</span>
                  <select id="hc-where" value={`${pick.place}/${pick.spot}`} onChange={(e) => { const [pl, ...sp] = e.target.value.split('/'); choose({ place: Number(pl), spot: sp.join('/') }); }}>
                    {places.map((p) => (
                      <optgroup key={p.id} label={placeOf(p.id).l}>
                        {p.spots.map((s) => <option key={s.key} value={`${p.id}/${s.key}`}>{spotLabel(s, p)} · {units(s.units)} {s.units === 1 ? 'unit' : 'units'}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>

              {jitaOnlyHere && (
                <div style={{ marginTop: 12 }}><Notice>Sold here they don’t count against a position, which tracks Jita 4-4 only; brought to Jita and sold, they do.</Notice></div>
              )}
              {!ordersKnown && <p className="note small">Your orders haven’t been read, so what’s listed, and what isn’t a position’s, can’t be said yet.</p>}

              {result.tracked.length > 0 && (
                <section className="hc-section" data-hc="tracked">
                  <h3>{result.tracked.length === 1 ? 'An item a position counts' : `${units(result.tracked.length)} items a position counts`}</h3>
                  {notOurs.length > 0 && (
                    <Notice kind="warn">
                      <b>{notOurs.length === 1 ? `${units(notOurs[0].notPositions)} of ${itemName(notOurs[0].typeId)} ${notOurs[0].notPositions === 1 ? 'isn’t' : 'aren’t'} the position’s.` : `${units(notOurs.length)} items have units that aren’t their position’s.`}</b>
                      {' '}Selling those units counts against the position{notOurs.some((r) => r.plan) ? ' (and the plan)' : ''}: sell them and Exclude each sale on the position’s page, or keep them apart until the position closes.
                    </Notice>
                  )}
                  <div className="hc-scroll">
                    <table className="tbl short hc-table">
                      <thead><tr>
                        <Th left>Item</Th>
                        <Th className="hc-wide" tip="Units held where you’re looking, and where they lie: loose in the hangar, or in a container or ship by the name you gave it. Packaged units only: not what’s fitted to a ship, not blueprint copies, not anything assembled.">Here</Th>
                        <Th className="hc-wide" tip={'What the position counts as its own stock: what it bought and hasn’t sold.\n\nWith a plan holding the item, the plan’s share is under it: a plan that took over an open position counts from its own start, and what the position held then is the earlier trading’s.'}>The position’s</Th>
                        <Th className="hc-wide" tip="Units on your open Jita 4-4 sell orders of it: a sell order holds its own goods.">Listed</Th>
                        <Th className="hc-wide" tip="What your open Jita 4-4 buy orders on it are still buying.">Buying</Th>
                        <Th className="hc-wide" tip={'Units you hold in Jita 4-4, the whole station (hangar, containers, ships), and on your sell orders, beyond what the position counts as its own.\n\n• Sold, they count against the position: it takes the sale from its own stock, at its cost.\n• Units are alike, so it’s how many, not which ones.\n\nFor example: 22 held and none listed against a position holding 12 leaves 10 that aren’t the position’s.'}>Not the position’s</Th>
                      </tr></thead>
                      <tbody>
                        {result.tracked.map((r) => (
                          <TrackedLine key={r.typeId} r={r} name={itemName(r.typeId)} where={whereSaid(r.where)} onOpen={() => open(r.pos.id)} planAt={d.plans.find((p) => p.id === r.plan?.id)?.at ?? null} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {result.ordersOnly.length > 0 && (
                <section className="hc-section" data-hc="orders">
                  <h3>No position tracks these: selling them doesn’t touch a position</h3>
                  <ul className="hc-other">
                    {result.ordersOnly.map((r) => (
                      <li key={r.typeId} data-type={r.typeId} data-here={r.here}>
                        <ItemIcon id={r.typeId} size="sm" />
                        <span style={{ minWidth: 0 }}>
                          <NameInGame typeId={r.typeId} name={itemName(r.typeId)} className="name" />
                          <span className="hc-o">{units(r.here)} here ({whereSaid(r.where)}){r.listed ? ` · ${units(r.listed)} on your sell orders` : ''}{r.buying ? ` · your buy orders still buy ${units(r.buying)}` : ''}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {!result.tracked.length && !result.ordersOnly.length && (
                <p className="hc-none" data-hc="none">
                  {spot.units === 0 ? `You hold nothing to sell in ${spotSaid(spot, place)}, as of this read.`
                    : `Nothing in ${spotSaid(spot, place)} is an item a position or one of your orders covers.`}
                </p>
              )}
            </>
          )}

          <div className="dlg-actions">
            <button type="button" className="no" onClick={close}>Close</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** One item a position counts: where it lies here, the position's stock (and the plan's), its orders, and what isn't the position's. */
function TrackedLine({ r, name, where, onOpen, planAt }: { r: TrackedRow; name: string; where: string; onOpen: () => void; planAt: string | null }) {
  const held = r.jita + (r.listed ?? 0);
  const inJita = `of the ${units(held)} you hold in Jita 4-4${r.listed ? ', listed included' : ''}`;
  const not = r.notPositions == null
    ? <span className="faint" data-tip={r.stock == null ? 'The position couldn’t be worked out just now.' : 'Your orders aren’t read, so what’s listed isn’t known.'}>–</span>
    : r.notPositions > 0 ? <span style={{ color: 'var(--acc2)' }}>{units(r.notPositions)}</span> : <span className="faint">None</span>;
  const stock = r.stock == null ? <span className="faint" data-tip="The position couldn’t be worked out just now.">–</span> : units(r.stock);
  // A plan that opened the position counts it whole; one that took it over counts from its own start.
  const planSaid = !r.plan ? null : r.plan.stock === r.stock && !r.plan.earlier ? 'all the plan’s'
    : `the plan’s ${units(r.plan.stock)}${r.plan.earlier > 0 ? `, ${units(r.plan.earlier)} from before it` : ''}`;
  const planTip = r.plan
    ? `${r.plan.name}${planAt ? `, started ${fmtDateTime(planAt)}` : ''}, holds this item.\n\n`
      + `• It counts ${units(r.plan.stock)} of the position’s stock as its own${r.plan.earlier > 0 ? `; the ${units(r.plan.earlier)} the position held when it started are your earlier trading’s, sold first` : ''}.\n`
      + '• A sale of units that aren’t the position’s is taken from the plan’s bought units once the earlier stock is gone.'
    : '';
  return (
    <tr className={(r.notPositions ?? 0) > 0 ? 'hot' : undefined} data-type={r.typeId} data-here={r.here} data-not={r.notPositions ?? ''}>
      <td className="l hc-item">
        <span className="cellrow">
          <ItemIcon id={r.typeId} />
          <span style={{ minWidth: 0 }}>
            <NameInGame typeId={r.typeId} name={name} className="name" />
            <span className="hc-tags">
              {r.plan && (
                <span className="flag plain" tabIndex={0} data-tip-title={r.plan.name} data-tip={planTip} style={cssVars({ '--c': 'var(--acc)', fontSize: 10, padding: '1px 6px' })}>
                  <ClipboardList aria-hidden="true" />Plan: {r.plan.name}
                </span>
              )}
              {!r.countsHere && <span className="faint">Sales here don’t count</span>}
              <button type="button" className="link-btn" onClick={onOpen}>Open the position<ArrowRight aria-hidden="true" /></button>
            </span>
            <span className="hc-phone">
              <span>Here: <b>{units(r.here)}</b> ({where})</span>
              <span>The position’s: <b>{r.stock == null ? '–' : units(r.stock)}</b>{planSaid ? ` (${planSaid})` : ''}{r.listed != null ? ` · listed ${units(r.listed)}` : ''}{r.buying ? ` · buying ${units(r.buying)}` : ''}</span>
              <span>Not the position’s: <b>{r.notPositions == null ? '–' : r.notPositions > 0 ? units(r.notPositions) : 'none'}</b>{r.notPositions != null ? `, ${inJita}` : ''}</span>
            </span>
          </span>
        </span>
      </td>
      <td className="hc-wide hc-where">{units(r.here)}<span className="sub wrap">{where}</span></td>
      <td className="hc-wide">{stock}{planSaid && <span className="sub">{planSaid}</span>}</td>
      <td className="hc-wide">{r.listed == null ? <span className="faint">–</span> : units(r.listed)}</td>
      <td className="hc-wide">{r.buying == null ? <span className="faint">–</span> : units(r.buying)}</td>
      <td className="hc-wide">{not}{r.notPositions != null && <span className="sub hc-of">{inJita}</span>}</td>
    </tr>
  );
}
