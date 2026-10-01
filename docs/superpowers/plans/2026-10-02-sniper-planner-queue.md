# Sniper blueprints and Multibuy; the planner's flags and the long queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Sniper leaves blueprints out unless asked and copies its finds for Multibuy; the Capital planner can leave out
flagged items and holds Place and leave to a stricter run-up bar; Prospects and the planner flag a long sell queue; and
Orders warns when a buy order keeps adding stock to one.

**Architecture:** Pure rules in `src/lib/` (snipe, prospects, evaluate, planner, relist), shared with the Worker where they
already are; the Sniper's setting synced with the alert settings so the page and the mail agree.

**Tech Stack:** React + TypeScript + Vite; Cloudflare Worker + D1; ESI; tests in `scripts/check.mjs`,
`scripts/check-worker.mjs`, pages in `scripts/pages.mjs`.

**Spec:** the user's requests and approvals of 2 October 2026 (memories `sniper-blueprints-multibuy-next`,
`planner-flags-queue-next`):
- "i think for the sniper we should exclude blueprints, as they might be risky to try and sell ... Also I am authorizing
  adding multibuy to the sniper." Agreed: an "Include blueprints (N)" switch on the Sniper page, off by default, leaving
  them out of the page and the mail; Copy for Multibuy per find and for all shown, the cheap units only, saying what it
  should come to at the listings just read and that Multibuy has no price limit (a listing gone means the next ones at
  full price), refusing while a name reads "Item #". Evidence: of 1,222 sightings since 28 September, 59 were blueprints,
  41% of them floods (9% of the rest), 11 clean. finding-trades.md said the Sniper was left out of Multibuy on purpose
  ("the user wants to be deliberately careful there"); the user has now authorized it.
- "The capital planner should have a toggle to not include items with warning like these" and "i approve to the toggle
  changes as you suggested and the warning for what happened to the missles", then "yes we can make it stricter":
  - a "Leave out flagged items" switch in the planner, per browser, off by default; on, it leaves out Falling, Bids not
    reached, Sells not reached, Crowded, Thin, Slow and Long queue, and says how many by flag; **Raises kept back is not a
    warning** (a cost already in the margin, on 91 of 94 watched markets) and never counts;
  - a **Long queue** flag in Prospects and the planner: more units listed at or under your sell price than about two
    weeks of buyers take (`LONG_QUEUE_DAYS = 14`);
  - an Orders warning for a buy order that keeps adding stock to such a queue;
  - **Place and leave uses a 30% run-up bar** (`RUN_UP_PATIENT = 0.3`) instead of 50%;
  - the planner's "Scan again" banner stops saying a quick scan is enough (a quick scan re-reads a sample; 1,675 items stayed
    out of date after one): the cloud's daily full scan, or a deep scan, refreshes them.
- "what is your opinoin on skill books showing in prospects and capital planner. Do they actually buy and sell? to me i
  would think its risky", then "yes" to: note an NPC sell order anywhere in The Forge, and its price, from the full scan;
  leave out of Prospects and the planner any item NPCs sell in The Forge at or under where you'd resell; the Sniper never
  values a resale above that price. Evidence (2 October 2026): 470 skill books in the scan, none flagged by the Jita-only
  `npcSell` check, a median 291% between best bid and cheapest ask; Command Carriers sold by 12 NPC (365-day) orders at
  2,500 M in other Forge stations while Jita's player listings sat at 2,800 M and the Forge traded at exactly 2,500 M on
  7 of 14 days (Capital Ships 450 M against 475 M, Amarr Carrier 550 M against 589 M, Amarr Titan 6,000 M on 14 of 14);
  skills can also be bought from the character sheet (`skill_purchase` in the user's and the alt's journals). A skill
  NPCs don't sell (Neurotoxin Recovery, 718 units in 14 days) is a real player market and stays.
- The evidence for the queue: 'Arbalest' Rapid Heavy Missile Launcher I (33440), 2 October 2026: ~720 a day trade in The
  Forge, nearly all into bids at ~24.7k; ~16,200 listed in Jita at 60,330–60,500; the cloud saw buyers take 170–220 a day
  from listings; 1,600–8,500 units a day newly listed at the front; the user held 2,338 unsold and had a buy order for
  2,557 more. And the Vigilance Resonance Key that day: +37% over its month, Place and leave pricing its sell at 36.82 M
  from spike days behind 109 listed units at ~9 a day.

## Global Constraints

- **Not too tight** (the user's standing words): every new rule is measured on the cloud's current scan and the user's open
  orders before it ships, and the report says how many items or verdicts it changes; stop and report if a rule removes
  more than about a fifth of what the planner would otherwise pick with the switch off.
- Named constants stated in copy; no invented figure; nothing not known reads as zero.
- Shared modules stay loadable by the Worker and Node's type stripping; a Worker a version behind or ahead never errors.
- A setting that the page and the mail share is synced (the alert settings), sanitized on pull, defaulting to the safe
  side (blueprints out).
- Multibuy lines are "Name N" (finding-trades.md), the cheap units only.

## Review Focus

1. A snipe whose cheap listing sold between the read and the paste: the copy's stated total must make the gap obvious.
2. Blueprint detection must not catch a non-blueprint (an item named "… Blueprint" that isn't category 9 doesn't exist, but
   check by category, not name) nor miss one the Worker sees before the browser has looked it up.
3. A Long queue on an item with no watched flow (history's buyer share only): the flag must say it's from history.
4. The switch with everything flagged: the planner must say so rather than show an empty mix with no reason.
5. The Orders warning must not fire for an ordinary buy whose stock sells within two weeks.

---

### Task 1: The Sniper — blueprints out by default, and Copy for Multibuy

**Files:** `src/lib/snipe.ts` (blueprint category on a listing, if the Worker can know it), `worker/src/snipe.ts` and the alert
round (mail follows the setting), the alert settings type and sanitizer (`snipeBlueprints`, default false),
`src/components/Sniper.tsx` (the switch with its count; Copy for Multibuy per find and for all shown), `scripts/check.mjs`,
`scripts/check-worker.mjs`, `scripts/pages.mjs`.

- [ ] Failing tests: a blueprint find is left out of the page and the mail with the setting off and in with it on; the
  Multibuy copy for a find is "Name N" with N the cheap units and states the total at the listings read; a find whose
  name isn't read yet refuses the copy.
- [ ] Implement. Blueprint = ESI category 9 (type → group → category), looked up once and kept, like `typeKind`; the
  Worker uses the same rule (and the scan's own data if it carries the group).
- [ ] The Multibuy copy's toast and tip: what it should come to, and that Multibuy has no price limit.
- [ ] All five checks; a browser look (desktop and 390 px); commit, push.

### Task 2: The planner's switch, the Long queue flag, and Place and leave's run-up bar

**Files:** `src/lib/prospects.ts` / `evaluate.ts` (the `longQueue` warning; `RUN_UP_PATIENT` on the patient path),
`src/lib/types.ts`, `src/lib/planner.ts` (the switch's rule), `src/components/Planner.tsx` and Prospects (the switch, its
counts by flag, the flag's copy, the banner's wording), `scripts/check.mjs`, `scripts/pages.mjs`.

- [ ] Failing tests on the real cases: the Arbalest launcher flagged Long queue (units under your sell price against
  buyers taking listings a day, from the watched flow when there is one, else history's split); the Vigilance key at +37%
  left out of a Place-and-leave plan and kept (flagged only if over 50%) at the front; the switch leaving out each counted
  flag and never Raises kept back.
- [ ] Implement; the banner says the cloud's daily scan or a deep scan refreshes out-of-date items.
- [ ] Measure on the cloud's current scan (D1 `scan_items`, read-only) and say: how many candidates the Long queue flags,
  how many the 30% bar removes from Place and leave, and what the switch leaves with it on, at the user's settings.
- [ ] All five checks; a browser look; commit, push.

### Task 3: An NPC seller anywhere in The Forge caps the resale

**Files:** `worker/src/scan.ts` (fold the region's NPC sell orders, `duration` 365, into each item's book summary: the
lowest NPC price anywhere in The Forge, `npcAnywhere`), the Book type, `src/lib/evaluate.ts` (leave out an item whose NPC
price is at or under the resale it would list at, as `npcSell` does for Jita), `src/lib/snipe.ts` (resale never above the
NPC price), the browser's book reads if they see the region (`market.ts`), `scripts/check.mjs`, `scripts/check-worker.mjs`.

- [ ] Failing tests on the real books: Command Carriers (NPC 2,500 M in other stations, Jita asks 2,800 M) and Capital Ships
  left out; Neurotoxin Recovery (no NPC orders) kept; a snipe's resale capped at the NPC price; a scan summary without the
  field (a Worker a version behind) changes nothing.
- [ ] Implement; measure on the next full scan (or the current one replayed) how many items it leaves out, by category
  (skills, blueprints, other).
- [ ] All five checks; commit, push.

### Task 4: Orders warns when a buy order feeds a long queue

**Files:** `src/lib/relist.ts` (or `orderCheck.ts`: a pure `feedingQueue` on a buy with its item's held stock, your listings,
the order's remaining units, the queue of others' listings and buyers a day), `src/components/Orders.tsx` (a tag on the buy
row, its tip with the figures), `scripts/check.mjs`.

- [ ] Failing test with the Arbalest figures: held 2,338 (1,808 listed, 530 in the hangar) and 2,557 still to buy, against
  ~200 bought from listings a day and ~16,200 listed by others: tagged, saying how many days of buyers that is. An
  ordinary buy whose stock sells within 14 days isn't (Review Focus 5).
- [ ] Implement; measure on the user's open orders (how many buys it tags, each named).
- [ ] All five checks; a browser look; commit, push.

### Task 5: Ship

- [ ] Clean tree, all five checks; merge `--ff-only`, push, delete the branch both sides, `npm run deployed` → `Shipped.`;
  grep the deployed bundle for "Include blueprints" and "Long queue"; after the next full scan, check D1's `scan_items`
  carry the NPC price for Command Carriers.
- [ ] Notes: `finding-trades.md` (the Sniper's blueprints and Multibuy, reversing "left out on purpose" with the user's
  words; the planner's switch, Long queue, the 30% bar, with the measurements), `market-reading.md` (the Orders warning),
  `eve-market.md` (NPCs sell most skill books at fixed prices in other Forge stations; the character sheet sells skills
  too), `limits.md` if a measure leaves a stated limit. Memories marked shipped.
