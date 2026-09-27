import { useEffect, useState } from 'react';
import { Radar } from 'lucide-react';
import { ago } from '../lib/format';
import { navigate, useNow } from '../lib/hooks';
import { scanFreshness, SCAN_STALE_HOURS } from '../lib/prospects';
import { loadCache, useScanState, type ScanCache } from '../lib/scan';
import { Notice } from './ui';

/**
 * How current the Prospects scan is, on a page that works from it.
 *
 * The planner, hub arbitrage and the slot-swap suggestions on Orders all read what the last scan found,
 * and nothing else refreshes it. So each says how old that is, and when a deep scan last finished:
 * quietly when it's recent, as a warning once it's SCAN_STALE_HOURS old, and plainly once it's a day.
 * `what` is what this page makes from it ("the plan", "the candidates").
 */
export function ScanFreshness({ what, compact }: { what: string; compact?: boolean }) {
  const scan = useScanState();
  const now = useNow(60_000);
  const [cache, setCache] = useState<ScanCache | null>(null);
  useEffect(() => { loadCache().then(setCache).catch(() => setCache({ stats: {}, books: {} })); }, [scan.phase, scan.saved]);
  if (!cache) return null;

  const running = scan.phase === 'sampling' || scan.phase === 'liquidity' || scan.phase === 'pricing';
  const newestPrice = Object.values(cache.books).reduce<string | null>((m, b) => (!m || b.at > m ? b.at : m), null);
  const f = scanFreshness(cache.runs, newestPrice, now);
  const open = <button type="button" className="link-btn" onClick={() => navigate('prospects')}><Radar aria-hidden="true" />Open Prospects</button>;
  const deep = f.deepAt ? `Last deep scan finished ${ago(f.deepAt, now)}.` : 'No deep scan has finished yet.';
  const deepNote = f.deepStale && <span style={{ color: 'var(--acc2)' }}>{deep} A deep scan checks every candidate, not just the busiest.</span>;

  if (running) {
    return <Notice>A {scan.depth} scan is running now. {what.charAt(0).toUpperCase() + what.slice(1)} will use its results as they come in.</Notice>;
  }
  if (f.level === 'none') {
    return <Notice kind="warn"><b>No Prospects scan yet</b>, so {what} has nothing to work from. Run a quick scan on Prospects first. {open}</Notice>;
  }
  const when = `a ${f.lastDepth ? `${f.lastDepth} ` : ''}scan ${ago(f.last!, now)}`;
  if (f.level === 'fresh') {
    return (
      <p className="note small" style={{ margin: compact ? 0 : '0 0 4px', display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'baseline' }}>
        <span>{what.charAt(0).toUpperCase() + what.slice(1)} comes from {when} on Prospects.</span>
        {f.deepStale ? deepNote : <span>{deep}</span>}
      </p>
    );
  }
  return (
    <Notice kind={f.level === 'old' ? 'err' : 'warn'}>
      <b>Prospects data is from {when}.</b>{' '}
      {f.level === 'old'
        ? `Prices and trading history have both moved since, so ${what} is working from old numbers. Run a quick scan before acting on it.`
        : `It’s over ${SCAN_STALE_HOURS} hours old and prices have moved. Run a quick scan before acting on ${what}.`}
      {' '}{f.deepStale ? deepNote : deep} {open}
    </Notice>
  );
}
