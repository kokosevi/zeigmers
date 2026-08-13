# Draufsicht

Eine statische 3D-Wirtschaftskarte des Kantons Aargau (196 Gemeinden,
1'404 km²): zwei Ansichten derselben Fläche, nebeneinander gehalten, damit
der Unterschied sichtbar wird.

**Ansicht A** zeigt die acht börsenkotierten Unternehmen mit Sitz im Kanton als
Säulen nach Umsatz — Zahlen, die öffentlich und geprüft sind, weil ein
kotiertes Unternehmen sie veröffentlichen muss.

**Ansicht B** zeigt dieselbe Fläche als 17'940 besetzte Hektarzellen (1 km² =
100 Zellen) nach Beschäftigten am Arbeitsort, kanton­weit 383'203 Beschäftigte.
Das ist die Arbeit, die in Aargau tatsächlich stattfindet — in Gewerbehallen,
Werkstätten, Verwaltungen, Landwirtschaftsbetrieben und Läden, deren
Umsatzzahlen nirgends veröffentlicht werden.

Der Kontrast ist die Aussage: acht sichtbare Firmen gegen zehntausende
unsichtbare Arbeitsplätze.

## Was das hier ist — und was nicht

Dies ist ein **technischer Machbarkeitsnachweis** (proof of concept), kein
fertiges Produkt und keine amtliche Statistik. Er zeigt, dass sich ein
komplettes ETL-für-eine-Karte-Projekt — Rohdaten laden, prüfen, aggregieren,
in ein kompaktes Binärformat packen, im Browser mit deck.gl/MapLibre als 3D-Karte
rendern — reproduzierbar und ohne Server-Backend bauen lässt. Die Zahlen sind
korrekt im Rahmen dessen, was die Quellen hergeben; sie sind nicht amtlich
geprüft im Sinne einer BFS-Publikation.

## Warum die Hektarsumme über der offiziellen Zahl liegt

Der Kanton Aargau meldet in Ansicht B eine Summe von **383'203** Beschäftigten
über 17'940 Hektarzellen. Die amtliche BFS-Referenz für Aargau (unabhängig aus
derselben STATENT-Lieferung berechnet, als Gemeinde-Aggregation statt aus den
Hektarzellen) liegt bei **363'288**. Die Hektarsumme liegt damit **+5.48 %**
darüber — und das ist erwartet, kein Fehler in der Pipeline.

Der Grund ist Datenschutz, nicht Ungenauigkeit: Das BFS veröffentlicht aus
Geheimhaltungsgründen jeden Zellenwert unter 4 als **4**. In den Aargauer
Hektarzellen betrifft das **10'109 von 17'940 Zellen (56.3 %)** — die
allermeisten Zellen sind also gar keine echten Vierer, sondern Zellen mit 1,
2 oder 3 Beschäftigten, aufgerundet. Rechnet man rückwärts (aus der
Differenz zwischen Hektar- und Gemeindesumme, verteilt auf diese Zellen),
ergibt sich ein impliziter wahrer Mittelwert von **1.69** Beschäftigten in
diesen Zellen — nicht 4. Jede dieser Zellen trägt also im Schnitt gut zwei
Beschäftigte zu viel bei, und über zehntausend solcher Zellen läppert sich das
zu der beobachteten Überschätzung.

Diese Überschätzung ist nach oben durch die Zahl der betroffenen Zellen
begrenzt und wird deshalb nicht als feste Toleranz (z. B. „±5 %“) geprüft,
sondern als **Plausibilitätsfenster** aus zwei bekannten, gegenläufigen
Verzerrungen:

```
Referenz − NOLOC  ≤  Hektarsumme  ≤  Referenz + 3 × Zellen mit Wert 4
359'899           ≤  383'203      ≤  393'615
```

Die untere Grenze zieht ab, was gar nicht auf einer Hektarzelle sitzen kann:
Datensätze in `STATENT_NOLOC_2023.csv` haben laut BFS keine belastbare
Hektarlage und werden bewusst **ausgeschlossen**, statt einer erfundenen
Koordinate zugewiesen zu werden — für Aargau sind das rund 3'389
Beschäftigte (schweizweit betrifft dieselbe Ausschlussregel 56'073
Beschäftigte, 0.99 % aller Erwerbstätigen). Die obere Grenze addiert den
denkbar grössten Effekt der Aufrundung (jede der Zellen mit Wert 4 könnte in
Wirklichkeit nur 1 sein, also höchstens 3 zu viel zählen; für Aargau macht das
3 × 10'109 = 30'327). Der ETL-Lauf (`draufsicht-etl statent`/`all`) bricht mit
einem harten Fehler ab, falls die Summe dieses Fenster verlässt — das wäre
dann tatsächlich ein Verschnitt- oder Spaltenfehler, keine Rundung.

## Was „revenue“ über die acht Unternehmen hinweg bedeutet

Ansicht A zeigt eine Säule pro Unternehmen, alle nach derselben Zahl `revenue`
skaliert. Diese Zahl ist **nicht überall dasselbe**. Die Spalte `revenue_type`
in `data/manual/ag_listed_companies.csv` hält den gröbsten Unterschied fest —
Netto-Umsatz gegen die Näherung einer Bank; die feineren Fälle stehen im
freien `note`-Feld derselben Zeile:

- Sieben der acht Unternehmen weisen `revenue_type = net_sales` aus — den
  branchenüblichen Netto-Umsatz aus dem Geschäftsbericht.
- Die Hypothekarbank Lenzburg weist `revenue_type = operating_income` aus:
  Banken kennen keinen „Umsatz“ im klassischen Sinn; als Näherung dient der
  konsolidierte Geschäftsertrag.
- Bei DSM-Firmenich steht `revenue_type = net_sales`, aber der ausgewiesene
  Umsatz (EUR 9034 Mio., FY2025) ist die „Net sales“ der **fortgeführten
  Geschäfte** — die zur Veräusserung klassierte Tierernährungssparte Animal
  Nutrition & Health ist zur Vergleichbarkeit herausgerechnet. Diese Nuance
  steht nur im `note`-Feld der Zeile, nicht in `revenue_type`. Inklusive
  dieser Sparte hätte der Konzernumsatz EUR 12'521 Mio. betragen.

Wer die acht Säulen unkommentiert nebeneinander liest, vergleicht also nicht
durchgehend Gleiches mit Gleichem. Die App markiert `operating_income`-Balken
optisch anders — ein sichtbarer Rand statt keinem, siehe `getLineColor`/
`getLineWidth` in `src/layers/visible.ts` — und zeigt bei Auswahl den
jeweiligen `note`-Text aus dem CSV (`src/ui/panel.ts`); jede einzelne Zahl trägt ausserdem eine
`report_url` zur Primärquelle. `companies.validate()` (`etl/src/draufsicht_etl/
companies.py`) erzwingt das: jede Zeile mit einem `revenue`-Wert braucht
`report_url`, `fiscal_year`, `revenue_currency`, `revenue_type` **und**
`revenue_unit`, sonst bricht der Build ab.

Eine weitere, unabhängige Uneinheitlichkeit: Die acht Firmen weisen ihren
Umsatz in **drei verschiedenen Währungen** aus (CHF, EUR, USD — Spalte
`revenue_currency`). Die Balkenhöhen in Ansicht A vergleichen diese Zahlen
unverändert, **ohne Umrechnung in eine gemeinsame Währung** — eine
Umrechnung würde aus einer gemeldeten Zahl eine abgeleitete machen, und genau
das will dieses Projekt bei Ansicht A explizit nicht (derselbe Grundsatz, der
oben bei DSM-Firmenich schon die fortgeführten Geschäfte statt einer
umgerechneten Kennzahl gewählt hat). Die App legt das offen statt es zu
verschweigen: der Pflichthinweis und die Legende in Ansicht A nennen den
Währungsmix ausdrücklich (`src/ui/notices.ts`, `src/ui/legend.ts`).

## Datenschutzhinweis

Die Hektarsummen in Ansicht B sind **Obergrenzen, keine exakten Zahlen** — die
Aufrundung „unter 4 → 4“ zieht sie systematisch nach oben (siehe oben). Auf
Gemeinde- und Kantonsebene ist die Abweichung entsprechend kleiner, aber nie
exakt null; jede Summe in dieser App ist mit dieser Unschärfe zu lesen, nicht
als amtlich verbindliche Zahl.

## Datenherkunft

| Datensatz | Quelle | Rolle |
|---|---|---|
| STATENT (Hektarraster Beschäftigte) 2023 | Bundesamt für Statistik (BFS) | Ansicht B, Gemeinde-/Kantonsaggregation |
| swissBOUNDARIES3D, Vintage 2026-01 | swisstopo | Kantons- und Gemeindegrenzen |
| Basiskarte (Vektor-Tiles) | swisstopo (`vectortiles.geo.admin.ch`) | Hintergrundkarte in MapLibre |
| Firmen-Stammdaten (LINDAS/Zefix, Geokodierung) | LINDAS SPARQL-Endpunkt, swisstopo SearchServer | Kandidatensuche und Adress→Koordinate für Ansicht A |
| Umsatz, Mitarbeitende, Geschäftsjahr je Firma | Geschäftsberichte der acht Unternehmen selbst | Ansicht A (siehe `report_url` je Zeile) |

Abgerufen: 13. August 2026 (Datum der zuletzt committeten Artefakte in
`public/data/`; ein erneuter `npm run build:data`-Lauf lädt jeweils die
aktuellste Version nach).

**Lizenzhinweis:** STATENT ist auf opendata.swiss unter den Nutzungsbedingungen
„Freie Nutzung, Quellenangabe Pflicht“ eingetragen. swisstopo-Geodaten
(swissBOUNDARIES3D, Basiskarte) stehen laut den offiziellen
[Nutzungsbedingungen für kostenlose Geodaten und Geodienste](https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste)
zur freien Verwendung, ebenfalls mit Quellenangabepflicht. Diese Quellenangabe
steht deshalb wörtlich und permanent sichtbar im Footer der Karte
(`src/ui/legend.ts`), unabhängig von jeder Nutzerinteraktion:

```
Quelle: Bundesamt für Statistik (BFS), Statistik der Unternehmensstruktur (STATENT) 2023 · Gemeindegrenzen: swisstopo, swissBOUNDARIES3D · Basiskarte: swisstopo
```

Massgeblich sind stets die aktuellen Nutzungsbedingungen der jeweiligen Quelle;
wer diese Daten weiterverwendet, sollte sie dort selbst prüfen.

## Warum das ETL nicht auf Netlify läuft

Die Build-Pipeline (`npm run build:data`, Python/`uv`) läuft **nicht** als
Teil des Netlify-Deploys. Stattdessen sind die fertigen Artefakte in
`public/data/` committet und werden von `npm run build` (reines
`tsc --noEmit && vite build`) nur noch gebündelt. Grund: Ein ETL-Lauf lädt das
swissBOUNDARIES3D-GeoPackage (37.4 MB gepackt, laut `data/raw/manifest.json`)
und den STATENT-Datensatz neu herunter und braucht dafür eine vollständige
Python-Toolchain (`uv`) — beides durch das Netlify-Build-Image zu schleusen,
bei **jedem** Deploy, wäre langsam, unnötig und ein Netzwerk-Abhängigkeitsrisiko
für einen Deploy, der an den bereits committeten, byte-reproduzierbaren
Artefakten nichts ändert. Das ETL läuft lokal, die
Artefakte werden geprüft und dann committet.

## Aktualisierung auf ein neues Datenjahr

1. In `etl/src/draufsicht_etl/config.py` `STATENT_YEAR` ändern (z. B. `2024`).
2. `npm run build:data` laufen lassen.
3. Neue Artefakte in `public/data/` committen.

Die Spaltenauflösung passt sich dabei selbst an: STATENT-Spaltennamen tragen
ein Jahrgangs-Präfix, das mit der NOGA-Nomenklaturversion wechselt, **nicht**
mit dem Datenjahr — die Spalten heissen `B08EMPT` (NOGA 2008), nicht `B24EMPT`,
selbst für 2024er-Daten. `etl/src/draufsicht_etl/columns.py` löst die Spalten
deshalb per Regex-Muster (`COLUMN_PATTERNS` in `config.py`) statt über einen
festen Namen auf; ein hartcodiertes `B24` hätte beim ersten neuen Jahrgang mit
unverändertem Präfix stillschweigend danebengegriffen. Das Ergebnis der
Auflösung wird nach `etl/columns/statent_<jahr>.json` geschrieben und bei
jedem Lauf neu erzeugt.

## Kantonswechsel

Ein Kantonswechsel ist als Dreischritt gedacht:

1. `CANTON` in `etl/src/draufsicht_etl/config.py` auf den neuen Kanton setzen
   (`code`, `bfs_nr`, `name`).
2. Die Firmen-CSV unter dem daraus abgeleiteten Namen anlegen:
   `data/manual/<code>_listed_companies.csv` (kleingeschrieben, z. B.
   `data/manual/zh_listed_companies.csv` für `code = "ZH"`) —
   `companies.csv_path()` löst diesen Pfad automatisch aus `CANTON["code"]`
   auf, keine weitere Änderung am Code nötig. Spalten wie in
   `data/manual/ag_listed_companies.csv`, ein Unternehmen pro Zeile, jede
   `revenue`-Zeile mit `report_url`, `fiscal_year`, `revenue_currency` und
   `revenue_type` belegt (`companies.validate()` erzwingt das beim Build).
   `companies.candidates_from_lindas(canton_code)` kann beim Auffinden von
   Firmenkandidaten mit Sitz im neuen Kanton helfen; welche davon
   SIX-kotiert sind und welche Kennzahlen sie ausweisen, bleibt Recherche in
   den jeweiligen Geschäftsberichten. Fehlt die Datei für den konfigurierten
   Kanton, bricht `npm run build:data` mit einer klaren deutschen
   Fehlermeldung ab, die den erwarteten Pfad nennt, statt mit einem rohen
   `FileNotFoundError`.
3. `npm run build:data` laufen lassen. Das Frontend liest den Kantons-Code
   und -Namen selbst aus `public/data/meta.json` (`src/main.ts`, per
   `loadMeta()`) — die Artefakt-Dateinamen (`<code>_kanton.*` usw.), der
   Fenstertitel und der Titel des Kantonspanels folgen also ohne weitere
   Codeänderung.

Gemeindegrenzen, Hektarraster, BFS-Referenzsumme, das Plausibilitätsfenster,
der Pfad der Firmen-CSV und alle Artefaktnamen leiten sich automatisch aus
`CANTON` und der Geometrie her. Zwei Stellen bleiben trotzdem **Handarbeit im
Code**, weil sie auf die räumliche Ausdehnung des jeweiligen Kantons
zugeschnitten sind und sich nicht aus `CANTON` allein ableiten lassen:

- **`INITIAL_VIEW` in `src/map.ts`** — Kartenzentrum, Startzoom, Neigung und
  Blickrichtung sind von Hand auf den Kanton Aargau justiert. Ein deutlich
  grösserer, kleinerer oder anders geformter Kanton braucht andere Werte,
  sonst zeigt die Karte beim Start ins Leere oder nur einen Ausschnitt.
- **`BAND_CENTERS` in `src/domain/lod.ts`** — die Zoomstufen, bei denen
  zwischen Kanton-, Gemeinde- und Hektaransicht überblendet wird, sind auf die
  Fläche des Kantons Aargau (1'404 km²) abgestimmt. Ein Kanton anderer Grösse
  sollte diese Zentren neu justieren, sonst wechselt die Detailstufe zu früh
  oder zu spät zur tatsächlichen Kartengrösse.

Zusammen mit dem Inhalt der Firmen-CSV (siehe Schritt 2 oben — welche
Unternehmen im neuen Kanton kotiert sind, lässt sich nicht automatisiert
recherchieren) sind das die einzigen drei Schritte, die ein Kantonswechsel
nicht automatisiert.

## Befehlsübersicht

| Befehl | Wirkung |
|---|---|
| `npm run build:data` | Vollständiger ETL-Lauf (`draufsicht-etl all`): Grenzen, Hektarraster, Firmen — schreibt `public/data/` |
| `npm run build` | Typprüfung + Produktions-Build (`dist/`) |
| `npm run dev` | Lokaler Entwicklungsserver mit Hot Reload |
| `npm test` | Frontend-Tests (Vitest) |
| `uv run --project etl pytest etl/tests` | ETL-Tests (Python) |

`npm run build:data` lädt beim ersten Lauf swissBOUNDARIES3D (37.4 MB gepackt)
sowie den STATENT-Datensatz (13.6 MB gepackt) herunter und dauert entsprechend
einige Minuten;
`data/manual/` (die Firmen-CSV) wird dabei nie gelöscht oder überschrieben,
ausser durch Nachgeokodierung fehlender Koordinaten in genau dieser Datei.
