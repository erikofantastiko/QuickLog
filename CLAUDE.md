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
- **PWA-Dateien:** `manifest.webmanifest`, `sw.js` (App-Shell-Precache, App-Code network-first mit
  Cache-Fallback/3-s-Timeout, Icons/Vendor stale-while-revalidate, cross-origin durchgereicht),
  `icons/` (icon.svg + 192/512/apple-touch PNG). Installierbar + Kern offline.
- **Version:** `APP_VERSION` in `app.js` (Footer + `sw.js?v=…` → Cache-Name `quicklog-<version>`).
  Pro Release NUR diese Konstante bumpen + [CHANGELOG.md](CHANGELOG.md) ergänzen.
- **CI:** `.github/workflows/test.yml` — `node --check app.js sw.js` + `node test/sizing.test.mjs`.

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
  Lot in Kontowährung. Regel in `contractValueFor`: `quote===ACCOUNT_CCY` → cv statisch (`preset.cv`,
  exakt); sonst `cv = FX_LOT / entry` — **exakt** wenn `base===ACCOUNT_CCY` (USD ist Basis: USD/JPY,
  USD/CAD), **flagged Cross-Approx** wenn USD weder Basis noch Quote (EUR/JPY, GBP/JPY, EUR/GBP →
  Hint „≈ … verify in MT5 / override"). Feld bleibt editierbar = manueller Override. Ohne Entry →
  kein Ergebnis (kein Mis-Sizing). FX-Presets tragen dafür `base`/`quote`; Non-FX (USD-quotiert)
  bleibt statisch. Bei Kontowechsel nur `ACCOUNT_CCY` ändern.
- **Contract Sizes verifiziert (EU/classic FTMO, Stand 2026-06):** FX 100.000 Einheiten/Lot, Indizes
  .cash Contract size 1 → $1/Punkt/Lot, XAU 100 oz, XAG 5000 oz, BTC/ETH 1 Coin — decken sich mit
  FTMOs EU-Specs. Restunschärfe sind nur die Cross-Rate-Paare oben (→ Override). Trotzdem im
  Zweifel in MT5 prüfen (Market Watch → Specification); jedes Instrument hat manuellen Override.
  **Offen (2026-10):** Websuche fand ein FTMO-Trading-Update (24.07.2025), laut dem ETHUSD auf
  Contract size 10 umgestellt wurde. Nicht verifiziert (nur Such-Zusammenfassung) → Preset unverändert
  (cv 1), bis Erik es in MT5 prüft. Bei cv 10 wäre die ETH-Größe aktuell 10× zu groß.
- **Broker-Modelle:** FTMO = MT5 CFD, Sizing in Lots. Breakout = Crypto-Perps, Sizing in Coins
  (`coins = Risk$ / |Entry − SL|`, cv = 1), Kraken-Feeds.
- **Zahlen nie still falsch lesen.** Alle Zahlenfelder laufen über `numOf(id)` → `parseNum(v, bandFor(id))`.
  Punkt/Komma als Dezimal, Leer/Apostroph/gruppierte Tausender ok, Müll → NaN. Einzelnes `,ddd`
  (`20,150`) ist mehrdeutig → per Preset-`band:[min,max]` aufgelöst, wenn genau eine Lesart drin liegt,
  sonst NaN (kein Ergebnis + „Can't read"-Hinweis). Bänder sind bewusst weit und lösen NUR
  Mehrdeutiges auf, ändern nie eindeutige Eingaben.
- **Plausibilität = nur Warnung.** `sizeChecks`: Hebel `vol×cv×entry/account` > Preset-`maxLev` bzw.
  SL < 0,02 % vom Entry → Warnung, Größe bleibt. `maxLev`-Werte sind recherchierte Annahmen (2026-10,
  FTMO Standard, Breakout Program Rules) — siehe Kommentar über `FX_LOT`.
- **Log-Konsistenz.** `sendToLog` setzt Richtung neu (Pin weg), Volumen gerundet, Risk $ = echtes Risiko
  des gerundeten Volumens; ohne Ergebnis werden Volumen/Risk $ geleert. „New trade" leert genau
  `TRADE_FIELDS`. Log-R:R folgt derselben Seitenregel wie der Sizer.
- **TD-API-Key nur in localStorage** (`quicklog_td_key`) — NIE im Code, PNG, Sheet oder
  `quicklog`-Blob. `#tdKey` ist `type=password` und steht NICHT in `PERSISTED_FIELDS`. Die
  veröffentlichte Seite ist keyless.

## Testen

- Schnelle Syntaxprüfung: `node --check app.js` (die Logik liegt jetzt direkt in `app.js`, keine
  `<script>`-Extraktion mehr nötig).
- Geld-Mathematik: `node test/sizing.test.mjs` — 150 Assertions (SHEET_COLUMNS 23/28 inkl. Buchstaben-
  Mapping A–W, leere Formelspalten M/N/O/P und Live↔Backtest-Ausrichtung, `contractValueFor`
  statisch/derive/cross inkl. USD/CAD & EUR/GBP, `FX_LOT` & `ACCOUNT_CCY` gepinnt, Sizing EUR/USD
  0.8333 & JPY 0.375, `roundVol`-Edges, `parseNum` inkl. Bänder, Log-R:R-Seite, Custom-Risk leer,
  Auto-Richtung, `sizeChecks`, `riskForVol`, band+maxLev auf jedem Preset). Liest die
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
