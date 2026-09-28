# How the app looks and speaks

Decisions worth not undoing. Conventions for wording, layout, tooltips, numbers and charts that apply on every page.

- **The app is its owner's alone** (`OWNER_CHARS` / `isOwner` in `constants.ts`, `Landing.tsx`). The site is public
  (GitHub Pages, and the repository is public), so on 28 September 2026 the user opened it logged out on their phone
  and found every page there and working: a quick scan ran. Nothing of theirs was exposed (their data lives in their
  browsers and behind the cloud's EVE login, and the cloud had only ever held their character), but the cloud
  accepted **any** EVE character's login, so anyone could have read the Sniper's finds and the full scan or run their
  own ledger on the owner's Cloudflare account. Now the Worker answers 403 to every character but the owner's (the
  real lock; the local dev token is exempt), and the app shows anyone else a landing page and runs nothing behind it:
  no sync, cloud, alerts, prefetch or market link. A character that logs in and isn't the owner is logged straight
  out (token revoked) and told so. `open.html` refuses them too. `npm run check-pages` checks both: logged out, and
  logged in as someone else, with a large ledger in the browser, only the landing shows and ESI gets no request. To
  let an alt in, add its character ID.
- **An open app notices a new version, and phones can pull to reload** (`lib/version.ts`, `PullToRefresh.tsx`,
  `lib/reload.ts`). After the owner-only lock went out, the user's phone kept showing the old, open app: GitHub
  Pages lets browsers reuse the page for 10 minutes (`cache-control: max-age=600`), a new tab doesn't bypass that
  (incognito did), and pull-to-refresh did nothing in any mobile browser, because the document never scrolls (a fixed
  shell, pages scrolling inside `.content`) and browsers only offer the gesture on a document that does. Now each
  build carries its ID (`__BUILD__`: the commit in CI) and the site serves it as `version.json`; the app reads that,
  past every cache, every five minutes and when the tab comes back into view. A hidden tab reloads at once; one in
  view shows "A new version of Jita Ledger is out. Reload now" and reloads when you next leave it. On touch screens,
  pulling down from the top of the page (one finger, more down than sideways, not from inside something scrolled down
  of its own) shows "Pull to reload" / "Release to reload" and reloads. Every reload the app makes goes through
  `reloadApp`, which first writes the saves still waiting (the ledger holds each 250 ms, the cloud its unsent list
  500 ms). Checked in an emulated phone against the production build: short pull nothing, long pull reloads, none
  while scrolled down or swiping sideways; a newer version.json shows the notice in view and reloads on leaving.
- **Every page works at a phone's width** (390 px; the phone rules are the last block of `styles.css`, on purpose:
  they override base rules of the same weight, which a later rule would win, and the first attempt at them sat
  early in the file and half of it did nothing). Nothing may stick out past the screen's edge: rows, switch groups
  and labels wrap, buttons grow to fit their words, the item search and number boxes take the row, the new-position
  form stacks (with `flex-wrap: nowrap`: a wrapping column made every column as wide as its longest line), and a wide
  table scrolls sideways inside its own box. `npm run check-phone` checks every page with all three ledgers and fails
  anything past the edge, or cut off by a box that hides rather than scrolls; the deploy runs it too. What it can't
  see, a value too long for its box or text spilling out of a button's height, was found by looking at every page,
  four screenshots to a sheet (`SHOTS=dir` on the page check). Orders' Weakest slots folds away (folded by default
  on a phone, remembered per browser).
- **Opening an item in game says nothing when it works**: the window opening in the client is the answer, and the
  user found a message on every click annoying. Only a failure says so. (Alerts are what become system
  notifications, never these.)
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
