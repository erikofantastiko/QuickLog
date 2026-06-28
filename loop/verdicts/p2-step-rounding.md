# Verdict — loop/p2-step-rounding

**Item:** P2 — Sizer-Volume auf handelbaren Broker-Step abrunden (floor).
**Branch:** `loop/p2-step-rounding` (zwei Commits: erst Floor, dann Fix-Iteration c8ffcd8) → merged fc8f95f.
**Verifier:** unabhängig, read-only, hat `roundVol` selbst nachgerechnet (nicht Builder-Zahlen vertraut).

## Verlauf (Loop hat seinen Zweck erfüllt)
Der Builder legte in Runde 1 **selbst zwei Defekte** offen → Iterate:
- **IEEE-754-Floor-Artefakt**: `Math.floor(v/st)*st` machte `0.29 @ 0.01` → `0.28`. Fix: `Math.floor(v/st + 1e-9)*st`.
- **`fmtVol`-Kürzung**: gerundete `1.234` wurde als „1.23" angezeigt/geloggt. Fix: `roundVol(v).toFixed(stepDecimals())`.

## Mechanik
`step` pro Preset (ftmo 0.01, breakout 0.001, custom 0.01; Annahmen, floor-sicher, per Preset-Edit
korrigierbar). `calcSize` bleibt die reine Formel; Rundung nur in Präsentation (`renderSize`-Headline,
`sz-unit`-Step-Hinweis) und Transfer (`sendToLog`). Floor ⇒ Risk nie über Ziel.

## Gates

| Gate | Ergebnis | Beleg |
|---|---|---|
| G-BASE | PASS | merge-base == main; ClipboardItem/maybeAutoDirection je 3 (kein Phantom-Revert) |
| G-SYNTAX | PASS | `node --check` grün |
| G-SCOPE | PASS | nur PRESETS(step)/stepFor/roundVol/stepDecimals/renderSize/sendToLog; `fmtVol` ungenutzt aber unverändert |
| G-SHEET | PASS | `copyForSheet`/`SHEET_COLUMNS` nicht im Diff; 23/28 |
| G-SIZING | PASS | `calcSize`/`contractValueFor` byte-identisch |
| G-ITEM AC1–AC5 | PASS | Code-Pfad verfolgt |
| Adversarial | PASS | Epsilon-Edges (0.29→0.29, 0.30→0.30, 0.833→0.83, 1.2345→1.234, 0.009→0); Over-Size-Guard über 400k Samples; stepDecimals; Anzeige/Log-Parität; Below-minimum |

## VERDICT: APPROVE

**Offen (unverändert):** Step-Werte sind Annahmen, nicht gegen FTMO/Kraken-Specs verifiziert (floor
ist konservativ — unterschätzt nie das Risiko). Nicht im echten Browser klick-getestet.
