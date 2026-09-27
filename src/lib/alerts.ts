/**
 * Which findings become alerts, and when to stay quiet.
 *
 * The checking itself happens elsewhere (orders against the live book, colonies, positions); this only
 * decides whether a finding is worth interrupting you for. Pure, so the rules can be tested.
 */

import { FILL_WINDOW } from './fills';
import { fmtDateTime, isk, iskBig, pct, units } from './format';
import type { Colony } from './colony';
import type { Relist } from './relist';
import type { AlertConfig, AlertEvent, AlertLogEntry } from './types';

/**
 * Each alert's name, a one-line description, and `tip`: the plain-language explanation with an example
 * that Settings shows behind an "i". The figures in the examples are illustrations; the thresholds
 * named are the real rules (see relist.ts, signals.ts and prospects.ts).
 */
export const ALERT_LABELS: Record<AlertEvent, { label: string; what: string; tip: string }> = {
  move: {
    label: 'Order worth moving', what: 'An order of yours is beaten and the queue ahead won’t clear inside your wait time',
    tip: 'One of your orders has been undercut (or outbid, for a buy), and waiting it out would take longer than you said you’d wait.\n\n• Moving costs a fee, but here the wait costs more.\n• Your wait time is set in Settings → Rates & fees.\n\nFor example: you sell at 1,234,000. 40 units now sit at 1,229,000 on an item that sells 10 a day, so you’d queue for four days. The app says move to 1,228,900.',
  },
  clearing: {
    label: 'Beaten but clearing', what: 'You’re undercut, but the stock ahead will clear on its own — usually just noise',
    tip: 'You’ve been undercut, but only by a little stock that will sell on its own soon.\n\n• Moving would waste the fee: you’ll be back in front without doing anything.\n• Usually just noise, so most people leave this one off.\n\nFor example: 4 units sit below you on an item that sells 200 a day. They’re gone in minutes.',
  },
  squeeze: {
    label: 'Margin squeeze', what: 'A position’s daily range has narrowed close to its break-even spread',
    tip: 'The profit left in trading one of your items is nearly gone. It warns when both are true:\n\n• the item’s daily high-to-low range is within 35% of what you need to break even after fees, tax and two price changes;\n• that range has shrunk by at least a quarter this week.\n\nFor example: you need 3% to break even, and the daily range has fallen from 6% to 3.8%.',
  },
  pi: {
    label: 'PI programme ending', what: 'An extraction programme ends within a day, or has ended',
    tip: 'An extractor on one of your planets stops within a day, or already has.\n\n• When the programme runs out, the colony still looks normal but produces nothing.\n• It stays that way until you reset the extractor heads.\n\nFor example: the extractor on your Barren planet in Tama ends at 15:00 EVE time, so reset it before then.',
  },
  scam: {
    label: 'Suspicious market', what: 'A wall, escrow bait or price spike appears on a position, a bid or your watchlist',
    tip: 'Something on an item you hold a position in, bid on or watch looks like a trap. Items you only sell, like loot, aren’t checked. Three kinds are:\n\n• Wall: the best price holds over half its side and more than 3 days of trading.\n• Escrow bait: a buy order more than 10% above anything paid in the last 30 days.\n• Spike: a day with over 5 times the usual volume, at a price more than 10% off normal.\n\nFor example: a buy order at 1.3 M when nothing sold above 1.1 M this month. Someone may be baiting sellers.',
  },
  opportunity: {
    label: 'Trade worth a look', what: 'A market the cloud watches opens up past your target: mailed by the cloud',
    tip: 'One of the items the cloud watches for you (the best from your last Prospects scan, and your loyalty plan’s items) newly clears your Prospects filters.\n\n• It has to pass with no warning flag, after at least 6 hours of the cloud watching its book.\n• Judged exactly as Prospects judges it: where trading reaches for the buy, one tick under the best sell, your fees, your horizon.\n• Mailed once when it newly qualifies, at most three to a mail. Only the cloud sends these.\n\nFor example: a module you don’t trade yet now makes 6% after fees in about a day. The mail says where to buy and list.',
  },
  backup: {
    label: 'Backup overdue', what: 'Your last backup is more than two weeks old',
    tip: 'You haven’t exported a backup for more than 14 days.\n\n• Everything the app knows lives in this browser.\n• ESI only keeps 30 days of wallet history, so clearing the browser loses anything older.\n\nFor example: positions from two months ago can only come back from a backup. Export one in Settings → Your data.',
  },
};

/** Quiet hours run overnight in EVE time, when you are most likely asleep and least likely to act. */
export const QUIET_FROM = 23;
export const QUIET_TO = 7;
export const isQuiet = (t: number) => { const h = new Date(t).getUTCHours(); return h >= QUIET_FROM || h < QUIET_TO; };

/** Don't raise the same finding twice inside this window. */
/** How long the same alert waits before it comes again ("Remind me again after"). */
export const repeatMs = (cfg: Pick<AlertConfig, 'repeatH'>) => cfg.repeatH * 3600_000;

/** Events judged in ISK, so the minimum applies to them. */
const BY_ISK: AlertEvent[] = ['move', 'clearing'];

/** What the order check worked out about an order, which a mail spells out. */
export type OrderFacts = Pick<Relist,
  'verdict' | 'isBuy' | 'price' | 'best' | 'gap' | 'newPrice' | 'volumeRemain' | 'give' | 'fee' | 'cost' | 'atRisk' | 'aheadUnits' | 'aheadOrders' | 'hoursToFront' | 'why'>
  & Partial<Pick<Relist, 'reach' | 'reachAt' | 'unreached'>>;

/** A trade the cloud found in the items it watches: what Prospects would say about it. */
export type OppFacts = { buy: number; sell: number; roi: number; iskPerDay: number; qty: number; daysToFlip: number; watchedH: number; bought: number; dumped: number;
  /** On the last one mailed: how many more newly clear your filters, left to Prospects. */
  more?: number };

/** A colony's extraction programme, as read from ESI. */
export type PiFacts = { system: string; systemId: number; planetType: string; product: string | null; ends: number };

export type Finding = {
  kind: AlertEvent; key: string; title: string; text: string; isk?: number;
  /** The item it's about, when there is one: `text` starts with its name, which a mail makes a link. */
  typeId?: number; name?: string;
  /** The detail behind the one-line text, for a mail that has room to say it. */
  order?: OrderFacts; pi?: PiFacts; opp?: OppFacts;
};

export const orderFacts = (x: Relist): OrderFacts => ({
  verdict: x.verdict, isBuy: x.isBuy, price: x.price, best: x.best, gap: x.gap, newPrice: x.newPrice, volumeRemain: x.volumeRemain,
  give: x.give, fee: x.fee, cost: x.cost, atRisk: x.atRisk, aheadUnits: x.aheadUnits, aheadOrders: x.aheadOrders, hoursToFront: x.hoursToFront, why: x.why,
  reach: x.reach, reachAt: x.reachAt, unreached: x.unreached,
});

/**
 * What the order check's verdicts are worth saying: a move, a buy order unlikely to fill, or beaten but
 * clearing. Shared by the browser's checks and the cloud's, so a mail reads the same from either.
 */
export function orderFindings(list: Relist[], name: (typeId: number) => string): Finding[] {
  const out: Finding[] = [];
  for (const x of list) {
    const side = x.isBuy ? 'buy' : 'sell';
    const n = name(x.typeId);
    if (x.verdict === 'move') {
      out.push({ kind: 'move', key: `move:${x.orderId}:${x.newPrice}`, isk: x.atRisk, title: ALERT_LABELS.move.label, typeId: x.typeId, name: n, order: orderFacts(x),
        text: x.unreached
          ? `${n} buy order: trading rarely gets down to it (${x.reach} of the last ${FILL_WINDOW} days) — worth moving to ${Math.round(x.newPrice).toLocaleString('en-US')} ISK, where it does (costs ${iskBig(x.cost)}).`
          : `${n} ${side} order beaten — worth moving to ${Math.round(x.newPrice).toLocaleString('en-US')} ISK (costs ${iskBig(x.cost)}).` });
    } else if (x.verdict === 'dry') {
      // Replaces the advice to move, so it goes out as an order to act on, and is mailed like one.
      out.push({ kind: 'move', key: `dry:${x.orderId}:${x.price}`, isk: x.atRisk, title: 'Buy order unlikely to fill', typeId: x.typeId, name: n, order: orderFacts(x),
        text: `${n} buy order: trading reached it on ${x.reach} of the last 14 days, and bidding where it does leaves too little margin. Consider cancelling it.` });
    } else if (x.verdict === 'wait' && x.beaten) {
      out.push({ kind: 'clearing', key: `clear:${x.orderId}:${x.best}`, isk: x.atRisk, title: ALERT_LABELS.clearing.label, typeId: x.typeId, name: n, order: orderFacts(x),
        text: `${n} ${side} order is beaten, but ${x.why.charAt(0).toLowerCase() + x.why.slice(1)}.` });
    }
  }
  return out;
}

/** Extraction programmes that have ended, or end within a day. */
export function piFindings(colonies: Colony[], systemName: (id: number) => string | undefined, name: (typeId: number) => string | undefined, now: number): Finding[] {
  const out: Finding[] = [];
  for (const c of colonies) {
    const sys = systemName(c.head.solarSystemId) ?? `Planet ${c.head.planetId}`;
    for (const e of c.extractors) {
      if (e.expiry == null) continue;
      const h = (e.expiry - now) / 3600_000;
      const pi = { system: sys, systemId: c.head.solarSystemId, planetType: c.head.planetType, product: e.productTypeId ? name(e.productTypeId) ?? null : null, ends: e.expiry };
      if (h <= 0) out.push({ kind: 'pi', key: `pi:${e.pinId}:${e.expiry}:ended`, title: 'PI programme ended', text: `${sys}: an extraction programme has ended. It earns nothing until you reset the heads.`, pi });
      else if (h <= 24) out.push({ kind: 'pi', key: `pi:${e.pinId}:${e.expiry}:soon`, title: 'PI programme ending', text: `${sys}: an extraction programme ends in ${Math.max(1, Math.round(h))} h.`, pi });
    }
  }
  return out;
}

/**
 * What the cloud remembers a mailed finding by. An order's advice changes with every undercut (a new
 * price to move to), and in the six-hour study 46 of 71 beaten orders were undercut again within six
 * hours: keyed by the advice, one order left alone would be mailed about again and again with nobody
 * there to read it. Keyed by the order and your price on it, it is said once, and said again as soon as
 * you have moved it and been beaten at the new price.
 */
export function mailKey(f: Finding): string {
  if (!f.order) return f.key;
  const [kind, id] = f.key.split(':');
  return `${kind}:${id}@${f.order.price}`;
}

export function shouldAlert(f: Finding, cfg: AlertConfig, log: AlertLogEntry[], now: number): boolean {
  if (!cfg.on || !cfg.ev[f.kind]) return false;
  if (cfg.quiet && isQuiet(now)) return false;
  if (BY_ISK.includes(f.kind) && (f.isk ?? 0) < cfg.minIsk) return false;
  return !log.some((l) => !l.test && l.key === f.key && now - Date.parse(l.at) < repeatMs(cfg));
}

/** The countdown to the next check, from when checking started. */
export function nextCheckIn(startedAt: number, intervalMin: number, now: number): number {
  const p = intervalMin * 60_000;
  if (!(p > 0)) return 0;
  const elapsed = Math.max(0, now - startedAt);
  return p - (elapsed % p);
}

/** Every alert mail's subject starts with this, which is how the app finds its own mails to tidy away. */
export const MAIL_SUBJECT = 'Jita Ledger';
/** One mail holds at most this many alerts; a burst beyond it is summed up in a line. */
const MAIL_MAX = 15;

const escapeMail = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * What EVE mail draws, found by sending a sample to the user's character: sizes, bold, italic,
 * underline, ARGB colours and links to items, systems, stations and planets all work; runs of spaces
 * are kept. `&nbsp;` shows literally, `<hr>` draws nothing, a monospace face is ignored, a link's colour
 * can't be changed, and × has no glyph. So the mail is coloured lines of text, and never a table.
 */
const COL = { cyan: '5cd3f2', gold: 'f2b15c', green: '6ee7a8', red: 'ff6b7d', grey: '8095a8', white: 'ffffff' } as const;
const col = (c: keyof typeof COL, s: string) => `<font color="#ff${COL[c]}">${s}</font>`;
const sized = (z: number, s: string) => `<font size="${z}">${s}</font>`;
/**
 * Text sizes. The client's default mail text is small, and the user asked for it bigger: everything is
 * wrapped in TEXT, and an inner size overrides it (nesting was confirmed by the first alert mails).
 */
const SIZE = { brand: 26, title: 20, text: 16, small: 13 } as const;
/** A price as the market shows it, without the unit: 1,228,900 or 5.23. */
const price = (n: number) => isk(n).replace(/ ISK$/, '');
/** An amount of ISK, short when it's big: 64,300 ISK, 14.81 M ISK. */
const money = iskBig;
const hoursSaid = (h: number) => (h < 1 ? 'under an hour' : h < 48 ? `about ${Math.round(h)} h` : `about ${Math.round(h / 24)} days`);

const URGENCY: Record<AlertEvent, number> = { move: 0, pi: 1, scam: 2, squeeze: 3, clearing: 4, backup: 5, opportunity: 6 };

/** A short phrase for the subject line, which is what the inbox list and the new-mail notice show. */
export function subjectPart(f: Finding, now = Date.now()): string {
  const o = f.order;
  if (o && f.name) {
    if (o.verdict === 'move') return `move ${f.name} ${o.isBuy ? 'buy' : 'sell'} to ${price(o.newPrice)}`;
    if (o.verdict === 'wait') return `${f.name} beaten, but hold`;
    if (o.verdict === 'loss') return `${f.name} beaten, don’t match`;
    if (o.verdict === 'dry') return `cancel ${f.name} buy`;
    if (o.verdict === 'bid') return `sell ${f.name} into the bids`;
    return `${f.name} at the front`;
  }
  const p = f.pi;
  if (p) return p.ends <= now ? `PI stopped in ${p.system}` : `PI ends in ${hoursSaid((p.ends - now) / 3600_000).replace('about ', '')} in ${p.system}`;
  if (f.opp && f.name) return `look at ${f.name}, ${pct(f.opp.roi, 1)}`;
  return f.title;
}

/** The body of one alert: what it is, what to do, then the facts behind it. */
function section(f: Finding, market: (typeId: number, calc?: boolean) => string, now: number): string {
  const head = (t: string, c: keyof typeof COL = 'gold') => `<br>${sized(SIZE.title, col(c, `<b>${escapeMail(t.toUpperCase())}</b>`))}<br>`;
  const advice = (c: keyof typeof COL, t: string) => `${col(c, `<b>RECOMMENDED: ${escapeMail(t)}</b>`)}<br>`;
  // An opportunity opens in the Calculator, where the trade can be checked; everything else at its market.
  const itemLink = (f.typeId && f.name) ? `<a href="${market(f.typeId, !!f.opp)}">${escapeMail(f.name)}</a>` : '';
  const q = f.opp;
  if (q && itemLink) {
    return [
      head(f.title, 'cyan'),
      advice('green', `buy at ${price(q.buy)} ISK, list at ${price(q.sell)} ISK`),
      `${itemLink}${col('grey', ' · ')}${pct(q.roi, 1)}${col('grey', ' after fees · about ')}${money(q.iskPerDay)}${col('grey', ' a day')}<br>`,
      col('grey', `Up to ${units(q.qty)} (${iskBig(q.qty * q.buy)}) flips in ${hoursSaid(q.daysToFlip * 24).replace('about ', '')} at your share.`) + '<br>',
      col('grey', `Watched ${Math.round(q.watchedH)} h: ${units(Math.round(q.bought))} bought from listings, ${units(Math.round(q.dumped))} sold into bids.`) + '<br>',
      q.more ? `<br>${col('cyan', `${units(q.more)} more newly clear your filters: see Prospects.`)}<br>` : '',
    ].join('');
  }
  const o = f.order;
  if (o && itemLink) {
    const side = o.isBuy ? 'buy' : 'sell';
    const out = [head(f.title)];
    if (o.verdict === 'move') out.push(advice('green', `move your ${side} order ${o.isBuy ? 'up' : 'down'} to ${price(o.newPrice)} ISK`));
    else if (o.verdict === 'wait') out.push(advice('white', 'leave it where it is'), `${col('grey', `<i>${escapeMail(o.why)}.</i>`)}<br>`);
    else if (o.verdict === 'loss') out.push(advice('white', 'don’t match them'), `${col('grey', `<i>${escapeMail(o.why)}.</i>`)}<br>`);
    else if (o.verdict === 'dry') out.push(advice('red', 'cancel this buy order'), `${col('grey', `<i>${escapeMail(o.why)}.</i>`)}<br>`);
    else if (o.verdict === 'bid') out.push(advice('gold', 'cancel the listing and sell into the bids'), `${col('grey', `<i>${escapeMail(o.why)}.</i>`)}<br>`);
    else out.push(advice('white', 'nothing to do'), `${col('grey', `<i>${escapeMail(o.why)}.</i>`)}<br>`);
    out.push(`${itemLink}${col('grey', ` · ${side} order · `)}${units(o.volumeRemain)} left<br>`);
    out.push(o.best == null
      ? `${col('grey', 'Yours ')}${price(o.price)}${col('grey', ' · nobody else on your side')}<br>`
      : `${col('grey', 'Yours ')}${price(o.price)}${col('grey', ' · best now ')}${col(o.gap > 0 && o.verdict !== 'front' ? 'red' : 'white', price(o.best))}${o.gap > 0 && o.verdict !== 'front' ? col('grey', ` (beaten by ${price(o.gap)})`) : ''}<br>`);
    if (o.verdict === 'move' && o.unreached) {
      out.push(col('grey', `Trading reached your bid on ${o.reach} of the last ${FILL_WINDOW} days. ${price(o.newPrice)} is where it did on half of them.`) + '<br>');
    }
    if (o.verdict === 'move') {
      out.push(`${col('grey', 'Moving costs ')}${money(o.cost)}${col('grey', ` (${money(o.give)} ${o.isBuy ? 'higher' : 'lower'} price + ${money(o.fee)} fee) · `)}${money(o.atRisk)}${col('grey', ' at stake')}<br>`);
    }
    if (o.aheadUnits > 0) {
      out.push(col('grey', `Ahead of you: ${units(o.aheadOrders)} order${o.aheadOrders === 1 ? '' : 's'}, ${units(o.aheadUnits)} unit${o.aheadUnits === 1 ? '' : 's'} · ${Number.isFinite(o.hoursToFront) ? `${hoursSaid(o.hoursToFront)} to clear at the usual pace` : 'too little trading history to say how long that takes'}`) + '<br>');
    }
    return out.join('');
  }
  const p = f.pi;
  if (p) {
    const ended = p.ends <= now;
    const kind = p.planetType.charAt(0).toUpperCase() + p.planetType.slice(1);
    // A solar system's type ID is 5; this opens its info in game, where a destination is one click away.
    const place = `<a href="showinfo:5//${p.systemId}">${escapeMail(p.system)}</a>${col('grey', ` · ${escapeMail(kind)} planet${p.product ? ` · extracting ${escapeMail(p.product)}` : ''}`)}<br>`;
    return [
      head(f.title, ended ? 'red' : 'gold'),
      advice(ended ? 'red' : 'green', ended ? 'reset the extractor heads — it has stopped' : `reset the extractor heads before ${fmtDateTime(p.ends)}`),
      place,
      col('grey', ended
        ? `Ended ${fmtDateTime(p.ends)}. It earns nothing until you reset it.`
        : `Ends ${fmtDateTime(p.ends)}, in ${hoursSaid((p.ends - now) / 3600_000).replace('about ', '')}. The colony looks normal after that, but extracts nothing.`) + '<br>',
    ].join('');
  }
  // Anything else: its title, the one line, with the item's name as its market link.
  const text = escapeMail(f.text);
  const body = itemLink && f.text.startsWith(f.name!)
    ? `${itemLink}${text.slice(escapeMail(f.name!).length)}<br>`
    : `${text}<br>${f.typeId ? `<a href="${market(f.typeId)}">Open its market in game</a><br>` : ''}`;
  const worth = f.kind === 'backup' ? advice('green', 'export a backup in Jita Ledger → Settings → Your data')
    : f.kind === 'squeeze' || f.kind === 'scam' ? `${col('white', '<b>WORTH CHECKING before you trade more of it.</b>')}<br>` : '';
  return head(f.title) + worth + body;
}

/** "30 minutes", "an hour", "a day", "3 days": how long a mail is kept, said as a person would. */
export function keepSaid(min: number): string {
  if (min < 60) return `${min} minutes`;
  if (min < 1440) return min === 60 ? 'an hour' : `${Math.round(min / 60)} hours`;
  const d = Math.round(min / 1440);
  return d === 1 ? 'a day' : d === 7 ? 'a week' : `${d} days`;
}

/**
 * The EVE mail for one check's alerts: everything found at once in a single mail rather than one each.
 *
 * EVE mail takes a small set of HTML, and a mail link can open an item's info (`showinfo:`) but not its
 * market. So an item's name links to the app instead (`#orders?market=ID`), which asks ESI to open that
 * market when it loads: the client follows the web link, the browser opens the app, the app opens the
 * window. One link, on the name, because the market is what an alert sends you to; the info window
 * alone was a detour. Colours are ARGB, as the client writes them.
 */
export function alertMail(findings: Finding[], opts: { appUrl: string; keepMin: number | null; test?: boolean; now?: number }): { subject: string; body: string } {
  const n = findings.length;
  const now = opts.now ?? Date.now();
  // Most urgent first, in the subject and the body alike.
  findings = [...findings].sort((a, b) => URGENCY[a.kind] - URGENCY[b.kind]);
  // Then as many as fit in a subject the inbox can show.
  const parts: string[] = [];
  for (const f of findings) {
    const next = subjectPart(f, now);
    if (parts.length && [...parts, next].join(' · ').length > 90) break;
    parts.push(next);
  }
  const more = n - parts.length;
  const subject = `${MAIL_SUBJECT}: ${opts.test ? 'test — ' : ''}${parts.join(' · ')}${more ? ` · +${more} more` : ''}`.slice(0, 1000);
  const market = (typeId: number, calc = false) => (calc ? `${opts.appUrl}#calculator?type=${typeId}` : `${opts.appUrl}#orders?market=${typeId}`);
  const build = (shown: Finding[]) => [
    `<font size="${SIZE.text}">`,
    `${sized(SIZE.brand, col('cyan', '<b>Jita Ledger</b>'))}<br>`,
    ...shown.map((f) => section(f, market, now)),
    n > shown.length ? `<br>…and ${n - shown.length} more in the app.<br>` : '',
    findings.some((f) => f.kind === 'move' || f.kind === 'clearing')
      ? `<br><a href="${opts.appUrl}#orders">Open your orders in Jita Ledger</a><br>`
      : findings.every((f) => f.kind === 'opportunity')
        ? `<br><a href="${opts.appUrl}#prospects">Open Prospects in Jita Ledger</a><br>`
        : `<br><a href="${opts.appUrl}#todo">Open your to-do list in Jita Ledger</a><br>`,
    `<br>${sized(SIZE.small, col('grey', `${opts.keepMin == null ? 'Alert mails are kept' : `This mail is deleted after ${keepSaid(opts.keepMin)}, read or not`}. Change that, or turn mail alerts off, in Jita Ledger → Settings → Alerts.`))}`,
    '</font>',
  ].join('');
  // ESI refuses a body over 10,000 characters. Whole alerts are left out rather than a tag cut in half.
  let count = Math.min(n, MAIL_MAX);
  let body = build(findings.slice(0, count));
  while (body.length > 10000 && count > 1) body = build(findings.slice(0, --count));
  return { subject, body };
}

/**
 * Whether a mail header is one of the app's own alert mails, old enough to delete: from you or your
 * sending character, with the app's subject.
 */
export function isStaleAlertMail(m: { from?: number; subject?: string; timestamp?: string }, senders: number[], keepMin: number, now: number): boolean {
  return m.from != null && senders.includes(m.from) && !!m.subject?.startsWith(MAIL_SUBJECT + ':') && !!m.timestamp && now - Date.parse(m.timestamp) > keepMin * 60_000;
}

/**
 * How often to look for old alert mails: a sixth of the time they're kept, between 5 minutes and an
 * hour. Hourly alone would leave a 30-minute mail sitting for up to 90.
 */
export function tidyEvery(keepMin: number): number {
  return Math.min(60, Math.max(5, keepMin / 6)) * 60_000;
}
