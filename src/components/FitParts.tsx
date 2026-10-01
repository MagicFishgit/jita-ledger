import { useEffect, useState } from 'react';
import { ClipboardCopy, Save, ShoppingCart } from 'lucide-react';
import { getAuth, hasScope } from '../lib/auth';
import { SCOPE } from '../lib/config';
import { esi } from '../lib/esi';
import { eftText, fitItems, fitMultibuy, fittingBody, type FitItem, type Tier } from '../lib/fits';
import { iskBig } from '../lib/format';
import { jitaBook, resolveIds } from '../lib/market';
import type { TypeDogma } from '../lib/miningYield';
import { toast } from '../lib/toast';
import { typeDogma, typeRequirements } from '../lib/universe';
import { copyMultibuy } from './common';
import { usePilot } from './pilot';
import { SkillNeeds } from './SkillStrip';
import { ItemIcon } from './ui';

/**
 * The parts of a fit's panel every progression tree shares (Mining, Abyssal, Hauling): the fit's items resolved, priced
 * at Jita and read for dogma and skills (`useFitData`); the fit laid out by slot with prices (`FitGrid`); Copy fit, Copy
 * for Multibuy and Save fit in game (`FitActions`); and what it asks you to train (`FitSkills`).
 */

export type FitData = {
  ids: Record<string, number>;
  price: Record<string, number | null>;
  dogma: Record<number, TypeDogma>;
  needs: { skill: number; level: number }[];
};

/**
 * A fit's items: IDs by name, the cheapest Jita listing of each, their dogma and the skills they need (with the tier's own
 * `train` list); the hull's dogma; and dogma for any other names or types the page reads (`dogmaNames`, `dogmaIds`).
 * IDs the page already has (`ids`) aren't looked up again.
 */
export function useFitData(hullId: number, fit: Tier, crystal: string | null, more?: { dogmaNames?: string[]; dogmaIds?: number[]; ids?: Record<string, number> }): FitData | null {
  const [got, setGot] = useState<FitData | null>(null);
  useEffect(() => {
    let alive = true;
    setGot(null);
    (async () => {
      const items = fitItems(fit, crystal);
      const dogmaOnly = (more?.dogmaNames ?? []).filter((nm) => !items.some((x) => x.name === nm));
      const names = [...new Set([...items.map((x) => x.name), ...(fit.implants ?? []), ...fit.train.map(([s]) => s), ...dogmaOnly])];
      // Names the page already resolved (an Abyss fit sorts its cargo by them) aren't asked for again.
      const ids: Record<string, number> = {};
      for (const nm of names) if (more?.ids?.[nm] != null) ids[nm] = more.ids[nm];
      const unknown = names.filter((nm) => ids[nm] == null);
      const res = unknown.length ? await resolveIds(unknown).catch(() => null) : null;
      for (const x of res?.inventory_types ?? []) ids[x.name] = x.id;
      const price: Record<string, number | null> = {};
      const dogma: Record<number, TypeDogma> = {};
      const reqs: { skill: number; level: number }[] = [];
      await Promise.all(names.map(async (nm) => {
        const id = ids[nm];
        if (!id) return;
        if (fit.train.some(([s]) => s === nm)) return;
        if (dogmaOnly.includes(nm)) { const dg = await typeDogma(id).catch(() => null); if (dg) dogma[id] = dg; return; }
        const [book, dg, req] = await Promise.all([jitaBook(id).catch(() => null), typeDogma(id).catch(() => null), typeRequirements(id).catch(() => [])]);
        price[nm] = book?.bestSell ?? null;
        if (dg) dogma[id] = dg;
        reqs.push(...req);
      }));
      const extra = await Promise.all([hullId, ...(more?.dogmaIds ?? [])].map((id) => typeDogma(id).catch(() => null)));
      for (const dg of extra) if (dg) dogma[dg.id] = dg;
      for (const [s, level] of fit.train) if (ids[s]) reqs.push({ skill: ids[s], level });
      const needs = reqs.reduce<{ skill: number; level: number }[]>((acc, x) => {
        const cur = acc.find((y) => y.skill === x.skill);
        if (cur) cur.level = Math.max(cur.level, x.level); else acc.push({ ...x });
        return acc;
      }, []).sort((a, b) => b.level - a.level);
      if (alive) setGot({ ids, price, dogma, needs });
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [hullId, fit, crystal]); // eslint-disable-line react-hooks/exhaustive-deps
  return got;
}

/** What the fit costs at Jita, with the hull; and what couldn't be priced. */
export function fitCosts(fit: Tier, crystal: string | null, data: FitData | null, hullPrice: number | null) {
  if (!data) return { fitCost: null, total: null, unpriced: [] as string[] };
  const items = fitItems(fit, crystal);
  const fitCost = items.reduce((t, x) => t + (data.price[x.name] ?? NaN) * (x.qty ?? 1), 0) + (fit.implants ?? []).reduce((t, i) => t + (data.price[i] ?? NaN), 0);
  const unpriced = [...items.map((x) => x.name), ...(fit.implants ?? [])].filter((nm) => data.price[nm] == null);
  const total = Number.isFinite(fitCost) && hullPrice != null ? fitCost + hullPrice : null;
  return { fitCost: Number.isFinite(fitCost) ? fitCost : null, total, unpriced };
}

/** The fit by slot: each item with its icon, count, what's loaded in it, and its price at Jita. */
export function FitGrid({ fit, crystal, data }: { fit: Tier; crystal: string | null; data: FitData | null }) {
  const slot = (title: string, xs: FitItem[]) => xs.length > 0 && (
    <div className="fit-slot">
      <span className="lbl">{title}</span>
      {xs.map((x, i) => {
        const loaded = crystal && /^Modulated /.test(x.name) ? crystal : x.charge;
        return (
          <span key={`${x.name}-${i}`} className="fit-line">
            {data?.ids[x.name] ? <ItemIcon id={data.ids[x.name]} /> : <span style={{ width: 22 }} />}
            <span className="nm">{(x.qty ?? 1) > 1 ? `${x.qty} × ` : ''}{x.name}{loaded ? <span className="sub">loaded with {loaded}</span> : null}</span>
            <span className="pr">{data ? (data.price[x.name] != null ? iskBig(data.price[x.name]! * (x.qty ?? 1)) : '–') : ''}</span>
          </span>
        );
      })}
    </div>
  );
  const cargo = [...(crystal && fit.crystal ? [{ name: crystal, qty: fit.crystal.spares }] : []), ...(fit.cargo ?? [])];
  return (
    <div className="fit-grid">
      {slot('High', fit.high)}
      {slot('Mid', fit.mid)}
      {slot('Low', fit.low)}
      {slot('Rigs', fit.rigs)}
      {slot('Drones', fit.drones ?? [])}
      {slot('Cargo', cargo)}
      {fit.implants?.length ? slot('Implants and boosters', fit.implants.map((i) => ({ name: i }))) : null}
    </div>
  );
}

/**
 * Copy fit (EFT), Copy for Multibuy, Save fit in game. `label` names the fitting ("Jita Ledger Solid"). Saving goes to the
 * logged-in character's fittings, so it's offered only when the page is shown for that character, never for an alt.
 */
export function FitActions({ hullId, hullName, label, fit, crystal, data, total }: {
  hullId: number; hullName: string; label: string; fit: Tier; crystal: string | null; data: FitData | null; total: number | null;
}) {
  const pilot = usePilot();
  const [saving, setSaving] = useState(false);
  // A fitting has nowhere to hold implants or boosters (see eftText), so the copy and the saved fit say they're left out.
  const leftOut = fit.implants?.length ? ' Its implants and boosters aren’t in it: a fitting can’t hold them. Copy for Multibuy has them.' : '';
  const copyFit = async () => {
    try { await navigator.clipboard.writeText(eftText(hullName, label, fit, crystal)); toast(`Fit copied. In game: the fitting window, Import & Export, Import from clipboard.${leftOut}`); }
    catch { toast('Your browser wouldn’t let the page copy.', 'err'); }
  };
  const saveFit = async () => {
    const a = getAuth();
    if (!a || !data) return;
    const body = fittingBody(hullId, hullName, label.replace(/^Jita Ledger /, ''), fit, crystal, (nm) => data.ids[nm] ?? null);
    if (!body) { toast('Some items in this fit couldn’t be found in ESI, so it wasn’t saved.', 'err'); return; }
    setSaving(true);
    try {
      await esi<{ fitting_id: number }>(`/characters/${a.characterId}/fittings/`, { auth: true, method: 'POST', body });
      toast(`Saved as “${body.name}” in your fittings. In game: the fitting window, Personal.${leftOut}`);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
    finally { setSaving(false); }
  };
  const mb = fitMultibuy(hullName, fit, crystal);
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn sm" onClick={() => void copyFit()}
        data-tip={fit.implants?.length ? 'The fit as EFT text, which the game’s fitting window imports.\n\nIts implants and boosters are left out: a fitting has no place for them (ESI’s saved fittings take slots, the drone and fighter bays and cargo, and the import puts only charges and ice in the cargo), and what the game does with such a line isn’t documented. Copy for Multibuy has them.' : undefined}>
        <ClipboardCopy aria-hidden="true" /> Copy fit</button>
      <button type="button" className="btn sm" disabled={!data} onClick={() => void copyMultibuy(mb.text, mb.lines, total ?? undefined)}><ShoppingCart aria-hidden="true" /> Copy for Multibuy</button>
      {hasScope(SCOPE.fittingsWrite) && pilot.isMain && <button type="button" className="btn sm" disabled={!data || saving} onClick={() => void saveFit()}><Save aria-hidden="true" /> {saving ? 'Saving…' : 'Save fit in game'}</button>}
    </div>
  );
}

/** What the fit and its tier ask you to train, with your levels and queue. */
export function FitSkills({ data }: { data: FitData | null }) {
  return (
    <div>
      <div className="lbl" style={{ marginBottom: 6 }}>What it asks you to train</div>
      {data ? <SkillNeeds needs={data.needs} /> : <p className="note small">Reading the fit’s skills…</p>}
    </div>
  );
}
