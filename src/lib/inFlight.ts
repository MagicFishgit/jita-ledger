/**
 * A read shared while it's in flight: two callers asking for the same key at the same moment get one request's answer.
 * A cache that only remembers finished answers asks twice when two ask at once (docs/notes/gotchas.md): `cached` in
 * universe.ts and the books in market.ts each had to learn it, and the Research tab reads 17 datacores' histories while
 * its field picker and its agents table both want them. Only while in flight: once the answer is in (or the read fails),
 * the next ask runs again, so whatever cache the function keeps decides how fresh it is, and a failure isn't kept.
 * Pure: no store, config or DOM, so check.mjs loads it.
 */
export function shareInFlight<A extends unknown[], T>(keyOf: (...args: A) => string, fn: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  const going = new Map<string, Promise<T>>();
  return (...args: A) => {
    const key = keyOf(...args);
    const hit = going.get(key);
    if (hit) return hit;
    const p = fn(...args);
    going.set(key, p);
    const done = () => { if (going.get(key) === p) going.delete(key); };
    p.then(done, done);
    return p;
  };
}
