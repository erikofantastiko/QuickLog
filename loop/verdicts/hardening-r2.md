# Verdict — claude/quicklog-hardening, Runde 2 (main..9bdf871)

**Verifier:** unabhängig, read-only; jsdom, 19 Mutationen, Fuzz 1,3 Mio. Eingaben (Ziffern, `. , - + '`,
Leerzeichen, NBSP, U+202F, strukturierter Gruppierungs-Generator) gegen eigene Tokenizer-Referenz.

| Gate | Ergebnis | Beleg |
|---|---|---|
| G-SYNTAX | PASS | `node --check` app.js + sw.js |
| G-TEST | **FAIL** | 182/182; M13a (Aufrufstelle `risk: getLogRisk()+'%'` in `copyForSheet`) überlebt — nur der Helfer war getestet |
| G-SHEET | PASS | `SHEET_COLUMNS` byte-identisch zu main; live 23 / backtest 28, M–P leer, J korrekt |
| G-SIZING | PASS | Formel unverändert, PRESETS ohne `band`/`maxLev` identisch zu main; EUR/USD 0.8333 → 0.83, Risk $ 249.00 |
| G-SECRET | PASS | TD-Key nirgends in Zeile/Blob/Karte |
| G-SCOPE | flagged | Änderung an Agent-/Loop-Dokumenten (inkl. Verifier-Gate-Wortlaut) braucht Eriks OK |
| parseNum-Fix | PASS | Fuzz 1,3 Mio.: 0 falsche Zahlen (gleiche Harness findet 117k auf fb48777) |
| outsideBand, Leftovers, sw.js, CI | PASS | in jsdom bzw. gemocktem SW verfolgt |

Nicht blockierend: M18 (Obergrenze Band), M21/M24 (TRANSFER_FIELDS), M2d (`\d+` statt `\d{1,3}`)
überlebten; CLAUDE.md „jedem Preset" ungenau (Custom hat keins).

## VERDICT: REJECT → Fix in der Folge-Commit
Echter `copyForSheet` jetzt extrahiert und getestet (live 23/backtest 28, J leer bei leerem Custom-Risk,
J an Index 14 im Backtest, M–P leer). Plus Tests für M18, M21, M24, M2d. Suite 182 → 194; M13a, M13b,
M18, M21, M24, M2d und ein Spaltentausch E↔G sind 7/7 rot. Runde 3 siehe `hardening-r3.md`.
