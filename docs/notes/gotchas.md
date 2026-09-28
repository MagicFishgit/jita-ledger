# Gotchas that have bitten

Traps in the code, the tools and the browser that have cost time before.

- **Editing any file the Worker imports kills a scheduled run in `wrangler dev`**, and that includes the app's
  `src/lib` modules it shares (`prospects.ts`, `evaluate.ts`, …). The reload ends the run without an error or a log
  line, so it looks exactly like a hang: the first local full scan "stopped" at 700 items two minutes after
  `prospects.ts` was saved. Don't touch shared modules while a local scheduled run is going.
- **An inline `subscribe` for `useSyncExternalStore` is a new function every render**, so React unsubscribes and
  subscribes again each time. A store that starts work on its first subscriber, or writes a new snapshot object on
  subscribe, then loops: the scan-status store did, the tab hit "Maximum update depth" and grew to 2 GB. Define the
  subscribe function once at module level, and only replace the snapshot when something changed.
- **`\uXXXX` in JSX *text* is not an escape** and renders literally. Only inside JS string literals. The same
  goes for `\n` in a quoted JSX attribute (`tip="a\nb"` shows a backslash): a structured tip needs `tip={'…'}`.
- **`.data td` sets `white-space: nowrap`**, which children inherit — anything wrapping inside a table
  cell needs `white-space: normal` or it blows out the table width.
- **Relative times are computed at render and nothing ticks on its own.** Use `useNow()` and pass it to
  `ago()` / `until()`, or the display freezes on whatever it first said.
- **Grid items default to `min-width: auto`**, so text won't wrap and overflows its track. `min-width: 0`.
- Tooltips must be positioned out of the flow; one that pushes rows down is worse than none.
- **`fetch()` defaults to the browser's HTTP cache**, and ESI market data is `cache-control: public`
  with an Expires minutes out — so a repeat read is answered in ~3ms without a request being made.
  Measured: 612ms, then 3ms, then 358ms with `cache: 'no-cache'`. Pass `fresh: true` to `esi()` when
  someone has explicitly asked to re-check, or the button does nothing and looks broken.

- **Python `str.replace` no-ops silently when the anchor has drifted.** No error, the file is
  written unchanged, the commit lands and the doc is quietly wrong. Five commits' worth of EVE facts
  went missing exactly this way — one anchor in this file moved and everything chaining off it
  cascaded — and it was caught only by grepping for the phrases afterwards. Use the Edit tool, or
  `assert anchor in s` before every replace, and grep for what you added once it is written.
- **`.notice > svg`, not `.notice svg`.** The descendant rule sized, nudged and recoloured the icon inside
  a link placed in a notice ("Open Prospects" sat off its text). A notice's own icon is always its direct
  child. `.link-btn` also carries `vertical-align: middle`, since an inline-flex button in a line of text
  otherwise sits on its icon's edge.
- **A global CSS rule on a shared class reaches pages you aren't looking at.** `.chip` becoming
  `inline-flex`, `.kv .v` gaining `nowrap` and `.empty svg` (which enlarged every icon inside an empty state's
  button until narrowed to `.empty > svg`) all changed pages other than the one being built. Re-shoot the
  Calculator, Prospects and a settings tab after touching `styles.css`.
- **Never key a React list by a display label.** Every unnamed structure on the Wallet was labelled "A player
  structure", the rows shared that key, and React reused the wrong row on re-render: a stale "Pricing…" and
  a list that looked unsorted. Key by the ID the row stands for.
- **Test with an empty store and a sparse one, not only a rich seed.** The Wallet crashed the whole app on
  a ledger with trades but no journal (the state of anyone whose early syncs predate the full journal):
  the oldest entry was `Infinity` and formatting it threw. A rich synthetic ledger never shows that. Pages
  now render inside `PageBoundary`, so a failing page shows its error inside the shell instead of a blank app.
  `npm run check-pages` (`scripts/pages.mjs`) now does this on every page and settings tab, with an empty, a small
  and a large generated ledger (4,000 trades, 400 orders, 41 positions, two of them on one item), refusing every
  request outside its own Vite server; a throw, the error boundary or any React warning fails it. The deploy workflow
  runs it before publishing. Checked by planting a duplicate key on Omega and a throw on Combat: both failed, with
  the message. It uses `playwright-core` pinned to 1.61.1, the version whose Chromium (1228) the Playwright MCP had
  already downloaded here, so installing it fetched no browser.
- **`browser_navigate` to the same URL with another `#hash` keeps the old document**, including modules an
  HMR update failed to replace — a page can run stale code while the file on disk is right. `location.reload()`
  after edits, and import the app's own module instance (its `?t=` URL from `performance`), not the bare path.
- **`SCOPE_INFO` in `config.ts` is the single answer to "what do I need to enable".** Settings lists
  every scope, its exact ESI name, what it unlocks and what breaks without it, logged in or not ---
  a scope registered on the application but granted before it was added is simply absent, with no
  error anywhere. Add a scope to `SCOPES` and add its entry here in the same commit.
