# Prompt für Claude Code

Diesen Text als erste Nachricht in Claude Code einfügen, nachdem der Ordner `design_handoff_zeigmers_redesign/` im Repo-Wurzelverzeichnis liegt (oder daneben, dann Pfad anpassen).

---

Du arbeitest im Repository `zeigmers` — Vite + TypeScript, drei echte HTML-Einstiege, deck.gl über MapLibre, keine UI-Bibliothek, Oberfläche in Vanilla-DOM, Tests mit Vitest.

Im Ordner `design_handoff_zeigmers_redesign/` liegt ein Design-Handoff. **Lies zuerst `design_handoff_zeigmers_redesign/README.md` vollständig.** Es beschreibt drei neu gestaltete Bildschirme und enthält alle Masse, Farben, Schriftgrössen und Texte. Öffne zusätzlich `design_handoff_zeigmers_redesign/Zeigmers Redesign.dc.html` im Browser — dort siehst du die Entwürfe mit Annotationsnadeln. Referenz sind `3a` (Landing), `1b` (`/firmen/`), `1c` (`/beschaeftigte/`). Die Blöcke `1a`, `2b` und `2c` in derselben Datei sind verworfene Varianten — ignoriere sie.

## Auftrag

1. **Landing (`3a`)** — `index.html` und `src/landing.css` ersetzen. `design_handoff_zeigmers_redesign/referenz/landing.html` und `referenz/landing.css` sind umsetzungsnah geschrieben und können als Ausgangspunkt dienen; passe Pfade, Schrifteinbindung und Metadaten an das Repo an. Die vier SVG aus `referenz/grafik/` nach `public/grafik/` kopieren und `tools/build_landing_svg.mjs` übernehmen.
2. **`/firmen/` (`1b`)** — die heute sechs verteilten Flächen (`#steuerung`, `#kennzahlen`, `#legende`, `#hinweis`, `#panel`, `NavigationControl`) zu einer Leiste links plus Panel rechts plus Zoom-Gruppe zusammenziehen. Neu: Suche. Entfällt: Organisationsform-Gruppe, Kennzahlen-Box oben mittig, ⓘ-Umschalter, Massstabskarte.
3. **`/beschaeftigte/` (`1c`)** — gleiche Leiste, zusätzlich Breadcrumb (ersetzt `src/ui/backControl.ts`) und klickbare Kantons-Rangliste. Der Höhenmassstab bleibt hier bestehen, anders als auf `/firmen/`.

Arbeite in dieser Reihenfolge und committe nach jedem der drei Schritte einzeln.

## Was du vorher lesen solltest

- `src/style.css` — alle heutigen UI-Regeln, mit langen Begründungen in den Kommentaren. Insbesondere den Block zur Stapelreihenfolge von `#map` / `#ui`: er muss erhalten bleiben, sonst legt sich der deck.gl-Overlay-Canvas über die Oberfläche.
- `src/ui/nav.ts`, `legend.ts`, `kennzahlen.ts`, `notices.ts`, `panel.ts`, `backControl.ts` — die Module, deren Ausgabe umzieht.
- `src/karte/firmen.ts` und `src/karte/beschaeftigte.ts` — die Verdrahtung: ein Zustand, ein `render()`.
- `src/domain/selection.ts` — «ein Pfad, kein zweiter Ort zum Filtern». Halte das ein: die Suche navigiert, sie filtert nicht.
- Die relevanten Abschnitte von `README.md` im Repo-Wurzelverzeichnis (73 KB, nicht ganz lesen — such nach den Abschnitten zu Legende, Eckbox und Kahlschlag vom 17.08.2026).

## Regeln dieses Repos, die du einhalten musst

- **Kommentare auf Deutsch**, im Ton des bestehenden Codes: sie begründen Entscheidungen, statt zu beschreiben, was der Code tut. Wo du etwas entfernst, schreib in den Kommentar, warum es entfallen ist und wohin der Inhalt gewandert ist. Wo du eine Zahl nennst, muss sie gemessen sein.
- **Keine neuen Abhängigkeiten.** Kein React, kein CSS-Framework, kein Icon-Paket. Symbole im Entwurf sind Textzeichen (`›`, `↵`, `+`, `−`, `N`, `⌘K`).
- **Keine erfundenen Zahlen.** Jede Zahl in der Oberfläche kommt aus den geladenen Artefakten, wie heute. Die Zahlen im Entwurf (762.1 Mrd., 187 Angaben, 201/224, 5'876'865, 19.9 %) sind aus den echten Dateien gerechnet und dienen als Erwartungswert — hartcodieren darfst du sie nicht.
- **Texte wörtlich übernehmen.** Alle Vorbehalte bleiben erhalten, auch wenn sie den Platz wechseln: «kein amtliches Statistikprodukt», die Abdeckungsangabe, die BFS-Obergrenze, «Keine Branche ausgewählt — Karte leer.».
- **ARIA nicht verlieren.** `role="radiogroup"` mit `aria-checked` für Kennzahl und Höhe, `role="group"` mit `aria-label="Branchen"` und `aria-pressed` je Branchenzeile, sichtbarer Fokusring auf allem Interaktiven. Die Suche braucht `role="listbox"`/`role="option"` und `aria-activedescendant`.
- **Kontrast:** auf Papier (`#F7F8F9`) keine Textfarbe heller als `#5A6B7C` und keine Schrift kleiner als 11 px. Die Zwischentöne `#93A1AE` und `#6A7A88` sind im Entwurf bewusst wieder entfernt worden.
- **Radien auf 0, keine Schatten.** Der Entwurf trennt Flächen über Linien: 2 px Tinte auf der Landing, 1.5 px an Leiste und Panel, 1 px `#D5DDE5` innerhalb einer Fläche.

## Was du nicht anfassen darfst

`src/layers/**`, `src/domain/**` (ausser Lesezugriff), `src/data/**`, `etl/**`, `public/data/**`. Also: keine Layer, keine Beleuchtung, keine Kamera, keine Höhenskala (`(v/vmax)**0.4`), keine Mindesthöhen, keine Verlustfarbe, keine der elf Branchenfarben, kein ETL-Schritt. Geändert wird die Oberfläche und die Landing — nichts, was eine Aussage über die Daten trifft.

Ausnahme: `src/ui/backControl.ts` wird gelöscht, ersetzt durch das Breadcrumb.

## Fragen, die du selbst entscheiden sollst

1. **Zoom-Knöpfe:** MapLibres `NavigationControl` umstylen oder drei eigene Knöpfe auf `map.zoomIn()` / `zoomOut()` / `resetNorth()`. Ich halte Letzteres für weniger Kampf gegen fremde Selektoren — entscheide nach dem, was du im Code siehst, und begründe es im Kommentar.
2. **Schrifteinbindung:** Space Grotesk (500, 700) und IBM Plex Mono (400) selbst hosten unter `public/fonts/`, woff2, latin-Subset, `font-display: swap`. Die Referenzdatei lädt von Google Fonts — das soll nicht in Produktion gehen.
3. **Modulschnitt:** der Vorschlag im README (`leiste.ts`, `suche.ts`, `rangliste.ts`, `breadcrumb.ts`) ist ein Vorschlag. Wenn der bestehende Code eine andere Aufteilung nahelegt, nimm die und sag mir warum.

## Tests

`npm test` (Vitest, Environment `node`, jsdom vorhanden) muss am Ende grün sein, `npm run build` (`tsc --noEmit && vite build`) ebenfalls.

Diese Tests fassen die geänderte Oberfläche an und müssen mitgezogen werden — anpassen, nicht löschen: `src/landing.test.ts`, `src/ui/nav.test.ts`, `legend.test.ts`, `kennzahlen.test.ts`, `notices.test.ts`, `panel.test.ts`. Neu dazu: ein Test für die Suche (Normalisierung ohne Akzente, höchstens acht Treffer, Escape leert) und einer für die Rangliste (absteigende Sortierung, Klick-Callback).

Ergänze `src/landing.test.ts` um zwei Prüfungen: dass `index.html` kein `<script>` enthält (die Landing bleibt die einzige Seite ohne JavaScript), und dass die vier Dateien in `public/grafik/` existieren.

## Fertig ist es, wenn

- `npm run dev` zeigt die Landing mit zwei Kacheln, Hover kippt sie auf Tinte und tauscht die Grafik.
- Beide Kartenseiten zeigen genau drei Flächen über der Karte: Leiste links, Panel rechts (nur nach Klick), Zoom-Gruppe rechts unten — plus das bestehende Hover-Label.
- Die Suche findet «Nestlé» auch als «nestle», fliegt hin und öffnet das Panel.
- Auf `/beschaeftigte/` führt der Breadcrumb aus einem Kanton zurück und die Rangliste betritt einen Kanton per Klick.
- `npm test` und `npm run build` sind grün.
- Kein Vorbehalt und keine Zahl der heutigen Oberfläche ist verloren gegangen. Sag mir am Ende in einer Liste, was wohin gewandert ist.

## Was du am Ende berichten sollst

1. Welche Dateien neu sind, welche geändert, welche gelöscht.
2. Deine Entscheidung zu den drei offenen Fragen, je ein Satz.
3. Die Liste umgezogener Texte (von wo nach wo).
4. Alles, wo der Entwurf und der bestehende Code sich widersprochen haben und wie du es gelöst hast.
