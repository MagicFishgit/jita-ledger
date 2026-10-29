---
paths:
  - "src/lib/hypernet.ts"
  - "src/components/hustles/HyperNet.tsx"
  - "src/lib/noticeText.ts"
---

# HyperNet: hosting an offer

Decisions worth not undoing. The HyperNet tab under Side hustles (`hustles/hypernet`): price an item for the HyperNet Relay so
the host never loses ISK when someone else wins, and keep a record of every offer the main hosts. The user (28 October 2026): "I
need a tool that can tell me if I pick an item and buy it off the market and the hypercores off the market what I should price
it as etc so I still make a profit if someone else wins. Of course the price should be reasonable or a bargain enough so people
actually buy tickets." Never lose when someone else wins first, ahead on average second; Large Skill Injectors to start ("very
popular and not too crazy expensive to commit to"); the pot decided first; of two mockups the **table** read easiest; tracking
in the first version; the main only; no phone design. Design `docs/superpowers/specs/2026-10-28-hypernet-trader-design.md`,
research `.playwright-mcp/research/hypernet-host/report.md` (gitignored; E exact, R reported, I inferred). A ticket bought in
someone else's offer is play (positions-results-wallet.md); this note is the host's side.

- **The rules** (hypernet.ts, from the research): HyperCores (52568) paid at creation, never refunded (E); the relay's 5% of the
  pot taken from the payout only when every node sells (E); the payout is every node sold, the host's own included, so each node
  kept costs its price less the 5% that comes back (I from E); the host may buy its own nodes, no cap known (R); node counts 8,
  16, 48, 512 (R); 3 days, no cancelling, on expiry every buyer refunded and the item back (E). **The core count is fitted, not
  CCP's**: `max(1, floor(pot / (2 × PLEX)))`, three players' measurements 2019 to 2025 (I); the calculator says it's an
  estimate and takes the count the game's window shows. What sells: a pot of about 1.45–1.55× market (R, one high-volume host,
  October 2025), so 1.5× is the default preset, and about one offer in two sells out (the same host), the default chance.
- **The maths** (`outcomes`, `safeKeep`, `safePot`, `average`, `tableRows`): V the item, T the pot, N nodes, k kept, C the
  cores: someone else wins `0.95T − C − (k/N)T − V`; you win the same without V, and the item comes back; expires `−C`. Keep at
  most is the largest k with someone else winning not a loss (a loss under half a cent is none), at most N − 1; none safe gives
  "raise it to X", the least pot (a whole node price × N) where keeping none breaks even, the cores counted again at each pot
  tried when they're the estimate (`scale`). Node price is T/N rounded up to a whole ISK, and every figure is worked out on that
  × N. The design's worked case is pinned in check.mjs and the page check: 735.6 M, 1.5×, 110 cores at 170,000, 8 nodes keep 2,
  +18.08 M / +753.68 M / −18.7 M; 512 nodes keep 136, +0.84 M.
- **On average falls with every node kept** (`average`, linear in k, by `s × (T − V) / N` a node while T > V): keeping nodes
  only buys a better chance of selling out, and the page says so, in its points and the average's tip.
- **The tab** (HyperNet.tsx): a lead and four points (fees, 3 days, own nodes don't change buyers' odds, every node kept lowers
  the average), then the calculator, then Your offers.
  - **You pay** is others' cheapest Jita 4-4 listing (the live book, `jitaOrders`, the main's own orders off it), editable,
    "Pricing…" while read, why when it can't be. **The alts' orders aren't taken off** (the design says every character's):
    reading them needs the alt store, whose importers are a fixed list (characters.md), and the tab is the main's.
  - **The pot** is 1.3×, 1.4×, 1.5× (default) or 1.6× what you pay, or typed in ISK, always said against Jita's cheapest.
  - **HyperCores**: the estimate at PLEX's lowest sell (`usePlexPrice`), editable, × Jita's cheapest HyperCore listing, "lost if
    it expires". A typed count isn't rescaled for "raise it to".
  - **The table**, a row per node count: node price (with its pot), keep at most, your chance, someone else wins, you win ("and
    the item back"), expires, green and red. A row opens (`tr.click`) to a keep slider 0…N−1 starting at the safe most (said when
    over it), the three outcomes and the average as tiles, **Copy node price** (plain digits, a 2.5 s toast), and the sell-out
    chance: typed (kept in `prefs.hypernet.sellOut`, "Forget it" drops it), else the main's own rate once `OWN_RATE_MIN` (5)
    offers finished, else the report, each said with its source.
  - **Keeping none, there's no winning it back** (`outcomes`' `win` is null at k = 0): the user (29 October 2026), slider at 0,
    "it still says I am going to make a profit as if I am winning the item back even though I have no chance at winning it".
    The table's You win cell and the row's tile say "you hold no node" / "you can't" instead of a figure; the average counts
    only someone else winning. Likewise in the record: a sold-out offer with none of your nodes is someone else's win
    (`wonFrom: 'noNodes'`), with no "if you did".
  - **You pay and the HyperCores' price aren't read again on every sync** (`useCheapest`): only your own orders *of that item*
    are taken off the book, so an order of another item arriving doesn't re-read it, and a re-read keeps the price shown until
    the new one lands. It used to drop to "Pricing…" on every change of the main's order IDs, unmounting the table and the keep
    chosen in an opened row; and after one Try again every later read skipped the cache. Only Try again reads fresh now.
  - The item and its Jita price are kept per browser (`jita-ledger:hypernet-item`); quick picks are the Large Skill Injector
    and the items of past offers. What you typed you paid resets with the item.
- **Your offers** (`offersOf` over `raffles` records, the main's journal and trades): tiles for offers, sold out of finished, and
  the result in all over the offers whose result is known, with how many aren't ("over 1 of 3: 2 not known yet"), never a
  part-sum as the whole. A row a offer, newest first: nodes × node price (pot), created, state (open with when it ends, sold out
  or expired with when, "Not known yet" past three days with no notice or payout), your nodes (and refunded), who won (EVE's
  notice when it names the winner, else **You won it / Someone else won**, written to `prefs.hypernet.won` through `update`,
  with Change), and the result, or both results until who won is known; a tip says what is an estimate (the cores, an assumed
  fee, refunds taken as made, the item's purchase). Notices that couldn't be read are counted. Without the notifications
  permission it says to log in again, and that the offers listed are the cloud's when there are any (the cloud reads with its
  own login: the tab said "no offer can be read" over a table of them); empty, it says what it will show and that the cloud
  reads EVE's notifications hourly and the browser every sync.
- **How an offer is matched** (part 1, hypernet.ts `offersOf`): by the creation notice; its end by a notice **within its three days
  and an hour** (`END_SLACK`) with the same item, nodes, **exact node price** and station, else a payout of the pot or 95% of it in
  that window, else (29 October 2026) your own nodes refunded at its price in the hour after its three days, which reads it as
  expired (`endFrom: 'refunds'`); own nodes are `flux_ticket_sale` entries of exactly the node price in its window; refunds, the
  payout and the fee by amount. **The end's window was open-ended until the review of 29 October 2026**: an offer whose end notice
  never came took the end of the next identical offer weeks later (reproduced: 1 October's read sold out on 21 October with its
  payout, the 20 October offer lost its notice). **A "not known" offer's refunds were play** while its nodes were hosting, so
  "Spent on play" and the burn were cut by them: reading the refunds as its end fixed that.
- **The notices' text is read by `noticeFields`** (noticeText.ts, shared with asset safety since 29 October 2026): top-level
  `key: value` lines only, the first of a key winning; the HyperNet side flattens the keys (`typeID` beside `ticket_count`). Before
  it, hypernet.ts had a parser of its own that also read indented and listed lines.
- **Restoring a backup keeps the notices** (`importAll`, store.ts): a backup replaces the ledger, but `raffles` is the union of the
  backup's and this browser's. They're EVE's, never changed, and EVE keeps notifications only a while, so a backup from before
  HyperNet would otherwise have emptied them here and the sync deleted them in the cloud, the only lasting copy.
- **Who won is kept for the newest 2,000 offers** (`prefs.hypernet.won`): an object lists integer keys smallest first, so the
  first cap kept the oldest and dropped every new mark once full.
- **The Wallet works out its set without the trades** (`hostedOf`: no costs, cores or marks, which move no entry; nothing at all
  while no notice is kept), and names an own node as hosting on the balance chart's dots and the month's CSV too (`describeRef`
  takes the set; they said "HyperNet tickets" while the lines said hosting).
- **The Wallet's "HyperNet hosting" line** (`HOSTING` in wallet.ts, Business, one line both ways, decided before the in/out split
  as tickets are): `flux_payout` ("HyperNet payouts") and `flux_tax` ("HyperNet relay fee") always; `flux_ticket_sale` /
  `flux_ticket_repayment` only when their entry ID is in `hosted` (`hostedOf`, passed by Wallet.tsx to every
  `flows` call), said "Your own nodes" and "Your own nodes refunded". Without the set every ticket is play, as before, so
  `npm run check-income` didn't move (its ledgers hold no flux entries). Play and the runway's burn no longer count your own
  nodes.
- **Side hustles has eight tabs**: four by two below 1,400 px of container, eight in a row from it (seven in a row had fitted at
  1,040: eight there left each blurb five lines tall).
- **The page check** (`hypernet` case, desktop only): the worked case with the main's own listing under Jita's cheapest (left off),
  a pot of 760 M saying "raise it to 788.27 M ISK (1.07× what you pay)", the 8-node row opened (keep 2 of 8, the source of the
  chance, Copy; slid to 0, You win says you can't), three offers (sold out with both results, marked "Someone else won" →
  +18.08 M and the mark in prefs; expired −18.7 M; open), no NaN or "Item #", neither table sideways at 1440, and the Wallet read line by line (`data-line`): the tickets
  line exactly the 4 M ticket in someone else's offer, the hosting line holding "Your own nodes". The first version matched a
  regex across the whole page and passed with the split broken (the hosting line exists from the payout and fee alone); checked
  on 29 October 2026 by emptying the set: both assertions failed.

## What isn't known yet: record on the first real offer

- The notices' real text (kept whole in each `raffles` record's `text`): which keys they carry, whether one names its offer, and
  **whether `RaffleFinished` names the winner** (any key containing "winner" is read; until then the row asks).
- **Whether `flux_payout` is gross or net of `flux_tax`**: both are matched; a gross payout with no fee entry assumes 5%, said.
- **The real HyperCore count** against the estimate (the game's window shows it): if the fit is off, change `coresFor` in a commit
  citing the offer.
- The node price the game accepts (its own rounding isn't known; the copy is a whole ISK) and whether the window's warnings fire
  at 1.5×.
- A refund's journal shape (`flux_ticket_repayment`) and how soon after the expiry it lands (matched within the hour).

## Limits

State these rather than letting them be discovered.

- **Hosting isn't in Results or All income** in this version: the Wallet's line is cash flow only.
- **The cores are an estimate** (the count fitted on players' measurements, priced at today's market or your own purchases), and
  so is every result that uses them; the fee is assumed at 5% when the journal holds no entry for it.
- **The main only**: an alt's offers aren't read, and the alts' orders aren't taken off the book the calculator prices on.
- **Offers are matched by exact node price** (and item, nodes, station, and an end within three days and an hour): two offers of
  the same item at the same price in the same window take the newest for each ticket, and a node bought at that price in
  someone else's identical offer would count as yours. One with no end notice, no payout and no refund of its own nodes stays
  "not known yet".
- **The sell-out chance is one host's report** until five of your own offers have finished; the average is only as good as it.
