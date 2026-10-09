import type { Data } from './store';
import { DEFAULT_SETTINGS } from './fees';
import { DEFAULT_ALERTS, DEFAULT_PREFS } from './prefs';

/** An empty ledger: what a new browser starts from, and what an alt's copy is filled into (altLedger.ts). */
export const emptyData = (): Data => ({
  settings: { ...DEFAULT_SETTINGS },
  txs: {}, journal: {}, orders: {}, positions: [], watchlist: [], names: {}, ignored: [], meta: {},
  prefs: { ...DEFAULT_PREFS }, alerts: { ...DEFAULT_ALERTS }, alertLog: [], goals: [], tags: {}, nearDone: [],
  killmails: {}, netWorth: [], unusualOk: [], leave: [], leaveFrom: {}, safetyTimes: {}, notSnipes: [], plans: [], mining: {}, chars: {},
});
