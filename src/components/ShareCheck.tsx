import { Scale } from 'lucide-react';
import { useCloud } from '../lib/cloud';
import { navigate } from '../lib/hooks';
import { MIN_SIDE_DAYS } from '../lib/share';
import { useData } from '../lib/store';
import { SHARE_OVER, shareOver, type ShareSummary } from '../lib/track';

const pc = (x: number | null) => (x == null ? null : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);

/** What your own trades caught, in words: "1.2% of what sellers sold into bids and 5.8% of what buyers took". */
export function measuredSaid(s: ShareSummary): string {
  const parts = [
    s.buyMedian != null && s.buyDays >= MIN_SIDE_DAYS ? `${pc(s.buyMedian)} of what sellers sold into bids` : null,
    s.sellMedian != null && s.sellDays >= MIN_SIDE_DAYS ? `${pc(s.sellMedian)} of what buyers took from listings` : null,
  ].filter(Boolean);
  return parts.join(' and ');
}

/**
 * Says so when your share setting is well over what your own trades measured (the cloud measures it daily), since
 * everything a page sizes is linear in it. Nothing shows until the cloud has measured, or while they're close.
 */
export function ShareCheck({ what }: { what: string }) {
  const d = useData();
  const s = useCloud().track?.share;
  const over = shareOver(s, d.settings.share);
  if (!s || over == null || over < SHARE_OVER) return null;
  return (
    <div className="notice warn" data-rv="">
      <Scale aria-hidden="true" />
      <span style={{ flex: 1, minWidth: 0 }}>
        Your share is set to <b>{d.settings.share}%</b>, but on the days you traded over the last 30 your orders caught a median {measuredSaid(s)}, which
        a setting of <b>{s.suggested}%</b> reproduces. {what} {what.endsWith('s') ? 'are' : 'is'} sized at {d.settings.share}%: about {over.toFixed(1)}× what your orders have been getting.
      </span>
      <button type="button" className="link-btn" onClick={() => navigate('settings/rates')}>Change it in Settings</button>
    </div>
  );
}
