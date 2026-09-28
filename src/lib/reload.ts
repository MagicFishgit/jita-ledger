import { flushCloudState } from './cloud';
import { flushSaves } from './store';

/**
 * Reload the app without losing anything: the ledger holds each save 250 ms and the cloud its list of unsent changes
 * 500 ms, so a reload the app makes itself (a new version, pulling down to reload, a page file gone after a deploy)
 * writes those first.
 */
export async function reloadApp(): Promise<void> {
  try { await Promise.all([flushSaves(), flushCloudState()]); } catch { /* reload anyway: the next sync fills gaps */ }
  location.reload();
}
