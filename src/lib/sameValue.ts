/**
 * Whether two values are equal by what they hold: the same primitive, arrays of equal items in order, or plain objects with the
 * same keys and equal values, all the way down. The same reference is equal at once, so a value rebuilt around parts it kept is
 * cheap to compare. Anything else (a Map, a Set, a Date, a typed array) is equal only to itself: its keys don't say what it holds.
 * For keying a React memo on what a value holds rather than on its identity (`useStable` in hooks.ts). Pure.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  if (!plain(a) || !plain(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(y, k) || !sameValue(x[k], y[k])) return false;
  return true;
}

const plain = (x: object) => { const p = Object.getPrototypeOf(x); return p === Object.prototype || p === null; };
