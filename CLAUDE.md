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
  Lot in Kontowährung. Regel in `contractValueFor(preset, entry, baseRate)`: `quote===ACCOUNT_CCY` →
  cv statisch (`preset.cv`); `base===ACCOUNT_CCY` → `cv = FX_LOT / entry` (USD/JPY, USD/CAD);
  **Cross** (USD weder Basis noch Quote: EUR/JPY, GBP/JPY, EUR/GBP) → `cv = FX_LOT / entry × BASE→USD`,
  exakt. Kurs aus Kraken Public Ticker (`fetchFxRate`, keyless) oder manuell (`#fxRate`), pro Basis in
  `state.fxRates` (im `quicklog`-Blob). **Ohne Kurs → NaN → kein Ergebnis**, nie die alte Näherung
  `FX_LOT/entry` (die ist in Basiswährung, +17 % bis +30 % Überrisiko). Ohne Entry → kein Ergebnis.
  cv-Feld trägt volle Präzision (8 dp), sonst floort z. B. 666.67 statt 666.666… 1.50 auf 1.49.
  Feld bleibt editierbar = manueller Override. Bei Kontowechsel nur `ACCOUNT_CCY` ändern.
- **Contract Sizes verifiziert (EU/classic FTMO, Stand 2026-06):** FX 100.000 Einheiten/Lot, Indizes
  .cash Contract size 1 → $1/Punkt/Lot, XAU 100 oz, XAG 5000 oz, BTC 1 Coin — decken sich mit
  FTMOs EU-Specs. Cross-Paare sind seit dem Kraken-Kurs exakt. Trotzdem im
  Zweifel in MT5 prüfen (Market Watch → Specification); jedes Instrument hat manuellen Override.
- **ETH/USD = Kontraktgröße 10 (1 Lot = 10 ETH), nicht 1.** Per MT5-Screenshot 2026-10-16 bestätigt;
  die Online-Recherche (2026-06, „1 Coin“) war falsch, alte Sizes waren 10× zu groß. **MT5 schlägt
  jede Recherche.** BTC/USD = 1 per MT5-Screenshot bestätigt. XAU 100 / XAG 5000 per Screenshot bestätigt. US500 = 1 per Screenshot bestätigt. Nur die FX-Paare außer EUR/USD sind noch NICHT gegen MT5 geprüft.
- **Max-Volumen:** Presets mit `max` (EUR/USD 50, US100 1000, US500 1000, ETH/USD 5, aus MT5) warnen im Sizer,
  wenn die Lots darüber liegen (MT5 lehnt die Order ab).
- **Broker-Modelle:** FTMO = MT5 CFD, Sizing in Lots. Breakout = Crypto-Perps, Sizing in Coins
  (`coins = Risk$ / |Entry − SL|`, cv = 1), Kraken-Feeds.
- **Zahlen nie still falsch lesen.** Alle Zahlenfelder laufen über `numOf(id)` → `parseNum(v, bandFor(id))`.
  Punkt/Komma als Dezimal, Leer/Apostroph/gruppierte Tausender ok, Müll → NaN. Einzelnes `,ddd`
  (`20,150`) ist mehrdeutig → per Preset-`band:[min,max]` aufgelöst, wenn genau eine Lesart drin liegt,
  sonst NaN (kein Ergebnis + „Can't read"-Hinweis). Bänder sind bewusst weit und lösen NUR
  Mehrdeutiges auf, ändern nie eindeutige Eingaben. Zusätzlich warnt der Sizer, wenn ein Level
  außerhalb des Bands liegt (`outsideBand`, fängt `20.150` = 20,15 auf US100).
- **Plausibilität = nur Warnung.** `sizeChecks`: Hebel `vol×cv×entry/account` > Preset-`maxLev` bzw.
  SL < 0,02 % vom Entry → Warnung, Größe bleibt. `maxLev`-Werte sind recherchierte Annahmen (2026-10,
  FTMO Standard, Breakout Program Rules) — siehe Kommentar über `FX_LOT`.
- **Log-Konsistenz.** `sendToLog` setzt Richtung neu (Pin weg), Volumen gerundet, Risk $ = echtes Risiko
  des gerundeten Volumens; ohne Ergebnis werden Volumen/Risk $ geleert; übrige gefüllte
  `TRADE_FIELDS` (Note, Extras) werden per confirm zum Leeren angeboten. „New trade" leert genau
  `TRADE_FIELDS`. Log-R:R folgt derselben Seitenregel wie der Sizer.
- **TD-API-Key nur in localStorage** (`quicklog_td_key`) — NIE im Code, PNG, Sheet oder
  `quicklog`-Blob. `#tdKey` ist `type=password` und steht NICHT in `PERSISTED_FIELDS`. Die
  veröffentlichte Seite ist keyless.

- **Sizer-Extras (nur Anzeige):** R-Ziele 1/2/3/5/10R (Default offen) und Yolo-2-Stop-Plan (½ bei
  0.5R raus, Rest am SL, Größe nicht hochskaliert ⇒ 0.75R; **Default ausgeblendet**). MT5-Abgleich:
  Kontraktgröße / Profit-Währung / Volumenschritt (das zeigt die MT5-iOS-App; Tick size/value nicht)
  gegen `presetSpec` (FX: `FX_LOT` + quote, sonst `preset.cv` + USD). Treffer ⇒ `state.verified[brk|inst]`,
  gilt nur solange Contract size + Währung des Presets gleich bleiben. `preset.mt5` = im Code
  verifiziert (2026-10-16: EUR/USD, US100, ETH/USD per Screenshot).
  Sheet-Export, `SHEET_COLUMNS` und Karten bleiben davon unberührt.

## Testen

- Schnelle Syntaxprüfung: `node --check app.js` (die Logik liegt jetzt direkt in `app.js`, keine
  `<script>`-Extraktion mehr nötig).
- Geld-Mathematik: `node test/sizing.test.mjs` — 278 Assertions (SHEET_COLUMNS 23/28 inkl. Buchstaben-
  Mapping A–W, leere Formelspalten M/N/O/P und Live↔Backtest-Ausrichtung, `contractValueFor`
  statisch/derive/cross inkl. USD/CAD & EUR/GBP, `FX_LOT` & `ACCOUNT_CCY` gepinnt, Sizing EUR/USD
  0.8333 & JPY 0.375, `roundVol`-Edges, `parseNum` inkl. Bänder, Log-R:R-Seite, Custom-Risk leer,
  Auto-Richtung, `sizeChecks`, `riskForVol`, `outsideBand`, `sheetRisk`, `TRADE_FIELDS`, `sendToLog`
  end-to-end mit persistentem DOM-Stub, echte `copyForSheet`-Zeile live/backtest inkl. Zelle-für-Zelle-Vergleich A–W, band+maxLev auf
  jedem Preset außer Custom; dazu cross exakt EUR/JPY, GBP/JPY, EUR/GBP inkl. „ohne Kurs → NaN“, ETH cv 10,
  `rTargets`, `twoStopPlan` inkl. Step-Split, `mt5SpecCheck`). Liest die
  Formeln/Werte direkt aus dem Quelltext (kein hartkodiertes Replikat) → regrediert bei gebrochener Mathematik.
  Quelle ist seit dem PWA-Split `app.js` (nicht mehr `index.html`). Bei `const`/Arrow bricht die
  Extraktion laut (Testfehler, nie still grün).
- Browser: `node test/ui.test.mjs` — 63 Checks, Playwright + Chromium headless (global `playwright`
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
