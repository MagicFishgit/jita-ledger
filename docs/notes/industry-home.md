# Industry: home markets

Split from industry.md on 19 October 2026: stage 1's prices from Goonmetrics, then stage 4 whole. Decisions worth not
undoing. Home prices from Goonmetrics, selling at home, the cloud's structure search and its read of each home market,
which price speaks at a hub, the Home markets section and a hub's broker fee.

## Stage 1: prices from Goonmetrics

- **Home prices from Goonmetrics** (`src/lib/homeMarket.ts`, `worker/src/goonmetrics.ts`, migration 0019 `home_prices`,
  `GET /v1/home/prices?hub=`). Goonmetrics is a Goonswarm tool ("Goonmetrics © GARPA 2012–2026") that gathers data from CCP
  and members' client uploads; it publishes no terms, key or limit, sends no CORS header (only the cloud can read it) and no
  cache headers. So the cloud reads it gently: the watch set (`industryTypes.json`), 50 types a call, 1.5 s apart, every
  six hours a hub, after the alts' hourly read on the `37` cron (no new cron: one took 26 minutes to first fire), with a
  User-Agent naming the project only. A hub's read is one row; a read that fails keeps the last good one, three failed
  calls in a row end the round, and it isn't a watched job (as Abyss Tracker: someone else's site, the tab says how old
  its figures are). `GOONMETRICS_ON = false` switches it off if its authors object; the route then says so and the tab
  says "Goonmetrics isn't read". **Not known is never 0**: `weekly_movement` −1.0 is null, and a side with 0.00 and 0
  listed is none. The hubs are UALX-3's 1st Byzantigoon (the Imperium's market) and C-J6MT; 1DQ1-A is left out (almost
  nothing listed). Brave's own UALX-3 Keepstar, Mothership Bellicose, isn't tracked by Goonmetrics and joins as a hub in
  stage 4, once a character of the user's can see it.
- **The browser holds a hub's read like the NPC row** (`useHomePrices`, `homeHoldMs`): shared in flight, kept until the
  cloud's next refresh could have replaced it (its `at` + 6 h + 10 minutes) or 15 minutes, whichever is sooner, and dropped
  when the cloud is switched off, on a different login and on "Delete all data". A hub just picked never shows the last
  hub's prices for a render (the state is kept with its hub).
- **Selling at home** (the finder's Home hub, Sell at Jita / the hub / Either): Goonmetrics' best sell less a tick, checked
  against the home region's 14 days of highs once its history is read (`useHomeHistory`: Tenerifis or Insmother, only the
  top 40 rows sold at home), after your sales tax and the hub's broker fee. Its pace is that history's typical day split by
  `buyerShare`, or, before it's read, Goonmetrics' weekly movement ÷ 7 at an even split, said so on the row's sale. The
  broker fee is typed (a structure's owner sets it; ESI doesn't say): blank, the finder ranks before it, the head says
  "Profit a day, before the broker fee at UALX-3" and each row what each 1% costs a day, the row's profit a unit and the
  detail's profit tile say so too, never a fee of 0% shown as if typed. Home prices are said with how old
  they are, "older than a day" past 24 hours; off, not read yet, failing, switched off or the cloud a version behind each
  say which, and nothing is sold at home on prices nobody read (Either falls back to Jita). A row that can sell at home isn't
  "nowhere it may be sold" for its Jita leg missing: the count line gives every place's own reason ("no freight route to
  Jita; not read at UALX-3 yet"), and "No freight route between the site and Jita" is said only for a material nothing else supplies.

## Stage 4: home markets

Decisions worth not undoing (spec `docs/superpowers/specs/2026-10-10-industry-design.md`, plan `docs/superpowers/plans/2026-10-12-industry-stage-4.md`).

- **The permission** (`SCOPE.structureMarkets`, 12 October 2026): asked of every login, registered by the user on 9 October. The user's next
  login stops the cloud's main login and the main's login on any other device, never an alt's (the plan's corrections 1 and 2; eve-facts.md:
  EVE's rule is per character). Settings → Account says so before the relog (`grantSaid`), in the order that keeps every login alive: log in
  here, then hand the cloud the main's login, then log in on any other device, alts on Characters when wanted. The sender's login
  (`MAILER_SCOPES`) is untouched; an alt handed over again gains it (`loginAltForCloud` asks `SCOPES`). Handing the cloud a login first would
  stop this browser's own (`stoppedBy` already says so after the fact).

- **The cloud's structure search** (`POST /v1/structures/search`, `worker/src/structures.ts`, Task 17A): ESI searches the structures a
  character can see only with that character's own login, and the browser never holds an alt's. It runs as the main or an alt on the
  roster, with that character's login (`ledgerReader` / `altReader`); anyone else is refused before EVE is asked, and so is a login handed
  over without the search or structure permissions (said, with where to hand it over: Characters, or Settings → Your data for the main).
  It writes nothing: the found structures go back to the browser, which adds the one picked. A structure the character can't read (403/404)
  is left out, as the browser's `structureInfo` does; each system is read publicly, once for all the structures in it.
- **FindStructure as any character** (Task 17B, 12 October 2026; `as` and `Searcher` in FindStructure.tsx, `cloudStructureSearch` in cloud.ts,
  `FoundStructure` moved to industrySites.ts so cloud.ts doesn't import a component). The main searches with this browser's login, as before;
  an alt through the cloud's `POST /v1/structures/search`, with its own login, which the browser never holds. Each state is said, never
  "nothing found": the cloud switched off in this browser, a Worker a version behind (404: "The cloud is a version behind: searching as X
  comes once it's updated"), and the Worker's own words for a login it can't use. Where you build searches as the shown character
  (the old line "X's own aren't searched here" is gone; an alt's search needs no permission in this browser's login, only the cloud's).
  Reprocessing passes no `as`: it searches as the main, unchanged. The page check's Builder Alt searches through a stubbed route, then the
  route answers 404.

- **The cloud reads each home market** (Task 18A, 12 October 2026; migration 0021 `home_markets` + `home_books`, `worker/src/homeMarkets.ts`,
  `src/lib/bookFold.ts`). A hub is a structure with a name and a reader: Goonmetrics' two read with the main unless a `home_markets` row says
  otherwise (or switches one off with `removed_at`), and any hub you add (at most 10), which carries the system and region the finder needs
  (read publicly when it was added). `home_books` is **the structure's own**, keyed by structure: nothing of it is filed under the main or the
  alt that read it, and `read_by` says whose login the last good read was. A read folds page by page (`foldStructurePage`, the scan's fold with
  no queue count), keeping the watch set's types only (2,959; 2,916 when built), five levels a side as `[price, units]`, order counts and what the live orders
  sold: about 150 bytes a type. **A read cut short, or with a page failed, is never stored**, and a market over 300 pages isn't read: ESI's
  pages are shuffled by type, so part of them would price every type wrong; the last good read (`at`, `data`, `pages`, `types`) stands apart from
  the last try (`tried`, `reader`, `error`). `refused_at` is when this reader was first refused in a row: a read clears it, another failure
  (a 500 says nothing of access) keeps it, another reader starts it afresh. A refused hub is asked again hourly, so a character accepted onto
  the access list starts reading within the hour.
  - **When it reads**: last on the `37` chain (after the alts' read, Goonmetrics and the copy round: a missed Goonmetrics or copy round slips six
    hours, a missed structure read one), every hub whose last try is 45 minutes old (`BOOK_DUE_MS`; a try stamped as late as :50:30 is 47.5 minutes old at the next :38, so 50 would skip that hour), least recently read first **by `at`** (so a hub cut short goes
    first next hour, and one long market can't keep another unread), no page asked for past 14 minutes from the cron's time. Inside its own
    try/catch; **not a watched job** (a hub refused until the user is accepted would mail daily; the tab says each hub's state). The fold moved out
    of scan.ts unchanged: the scan's tests pass untouched.
  - **A login that can't read is skipped before EVE is asked and not stamped** (`loginOf`, from the keys): not on the roster (`notYours`, never
    read with the main instead), none kept, refused, or handed over without the permission (the deploy-day state of the main's own login: "hand the
    cloud your login again"). `POST /v1/home/read` reads one hub at once with no deadline.
  - **ESI**: `/markets/structures/{id}/` pages of 1,000 orders with `X-Pages`, held about 300 s, no rate group named in the spec; the 403 for a
    reader off the access list has no shape in the spec. **After shipping: record the first real refusal (its status and `error`), the first real
    read's page count, types and row size, and how long a page takes.**
  - **D1's cost**: one `home_books` write a hub an hour, about 2,200 a month for three hubs; `home_markets` is written only on a choice.

- **Which price speaks at a home hub** (Task 18B, 12 October 2026; `homeSpeaks`, `useHomeQuotes`): the hub's own market's read while under two
  hours old (`STRUCTURE_FRESH_MS`; 1 h 59 speaks, 2 h 01 doesn't), else Goonmetrics' (whatever its age, said), else none. Every reader says which:
  the finder's count line, rows (`sold at UALX-3, its own market`) and detail (the sale's note: "<hub>'s own market, read 12 min ago", with
  Goonmetrics' weekly movement beside it where the hub has one), the ladder (Start's "pays now" lines add "sold at UALX-3 on its own market" when a
  row they show sells at home: correction 15), and To do's List what you built. Past two hours the line says its own read is over two hours old
  and Goonmetrics speaks; a hub Goonmetrics doesn't track says it isn't priced.
  - **The hub list** (`hubsFrom`): Goonmetrics' two always (the cloud off, a version behind or failing too), then the hubs the cloud lists that
    you added and haven't removed. `HOME_HUBS` stays Goonmetrics' alone (the Worker's round reads it). `hubShort`: Goonmetrics' two keep UALX-3
    and C-J6MT; a hub you added is its structure's name after the system's ("Mothership Bellicose"; Ruling 2). The cloud's list is asked for always
    in the finder (Build's select offers every hub you added whichever is picked) and, on To do, when a hub you added is picked or when something built lists at the home hub (`useHomeQuotes` reads the hub's state and its own read, Goonmetrics' two included).
  - **At a hub priced by its own read**: a watched type absent from a whole read is "none listed there" (known; Goonmetrics' missing type stays "no price at"); **a type outside the watch set (`industryTypes.json`, loaded when the hub's own read first speaks) is never "none listed"**: the read holds watched types only, so `quote` is null and To do says the hub's own market is read for the Industry tab's items only (the review's fix round: 1,344 products of built jobs aren't in it);
    a material is bought up its best five levels for a week's need (`fillCost`); the pace is the home region's history, or Goonmetrics' weekly
    movement ÷ 7 before it, split by what the hub's live orders sold where the book can tell (the Jita book's rule, `tradingSplit`), else even.
  - **The home history is read for rows priced at the hub with no pace too** (`homeTypes`' `unpaced`, correction 10): a hub Goonmetrics doesn't
    track has no weekly movement, so no row had a pace to be ranked by. The same rescues a Goonmetrics type whose weekly movement is unknown
    (its -1), which stage 1 never paced or read the history of, but only within the 40 rows read, after the rows already sold at home.
  - **The browser's holds**: the cloud's list 15 minutes (shared in flight, read again after any change made here: `refreshHomeMarkets`), a hub's
    own read until the next hourly read could land (`bookHoldMs`, 5 to 15 minutes).
  - **A hub picked that isn't known here** (the list loading, the cloud off in this browser, failing, a version behind, or no longer listing it)
    is never "no hub picked": Build's select keeps it ("Reading…" / "Not listed") and says why; To do lists nothing from it in Jita and says why
    in the same words (`hubWhy`), copying no price.
  - **The page check** found that rung 1 (an NPC original) pays nothing at the page case's home site, so the ladder's words are asserted on the
    research rung.

  - **Fix round 1 (the review of Task 18B)**: **your own orders at the hub come off its read** (`structureQuote`'s `mine`: every character's open orders at that structure, by exact price, a level that empties dropped, an order matching no level leaves them alone; `IndustryChar.hubOrders`, To do's `hubOrders`): the structure's read holds every order, yours included, and priced a tick under your own listing. **Nothing speaks while the hub's own read (or the watch set) is still coming** (`HomeSource.pending`): Goonmetrics' prices no longer rank the rows or price a built item for the moments before the book lands. **To do says only which price it used and its age** ("UALX-3's prices: Goonmetrics, read 5 h ago."; `homeSaid`'s `own: false`): a refused or unreadable own market, a relog or an access list is said on the Industry tab alone (Ruling 1, the logging-in constraint). **"Goonmetrics' prices stand in" only where they do** (`ownMarketSaid`'s `'tracked'`: read and not switched off). **Ages in a hub's lines are minutes up to 2 h 59** (`homeAgo`), so 1 h 59 and 2 h 01 never both read "2 h ago". A hub's read that exists but doesn't speak reads "no price at X", not "not read yet".

  - **Fix round 2**: your orders come off a type's levels only if they are that type's (`ordersInRead`: prices carry four significant figures, so another item's order at a level's price is ordinary) and issued by the time of the read (`issued` moves on a reprice). A watch-set chunk that fails to load is final for the page (gotchas.md): the hub's own read doesn't speak, isn't pending for good, and Build says the item list couldn't be loaded with "Reload to try again" (`HomeSource.itemsFailed`). A Goonmetrics hub isn't "read" while its Goonmetrics read is loading.

- **The Home markets section** (Task 18C, 17 October 2026; `IndustryHome.tsx`, `hustles/industry/home`, the tab's fifth section). Lead
  "Prices at home, from Goonmetrics until a character of yours can read the market itself." One row per hub: Goonmetrics' two always
  (the cloud off, loading, a version behind or failing each said once over the table, in `listWhy`'s words), then the hubs you added,
  as the cloud lists them. Each is named by its structure with its system beside it, "1st Byzantigoon (UALX-3)" (Ruling 2; the
  system's part kept whole so "(C-J6MT)" never breaks at its hyphen), and says:
  - **Prices now**: its own read under two hours old, else Goonmetrics' with its age (`homeAgo`) and "older than a day" past one, else
    nothing, said, or why Goonmetrics' prices aren't here. While its own read is still coming from the cloud it says "Reading…", so
    Goonmetrics' line never shows for a moment and gives way. A default switched to Nobody isn't priced by its own last read (`ownRead`).
    It reads the hub's book and Goonmetrics' row directly, not through `useHomeQuotes`: the section never loads the watch set, so a
    watch-set chunk that failed on Build isn't reflected here (Build says it).
  - **Its own market**: `ownMarketSaid`, with Goonmetrics passed as it is for that row: `true` only while its prices are read, else
    `'tracked'` (a default), `false` for a hub you added. So a default refused by its access list reads calmly, and says "Goonmetrics'
    prices stand in" only where they do. The main's cloud login without the permission (every hub's state from the deploy until it's
    handed over) reads "log in again here, then hand the cloud your login again", never a refusal or a failure.
  - **Its reader**, a select per row (once the cloud's list is in): any of your characters, the main by default; Goonmetrics' two add
    "Nobody: Goonmetrics only", which stops reading them (`DELETE /v1/home/markets`, the cloud keeps the row with `removed_at`); picking a
    character sets it (`POST /v1/home/markets`) and reads at once. A reader the cloud keeps who isn't among your characters here is
    listed as itself, so the select never shows another as the one reading. **Read it now** only while its reader's login can read;
    **Remove** for a hub you added; **Make it the home hub** writes the `industry` doc's `hub` (and removing the home hub clears it).
  - **Its broker fee**, typed per hub into `hubFees` (the cell, and the row's fold on a phone): Task 18D adds the measured one.
  - **Adding a market**: `FindStructure` as any character ("Search as": the main here with this browser's login and its search
    permissions, an alt through the cloud's search with its own login). Whoever finds it reads it. The add posts the structure's name and
    system, then reads it at once, and the toast says "Added <name>." and what that read did in `ownMarketSaid`'s words: read and by
    whom, refused, failing, or skipped without asking EVE for a reader whose login can't (the likeliest first add: an alt handed over
    before the permission, "hand the cloud X's login again on Characters"); never a read it didn't make. A read that throws after the add
    still says Added, with why it couldn't read. Mothership Bellicose is named as the one to add ("Brave's market at UALX-3, Mothership
    Bellicose: add it once one of your characters can see it") once the cloud's list is in and until a hub of that name is listed (shown
    while the list loads, it vanished when a listed Bellicose arrived).
  - **The list's own states say nothing stands in** (fix round 1): with the cloud off in this browser, "Home markets, Goonmetrics'
    prices among them, are read by the cloud, which isn't on in this browser": Goonmetrics is read only through the cloud
    (`useHomePrices` is `off` then), so the first wording's "Goonmetrics' prices are all there is here" was false. A version behind says
    only that reading a market with your characters comes once it's updated: each row says what prices it, and "stand in" is said
    only where Goonmetrics' prices are read.
  - **Logins**: the section calls only the cloud's routes, with the logins the cloud already holds; it never starts an EVE login, hands
    one over or touches `auth.ts`. Where a login is the problem it says where to fix it (Settings → Your data, Characters).
  - The page check's industry case (Task 18C block) drives every state above, the reader select, Nobody, an add as Builder Alt (read,
    and again with its login lacking the permission), Remove, and a cloud a version behind; the plain loads draw the section on the
    empty, small and large ledgers, and `check-phone` measures it.

- **Goonmetrics' round starts where the last stopped** (Task 18E, correction 16; `scan_meta` 'goonmetrics' = `{ next, unread }` per hub, no migration). A hub's round
  began at the first batch every time, so a host that cut it at the same call (a rate limit no read had met) never reached its last
  batches. Now it starts after the last batch tried (`next`: where it started when it tried them all), and the types no round has reached since
  are kept (`unread`: all of them for a hub never read, none for one read before this was kept, less every batch that came back) and served
  with the hub's prices (`GET /v1/home/prices` `unread`, absent when none). Evidence: against a host that answers ten calls a round, C-J6MT's
  eight batches are all read in five rounds (it starts at the sixth batch, types 1250, in round two), tested; planted starting at 0, 50
  types stay out. **A save whose write throws leaves its batches unread** (ruling 18E-1): `settle` removes a batch from `unread` only when the
  row stored it, while `next` moves on either way. The finder, its count line and To do's built item say "not read at X yet" / "Goonmetrics
  hasn’t read it at X yet" for an unread type (`HomeSource.unread`, empty unless Goonmetrics is the source speaking), and "no price" only for a
  type read and absent; a built product outside the watch set at a Goonmetrics hub says Goonmetrics is read for the Industry tab’s items only (the
  watch chunk loads when Goonmetrics speaks too, never holding Build's rows back; To do shows it reading meanwhile). A type added to the watch set
  joins every kept hub's `unread` (`state.types`). Calls, pauses, User-Agent, cadence and `GOONMETRICS_ON` are unchanged.
- **The hub's broker fee, measured from your orders there** (Task 18D, 17 October 2026; `hubFeeRate`, `HUB_FEE_ORDERS`, `HubFee` in homeMarket.ts; `HubFeeLine`
  in IndustryHome.tsx, under each row's typed fee and under the home hub's words on Build; `IndustryChar.orders` / `.journal`). A structure's broker fee is its
  owner's and isn't in ESI. Correction 12: `matchFees` calls a fee a placement only at 75% of the Jita rate times the order, so a hub fee under that (1.2% is,
  at the main's 1.55%) would read as a price change, and `measuredRates` wants three placements a day. So `hubFeeRate` matches by the second itself: a
  placement counts when its order's first version seen is the only version of any of the character's orders in that second, its fee is every `brokers_fee`
  entry of the second (an owner's part and any other alike), and it is over the 100 ISK minimum (which says nothing of the rate). The median of the newest
  five, so a price change the app first saw as an order can't decide it. From any character's orders (the main's from its sync, an alt's from the cloud's
  hourly read): a structure's fee is its owner's, the same for all. **Only offered with Use this**, never applied, and "about the same" within the facility
  tax's band (`taxesDiffer`, ±0.05%); nothing measured draws nothing. The page check compares the offer without case (the button is upper-cased by the stylesheet).
  **After shipping: record the first real order placed at a home hub: how many journal entries its fee wrote, their ref types and amounts, and whether the
  measure matched the fee the market window showed.**
- **The first real reads after stage 4 shipped** (main d8da485, the Worker deployed 17 October 2026 at 16:03 UTC; read from D1 with SELECTs only at 18:58
  UTC). The user logged in again and handed the cloud the main's login: the main's and FannySchmeller's cloud logins hold the structure markets permission, the
  sender's doesn't (as planned). The 18:37 round read both of Goonmetrics' hubs with the main and **neither refused**: 1st Byzantigoon (UALX-3) 19 pages, 1,882
  of the watch set's types listed, a 150,401-byte row; C-J6MT 54 pages, 2,311 types, 239,939 bytes. Both rows carry the round's start (18:37:16) as `at`, so a
  page's time isn't in D1 (`wrangler tail` during a round would show it). So **no structure refusal has been seen yet**: record its status and `error` the first
  time a reader isn't on a market's access list (Mothership Bellicose's, likeliest). Goonmetrics' round state: `next` 0 for both hubs, nothing unread, `types`
  the 2,916; its rows read at 16:37 (159,936 and 166,329 bytes). No order placed at a home hub yet, so its broker fee's entries are still to record.

- **With a page open, a hub's own read is asked for again 3 minutes before it turns two hours old** (planner fix 2; `rereadDue`,
  `REREAD_LEAD_MS`, `useHomeBook`'s `again`, past the hold, once per read, a reader of the hub asking in the last minute counting): it
  stopped speaking mid-visit and Goonmetrics' prices took over (the investigation's browser run, 128 s), each visit switching back. The old
  read speaks until the new lands, and a re-read that fails or finds none leaves it speaking while under two hours (`rereadKeeps`, fix
  round 1); with nothing newer in the cloud, Goonmetrics' speaks at two hours, as ever.
- **The home region's history is kept by type while the region stays** (planner fix 2, `useHomeHistoryRead`): emptied on any change to the
  goods named, a re-rank ran once with no history at all (planets-kept.md). A type held isn't asked for again; `settled` says when every type
  asked has come back or failed.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Home prices are Goonmetrics'**, a Goonswarm tool fed partly by its members' client uploads, read every six hours: a
  hub's best sell can be hours old, and its weekly movement is the only pace until the home region's history is read (and
  that history is the whole region's, not the hub's). The hub's broker fee is typed, not known.
- **A Goonmetrics round cut short starts the next where it stopped** (Industry stage 4), and the types no round has reached since say "not read at UALX-3 yet"; a type read once keeps that read until a round reaches its batch again, however old (each type carries Goonmetrics' own `updated`, which the detail says when it's over a day before the read). A round that tries every batch but whose last one or two fail starts at the same place next time, so those types read "not read yet" until a later round's cut moves the start.
- **Buying at a hub priced by its own read walks its best five levels for a week's need** (`HOME_LEVELS`): deeper stock isn't seen, so a
  material whose week's need sits past five levels reads too thin there, said with how many are listed. Goonmetrics' hubs keep its depth rule.
- **A hub's own read is hourly, so an order you placed since it is still in the book until the next read** (your own orders of that item come off its levels by exact price, if issued by the time of the read; one placed or repriced after it is left alone, whatever its price, and priced as a rival until then). **At a hub with no weekly movement the top rows' materials are priced on this morning's Jita asks**: the live Jita books are read for rows that already have a pace, and nothing there has one until the home history is read.
- **On a thin home market a high profit a day rests on a few sales.** Goonmetrics' weekly movement, the only pace until the home
  region's history is read, is a handful of trades there, so a row selling one unit every couple of weeks at a large margin
  (the first look at the real UALX-3 row ranked such items first) is ranked honestly by the share rule but is the least sure
  figure on the page; under one sale a day the finder says the time between sales rather than a fraction.
- **A home market's own read is the watch set's types, hourly, from one read each time**: what its live orders have sold is since each was
  placed, not a pace, and nothing is watched between reads; its pace is the home region's history. **A read cut short, or with a page failed, keeps
  the last good read**, and a market over 300 pages isn't read. **It speaks only while under two hours old**: past that Goonmetrics' prices (hours
  old) speak for the hubs it tracks, and nothing for the others (Task 18B says so on the tab).
- **A hub's measured broker fee is matched by the second**: an order placed in the same second as another of the character's is left out, and the first version
  the app saw is taken as the placement (a price change before the app's first read would read as the fee; the median of five keeps one such from deciding it).
  It holds until the owner changes the fee, and is only offered.
