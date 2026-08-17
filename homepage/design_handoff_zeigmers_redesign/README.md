# Handoff: zeigmers — Landingpage und Kartenoberfläche

## Überblick

Drei Bildschirme werden neu gebaut:

| Ref | Seite | Kern der Änderung |
| --- | --- | --- |
| **3a** | `/` (Landing) | Nur noch Wortmarke und zwei Kacheln. Jede Kachel: Titel, eine Zahl, eine Grafik aus den echten Daten. Kein Fliesstext, kein Footer. |
| **1b** | `/firmen/` | Die sechs verteilten UI-Boxen werden **eine Leiste links**. Neu: Suche. Entfällt: Organisationsform-Gruppe, Kennzahlen-Box oben, eingeklappte Eckbox. |
| **1c** | `/beschaeftigte/` | Gleiche Leiste. Neu: Breadcrumb statt Zurück-Knopf, klickbare Kantons-Rangliste. |

Die Karten selbst (deck.gl-Layer, Beleuchtung, Kamera, Skalen, Farbpalette, ETL) bleiben **unverändert**. Geändert wird ausschliesslich die Oberfläche darum herum — plus die Landing, die neu zwei statische SVG statt Fliesstext zeigt.

## Zu den Design-Dateien in diesem Bündel

Die Dateien hier sind **Design-Referenzen in HTML** — Entwürfe, die Aussehen und Verhalten zeigen, kein Produktionscode zum Kopieren. Aufgabe ist, sie in der bestehenden Umgebung des Repos nachzubauen:

- **Zielumgebung:** `kokosevi/zeigmers`, Branch `main`. Vite + TypeScript, kein Framework — die Oberfläche wird in `src/ui/*.ts` mit `document.createElement` gebaut, Styles liegen zentral in `src/style.css` (Karten) und `src/landing.css` (Landing). Tests mit Vitest neben den Modulen (`*.test.ts`).
- Es wird also **kein React eingeführt**. Neue Bausteine folgen dem vorhandenen Muster: eine Funktion `renderX(options)`, die ihr Element in `#ui` hängt, keinen eigenen Zustand hält und bei jedem `render()` neu zeichnet (siehe `src/ui/legend.ts`, `src/ui/kennzahlen.ts`).
- Eine Ausnahme, die direkt übernehmbar ist: `referenz/landing.html` + `referenz/landing.css` + `referenz/grafik/*.svg` und `tools/build_landing_svg.mjs`. Diese vier Teile sind bereits in der Sprache des Repos geschrieben (Vanilla, kein JS auf der Landing) und können als Ausgangspunkt für `index.html` / `src/landing.css` / `public/grafik/` / `tools/` dienen.

**Fidelität: hifi.** Farben, Schriftgrössen, Abstände, Linienstärken und Texte in diesem Dokument sind final und sollen pixelgenau umgesetzt werden.

## Reihenfolge der Umsetzung

1. **Landing** (in sich geschlossen, keine Kartenabhängigkeit, sofort sichtbares Ergebnis).
2. **Leiste für `/firmen/`** — dabei entstehen die Bausteine, die 1c weiterverwendet.
3. **`/beschaeftigte/`** — Leiste plus Breadcrumb und Rangliste.

---

## Design-Tokens

### Farben

| Token | Wert | Verwendung |
| --- | --- | --- |
| `--papier` | `#F7F8F9` | Kachel- und Leistenfläche, Panel |
| `--grund` | `#E4E7EB` | Fläche aussen um die Landing |
| `--tinte` | `#14202B` | Text, Rahmen, aktive Schaltfläche, invertierte Kachel |
| `--tinte-tief` | `#1B2733` | Deckflächen der SVG-Grafiken (bestehender Repo-Wert) |
| `--tinte-leise` | `#5A6B7C` | **jeder** Sekundär- und Fussnotentext |
| `--linie` | `#D5DDE5` | Trennlinie innerhalb einer Fläche (1 px) |
| `--rand` | `#C6D0DA` | Trennlinie in Segment-Umschaltern (1 px) |
| `--karte-grund` | `#E8EDF2` | Kartenhintergrund (unverändert) |
| `--karte-platte` | `#DCE3EB` | Vignette der Karte, Spur der Anteilsbalken |
| `--akzent-firmen` | `#0072B2` | Anteilsbalken `/firmen/` (= NOGA «Industrie und Energie») |
| `--akzent-arbeit` | `#004949` | Anteilsbalken und Ranglistenbalken `/beschaeftigte/` |

Die elf Branchenfarben aus `src/domain/noga.generated.ts` bleiben unangetastet (farbenblind-geprüft von `etl/tests/test_palette.py`).

**Kontrastregel:** auf `--papier` wird keine Textfarbe heller als `--tinte-leise` (`#5A6B7C`, 5.6:1) gesetzt, und keine Schriftgrösse kleiner als 11 px. Die Zwischentöne `#93A1AE` und `#6A7A88` sind im Entwurf bewusst wieder entfernt worden (2.5:1 bzw. 4.2:1).

### Schriften

| Rolle | Familie | Gewichte |
| --- | --- | --- |
| Text, Titel | **Space Grotesk** | 500, 700 |
| Zahlen, Labels, technische Angaben | **IBM Plex Mono** | 400 |

Fallback-Stack: `"Space Grotesk", "Helvetica Neue", system-ui, sans-serif` und `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace`.

In der Umsetzung selbst hosten (`public/fonts/`, `@font-face`, `font-display: swap`, woff2, latin-Subset) — die Referenzdatei lädt zur Bequemlichkeit von Google Fonts. `font-variant-numeric: tabular-nums` bleibt global gesetzt, wie heute.

### Typografische Skala

| Element | Grösse / Zeilenhöhe | Familie, Gewicht, Laufweite |
| --- | --- | --- |
| Wortmarke Landing | 30 px / 1 | Grotesk 700, `-.045em` |
| Kacheltitel | 40 px / 1 | Grotesk 500, `-.035em` |
| Kachelzahl gross | 56 px / .82 | Mono 400, `-.04em` |
| Kachelzahl klein | 36 px / 1 | Mono 400, `-.035em` |
| Kachel-Kopfzeile | 11 px | Mono 400, `.16em`, uppercase, `opacity .65` |
| Wortmarke Leiste | 19 px | Grotesk 700, `-.04em` |
| Gruppenlabel Leiste | 10.5 px | Mono 400, `.16em`, uppercase, `--tinte-leise` |
| Schaltfläche Leiste | 11.5 px | Grotesk 400 |
| Suchfeld-Platzhalter | 12.5 px | Grotesk 400, `--tinte-leise` |
| Summe Leistenfuss | 19 px | Mono 400, `-.02em` |
| Panel-Titel | 17 px | Grotesk 500, `-.02em` |
| Panel-Hauptzahl | 17 px | Mono 400 |
| Panel-Nebenzahl | 13.5 px | Mono 400 |
| Fliesstext Panel / Zeilen | 11.5 px / 1.5 | Grotesk 400 |
| Fussnoten, Vorbehalte | 11 px / 1.45 | Grotesk 400, `--tinte-leise` |

### Linien, Radien, Schatten

- Rahmen der Landing und Trennlinien zwischen den Kacheln: **2 px** `--tinte`.
- Rahmen von Leiste, Panel und Zoom-Gruppe: **1.5 px** `--tinte`.
- Trennlinien innerhalb einer Fläche: **1 px** `--linie`, in Segment-Umschaltern `--rand`.
- **Border-Radius: 0** überall. Der Entwurf hat keine gerundeten Ecken (bisher `.5rem`/`.375rem`) — Ausnahme: Farbpunkte und Statusringe sind Kreise.
- **Keine Schatten.** Die heutigen `box-shadow: 0 1px 3px …` entfallen; Trennung entsteht über die Rahmenlinie.
- Fokus: `outline: 2px solid var(--tinte); outline-offset: 2px` (auf der Landing `-6px`, damit der Ring innen läuft).
- Bewegung: nur Zustandswechsel bei Hover/Fokus, ohne Transition. `prefers-reduced-motion`-Block bleibt.

---

## Screen 3a — Landing (`/`)

### Zweck

Neugier statt Erklärung. Wer hier landet, soll in zwei Sekunden sehen, dass es zwei Karten gibt, und klicken. Kein Fliesstext, kein Footer, keine Quellenzeile — Quellen und Vorbehalt stehen auf den Kartenseiten (in der Leiste, siehe 1b/1c).

### Struktur

```
main (max-width 1280px, zentriert, Padding clamp)
├── header      2px Rahmen, Papier
│   ├── h1 «zeigmers»
│   └── span «Schweiz · 3D»          Mono 11px, .16em, uppercase, leise
└── nav.kacheln 2px Rahmen ohne Oberkante, grid 7fr 5fr
    ├── a.kachel → /firmen/          rechte Kante 2px Tinte
    │   ├── .kopf   «01» · «SIX Swiss Exchange»
    │   ├── .grafik firmen-ink.svg (+ firmen-paper.svg, unsichtbar)
    │   └── .fuss   h2 «Börsennotierte Firmen» · «201»   (in einer Zeile)
    └── a.kachel → /beschaeftigte/
        ├── .kopf   «02» · «BFS STATENT 2023»
        ├── .grafik kantone-ink.svg (+ kantone-paper.svg)
        └── .fuss   h2 «Beschäftigte» · «5'876'865»      (untereinander)
```

Masse: Kachel-Padding `40px 44px 38px`; Grafik `margin-top: 38px`, `width: 100%`, `height: auto`; `.fuss` mit `margin-top: auto` und `padding-top: 32px`. Die Kacheln füllen die Höhe (`min-height: 34rem`), die Grafik sitzt oben, Titel und Zahl unten — der Weissraum dazwischen ist beabsichtigt.

### Hover / Fokus

Die ganze Kachel kippt: `background: var(--tinte)`, `color: var(--papier)`, und die Grafik wechselt auf ihre invertierte Fassung (`opacity`-Tausch der zwei `<img>`, siehe `landing.css`). Kein Transform, keine Skalierung, kein Schatten. Gleiches Verhalten bei `:focus-visible`, damit die Tastaturbedienung dasselbe zeigt.

### Grafiken

Vier statische SVG in `public/grafik/`, erzeugt von `tools/build_landing_svg.mjs` (im Bündel):

| Datei | Inhalt | Grösse |
| --- | --- | --- |
| `firmen-ink.svg` | 201 Säulen an den echten Koordinaten, Höhe `(umsatz/max)^0.4`, Deckung `0.34 + t·0.5` | ~16 KB |
| `firmen-paper.svg` | dasselbe in `#F7F8F9` für den Tinte-Hover | ~16 KB |
| `kantone-ink.svg` | 26 Kantone aus `ch_kantone.geojson`, extrudiert mit `(beschäftigte/max)^0.55` | ~66 KB |
| `kantone-paper.svg` | dasselbe invertiert | ~66 KB |

Beide Kacheln benutzen **denselben Bildausschnitt und dieselbe Projektion** (Äquirektangular, `cos(46.8°)`-Stauchung, danach Faktor `0.62` als Kameraneigung; `viewBox 0 0 1007 493`). Dadurch steht jede Firmensäule dort, wo ihr Kanton in der zweiten Kachel liegt.

Wichtig: das Skript liest `public/data/companies.json`, `public/data/ch_kantone.geojson` und `public/data/meta.json` — **keine zweite Datenquelle**. Es gehört in `package.json` als `prebuild` bzw. hinter den ETL-Lauf, sonst veralten die Kacheln gegenüber den Karten. Die Kantonsringe werden auf ~3 km gedünnt (26 Kantone, ~1'650 Punkte statt ~300'000); die Kachel wird nie breiter als ~660 px gezeigt, feiner ist unsichtbar.

Die Landing bleibt damit **die einzige Seite ohne JavaScript**: keine Zeile deck.gl/MapLibre (zusammen 1.52 MB), nur CSS und vier SVG.

### Texte (verbatim)

- `zeigmers` · `Schweiz · 3D`
- `01` · `SIX Swiss Exchange` · `Börsennotierte Firmen` · `201`
- `02` · `BFS STATENT 2023` · `Beschäftigte` · `5'876'865`

Beide Zahlen sind heute schon in `index.html` und werden von `src/landing.test.ts` gegen `companies.json` geprüft — dieser Test bleibt gültig, muss aber an die neue Struktur angepasst werden (siehe *Tests*).

### Responsive

Unter 800 px wird gestapelt (`grid-template-columns: 1fr`), die rechte Kante der ersten Kachel wird zur Unterkante, Padding auf `28px 24px`, `.fuss-breit` bricht auf zwei Zeilen um.

---

## Screen 1b — `/firmen/`

### Was heute wo liegt (Ausgangslage)

`#steuerung` oben links, `#kennzahlen` oben mittig, `#legende` unten links, `#hinweis` unten rechts (eingeklappt hinter einem ⓘ), `#panel` rechts oben, MapLibres `NavigationControl` oben rechts. Sechs Flächen an fünf Rändern.

### Ziel: eine Leiste

Eine Spalte links, `position: absolute; left: 20px; top: 20px; bottom: 20px; width: 264px`, Papier, 1.5 px Rahmen, `display: flex; flex-direction: column`. Inhalt von oben nach unten:

1. **Kopf** — Padding `16px 18px 14px`, Unterkante 1.5 px Tinte.
   Wortmarke `zeigmers` (19 px, 700, Link auf `/`, ersetzt `#steuerung .marke`), darunter der Ansichtsname `Börsennotierte Firmen` (13 px, leise).
2. **Suche** — Padding `14px 18px 0`. Feld mit 1.5 px Rahmen, `background: #fff`, Padding `8px 10px`: Kreis-Icon (9 px, 1.5 px Rahmen), Platzhalter `Firma suchen` (12.5 px, leise), rechts `⌘K` (11 px Mono, leise). Verhalten unten.
3. **Kennzahl** — Label `KENNZAHL`, darunter ein Dreier-Segment `Umsatz | Personal | Gewinn`, `display: grid; grid-template-columns: 1fr 1fr 1fr`, 1.5 px Rahmen, Zellen `padding: 7px 4px`, 11.5 px, zentriert, Trennlinie 1 px `--rand`. Aktiv: `background: var(--tinte); color: var(--papier)`.
   Semantik unverändert aus `src/ui/nav.ts`: `role="radiogroup"`, `aria-checked` je Knopf. Label «Personal» statt «Mitarbeitende», weil die Zelle sonst umbricht — `metricLabel()` bleibt für Legende, Panel und Kennzahlenzeile die Quelle des vollen Namens.
4. **Höhe** — Label `HÖHE`, Zweier-Segment `gedämpft | linear` (statt `logarithmisch | linear`), darunter eine Zeile 11 px leise: `Gedämpft, sonst wären 153 von 187 Säulen gleich flach.`
   Damit entfällt die Massstabskarte auf der Karte; die ehrliche Herkunft der Formel (`(v/vmax)**0.4`) bleibt bei den Vorbehalten im Fuss.
5. **Branchen** — Label `BRANCHEN`, rechts daneben `ALLE` (10.5 px Mono, uppercase, 1 px Unterstreichung) = `onAllBranches`. Darunter je vorkommende Gruppe eine Zeile: Punkt 9 px Kreis mit `inset 0 0 0 1px rgba(20,32,43,.18)`, Farbe aus `litTopFaceColor(group.color)`, dazu der Branchenname 11.5 px. Abgewählt: `opacity .5`.
   **Keine Zahlen je Branche** — der Kahlschlag vom 17.08. bleibt bestehen, der Entwurf ändert nur die Position. `role="group"`, `aria-label="Branchen"`, `aria-pressed` je Zeile wie heute.
6. **Fuss** — `margin-top: auto`, Oberkante 1.5 px Tinte, Padding `14px 18px`:
   - Summe der Auswahl, 19 px Mono: `762.1 Mrd. CHF`
   - Bezug, 11 px leise: `Summe der Auswahl · aus 187 Angaben`
   - Vorbehalte, 11 px `--tinte-leise`, mit Oberkante 1 px `--linie` und `padding-top: 8px`:
     `201 von 224 kotierten SIX-Titeln · Umsatz in CHF umgerechnet · kein amtliches Statistikprodukt`

Damit wandern drei bisherige Boxen in die Leiste (`#legende`, `#kennzahlen`, `#hinweis`) und zwei Elemente entfallen ganz:

- **Organisationsform-Gruppe** — ein einziger Wert (`boersenkotiert`), filtert nichts. `NavOptions.orgForms` und der Filterpfad in `domain/selection.ts` bleiben bestehen; nur die Schaltflächen verschwinden, bis ein zweiter Wert existiert.
- **ⓘ-Umschalter** (`.hinweis-umschalter`) — die Vorbehalte stehen offen im Fuss. Ohne Klick sichtbar, wie vor dem 17.08., aber leise.

### Karte

Unverändert: `#map { position: absolute; inset: 0 }`, MapLibre + deck.gl-Overlay, Kantonsflächen, Seen, Beleuchtung, Kamera, `logarithmisch`-Default, Mindesthöhen, Verlustfarbe. Die Leiste liegt darüber (`#ui`, `z-index: 1`) — die freie Fläche rechts der Leiste ist gedachter Kartenraum, keine eigene Box. Im Mock ist sie gestreift markiert und beschriftet, damit sichtbar bleibt, dass dort nichts angetastet wird.

Die Stapelreihenfolge aus `src/style.css` (`#map { z-index: 0 }` als eigener Stacking-Context wegen des MapLibre-Positions-Divs mit `z-index: 2`) bleibt unbedingt erhalten.

### Panel (Klick auf eine Säule)

`position: absolute; right: 20px; top: 20px; width: 296px`, Papier, 1.5 px Rahmen. Aufbau:

1. **Kopf** (Padding `14px 16px 12px`, Unterkante 1.5 px): Name 17 px Grotesk 500 links, SIX-Symbol 11 px Mono rechts; darunter 11.5 px leise `Vevey VD · gegründet 1866 · Geschäftsjahr 2025`.
2. **Hauptzahl**: Zeile `Jahresumsatz` (11.5 px leise) links, Wert 17 px Mono rechts (`89.49 Mrd.`).
3. **Anteilsbalken** (neu): 6 px hoch, Spur `--karte-platte`, Füllung `--akzent-firmen`, Breite = Wert / `revenueTotal`. Darunter 11 px leise: `Rang 1 von 187 · 11.7 % des Gesamtumsatzes aller kotierten Gesellschaften`.
   `CompanyContext` liefert `rank`, `rankTotal` und `revenueTotal` bereits — es kommt kein neuer Datenweg hinzu, nur eine zweite Darstellung derselben Zahl.
4. **Raster** `1fr 1fr`, `gap: 12px 10px`: `Reingewinn 9.03 Mrd.` · `Mitarbeitende 271'000` (Label 11 px leise, Wert 13.5 px Mono).
5. **Branche**: Punkt + Name, darunter `coreProducts` als Fliesstext 11.5 px / 1.5 (im Panel auf zwei bis drei Zeilen kürzen, nicht den ganzen Datensatz setzen).
6. **Fuss** (Oberkante 1 px `--linie`, Padding `11px 16px`): `GESCHÄFTSBERICHT` als Link (10.5 px Mono, uppercase, unterstrichen) links, UID rechts (11 px Mono, leise).

Vorbehalte, die heute im Panel stehen (Obergrenzen-Notiz, Platzhalterhinweis, fehlende Werte), bleiben inhaltlich unverändert und erscheinen als `.panel-fussnote`-Zeile unter dem Raster, 11 px, leise, kursiv.

### Zoom-Gruppe

`right: 20px; bottom: 22px`, Spalte aus drei Zellen 32×32 px, 1.5 px Rahmen aussen, 1 px `--linie` zwischen den Zellen: `+`, `−`, `N` (Norden zurücksetzen). Entweder MapLibres `NavigationControl` entsprechend stylen oder durch eigene Knöpfe auf `map.zoomIn()/zoomOut()/resetNorth()` ersetzen — Letzteres ist weniger CSS gegen fremde Selektoren.

---

## Screen 1c — `/beschaeftigte/`

Gleiche Leiste, gleiche Masse, gleiches Panel-Raster. Unterschiede:

1. **Breadcrumb statt Zurück-Knopf.** Im Leistenkopf unter der Wortmarke: `Schweiz › Zürich` (12.5 px; aktive Stufe `--tinte`, inaktive mit 1 px Unterstreichung `#A8B6C6`, Trenner `›` in `--tinte-leise`). Auf Gemeindestufe dreistufig. Klick auf eine Stufe springt dorthin — das ersetzt `#zurueck-gruppe` / `src/ui/backControl.ts` vollständig und macht zusätzlich sichtbar, auf welcher Stufe man steht.
2. **Suche** mit Platzhalter `Kanton oder Gemeinde`, ohne `⌘K`-Hinweis.
3. **Keine Kennzahl-Gruppe** (diese Ansicht kennt nur eine Grösse), nur `HÖHE`.
4. **Rangliste** (neu) — Label `RANGLISTE`, rechts `ALLE 26`. Je Kanton eine Zeile: Name 11.5 px links, Wert 11 px Mono rechts, darunter ein Balken 4 px hoch, `--akzent-arbeit`, `opacity .85`, Breite `(wert/max)^0.5`. Sichtbar sind die ersten neun, `ALLE 26` klappt auf. Hover hebt den Kanton auf der Karte hervor, Klick betritt ihn (gleicher Pfad wie ein Klick auf die Fläche).
   Das ist der eigentliche Gewinn dieser Seite: die Karte wird lesbar, ohne dass man sie drehen muss.
5. **Massstab bleibt** — die kleine Karte unten links (`Höhe = Beschäftigte`, vier Stufen `25'000 / 150 / 500 / 1'167` plus die Zeile `Von Appenzell I.Rh. bis Zürich liegen 108-fache Unterschiede.`) bleibt hier bestehen, anders als auf `/firmen/`. Position `left: 308px; bottom: 22px`, Papier, 1.5 px Rahmen, Padding `12px 16px 11px`.
6. **Panel**: Titel `Zürich`, rechts `ZH · 160 Gemeinden`. Hauptzahl `1'167'319`, Anteilsbalken `19.9 %` in `--akzent-arbeit`, Zeile `19.9 % aller Beschäftigten der Schweiz · Rang 1 von 26`. Raster: `Einwohner 1'620'020` · `je Einwohner 0.72`. Darunter `Stärkste Branchen` als drei Punkt-Zeilen. Fuss: `GEMEINDEN ZEIGEN` links, `↵` rechts — der Eintritt in den Kanton wird damit eine benannte Aktion statt eines beiläufigen Flächenklicks.
   Die Obergrenzen-Fussnote (BFS rundet kleine Betriebe auf 4 auf) bleibt wörtlich erhalten; im Leistenfuss steht sie zusätzlich als Teil der Vorbehalte: `BFS STATENT 2023 · Obergrenze: kleine Betriebe werden auf 4 Beschäftigte aufgerundet`.

---

## Neues Verhalten im Detail

### Suche (beide Karten)

- Eingabe filtert `companies.companies` bzw. die Kantons-/Gemeindeliste nach Teilstring, akzent- und grossschreibungsunabhängig (`localeCompare`-Normalisierung oder `String.normalize('NFD')`).
- Höchstens 8 Treffer als Liste direkt unter dem Feld (gleiche Fläche, 1.5 px Rahmen ohne Oberkante, Zeilen 11.5 px, Hover `background: var(--karte-platte)`).
- `Enter` oder Klick: `map.flyTo({ center: [lon, lat], zoom: 11 })`, Panel für das Objekt öffnen, die Säule bzw. Fläche markiert lassen (heller Ring bzw. `litTopFaceColor` aufgehellt) bis zum nächsten Klick.
- `Escape` leert das Feld und schliesst die Liste; `⌘K` / `Ctrl+K` fokussiert es.
- Tastaturbedienung: `↑`/`↓` durch die Treffer, `role="listbox"` / `role="option"`, `aria-activedescendant`.
- Der Suchtreffer **filtert nicht** — er navigiert. Filter bleibt allein Sache der Branchenzeilen (ein Pfad, wie in `domain/selection.ts` festgehalten).

### Rangliste (`/beschaeftigte/`)

- Datenquelle: die 26 Werte, die `createBasis()` ohnehin lädt (`ch_kantone`), absteigend sortiert. Keine neue Ladeoperation.
- Hover → Kanton hervorheben (eigener Highlight-Layer oder `highlightedObjectIndex`), Verlassen → zurück.
- Klick → dieselbe Funktion, die heute der Flächenklick auslöst.
- Auf Gemeindestufe zeigt die Liste die Gemeinden des betretenen Kantons, wieder absteigend.

### Zustand

Kein neuer Zustand, keine Bibliothek. `selection` (`metric`, `branches`, `orgForms`) und `mode` bleiben in `karte/firmen.ts` bzw. `karte/beschaeftigte.ts`, jede Änderung ruft weiterhin genau ein `render()`. Neu hinzu kommen zwei rein lokale Werte in der Leiste: der Suchtext und ob die Rangliste aufgeklappt ist. Beide beeinflussen die Karte nicht und gehören deshalb in das jeweilige UI-Modul, nicht in `selection`.

### Vorgeschlagener Modulschnitt

| Neu / geändert | Aufgabe |
| --- | --- |
| `src/ui/leiste.ts` (neu) | baut die Spalte und nimmt die Abschnitte als Kinder auf; ersetzt `#steuerung` |
| `src/ui/suche.ts` (neu) | Feld, Trefferliste, Tastaturbedienung; meldet nur `onPick(objekt)` |
| `src/ui/rangliste.ts` (neu) | Liste, Hover- und Klick-Callbacks |
| `src/ui/breadcrumb.ts` (neu) | ersetzt `src/ui/backControl.ts` |
| `src/ui/nav.ts` | baut nur noch die Segment-Gruppen (Kennzahl, Höhe) und hängt sie in die Leiste; Ansichts- und Organisationsform-Gruppe entfallen |
| `src/ui/legend.ts` | rendert in die Leiste statt in `#legende`; Inhalt unverändert |
| `src/ui/kennzahlen.ts` | rendert in den Leistenfuss statt in `#kennzahlen`; Text unverändert |
| `src/ui/notices.ts` | liefert die Vorbehaltszeile für den Leistenfuss; Klapp-Logik und `.hinweis-umschalter` entfallen |
| `src/ui/panel.ts` | neue Hierarchie und Anteilsbalken, gleiche Datenfelder |
| `src/style.css` | neue Tokens, keine Radien, keine Schatten, Leisten- und Panel-Regeln |
| `src/landing.css`, `index.html` | ersetzt durch `referenz/landing.css` / `referenz/landing.html` |
| `tools/build_landing_svg.mjs` (neu) | erzeugt `public/grafik/*.svg` |

### Responsive (Karten)

Der bestehende `@media (max-width: 800px)`-Block in `src/style.css` löst heute `#kennzahlen`, `#legende` und `#hinweis` aus der Absolutpositionierung und stapelt sie unten. Mit der Leiste wird daraus: die Leiste liegt unter 800 px **nicht** mehr links, sondern als Blatt am unteren Rand (`left: 12px; right: 12px; bottom: 12px; top: auto; max-height: 60vh; overflow-y: auto`), das Panel ebenso, und die Zoom-Gruppe rückt nach oben rechts. Die Karte behält die volle Fläche.

---

## Tests

Vitest läuft neben den Modulen; diese Dateien fassen die geänderte Oberfläche an und müssen mitgezogen werden:

| Datei | Warum |
| --- | --- |
| `src/landing.test.ts` | prüft die in `index.html` verlinkten Pfade gegen `VIEW_PATH` und die Zahlen gegen `companies.json`. Beides bleibt gültig, die Selektoren ändern sich (`.karte` → `.kachel`). Neu sinnvoll: prüfen, dass die vier SVG existieren und `index.html` kein `<script>` enthält. |
| `src/ui/nav.test.ts` | Ansichts- und Organisationsform-Gruppe entfallen, Höhenlabels heissen `gedämpft`/`linear`. |
| `src/ui/legend.test.ts` | Legende sitzt in der Leiste; Zahlenfreiheit der Branchenzeilen bleibt geprüft. |
| `src/ui/kennzahlen.test.ts` | Zielcontainer ist der Leistenfuss; Textbausteine unverändert. |
| `src/ui/notices.test.ts` | Klapp-Logik entfällt, Textbausteine bleiben. |
| `src/ui/panel.test.ts` | neue Struktur, gleiche Felder; Anteilsbalken zusätzlich prüfen. |
| `src/ui/backControl.ts` + Test | entfallen, ersetzt durch `breadcrumb`. |
| neu | `suche.test.ts` (Normalisierung, max. 8 Treffer, Escape), `rangliste.test.ts` (Sortierung, Klick-Callback). |

Nicht angefasst: alles unter `src/layers/`, `src/domain/`, `src/data/`, `etl/`.

---

## Assets

| Datei | Herkunft |
| --- | --- |
| `referenz/grafik/firmen-{ink,paper}.svg` | erzeugt aus `public/data/companies.json` |
| `referenz/grafik/kantone-{ink,paper}.svg` | erzeugt aus `ch_kantone.geojson` (ETL-Ausgabe) + `public/data/meta.json` |
| `tools/build_landing_svg.mjs` | erzeugt alle vier neu; nach jedem ETL-Lauf ausführen |

Keine Bilder, keine Icon-Fonts, keine Emoji. Das einzige Symbol im Entwurf ist `›` im Breadcrumb und `↵` im Panel-Fuss.

`ch_kantone.geojson` liegt nicht im Repo, sondern entsteht im ETL (`boundaries.build_cantons`) und wird nach `public/data/` ausgeliefert — das Build-Skript liest es von dort.

## Dateien in diesem Bündel

```
README.md                        dieses Dokument
PROMPT.md                        fertiger Einstiegs-Prompt für Claude Code
Zeigmers Redesign.dc.html        alle drei Entwürfe (3a, 1b, 1c) plus die
                                 verworfenen Kachelvarianten 2b/2c und die
                                 erste Runde 1a — im Browser öffnen
glyph.json                       Daten für die Entwurfsdatei (201 Koordinaten)
support.js                       Laufzeit der Entwurfsdatei — nicht Teil der
                                 Umsetzung, nur damit die Datei offline öffnet
kantone-{ink,paper}.svg          von der Entwurfsdatei referenziert
referenz/landing.html            Landing 3a, umsetzungsnah, ohne JavaScript
referenz/landing.css             zugehörige Styles mit allen Tokens
referenz/grafik/*.svg            die vier Kachelgrafiken
tools/build_landing_svg.mjs      Generator für die vier Grafiken
```

Die Entwurfsdatei ist mit Annotationsnadeln beschriftet (1–6 bei `/firmen/`, 1–4 bei `/beschaeftigte/`); die Legende dazu steht direkt unter dem jeweiligen Rahmen.

## Was ausdrücklich nicht geändert wird

- Alle deck.gl-Layer, Beleuchtung, Materialien, Kamera, Höhenskala (`(v/vmax)**0.4`), Mindesthöhen, Verlustfarbe.
- Die elf Branchenfarben und ihre Prüfung.
- Der ETL und alle Artefakte.
- Jede Zahl und jeder Vorbehalt im Text. Was heute steht, steht danach an anderer Stelle, aber wörtlich — inklusive «kein amtliches Statistikprodukt», der Abdeckungsangabe 201/224 und der BFS-Obergrenze.
