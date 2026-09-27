/**
 * Which findings become alerts, and when to stay quiet.
 *
 * The checking itself happens elsewhere (orders against the live book, colonies, positions); this only
 * decides whether a finding is worth interrupting you for. Pure, so the rules can be tested.
 */

import { fmtDateTime, isk, iskBig, units } from './format';
import type { Relist } from './relist';
import type { AlertConfig, AlertEvent, AlertLogEntry } from './types';

export const ALERT_LABELS: Record<AlertEvent, { label: string; what: string }> = {
  move: { label: 'Order worth moving', what: 'An order of yours is beaten and the queue ahead won’t clear inside your wait time' },
  clearing: { label: 'Beaten but clearing', what: 'You’re undercut, but the stock ahead will clear on its own — usually just noise' },
  squeeze: { label: 'Margin squeeze', what: 'A position’s daily range has narrowed close to its break-even spread' },
  pi: { label: 'PI programme ending', what: 'An extraction programme ends within a day, or has ended' },
  scam: { label: 'Suspicious market', what: 'A wall, escrow bait or price spike appears on something you trade or watch' },
  backup: { label: 'Backup overdue', what: 'Your last backup is more than two weeks old' },
};

/** Quiet hours run overnight in EVE time, when you are most likely asleep and least likely to act. */
export const QUIET_FROM = 23;
export const QUIET_TO = 7;
export const isQuiet = (t: number) => { const h = new Date(t).getUTCHours(); return h >= QUIET_FROM || h < QUIET_TO; };

/** Don't raise the same finding twice inside this window. */
export const REPEAT_MS = 6 * 3600_000;

/** Events judged in ISK, so the minimum applies to them. */
const BY_ISK: AlertEvent[] = ['move', 'clearing'];

/** What the order check worked out about an order, which a mail spells out. */
export type OrderFacts = Pick<Relist,
  'verdict' | 'isBuy' | 'price' | 'best' | 'gap' | 'newPrice' | 'volumeRemain' | 'give' | 'fee' | 'cost' | 'atRisk' | 'aheadUnits' | 'aheadOrders' | 'hoursToFront' | 'why'>;

/** A colony's extraction programme, as read from ESI. */
export type PiFacts = { system: string; systemId: number; planetType: string; product: string | null; ends: number };

export type Finding = {
  kind: AlertEvent; key: string; title: string; text: string; isk?: number;
  /** The item it's about, when there is one: `text` starts with its name, which a mail makes a link. */
  typeId?: number; name?: string;
  /** The detail behind the one-line text, for a mail that has room to say it. */
  order?: OrderFacts; pi?: PiFacts;
};

export function shouldAlert(f: Finding, cfg: AlertConfig, log: AlertLogEntry[], now: number): boolean {
  if (!cfg.on || !cfg.ev[f.kind]) return false;
  if (cfg.quiet && isQuiet(now)) return false;
  if (BY_ISK.includes(f.kind) && (f.isk ?? 0) < cfg.minIsk) return false;
  return !log.some((l) => !l.test && l.key === f.key && now - Date.parse(l.at) < REPEAT_MS);
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
/** A price as the market shows it, without the unit: 1,228,900 or 5.23, and no ".00" on a whole number. */
const price = (n: number) => isk(n).replace(/ ISK$/, '').replace(/\.00$/, '');
/** An amount of ISK, short when it's big and without ".00" when it's whole: 64,300 ISK, 14.81 M ISK. */
const money = (n: number) => iskBig(n).replace(/\.00 ISK$/, ' ISK');
const hoursSaid = (h: number) => (h < 1 ? 'under an hour' : h < 48 ? `about ${Math.round(h)} h` : `about ${Math.round(h / 24)} days`);

const URGENCY: Record<AlertEvent, number> = { move: 0, pi: 1, scam: 2, squeeze: 3, clearing: 4, backup: 5 };

/** A short phrase for the subject line, which is what the inbox list and the new-mail notice show. */
export function subjectPart(f: Finding, now = Date.now()): string {
  const o = f.order;
  if (o && f.name) {
    if (o.verdict === 'move') return `move ${f.name} ${o.isBuy ? 'buy' : 'sell'} to ${price(o.newPrice)}`;
    if (o.verdict === 'wait') return `${f.name} beaten, but hold`;
    if (o.verdict === 'loss') return `${f.name} beaten, don’t match`;
    return `${f.name} at the front`;
  }
  const p = f.pi;
  if (p) return p.ends <= now ? `PI stopped in ${p.system}` : `PI ends in ${hoursSaid((p.ends - now) / 3600_000).replace('about ', '')} in ${p.system}`;
  return f.title;
}

/** The body of one alert: what it is, what to do, then the facts behind it. */
function section(f: Finding, market: (typeId: number) => string, now: number): string {
  const head = (t: string, c: keyof typeof COL = 'gold') => `<br>${sized(SIZE.title, col(c, `<b>${escapeMail(t.toUpperCase())}</b>`))}<br>`;
  const advice = (c: keyof typeof COL, t: string) => `${col(c, `<b>RECOMMENDED: ${escapeMail(t)}</b>`)}<br>`;
  const itemLink = (f.typeId && f.name) ? `<a href="${market(f.typeId)}">${escapeMail(f.name)}</a>` : '';
  const o = f.order;
  if (o && itemLink) {
    const side = o.isBuy ? 'buy' : 'sell';
    const out = [head(f.title)];
    if (o.verdict === 'move') out.push(advice('green', `move your ${side} order ${o.isBuy ? 'up' : 'down'} to ${price(o.newPrice)} ISK`));
    else if (o.verdict === 'wait') out.push(advice('white', 'leave it where it is'), `${col('grey', `<i>${escapeMail(o.why)}.</i>`)}<br>`);
    else if (o.verdict === 'loss') out.push(advice('white', 'don’t match them'), `${col('grey', `<i>${escapeMail(o.why)}.</i>`)}<br>`);
    else out.push(advice('white', 'nothing to do'), `${col('grey', `<i>${escapeMail(o.why)}.</i>`)}<br>`);
    out.push(`${itemLink}${col('grey', ` · ${side} order · `)}${units(o.volumeRemain)} left<br>`);
    out.push(o.best == null
      ? `${col('grey', 'Yours ')}${price(o.price)}${col('grey', ' · nobody else on your side')}<br>`
      : `${col('grey', 'Yours ')}${price(o.price)}${col('grey', ' · best now ')}${col(o.gap > 0 && o.verdict !== 'front' ? 'red' : 'white', price(o.best))}${o.gap > 0 && o.verdict !== 'front' ? col('grey', ` (beaten by ${price(o.gap)})`) : ''}<br>`);
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
  const worth = f.kind === 'backup' ? advice('green', 'export a backup in Jita Ledger → Settings → Data')
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
  const market = (typeId: number) => `${opts.appUrl}#orders?market=${typeId}`;
  const build = (shown: Finding[]) => [
    `<font size="${SIZE.text}">`,
    `${sized(SIZE.brand, col('cyan', '<b>Jita Ledger</b>'))}<br>`,
    ...shown.map((f) => section(f, market, now)),
    n > shown.length ? `<br>…and ${n - shown.length} more in the app.<br>` : '',
    findings.some((f) => f.kind === 'move' || f.kind === 'clearing')
      ? `<br><a href="${opts.appUrl}#orders">Open your orders in Jita Ledger</a><br>`
      : `<br><a href="${opts.appUrl}#tonight">Open Tonight’s run in Jita Ledger</a><br>`,
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
