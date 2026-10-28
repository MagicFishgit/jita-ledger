---
paths:
  - "src/lib/{prospects,evaluate,planner,relist,orderCheck,positions}.ts"
  - "src/components/{Prospects,Planner,Orders,Positions}.tsx"
---

# Honest limits in the model

State these rather than letting them be discovered.

On 19 October 2026 this note left the set every session loads (CLAUDE.md, "Notes by topic"): each area's limits moved to
a "Limits" section at the end of that area's note, and these three, which hold for all trading, stayed here.

State these rather than letting them be discovered:

- Everything in Prospects scales off `settings.share` (% of daily volume you capture, default 10).
  It's a guess, and absorption is linear in it.
- No market-impact modelling. At billion-ISK positions your own orders move the price against you.
- Jita 4-4 only. Orders elsewhere can't be judged and are counted out with a reason.
