# EVE facts that cost real research

Things about EVE and ESI that took real research or a real mistake to learn: ESI itself, logins and accounts, the wallet
and journal, lookups. The rest were split out on 1 October 2026 so a session loads only its area's: the market in
eve-market.md, ships, fits, mining, hauling and the Abyss in eve-ships.md, planets in eve-planets.md, mail, the client
and asset safety in eve-client.md.

Don't re-derive or contradict these without new evidence.

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
  (characters-cloud.md).
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
- **A reward reaches the wallet after the character's corporation takes its tax.** Every `freelance_jobs_reward`, mission
  reward and bounty in D1 to 1 October 2026 was 89% of a round figure under School of Applied Knowledge's 11%:
  593,096,000 = 39,200,000 × 17 × 0.89; about 298 M taxed of 2.41 B in freelance rewards, 29 September to 1 October.
  Whether a freelance reward's row carries the journal's `tax` / `tax_receiver_id` ("only applies to tax related
  transactions") was unseen when the app began keeping them: record what the first real sync shows, at 0% too. A
  reward's `reason` is `project_id=<id>:project_name=<name>`, `\` and non-ASCII escaped (`/!\\`, `\u2713`); a job's last
  reward lands 2–7 s after its `details.finished`.
- **ESI's answers change with `X-Compatibility-Date`** (the app sends 2026-08-18). `/corporations/{id}/` then gives
  `tax_rates: { isk, loyalty_point }` in percent and no `tax_rate`; with no date or 2025-08-26, `tax_rate` as a fraction
  (1 October 2026: SAK 1000044 at 11.0, TEMP TAX HAVEN 98845591 at 0.0); it carries `creator_id` and `date_founded`
  too. `GET /freelance-jobs/{id}` answers for a finished job only with the header: `state: "Completed"`,
  `details.created`/`finished`/`expires`, `reward.initial`, `progress`, `contribution.reward_per_contribution` (the rate
  before tax).
- **Reading a character's corporation**: `/characters/{id}/` is `max-age=86400`, so the app reads `POST
  /characters/affiliation/` (no cache headers), then `/corporations/{id}/` (`max-age=3600`, an ETag).
  `/characters/{id}/corporationhistory/` is held a day: on 1 October it still ended with SAK hours after the user founded
  TEMP TAX HAVEN (19:39:23 UTC). ESI keeps no corporation's past tax rate.
- **`publicData` grants nothing** — zero ESI endpoints require it; it isn't even an ESI scope.
- **A sell order holds its own goods**, so real stock is the Jita hangar **plus** everything committed
  to open sell orders. Counting only the hangar reports a phantom shortfall on anything being sold.
- **Assets inside containers or ships are reported against the container**, not a station, so they
  can't be attributed to Jita. Counted and reported separately rather than folded in.
- **PLEX trades on one global market** (region 19000001), not in a station — it's the exception to
  every "is this at Jita 4-4" check. See `tradedAtJita`.
- **Loyalty store offers are public**: `/loyalty/stores/{corp}/offers/` needs no scope or login. Only
  the *balances* need one (`esi-characters.read_loyalty.v1`, 1h cache). Caldari Navy is corp 1000035.
  Its store is 310 offers over 303 output items and 92 required items; 377 of those 395 types have a
  figure in `/markets/prices/`.
- **`/markets/prices/` gives a rough price for every type in the game in one unauthenticated
  request.** A global average, not a Jita quote — good enough to decide what is worth pricing
  properly, never good enough to act on.
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
