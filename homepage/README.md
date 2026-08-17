# zeigmers

Eine statische 3D-Wirtschaftskarte der Schweiz, aufgeteilt auf drei Seiten:
eine Landing ohne eine Zeile JavaScript (`/`) und zwei Kartenseiten, deren
Kontrast die eigentliche Aussage trägt — die sichtbaren börsenkotierten
Gesellschaften gegen die tatsächliche Arbeit im ganzen Land.

**„Börsennotierte Firmen"** (`/firmen/`) zeigt die börsenkotierten
Gesellschaften, gesamtschweizerisch: **201 der 202 an der SIX kotierten
Gesellschaften stehen an ihrem operativen Hauptsitz, und alle 201 sind
recherchiert** — Umsatz, Gewinn, Beschäftigte, Branche, Kerngeschäft, jede
Zahl mit Primärquelle und einer unabhängigen Gegenprüfung. Die Höhe der Säule
folgt einer von **drei wählbaren Kennzahlen** — Jahresumsatz (Start),
Mitarbeitende oder Reingewinn —, in CHF umgerechnet, damit Beträge in EUR und
USD vergleichbar werden; das Panel zeigt die berichtete Zahl im Original. Bei
Reingewinn steht eine Verlustfirma so hoch wie eine gleich grosse Gewinnfirma,
das Vorzeichen trägt allein die Farbe der Säule (siehe „Warum ein Verlust
nicht mehr hängt" unten). Zwei Filter — Branche und Organisationsform —
schränken die Auswahl ein; die Legende zählt dabei jede Branche mit Anzahl und
Anteil und wird selbst zum Bedienelement, nicht nur zur Farbliste. Seeflächen
(Genfer-, Zürich-, Bodensee und weitere, aus Natural Earth und
swissBOUNDARIES3D kombiniert, siehe Quellenliste unten) liegen als
Orientierung auf der Karte, ohne eigene Zahl oder Aussage. Wie viele
Gesellschaften gezeigt werden und wie viele davon recherchiert sind, nennt
die Legende selbst (siehe „Die Abdeckungsangabe ist Teil der Oberfläche").

**„Beschäftigte"** (`/beschaeftigte/`) zeigt dieselbe Fläche als Beschäftigte
am Arbeitsort — national, alle 26 Kantone, nicht mehr nur Aargau:
**5'876'865 Beschäftigte** (BFS STATENT 2023), zuerst als 26 Kantonssäulen.
Ein Klick auf einen Kanton betritt ihn und zeigt seine Gemeinden als
extrudierte Flächen in ihrer tatsächlichen Form, nicht als Säule an einem
Referenzpunkt (siehe unten, «Warum Ansicht B jetzt Gemeindeflächen zeigt» —
der Name „Ansicht B" ist historisch, siehe „Die drei Seiten" unten). Das ist
die Arbeit, die tatsächlich stattfindet — in Gewerbehallen, Werkstätten,
Verwaltungen, Landwirtschaftsbetrieben und Läden, deren Umsatzzahlen nirgends
veröffentlicht werden.

Der Kontrast ist die Aussage: 201 sichtbare, börsenkotierte Gesellschaften
gegen 5'876'865 Beschäftigte im ganzen Land.

## Die drei Seiten

Der Umbau von einer Seite mit Ansichts-Umschalter zu drei eigenständigen
Seiten mit je einer URL ist der jüngste Schritt dieses Projekts — Spec und
Implementierungsplan dazu liegen in `docs/superpowers/specs/` und
`docs/superpowers/plans/` unter dem Datum 2026-08-15. Die drei Seiten:

- **`/`** — Landing, statisches HTML ohne eine Zeile JavaScript: zwei
  Kacheln mit den wichtigsten Kennzahlen je Kartenseite, gegen die
  Artefaktdaten geprüft (`src/landing.test.ts`).
- **`/firmen/`** — Ansicht «Börsennotierte Firmen», oben beschrieben
  (`src/karte/firmen.ts`).
- **`/beschaeftigte/`** — Ansicht «Beschäftigte», oben beschrieben
  (`src/karte/beschaeftigte.ts`).

Beide Kartenseiten teilen sich Kartenaufbau und die Steuerung oben links
(`src/karte/basis.ts`, `src/ui/nav.ts`); die interne Bezeichnung „Ansicht A"/
„Ansicht B" aus der Zeit vor der Aufteilung taucht in Kommentaren und
Abschnittstiteln weiter unten noch auf und bezeichnet dieselben zwei Seiten.

## Was das hier ist — und was nicht

Dies ist ein **technischer Machbarkeitsnachweis** (proof of concept), kein
fertiges Produkt und keine amtliche Statistik. Er zeigt, dass sich ein
komplettes ETL-für-eine-Karte-Projekt — Rohdaten laden, prüfen, aggregieren,
in ein kompaktes Binärformat packen, im Browser mit deck.gl/MapLibre als 3D-Karte
rendern — reproduzierbar und ohne Server-Backend bauen lässt. Die Zahlen sind
korrekt im Rahmen dessen, was die Quellen hergeben; sie sind nicht amtlich
geprüft im Sinne einer BFS-Publikation.

## Warum die Gemeindesumme über der offiziellen Zahl liegt

*Re-Review (2026-08-15): dieser Abschnitt stammt aus der Zeit, als die Karte
nur Aargau zeigte (vor der Nationalisierung am 14. August 2026), und ist bis
heute nur für Aargau nachgerechnet, nicht für die anderen 25 Kantone. Der
Mechanismus selbst (Rundung auf 4, daraus folgende Überschätzung) gilt
bundesweit — die Zahlen unten sind Aargau, nicht die heutige,
gesamtschweizerische Summe (5'876'865 Beschäftigte über alle 26 Kantone,
siehe Einleitung).*

Innerhalb von Ansicht «Beschäftigte» zeigt der Kanton Aargau 196 extrudierte
Gemeindeflächen; ihre Summe ergibt **383'203** Beschäftigte.
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
3 × 10'109 = 30'327). Der ETL-Lauf (`zeigmers-etl statent`/`all`) bricht mit
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

`etl/src/zeigmers_etl/aggregate.py` und `binpack.py` berechnen die
Hektarstufe weiterhin vollständig — die Gemeindeaggregation und die
Mehrdeutigkeits-Zählung je Gemeinde hängen direkt daran (Abschnitt 6.5 der
Spezifikation). Nur der Schreibaufruf für `ag_hektar.*` und `ag_kanton.*` in
`cli.py` entfällt; die beiden Artefakte werden dadurch nicht mehr erzeugt.

## «Die Vielen» heisst jetzt «Beschäftigte»

Ansicht B hiess bis zum 13. August 2026 «Die Vielen». Der Name ist auf
«Beschäftigte» geändert — passend zu Ansicht A, deren Name «Die Sichtbaren»
unverändert bleibt, und zur Einheit, die die Legende ohnehin schon zeigte
(`UNIT_LABEL` in `src/ui/legend.ts`). Der interne Schlüssel wurde mit
umbenannt, `'viele'` → `'beschaeftigte'` (in der damaligen Datei für den
Ansichts-Umschalter, seither in `src/ui/nav.ts` aufgegangen, und allen
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
in `etl/src/zeigmers_etl/config.py`), was **124 Stützpunkte je Gemeinde**
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
  heller Flächenfüll, dünne Konturen. Re-Review (2026-08-15): hier stand
  bisher, ein aus `meta.json` konfigurierter Kanton sei sichtbar
  hervorgehoben — das galt vor der Nationalisierung (Phase 3), gilt aber
  nicht mehr: Ansicht «Börsennotierte Firmen» hebt seither keinen Kanton mehr
  hervor, Ansicht «Beschäftigte» hebt auf der Kantonsstufe den zuletzt
  betretenen Kanton hervor, nicht den in `meta.json` konfigurierten (siehe
  `src/layers/cantons.ts`, `CantonsLayerOptions.activeBfsNr`).

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
in `data/manual/listed_companies.csv` (bis Phase 3: `ag_listed_companies.csv`,
siehe „Phase 3" unten) hält den gröbsten Unterschied fest —
Netto-Umsatz gegen die Näherung einer Bank; die feineren Fälle stehen im
freien `note`-Feld derselben Zeile. Dieser Abschnitt gilt unverändert für die
acht recherchierten Firmen — die einzigen mit einem `revenue`-Wert:

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
`report_url` zur Primärquelle. `companies.validate()` (`etl/src/zeigmers_etl/
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
| Liste kotierter Titel (seit Phase 3, national) | SIX Group, `six-group.com/fqs/ref.json` (`ProductLine=BC`+`DS`) | Ansicht A: Nenner der Abdeckungsangabe, Kandidatenliste für `companies-sync` |
| Firmen-Stammdaten (LINDAS/Zefix, Geokodierung) | LINDAS SPARQL-Endpunkt, swisstopo SearchServer | Sitz je Titel (wo eindeutig auffindbar) und Adresse→Koordinate für Ansicht A |
| Umsatz, Mitarbeitende, Geschäftsjahr je Firma | Geschäftsberichte der 201 recherchierten Unternehmen selbst | Ansicht A (siehe `report_url` je Zeile) |
| Seeflächen (`lakes.geojson`) | Natural Earth 10m «lakes» (Genfersee, Bodensee, Lago Maggiore), swissBOUNDARIES3D (`tlm_hoheitsgebiet`, die übrigen amtlich geführten Seen) | Orientierung in beiden Ansichten (`src/layers/lakes.ts`) — die einzige nicht-amtliche Quelle dieser Karte, deshalb namentlich in der Eckbox genannt. **Bleibt unvollständig:** Vierwaldstättersee, Zugersee, Walensee und Lago di Lugano stecken in keiner der beiden Quellen als eigene Fläche und fehlen auf der Karte (siehe `etl/src/zeigmers_etl/lakes.py`, Moduldocstring) |

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

1. In `etl/src/zeigmers_etl/config.py` `STATENT_YEAR` ändern (z. B. `2024`).
2. `npm run build:data` laufen lassen.
3. Neue Artefakte in `public/data/` committen.

Die Spaltenauflösung passt sich dabei selbst an: STATENT-Spaltennamen tragen
ein Jahrgangs-Präfix, das mit der NOGA-Nomenklaturversion wechselt, **nicht**
mit dem Datenjahr — die Spalten heissen `B08EMPT` (NOGA 2008), nicht `B24EMPT`,
selbst für 2024er-Daten. `etl/src/zeigmers_etl/columns.py` löst die Spalten
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
`MAX_CANTON_PAYLOAD_BYTES`), beide von `zeigmers-etl all` geprüft und
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

**Das Plausibilitätsfenster bricht weiterhin hart ab — für alle 26 Kantone,
ohne Ausnahme.** Ein erster Zwischenstand hatte das Fenster bei einer
Verletzung nur noch warnen statt abbrechen lassen, damit ein auffälliger
Kanton nicht die anderen 25 blockiert. Das wurde zurückgenommen: eine
Warnung statt Abbruch entwaffnet den Guard für **alle** 26 Kantone, nicht
nur die betroffenen — genau die Prüfung, die Verschnitt- und Spaltenfehler
fangen soll, hätte dann niemand mehr durchgesetzt. Der Guard prüft **jeden**
Kanton gegen seine eigene BFS-Referenz und seinen eigenen NOLOC-Anteil und
bricht bei einer Verletzung weiterhin hart ab — wie die beiden anderen
Guards (Σ Hektar = Σ Gemeinde = Kanton; kleinster Hektarwert = 4), für die
es ohnehin keine legitime Ausnahme gibt.

**Zwei Kantone verletzen das rohe Fenster — beide aus einem einzeln
benennbaren, betragsscharf belegten Grund, keiner aus Rundung oder NOLOC.**
Statt einer Pro-Kanton-Toleranz (dieselbe Entwaffnung in kleinerem Kostüm)
trägt `etl/src/zeigmers_etl/plausibility.py` eine kleine, **bounded**
Ausnahmetabelle: jeder Eintrag nennt Kanton, Betrag, Ursache und Beleg und
weitet **genau eine** Fenstergrenze um **genau diesen** Betrag — nicht mehr.
Ein Kanton, der über seine dokumentierte Ausnahme hinaus abweicht, bricht
den Lauf weiterhin ab (`etl/tests/test_plausibility.py` prüft das explizit,
mit +100 Beschäftigten über die Ausnahme hinaus als Regressionsfall).

- **Jura** (56'370 Beschäftigte, Referenz 48'533, **+16.15 %**, oberes
  Fenster ohne Ausnahme 54'911 → Verstoss): **Moutier wechselte per
  1. Januar 2026 vom Kanton Bern zum Kanton Jura.** Unsere Geometrie ist
  der 2026-Jahrgang und zählt Moutiers Hektaren zu Jura; die STATENT-
  Referenz ist der 2023-Jahrgang und führt Moutier weiterhin unter Bern —
  zwei intakte, unterschiedliche Jahrgänge derselben Schweiz. Eine
  automatische Zuordnung scheitert zweifach: über die aktuelle Geometrie,
  weil Moutier beim Kantonswechsel eine neue BFS-Nummer bekam (Berns Block
  3xx–9xx, Jurassisch 67xx–68xx), und über den historisierten Identifikator
  (`hist_nr`), weil der Wechsel eine neue historisierte Einheit erzeugt hat
  (Moutiers 2026er `hist_nr` 16669 kommt im 2023er-File gar nicht vor). Die
  Ausnahme weitet die obere Grenze um Moutiers eigene Hektarsumme (**3'893**,
  direkt aus der Pipeline, nicht geschätzt) — danach liegt Jura mit 56'370
  innerhalb von [47'848 .. 58'804]. Ohne Moutier: 52'477 gegen Referenz
  48'533 = **+8.13 %**, bereits innerhalb des unveränderten Fensters. Ein
  zweiter, kleinerer Fall (Basse-Vendline, BFS 6812, 2023er-Gemeindefusion,
  499 Beschäftigte) fehlt ebenfalls im 2023er-Referenzfile, ändert aber
  nichts an der Kantonssumme (die Fusion ist rein innerkantonal, ihre
  Vorgänger-Codes stecken bereits in der Referenz) und braucht deshalb
  keinen eigenen Tabelleneintrag.
- **Basel-Stadt** (196'257 Beschäftigte, Referenz 199'745, **-1.75 %**,
  unteres Fenster ohne Ausnahme 199'245 → Verstoss): der gesamte Fehlbetrag
  sitzt in der Gemeinde Basel selbst (BFS 2701: −3'931; Bettingen und Riehen
  liegen beide leicht über ihrer Referenz, wie praktisch überall sonst).
  Ursache: das **Dreispitz-Areal**, 50 ha, liegt je zur Hälfte in den
  Gemeinden Basel und Münchenstein (BL), Kantonsgrenze mitten durchs Areal;
  sein Kernstück "Wirtschaftspark Dreispitz" zählt rund 4'000 Arbeitsplätze
  (externe Quellen, siehe `plausibility.py`). Ein unabhängiger 300-m-
  Grenzring auf der Münchensteiner Seite fängt 3'942 Beschäftigte — nahezu
  deckungsgleich mit dem gemessenen Fehlbetrag. Die Ausnahme weitet die
  untere Grenze um genau diesen gemessenen Fehlbetrag (**3'931**) — danach
  liegt Basel-Stadt mit 196'257 innerhalb von [195'314 .. 201'269]. Weniger
  scharf belegt als Moutier (kein einzelnes, datiertes Ereignis, sondern ein
  diffuser Grenzeffekt um ein konkret benennbares Areal) — als solcher im
  Code gekennzeichnet.

Vollständige Herleitung, Belege und Zahlen: ETL-Report.

**Reproduzierbarkeit.** Zwei vollständige, aufeinanderfolgende
`zeigmers-etl all`-Läufe erzeugen alle 83 Artefaktdateien (26 × 3 Kanton-
Dateien + `ch_kantone.{bin,json,geojson}` + `meta.json` + `companies.json`)
byte-identisch — per SHA-256/`cmp` über jede einzelne Datei geprüft, nicht nur
stichprobenartig.

**Rückwärtskompatibilität fürs Frontend.** `src/` wurde für diese Phase nicht
angefasst (Vorgabe: „this phase produces data only"). Damit die bestehende
Karte unverändert gegen Aargau weiterläuft, behält `meta.json` exakt die
Felder, die `src/data/loader.ts`s `Meta`-Interface und `loadMeta()` (heute
`src/karte/basis.ts`) lesen — `canton.{code,bfs_nr,name}`, `year`, `levels` — bei;
`cantons` ist ein reines Zusatzfeld, das die bestehende Karte ignoriert (ein
zusätzliches Feld in einem JSON-Objekt bricht kein `as Meta`-Cast). Die
Karte fragt weiterhin nur `ag_*`-Dateien an (aus `meta.canton.code`), die
jetzt einfach eines von 26 gleichwertigen Kanton-Paketen sind.

## Ansicht «Börsennotierte Firmen»: der Stand

**201 der 202 an der SIX kotierten Gesellschaften stehen auf der Karte, und
alle 201 sind recherchiert** — Umsatz, Gewinn, Beschäftigte, Branche,
Kerngeschäft, Gründungsjahr, jede Zahl mit Primärquelle. Die Belege liegen
als ein JSON je Firma in `data/manual/research/`, zusammen mit den beiden
Verträgen, nach denen recherchiert und gegengelesen wurde.

| | |
|---|---|
| kotierte Titel (SIX, 15. August 2026) | 224 |
| Gesellschaften nach Zusammenfassung von Namen-/PS-Aktien und zweiten Handelslinien | 202 |
| davon auf der Karte platziert | **201** |
| davon recherchiert | **201** |
| davon mit belegtem Umsatz | **187** |
| unabhängig gegengeprüfte Zeilen | **alle 193** |
| davon bestätigt | 183 |
| davon mit Fund | 10 — alle eingearbeitet |
| eingearbeitete Korrekturen | 21 |

Die **14 Zeilen ohne Umsatz** sind Beteiligungs- und Investmentvehikel
(BB Biotech, HBM Healthcare, Private Equity Holding, nebag, Alpine Select,
Castle, Matador, EEII, C Capital, EvoNext), klinische Biotechs ohne
zugelassenes Produkt (Addex, BioVersys, Molecular Partners) und die
Schweizerische Nationalbank. Bei ihnen ist das Feld leer **mit Begründung** —
etwas anderes als «noch nicht nachgesehen», und die Karte zeichnet sie
entsprechend als Säule auf Mindesthöhe statt mit einer Grösse, die niemand
belegen kann.

**Die eine nicht platzierte Gesellschaft** ist «Baloise Swiss Property»: kein
Unternehmen, sondern ein vertraglicher Immobilienfonds nach KAG ohne eigene
Rechtspersönlichkeit, dessen ISIN zudem nur zum befristeten Bezugsrecht einer
Kapitalerhöhung gehört. Die Adresse der Fondsleitung wäre ein Näherungswert,
kein Sitz.

### Was die Gegenprüfung gefunden hat

Jede recherchierte Zeile wird von einem zweiten, unabhängigen Durchgang
gelesen, dessen Auftrag lautet, sie zu **widerlegen** — die Zahlen selbst aus
der Primärquelle zu holen, statt die vorgelegten nachzuvollziehen. Das war
nicht symbolisch: im Pilotlauf über acht bewusst schwierige Firmen hatten
**vier von vier** gegengelesenen Zeilen einen Fund, keiner davon sichtbar.

Aus diesen Funden wurden die sieben Regeln des Recherche-Vertrags. Danach
kippte die Quote: über die restlichen rund 170 Zeilen blieben es 14 weitere
Funde. Die lehrreichsten:

| Firma | Fund |
|---|---|
| Avolta | 13'983 war «Turnover» (Nettoumsatz plus 223 Mio. Werbeerträge), eingetragen als Nettoumsatz |
| Partners Group | Die Zeile «Total revenues …» enthält 101.9 Mio., die der Bericht selbst als «not revenue» abgrenzt |
| APG SGA | Der Umsatz war eine selbst gebildete Teilsumme, keine gedruckte Berichtszeile |
| Swisscom | Gewinn 1'270 statt 1'271 — Konzernergebnis statt Aktionärsanteil, nachgewiesen über die Gewinn-je-Aktie |
| Sulzer, EMS-CHEMIE | dasselbe: Konzerntotal statt Aktionärsanteil |
| Kuros | Gewinn enthielt ein aufgegebenes Geschäft, der Umsatz nicht |
| Alcon, Clariant, Cembra | Beschäftigte gerundet bzw. Vollzeitstellen statt Köpfe |
| Temenos | Gründungsjahr stammte aus Wikipedia — Feld jetzt leer |

**Ein Fund blieb offen und steht so in der Zeile:** Perrot Duvals Zahlen
stammen aus dem Geschäftsjahr 2024/25, obwohl 2025/26 seit dem 29. Juli 2026
veröffentlicht ist — perrotduval.com sperrt jeden Zugriff (HTTP 403), auch
über mehrere Wege. Es ist die einzige der 201 Firmen mit einem älteren
Geschäftsjahr; 188 stehen auf 2025, zehn auf einem in 2026 endenden. Die
Einschränkung steht in der Zeile, statt stillschweigend übernommen zu werden.

**Korrekturen stehen in einem eigenen Feld** (`_korrektur`), nicht im
Prüfurteil. Der Grund ist eine Panne, die eine Prüfung aufdeckte: Avoltas
gespeichertes Urteil stammte von VOR der Korrektur und hielt die alten,
falschen Werte für richtig. Ein Prüfurteil ist eine Momentaufnahme, eine
Korrektur eine Entscheidung — im selben Feld überschreibt das spätere das
frühere. Bei Kuros widersprechen sich zwei Prüfungen bis heute: die eine
bestätigt, dass die Zahl im Bericht steht (stimmt), die andere, dass ihr
Umfang nicht zum Umsatz passt (stimmt auch). Ohne getrenntes Feld hätte die
schwächere die schärfere überschrieben.

### Zwei Darstellungsfehler, die erst mit der Vollständigkeit auftraten

**Acht Firmen waren hinter anderen versteckt.** Vier Adressen tragen je zwei
kotierte Gesellschaften (Metall Zug und V-ZUG teilen sich die
Industriestrasse 66 in Zug, AEVIS und Infracore die Rue Georges-Jordil 4 in
Fribourg). Am identischen Punkt gezeichnet verdeckt die höhere Säule die
niedrigere vollständig — Infracore mit 66 Mio. verschwand hinter AEVIS mit
1'055 Mio. Sie stehen jetzt auf einem Kreis von 150 m um den echten Punkt,
weit unter der Auflösung, in der diese Karte etwas aussagt, und das Panel
nennt den Versatz.

**Elf Säulen steckten in der Kantonsplatte.** Mit 187 echten Umsätzen spannt
die Ansicht einen Faktor von rund 325'000 (Nestlé 89.5 Mrd. gegen Xlife
Sciences 0.28 Mio.); am unteren Ende ergab die Skala 75 und 105 m, weniger
als die 300 m hohe Platte. Zwei Schwellen lösen das, weil zwei Zusicherungen
aneinanderstossen: jede Säule muss die Platte überragen, und ein Platzhalter
(«keine Zahl gefunden») muss niedriger bleiben als jede echte Säule, sonst
sieht «keine Zahl» aus wie «kleine Zahl». Platzhalter sitzen auf 400 m, die
kleinsten echten Säulen auf 550 m — und die Legende sagt, dass die Höhe
unterhalb der Schwelle nicht mehr den Umsatz zeigt.

Beide Fehler haben dieselbe Form wie fast alles in diesem Projekt: **die
Daten stimmten, die Karte zeigte sie trotzdem nicht.**

### Warum ein Verlust nicht mehr hängt

Kennzahl-Umschalter, Branchen-/Organisationsformfilter, Kennzahlenzeile und
Panel-Kontext waren über mehrere Aufgaben hinweg gebaut, aber nirgends
verdrahtet — `buildViewLayers` zeichnete unabhängig von der Steuerung immer
dieselbe feste Auswahl (Kennzahl Umsatz, alle Branchen). Die Verdrahtung
(Aufgabe 18) deckte dabei einen dritten Darstellungsfehler auf, der sich erst
zeigte, sobald die Kennzahl **Reingewinn** zum ersten Mal im Browser lief:
die in der Spezifikation vorgesehene erste Wahl — eine bei Verlusten
angehobene Nulllinie, von der eine Verlustsäule nach unten hängt — liess sich
im Screenshot nicht nachweisen. Eine pixelgenaue Farbsuche über den gesamten
Screenshot fand kein einziges Pixel der Verlustfarbe unter den 41
Verlustfirmen. Grund: die Nulllinie hebt sich um den Betrag des tiefsten
Verlusts über die Kantonsplatte — bei einem grossen Ausreisser (die
Schweizerische Nationalbank trägt den grössten Ausschlag der Auswahl) landet
sie damit selbst nahe der Höhendecke, und jede von dort hängende Verlustsäule
verschwindet optisch zwischen den hohen Gewinnsäulen, statt sichtbar «unten»
zu hängen.

Die App zeigt seither die zweite, im Auftrag ausdrücklich vorgesehene Wahl:
die Säulenhöhe folgt dem **Betrag** der Kennzahl, das Vorzeichen trägt
ausschliesslich die Farbe der Säule (`src/layers/visible.ts`, `LOSS_COLOR`
und `zeroPlaneHeight`, seither immer die Plattenoberkante). Ein Verlust steht
damit so hoch wie ein gleich grosser Gewinn, aber erkennbar in einem eigenen
Ton — sichtbar statt nur theoretisch richtig.

## Phase 3: Ansicht «Börsennotierte Firmen» wird national

Seit dem 14. August 2026 zeigt Ansicht «Börsennotierte Firmen» nicht mehr nur
die acht kotierten Unternehmen mit Sitz im Kanton Aargau, sondern **alle** an
der SIX kotierten Titel — die acht behalten ihr vollständiges, von Hand
recherchiertes Profil (Umsatz, Gewinn, Kerngeschäft, je mit Quelle), der Rest
erscheint als **schlichte, positionsgetreue Marker**, nicht als Balken:
diesen Standard auf 224 Titel auszuweiten ist nicht leistbar (acht Firmen
allein trugen 187 recherchierte Werte; die vier davon mit einer Falle beim
Sourcing, siehe „Was revenue bedeutet" oben, geben eine Ahnung vom Aufwand
pro Firma). Statt so zu tun, als wären alle recherchiert, oder die Ansicht
auf acht zu beschränken: **wachsen und offenlegen, wie weit die Abdeckung
reicht.**

### Drei Zustände statt zwei

`data/manual/listed_companies.csv` (national, siehe unten) unterscheidet seit
dieser Phase drei Zustände je Zeile, nicht mehr zwei — die Spalte
`researched` (`yes`/`no`) macht den Unterschied explizit, statt ihn aus
`revenue is None` zu erraten:

1. **recherchiert, Zahlen vorhanden** (`researched=yes`, `revenue` gesetzt) —
   die ursprünglichen acht, unverändert.
2. **recherchiert, Zahlen nicht öffentlich verfügbar** (`researched=yes`,
   `revenue` leer, `note` erklärt warum) — der bisherige „placeholder"-Pfad,
   bislang der einzige Weg, ein leeres `revenue` zu haben.
3. **noch nicht recherchiert** (`researched=no`) — neu. Das ist **nicht**
   dieselbe Aussage wie Zustand 2: „wir haben nachgesehen und nichts
   Öffentliches gefunden" ist etwas anderes als „wir haben noch nicht
   nachgesehen". `companies.validate()` (`etl/src/zeigmers_etl/
   companies.py`) erzwingt den Unterschied maschinell: eine `researched=no`-
   Zeile darf **keine einzige** Kennzahl tragen (`RESEARCH_ONLY_FIELDS`) —
   nicht nur „wenn `revenue` gesetzt ist, dann auch `report_url`" wie bisher,
   sondern strenger: eine unrecherchierte Zeile kann sich gar keine Zahl
   aneignen, mit oder ohne Quelle.

Im Frontend zeichnen sich die drei Zustände unterschiedlich (`src/layers/
visible.ts`): Zustand 1 und 2 als Säule (Zustand 2 auf der bestehenden
Mindesthöhe, `UNKNOWN_BAR_FRACTION`), Zustand 3 als **kleiner, neutraler,
flacher Marker** (`buildUnresearchedCompanyLayer`, `ScatterplotLayer`, feste
Farbe, keine Höhe) — die Karte zeigt so, **wo** Schweizer Börsenfirmen sitzen,
ohne eine Grösse zu behaupten, die niemand recherchiert hat, und ohne 216
graue Türme, die die acht echten Säulen ertränken. Hovern nennt den Namen,
Klick öffnet ein kurzes Panel mit Sitz und dem Hinweis „Noch nicht
recherchiert" (`src/ui/panel.ts`, `companyContent`) — bewusst nicht derselbe
Text wie bei Zustand 2.

### Die Abdeckungsangabe ist Teil der Oberfläche

Die Legende (`src/ui/legend.ts`, `LegendOptions.scopeLabel`) zeigt in Ansicht
«Börsennotierte Firmen» statt eines Kantonsnamens jetzt:

```
201 Gesellschaften von 224 kotierten SIX-Titeln auf der Karte gezeigt, davon 201 recherchiert · SIX-Stand 15. August 2026
```

**Zwei Zahlen, nicht eine.** Eine frühere Fassung nannte nur die Recherche-
Abdeckung („8 von 224 recherchiert"). Die ist wahr, aber allein irreführend:
wer die Säulen auf der Karte zählt, kommt auf 201, nicht auf 224 — die
Differenz sind ganz überwiegend Titel, die als Namen-/PS-Aktie oder zweite
Handelslinie derselben Gesellschaft zusammengefasst wurden (224 Titel → 202
Gesellschaften, siehe oben), dazu genau **eine** Gesellschaft ohne Sitz:
„Baloise Swiss Property", ein vertraglicher Immobilienfonds ohne eigene
Rechtspersönlichkeit (siehe „Domizil im Ausland trotz CH-ISIN").
Ohne die erste Zahl liesse sich aus der Karte selbst nicht
ablesen, dass ein Achtel der kotierten Titel fehlt. Beide Zahlen stehen
deshalb nebeneinander: wie viele überhaupt gezeigt werden, und wie viele
davon Zahlen tragen.

Alle Zahlen kommen zur Laufzeit aus `companies.json`s `stats`-Objekt
(`count`, `researched`, `totalListed`, `sixRetrievedDate`), nicht hartcodiert —
ein künftiger `companies-sync`-Lauf mit mehr recherchierten Firmen oder einem
neuen SIX-Stand zieht sie automatisch nach. `224` ist die Zahl der
kotierten **Titel** (siehe unten — nicht identisch mit der Zahl der
Gesellschaften, weil einzelne Firmen mehr als einen Titel stellen), live von
SIX abgefragt (`companies.fetch_six_titles()`) bei jedem `zeigmers-etl
companies`/`all`-Lauf — kein Rückfall auf eine veraltete Zahl, falls der
Endpunkt nicht erreichbar ist: der Build bricht dann mit einer klaren Meldung
ab (`ConnectionError`).

### Woher die 224 kommen — und wie sie zu 202 Gesellschaften werden

SIX veröffentlicht seine Referenzdaten über einen öffentlichen, nicht
dokumentierten Endpunkt (`https://www.six-group.com/fqs/ref.json`) — die
Herleitung der Abfrage (zwei `ProductLine`-Codes, `BC` für die 30 SMI-Blue-
Chip-Titel und `DS` für die übrigen 194, Paginierung über `page=N`,
`pageSize` wird ignoriert) steht bereits in `data/manual/six_issuers_ag.md`
(dort für die AG-Kandidatensuche verwendet); Phase 3 nutzt denselben Endpunkt
jetzt für **alle** 224 Titel, nicht nur die AG-Teilmenge.

Mehrere SIX-Titel können zur selben Gesellschaft gehören — Namen- und
Partizipationsschein-Aktien derselben Firma (z. B. Lindt: `LISN`/`LISP`) oder
eine zweite Handelslinie derselben Aktie (`… 2. LINIE`, z. B. `ABBNE` neben
`ABBN`). Zwei Marker für dieselbe Firma am selben Ort wären irreführend
(Duplikat, kein zusätzliches Unternehmen) — `companies.group_six_titles()`
fasst sie deshalb vor dem Sitzabgleich zusammen: **224 Titel → 202
Gesellschaften.** Die Abdeckungsangabe in der Legende zählt bewusst trotzdem
gegen 224 (Titel, nicht Gesellschaften) — das ist die Zahl, die SIX selbst
als „kotiert" ausweist und die in der Aufgabenstellung genannt wurde; der
Unterschied zu 202 ist hier dokumentiert, nicht verschwiegen.

### Sitz je Titel: GLEIF über die ISIN — und warum der Namensabgleich es nicht konnte

**Seit dem 14. August 2026 kommt der Sitz aus GLEIF**, nicht mehr aus einem
Namensabgleich. Der Grund ist ein Befund, kein Geschmacksurteil: gegen GLEIF
geprüft lagen **28 von 130 Platzierungen auf der falschen Rechtseinheit, 14
davon in einer anderen Gemeinde.**

| Kürzel | Namensabgleich | tatsächlich |
|---|---|---|
| `LISN` | Lindt **Dessous-Moden GmbH**, Solothurn | Chocoladefabriken Lindt & Sprüngli AG, Kilchberg |
| `RO` | Roche **Sapac** AG | Roche Holding AG |
| `SCHN` | Schindler **Aufzüge** AG, Ebikon | Schindler Holding AG, Hergiswil |
| `UHR` | **Swatch AG**, Biel | The Swatch Group AG, Neuchâtel |
| `GF` | Georg Fischer **Rohrleitungssysteme** AG | Georg Fischer AG |
| `WARN` | Warteck **Sport Holding** AG | Warteck **Invest** AG |

Ein Name kann nicht hergeben, was ein Name nicht enthält: ob eine Gesellschaft
die Mutter, eine Tochter oder ein zufälliger Namensvetter ist. Die Kette aus
Rechtsform-Entfernung, Umlaut-Transliteration und Konfidenzstufen unten hat
das so weit getrieben, wie es geht — und ist trotzdem bei jeder fünften Firma
auf der falschen gelandet, ohne dass irgendetwas gewarnt hätte.

GLEIF (Global Legal Entity Identifier Foundation) veröffentlicht genau die
Verbindung, die fehlte: **ISIN → Rechtsträger**. Die ISIN steht in der
SIX-Titelliste, ist eindeutig, und wird nicht interpretiert. Der Datensatz
liefert dazu `registeredAs` — die Schweizer UID im selben CHE-Format, das die
acht handrecherchierten Zeilen schon trugen. Diese acht sind damit unabhängig
bestätigt: gleicher Ort, gleiche UID, alle acht.

**Die Säule steht am operativen Hauptsitz**, nicht am Rechtssitz. Bei 11 der
192 Gesellschaften fallen die auseinander, und zwar dort, wo es sichtbar wird:
Logitech ist in Hautemorges eingetragen (ein Dorf mit einigen hundert
Einwohnern) und arbeitet in Lausanne; SGS ist in Genf eingetragen und führt
den Konzern aus Baar; die Sandoz Group ist in Basel eingetragen und sitzt in
Rotkreuz. Für eine Wirtschaftskarte ist der Ort, an dem gearbeitet wird, die
ehrlichere Aussage als der Ort, an dem die Statuten liegen. Welche der beiden
Adressen benutzt wurde, hält `seat_basis` je Zeile fest — die Wahl bleibt
nachvollziehbar und umkehrbar, ohne neu abzufragen.

**Keine der beiden Quellen genügt allein.** GLEIF kann einer Umbenennung
nachhinken: für die ISIN CH0024666528 nennt SIX «Centiel N», GLEIF noch
«HOCHDORF Holding AG» (ein Börsenmantel nach Übernahme). Solche Abweichungen
meldet `companies-sync` unter `nameMismatch`, statt sie stillschweigend
aufzulösen.

Ergebnis: **201 von 202 Gesellschaften platziert** statt 135. 192 Sitze aus
GLEIF, 5 über den Namensabgleich als Rückfall, 4 über die von Hand belegte
Ausnahmetabelle (`data/manual/seat_overrides.json`, siehe unten). Der
Namensabgleich bleibt für Titel ohne GLEIF-Eintrag bestehen und ist deshalb
hier weiter dokumentiert:

Für Titel ohne GLEIF-Eintrag sucht `companies.find_seat()` einen eindeutigen
Sitz im Zefix-Handelsregister über den LINDAS-SPARQL-Endpunkt — nicht über die
ISIN (Zefix führt keine), sondern über einen Namensabgleich:

- **Kern des Vergleichs (`companies.canonicalize()`):** Rechtsform- und
  Sammelwörter (`AG`, `Holding`, `Group`/`Gruppe`, …) werden von beiden Namen
  iterativ entfernt, bis nur der eigentliche Firmenkern bleibt — „Siegfried
  Holding AG" (Zefix) und „SIEGFRIED" (SIX-Kurzname) reduzieren so auf
  denselben Kern, ohne dass für jede Rechtsform ein Sonderfall nötig wäre.
  Deutsche Umlaute werden dabei wie SIX selbst nach `ae`/`oe`/`ue`
  transliteriert (nicht einfach entfernt) — sonst wären „Julius Bär" (SIX:
  `JULIUS BAER`), „Kühne+Nagel" und „Flughafen Zürich" beim ersten Lauf
  fälschlich als nicht auffindbar durchgefallen (ein tatsächlich
  aufgetretener Fehler, hier korrigiert). Kantonalbanken bekommen zusätzlich
  eine kleine, geschlossene Abkürzungsauflösung (`KB` → `Kantonalbank`, `BC`
  → `Banque Cantonale`) — ohne sie wären alle neun kotierten Kantonalbanken
  unmatched geblieben, obwohl jede zweifelsfrei in Zefix registriert ist.
- **Drei Konfidenzstufen, keine geraten:** ein Kandidat gilt nur als Treffer,
  wenn sein kanonischer Name exakt dem Schlüssel entspricht, ihn um höchstens
  ein Wort erweitert (z. B. „Aevis Victoria SA" für `AEVIS`), oder wenn
  mehrere Rechtseinheiten (Holding-, Betriebs-, Verwaltungsgesellschaft) an
  **derselben** Adresse übereinstimmen (welche UID genau die kotierte ist,
  bleibt dann unsicher — der Sitz selbst nicht). Konkurrieren ein exakter und
  ein erweiterter Treffer an **unterschiedlichen** Adressen, gilt das als
  mehrdeutig, nicht als Treffer der „besseren" Stufe (Regressionsfall
  „MONTANA": „Montana Holding AG", Solothurn, ist ein exakter, aber
  falscher Treffer — die gesuchte „Montana Aerospace AG", Reinach AG, liegt
  nur in der erweiterten Stufe, weil SIX „Aerospace" im Kurznamen wegliess;
  ein früherer, stufenweiser Abgleich mit frühem Abbruch bei der ersten
  Stufe mit genau einem Treffer hätte den falschen Treffer unbemerkt
  ausgegeben).
- **Mehrere Suchwörter statt nur des längsten:** ein generisches Suchwort wie
  „SWISS" liefert mehr Treffer, als die Abfrage zurückgibt (Limit 300),
  ohne die gesuchte Firma zu enthalten — „Swiss Prime Site AG" wurde beim
  ersten Lauf deshalb verfehlt. `companies.find_seat()` erkennt ein
  ausgeschöpftes Limit als unzuverlässig und probiert bei Bedarf ein
  selteneres Wort derselben Firma («PRIME» statt «SWISS»).

- **Ein abgeschnittenes Suchergebnis trägt keinen Vergleich.** Läuft eine
  Abfrage ins Limit, gilt seither nur noch ein **exakter** Namenstreffer als
  Sitz. Die abgeleiteten Stufen (ein Wort mehr, Adress-Mehrheit) sind
  Vergleichsurteile — „der einzige Kandidat", „die grösste Gruppe" — und nur
  so gut wie das Feld, über das sie vergleichen; aus einer unvollständigen
  Liste sind sie wertlos. Belegt an zwei Fällen desselben Laufs:
  „ZURICH INSURANCE" → „Zurich Insurance Group AG" ist exakt und richtig,
  „SIG GROUP" → „SIG Services AG" (Konzern-Schwester) wäre falsch gewesen.
  Zuvor stand die Limit-Prüfung **hinter** dem frühen Abbruch bei einem
  Treffer und griff für Treffer nie — „GEORG FISCHER" landete so auf der
  Tochter „Georg Fischer Rohrleitungssysteme AG", während die kotierte
  „Georg Fischer AG" hinter dem Schnitt lag.
- **Der Konzern-Schwester-Filter braucht einen exakten Treffer als Anker.**
  Er darf Geschwister neben einem exakten Treffer wegräumen, aber nicht
  zwischen lauter gleichrangigen Kandidaten entscheiden — er kennt nur
  „generisches Zusatzwort" als Kriterium. „WARTECK" zeigte, wie das
  umschlägt: die gesuchte „Warteck Invest AG" trägt mit „Invest" ausgerechnet
  ein Wort von der Generik-Liste, bei der fremden „Warteck Sport Holding AG"
  fällt „Holding" schon als Rechtsform weg und das verbleibende „Sport" gilt
  als identitätsstiftend. Der Filter warf den richtigen Kandidaten weg und
  machte den falschen dadurch zum eindeutigen Treffer.

Beide Fälle haben dieselbe Form und sind die eigentliche Gefahr dieses
Schritts: **kein Absturz, keine Fehlermeldung — eine Firma steht am falschen
Ort und sieht dabei genauso richtig aus wie die 128 anderen.**

Ergebnis (Stand 14. August 2026, 194 neue Gesellschaften):
- **128 eindeutig einem Zefix-Sitz zugeordnet** — davon 42 über einen exakten
  Namenstreffer, 78 über eine Adress-Mehrheit, 8 über die Erweiterung um ein
  Wort.
- **39 blieben mehrdeutig** (mehrere ernsthaft in Frage kommende Adressen,
  keine Mehrheit) — u. a. Firmen, deren Namensvettern (gleicher Nachname,
  andere Stadt) es in Zefix ebenfalls gibt, sowie die oben genannten Fälle,
  die vorher fälschlich als Treffer durchgingen.
- **27 blieben ganz ohne Kandidaten** — überwiegend stark verkürzte
  SIX-Handelsnamen, die kein Suchwort mehr hergeben, das im Handelsregister
  trägt (`TITL BN BERG` für die Titlis Bergbahnen, `CIE FIN TR`,
  `STARRAGTORNOSGR`, `O FUESSLI`).

Zusammen mit den acht recherchierten Zeilen ergibt das **135 Firmen auf der
Karte von 224 kotierten Titeln** — die Zahl, die die Legende als erste nennt.

Für Titel ohne eindeutigen Sitz bleibt die Zeile in der CSV (Identität,
Namen, ISIN) — sie zählt zur Abdeckungsangabe als „noch nicht recherchiert",
erscheint aber **nicht** auf der Karte: keine Koordinaten heisst kein Marker
(`companies.build_artifact()` überspringt Zeilen ohne `lon`/`lat`), statt an
einer erfundenen Position zu erscheinen.

### Domizil im Ausland trotz CH-ISIN

Eine CH-ISIN sagt, über welche Nummernstelle ein Titel begeben wurde, nicht,
wo die Gesellschaft ihren Sitz hat. Ein im Ausland domiziliertes Unternehmen
mit CH-ISIN hätte gar keinen Zefix-Eintrag und könnte deshalb prinzipiell
keinen Sitz bekommen — es fiele stillschweigend unter „kein Treffer", ohne
dass die Ursache eine andere wäre als bei einem missglückten Namensabgleich.

**In diesem Lauf trat der Fall nicht auf:** alle 202 Gesellschaften tragen
eine CH-ISIN, und jede der 135 gefundenen Adressen hat eine vierstellige
Schweizer PLZ (geprüft, nicht angenommen). Der Abschnitt bleibt trotzdem
stehen, weil die 27 „kein Treffer" diese Ursache nicht ausschliessen: die
Pipeline unterscheidet nicht zwischen „nicht gefunden" und „gibt es hier
nicht zu finden". Wer die Abdeckung weiter erhöhen will, muss diese 27 von
Hand ansehen — automatisch auseinanderhalten lassen sie sich nicht.

### Geteilte Sitzadressen

Mehrere kotierte Gesellschaften am selben Sitz sind real (Konzern-
Geschwister, Fiduziaradressen) und kein Fehler — aber meldenswert, weil
zwei Marker an identischen Koordinaten übereinander liegen und wie einer
aussehen. `companies-sync` gibt sie deshalb am Ende jedes Laufs aus, statt
sie stillschweigend zu übernehmen. Im Lauf vom 14. August 2026 waren es zwei:

```
Rue Georges-Jordil 4, 1700 Fribourg: AEVIS VICTORIA SA, Infracore SA
Industriestrasse 66, 6300 Zug:       Metall Zug AG, V-ZUG Holding AG
```

Beide Paare sind sachlich korrekt (Infracore ist die Immobiliengesellschaft
der AEVIS-Gruppe, V-ZUG wurde 2020 von Metall Zug abgespalten und teilt den
Sitz weiterhin).

### Geokodierung: gecacht, aber nicht ohne Fallstrick

Die 202-8=194 neu gefundenen Adressen wurden über denselben swisstopo-
`SearchServer` geokodiert wie die ursprünglichen acht (`geocode.py`) —
gecacht in der CSV (`lon`/`lat`), ein erneuter `zeigmers-etl
companies`/`all`-Lauf geokodiert nichts doppelt. Ein Fehlschlag entdeckt
dabei einen echten Fallstrick: Swisscoms Zefix-Adresse trägt die postalische
PLZ **3050 Bern** (eine reine Postfach-Sammel-PLZ), swisstopos
Gebäudeadressverzeichnis kennt das Gebäude nur unter der geografischen PLZ
**3048 Worblaufen** — dieselbe Anfrage mit einem Komma zwischen Strasse und
PLZ/Ort findet es trotzdem (fuzzy match), ohne Komma nicht. `geocode_query`
trägt seither ein Komma; `geocode.fill_missing()` bricht ausserdem nicht mehr
beim ersten Fehlschlag den gesamten Lauf ab (sonst hätte eine einzelne
unauffindbare Adresse alle zuvor erfolgreich geokodierten Zeilen eines Laufs
verworfen, da nichts zwischendurch persistiert wird) — eine Zeile, die auch
nach Wiederholung nicht geokodierbar ist, verliert nur ihren eigenen
Sitz/Marker, nicht der ganze Build.

### Die Säulenhöhe rechnet in CHF, das Panel zeigt das Original

Ansicht A vergleicht Geld über die Höhe der Säulen. Solange nur acht Aargauer
Firmen darauf standen, war der Währungsmix eine Fussnote. National steht
Nestlé (CHF 89'490 Mio.) neben Novartis (USD 45'335 Mio. umgerechnet) und
Richemont (EUR) — dann vergleicht die Höhe Beträge, die nicht dasselbe messen.
Ein USD-Betrag, als wäre er CHF gezeichnet, überzeichnet die Firma 2025 um
rund ein Fünftel.

Deshalb: **die Höhe rechnet in CHF, das Panel zeigt die berichtete Zahl in
ihrer Originalwährung.** Umgerechnet lässt sich vergleichen, im Original lässt
sich nachprüfen. Schon unter den ursprünglichen acht ändert das die Rangfolge:
Accelleron (USD 1'263 Mio.) steht nun unter Siegfried (CHF 1'328 Mio.) statt
darüber.

Kurs ist der **Jahresmittelkurs der Schweizerischen Nationalbank**
(Datenwürfel `devkum`, Reihe `M0` = Monatsdurchschnitt), gemittelt über die
Monate des Geschäftsjahres — ein Jahresmittel passt zu einer Erfolgsrechnung,
die über das Jahr entsteht, anders als ein Stichtagskurs, der einen Tag
überbetont. Für 2025: **EUR 0.9371, USD 0.8314** (`etl/src/zeigmers_etl/fx.py`).

**Abweichende Geschäftsjahre bekommen ein rollendes Fenster.** Logitechs
Geschäftsjahr 2025/26 lief von April 2025 bis März 2026; die CSV führt nur
das Endjahr 2026, von dem beim Bauen erst sieben Monate vorlagen. Über diese
sieben zu mitteln hiesse, einen Kurs zu verwenden, der den Zeitraum gar nicht
abdeckt — 0.79 statt der rund 0.81, die das Geschäftsjahr trafen, also 2.5 %
zu wenig. Stattdessen nimmt `rate()` die letzten zwölf verfügbaren
Monatsdurchschnitte (USD/2026: **0.7943**), und `window` hält fest, welches
Fenster benutzt wurde. Das bleibt eine Näherung: exakt wäre April bis März,
und dafür müsste die CSV den Monat des Geschäftsjahresendes führen, den heute
niemand recherchiert. Ein volles Jahr am aktuellen Rand ist näher an jedem
abweichenden Geschäftsjahr als ein Rumpfjahr — und bleibt eine belegte
Grösse statt eines geschätzten Kurses.

Beim Bauen fast danebengegangen: der SNB-Datensatz enthält zwei Reihen, `M0`
(Monatsdurchschnitt) und `M1` (Monatsendkurs). Beide zusammen zu mitteln
ergäbe eine Grösse, die es nicht gibt — aufgefallen nur, weil ein Jahr dann
24 statt 12 Werte hatte.

Zwei Zusicherungen hält der Code, statt sie zu versprechen:

- **Maximum und Einzelhöhen stammen aus derselben Grösse.** Ein Maximum in
  CHF neben Höhen in Berichtswährung wäre der Fehler, den Ansicht B schon
  einmal hatte (jede Detailstufe auf ihr eigenes Maximum normiert).
- **Halb umgerechnet gibt es nicht.** Bleibt eine einzige Umrechnung offen,
  fällt die ganze Ansicht auf die Berichtswährungen zurück (`revenueInChf`),
  statt zwei Massstäbe nebeneinanderzustellen, ohne dass man es sieht. Eine
  Berichtswährung ohne hinterlegte SNB-Reihe bricht mit Meldung ab, statt
  einen Kurs zu schätzen.

### Recherche: recherchieren, widerlegen, übernehmen

Den Aargauer Standard — Umsatz, Gewinn, Beschäftigte, Kerngeschäft, jede Zahl
mit Quelle — auf alle Gesellschaften auszuweiten heisst rund 3'300 Werte.
Ein Pilotlauf über acht bewusst schwierige Firmen hat gezeigt, warum ein
einzelner Durchgang nicht genügt: **alle vier gegengelesenen Zeilen hatten
einen Fund**, und keiner davon war sichtbar.

| Firma | Fund |
|---|---|
| Avolta | 13'983 war «Turnover» (Nettoumsatz 13'760 plus 223 Mio. Werbeerträge), eingetragen als Nettoumsatz |
| Alcon | 25'000 Beschäftigte gerundet, das Filing nennt 25'942 |
| Clariant | 10'281 sind Vollzeitstellen, der Bericht hebt 10'449 Köpfe hervor |
| Barry Callebaut | Zahlen korrekt, Quelle war eine Medienmitteilung statt des Geschäftsberichts |

Daraus die Arbeitsweise: **recherchieren → widerlegen → übernehmen.** Der
Prüfdurchgang bekommt den Auftrag, die Zeile zu *widerlegen*, nicht sie zu
bestätigen, und holt die Zahlen unabhängig aus der Primärquelle, statt die
vorgelegten nachzuvollziehen.

Die Rechercheergebnisse liegen als ein JSON je Gesellschaft in
`data/manual/research/<SIX-Symbol>.json` — **im Repo, nicht im Verborgenen**:
sie sind der Nachweis, aus dem jede Zahl der Karte stammt, mit Quelle,
Zeilenbezeichnung im Bericht und dem, was beim Gegenlesen geprüft wurde.
`zeigmers-etl companies-merge` trägt sie in die CSV ein, mit drei
Zusicherungen:

- **Bereits recherchierte Zeilen bleiben unangetastet.** Die acht von Hand
  geprüften Zeilen sind das Teuerste in diesem Repo; ein maschineller Lauf
  darf sie nicht überschreiben, auch nicht mit zufällig richtigen Werten.
- **Identität und Sitz kommen nicht aus der Recherche**, sondern aus GLEIF.
  Eine Rechercheantwort, die einen Ort mitliefert, wird ignoriert, statt eine
  geprüfte Angabe durch eine ungeprüfte zu ersetzen.
- **`validate()` läuft vor dem Schreiben.** Ein Umsatz ohne Quelle fällt beim
  Übernehmen auf, nicht erst im nächsten Build.

### Die CSV wird national

`data/manual/ag_listed_companies.csv` ist `data/manual/listed_companies.csv`
gewichen — eine einzige, kantonsunabhängige Datei (`companies.csv_path()`
hängt nicht mehr an `config.CANTON`). Die acht ursprünglichen Zeilen sind
**byte- bzw. werttreu** übernommen, geprüft per Feld-für-Feld-Vergleich gegen
die vorherige `ag_listed_companies.csv` (0 Abweichungen) — die einzige
Änderung an ihnen ist die neue Spalte `researched=yes` am Ende jeder Zeile,
die es vorher nicht gab. Die CSV wird nie von Hand neu geschrieben: `uv run
--project etl zeigmers-etl companies-sync` gleicht die aktuelle SIX-Liste
gegen die CSV ab, hängt fehlende Titel an (nach demselben Zefix/LINDAS-
Verfahren wie oben) und lässt bestehende Zeilen unangetastet.

### Reproduzierbarkeit

Zwei vollständige, aufeinanderfolgende `zeigmers-etl all`-Läufe (bzw.
`npm run build:data`) erzeugen `companies.json` byte-identisch (`cmp`
geprüft) — jede der 194 neuen Zeilen trägt bereits gecachte Koordinaten,
kein Geokodierungs-Request wiederholt sich.

Der Sitzabgleich (`companies-sync`) war das dagegen zunächst **nicht**, und
zwar unbemerkt: `_SEAT_QUERY` begrenzte auf 300 Treffer, **ohne** zu
sortieren. Welche 300 der Treffer zurückkommen, ist bei einem `LIMIT` ohne
`ORDER BY` offen — zwei identische Läufe konnten verschiedene Teilmengen
erhalten und damit verschiedene Sitze in die CSV schreiben. Beobachtet an
„SWISS PRIME SITE": in einem Lauf zugeordnet, im nächsten nicht, ohne dass
sich am Code etwas geändert hatte. Das erklärte zugleich, warum ein blosser
Wiederholungslauf manchmal neue Sitze „fand" — er würfelte einen anderen
Ausschnitt, kein besseres Ergebnis. Mit `ORDER BY ?company` vor dem `LIMIT`
ist der Schnitt bestimmt (nicht vollständig — dagegen hilft nur ein
selteneres Suchwort), also derselbe Lauf wiederholbar; nachgemessen an drei
ins Limit laufenden Suchwörtern, deren Trefferlisten über zwei Abfragen
byte-identisch bleiben. **Kein anderes Artefakt in
`public/data/` ändert sich** (`git status --short public/data/` zeigt nur
`companies.json`) — Phase 3 rührt an keiner Zeile Grenzen- oder
STATENT-Verarbeitung.

## Kantonswechsel

Mit Phase 1 baut das ETL immer alle 26 Kantone — ein Kantonswechsel ändert
nicht mehr, **was** gebaut wird, sondern nur noch, welchen der bereits
gebauten 26 Kantone die Karte beim Start zeigt. `CANTON` in
`etl/src/zeigmers_etl/config.py` bedeutet seither: der Startkanton der
Karte (`meta.canton`, gelesen in `src/karte/basis.ts`) — nicht mehr, welche Gemeinden
und Grenzen das ETL berechnet. Bis Phase 3 hing auch der Pfad der Firmen-CSV
(`companies.csv_path()`) an `CANTON`; seit die CSV national ist (siehe „Phase
3" unten), ist `companies.csv_path()` von `CANTON` unabhängig.

Ein Kantonswechsel ist als Zweischritt gedacht:

1. `CANTON` in `etl/src/zeigmers_etl/config.py` auf den neuen Kanton setzen
   (`code`, `bfs_nr`, `name`). Gemeindegrenzen und -summen für diesen Kanton
   existieren bereits in `public/data/<code>_gemeinde.*`/
   `<code>_boundaries.geojson` — das ETL baut sie bei jedem Lauf für alle 26
   Kantone, unabhängig von `CANTON` (siehe oben).
2. Die Firmen-CSV entfällt als eigener Schritt: `data/manual/listed_companies.csv`
   ist seit Phase 3 national (eine Datei für alle 26 Kantone, siehe „Phase 3"
   unten) und ändert sich mit einem Startkantonwechsel nicht mehr. Ein neuer
   Startkanton zeigt seine dort bereits vorhandenen kotierten Firmen (falls
   welche recherchiert sind) automatisch; `zeigmers-etl companies-sync`
   ergänzt neu an der SIX gelistete Titel unabhängig vom Startkanton.

Danach `npm run build:data` laufen lassen (schreibt vor allem ein neues
`meta.json` und `companies.json` — die 26 Gemeinde-/Grenzen-Pakete ändern
sich dabei nicht, ausser ein neuer STATENT-/swissBOUNDARIES3D-Jahrgang
verändert ihren Inhalt). Das Frontend liest den Kantons-Code und -Namen
weiterhin selbst aus `public/data/meta.json` (`src/karte/basis.ts`, per
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

Das ist seit Phase 3 der einzige Schritt, den ein Kantonswechsel nicht
automatisiert — die Firmen-CSV betrifft ihn nicht mehr (siehe Schritt 2 oben).

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
| `npm run build:data` | Vollständiger ETL-Lauf (`zeigmers-etl all`): Grenzen, Hektarraster, Firmen — schreibt `public/data/` |
| `uv run --project etl zeigmers-etl companies-sync` | Neue SIX-Titel gegen Zefix/LINDAS abgleichen, CSV ergänzen (~15 Min., bestehende Zeilen bleiben unangetastet) |
| `uv run --project etl zeigmers-etl companies-retry` | Nur die bisher sitzlosen Zeilen erneut abgleichen (~3 Min.) — sinnvoll **nach** einer Verbesserung am Namensabgleich; ohne Codeänderung folgenlos, siehe „Reproduzierbarkeit" |
| `uv run --project etl zeigmers-etl companies-merge` | Recherchierte Kennzahlen aus `data/manual/research/` in die CSV übernehmen (bestehende Recherche bleibt unangetastet, `validate()` läuft vorher) |
| `npm run build` | Typprüfung + Produktions-Build (`dist/`) |
| `npm run dev` | Lokaler Entwicklungsserver mit Hot Reload |
| `npm test` | Frontend-Tests (Vitest) |
| `uv run --project etl pytest etl/tests` | ETL-Tests (Python) |

`npm run build:data` lädt beim ersten Lauf swissBOUNDARIES3D (37.4 MB gepackt)
sowie den STATENT-Datensatz (13.6 MB gepackt) herunter und dauert entsprechend
einige Minuten;
`data/manual/` (die Firmen-CSV) wird dabei nie gelöscht oder überschrieben,
ausser durch Nachgeokodierung fehlender Koordinaten in genau dieser Datei.
