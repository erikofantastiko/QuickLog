# QuickLog — Scratchpad & Backlog

Laufende Notizen + priorisiertes Backlog. Projektkontext & Invarianten: [CLAUDE.md](CLAUDE.md).

## Changelog (erledigt)

- **JPY-Sizing-Fix** — JPY-quotierte Paare wurden ~150× zu klein gesized (cv hart 100000 statt
  `100000 / price`). Jetzt aus Entry abgeleitet, Feld editierbar (manueller Override), ohne Entry
  kein Ergebnis. Non-JPY unverändert. Gegen T66/67/68 + USD/JPY 150→149 verifiziert.
- **Chart-Robustheit** — `tv.js`-Load mit `onerror` + Timeout; Fallback auf TradingView-Embed-iframe
  + „Open on TradingView ↗"-Link statt leerem Chart-Bereich.
- **Refactor** — inline-Script zu einer namespaced IIFE mit benannten Funktionen; inline `on*`-Handler
  durch id-basiertes `addEventListener` ersetzt; geteiltes `cardHtml()` für Live-Preview *und* PNG.
  Sheet-Spaltenreihenfolge unverändert.
- **Persistenz** — alle Inputs + UI-State in `localStorage['quicklog']`, Restore beim Laden.
- **PNG → Zwischenablage** — „PNG for X" kopiert das Karten-PNG direkt in die Clipboard
  (`ClipboardItem`, Safari-tauglich), Datei-Download als Fallback. Loop-Verdict APPROVE.

## Backlog (priorisiert)

### P0 — PWA / Offline-Umstellung  ·  Status: entschieden, geplant  ·  Aufwand: M
**Warum:** Installierbar am Homescreen, sofortiger Load, Kern (Sizer + Log + PNG) läuft offline /
CDN-unabhängig. Ein Service Worker kann nicht inline sein → erzwingt Multi-File (= einziger echter
Grund, Single-File aufzugeben).

- `index.html` → Markup; `styles.css` + `app.js` extrahieren (verhaltensgleich, `app.js` klassisch).
- `html2canvas` 1.4.1 lokal vendoren (`vendor/`) → PNG offline.
- `manifest.webmanifest` (name/short_name, `start_url:"./"`, `display:standalone`, Farben #0c0c0e,
  Icons 192/512 + maskable).
- `sw.js`: App-Shell precache (`quicklog-v1`), `activate` räumt alte Caches; `fetch` =
  stale-while-revalidate für same-origin GET, **network-only** für TradingView/Feeds (nie cachen).
  Registrierung aus `app.js`, no-op unter `file://`.
- Icons generieren (192/512/apple-touch + `icon.svg`), dunkle Kachel mit rotem „QL".
- **Relative Pfade überall** (Pages-Subpath). Chart bleibt online-only (Remote-Widget).
- README/Stack-Abschnitt von „Single-File" auf neue Struktur + lokale-Serve-Notiz umschreiben.

### P1 — User-Text in `cardHtml` escapen  ·  Status: ✅ merged → main (c4d1609)  ·  Aufwand: S
**Warum:** Echter Bug. `asset`/`note` werden via `innerHTML` in Preview und PNG gerendert; ein `<`
oder `&` in der Note bricht das Rendering. `esc()`-Helper um die User-Felder. (Im Sheet egal, dort
Plaintext.)

### P1 — Richtungs-bewusste Validierung  ·  Status: ✅ merged → main (c4d1609)  ·  Aufwand: S
**Warum:** `calcSize` rechnet stur. Warnung im `sz-warn`-Feld bei: SL auf falscher Seite je Long/Short,
R:R < 1, Entry == SL, unplausibel große Risk-Distanz. Fängt Fat-Finger ab, bevor es ins Sheet geht.

### P2 — Lot-/Coin-Step-Rundung  ·  Status: ✅ merged → main (fc8f95f)  ·  Aufwand: S–M
**Warum:** `fmtVol` formatiert nur die Anzeige; 0.833 Lots ist nicht handelbar, wenn der Step 0.01 ist.
`step` pro Instrument ins Preset, Volume auf handelbaren Step **abrunden** (Risk bleibt ≤ Ziel).

### P2 — Trade-History-Liste  ·  Status: ✅ merged → main (cc43ca4)  ·  Aufwand: M–L
**Warum:** Größter funktionaler Hebel. Aktuell überlebt nur das *eine* offene Formular. Geloggte Trades
als Liste in localStorage: „Log Trade" hängt an, darunter Liste zum Ansehen/Bearbeiten/Löschen/
Re-Export. „Copy for Sheet" ist dann nicht mehr der einzige Persistenz-Ort.

### P2 — Auto-Richtungserkennung (Long/Short aus Zahlen)  ·  Status: ✅ merged → main (386f8fe)  ·  Aufwand: S
**Warum:** Das Tool soll die Richtung selbst aus den Zahlenwerten ableiten statt manuell. Logik steht
schon (Sizer leitet Richtung aus `sign(Entry − SL)` ab, siehe P1-Validierung). Hier: im **Trade Log**
die Long/Short-Wahl (`state.direction`, Buttons `blo`/`bsh`) automatisch setzen, sobald Entry + SL
gefüllt sind — Entry > SL ⇒ Long, Entry < SL ⇒ Short. Spart einen Klick und verhindert, dass die
geloggte Richtung den Levels widerspricht.
**Offene Design-Frage (vor Build klären):** Auto-Set vs. manueller Override — soll Auto bei jeder
Entry/SL-Änderung greifen (überschreibt manuelle Wahl) oder nur, solange der User nicht selbst geklickt
hat? Empfehlung: Auto leitet ab + setzt, ein manueller Klick „pinnt" die Wahl bis Asset/Reset.
Akzeptanz: Direction-Badge im Preview + Sheet-Export-`dir` folgen der Ableitung; `cardHtml`/Sheet-Spalten
unverändert.

### P3 — Politur  ·  Status: teilweise  ·  Aufwand: S
- ✅ JPY-Crosses (EUR/JPY, GBP/JPY) in die Presets — merged → main (620f345).
- ✅ Custom-Risk-Feld (Sizer + Log) — merged → main (361391b); Test 20→25.
- ✅ Sizer-Karte als PNG/Copy — merged → main (89d1755); shared `exportNodePng`-Helper.

### P3 — Preisfelder escapen (entry/sl/tp)  ·  Status: offen  ·  Aufwand: S
**Warum:** `cardHtml` UND `sizerCardHtml` rendern `entry`/`sl`/`tp` ungeescaped via `innerHTML`
(`cell()`). P1 escapte bewusst nur asset/note. Self-XSS/Render-Bruch bei `<`/`&` in einem Preisfeld.
**How:** `esc()` auf die Preisfelder in BEIDEN Karten gemeinsam anwenden (vom Verifier in p3-sizer-png notiert).

### P3 — Tests für die Geld-Mathematik  ·  Status: ✅ merged → main (cf5148b)  ·  Aufwand: S
**Warum:** `contractValueFor`/`calcSize` dürfen nie still regredieren. Kleines `test.mjs`, das sie
importiert/prüft (bekannte Trades T66/67/68 + JPY). Läuft via `node`, kein Framework.

## Offene Fragen / Annahmen

- **FTMO Contract Values** sind rückgerechnet, kein offizieller Spec → in MT5 verifizieren
  (Market Watch → Specification). Bei Abweichung: manuellen Override im Sizer nutzen.
