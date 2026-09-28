# How the app looks and speaks

Decisions worth not undoing. Conventions for wording, layout, tooltips, numbers and charts that apply on every page.

- **Confirmations use the platform `<dialog>`** (`lib/confirm.ts` + `ConfirmDialog.tsx`), not a
  library: focus trap, Escape and backdrop come free, and it's drawn in the app's own tokens.
  Destructive questions focus Cancel. No native `confirm()` anywhere.
- **Settings are one row each: name and hint, then a short number box with its unit** (`SetRow`). The old
  full-width fields put the number at the far end of the page from its label.
- **A switch that means "I'll type it in" must say so, never "from the game".** The fee override was labelled "Use
  my exact broker fee and sales tax from the game"; the user read it as "sync them from the game" and left it on,
  so a standings rise from two storyline missions would never have reached the app's fee. It is now "Type in my
  broker fee and sales tax myself", its description says on/off in plain terms (typed figures never update; off,
  they follow skills and standings on every sync), and while it's on and the typed figures differ from what the
  synced skills and standings give, the tab shows those with **Use these**.
- **Pages run full width** via `--page-max`, so wide tables don't need a scrollbar. Prose keeps its own
  measure.
- **Every figure the redesign added is read, derived, or asked for — never invented.** The buy/sell split comes
  from what the book's orders have sold and what the app watched, or where each day's average sits between its
  low and high when those can't tell; training time from dogma and attributes; the
  PushX cost, delivery days, hours spent per activity, Omega pack prices (only the 1-month 500 PLEX is assumed)
  and gank lines are the user's to enter, and a blank one shows as "–" rather than a stand-in. The rule
  thresholds that remain (competition pivot 60 orders, share clamped 0.3–1.5×, a wall being the *best* price
  holding over 50% of its side *and* over 3 days of volume, escrow 10% over the 30-day high, spike 5× volume
  and 10% price, relist fee charged on half the order) are named constants stated in the copy. The wall rule
  was first "any level over 50%", which flagged ordinary markets and then re-alerted every six hours; a big
  order deeper in the book, or one the market clears in a day, is not a wall.
- **Scopes are looked up by name** (`SCOPE.wallet`), never by position in `SCOPES`.
- **A tooltip longer than a sentence or two is laid out, not written as a paragraph** (`lib/tipText.ts`,
  drawn by `TipLayer`). Tips stay plain strings, and the structure lives in the text: a blank line starts a
  paragraph, a line starting "• " is a bullet, and a paragraph starting "For example:" becomes a boxed
  example. Anything over 200 characters, or with a line break, gets a 400 px box instead of 300, and a tall
  tip flips to whichever side of its target has room. Write a long tip as a lead line saying what the thing
  *is*, then bullets for how it's worked out, then the example. The user found the one-paragraph versions a
  wall of text. Explanations that also show inline (flag `why`s) use paragraph breaks only, since a bullet
  would read oddly there.
- **ISK amounts don't carry a useless ".00".** `isk()` keeps cents under 100,000 only when there are cents
  (5.50 ISK, but 5,000 ISK), and `iskBig()` drops trailing zeros (14 M, 14.5 M, 14.81 M). CSV exports keep
  full precision on purpose.
- **No chart library.** Charts are inline SVG in the theme tokens (`charts.tsx`); recharts was removed.
- **Diagrams are authored as inline SVG, not fetched.** A hosted image means someone else's server on
  every load, a licence to honour and a broken box the day it moves. Inline SVG inherits the theme
  tokens, stays sharp at any size and costs no request.
