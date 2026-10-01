# EVE facts that cost real research

Things about EVE and ESI that took real research or a real mistake to learn.

Don't re-derive or contradict these without new evidence.

- **Order prices carry at most 4 significant figures**, floored at 0.01 ISK (CCP's Broker Relations
  change, March 2020). The smallest change is `max(0.01, 10^(floor(log10 p) - 3))`, so it *grows with
  the price* — 0.01 on a 50 ISK item, 1,000 on a million-ISK one. It is **asymmetric at a decade
  boundary**: one step below 1,000,000 is 999,900, one above is 1,001,000. `tick.ts` implements this;
  derive the step from the magnitude of the *answer*, not the starting price.
- **ESI cache windows** (server-side, unbeatable): wallet transactions and journal **1 hour**,
  character orders **20 min**, wallet balance 2 min, market orders 5 min, market history ~daily.
  `esi()` reads the `Expires` header and takes `Expires - Date` as the TTL so a skewed browser clock
  can't break scheduling.
- **ESI cannot place, change or cancel a market order.** 34 write operations in the whole API, none
  touching orders. Automating the client is input automation: 30-day ban, then permanent. The only
  market write is `POST /ui/openwindow/marketdetails`, which opens a window and nothing more.
- **A web page can't focus another application**, so "open in game" can't raise the client.
- **ESI is moving routes off `Expires`** (CCP, 27 January 2026: on routes whose cache is cleared by events, "the
  `Expires` header is no longer meaningful… use the `Cache-Control` header"). Only skills and the skill queue so far,
  "more routes" to come; market routes still answer `cache-control: public` with Expires on the old cycle, checked 29
  September 2026. So `cacheUntil` (`cacheHeaders.ts`) reads a max-age first, takes no-cache as "no time named" (the
  caller's fallback: the sync's 15 minutes, the book cache's own bounds), and only then Expires − Date. Book snapshots
  are still told apart by Expires (`stamp`), which will need ETag instead if markets move.
  https://developers.eveonline.com/blog/smarter-caching-when-events-drive-invalidation
- **Market order reads are rate limited per IP since 24 February 2026**: group `market-order`, 12,000 tokens per 15
  minutes, a 2xx costing 2, a 304 1, a 4xx 5, a 5xx nothing; `X-Ratelimit-Group`, `-Limit`, `-Remaining`, `-Used` on
  every answer. The cloud logs the lowest `Remaining` it saw each round ("esi rate limit" in `wrangler tail`), since
  whether Cloudflare's outbound IP is shared with other ESI users is unknown. The Sniper reads ~405 pages every five
  minutes (~2,400 tokens per 15 minutes), the watch ~150 books.
  https://developers.eveonline.com/blog/market-orders-rate-limit-rolls-out-on-february-24-2026
- **EVE's notifications carry what the asset list doesn't** (`esi-characters.read_notifications.v1`, GET
  `/characters/{id}/notifications/`): type `StructureItemsMovedToSafety` has YAML text with `assetSafetyFullTimestamp` and
  `assetSafetyMinimumTimestamp` in Windows FILETIME ticks (100 ns since 1601), `newStationID`, `solarsystemID`,
  `structureID` (a YAML anchor, `&id001 …`) and `structureLink` (the structure's name in a showinfo link), per the goesi
  library's declaration. How long ESI keeps an old notification is unknown.
- **EVE's login checks scopes only after you sign in.** A request for a scope the application doesn't have, or one
  that doesn't exist, gets the sign-in page all the same (probed 29 September 2026), so a new scope in `SCOPES` would
  refuse every new login until it's ticked at developers.eveonline.com. New ones start in `OPTIONAL_SCOPES`, asked for
  only once switched on in Settings, with "Stop asking" if the login refuses.
- **Logging in with a different set of permissions stops the logins issued before it.** 29 September 2026: the cloud's
  login for the user's character, handed over with the 14 permissions the app then asked for, last refreshed at 10:45
  UTC; the user then logged in to the app again to accept the new ones (23); every refresh of the cloud's token after
  that got a 400, "Invalid refresh token. Character grant missing/expired." The login handed over again at 13:25, with
  the same 23, worked. Two logins of one character with the *same* set have lived side by side since 27 September (the
  browser's and the cloud's). So adding a scope to `SCOPES` means handing the cloud its login again after the next
  login; Settings says so when the sets differ (`scopesMissing`). The time of the relog itself wasn't recorded.
- **That rule is per character, not per account, and EVE enforces it at its own login page.** The mail character, on
  the same account as the main, kept its two-permission login through the main's relog on 29 September 2026. And the
  earlier login is already stopped by the time the app or the Worker is handed the new one, so refusing a login
  afterwards protects nothing: a wrong character picked on EVE's chooser has to be kept as what it is
  (characters.md).
- **An account holds up to three characters, and EVE's login asks for the account, then which of its characters.** It
  remembers the account last used, so logging in a character on another account means signing out on EVE's page first.
- **An Alpha account can't be in game at the same time as any other account** (the user, 30 September 2026).
- **Alpha's skill limits are in CCP's static data, not ESI**: `cloneGrades.jsonl` (build 3561556, 30 September 2026)
  has four grades, one a race, each the same 175 skills at the same levels (Mining IV, Broker Relations II, Trade III;
  Accounting and Mining Barge absent, so not usable at all). ESI's skills answer gives a trained and an active level,
  which differ only while Alpha caps a skill; a character with nothing past the limits can't be told apart.
- **A `player_donation` journal entry has the giver as `first_party_id` and the receiver as `second_party_id`**
  (the user's journal, 30 September 2026: two entries, the main second on both). One between two of your characters is
  in both journals under the same entry ID, the giver's negative and the receiver's positive (the main's 100 M to
  FannySchmeller, entry 26096137638, read in D1 on 1 October 2026). **A courier reward names the Secure
  Commerce Commission (1000132), the contract's escrow, as payer, not the issuer**: the journal's one `contract_reward`
  (28 September 2026, contract 235889568, +200,000 ISK, entry 26090577567). The issuer's side
  (`contract_reward_deposited`), a `contract_price` and a `player_trading` between two characters haven't been seen, so
  only a donation is known to name both characters.
- **`publicData` grants nothing** — zero ESI endpoints require it; it isn't even an ESI scope.
- **Order book pages are shuffled with respect to type**, so sampling N random pages is an unbiased
  sample of the market. This is what makes Prospects affordable.
- **Order count ≠ trade activity.** The most-listed items are often loot and faction gear that barely
  trade. Sampling can only nominate candidates; history has to be the gate.
- **A sell order holds its own goods**, so real stock is the Jita hangar **plus** everything committed
  to open sell orders. Counting only the hangar reports a phantom shortfall on anything being sold.
- **Assets inside containers or ships are reported against the container**, not a station, so they
  can't be attributed to Jita. Counted and reported separately rather than folded in.
- **PLEX trades on one global market** (region 19000001), not in a station — it's the exception to
  every "is this at Jita 4-4" check. See `tradedAtJita`.
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
- **Loyalty store offers are public**: `/loyalty/stores/{corp}/offers/` needs no scope or login. Only
  the *balances* need one (`esi-characters.read_loyalty.v1`, 1h cache). Caldari Navy is corp 1000035.
  Its store is 310 offers over 303 output items and 92 required items; 377 of those 395 types have a
  figure in `/markets/prices/`.
- **`/markets/prices/` gives a rough price for every type in the game in one unauthenticated
  request.** A global average, not a Jita quote — good enough to decide what is worth pricing
  properly, never good enough to act on.
- **ESI has no loot tables of any kind.** Nothing says what an abyssal filament drops. Any "expected
  reward" would be invented. Don't. Abyssal returns come from the wallet instead.
- **`/route/` is one of the few endpoints still under a version prefix** (`/v1/route/...`), not the
  compatibility-date root — the unversioned path 404s. `flag=secure` routes high-sec only, and a 404
  from it means *no such route exists*, which is an answer rather than a failure.
- **A player structure is only described to a login with `esi-universe.read_structures.v1`, and only if
  you're on its access list.** `/universe/structures/{id}/` says so in ESI's own spec: otherwise it returns
  "Forbidden" (403) for all inputs. NPC stations (`60000000`–`64000000`) always resolve. The refusal is the
  best hauling-scam signal there is — but only when the scope was granted. Until September 2026 the app never
  requested it, so every structure failed and Hauling called every structure contract "the classic scam".
  `structureInfo` now separates *unchecked* (no scope: nothing asked, nothing claimed) from *refused*.
- **Location IDs tell you what they are by range**: NPC stations 60–64 million, solar systems 30–33 million
  (items in space), player structures from 1,000,000,000,000 up. `isStation` / `isSystem` / `isStructure`.
- **Broker fees and sales tax carry no context at all; they're matched by the second.** Checked on a
  real journal: 588 `brokers_fee` and 2,473 `transaction_tax` entries, not one with a `context_id`. But
  385 of the broker fees fell in exactly the second of one of the character's orders' `issued` time,
  because placing an order — and changing its price, which moves `issued` to that moment — charges the fee
  then. So `feeMatch.ts` matches a fee to an order version by second (amount breaks ties), and a tax to a
  sale by second and size. Orders keep every version seen (`Order.seen`, merged in sync), so a new price
  is a price change whose fee can be found. Two changes between syncs show as one, and changes before
  order history was kept can't be attributed. Unmatched fees are estimated from rates and say so.
- **A price-change fee is split like the placing fee**: over the units left on the order when it was
  charged, so units that fill afterwards carry it and the rest is prepaid. Charging it at once put a
  position that moved a 2,000-unit listing after selling 5 at −139%.
- **The client can be given a destination, not an info window for a structure.** `POST /ui/autopilot/waypoint/`
  (`esi-ui.write_waypoint.v1`) takes a solar system, station *or* structure ID and plots the route.
  `/ui/openwindow/information` only opens characters, corporations and alliances.
- **A mail a character sends itself doesn't reach the client until it logs in again.** Checked on the user's
  character in September 2026: ESI accepted the mail (201, an ID), and `/mail/{id}` and `/mail/labels/`
  showed it in the Inbox (labels 1 and 2, Inbox unread 1). But the client's Inbox, open the whole time,
  never listed it, and it appeared only after logging off to character select and back. So alert mail comes
  from a second character. Sent that way through ESI it arrived in the open client near instantly, with the
  new-mail notice, as ordinary incoming mail.
- **EVE mail through ESI** (`esi-mail.*`): POST `/characters/{id}/mail/` takes `{recipients:[{recipient_id,
  recipient_type:'character'}], subject, body, approved_cost}` and answers 201 with the new mail's ID. Body at
  most 10,000 characters, subject 1,000. The body is the client's small HTML: `<br>`, `<b>`, `<font size color>`
  with ARGB colours (`#ffRRGGBB`), and `<a href>` — `showinfo:{typeId}` opens an item, and a web link makes the
  client ask first. **What it draws was settled by a sample mail to the user's character:** sizes 10–32 all
  differ; `<b>`, `<i>`, `<u>` work; every colour works; `showinfo:` links open items, systems
  (`showinfo:5//{systemId}`), stations (`showinfo:{stationTypeId}//{stationId}`) and planets
  (`showinfo:{planetTypeId}//{planetId}`) without leaving the game; → · • ✓ ★ ± render; runs of spaces are
  kept. `&nbsp;` shows literally, `<hr>` draws nothing, a monospace `face` is ignored, a link's colour
  can't be changed (links are always gold), and × has no glyph. So no tables and no rules. GET gives the 50 newest headers (`from`, `subject`, `timestamp`, `is_read`, `labels`),
  older ones via `last_mail_id`. DELETE `/mail/{id}/` answers 204, and 404 once it is already gone.
- **Public contracts are public**: `/contracts/public/{region}/` needs no scope. The Forge runs to
  ~35 pages of 1,000, of which only ~120 are couriers.
- **Market groups are the honest way to get a set of types.** Filaments are groups 2457–2461, abyssal
  loot materials 2479. Walking the whole tree is not an option: there are 2,114 groups and
  `/markets/groups/{id}/` gives no child list, so fetch named groups only.
- **Skill names are not stable.** The industrial ship skills are *Caldari Hauler*, not *Caldari
  Industrial* — CCP renamed them. Skill needs are declared by name and resolved at runtime for that
  reason: a stale hardcoded ID checks the wrong thing silently, while a name that stops resolving
  shows as unknown.
- **`/characters/{id}/skills/` carries `total_sp`.** Summing levels cannot give it — the points a
  level costs depend on each skill's rank, which that response doesn't include.
- **An injector gives fewer points the more the buyer already has** (500k under 5M SP, then 400k,
  300k, 150k), and you cannot extract below 5M SP at all. That is why injector prices don't track
  the raw point count.
- **Planet types come from `/universe/planets/{id}` → `type_id` → `Planet (Barren)`.** Richness — the
  thing that decides what a PI planet actually yields — exists only in the client, not in ESI.
- **Lower security means richer PI planets, and that holds *inside* high-sec**: a 0.5 extracts more
  than a 1.0. A PI system list must therefore not default to sorting by security descending, which is
  the instinct everywhere else here and is exactly backwards. The size of the difference is not in
  ESI, so don't put a number on it.
- **150 units of raw make one refined unit.** A Basic Industry Facility takes 3,000 per 30-minute
  cycle and returns 20, so one gets through 6,000 an hour for 40 out. This was once written as 14,
  which flattered refining roughly tenfold and told people to build factories for a 1.08× gain while
  showing them 11.6×. ESI does not serve schematic inputs — only names and cycle times — but the
  30-minute cycle **is** confirmed there: exactly 15 schematics carry an 1,800-second cycle and they
  are exactly the 15 refined products. An Advanced facility is 40 each of **two different** refined
  goods for 5 processed, hourly: 16 in per 1 out.
- **Which refined pair makes which processed good is not in ESI and is not guessed at.** The factory
  lists them in the client. Naming recipes from memory is how the 14 got in.
- **A PI extraction programme has an end date and then simply stops** (`expiry_time` on the extractor
  pin). The colony looks normal, factories drain what is left, and it earns nothing until the heads
  are reset — the commonest way PI money is lost, and a field nothing was reading.
- **Colony pins are classified by shape, not by type ID**: `extractor_details` makes it an extractor,
  `factory_details` a factory, anything else that holds things is storage. No list to go stale.
- **`qty_per_cycle` is not a flat rate.** Real extraction decays across a programme, so the per-hour
  figure derived from it is the top of the range. Say so rather than presenting it as steady.
- **`/universe/ids/` will not resolve Amarr's trade station by name** ("Amarr VIII (Oris) - Emperor Family
  Academy" comes back missing while Dodixie, Rens and Hek resolve), so `HUBS` holds station IDs, each checked
  against `/universe/stations/{id}/`: Amarr 60008494, Dodixie 60011866, Rens 60004588, Hek 60005686. NPC
  station IDs don't change; this is not the skill-name situation.
- **`/universe/names/` rejects the whole batch if one ID is bad.** `useEnsureNames` falls back to one
  `/universe/types/{id}/` per type when that happens, or the batch stays "Item #…" for good.
- **Planetary goods are market groups 1333–1337** (Raw, Processed, Refined, Specialized, Advanced: 15, 15,
  24, 21 and 8 types, checked against ESI). 1332 is the parent and lists no types itself.
- **A blueprint copy shares its type ID with the original**, so any price for it is the original's: one
  battleship BPC reads as billions. `is_blueprint_copy` assets are left out of every stock count; copies
  can't be sold on the market anyway.
- **Some busy items really do trade in a 0.1–1% daily range.** Hammerhead II's ESI history shows
  (high − low) / average of 0.13% to 1.3% on most days. A squeeze warning on such an item is correct, not a bug.
- **A market_transaction journal entry's `context_id` is the transaction ID**, which is how the Wallet names
  the item behind a balance jump. Buy orders are escrowed when placed (`market_escrow`), so money in and out is
  read from transactions for trades and the two market ref_types are left out of the categories — counting both
  doubles every purchase.
- **A purchase straight from a listing shows as a `market_escrow` in the same second, for exactly its cost; a buy
  order of yours filling has no journal entry of its own** (it's paid from the escrow taken when the order was
  placed). Checked on the user's journal on 28 September 2026: 61 of 399 buys had a same-second escrow for exactly
  their value, none of their Datacore - Rocket Science bid's fills did, and there are no `market_transaction`
  entries for purchases at all (all 3,663 were sales). A same-second escrow for a different amount is a buy order
  placed that matched at once. This is how `instantBuys` tells a snipe from a fill; matching fills to your orders'
  prices failed, because orders placed or repriced before their history was kept aren't known.
- **Asset safety, as ESI reports it** (the user's wrap, 28 September 2026): one item of type 60, *Asset Safety Wrap*
  (unpublished, so `/universe/ids` finds no type by that name), flagged `AssetSafety` at location 2004, type `other`:
  ESI doesn't say which system it's held for. Everything in it is listed inside it (`Hangar`, type `item`), ships with
  their fittings and containers with their contents a level deeper. **The wrap has no name in ESI**: the client titles it
  after the lost structure ("K7D-II - Iserlohn Fortress"), but `/characters/{id}/assets/names` answered
  `[{"item_id":…,"name":"None"}]` for it (the cloud's log, 17:07 UTC the same day), and nothing else in ESI names the
  structure, since the wrap sits at location 2004. Containers and ships inside it keep their own item IDs, and the same
  call **does** name those as the user named them ("Battle Chicken", "Equipment"). What's inside, from the raw rows
  logged at 18:07 UTC (155 rows under the wrap): every ship keeps its flags, so fitted modules sit in `HiSlot0`…`RigSlot2`
  (loaded charges share their gun's slot), the rest in `Cargo` and `DroneBay`; a container's contents are `Unlocked`;
  blueprint copies are listed like anything else (`is_blueprint_copy`), and one container held nothing but five; a
  ship with `is_singleton: false` is packaged and holds nothing (the user's Sigil). Nothing sat deeper than a ship's or
  container's contents. **ESI has no delivery date anywhere**:
  its spec mentions asset safety only as that flag and the `asset_safety_recovery_tax` journal type. The rules (EVE
  University's summary of CCP's): after 5 days it can be delivered by hand to a station in the same system (0.5%);
  after 20 it goes automatically to the nearest low-sec station (from low or null) or high-sec (from high); either
  way it arrives as the wrap, and dragging items out after an automatic delivery to another system costs 15% of each
  one's estimated price. The client shows the countdown and the destination (Assets → Asset Safety); ESI shows
  neither, and a delivered wrap's shape was not yet seen when this was written.
- **The multi-item Sell window can import prices from the clipboard** (patch 23.01, June 2025: one line per item, its
  name then its price; "Decimal Point" / "Decimal Comma" pick the decimal mark). Each line placed as an order takes an
  order slot, and the duration applies to the whole window. Its **export**, checked on the user's own (29 September
  2026), is one line per item: type ID, name, quantity, unit price, total, with decimal points and no thousands
  separators (`4477  Small Gremlin Compact Energy Neutralizer  1  40000.0  40000.0`). A hangar copied in list view
  (Ctrl+A, Ctrl+C) gives name and quantity per line. Pasted through chat, the tabs arrived as runs of spaces.
  **The import only prices rows already in the window; it never adds the items it names** (the user, in game, 29
  September 2026). With three items in the window and prices for two, it priced the two and left the third, without a
  word; a row left unpriced keeps the window's default, which for an order is the regional average (CCP's Phoebe dev
  blog). So a paste can't pick the items: they have to be selected in the hangar first (right-click → Sell Items, or
  dragged in; each row has an X to remove it). The Multibuy window's import does add items; the Sell window's doesn't.
  Not yet tested: (CCP's support page says so, players dispute it) whether a sell order priced under a higher bid fills
  at its own lower price, and whether it pays a broker fee.
- **Inventory smart filters can't be written by an app.** Their criteria (the user's client, 29 September 2026):
  Assembled, Blueprint copy, CPU usage, Clone State, Estimated unit price, Group, Meta group, Meta level, Name, Power
  usage, Slot type, Stack size, Volume; Name takes Starts with / Does not start with / Is / Is not / Contains / Does not
  contain; Match All or Any. Shared (drag the Share box into chat or mail), a filter is
  `<a href="sharedSetting:e5983d9a1ea7d999e09cd742c820dd4678aaf5dc//1//2">Test</a>` (read through ESI from the user's
  mail to themselves): a pointer to a copy the client uploaded to CCP's servers, not the criteria, so nothing outside
  the client can make one. The official link-scheme list doesn't mention it.
- **Mining yields follow from dogma, and ESI serves all of it** (read 29 September 2026, `lib/miningYield.ts`). A laser's
  amount (77) and cycle (73); since Catalyst (18 November 2025) cycles are four times shorter (lasers 15 s, strip miners
  45 s) and amounts a quarter, so m³ a minute didn't change. Hull bonuses are effects, and **an attribute without its
  effect does nothing**: the Prospect carries the Venture's `miningAmountMultiplier` (207) = 2 but not effect 5058 that
  applies it (EVE Workbench's figures agree). Per-level bonuses scale by the skill the effect names (Mining Frigate,
  Expedition Frigates, Mining Destroyer, Mining Barge, Exhumers), role bonuses don't. Mining and Astrogeology +5% a level
  each and every Mining Laser Upgrade and yield implant (434) multiply, with no stacking penalty (ESI marks 434
  stackable). A crystal multiplies the amount before everything else (782, operator preMul) and the cycle (3161), and
  **adds** its residue points (3160, 3159, operator modAdd): Modulated Strip Miner II's 34% becomes 37.6% with Type A II,
  64% with B II, 93% at 29× the volume with C II. Survey chipsets, the Mining Precision (+10% crit chance a level) and
  Mining Exploitation (+5% crit size a level) skills are post-percent: a chipset's "−20% residue" is 34% × 0.8, not 14%.
  A crit adds the cycle's yield again twice over (5969 = 2) at a 1% chance (5967), raised half again on the Consortium
  Issues. Residue is ore the rock loses, not yours. Ice harvesters take one 1,000 m³ block a cycle; only the cycle moves
  (780: Ice Harvesting, upgrades, the ice rig, the Yeti implant, the hull), and Mining Laser Upgrades don't apply to ice,
  which needs Ice Harvesting rather than Mining. Crystals are named by family ("Simple Asteroid Mining Crystal Type B II",
  "Rare Moon Mining Crystal Type A I"); the old per-ore crystals are unpublished.
- **Hauler capacities are read from ESI, not remembered.** A Charon holds **465,000** m³, not the
  1,100,000 once written here — that was an expanded fit passed off as the hull, and it would send
  someone to a contract they cannot pick up. For hulls with a fleet hangar the usable figure is cargo
  **plus** hangar, since a courier package travels in either; that is why a Deep Space Transport with
  a 3,900 m³ hold is the standard ship for 50,000 m³ contracts.
- **Every hold bonus is read by the effect that applies it, and each moves one hold** (`lib/cargo.ts`, `CARGO_RULES`: effect,
  its bonus attribute, the hold it grows, the skill it follows per CCP's static data's traits; checked 30 September 2026). What
  was written here before was wrong on both counts: **a freighter's only cargo bonus is its racial Freighter skill's**, +5% a
  level, so a Charon at Caldari Freighter V holds **581,250** m³, not 726,563 (that compounded `freighterBonusC1`, which moves
  velocity, and Advanced Spaceship Command, which moves agility); and the other classes' bonuses do say what they move, once
  read by effect. **The Orca's Industrial Command Ships bonus grows its cargo hold and ore hold, never its 40,000 m³ fleet
  hangar** (a package can use 77,500 m³ at V). **Transport Ships grows a Deep Space Transport's fleet hangar**, not its cargo
  (a Bustard's 50,000 to 62,500). Expanded Cargoholds (×1.275 for a II), cargo rigs (+15% for a I) and Reinforced Bulkheads
  reach the cargo hold only, without a stacking penalty; a Transverse Bulkhead rig's −10% cargo drawback shrinks 10% a level
  with its rigging skill (−5% at Armor Rigging V). Specialised holds (ore, planetary, mineral, infrastructure…) take only
  their own goods and no expanders.
- **ESI renamed group 28 from "Industrial" to "Hauler"** (seen 30 September 2026), the way the skills became *Caldari
  Hauler*. `hullClassOf` and Combat's `HAULER_GROUPS` take both names; a check on the group *name* would have lost every
  Tech I industrial.
- **Abyss Tracker (abysstracker.com, built by the EVE Workbench team) has a public API with no CORS header**
  (`webapi.abysstracker.com`, read 30 September 2026; `abyss.eve-nt.uk` is the same app on IPv6 only). Its enums: tiers 0
  Tranquil to 6 Cataclysmic; weathers **0 Electrical, 1 Dark, 2 Exotic, 3 Firestorm, 4 Gamma**. `/Overview/GetOverviewData?
  tier=&weather=` gives a cell's run count, median loot per pocket by hull size with a band, drop rates and its most-run fits
  (`totalEhp` in **thousands**); `/Fit/GetEftById?id=&type=eft` a fit's EFT; `/Fit/GetPerformanceById` and
  `/Fit/GetTierTypeStats?fitId=` its runs, survival and ISK per cell. Fit pages are `abysstracker.com/fit/{id}`, a cell's
  `info-page/{tier}/{weather}`; per-ship pages don't exist ("Not implemented yet!" in its code). **A pocket's run is logged
  under one pilot's hull**, so a trio's Deacon and Vengeance never reach a most-run list though zKillboard has them as the
  4th and 5th most-lost abyssal hulls (21–29 September 2026). **Its logged losses are far too low**: the Gila's top fits log
  0.7% lost, while zKillboard shows about 25 Gilas lost in the Abyss a day. Compare fits with them; never price risk.
- **A filament's in-game description is stale; its dogma isn't.** Weather is attribute 2760 and tier 2761 on the filament.
  The descriptions still say Tranquil can't be opened in 1.0 or 0.9 and "Tech I or Tech II Cruiser" only; since patch 23.02
  (May–June 2026) Tranquil opens anywhere in high-sec, and a pocket takes one cruiser, two destroyers on two filaments or three
  frigates on three (EVE University, CCP's patch notes). The main loot can scales with filaments used (about 3× for frigates,
  2× for destroyers); the side cans don't. The weathers' strengths aren't in ESI or the static data (the wiki: penalties
  30/50% at T0–T3, 50/70% at T4–T6, bonus +50%), so the app quotes them as the wiki's (`WEATHER_STRENGTH`).
- **A mining fit's CPU, from ESI's dogma** (read 30 September 2026, `lib/fitCpu.ts`). CPU output is the hull's (48; a
  Hulk, Mackinaw, Skiff or Procurer 310, a Retriever 260, a Covetor 240), +5% a level of CPU Management (its 424), times
  each processor rig's 424 (Medium Processor Overclocking Unit I +7.1% for 150 calibration, II +9.6% for 300; effect 397).
  Each Mining Laser Upgrade raises the CPU of every module needing Mining (the lasers) by its 1082, 12.5% for a II (effect
  2444, one after another); Mining Upgrades cuts that penalty 5% a level (927, effect 2456) and not the upgrades' own 40 CPU,
  whatever its description suggests. So a Hulk with two deep-core strip miners, three upgrades, two Multispectrum Shield
  Hardener IIs, a survey chipset and a shield extender needs 412 tf at V: 387.5 without a processor rig, 415 with a Tech I,
  424.7 with a Tech II.
- **Two barge bonuses grow the ore hold** (ESI, 30 September 2026): Mining Barge +5% a level on the Retriever and Mackinaw
  (effect 5067, attribute 3187), Exhumers +2.5% a level on the Mackinaw (8251, 3198). A Retriever holds 34,375 m³ at V, a
  Mackinaw 44,297. No module grows an ore hold.
- **A fitting can't hold implants or boosters, and the import's handling of them isn't documented** (researched 30
  September 2026). ESI's saved-fitting item flags are the slots, `DroneBay`, `FighterBay` and `Cargo`, nothing for an
  implant; CCP's note on the clipboard import (Oceanus, 2016) says "only charges and ice products can be imported in the
  cargo"; CCP's current developer page on EFT lists hull, lows, mids, highs, rigs, subsystems, services, drones, cargo and
  says nothing of implants. Pyfa writes implants and boosters as their own sections after the drones, and Abyss Tracker's
  EFT carries them, but no source says whether the client skips such a line or refuses the paste. So Copy fit and Save fit
  leave them out and say so (the Copy fit tip, the toast), and Multibuy carries them. Pasting a fit with an implant line
  in game would settle it; it would only matter for a copy meant for pyfa.
- **Frigate pockets pay more than cruiser pockets**: Abyss Tracker's median loot a pocket is 2.0–2.9× a cruiser's at every
  tier (330 M against 121 M at T6), about the same per ship once split three ways. zKillboard can say a lost ship's tier only
  when a tier-named NPC is on the mail (270 of 1,847), and its weather never.
