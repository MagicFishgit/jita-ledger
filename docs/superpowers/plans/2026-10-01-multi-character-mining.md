# Several characters, stage 3: Mining across characters. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Mining tab follows every character: what each mined, its sessions (two characters mining at once are two sessions), a per-character table with fleet totals and a character filter, and "Scaling up" shown for one chosen character with that character's own skills, queue, ship and pace. The main's own figures and every other page stay as they are.

**Architecture:** Ticks and sessions gain a character (`charId`); sessions are built one character at a time (pure, `lib/mining.ts`). The skill-reading components (`ShipTree`, `MiningTree`, `MasteryTiers`, `SkillStrip`, `SkillNeeds`, `useTrainTimes`, `FitActions`) read a *pilot* from a React context instead of the store; with no provider the pilot is the main, built from the store exactly as today, so every page outside Mining is unchanged. The Mining tab provides an alt's pilot (built from its pulled copy, usable skills) when "Show for" picks one. The Mining tab joins the short list of files allowed to read the alt store; an alt's right-now comes from the cloud's last mining read, never live ESI.

**Tech Stack:** React, TypeScript, Vite; the stage 1 Worker route `GET /v1/alts/mining/ticks` (live since 30 September 2026, answers each alt's ticks with its `charId`); the stage 2 alt store and `altLedger`.

**Spec:** `docs/superpowers/specs/2026-09-30-multi-character-design.md`, section 3, "Mining". Read `docs/notes/characters.md` and the Mining parts of `docs/notes/loyalty-hustles.md` too.

## Global Constraints

- **Alt data has no path into the main's ledger.** The alt store keeps its import rule (`dataGeneration`, `mergeChars`, `onClearAll` from `./store`); the files allowed to import it become `App.tsx`, `components/Characters.tsx` and `components/hustles/Mining.tsx` (the test in `scripts/check.mjs` and `docs/notes/characters.md` change in the same commit that makes Mining read it). Nothing calls `update()` with an alt's value. `npm run check-income` (the isolation test opens `hustles/mining` with alts that mine) must pass after every task.
- **Every other page is unchanged.** With no `PilotProvider`, `usePilot()` returns the main built from the store with the same values the components read today (`d.skills`, `d.meta.skillQueue`, `d.meta.skillSp`, `d.meta.attributes`, `d.settings.clone === 'alpha'`). The Abyssal and Hauling trees, Settings' skill boxes, Orders' trade-skill line and every `SkillStrip` outside Mining read the main.
- **An alt's pilot uses its usable skills** (`usableSkills(trained, active)` in `lib/roster.ts`), its own queue, skill points and attributes, and trains at half speed when Alpha (its `altLedger` settings' clone: detected, else set by hand, else Omega).
- **"Right now" for an alt is the cloud's**: the ship at its last mining read (`entry.ship`, `entry.shipAt` from the roster) and "mining" when its ledger grew in that read or the one before; it always says how old it is ("as of 14:20"). Where an alt is and whether it's logged in aren't read. `useRightNow` stays the main's.
- **For an alt, "Save fit in game" is hidden** (it saves to the main's fittings); Copy fit and Copy for Multibuy stay.
- **Pure rules stay pure**: `lib/mining.ts` (the Worker imports it) and any new `lib/` module import nothing from `./config`, `./store` (not even a type, for Worker-imported ones), React or the DOM.
- **A Worker a version behind**: `GET /v1/alts/mining/ticks` answering 404 means no alt sessions, said once, never an error.
- **How the app looks and speaks** (`docs/notes/app-conventions.md`): tiles, short lines, "–" with why for not known, never a zero; a figure says how old it is; lists keyed by ID; tips as a lead line then "• " bullets; nothing past 390 px.
- **Verify**: `npm run check`, `npm run build`, `npm run check-income` every task; `npm run check-pages` and `npm run check-phone` for any task touching a page; a browser look for the Mining tab.
- **Branch** `multi-character-mining`; merged `--ff-only` to `main`, deleted, `npm run deployed`.
- **Commit messages explain the reasoning** and end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
  ```

## Review Focus

1. **Two characters mining at once.** Their ticks interleave in time; built together they'd be one session with both ores summed and a doubled m³ a minute. Sessions are built per character (Task 1 test: two characters' interleaved ticks give two sessions, each with its own ore and pace).
2. **A pilot leaking across pages.** If the provider sat too high, or `usePilot` cached the alt, the Abyssal tree or Settings would show an alt's skills. Task 2: the default is the main and is rebuilt from the store each render; `check-pages` and `check-income` stay green; the browser look opens Abyssal after choosing an alt in Mining.
3. **An alt with nothing read, or a Worker a version behind.** No skills yet: its pilot says so ("Not read yet") rather than drawing every ship as unflyable; no ticks route: no alt sessions and one line saying the cloud isn't ready, never an error (Task 3, Task 4).
4. **A stale right-now.** The cloud stopped reading an alt (login refused) hours ago: its ship and "mining" are as of then and say so; never "mining now" from an old read (Task 1 test on `altRightNow`).
5. **The filter and "Show for" across a reload, and a character removed.** The kept choice names a character no longer on the roster: fall back to All / the main, never a blank page (Task 4).

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/mining.ts` | `CharTick`, `sessionsByCharacter`, `perCharacter`, `altRightNow`. |
| `src/lib/pilot.ts` (new, pure) | `Pilot` and `pilotFrom(d, who, usable)`: what the skill components need from a ledger. |
| `src/components/pilot.tsx` (new) | `PilotProvider`, `usePilot()` (default: the main from the store). |
| `src/components/{ShipTree,SkillStrip,FitParts}.tsx`, `src/components/hustles/{MiningTree,MasteryTiers}.tsx` | Read `usePilot()` where they read the store's skills today; `FitActions` hides Save fit for an alt. |
| `src/lib/cloud.ts` | `cloudAltTicks(days)`. |
| `src/components/hustles/miningFleet.ts` (new) | `useMiningFleet()`: the characters, their records, ticks and pilots, for the tab. |
| `src/components/hustles/Mining.tsx` | The filter, per-character table, sessions with who, alt right-now, "Show for". |
| `scripts/check.mjs`, `docs/notes/characters.md`, `docs/notes/loyalty-hustles.md` | The importer list, the notes. |

---

### Task 1: Sessions per character, totals per character, an alt's right-now (pure)

**Files:** Modify `src/lib/mining.ts`; Test `scripts/check.mjs`.

**Interfaces (produces):**
```ts
export type CharTick = MiningTick & { charId: number };
export type CharSession = MiningSession & { charId: number };
/** Sessions built one character at a time, then all of them in start order. */
export function sessionsByCharacter(ticks: CharTick[], every?: number, gap?: number): CharSession[];
export type CharTotals = { units: number; m3: number | null; isk: number; priced: number; ores: number; days: number };
/** Each character's mining: minedTotal plus the days it mined on. */
export function perCharacter(records: MiningRecord[], volumeOf: (t: number) => number | null, worthOf: (t: number) => number | null): Map<number, CharTotals>;
/** An alt's right-now from the cloud: the ship at its last mining read, and whether its ledger grew in that read or the one before. */
export function altRightNow(entry: { ship: number | null; shipAt: number | null }, ticks: { at: number }[], every?: number): { ship: number | null; at: number | null; mining: boolean };
```

- [ ] **Step 1: Failing tests** (in `scripts/check.mjs`, a section "--- mining across characters ---"):
  - two characters' ticks interleaved 10 minutes apart over 40 minutes (A on ore 1228, B on ore 1230) → `sessionsByCharacter` gives two sessions, one per `charId`, each with only its own ore and `start = first tick − every`; the same ticks without `charId` through `miningSessions` give one (the bug it prevents, said in the test name);
  - `perCharacter` over records of two characters: units, m³, ISK and `days` (distinct dates) per character; an unknown volume makes that character's `m3` null (as `minedTotal`), the other's stays a number;
  - `altRightNow`: a tick at `shipAt` → mining; one at `shipAt − every` → mining (the read before); one at `shipAt − 2 × every − 1` → not; no `shipAt` → `{ ship: null, at: null, mining: false }`; the `at` is `shipAt`, whatever its age (the page says the age).
- [ ] **Step 2: See them fail; Step 3: implement** (`sessionsByCharacter` groups by `charId`, calls `miningSessions` per group, tags each session, sorts by `start`; `perCharacter` groups records and calls `minedTotal`, adding `days`; `altRightNow` as specified); **Step 4: all pass** (`npm run check`, `npm run build`, `npm run check-income`); **Step 5: commit.**

---

### Task 2: The pilot

**Files:** Create `src/lib/pilot.ts`, `src/components/pilot.tsx`; Modify `ShipTree.tsx`, `SkillStrip.tsx` (`useTrainTimes`, `SkillStrip`, `SkillNeeds` only; `useTradeQueue` and `TradeSkillsLine` stay on the store: trade is the main's), `FitParts.tsx` (`FitActions`), `hustles/MiningTree.tsx`, `hustles/MasteryTiers.tsx`; Test `scripts/check.mjs`.

**Interfaces (produces):**
```ts
// lib/pilot.ts (pure; may import types from ./store and ./types, and usableSkills from ./roster)
export type Pilot = {
  charId: number | null; name: string; isMain: boolean;
  /** Levels the pilot can use; undefined until its skills have been read. */
  skills: Record<number, number> | undefined;
  skillQueue: QueuedLevel[] | undefined; skillSp: Record<number, number> | undefined;
  attributes: Meta['attributes']; alpha: boolean;
};
export function pilotFrom(d: Data, who: { charId: number | null; name: string; isMain: boolean }, usable: boolean): Pilot;
// components/pilot.tsx
export const PilotProvider: React.Provider<Pilot | null>;
export function usePilot(): Pilot;   // the provided pilot, else pilotFrom(useData(), the logged-in character, false)
```
`pilotFrom` with `usable: false` returns exactly `d.skills`, `d.meta.skillQueue`, `d.meta.skillSp`, `d.meta.attributes` and `d.settings.clone === 'alpha'` (the main, as today); with `usable: true`, `skills` is `usableSkills(d.skills, d.meta.activeSkills)` when `d.skills` is set (an alt's).

- [ ] **Step 1: Failing tests**: `pilotFrom(main, …, false)` returns the store's own objects (identity for `skills` and `skillQueue`); `pilotFrom(alt, …, true)` gives usable levels (an Alpha alt trained to Mining V with active 4 reads 4), its queue, `alpha` from settings; an alt with no skills read gives `skills: undefined`.
- [ ] **Step 2: Implement** `lib/pilot.ts` and `components/pilot.tsx` (`createContext<Pilot | null>(null)`; `usePilot` always calls `useData()` and `useAuth()` so hooks keep their order, and builds the main with `useMemo` on those).
- [ ] **Step 3: Switch the readers.** In each listed component, replace `d.skills` with `pilot.skills`, `d.meta.skillQueue` with `pilot.skillQueue`, `d.meta.skillSp` with `pilot.skillSp`, `d.meta.attributes` with `pilot.attributes`, `d.settings.clone === 'alpha'` with `pilot.alpha` (keep `useData()` wherever the component still reads anything else, e.g. names). `FitActions`: `{hasScope(SCOPE.fittingsWrite) && pilot.isMain && …Save fit…}`. `SkillStrip` and `SkillNeeds` keep returning nothing until the pilot's skills are read. Grep afterwards: no `d.skills`, `d.meta.skillQueue`, `d.meta.skillSp`, `d.meta.attributes` left in these five files except in `useTradeQueue`/`TradeSkillsLine`.
- [ ] **Step 4: Nothing moved**: `npm run check`, `npm run build`, `npm run check-pages` (109), `npm run check-phone` (109), `npm run check-income` (the main's figures as recorded, isolation ok).
- [ ] **Step 5: Commit.**

---

### Task 3: The Mining tab's data for every character

**Files:** Modify `src/lib/cloud.ts`, `scripts/check.mjs` (the importer list), `docs/notes/characters.md` (the same); Create `src/components/hustles/miningFleet.ts`.

**Interfaces:**
- Produces (`cloud.ts`): `cloudAltTicks(days = 30): Promise<(MiningTick & { charId: number })[]>` (`GET /v1/alts/mining/ticks?days=`); a 404 rejects with `status: 404` as `call` already does.
- Produces (`miningFleet.ts`):
  ```ts
  export type FleetChar = {
    charId: number; name: string; isMain: boolean;
    /** Its mining records (the main's from the store, an alt's from its pulled copy). */
    records: MiningRecord[];
    /** Its pilot, for Scaling up. */
    pilot: Pilot;
    /** An alt's roster entry (its login, jobs, ship at the last mining read); none for the main. */
    entry?: RosterEntry;
  };
  export function useMiningFleet(days: number): {
    chars: FleetChar[];                 // the main first, then each alt on the roster, in roster order
    ticks: CharTick[] | null;           // every character's, tagged; null while loading
    altTicks: 'ok' | 'behind' | 'failed' | 'off';   // what the alt ticks read said
  };
  ```
  The main's records: `d.mining` values whose `charId` is the logged-in character's. An alt's: `altLedger(alts.alts[id] ?? NO_ALT, d.chars[id]?.clone).mining`, its pilot `pilotFrom(that ledger, { charId, name, isMain: false }, true)`. Ticks: the main's (`cloudMiningTicks`, each tagged with the main's ID) and the alts' (`cloudAltTicks`), read once a page visit and again when `alts.roster`'s revisions move; `altTicks` is `'behind'` on a 404, `'failed'` on any other error, `'off'` with the cloud off.
- [ ] **Step 1**: `cloudAltTicks`. **Step 2**: the importer test in `scripts/check.mjs` expects `['App.tsx', 'components/Characters.tsx', 'components/hustles/Mining.tsx']` (the hook file imports the alt store only if it is `Mining.tsx` itself; keep the import in `Mining.tsx` and pass `useAlts()`'s value into `useMiningFleet(days, alts)` so `miningFleet.ts` doesn't import the alt store), and `characters.md`'s sentence listing who may import the alt store says why Mining joins. **Step 3**: `useMiningFleet`. **Step 4**: `npm run check`, `npm run build`, `npm run check-income`. **Step 5**: commit.

---

### Task 4: The Mining tab across characters

**Files:** Modify `src/components/hustles/Mining.tsx`; Test `npm run check-pages`, `npm run check-phone`, `npm run check-income`, a browser look.

- [ ] **Step 1: The character filter.** A `Seg` above the tiles: All, then each character by name (the main first), kept per browser under `jita-ledger:mining-char` (read in `try`; a kept ID no longer in `chars` falls back to All). Shown only when there's more than one character. The tiles, "What you mined" (ore rows, day bars) and Sessions follow it: All adds every character's records and sessions.
- [ ] **Step 2: Per character.** A panel "Your characters" (only with more than one character): one row each (ID-keyed), the main first: name; what it mined in the 30 days (m³ or units when a volume is unknown, `perCharacter`); worth now; days mined; sessions and ISK an hour (the median of its sessions of 20 minutes or more); and right now (the main: the live `useRightNow` as today; an alt: `altRightNow(entry, its ticks)` → "Mining in a Venture, as of 14:20" / "In a Venture as of 14:20" / "–", with a tip saying it's the cloud's ten-minute read and where an alt is isn't read). A fleet total row under it. An alt with nothing read says "Not read yet" in its cells, never zeros (`altReadState` from `lib/roster.ts` for its mining part).
- [ ] **Step 3: Sessions say who.** A "Who" column first in the Sessions table (the character's name), only with more than one character. Sessions come from `sessionsByCharacter`. With `altTicks === 'behind'`: one line under the table, "The cloud isn't ready to show other characters' sessions yet: its Worker is a version behind this app."; `'failed'`: "Other characters' sessions couldn't be read just now."
- [ ] **Step 4: Scaling up for one character.** A "Show for" `Seg` in Scaling up's header row (only with more than one character), defaulting to the filter's character when it isn't All, else the main; kept under `jita-ledger:mining-show`. Scaling up is wrapped in `<PilotProvider value={chosen.pilot}>`, and takes that character's `here` (the main: live ship as today, else its most-mined hull; an alt: `entry.ship` when it's a mining hull, else its most-mined hull from its own sessions), `paceOf` and `measured` from its own sessions, and `mostMined` from its own records. An alt with no skills read: a note "Not read yet: its skills come with the cloud's first read" in place of the tree's skill states (the tree still draws). The tab's closing line promising fleets "later" goes.
- [ ] **Step 5: Checks**: `npm run check`, `npm run build`, `npm run check-pages`, `npm run check-phone`, `npm run check-income`.
- [ ] **Step 6: Look at it** (the controller's): a dev server with the large ledger and the three alts seeded (the main has mining records too: add a few to the page check's large ledger in `scripts/ledgers.mjs` if it has none, under the main's ID, and re-record the income check only if a main income figure moves — it shouldn't: mining records aren't income); the filter; the table and its total; Show for an alt (its skills on the tree, no Save fit); then open Side hustles → Abyssal and Settings → Skills: still the main's.
- [ ] **Step 7: Commit.**

---

### Task 5: Ship, and see FannySchmeller's mining

- [ ] **Step 1**: clean tree; `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`.
- [ ] **Step 2**: merge `--ff-only`, push, delete the branch, `npm run deployed` → `Shipped.`; grep the deployed Mining chunk (`SideHustles-*.js` or whichever holds it) for "Your characters".
- [ ] **Step 3**: in production the Mining tab lists FannySchmeller with its mined ore and sessions (the cloud has read its mining since 30 September), "Show for" FannySchmeller shows its skills (Omega, 6.3 M SP). Compare its 30-day m³ with its mining records in D1.
- [ ] **Step 4**: Notes: `characters.md` (Mining across characters: sessions per character and why, the pilot and its default, the alt's right-now), `loyalty-hustles.md` (the Mining tab's filter, table and Show for), `.claude/rules/characters.md` paths (`lib/pilot.ts`, `components/pilot.tsx`, `hustles/miningFleet.ts`). Commit, ship.
