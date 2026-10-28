---
paths:
  - "src/lib/{copyFinder,copyContracts,copyMarket}.ts"
  - "src/components/hustles/{IndustryCopies.tsx,industryMarket.ts}"
---

# Industry: the Copies section and your copy contracts

Split from industry.md on 19 October 2026: stage 3's browser side. Decisions worth not undoing. What's worth copying for
one lab slot, your copy contracts kept as a synced document, your copy business, and copies counted in Industry. What
the cloud counts as sold is in industry-copy-round.md.

- **The Copies section: what's worth copying for one lab slot** (`src/lib/copyFinder.ts` pure, `IndustryCopies.tsx`, `useCopyMarket` in
  industryMarket.ts, `cloudCopies`; stage 3, Task 14B). Each kind that sold in The Forge this week (the cloud's `GET /v1/copies`) at the
  shown character: left out and counted when the bundle lacks its blueprint, it's an invention product (Tech II: Build ranks it) or it
  can't be copied (correction 8); a run's price is the lower of the median sold and the median ask now (correction 7); a run's copy job
  at `labFor`'s lab at its copying index (the product's ME 0 EIV); runs a day a lab slot makes against runs a day sold (runs sold ÷ days
  counted, at least one: correction 16) at the industry share, the lesser, saying which limits it; ISK a day for one lab slot; the
  original (held: nothing to buy or research; else NPCs' price) with research from the held ME/TE; payback; the finder's profit a day
  building instead (only for the rows shown). Under three sales or one seller says so ("1 seller: one person's prices").
  - **The route's four answers are told apart by `at`**: null (no round has tried), `{ off }`, `{ tried, error }` (a round tried, none has
    read: said as what went wrong and when, never "not read yet", no table) and a summary, whose later failed try is said before its
    figures with the last good read's age, and whose `note` (a reset) is said as the cloud wrote it. A 404 is "a version behind". No
    table until a read has compared two sets (`reads > 0`): the counting line alone, never "0 kinds sold".
  - **The copy cost's two unchecked readings** (`copyReadings`, `readingsSaid`, correction 15): copying's SCC taken as EVE Ref's 4%, and a
    copy cost rig multiplying the structure's bonus on the index part. The cost's tip says each is unchecked until a job of yours settles
    it (stage 2's `jobCheck`: a copy job at an NPC station for the SCC; a copy or research job at your structure site with such a rig for
    the rig, nearer-reading when the two differ by more than the index's rounding), and what a job said. A structure with no cost bonus of
    its own (Astrahus, Fortizar) reads the same either way, said so.
  - **Layout**: seven columns at 1,440 (Original and research, and Payback and building instead, each share a column; the table is
    `table-layout: fixed`), the first and ISK a day on a phone, the rest folded into a line under the name.
  - **Fix round (review of 14B)**: an interrupted round (INTERRUPTED, now in copyMarket.ts) waits the full six hours, so the section says "its
    next six-hourly round", never "within the hour"; a try under 3 minutes old with that error is a read in progress ("reading now"), not a
    failure. A row's `lacking` merges copying's and research's skills (about a quarter of blueprints need some to research) and says "N to train";
    research past 30 days is flagged on the row and payback says "from the purchase, after N d of research"; every figure not known says why
    (payback, building, no Laboratory); a pace under one a day is time between ("about one every 2 days"); the left-out counts are kinds.

- **Your copy contracts are a synced document of their own** (`copyContracts`, `src/lib/copyContracts.ts`, Task 15A; corrections 10 to 14).
  ESI lists a character's contracts only 30 days back and the sync replaces `meta.contracts`' list each time, so a copy sold last month
  would drop out of Results after a month; `meta` also goes up every sync, so the contracts get a document that changes only with a copy
  contract. A copy contract is an item exchange you issued whose items, as your own contract items read them, are all given and all copies
  (`raw_quantity` −2; `ContractItem.raw` keeps it, null when ESI gave none, absent on an item read before this stage, which `itemsToRead`
  reads once more). The sync reads items for your outstanding item exchanges as well as the finished ones. Each contract keeps ESI's status,
  price, availability, acceptor, completion and start station, its copies by type, and its kinds `[type, ME, TE, runs, copies]`, read once
  from the public items while outstanding and public (at most 20 a sync): `private` (never asked), `gone` (no longer outstanding or past
  its expiry before they were read, or the answer held no copy), absent (not read: a 404 is asked again next sync). One missing from ESI's
  list and issued more than 30 days before the read is stamped `gone` once (fix round 2 below), its last status kept, and never dropped
  (3,000, `MAX_COPY_CONTRACTS`, newest kept); one still listed whose items aren't usable this read (read before `raw` was kept, or not read
  yet) keeps its copies and follows its status. Written against live state in the final `update`, only when changed.
- **An expired copy contract goes on To do** (Task 15C): one item per contract outstanding past its expiry and still in ESI's list; the rule is in orders-alerts-todo.md.
- **Your copy business** (Copies section, `CopyBusiness`): the shown character's copy jobs (activity 5) and copies held, and the main's copy
  contracts with their state (listed / expired: ESI has no expired status, so an outstanding contract past its expiry, its copies still in it
  until deleted / sold) and the cheapest ask of their kind. It is drawn outside the copy market's gate: it comes from the sync and the
  cloud's reads of your characters, so it shows with the cloud off or a version behind. An alt's contracts aren't read: said, never "none".
  The blueprints in copy contracts join the sync's name lookup, and an expired contract's station is named, for To do later (Task 15C).
- **Fix round 1 of 15A: the history is merged, never replaced** (`mergeCopyContracts`, `mergeCopyContract` in copyContracts.ts). The sync starts at load
  without waiting for the first pull, and the pull used to drop a doc while the local one was dirty: a new browser would have written ESI's 30 days over
  the cloud's history and pushed it, which ESI can't give back. Now both sides merge, as `jobs` do: the browser's pull applies the union whether the local doc is
  dirty or not (and under `cloudWins`), marking it dirty when the union holds more than what came down; the Worker's push reads D1's doc first, writes the
  merge and, when it differs from what was pushed, writes it at a revision of its own after the push's so the pushing browser pulls it back (correction 19's
  way). The merge is by contract, commutative and idempotent: the record whose status is further on (outstanding, in progress, other, deleted, finished) wins its
  own fields, an acceptor or completion either side knows is kept, `gone` is the earliest stamp, kinds read beat `private`, which beats `gone`, which beats unread.
  A contract stamped `gone` stays so even if a later read lists it again (ESI's window only moves forward; a partial list read is the one way that could be wrong).
  **Cap 3,000** (`MAX_COPY_CONTRACTS`; the merge's too): the document is one D1 value (2 MB), measured about 1.54 MB at 5,000 contracts with one kind each and 2.16 MB with five.
  **States**: a contract that left ESI's list while outstanding is "No longer listed by ESI" (its own tile, shown for 30 days after the stamp, "ESI lists contracts
  only 30 days back: if you didn't delete it in game, its copies are still in it"), never Expired; a finished one taken by one of your own characters (`ownIds`) is
  "Taken by <name>", not Sold. **15B must not count a taken contract as copy income** (ISK between your own characters is a transfer, never income); use
  `copyState(c, now, ownIds(...))` and count only `'sold'`. The sync also keeps the items of every contract still in ESI's list, so the oldest listed exchanges aren't
  read again and pruned every sync.
- **Fix round 2 of 15A: `gone` is stamped only against ESI's own list** (`copyContractsOf`; correction 13). The first version stamped a listed contract whenever
  this device's items for it were unusable (read before `raw` was kept, not read, past the cap), and the merge ("gone if either, earliest") put the stamp back after
  each sync stripped it: a push and a later revision every round, the row reading "No longer listed by ESI" while ESI listed it. Now the listed set is every item
  exchange you issued in ESI's list, whatever its items (a listed one with unusable items keeps its old record and follows its status); a held contract missing from
  the list is stamped only when issued **more than 30 days before the read** (ESI lists a character's contracts 30 days back, so a younger one missing is a partial or
  stale read, or issued after the read, never one that left; if the window is measured from completion this only delays a stamp until the contract is missing
  anyway); and a stamp already held is carried forward, so the sync and the merge agree and a sync writes nothing when nothing changed. The Worker keeps D1's doc when
  a pushed one doesn't sanitize (a pre-15A backup's null).

- **Copies you made and sold count in Industry** (Task 15B, 11 October 2026; `copySales`, `CONTRACT_FEE_REFS` in copyContracts.ts, `activityEvents` in income.ts).
  Each copy contract that is `sold` (finished, accepted by someone not yours) adds its price (the journal's `contract_price` entries naming it, else the contract's
  price at its completion, at its listing when ESI gives no completion) times the share of its copies your delivered copy jobs of that blueprint had made before it was listed, claimed in the order contracts were
  listed, each copy once; copies none made are counted apart and said. A `taken` contract (accepted by one of your own characters, `copyState(c, Infinity, mine)`) is a
  transfer, said, never a sale, but it uses up its copies from your copy jobs, oldest first, counting no ISK; `unlisted` (left ESI's list while outstanding), listed, expired and deleted claim nothing. Contract fees the journal names by
  `contract_id` count in full when you'd copied one of the blueprints before listing it (a listing fee is paid whether or not it sells). The copy jobs' own fees are
  stage 2's, charged once at each job's start: `copySales` never charges them again. Nothing touches market trades, so the claims and "Sold, never bought" don't move.
- **After shipping: the first copy contract's journal entries.** Which ref types a copy contract writes (`contract_price`, `contract_brokers_fee`,
  `contract_sales_tax`, or others), and whether they name the contract (`context_id` with type `contract_id`). Until seen, a sale is counted at the contract's price at
  its completion and no fee at all; record what the first real one shows.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **A copy's ISK a day leaves out contract fees and competition**, and **its pace is your share of what sold, counted from vanishings**
  (a contract listed and sold between two six-hourly reads is never seen, so the count is low; a vanished contract may have been
  cancelled). Payback leaves the research's days out (the row says them, and flags research past 30 days).
- **The copy cost rests on two readings not yet checked**: copying's SCC (EVE Ref's 4%) and a cost rig multiplying the structure's
  bonus. The Copies section says so in the cost's tip until a copy or research job of yours settles each.
- **A copy sale is claimed by blueprint and count, not by kind** (ruling 2): a contract's copies are taken from your delivered copy jobs of that blueprint, oldest first,
  whatever runs each copy carried; a split contract is counted pro rata of its copies, not their runs. **Copies your own jobs used up (to build or invent) still count as
  made** for a later sale's claim: the app can't see a copy consumed. **Claims run in the order contracts were listed**, so a contract listed early and sold late can take
  copies a later one had claimed, moving an earlier period's figure when it sells. **Contract fees count only where the journal names the contract** (unseen so far), and
  none for a copy contract of a blueprint you hadn't copied before listing it. An outstanding contract that left ESI's list is neither a sale nor a claim on your copies; its listing fee still counts.
