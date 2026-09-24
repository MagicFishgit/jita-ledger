# Prospects — a station-trading screener for Jita 4-4

**Date:** 2026-09-24
**Status:** design, awaiting approval

## Problem

Jita Ledger can only answer "is *this* item worth trading?" — every page starts from an
item you already named. There is no way to ask "what *should* I trade?"

The naive version of that answer is worthless. Ranking by margin surfaces items with a
300% spread that trade once a month. The screener has to gate on being able to buy and
sell the thing repeatedly, day after day, or it is actively misleading.

## Constraint: there is no bulk volume endpoint

Measured against live ESI on 2026-09-24:

| Route | Cost | Gives |
| --- | --- | --- |
| `/markets/10000002/orders/` (whole book) | 408 pages, ~97 MB | exact books — impractical in a browser |
| `/markets/10000002/types/` | 20 requests | 19,114 types with live orders |
| `/markets/prices/` | 1 request, 1.1 MB | 15k types, rough price, **no volume** |
| `/markets/10000002/history/?type_id=X` | **1 request/type**, ~1 s, ~44 KB | 419 days of `volume`, `order_count`, `average`, `highest`, `lowest` |

Liquidity — the thing we must gate on — costs one request per item. The whole design is
about spending those requests on the right few hundred items.

**The opening:** order-book pages are randomly shuffled with respect to `type_id`. Pages
1, 100, 250 and 408 each span the full id range with ~900 distinct types. So a 20-page
sample is an unbiased 5% sample of the market for 20 requests instead of 408. It surfaces
8,238 types trading at Jita 4-4 (86% of Forge orders are at Jita 4-4).

**The trap that sample revealed:** its top entries are Thukker Large Cap Battery, Pithum
C-Type Shield Amplifier, Intact Armor Plates — items with hundreds of *listings* and very
few *trades*. Order count measures listing activity, not trade activity. The sample can
only nominate candidates; history has to be the gate. This is also why "crowded book" is
one of the warnings below.

## Architecture: a three-stage funnel

Each stage is an order of magnitude more expensive per item and an order of magnitude
narrower, so the expensive data is only ever bought for items that already look good.

**Stage 0 — Sample** (~20 requests, ~5 MB, ~10 s). Read `X-Pages` from page 1 of the Forge
order book, sample 19 more pages at random, count orders per `type_id` where
`location_id === JITA_44`. Output: a candidate ranking. Cached 6 h.

**Stage 1 — Liquidity** (1 request/candidate, ~250 per run, ~75 s at 4 concurrent). Fetch
`/markets/10000002/history/?type_id=X` for candidates with ≥3 sampled orders, best-ranked
first, skipping any scanned in the last 24 h. Reduce 419 days to a compact stat record and
throw the raw rows away. Apply the gate here.

**Stage 2 — Live price** (1 request per survivor, top 40). Reuse `jitaBook()` from
`market.ts` for the real best bid/ask, book depth and competitor counts. Price one step
inside the spread with `tickUp`/`tickDown`, then run the user's own fees through the
existing `calc()`.

The scan is **resumable and persisted**. A run does one sample, up to 250 history fetches
and up to 40 book fetches, then stops. Later runs skip what is still fresh and widen
coverage. The page always renders the best of what has been scanned so far and states its
coverage honestly.

## Metrics

All computed over the **last 30 days**. ESI omits days with no trades entirely, so a
missing row *is* a day with no trades — `daysTraded` is simply the number of rows in the
window.

| Metric | Definition | Answers |
| --- | --- | --- |
| `daysTraded` | rows present in the last 30 days | did it trade at all, most days? |
| `tradesPerDay` | median `order_count` | how often does it change hands? |
| `unitsPerDay` | median `volume` | how much moves? |
| `spikiness` | busiest day's volume ÷ 30-day total volume | **is the volume steady or one big day?** |
| `dailyRange` | median of `(highest − lowest) / average` | how wide is the spread *habitually*? |
| `trend` | mean 30-day `average` ÷ mean 90-day `average` − 1 | is the price falling? |

`spikiness` is the metric that does the work the user actually asked for. An item that
moves 3,000 units on one day and nothing for 29 has a healthy monthly total and is useless
to a station trader. Nothing else in the set catches that.

`dailyRange` is the second non-obvious one: it says whether today's spread is this item's
*normal* spread or a fluke that will close before you fill.

## The gate

Hard filters, not score penalties — items that fail never appear. Defaults, all adjustable
on the page:

- `daysTraded >= 20` (of 30)
- `tradesPerDay >= 5`
- `spikiness <= 0.5` — no single day may be more than half the month's volume
- capital to hold a day's stock `<=` the user's budget
- net return `> 0` after their real broker fee and sales tax

## Ranking and warnings

Rank by **return on capital**: `roi` from the existing `calc()` — net profit ÷ ISK
committed, buying one step above the top buy and selling one step below the lowest sell.
Because the gate already guarantees daily turnover, this reads as a daily return. ISK/day
(`net × unitsPerDay × the user's existing "share of volume" setting`) is shown alongside as
the throughput figure, not the sort key.

Warnings are surfaced per row rather than folded into the score, so the user can judge them:

- **Thin book** — fewer than 5 orders on either side; the spread is wide because nobody is there
- **Fluke spread** — live spread > 2.5 × `dailyRange`; today's gap is unusual and will close
- **Falling knife** — `trend < −10%`
- **Crowded** — estimated live orders ÷ `tradesPerDay` > 20; many listings, few trades

## Page

New route `#/prospects`, nav entry "Prospects" between Calculator and Watchlist.

- **Controls** — budget, min trades/day, min days traded, min return; a Scan button
- **Progress** — the three stages with live counts, and a coverage line
  ("Checked 250 of ~2,100 candidates")
- **Table** — item, return, net/unit, trades/day, days traded, a 30-day volume sparkline,
  ISK/day, capital, warnings, actions. The sparkline makes "trades every day" versus "one
  big day" visible instead of inferred.
- **Row expand** — the numbers behind the score and the warnings in full
- **Actions** — reuse `addToWatchlist`, `startPosition`, and the Calculator deep link

## Files

| File | Change |
| --- | --- |
| `src/lib/prospects.ts` | new — stats, gate, scoring, scan orchestration |
| `src/components/Prospects.tsx` | new — the page |
| `src/components/Sparkline.tsx` | new — small inline-SVG volume strip |
| `src/lib/types.ts` | add `ProspectStats`, `Prospect` |
| `src/lib/market.ts` | add `sampleForgeOrders()` |
| `src/App.tsx` | route + nav entry |
| `src/styles.css` | styles for the table, sparkline, warning pills |
| `README.md` | document the page and its assumptions |

## Persistence

One key in the existing `cacheStore` (already wiped by `clearAll`, already separate from
user data): `prospects` → `{ sample: {at, counts}, stats: Record<typeId, ProspectStats> }`.
Only the reduced stats and a 30-point sparkline are stored, never the 419 raw rows, so the
store stays small.

## Error handling

Per-item failures are skipped, counted, and reported as "N items couldn't be checked" —
one bad type must not abort a 250-item scan. The existing `esi()` gate (4 concurrent,
retry on 5xx, friendly 420/429 message) is reused unchanged. A scan is abortable and
survives navigation away mid-run by persisting after each batch.

## Testing

The repo has no test runner. As with `src/lib/tick.ts`, verification is a Node harness run
against the real module via native type stripping, covering: the stat reducers against
hand-built history fixtures (including gap days, single-spike months and short histories),
the gate at its boundaries, and the scoring maths. Then an end-to-end check against live
ESI confirming the funnel returns plausible, liquid items and that known thin-but-wide
items are correctly rejected.

## Out of scope

Regions other than The Forge; buy-side sourcing from other stations; contract or industry
data; alerting when an item's numbers change.
