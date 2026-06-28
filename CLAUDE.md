# QuickLog — Projektgedächtnis

Persönliches Trading-Tool: **Position Sizer** + **Trade Log** in einer dark-themed, mobil-tauglichen
Webseite. Kein Backend. Gehostet auf GitHub Pages.

## Architektur (aktuell)

- **[index.html](index.html)** — nur noch Markup + relative Links (`styles.css`, `app.js`,
  `vendor/html2canvas.min.js`, `manifest.webmanifest`, Icons). Kein inline CSS/JS mehr.
- **[app.js](app.js)** — die ganze App-Logik als eine klassische IIFE (KEIN ES-Modul, damit
  `file://` läuft). Sektionen: Constants · State · Utils · Sizer · Log-Card · Log-Actions · Chart ·
  Persistence · Wiring · Init. Init registriert zusätzlich den Service Worker (no-op unter `file://`).
- **[styles.css](styles.css)** — beide vormals inline `<style>`-Blöcke, 1:1.
- **[README.md](README.md)** — Nutzer-Doku (Contract-Value-Quellen, Sheet-Mapping, Hosting).
- `html2canvas` ist lokal gevendort (`vendor/html2canvas.min.js`, 1.4.1) → PNG-Export offline.
- **Chart-Engine (per Instrument):** Krypto (Kraken-OHLC) und FX/Metalle (Twelve Data) zeichnen echte
  Entry/SL/TP-Preislinien via **Lightweight Charts** (gevendort, `vendor/lightweight-charts...`).
  Indizes/Override/Custom bleiben beim TradingView-`tv.js`-Widget (kein Linien-API, keine freie
  Index-Datenquelle) + Chips-Overlay. Dispatch in `app.js`: `cryptoKrakenPair` → Kraken, sonst
  `twelveDataSymbol` + Key → TD, sonst Widget. Jeder Fehler (CORS/Symbol/Key) ⇒ Widget-Fallback.
- **PWA-Dateien:** `manifest.webmanifest`, `sw.js` (App-Shell-Precache `quicklog-v1`,
  stale-while-revalidate für same-origin, cross-origin durchgereicht), `icons/` (icon.svg +
  192/512/apple-touch PNG). Installierbar + Kern offline.

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
- **TD-API-Key nur in localStorage** (`quicklog_td_key`) — NIE im Code, PNG, Sheet, `quicklog`-Blob
  oder der Trade-History. `#tdKey` ist `type=password` und steht NICHT in `PERSISTED_FIELDS`. Die
  veröffentlichte Seite ist keyless.

## Testen

- Schnelle Syntaxprüfung: `node --check app.js` (die Logik liegt jetzt direkt in `app.js`, keine
  `<script>`-Extraktion mehr nötig).
- Geld-Mathematik: `node test/sizing.test.mjs` — 20 Assertions (SHEET_COLUMNS 23/28, `contractValueFor`
  JPY/non-JPY, `FX_LOT` exakt gepinnt, Sizing EUR/USD 0.8333 & JPY 0.375, `roundVol`-Edges). Liest die
  Formeln/Werte direkt aus dem Quelltext (kein hartkodiertes Replikat) → regrediert bei gebrochener Mathematik.
  Quelle ist seit dem PWA-Split `app.js` (nicht mehr `index.html`). Bei `const`/Arrow bricht die
  Extraktion laut (Testfehler, nie still grün).
- Voller Test: lokal servieren (`npx serve` / `python -m http.server`) und im Browser durchklicken.
  Persistenz: ausfüllen → reload → Felder bleiben.

## Konventionen

- **Relative Pfade** (`./...`) — GitHub Pages liegt unter Subpath (`/QuickLog/`); absolute `/`-Pfade
  brechen dort.
- **Klassisches Script** (`app.js`, `<script defer>`), keine ES-Module — damit `file://`-Doppelklick
  lokal weiter läuft und die Test-Extraktion greift.
- Kein Framework, kein Build-Schritt. Plain HTML/CSS/JS, ausgeliefert als installierbare PWA.
- State-Persistenz: ein localStorage-Key `quicklog` (Felder + UI-State), try/catch-gekapselt.

## Offene Punkte

Siehe [Scratchpad.md](Scratchpad.md) für das priorisierte Backlog und die Annahme zu den
FTMO-Contract-Values.
