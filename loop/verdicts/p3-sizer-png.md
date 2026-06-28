# Verdict — loop/p3-sizer-png

**Item:** P3 (Politur) — Sizer-Ergebnis als PNG in die Zwischenablage (copy/paste, Download-Fallback),
analog zur Log-Karte.
**Branch:** `loop/p3-sizer-png` (739a2ec) → merged 89d1755.
**Verifier:** unabhängig, read-only.

## Mechanik
Clipboard/Download-Kern aus `exportPng` in shared `exportNodePng(tmp, filenameBase, btn, btnLabel)`
extrahiert; Log-Export ruft ihn (byte-identisch), neuer Sizer-Pfad `exportSizerPng`→`readSizer`→
`sizerCardHtml`→`exportNodePng`. Button `#szExb` "Copy Sizer PNG".

## Gates

| Gate | Ergebnis | Beleg |
|---|---|---|
| G-BASE | PASS | merge-base==main; maybeAutoDirection==3, ClipboardItem/roundVol present |
| G-SYNTAX | PASS | `node --check` grün |
| **G-AC2 (Log-Export-Regression)** | **PASS** | `exportNodePng`-Body == alter `exportPng`-Kern (28 Zeilen, leerer Diff nach Rückbenennung); gleiche Toasts/Dateiname/Clipboard-Download-Split |
| G-SHEET | PASS | `copyForSheet`/`SHEET_COLUMNS` byte-identisch; 23/28 |
| G-SIZING | PASS | `calcSize`/`contractValueFor`/`roundVol` byte-identisch |
| G-TEST | PASS | 25/25; vol×2-Mutation ⇒ exit 1 |
| G-ITEM AC1/AC3 | PASS | Sizer-Daten gerendert; `calcSize`null ⇒ Hinweis-Toast (kein leeres Bild); tmp/Button-Restore beide Buttons |
| G-SCOPE | PASS | nur die 6 deklarierten Zonen |
| Adversarial | PASS (+Note) | Instrument/Broker via `esc()`; Doppelklick-Guard; Null-Bail |

## VERDICT: APPROVE

**Non-blocking Befund → neues Backlog-Item:** Preisfelder `entry`/`sl`/`tp` fließen ungeescaped in
`sizerCardHtml` UND `cardHtml` — aber das ist die bereits approvte Baseline (P1 escapte bewusst nur
asset/note). Keine Regression. Härtung (beide Karten gemeinsam) als eigenes P3-Item notiert.
