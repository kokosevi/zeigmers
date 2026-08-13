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
| `noga` | Uint8 ×N | Index in die Branchengruppen-Tabelle; `255` = dominante Gruppe nicht bestimmbar |
| `flags` | Uint8 ×N | Bit 0 = `AMBIGUOUS` (`emp_total == 4`, wahrer Wert 1–4) |
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
  "stats": {"min": 4, "max": 4820, "sum": 371002, "p99": 340,
            "ambiguousCells": 8123, "overstatementMax": 24369}
}
```

**Branchenverteilung im Klick-Panel.** Auf Gemeindestufe wird die volle Verteilung über alle Gruppen abgelegt (196 × 11 × Float32 ≈ 9 KB, vernachlässigbar). Auf Hektarstufe nur die **Top-3-Gruppen plus Rest** (3 × (Uint8 + Uint16) = 9 B/Zelle, bei 25 000 Zellen ≈ 225 KB). Das ist eine bewusste Verkürzung, keine Schätzung; das Panel beschriftet sie ausdrücklich als «Top 3 von N Gruppen».

---

## 6. STATENT-Verarbeitung

### 6.1 Variablenstruktur (Variablenliste gelesen am 2026-08-13)

Die Variablenliste (Asset `36073025`, Blatt `STATENT_NOGA_2008`, Stand 2025-08-21) ist ausgewertet. Das Hektarfile führt folgende Variablenformen, wobei `{nn}` der Nomenklatur-/Jahrgangspräfix (in der Variablenliste durchgehend `08`) und `{dd}` die zweistellige NOGA-Abteilung ist:

| Form | Bedeutung | Anzahl |
|---|---|---|
| `RELI` | Primärschlüssel (Stellen 2–5 der E- und N-Koordinate) | 1 |
| `E_KOORD`, `N_KOORD` | LV95-Meterkoordinaten, **Südwest-Ecke** der Hektare | 2 |
| `GMDE`, `GMDE_HIST` | BFS-Gemeindenummer, historisiert | 2 |
| `ERHJAHR`, `PUBJAHR` | Erhebungs-, Publikationsjahr | 2 |
| `B{nn}T`, `B{nn}S1..S3` | Arbeitsstätten total und je Wirtschaftssektor | 4 |
| `B{nn}EMPT`, `B{nn}EMP{F,M}S{1,2,3}` | Beschäftigte total, nach Sektor und Geschlecht | 10 |
| `B{nn}VZAT`, … | Vollzeitäquivalente, analog | 10 |
| `B{nn}EMP{OF,PR}{T,F,M}`, `B{nn}EMP{NM,UM}{T,F,M}` | öffentlich/privat, markt-/nicht-marktwirtschaftlich | 12 |
| `B{nn}{dd}AS` | Arbeitsstätten je Abteilung | 85 |
| **`B{nn}{dd}EMP`** | **Beschäftigte je NOGA-Abteilung** | **85** |
| `B{nn}{dd}VZA` | Vollzeitäquivalente je Abteilung | 85 |
| `B{nn}{dd}KB1..KB4` | Arbeitsstätten je Grössenklasse und Abteilung | 340 |

Damit liegt die Branchenzusammensetzung **auf Abteilungsebene (2-Steller)** vor, nicht nur nach den drei Wirtschaftssektoren. Abteilungen mappen deterministisch auf NOGA-Abschnitte A–U und damit auf die 11 Gruppen aus Abschnitt 7. Die Farbcodierung nach Branche ist auf Hektarstufe also uneingeschränkt möglich.

### 6.2 Spaltenauflösung

Kein Spaltenname wird hartkodiert. `config.py` enthält **Muster**; `columns.py` löst sie gegen die tatsächlichen Spalten des geladenen Jahrgangs auf und schreibt das Ergebnis nach `etl/columns/statent_<jahr>.json` (versioniert, nachprüfbar):

```python
COLUMN_PATTERNS = {
    "reli":      r"^RELI$",
    "e_koord":   r"^E_KOORD$",
    "n_koord":   r"^N_KOORD$",
    "gmde":      r"^GMDE$",
    "emp_total": r"^B(?P<nn>\d{2})EMPT$",
    "emp_div":   r"^B(?P<nn>\d{2})(?P<div>\d{2})EMP$",
}
```

Der Präfix `{nn}` muss über alle aufgelösten Spalten **identisch** sein, sonst bricht die Auflösung ab. Fehlt eine Rolle oder trifft ein Muster mehrdeutig, bricht sie ebenfalls ab und nennt erwarteten wie gefundenen Spaltensatz. Ein Jahrgangswechsel erfordert damit keine Codeänderung.

`draufsicht-etl inspect-statent` gibt zusätzlich Dateiliste im ZIP, alle Spalten mit dtype, min, max, Nullanteil und Zeilenzahl aus.

### 6.3 Geometrie

- `E_KOORD` / `N_KOORD` bezeichnen die **Südwest-Ecke** der Hektare. Für die Balkenposition **+50 m in beiden Achsen**, dann Reprojektion EPSG:2056 → EPSG:4326 mit pyproj. Die Reprojektion passiert ausschliesslich im ETL, nie zur Laufzeit.
- Kantonsfilter über räumlichen Verschnitt: `sjoin(predicate="within")` der Hektarzentren gegen die AG-Kantonsfläche aus swissBOUNDARIES3D. **Keine Koordinaten-Bounding-Box.**
- Gemeindezuordnung über die mitgelieferte Spalte `GMDE` (BFS-Gemeindenummer), nicht über den Verschnitt — sie ist autoritativ und immun gegen Jahrgangsunterschiede zwischen STATENT und swissBOUNDARIES3D. Der räumliche Join liefert die Gemeinde zusätzlich; das ETL vergleicht beide und **meldet die Anzahl der Abweichungen** als Warnung, statt einer Quelle blind zu trauen. Verwendet wird `GMDE`.
- Grenzen werden nach EPSG:4326 reprojiziert und mit mapshaper vereinfacht (Visvalingam, Zieltoleranz so gewählt, dass das GeoJSON unter 300 KB bleibt und Gemeindegrenzen bei Zoom 12 noch sauber aussehen).

### 6.4 Datenschutz: Aufrundung kleiner Werte

Die Variablenliste nennt die Regel wörtlich:

> Datenschutzmassnahmen: Allen Werten < 4 wird die Zahl 4 zugeordnet

Das ist **kein Suppressions-Code und keine Klassierung, sondern ein Aufrunden**. Die ursprüngliche Annahme des Briefings («≤ 4 werden klassiert ausgewiesen») trifft nicht zu. Daraus folgt:

- Werte 1, 2 und 3 erscheinen in den Daten als 4. Werte ab 5 sind exakt.
- Eine Zelle mit dem Wert 4 ist **mehrdeutig**: ihr wahrer Wert liegt zwischen 1 und 4. Es gibt kein Flag; erkennbar ist das allein am Wert.
- Die Regel gilt **auch je NOGA-Abteilung**. Eine Zelle mit vier verstreuten Kleinstbetrieben in vier Abteilungen zeigt in jeder dieser Abteilungen eine 4. Die Summe über 85 Abteilungen überschätzt die Zelle daher grob.

**Zwingende Konsequenz für die Verarbeitung:**

1. Die **Höhe kommt ausschliesslich aus der Totalspalte** `B{nn}EMPT`. Die Abteilungsspalten werden nie aufsummiert, um ein Total zu bilden.
2. Die Abteilungsspalten bestimmen **nur die Mischung**: dominante Gruppe und Top-3. Die daraus abgeleiteten Anteile werden **auf das Total normiert** (`anteil_g = emp_div_g / Σ emp_div`), und die im Panel gezeigten absoluten Zahlen sind `anteil_g · emp_total`. Sie sind als abgeleitete Näherung beschriftet, nicht als ausgewiesener Wert.
3. Zellen mit `emp_total == 4` bekommen `flags |= 1` (`AMBIGUOUS`). Sie behalten Farbe und Höhe des Werts 4 — das ist der **vom BFS publizierte Wert**, keine Erfindung und keine Interpolation. Zusätzlich werden sie über eine sichtbare Randmarkierung und in der Legende als «Wert 4 = 1 bis 4, exakter Wert nicht ausgewiesen» kenntlich gemacht.
4. Ist bei einer solchen Zelle auch die Abteilungsmischung mehrdeutig (alle Abteilungswerte gleich 4), wird `noga = 255` gesetzt und die Zelle grau `#999999` gezeichnet, weil eine dominante Branche nicht bestimmbar ist.

**Offenlegung der Überschätzung.** Weil kleine Werte aufgerundet sind, ist jede Summe eine **Obergrenze**, keine exakte Zahl. Das ETL berechnet je Aggregatstufe zusätzlich `ambiguousCells` und `overstatementMax = 3 · ambiguousCells` (der maximale Betrag, um den die Summe zu hoch sein kann). Panel und Legende weisen ihn aus: «Summe X, davon bis zu Y durch Aufrundung kleiner Werte». Damit ist die Unschärfe beziffert statt verschwiegen.

Es wird nichts interpoliert und nichts geraten; dargestellt werden die publizierten Werte, samt quantifizierter Unschärfe.

**Anmerkung zur Konstante `UNKNOWN_BAR_HEIGHT`:** Sie wird für Ansicht B nicht mehr benötigt, da dort ein publizierter Wert vorliegt. Sie bleibt allein für die Hinweis-Balken in Ansicht A (Firmen ohne auffindbaren Umsatz, Abschnitt 8.3) und ist dort definiert als 40 % der Höhe des kleinsten dargestellten Umsatzes auf der aktiven Skala.

### 6.5 Aggregation

Drei Stufen aus derselben Quelle, alle im ETL aus den Hektarwerten berechnet:

| Stufe | Zeilen | Wert | Farbe |
|---|---|---|---|
| Kanton | 1 | Σ `emp_total` über alle AG-Hektaren | dominante Gruppe |
| Gemeinde | ~196 | Σ `emp_total` je `GMDE` | dominante Gruppe je Gemeinde |
| Hektare | ~20 000–25 000 | `emp_total` je Hektare | dominante Gruppe je Hektare |

Auf Gemeinde- und Kantonsstufe wird die Branchenmischung als Summe der **normierten** Abteilungsbeiträge (Abschnitt 6.4, Punkt 2) gebildet, nie als Summe der rohen Abteilungsspalten.

Als Test geprüfte Invarianten:
- `Σ Hektar emp_total = Σ Gemeinde = Kanton` — exakt, da alle drei aus derselben Spalte aggregiert werden.
- `Σ Hektar ambiguousCells = Σ Gemeinde = Kanton`.
- Je Stufe: `Σ_g dist_g ≈ emp_total` (Toleranz 0.5 pro Zeile, Rundung).
- Kein `dist_g` ist negativ; keine Zeile hat `emp_total < 4` (die Aufrundungsregel schliesst das aus, ein Verstoss deutet auf einen Auflösungsfehler hin).

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

Zugeordnet auf die acht Okabe-Ito-Töne plus drei ergänzte, gegen Deuteranopie und Protanopie geprüfte Farben. Die Zuordnung lebt **einmal**, in `etl/noga_groups.json`, und wird beim Build nach `src/domain/noga.generated.ts` geschrieben. Beide Ansichten benutzen zwingend dieselbe Tabelle. `#999999` ist für «nicht bestimmbar» reserviert und wird nie einer Branche zugewiesen.

Die STATENT-Hektardaten liefern NOGA-**Abteilungen** (2-Steller), nicht Abschnitte. `noga_groups.json` enthält deshalb die vollständige Kette **Abteilung → Abschnitt → Gruppe → Farbe**, mit allen 88 gültigen NOGA-2008-Abteilungsnummern als Schlüssel. Ein Test stellt sicher, dass jede in den Daten auftretende Abteilung abgedeckt ist; eine unbekannte Abteilung bricht das ETL ab, statt still in «Übrige» zu fallen.

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
2. Ansicht B: Das BFS rundet aus Datenschutzgründen **alle Werte unter 4 auf 4 auf**. Hektaren mit dem Wert 4 sind deshalb gesondert markiert — ihr wahrer Wert liegt zwischen 1 und 4. Summen sind dadurch Obergrenzen; die maximale Überschätzung wird beziffert.

> **Abweichung vom Briefing, bewusst.** Das Briefing gab für Ansicht B den Satz «Hektaren mit vier oder weniger Beschäftigten sind aus Datenschutzgründen nur klassiert verfügbar» vor. Die Variablenliste belegt eine andere Regel (Aufrundung statt Klassierung, Abschnitt 6.4). Der vorgegebene Wortlaut wäre selbst irreführend und wurde deshalb sachlich korrigiert; Zweck und Sichtbarkeit des Hinweises bleiben unverändert.

---

## 10. Fehlerbehandlung

**ETL.** Downloads werden in `data/raw/` gecacht, gegen ein SHA256-Manifest geprüft und bei erneutem Lauf nicht neu geladen; `--force` erzwingt. Jeder Schritt bricht laut ab statt still weiterzumachen: fehlende oder unerwartete Spalte, leeres Verschnittergebnis, Geokodierung ohne Treffer, CSV-Zeile ohne Quell-URL. Fehlermeldungen nennen den erwarteten und den gefundenen Zustand.

**Frontend.** Fehlt ein Artefakt oder ist es nicht parsbar, erscheint eine sichtbare Fehlerbox mit dem Dateinamen — nie eine stumm leere Karte.

---

## 11. Tests

**ETL (pytest).**
- Reprojektion gegen einen bekannten LV95↔WGS84-Referenzpunkt
- SW-Ecke → Zentrum-Offset (+50 m) an einem konstruierten Fall
- Aggregations-Invarianten aus Abschnitt 6.5, alle vier
- **Abteilungsspalten werden nie zu einem Total summiert**: ein konstruierter Fall mit `emp_total = 4` und vier Abteilungen à 4 muss `emp_total == 4` liefern, nicht 16
- Mischungsnormierung: `Σ_g dist_g == emp_total` bei einer Zelle mit ungleich verteilten Abteilungswerten
- `AMBIGUOUS`-Flag wird genau bei `emp_total == 4` gesetzt, nicht bei 5
- `overstatementMax == 3 · ambiguousCells`
- Jede NOGA-Abteilung in den Daten ist in `noga_groups.json` abgedeckt; eine unbekannte Abteilung bricht ab
- Bin-Roundtrip: schreiben → lesen ergibt bitgleiche Arrays
- CSV-Validierung schlägt bei fehlender `report_url` fehl
- Spaltenmuster-Auflösung schlägt bei unbekanntem Jahrgangsschema und bei uneinheitlichem `{nn}`-Präfix fehl

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
| ~~Kodierung der Datenschutz-Klassierung unbekannt~~ | **Erledigt am 2026-08-13**: Variablenliste gelesen, Regel ist Aufrundung < 4 → 4. Abschnitt 6.4 festgezurrt |
| Spaltenpräfix `{nn}` im Datenfile weicht von der Variablenliste (`08`) ab | Auflösung ist musterbasiert und präfix-agnostisch; Uneinheitlichkeit bricht ab |
| Aufrundung verzerrt Summen nach oben | Beziffert als `overstatementMax`, in Panel und Legende ausgewiesen |
| SIX-Emittentenliste maschinell nicht zugänglich | Fallback auf eine dokumentierte, datierte Symbolliste im Repo |
| Fehlerhaft übernommene Umsatzzahl bleibt unmarkiert | Bewusst akzeptiert; `report_url` pro Zeile ist der einzige Kontrollmechanismus |
| Hektarzahl weicht deutlich von der Schätzung ab | Binärformat und LOD-Ansatz tragen bis mindestens 10⁵ Zellen; darüber wäre Kachelung nachzurüsten |
| swisstopo-Vektorkacheln fallen aus | Karte rendert auf einfarbigem Grund weiter, mit Hinweis |
