import { NPC_FACILITY_TAX, type SiteKind } from './industry';
import type { Activity, AlertConfig, AlertEvent, Motion, Prefs, Theme } from './types';

/**
 * The accent pairs for each faction theme. Everything tinted in the app is mixed from these two, so a
 * theme is two colours and nothing else.
 */
export const THEMES: Record<Theme, [string, string]> = {
  Caldari: ['#5cd3f2', '#f2b15c'],
  Amarr: ['#f3c460', '#ee7d55'],
  Gallente: ['#62e3b8', '#8fadff'],
  Minmatar: ['#ff8a4c', '#eed79a'],
};

export const ALERT_SIZES: { value: number; label: string }[] = [
  { value: 1, label: 'Default' }, { value: 1.25, label: 'Large' }, { value: 1.5, label: 'Larger' }, { value: 1.85, label: 'Largest' },
];

/** How long alerts stay on screen. Null keeps each one until it is closed. */
export const TOAST_SECONDS: { value: number | null; label: string }[] = [
  { value: 5, label: '5 s' }, { value: 10, label: '10 s' }, { value: 20, label: '20 s' }, { value: 60, label: '1 min' }, { value: null, label: 'Until closed' },
];

export const ACTIVITIES: Activity[] = ['Trading', 'Loyalty', 'Planets', 'Hauling', 'Abyssal', 'Combat', 'Freelance', 'Rewards'];

export const DEFAULT_PREFS: Prefs = {
  theme: 'Caldari',
  alertSize: 1,
  toastSeconds: 10,
  hours: {},
  gankLines: {},
  learnFromLosses: true,
  perJump: 500_000,
  piTax: null,
  // 500 PLEX a month is the store's standing price and what the app has always assumed. The longer
  // packs change with sales and are not in any API, so they are blank until you read them off the store.
  omegaPacks: { 1: 500, 3: null, 6: null, 12: null },
  omegaPack: '1',
};

export const ALERT_EVENTS: AlertEvent[] = ['move', 'clearing', 'squeeze', 'pi', 'scam', 'backup', 'opportunity', 'snipe', 'watchdog', 'safety'];

export const DEFAULT_ALERTS: AlertConfig = {
  on: false,
  browser: false,
  interval: 5,
  minIsk: 5_000_000,
  quiet: false,
  ev: { move: true, clearing: false, squeeze: true, pi: true, scam: true, backup: true, opportunity: true, snipe: true, watchdog: true, safety: true },
  mail: false,
  // By mail, only what you can act on from inside the game: an order to move, a colony to reset.
  mailEv: { move: true, clearing: false, squeeze: false, pi: true, scam: false, backup: false, opportunity: true, snipe: true, watchdog: true, safety: true },
  mailKeepMin: 3 * 1440,
  repeatH: 4,
  snipeMinIsk: 5_000_000,
  snipeMinPct: 10,
  snipeBlueprints: false,
};

/**
 * "Remind me again after": how long the same alert waits before it comes again. It was a fixed six hours, which
 * the user found too long once they understood it: left alone in space, a big order was mailed once and then
 * not again for six hours however often it was undercut.
 */
export const REPEAT_HOURS = [1, 2, 4, 6, 12, 24];

/** How long alert mails are kept before the app deletes them. Null keeps them. */
export const MAIL_KEEP: { value: number | null; label: string }[] = [
  { value: 30, label: '30 min' }, { value: 60, label: '1 hour' }, { value: 1440, label: '1 day' },
  { value: 3 * 1440, label: '3 days' }, { value: 7 * 1440, label: '1 week' }, { value: null, label: 'Keep them' },
];

const num = (v: unknown, d: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function sanitizePrefs(p: Partial<Prefs> | null | undefined): Prefs {
  const x = p ?? {};
  const theme = (Object.keys(THEMES) as Theme[]).includes(x.theme as Theme) ? (x.theme as Theme) : DEFAULT_PREFS.theme;
  const motion = (['Full', 'Calm', 'Off'] as Motion[]).includes(x.motion as Motion) ? (x.motion as Motion) : undefined;
  const size = ALERT_SIZES.some((s) => s.value === x.alertSize) ? (x.alertSize as number) : 1;
  const hours: Prefs['hours'] = {};
  for (const a of ACTIVITIES) {
    const h = x.hours?.[a];
    if (h != null && Number.isFinite(h) && h >= 0) hours[a] = Math.min(168, h);
  }
  const gankLines: Record<string, number> = {};
  for (const [k, v] of Object.entries(x.gankLines ?? {})) if (Number.isFinite(v) && v > 0) gankLines[k] = v;
  const packs = { ...DEFAULT_PREFS.omegaPacks };
  for (const k of ['1', '3', '6', '12'] as const) {
    const v = x.omegaPacks?.[k];
    packs[k] = v == null ? (k === '1' ? 500 : null) : Number.isFinite(v) && v > 0 ? v : packs[k];
  }
  return {
    theme,
    motion,
    alertSize: size,
    // Absent on prefs saved before this existed: take the default. An explicit null means "until closed".
    toastSeconds: x.toastSeconds === undefined ? DEFAULT_PREFS.toastSeconds
      : TOAST_SECONDS.some((o) => o.value === x.toastSeconds) ? (x.toastSeconds as number | null) : DEFAULT_PREFS.toastSeconds,
    hours,
    gankLines,
    learnFromLosses: x.learnFromLosses === undefined ? true : !!x.learnFromLosses,
    perJump: clamp(num(x.perJump, DEFAULT_PREFS.perJump), 0, 1e12),
    piTax: x.piTax == null || !Number.isFinite(x.piTax) ? null : clamp(x.piTax, 0, 1),
    omegaPacks: packs,
    omegaPack: (['1', '3', '6', '12'] as const).includes(x.omegaPack as '1') ? (x.omegaPack as Prefs['omegaPack']) : '1',
    ...cashIn(x.researchCashIn),
  };
}

/**
 * The cash-in reminder as kept: absent (off, no amount) unless it's an object; its amount whole ISK over 0, else none; on
 * only with a plain true and an amount. Switching it off keeps the amount.
 */
function cashIn(v: unknown): { researchCashIn?: Prefs['researchCashIn'] } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const x = v as { on?: unknown; isk?: unknown };
  const isk = typeof x.isk === 'number' && Number.isFinite(x.isk) && x.isk > 0 ? Math.min(1e13, Math.max(1, Math.round(x.isk))) : null;
  return { researchCashIn: { on: x.on === true && isk != null, isk } };
}

export function sanitizeAlerts(a: Partial<AlertConfig> | null | undefined): AlertConfig {
  const x = a ?? {};
  const ev = { ...DEFAULT_ALERTS.ev };
  for (const k of ALERT_EVENTS) if (x.ev && typeof x.ev[k] === 'boolean') ev[k] = x.ev[k];
  const mailEv = { ...DEFAULT_ALERTS.mailEv };
  for (const k of ALERT_EVENTS) if (x.mailEv && typeof x.mailEv[k] === 'boolean') mailEv[k] = x.mailEv[k];
  return {
    on: !!x.on,
    browser: !!x.browser,
    interval: [5, 15, 30, 60].includes(x.interval as number) ? (x.interval as number) : 5,
    minIsk: clamp(num(x.minIsk, DEFAULT_ALERTS.minIsk), 0, 1e13),
    quiet: !!x.quiet,
    ev,
    mail: !!x.mail,
    mailEv,
    // Absent on settings saved before mail existed: take the default. An explicit null keeps mails.
    mailKeepMin: x.mailKeepMin === undefined ? DEFAULT_ALERTS.mailKeepMin
      : MAIL_KEEP.some((o) => o.value === x.mailKeepMin) ? (x.mailKeepMin as number | null) : DEFAULT_ALERTS.mailKeepMin,
    repeatH: REPEAT_HOURS.includes(x.repeatH as number) ? (x.repeatH as number) : DEFAULT_ALERTS.repeatH,
    snipeMinIsk: clamp(num(x.snipeMinIsk, DEFAULT_ALERTS.snipeMinIsk), 0, 1e13),
    snipeMinPct: clamp(num(x.snipeMinPct, DEFAULT_ALERTS.snipeMinPct), 0, 1000),
    // Only a plain true lets blueprints in: an older device's whole document, or anything else, keeps them out.
    snipeBlueprints: x.snipeBlueprints === true,
  };
}

/** The asset safety countdowns you typed in, by wrap item ID: when it's delivered automatically, and when you typed it. */
export type SafetyTimesDoc = Record<string, { autoAt: string; at: string }>;
export function sanitizeSafetyTimes(v: unknown): SafetyTimesDoc {
  const out: SafetyTimesDoc = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, x] of Object.entries(v as Record<string, unknown>)) {
    const t = x as { autoAt?: unknown; at?: unknown } | null;
    if (!/^\d+$/.test(id) || !t || typeof t.autoAt !== 'string' || !Number.isFinite(Date.parse(t.autoAt))) continue;
    out[id] = { autoAt: t.autoAt, at: typeof t.at === 'string' && Number.isFinite(Date.parse(t.at)) ? t.at : t.autoAt };
  }
  return out;
}

/** Purchases you said weren't snipes (the Sniper's "Not a snipe"): trade IDs. */
export function sanitizeNotSnipes(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 64))].slice(-5000);
}

/** Items you're leaving orders on ("Place and leave"): type IDs, each once. */
export function sanitizeLeave(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is number => Number.isInteger(x) && x > 0))];
}

/**
 * When a Place-and-leave plan left each of its items (`isLeft` in plans.ts): type ID to the plan's start. An item in
 * `leave` with a time here is left only for orders placed since then; one without, left by hand, for every order of it.
 * A document of its own beside `leave`, which stays a plain list, since browsers and a Worker a version behind read it.
 */
export type LeaveFromDoc = Record<string, string>;
export function sanitizeLeaveFrom(v: unknown): LeaveFromDoc {
  const out: LeaveFromDoc = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, at] of Object.entries(v as Record<string, unknown>)) {
    if (!/^\d{1,12}$/.test(id) || !(Number(id) > 0) || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) continue;
    out[id] = at;
  }
  return out;
}

/**
 * A place to build (docs/notes/industry.md): an NPC station near Jita, a structure found by name, or a home typed by you.
 * What's kept is what you'd do in game; what the market or ESI says is read fresh.
 */
export type IndustrySite = {
  /** `npc:<station>`, `st:<structure>`, or `home:<system>`. */
  id: string;
  name: string;
  systemId: number;
  kind: SiteKind;
  /** An NPC station's ID. */
  stationId?: number;
  /** A structure's ID once found by name: what its hangar stock is filed under. A home typed by you has none. */
  structureId?: number;
  /** Its engineering rigs, the bundle's type IDs, at most 3, of the structure's size. An NPC station has none. */
  rigs: number[];
  /** Its facility tax as a fraction: an NPC station's 0.25%; a structure's as typed, null until it is (never taken as 0). */
  tax: number | null;
  /** An NPC station with a Laboratory, where research, copying and invention run. */
  lab?: boolean;
};
/** A freight route between two systems, either way: ISK a m³ of packaged volume, a share of the goods' value, a minimum (null: none stated). */
export type FreightRoute = { id: string; name: string; a: number; b: number; perM3: number; collateral: number; min: number | null; source: string | null };
/** What you've decided about building, synced so every device works it out the same (the spec's "What's kept where"). */
export type IndustryDoc = {
  sites: IndustrySite[];
  /** The site the finder works for (an id in `sites`), or none. */
  site: string | null;
  sell: 'jita' | 'home' | 'best';
  /** The home hub sold at and bought from: a Goonmetrics hub's structure ID. */
  hub: number | null;
  /** A hub's broker fee as you typed it, a fraction, by hub ID. Untyped is absent: ranked before it. */
  hubFees: Record<string, number>;
  freight: FreightRoute[];
  /** The part of each market's daily trade you'd sell, in percent: 10 by default, the research's figure for modules. */
  share: number;
  /** Never haul ships to Jita: the user's own words, 9 October 2026 ("too bulky expensive and risky"). */
  noShipsToJita: boolean;
  /** The ME and TE assumed for an original you'd buy: 0/0, 8/0 or 10/20. */
  assume: { me: number; te: number };
};
export const DEFAULT_INDUSTRY: IndustryDoc = { sites: [], site: null, sell: 'jita', hub: null, hubFees: {}, freight: [], share: 10, noShipsToJita: true, assume: { me: 0, te: 0 } };
export const SITE_KINDS: readonly SiteKind[] = ['npc', 'raitaru', 'azbel', 'sotiyo', 'astrahus', 'fortizar', 'keepstar', 'other'];
export const ASSUME_CHOICES: readonly { me: number; te: number }[] = [{ me: 0, te: 0 }, { me: 8, te: 0 }, { me: 10, te: 20 }];
export const MAX_SITES = 12;
export const MAX_ROUTES = 12;
const isSystem = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 30_000_000 && (n as number) < 33_000_000;

/** The doc as stored or pulled, cleaned: anything it doesn't know, or out of range, goes; a site or route that can't be read is dropped whole. */
export function sanitizeIndustry(v: unknown): IndustryDoc {
  const x = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const text = (s: unknown, max: number) => (typeof s === 'string' && s.trim() && s.length <= max ? s : null);
  const share = (n: unknown, hi: number) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= hi ? n : null);
  const sites: IndustrySite[] = [];
  for (const raw of Array.isArray(x.sites) ? x.sites : []) {
    if (!raw || typeof raw !== 'object' || sites.length >= MAX_SITES) continue;
    const s = raw as Record<string, unknown>;
    const id = text(s.id, 64), name = text(s.name, 120), kind = SITE_KINDS.find((k) => k === s.kind), systemId = s.systemId;
    if (!id || !name || !isSystem(systemId) || !kind || sites.some((y) => y.id === id)) continue;
    if (kind === 'npc') {
      const stationId = s.stationId;
      if (!Number.isInteger(stationId) || (stationId as number) < 60_000_000 || (stationId as number) >= 64_000_000) continue;
      sites.push({ id, name, systemId, kind, stationId: stationId as number, rigs: [], tax: NPC_FACILITY_TAX, ...(s.lab === true ? { lab: true } : {}) });
      continue;
    }
    const rigs = [...new Set((Array.isArray(s.rigs) ? s.rigs : []).filter((r): r is number => Number.isInteger(r) && r > 0))].slice(0, 3);
    const structureId = Number.isInteger(s.structureId) && (s.structureId as number) >= 1e12 ? (s.structureId as number) : null;
    sites.push({ id, name, systemId, kind, ...(structureId != null ? { structureId } : {}), rigs, tax: share(s.tax, 0.5) });
  }
  const freight: FreightRoute[] = [];
  for (const raw of Array.isArray(x.freight) ? x.freight : []) {
    if (!raw || typeof raw !== 'object' || freight.length >= MAX_ROUTES) continue;
    const r = raw as Record<string, unknown>;
    const id = text(r.id, 64), name = text(r.name, 80), perM3 = share(r.perM3, 1e5), collateral = share(r.collateral, 0.2), a = r.a, b = r.b;
    if (!id || !name || !isSystem(a) || !isSystem(b) || perM3 == null || collateral == null || freight.some((y) => y.id === id)) continue;
    const min = r.min == null ? null : share(r.min, 1e10);
    if (r.min != null && min == null) continue;
    freight.push({ id, name, a, b, perM3, collateral, min, source: text(r.source, 120) });
  }
  const hubFees: Record<string, number> = {};
  if (x.hubFees && typeof x.hubFees === 'object' && !Array.isArray(x.hubFees)) {
    for (const [k, f] of Object.entries(x.hubFees as Record<string, unknown>)) { const n = share(f, 0.2); if (/^\d{13,}$/.test(k) && n != null) hubFees[k] = n; }
  }
  const a = x.assume as { me?: unknown; te?: unknown } | undefined;
  const assume = ASSUME_CHOICES.find((c) => c.me === a?.me && c.te === a?.te) ?? ASSUME_CHOICES[0];
  const sh = share(x.share, 100);
  return {
    sites,
    site: typeof x.site === 'string' && sites.some((s) => s.id === x.site) ? x.site : null,
    sell: x.sell === 'home' || x.sell === 'best' ? x.sell : 'jita',
    hub: Number.isInteger(x.hub) && (x.hub as number) >= 1e12 ? (x.hub as number) : null,
    hubFees, freight,
    share: sh != null && sh >= 0.1 ? sh : DEFAULT_INDUSTRY.share,
    noShipsToJita: x.noShipsToJita !== false,
    assume: { ...assume },
  };
}

/**
 * Which characters are yours besides the one logged in: alts the cloud reads (docs/notes/characters.md). A character's
 * ID to its name, and a clone state set by hand for one ESI can't tell apart. It is the only thing about an alt the
 * main's ledger holds: who is yours, never a record of theirs. It is a document of its own, not a field of `prefs`:
 * sanitizePrefs keeps only the fields it knows, so an app version behind would have dropped it on its next save.
 */
export type CharsDoc = Record<string, { name: string; clone?: 'alpha' | 'omega' }>;

export function sanitizeChars(v: unknown): CharsDoc {
  const out: CharsDoc = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, x] of Object.entries(v as Record<string, unknown>)) {
    const c = x as { name?: unknown; clone?: unknown } | null;
    if (!/^\d{1,15}$/.test(id) || !c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim()) continue;
    out[id] = { name: c.name.trim().slice(0, 64), ...(c.clone === 'alpha' || c.clone === 'omega' ? { clone: c.clone } : {}) };
  }
  return out;
}

/**
 * The characters the cloud's roster lists, added to `chars`, with their names corrected. Never removes one: a
 * character taken off the roster is still yours, and what you sent it stays a transfer. A clone state set by hand is
 * kept through a rename. A name the roster doesn't know keeps the one held, or is "Character {id}". Null when nothing
 * changed, so nothing is written.
 */
export function mergeCharsDoc(chars: CharsDoc, found: { charId: number; name: string | null }[]): CharsDoc | null {
  const next: CharsDoc = { ...chars };
  let changed = false;
  for (const f of found) {
    const id = String(f.charId);
    const name = f.name ?? next[id]?.name ?? `Character ${f.charId}`;
    if (next[id]?.name !== name) { next[id] = { ...next[id], name }; changed = true; }
  }
  return changed ? next : null;
}

/** The motion setting in force: yours if you chose one, otherwise what the system asks for. */
export function effectiveMotion(chosen: Motion | undefined, reducedMotion: boolean): Motion {
  return chosen ?? (reducedMotion ? 'Calm' : 'Full');
}
