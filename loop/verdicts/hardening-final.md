# Schlussphase — eigene Tests und Simulationen (claude/quicklog-hardening)

Ausgeführt vom Koordinator auf dem fertigen Branch. Skripte lagen nur in der Session (kein
`package.json`, nichts davon im Repo). Browser: Playwright 1.56 mit vorinstalliertem Chromium,
`python -m http.server`.

## Unit-Gates

| Fall | Erwartet | Ist |
|---|---|---|
| `node --check app.js` / `sw.js` | grün | grün |
| `node test/sizing.test.mjs` | alle grün | PASS 196/196 (main: 55) |
| Mutationen (15: alter `parseNum`, Gruppierungs-Checks, `logRR` ohne Seitenprüfung, `getLogRisk` NaN, `sheetRisk` NaN%, `sizeChecks` ohne enge-SL-Prüfung, `riskForVol`×2, Richtung invertiert, Pin in `sendToLog`, `exi` aus `TRADE_FIELDS`, rskUsd nicht geleert, `outsideBand` aus, Altdaten nicht geleert, Volumenformel×2) | jede rot | 15/15 rot; nach Runde 2 weitere 7 (u.a. `copyForSheet`-Aufrufstelle M13a, Spaltentausch E↔G) 7/7 rot; nach Runde 3 vier Werte-Mutanten in `copyForSheet` (Entry↔SL, Risk $ aus Volumen, Richtung fix Long, Setup fehlt) 4/4 rot |

## Sizing-Simulation (Fuzz gegen unabhängige Referenzformel)

22 Presets × 10.000 Zufallstrades (Entry log-gleichverteilt im Preisband, SL-Abstand 0,05–5 %,
Long/Short, 5 Kontogrößen, 4 Risikostufen) = 219.706 Trades.

| Prüfung | Erwartet | Ist |
|---|---|---|
| `calcSize`-Volumen vs. Referenz (relativ) | < 1e-9 | 0 Abweichungen |
| `contractValueFor` vs. Referenz-cv | identisch | 0 Abweichungen |
| gerundetes Volumen riskiert mehr als Ziel | nie | 0 |
| Auto-Richtung ≠ sign(Entry − SL) | nie | 0 |

## Zahlenformat-Simulation

Jeder Entry in 5–6 Schreibweisen (`20150.5`, `20150,5`, `20,150.5`, `20.150,5`, `20 150,5`, `20,150`)
= 1.099.254 Eingaben, jeweils mit Preisband des Instruments.

| Ergebnis | Anzahl |
|---|---|
| exakt richtig gelesen | 1.095.900 |
| nicht gelesen (kein Ergebnis + Hinweis) | 3.354 — nur SOL mit Kursen um 2 $, wo `2,436` in beiden Lesarten ins Band fällt |
| **still falsch gelesen** | **0** |

## Browser-Simulation (34 Fälle, alle PASS)

| # | Fall | Erwartet | Ist |
|---|---|---|---|
| 1 | Laden, Footer | 0 Konsolenfehler, `QuickLog v1.0.0` | ok |
| 2 | US100 `20,150.5` / `20,100` | 4.95 Lots | 4.95 |
| 2b | US100 `20,150` (Band) | 5.00 Lots | 5.00 |
| 2c | Custom `20,150` | „Can't read", keine Größe | ok |
| 2d | US100 `20.150` / `20.100` | Warnung „outside the usual US100 range" | ok |
| 2e | `20150 20100` | „Can't read", keine Größe | ok |
| 5a | USD/JPY `150,125` / `149,625` | cv 666.11, 0.75 Lots | ok |
| 5a2 | EUR/USD SL 1.0849 bei 1.0850 | „SL only 0.009% … typo?" | ok |
| 5a3 | FTMO BTC 8.33 Lots @ 60k auf 100k | „Needs ~1:5 leverage — above 1:3.3" | ok |
| 3 | Sizer Short → Log mit altem Long-Pin | Short, Sheet Q = Short | ok |
| 5b | Send to Log | 0.83 Lots, Risk $ 249.00, K = 249.00 | ok |
| 5 | Live-Zeile | 23 Felder, M–P leer | ok |
| 4 | Log-TP falsche Seite | Karte R:R „—" | ok |
| 5c | Custom-Risk leer | J leer, kein `NaN`, Karte „—" | ok |
| 5d | Backtest-Zeile | 28 Felder, Richtung an Position 22 | ok |
| 5e | New trade | C/D/E/F/K/L/S/U/V/W leer, J = 0.25 % | ok |
| 5h | Send to Log mit Altdaten | 1 Rückfrage, Extras leer, Long abgeleitet | ok |
| 6 | Reload | Felder bleiben, TD-Key nicht im `quicklog`-Blob | ok |
| 5f/5g | Labels, Ziffernfeld | 32 `for=` gültig, 13 × `inputmode=decimal`, Label fokussiert Feld | ok |
| 8 | PNG Sizer + Log-Karte | `image/png` in Zwischenablage | 69 KB / 61 KB |
| 7 | Service Worker, offline | `sw.js?v=1.0.0`, Cache `quicklog-1.0.0`, offline-Reload rechnet 0.83 | ok |
| 9 | iPhone-13-Viewport | kein horizontales Scrollen | ok |

Browser-Mutanten: `sendToLog` ohne Pin-Reset → 3 Fälle rot; `TRADE_FIELDS` gekürzt → 2 Fälle rot.

## Update-Simulation (Deploy unter aktivem Service Worker)

v1.0.0 installiert und kontrolliert, Server auf v1.0.1 umgestellt (auch mit GitHub-Pages-Header
`Cache-Control: max-age=600`), App wie eine PWA in frischem Tab neu gestartet:

| Prüfung | Erwartet | Ist |
|---|---|---|
| Version beim ersten Start nach Deploy | v1.0.1 | v1.0.1 |
| Cache danach | nur `quicklog-1.0.1` | `quicklog-1.0.1` |
| aktiver Worker | `sw.js?v=1.0.1` | ok |

Einschränkung: Ein Reload im selben, lange offenen Headless-Tab zeigte einmal noch die alte Version
(Speichercache des Browsers). Ein zweiter Reload bzw. ein App-Neustart lädt die neue.

## Nicht automatisiert prüfbar
- Echtes iPhone (Safari-Zwischenablage, Installation am Homescreen, deutsche Komma-Tastatur).
- Contract Sizes / Hebel / Steps gegen MT5 und Breakout (Annahmen, siehe CLAUDE.md).
