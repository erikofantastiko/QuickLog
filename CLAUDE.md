# QuickLog — Projektgedächtnis

Persönliches Trading-Tool: **Position Sizer** + **Trade Log** in einer dark-themed, mobil-tauglichen
Webseite. Kein Backend. Gehostet auf GitHub Pages.

## Architektur (aktuell)

- **[index.html](index.html)** — die ganze App: Markup + ein `<style>`-Block + ein `<script>` als
  einzelne IIFE. Sektionen im Script: Constants · State · Utils · Sizer · Log-Card · Log-Actions ·
  Chart · Persistence · Wiring · Init.
- **[README.md](README.md)** — Nutzer-Doku (Contract-Value-Quellen, Sheet-Mapping, Hosting).
- Zwei externe Scripts: `html2canvas` (CDN, PNG-Export) + TradingView `tv.js` (dynamisch geladen,
  optionaler Chart).
- PWA-Umstellung ist geplant (siehe [Scratchpad.md](Scratchpad.md), P0) — danach kommen `app.js`,
  `styles.css`, `manifest.webmanifest`, `sw.js`, `icons/` dazu.

## Invarianten — nicht regredieren lassen

- **Sheet-Spaltenreihenfolge byte-identisch.** Der „Copy for Sheet"-Output muss exakt zur Google-Sheet-
  Spaltenreihenfolge passen (`SHEET_COLUMNS`: Live = 23 Spalten, Backtest = 28). `''` = Spalte, die das
  Sheet selbst füllt. Downstream-Journal hängt daran.
- **Sizing-Formel:** `vol = riskAmt / (dist × cv)`, mit `riskAmt = account × risk%`, `dist = |entry − sl|`.
- **JPY-quotierte Paare:** `cv = 100000 / entry` (auto-derived aus dem Entry-Preis, nicht statisch
  100000). Feld bleibt editierbar = manueller Override. Ohne Entry → kein Ergebnis (kein Mis-Sizing).
- **Contract Values sind rückgerechnete Annahmen**, kein offizieller FTMO-Spec → in MT5 prüfen
  (Market Watch → Specification). Jedes Instrument hat einen manuellen Override.
- **Broker-Modelle:** FTMO = MT5 CFD, Sizing in Lots. Breakout = Crypto-Perps, Sizing in Coins
  (`coins = Risk$ / |Entry − SL|`, cv = 1), Kraken-Feeds.

## Testen

- Schnelle Syntaxprüfung: Script aus `index.html` extrahieren und `node --check` darüber laufen lassen.
- Geld-Mathematik: `node test/sizing.test.mjs` — 20 Assertions (SHEET_COLUMNS 23/28, `contractValueFor`
  JPY/non-JPY, `FX_LOT` exakt gepinnt, Sizing EUR/USD 0.8333 & JPY 0.375, `roundVol`-Edges). Liest die
  Formeln/Werte aus `index.html` (kein hartkodiertes Replikat) → regrediert bei gebrochener Mathematik.
  Bei `const`/Arrow/PWA-Split bricht die Extraktion laut (Testfehler, nie still grün).
- Voller Test: lokal servieren (`npx serve` / `python -m http.server`) und im Browser durchklicken.
  Persistenz: ausfüllen → reload → Felder bleiben.

## Konventionen

- **Relative Pfade** (`./...`) — GitHub Pages liegt unter Subpath (`/QuickLog/`); absolute `/`-Pfade
  brechen dort.
- **Klassisches Script**, keine ES-Module — damit `file://`-Doppelklick lokal weiter läuft.
- Kein Framework, kein Build-Schritt. Plain HTML/CSS/JS.
- State-Persistenz: ein localStorage-Key `quicklog` (Felder + UI-State), try/catch-gekapselt.

## Offene Punkte

Siehe [Scratchpad.md](Scratchpad.md) für das priorisierte Backlog und die Annahme zu den
FTMO-Contract-Values.
