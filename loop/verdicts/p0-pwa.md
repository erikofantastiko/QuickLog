# Verdict — loop/p0-pwa

**Item:** P0 — Single-File → installierbare, offline-fähige PWA. STRUKTURELL.
**Branch:** `loop/p0-pwa` (5b86aa9) — **NICHT gemerged**, liegt für den User zum Browser-Test bereit.
**Verifier:** unabhängig, read-only; nur statisch prüfbare Aspekte (PWA-Laufzeit = Browser).

## Was gebaut wurde
`index.html` → Markup+Links; JS → `app.js` (klassisch), CSS → `styles.css`; html2canvas lokal
gevendored (`vendor/`, sha256-verifiziert, 198 KB); `manifest.webmanifest`; `sw.js` (App-Shell SWR
same-origin, cross-origin durchgereicht, skipWaiting/claim, file://-guarded); echte PNG-Icons (sharp);
`test/sizing.test.mjs` von index.html → app.js migriert; `.gitattributes` (Binary-Schutz gegen CRLF).

## Gates (statisch)

| Gate | Ergebnis | Beleg |
|---|---|---|
| G-BASE | PASS | merge-base == main (43a0eca) |
| G-SYNTAX | PASS | `node --check app.js` + `sw.js` grün |
| **G-MOVE-FIDELITY** | **PASS** | 13 load-bearing Funktionen/Konstanten byte-identisch main:index.html ↔ branch:app.js; einzige JS-Delta = `registerServiceWorker`. Funktions-Inventur 65→66. |
| G-CSS-FIDELITY | PASS | styles.css == beide alten `<style>`-Blöcke (nur Naht-Leerzeile) |
| G-INDEX-CLEAN | PASS | kein inline JS/CSS; relative Links; DOM-Markup byte-identisch |
| G-PATHS | PASS | keine absoluten `/`-Pfade, kein `type=module`; manifest start_url/scope `./` |
| G-TEST | PASS | aus app.js 25/25; vol×2-Mutation ⇒ exit 1; Quelle migriert |
| G-SW | PASS | nur same-origin GET SWR; TradingView/OANDA/Kraken durchgereicht (nie gecached) |
| G-VENDOR | PASS | echtes html2canvas 1.4.1, 198689 B, relativ referenziert |
| G-ICONS | PASS | 192/512/apple-touch PNG-Signatur gültig |

## VERDICT: APPROVE (statisch) — Browser-Test ausstehend

**Muss im Browser geprüft werden, BEVOR du mergst** (über HTTPS/localhost servieren, z.B. `npx serve`):
1. Install / „Add to Home Screen" + Standalone-Start.
2. DevTools → Application → Service Worker: install/activate, alte Cache-Eviction bei Version-Bump.
3. Network → Offline → reload: Sizer+Log+PNG laufen aus Cache; Chart → graceful Fallback.
4. `file://`-Doppelklick: App läuft, SW-Registrierung ist No-op.
5. PNG-Export offline nutzt das gevendorte html2canvas (nicht CDN).

**Merge nach erfolgreichem Test:** `git merge --no-ff loop/p0-pwa`.
