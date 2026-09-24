const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nfIn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const MINUS = '\u2212';

/** Accepts 1,234,567.89 / 1 234 567,89 / 1.2m / 350k / 2b / pasted "1,234.00 ISK". */
export function parseISK(input: string | null | undefined): number {
  if (input == null) return NaN;
  let s = String(input).trim().toLowerCase().replace(/isk/g, '').replace(/[\s\u00a0\u202f']/g, '');
  if (!s) return NaN;
  let mult = 1;
  const m = s.match(/([kmb])$/);
  if (m) {
    mult = { k: 1e3, m: 1e6, b: 1e9 }[m[1] as 'k' | 'm' | 'b'];
    s = s.slice(0, -1);
  }
  const hasC = s.includes(','), hasD = s.includes('.');
  if (hasC && hasD) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasC) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(s)) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n * mult : NaN;
}

export function isk(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const a = Math.abs(n);
  return (n < 0 ? MINUS : '') + (a < 100000 ? nf2 : nf0).format(a) + ' ISK';
}
export function iskSigned(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return (n > 0 ? '+' : '') + isk(n);
}
export function iskBig(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const a = Math.abs(n), sign = n < 0 ? MINUS : '';
  if (a >= 1e12) return sign + (a / 1e12).toFixed(2) + ' T ISK';
  if (a >= 1e9) return sign + (a / 1e9).toFixed(2) + ' B ISK';
  if (a >= 1e6) return sign + (a / 1e6).toFixed(2) + ' M ISK';
  return isk(n);
}
export function iskBigSigned(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return (n > 0 ? '+' : '') + iskBig(n);
}
/** Short axis labels: 1.2M, 850k */
export function iskAxis(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? MINUS : '';
  if (a >= 1e9) return sign + +(a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return sign + +(a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return sign + +(a / 1e3).toFixed(1) + 'k';
  return sign + +a.toFixed(2);
}
export function pct(x: number | null | undefined, dp = 2): string {
  if (x == null || !Number.isFinite(x)) return '–';
  return (x < 0 ? MINUS : '') + (Math.abs(x) * 100).toFixed(dp) + '%';
}
export function units(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return nf0.format(n);
}
export function inputNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return nfIn.format(n);
}
export function plainNum(n: number): string {
  return String(+Number(n).toFixed(4));
}

const dFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dtFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/** EVE time is UTC, so dates are shown in UTC. */
export const fmtDate = (d: string | number) => dFmt.format(new Date(d));
export const fmtDateTime = (d: string | number) => dtFmt.format(new Date(d)) + ' ET';
export const fmtShort = (d: string | number) => shortFmt.format(new Date(d));
export function ago(iso?: string): string {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' days ago';
}
export function rid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Evenly spaced day ticks for time axes, so labels don't bunch up around the data points. */
export function timeTicks(a: number, b: number, n = 6): number[] {
  const day = 86400_000;
  if (!(b > a)) return [a];
  const step = Math.max(day, Math.ceil((b - a) / (n - 1) / day) * day);
  const out: number[] = [];
  for (let t = Math.ceil(a / day) * day; t <= b; t += step) out.push(t);
  return out;
}

/** A share of something for prose: "under 1%", "46%", "nothing". */
export function share(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x) || x <= 0) return 'none';
  if (x < 0.01) return 'under 1%';
  return pct(x, 0);
}
