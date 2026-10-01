# Several characters, stage 4: the Wallet's total, transfers between your characters, To do and Settings. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ISK moved between the owner's own characters is a transfer, never income or spending, wherever the Wallet and Results count money; the Wallet shows an "All characters" net worth beside the main's (never part of it, never saved); an alt whose login EVE refused is a To do item; Settings points at the Characters page and says "Delete all data" clears the alts' copy too.

**Architecture:** One pure rule decides what a transfer is (`ownTransfer` in `lib/roster.ts`): a donation, a direct trade or a contract entry whose two parties are the main and a character in `chars`. `lib/wallet.ts`' `categoryOf`, `describeRef`, `flows` and `unusual`, and `lib/results.ts`' `attribute`, take the set of your characters as an optional argument; without it they answer exactly as today, so every existing caller and test is unchanged until it passes the set. `flows` returns transfers apart (`between`), out of money in and money out, so play, the runway, the day's biggest cost, the month's report and cash-flow goals stop counting them. The Wallet and To do read the alt store (they join the short list allowed to), for the all-characters net worth and the alts' refused logins.

**Tech Stack:** React, TypeScript, Vite; the stage 2 alt store and roster; `npm run check-income` (the recording of the main's income figures, and the isolation test).

**Spec:** `docs/superpowers/specs/2026-09-30-multi-character-design.md`, section 3: "What the figures are" (the Wallet's "All characters" line), "Transfers between your own characters", "To do and Settings". Read `docs/notes/characters.md`, `docs/notes/positions-results.md` and `docs/notes/eve-facts.md` ("A `player_donation` journal entry has the giver as `first_party_id` and the receiver as `second_party_id`").

## Global Constraints

- **Without the set of your characters, every rule answers as today.** `categoryOf(e)`, `describeRef(r)`, `flows(…)`, `unusual(…)`, `attribute(inp)` called as now give identical results; existing tests pass untouched. `npm run check-income` must pass after every task: its ledger has `chars: {}`, so the recording can't move — if it does, a default changed.
- **Fails safe**: an entry counts as between your characters only when *both* parties are yours (the main and a character in `chars`, or two characters in `chars`). An entry that names its parties some other way stays what it is today. `chars` keeps removed alts, so past transfers to one stay transfers.
- **The main's net worth is the main's.** The "All characters" figure is computed on the page, shown beside the net worth, never added to its parts, the total, the liquid figure, the runway or what the Wallet saves to `netWorth`.
- **Alt data has no path into the main's ledger.** The alt store keeps its import rule; the allowed importers become `App.tsx`, `components/Characters.tsx`, `components/hustles/Mining.tsx`, `components/Wallet.tsx` and `components/Todo.tsx` (the test in `scripts/check.mjs` and `docs/notes/characters.md` change in the commit that makes each read it). The isolation half of `check-income` compares the Wallet's text with and without alts; the "All characters" line differs by design, so it carries `data-alts` and the snapshot leaves elements marked so out of the comparison (Task 3 changes the snapshot in the same commit).
- **Pure rules stay pure**: `lib/roster.ts` (the Worker imports it), `lib/wallet.ts`, `lib/results.ts` import nothing from `./config`, `./store` (not even a type, for Worker-imported ones), React or the DOM.
- **How the app looks and speaks** (`docs/notes/app-conventions.md`): "Between your characters" is the name everywhere (the Wallet's lines, the balance chart's dots, the CSV); figures say what they add up and how old they are; "–" with why for not known; nothing past 390 px.
- **Verify**: `npm run check`, `npm run build`, `npm run check-income` every task; `npm run check-pages` and `npm run check-phone` for any task touching a page; a browser look for the Wallet and To do.
- **Branch** `multi-character-wallet`; merged `--ff-only` to `main`, deleted both sides, `npm run deployed`. Push the branch after each task (the PC has crashed mid-work).
- **Commit messages explain the reasoning** and end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
  ```

## Review Focus

1. **A transfer counted twice or not at all.** ISK sent to an alt is "Donations given" (Personal: play) today; after this it must leave play *and* not reappear as money out anywhere (the runway, the biggest cost, the month's report, cash-flow goals). Task 1 tests `flows` with and without the set; Task 2 checks each consumer.
2. **Someone else's donation read as yours.** A donation from a stranger, or one whose parties are missing, stays a donation; only both-parties-yours is a transfer (Task 1 tests: a stranger's, one party missing, the main to an alt, an alt to the main, two alts).
3. **The all-characters line leaking into the main's net worth.** It must never reach `netWorth` (the Wallet's daily save) or any part/total; the isolation check proves the main's ledger equal with and without alts (Task 3).
4. **An alt removed with its data kept, or never read.** Past transfers to it still count (`chars` keeps it); its net worth adds nothing until read and the line says how many it counts.
5. **To do and an alt's login.** A refused alt login is one item per alt, keyed by its character, ticked off only by a newer roster read that shows it working (absent is not done: docs/notes/orders-alerts.md), and its button hands that alt over again — never the main's or the sender's login.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/roster.ts` | `ownTransfer(e, mine)`, `ownIds(mainId, chars)`. |
| `src/lib/wallet.ts` | `categoryOf`, `describeRef`, `flows` (+ `between`), `unusual` with the optional set. |
| `src/lib/results.ts` | `attribute`: a courier reward between your characters isn't Hauling. |
| `src/lib/income.ts` | passes the set through to `attribute` (from the ledger's own `chars` and its character). |
| `src/components/Wallet.tsx` | Passes the set everywhere; "Between your characters" apart; the "All characters" line; the chart's dots and CSV. |
| `src/components/Todo.tsx` | An alt's refused login as an item. |
| `src/components/Settings.tsx` | A link to Characters from the cloud panel; "Delete all data" mentions the alts' copy. |
| `scripts/income.mjs`, `scripts/check.mjs`, `docs/notes/*` | The snapshot skips `[data-alts]`; the importer list; the notes. |

---

### Task 1: What a transfer is, and the money rules that take it (pure)

**Files:** Modify `src/lib/roster.ts`, `src/lib/wallet.ts`, `src/lib/results.ts`, `src/lib/income.ts`; Test `scripts/check.mjs`.

**Interfaces (produces):**
```ts
// roster.ts
/** Your characters' IDs: the main and every character in chars (removed ones included: past transfers stay transfers). */
export function ownIds(mainId: number | null | undefined, chars: Record<string, unknown>): Set<number>;
/** A donation, direct trade or contract entry whose two parties are both yours. Missing parties: not a transfer. */
export function ownTransfer(e: { refType: string; firstPartyId?: number | null; secondPartyId?: number | null }, mine: Set<number> | undefined): boolean;
// wallet.ts (the optional last argument everywhere; absent = as today)
export function categoryOf(e, mine?: Set<number>): Category | null;   // a transfer → BETWEEN ({ key: 'between', label: 'Between your characters', kind: 'Transfer' })
export function describeRef(refType: string, e?: JournalEntry, mine?: Set<number>): string;   // a transfer → 'Between your characters'
export function flows(journal, txs, classOf, since, until?, mine?): { ins; outs; inTotal; outTotal; between: { in: number; out: number; count: number; parts: Part[] } };
export function unusual(journal, since, opts?, mine?): Unusual[];   // never flags an entry with your own character as the other party
// results.ts
export type AttributionInput = { …; mine?: Set<number> };   // a contract_reward between your characters isn't Hauling
```
`ownTransfer` is true when `refType` is `player_donation`, `player_trading`, or starts with `contract_`, and both `firstPartyId` and `secondPartyId` are set and in `mine`. `FlowKind` gains `'Transfer'` if `Category.kind` needs it (keep the type change minimal).

- [ ] **Step 1: Failing tests** ("--- transfers between your characters ---"): `ownTransfer` true for main→alt, alt→main, alt→alt donations, a `contract_price` between main and alt, a `player_trading` between them; false for a stranger→main donation, an entry with a missing party, a `bounty_prizes` entry between yours, and with `mine` undefined. `categoryOf` of a main→alt donation is `between` with the set, `donationOut` without. `flows` over a journal with a 100 M donation main→alt, a 5 M stranger donation in and a 2 M skill purchase: with the set, `outs` has no donation line and `between.out` is 100 M, `ins` keeps the stranger's 5 M; without the set, exactly today's lines (compare against `flows` called the old way, deep-equal). `unusual` with the set doesn't flag a 100 M main→alt donation or a first donation in from an alt; without it, it does. `attribute` doesn't count a `contract_reward` from an alt to the main as Hauling with `mine`, and does without.
- [ ] **Step 2: See them fail. Step 3: Implement** (each rule checks `mine && ownTransfer(e, mine)` first; nothing else changes). `income.ts`' `activityEvents` passes `mine: ownIds(<the ledger's character>, d.chars)` to `attribute` — the ledger's character: add an optional `charId` argument to `activityEvents` (callers pass the main's; for an alt, its own ID; absent = no set, as today).
- [ ] **Step 4**: `npm run check`, `npm run build`, `npm run check-income` (as recorded: its ledger has `chars: {}`). **Step 5**: commit, push.

---

### Task 2: The Wallet and Results count transfers as transfers

**Files:** Modify `src/components/Wallet.tsx`, `src/components/Results.tsx` (and `components/activityEvents.ts` if the main's ID must reach `activityEvents`); Test `npm run check-pages`, `npm run check-phone`, `npm run check-income`.

- [ ] **Step 1: The set.** In the Wallet, `const mine = useMemo(() => ownIds(auth?.characterId, d.chars), [auth?.characterId, d.chars])`, passed to every `flows`, `categoryOf`, `describeRef` and `unusual` call (the period, the 30 days, each month, today, the unusual list, the chart's dots, the CSV). Results passes it to `attribute` through `useActivityEvents` (the main's ID and `d.chars`).
- [ ] **Step 2: "Between your characters".** A line of its own under money in and money out (not inside either, not in their totals): what went to your other characters and what came back in the window, with a tip ("ISK moved between your own characters: not income, not spending. • Sent to an alt is still yours. • Each entry names both characters."). It opens to its entries like the other lines (parts and entries from `flows`' `between`). Shown only when there is any.
- [ ] **Step 3: Everything worked out from flows follows.** Play (Personal spending) no longer includes ISK sent to your own characters; the runway, the day's biggest cost, the month's report and cash-flow goals read `outs`/`ins`, so they follow; check each one and say in the report which it is. The balance chart's dot for such an entry and its CSV row say "Between your characters".
- [ ] **Step 4: Checks**: `npm run check`, `npm run build`, `npm run check-pages`, `npm run check-phone`, `npm run check-income` (as recorded).
- [ ] **Step 5**: commit, push.

---

### Task 3: The Wallet's "All characters" net worth

**Files:** Modify `src/components/Wallet.tsx` (imports the alt store), `scripts/check.mjs` (the importer list), `scripts/income.mjs` (the snapshot leaves `[data-alts]` out), `docs/notes/characters.md` (the list, and why).

- [ ] **Step 1**: A figure beside the net worth, inside an element marked `data-alts`: "All characters: X" = the main's live total + each alt's newest daily net-worth point (from its pulled copy, `altLedger(…).netWorth`), with "N of M counted" and a tip saying each alt's point is its own date (the newest), CCP's rough average prices, and that it's never part of the main's net worth, its trend or what's saved. Hidden with no alts. An alt with no point adds nothing and the count says so.
- [ ] **Step 2**: The importer test lists `components/Wallet.tsx`; `characters.md` says why (the all-characters line). `scripts/income.mjs`' snapshot removes `[data-alts]` elements (a clone of `.page` with them removed, then its text) before comparing the Wallet's text, with a comment saying why; the ledger comparison is unchanged (the line is never saved).
- [ ] **Step 3**: `npm run check`, `npm run build`, `npm run check-pages`, `npm run check-phone`, `npm run check-income` (as recorded; isolation ok — and it must still fail if the line were saved: say in the report how you checked that, e.g. a planted `update` of `netWorth` with the all-characters total, caught, reverted). **Step 4**: commit, push.

---

### Task 4: To do and Settings

**Files:** Modify `src/components/Todo.tsx` (imports the alt store's roster hook), `src/components/Settings.tsx`, `scripts/check.mjs` (the importer list), `docs/notes/characters.md`, `docs/notes/orders-alerts.md`.

- [ ] **Step 1: A refused alt login.** For each roster entry whose login is refused or missing (`loginState(entry, …).state !== 'working'`), an item: key `cloudLogin:alt:<charId>`, `ver` its `refusedAt` (or `'none'`), kind `cloudLogin`, source `cloud`, title "Hand the cloud <name>’s login again", detail what stops ("the cloud reads nothing for <name>: no wallet, skills or mining"), and an action that opens the Characters page (`route: 'characters'`), never `loginForCloud` / `loginMailerForCloud` (those are the main's and the sender's). It ticks off only on a newer roster read (`rosterAt` newer than the read that showed it) whose entry is working again; an alt taken off the roster ticks it off on a newer read too ("No longer one of your characters"). Use the existing `cloudLogin` judge's pattern.
- [ ] **Step 2: Settings.** The cloud panel gains a line linking to the Characters page ("Your other characters are read by the cloud too: Characters"). "Delete all data"'s dialog, when the alt store holds anything, adds "Your other characters’ copy in this browser goes too; the cloud keeps theirs." (Settings may read only `useAltRoster`-style data through the existing allowed importer, or compute it from `d.chars` — prefer `d.chars` (the main ledger's own doc) to avoid another importer: "if you have other characters" when `d.chars` has any.)
- [ ] **Step 3**: the importer list gains `components/Todo.tsx` (if it imports the alt store); notes. **Step 4**: checks (all five). **Step 5**: commit, push.

---

### Task 5: Ship, and see the first transfer

- [ ] **Step 1**: clean tree; all five checks.
- [ ] **Step 2**: merge `--ff-only`, push, delete the branch both sides, `npm run deployed` → `Shipped.`; grep the deployed Wallet chunk for "Between your characters".
- [ ] **Step 3**: In production the owner's Wallet shows the 100 M sent to FannySchmeller on 30 September as "Between your characters", out of "Donations given" and play; FannySchmeller's own card on Characters shows the same 100 M nowhere as income. Check against D1 (the main's `player_donation` row naming 2122193260).
- [ ] **Step 4**: Notes: `characters.md` (transfers, the all-characters line, To do), `positions-results.md` (play and the runway no longer count ISK sent to your own characters), `orders-alerts.md` (the alt login item). Commit, ship.
