---
paths:
  - "src/lib/copyMarket.ts"
  - "worker/src/copies.ts"
  - "worker/migrations/0020_copies.sql"
---

# Industry: the cloud's copy round

Split from industry.md on 19 October 2026: stage 3's cloud side. Decisions worth not undoing. What copies sell, counted
by the cloud every six hours from EVE Ref's contract snapshots, and the snapshot reader it shares with the Blueprints
route. The Copies section and your own copy contracts are in industry-copies.md.

## Stage 3: copies to sell

Decisions worth not undoing (spec `docs/superpowers/specs/2026-10-10-industry-design.md`, plan
`docs/superpowers/plans/2026-10-11-industry-stage-3.md`, its corrections numbered there). Task 14A: the cloud counts what copies sell.

- **What copies sell is counted by the cloud every six hours** (`worker/src/copies.ts`, `src/lib/copyMarket.ts`, migration 0020,
  `GET /v1/copies`; 11 October 2026). On the `37` cron after Goonmetrics (`refreshCopies`, its own try/catch, so neither the alts'
  read nor Goonmetrics waits on it), the cloud reads EVE Ref's latest public-contract snapshot and keeps The Forge's **single-kind
  copy contracts** (every item a copy of one type at one ME, TE and runs, nothing asked in return, a price) as a set, `copy_set`,
  in rows of `COPY_PART` (3,000 contracts, about 280 KB of JSON a row, under D1's 2 MB: the set was 1.02 to 1.03 MB on 11
  October and one row would fail outright the day the market doubles; correction 3). A row is `[contract, type, ME, TE, runs a
  copy, copies, price, issuer, expires in seconds, item IDs]`. Each contract of the kept set that is gone from the new snapshot,
  wasn't past its expiry at the new snapshot's time, and none of whose copies came back in a contract by the same seller,
  vanished before expiry (sold, most likely; a seller cancelling looks the same) and goes in `copy_sold` at the new
  snapshot's time, kept eight days (`COPY_KEEP_DAYS`; the summary counts seven, `COPY_WINDOW_DAYS`). Back under another seller,
  it was bought and relisted: a sale.
  - **Six-hourly reads, because days apart miss most sales** (correction 2): 327 contracts vanished from 00:00 to 06:00 UTC and
    430 from 06:00 to 12:00 on 11 October, where the research's reads days apart counted about 320 a day (2,683 over 2 to 6
    October): a contract listed and sold between two reads is never seen. The fixture (`scripts/fixtures/copy-snapshots.json`,
    the three snapshots' contracts holding five types) shows it: 16 sold then 12, of which 4 were listed after 00:00, so
    comparing 00:00 with 12:00 counts 25, not 28.
  - **A reprice is told by every copy in the new snapshot's item exchanges** (correction 5), not only the kept set: a seller
    moving a copy into a bundle (with other items, which the comparables leave out) repriced it. The reader notes every copy's
    seller as it streams (`copyIssuers`; 49,531 copies at 12:00, 7,656 of them in contracts the comparables leave out); the tests'
    snapshots, without it, use `itemIssuers` over the blueprint contracts.
  - **Your own contracts are no one's market** (correction 6): what sold and the asks leave out every character whose login the
    cloud holds and every alt on a roster, removed ones too (`ownCharacters`); their rows stay in `copy_sold`.
  - **The summary is worked out once a round** (correction 4): `scan_meta` 'copySummary' (each kind sold in the window: contracts,
    copies, sellers, the median price a run; the asks now per kind: cheapest, median, contracts, sellers; days counted, reads, the
    longest span between two reads) beside the round's own state, 'copies' (when it last tried and read, its error, `stale`, each
    comparison's span). So `GET /v1/copies` never parses a megabyte. What sold, what came back, the set, the summary and the state
    go in one `batch`, one transaction: a round whose write fails leaves the last round's all as it was.
  - **When it reads**: due when its last good read is 5½ hours old (six less Goonmetrics' half-hour slack for the alts' read ahead
    of it) and its last try at least 50 minutes old, so a failed or unmoved read is tried again the next hour, never twice an hour;
    nothing starts 12 minutes past the cron's time (`COPIES_BUDGET_MS`: Goonmetrics may run to 10, the invocation stops at 15).
  - **A round that can't compare writes no sale** (Review Focus 1): the first read only keeps the set (the Copies section says
    counting has begun), so **the first `37` round after a deploy counts nothing and the next, six hours on, is the first to
    count**; a snapshot no newer than the kept one (EVE Ref stalled) is `stale`, not an error, and tried again the next hour; a
    failed read keeps the set and what sold and says why; a kept set more than seven days older than the new snapshot is replaced
    without comparing (a week of sales on one day is no pace).
  - **A snapshot that isn't whole is refused, never compared** (the review of Task 14A). The first `ContractSink` stopped at the
    archive's end and answered the snapshot's time with no contracts, whatever was missing, and the round compared it: an empty
    06:00 read counted all 96 kept contracts as sold and replaced the set with none, and the whole 12:00 snapshot then took 67
    back and left 29 where whole snapshots give 28 (5 reprices under new IDs kept as sales, 4 real sales missed). Now the reader
    refuses an archive lacking meta, contracts or items, a stream cut short (`result()` throws), an empty CSV, and a header
    without a column it reads or with one past the 40 it splits ("EVE Ref’s contracts.csv has no issuer_id column"); the
    Blueprints route then errors rather than answering empty. And the round refuses a snapshot with no copy contracts, always,
    and one under half the kept set (the 11 October sets held 11,402 to 11,432) **only while it would be compared**: a kept set
    over seven days old is replaced as before, never refused. A refusal says so ("under half the kept set (11,402): a snapshot cut
    short, or the market changed; nothing compared (2 of 6 in a row)"), keeps the set and what sold as they are, writes no sale
    and tries again the next hour; the next whole snapshot is compared with the set kept (the fixture's 00:00 against 12:00: 25,
    the six-hourly count's 28 less what the skipped read would have seen).
  - **Six in a row under half the kept set and the newest is kept** (`COPIES_RESET_AFTER`, the re-review's ruling): refused for
    good, a market that really fell would never be read again. Each refusal is counted in the state (`halved`, with the
    snapshot's time, so the same file refused twice counts once); the sixth different snapshot in a row is kept as the set
    without counting a sale from it (no comparison, no read span), and the state and the route carry `note`: "The copy contracts
    fell under half the kept set six times running: kept the new set without counting sales from it", until the next read. A
    contract of `copy_sold` back in it is still taken out (it never left). The hours from the old set to the new count no sales
    but sit inside the summary's days, so a kind's pace reads low by that share until they leave the week.
  - **A partial snapshot is undone by the next** (correction 20): a page EVE Ref's scraper missed makes its contracts look sold; a
    contract in `copy_sold` that is back in a newer snapshot never left, and is taken out (`back`). Tested with one contract
    missing from the 06:00 snapshot: 17 counted, then 28, as with whole snapshots.
  - **A round the cloud stops leaves a trace** (correction 21): before it reads, the round stamps its try `INTERRUPTED`; every way
    it ends writes over that, so only a round stopped by memory or the wall limit (no `catch` sees those) leaves it, and the next
    try then waits the full six hours, not the hour. Anything that throws after the read (a write D1 refuses, a kept row that
    won't parse) is stamped with its own error and tried again the next hour (the plan's code caught only the fetch, which would
    have left such a round reading "interrupted" with the six hours' wait); the prune after the batch stays outside that catch, so
    a failed prune can't stamp the last round's state over the one the batch wrote. The fetch gives up after 90 s
    (`READ_TIMEOUT_MS`; the 6.6 MB file came in seconds).
  - **D1's cost**: about 375 inserts and 375 prunes a round, each written twice with the `copy_sold_at` index, and the set's rows
    and the state: about 1,500 row writes a round, 6,000 a day, 180,000 a month, under 0.4% of the plan's 50 M. A round that
    read the same snapshot writes only its state.
  - **EVE Ref unchanged is a 304, not a download** (the review of Task 14A): the round keeps the ETag of the newest file it read
    that wasn't newer than the kept set and, while a set is kept, sends it as `If-None-Match`; a 304 is the same as reading the
    same snapshot (`stale`, tried again the next hour), with nothing downloaded and nothing written but the state. The Blueprints
    route sends none.
  - **`GET /v1/copies` before a set is kept** answers `{ tried, error }` once a round has tried (a failed first read, or one the
    cloud stopped: `INTERRUPTED`), so the tab can say why; `null` only when no round has tried. A summary always carries `at` and
    this never does: Task 14B's `CopiesAnswer` and `useCopyMarket` have to tell them apart (the plan's version maps every answer
    that isn't null or `off` to a summary). A summary's answer also carries `note` (null, or the reset above).
  - **`COPIES_ON`** (copies.ts) switches it off; the route then answers `{ off: true }`. EVE Ref is someone else's site: one file
    every six hours, the Blueprints route's User-Agent naming the project only, not a watched job (the section says how old its
    read is).
- **The snapshot is read as it decompresses** (correction 19; `ContractSink` in `bpContracts.ts`, `readSnapshot` in
  `worker/src/blueprints.ts`, shared with the Blueprints route). The old reader kept the snapshot's contracts and items files whole
  (39 MB of CSV on 11 October) and parsed them after; `ContractSink` splits each CSV line where it lies as the bzip2 decoder
  writes the tar, keeps only the region's public, priced item exchanges whose items are all blueprints given (dropping a contract
  the moment an item says otherwise), notes every copy's seller, and stops once meta, contracts and items are in (EVE Ref's
  order; items before contracts are refused, never read wrong; a line short of fields reads them empty, as from whole files,
  never the bytes the line before left in the buffer). The decoder now reuses its 3.6 MB block buffer (every entry is
  written before it is read), which was most of the garbage. **Measured in Node 24.18 on the real snapshots**
  (`.playwright-mcp/research/industry-stage3-scripts/measure-memory.mjs`, heap plus ArrayBuffers sampled every MB decoded; the
  bar 60 MB for the reader, and the round completing under a 48 MB old space):
  - `reader: 15235 contracts, 46204 items, 49531 copies' sellers; 2341 ms; peak 29.0 MB above 9.0; held after GC 13.9 MB` (12:00;
    29.4 and 29.5 MB on 06:00 and 00:00; 28.8 to 29.5 over repeated runs);
  - `round: {"done":"read","contracts":11402,"sold":327,"parts":4}; 2500 ms` under `--max-old-space-size=48` (00:00 then 06:00;
    06:00 then 12:00 sold 430). Its "peak above" figure is GC timing, not a measure (the base holds the first round's garbage,
    so it reads below zero): with that collected first, the round allocates 52 to 54 MB before collection and holds under 3 MB
    after, and it completes in a 32 MB old space with 1 MB semi-spaces, not in 24;
  - the old reader in the same measure: 119 to 136 MB (the plan's own measure 113 MB, the pre-flight's 122), 83 to 100 MB with
    the block buffer reused. The decoder's working arrays aren't sampled between its writes, so this is the app's measure, not a
    proof; the Worker's first real round (`wrangler tail`'s `copies` line, `scan_meta`) is the rest.
  - **The measure is that sensitive to the hot path**: making a line short of fields read empty by an early `return [0, 0]` in
    `range` (a second fresh array from a function called for every field) took the reader's peak from 29 MB to 41.6 MB, held
    after GC unchanged at 13.9: garbage V8 no longer optimised away. Clearing the stale field bounds in `split` instead kept 29.
    Measure again after any change to `ContractSink`.
  - **The Blueprints route's answer is unchanged**: on the 00:00 and 12:00 snapshots, `ContractSink` from the `.tar.bz2` gave the
    same contracts in the same order as `blueprintContracts` on the unpacked files (every type at the snapshot's time, a day
    later, the five fixture types, and Domain); `npm run check` pins it on a synthetic tar.
- **The first real reads after stage 3 shipped** (read from D1 with SELECTs only, 13 October 2026 at 19:47 UTC): a copy round every six
  hours since 12 October 09:37 UTC, none failed, none refused a snapshot, no reset. The five comparisons counted 282, 324,
  159, 212 and 350 sold (1,327 rows in `copy_sold`), against 327 and 430 in the two six-hour spans measured on 11 October. The kept set
  was 4 rows (`COPY_PART`), 1,052,451 bytes; the summary 160,103 bytes.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Copies "sold" are contracts that vanished before expiry** (the cloud's copy round, industry-copy-round.md stage 3): a seller cancelling
  looks the same, and so does a copy taken back and relisted only after the next read (none of the 327 that vanished from 00:00
  to 06:00 on 11 October came back by the same seller at 12:00). **Read every six hours, so a copy listed and sold within a
  read's span is missed** (the Sold column says so; the summary gives the longest span). **A contract missing from one snapshot**
  (EVE Ref's scraper missed a page) counts as sold until the next whole snapshot shows it again, then is taken out, so a figure
  can drop by it six hours later; a snapshot under half the kept set is refused instead, and the read after it spans twelve hours.
  **Six such snapshots in a row and the newest is kept without counting a sale**: the hours since the old set count no sales but
  sit inside the summary's days, so a kind's pace reads low by that share until they leave the week (the route's `note` says when
  it happened). Public contracts of The Forge only: Brave's corporation and alliance contracts aren't visible.
