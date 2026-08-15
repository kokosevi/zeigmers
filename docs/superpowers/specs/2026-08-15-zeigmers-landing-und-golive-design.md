# zeigmers — Landing Page und Go-Live

Stand 15. August 2026. Dieses Dokument beschreibt den Umbau der bisherigen
Einzelseiten-Anwendung «Draufsicht» zu **zeigmers**: eine Landing Page mit zwei
Einstiegen, je eine eigene Unterseite pro Karte, die durchgehende Umbenennung,
und die erste Veröffentlichung auf Netlify ohne eigene Domain.

Die Domain `zeigmers.ch` ist das Ziel, aber nicht Teil dieses Vorhabens — sie
lässt sich später in Netlify eintragen, ohne dass am Code etwas geändert werden
muss.

## Ausgangslage

Die Anwendung ist heute **eine** Seite (`index.html` → `src/main.ts`) mit einem
Umschalter zwischen zwei Ansichten:

- **Börsennotierte Firmen** — national, Säulenhöhe ist der Umsatz.
- **Beschäftigte** — zwei Stufen: 26 Kantonsbalken (Start), und nach einem Klick
  die Gemeindeflächen des betretenen Kantons.

Relevante Zahlen für die Entscheidungen unten:

| | |
|---|---|
| Karten-Bundle | 1.52 MB JS + 68 KB CSS (deck.gl + MapLibre) |
| `companies.json` | 320 KB, wird heute auf **beiden** Ansichten geladen |
| `ch_kantone.{json,bin}` | 5.6 KB |
| `public/data` gesamt | 13 MB, im Repo eingecheckt |
| `netlify.toml` | existiert bereits, Build/Publish/Header korrekt |
| Git-Remote | keiner gesetzt; Branch heisst `master` |
| GitHub | `kokosevi/Zeigmers`, leer |
| Netlify | Konto vorhanden, nichts eingerichtet; CLI nicht installiert |

## Entscheidungen

Vier Festlegungen aus der Vorbesprechung, hier als Kontext für alles Weitere:

1. **Schreibweise** — durchgehend klein: `zeigmers`.
2. **Umfang der Umbenennung** — alles, inklusive des Python-ETL-Pakets und des
   lokalen Ordners.
3. **Landing-Inhalt** — knapp: Titel, ein Satz, zwei Karten, eine Fusszeile.
4. **Karten-Navigation** — der Ansichts-Umschalter bleibt an seinem Platz und in
   seiner Optik, wird aber zu Links auf die jeweils andere Seite.

Gewählter Architekturansatz: **Vite-Multi-Page-Build** mit drei echten
HTML-Einstiegen. Verworfen wurden ein SPA mit History-Routing (die Landing
lüde 1.5 MB deck.gl, um zwei Buttons zu zeigen, und bräuchte einen Router, den
es heute nicht gibt) und eine statische Landing in `public/` (läge ausserhalb
des Builds, ohne geteilte Tokens und ohne getrennte URLs pro Karte).

## 1 — Seitenstruktur

```
/                 index.html                 Landing, kein JavaScript
/firmen/          firmen/index.html          Börsennotierte Firmen
/beschaeftigte/   beschaeftigte/index.html   Beschäftigte
```

`vite.config.ts` erhält drei `build.rollupOptions.input`-Einträge. Vite spiegelt
die Verzeichnisstruktur nach `dist/`; Netlify serviert `/firmen/` von sich aus
aus `dist/firmen/index.html` und leitet `/firmen` auf `/firmen/` um — es braucht
**keine** Redirect-Regel in `netlify.toml`.

Die Landing bindet ihr CSS über `<link rel="stylesheet" href="/src/landing.css">`
ein, nicht über ein Modul-Skript. Vite verarbeitet das zu einem gehashten
CSS-Asset ohne begleitendes JavaScript. Die Landing lädt damit **0 Byte**
JavaScript statt 1.52 MB.

## 2 — Aufteilung von `main.ts`

`src/main.ts` (332 Zeilen) enthält heute drei Verantwortlichkeiten nebeneinander:
gemeinsamen Karten-Aufbau, Firmen-Spezifisches (die Abdeckungsangabe der
Legende), und Beschäftigte-Spezifisches (Kantons-Cache, `enterCanton`,
`exitToSwitzerland`, Escape-Behandlung). Weil jede Seite künftig genau eine
Ansicht besitzt, ist der `view`-Zustand kein Zustand mehr, sondern eine
Eigenschaft der Seite. Daraus folgt die Aufteilung:

| Datei | Zweck | Abhängigkeiten |
|---|---|---|
| `src/karte/basis.ts` | Karte anlegen; `meta`, `ch_kantone`, Kantonsgrenzen laden; `nationalBounds` berechnen; Navigation einhängen; Fehleranzeige | `map.ts`, `data/*`, `ui/nav.ts` |
| `src/karte/firmen.ts` | `companies.json` laden, Abdeckungsangabe bauen, rendern | `basis.ts`, `layers/visible.ts` |
| `src/karte/beschaeftigte.ts` | Kantons-Cache und -Deduplizierung, `enterCanton`, `exitToSwitzerland`, Escape, rendern | `basis.ts`, `layers/many.ts`, `ui/backControl.ts` |
| `src/firmen.ts` | Einstiegspunkt der Seite `/firmen/` | `karte/firmen.ts` |
| `src/beschaeftigte.ts` | Einstiegspunkt der Seite `/beschaeftigte/` | `karte/beschaeftigte.ts` |

`src/main.ts` entfällt.

Die vier `view === 'sichtbare' ? … : …`-Ternäre in `render()` verschwinden dabei
ersatzlos: jede Seite übergibt `renderLegend` schlicht ihre eigenen Werte
(Jahr, `presentGroups`, `scopeLabel`).

### `ViewLayersInput` wird eine unterschiedene Union

Heute verlangt `buildViewLayers` sowohl `companies` als auch
`kantone`/`cantonGeometries`/`kantoneVmax`/`activeCanton` — unabhängig davon,
welche Ansicht gebaut wird. Damit die Beschäftigten-Seite die 320 KB
`companies.json` gar nicht erst laden muss, wird `ViewLayersInput` eine über
`view` unterschiedene Union:

```ts
type ViewLayersInput =
  | ({ view: 'sichtbare' } & Basis & { companies: CompanyData
      onShowCompanyPanel: (company: Company) => void })
  | ({ view: 'beschaeftigte' } & Basis & { level: NoticeLevel
      kantone: Level; cantonGeometries: Geometry[]; kantoneVmax: number
      activeCanton: CantonEntry | null
      onEnterCanton: (index: number) => void
      onShowMunicipalityPanel: (level: Level, index: number) => void })
```

`Basis` sind die in beiden Ansichten gebrauchten Felder: `mode`, `cantonsGeo`,
`activeBfsNr`, `cantonBorderLayer`.

TypeScript verengt am `view`-Feld, der Rumpf von `buildViewLayers` bleibt
strukturell wie er ist. Der Gewinn gegenüber einem optionalen `companies?:` ist,
dass kein toter Guard entsteht, den kein Aufrufer je auslöst — der Compiler
erzwingt stattdessen, dass jede Seite genau das übergibt, was ihre Ansicht
braucht.

Die eingebaute Verteidigung (`level === 'kanton'` ohne `activeCanton` fällt auf
die Schweiz-Stufe zurück) bleibt bestehen.

### Was unangetastet bleibt

`layers/cantons.ts`, `layers/many.ts`, `layers/visible.ts`, `layers/elevation.ts`,
`layers/lighting.ts`, `layers/litColor.ts`, `layers/material.ts`,
`domain/*`, `data/*`, `ui/legend.ts`, `ui/notices.ts`, `ui/panel.ts`,
`ui/backControl.ts`, `ui/hoverLabel.ts`, `ui/format.ts`, `ui/error.ts`,
`map.ts`. Ihre bestehenden Tests laufen unverändert weiter.

`ch_kantone.{json,bin}` (5.6 KB) wird bewusst auf **beiden** Seiten geladen:
daraus leitet sich die Schweiz-Rahmung der Kamera ab. Für 5.6 KB lohnt sich kein
zweiter Rahmungs-Codepfad.

Der interne Ansichtsschlüssel `sichtbare` bleibt, wie in `ui/toggle.ts`
begründet — er trägt keine Zahl und keine Einheit, die aus dem Tritt geraten
könnte.

## 3 — Navigation auf den Kartenseiten

`src/ui/toggle.ts` wird zu `src/ui/nav.ts`. Position, Abstände und Optik bleiben
identisch; die Unterschiede:

- Neu darüber: `zeigmers` als Heim-Link auf `/`.
- Die zwei Ansichts-Elemente werden `<a href="/firmen/">` und
  `<a href="/beschaeftigte/">` statt `<button>`. Die eigene Seite trägt
  `aria-current="page"` statt `aria-checked` und behält die Klasse `aktiv`.
  Das `role="radiogroup"` entfällt an dieser Gruppe — Links sind keine
  Auswahl, sondern Navigation; sie bekommt stattdessen ein `<nav>` mit
  `aria-label="Ansicht"`.
- Die Höhenskala bleibt unverändert: zwei `<button>` in einer `role="radiogroup"`,
  je Seite ein eigener Default aus `DEFAULT_MODE`.
- Die Signatur wird `createNav(view: ViewName, onModeChange: (mode: ScaleMode)
  => void)`. Wie bisher ruft sie `onModeChange` einmal bei der Konstruktion auf,
  was den ersten Render auslöst.

`DEFAULT_MODE` bleibt in `nav.ts` und behält beide Einträge: `sichtbare:
'linear'`, `beschaeftigte: 'logarithmisch'`.

Zurück-Knopf (`ui/backControl.ts`) und Escape auf der Kantonsstufe bleiben
unberührt und existieren weiterhin nur auf der Beschäftigten-Seite.

## 4 — Landing Page

### Aufbau

```
┌──────────────────────────────────────────┐
│              zeigmers                    │
│  Die Schweizer Wirtschaft als 3D-Karte.  │
│                                          │
│  ┌──────────────┐  ┌──────────────┐      │
│  │ Börsen-      │  │ Beschäftigte │      │
│  │ notierte     │  │              │      │
│  │ Firmen       │  │ Untertitel   │      │
│  │ Untertitel   │  │ Kennzahl     │      │
│  │ Kennzahl     │  │              │      │
│  └──────────────┘  └──────────────┘      │
│                                          │
│  Quellen · kein amtliches Produkt        │
└──────────────────────────────────────────┘
```

Ein `<main>` mit `<h1>`, einem Untertitel-Satz, zwei Karten-Links als
`<a class="karte">`, und einer `<footer>`. Zwei Spalten, unterhalb von 640 px
gestapelt.

### Gestaltung

Eigene `src/landing.css`, die dieselben Tokens wie die Karte definiert
(`--grund #E8EDF2`, `--land`, `--tinte #1B2733`, `--tinte-leise`,
`--oberflaeche`, `--oberflaeche-rand`, `--schrift`) — keine Kopie der
244-zeiligen `style.css`, die fast ausschliesslich Karten-Chrome beschreibt.

Übernommen wird ausserdem, was dort bewusst festgelegt wurde: sichtbarer
Fokusring über `:focus-visible`, `font-variant-numeric: tabular-nums`, und kein
neu hinzugefügtes Bewegungsdesign über das Hover-Feedback hinaus, mit einer
`prefers-reduced-motion`-Sicherung.

### Kennzahlen und ihr Drift-Schutz

> **Korrekturnotiz (Fix-Runde 2 von Task 5, 15. August 2026):** Die Tabelle
> unten und der Absatz „Das ist kein theoretisches Risiko" behaupten, die
> Landing-Kennzahl sei „201 von 224 an der SIX kotierten Gesellschaften" und
> das README nenne fälschlich „202" statt „224". Das war ein Fehlschluss:
> **224** ist die Zahl der kotierten **Titel** (`stats.totalListed`), **202**
> ist die Zahl der **Gesellschaften** nach Zusammenfassung von Namen-/PS-
> Aktien und zweiten Handelslinien, **201** davon stehen auf der Karte — drei
> unterschiedliche, je für sich korrekte Grössen, kein Widerspruch. Das
> README leitet das ausführlich her (Abschnitt „Woher die 224 kommen — und
> wie sie zu 202 Gesellschaften werden"). Endstand: Die Landing nennt „201
> von 224 kotierten Titeln", das README nennt an der betroffenen Stelle
> weiterhin „201 der 202 ... Gesellschaften" — beide korrekt, keine der
> beiden Zahlen wurde verändert.

Die Kennzahlen stehen fest im HTML — die Landing soll nicht 320 KB laden, um
zwei Zahlen zu zeigen. Stand der Daten am 15. August 2026:

| Karte | Kennzahl | Quelle im Artefakt |
|---|---|---|
| Börsennotierte Firmen | 201 von 224 an der SIX kotierten Gesellschaften, alle recherchiert | `companies.json` → `stats.count`, `stats.totalListed`, `stats.researched` |
| Beschäftigte | 5'876'865 Beschäftigte in 26 Kantonen | `ch_kantone.json` → `stats.sum`, `count` |

Dazu kommt ein Vitest (`src/landing.test.ts`), der `index.html`,
`public/data/companies.json` und `public/data/ch_kantone.json` liest und die im
HTML genannten Zahlen gegen die Artefakte prüft. Weil `npm run build` in
`netlify.toml` steht und die Testsuite über `npm test` läuft, wandert die
Datenlage nicht unbemerkt an der Landing vorbei: der Test schlägt fehl, statt
dass die Seite still eine falsche Zahl zeigt.

Das ist kein theoretisches Risiko. Das README nennt aktuell „201 der 202 an der
SIX kotierten Gesellschaften"; die Artefaktdaten sagen `totalListed: 224`. Die
Landing übernimmt die Zahl aus den Daten, und das README wird bei der
Umbenennung an derselben Stelle korrigiert.

### Go-Live-Kleinigkeiten

Auf allen drei Seiten:

- **Favicon** als Inline-SVG-Data-URI. Heute existiert keins; jeder Aufruf
  erzeugt eine 404 in den Netlify-Logs.
- `<meta name="description">` mit je seitenspezifischem Text.
- `og:title`, `og:description`, `og:type`, `og:locale` — damit ein geteilter
  Link nicht als nackte URL erscheint.

**Nicht** in diesem Vorhaben: `og:image` (bräuchte einen Screenshot, den es noch
nicht gibt), eine eigene 404-Seite, `robots.txt`, `sitemap.xml`, und jede Form
von Analytics.

## 5 — Umbenennung

| Ebene | Änderung |
|---|---|
| Sichtbar | `index.html`-Titel; `documentTitle()` in `karte/basis.ts`; Landing-Texte; Heim-Link in `nav.ts` |
| npm | `package.json` `"name": "zeigmers"`; `package-lock.json`; Skript `build:data` → `uv run --project etl zeigmers-etl all` |
| Python | `etl/src/draufsicht_etl/` → `etl/src/zeigmers_etl/`; `etl/pyproject.toml` (`name`, Entry-Point, `packages`); alle Imports in `etl/src` und `etl/tests` — 27 Dateien, rein mechanisch |
| Kommentare | 5 Pfadverweise in `src/layers/visible.ts` und `src/domain/noga.generated.ts` |
| README | 24 Vorkommen, plus die Korrektur „202" → „224" |
| GitHub | `gh repo rename zeigmers`; Branch `master` → `main` |
| Ordner | `/Users/sevi/Claude/Draufsicht` → `/Users/sevi/Claude/zeigmers` |

Die Dokumenttitel werden:

- Landing: `zeigmers — Die Schweizer Wirtschaft als 3D-Karte`
- Firmen: `zeigmers — Börsennotierte Firmen Schweiz`
- Beschäftigte, Schweiz-Stufe: `zeigmers — Beschäftigte Schweiz`
- Beschäftigte, Kantonsstufe: `zeigmers — Beschäftigte Kanton <Name>`

Die Kantonsstufe hiess bisher „Wirtschaftskarte Kanton <Name>", was die Ansicht
nicht benannte. Da die Seite jetzt eine feste Ansicht hat, benennt der Titel sie
auch.

`docs/superpowers/specs/` und `docs/superpowers/plans/` bleiben unverändert —
das sind datierte Protokolle eines vergangenen Standes, kein lebender Text. Der
alte Name dort ist historisch korrekt.

Die Ordner-Umbenennung geschieht als **allerletzter Schritt**, nach dem
erfolgreichen Deploy: sie bricht jeden absoluten Pfad einer laufenden Sitzung.

## 6 — Verifikation und Deploy

### Vor dem Push

- `npm run build` — schliesst `tsc --noEmit` ein, muss ohne Fehler durchlaufen
- `npm test` — die bestehende Vitest-Suite plus der neue Landing-Drift-Test
- `uv run --project etl pytest` — belegt, dass die Paket-Umbenennung sauber ist
- `npx vite preview` und alle drei Seiten von Hand: Landing → beide Karten,
  Navigation zwischen den Karten, Heim-Link zurück, auf der Beschäftigten-Seite
  ein Kanton hinein und mit Escape wieder hinaus

### Deploy

```
gh repo rename zeigmers
git branch -m master main
git remote add origin https://github.com/kokosevi/zeigmers.git
git push -u origin main
npx netlify-cli login     # einmalige Bestätigung im Browser durch den Nutzer
npx netlify-cli init      # Site anlegen und mit dem Repo verknüpfen
```

`netlify-cli` läuft über `npx` und wird **nicht** als Abhängigkeit ins Repo
geschrieben — es ist ein einmaliges Einrichtungswerkzeug, keine Bauabhängigkeit.

Build-Befehl (`npm run build`), Publish-Verzeichnis (`dist`) und Node-Version
(22) zieht Netlify aus dem bestehenden `netlify.toml`; sie müssen im
Einrichtungsdialog nicht gesetzt werden. Die `[[headers]]`-Blöcke für `/data/*`
bleiben gültig, weil sich die Datenpfade nicht ändern.

Ergebnis ist eine `*.netlify.app`-Adresse. `zeigmers.ch` lässt sich später in
den Netlify-Domain-Einstellungen eintragen, ohne dass am Code etwas zu ändern
ist.

### Nach dem Deploy

Auf der veröffentlichten Adresse dieselben drei Seiten noch einmal prüfen —
insbesondere, dass `/firmen/` und `/beschaeftigte/` direkt aufrufbar sind und
nicht nur über die Landing erreicht werden, und dass die `.bin`-Dateien mit
`Content-Type: application/octet-stream` ausgeliefert werden.

Erst danach die Ordner-Umbenennung.

## Abgrenzung

Nicht Teil dieses Vorhabens:

- Die Domain `zeigmers.ch` verbinden
- `og:image`, 404-Seite, `robots.txt`, `sitemap.xml`, Analytics
- Inhaltliche Änderungen an den Karten, den Daten oder dem ETL über die
  Umbenennung hinaus
- Eine dritte Karte oder weitere Landing-Einstiege
