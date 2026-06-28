# Verdict — loop/p3-money-tests

**Item:** P3 — framework-loses Node-Testskript für die Geld-Mathematik. Rein additiv (`test/sizing.test.mjs`).
**Branch:** `loop/p3-money-tests` (2 Commits: erst Suite, dann Blindfleck-Fix ec4065a) → merged cf5148b.
**Verifier:** unabhängig, read-only; hat Mutationen SELBST gegen Temp-Kopien gefahren.

## Loop hat einen echten Blindfleck gefangen
Runde 1 (19/19 grün) wurde **REJECTED**: Mutation `FX_LOT 100000→100001` ließ den Test grün — die
cv-Assertion (666.67 ± 0.01) brauchte >1.5 Drift, die JPY-vol-Toleranz war ~270× zu grob. Eine
Geld-Mathe-Suite, die FX_LOT-Drift nicht fängt, verfehlt ihren Zweck. Fix: exakter `eq(M.FX_LOT,100000)`
+ JPY-cv-Toleranz auf `100000/150 ± 1e-6` geschärft.

## Was der Test prüft (20 Assertions, liest aus `index.html`)
- `SHEET_COLUMNS` Längen: live 23 / backtest 28.
- `contractValueFor`: JPY entry 150 → 100000/150; non-JPY → 100000. `FX_LOT` exakt 100000.
- Sizing bekannte Trades: EUR/USD → 0.8333 lots; JPY → 0.375 lots.
- `roundVol`-Edges: 0.833→0.83, 0.29→0.29 (Epsilon), 1.2345@0.001→1.234.
- Wirft laut bei Extraktions-Fehlschlag (nie still grün).

## Gates

| Gate | Ergebnis | Beleg |
|---|---|---|
| G-BASE | PASS | merge-base == main; roundVol present |
| G-SCOPE | PASS | nur `test/sizing.test.mjs`; `index.html` byte-identisch |
| G-RUN | PASS | `node test/sizing.test.mjs` → PASS 20/20, exit 0 (auf merged main bestätigt) |
| G-NEGATIVE | PASS | Mutationen (a) vol×2, (b) FX_LOT+1, (c) SHEET_COLUMNS −1 ⇒ je exit 1 (vom Verifier UND vom Coordinator unabhängig nachgefahren) |
| G-SELF-CONTAINED | PASS | nur `node:`-builtins, kein Build, relativer Pfad |

## VERDICT: APPROVE

**Offen:** Extraktions-Regex hängt an `var NAME=`/`function NAME(` — bei `const`/Arrow oder dem
geplanten PWA-Split (`app.js`) bricht die Extraktion LAUT (Testfehler, nie still grün). Pfad/Extraktion
müssen bei P0-PWA mitgezogen werden. Dieses Skript ist der Kern eines künftigen GitHub-Actions-Gates.
