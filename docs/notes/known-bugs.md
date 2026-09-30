# Known bugs

Bugs found and verified real but not yet fixed.

- **The cloud sync after "Delete all data" without a reload** (found by reading the code in the reviews of stage 2a of
  several characters, 30 September 2026; **not reproduced**, and predates that work). `clearAll` (`lib/store.ts`) deletes
  every key in the ledger's IndexedDB store, which is also `dataStore`, where `lib/cloud.ts` keeps its sync state
  (`STATE_KEY` 'cloud': the revision reached, `started`, the unsent list), and empties the ledger in memory. But
  `cloud.ts` has no `onClearAll` hook and doesn't check `dataGeneration`, so its in-memory `state` (`started: true`, the
  old `rev`) and `dirtyRecords` / `dirtyDocs` survive the wipe. Then:
  - the next cloud tick (`syncCloudNow`, every minute while the tab is in view) pulls from the old revision and `save()`
    writes the state back with `started: true`. On the next reload `loadState` reads it, `firstSync` doesn't run, and
    the pull asks only for what's after the old revision: the ledger doesn't come back, though Settings' "Delete all
    data" dialog says the cloud copy "comes back here the next time you open the app logged in". (A token refresh
    before that tick runs `startCloud`'s `begin` → `loadState`, which finds no saved state and starts afresh, so which
    comes first decides it.)
  - changes still waiting to be pushed at the wipe are pushed by `pushNow`, which reads each record's value from the
    emptied `getData()`: `d: null`, a removal in the cloud, and a waiting document goes up as the empty ledger's.
  Not fixed yet. A fix would reset `cloud.ts`'s state from an `onClearAll` hook (and drop its unsent list), so the next
  start is a first sync that pulls the cloud's copy down.

The three an adversarial review found and verified were fixed on 28 September 2026 (see "Each trade and
each fee belongs to one position" and "Units sold beyond what a position bought" in positions-results): overlapping
positions double-counting the totals, sells with no matching buys costed at their own price, and broker fees dropped
for orders issued before a position's start. None of the user's five positions hit them (one came within 90 seconds
of the third), so each is covered by a synthetic test; the second did move Results' every-item line by 104,465 ISK.

Fixed with the redesign: `clearAll` bumps a generation that an in-flight sync checks before writing;
importing a backup confirms and says what it replaces; "stock if sold now" re-reads the market every five
minutes; the journal index is cached per journal version instead of rebuilt per position.

That review's verification pass was cut short, so this list is what survived, not a full audit.
