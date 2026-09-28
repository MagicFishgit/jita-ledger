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
- **Hauler capacities are read from ESI, not remembered.** A Charon holds **465,000** m³, not the
  1,100,000 once written here — that was an expanded fit passed off as the hull, and it would send
  someone to a contract they cannot pick up. For hulls with a fleet hangar the usable figure is cargo
  **plus** hangar, since a courier package travels in either; that is why a Deep Space Transport with
  a 3,900 m³ hold is the standard ship for 50,000 m³ contracts.
- **Only two cargo bonuses are applied, because only they name the stat they move.**
  `freighterBonusC1`/`C2` on a freighter (both 5, tied to the racial Freighter skill and Advanced
  Spaceship Command, compounding — a Charon at both V holds 726,563 m³) and
  `industrialCommandBonusShipCargoCapacity` on the Orca. Other classes carry bonus attributes whose
  target stat the data does not state; nothing is assumed for those.
