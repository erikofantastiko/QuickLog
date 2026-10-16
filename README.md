# QuickLog

Installable, offline-capable trade logging and position sizing tool for prop firm trading
(FTMO + Breakout). ICT/FX and crypto. No backend, no build step, no runtime CDN dependency for the
core — runs as a static page / installable PWA.

## What it does

Two tabs:

**Position Sizer** — price-level based sizing (no pips). Enter account, risk %, entry and stop as
actual price levels; the tool returns volume, risk in $, SL distance, reward and R:R. Optional
TradingView chart embed for reading levels off the chart (levels are typed manually, not auto-pulled).

**Trade Log** — Live and Backtest modes. Builds a tab-separated row matching the Google Sheets
journal column order. Two outputs: "Copy for Sheet" (clipboard) and "PNG for X" (renders the trade
card as an image via html2canvas).

"Send to Trade Log →" carries sizer values into the log tab.

## Hosting

Drop the whole folder (`index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js`,
`vendor/`, `icons/`) onto any static host (GitHub Pages, Cloudflare Pages) — all paths are relative so
it works under a subpath like `/QuickLog/`. Serve over HTTPS so the clipboard, PNG export and the
service worker register without fallbacks. On mobile, "Install" / "Add to Home Screen" makes it behave
like a native app (dark status bar, full-screen, launches offline). Opening `index.html` via `file://`
also still works — the service worker is skipped there.

The service worker (`sw.js`) precaches the app shell (`quicklog-v2`) so the core (Sizer + Log + PNG)
loads and runs offline. The TradingView chart and any price feeds stay online-only (cross-origin
requests are passed straight through and never cached).

## Contract values — IMPORTANT

The FTMO contract values are **back-calculated from my own logged trades**, not pulled from an
official FTMO spec sheet. Formula used: `CV = Risk$ / (Lot × SL-distance)`.

| Instrument | CV (per 1.0 price move, per lot) | Source |
|---|---|---|
| EUR/USD, GBP/USD, AUD/USD | 100,000 | standard lot |
| USD/JPY, USD/CAD | 100,000 ÷ entry price (auto-derived) | standard lot, exact |
| EUR/JPY, GBP/JPY, EUR/GBP (crosses) | 100,000 ÷ entry × BASE→USD rate | standard lot, exact |
| US100 (NDX) | 1 | logged FTMO trades + $1/point confirmation |
| US500 (SPX) | 1 | FTMO CFD logic, analogous to US100 |
| XAU/USD | 100 | 1 lot = 100 oz |
| XAG/USD | 5000 | 1 lot = 5000 oz |
| BTC/USD, ETH/USD | 1 | logged FTMO trades (≈1 unit/lot) |

**Verify against MT5 before trusting blindly.** FTMO does not publish a central CV table; the exact
value is in the platform: Market Watch (Ctrl+M) → right-click instrument → Specification. If a value
differs, overwrite the Contract Value field in the sizer — every instrument has a manual override.

JPY-quoted pairs (USD/JPY and JPY crosses) are now sized exactly: the contract value is auto-derived
as `100,000 ÷ entry price` whenever an entry is filled (P&L per 1.0 move is `100,000 / price` USD, not
$100,000). The Contract Value field shows the derived number and stays editable — typing into it turns
the auto-derive off (manual override). If a JPY pair is selected without an entry, the result waits
rather than sizing off a stale value.

**Cross pairs without USD** (EUR/JPY, GBP/JPY, EUR/GBP) need the base currency's USD rate:
`CV = 100,000 ÷ entry × EURUSD` (or GBPUSD for GBP/JPY). The rate is fetched keyless from Kraken's
public ticker and shown in the "EUR→USD rate" field; you can type your own (pinned as manual, clear
the field to auto-fetch again). Without a rate the sizer shows **no size** on purpose: the old
`100,000 ÷ entry` alone is in the base currency and over-sized these pairs by ~17 % (EUR) to ~30 % (GBP).

**MT5 check.** Under Contract Value, "MT5 check" takes Tick size and Tick value from MT5
(Market Watch → right-click → Specification). `CV = Tick value ÷ Tick size`. Within 1 % of the
current CV the instrument is marked "✓ MT5 verified <date>" (stored locally); otherwise you get the
difference and a "Use MT5 value" button that sets it as manual override. Expected FTMO values:
EUR/USD 0.00001 / 1 → 100,000 · US100 0.01 / 0.01 → 1 · ETH/USD 0.01 / 0.01 → 1.

**R targets & 2-stop plan.** The sizer result lists price and $ P&L at 1/2/3/5/10R (with the
rounded size). A 2-stop plan (half out at 0.5R, rest at the SL → total loss 0.75R; size is not
scaled up) can be shown with "2-Stop plan"; it is hidden by default. Both are display only.

**Breakout** is crypto-only (since Feb 2024), perpetuals, Kraken-backed feeds. Sizing is in coins:
`coins = Risk$ / |Entry − SL|` (CV = 1). No FX/indices/metals on Breakout.

**Lot/coin step rounding.** The computed volume is floored to a tradeable step per instrument
(FTMO `0.01` lots, Breakout `0.001` coins). Flooring is deliberate — it can only round risk *down*,
never above the target. Like the contract values, these steps are assumptions, not verified broker
specs; correct them in the `step` field of the relevant `PRESETS` entry if your platform differs. If
the risk is too small for one step, the sizer shows a "below minimum size" warning instead of a
fake-tradeable figure.

## Chart & Entry/SL/TP lines

The sizer chart draws your **Entry / SL / TP as real horizontal price lines** that move live as you
type the levels — provided a free candle source exists for the instrument. Which engine is used is
decided per instrument:

| Instrument | Engine | Data | Lines? |
|---|---|---|---|
| Crypto (Breakout coins + FTMO BTC/ETH) | Lightweight Charts | Kraken public OHLC (no key) | ✅ real lines |
| FX pairs + metals (XAU/XAG) | Lightweight Charts | Twelve Data (free API key) | ✅ real lines (with key) |
| Indices (US100/US500), custom, manual feed override | TradingView `tv.js` widget | — | ⬜ level chips only |

Why the split: the embedded TradingView widget is a sealed cross-origin iframe — it has no API to
draw a line at a price, and we can't map price→pixel inside it. Drawing real lines requires *our own*
chart engine ([TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts),
free, vendored), which needs candle **data**. Free no-key data exists only for crypto (Kraken); FX/metals
need a data provider key; index OHLC isn't on free tiers, so indices keep the widget + corner chips.

**Twelve Data API key (for FX/metal lines).** Get a free key at
[twelvedata.com](https://twelvedata.com/pricing) (free tier covers forex + metals; ~800 calls/day is
ample). Paste it into the chart's **Data API key** field. It is stored **only in your browser**
(`localStorage` key `quicklog_td_key`) — never committed to the code, never in an exported PNG or the
"Copy for Sheet" row. The published site ships keyless. Without a key, FX/metals fall back to the
widget. Indices on the free tier aren't covered (and the ETF proxies trade at a different price scale),
so US100/US500 stay on the widget regardless.

Any failure (data source blocked by CORS, unsupported symbol, bad/expired key, lib load fails) degrades
gracefully to the TradingView widget + chips — never a blank chart.

## Persistence

All inputs and UI toggles (active tab, direction, Live/Backtest mode, chart open, contract-value
override) are saved to `localStorage` under the key `quicklog` on every change and restored on load,
so a refresh or "Add to Home Screen" relaunch does not wipe the form. Clearing that key (or browser
site data) resets to defaults. No trade history is stored — only the current working entry.

## Sheet column order (Live mode)

The copied row maps to the Trades tab in this exact order (23 columns, A–W):

| Col | Header | Filled by |
|-----|--------|-----------|
| A | Trade # | sheet (auto-numbering) |
| B | Datum & Zeit | app |
| C | Asset | app |
| D | Setup Screenshot | app — *Sheet extras*, optional |
| E | Entry | app |
| F | Exit | app — *Sheet extras*, optional (empty while the trade is open) |
| G | SL | app |
| H | TP | app |
| I | Lot Size | app |
| J | Risk % | app |
| K | Risk in $ | app — *Sheet extras*, optional |
| L | PnL ($) | app — *Sheet extras*, optional |
| M | PnL (%) | **sheet formula — always pasted empty** |
| N | Risk/Reward | **sheet formula — always pasted empty** |
| O | R Ergebnis | **sheet formula — always pasted empty** |
| P | Kumulatives R | **sheet formula — always pasted empty** |
| Q | Richtung | app |
| R | Session | app |
| S | Ergebnis | app — *Sheet extras*, optional (`Win` / `Lose` / `Breakeven`) |
| T | Setup/Grund | app (setup + note) |
| U | Trade Management | app — *Sheet extras*, optional |
| V | Emotionen | app — *Sheet extras*, optional |
| W | Feedback | app — *Sheet extras*, optional |

The four formula columns M–P are **never** written by the app. The R:R shown on the trade card is
display-only; pasting a static value into N would overwrite the sheet's own formula.

The optional columns live behind the collapsible **"Sheet extras (optional)"** section in the Trade
Log tab. Leaving them empty is fine — they copy as empty cells, so a still-open trade pastes cleanly
and the fields can be filled in later directly in the sheet.

Backtest mode prepends 5 columns: `BT-Session-ID | Pool | Random-Date | Briefing-Korrekt |
System-Konformität` (28 columns total); columns 6–28 are the Live mapping above, unchanged.

The empty spacer column that used to sit between `Ergebnis` and `Setup/Grund` has been removed from
the sheet — the mapping assumes it is gone.

## Stack

- Plain HTML/CSS/JS, no framework, no build step — `index.html` (markup) + `app.js` (one classic IIFE,
  not an ES module, so `file://` keeps working) + `styles.css`
- Installable PWA: `manifest.webmanifest` + `sw.js` (app-shell precache, stale-while-revalidate for
  same-origin, network-only passthrough for chart/feeds) + `icons/`
- `html2canvas` vendored locally (`vendor/html2canvas.min.js`) for offline PNG export
- TradingView `tv.js` widget (CDN, loaded on demand) for the optional chart — online-only
- Clipboard API with `execCommand` fallback