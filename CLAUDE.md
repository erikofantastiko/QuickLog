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
- **PWA-Dateien:** `manifest.webmanifest`, `sw.js` (App-Shell-Precache `quicklog-v2`,
  stale-while-revalidate für same-origin, cross-origin durchgereicht), `icons/` (icon.svg +
  192/512/apple-touch PNG). Installierbar + Kern offline.

## Invarianten — nicht regredieren lassen

- **Sheet-Spaltenreihenfolge byte-identisch.** Der „Copy for Sheet"-Output muss exakt zur Google-Sheet-
  Spaltenreihenfolge passen (`SHEET_COLUMNS`: Live = 23 Spalten A–W, Backtest = 28 = 5 BT-Spalten +
  die 23 Live-Spalten 1:1). `''` = Spalte, die das Sheet selbst füllt. Downstream-Journal hängt daran.
- **Formelspalten M/N/O/P (Live-Index 12–15) bleiben IMMER `''`** — PnL (%), Risk/Reward, R Ergebnis,
  Kumulatives R rechnet das Sheet. Ein statischer Wert dort überschreibt die Formel. Das berechnete
  `rr` wird deshalb nicht mehr exportiert (nur noch auf Karte/PNG).
- **Optionale Sheet-Extras (D/F/K/L/S/U/V/W)** hängen an der Sektion „Sheet extras (optional)" im
  Trade Log (`shot`,`exi`,`rskUsd`,`pnl`,`res`,`mgmt`,`emo`,`fbk`). Leer ⇒ leere Zelle (offene Trades).
- **Sizing-Formel:** `vol = riskAmt / (dist × cv)`, mit `riskAmt = account × risk%`, `dist = |entry − sl|`.
- **cv ist kontowährungs-bewusst (`ACCOUNT_CCY='USD'`).** `cv` = Wert einer 1.0-Preisbewegung pro
  Lot in Kontowährung. Regel in `contractValueFor(preset, entry, baseRate)`: `quote===ACCOUNT_CCY` →
  cv statisch (`preset.cv`); `base===ACCOUNT_CCY` → `cv = FX_LOT / entry` (USD/JPY, USD/CAD);
  **Cross** (USD weder Basis noch Quote: EUR/JPY, GBP/JPY, EUR/GBP) → `cv = FX_LOT / entry × BASE→USD`,
  exakt. Kurs aus Kraken Public Ticker (`fetchFxRate`, keyless) oder manuell (`#fxRate`), pro Basis in
  `state.fxRates` (im `quicklog`-Blob). **Ohne Kurs → NaN → kein Ergebnis**, nie die alte Näherung
  `FX_LOT/entry` (die ist in Basiswährung, +17 % bis +30 % Überrisiko). Ohne Entry → kein Ergebnis.
  cv-Feld trägt volle Präzision (8 dp), sonst floort z. B. 666.67 statt 666.666… 1.50 auf 1.49.
  Feld bleibt editierbar = manueller Override. Bei Kontowechsel nur `ACCOUNT_CCY` ändern.
- **Contract Sizes verifiziert (EU/classic FTMO, Stand 2026-06):** FX 100.000 Einheiten/Lot, Indizes
  .cash Contract size 1 → $1/Punkt/Lot, XAU 100 oz, XAG 5000 oz, BTC/ETH 1 Coin — decken sich mit
  FTMOs EU-Specs. Cross-Paare sind seit dem Kraken-Kurs exakt. Trotzdem im
  Zweifel in MT5 prüfen (Market Watch → Specification); jedes Instrument hat manuellen Override.
- **Broker-Modelle:** FTMO = MT5 CFD, Sizing in Lots. Breakout = Crypto-Perps, Sizing in Coins
  (`coins = Risk$ / |Entry − SL|`, cv = 1), Kraken-Feeds.
- **TD-API-Key nur in localStorage** (`quicklog_td_key`) — NIE im Code, PNG, Sheet oder
  `quicklog`-Blob. `#tdKey` ist `type=password` und steht NICHT in `PERSISTED_FIELDS`. Die
  veröffentlichte Seite ist keyless.

- **Sizer-Extras (nur Anzeige):** R-Ziele 1/2/3/5/10R (Default offen) und Yolo-2-Stop-Plan (½ bei
  0.5R raus, Rest am SL, Größe nicht hochskaliert ⇒ 0.75R; **Default ausgeblendet**). MT5-Abgleich:
  Kontraktgröße / Profit-Währung / Volumenschritt (das zeigt die MT5-iOS-App; Tick size/value nicht)
  gegen `presetSpec` (FX: `FX_LOT` + quote, sonst `preset.cv` + USD). Treffer ⇒ `state.verified[brk|inst]`,
  gilt nur solange Contract size + Währung des Presets gleich bleiben. `preset.mt5` = im Code
  verifiziert (EUR/USD, 2026-10-16, Screenshot).
  Sheet-Export, `SHEET_COLUMNS` und Karten bleiben davon unberührt.

## Testen

- Schnelle Syntaxprüfung: `node --check app.js` (die Logik liegt jetzt direkt in `app.js`, keine
  `<script>`-Extraktion mehr nötig).
- Geld-Mathematik: `node test/sizing.test.mjs` — 122 Assertions (SHEET_COLUMNS 23/28 inkl. Buchstaben-
  Mapping A–W, leere Formelspalten M/N/O/P, Live↔Backtest-Ausrichtung, `contractValueFor`
  statisch/derive/**cross exakt** EUR/JPY, GBP/JPY, EUR/GBP inkl. „ohne Kurs → NaN“, Sizing EUR/USD,
  JPY, GBP/JPY 1.50 & EUR/JPY 1.45, `roundVol`-Edges, `rTargets`, `twoStopPlan` inkl. Step-Split,
  `mt5SpecCheck`). Liest die Formeln/Werte direkt aus `app.js` (kein Replikat) → regrediert bei
  gebrochener Mathematik. Bei `const`/Arrow bricht die Extraktion laut (Testfehler, nie still grün).
- Browser: `node test/ui.test.mjs` — 57 Checks, Playwright + Chromium headless (global `playwright`
  nötig, fehlt es ⇒ Exit 1). Eigener Static-Server, Kraken per `page.route` gemockt, alles andere
  Externe geblockt. Prüft Cross-Sizing, Kraken-Ausfall ⇒ kein Ergebnis, manuellen Kurs + Reload,
  R-Ziele, 2-Stop (Default aus, Toggle, Persistenz), MT5-Abgleich und „Copy for Sheet“
  byte-identisch zur Baseline von vor der Änderung.
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
