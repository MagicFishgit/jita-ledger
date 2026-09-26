# Jita Ledger

A station trading tool for Jita 4-4 that runs entirely in your browser and is hosted on GitHub Pages.

- **Wallet** (the home page): where your ISK comes from and goes, drawn from the wallet journal's own
  balance-after figure; net worth (wallet, sell orders, escrow, assets at CCP's rough prices, loyalty points);
  the fee leak; trades no position tracks, sorted and correctable; goals, runway, running costs, ships lost and a
  light check for unusual activity. A monthly CSV and a shareable image.
- **Tonight's run**: everything worth doing now in one list — orders worth moving, sold-out positions, margin
  squeezes, planetary programmes ending, trades your positions skipped, suspicious markets, an overdue backup —
  biggest ISK first. N steps, Enter opens.
- **Calculator**: profit per unit after broker fees and sales tax, break-even and target prices, with live Jita 4-4 prices and daily volume from ESI.
- **Prospects**: finds items worth trading by sampling the Jita order book, then checking how often each one really
  changes hands. Anything that doesn't trade on most days is left out, however wide the margin. A **quick scan**
  takes about a minute and a half and skims the busiest books; a **deep scan** samples three times as much of the
  order book, lowers the bar so quieter items make the shortlist, and
  works through every candidate it finds rather than stopping early, which takes a while but leaves nothing to come
  back for. Results appear as they are found and are written away as it goes, so stopping early costs you nothing.
  You say how much you want to put into one item and how long you'll leave it there, and only items whose daily
  turnover can absorb that inside your horizon are shown, with what each could take and how long your money
  would be in it. Ask for a small amount and nearly everything qualifies, which is the spread-thin case; ask for
  a billion and only the markets with the turnover to swallow it survive. The table sorts on any column. A scan refreshes prices over an hour old,
  history over a day old and the order book sample over six hours old; the page says how old the prices on screen
  are, and **Clear these results** throws the scan away without touching your trades, positions or settings.
- **Orders**: your open market orders checked against the live Jita 4-4 book. Being undercut is not by itself a
  reason to move, so this weighs the stock queued ahead of you against how fast the item actually trades: a
  handful of units in front of something that moves thousands a day is gone in minutes and you are back at the
  front for free. Each order gets a verdict — move it, leave it, already in front, or not worth the price it
  would take — with buy and sell orders filterable separately, and how patient to be set by you rather than assumed.
  Each column explains itself behind an “i”. ESI cannot place or change an order, and
  automating the client is a bannable offence, so this finds the work and you do the clicking.
- **Watchlist**: compare items by spread, return, volume and a rough ISK-per-day estimate.
- **Capital planner**: spreads the ISK you name across the Prospects list by return per day, never more than a
  market can take in your horizon or your cap per item, two order slots each, flagged spreads left out.
- **Hub arbitrage**: items dearer in Amarr, Dodixie, Rens or Hek than in Jita after both hubs' fees, with the haul
  priced from a PushX quote you paste, your own jumps on the real route, or a courier reward (with the going rate
  read from public contracts).
- **Positions**: track an item you're trading from the first buy to the last sell, and when the stock is ready to go
  out, what to ask for it: the break-even price that covers what it cost you after fees, and a suggested price one
  step under the cheapest seller with what it would clear. Buys, sells, fees and tax are pulled from your wallet, so you can see what you actually made and how your prices compared with the market.
- **Results**: what each activity made, each counted by one stated rule, and ISK per hour once you say how many
  hours a week you spend on it.
- **Loyalty**, **Side hustles** (Abyssal, Hauling, Planets, Injectors) and **Combat**: spending LP, the hustles a
  trader can run beside the market, and your kills and losses priced on the day they happened.
- **Omega**: what a month of Omega costs in PLEX, how much of it your wallet covers, whether your last 30 days of trading would pay for it, and Alpha and Omega fees side by side.

There's no server. Your data lives in your browser's IndexedDB, and the app talks directly to ESI and EVE SSO.

## Setup

### 1. Put the code on GitHub

Create an empty repository called `jita-ledger` on your GitHub account, then from this folder:

```bash
git init -b main
git add .
git commit -m "Jita Ledger"
git remote add origin https://github.com/MagicFishgit/jita-ledger.git
git push -u origin main
```

If you use a different repository name, change `base` in `vite.config.ts` to match.

### 2. Register an EVE application

At <https://developers.eveonline.com/> create an application:

- **Connection type**: Authentication & API Access
- **Scopes**:
  - `esi-wallet.read_character_wallet.v1`
  - `esi-markets.read_character_orders.v1`
  - `esi-skills.read_skills.v1`
  - `esi-characters.read_standings.v1`
  - `esi-ui.open_window.v1`
  - `esi-assets.read_assets.v1`
  - `esi-characters.read_loyalty.v1`
  - `esi-planets.manage_planets.v1`
  - `esi-killmails.read_killmails.v1`
  - `esi-universe.read_structures.v1`
  - `esi-ui.write_waypoint.v1`
  - `esi-mail.send_mail.v1`
  - `esi-mail.read_mail.v1`
  - `esi-mail.organize_mail.v1`

  Settings lists every one with what it unlocks and what stops working without it. A scope added to the
  application after you logged in is simply missing until you log out and in again. Ticking a scope on
  the application *before* the app asks for it matters the other way round: EVE's login refuses a request for
  any scope the application doesn't have, so nobody can log in.
- **Callback URL**: `https://magicfishgit.github.io/jita-ledger/` (exactly, including the trailing slash)

Copy the **Client ID**. You don't need the secret: the app logs in with PKCE, which is meant for apps that can't keep a secret.

For local development, add a second callback URL `http://localhost:5173/jita-ledger/`, or register a second application for it if the portal only takes one.

### 3. Turn on GitHub Pages

In the repository:

1. **Settings > Pages**: set **Source** to **GitHub Actions**.
2. **Settings > Secrets and variables > Actions > Variables**: add a repository variable `EVE_CLIENT_ID` with your Client ID.
3. Re-run the **Deploy to GitHub Pages** workflow from the **Actions** tab (or push any commit).

The site will be at <https://magicfishgit.github.io/jita-ledger/>.

### Local development

```bash
cp .env.example .env.local   # then put your Client ID in it
npm install
npm run dev                  # http://localhost:5173/jita-ledger/
```

## How positions decide what counts

A position is "I'm trading this item from this date". A trade counts towards it when:

- it's the same item,
- it happened on or after the position's start date (and before it was closed),
- it was in Jita 4-4, unless you untick "Only count trades in Jita 4-4",
- and you haven't excluded it.

Everything else appears on the **Wallet** under "Trades no position tracks", guessed as loot, personal, trading or other; click the tag to correct it, or start a position from the trade. If you buy an item you're trading for your own use, exclude that row in the position.

Only one position per item can be open at a time. When everything has sold, close it to lock in the result, and start a new one next time you trade that item.

### How profit is worked out

- **Average cost**: each sale is costed at the average price of the stock you held at that moment.
- **Sales tax** comes from your wallet journal where ESI links it to the sale, and is estimated from your rates otherwise.
- **Broker fees** are read from your wallet journal, matched to each order by the second they were charged: placing an order, or changing its price, charges its fee that second. ESI gives no other link. A fee that can't be matched is worked out from your rates, and the page says how many were.
- **Price changes** are counted from the versions of your orders the app sees at each sync: a new price is a change, and its fee is matched to the journal the same way. Two changes between syncs show as one, and changes from before the app kept order history aren't counted.
- **Sales tax** is read from the journal, matched to each sale by the second it happened and its size.
- **Each order's fee belongs to its units.** A buy order's fee becomes part of what the stock cost; a sell order's fee is charged a share at a time as units sell; the share for units still waiting on an open order is shown as fees paid up front, not as a loss. So listing 2,000 units and selling 5 doesn't show as a large loss on the 5.

## Alpha and Omega

Fees depend on your clone state, because Alpha clones can't use some trade skills. The app uses these limits (from the EVE University wiki's Clone states page, February 2026):

| Skill | Alpha can use up to |
| --- | --- |
| Broker Relations | Level II |
| Trade | Level III (17 order slots) |
| Accounting, Advanced Broker Relations, Retail, Wholesale, Tycoon | Omega only |

- **Trained levels are stored, and caps are applied on top.** Anything you've trained above an Alpha cap shows as striped in Settings and switches on as soon as you set Omega.
- **Clone state is detected on sync when it can be.** ESI has no clone-state field, but an Alpha's skills show a lower active level than trained level. If nothing is capped and a trade skill is above the Alpha limit, you're Omega. Otherwise the app keeps what you set. You can always set it yourself in Settings or on the Omega page.
- **Old trades keep the rates you had then.** The app records your broker fee and sales tax whenever they change, so going Omega doesn't rewrite estimated fees on trades you made as Alpha. Fees read from your wallet journal are exact either way.
- **The app assumes Alphas pay no extra tax beyond these skill limits.** If the game shows different rates, tick "Use my exact broker fee and sales tax" in Settings, and update those numbers when you switch.
- **PLEX price** is the lowest sell order on the Global PLEX Market (ESI region 19000001). A month of Omega defaults to 500 PLEX; change it when the in-game store has a sale.

## Limits to know about

- **ESI only keeps recent history**: about 30 days of wallet transactions and journal, and 90 days of order history. The app keeps everything it has seen, so sync at least every few weeks. Anything older can be added by hand on the position page.
- **Your data is in one browser.** Use **Settings > Export backup** regularly, and import the file on another device.
- **One character per browser.** Syncing a second character mixes their trades.
- **Order prices step on a grid.** EVE order prices carry at most four significant figures, with 0.01 ISK as the floor
  ([Broker Relations](https://www.eveonline.com/news/view/broker-relations), March 2020). So the smallest change you can make
  to an order is 1,000 ISK on a million-ISK item and 0.01 ISK on a cheap one, not 0.01 ISK flat. The Watchlist and the
  Calculator's autofill price one step inside the spread, and the break-even and target prices are rounded onto the same grid.
- **Orders are only checked in Jita 4-4.** The book they are compared against is Jita's, so an order in any other
  station cannot be judged and is counted out with a note rather than shown blank. PLEX is the exception: it
  trades on one market for the whole game, so PLEX orders are checked wherever they are.
- **Stock is what sits loose in your Jita hangar, plus whatever is committed to open sell orders.** A sell order
  holds the goods itself, so both count. Anything packed into a container or a ship is reported by ESI against
  that container rather than a station, so it cannot be attributed and is reported separately instead.
- **"Open in game" needs a fresh login if you set the app up before it existed.** It asks for one scope,
  `esi-ui.open_window.v1`, purely so an item's market window can be opened in your client. Everything else works
  without it; log out and in again to enable the button, and add the scope to your application on
  <https://developers.eveonline.com/> as well. The button then appears anywhere an item is named — Prospects, the
  Watchlist, Positions, the Calculator and Orders.
- **Opening an item in game can't bring the game forward.** A web page isn't allowed to focus another application,
  so the market window opens behind whatever you're looking at and you still switch to the client yourself. That's
  a browser rule rather than a gap in ESI; the tools that raise the EVE window are separate programs running on
  your own machine.
- **Prospects samples the market, it doesn't read all of it.** The whole Forge order book is 408 pages, so a scan
  reads 20 random ones. ESI shuffles order pages by item, so that is a fair 5% sample, but a quiet item can be
  missed. Trading history costs one request per item, so a run checks a few hundred and keeps what it learns —
  scan again to widen the net. Coverage is shown under the filters.
- **Alerts can arrive as EVE mail**, for when you're in the game and a browser notification would be held back.
  It's off until you turn it on in Settings → Alerts, only ever goes to your own character, puts everything one
  check found in a single mail, and by default only mails what you can act on in game (an order worth moving, a
  planet about to stop). Item names in the mail open the item in game. Alert mails delete themselves after a time
  you choose, from 30 minutes to a week, read or not; the app only deletes mails from you to you whose subject
  starts "Jita Ledger:". Like every alert, it only checks while a tab is open.
- **Fee matching goes by the clock.** ESI's journal doesn't say which order a broker fee or which sale a tax was for, so they're matched by the second they were charged. A price change made and undone between two syncs, or two made close together, can be missed.
- **Tested with mocked ESI responses**, not against the live API. If a route has changed, the error message will say which one.

## If login fails

If logging in shows "The browser couldn't reach the EVE login server", the browser has probably blocked the token request (you'll see a CORS error in the developer console). Fix it with the small proxy in `proxy/worker.js`:

1. Create a Cloudflare Worker, paste in `proxy/worker.js`, and deploy it.
2. Add a repository variable `TOKEN_PROXY` with the Worker's URL (and `VITE_TOKEN_PROXY` in `.env.local` for local development).
3. Re-run the deploy workflow.

The proxy only forwards the token request. There's no secret involved.

## Security

- Almost every scope only reads. The few that act do small, visible things: open a market window, set an
  autopilot destination, send alert mail to yourself (only once you turn it on) and delete the app's own alert
  mails. None can move ISK, and ESI has no way at all to place, change or cancel a market order.
- The refresh token is kept in this browser's local storage so you stay logged in. Log out to revoke it, or remove the app's access from the third-party applications page of your EVE account.

## Tech

Vite, React, TypeScript and idb-keyval; charts are inline SVG. ESI requests send an `X-Compatibility-Date` header (see `src/lib/config.ts`).
