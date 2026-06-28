# Verdict — loop/p2-png-clipboard

**Item:** P2 — "PNG for X" kopiert das Trade-Karten-PNG in die Zwischenablage (copy/paste-ready in X),
Datei-Download als Fallback.
**Branch:** `loop/p2-png-clipboard` — ein Hunk in `exportPng` ([index.html](../../index.html)).
**Verifier:** unabhängig, read-only. Default-Annahme: falsch bis bewiesen.

## Kern
`navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})])` mit dem **Promise-in-
ClipboardItem-Pattern** (synchron im Click-Handler → Safari-User-Activation bleibt gültig). Feature-Detect
`navigator.clipboard && window.ClipboardItem && window.isSecureContext`; sonst / bei Fehler → Download
aus demselben Blob. Toast spiegelt den Ausgang.

## Gates

| Gate | Ergebnis | Beleg |
|---|---|---|
| G-SYNTAX | PASS | `node --check` grün (Branch-Stand) |
| G-SCOPE | PASS | Single Hunk `@@ exportPng`; Rest byte-identisch zu main |
| G-SHEET | PASS | `copyForSheet`/`SHEET_COLUMNS` nicht im Diff; Spalten 23/28 intakt |
| G-SIZING | PASS | `calcSize`/`contractValueFor` nicht im Diff |
| G-ITEM AC1–AC5 | PASS | Kontrollfluss am Branch-Code verfolgt |
| Adversarial (Kern) | PASS | 4 Pfade durchgespielt: kein `tmp`-Leak, kein hängender Button — inkl. html2canvas-reject (W3C: write rejected → Fallback-catch räumt auf) |

## VERDICT: APPROVE

Nicht-blockierende Notiz: bei theoretisch akzeptiertem Leer-Blob bliebe der Toast „kopiert" — real
lehnen Browser leere Image-Writes ab; AC3 (kein Leak/Stuck) gilt unabhängig davon.

**Offen — visuelle/Live-Prüfung:** Clipboard-Image wurde nicht im echten Browser ausgeführt (nur
Statik + Promise-Modellierung). Beim Mergen kurz auf HTTPS/localhost testen: „PNG for X" → in X einfügen.
