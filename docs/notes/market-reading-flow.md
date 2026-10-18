# Reading the market: who trades, and how fast

Split from market-reading.md on 19 October 2026. Decisions worth not undoing. The buyer/seller split, Clears in, the
app's own watching of a book, busy relisting, an item's rhythm, and how long a moved order stays at the front.

- **"Busy relisting" informs; it never hides or ranks** (`relistPace`, `BusyRelisting`). After `RELIST_MIN_H` (6)
  hours watched, a side whose best price improved (someone undercut or outbid the front) every `BUSY_RELIST_MIN`
  (30) minutes or more often gets a tag under the item's name on Orders and Prospects and a note in the
  Calculator, with the rate and "price patiently, or expect to relist". The user asked for exactly this: bots are
  everywhere, and a good trade shouldn't vanish because of them. Reads are five minutes apart, so "every 5 min"
  is the floor. The Clears-in tip quotes the same rate instead of the old units-listed-at-the-front figure.
- **An item's rhythm is said only after a week of watching** (`rhythm.ts`). Busy hours: the 4-hour window (UTC)
  carrying at least 1.5× its even share of one side's trade, judged per hour watched, after 7 days and 30 units;
  said in EVE time and the viewer's own ("Buyers take listings most between 18:00 and 22:00 EVE time (20:00–00:00
  yours)") in the Calculator and the Clears-in tip. Spread now against the median of the same hour on 7+ earlier
  days, under the Calculator's hourly chart. Nothing shows before then; there's no "collecting data" wording.
- **"Clears in" is paced by what the Jita book was seen doing, not only by a guess from history** (`lib/flow.ts`,
  `sidePace` in `orderCheck.ts`). A six-hour study of the user's 71 beaten orders (27 September 2026, 03:44–09:44
  EVE time, 79 reads of each book ~5 minutes apart) found:
  - the queue mechanics right: every unit sold at Jita came off the orders ahead of theirs;
  - Jita's whole trade near the Forge's typical pace (median 0.82 of the 14-day median day, 0.6 of the 7-day
    average);
  - the buyer/seller split badly off: a median 0.33 from what the books showed, often "nearly all buyers" on
    items where sellers dumping into bids did nearly all the trading (5245: guessed 1.00, saw 0.3 bought from
    listings an hour against 26 sold into bids);
  - only 4 of the 22 orders predicted to reach the front in that window did.
  So every check compares each book with the previous read of it (`bookFills`: shrunken orders are sales on
  their side, a vanished order only if it was the best on its side), timed by ESI's own `Expires` (`stamp`)
  so the same snapshot read twice adds nothing, and gaps over 30 minutes or partial reads are skipped. Kept 14
  days per item and day in the cache store (`flow`). The pace blends that with the history guess as if the
  guess were 24 hours of watching (`PRIOR_HOURS`), and the guess is a typical day (`paceDay`) split by the
  book where it can tell (`tradingSplit`). Orders shows "N h watched", "from the book" or "from history" under
  the figure. No re-weighting of history alone helped (every variant was off by 5–20× per item).
- **A book with an empty side can't say who trades** (`bookCanTell`). A filled-up order leaves the book with its fills,
  so a side with no orders reads as having sold nothing. The Experimental ZW-4100 Torpedo Launcher (29 September
  2026): its one Jita bid, which had taken three quarters of the trading, filled and went; the book read 100% buyers,
  the cloud had watched 26%, and the Calculator's blend (77.8%) put ~380 buyers a day on listings the watch saw taken
  ~49 a day ("Round trip takes 2 h"). Of 358 books the book is trusted on with 30+ units watched, it was the only one
  with an empty side, 0.74 off where the rest were a median 0.14. Such a book is now set aside like one of single units;
  the launcher reads ~50% (history's guess, 0.60, blended with the watch). History's guess is still poor on markets
  that sell into bids, so the watching has to build up before the pace is right.
- **One buyer/seller split, everywhere** (`tradingSplit` in `split.ts`): what the app has watched each side of the
  Jita book do (`flowStore`, fed by *any* repeated read of a book in `readBook`, so the Calculator, watchlist
  signals, Loyalty pricing and order checks all add to it), then what the book's live orders have already sold
  (`BookSold` on every book read, `bookCanTell`), then history's guess, then even. The watching is weighted as if
  the prior were one typical day. Orders, Prospects, the Calculator, Loyalty, Hub arbitrage (from the hub's own
  book), the Watchlist and Positions (through `snapshot`) use it, and the tips say which source spoke. Selling
  times are judged on `paceDay`: the 14-day median day, or the 14-day calendar average when the item trades on
  fewer than half its days (its median is 0, but it does sell). Checked on the user's 100 orders before shipping:
  8 went from "leave it" to "move it", all module markets of the dumping kind above, where the queue ahead is
  days, not hours; the morning watch agreed with the book for the four busy enough to score.
- **Undercuts are shown, not modelled.** In the study 46 of 71 beaten orders were undercut again within six
  hours, and on busy items new stock arrived at the front ~1.9× as fast as the queue drained, so a queue is not
  fixed. But the undercut rate read from one book (units ahead placed after your last change, over the time
  since) predicted the next six hours poorly (median log error 1.49), and subtracting it would flip verdicts to
  "move" wholesale on thin evidence. The watched rate of new stock at the front is in the Clears-in tip instead.
- **How long a moved order stays at the front** (`afterMove`, `afterMoveSaid`, `movesToFront`, `AFTER_MOVE` in relist.ts;
  `othersUndercutRate`, `ownFrontMoves` in flow.ts; the "After a move" line under Orders' Move to). The user asked whether
  Clears in could use the undercuts the app watches. The research (3 October 2026, `.playwright-mcp/clears-in-research/
  report.md`, 714 predictions and 1,216 price changes) found it can't: on top of a plain recalibration the undercut rate
  added +0.016 log-likelihood a row and changed no "within" figure; a drain net of new stock ranked worse (C 0.69 → 0.53)
  and its "may not clear" was no better than chance; a chance of being undercut first wasn't calibrated. Where the rate
  does predict is how long a move to the front lasts before it's beaten again. Of the user's 1,216 price changes (27
  September to 3 October), 105 beaten again within 10 minutes are left out (placed behind on purpose, or undercut at
  once), and 415 of the rest had their market watched 6 h or more on the days before, cut into thirds by others' undercuts
  an hour (`out_atfront_skip10.txt`):
  - quiet, under 0.13 an hour: 13% beaten again within 1 h, 37% within 3 h, median 9.9 h;
  - middle, 0.13 to 0.34: 28%, 54%, 2.6 h;
  - busy, 0.34 and over: 42%, 57%, 1.6 h. C 0.587: it orders markets fairly, not well.
  Measured bands, not a formula: an exponential at each third's rate got the order right and the size wrong (94% of the
  busy third within 3 h, against 57%). The rate is the research's to the digit (`.playwright-mcp/after-move/match.mjs`:
  all 1,216 equal): the times the best price improved on whole UTC days before today, less the user's own placements and
  better prices those days (up to the day's count, times the share of the day watched), over the hours watched; nothing
  under `RELIST_MIN_H`. Keeping only Jita 4-4's own moves changed none. The cuts sit a hair under the computed 0.12978 and
  0.34097: at the rounded 0.130 and 0.341, 4 moves at exactly the lower cut fell to the quiet third, whose median read
  9.3 h, and 2 at the upper to the middle one; the bands are that sensitive to a few moves at their edges. The user
  chose this one line ("helps judge whether a move's fee buys anything") over a track record by figure size, Clears in
  worded as a floor, or nothing. It shows only under a Move it whose price beats every other order on its side
  (`movesToFront`): a move behind the front, or behind a token, is beaten from the start, which is what the left-out
  moves were. Its tip says it's a typical figure for markets this busy, not a forecast, and what was left out. Not on
  To do, not mailed.
- **A one-sided day says nothing about who traded** (`buyerShare`). A day whose trading sat only in the upper
  half of the week around it (or only the lower) is skipped, like a flat day; the median comes from two-sided
  days, and needs `MIN_TWO_SIDED` (7) of them or every day is read as before. Reading such a day by where its
  average sat inside its own narrow range counted the scoop's 107.8–109.1 M day as mostly sellers dumping.
  Measured on live history: the scoop's seller-side estimate fell 42 → 26 a day, Tritanium's stayed in the
  billions, Machariel's didn't move; Mobile Tractor Unit had only 5 two-sided days and falls back. Assigning
  one-sided days 100/0 instead was tried and wrong: it put Tritanium's sellers at zero.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **The buy/sell split is an estimate.** The book's reading was a median 0.17 from what traded in the next hour
  or so (history's guess 0.26), tested on items trading 20+ units in that time; thin items weren't in the test,
  and a side of single-unit orders can't be read at all. The book reflects its orders' whole lives (a bid can be
  weeks old) while a watch reflects the hours the app is open. Books cached before `sold` was kept fall back to
  history until the next scan.
- **"Clears in" assumes nobody undercuts you meanwhile**, and in practice most beaten orders get undercut again
  within hours. It also needs a day or so of the app watching an item before the measured split outweighs the
  guess, and it measures during the hours the app is open, which is the right bias for someone deciding now.
- **Orders' "After a move" is six days of one trader's moves** (27 September to 3 October 2026, 415 with a known rate,
  mostly loot and module sells; market-reading-flow). Its bands are typical figures, not a forecast; the moves beaten within
  10 minutes are left out, so a real move can be beaten sooner, and a move changed again before it was beaten counts as
  not yet beaten. The rate reads only whole days before today, so an item first watched today says nothing until
  tomorrow, and undercuts are counted by UTC day, five minutes apart, so a brief spell at the front can be missed. The
  bands were cut on the cloud's all-day watching; with the cloud off, the rate comes from the hours this browser was open,
  a different sample (as for Clears in).
