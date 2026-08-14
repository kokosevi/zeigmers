# Draufsicht

Eine statische 3D-Wirtschaftskarte des Kantons Aargau (196 Gemeinden,
1'404 km²): zwei Ansichten derselben Fläche, nebeneinander gehalten, damit
der Unterschied sichtbar wird.

**Ansicht A** zeigt die acht börsenkotierten Unternehmen mit Sitz im Kanton als
Säulen nach Umsatz — Zahlen, die öffentlich und geprüft sind, weil ein
kotiertes Unternehmen sie veröffentlichen muss.

**Ansicht B** zeigt dieselbe Fläche als 196 extrudierte Gemeindeflächen nach
Beschäftigten am Arbeitsort, kanton­weit 383'203 Beschäftigte — seit dem
13. August 2026 in der tatsächlichen Form jeder Gemeinde, nicht mehr als
Säule an einem Referenzpunkt (siehe unten, «Warum Ansicht B jetzt
Gemeindeflächen zeigt»). Das ist die Arbeit, die in
Aargau tatsächlich stattfindet — in Gewerbehallen, Werkstätten, Verwaltungen,
Landwirtschaftsbetrieben und Läden, deren Umsatzzahlen nirgends veröffentlicht
werden. Ein früherer Zwischenstand löste das bis auf 17'940 einzelne
Hektarzellen auf; diese Stufe wurde am 13. August 2026 wieder verworfen (siehe
unten, «Warum die Gemeindesumme über der offiziellen Zahl liegt») — jede
Gemeindesumme ist aber weiterhin exakt die Summe dieser Zellen, samt der
Verzerrung, die das BFS ihnen aus Datenschutzgründen aufzwingt.

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

## Warum die Gemeindesumme über der offiziellen Zahl liegt

Ansicht B zeigt 196 extrudierte Gemeindeflächen; ihre Summe ergibt **383'203**
Beschäftigte.
Das ETL aggregiert diese Summe intern weiterhin aus 17'940 Hektarzellen — diese
Stufe existierte bis zum 13. August 2026 als eigene, gezeichnete Detailstufe
der Karte und wurde dann auf Entscheid verworfen (Begründung im nächsten
Abschnitt); an der Rechnung dahinter ändert das nichts. Die amtliche
BFS-Referenz für Aargau (unabhängig aus derselben STATENT-Lieferung berechnet,
als Gemeinde-Aggregation statt aus den Hektarzellen) liegt bei **363'288**. Die
aus Hektaren gerechnete Summe liegt damit **+5.48 %** darüber — und das ist
erwartet, kein Fehler in der Pipeline.

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

## Warum die Hektar- und die Kantonsstufe entfernt wurden

Bis zum 13. August 2026 zeigte Ansicht B drei überblendete Detailstufen: einen
einzelnen Kantonsbalken unterhalb Zoom 9, 196 Gemeindebalken zwischen Zoom 9
und 12, und 17'940 Hektarbalken oberhalb Zoom 12. Auf Entscheid zeigt Ansicht B
seither nur noch die Gemeindestufe, bei jedem Zoom. Zwei Gründe:

- Mit der Gemeindestufe permanent sichtbar bringt ein einzelner
  12'000-m-Kantonsturm unterhalb Zoom 9 keine zusätzliche Information mehr —
  er verschwindet.
- Die Hektarstufe zeichnete pro Zelle den vom BFS publizierten, aufgerundeten
  Wert (Abschnitt oben), **gesondert als solchen markiert**. Diese Markierung
  verschwand zusammen mit den Zellen; was blieb, war die Aufrundung selbst —
  und die wirkt jetzt ausschliesslich auf die einzig noch sichtbare Zahl, die
  Gemeindesumme.

Gemessen an den 196 committeten Gemeindesummen (`public/data/ag_gemeinde.json`,
je `3 × ambiguousCells / value`): die Überschätzung liegt im **Median bei
15.7 %**, im Maximum bei **54.1 %** (Obermumpf), und **76 der 196 Gemeinden**
liegen über 20 %. Das ist keine Rand­erscheinung, sondern die Regel bei
kleinen Gemeinden — deshalb benennt der Pflichthinweis in Ansicht B seit
diesem Entscheid die Grössenordnung direkt in der Karte statt nur ein
theoretisches Maximum, und das Klick-Panel zeigt zu jeder Gemeinde ihren
eigenen, ungerundeten Betrag (`src/ui/panel.ts`, `aggregateCellContent`).

`etl/src/draufsicht_etl/aggregate.py` und `binpack.py` berechnen die
Hektarstufe weiterhin vollständig — die Gemeindeaggregation und die
Mehrdeutigkeits-Zählung je Gemeinde hängen direkt daran (Abschnitt 6.5 der
Spezifikation). Nur der Schreibaufruf für `ag_hektar.*` und `ag_kanton.*` in
`cli.py` entfällt; die beiden Artefakte werden dadurch nicht mehr erzeugt.

## «Die Vielen» heisst jetzt «Beschäftigte»

Ansicht B hiess bis zum 13. August 2026 «Die Vielen». Der Name ist auf
«Beschäftigte» geändert — passend zu Ansicht A, deren Name «Die Sichtbaren»
unverändert bleibt, und zur Einheit, die die Legende ohnehin schon zeigte
(`UNIT_LABEL` in `src/ui/legend.ts`). Der interne Schlüssel wurde mit
umbenannt, `'viele'` → `'beschaeftigte'` (`src/ui/toggle.ts` und alle
Verwendungsstellen) — ein Anzeigename, der nicht mehr zu seinem internen
Schlüssel passt, ist genau die Art Drift, die die nächste Leserin in die Irre
führt.

## Warum Ansicht B jetzt Gemeindeflächen zeigt, keine Säulen an einem Punkt

Bis zum 13. August 2026 zeichnete Ansicht B jede Gemeinde als `ColumnLayer`-
Säule an einem einzelnen Referenzpunkt (Radius fix 700 m, `GEMEINDE_RADIUS_M`)
— eine Vereinfachung, die für 196 gleich grosse Kreise praktisch war, aber die
tatsächliche Form und Grösse jeder Gemeinde verschenkte. Seither zeichnet
`src/layers/many.ts` jede Gemeinde als **eigenes, extrudiertes Polygon**
(`GeoJsonLayer`, `extruded: true`), aus `public/data/ag_boundaries.geojson`
gejoint gegen `ag_gemeinde.{bin,json}` per `bfs_nr` (`src/data/boundaries.ts`,
`joinMunicipalityGeometry`). Höhenkodierung unverändert: logarithmisch,
`vmax` = Gemeindemaximum 36'677 (Aarau).

**Eine Verzerrung, die das mit sich bringt, offengelegt statt verschwiegen.**
Das Auge liest Volumen, und Volumen ist Grundfläche mal Höhe. Aargauer
Gemeindeflächen streuen um den Faktor 23 (kleinste bis grösste Gemeinde) —
das verzerrt den Grössenvergleich zwischen grossen, dünn besiedelten und
kleinen, dicht besiedelten Gemeinden:

- **Zurzach:** 26.0 km², 4'335 Beschäftigte, 9'562 m Höhe → visuelles Volumen
  ≈ 248'476 (willkürliche Einheit, Fläche × Höhe).
- **Aarau:** 12.3 km², **36'677 Beschäftigte** (die höchste Zahl im Datensatz),
  12'000 m Höhe → visuelles Volumen ≈ 148'058 — **kleiner** als Zurzach, obwohl
  Aarau 8.5× so viele Beschäftigte hat.
- **Ennetbaden** (908 Beschäftigte, 2.1 km²) und **Böztal** (909 Beschäftigte,
  22.3 km²) haben praktisch dieselbe Beschäftigtenzahl; Böztal wirkt trotzdem
  rund **10.6×** grösser.

Diese Verzerrung liesse sich nur vermeiden, indem man die Gemeindegeometrie
selbst verzerrt (ein Kartogramm, gleich grosse Flächen unabhängig von der
wahren Fläche) — das wurde bewusst **nicht** gewählt, weil es eine echte
Fläche durch eine erfundene ersetzen würde, und genau solche Erfindungen sind,
was dieses Projekt an anderer Stelle (Hektarpositionen, NOLOC-Datensätze,
Umsatzwährungen) konsequent vermeidet. Stattdessen benennt der Pflichthinweis
in Ansicht B die Verzerrung direkt: „Die Höhe zeigt die Beschäftigten, die
Grundfläche die Gemeindefläche — grosse Gemeinden wirken dadurch gewichtiger,
als sie sind." (`src/ui/notices.ts`).

**Vereinfachungsgrad der Geometrie.** `ag_boundaries.geojson` wird wie zuvor
mit mapshaper vereinfacht (Visvalingam), aber mit gelockerter Toleranz: die
ursprüngliche Zieltoleranz (8 %, ≈ 38 Stützpunkte je Gemeinde im Schnitt,
160 KB) war für eine flache 2D-Karte gewählt und reichte dafür. Extrudierte
Seitenwände zeigen grobe Vereinfachung dagegen als sichtbare Facetten. Die
Toleranz ist deshalb auf **30 %** angehoben (`MUNICIPALITY_SIMPLIFY_PERCENT`
in `etl/src/draufsicht_etl/config.py`), was **124 Stützpunkte je Gemeinde**
im Schnitt ergibt (24'363 insgesamt, gegenüber 7'425 vorher — 3.3×) bei
**469 KB** (gegenüber 160 KB vorher). Beides bleibt weit unter dem
2-MB-Gesamtbudget für `public/data/`, das genug Spielraum liess, um hier
grosszügiger zu sein, statt am Minimum zu bleiben.

## Warum die Karte keine externe Basiskarte mehr lädt

Bis zum 13. August 2026 lud die Karte zur Laufzeit die swisstopo-Vektorkacheln
(`vectortiles.geo.admin.ch`, Stil `ch.swisstopo.lightbasemap.vt`) — 66 Layer,
davon 19 Beschriftungen (Gemeinde-, Strassennamen) und 30 Linien (Strassen,
Bahnlinien, …). Die Anforderung an die Basiskarte ist eine deutlich
reduzierte Karte: keine Gemeindenamen, keine Strassen, nur die Schweiz, mit
markierten Kantonsgrenzen. Das liess sich aus dem swisstopo-Stil nicht durch
Ausblenden erreichen (die meisten der 66 Layer wären ohnehin unerwünscht
gewesen), und einen Kantonsgrenzen-Layer führte er nicht einmal.

Die Karte zeichnet die Basiskarte seither **selbst**:

- **ETL:** `boundaries.build_cantons()` liest `tlm_kantonsgebiet` (alle 26
  Kantone) aus demselben, bereits heruntergeladenen swissBOUNDARIES3D-
  GeoPackage, das auch die Gemeindegrenzen liefert — dissolved je Kanton,
  nach WGS84 reprojiziert, mit mapshaper vereinfacht (7 % Toleranz,
  `CANTON_SIMPLIFY_PERCENT`, da Kantone flach bleiben und eine gröbere
  Vereinfachung dort nicht als Facette auffällt). Ergebnis:
  `public/data/ch_kantone.geojson`, **262 KB**, 26 Features, 14'104
  Stützpunkte. Anders als `ag_boundaries.geojson` hängt der Dateiname nicht
  vom konfigurierten Kanton ab (`cantons_geojson_path()`) — die Basiskarte
  zeigt immer alle 26 Kantone.
- **Frontend:** MapLibre bleibt für Pan/Rotate/Zoom zuständig, aber mit einem
  minimalen Stil ohne externe Quellen — nur eine einfarbige Hintergrundfarbe
  (`BLANK_STYLE` in `src/map.ts`). Die Kantonsflächen zeichnet
  `src/layers/cantons.ts` als eigenen deck.gl-Layer aus `ch_kantone.geojson`:
  heller Flächenfüll, dünne Konturen, der konfigurierte Kanton (aus
  `meta.json`, nicht hartcodiert) sichtbar hervorgehoben.

Damit lädt die Karte zur Laufzeit keine externe Ressource mehr — das in der
Spezifikation (Abschnitt 10) genannte Ausfallrisiko „swisstopo-Vektorkacheln
fallen aus" entfällt ersatzlos, es gibt schlicht keinen Laufzeit-Request mehr,
der ausfallen könnte. Die zugrundeliegenden Daten (swissBOUNDARIES3D) bleiben
weiterhin swisstopo-Daten — nur werden sie beim ETL-Lauf einmalig geladen und
als eigenes Artefakt ausgeliefert, statt bei jedem Kartenaufruf erneut von
einem fremden Dienst.

`MapboxOverlay`s `interleaved: true` funktioniert mit diesem leeren Stil
unverändert: MapLibre erzeugt seinen WebGL-Kontext unabhängig vom Stilinhalt,
und `interleaved` braucht nur genau diesen Kontext, keine bestimmten Quellen
oder Layer. Das ist nicht im Browser nachgeprüft (dieser Umsetzungsschritt
hatte keinen Browser zur Verfügung) — siehe Abschnitt „Was ein Mensch noch
prüfen sollte" weiter unten.

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

Die Gemeindesummen in Ansicht B sind **Obergrenzen, keine exakten Zahlen** —
die Aufrundung „unter 4 → 4“ zieht sie systematisch nach oben (siehe oben):
im Median um 15.7 %, bei kleinen Gemeinden bis 54.1 %. Jede Summe in dieser
App ist mit dieser Unschärfe zu lesen, nicht als amtlich verbindliche Zahl.

## Datenherkunft

| Datensatz | Quelle | Rolle |
|---|---|---|
| STATENT (Hektarraster Beschäftigte) 2023 | Bundesamt für Statistik (BFS) | Ansicht B (Gemeindestufe, intern über das Hektarraster aggregiert) |
| swissBOUNDARIES3D, Vintage 2026-01 | swisstopo | Kantons- und Gemeindegrenzen, Gemeindeflächen in Ansicht B, Basiskarte |
| Basiskarte (`ch_kantone.geojson`, selbst gezeichnet) | swisstopo (aus swissBOUNDARIES3D, `tlm_kantonsgebiet`) | Kantonsflächen als deck.gl-Layer, `src/layers/cantons.ts` — seit dem 13. August 2026 keine externen Vektorkacheln mehr, siehe „Warum die Karte keine externe Basiskarte mehr lädt" |
| Firmen-Stammdaten (LINDAS/Zefix, Geokodierung) | LINDAS SPARQL-Endpunkt, swisstopo SearchServer | Kandidatensuche und Adress→Koordinate für Ansicht A |
| Umsatz, Mitarbeitende, Geschäftsjahr je Firma | Geschäftsberichte der acht Unternehmen selbst | Ansicht A (siehe `report_url` je Zeile) |

Abgerufen: 13. August 2026 (Datum, an dem die zugrundeliegenden Rohdaten
zuletzt heruntergeladen wurden, siehe `data/raw/manifest.json`); die
committeten Artefakte in `public/data/` wurden am 14. August 2026 aus
denselben Rohdaten neu erzeugt (Phase 1: Ausweitung auf alle 26 Kantone,
siehe „Phase 1: das ETL deckt jetzt die ganze Schweiz ab" oben). Ein
erneuter `npm run build:data`-Lauf lädt jeweils die aktuellste Version der
Rohdaten nach.

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

## Phase 1: das ETL deckt jetzt die ganze Schweiz ab

Seit dem 14. August 2026 baut `npm run build:data` nicht mehr nur Aargau,
sondern **alle 26 Kantone und alle Gemeinden** — dies ist reine Datenarbeit
(„Phase 1" einer grösseren Ausweitung); die Karte selbst (`src/`) zeigt
weiterhin ausschliesslich Aargau, unverändert (siehe unten, „Rückwärts-
kompatibilität fürs Frontend"). Die folgenden Abschnitte dokumentieren, was
sich am ETL geändert hat.

**Woher die Daten kommen, hat sich nicht geändert.** STATENT war schon immer
gesamtschweizerisch (224'788 Hektarzellen), swissBOUNDARIES3D enthielt schon
immer alle Gemeinde- und Kantonsgrenzen — das Ein-Kanton-ETL hat diese Daten
nur bisher auf Aargau herunter­gefiltert. `boundaries.build_all()` liest das
Gemeinde-Layer jetzt einmal komplett und liefert ein Dictionary
`{Kantons-BFS-Nummer: Boundaries}`; `cli.py` läuft in einer Schleife über
alle 26 Einträge, statt einmalig über den in `CANTON` konfigurierten.

**2'110 Gemeinden, nicht 2'123.** Eine erste Abschätzung ging von 2'123
Gemeinden aus. Die tatsächliche Zahl ist **2'110**: `tlm_hoheitsgebiet`
(swissBOUNDARIES3D) führt neben den echten Gemeinden (Objektart
`Gemeindegebiet`) auch 11 Seeflächen ohne eigene Gemeinde (Objektart
`Kantonsgebiet` — Greifensee, Zürichsee, Thuner-/Brienzersee, Bieler-/
Neuenburgersee je Kanton, Bodensee je Kanton) und 2 geteilte Tessiner Gebiete
ohne eigene Zuordnung (Objektart `Kommunanz`). Ungefiltert zählen diese 13
Zeilen wie zusätzliche „Gemeinden" — `boundaries._load_municipalities_raw()`
filtert seither auf `objektart == "Gemeindegebiet"`. Für Aargau ändert das
nichts (alle 196 Zeilen sind bereits `Gemeindegebiet`, siehe unten), für
andere Kantone aber schon: siehe nächster Abschnitt.

**`canton_reference()`s Nummernbereich: fünf Kantone waren betroffen, nicht
geprüft wäre das nie aufgefallen.** Die Aufgabenstellung verwies auf einen
historischen Fehler, bei dem eine ältere Formel „die Hälfte von Thurgau nach
Aargau zog" — behoben durch den heutigen `min`/`max`-Ansatz über die
tatsächliche Gemeindegeometrie. Bei der Ausweitung auf alle 26 Kantone kam
ein **neuer, verwandter Fehler** zum Vorschein: Ohne den `Gemeindegebiet`-
Filter (siehe oben) tragen die Seeflächen sehr hohe `bfs_nummer`-Werte
(9000er-Block, z. B. Zürichsee = 9051). Für jeden Kanton mit einer solchen
Seefläche — **ZH, BE, SG, TG, NE** (Thurgau also tatsächlich wieder, diesmal
aus einem anderen Grund) — sprengt das den aus `min`/`max` abgeleiteten
Nummernbereich bis in den 9000er-Block und erfasst dabei praktisch jede
`STATENT_GMDE`-Zeile jedes anderen Kantons mit. Der `Gemeindegebiet`-Filter
behebt das: `etl/tests/test_boundaries.py::
test_build_all_covers_all_26_cantons_with_no_foreign_municipality_numbers`
prüft es seither automatisiert gegen die echten Daten — für alle 26 Kantone
liegt kein fremder Gemeinde-Code mehr im abgeleiteten Bereich.

**Artefakte je Kanton, plus eine nationale Übersicht.** Statt eines einzigen
`ag_*`-Tripels schreibt das ETL jetzt für jeden der 26 Kantone
`<code>_gemeinde.{bin,json}` und `<code>_boundaries.geojson` (identisches
Format, das die Karte bereits kennt), sowie einmalig `ch_kantone.{bin,json}`
— eine nationale Übersichtsstufe mit einer Zeile je Kanton und denselben
Feldern wie eine Gemeindezeile (Beschäftigte, dominante Branchengruppe, volle
Verteilung, `ambiguousCells`, `einwohnerzahl`). `ch_kantone.geojson` (die
Kantonsflächen für die Basiskarte) gab es schon vorher und bleibt unverändert.
Diese Artefakte werden in Phase 1 nur **erzeugt**, nicht **verwendet** — das
Frontend liest sie nicht (siehe „Rückwärtskompatibilität fürs Frontend"
unten); sie sind die Datengrundlage für eine spätere Kantons-Übersicht.

**`meta.json` ist jetzt ein Index über alle 26 Kantone.** Ein neues Feld
`cantons` listet zu jedem Kanton `code`, `bfsNr`, `name`, `gemeindeCount` und
`employment` — genug, damit ein künftiges Frontend die Übersicht aufbauen und
die passenden `<code>_*`-Dateien anfragen kann, ohne Dateinamen zu raten. Die
bisherigen Felder `canton`, `year`, `levels` bleiben unverändert bestehen
(siehe „Rückwärtskompatibilität" unten); das nicht mehr benötigte Feld
`counts` (nur die Gemeindezahl des konfigurierten Kantons) entfällt zugunsten
von `cantons[].gemeindeCount`.

**Zwei Grössenbudgets statt eines Gesamtbudgets.** Ein einziges
Gesamtbudget über `public/data/` (bisher 2 MB) ist mit 26 Kantonen das
falsche Mass: die Karte lädt nie mehr als zwei Pakete gleichzeitig — die
nationale Übersicht beim Start, danach je ein einzelnes Kanton-Paar. Neu
gelten deshalb zwei Budgets (`config.py`, `MAX_STARTUP_BYTES`/
`MAX_CANTON_PAYLOAD_BYTES`), beide von `draufsicht-etl all` geprüft und
gemeldet:

| Budget | Inhalt | Budget | Gemessen |
|---|---|---:|---:|
| Start-Payload | `meta.json` + `ch_kantone.{bin,json,geojson}` + `companies.json` | 800 KB | 282 KB |
| Grösstes Kanton-Paket | `<code>_gemeinde.{bin,json}` + `<code>_boundaries.geojson` | 2'048 KB | 1'486 KB (Bern) |

Bern (334 Gemeinden nach dem `Gemeindegebiet`-Filter, der grösste Kanton) ist
der gemessene Extremfall. Seine Gemeindegrenzen brauchen bei der für Aargau
kalibrierten 900-KB-Toleranzstufe von `write_geojson()` mehr Anläufe, um zu
passen, als das ursprüngliche Budget erlaubt — `cli.py` versucht deshalb
zuerst mit dem alten, Aargau-kalibrierten Budget (identisches Verhalten,
damit Aargau unverändert bleibt) und erst danach, falls das nicht reicht, mit
dem grösseren `MAX_MUNICIPALITY_BOUNDARIES_BYTES_PER_CANTON` (1.7 MB). Für
Bern greift dieser zweite Versuch; seine Gemeindegrenzen sind dadurch sichtbar
gröber vereinfacht als Aargaus (7.5 % Toleranz statt 30 %) — eine offengelegte,
keine verschwiegene Qualitätseinbusse, siehe `config.py`.

**Aargau bleibt byte-identisch.** `ag_gemeinde.bin`, `ag_gemeinde.json` und
`ag_boundaries.geojson` sind nach der Ausweitung exakt dieselben Bytes wie
vor dieser Änderung — geprüft per SHA-256 gegen den committeten Stand
(`etl/tests/test_pipeline.py::
test_aargau_artifacts_are_byte_identical_to_the_committed_baseline`) und per
direktem Geometrie-Vergleich zwischen `boundaries.build()` und
`boundaries.build_all()` (`etl/tests/test_boundaries.py::
test_build_all_matches_build_for_aargau`).

**Das Plausibilitätsfenster hält für 24 von 26 Kantonen hart — für zwei
schlägt es an, ohne den Lauf abzubrechen.** Bis Phase 1 brach ein
Fensterverstoss den gesamten ETL-Lauf ab (sinnvoll bei einem einzigen
Kanton). National würde das bedeuten: ein einziger auffälliger Kanton
verhindert, dass die anderen 25 überhaupt Artefakte bekommen. Der Guard
prüft deshalb weiterhin **jeden** Kanton gegen seine eigene BFS-Referenz und
seinen eigenen NOLOC-Anteil, meldet einen Verstoss aber als **Warnung**
(`[statent] WARNUNG [<code>] ...`, gesammelt und am Ende noch einmal
aufgelistet) statt mit einem harten Abbruch. Die beiden anderen Guards
(Σ Hektar = Σ Gemeinde = Kanton; kleinster Hektarwert = 4) bleiben hart —
dafür gibt es keine legitime Ausnahme, ein Verstoss dort ist immer ein Bug.

Zwei Kantone verletzen das Fenster tatsächlich:

- **Basel-Stadt** (196'257 Beschäftigte, Referenz 199'745, **-1.75 %**,
  unterhalb der unteren Grenze 199'245): BS ist mit 37 km² der kleinste
  Kanton und vollständig von einem einzigen Nachbarn (Basel-Landschaft)
  umschlossen. Rund 10'400 Beschäftigte liegen in einem 300-m-Ring um BS,
  praktisch vollständig in BL — das feste 100-m-STATENT-Hektarraster
  ordnet einen Teil der administrativ BS zugerechneten Beschäftigten
  geometrisch knapp jenseits der Kantonsgrenze zu. Ein realer Grenzeffekt,
  kein Pipeline-Fehler.
- **Jura** (56'370 Beschäftigte, Referenz 48'533, **+16.15 %**, oberhalb der
  oberen Grenze 54'911): weniger eindeutig geklärt. Ein 300-m-Grenzring
  zu Bern enthält nur ~245 Beschäftigte — Grenzeffekt scheidet als
  Haupterklärung aus. JU hat einen überdurchschnittlichen Anteil
  mehrdeutiger (auf 4 gerundeter) Hektarzellen (61.9 % gegenüber 56.3 % in
  Aargau) und mindestens einen auffälligen Einzelfall: Die Gemeinde
  Fontenais (282 Beschäftigte laut amtlicher Referenz) enthält eine
  einzelne Hektarzelle mit 453 Beschäftigten — mutmasslich ein grösserer
  Arbeitgeber, dessen Hektarlage laut Geometrie in Fontenais liegt, dessen
  Beschäftigte administrativ aber (teilweise) einer anderen Gemeinde
  zugerechnet werden. Ob das die vollständige Erklärung ist, ist **nicht**
  abschliessend verifiziert — dieser Befund braucht eine genauere Prüfung,
  bevor er als verstanden gelten kann.

**Reproduzierbarkeit.** Zwei vollständige, aufeinanderfolgende
`draufsicht-etl all`-Läufe erzeugen alle 83 Artefaktdateien (26 × 3 Kanton-
Dateien + `ch_kantone.{bin,json,geojson}` + `meta.json` + `companies.json`)
byte-identisch — per SHA-256/`cmp` über jede einzelne Datei geprüft, nicht nur
stichprobenartig.

**Rückwärtskompatibilität fürs Frontend.** `src/` wurde für diese Phase nicht
angefasst (Vorgabe: „this phase produces data only"). Damit die bestehende
Karte unverändert gegen Aargau weiterläuft, behält `meta.json` exakt die
Felder, die `src/data/loader.ts`s `Meta`-Interface und `src/main.ts`
(`loadMeta()`) lesen — `canton.{code,bfs_nr,name}`, `year`, `levels` — bei;
`cantons` ist ein reines Zusatzfeld, das die bestehende Karte ignoriert (ein
zusätzliches Feld in einem JSON-Objekt bricht kein `as Meta`-Cast). Die
Karte fragt weiterhin nur `ag_*`-Dateien an (aus `meta.canton.code`), die
jetzt einfach eines von 26 gleichwertigen Kanton-Paketen sind.

## Kantonswechsel

Mit Phase 1 baut das ETL immer alle 26 Kantone — ein Kantonswechsel ändert
nicht mehr, **was** gebaut wird, sondern nur noch, welchen der bereits
gebauten 26 Kantone die Karte beim Start zeigt. `CANTON` in
`etl/src/draufsicht_etl/config.py` bedeutet seither: der Startkanton der
Karte (`meta.canton`, gelesen in `src/main.ts`) und der Pfad der (bislang
einzigen) Firmen-CSV (`companies.csv_path()`) — nicht mehr, welche Gemeinden
und Grenzen das ETL berechnet.

Ein Kantonswechsel ist als Zweischritt gedacht:

1. `CANTON` in `etl/src/draufsicht_etl/config.py` auf den neuen Kanton setzen
   (`code`, `bfs_nr`, `name`). Gemeindegrenzen und -summen für diesen Kanton
   existieren bereits in `public/data/<code>_gemeinde.*`/
   `<code>_boundaries.geojson` — das ETL baut sie bei jedem Lauf für alle 26
   Kantone, unabhängig von `CANTON` (siehe oben).
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

Danach `npm run build:data` laufen lassen (schreibt vor allem ein neues
`meta.json` und `companies.json` — die 26 Gemeinde-/Grenzen-Pakete ändern
sich dabei nicht, ausser ein neuer STATENT-/swissBOUNDARIES3D-Jahrgang
verändert ihren Inhalt). Das Frontend liest den Kantons-Code und -Namen
weiterhin selbst aus `public/data/meta.json` (`src/main.ts`, per
`loadMeta()`) — die Artefakt-Dateinamen (`<code>_gemeinde.*`), der
Fenstertitel und der Titel des Kantonspanels folgen also ohne weitere
Codeänderung.

Eine Stelle bleibt trotzdem **Handarbeit im Code**, weil sie auf die
räumliche Ausdehnung des jeweiligen Kantons zugeschnitten ist und sich nicht
aus `CANTON` allein ableiten lässt:

- **`INITIAL_VIEW` in `src/map.ts`** — Kartenzentrum, Startzoom, Neigung und
  Blickrichtung sind von Hand auf den Kanton Aargau justiert. Ein deutlich
  grösserer, kleinerer oder anders geformter Kanton braucht andere Werte,
  sonst zeigt die Karte beim Start ins Leere oder nur einen Ausschnitt.

(Bis zum 13. August 2026 gab es hier eine zweite Stelle, `BAND_CENTERS` in
`src/domain/lod.ts`, für die Zoomstufen der Kanton-/Gemeinde-/Hektar-
Überblendung. Die Datei ist mit der Hektar- und Kantonsstufe entfallen, siehe
oben.)

Zusammen mit dem Inhalt der Firmen-CSV (siehe Schritt 2 oben — welche
Unternehmen im neuen Kanton kotiert sind, lässt sich nicht automatisiert
recherchieren) sind das die einzigen zwei Schritte, die ein Kantonswechsel
nicht automatisiert.

## Was am 13. August 2026 nicht im Browser geprüft wurde

Die Umstellung auf extrudierte Gemeindeflächen und die selbstgezeichnete
Basiskarte (siehe oben) ist fast ausschliesslich eine visuelle Änderung.
Typprüfung, Build und beide Testsuiten sind grün, aber keines davon rendert
tatsächlich WebGL — dieser Umsetzungsschritt hatte keinen Browser zur
Verfügung. Was ein Mensch vor dem nächsten Deploy ansehen sollte:

- **Extrudierte Gemeindeflächen (Ansicht B):** Stehen alle 196 Flächen an der
  richtigen Position, ohne Lücken oder Überlappungen zur Basiskarte? Zeigen
  die Seitenwände noch sichtbare Facetten trotz der auf 30 % gelockerten
  Vereinfachungstoleranz (`ag_boundaries.geojson`, 124 Stützpunkte je
  Gemeinde im Schnitt)?
- **Exklaven:** Gemeinden mit Exklaven ergeben laut `boundaries.py`
  MultiPolygon-Geometrien — `GeoJsonLayer` sollte jeden Teil einzeln auf
  dieselbe Höhe extrudieren; ungeprüft, ob das im Bild auch so aussieht.
- **Kantons-Basiskarte:** Passen die 26 Kantonsflächen lückenlos zusammen,
  ist der konfigurierte Kanton (Aargau) sichtbar hervorgehoben, und liegt die
  Karte insgesamt richtig unter den Gemeinde- bzw. Firmenbalken (Ebenen-
  Reihenfolge, `handle.setLayers`)?
- **`MapboxOverlay({ interleaved: true })` mit leerem Stil:** Läuft das
  Interleaving mit `BLANK_STYLE` (keine Quellen, nur ein Hintergrund-Layer)
  tatsächlich wie mit dem früheren, quellenreichen swisstopo-Stil? Die
  Annahme (WebGL-Kontext ist unabhängig vom Stilinhalt vorhanden) ist
  begründet, aber nicht am tatsächlichen Rendering verifiziert.
- **Pan/Rotate/Zoom, `NavigationControl`:** Sollte unverändert funktionieren
  (an `map.ts`s Kartensteuerung wurde nichts geändert), aber ungeprüft im
  Zusammenspiel mit der neuen Basiskarte.
- **Farben/Kontraste:** Die Kantons-Füllfarben (`src/layers/cantons.ts`,
  `FILL_COLOR`/`ACTIVE_FILL_COLOR`) sind nach Augenmass gewählt, nicht gegen
  die Branchenfarben oder den hellen Kartenhintergrund gemessen.

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
