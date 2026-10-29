# HyperNet Trader: design

28 October 2026. A new Side hustles tab, **HyperNet**: price an item for the HyperNet Relay so the host never loses ISK when
someone else wins, and keep a record of every offer the main hosts.

## Why (the user's words)

"I know there is a practise where you put up an item in the hypernet but you take almost half the slots. You still make a
profit if it buys out and you don't get the item and you make extra profit if it buys out and you land the item therefor you
can do it again. I need a tool that can tell me if I pick an item and buy it off the market and the hypercores off the market
what I should price it as etc so I still make a profit if someone else wins. Of course the price should be reasonable or a
bargain enough so people actually buy tickets."

Then: both strategies, **never lose money when someone else wins** first and **ahead on average** second; they start with
Large Skill Injectors ("very popular and not too crazy expensive to commit to"); the pot is what they decide first ("the
ticket price must be affordable enough for people to want to click"); they liked the outcome table and "risking only around 19
mill if it expires"; of the two mockups the **table** reads easiest at a glance; **tracking in the first version**; **main
only** for now; **no phone design** (tokens); "just complete this feature to the best you think".

## The rules it rests on

Research: `.playwright-mcp/research/hypernet-host/report.md` (sources in `sources/`), E exact / R reported / I inferred.

- Host pays HyperCores (type 52568) at creation, never refunded (E). Count ≈ `max(1, floor(pot / (2 × PLEX price)))` (I, fitted
  on three player measurements 2019–2025); 5% of the pot at the store's 0.1 PLEX a core, ~1.7% at today's market (I).
- Relay fee 5% of the pot, taken from the payout only on completion (E). Payout = every node sold, the host's own included, less 5%.
- Host may buy own nodes, no cap known (R). Node counts 8, 16, 48, 512 (R). 3 days, can't be cancelled (E). Expiry: every buyer
  refunded, item back to the host, cores lost, no fee (E). NPC stations only, one repackaged item (E).
- What sells: pot ~1.45–1.55× market, about one expiry per sale (R, one high-volume host, Oct 2025).
- ESI: no offer route (E). Notifications `RaffleCreated`, `RaffleFinished`, `RaffleExpired` carry `typeID`, `ticket_count`,
  `ticket_price`, `location_id` (R, SeAT's code); journal `flux_ticket_sale` (143), `flux_payout` (144), `flux_tax` (145),
  `flux_ticket_repayment` (146) (E). Never seen on a real answer here: the notifications' text, whether one names the winner,
  whether `flux_payout` is gross or net of `flux_tax`.

## The maths (pure, `src/lib/hypernet.ts`)

V the item's cost, T the pot (total of all nodes), N nodes, k the host's nodes, C the cores' ISK, f = 0.05:
- someone else wins: `(1 − f)·T − C − (k/N)·T − V`
- the host wins: `(1 − f)·T − C − (k/N)·T`, and the item is kept (to list again)
- expires: `−C`
- never lose when another wins ⇔ k ≤ the largest whole k with `(1 − f − k/N)·T ≥ V + C`, at most N − 1; none (−) when even k = 0 loses.
- on average, given a sell-out chance s: `s·[(k/N)·win + (1 − k/N)·other] + (1 − s)·(−C)`. Every node kept lowers the average
  (the average is linear in k, falling by s·(T − V)/N a node when T > V); keeping nodes buys only a better chance of selling out. Say so on the page.
- Node price `T / N` exactly; the game's own rounding isn't known, so the copied node price is T/N to the ISK, rounded up to a
  whole ISK, and the outcomes use (node price × N) as T.

Cores: count estimated by the formula from PLEX's lowest sell on the Global PLEX Market (`usePlexPrice`), priced at Jita 4-4's
cheapest HyperCore listing; the count is editable (a box: "the count the game's window shows"), and the estimate is said as one.

## The tab

`hustles/hypernet` (Side hustles' eighth tab, label "HyperNet", blurb "Host an offer that pays even when someone else wins").
Sections in the address like Industry's if it helps; else one page, Calculator then Your offers.

**Calculator** (the user chose the table):
- Item: the app's item search; quick picks for Large Skill Injector (40520) and the items of the main's past offers.
- You pay: Jita 4-4's cheapest sell from others (the live book, every character's own orders off it), editable ("or what it cost
  you"); "Pricing…" while read; "–" with why when no listing.
- Pot: presets 1.3×, 1.4×, 1.5× (default; the reported norm), 1.6× of what you pay, or typed in ISK. Say the pot against the item's
  Jita price ("1.50× Jita's cheapest listing").
- HyperCores: count (estimated, editable) × price = ISK, "lost if it expires".
- **The table**, a row per node count (8, 16, 48, 512): node price, keep at most (never losing), your chance (k/N), someone else
  wins, you win (+ "and the item back"), expires; red for a loss, green for a gain. A row that can't be made safe at any k says
  "No share is safe at this pot: raise it to X" (the pot where k = 0 breaks even).
- A row opens: choose how many to keep (0 … N − 1; the safe maximum marked), the three outcomes at that choice, **Copy node price**
  (copies plain digits for the game's window, as Orders copies prices), and the on-average line.
- **On average**: sell-out chance box (default 50%, "about one offer in two sells out, one high-volume host reported in October
  2025"; once the main has 5+ finished offers in its record, its own rate, said as such and used as the default).
- Lead and points in the app's style (app-conventions: a lead line and three or four points; tips for the detail). Points: fees
  (cores at creation, 5% on completion), 3 days and no cancelling, own nodes don't change buyers' odds, keeping nodes lowers the
  average and only helps it sell out.

**Your offers** (the record): one row per offer the main hosted, newest first: item, nodes × node price (pot), created, state
(open: ends in X; sold out; expired; "not known yet" while neither notice nor payout seen past 3 days), your nodes, who won,
result. Tiles over it: offers, sold out of finished (the sell-out rate), result in all (only offers whose result is known; count
the rest, never a part-sum shown as whole).

## Tracking (main only)

**Records of kind `raffles`**, by notification ID, immutable (`RaffleRecord`: id, type, timestamp, the parsed fields typeId,
ticketCount, ticketPrice, locationId, and the raw text). New record kind: `RECORD_KINDS` in worker/src/sync.ts, store.ts' Data,
cloudSync (as `jobs` joined: `refusedKind` holds them back from a Worker a version behind; an older browser ignores the kind).
Written by:
- **the cloud's hourly archive** (`worker/src/archive.ts`, the main only, with the notifications permission): read
  `/characters/{id}/notifications/`, keep `Raffle*`, push only IDs not held. Its own try/catch; a failure logs and doesn't fail
  the archive.
- **the browser's sync**: notifications are read on every sync while the permission is held (one request a sync, ~20 minutes
  apart, of a rate group allowing 15 a quarter hour), not only while a wrap waits or an agent runs; the wrap and mission readings
  are kept as before, only when their conditions hold.

**An offer** (`offersOf(raffles, journal, txs, now)`, pure): each `RaffleCreated` is one offer. Its end is the first
`RaffleFinished` / `RaffleExpired` after it, **within 3 days + 1 hour of creation** (added after the review of 29 October 2026:
without the bound an offer with no end notice took a later identical offer's), with the same typeId, ticketCount, ticketPrice and
locationId (and a raffle ID if the text carries one); else, a `flux_payout` within 3 days + 1 hour of creation whose amount is the pot or 95% of it (within 1 ISK)
marks it sold out; else your own nodes refunded in the hour after its 3 days mark it expired. **Own nodes**: `flux_ticket_sale` entries of exactly −ticketPrice (to the cent, rounded) from 5 minutes before
creation to its end (or creation + 3 days + 1 hour while open). **Refunds**: `flux_ticket_repayment` of +ticketPrice in the hour
after an expiry. **Payout / fee**: `flux_payout` and `flux_tax` matched by amount (pot, 95% pot, 5% pot) within a day of the end.
**The item's cost**: the main's newest Jita purchase of that type in the 30 days before creation (unit price); not found → "–",
"no purchase of it found in the 30 days before". **Cores**: the estimate at creation (formula on PLEX then is not known: use
the count the pot gives at today's PLEX, said as an estimate) × the main's average HyperCore purchase price (its buys of 52568,
newest first), else Jita's cheapest now; said.
**Who won** (not in ESI as far as known): parsed from the notification text if any key names a winner (record the raw text; a
key containing `winner`); else the user marks it on the row ("You won it" / "Someone else won"), kept in `prefs.hypernet.won`
(by offer ID; sanitized; an older build's save drops it, as every late pref). Until then the row shows both results.
**Result**: payout − fee (if separate) − own nodes + refunds − cores − (someone else won ? item cost : 0).

**Not known is never 0** (app-conventions): every figure that can't be worked out says why.

## The Wallet

A Business line **"HyperNet hosting"** (both sides, decided before the in/out split, as HyperNet tickets are): `flux_payout`,
`flux_tax`, and the `flux_ticket_sale` / `flux_ticket_repayment` entries `offersOf` attributes to the main's own offers.
`categoryOf` / `flows` take an optional set of those entry IDs (`hosted`); without it they answer as before. Tickets in others'
offers stay "HyperNet tickets", play. `npm run check-income` must pass unchanged (the recorded ledgers hold no flux entries).
Results / All income don't count hosting in this version (a limit to state).

## Out of scope

Alts hosting; phone layout (`check-phone` stays as the deploy's; exclude the tab from it if it trips); a HyperNet market
tracker (no data exists); alerts or mail; To do items (a later idea: "your offer expired: relist?").

## Tests

check.mjs: the outcome maths (the Large Skill Injector worked figures: 735.6 M, 1.5×, 110 cores at 170,000, 8 nodes keep 2 →
+18.08 M / +753.68 M / −18.7 M; 512 nodes keep 136 → +0.84 M), the safe-k rule at its edge, the on-average formula, notification
parsing (YAML-ish text with and without a winner key, junk), `offersOf` on a synthetic journal (sold out with own nodes, expired
with refunds, open, payout gross and net, a ticket in someone else's offer at another price not counted), the Wallet's hosting
line with and without `hosted`. check-worker.mjs: the archive pushes new `raffles` only, nothing for a login without the
permission, a failed read leaves the archive ok. pages.mjs: the tab draws on the three ledgers; a case with seeded raffles and
journal asserts the table's figures and the record's rows.

## Notes

A new note `docs/notes/hypernet.md` with `paths:` frontmatter and a rule symlink (CLAUDE.md "Notes by topic"); eve-facts gets the
host's facts; CLAUDE.md's page list gains HyperNet, and the Worker's imported modules list `hypernet` if archive imports it.
