# Mining

Decisions worth not undoing. The Mining side hustle: the ledger and sessions, Scaling up's tree and fits, and mining
across characters. Split from loyalty-hustles.md and characters.md on 1 October 2026; how alts are kept apart is in
characters.md, the dogma behind the yields in eve-ships.md.

- **Mining replaced Injectors** (`lib/mining.ts` pure, `hustles/Mining.tsx`, `worker/src/mining.ts`, migration 0013; the
  mining records kind; scope `esi-industry.read_character_mining.v1`). The user found the Injectors tab useless and asked
  for a Mining Ledger with a guide to scale up: a solo side income now, a multiboxed fleet later, so every mining record
  and tick carries the character that mined it. ESI's ledger is one row per day, system and ore, 30 days, cached 10
  minutes; the browser's sync and the cloud keep it as records past that. The cloud reads it every ten minutes and keeps
  what grew between reads as ticks; runs of ticks under 25 minutes apart are sessions, timed to about ten minutes either
  way (ESI's cache), with m³ a minute and ISK an hour. Each ore is valued the best of three ways after tax: its own Jita
  bid, its compressed form's bid ("Compressed " + its name resolves for plain and graded ores alike; compression keeps
  one unit for one at a hundredth of the volume), or reprocessed at your yield at Jita 4-4. In the first test run,
  Compressed Scordite fetched 18.36 against 16.43 as mined. ESI's name lookup refuses a list with a name twice ("'names'
  items are not all unique"), which is how Scordite, both mined and the ladder's fallback, first priced nothing
  compressed. The first scaling guide was a four-rung ladder on EVE University's published yields; the mining tree below
  replaced it the same day. Checked in a test browser with a seeded week of mining, stand-in cloud ticks and the user's
  real skills.
- **Scaling up is a flowchart of every mining hull, each with three fits** (`lib/miningTree.ts`, `lib/miningYield.ts`,
  `lib/miningFits.ts`, `lib/miningMastery.ts`, all pure; `hustles/MiningTree.tsx`, `hustles/MasteryTiers.tsx`). The user
  asked for "all the other ships and paths … including the new destroyers", the three exhumers, upgrades and crystals on
  each ship, fits from popular fitting sites rather than EVE University alone, "a mastery level taking you from … just able
  to hop into one to getting the max out of it", as "an interactive animated flowchart" whose nodes open; and, when shown
  the design, that the ship you're in come from ESI with a button only as a fallback, and that crits and the other recent
  mining changes be in it. Seventeen hulls in lanes (frigates, expedition frigates, destroyers, then barges and exhumers
  by tank, hold and yield, then Porpoise, Orca, Rorqual); the Perseverance sits apart, since only a contract leads to it.
  Each node says whether you can fly it, whether your queue brings it, or how many skills it lacks; the ship you're in
  (ESI's `/ship/`, else the one your sessions mined most in) glows and the paths out of it flow. A node opens to the hull
  (Jita price, hold, slots, your measured pace in it, the skills to fly it with your queue) and Just in / Solid / Max:
  each tier's fit priced line by line, what it mines a minute at your skills and with every skill at V, crits, residue,
  cost, payback over what you mine now, the skills it asks for, and Copy fit (EFT, which the fitting window imports),
  Copy for Multibuy, Save fit in game. Crystals follow what you mine most (`mainFamily`: Simple before you've mined).
  On a phone the chart is a list and a ship opens under its row.
  **Yields are worked out from ESI's dogma, not copied** (`fitYield`): see eve-ships.md for the rules. It reproduces EVE
  Workbench's engine exactly where that can be checked (Hulk with two Modulated Strip Miner IIs, no crystal, three MLU
  IIs, all V: 22.33 m³/s; Covetor 16.55), and adds crits, which EVE Workbench leaves out. The user's Hulk at Solid (Type B
  II) comes to 3,177 m³ a minute at all V against EVE Workbench's 3,015; their own skills (Mining I) give 1,185.
  **The fits** came from a research pass on 29 September 2026: EVE Workbench's API (top 15 by votes and the 10 newest per
  hull, with votes and dates) against what zKillboard's last 400 losses of each hull carried, EVE University and forum
  yield threads as a cross-check. Each tier names its source. All 185 names (items, charges, crystals of every family,
  skills) resolved in ESI before shipping, and a check keeps every fit within its hull's slots. A fit from before Catalyst
  was used only where nothing newer existed, and its source says so. No tiers for the Rorqual (no fit published since Catalyst;
  its losses' commonest modules are in its note) or the Perseverance (none popular). What the research found worth
  knowing: the Pioneer mines about a third more than a Venture for ~3 M; the Outrider is a booster and escape hull, not a
  yield step; ORE Strip Miners (~189 M each) mine less than Modulated Strip Miner II with Type A II but leave no residue
  and burn no crystals, which is why the Mackinaw's no-residue alternative uses them; there is no ore-yield rig; Covetor and Hulk want a
  booster or hauler, the Skiff and Mackinaw are the solo high-sec exhumers. The research's first two requests sent a
  User-Agent naming the project and the user's contact details to ESI and zKillboard; later ones didn't, and a research
  prompt must say which User-Agent to send.
  **Any ore and grade can be picked** (`ScalingUp` in Mining.tsx; `oreBase`, `gradeLabel`, `gradeRank`, `isMinedForm` in
  miningFits.ts). The user, on seeing it priced for the ore mined most: "there should be a switch or a selector for
  different ore and grades you can set so you can compare." An Ore select lists every asteroid and moon ore by crystal
  family (47, resolved by name once; your mined ones marked; Mercoxit left out, since the fits' lasers can't mine it),
  and a Grade row its grades poorest first (0-Grade, the plain ore, II-, III-, IV-Grade; Brimful and Glistening for
  moon ore), read from the ore's inventory group: the market types named for it that aren't compressed. A moon ore's
  group holds all four ores of its rarity, hence the name check, and ESI names Scordite 0-Grade with a trailing space,
  which broke its "Compressed …" lookup until names were trimmed. The pick sets the crystals every fit loads and the ISK
  a m³ behind Worth and payback (the page's own three-way pricing, now `priceOres`); the m³ a minute doesn't change. It
  is kept in this browser, with "Back to <ore>, what you mine most". Checked against ESI: Kernite at Jita's 467.2 bid,
  less 3.375% tax, over 1.2 m³ is the 376.19 a m³ shown.
  **Mercoxit has its fits** (`mercoxitTier`, `DEEP_CORE`, `DEEP_CORE_RIG` in miningFits.ts; `MercoxitNote` in
  MasteryTiers.tsx). It was first left out of the picker, since no fit's lasers could mine it; the user asked for it for
  going back to null-sec. Picking Mercoxit (or its II/III-Grade) turns each fit that mines ore into its Mercoxit version:
  its lasers swapped for deep-core ones like for like (Modulated Strip Miner II, Strip Miner I or ORE Strip Miner to
  Modulated Deep Core Strip Miner II; Miner I/II, EP-S or ORE Miner to Modulated Deep Core Miner II), loaded with
  Mercoxit Type A crystals (A II where the fit had tech II crystals), and the Medium Deep Core Mining Optimization rig in
  place of a shield reinforcer, else a field extender, when the calibration still fits (never a processor rig, which the
  fit's CPU may need). That is how miners do it: the research's saved pulls show deep-core strip miners on 30 Procurers,
  28 Skiffs, 23 Mackinaws and 10 Retrievers of each hull's last 400 losses, Mercoxit Type A II the crystal most loaded
  (21 Procurers, 15 Mackinaws), the deep-core rig on 51 Mackinaws, and EVE Workbench's newest Skiff fit carrying two
  deep-core strip miners and 80 Mercoxit crystals in its cargo for the swap. From ESI (30 September 2026): the deep-core
  strip miner mines 80 a cycle to the Modulated Strip Miner II's 120, at the same 60 CPU and 12 powergrid (a Strip Miner
  I's 10 powergrid, an ORE Strip Miner's 50 CPU; a Modulated Deep Core Miner II 80 and 3 against EP-S 65, Miner I 60);
  it needs Mining V and Deep Core Mining II, and takes Mercoxit or ordinary crystals. There's only a Medium deep-core
  rig, 250 of a hull's 400 calibration, +16% for lasers that need Deep Core Mining (effect 5069; the yield counts it only
  on those). Mercoxit is 40 m³ a unit, and its gas-cloud chance is 5% (the ore's 522), cut a tenth a level by Deep Core
  Mining (543). The page says what the swap changed, when the lasers need more CPU or powergrid than the fit's own (the
  app doesn't fit ships, so it says to check in game), where the rig went or why it didn't fit, and the gas-cloud chance
  at your skill; Max adds Deep Core Mining V. Ice fits and boosters say they have no Mercoxit version. On the user's skills
  a Solid Procurer on Mercoxit reads 572 m³ a minute (959 at all V), with the rig in place of its EM reinforcer; a Solid
  Hulk has no room for the rig beside its processor rig.
  **ISK an hour was checked by hand** (30 September 2026, the user asked): on 39 fits over 11 hulls and five ores, every
  figure was m³ a minute × 60 × ISK a m³, and the ISK a m³ matched live Jita bids from ESI to the cent (Kernite 467.6 ×
  (1 − tax) ÷ 1.2 m³). Two tier ladders didn't climb, and were fixed:
  - **The Mackinaw's Max was its no-residue fit** (two ORE Strip Miners: 799 m³ a minute against the Solid's 1,119). Max is
    now the Solid with both yield implants and every skill at V, like the Hulk's; the ORE Strip Miner fit is a fourth
    choice, "No residue" (`key: 'alt'` with a `label`).
  - **On Mercoxit the Hulk's Solid and Max mined less than its Just in**: their Tech II processor rig takes 300 of 400
    calibration, so the deep-core rig (+16%) had no room. The swap now tries, in turn, a tank rig; the processor rig when
    the CPU fits without it; and stepping a Tech II processor rig down to Tech I (150) with a tank rig making way, each
    CPU-checked with every skill at V (`fitCpu`; see eve-ships.md). The Hulk's Solid and Max now take the third; the page says
    what the fit uses and has, and when your own skills leave it short.
  **A full ore hold** shows beside ISK an hour: the hold at your skills (Mining Barge and Exhumers grow the Retriever's and
  Mackinaw's, lib/cargo.ts; the tree's Ore hold says it too), worth that many m³ of the ore picked, and how long the fit
  takes to fill it.
  **Bonuses count only through their effect, for fitted items as for hulls.** A Drone Mining Augmentor carries the same
  434 (+10%) as a Mining Laser Upgrade, through a drone-only effect (623); counted by attribute it put the Retriever's
  Just in tier 10% high. Caught in review before shipping. Also found by looking: locked nodes were see-through (a lit
  path struck through "Outrider"), the chart's nodes overlapped under ~950 px (it now scrolls sideways under 1,180), and
  "gold" in the copy, since the accents change with the theme (the copy names the marks instead).
  **Across characters** (stage 3 of several characters; how alts are kept apart is in characters.md): a filter (All, or
  one character) that the tiles, the ore table and the sessions follow; "Your characters", a row each with what it mined
  in 30 days, its worth, days, sessions, ISK an hour and right now, and the fleet's total; sessions say who mined; and
  Scaling up has "Show for", its tree, tiers and skill strip at that character's skills, with its ship, pace and
  most-mined ore. The closing line promising a fleet "later" went. So did two zeros that stood for not known: "0 m³"
  for ore whose volume wasn't read, and "0 ISK" for ore not priced yet. Ticks are read once a visit, then the main's when
  its own records grow (their count and units: the ESI sync rebuilds the records object on every read) and the alts'
  when a roster revision moves; the main's used to be re-read only on an alt's revision. Ore is priced as on the
  Characters page (`useMinedWorth`, with each alt's pulled names), only ores not yet priced when a new one is named.
- **Mining across characters** (stage 3: `sessionsByCharacter`, `perCharacter`, `altRightNow` in `lib/mining.ts`;
  `lib/pilot.ts`, `components/pilot.tsx`; `hustles/miningFleet.ts`, `hustles/Mining.tsx`). The tab reads every character's
  records (the main's from the ledger, an alt's from its pulled copy through `altLedger`) and ticks (`/v1/mining/ticks`,
  tagged as the main's, and `/v1/alts/mining/ticks`), and writes nothing of an alt's anywhere.
  - **Sessions are built one character at a time.** Two characters mining at once are read in the same rounds, so their
    ticks interleave; built together they'd be one session with both ores summed and a doubled pace.
  - **Whose skills a component shows is a pilot** (`usePilot`): the main, from the store, everywhere, exactly as those
    components read it before, unless a `PilotProvider` hands it another. Only Scaling up is wrapped, for the character
    "Show for" picks, so an alt chosen there can't reach the Abyssal tree, Hauling or Settings. An alt's pilot is the
    levels it can use (an Alpha's capped skills at their active level, `meta.activeSkills`), its own queue and attributes,
    and Alpha's half-speed training. A skill Alpha caps (`capped`, `alphaCap`) has no training time: timed from its
    trained points it read "Mining V takes 1 min" and every barge "1 skill to train" (the final review); it now says
    "Trained to V; Alpha uses IV: Omega opens it" or "Alpha can’t use it: Omega opens it", and a hull's tip says it
    needs Omega. The main has no `capped`. An empty skills doc is "not read" (`skillsUnread`): its tree is drawn neither
    flyable nor locked and its tiers are at V, saying so, since worked out at no skills they'd read as the alt's own. The
    words go through the pilot too (`whose`, `who`: "at Miner Two's skills", "Miner Two can fly it"); for the main every
    string is as it was. Save fit in game is the main's alone: it saves to the logged-in character's fittings.
  - **An alt's right now is the cloud's**: its ship at its last mining read, "mining" when its ledger grew in that read
    or the one before (and only when the alts' ticks were read), always "as of" the read's time, and in the past tense
    past a session's gap ("Was in a Venture as of …"), since a refused login's last read stays. Where an alt is and
    whether it's logged in aren't read; `useRightNow` stays the main's.
  - **Its ore is valued the main's way** (your skills, standing and tax), as on the Characters page.
  - **Nothing not known reads as a zero**: an alt whose mining the cloud hasn't read says "Not read yet" across its row,
    or, with its login refused or none kept, to hand it over again (the pilot's `lost`): "Not read yet" never resolves
    there. A tick read that failed is "–" rather than no sessions, and a Worker a version behind (404 on the alt route) is
    one line under Sessions, never an error; neither reads as "No sessions seen" or "Once the cloud has seen X mine". `useMiningFleet` says `loading` until the first read after the cloud comes on
    answers, so no such line flashes, and clears the ticks when the cloud is switched off.
  - **The filter and "Show for" are kept per browser** (`jita-ledger:mining-char`, `jita-ledger:mining-show`). One naming
    a character no longer on the roster falls back (All; the filter's character, else the main) without overwriting
    what's kept, since the roster loads after the page first draws. **Picking in the filter lets go of Show for**, so
    Scaling up follows the filter's character (the main for All): kept, it stayed on one alt while the tiles showed
    another, on every later visit too (the controller's ruling; missing until the final review).
  - The page check's large ledger has the main's own mining too (`scripts/ledgers.mjs`), so the tab adds the main to
    the alts there; mining isn't income, and the income recording didn't move. It also opens the tab from kept choices
    (`MINING_CASES` in `scripts/pages.mjs`): the Alpha alt picked and shown, then a hull open; the refused alt shown; a
    kept character gone. Each must draw text only that path draws: until the final review the deploy never drew an
    alt's pilot, so a throw there would have shipped.
