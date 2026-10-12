# Changelog

Version = `APP_VERSION` in `app.js` (also shown in the footer and used as the service-worker cache name).

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
- Version in the footer, this changelog, CI (GitHub Actions: syntax + 194 money-math assertions).

### Before 1.0
PWA/offline split, JPY and account-currency aware contract values, FTMO contract sizes verified,
real Entry/SL/TP chart lines (Kraken, Twelve Data), PNG to clipboard, step rounding, direction
validation, custom risk, sizer PNG, sheet extras columns D/F/K/L/S/U/V/W. Details in `Scratchpad.md`.
