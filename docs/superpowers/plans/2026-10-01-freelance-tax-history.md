# Freelance: tax, and every job you did — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Freelance tab is where the user sees every job they did (what they bought, what the rewards paid, the
tax taken, the profit), the job finder prices a job after their corporation's tax, and the Wallet files a job's purchases
under freelance, not "Other purchases", for finished jobs as well as running ones.

**Architecture:** Pure rules in `src/lib/freelance.ts` (shared types, the trade rule, per-job ledgers), I/O in
`src/lib/freelanceStore.ts` and the sync; the journal keeps ESI's per-entry tax (shared `esiRecords.ts`, so the cloud's
records carry it too); the Freelance tab draws the history.

**Tech Stack:** React + TypeScript + Vite; ESI (public freelance job details with the app's `X-Compatibility-Date`;
`/characters/{id}/`, `/corporations/{id}/`); tests in `scripts/check.mjs`, pages in `scripts/pages.mjs`.

**Spec:** the user's requests of 1 October 2026 (memories `corp-tax-next`, `freelance-history-next`):
- "I just did a freelance job and noticed that I paid a lot of tax. Does the freelance side hustle account for this in
  the profit it shows. I then now just registered my own corp with zero tax ... Will the app understand that?" Answered:
  the wallet-based figures are after tax; the finder isn't; offered to read the corporation and its rate, apply it in the
  finder, keep each reward's exact tax and show tax paid. The user: "yes add that after the plan work ships".
- "the freelance page needs some UI to show you the runs you did the cost and profit made etc so it is the page where you
  can see that. also i noticed that spending in the wallet for freelance job purchases are categorized under other
  instead of freelance, please fix that as well."

Findings, 1 October 2026:
- Every `freelance_jobs_reward` in D1 (and every mission reward and bounty) is exactly 89% of a round figure: the NPC
  corporation's 11% withheld before the wallet (593,096,000 = 39,200,000 units × 17 × 0.89). Since 29 September: 2.41 B
  received, about 298 M taxed. `esiRecords.ts` drops the journal's `tax` and `tax_receiver_id`; nothing reads the
  character's corporation.
- The sync replaces `meta.freelance.jobs` with ESI's current list of joined jobs (`readJoinedJobs`), which held only the
  job then running; the journal had rewards from three earlier jobs. `isFreelanceTrade` and `jobLedgers` read only that
  list, so a finished job's purchases became "Other purchases" and its history left the tab.
- `GET /freelance-jobs/{id}` answers for a finished job when sent the app's `X-Compatibility-Date` (2026-08-18), with
  `state: "Completed"`, `details.created`, `details.finished`, `details.expires`, `reward.initial`, `progress`,
  `contribution.reward_per_contribution` (the pre-tax rate) and the items wanted. The journal's reward `reason` names the
  job (`project_id=<id>:project_name=<name>`), so every job paid can be rebuilt from the journal alone.
  The user's four: "ISK Scordite best ISK for delivery" (created 14 Sep), "Veldspar Delivery Service" (6 Sep), "Mothhat
  Scordite" (26 Sep, finished 1 Oct 10:37:40), "/!\ Mining Kernite" (1 Oct 17:52, completed).

## Global Constraints

- Nothing not known reads as a zero; a job whose details ESI won't give says so and still shows its rewards.
- Every figure read or derived: tax from the journal's `tax` field; where an entry has none (synced before this change and
  older than ESI's 30-day journal), say "not recorded" rather than assume a rate.
- Broker fee and sales tax don't depend on the corporation; don't touch them.
- Shared modules (`esiRecords.ts`, `freelance.ts`, `types.ts`) stay loadable by the Worker and Node's type stripping.
- A new synced field or kind follows cloud.md (record by record for collections, sanitized on pull); the site must
  tolerate a Worker a version behind.
- A deliberate change to the Wallet's or Results' figures re-records `scripts/income-golden.json` with `RECORD=1` in the
  same commit, saying why; never otherwise.

## Review Focus

1. Two jobs running at once that take the same item (the user's Scordite jobs overlapped on 29 September–1 October): a
   purchase must count once, not under both.
2. Purchases of a job's item after it finished (ore bought to mine with, or another use): not freelance.
3. A reward entry whose job ESI no longer describes (404, or the details call failing): its rewards still show; no crash.
4. The corporation changing (NPC corp → own corp at 0% → a null-sec corp): the finder follows the current rate; past
   rewards keep the tax they were charged.
5. The journal's `tax` arriving on records already synced without it: the sync's merge must take the new field.

---

### Task 1: Each reward's tax kept, the corporation and its rate read, the finder after tax

**Files:** `src/lib/esiRecords.ts` and wherever the browser's sync maps ESI journal rows (keep `tax`, `taxReceiverId`),
`src/lib/types.ts` (`JournalEntry.tax?`, `taxReceiverId?`; `Meta.corp?`), `src/lib/sync.ts` (read the corporation on each
sync: `/characters/{id}/` → `corporation_id`, `/corporations/{id}/` → `name`, `ticker`, `tax_rate`, public, no scope;
`meta.corp = { id, name, ticker, taxRate, at }`), `src/lib/freelance.ts` and `components/hustles/Freelance.tsx` (the
finder's profit after the rate, saying which rate; "your corporation's tax not read yet" before a sync has read it),
`scripts/check.mjs`.

- [ ] Failing tests: an ESI journal row with `tax` and `tax_receiver_id` keeps both; the finder's profit for a job paying
  17 a unit with Jita at 11.79 at 11% and at 0% (the user's numbers); `meta.corp` from the two ESI answers.
- [ ] Implement; check that the sync's journal merge takes a changed record (an entry gaining `tax`) and the cloud's
  archive pushes it as changed (`esiRecords` is how the cloud builds records).
- [ ] The finder's Profit column header tip and each row say the rate, naming the corporation ESI gives: "after
  <corporation>'s 0% tax" / "after <corporation>'s 11% tax".
- [ ] All five checks; commit, push.

### Task 2: Every job you did, on the Freelance tab, and their purchases filed under freelance

**Files:** `src/lib/freelance.ts` (job history and per-job ledgers), `src/lib/freelanceStore.ts` (rebuild: the joined
list, plus every job named by a reward's `reason`, details read once and kept: finished jobs don't change),
`src/lib/sync.ts` (keep what it reads; never replace history with the current list), `src/lib/income.ts`,
`src/components/Wallet.tsx`, `src/lib/results.ts` callers (the trade rule over the history), `components/hustles/Freelance.tsx`
(the history panel), `scripts/check.mjs`, `scripts/pages.mjs`, `scripts/ledgers.mjs` if the page check needs a job.

**Interfaces:**
- `isFreelanceTrade(jobs, tx)` counts a trade of a job's item only between the job's start and its finish (`finished`, else
  now), and only for jobs the user took part in (rewards from it, or on ESI's joined list).
- Per-job ledgers assign each purchase to one job (Review Focus 1): the rule is yours to choose and state; deliveries
  (rewards ÷ the job's pre-tax rate, using the reward's `tax` where known) drawing purchased units first-in-first-out
  across the jobs taking that item is the suggested one.
- Each job: name, who posted it, created / finished, units delivered, rewards received, tax (or "not recorded"), cost of the
  units delivered, leftovers bought and not delivered, profit; and a total row. Sorted newest first.

- [ ] Failing tests with the user's real jobs: fixtures under `scripts/fixtures/` from ESI's public job details (the four
  above, read with the compatibility header) and the D1 rewards and Scordite/Veldspar/Kernite purchases (read-only
  `npx wrangler d1 execute jita-ledger --remote --json`, char 95210486). The Wallet files those purchases as freelance;
  a purchase after a job finished isn't; overlapping Scordite jobs count each purchase once; a job ESI won't describe
  still lists its rewards.
- [ ] Implement; the Freelance tab's "Your jobs" becomes every job (running first, then finished), with the figures above,
  phone-width safe (a wide table scrolls in its own box or folds as Best ore's did).
- [ ] Re-record `income-golden.json` only if the test ledger's figures change by design, saying so.
- [ ] All five checks, a browser look (seeded ledger with jobs and stubbed ESI details; desktop and 390 px); commit, push.

### Task 3: Ship

- [ ] Clean tree, all five checks; merge `--ff-only`, push, delete the branch both sides, `npm run deployed` → `Shipped.`;
  grep the deployed Freelance chunk for the history panel's heading.
- [ ] Notes: `loyalty-hustles.md` (Freelance: tax, the corporation, the history, the trade window, the assignment rule),
  `eve-facts.md` (the 11% withheld before the wallet with the evidence; the journal's `tax`; finished jobs answering with
  the compatibility header, `details.finished`, `reward_per_contribution`), `positions-results.md` if the Wallet's
  freelance lines change. Memories `corp-tax-next` and `freelance-history-next` marked shipped.
