# Planets: plan a system, then every character's colonies — design

17 October 2026. The upgrade of the Planets side hustle (Side hustles → Planets). The research behind it is in
`.playwright-mcp/research/planets/` (gitignored):
- `mechanics.md` and `pi-static.json`: CCP's static data, build 3569502, and the game's rules with their sources;
- `prices.md` and `prices.json`: Jita and the home markets, 17 October 2026, 20:23 UTC;
- `app-and-colonies.md`: what the app does today, and the owner's colonies as the data shows them;
- `setups-and-prior-art.md`: how players set planets up, and evehelper. Its volumes are pre-2023: use `prices.md`'s.

Each fact below says how sure it is: **exact** (CCP's data or ESI), **reported** (a source, dated), or **inferred**.

## What the user asked for, and what they chose

- **10 October 2026.** The page works only for high- and low-sec, but they live in null-sec (Brave, Tenerifis) and
  sell to null markets and/or Jita.
  - They want to give it a system, or have it use the system they're in, see what that system can make, and be
    guided from there.
  - They want a tier chart from P0 to P4: pick a product and see how it's made and what it needs.
  - They will train planet skills on more and more characters to scale up.
  - They pointed at https://evehelper.pages.dev "for inspiration / help".
- **17 October 2026.**
  - "most of my setups will be P0 -> P2 per planet to save on management time. I don't know if this is the most
    profitable."
  - "So we need to also be sure that the PI page can account for all the outputs in showing you the values."
  - "you would give it your system that you have chosen and then it will look per setup type what the isk is you can
    make best from it and then what to get from which planet."
  - Other setup types "that perhaps produces more isk but could have a dedicated factory plaent for example".
  - "it needs to handle multiple characters. so i should be able to switch between them in the view."
  - "the new skyhook acts as the planetary customs office".
- **Their choices after the research (17 October 2026):**
  1. The system planner first; real colonies for every character second.
  2. Compare every setup type: P0 → P1 on each planet, P0 → P2 on each planet, extraction planets feeding a factory
     planet, a factory planet on bought inputs, and chains across characters.
  3. Rank by ISK a day, with upkeep shown beside.
  4. For a planet not yet built, learn extraction from their own colonies by planet type, using a typed rate until
     there are readings, and say which.
- **Their test data.** The main's PI went up on 17 October 2026: five colonies in **5-NZNW** (30004865, Tenerifis,
  security −0.22), on planets I, III, IV and VI (Barren) and VII (Gas). This comes from the journal's
  `planetary_construction` fees.
  - The main has Command Center Upgrades IV, Interplanetary Consolidation IV (five planets) and Planetology IV.
  - Nothing yet records which P2 each planet makes: the layouts aren't kept anywhere.

## Goals, non-goals, anti-goals

**Goals.**
- **Stage 1, the planner:**
  - for a system and a character, rank each setup type by ISK a day, with upkeep beside it;
  - say which planet does what, and value every output a setup makes;
  - the P0 → P4 chart;
  - the main's colonies kept, so their extraction can be learned.
- **Stage 2, colonies for every character:**
  - every character's colonies read and kept (alts by the cloud with their own login);
  - a switch between characters, plus All;
  - what each real planet makes and what every output is worth;
  - expiring extractors on To do for every character;
  - each real planet set against the planner's best for it.

**Non-goals.**
- Searching regions for a system: the user picks the system. The old walkthrough's region scan goes.
- Import-ready colony layouts and pin placement (PI Nexus does this).
- Predicting a planet's richness, which only the game client shows.
- Automating anything in game.

**Anti-goals.** Any of these would be a failure even if the page worked:
- A figure that looks exact but rests on a guess. Extraction and customs tax are the two places this can happen.
- A zero standing for "not known".
- To do nagging: the user's "not too tight".
- Any change to how logins work. The user asked for care ("be carefull with the logging in changes"). No new
  permission is needed: planets (`esi-planets.manage_planets.v1`) and location (`esi-location.read_location.v1`) are
  already asked of every login.
- Alts never log in to the app. The cloud reads them with the logins handed to it.

## The facts it rests on

- **Recipes** (exact): CCP's `planetSchematics.jsonl` has all 68 schematics, with every input's quantity, the output
  and its quantity, the cycle time, and the pin types that can run each.
  - 15 are P0 → P1 (Basic: 3,000 → 20 every 30 minutes).
  - 24 are P1 → P2 (Advanced: 2 × 40 → 5 an hour).
  - 21 are P2 → P3 (Advanced: 2 or 3 inputs → 3 an hour).
  - 8 are P3 → P4 (High-Tech, some with a P1 input).
  - ESI's schematics route gives only a name and a cycle time, so the table is bundled from the static data.
- **Planet types → P0** (exact): the full table is in `mechanics.md`.
  - The P2s and P3s each planet type can make **alone** are derived from it (exact).
  - Three P2s can't be made on any single planet: Microfiber Shielding, Polyaramids and Silicate Glass.
  - P4 can be made only on Barren and Temperate planets, in High-Tech Production Plants (exact).
- **CPU and powergrid** (exact; in the static data and in public ESI's type dogma), so `limits.md`'s statement that they
  aren't available is wrong:
  - each command centre level's budget: 1,675 CPU / 6,000 MW at level 0, 25,415 / 19,000 at V;
  - every pin's cost, including an extractor head at 110 CPU / 550 MW;
  - a link's base and per-km cost.
  The fits worked out from these numbers (links at minimum length) are inferred, from exact inputs:
  - a P0 → P2 planet at CCU IV holds 2 Advanced and 4 Basic factories with 11 heads, or 3 and 6 with 7;
  - at CCU V it holds 2 and 4 with 15 heads, or 3 and 6 with 10;
  - a factory planet at V holds 25 Advanced, or 19 High-Tech, with one launchpad; at IV, 22 or 15.
- **Extraction.**
  - The decay formula is CCP's crowdsourced developer documentation, and calli-eve's eve-pi implements the same
    (reported). Its constants are the static data's (exact).
  - Fed ESI's `qty_per_cycle`, `cycle_time`, `install_time` and `expiry_time`, it gives every cycle's output.
  - **Open:** the formula reads `qty_per_cycle` as a base for 15 minutes, while a May 2026 forum post says it is the
    current cycle's output. If the formula is right, `colony.ts` undervalues every program over 25 hours, by up to 16
    times.
  - Richness is client-only, so no planet's yield can be predicted before it is built.
- **Customs.**
  - Tax bases a unit (exact, dogma 1641): P0 5, P1 400, P2 7,200, P3 60,000, P4 1,200,000 ISK.
  - Export pays base × rate; import pays half that (reported); a command-centre launch pays 1.5× (reported).
  - **In sovereign null-sec the Orbital Skyhook is the customs office**, and its owner sets the rate (CCP, Equinox,
    7 June 2024). ESI shows no skyhook's rate.
  - Brave's wiki ("Brave Industry Taxes", last modified 17 July 2023) gives 2% on Barren and Temperate and 5% on the
    rest. These are the default (the user's choice, below).
  - High-sec planets have a mix of InterBus and player offices. A player office charges its owner's rate plus 10%,
    less one point a level of Customs Code Expertise (CCP-said). What an InterBus office charges in high-sec today
    isn't verified.
  - Low-sec and non-sov null-sec player offices charge the owner's rate alone.
- **Volumes** (exact, since June 2023): P0 0.005, P1 0.19, P2 0.75, P3 3 and P4 50 m³.
- **Prices** (17 October 2026):
  - Jita is deep for P1 and P2 and thin for some P3s and every P4.
  - The home markets (1st Byzantigoon at UALX-3, C-J6MT) are thin and priced as import markets: their sells sit
    5–30% over Jita's and their bids 5–30% under.
  - Freight at 900 ISK a m³ costs 20–50% of a P1's value, 6–11% of a P2's, and 3–6% of a P3's or P4's.
  - The cloud's home reads cover only 40 of the 83 planetary goods, because the watch set was built for Industry.
- **Alphas can't do PI** (exact): none of the planet skills is in any Alpha grade.

## The page

Planets keeps its place under Side hustles and gains sections in the address (`hustles/planets/<section>`), as
Industry has. The last section opened is kept in this browser.
- **Plan** and **Chart** arrive in stage 1.
- **Colonies** is today's panel, rebuilt in stage 2.
- The old four-step walkthrough goes (my call):
  - step 1's "refine or sell raw" becomes the P0 → P1 setup;
  - step 3's estimate becomes the planner;
  - step 4's build steps become each setup's "How to build it";
  - the region scan goes;
  - the skills panel stays.

**Show for** at the top picks whose figures every section uses: the main or an alt from the roster. It is kept in this
browser and falls back to the main without forgetting the kept one, as Industry's and Mining's do. In stage 1 it sets:
- the planets allowed: 1 + Interplanetary Consolidation;
- the command centre level its fits assume: Command Center Upgrades;
- the clone state: an Alpha, or a clone state not read, is said;
- the sales tax and broker fee, as Industry's `IndustryChar` gives them.

Skills not read are never level 0. In stage 2 it also picks whose colonies are shown, and **All** joins.

## Stage 1: plan a system

### Choosing the system

The user can:
- type a system's name;
- use "Where <main> is" (the main's location, with the location permission it already has; alts' locations aren't
  read);
- pick one of the systems the shown character's colonies are in (the main's in stage 1).

The system's planets and their types are read publicly, as is its security. Each planet is listed with its type and
the P0s it has.

### What it needs, and what it does when it doesn't have it

- **Extraction, in P0 an hour per extractor (one control unit with its heads), averaged over its program** (my call:
  the builder check, 17 October 2026).
  - **Learned** from the shown character's own extractors, keyed by planet type and P0 (falling back to the planet
    type's other P0s, said). Each one's average over its own program is by the formula, which already includes the
    decay. It keeps the program length and head count it was measured at.
  - **Typed** in the same unit: the "Total" the game shows for a program on that planet, divided by the program's
    hours, with that program's length and head count. The page says where in the game to read it.
  - Decay is never applied again to a learned or typed rate.
  - A rate holds only at the program length it was measured at. If the program length chosen below differs, the row
    says the rate is from N-day programs; nothing predicts another length (the game's per-cycle base for a longer
    program isn't documented).
  - Heads aren't scaled. A rate is for the head count it was measured with. The layout is chosen to fit that many
    heads per extractor, with factories sized to the output; if those heads don't fit at the shown character's CCU
    level, it says so.
  - When no rate exists, the setups are ranked at what the factories that fit could make. The row then says "if your
    extractors deliver X P0 an hour", like Industry's "before the facility tax", and never claims that rate.
  - Each figure says which of these it is. A rate learned on a planet type in another system says so: richness varies
    from planet to planet.
- **Customs tax, per planet type in this system, with a per-planet override** (my call: Brave's rates were by planet
  type).
  - Null-sec: Brave's wiki rates by default: 2% on Barren and Temperate, 5% on every other type. The user, 17 October
    2026: "use the taxes brave wiki states. it is usually up to date, i will tell you later if it is different".
    - The figure is said as Brave's wiki's, with the page's date. Any planet type or planet can be typed over it.
    - A system the user marks as not Brave's has no default: it is ranked before tax, and each row says what each 1%
      costs a day.
  - High-sec: the player office's 10% NPC part less Customs Code Expertise, plus the owner's typed rate; an InterBus
    office's rate is typed, said as unverified.
  - Low-sec: typed.
- **How often you reset**, as a program length. It defaults to the length of the shown character's own extractor
  programs, else 3 days (my call, said). It sets the upkeep (resets a week), and which learned rates apply as
  measured.
- **Where it sells.** The Industry doc's home hub, Jita, or Either (the better per good), with the Industry doc's
  freight route from the home hub to Jita. The prices are Industry's:
  - a home hub's own read, or Goonmetrics' prices;
  - Jita's live books for what's shown;
  - the sale less a tick at the industry share of the pace;
  - sales tax and the hub's broker fee as typed.
- **Not known is never 0.** A price nobody reads, a planet type the static data lacks, or skills not read each give a
  reason.

### The setup types, and what each one works out

Every setup uses only planets in the chosen system, at most one colony per planet per character, no more planets
than the character is allowed, and fits from the exact CPU and powergrid at the shown character's CCU level.
- **A fit uses each planet's own radius** (my call: the builder check). A link's minimum length is 0.012 × the planet's
  radius, and within one type the radius ranges from 348 to 159,270 km on Gas, so a median would make a head count look
  exact when it isn't.
- Radii come from CCP's static data (`mapPlanets.jsonl`), since ESI's planet route has none. They go in a chunk of
  their own, loaded only when a system is planned: about 67,000 planets, compact by system.
1. **P0 → P1 on each planet.** Each planet extracts and refines the P0 pair that pays most, and exports P1.
2. **P0 → P2 on each planet** (the user's setup). Each planet makes the best P2 it can make alone, in the layout that
   fits: a 2 + 4 layout with more heads, or 3 + 6 with fewer. The choice depends on the extraction rate.
3. **Extraction planets feeding a factory planet.** Some planets make P1 and export it; one planet imports the P1 and
   makes P2 or P3. This includes the three P2s no single planet makes, and the P3s whose P0s this system has. It pays
   export tax at each extraction planet and import tax at the factory, and the factory is sized to what it is fed.
4. **A factory planet on bought inputs.** It buys P1, P2 or P3 at the market (home, or Jita plus freight in) and makes
   P2, P3 or P4. P4 is made only on a Barren or Temperate planet in the system.
5. **Chains across characters.** A chain that needs more planets than one character has, P4 from scratch being the
   usual case.
   - It uses the characters whose skills are read, each with its own planet allowance and CCU level, in roster order
     starting with the shown character. It names the skills each still lacks, and says when there aren't enough
     characters.
   - **It is ranked by ISK a day per character used** (my call): its total ÷ the number of characters in it. So it sits
     in the same list as one character's setups on a like-for-like figure. Its row also shows the total and each
     character's planets and roles.

For each setup type, the planner shows its **best arrangement in this system**. Among arrangements with equal ISK,
it prefers the one with less upkeep. It shows:
- **ISK a day for the character.** A chain shows its total, and a share for each character.
- **Upkeep beside the ISK:**
  - resets a week;
  - factory restocks a week, from its storage and launchpad (10,000 m³);
  - m³ a week to haul from the system to market;
  - freight contracts a week: a contract's 5 M minimum is worth paying only on about 5,560 m³, so small outputs batch
    up.
- **Which planet does what**, one line per planet: its type, what it extracts, what it makes, how many factories and
  heads, and what it ships where.
- **Every output valued:**
  - the main product, plus any surplus P0 or P1 a layout leaves over;
  - each output at its own market's price after its own taxes and freight;
  - output beyond what the market takes at your share is said as building up, never counted as sold.
- **The taxes**, per planet and per tier.
- **How to build it:** the steps for this arrangement, from today's step 4, per planet.

The ranking is by ISK a day for the character. The user's own P0 → P2 setup always shows, even when it isn't top, with
how far it is from the best.

### The chart (P0 → P4)

- A grid of all 83 goods by tier, from the bundled static data, never evehelper's own data.
- Each good shows its value a unit and a m³ at the chosen market.
- Picking a good shows:
  - its recipe tree down to P0, with quantities and cycle times;
  - the planet types its P0s come from;
  - which planets of the chosen system supply them;
  - which setup types can make it here.
- With a system chosen, goods the system can't supply are greyed (evehelper's best idea).

### The main's colonies, kept (for the learning)

- The browser's colony read is kept in a document of its own (`colonies`), not only in memory.
- The cloud's hourly PI read of the main writes the same document. A colony is merged by its `last_update`.
- Each colony keeps ESI's raw answer in the app's names: planet, system, type, level, and every pin with its type,
  install and expiry times, extractor details, factory schematic and contents. It keeps the links and routes too.
- Stage 1 uses the kept colonies to learn extraction by planet type, and still shows them in today's panel.
- **The reading check.** Each kept extractor shows its program's total both ways: by the formula, and as
  `qty_per_cycle` × cycles.
  - The user compares one extractor with the "Total" the game shows for that program, once. That settles the reading
    in a commit that cites the extractor.
  - Until then, learned rates are marked "not yet checked against the game's total", and `colony.ts`'s per-hour figure
    is said as unconfirmed for cycles over 15 minutes.
  - **Until then, the planner ranks on the lower of the two readings** and shows the higher beside it (my call: the
    readings differ by 4× at 1-hour cycles, and a figure that may be four times too high must not put a setup on top).
  - The plan schedules the check right after the first stage 1 task that keeps colonies ships. The user's one number
    is asked for then.

### Home prices for every planetary good

The 43 planetary goods the cloud's home reads lack are added to what it reads: 28 P1–P3 and the 15 P0. This covers
Goonmetrics' six-hourly round and each hub's own market read. Goonmetrics' terms are unchanged: 50 types a call,
calls 1.5 s apart, a hub every six hours, its User-Agent, `GOONMETRICS_ON`. The extra types add about one call a hub.

## Stage 2: every character's colonies

- **The cloud reads every alt's colonies** with the alt's own login, only when the login holds the planets
  permission. This is part of the alts' hourly read (`altsHourly`, `:37`), filed under the alt in its own `colonies`
  document.
  - The main's comes from stage 1.
  - A read that fails keeps what's held. An alt whose login is refused says so, and shows what was read as of the last
    read (`lostSaid`).
- **Colonies** shows the shown character's colonies, or All:
  - each planet's real chain (extract → refine → make), from its schematics and routes;
  - what each planet makes a day, with every output valued;
  - goods building up, an input starving, or storage full;
  - each extractor's program and its total by the formula;
  - each planet against the planner's best for that planet and setup ("Planet I makes Nanites; the best P2 it can make
    alone here pays X more a day").
  - All adds up every character's colonies, and counts only characters whose colonies were read.
- **To do lists an expiring extractor for every character**, one item per extractor. An alt's item is keyed by
  character and judged only on a roster read of this session, as an alt's industry jobs are. The main's stays as
  today. **Mail stays the main's alone**: the cloud mails nothing for an alt (characters-cloud.md's rule).
- **The planner learns from every character's colonies.**

## Pure rules and I/O

The split stays as elsewhere: pure, tested rules in `src/lib`, with no `./config`, store, React or DOM. Any rule the
Worker uses has no enums or parameter properties. The builder names the modules. The rules needed:
- the bundle's loader;
- the fit, from CPU and powergrid;
- the extraction formula;
- the setups and their ranking;
- the colony chain from a real layout;
- the learning of extraction rates.

**Data.**
- A bundle built from CCP's static data by a script (as `industry-bundle.mjs`), with the build number. It holds:
  schematics, planet types → P0, pin types with CPU and powergrid, command centre levels, tax bases, volumes and the
  83 goods.
- It is loaded only by the Planets tab, as a chunk of its own.
- `pi.ts`'s hand-typed tables give way to it. That also fixes "Micro Organisms", which CCP spells "Microorganisms".

**Synced documents.**
- `colonies`: per character, merged by colony.
- Planets settings in a document of their own: per system, the customs tax by planet type with planet overrides, the
  typed extraction rates, and the program length.
- Both go through sanitizers. A Worker a version behind refuses an unknown document and `refusedDoc` holds it back. An
  older browser ignores it.

## The cloud's part

- Stage 1:
  - the main's hourly PI job keeps its layouts. Today it reads them only while PI alerts are on and mailed
    (`worker/src/alerts.ts`, `cfg.ev.pi && cfg.mailEv.pi`). So the read moves out from under those settings: it runs
    hourly whenever the main's cloud login holds the planets permission. The mail still follows the settings, and
    no login changes;
  - the planetary goods join the home reads.
- Stage 2: alts' colonies in the hourly alt read.
- ESI's `char-industry` group allows 600 requests every 15 minutes; one character with six planets costs seven reads
  an hour.
- No new cron. Migrations only add.

## Honest limits (for limits.md)

- A planet's yield can't be known before it is built. Learned rates average your own planets of that type, which can
  differ from planet to planet.
- The fits assume links at minimum length.
- Customs tax is typed, and an InterBus office's rate in high-sec is unverified.
- The extraction reading is unconfirmed until checked against the game once.
- Prices at a thin home market move with a few trades.
- Setups are compared within one system.

## Phone

Every section works at 390 px:
- the chart's tiers wrap;
- a setup's planet lines stack;
- tables keep their first column and fold the rest underneath.

## Testing

- `npm run check`: the bundle against the static data's counts and the research's derived tables (the P2s made alone,
  P4 planets), fits against the research's tables, and the extraction formula against CCP's worked example
  (`qty_per_cycle` 6,965, 30-minute cycles, 47.5 h: 789,314 in all).
- The setup rules on 5-NZNW's real planets at the main's skills.
- Every "not known" path.
- Stage 2's alt reads in `check-worker`, with the main's rows untouched.
- `npm run check-pages` and `check-phone`: a Planets case of its own with 5-NZNW, prices seeded, and the main's kept
  colonies. It checks the chart, each setup type's lines, a typed and an untyped tax, learned and typed rates, and an
  Alpha alt. Stage 2 adds alts' colonies and All.
- `check-income` doesn't move.

## Calls made in writing this (for the user to check)

- The old walkthrough goes; its pieces live on in the setups, as described in "The page".
- Customs tax is set per planet type for each system, with a per-planet override.
- The program length defaults to the user's own, else 3 days.
- Extraction is a rate per extractor, averaged over its program, at the head count and program length it was measured
  at. It is never scaled or decayed again.
- Fits use each planet's real radius, from a chunk loaded only when a system is planned.
- Chains across characters are ranked by ISK a day per character used.
- Until the in-game check, the planner ranks on the lower reading of `qty_per_cycle`.
- Alts' expiring extractors go on To do, never mail.
- The main's hourly PI read runs whatever the alert settings say.
- Following Industry: the "Either" market choice (`sell: 'best'`), and colonies given up dropped from the merged
  document. The haul from the system to the hub counts as upkeep, not ISK.

## Left to the builder

- Module and component names.
- The optimisation's method within each setup type, as long as it finds the best arrangement the rules allow and is
  quick enough to re-rank as inputs change.
- The chart's layout.
- How the planet lines read.
- Task order within a stage.
