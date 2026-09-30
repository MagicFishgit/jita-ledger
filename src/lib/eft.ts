/**
 * EFT, the text fitting tools and the game's fitting window swap: `[Hull, Name]`, then low, mid, high and rig slots in that
 * order with a blank line between, a module's loaded charge after a comma (`Heavy Assault Missile Launcher II, Scourge
 * Heavy Assault Missile`), and after the rigs drones, implants and boosters, and cargo, where the counted ones carry
 * ` xN`. Empty slots read `[Empty Low slot]`. What follows the rigs is told apart by each item's category (ESI): drones
 * (18) and fighters (87) to the drone bay, implants and boosters (20) to the implants, subsystems (32) to the highs,
 * anything else to the cargo. Pure.
 */

import type { FitItem, Tier } from './fits';

export type ParsedEft = {
  hull: string; name: string;
  low: FitItem[]; mid: FitItem[]; high: FitItem[]; rigs: FitItem[];
  /** Everything after the rigs, in order, with its count (1 when it has none). */
  rest: { name: string; qty: number }[];
};

const add = (list: FitItem[], name: string, charge?: string) => {
  const last = list[list.length - 1];
  if (last && last.name === name && last.charge === charge) last.qty = (last.qty ?? 1) + 1;
  else list.push(charge ? { name, qty: 1, charge } : { name, qty: 1 });
};

export function parseEft(text: string): ParsedEft | null {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const first = lines.findIndex((l) => l);
  const head = first >= 0 ? /^\[([^,\]]+),\s*(.*)\]$/.exec(lines[first]) : null;
  if (!head) return null;
  const out: ParsedEft = { hull: head[1].trim(), name: head[2].trim(), low: [], mid: [], high: [], rigs: [], rest: [] };
  const slots = [out.low, out.mid, out.high, out.rigs];
  let section = 0;
  for (const line of lines.slice(first + 1)) {
    if (!line) { section++; continue; }
    if (/^\[Empty .* slot\]$/i.test(line)) continue;
    const clean = line.replace(/\s*\/OFFLINE$/i, '');
    if (section < 4) {
      const [name, charge] = clean.split(/,\s*/);
      add(slots[section], name.trim(), charge?.trim() || undefined);
    } else {
      const m = /^(.*?)\s+x(\d+)$/.exec(clean);
      out.rest.push(m ? { name: m[1].trim(), qty: Number(m[2]) } : { name: clean, qty: 1 });
    }
  }
  return out;
}

/** The parsed fit as a tier the fit panel shows, what follows the rigs sorted by category. */
export function eftToTier(p: ParsedEft, categoryOf: (name: string) => number | null, meta: Pick<Tier, 'key' | 'what' | 'source'>): Tier {
  const drones: FitItem[] = [], cargo: FitItem[] = [], implants: string[] = [], high = [...p.high];
  // A drone or cargo line can come twice (a drone bay listed as 2 then 5 of the same drone): one line each, summed.
  const add = (xs: FitItem[], x: { name: string; qty?: number }) => {
    const had = xs.find((y) => y.name === x.name);
    if (had) had.qty = (had.qty ?? 1) + (x.qty ?? 1);
    else xs.push({ name: x.name, qty: x.qty });
  };
  for (const x of p.rest) {
    const cat = categoryOf(x.name);
    if (cat === 18 || cat === 87) add(drones, x);
    else if (cat === 20) { if (!implants.includes(x.name)) implants.push(x.name); }
    else if (cat === 32) high.push({ name: x.name, qty: x.qty });
    else add(cargo, x);
  }
  return { ...meta, high, mid: p.mid, low: p.low, rigs: p.rigs, drones, cargo, implants, train: [] };
}
