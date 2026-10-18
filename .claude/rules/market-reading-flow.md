---
paths:
  - "src/lib/{flow,flowStore,split,rhythm,orderCheck,market,relist}.ts"
  - "src/components/{Orders,Calculator}.tsx"
  - "worker/src/market.ts"
---

# Reading the market: who trades, and how fast

These files are covered by `docs/notes/market-reading-flow.md`, imported below: the buyer/seller split, Clears in, the
app's own watching, busy relisting, rhythm and how long a moved order stays at the front. If the note's text doesn't
follow this paragraph, Read that file before changing anything here.

@../../docs/notes/market-reading-flow.md
