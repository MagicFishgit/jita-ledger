// EVE order prices carry at most 4 significant figures, with 0.01 ISK as the floor.
// (CCP's Broker Relations change, March 2020: https://www.eveonline.com/news/view/broker-relations)
//
// So the smallest price change you can make is not 0.01 ISK but one unit of the fourth
// significant figure, which grows with the price: 0.01 ISK on a 50 ISK item, 100 ISK on a
// 500k one, 1,000 ISK on a million-ISK one. It also changes across a power of ten, which is
// why the step is taken from the magnitude of the answer rather than the starting price:
// one step below 1,000,000 is 999,900, not 999,000.
//
// The client rounds an off-grid price to the nearest legal one without saying so, so a price
// this app suggests has to be legal already, or the order quietly lands level with the rival
// it was meant to beat.

/** Relative nudge that absorbs float dust, so 0.29 * 100 (= 28.999999999999996) still counts as 29 cents. */
const EPS = 1e-9;

/** Digits in a positive integer. Exact, where Math.log10 drifts at the powers of ten this grid turns on. */
const digits = (n: number) => String(Math.max(1, n)).length;

/** The grid step, in whole cents, for a price of that many cents: the fourth significant figure, never under 0.01 ISK. */
const stepCents = (c: number) => Math.max(1, 10 ** (digits(c) - 4));

/** The smallest change you can make to a price: one step of the grid it sits on. */
export function priceTick(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return NaN;
  return stepCents(Math.round(price * 100)) / 100;
}

/** The lowest legal price above this one, for outbidding a buy order. */
export function tickUp(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return NaN;
  const c = price * 100 * (1 + EPS);
  const s = stepCents(Math.floor(c) + 1);
  return (Math.ceil(c / s) * s) / 100;
}

/** The highest legal price below this one, for undercutting a sell order. NaN at 0.01 ISK, which nothing can go under. */
export function tickDown(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return NaN;
  const c = price * 100 * (1 - EPS);
  const s = stepCents(Math.ceil(c) - 1);
  const r = Math.floor(c / s) * s;
  return r >= 1 ? r / 100 : NaN;
}

/** Onto the grid, rounding up. For a price you must not go under, such as break-even. */
export function priceUp(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return NaN;
  const c = price * 100 * (1 - EPS);
  const s = stepCents(Math.ceil(c));
  return (Math.ceil(c / s) * s) / 100;
}

/** Onto the grid, rounding down. For a price you must not go over, such as the most you can pay. */
export function priceDown(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return NaN;
  const c = price * 100 * (1 + EPS);
  const s = stepCents(Math.floor(c));
  const r = Math.floor(c / s) * s;
  return r >= 1 ? r / 100 : NaN;
}
