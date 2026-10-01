# EVE facts: the market

What ESI's market data says and doesn't: books, history, prices, rate limits. Split from eve-facts.md on 1 October 2026.

Don't re-derive or contradict these without new evidence.

- **Order prices carry at most 4 significant figures**, floored at 0.01 ISK (CCP's Broker Relations
  change, March 2020). The smallest change is `max(0.01, 10^(floor(log10 p) - 3))`, so it *grows with
  the price* — 0.01 on a 50 ISK item, 1,000 on a million-ISK one. It is **asymmetric at a decade
  boundary**: one step below 1,000,000 is 999,900, one above is 1,001,000. `tick.ts` implements this;
  derive the step from the magnitude of the *answer*, not the starting price.
- **Market order reads are rate limited per IP since 24 February 2026**: group `market-order`, 12,000 tokens per 15
  minutes, a 2xx costing 2, a 304 1, a 4xx 5, a 5xx nothing; `X-Ratelimit-Group`, `-Limit`, `-Remaining`, `-Used` on
  every answer. The cloud logs the lowest `Remaining` it saw each round ("esi rate limit" in `wrangler tail`), since
  whether Cloudflare's outbound IP is shared with other ESI users is unknown. The Sniper reads ~405 pages every five
  minutes (~2,400 tokens per 15 minutes), the watch ~150 books.
  https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026
- **Order book pages are shuffled with respect to type**, so sampling N random pages is an unbiased
  sample of the market. This is what makes Prospects affordable.
- **Order count ≠ trade activity.** The most-listed items are often loot and faction gear that barely
  trade. Sampling can only nominate candidates; history has to be the gate.
- **ESI history omits days with no trades**, so a gap *is* a zero-volume day, not missing data.
- **ESI's daily `highest` and `lowest` are trimmed, not the true extremes.** Checked against the user's own
  wallet in September 2026: of 182 days they sold something in Jita, 86 had a sale *above* the reported high
  (60 of them by 5% or more; one ammo sale at 53.98 against a reported high of 40.66), and 6 of 41 buy-days
  had a buy below the reported low. The trades left out were typically about 2% of that day's volume, once
  25%. CCP documents none of this. So a day's low is where the *bulk* of the day's trading got down to:
  "the low stayed above your bid" means most trading stayed above it, never "nothing sold lower". Say it that
  way in copy. The history is also region-wide (all of The Forge), not Jita alone.
- **A book's live orders show which side trades.** Each order carries `volume_total` and `volume_remain`, so
  what the sell orders have sold is what buyers took from listings, and what the buy orders have filled is what
  sellers dumped into bids. Tested fairly on 27 September 2026 (the split read at the start, then compared with
  what traded over the next 1.3 hours, 87 items that traded 20+ units): a median 0.17 from what traded, against
  0.26 for history's guess (`buyerShare`) and 0.47 for an even split; better than history on 58 of 87, with no
  lean (+0.003, history read 0.11 too few buyers). An earlier run, cut short by a crash at 1.45 hours, gave 0.19
  against 0.46. **Blind spot:** an order placed for one unit can't show a partial sale; bought, it vanishes. A
  side made mostly of single-unit orders can't show its trades (item 16423: 7 of 10 listings single units,
  book read 0% buyers, history 69%), so `bookCanTell` sets the book aside there.
- **Many module markets are sellers dumping into big standing bids.** Buy orders of hundreds to thousands of
  units soak up loot and surplus while buyers rarely take the small listings above them (Heavy Afocal Laser I:
  37 listings of median 2 units, 3 sold; 5 bids of median 1,000 units, 1,396 filled). History's day-range guess
  read such items as 30–97% buyers; what traded in a six-hour watch was 0–7%.
- **ESI's `average` may be the client's median price, not a true average** (an unanswered forum observation,
  not checked here). Nothing is built on the difference; it is a limit, not a fact.
- **NPC market orders run for 365 days; a player's run for 90 at most.** So an item NPCs sell shows itself in
  the book (`duration`), with no list to keep. Raven Blueprint: NPC-sold at a fixed 1.135 B, flat on 23 of 25
  days, its bids a lowball 0.02 ISK.
- **Some busy items really do trade in a 0.1–1% daily range.** Hammerhead II's ESI history shows
  (high − low) / average of 0.13% to 1.3% on most days. A squeeze warning on such an item is correct, not a bug.
