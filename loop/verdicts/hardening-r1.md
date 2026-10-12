# Verdict — claude/quicklog-hardening, Runde 1 (main..fb48777)

**Items:** p0-number-parse, p0-send-direction, p1-log-rr-side, p1-log-risk-nan, p2-sw-update,
p2-ci-gate, p1-plausibility, p2-numeric-keypad, p2-labels, p2-risk-usd, p1-new-trade.
**Verifier:** unabhängig, read-only; jsdom-E2E-Harness, 15 Mutationen, Fuzz 400k Eingaben gegen
eigene Referenz-Implementierung.

## Gates

| Gate | Ergebnis | Beleg |
|---|---|---|
| G-SYNTAX | PASS | `node --check` app.js + sw.js |
| G-TEST | **FAIL** | 150/150 grün, aber 5 von 15 Mutationen überlebten (M2 US-Gruppierung, M11 Pin in sendToLog, M12 `exi` aus TRADE_FIELDS, M13 Risk-Zelle `NaN%`, M14 rskUsd nicht geleert) |
| G-SHEET | PASS | `SHEET_COLUMNS` ohne Diff; jsdom live 23 / backtest 28, M–P leer; nur Zellwert J geändert |
| G-SIZING | PASS | Volumenformel unverändert; EUR/USD 0.8333 → 0.83 |
| G-SECRET | PASS | TD-Key weder in Blob, Zeile noch Karte |
| G-SCOPE | flagged | loop-docs-Commit lockert G-SHEET-Wortlaut auf „nur Zellwert, nie Reihenfolge" — bewusst (Item 4 ändert einen Zellwert), Erik soll es abnicken |
| Item 1 parseNum | **FAIL** | Leerzeichen/Apostroph ohne Gruppenprüfung entfernt: `'20150 20100'` → 2015020100, `'12 5'` → 125 |
| Items 2–10 | PASS | Code-Pfade in jsdom verfolgt |

## Zusätzliche Befunde (nicht blockierend, alle umgesetzt)
- Send to Log trug Exit/PnL/Ergebnis/Notizen des Vortrades mit (Altverhalten).
- US100 `'20.150'` (Punkt als Tausender) = 20.15 → 1000× ohne Warnung (Altverhalten).
- SW lieferte 404/5xx statt Cache; ohne `cache:'no-cache'` kann der HTTP-Cache alt antworten.
- CI auf Node 20 (EOL).

## VERDICT: REJECT → Fixes in d8e3cf3 (+ 31a93f2 für `no-cache`)
Nach d8e3cf3 fing die Suite die eigenen 15 Mutationen. **Korrektur aus Runde 2:** M13 war nur am
Helfer `sheetRisk` getötet, nicht an der Aufrufstelle in `copyForSheet` (M13a überlebte). Behoben in
Runde 2 (echter `copyForSheet`-Test). Siehe `hardening-r2.md`.
