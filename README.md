# Jita Ledger

A station trading tool for Jita 4-4 that runs entirely in your browser and is hosted on GitHub Pages.

- **Calculator**: profit per unit after broker fees and sales tax, break-even and target prices, with live Jita 4-4 prices and daily volume from ESI.
- **Prospects**: finds items worth trading by sampling the Jita order book, then checking how often each one really
  changes hands. Anything that doesn't trade on most days is left out, however wide the margin. A **quick scan**
  takes about a minute and a half and skims the busiest books; a **deep scan** samples three times as much of the
  order book, lowers the bar so quieter items make the shortlist, and checks several times as many of them, which
  takes minutes. Both are resumable, and the table sorts on any column. A scan refreshes prices over an hour old,
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
- **Positions**: track an item you're trading from the first buy to the last sell. Buys, sells, fees and tax are pulled from your wallet, so you can see what you actually made and how your prices compared with the market.
- **Inbox**: trades that don't belong to any position, so personal purchases stay out of your trading results.
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

Everything else lands in the **Inbox**. From there you can mark a trade as personal, count it in an open position, or start a new position from it. If you buy an item you're trading for your own use, exclude that row in the position.

Only one position per item can be open at a time. When everything has sold, close it to lock in the result, and start a new one next time you trade that item.

### How profit is worked out

- **Average cost**: each sale is costed at the average price of the stock you held at that moment.
- **Sales tax** comes from your wallet journal where ESI links it to the sale, and is estimated from your rates otherwise.
- **Broker fees** come from your wallet journal where the entry's context ID matches one of your orders for the item, and are estimated from your rates otherwise. The position page shows how many were estimated.
- **Price changes** are only counted when the journal links each broker fee to its order. Estimated orders don't include relist fees.
- Fees are subtracted when they're paid, so a position can show a small loss right after you place orders.

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
- **The Orders page needs a fresh login if you set the app up before it existed.** It asks for one new scope,
  `esi-ui.open_window.v1`, purely so a row can open that item's market window in your client. Everything else on
  the page works without it; log out and in again to enable the button. Add the scope to your application on
  <https://developers.eveonline.com/> as well.
- **Prospects samples the market, it doesn't read all of it.** The whole Forge order book is 408 pages, so a scan
  reads 20 random ones. ESI shuffles order pages by item, so that is a fair 5% sample, but a quiet item can be
  missed. Trading history costs one request per item, so a run checks a few hundred and keeps what it learns —
  scan again to widen the net. Coverage is shown under the filters.
- **Journal linking is an assumption.** Matching broker fees to orders assumes the journal's `context_id` for `brokers_fee` entries is the order ID. If yours isn't, broker fees fall back to estimates, labelled as such.
- **Tested with mocked ESI responses**, not against the live API. If a route has changed, the error message will say which one.

## If login fails

If logging in shows "The browser couldn't reach the EVE login server", the browser has probably blocked the token request (you'll see a CORS error in the developer console). Fix it with the small proxy in `proxy/worker.js`:

1. Create a Cloudflare Worker, paste in `proxy/worker.js`, and deploy it.
2. Add a repository variable `TOKEN_PROXY` with the Worker's URL (and `VITE_TOKEN_PROXY` in `.env.local` for local development).
3. Re-run the deploy workflow.

The proxy only forwards the token request. There's no secret involved.

## Security

- The app asks for read-only scopes. It can't move ISK, place orders or change anything in game.
- The refresh token is kept in this browser's local storage so you stay logged in. Log out to revoke it, or remove the app's access from the third-party applications page of your EVE account.

## Tech

Vite, React, TypeScript, Recharts and idb-keyval. ESI requests send an `X-Compatibility-Date` header (see `src/lib/config.ts`).
