# Finding trades: the Sniper, Multibuy and blueprint contracts

Split from finding-trades.md on 19 October 2026. Decisions worth not undoing. The Sniper's mistake listings and high
bids, the snipes found in your wallet, blueprints left out, Multibuy copies, and blueprints priced against The Forge's
contracts.

- **The Sniper finds mistake listings from the whole book, and doubts before it trusts** (`lib/snipe.ts` pure,
  `worker/src/snipe.ts`, cron `1-59/5`). The user buys fat-fingered listings by hand and relists them; this looks
  for them. ESI refreshes The Forge's book at about :x0:30 and :x5:30, so the sniper runs a minute after (reading a
  book ~30 s old, not the ~4.5-minute-old one the */5 round sees), skips when `Expires` says nothing changed, keeps
  each item's cheapest 30 Jita sells and best Jita bid, and judges only items whose cheap end has a gap that pays at
  the best rates (3,565 of ~15,000 on the first read) against the daily scan's stats. Resale is one step under the
  next listing, never above `reachedAsk`: thin books list far above anything that sells. **Researched on the live
  book before building** (28 September 2026, 00:26 EVE): 196 listings 5%+ under where their item trades after fees,
  61 worth 1 M+; the biggest on paper were floods, not mistakes (seven R.A.M. blueprints at exactly 296,000/382,000
  against 600k–1M history, 11–20 days of trading, days old), so `doubts` sets aside a flood (> 3 days of the item's
  trading), a price that just moved, a thin history (< 7 of 30 days), a listing priced > 24 h ago, and several sellers
  at the cheap end; doubted ones are shown, never mailed. Persistence, same night: of 31 priced within the hour, 10
  were gone 20 minutes later, 3 of the 4 worth 1 M+ were not, so five minutes is fast enough to matter; region-range
  bids elsewhere in The Forge paying more than Jita's cheapest ask: 0 of 7,516, not pursued. A Jita bid above the
  cheapest Jita ask can't persist (it matches), so the bid side is only "a bid well over where it trades, for what
  you hold in Jita" (`judgeBids`, `min_volume` honoured), and `/v1/snipes` returns bids only for the caller's items.
  The bar (default 10% and 5 M after fees, the user's choice) lives in the alert settings (`snipeMinIsk`,
  `snipeMinPct`) and drives both the page and the mail; alert kind `snipe` ("Mistake listing") is mailed by default,
  through `mailFindings`, which the alert round now shares. **High bids for what you hold are their own kind** since 13
  October 2026 (`highBid`, "High bid for what you hold", mailed by default too, a config from before taking Mistake
  listing's switches), **remembered by item, not by bid**: keyed by the bid's order and price, a bid war mailed the user
  every five minutes, and nothing named bids to turn off (orders-alerts.md). "Priced" is ESI's `issued`, which a price
  change moves.
  **Snipes you take are found in your wallet** (`lib/sniped.ts`): a purchase from a listing in Jita (the escrow
  fact above) at 5%+ under where the item had traded in the 14 days before, after your fees then; buys of one item
  within 30 minutes are one snipe; the cloud's sightings (`snipe_seen`, 30 days) mark which the Sniper found. Each
  item is followed by its **own units only** (`followSnipe`): the first sold after the snipe count as its own, sales
  beyond them show as "+N you already had", listing fees are those of sell orders placed after the snipe shared by
  units, and sales tax is what was matched to each sale. It first used `computePosition` on a virtual position, which
  follows every trade of the item: the user's C-IR Compact Guidance Disruptor read "10 of 3 sold" (7 were loot they
  already had) and those 7 were costed at the snipe's price, crediting it with their profit. So the real fees count: the user's first Sniper relist
  was fat-fingered at 1,893,000 instead of 1,893 on 19,489 units, a ~468 M broker fee on a 20 M snipe, and "Your
  snipes" shows that as it is. The Relist at price has a copy button so the price is pasted, not typed.
  **"In the end" is profit, and says what comes back** (29 September 2026). The user read "ISK put in 1.25 B" beside
  "In the end +255.56 M" as getting 255 M back ("there is no way that I am going to get that little back") and
  suspected the refunded fat-finger fee. Recomputed from their ledger outside the page, every figure matched (1.25 B,
  +291.05 M, +83.58 M, +255.56 M) and the Uranium Charge's listing fees were 595 k, not 468 M. So the tiles now say
  Paid for them, Profit so far and Profit in the end, the last with "About 1.51 B back for the 1.25 B". **Not a snipe**
  (the synced `notSnipes` doc of trade IDs, `instantBuys`' fourth argument): a purchase bought cheap but not as a snipe
  (to use, or for a job) leaves Your snipes and List loot's snipes kind, beside its name, with "It was a snipe" under
  Not snipes to put it back. Cost-of-stock still reads it as bought from a listing (orderCheck passes no list).
  **Bought in one go with other items is never a snipe** (`notSnipeIds`, the Wallet's `multibuys` rule: 3+ purchases of
  2+ items, each within 2 s of the last). The user marked five not snipes and asked whether they were fitting buys: two
  were (a 1MN Y-S8 Compact Afterburner and a Salvager I, bought with 8 other items across 23:08:04–05 on 28 September and
  now inside a ship); the others were a SKIN (activated, so never held), a guidance disruptor and some Scorch L, each
  bought alone, which no rule can tell from a snipe. On their ledger the rule also took out a Warp Core Stabilizer II
  bought with five other items (8.67 M), and nothing else: none of the 15 real snipes had another item within minutes.
  **Nor is anything now fitted to one of your ships** (`notFitted`, the stock record's `fitted`: units in a high, mid,
  low, rig, subsystem or service slot of any ship you own, charges loaded in guns included). The user's rule: "if an item
  is fit to a ship either quickly or later then it wasn't a snipe". It takes as many fitted as the snipe bought, so a
  module you already flew and then sniped more of to sell, or a few charges loaded from a big ammo snipe, don't clear it.
  Assets are read hourly by the cloud and on each sync, so a fit shows within the hour.
- **The Sniper leaves blueprints out unless asked** (`splitBlueprints`, `BLUEPRINT_CATEGORY` in snipe.ts; `snipeBlueprints` in
  the alert settings, default off, only `true` lets them in; `worker/src/kinds.ts`, migration 0017 `type_kinds`). The user,
  2 October 2026: "i think for the sniper we should exclude blueprints, as they might be risky to try and sell". Evidence: of
  1,222 sightings since 28 September, 59 were blueprints, 41% of them floods against 9% of the rest, 11 clean; on 1 October
  at 23:27 UTC both finds clearing the user's bar were blueprints (an Epithal and a Thrasher Blueprint), and on 2 October
  at 09:46 26 of 89 listings were. A blueprint is ESI category 9, never a name (a reaction formula is one without the
  word); the cloud looks each listing's type up once (type → group → category) and keeps it, a type ESI didn't answer is
  `null` and held back until known, and a browser on a read without categories looks each up itself (`typeKind`). The mail
  splits before picking its eight, so hidden blueprints can't take their places. "Include blueprints (N)" says how many
  clear the bar and are left out. Hidden blueprints are still recorded as sightings, so the daily "checked against what
  traded after" counts them. **High bids for blueprints you hold follow the switch too** (approved by the user on 2
  October 2026 with the other two choices; they had shown, since selling into a bid is paid at once): the cloud looks up
  each kept bid's category with the listings' (`categoriesOf` on both), the mail splits them the same way, and a browser on
  a read without bid categories looks each held one up and holds it back meanwhile. The switch's count and the "clear
  your bar too, left out" line cover both, each counted apart when there are both (`blueprintsSaid`: "2 blueprint
  listings and 2 high bids for blueprints you hold"), and the held-bids panel says how many it hides, never "no bid"
  alone. Measured on the read of 15:06 UTC and the user's hangar (12 types, no blueprint): 1 held-bid row (a Jackdaw),
  none a blueprint; the reads of 1 October 23:27 and 2 October 09:46 had 0 and 1 (the same Jackdaw). So the evidence is
  the tests' (a Thrasher and a Caracal Blueprint, invented), not the user's own.
- **Multibuy lists where buying at the ask is the point** (`copyMultibuy` in common.tsx, `multibuy` in combat.ts): each
  Freelance job copies what to buy for it (every item under the reward, per item), and Hub arbitrage copies the shipment
  when buying from sell orders now (not for a buy order, which Multibuy can't place). The Sniper too, since the user
  authorized it on 2 October 2026 ("Also I am authorizing adding multibuy to the sniper"; it had been left out because they
  wanted to be deliberately careful there): per find (the cart beside its listed units: the Actions column pushed the table
  past its width at 1,440 px) and "Copy all N" for what's shown, the cheap units only, saying the exact total at the
  listings read and how long ago, the dearest cheap price and the next listing up, so a window total over it means a
  listing has gone. Finds bought together that way are 3+ purchases of 2+ items within 2 s, the Wallet's multibuy rule,
  so `notSnipeIds` keeps a burst purchase the Sniper had shown (`sighted`: its item, a price in the sighting's range,
  within 10 minutes) as a snipe; a fitting's Buy All still isn't. Your snipes asks the cloud about sightings only for items
  bought from a listing within the window a kept sighting can still match (`SIGHTING_WINDOW_MS`: an order's 90 days, the
  sightings' 30, 10 minutes), since its route returns at most 500. Multibuy buys from the cheapest listings at once with no price limit,
  so every copy says what it came to at the listings just read, to check against the window's total before Buy. Lines
  are "Name N", the format the import's own tooltip gives ("Veldspar 4" / "4 Veldspar", the user's client, 29 September
  2026); they were "Name xN", which the tooltip doesn't list. A name still loading ("Item #123") refuses the copy rather
  than hand the game a line it can't match.
- **Blueprints are priced against The Forge's blueprint contracts, on demand** (`Blueprints.tsx`, `lib/blueprints.ts`,
  `lib/bpContracts.ts`, `worker/src/blueprints.ts`, `worker/src/vendor/bunzip.ts`). The user collected blueprints in
  containers and deleted or forgot them because pricing them in game meant sifting too much data; they wanted it on a
  button, not a live scanner. ESI's contract list doesn't say what a contract holds (~20,000 item calls for The Forge),
  so the cloud fetches EVE Ref's public snapshot (every region's public contracts from ESI, items with ME/TE/runs,
  twice an hour, 6.2 MB tar.bz2; their server sends no CORS header, so the browser can't) and the one nearest three
  days ago, unpacks each with an adapted seek-bzip (MIT, Uint8Array instead of Node's Buffer) into a `TarSink` that
  keeps only the contracts and items files in buffers of exact size and stops there (the first try, one growing buffer
  for all 58 MB, peaked near 320 MB against the Worker's 128), and returns the contracts selling only blueprints that
  hold the kinds asked about, plus those that vanished before expiry (`vanishedSince`: a relist by the same seller is
  a reprice and left out). Measured: 1.2 s to unpack, 0.65 s to parse, ~7 s for both snapshots end to end; 15,190
  Forge blueprint-only contracts; 2,768 vanished in three days. Each kind you hold (item, copy or original, ME, TE,
  runs) is set against the same kind's asks (a copy's other runs scaled by runs^0.79: 10 runs asked ~6.1× one), and
  lists at what sold (two or more, never over the middle ask) or else the cheapest quarter of asks. **An unused
  original is priced by the market** (`unusedPrice`): the first check put three unused Raven Blueprints at 3.2 B each
  against researched originals, when NPCs sell them at ~1.13 B. The cheapest comparable opens in game
  (`/ui/openwindow/contract`), flagged when its title claims what its item isn't (EVE University: never trust a title).
  Blueprint pictures are `images.evetech.net/types/{id}/bp` or `/bpc`; `/icon` answers 400 for them.
  **The snapshot reader is shared with the cloud's copy round and filters as it decompresses** (`readSnapshot` in
  `worker/src/blueprints.ts`, `ContractSink` in `bpContracts.ts`, industry stage 3, 11 October 2026): the contracts and items
  files (39 MB of CSV by then) are no longer held whole; each line is split where it lies and only the region's blueprint-only
  contracts are kept, with a 90 s fetch timeout. A snapshot lacking one of its three files, cut short, or whose header lacks a
  column the reader reads is refused, so the route errors rather than answering empty. The route's answer is otherwise
  unchanged: `npm run check` tests the stream equal to `blueprintContracts` from whole files, and on two real snapshots it gave
  the same contracts in the same order (industry-copy-round.md: the reader peaks at 29 MB of heap and ArrayBuffers where the whole files
  peaked at 113 MB and more).

## Limits

Moved to positions-results-wallet.md, with the Wallet's limits: a Sniper "Copy all" with a ship in it guessed Personal.
