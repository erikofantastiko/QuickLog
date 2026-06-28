# Verdict — loop/p3-custom-risk

**Item:** P3 (Politur) — freies Risk-% im Sizer + Log via "Custom…"-Option (Muster wie Custom-Account).
**Branch:** `loop/p3-custom-risk` (8d0de3d) → merged 361391b. `index.html` + `test/sizing.test.mjs`.
**Verifier:** unabhängig, read-only; Test/Mutationen gegen Temp-Kopien.

## Mechanik
`getSizerRisk()` (Sizer) / `getLogRisk()` (Log) liefern Preset- oder Custom-Wert. `calcSize` liest
Risk über `getSizerRisk()`; `copyForSheet`/`readCard` über `getLogRisk()`. Sheet-Spalten unverändert —
nur die WERT-Quelle einer Zelle (`$('rsk').value` → `getLogRisk()`). Test 20→25 (getSizerRisk in
Extraktion mitgezogen + Custom-Pfad-Assertions).

## Gates

| Gate | Ergebnis | Beleg |
|---|---|---|
| G-BASE | PASS | merge-base==main; maybeAutoDirection==3 (keine Auto-Direction-Regression!), ClipboardItem/roundVol present |
| G-SYNTAX | PASS | `node --check` grün |
| G-SHEET | PASS | `SHEET_COLUMNS`/`cols.map` nicht im Diff; live 23/backtest 28; nur Wert-Quelle in copyForSheet |
| G-SIZING | PASS | `vol=riskAmt/(dist*cv)`, `FX_LOT`, `contractValueFor` byte-identisch |
| G-TEST-INTEGRITY | PASS | 25/25; alle 3 Regressions-Mutationen fangen weiter; neue Custom-Assertion „beißt" (getSizerRisk neutralisiert ⇒ fail); keine Assertion gelöscht/aufgeweicht |
| G-ITEM AC1–AC4 | PASS | Sizer/Log-Custom, sendToLog-Transfer, Persistenz nachverfolgt |
| G-SCOPE | PASS | nur erlaubte Zonen + Test |
| Adversarial | flagged, non-blocking | leeres `rskCustom` ⇒ Sheet "NaN%" (kosmetisch, absichtliche Fehlbedienung; Sizer-Seite geschützt → kein Mis-Sizing) |

## VERDICT: APPROVE

**Optionales Follow-up (out of scope, kosmetisch):** `getLogRisk` mit `||0` härten bzw. `NaN` vor
`+'%'` in `copyForSheet` guarden, um das „NaN%"-Token bei leerem Custom-Feld zu vermeiden.
