---
paths:
  - "src/components/hustles/PlanetsChart.tsx"
  - "src/lib/piChart.ts"
---

# Planets: the Chart

Decisions worth not undoing. The Chart (`hustles/planets/chart`): every planetary good by tier, a picked good's recipe drawn down to P0,
and which setups can make it in the system Plan plans. Split from planets.md on 25 October 2026, word for word (the notes budget:
`planetsPlanning.ts` loaded 139,601 of 140,000); the rest of the page is there, the prices it shows in planets-market.md.

The rest of the Planets page is in `docs/notes/planets.md`, the prices it shows in `docs/notes/planets-market.md`.

- **Chart** (`PlanetsChart.tsx`, `piChart.ts`): the 83 goods by tier from the bundle (never evehelper's data), each tier most ISK a
  unit first, a good not valued last (24 October 2026, the user: "so i can easily see the highest earners first"), each valued a unit
  and a m³ at the chosen market, a picked good's recipe down to P0 with quantities and cycles, the planet types and the system's
  planets that give its P0s. **Ruling T12-1**: "Which setups can make it at X" reads what each kind *can* make from the bundle
  (`canMake`), beside what Plan's ranking *does* make (`makingIn`, from roles); roles alone can't name Nanites at 5-NZNW, the
  plan's own example (the ranked P0 → P2 makes Mechanical Parts there: Nanites is the cheapest Barren P2). A chain's P3 "can"
  only when it needs more planets than one character has (`CHAIN_P3_WHEN`). **Ruling T12-2**: each value says the book it's on
  (`UnitNet.book`: Jita now, this morning's Jita book, the hub's own read, Goonmetrics'), since only the ranking's goods are read
  live. With Sell at the hub, a good it doesn't price is valued at Jita's (F11, planets-market.md): the chip ends "· Jita's"
  (`data-fallback`), its tip and recipe head say "No price at UALX-3: valued at Jita's: … (Jita lists it at …)"; Oxides read "–".
  Goods the system can't supply are greyed (`aria-disabled`, still pickable): **UALX-3 lacks four P0s**, not the plan's
  two (no Lava, Plasma, Ice or Oceanic planet: Felsic Magma, Heavy Metals, Non-CS Crystals, Planktic Colonies), and 40 goods are
  greyed there; 5-NZNW has all 15. Scrolls to the recipe only on a pick, never on opening with a good kept
  (`jita-ledger:planets-good`).
  - **The picked good's panel is drawn** (the user, 24 October 2026: "hard to read and process… use some icons or images or graphics"; 600 px beside the grid): ISK a unit and a m³ as tiles; the recipe as a left-to-right tree of icon cards (`recipeTree`, a good used twice appears once per parent, so no line crosses; paths are the ship trees' `edgeShape`, and check.mjs runs `treeProblems` over all 83 goods at the card size `RECIPE_BOX`); each step as an equation of icons with a facility badge and its cycle; P0s with their planet types' icons (images.evetech.net serves `/types/<planet type id>/icon`). The sums "in all" stay as chips.
