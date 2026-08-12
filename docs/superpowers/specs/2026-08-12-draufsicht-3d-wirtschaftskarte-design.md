# Draufsicht — 3D-Wirtschaftskarte Kanton Aargau

**Datum:** 2026-08-12
**Status:** Design freigegeben
**Zweck des Produkts:** Technischer Machbarkeitsnachweis. Die Pipeline und die 3D-Darstellung sollen tragen; Politur der Oberfläche ist ausdrücklich nicht Teil des Auftrags.

---

## 1. Was gebaut wird

Eine statische, auf Netlify deploybare Website mit zwei 3D-Kartenansichten des Kantons Aargau, umschaltbar über einen Toggle. Der Toggle behält die Kameraposition bei, damit der Kontrast zwischen den Ansichten unmittelbar erlebbar ist.

**Ansicht A — «Die Sichtbaren».** Börsenkotierte Unternehmen mit Sitz im Kanton Aargau, je ein Balken am Hauptsitz. Höhe = Jahresumsatz (Konzernumsatz, letztes verfügbares Geschäftsjahr). Farbe = Branchengruppe. Klick öffnet ein Panel mit Name, Umsatz, Mitarbeitenden, Geschäftsjahr und Link auf den Geschäftsbericht.

**Ansicht B — «Die Vielen».** Hektarraster des Kantons, je ein Balken pro Hektare mit Beschäftigten. Höhe = Anzahl Beschäftigte. Farbe = dominante Branchengruppe. Klick öffnet ein Panel mit Beschäftigtenzahl, Branchenverteilung und Gemeinde.

Erwartete Grössenordnung: 8–12 Firmen in Ansicht A, geschätzt 20 000–25 000 besetzte Hektaren in Ansicht B. Die grosse Asymmetrie ist der Inhalt, nicht ein Fehler.

## 2. Nicht Teil dieses Piloten

- Kein Backend, kein Laufzeit-API-Schlüssel, keine Serverkomponente.
- Kein Scrollytelling, kein Einstiegs-Overlay, keine redaktionellen Begleittexte.
- Kein E2E-Test.
- Keine gekachelte Nachladelogik für die Hektardaten (erst ab Grössenordnung 10⁶ Zellen sinnvoll, also frühestens beim Sprung auf die ganze Schweiz).
- Keine mobile Optimierung über «nicht kaputt» hinaus.

---

## 3. Datenquellen (alle live geprüft am 2026-08-12)

| Quelle | Zugriff | Status |
|---|---|---|
| STATENT Geodaten 2023 (Hektarraster) | `https://dam-api.bfs.admin.ch/hub/api/dam/assets/36073031/master` (ZIP) | ✅ offen abrufbar |
| STATENT Variablenliste | `https://dam-api.bfs.admin.ch/hub/api/dam/assets/36073025/master` (XLSX) | ✅ |
| STATENT Datenbeschreibung | `https://dam-api.bfs.admin.ch/hub/api/dam/assets/36073026/master` | ✅ |
| swissBOUNDARIES3D | swisstopo STAC, Collection `ch.swisstopo.swissboundaries3d`, GPKG in LV95 | ✅ |
| Geokodierung | `https://api3.geo.admin.ch/rest/services/api/SearchServer` | ✅ |
| Zefix Firmendaten | `https://ld.admin.ch/query` (LINDAS SPARQL) | ✅ — **nicht** `ZefixPublicREST`, das liefert 401 und verlangt registrierte Credentials |
| SIX-Emittentenliste | kein offener Datensatz bekannt | ⚠️ siehe Abschnitt 8 |

Die Asset-IDs der jährlichen STATENT-Geodaten sind über die AEM-Model-API der BFS-Seite auflösbar:
`…/statistik-unternehmensstruktur-statent-ab-2011/jcr:content/root/main/section/container/tabs/item_3/compiledlist.model.json`.
Das ETL löst sie darüber auf, statt sie hartzukodieren, damit ein Jahrgangswechsel nicht am toten Link scheitert.

**Lizenz.** STATENT: freie Nutzung, Quellenangabe Pflicht, kommerzielle Nutzung nur mit Bewilligung des BFS. Der Quellenhinweis steht fix im Footer und ist nicht ausblendbar.

---

## 4. Repo-Struktur

```
Draufsicht/
├── etl/                          Python, uv-verwaltet
│   ├── pyproject.toml
│   ├── src/draufsicht_etl/
│   │   ├── config.py             CANTON, STATENT_YEAR, Asset-Auflösung, Spaltenmuster
│   │   ├── fetch.py              Downloads + SHA256-Manifest-Cache
│   │   ├── inspect_statent.py    Schritt 2: Spalten, dtypes, Wertebereiche
│   │   ├── boundaries.py         swissBOUNDARIES3D → vereinfachtes GeoJSON
│   │   ├── statent.py            Verschnitt, NOGA-Mapping, drei Aggregationsstufen
│   │   ├── companies.py          Kandidaten, Geokodierung, CSV-Validierung
│   │   ├── binpack.py            Bin-Writer
│   │   ├── sanity_map.py         2D-Choropleth PNG als Kontrolle
│   │   └── cli.py                Subkommandos, `all` führt alles aus
│   ├── noga_groups.json          einzige Quelle der Branche→Gruppe→Farbe-Zuordnung
│   └── tests/
├── data/
│   ├── raw/                      gitignored, Download-Cache
│   ├── interim/                  gitignored
│   └── manual/ag_listed_companies.csv     versioniert, von Hand gepflegt
├── public/data/                  committed Artefakte, Zielgrösse gesamt < 2 MB
│   ├── meta.json
│   ├── ag_kanton.bin  / ag_kanton.json
│   ├── ag_gemeinde.bin / ag_gemeinde.json
│   ├── ag_hektar.bin  / ag_hektar.json
│   ├── ag_boundaries.geojson
│   └── companies.json
├── src/                          Vite + Vanilla TS
│   ├── main.ts
│   ├── map.ts                    MapLibre + deck.gl Overlay, ViewState-Besitzer
│   ├── layers/visible.ts         Ansicht A
│   ├── layers/many.ts            Ansicht B inkl. LOD-Überblendung
│   ├── data/loader.ts            .bin + .json → deck.gl Binary Attributes
│   ├── domain/noga.generated.ts  aus etl/noga_groups.json erzeugt, nicht von Hand editiert
│   ├── domain/scale.ts           log/linear
│   └── ui/{toggle,legend,panel,notices,error}.ts
├── netlify.toml
└── README.md
```

**Build-Aufteilung.** `npm run build:data` ruft `uv run draufsicht-etl all` auf. Netlify führt nur `vite build` aus; die fertigen Artefakte liegen versioniert im Repo. Andernfalls zöge jeder Deploy ein ~60-MB-BFS-ZIP und eine vollständige Python-Toolchain durch die Netlify-Build-Umgebung.

**Modulgrenzen.** Jede ETL-Datei hat einen Ein- und Ausgabevertrag in Form von Dateipfaden und einem typisierten Rückgabewert; keine geteilten Globals. Im Frontend besitzt `map.ts` als einziges Modul den `viewState`; die Layer-Module sind reine Funktionen `(daten, uiState) → Layer[]` und kennen weder MapLibre noch das DOM.

---

## 5. Binärformat

Pro LOD-Stufe ein Paar `<level>.bin` + `<level>.json`. Die `.bin` ist die Konkatenation typisierter Arrays; die `.json` nennt Byte-Offsets, Längen und Typen. deck.gl konsumiert sie als `data: { length, attributes: {…} }` ohne Umkopieren.

| Array | Typ | Inhalt |
|---|---|---|
| `positions` | Float32 ×2N | lon, lat in WGS84. Float32 löst bei lon ≈ 8 auf rund 0.1 m auf — für ein 100-m-Raster reichlich |
| `values` | Float32 ×N | Beschäftigte |
| `noga` | Uint8 ×N | Index in die Branchengruppen-Tabelle; `255` = klassiert/unbekannt |
| `flags` | Uint8 ×N | Bit 0 = datenschutz-klassiert |
| `gemeindeIdx` | Uint16 ×N | nur Hektarstufe; Verweis auf die Gemeindenamen-Tabelle im JSON |
| `mixGroup` | Uint8 ×3N | nur Hektarstufe; Gruppenindizes der Top-3 |
| `mixValue` | Uint16 ×3N | nur Hektarstufe; zugehörige Beschäftigtenzahlen |
| `dist` | Float32 ×(G·N) | nur Kantons- und Gemeindestufe; volle Verteilung über alle G Gruppen |

Begleitendes JSON:

```json
{
  "level": "hektar",
  "year": 2023,
  "count": 23145,
  "canton": "AG",
  "arrays": { "positions": {"byteOffset": 0, "length": 46290, "type": "Float32"}, "…": {} },
  "nogaGroups": ["Land-/Forstwirtschaft", "…"],
  "gemeinden": [{"bfsNr": 4001, "name": "Aarau"}],
  "stats": {"min": 1, "max": 4820, "sum": 371002, "p99": 340,
            "classifiedCells": 8123}
}
```

**Branchenverteilung im Klick-Panel.** Auf Gemeindestufe wird die volle Verteilung über alle Gruppen abgelegt (196 × 11 × Float32 ≈ 9 KB, vernachlässigbar). Auf Hektarstufe nur die **Top-3-Gruppen plus Rest** (3 × (Uint8 + Uint16) = 9 B/Zelle, bei 25 000 Zellen ≈ 225 KB). Das ist eine bewusste Verkürzung, keine Schätzung; das Panel beschriftet sie ausdrücklich als «Top 3 von N Gruppen».

---

## 6. STATENT-Verarbeitung

### 6.1 Inspektion vor Transformation

Kein Spaltenname wird vor der Inspektion hartkodiert. `draufsicht-etl inspect-statent` lädt Geodaten und Variablenliste und gibt aus:

- Dateiliste im ZIP mit Grössen
- alle Spaltennamen mit dtype, min, max, Nullanteil, Anzahl eindeutiger Werte
- Zeilenzahl
- die Variablenliste als lesbare Tabelle

`config.py` enthält nur **Muster** (`B{yy}…T` für Totalwerte und Verwandte), keine festen Namen. Der Inspektionsschritt verifiziert jedes Muster gegen die tatsächlichen Spalten und bricht mit einer Meldung ab, die den erwarteten und den gefundenen Spaltensatz nennt. Die Benennung ändert je Jahrgang; dieser Mechanismus ist der Grund dafür, dass ein Jahrgangswechsel keine Codeänderung erfordert.

### 6.2 Geometrie

- `E_KOORD` / `N_KOORD` bezeichnen die **Südwest-Ecke** der Hektare. Für die Balkenposition **+50 m in beiden Achsen**, dann Reprojektion EPSG:2056 → EPSG:4326 mit pyproj. Die Reprojektion passiert ausschliesslich im ETL, nie zur Laufzeit.
- Kantonsfilter über räumlichen Verschnitt: `sjoin(predicate="within")` der Hektarzentren gegen die AG-Kantonsfläche aus swissBOUNDARIES3D. **Keine Koordinaten-Bounding-Box.** Die Gemeindezuordnung fällt im selben Join an.
- Grenzen werden nach EPSG:4326 reprojiziert und mit mapshaper vereinfacht (Visvalingam, Zieltoleranz so gewählt, dass das GeoJSON unter 300 KB bleibt und Gemeindegrenzen bei Zoom 12 noch sauber aussehen).

### 6.3 Datenschutz-Klassierung

Hektarwerte von 1 bis 4 werden vom BFS aus Datenschutzgründen klassiert statt exakt ausgewiesen. **Ob das als Code, als Wert oder als separates Suppressions-Flag geliefert wird, entscheidet die Variablenliste — nicht eine Vorabannahme.** Der Inspektionsschritt legt die tatsächliche Kodierung offen und wird vor dem Schreiben der Transformation vorgelegt.

Vorgesehene Behandlung, sofern die Inspektion nichts anderes nahelegt:

- `flags |= 1`, `noga = 255`
- Farbe neutralgrau `#999999`
- Höhe: **fixe Minimalhöhe**, nicht ein geratener oder interpolierter Wert. Damit ist sichtbar, dass dort etwas ist, ohne eine Menge zu behaupten. Konkret: eine Konstante `UNKNOWN_BAR_HEIGHT`, gesetzt auf 40 % der Höhe, die der kleinste exakt ausgewiesene Wert (5 Beschäftigte) auf der aktiven Skala erhält. Dieselbe Konstante gilt für Hinweis-Balken in Ansicht A (Abschnitt 8.3), damit «unbekannt» in beiden Ansichten gleich aussieht.
- In den Aggregaten auf Gemeinde- und Kantonsstufe fliessen klassierte Zellen **nicht** in die Summe ein. Stattdessen führt jede Aggregatzeile ein Feld `classifiedCells`, und das Panel weist getrennt aus: «zusätzlich N Hektaren mit 1–4 Beschäftigten, Wert nicht ausgewiesen».
- Die Legende benennt die graue Kategorie explizit.

Diese Behandlung interpoliert nicht und rät nicht. Sie hat den Preis, dass die Gemeindesummen eine bekannte, quantifizierte Untergrenze sind statt exakter Werte — das ist im Panel und in der Legende so benannt.

### 6.4 Aggregation

Drei Stufen aus derselben Quelle, alle im ETL berechnet:

| Stufe | Zeilen | Wert | Farbe |
|---|---|---|---|
| Kanton | 1 | Σ Beschäftigte AG (bekannte Werte) | dominante Gruppe |
| Gemeinde | ~196 | Σ je Gemeinde | dominante Gruppe je Gemeinde |
| Hektare | ~20 000–25 000 | Wert je Hektare | dominante Gruppe je Hektare |

Invariante, als Test geprüft: `Σ Hektar = Σ Gemeinde = Kanton`, jeweils über die bekannten Werte, mit separat übereinstimmender Bilanz der klassierten Zellen.

---

## 7. Branchen und Farben

Okabe-Ito umfasst acht Farben, NOGA hat 21 Abschnitte (A–U). Das geht nicht auf. Die Abschnitte werden auf **11 Gruppen** zusammengefasst:

| Gruppe | NOGA-Abschnitte |
|---|---|
| Land-/Forstwirtschaft | A |
| Industrie | B, C, D, E |
| Bau | F |
| Handel | G |
| Verkehr/Logistik | H |
| Gastgewerbe | I |
| Information/Kommunikation | J |
| Finanz/Versicherung | K |
| Unternehmensdienstleistungen | L, M, N |
| Öffentlich/Bildung/Gesundheit | O, P, Q |
| Übrige | R, S, T, U |

Zugeordnet auf die acht Okabe-Ito-Töne plus drei ergänzte, gegen Deuteranopie und Protanopie geprüfte Farben. Die Zuordnung lebt **einmal**, in `etl/noga_groups.json`, und wird beim Build nach `src/domain/noga.generated.ts` geschrieben. Beide Ansichten benutzen zwingend dieselbe Tabelle. `#999999` ist für «klassiert/unbekannt» reserviert und wird nie einer Branche zugewiesen.

---

## 8. Ansicht A — kotierte Unternehmen

### 8.1 CSV-Schema

`data/manual/ag_listed_companies.csv`, versioniert, von Hand nachprüfbar:

```
uid, name, six_symbol, isin, street, zip, city,
lon, lat, geocode_query,
noga_group,
revenue, revenue_currency, revenue_unit,
employees, fiscal_year, report_url, note
```

### 8.2 Kandidatenherleitung

Namen werden nicht geraten. SIX-kotierte Gesellschaften werden über die UID mit den Zefix-Daten gejoint und auf Kanton AG gefiltert. Zefix wird über **LINDAS SPARQL** (`https://ld.admin.ch/query`) angesprochen, weil `ZefixPublicREST` registrierte Credentials verlangt (401).

Für die SIX-Seite ist kein offener Datensatz bekannt. Vorgehen: maschinelles Abrufen der Emittentenliste von six-group.com; scheitert das, wird eine im Repo dokumentierte, mit Abrufdatum versehene Symbolliste gepflegt und gegen LINDAS abgeglichen. Das Zwischenergebnis liegt in `data/interim/ag_candidates.csv`.

### 8.3 Finanzzahlen

Umsatz und Mitarbeitende stammen aus dem jeweils letzten Geschäftsbericht, mit Geschäftsjahr, Währung und Quell-URL pro Zeile. Keine Sekundärquellen, keine Schätzungen.

Eine `verified`-Spalte ist auf ausdrückliche Entscheidung **nicht** vorgesehen. Das Risiko einer fehlerhaft aus einem Geschäftsbericht übernommenen Zahl bleibt damit unmarkiert; die Rückverfolgbarkeit über `report_url` ist der einzige Kontrollmechanismus.

Ist eine Zahl nicht auffindbar, bleibt das Feld leer und die Firma erscheint trotzdem — als grauer **Hinweis-Balken** mit fixer Höhe, dessen Panel «Umsatz nicht öffentlich verfügbar» ausweist. Firmen werden nie weggelassen.

### 8.4 Geokodierung

Die Domiziladresse wird über den swisstopo SearchServer geokodiert und das Ergebnis in `lon`/`lat` persistiert. Erneut geokodiert wird ausschliesslich, wo `lon` leer ist — damit bleibt der Build reproduzierbar und unabhängig von der Verfügbarkeit des Dienstes.

### 8.5 Erzwungene Validierung

Der ETL **bricht ab**, wenn eine Zeile mit gesetztem `revenue` kein `report_url` oder kein `fiscal_year` hat. Damit ist das Abnahmekriterium «jede Zahl ist auf eine Quell-URL zurückführbar» maschinell durchgesetzt statt nur zugesagt.

---

## 9. Frontend

**Stack.** Vite + Vanilla TS. MapLibre GL JS als Basiskarte, deck.gl über `MapboxOverlay` im interleaved-Modus. Keine zweite Kartenbibliothek.

**Basemap.** swisstopo Vektorkacheln, `https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json` — schlüsselfrei. Der Style wird zur Laufzeit von swisstopo geladen; fällt er aus, rendert die Karte auf einfarbigem Grund weiter und zeigt einen Hinweis.

**Layer.** Je LOD-Stufe ein `ColumnLayer` mit `diskResolution: 4` und `angle: 45` (achsparallele Quadrate, passend zum Raster), `extruded: true`, `material: false` für flaches, günstigeres Shading. Alle drei Stufen werden beim Start geladen (zusammen unter 2 MB) und existieren dauerhaft.

**LOD-Überblendung.**

| Zoom | sichtbar |
|---|---|
| ≤ 8.625 | nur Kanton |
| 8.625 – 9.375 | Kanton → Gemeinde, linear überblendet |
| 9.375 – 11.625 | nur Gemeinde |
| 11.625 – 12.375 | Gemeinde → Hektare, linear überblendet |
| ≥ 12.375 | nur Hektare |

Die Übergänge liegen mittig auf Zoom 9 und Zoom 12, mit einer Breite von 0.75 Zoomstufen. Überblendet wird über Opacity **und** Höhe, damit die abtretende Stufe nicht als flacher Geisterteppich stehen bleibt. Kein hartes Umschalten.

**Toggle A ↔ B.** Tauscht ausschliesslich die Layer-Menge. Der `viewState` wird nicht angefasst — das ist der Punkt der Übung.

**Höhenskala.** Logarithmisch als Default: `h = log10(1 + v) / log10(1 + vmax) · H`. Umschalter auf linear. Die Legende nennt die aktive Skala unmissverständlich und zeigt drei Referenzhöhen mit echten Zahlen.

**Legende.** Fix eingeblendet, nicht ausblendbar: Branchenfarben, graue Klassiert-Kategorie, Höhenmassstab mit aktiver Skala, Datenjahr, Quellenangabe.

**Pflichthinweise.** Beide Sätze sind sichtbarer Bestandteil der jeweiligen Ansicht, nicht in ein Info-Panel versteckt:

1. Ansicht A: Der dargestellte Umsatz ist der **weltweite Konzernumsatz**, nicht die Wertschöpfung am Standort.
2. Ansicht B: Hektaren mit **vier oder weniger** Beschäftigten sind aus Datenschutzgründen nur klassiert verfügbar und deshalb gesondert markiert.

---

## 10. Fehlerbehandlung

**ETL.** Downloads werden in `data/raw/` gecacht, gegen ein SHA256-Manifest geprüft und bei erneutem Lauf nicht neu geladen; `--force` erzwingt. Jeder Schritt bricht laut ab statt still weiterzumachen: fehlende oder unerwartete Spalte, leeres Verschnittergebnis, Geokodierung ohne Treffer, CSV-Zeile ohne Quell-URL. Fehlermeldungen nennen den erwarteten und den gefundenen Zustand.

**Frontend.** Fehlt ein Artefakt oder ist es nicht parsbar, erscheint eine sichtbare Fehlerbox mit dem Dateinamen — nie eine stumm leere Karte.

---

## 11. Tests

**ETL (pytest).**
- Reprojektion gegen einen bekannten LV95↔WGS84-Referenzpunkt
- SW-Ecke → Zentrum-Offset (+50 m) an einem konstruierten Fall
- Aggregations-Invariante: Σ Hektar = Σ Gemeinde = Kanton über die bekannten Werte, klassierte Zellen separat und übereinstimmend bilanziert
- Bin-Roundtrip: schreiben → lesen ergibt bitgleiche Arrays
- CSV-Validierung schlägt bei fehlender `report_url` fehl
- Spaltenmuster-Auflösung schlägt bei unbekanntem Jahrgangsschema fehl

**Frontend (vitest).**
- `scale.ts`: log und linear, Randfälle v=0 und v=vmax
- `noga.ts`: alle 21 NOGA-Abschnitte abgedeckt, keine Farbdopplung, Grau nie einer Branche zugewiesen
- `loader.ts`: Bin-Parsing gegen eine Fixture

Kein E2E-Test — der Auftrag ist ein Machbarkeitsnachweis.

---

## 12. Erweiterbarkeit auf andere Kantone

`etl/src/draufsicht_etl/config.py`:

```python
CANTON = {"code": "AG", "bfs_nr": 19, "name": "Aargau"}
STATENT_YEAR = 2023
```

Alles Weitere leitet sich daraus ab: Kantonsfläche, Gemeindeliste, Artefaktnamen, Titel. Einzige Handarbeit pro Kanton bleibt das `<code>_listed_companies.csv`. Das README dokumentiert den Wechsel als Dreischritt: Konfiguration ändern, CSV anlegen, `npm run build:data`.

---

## 13. Abnahmekriterien

1. `npm run build:data && npm run build` läuft aus leerem Zustand durch.
2. Die Hektaransicht bleibt beim Drehen und Zoomen flüssig; Ziel 60 fps auf einem Laptop ohne dedizierte GPU.
3. Jede Zahl in Ansicht A ist auf eine Quell-URL im CSV zurückführbar; der ETL erzwingt das.
4. Das README dokumentiert den Kantonswechsel.
5. Beide Pflichthinweise sind in der jeweiligen Ansicht sichtbar, ohne Interaktion.
6. Die Artefakte für `public/data/` bleiben zusammen unter 2 MB.

---

## 14. Reihenfolge der Umsetzung

Nach jedem Schritt wird ein Ergebnis vorgelegt, bevor der nächste beginnt.

1. Repo-Gerüst, Datenverzeichnisse, Build-Skripte
2. Download und Inspektion der STATENT-Rohdaten — **tatsächliche Spaltennamen und Wertebereiche werden vorgelegt, bevor die Transformation geschrieben wird**
3. ETL Ansicht B bis Gemeindestufe, mit statischer 2D-Choroplethenkarte als Sanity-Check
4. deck.gl-3D-Ansicht Gemeindestufe
5. Hektarstufe plus LOD-Logik
6. Ansicht A inklusive manuellem CSV und Geokodierung
7. Toggle, Legende, Panels, Pflichthinweise
8. Netlify-Konfiguration und README mit Datenherkunft und Aktualisierungsanleitung

---

## 15. Bekannte Risiken

| Risiko | Umgang |
|---|---|
| Kodierung der Datenschutz-Klassierung erst nach Inspektion bekannt | Schritt 2 legt sie offen und wird vorgelegt, bevor Abschnitt 6.3 festgezurrt wird |
| SIX-Emittentenliste maschinell nicht zugänglich | Fallback auf eine dokumentierte, datierte Symbolliste im Repo |
| Fehlerhaft übernommene Umsatzzahl bleibt unmarkiert | Bewusst akzeptiert; `report_url` pro Zeile ist der einzige Kontrollmechanismus |
| Hektarzahl weicht deutlich von der Schätzung ab | Binärformat und LOD-Ansatz tragen bis mindestens 10⁵ Zellen; darüber wäre Kachelung nachzurüsten |
| swisstopo-Vektorkacheln fallen aus | Karte rendert auf einfarbigem Grund weiter, mit Hinweis |
