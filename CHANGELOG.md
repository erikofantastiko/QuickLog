# Changelog

Version = `APP_VERSION` in `app.js` (also shown in the footer and used as the service-worker cache name).

## 1.1.2 — 2026-10-16

### Changed
- UI is English throughout: Trade Log labels (Result, Emotions), placeholders, the sheet-extras
  hint, the "image copied" toast, the MT5 check hint and the "Result" cell on the trade card / PNG.
  Values exported to the sheet are unchanged.

## 1.1.1 — 2026-10-16

### Changed
- 2-stop plan: on/off switch "Stops: Single stop | 2-Stop" below Take Profit (like Yolo's calculator)
  instead of a collapsible header in the result. Default Single stop, choice is remembered.

## 1.1.0 — 2026-10-16

### Fixed
- **ETH/USD sized 10× too large.** FTMO MT5 shows contract size 10 (1 lot = 10 ETH); the preset had 1.
- **Cross pairs over-sized 17–30 %.** EUR/JPY, GBP/JPY, EUR/GBP now use `100,000 ÷ entry × BASE→USD`
  (Kraken public ticker, or typed by hand). Without a rate the sizer shows no size.
- **USD/JPY 1.49 instead of 1.50 lots.** Entry-derived contract value keeps full precision.

### Added
- Presets checked against FTMO MT5 screenshots (EUR/USD, US100, US500, BTC/USD, ETH/USD, XAU/USD,
  XAG/USD) show "✓ MT5 verified"; "MT5 check" compares contract size / profit currency / volume step.
- Warning above the MT5 max volume per order (EUR/USD 50, US100/US500 1000, ETH/USD 5).
- R targets (1/2/3/5/10R) and a Yolo-style 2-stop plan (hidden by default) under the sizer result.
- Browser test suite `test/ui.test.mjs` (Playwright, local only).

## 1.0.0 — 2026-10

First tagged release. Focus: the numbers you size and journal with can't be silently wrong.

### Fixed
- **Comma thousands sized up to 1000× too large.** `20,150` was read as 20.15. Number input is now
  parsed strictly: dot or comma decimals, space/apostrophe/grouped thousands, garbage rejected. An
  ambiguous `20,150` is resolved by the instrument's price range, otherwise the sizer shows
  *Can't read …* and no size.
- **Send to Log kept the previous trade's direction.** The transfer now derives Long/Short from
  Entry vs SL and drops a manual pin.
- **Log card / PNG showed a positive R:R with TP on the wrong side.** Now `—`, same rule as the sizer.
- **Empty custom risk exported `NaN%`** into sheet column J. Now an empty cell.
- **Send to Log without a result kept the old volume.** Volume and Risk $ are cleared instead.
- **First load after a deploy ran the old version** (stale-while-revalidate app code). App code is now
  network-first with offline fallback; the cache rolls with `APP_VERSION`.

### Added
- Plausibility warnings: leverage above the broker maximum, SL closer than 0.02 % of entry,
  levels outside the instrument's plausible range (`20.150` on US100).
- Send to Log offers to clear the previous trade's note and sheet extras.
- Send to Log fills Risk $ (column K) with the real risk of the rounded volume.
- "New trade (clear fields)" button in the Trade Log.
- Decimal keypad on phones for number fields; every label focuses its field.
- Version in the footer, this changelog, CI (GitHub Actions: syntax + 196 money-math assertions).

### Before 1.0
PWA/offline split, JPY and account-currency aware contract values, FTMO contract sizes verified,
real Entry/SL/TP chart lines (Kraken, Twelve Data), PNG to clipboard, step rounding, direction
validation, custom risk, sizer PNG, sheet extras columns D/F/K/L/S/U/V/W. Details in `Scratchpad.md`.
