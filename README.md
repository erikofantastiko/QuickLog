# QuickLog

Single-file trade logging and position sizing tool for prop firm trading (FTMO + Breakout).
ICT/FX and crypto. No backend, no dependencies beyond two CDN scripts. Runs as a static page.

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

Drop `index.html` into any static host (GitHub Pages, Cloudflare Pages). Must be served over HTTPS
for clipboard and PNG download to work without fallbacks. On mobile, "Add to Home Screen" makes it
behave like an app (dark status bar, full-screen).

## Contract values — IMPORTANT

The FTMO contract values are **back-calculated from my own logged trades**, not pulled from an
official FTMO spec sheet. Formula used: `CV = Risk$ / (Lot × SL-distance)`.

| Instrument | CV (per 1.0 price move, per lot) | Source |
|---|---|---|
| EUR/USD, GBP/USD, EUR/GBP, AUD/USD, USD/CAD | 100,000 | standard lot |
| USD/JPY (+ JPY crosses) | 100,000 ÷ entry price (auto-derived) | standard lot, exact |
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

**Breakout** is crypto-only (since Feb 2024), perpetuals, Kraken-backed feeds. Sizing is in coins:
`coins = Risk$ / |Entry − SL|` (CV = 1). No FX/indices/metals on Breakout.

**Lot/coin step rounding.** The computed volume is floored to a tradeable step per instrument
(FTMO `0.01` lots, Breakout `0.001` coins). Flooring is deliberate — it can only round risk *down*,
never above the target. Like the contract values, these steps are assumptions, not verified broker
specs; correct them in the `step` field of the relevant `PRESETS` entry if your platform differs. If
the risk is too small for one step, the sizer shows a "below minimum size" warning instead of a
fake-tradeable figure.

## Chart feeds

Default feed follows the selected instrument (FTMO → OANDA feeds, Breakout → Kraken). Override the
feed for futures (`CME_MINI:NQ1!`, `CME_MINI:ES1!`) or another broker via the feed input, or change
symbol directly inside the chart. The chart is visual reference only — the broker feed used for real
levels may differ (e.g. CMC vs OANDA divergence), so always read levels from the platform you execute on.

If `tv.js` is blocked by the host's CSP or the network, the chart falls back to the TradingView embed
iframe, and below it a "Open on TradingView ↗" link as a last resort — so the chart area degrades
gracefully instead of going blank.

## Persistence

All inputs and UI toggles (active tab, direction, Live/Backtest mode, chart open, contract-value
override) are saved to `localStorage` under the key `quicklog` on every change and restored on load,
so a refresh or "Add to Home Screen" relaunch does not wipe the form. Clearing that key (or browser
site data) resets to defaults. No trade history is stored — only the current working entry.

## Sheet column order (Live mode)

The copied row maps to the Trades tab in this exact order (empty fields left blank for later fill):

```
Trade # | Datum & Zeit | Asset | Setup Screenshot | Entry | Exit | SL | TP | Lot Size |
Risk % | Risk in $ | PnL ($) | PnL (%) | Risk/Reward | R Ergebnis | Kumulatives R |
Richtung | Session | Ergebnis | Setup/Grund | Trade Management | Emotionen | Feedback
```

Backtest mode prepends 5 columns: `BT-Session-ID | Pool | Random-Date | Briefing-Korrekt | System-Konformität`.

The empty spacer column that used to sit between `Ergebnis` and `Setup/Grund` has been removed from
the sheet — the mapping assumes it is gone.

## Stack

- Plain HTML/CSS/JS, no framework
- `html2canvas` (CDN) for PNG export
- TradingView `tv.js` widget (CDN) for the optional chart
- Clipboard API with `execCommand` fallback