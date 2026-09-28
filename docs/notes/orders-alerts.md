# Orders, To do and alerts

Decisions worth not undoing. What the app tells you to do about your orders and colonies, and how it reaches you: the To do list, browser notifications and in-game mail.

- **"Clears in" is checked against what happened** (`trackRecord`, `predictions`). Every five-minute round the
  cloud judges each ledger's orders once (for this and the alerts) and keeps each beaten order's prediction
  once per order and price (`predictionOutcome` in `lib/track.ts`). The order reaching the front, or its
  record showing it sold out, resolves it; a new price, or a record closed with stock left, voids it; after 14
  days it is late. An order gone from the book while its record still says open stays undecided: a sell-out
  leaves the book within five minutes but its record only says so after the next orders refresh, and the first
  version voided every one of those, which would have counted each success as a void. Orders' Clears-in tip quotes it from 5 checked predictions up: "N of M
  reached the front within twice the time it said" (`/v1/track`, 30 days). Results' item table counts relists
  in the period and their whole fees; Made holds only the share for units that sold.
- **Three more claims are checked the same way** (migration 0009, `lib/track.ts` pure, summaries on `/v1/track`,
  each shown only from `TRACK_MIN` (5) checked, with no "collecting data" wording before). The user asked for the
  guesses to be tested against what happened, like Clears in:
  - **Place and leave** (`leave_track`): each left order's pace at its price, from the planner's own model (its
    side's pace × `competitionShare` × reach/14), recorded in the five-minute round with what was left; closed at a
    new price, when it stops being left alone, when its record closes, or after 14 days (`leaveOutcome`; under a
    day is void, since the model is daily). Quoted as filled against expected on Orders' "Leaving it" tip and under
    the planner's Place-and-leave note. On 28 September 2026 the user had no left orders, so it starts empty.
  - **The Sniper** (`snipe_seen` gains `resale`, `clean`, `doubts`, `units`, written at first sight only): once a
    day after 12:00 UTC (`dailyChecks` in `worker/src/checks.ts`, from the hourly job) each listing shown a day or
    more ago is settled from its item's history: reached if a day's high after the sighting got to the relist price
    within 7 days (`snipeOutcome`). The Sniper page's "Checked against what traded after" sets clean listings against
    doubted ones and each doubt, which is the test of whether the doubts are right. Sightings before this change
    carry no relist price and aren't checked.
  - **Share** (`share_track`): the same `measureShare` as Settings' button, once a day per ledger from the cloud's
    copy of its trades, beside the setting then. Settings shows the latest reading until you measure by hand, and
    Prospects and the planner say so (`ShareCheck`) when the setting is over twice what it suggests, since every size
    there is linear in it. Its first production run (13:07 UTC, 28 September 2026) measured the user's trades at
    6.0% on buys (34 item-days) and 15.8% on sells (86), 7.5% suggested against their 6%, so nothing shows for them.
- **The cloud mails you when one of its jobs fails twice in a row** (`lib/watchdog.ts` pure, `worker/src/watchdog.ts`,
  alert kind `watchdog`, "Cloud job failing", on and mailed by default). Its jobs (copying the ledger, reading
  orders, alert checks, mail tidying, planets, the full scan, the Sniper, the daily checks) fail quietly while nobody
  looks at Settings. `noteJob` keeps each job's failures in a row (`fails`, `failing_since`, migration 0010), cleared by
  a success; failures in EVE's daily downtime (10:55–11:30 UTC) don't count, since ESI fails for everyone then and
  the Sniper, running every five minutes, would otherwise mail every day. The five-minute round checks each ledger's
  jobs and the shared ones (char 0) and mails at the second failure, then again each day it keeps failing (`warned`).
  The mail says what failed, since when, the error, what has stopped meanwhile, and what to do: nothing when it
  retries on its own, or hand the cloud your login again when the error says the login no longer works
  (`loginError`). Tested locally: the orders job counted 1 then 2 (it retries once its last try is 20 minutes old,
  so a lost login shows within about 40 minutes), and a Sniper success cleared a seeded streak. The mail can only be
  sent in production. It can't report the mail itself failing, or a cron that stops firing.
- **To do ticks itself off** (`lib/todo.ts`). The user plays without looking at it, and a list still
  demanding things already done is worse than none. Every finding has a stable `key` (what it's about:
  `order:ID`, `pi:pin`, `squeeze:position`, `scam:type:flag`, `backup`) and a `ver` (its state: the suggested
  price, the expiry). The session remembers each one; when a build no longer produces it, a per-kind judge
  reads the current data and moves it to Done with what changed ("You moved it to 799,300 ISK, and it's at the
  front", "The heads were reset: it runs until …", "You exported a backup"). **Absent is not done**: before the
  orders are checked every order is absent, so a judge answers only from a read that can tell (an order check,
  colony read or signal read *newer than the one that showed it*, which for an order must also have read that
  item's book; or the ledger, which is always current: a sync saying the order closed, a position closed, a
  backup exported), and otherwise the item stays listed as being checked. "Newer" also keeps a second tab with
  an older check from judging what the first tab saw since; the tabs share the session through `storage` events. While the page is open it re-checks
  the orders when ESI's book expires (not more than every 2 minutes), colonies every 10 minutes while a PI item
  waits, and at once when the tab becomes visible again. A tick by hand holds for the same `ver` only: a chore
  for 12 hours, a warning (scam, squeeze) until it changes, so a new undercut reopens a skipped move. Done items
  stay listed 12 hours. The book cache in `market.ts` lets go at ESI's Expires rather than 5 minutes after our
  read, which had put a relist up to 10 minutes behind. A judge can also answer `false`: the item goes unticked,
  neither open nor done. That is what a suspicious-market warning does when its item leaves the set it covers.
- **Suspicious-market warnings cover what you put ISK into**: open positions, open buy orders and the watchlist
  (`trackedTypes` in `signals.ts`), not items you only sell. The user's 118 loot items on sell orders filled To do
  with walls and spikes they didn't care about. A spike or escrow bait traps a buyer, and the queue ahead of a
  sell order is already weighed on Orders. The alerts use the same set.
- **Alert mail comes from the cloud once it holds a sender** (`worker/src/alerts.ts`). It judges each open Jita order
  with `judgeOrder` on the book the watch just read (never one over 15 minutes old: a stalled watch skips, it doesn't
  guess), history cached in D1 until ESI's `Expires`, the cloud's flow, the user's cost basis (the `costs` doc: the
  browser pushes `costBasis` every 10 minutes when it changes, since working positions out needs every trade and fee;
  only the cloud reads it) and the last 3 days' buys for `fillingNow`. Colonies are read hourly. It honours the synced
  alert settings (on, mail, kinds, minimum ISK, quiet hours, interval) through `shouldAlert`, sends one mail per round
  from the second character, and tidies old alert mail on `tidyEvery`. **A mail is remembered by the order and your
  price on it** (`mailKey`), not by the advice: every undercut changes the advised price, and with nobody reading,
  one order left alone would be mailed about every round. Move it and get beaten again and you hear again; otherwise
  after "Remind me again after" (`repeatH`: 1, 2, 4, 6, 12 or 24 h, default 4; it was a fixed six). **So the cloud mails less often than an open app notifies**: the app's key carries the advised
  price (`move:ID:newPrice`, `clear:ID:best`), so every fresh undercut is a new notification. The user asked on 27
  September 2026 why mail had "stopped" while notifications kept coming; a replay of the round on their live data
  showed 48 of 52 findings under their 5 M minimum (which the app applies too) and the other 4 held as mailed at
  that price within six hours. Offered the app's rule, they kept this one: it is anti-spam, and mail picks up
  again once they stop updating orders by hand. They found six hours too long, so it became the setting. While the cloud holds both logins (`cloudSendsMail`, from `/v1/status`, kept across reloads and
  re-read every 10 minutes) the browser neither mails nor tidies, so nothing arrives twice. Squeeze and
  suspicious-market alerts stay with an open app: they need signals the cloud doesn't keep.
- **Pages that need the same live answer share one store**: `orderCheck` (your orders against the book),
  `watch` (squeeze and scam signals), `colonyStore` and the killmail pricer. Orders, To do and the
  alerts all read `orderCheck` rather than fetching the same books three times.
- **The browser's alerts run only while a tab is open**; a web page can't watch anything once it is closed. They
  reuse the pages' checks, respect quiet hours and don't repeat a finding within "Remind me again after" (4 h unless changed). With the app closed,
  alert *mail* comes from the cloud instead (see "Alert mail comes from the cloud"): its test mail, sent from the
  user's second character, arrived in game on 27 September 2026.
- **System notifications can't take the app's CSS** — the OS draws them. The app sets their icon (the hex
  mark, drawn to PNG) and an `image` (the alert as a card in the theme's colours, 2:1), which Chrome shows on
  Windows and Android and macOS ignores (`lib/notifyArt.ts`). They only fire while the tab is hidden, which is
  why Settings has a delayed test.
- **An alert mail says what to do before it says why.** Each alert opens with a **RECOMMENDED:** line (move
  your sell order down to X; leave it where it is; reset the extractor heads before a time), then the facts
  the check already had: yours against the best and by how much, what moving costs split into the lower
  price and the fee, what's at stake, the queue ahead and how long it takes to clear, or for PI the system
  (an in-game link), planet, product and end time. The subject leads with the same advice, since the inbox
  list and the new-mail notice show nothing else. The test mail is built from one of your real orders
  against the live book, so it shows exactly what an alert about it would say. The client's default mail text
  is small, so the whole body sits in `<font size="16">`, with titles at 20 and the brand at 26 (`SIZE` in
  `alerts.ts`); an inner size overrides the outer one.
- **Alerts can go by EVE mail, opt-in, always *to* the trading character and *from* a second one** (`lib/mailAlerts.ts`,
  builder `alertMail` in `alerts.ts`). The sender is a second login slot in `auth.ts` (`jita-ledger:mailer`,
  `loginMailer`, `getMailerToken`), asking only for send and organize mail. `handleCallback` tells the two
  logins apart by the `purpose` stored with the PKCE verifier, and refuses (and revokes) a sender login that
  comes back as the trading character. Logging either one out leaves the other. Without a sender, mail goes
  to yourself and Settings says it will only show after a relog. `esi()` takes a `token` to call as the
  sender. A mail has one ID for sender and recipient, so cleanup deletes the recipient's copy with the
  main login and then, best effort, the sender's Sent copy with the sender's. A browser notification is held back while a borderless game is in front, and a web page can't
  put anything inside the client, but a mail arrives there with the client's own blink. One mail per check
  holding everything raised, never one per alert. By default only `move` and `pi` are mailed, the two you can
  act on from inside the game. EVE mail has no link that opens a market window (`showinfo:` opens only the
  info window), so an item's *name* links to a web page that asks ESI to. It was first a `showinfo:` link with a
  separate market link beneath; the user asked for one link on the name, since the market is where an alert
  sends you. The client asks before following it and the browser opens the page. **Since 28 September 2026 that
  page is `open.html`** (`src/open.ts`, link built by `openLink`): the user found loading the whole app, with its
  animations, for one request heavy. It carries only the login and ESI code (1.9 KB plus a 13.3 KB shared chunk,
  against ~450 KB of script and the fonts), opens the market, counts 3, 2, 1 and closes; anything wrong keeps the
  tab open and says why. The link is `open.html?market=ID~Name` in one parameter, so no `&` reaches the mail's
  markup and the page needn't look the name up. Older mails' `#orders?market=ID` still work through the app
  (`lib/marketLink.ts`). Both take `market` off the address with `replaceState` so a reload can't repeat it. Nothing opens a market window unless someone clicked. ESI answers 204 whether or not
  the game is running, so the toast says the client was *asked*. Old alert mails are deleted after a chosen time (30 min to a week, or
  kept), read or not, on a cadence of a sixth of that time between 5 and 60 minutes (`tidyEvery`). Only mails
  **from you or your sender, with a subject starting `Jita Ledger:`** are ever touched (`isStaleAlertMail`); without
  the read scope, only the mail IDs this browser recorded sending. Cleanup runs even with alerts off, and
  stamps its time on failure too, so a lasting error retries at that cadence rather than every 15 s tick.
- **Only one tab runs the alert checks**, elected with a Web Lock (`ALERTS_LOCK` in `alertsRunner.ts`).
  Every tab asks for it, the holder checks, the rest queue and one takes over when the holder closes. Two
  tabs used to raise and mail every finding twice, and each click on a mail's market link opens a new tab.
  The grant can arrive after React's development double-run has already cleaned the effect up, so the
  callback checks a per-call `stopped` flag and resolves at once. A tab opened from a market link closes
  itself when another tab holds the lock: Chromium allows `window.close()` on a tab with one history entry,
  which is what an OS-opened link is (Playwright's `newPage` starts at `about:blank` and has two, so test it
  with CDP `Target.createTarget`). If the browser refuses, the tab says it can be closed.
