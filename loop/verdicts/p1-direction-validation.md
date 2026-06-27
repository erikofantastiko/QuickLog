# Verdict — loop/p1-direction-validation

**Item:** Backlog P1 — Richtungs-bewusste Validierung im Sizer (Richtung aus Entry vs SL abgeleitet).
**Branch:** `loop/p1-direction-validation` (commit 39cf211) — `calcSize` + `renderSize` + 1 CSS-Zeile.
**Verifier:** unabhängig, read-only. Default-Annahme: falsch bis bewiesen.

## Kernbug behoben
TP auf falscher Seite zeigte bisher ein plausibles positives R:R (`abs()`-Rechnung). Jetzt:
`tpWrongSide` → rote Warnung, **kein** R:R. R:R<1 (richtige Seite) → weiche graue Warnung, R:R bleibt sichtbar.

## Gates

| Gate | Ergebnis | Beleg |
|---|---|---|
| G-SYNTAX | PASS | `node --check` grün |
| G-SIZING (kritisch) | PASS | `vol`/`riskAmt`/`dist`-Zeilen nicht im Diff; EUR/USD von Hand = 0.833 lots wie main |
| G-ITEM AC1 | PASS | Edge-Tabelle a–g (Long/Short gut/falsch, kein TP, TP==Entry, Entry==SL) korrekt |
| G-ITEM AC2/AC3 | PASS | wrong-side → Warnung ohne R:R; R:R<1 → soft warn mit R:R; Precedence vol≤0 > wrong-side > rr<1 |
| G-SHEET | PASS | `copyForSheet`/`SHEET_COLUMNS` nicht im Diff; Spalten 23/28 intakt |
| G-SCOPE | PASS | nur `calcSize` + `renderSize` + `.sz-warn.soft` |
| Adversarial | PASS | `Math.sign(0)`-Falle durch `e===s`/`t!==e`-Guards abgefangen |

## VERDICT: APPROVE

Merge (kein Auto-Merge):
```
git merge --no-ff loop/p1-direction-validation
git worktree remove .claude/worktrees/agent-a5834d71cf3b32b38
```
Offene Verifier-Anmerkung: graue `.soft`-Lesbarkeit auf Dark-Theme nur per CSS-Token gewählt, visuell
nicht gerendert — beim Mergen kurz im Browser anschauen.
