# Firmenkarte: Kennzahlen, Filter und Basiskarte — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Seite `/firmen/` bekommt eine umschaltbare Höhenkennzahl (Umsatz, Mitarbeitende, Gewinn), drei Filterdimensionen, eine Basiskarte mit Seen und ehrlicher Rahmung, und zeigt die Daten, die sie bereits besitzt.

**Architecture:** Ein Zustand aus drei Dimensionen (Kennzahl, Branchen, Organisationsform) lebt in `src/karte/firmen.ts` und läuft bei jeder Änderung durch eine reine Funktion `applySelection()`. Zwei neue DOM-freie Domain-Module (`metric.ts`, `selection.ts`) tragen die Fachlogik und sind ohne Browser prüfbar; Layer und UI-Bausteine bekommen das Ergebnis gereicht und entscheiden nichts selbst. Das ETL liefert zwei neue Felder (`profitChf`, `orgForm`) und ein neues Artefakt (`lakes.geojson`).

**Tech Stack:** TypeScript, Vite, deck.gl 9 (`@deck.gl/layers`, `@deck.gl/core`, neu `@deck.gl/extensions`), MapLibre GL 4, Vitest. ETL: Python 3.14, uv, geopandas/shapely/pyogrio, pytest.

**Spec:** `docs/superpowers/specs/2026-08-16-firmenkarte-kennzahlen-und-filter-design.md`

## Global Constraints

- **Sprache:** Code-Kommentare, UI-Texte, Commit-Botschaften und Testnamen auf Deutsch, Schweizer Rechtschreibung (kein «ß»). Bestehender Ton: Kommentare begründen die Entscheidung, sie beschreiben nicht den Code.
- **Zahlen nie hartkodieren:** Jede Zahl in der Oberfläche wird zur Laufzeit aus dem Artefakt hergeleitet (Muster: `presentGroupsFromIndices` in `src/karte/firmen.ts`).
- **Start-Payload-Budget:** `config.MAX_STARTUP_BYTES` = 800 KB. Aktuell belegt: 591 KB (`meta.json`, `ch_kantone.{bin,json,geojson}`, `companies.json`). Verbleibend: **209 KB** für `lakes.geojson` **plus** das Wachstum von `companies.json` durch `profitChf`/`orgForm` (rund 10 KB). Zielgrösse `lakes.geojson`: **unter 60 KB**.
- **Keine halbe Umrechnung:** Eine Kennzahl in Fremdwährung wird entweder für alle Zeilen in CHF umgerechnet oder gar nicht verwendet (Muster: `stats.revenueInChf`).
- **Skalenmodi:** `'logarithmisch'` ist die Potenzskala mit `DAMPENING_EXPONENT = 0.4`, keine echte Logarithmusfunktion. Der Name bleibt, die Eckbox nennt die Formel.
- **Höhenkonstanten** in `src/layers/visible.ts`: `MIN_VISIBLE_BAR_M = 400` (Platzhalter), `MIN_REAL_BAR_M = 550` (echter Wert), Decke 12'000 m, `CANTON_ELEVATION_M = 300`.
- **Farben:** Die elf Branchenfarben (`src/domain/noga.generated.ts`) werden nicht angefasst — sie sind auf Farbenblindheit geprüft (`etl/tests/test_palette.py`).
- **Tests zuerst:** Jede Aufgabe beginnt mit einem fehlschlagenden Test. `npm test` (Vitest) bzw. `uv run --project etl pytest` (pytest).
- **Commit je Aufgabe**, Botschaft nennt den Grund, nicht die Dateien.

---

## Dateiübersicht

**Neu:**

| Datei | Verantwortung |
|---|---|
| `src/domain/metric.ts` | Was eine Kennzahl ist: Wertzugriff, Label, Formatierung, Vorzeichenfähigkeit |
| `src/domain/metric.test.ts` | dazu |
| `src/domain/selection.ts` | Filter über drei Dimensionen, `vmax`, Summen — rein |
| `src/domain/selection.test.ts` | dazu |
| `src/layers/lakes.ts` | Seefläche als GeoJsonLayer |
| `src/layers/labels.ts` | Namen der grössten N als TextLayer |
| `src/layers/labels.test.ts` | Auswahl der N, Reaktion auf Filter |
| `src/ui/kennzahlen.ts` | Die Summenzeile am oberen Bildrand |
| `src/ui/kennzahlen.test.ts` | dazu |
| `src/ui/legend.test.ts` | Legende als Filter |
| `etl/src/zeigmers_etl/lakes.py` | Natural-Earth-Seen laden, zuschneiden, vereinfachen |
| `etl/tests/test_lakes.py` | dazu |
| `public/data/lakes.geojson` | Artefakt |

**Geändert:**

| Datei | Änderung |
|---|---|
| `src/domain/scale.ts` | vorzeichenfähige Höhenfunktion |
| `src/layers/visible.ts` | Kennzahl statt Umsatz, Vorzeichen, Nulllinie, Verlustfarbe, Pixelgrenzen, Bodenschatten |
| `src/layers/viewLayers.ts` | neue Layer einreihen, neue Signaturen |
| `src/layers/cantons.ts` | Plattenfarbe (Kontrast) |
| `src/ui/nav.ts` | Kennzahl- und Organisationsform-Gruppe, Default `logarithmisch` |
| `src/ui/legend.ts` | Filter mit Anzahl/Anteil/Saldo statt Farbliste |
| `src/ui/panel.ts` | Rang, Marge, Umsatz je Mitarbeitenden, Anteil, SIX-Symbol, `productsUrl` |
| `src/ui/hoverLabel.ts` | zweizeilig |
| `src/ui/notices.ts` | Natural Earth als Quelle nennen |
| `src/karte/firmen.ts` | Zustand halten, alles verdrahten |
| `src/map.ts` | Rahmung mit Chrome- und Pitch-Berücksichtigung |
| `src/style.css` | Kennzahlenzeile, Legendenknöpfe, zweizeiliger Hover, Kontrast |
| `etl/src/zeigmers_etl/companies.py` | `profitChf`, `orgForm` |
| `etl/src/zeigmers_etl/cli.py` | `lakes`-Befehl, Budgetprüfung erweitern |
| `etl/src/zeigmers_etl/config.py` | Natural-Earth-URL |
| `data/manual/listed_companies.csv` | Spalte `org_form` für 201 Zeilen |
| `package.json` | `@deck.gl/extensions` |

---

## Task 1: `profitChf` im Artefakt

Ohne CHF-Umrechnung wäre die Kennzahl «Gewinn» eine Höhe aus CHF, EUR und USD gemischt.

**Files:**
- Modify: `etl/src/zeigmers_etl/companies.py` (`build_artifact`, ab Zeile 504)
- Test: `etl/tests/test_companies.py`

**Interfaces:**
- Consumes: `fx.rate(currency, year, monthly_fx) -> {"rate": float, "months": int, "window": str}`
- Produces: Artefaktfeld `profitChf: float | None` je Firma; `stats.profitInChf: bool`

- [ ] **Step 1: Write the failing tests**

In `etl/tests/test_companies.py` ergänzen (das Modul hat bereits `_row()` und FX-Tests — dieselben Muster verwenden):

```python
def test_build_artifact_rechnet_gewinn_in_chf_um():
    monthly = {"USD": {2024: [0.9] * 12}}
    table = noga.load_table()
    rows = [_row(profit="200000000", profit_currency="USD", profit_unit="1",
                 revenue_currency="USD", consolidation_basis="total_group",
                 fiscal_year="2024")]
    artifact = companies.build_artifact(rows, table, monthly_fx=monthly)
    entry = artifact["companies"][0]
    assert entry["profit"] == 200_000_000.0        # berichtet, unverändert
    assert entry["profitChf"] == pytest.approx(180_000_000.0)
    assert artifact["stats"]["profitInChf"] is True


def test_build_artifact_rechnet_auch_verluste_um():
    monthly = {"EUR": {2024: [0.95] * 12}}
    table = noga.load_table()
    rows = [_row(profit="-40000000", profit_currency="EUR", profit_unit="1",
                 revenue_currency="EUR", consolidation_basis="total_group",
                 fiscal_year="2024")]
    entry = companies.build_artifact(rows, table, monthly_fx=monthly)["companies"][0]
    assert entry["profitChf"] == pytest.approx(-38_000_000.0)


def test_profit_in_chf_ist_falsch_wenn_eine_umrechnung_fehlt():
    """Alles oder nichts — wie bei revenueInChf. Halb umgerechnet stünden
    zwei Massstäbe nebeneinander, ohne dass man es sieht."""
    monthly = {"CHF": {2024: [1.0] * 12}}
    table = noga.load_table()
    rows = [
        _row(name="A AG", uid="CHE-100.000.001", profit="1000", profit_currency="CHF",
             profit_unit="1", consolidation_basis="total_group", fiscal_year="2024"),
        _row(name="B AG", uid="CHE-100.000.002", lon="8.05", lat="47.40",
             profit="2000", profit_currency="JPY", profit_unit="1",
             consolidation_basis="total_group", fiscal_year="2024"),
    ]
    artifact = companies.build_artifact(rows, table, monthly_fx=monthly)
    assert artifact["stats"]["profitInChf"] is False
    assert any(m["currency"] == "JPY" for m in artifact["stats"]["fxMissing"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --project etl pytest etl/tests/test_companies.py -k chf -v`
Expected: FAIL mit `KeyError: 'profitChf'` bzw. `KeyError: 'profitInChf'`

- [ ] **Step 3: Implement**

In `build_artifact`, direkt nach dem `revenue_chf`-Block (der bei `revenue_chf = None` beginnt), denselben Block für den Gewinn ergänzen:

```python
        # Dieselbe Umrechnung wie beim Umsatz, aus demselben Grund: als
        # Säulenhöhe verglichen misst ein EUR-Gewinn neben einem CHF-Gewinn
        # nicht dasselbe. Vorzeichen bleibt erhalten — ein Verlust wird
        # umgerechnet, nicht unterschlagen.
        profit_chf = None
        profit_currency = (row.get("profit_currency") or "").strip()
        if profit and monthly_fx is not None and profit_currency and fiscal_year:
            try:
                converted = fx_module.rate(profit_currency, int(fiscal_year), monthly_fx)
            except (KeyError, LookupError) as exc:
                fx_missing.append({"name": row["name"], "currency": profit_currency,
                                   "fiscalYear": fiscal_year, "error": str(exc)})
            else:
                profit_chf = float(profit) * profit_unit * converted["rate"]
                fx_used[f"{profit_currency}/{fiscal_year}"] = converted
```

Im `entries.append({...})` direkt nach `"profit"` einfügen:

```python
                "profitChf": profit_chf,
```

Nach `revenues_chf = [...]` ergänzen und in `stats` aufnehmen:

```python
    profits = [e["profit"] for e in entries if e["profit"] is not None]
    profits_chf = [e["profitChf"] for e in entries if e.get("profitChf") is not None]
```

```python
            "profitInChf": bool(profits) and len(profits_chf) == len(profits),
```

- [ ] **Step 4: Run tests**

Run: `uv run --project etl pytest etl/tests/test_companies.py -v`
Expected: PASS, keine Regression in den bestehenden FX-Tests.

- [ ] **Step 5: Artefakt neu bauen und prüfen**

Run: `uv run --project etl zeigmers-etl companies`
Run: `python3 -c "import json; d=json.load(open('public/data/companies.json')); print(d['stats']['profitInChf'], sum(1 for c in d['companies'] if c['profitChf'] is not None), sum(1 for c in d['companies'] if (c['profitChf'] or 0) < 0))"`
Expected: `True 197 41` — 197 umgerechnete Gewinne, davon 41 negativ.

- [ ] **Step 6: Commit**

```bash
git add etl/src/zeigmers_etl/companies.py etl/tests/test_companies.py public/data/companies.json
git commit -m "Gewinn wird in CHF umgerechnet, sonst vergliche die Höhenachse CHF mit EUR und USD"
```

---

## Task 2: `orgForm` als eigene Dimension

Die Karte soll später Genossenschaften und nicht kotierte Firmen zeigen. Das Feld kommt jetzt, solange es genau einen Wert hat und niemand es falsch füllen kann.

**Files:**
- Modify: `etl/src/zeigmers_etl/companies.py` (`CSV_COLUMNS` Zeile 43, `validate` Zeile 146, `build_artifact`, beide Zeilen mit `row = {c: "" for c in CSV_COLUMNS}` in `sync_national_csv`)
- Modify: `data/manual/listed_companies.csv`
- Test: `etl/tests/test_companies.py`

**Interfaces:**
- Produces: `ORG_FORMS = {"boersenkotiert"}`; Artefaktfeld `orgForm: str` je Firma; `stats.orgForms: list[str]` (sortiert, die im Artefakt vorkommenden)

- [ ] **Step 1: Write the failing tests**

```python
def test_validate_verlangt_org_form():
    with pytest.raises(ValueError, match="org_form"):
        companies.validate([_row(org_form="")])


def test_validate_lehnt_unbekannte_org_form_ab():
    with pytest.raises(ValueError, match="org_form"):
        companies.validate([_row(org_form="genossenschaft_vielleicht")])


def test_org_form_gilt_auch_fuer_unrecherchierte_zeilen():
    """Anders als revenue/profit ist die Organisationsform keine
    Rechercheleistung — sie steht schon fest, wenn die Zeile entsteht."""
    row = {c: "" for c in companies.CSV_COLUMNS}
    row.update({"uid": "CHE-100.000.009", "name": "Noch Nichts AG",
                "researched": "no", "org_form": "boersenkotiert"})
    companies.validate([row])


def test_build_artifact_traegt_org_form_und_sammelt_die_vorkommenden():
    table = noga.load_table()
    artifact = companies.build_artifact([_row(org_form="boersenkotiert")], table)
    assert artifact["companies"][0]["orgForm"] == "boersenkotiert"
    assert artifact["stats"]["orgForms"] == ["boersenkotiert"]
```

`_row()` in derselben Datei um `"org_form": "boersenkotiert"` im `row.update({...})`-Block ergänzen, sonst schlagen alle bestehenden Tests fehl.

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --project etl pytest etl/tests/test_companies.py -k org_form -v`
Expected: FAIL — `org_form` ist keine bekannte Spalte.

- [ ] **Step 3: Implement**

`CSV_COLUMNS`: `"org_form",` direkt nach `"noga_group",` einfügen.

Neben `CONSOLIDATION_BASES` (Zeile 100) ergänzen:

```python
# Die Rechtsform-Dimension der Karte. Heute trägt jede Zeile denselben Wert —
# die Quelle ist die SIX-Titelliste, und die kennt nur Kotierte. Das Feld
# existiert trotzdem schon: die Karte filtert danach, und eine später
# ergänzte Genossenschaft (Migros, Coop) oder eine grosse nicht kotierte
# Firma (Bertschi AG) soll eine Zeile mehr sein, kein Sonderfall im Ladepfad.
# Geschlossenes Set wie REVENUE_TYPES — ein Tippfehler wäre sonst eine
# lautlose vierte Organisationsform, die als eigener Knopf erschiene.
ORG_FORMS = {"boersenkotiert"}
```

In `validate()`, im Schleifenkörper über die Zeilen (nach der `consolidation_basis`-Prüfung, Zeile ~295), **ausserhalb** jeder `researched`-Bedingung:

```python
        org_form = row.get("org_form", "").strip()
        if not org_form:
            raise ValueError(f"{label}: org_form fehlt — erlaubt: {sorted(ORG_FORMS)}")
        if org_form not in ORG_FORMS:
            raise ValueError(
                f"{label}: org_form={org_form!r} unbekannt — erlaubt: {sorted(ORG_FORMS)}"
            )
```

`org_form` **nicht** zu `RESEARCH_ONLY_FIELDS` hinzufügen — eine unrecherchierte Zeile trägt es ebenfalls.

In `build_artifact`, im `entries.append({...})` nach `"nogaGroupIndex"`:

```python
                "orgForm": row.get("org_form") or None,
```

In `stats`:

```python
            "orgForms": sorted({e["orgForm"] for e in entries if e["orgForm"]}),
```

In `sync_national_csv`: beide Stellen finden mit
`grep -n 'row = {c: "" for c in CSV_COLUMNS}' etl/src/zeigmers_etl/companies.py`
und in beiden `row.update({...})` ergänzen:

```python
                    "org_form": "boersenkotiert",
```

- [ ] **Step 4: Bestehende CSV nachziehen**

Run:

```bash
uv run --project etl python -c "
import csv, pathlib
from zeigmers_etl import companies
p = companies.csv_path()
rows = list(csv.DictReader(p.open(encoding='utf-8')))
for r in rows:
    r['org_form'] = r.get('org_form') or 'boersenkotiert'
with p.open('w', encoding='utf-8', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(companies.CSV_COLUMNS))
    w.writeheader()
    w.writerows({c: r.get(c, '') for c in companies.CSV_COLUMNS} for r in rows)
print(len(rows), 'Zeilen')
"
```

Expected: `224 Zeilen` (oder die aktuelle Zeilenzahl der CSV).

- [ ] **Step 5: Run tests**

Run: `uv run --project etl pytest etl/tests/ -v`
Expected: PASS über alle Testdateien — `_row()` trägt das Feld jetzt.

- [ ] **Step 6: Artefakt neu bauen und prüfen**

Run: `uv run --project etl zeigmers-etl companies`
Run: `python3 -c "import json; d=json.load(open('public/data/companies.json')); print(d['stats']['orgForms'], sum(1 for c in d['companies'] if c['orgForm'] != 'boersenkotiert'))"`
Expected: `['boersenkotiert'] 0`

- [ ] **Step 7: Commit**

```bash
git add etl/src/zeigmers_etl/companies.py etl/tests/test_companies.py data/manual/listed_companies.csv public/data/companies.json
git commit -m "Organisationsform als eigenes Feld — heute ein Wert, damit Genossenschaften später eine Zeile sind und kein Sonderfall"
```

---

## Task 3: Den Platzhalter-Widerspruch festnageln

Molecular Partners AG trägt `revenue = 0.0` **und** `placeholder = true`. Heute zeichnet die Ladeseite daraus eine echte Säule (weil `heightValue()` die 0 als Wert nimmt) und färbt sie als Platzhalter. Die Regel steht im ETL — sie soll auch dort geprüft sein, damit Task 5 sich darauf verlassen kann.

**Files:**
- Test: `etl/tests/test_companies.py`
- Modify: `etl/src/zeigmers_etl/companies.py` (nur Kommentar bei `"placeholder"`)

**Interfaces:**
- Produces: Invariante `placeholder is True ⟺ revenue is None or revenue == 0` — Task 5 (`metricValue`) baut darauf.

- [ ] **Step 1: Write the failing test**

```python
def test_placeholder_und_umsatz_null_sind_dieselbe_aussage():
    """Ein ausgewiesener Umsatz von 0 trägt keine Höhenaussage. Die Karte
    darf daraus keine echte Säule rechnen — die Invariante hier ist, worauf
    sich `domain/metric.ts` verlässt."""
    table = noga.load_table()
    artifact = companies.build_artifact(
        [_row(name="Null AG", revenue="0", revenue_unit="1")], table
    )
    entry = artifact["companies"][0]
    assert entry["revenue"] == 0.0        # die echte Null bleibt fürs Panel
    assert entry["placeholder"] is True   # aber keine Höhe daraus


def test_jede_placeholder_zeile_hat_keinen_verwertbaren_umsatz():
    """Regressionswache über das echte Artefakt, nicht über ein Fixture."""
    artifact = json.loads(
        (config.PUBLIC_DATA / "companies.json").read_text(encoding="utf-8")
    )
    for entry in artifact["companies"]:
        has_value = entry["revenue"] is not None and entry["revenue"] != 0
        assert entry["placeholder"] is not has_value, entry["name"]
```

`from zeigmers_etl import config` oben in der Testdatei ergänzen, falls noch nicht importiert.

- [ ] **Step 2: Run tests**

Run: `uv run --project etl pytest etl/tests/test_companies.py -k placeholder -v`
Expected: PASS (das ETL verhält sich bereits so) — falls FAIL, ist die Invariante gebrochen und der Fehler liegt im ETL, nicht im Test.

- [ ] **Step 3: Den Kommentar an der Quelle ergänzen**

Bei `"placeholder": not revenue or float(revenue) == 0,` den bestehenden Kommentar um einen Satz erweitern:

```python
                # … (bestehender Kommentar bleibt)
                # Diese Invariante ist keine ETL-Interna: `domain/metric.ts`
                # liefert für die Kennzahl «Umsatz» genau dann `null`, wenn
                # `placeholder` gesetzt ist — sonst zeichnete die Karte für
                # eine echte Null eine Säule auf Mindesthöhe und färbte sie
                # zugleich als «keine Zahl gefunden».
```

- [ ] **Step 4: Commit**

```bash
git add etl/src/zeigmers_etl/companies.py etl/tests/test_companies.py
git commit -m "Invariante Platzhalter/Umsatz-Null bewacht — die Ladeseite verlässt sich darauf"
```

---

## Task 4: Seen als Artefakt

**Files:**
- Create: `etl/src/zeigmers_etl/lakes.py`, `etl/tests/test_lakes.py`
- Modify: `etl/src/zeigmers_etl/config.py`, `etl/src/zeigmers_etl/cli.py`
- Produce: `public/data/lakes.geojson`

**Interfaces:**
- Consumes: `boundaries.build_cantons(gpkg_zip) -> gpd.GeoDataFrame` (Kantonsflächen, LV95), `fetch.download(url, dest, force=..., fetcher=...)`
- Produces: `lakes.build(zip_path, cantons_gdf, out_path) -> dict` mit `{"count": int, "bytes": int}`; Artefakt `public/data/lakes.geojson` als `FeatureCollection` in WGS84 mit `properties.name`

- [ ] **Step 1: Write the failing tests**

`etl/tests/test_lakes.py`:

```python
import json
import zipfile

import geopandas as gpd
import pytest
from shapely.geometry import Polygon, box

from zeigmers_etl import lakes


def _ne_zip(tmp_path, geometries, names):
    """Baut ein Mini-Shapefile im Natural-Earth-Format als ZIP."""
    gdf = gpd.GeoDataFrame({"name": names}, geometry=geometries, crs="EPSG:4326")
    shp = tmp_path / "ne_10m_lakes.shp"
    gdf.to_file(shp)
    zpath = tmp_path / "ne_lakes.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        for part in tmp_path.glob("ne_10m_lakes.*"):
            zf.write(part, part.name)
    return zpath


def _switzerland():
    return gpd.GeoDataFrame(geometry=[box(6.0, 45.8, 10.5, 47.8)], crs="EPSG:4326")


def test_behaelt_nur_seen_die_die_schweiz_beruehren(tmp_path):
    drin = Polygon([(8.5, 47.2), (8.7, 47.2), (8.7, 47.3), (8.5, 47.3)])
    draussen = Polygon([(2.0, 48.0), (2.2, 48.0), (2.2, 48.2), (2.0, 48.2)])
    zpath = _ne_zip(tmp_path, [drin, draussen], ["Zürichsee", "Lac Fremd"])
    out = tmp_path / "lakes.geojson"
    report = lakes.build(zpath, _switzerland(), out)
    assert report["count"] == 1
    data = json.loads(out.read_text(encoding="utf-8"))
    assert [f["properties"]["name"] for f in data["features"]] == ["Zürichsee"]


def test_schneidet_auf_das_landesgebiet_zu(tmp_path):
    """Der Bodensee ragt weit nach Deutschland — was ausserhalb liegt, gehört
    nicht auf eine Karte der Schweiz."""
    grenzsee = Polygon([(9.0, 47.5), (9.6, 47.5), (9.6, 48.4), (9.0, 48.4)])
    zpath = _ne_zip(tmp_path, [grenzsee], ["Bodensee"])
    out = tmp_path / "lakes.geojson"
    lakes.build(zpath, _switzerland(), out)
    data = json.loads(out.read_text(encoding="utf-8"))
    ymax = max(c[1] for f in data["features"]
               for ring in f["geometry"]["coordinates"] for c in ring)
    assert ymax <= 47.8 + 1e-6


def test_artefakt_bleibt_im_budget(tmp_path):
    see = Polygon([(8.5, 47.2), (8.7, 47.2), (8.7, 47.3), (8.5, 47.3)])
    zpath = _ne_zip(tmp_path, [see], ["Zürichsee"])
    out = tmp_path / "lakes.geojson"
    report = lakes.build(zpath, _switzerland(), out)
    assert report["bytes"] == out.stat().st_size
    assert report["bytes"] < lakes.MAX_ARTIFACT_BYTES
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --project etl pytest etl/tests/test_lakes.py -v`
Expected: FAIL mit `ModuleNotFoundError: No module named 'zeigmers_etl.lakes'`

- [ ] **Step 3: Implement `lakes.py`**

```python
"""Seeflächen für die Basiskarte — aus Natural Earth, nicht aus einer
amtlichen Schweizer Quelle.

swissBOUNDARIES3D, das dieses ETL ohnehin lädt, führt in `tlm_hoheitsgebiet`
nur elf Seeflächen als eigene Zeilen (Objektart "Kantonsgebiet"): Zürichsee,
Bodensee, Neuenburger-, Bieler-, Thuner-, Brienzersee und Greifensee. Genfersee,
Vierwaldstättersee, Lago Maggiore, Zugersee und Walensee stecken dort in den
Gemeindeflächen und liessen sich nicht herauslösen, ohne die Gemeindegeometrie
selbst zu zerschneiden. Eine Karte der Schweiz ohne Genfersee ist keine.

Natural Earth ist damit die einzige nicht-amtliche Quelle dieser Karte. Sie
wird in der Eckbox (`ui/notices.ts`) namentlich genannt, zusammen mit dem
Hinweis, dass die Umrisse generalisiert sind. Die Seen tragen keine Zahl und
keine Aussage — sie sind Orientierung, kein Inhalt (siehe Spec, Abschnitt 4).
"""

from __future__ import annotations

import json
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd

# Vereinfachungstoleranz in Grad (rund 110 m). Die Seen sind Orientierung auf
# Landeszoom, keine Vermessung — feinere Umrisse kosten Startbytes, die das
# Budget (siehe `config.MAX_STARTUP_BYTES`) für die Firmendaten braucht.
SIMPLIFY_DEGREES = 0.001

# Obergrenze für das Artefakt. Der Start-Payload liegt bei rund 591 KB von
# 800 KB; die Seen dürfen den Rest nicht aufbrauchen.
MAX_ARTIFACT_BYTES = 60 * 1024


def build(ne_zip: Path, cantons: gpd.GeoDataFrame, out_path: Path) -> dict:
    """Lädt die Natural-Earth-Seen, behält die, die die Schweiz berühren,
    schneidet sie auf das Landesgebiet zu und schreibt sie als GeoJSON."""
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(ne_zip) as zf:
            zf.extractall(tmp)
        shp = next(Path(tmp).rglob("*.shp"))
        lakes_gdf = gpd.read_file(shp)

    lakes_gdf = lakes_gdf.to_crs("EPSG:4326")
    land = cantons.to_crs("EPSG:4326").union_all()

    clipped = lakes_gdf[lakes_gdf.intersects(land)].copy()
    clipped["geometry"] = clipped.geometry.intersection(land)
    clipped = clipped[~clipped.geometry.is_empty]
    clipped["geometry"] = clipped.geometry.simplify(SIMPLIFY_DEGREES)
    clipped = clipped[~clipped.geometry.is_empty]

    name_col = next((c for c in clipped.columns if c.lower() == "name"), None)
    features = [
        {
            "type": "Feature",
            "properties": {"name": (row[name_col] if name_col else None)},
            "geometry": json.loads(gpd.GeoSeries([row.geometry]).to_json())
            ["features"][0]["geometry"],
        }
        for _, row in clipped.iterrows()
    ]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps({"type": "FeatureCollection", "features": features},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return {"count": len(features), "bytes": out_path.stat().st_size}
```

- [ ] **Step 4: Run tests**

Run: `uv run --project etl pytest etl/tests/test_lakes.py -v`
Expected: PASS

- [ ] **Step 5: Quelle und CLI-Befehl verdrahten**

In `config.py` neben `SWISSBOUNDARIES_STAC`:

```python
# Natural Earth 10m «lakes» — die einzige nicht-amtliche Quelle dieser Karte,
# siehe `lakes.py` für den Grund.
NATURAL_EARTH_LAKES = (
    "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip"
)
```

In `cli.py`: `"lakes"` in die Befehlsliste bei `sub.add_parser(...)` (Zeile ~284) aufnehmen, mit Hilfetext `"Seeflächen aus Natural Earth bauen"`, und den Zweig ergänzen (Muster: der `swissboundaries`-Zweig ab Zeile 337):

```python
    if args.command == "lakes":
        from . import boundaries as boundaries_module
        from . import lakes as lakes_module

        ne_zip = fetch.download(
            config.NATURAL_EARTH_LAKES, config.DATA_RAW / "ne_10m_lakes.zip",
            force=args.force,
        )
        cantons = boundaries_module.build_cantons(
            config.DATA_RAW / "swissboundaries3d.gpkg.zip"
        )
        report = lakes_module.build(ne_zip, cantons, config.PUBLIC_DATA / "lakes.geojson")
        print(f"[lakes] {report['count']} Seen, {report['bytes'] / 1024:.0f} KB")
        if report["bytes"] > lakes_module.MAX_ARTIFACT_BYTES:
            print("[lakes] FEHLER: Artefakt zu gross")
            return 1
        return 0
```

Im `all`-Zweig `startup_names` (Zeile 581) um `"lakes.geojson"` erweitern — die Firmen-Seite lädt die Datei beim Start, sie gehört ins Budget.

- [ ] **Step 6: Artefakt bauen**

Run: `uv run --project etl zeigmers-etl lakes`
Expected: Ausgabe nennt die Zahl der Seen und eine Grösse unter 60 KB.

Run: `uv run --project etl zeigmers-etl all`
Expected: `[all] Start-Payload: … KB (Budget 800 KB)`, kein Budgetfehler.

- [ ] **Step 7: Commit**

```bash
git add etl/src/zeigmers_etl/lakes.py etl/tests/test_lakes.py etl/src/zeigmers_etl/config.py etl/src/zeigmers_etl/cli.py data/raw/manifest.json public/data/lakes.geojson
git commit -m "Seen aus Natural Earth — swissBOUNDARIES3D führt den Genfersee nicht als eigene Fläche"
```

---

## Task 5: `domain/metric.ts`

**Files:**
- Create: `src/domain/metric.ts`, `src/domain/metric.test.ts`

**Interfaces:**
- Consumes: `Company` aus `src/layers/visible.ts`
- Produces:

```ts
export type Metric = 'umsatz' | 'mitarbeitende' | 'gewinn'
export const METRICS: readonly Metric[]
export function metricValue(company: Company, metric: Metric): number | null
export function metricLabel(metric: Metric): string          // 'Jahresumsatz' | 'Mitarbeitende' | 'Reingewinn'
export function metricAllowsNegative(metric: Metric): boolean
export function formatMetric(value: number, metric: Metric): string
```

- [ ] **Step 1: Write the failing test**

`src/domain/metric.test.ts` (Muster: `src/domain/scale.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { formatMetric, metricAllowsNegative, metricValue, type Metric } from './metric'
import type { Company } from '../layers/visible'

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: 'CHE-1', name: 'Beispiel AG', sixSymbol: 'BSP', lon: 8, lat: 47,
    nogaGroupIndex: 1, revenue: 1_000_000, revenueChf: 1_000_000, currency: 'CHF',
    revenueType: 'net_sales', profit: 100_000, profitChf: 100_000,
    profitCurrency: 'CHF', consolidationBasis: 'total_group', coreProducts: null,
    productsUrl: null, foundingYear: null, employees: 500, fiscalYear: 2025,
    reportUrl: null, note: null, placeholder: false, researched: true,
    city: 'Aarau', positionAdjusted: null, orgForm: 'boersenkotiert',
    ...overrides,
  }
}

describe('metricValue', () => {
  it('nimmt für Umsatz den umgerechneten Betrag, nicht den berichteten', () => {
    const c = company({ revenue: 900, revenueChf: 750 })
    expect(metricValue(c, 'umsatz')).toBe(750)
  })

  it('liefert null statt auf die Berichtswährung zurückzufallen', () => {
    // Ohne Umrechnung verglichen die Höhen CHF mit EUR — lieber keine Säule.
    expect(metricValue(company({ revenueChf: null }), 'umsatz')).toBeNull()
    expect(metricValue(company({ profitChf: null }), 'gewinn')).toBeNull()
  })

  it('behandelt eine Platzhalter-Zeile als Zeile ohne Umsatz', () => {
    // Molecular Partners AG: revenue 0, placeholder true (siehe ETL-Invariante).
    const c = company({ revenue: 0, revenueChf: 0, placeholder: true })
    expect(metricValue(c, 'umsatz')).toBeNull()
  })

  it('nimmt 0 Mitarbeitende als echten Wert', () => {
    // Sechs Beteiligungsgesellschaften melden 0 — das ist eine Zahl, keine Lücke.
    expect(metricValue(company({ employees: 0 }), 'mitarbeitende')).toBe(0)
  })

  it('behält das Vorzeichen eines Verlusts', () => {
    expect(metricValue(company({ profitChf: -134_400_000 }), 'gewinn')).toBe(-134_400_000)
  })
})

describe('metricAllowsNegative', () => {
  it('gilt nur für den Gewinn', () => {
    expect(metricAllowsNegative('gewinn')).toBe(true)
    expect(metricAllowsNegative('umsatz')).toBe(false)
    expect(metricAllowsNegative('mitarbeitende')).toBe(false)
  })
})

describe('formatMetric', () => {
  it('nennt einen Verlust beim Wort', () => {
    expect(formatMetric(-2_000_000, 'gewinn')).toContain('Verlust')
  })

  it('gibt Mitarbeitende als ganze Zahl ohne Währung', () => {
    expect(formatMetric(3891, 'mitarbeitende')).toBe("3'891")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- metric`
Expected: FAIL — `src/domain/metric` existiert nicht.

- [ ] **Step 3: Implement**

```ts
import { formatNumber, formatProfit, formatRevenue } from '../ui/format'
import type { Company } from '../layers/visible'

/** Die drei Grössen, die die Säulenhöhe tragen kann. Eine Karte, drei
 *  Aussagen — dieselben Firmen, verschiedene Ordnung. */
export type Metric = 'umsatz' | 'mitarbeitende' | 'gewinn'

export const METRICS: readonly Metric[] = ['umsatz', 'mitarbeitende', 'gewinn']

const LABEL: Record<Metric, string> = {
  umsatz: 'Jahresumsatz',
  mitarbeitende: 'Mitarbeitende',
  gewinn: 'Reingewinn',
}

/** Der Wert, aus dem die Höhe entsteht — `null`, wenn die Karte für diese
 *  Firma in dieser Kennzahl nichts zu behaupten hat.
 *
 *  Für Geldgrössen ausschliesslich der in CHF umgerechnete Betrag. Kein
 *  Rückfall auf `revenue`/`profit` in Berichtswährung: `heightValue()` liess
 *  das zu, solange gar keine Kurse vorlagen — bei drei Währungen im Datensatz
 *  wäre derselbe Rückfall ein Höhenvergleich zwischen CHF, EUR und USD.
 *
 *  `placeholder` schlägt den Umsatzwert: eine Zeile mit ausgewiesenen 0 CHF
 *  trägt keine Höhenaussage (ETL-Invariante, siehe `companies.py`,
 *  `"placeholder"`). Bei den Mitarbeitenden gilt das Gegenteil — 0 ist dort
 *  eine gemeldete Zahl (sechs Beteiligungsgesellschaften ohne eigenes
 *  Personal), keine fehlende. */
export function metricValue(company: Company, metric: Metric): number | null {
  switch (metric) {
    case 'umsatz':
      return company.placeholder ? null : company.revenueChf
    case 'gewinn':
      return company.profitChf
    case 'mitarbeitende':
      return company.employees
  }
}

export function metricLabel(metric: Metric): string {
  return LABEL[metric]
}

/** Nur der Gewinn kann negativ sein — 41 der 201 Gesellschaften weisen einen
 *  Verlust aus. Höhe und Farbe müssen das wissen, bevor sie rechnen. */
export function metricAllowsNegative(metric: Metric): boolean {
  return metric === 'gewinn'
}

export function formatMetric(value: number, metric: Metric): string {
  if (metric === 'mitarbeitende') return formatNumber(value)
  if (metric === 'gewinn') return formatProfit(value, 'CHF')
  return formatRevenue(value, 'CHF')
}
```

`Company` in `src/layers/visible.ts` um die zwei neuen Felder erweitern (das Interface ist die einzige Stelle, die das Artefakt beschreibt):

```ts
  /** Reingewinn zum SNB-Jahresmittelkurs in CHF — dieselbe Rolle wie
   *  `revenueChf` beim Umsatz, siehe `etl/…/companies.py`. `null`, solange
   *  keine Kurse vorliegen. */
  profitChf: number | null
  /** Rechtsform-Dimension der Karte, heute für alle Zeilen
   *  `'boersenkotiert'`. Die Karte filtert danach; Genossenschaften und
   *  grosse nicht kotierte Firmen kommen später als weitere Werte hinzu. */
  orgForm: string | null
```

und `CompanyData['stats']` um `profitInChf: boolean` und `orgForms: string[]`.

- [ ] **Step 4: Run test**

Run: `npm test -- metric`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/metric.ts src/domain/metric.test.ts src/layers/visible.ts
git commit -m "Kennzahl als eigener Begriff — welcher Wert eine Höhe trägt, entscheidet eine Stelle"
```

---

## Task 6: Vorzeichenfähige Höhen

**Files:**
- Modify: `src/domain/scale.ts`, `src/domain/scale.test.ts`

**Interfaces:**
- Produces: `computeSignedElevations(values: Float32Array, vmax: number, maxHeight: number, mode: ScaleMode): Float32Array` — `vmax` ist das Maximum der **Beträge**.

- [ ] **Step 1: Write the failing test**

In `src/domain/scale.test.ts` ergänzen:

```ts
describe('computeSignedElevations', () => {
  it('spiegelt Betrag und Vorzeichen symmetrisch um null', () => {
    const heights = computeSignedElevations(
      new Float32Array([100, -100]), 100, 1000, 'linear',
    )
    expect(heights[0]).toBeCloseTo(1000)
    expect(heights[1]).toBeCloseTo(-1000)
  })

  it('dämpft den Betrag, nicht das Vorzeichen', () => {
    const heights = computeSignedElevations(
      new Float32Array([-1]), 100, 1000, 'logarithmisch',
    )
    // -(1/100)^0.4 * 1000
    expect(heights[0]).toBeCloseTo(-Math.pow(0.01, 0.4) * 1000)
  })

  it('gibt bei vmax = 0 lauter Nullen statt NaN', () => {
    // Eine Auswahl ohne einen einzigen Wert darf keine Division durch null werden.
    const heights = computeSignedElevations(new Float32Array([5, -5]), 0, 1000, 'linear')
    expect(Array.from(heights)).toEqual([0, 0])
  })

  it('lässt computeElevations unverändert', () => {
    const heights = computeElevations(new Float32Array([-5, 5]), 5, 1000, 'linear')
    expect(heights[0]).toBe(0) // negative Werte bleiben dort ausgeschlossen
    expect(heights[1]).toBeCloseTo(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scale`
Expected: FAIL — `computeSignedElevations is not a function`

- [ ] **Step 3: Implement**

In `src/domain/scale.ts` ergänzen (`computeElevations` bleibt unangetastet — Ansicht «Beschäftigte» kennt keine negativen Werte und soll die Vorzeichenprüfung nicht mittragen):

```ts
/** Wie `computeElevations`, aber vorzeichenfähig: die Dämpfung wirkt auf den
 *  Betrag, das Vorzeichen bleibt stehen.
 *
 *  Gebraucht für die Kennzahl «Gewinn», bei der 41 der 201 Gesellschaften
 *  einen Verlust ausweisen. `vmax` ist deshalb das Maximum der **Beträge**,
 *  nicht der Werte — sonst normierte eine Auswahl aus lauter Verlustfirmen
 *  gegen ein Maximum von null. */
export function computeSignedElevations(
  values: Float32Array,
  vmax: number,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const out = new Float32Array(values.length)
  if (vmax <= 0) return out

  for (let i = 0; i < values.length; i++) {
    const value = values[i]!
    if (value === 0) continue
    const fraction = Math.abs(value) / vmax
    const scaled = mode === 'logarithmisch' ? Math.pow(fraction, DAMPENING_EXPONENT) : fraction
    out[i] = Math.sign(value) * scaled * maxHeight
  }
  return out
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- scale`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/scale.ts src/domain/scale.test.ts
git commit -m "Höhenfunktion mit Vorzeichen — ein Verlust ist kein kleiner Gewinn"
```

---

## Task 7: `domain/selection.ts`

**Files:**
- Create: `src/domain/selection.ts`, `src/domain/selection.test.ts`

**Interfaces:**
- Consumes: `metricValue`, `Metric` (Task 5); `Company`
- Produces:

```ts
export interface Selection {
  metric: Metric
  branches: ReadonlySet<number>   // NOGA-Gruppenindizes
  orgForms: ReadonlySet<string>
}
export interface SelectionResult {
  visible: Company[]
  withValue: Company[]
  vmax: number
  sum: number
  losses: number
  missing: number
  top: Company | null      // grösster Betrag — die Bezugszeile der Legende
}
export function applySelection(companies: Company[], selection: Selection): SelectionResult
export function branchTotals(result: SelectionResult, metric: Metric): Map<number, { count: number; sum: number }>
```

- [ ] **Step 1: Write the failing test**

`src/domain/selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applySelection, branchTotals, type Selection } from './selection'
import type { Company } from '../layers/visible'

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: null, name: 'X AG', sixSymbol: null, lon: 8, lat: 47, nogaGroupIndex: 1,
    revenue: 100, revenueChf: 100, currency: 'CHF', revenueType: 'net_sales',
    profit: 10, profitChf: 10, profitCurrency: 'CHF', consolidationBasis: 'total_group',
    coreProducts: null, productsUrl: null, foundingYear: null, employees: 10,
    fiscalYear: 2025, reportUrl: null, note: null, placeholder: false,
    researched: true, city: null, positionAdjusted: null, orgForm: 'boersenkotiert',
    ...overrides,
  }
}

const alle = (metric: Selection['metric'], branches: number[], forms = ['boersenkotiert']):
  Selection => ({ metric, branches: new Set(branches), orgForms: new Set(forms) })

describe('applySelection', () => {
  it('behält nur Firmen, deren Branche UND Organisationsform gewählt sind', () => {
    const cs = [
      company({ name: 'A', nogaGroupIndex: 1 }),
      company({ name: 'B', nogaGroupIndex: 2 }),
      company({ name: 'C', nogaGroupIndex: 1, orgForm: 'genossenschaft' }),
    ]
    const r = applySelection(cs, alle('umsatz', [1]))
    expect(r.visible.map((c) => c.name)).toEqual(['A'])
  })

  it('nimmt unrecherchierte Firmen nie in die Auswahl', () => {
    // Sie haben keine Höhenaussage und erscheinen als eigener Marker-Layer.
    const cs = [company({ name: 'A' }), company({ name: 'B', researched: false })]
    expect(applySelection(cs, alle('umsatz', [1])).visible.map((c) => c.name)).toEqual(['A'])
  })

  it('trennt sichtbar von bewertbar', () => {
    const cs = [company({ revenueChf: 100 }), company({ revenueChf: null })]
    const r = applySelection(cs, alle('umsatz', [1]))
    expect(r.visible).toHaveLength(2)
    expect(r.withValue).toHaveLength(1)
    expect(r.missing).toBe(1)
  })

  it('nimmt vmax aus den Beträgen, damit reine Verlustauswahlen skalieren', () => {
    const cs = [company({ profitChf: -300 }), company({ profitChf: -50 })]
    const r = applySelection(cs, alle('gewinn', [1]))
    expect(r.vmax).toBe(300)
    expect(r.losses).toBe(2)
    expect(r.sum).toBe(-350)
    expect(r.top?.profitChf).toBe(-300)
  })

  it('gibt bei leerer Auswahl vmax 0 und keine Firmen', () => {
    const r = applySelection([company()], alle('umsatz', []))
    expect(r.visible).toEqual([])
    expect(r.vmax).toBe(0)
    expect(r.sum).toBe(0)
    expect(r.top).toBeNull()
  })

  it('gibt bei einer Auswahl ganz ohne Werte vmax 0, nicht NaN', () => {
    const r = applySelection([company({ employees: null })], alle('mitarbeitende', [1]))
    expect(r.vmax).toBe(0)
    expect(r.sum).toBe(0)
  })
})

describe('branchTotals', () => {
  it('zählt je Branche Firmen und Summe', () => {
    const cs = [
      company({ nogaGroupIndex: 1, revenueChf: 100 }),
      company({ nogaGroupIndex: 1, revenueChf: 300 }),
      company({ nogaGroupIndex: 2, revenueChf: 50 }),
    ]
    const r = applySelection(cs, alle('umsatz', [1, 2]))
    const totals = branchTotals(r, 'umsatz')
    expect(totals.get(1)).toEqual({ count: 2, sum: 400 })
    expect(totals.get(2)).toEqual({ count: 1, sum: 50 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- selection`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implement**

```ts
import { metricValue, type Metric } from './metric'
import type { Company } from '../layers/visible'

/** Der Zustand der Firmenseite, in drei Dimensionen, die nichts voneinander
 *  wissen: eine Kennzahl auf der Höhenachse, eine Teilmenge Branchen, eine
 *  Teilmenge Organisationsformen. */
export interface Selection {
  metric: Metric
  branches: ReadonlySet<number>
  orgForms: ReadonlySet<string>
}

export interface SelectionResult {
  /** Gefiltert, aber noch nicht bewertet — auch Firmen ohne Wert in dieser
   *  Kennzahl stehen hier: sie bekommen eine Platzhaltersäule, keine keine. */
  visible: Company[]
  withValue: Company[]
  /** Maximum der BETRÄGE über `withValue`. 0, wenn nichts vorliegt. */
  vmax: number
  sum: number
  losses: number
  missing: number
  top: Company | null
}

export function applySelection(companies: Company[], selection: Selection): SelectionResult {
  const visible = companies.filter(
    (c) =>
      c.researched &&
      selection.branches.has(c.nogaGroupIndex) &&
      c.orgForm !== null &&
      selection.orgForms.has(c.orgForm),
  )

  const withValue: Company[] = []
  let vmax = 0
  let sum = 0
  let losses = 0
  let top: Company | null = null

  for (const company of visible) {
    const value = metricValue(company, selection.metric)
    if (value === null) continue
    withValue.push(company)
    sum += value
    if (value < 0) losses++
    if (Math.abs(value) > vmax) {
      vmax = Math.abs(value)
      top = company
    }
  }

  return { visible, withValue, vmax, sum, losses, missing: visible.length - withValue.length, top }
}

/** Anzahl und Summe je Branchengruppe — die Zahlen, die die Legende neben
 *  ihre Farbtupfer schreibt. Über `withValue`, nicht über `visible`: eine
 *  Firma ohne Wert zählt in der Anzahl der Auswahl mit, aber nicht in einer
 *  Summe, zu der sie nichts beiträgt. */
export function branchTotals(
  result: SelectionResult,
  metric: Metric,
): Map<number, { count: number; sum: number }> {
  const totals = new Map<number, { count: number; sum: number }>()
  for (const company of result.withValue) {
    const value = metricValue(company, metric)
    if (value === null) continue
    const entry = totals.get(company.nogaGroupIndex) ?? { count: 0, sum: 0 }
    entry.count++
    entry.sum += value
    totals.set(company.nogaGroupIndex, entry)
  }
  return totals
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- selection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/selection.ts src/domain/selection.test.ts
git commit -m "Filter über drei Dimensionen als eine reine Funktion — ein Pfad, kein zweiter Ort zum Filtern"
```

---

## Task 8: Säulen nach Kennzahl, mit Nulllinie

**Files:**
- Modify: `src/layers/visible.ts`, `src/layers/visible.test.ts`
- Modify: `src/layers/viewLayers.ts` (Aufrufstelle)

**Interfaces:**
- Consumes: `computeSignedElevations` (Task 6), `SelectionResult` (Task 7), `metricValue`/`metricAllowsNegative` (Task 5)
- Produces:

```ts
export const LOSS_COLOR: readonly [number, number, number]
export const ZERO_PLANE_CLEARANCE_M = 200
export function zeroPlaneHeight(heights: Float32Array): number
export function buildCompanyLayer(options: {
  result: SelectionResult
  metric: Metric
  mode: ScaleMode
  onClick: (company: Company) => void
  onHover: (company: Company | null, x: number, y: number) => void
}): ColumnLayer<Company>
export function buildZeroPlaneLayer(cantonsGeo: BoundaryFeatureCollection, height: number): GeoJsonLayer<BoundaryProperties>
```

- [ ] **Step 1: Write the failing test**

In `src/layers/visible.test.ts` ergänzen (die Datei prüft heute schon Höhen und Farben über die Layer-Props):

```ts
describe('Nulllinie', () => {
  it('liegt über der Kantonsplatte, auch beim tiefsten Ausschlag', () => {
    const heights = new Float32Array([1000, -1900, 500])
    expect(zeroPlaneHeight(heights)).toBe(CANTON_ELEVATION_M + 1900 + ZERO_PLANE_CLEARANCE_M)
  })

  it('bleibt auf Plattenhöhe, wenn nichts negativ ist', () => {
    expect(zeroPlaneHeight(new Float32Array([1000, 500]))).toBe(CANTON_ELEVATION_M)
  })
})

describe('buildCompanyLayer mit Kennzahl', () => {
  it('zeichnet Verluste nach unten', () => {
    const gewinner = company({ name: 'Plus', profitChf: 1000 })
    const verlierer = company({ name: 'Minus', profitChf: -1000 })
    const layer = buildCompanyLayer({
      result: applySelection([gewinner, verlierer], selectionFor('gewinn')),
      metric: 'gewinn', mode: 'linear', onClick: () => {}, onHover: () => {},
    })
    const elevation = (c: Company, i: number) =>
      (layer.props.getElevation as Function)(c, { index: i })
    expect(elevation(gewinner, 0)).toBeGreaterThan(0)
    expect(elevation(verlierer, 1)).toBeLessThan(0)
  })

  it('färbt Verluste in einem eigenen Ton, nicht in der Branchenfarbe', () => {
    const verlierer = company({ name: 'Minus', profitChf: -1000, nogaGroupIndex: 1 })
    const layer = buildCompanyLayer({
      result: applySelection([verlierer], selectionFor('gewinn')),
      metric: 'gewinn', mode: 'linear', onClick: () => {}, onHover: () => {},
    })
    const color = (layer.props.getFillColor as Function)(verlierer)
    expect(color.slice(0, 3)).toEqual([...LOSS_COLOR])
  })

  it('gibt einer Firma ohne Wert die Platzhalterhöhe, nicht null', () => {
    const ohne = company({ name: 'Ohne', employees: null })
    const layer = buildCompanyLayer({
      result: applySelection([ohne], selectionFor('mitarbeitende')),
      metric: 'mitarbeitende', mode: 'linear', onClick: () => {}, onHover: () => {},
    })
    const h = (layer.props.getElevation as Function)(ohne, { index: 0 })
    expect(h).toBe(MIN_VISIBLE_BAR_M)
  })

  it('hebt in der Gewinn-Ansicht alle Säulen auf die Nulllinie', () => {
    const verlierer = company({ profitChf: -1000 })
    const layer = buildCompanyLayer({
      result: applySelection([verlierer], selectionFor('gewinn')),
      metric: 'gewinn', mode: 'linear', onClick: () => {}, onHover: () => {},
    })
    const [, , z] = (layer.props.getPosition as Function)(verlierer)
    expect(z).toBeGreaterThan(CANTON_ELEVATION_M)
  })
})
```

Hilfsfunktion `selectionFor(metric)` oben in der Testdatei:

```ts
const selectionFor = (metric: Metric) => ({
  metric, branches: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 255]),
  orgForms: new Set(['boersenkotiert']),
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- visible`
Expected: FAIL — `zeroPlaneHeight` fehlt, `buildCompanyLayer` nimmt noch die alte Signatur.

- [ ] **Step 3: Implement**

In `src/layers/visible.ts`:

```ts
/** Ein Verlust bekommt einen Ton, der weder eine Branchenfarbe ist noch der
 *  Platzhalter-Grauton («keine Zahl gefunden»). Die Branche einer
 *  Verlustfirma ist in der Gewinn-Ansicht damit nicht ablesbar — beabsichtigt:
 *  Vorzeichen schlägt Branche, wenn beide um dieselbe Fläche konkurrieren. */
export const LOSS_COLOR: readonly [number, number, number] = [176, 76, 76]

/** Luft zwischen dem tiefsten hängenden Verlust und der Kantonsplatte. */
export const ZERO_PLANE_CLEARANCE_M = 200

/** Höhe, auf der die Säulen ansetzen. Bei nichtnegativen Kennzahlen die
 *  Plattenoberkante wie bisher; bei der Gewinn-Kennzahl so hoch, dass der
 *  tiefste Verlust noch über der Platte endet.
 *
 *  Zur Laufzeit aus der Auswahl hergeleitet statt fest verdrahtet: bei
 *  auswahlabhängigem `vmax` ändert sich der tiefste Ausschlag mit jedem
 *  Filter. Ohne diese Ebene wäre eine negative Säule unsichtbar — sie wüchse
 *  unter eine opake Platte, die man bei `pitch: 50` von oben sieht. */
export function zeroPlaneHeight(heights: Float32Array): number {
  let deepest = 0
  for (const h of heights) if (h < deepest) deepest = h
  return deepest < 0
    ? CANTON_ELEVATION_M + Math.abs(deepest) + ZERO_PLANE_CLEARANCE_M
    : CANTON_ELEVATION_M
}
```

`companyElevations` bekommt die Kennzahl statt des Umsatzes und rechnet vorzeichenfähig:

```ts
export function companyElevations(
  companies: Company[],
  metric: Metric,
  vmax: number,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const values = new Float32Array(companies.map((c) => metricValue(c, metric) ?? 0))
  const heights = computeSignedElevations(values, vmax, maxHeight, mode)

  for (let i = 0; i < heights.length; i++) {
    const value = metricValue(companies[i]!, metric)
    if (value === null) {
      // Kein Wert in dieser Kennzahl — Platzhalterhöhe, unverwechselbar
      // niedriger als jede echte Säule (siehe MIN_VISIBLE_BAR_M).
      heights[i] = MIN_VISIBLE_BAR_M
      continue
    }
    const magnitude = Math.abs(heights[i]!)
    if (magnitude < MIN_REAL_BAR_M) {
      heights[i] = (heights[i]! < 0 ? -1 : 1) * MIN_REAL_BAR_M
    }
  }
  return heights
}
```

`buildCompanyLayer` auf das Optionsobjekt umstellen: `data: result.visible`, `getPosition: (c) => [c.lon, c.lat, zeroPlane]`, `getElevation: (_c, {index}) => heights[index]!`, `getFillColor` mit drei Fällen (Wert fehlt → `UNKNOWN_COLOR`, Wert negativ → `LOSS_COLOR`, sonst Branchenfarbe), `onHover` durchreichen, `updateTriggers: { getElevation: [metric, mode, vmax], getFillColor: [metric] }`.

`buildZeroPlaneLayer` als `GeoJsonLayer` auf `withBaseElevation(geometry, height)` über `cantonsGeo`, `filled: true`, `stroked: false`, `extruded: false`, `pickable: false`, Füllung halbtransparent (`[27, 39, 51, 28]`).

`heightValue()` entfällt — `metricValue` ersetzt sie. Alle Aufrufer mitziehen.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS, inklusive `viewLayers.test.ts` (Layer-IDs eindeutig).

- [ ] **Step 5: Commit**

```bash
git add src/layers/visible.ts src/layers/visible.test.ts src/layers/viewLayers.ts
git commit -m "Säulenhöhe folgt der gewählten Kennzahl; Verluste hängen an einer sichtbaren Nulllinie"
```

---

## Task 9: Pixelgrenzen und Bodenschatten

**Files:**
- Modify: `src/layers/visible.ts`, `src/layers/visible.test.ts`

**Interfaces:**
- Produces: `COMPANY_RADIUS_MIN_PX = 3`, `COMPANY_RADIUS_MAX_PX = 14`, `buildCompanyShadowLayer(result: SelectionResult, onClick): ScatterplotLayer<Company>`

- [ ] **Step 1: Write the failing test**

```ts
it('begrenzt den Säulenradius in Bildpunkten', () => {
  // 900 m fest: In Zürich (31 Gesellschaften) und Zug (17) verklumpen die
  // Säulen, im Jura wird eine einzelne zum Faden.
  const layer = buildCompanyLayer({ /* … wie oben … */ })
  expect(layer.props.radiusMinPixels).toBe(COMPANY_RADIUS_MIN_PX)
  expect(layer.props.radiusMaxPixels).toBe(COMPANY_RADIUS_MAX_PX)
})

it('legt den Bodenschatten auf Plattenhöhe, nicht auf z = 0', () => {
  const c = company()
  const layer = buildCompanyShadowLayer(applySelection([c], selectionFor('umsatz')), () => {})
  const [, , z] = (layer.props.getPosition as Function)(c)
  expect(z).toBe(CANTON_ELEVATION_M)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- visible`
Expected: FAIL — Konstanten und Funktion fehlen.

- [ ] **Step 3: Implement**

```ts
export const COMPANY_RADIUS_MIN_PX = 3
export const COMPANY_RADIUS_MAX_PX = 14

/** Eine dunkle, halbtransparente Scheibe unter jeder Säule, auf
 *  Plattenhöhe. Auf einer so hellen Platte steht eine dünne Säule sonst ohne
 *  Kontakt zum Boden — der Schatten verankert sie an ihrem Ort, statt sie
 *  schweben zu lassen. Trägt keine eigene Aussage und ist nicht anklickbar;
 *  die Säule darüber nimmt den Klick. */
export function buildCompanyShadowLayer(result: SelectionResult): ScatterplotLayer<Company> {
  return new ScatterplotLayer<Company>({
    id: 'firmen-schatten',
    data: result.visible,
    pickable: false,
    stroked: false,
    getPosition: (c) => [c.lon, c.lat, CANTON_ELEVATION_M],
    getRadius: 1400,
    radiusUnits: 'meters',
    radiusMinPixels: COMPANY_RADIUS_MIN_PX + 2,
    radiusMaxPixels: COMPANY_RADIUS_MAX_PX + 4,
    getFillColor: [27, 39, 51, 38],
  })
}
```

In `buildCompanyLayer` `radiusMinPixels`/`radiusMaxPixels` ergänzen; `radius: 900` bleibt als Grundmass.

In `viewLayers.ts` den Schattenlayer **vor** dem Säulenlayer einreihen.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/layers/visible.ts src/layers/visible.test.ts src/layers/viewLayers.ts
git commit -m "Säulen mit Pixelgrenzen und Bodenschatten — Zürich verklumpt nicht mehr, der Jura verschwindet nicht"
```

---

## Task 10: Seen-Layer

**Files:**
- Create: `src/layers/lakes.ts`
- Modify: `src/data/boundaries.ts` (Ladefunktion), `src/karte/basis.ts`, `src/layers/viewLayers.ts`, `src/ui/notices.ts`

**Interfaces:**
- Produces: `loadLakes(base?: string): Promise<FeatureCollection | null>`, `buildLakesLayer(data: FeatureCollection): GeoJsonLayer`

- [ ] **Step 1: Write the failing test**

In `src/layers/viewLayers.test.ts` ergänzen:

```ts
it('reiht die Seen zwischen Kantonsfläche und Säulen ein', () => {
  const layers = buildViewLayers({ /* … view: 'sichtbare', lakes: lakesFixture … */ })
  const ids = layers.filter(Boolean).map((l: any) => l.id)
  expect(ids.indexOf('seen')).toBeGreaterThan(ids.indexOf('kantone'))
  expect(ids.indexOf('seen')).toBeLessThan(ids.indexOf('firmen'))
})

it('zeichnet ohne Seen weiter, wenn das Artefakt fehlt', () => {
  // Die Seen sind Orientierung, kein Inhalt — ihr Fehlen ist kein Fehler.
  const layers = buildViewLayers({ /* … lakes: null … */ })
  expect(layers.filter(Boolean).map((l: any) => l.id)).not.toContain('seen')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- viewLayers`
Expected: FAIL — `lakes` ist kein bekanntes Feld.

- [ ] **Step 3: Implement**

`src/layers/lakes.ts`:

```ts
/** Seeflächen auf Plattenhöhe. Sie tragen keine Zahl — sie sind der Grund,
 *  aus dem eine Silhouette der Schweiz als Schweiz erkennbar ist. Quelle ist
 *  Natural Earth (siehe `etl/…/lakes.py`), die einzige nicht-amtliche Quelle
 *  dieser Karte; die Eckbox nennt sie. */
export const LAKE_FILL: [number, number, number, number] = [176, 198, 219, 255]

export function buildLakesLayer(data: FeatureCollection): GeoJsonLayer {
  return new GeoJsonLayer({
    id: 'seen',
    data: { ...data, features: data.features.flatMap((f) =>
      f.geometry ? [{ ...f, geometry: withBaseElevation(f.geometry, CANTON_ELEVATION_M) }] : []) },
    filled: true, stroked: false, extruded: false, pickable: false,
    getFillColor: LAKE_FILL,
  })
}
```

`loadLakes()` in `src/data/boundaries.ts` nach dem Muster von `loadCantons()`, aber mit stillem Rückfall auf `null` bei HTTP-Fehler oder ungültigem JSON. `createBasis()` lädt sie im bestehenden `Promise.all` mit und gibt sie in `Basis` weiter. `buildViewLayers` nimmt `lakes: FeatureCollection | null` und reiht den Layer nach `cantonsLayer`, vor `cantonBorderLayer` ein.

In `src/ui/notices.ts` die Quellenzeile der Firmen-Ansicht ergänzen:

```
Seeflächen: Natural Earth (10m lakes), generalisierte Umrisse — die einzige
nicht-amtliche Quelle dieser Karte.
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/layers/lakes.ts src/data/boundaries.ts src/karte/basis.ts src/layers/viewLayers.ts src/layers/viewLayers.test.ts src/ui/notices.ts
git commit -m "Seen auf der Karte, Natural Earth in der Eckbox genannt"
```

---

## Task 11: Namen der grössten Gesellschaften

**Files:**
- Create: `src/layers/labels.ts`, `src/layers/labels.test.ts`
- Modify: `package.json`, `src/layers/viewLayers.ts`

**Interfaces:**
- Produces: `TOP_LABEL_COUNT = 12`, `topByMetric(result: SelectionResult, metric: Metric, count: number): Company[]`, `buildLabelLayer(companies, metric, heights): TextLayer<Company>`

- [ ] **Step 1: Abhängigkeit installieren**

Run: `npm install @deck.gl/extensions@^9.0.0`

- [ ] **Step 2: Write the failing test**

`src/layers/labels.test.ts`:

```ts
describe('topByMetric', () => {
  it('nimmt die grössten Beträge der aktiven Kennzahl', () => {
    const cs = [company({ name: 'Klein', revenueChf: 10 }),
                company({ name: 'Gross', revenueChf: 1000 }),
                company({ name: 'Mittel', revenueChf: 100 })]
    const r = applySelection(cs, selectionFor('umsatz'))
    expect(topByMetric(r, 'umsatz', 2).map((c) => c.name)).toEqual(['Gross', 'Mittel'])
  })

  it('folgt dem Filter statt immer dieselben Namen zu zeigen', () => {
    const cs = [company({ name: 'A', nogaGroupIndex: 1, revenueChf: 1000 }),
                company({ name: 'B', nogaGroupIndex: 2, revenueChf: 500 })]
    const nurZwei = applySelection(cs, { metric: 'umsatz', branches: new Set([2]),
                                         orgForms: new Set(['boersenkotiert']) })
    expect(topByMetric(nurZwei, 'umsatz', 5).map((c) => c.name)).toEqual(['B'])
  })

  it('ordnet Verluste nach Betrag, nicht nach Wert', () => {
    const cs = [company({ name: 'Tief', profitChf: -900 }),
                company({ name: 'Klein', profitChf: 10 })]
    const r = applySelection(cs, selectionFor('gewinn'))
    expect(topByMetric(r, 'gewinn', 1).map((c) => c.name)).toEqual(['Tief'])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- labels`
Expected: FAIL — Modul fehlt.

- [ ] **Step 4: Implement**

```ts
import { TextLayer } from '@deck.gl/layers'
import { CollisionFilterExtension } from '@deck.gl/extensions'

/** Zwölf Namen: genug, dass die Karte lesbar wird («Nestlé», «Roche»,
 *  «Novartis» statt anonymer Stäbe), wenig genug, dass sie nicht zur
 *  Beschriftungstapete wird. */
export const TOP_LABEL_COUNT = 12

export function topByMetric(result: SelectionResult, metric: Metric, count: number): Company[] {
  return [...result.withValue]
    .sort((a, b) => Math.abs(metricValue(b, metric) ?? 0) - Math.abs(metricValue(a, metric) ?? 0))
    .slice(0, count)
}
```

`buildLabelLayer` als `TextLayer<Company>` mit `getPosition: (c) => [c.lon, c.lat, zeroPlane + heights[index]]`, `getText: (c) => c.name`, `getSize: 11`, `sizeUnits: 'pixels'`, `getColor: [27, 39, 51, 235]`, `getPixelOffset: [0, -10]`, `background: true`, `getBackgroundColor: [255, 255, 255, 200]`, `extensions: [new CollisionFilterExtension()]`, `collisionEnabled: true`, `collisionTestProps: { sizeScale: 2 }`, `characterSet: 'auto'`.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/layers/labels.ts src/layers/labels.test.ts src/layers/viewLayers.ts
git commit -m "Die zwölf grössten Gesellschaften tragen ihren Namen auf der Karte"
```

---

## Task 12: Steuerung — Kennzahl, Organisationsform, neuer Default

**Files:**
- Modify: `src/ui/nav.ts`, `src/karte/basis.ts` (`mountNav`), `src/karte/beschaeftigte.ts` (Aufrufstelle)
- Create: `src/ui/nav.test.ts`

**Interfaces:**
- Produces:

```ts
export interface NavOptions {
  view: ViewName
  metrics?: { available: readonly Metric[]; onChange: (metric: Metric) => void }
  orgForms?: { available: readonly string[]; onChange: (forms: ReadonlySet<string>) => void }
  onModeChange: (mode: ScaleMode) => void
}
export function createNav(options: NavOptions): HTMLElement
export const ORG_FORM_LABEL: Record<string, string>   // 'boersenkotiert' -> 'Börsenkotiert'
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { createNav, DEFAULT_MODE } from './nav'

describe('DEFAULT_MODE', () => {
  it('startet die Firmenseite gedämpft', () => {
    // Linear sitzen 153 von 188 Säulen auf der Mindesthöhe — die Karte
    // öffnete mit zwei sichtbaren Säulen und einem Feld Stummel.
    expect(DEFAULT_MODE.sichtbare).toBe('logarithmisch')
  })
})

describe('createNav', () => {
  it('zeigt die Kennzahl-Gruppe nur, wo Kennzahlen angeboten werden', () => {
    const nur = createNav({ view: 'beschaeftigte', onModeChange: () => {} })
    expect(nur.querySelector('[aria-label="Kennzahl"]')).toBeNull()
  })

  it('meldet die gewählte Kennzahl', () => {
    const gewaehlt: string[] = []
    const nav = createNav({
      view: 'sichtbare', onModeChange: () => {},
      metrics: { available: ['umsatz', 'gewinn'], onChange: (m) => gewaehlt.push(m) },
    })
    nav.querySelector<HTMLButtonElement>('[data-metric="gewinn"]')!.click()
    expect(gewaehlt.at(-1)).toBe('gewinn')
  })

  it('zeigt die Organisationsform auch bei nur einem Wert', () => {
    const nav = createNav({
      view: 'sichtbare', onModeChange: () => {},
      orgForms: { available: ['boersenkotiert'], onChange: () => {} },
    })
    expect(nav.querySelector('[data-orgform="boersenkotiert"]')?.textContent)
      .toBe('Börsenkotiert')
  })
})
```

Vitest läuft in diesem Projekt mit `test: { environment: 'node' }` (`vite.config.ts`), es gibt also kein `document`. Vor dem Test deshalb:

Run: `npm install -D jsdom`

Und als **erste Zeile** dieser Testdatei — sowie jeder weiteren DOM-Testdatei in Task 13, 14 und 16:

```ts
// @vitest-environment jsdom
```

Bewusst je Datei statt global: die Domain-Tests (`metric`, `selection`, `scale`) brauchen kein DOM, und eine globale Umstellung zöge sie ohne Gewinn durch eine emulierte Browserumgebung.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- nav`
Expected: FAIL — `DEFAULT_MODE.sichtbare` ist `'linear'`, `createNav` nimmt zwei Stellungsargumente.

- [ ] **Step 3: Implement**

`DEFAULT_MODE.sichtbare` auf `'logarithmisch'` setzen und den bestehenden Kommentarblock darüber um den Grund ergänzen (die gemessenen 153 von 188). `createNav` auf `NavOptions` umstellen; Kennzahl-Gruppe als `role="radiogroup"` mit `aria-label="Kennzahl"` und `data-metric`-Attributen, Organisationsform als Gruppe von Umschaltknöpfen mit `aria-pressed` und `data-orgform`. Beide Gruppen nur rendern, wenn die jeweilige Option übergeben wurde.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/nav.ts src/ui/nav.test.ts src/karte/basis.ts src/karte/beschaeftigte.ts vite.config.ts package.json package-lock.json
git commit -m "Kennzahl und Organisationsform in der Steuerung; die Firmenkarte startet gedämpft statt flach"
```

---

## Task 13: Legende als Filter

**Files:**
- Modify: `src/ui/legend.ts`
- Create: `src/ui/legend.test.ts`

**Interfaces:**
- Consumes: `branchTotals`, `SelectionResult` (Task 7), `Metric`, `formatMetric` (Task 5)
- Produces: `LegendOptions` erweitert um `metric`, `result`, `selectedBranches`, `onToggleBranch(index)`, `onOnlyBranch(index)`, `onAllBranches()`

- [ ] **Step 1: Write the failing test**

```ts
describe('renderLegend als Filter', () => {
  it('zeigt bei Umsatz den Anteil je Branche', () => {
    renderLegend({ /* metric: 'umsatz', result mit 400 von 500 in Gruppe 1 … */ })
    expect(document.querySelector('[data-branch="1"]')!.textContent).toContain('80 %')
  })

  it('zeigt bei Gewinn den Saldo statt eines Anteils', () => {
    // Ein Anteil an einer Summe, in die 41 negative Beträge eingehen, wäre
    // eine Zahl ohne Bedeutung.
    renderLegend({ /* metric: 'gewinn', Gruppe 1 mit Saldo -75 Mio. … */ })
    const text = document.querySelector('[data-branch="1"]')!.textContent!
    expect(text).toContain('Verlust')
    expect(text).not.toContain('%')
  })

  it('meldet den Klick auf eine Branche', () => {
    const getoggelt: number[] = []
    renderLegend({ /* onToggleBranch: (i) => getoggelt.push(i) … */ })
    document.querySelector<HTMLButtonElement>('[data-branch="1"]')!.click()
    expect(getoggelt).toEqual([1])
  })

  it('markiert abgewählte Branchen', () => {
    renderLegend({ /* selectedBranches: new Set([2]) … */ })
    expect(document.querySelector('[data-branch="1"]')!.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[data-branch="2"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('sagt es, wenn alle Branchen abgewählt sind', () => {
    renderLegend({ /* selectedBranches: new Set() … */ })
    expect(document.getElementById('legende')!.textContent)
      .toContain('Keine Branche ausgewählt')
  })

  it('nennt, worauf sich die Höhe gerade bezieht', () => {
    // Auswahlabhängiges vmax ohne Bezugszeile behauptete einen absoluten
    // Massstab, den die Karte nicht hat.
    renderLegend({ /* result.top = Nestlé, 89.5 Mrd. … */ })
    expect(document.getElementById('legende')!.textContent).toContain('Höchste Säule')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legend`
Expected: FAIL — `renderLegend` kennt die neuen Felder nicht.

- [ ] **Step 3: Implement**

Aus dem `swatch()`-`<li>` wird ein `<li>` mit `<button data-branch="…" aria-pressed="…">`. Je Zeile: Farbtupfer, Label, Anzahl, und je nach Kennzahl Anteil (`umsatz`, `mitarbeitende`) oder Saldo (`gewinn`, über `formatMetric`). Darunter zwei Griffe: «nur diese» je Zeile und «alle» über der Liste. Die bestehenden Zeilen (Randmarkierung, unrecherchierte Marker, Mindesthöhen-Hinweis) bleiben unverändert. Neu darunter: die Bezugszeile («Höchste Säule: <Name>, <Wert>») und, bei `metric === 'gewinn'` und `result.losses > 0`, die Verlustzeile.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/legend.ts src/ui/legend.test.ts src/style.css
git commit -m "Legende filtert und zählt — aus einer Farbliste wird ein Bedienelement mit Zahlen"
```

---

## Task 14: Kennzahlenzeile

**Files:**
- Create: `src/ui/kennzahlen.ts`, `src/ui/kennzahlen.test.ts`
- Modify: `src/style.css`

**Interfaces:**
- Produces: `renderKennzahlen(options: { result: SelectionResult; metric: Metric; totalCompanies: number; nationalEmployees: number | null }): void`

- [ ] **Step 1: Write the failing test**

```ts
describe('renderKennzahlen', () => {
  it('nennt den Nenner der Summe, nicht nur die Grundgesamtheit', () => {
    // 762.1 Mrd. entstehen aus 188 Angaben, nicht aus 201 Gesellschaften.
    renderKennzahlen({ /* 201 sichtbar, 188 mit Wert, Summe 762.1e9 … */ })
    const text = document.getElementById('kennzahlen')!.textContent!
    expect(text).toContain('201 Gesellschaften')
    expect(text).toContain('aus 188 Angaben')
  })

  it('stellt bei Mitarbeitenden den Vergleich zur Schweiz daneben', () => {
    renderKennzahlen({ /* metric: 'mitarbeitende', nationalEmployees: 5_876_865 … */ })
    expect(document.getElementById('kennzahlen')!.textContent)
      .toContain("5'876'865")
  })

  it('lässt den Vergleich weg, wenn die Zahl fehlt', () => {
    renderKennzahlen({ /* nationalEmployees: null … */ })
    expect(document.getElementById('kennzahlen')!.textContent).not.toContain('Vergleich')
  })

  it('nennt bei Gewinn den Saldo und die Verlustfirmen', () => {
    renderKennzahlen({ /* metric: 'gewinn', losses: 41 … */ })
    const text = document.getElementById('kennzahlen')!.textContent!
    expect(text).toContain('41')
    expect(text).toContain('Verlust')
  })

  it('sagt es, wenn die Auswahl leer ist', () => {
    renderKennzahlen({ /* visible: [] … */ })
    expect(document.getElementById('kennzahlen')!.textContent)
      .toContain('Keine Gesellschaft ausgewählt')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- kennzahlen`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implement**

Modul nach dem Muster von `src/ui/legend.ts` (`box()`-Funktion, `replaceChildren()`), Element-ID `kennzahlen`. CSS: oben mittig, `position: absolute; top: 1rem; left: 50%; transform: translateX(-50%)`, dieselbe Oberflächenfarbe wie Legende und Panel, `font-size: .8125rem`. Im Media-Query unter 800 px in den Fluss aufnehmen wie `#legende` und `#hinweis`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/kennzahlen.ts src/ui/kennzahlen.test.ts src/style.css
git commit -m "Summenzeile ohne Klick — 2'052'630 Mitarbeitende weltweit gegen 5'876'865 Beschäftigte im Land"
```

---

## Task 15: Panel-Erweiterungen

**Files:**
- Modify: `src/ui/panel.ts`, `src/ui/panel.test.ts`

**Interfaces:**
- Produces:

```ts
export interface CompanyContext {
  metric: Metric
  rank: number | null          // 1-basiert, null wenn ohne Wert
  rankTotal: number
  revenueTotal: number         // Summe über alle recherchierten, für den Anteil
}
export function companyContent(company: Company, context: CompanyContext): PanelContent
```

- [ ] **Step 1: Write the failing test**

```ts
it('nennt den Rang mit seinem Nenner', () => {
  const content = companyContent(company(), { metric: 'umsatz', rank: 3, rankTotal: 188, revenueTotal: 1000 })
  expect(field(content, 'Rang')).toBe('#3 von 188 nach Jahresumsatz')
})

it('lässt den Rang weg, wo die Kennzahl fehlt', () => {
  const content = companyContent(company({ revenueChf: null, placeholder: true }),
                                 { metric: 'umsatz', rank: null, rankTotal: 188, revenueTotal: 1000 })
  expect(field(content, 'Rang')).toBeUndefined()
})

it('benennt die Marge nach ihrem Nenner', () => {
  // 42 der 185 rechnen gegen Geschäftsertrag, nicht gegen Nettoumsatz.
  const bank = company({ revenueType: 'operating_income', revenue: 1000, profit: 100 })
  expect(labels(companyContent(bank, ctx()))).toContain('Marge auf Geschäftsertrag')
  const firma = company({ revenueType: 'net_sales', revenue: 1000, profit: 100 })
  expect(labels(companyContent(firma, ctx()))).toContain('Marge auf Nettoumsatz')
})

it('rechnet keinen Umsatz je Mitarbeitenden bei 0 Mitarbeitenden', () => {
  const content = companyContent(company({ employees: 0 }), ctx())
  expect(labels(content)).not.toContain('Umsatz je Mitarbeitenden')
})

it('verlinkt das Kerngeschäft, wo eine Quelle vorliegt', () => {
  const content = companyContent(company({ productsUrl: 'https://example.test/produkte' }), ctx())
  expect(content.links?.map((l) => l.href)).toContain('https://example.test/produkte')
})

it('zeigt das SIX-Symbol', () => {
  expect(field(companyContent(company({ sixSymbol: 'NESN' }), ctx()), 'SIX-Symbol')).toBe('NESN')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- panel`
Expected: FAIL — `companyContent` nimmt ein Argument.

- [ ] **Step 3: Implement**

`companyContent(company, context)`; die bestehende Feldreihenfolge und alle bestehenden Hinweise bleiben. Neue Felder: `Rang` (nur mit Wert), `Marge auf Nettoumsatz` / `Marge auf Geschäftsertrag` (nur wenn `revenue` und `profit` vorliegen), `Umsatz je Mitarbeitenden` (nur wenn `revenueChf` vorliegt und `employees > 0`), `Anteil am Gesamtumsatz`, `SIX-Symbol`. Neuer Link `Kerngeschäft belegen` aus `productsUrl` neben `Geschäftsbericht öffnen`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/panel.ts src/ui/panel.test.ts
git commit -m "Panel zeigt, was die Daten hergeben: Rang, Marge, Umsatz je Mitarbeitenden, SIX-Symbol, Produktquelle"
```

---

## Task 16: Hover auf den Säulen

**Files:**
- Modify: `src/ui/hoverLabel.ts`, `src/layers/viewLayers.ts`, `src/style.css`
- Create: `src/ui/hoverLabel.test.ts`

**Interfaces:**
- Produces: `showHoverLabel(lines: string | readonly string[], x: number, y: number): void`

- [ ] **Step 1: Write the failing test**

```ts
it('zeigt zwei Zeilen', () => {
  showHoverLabel(['Nestlé S.A.', "89.49 Mrd. CHF · Industrie und Energie"], 10, 10)
  expect(document.querySelectorAll('#hover-label > span')).toHaveLength(2)
})

it('nimmt weiterhin eine einzelne Zeichenkette', () => {
  // Die unrecherchierten Marker haben nichts Zweites zu sagen.
  showHoverLabel('Beispiel AG', 10, 10)
  expect(document.querySelectorAll('#hover-label > span')).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hoverLabel`
Expected: FAIL — `showHoverLabel` setzt `textContent`.

- [ ] **Step 3: Implement**

`showHoverLabel` normalisiert auf ein Array und rendert je Zeile ein `<span>`; CSS: `#hover-label > span { display: block }`, zweite Zeile kleiner und in `--tinte-leise`, `white-space: nowrap` bleibt je Zeile.

In `viewLayers.ts` bekommt `buildCompanyLayer` einen `onHover`, der Name, Wert der aktiven Kennzahl (`formatMetric`) und Branchenlabel zeigt.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/hoverLabel.ts src/ui/hoverLabel.test.ts src/layers/viewLayers.ts src/style.css
git commit -m "Hover auf den Säulen — die 201 recherchierten Firmen gaben beim Überfahren bisher nichts preis"
```

---

## Task 17: Rahmung und Kontrast

**Files:**
- Modify: `src/map.ts`, `src/layers/cantons.ts`, `src/style.css`

**Interfaces:**
- Produces: `FRAME_PADDING = { top: 96, bottom: 160, left: 320, right: 360 }`, `PITCH_FILL_BOOST` (in Task 18 im Browser bestimmt)

- [ ] **Step 1: Implement Rahmung**

In `src/map.ts` `FRAME_PADDING_PX` durch ein seitenweises Padding ersetzen, das die tatsächliche Chrome nennt (Steuerung und Kennzahlenzeile oben, Legende unten links, Eckbox unten rechts, Panel rechts), und den bisher als unverifiziert markierten Kommentar durch die neue Herleitung ersetzen. `frameBounds` übergibt das Objekt an `map.fitBounds` und wendet danach `PITCH_FILL_BOOST` an — `maplibre-gl` rechnet `pitch` in `cameraForBounds` nicht ein, weshalb die gerahmte Fläche sonst rund halb so gross bleibt wie das Bild.

- [ ] **Step 2: Implement Kontrast**

`--land` in `src/style.css` und `LAND_FILL` in `src/layers/cantons.ts` gemeinsam um einen Schritt dunkler setzen (`#CFD8E3` → `#C3CEDC`, `[195, 206, 220, 255]`). Beide Stellen tragen denselben Wert doppelt — der bestehende Kommentar in `cantons.ts` sagt das bereits; er bleibt gültig.

- [ ] **Step 3: Kontrast der Branchenfarben nachprüfen**

Run:

```bash
uv run --project etl python -c "
from zeigmers_etl import noga
def lum(h):
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
grund = lum('#C3CEDC')
for g in noga.load_table().groups:
    a, b = sorted((lum(g.color), grund), reverse=True)
    print(f'{(a + 0.05) / (b + 0.05):4.2f}  {g.label}')
"
```

Expected: Jede Branchenfarbe erreicht mindestens 1.6 gegen die neue Plattenfarbe. Wird eine Farbe darunter gedrückt, wird die Plattenfarbe zurückgenommen — **nicht** die geprüfte Branchenfarbe geändert.

- [ ] **Step 4: Run tests**

Run: `npm test && npm run build`
Expected: PASS, Build ohne Typfehler.

- [ ] **Step 5: Commit**

```bash
git add src/map.ts src/layers/cantons.ts src/style.css
git commit -m "Rahmung rechnet Chrome und Pitch ein; die Platte trägt jetzt Kontrast gegen die Säulen"
```

---

## Task 18: Verdrahtung und Prüfung im Browser

**Files:**
- Modify: `src/karte/firmen.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: alles aus Task 5–17

- [ ] **Step 1: Zustand verdrahten**

`startFirmen()` hält:

```ts
let selection: Selection = {
  metric: 'umsatz',
  branches: new Set(presentGroups.indices),
  orgForms: new Set(companies.stats.orgForms),
}
```

`render()` ruft `applySelection`, baut daraus Layer (`buildViewLayers`), Legende, Kennzahlenzeile und Hinweise, und wird von jedem Callback (`onModeChange`, Kennzahl, Organisationsform, Branchenklick) neu aufgerufen. Die Abdeckungsangabe (`coverageLabel`) bleibt unverändert.

- [ ] **Step 2: Build und Testlauf**

Run: `npm run build && npm test && uv run --project etl pytest`
Expected: alles grün.

- [ ] **Step 3: Screenshots aller vier Zustände**

Dev-Server starten (`npm run dev`), dann je ein Bild aufnehmen:

```bash
SHOT=/tmp/zeigmers && mkdir -p $SHOT
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --hide-scrollbars --window-size=1600,1000 --virtual-time-budget=20000 \
  --screenshot=$SHOT/umsatz.png http://localhost:5173/firmen/
```

Zu prüfen, Bild für Bild:

1. **Umsatz (Start):** Füllt die Schweiz den Rahmen? Stehen die Säulen differenziert statt auf einer Stummelreihe? Sind Genfersee und Vierwaldstättersee da? Tragen die grössten zwölf ihre Namen ohne Überlappung?
2. **Gewinn:** Ist die Nulllinie sichtbar? Hängen die 41 Verlustsäulen erkennbar darunter, ohne in der Platte zu verschwinden? — **Wenn nein**, auf «Betrag positiv, Verlustfarbe» zurückfallen (zweite Wahl aus der Spec, Abschnitt «Entscheidungen»), `zeroPlaneHeight` auf `CANTON_ELEVATION_M` festsetzen und den Grund im Code festhalten.
3. **Mitarbeitende:** Steht der Vergleich zu den 5'876'865 in der Kennzahlenzeile?
4. **Eine Branche gefiltert:** Skaliert die Auswahl auf die volle Höhe? Nennt die Legende die Bezugsfirma?

`PITCH_FILL_BOOST` aus Bild 1 bestimmen und als Konstante mit dem gemessenen Wert festschreiben.

- [ ] **Step 4: README nachziehen**

Die Beschreibung von `/firmen/` um die drei Kennzahlen, die Filter und die Seen erweitern; Natural Earth in der Quellenliste nennen. Die Abschnitte zur Höhenskala bleiben gültig.

- [ ] **Step 5: Commit**

```bash
git add src/karte/firmen.ts README.md src/layers/visible.ts src/map.ts
git commit -m "Firmenseite verdrahtet: Kennzahl, Filter und Basiskarte greifen ineinander"
```

---

## Selbstprüfung des Plans

**Abdeckung der Spec:** Abschnitt 1 → Task 5, 7, 18. Abschnitt 2 → Task 6, 8. Abschnitt 3 → Task 9, 11. Abschnitt 4 → Task 4, 10, 17. Abschnitt 5 → Task 13. Abschnitt 6 → Task 14. Abschnitt 7 → Task 15. Abschnitt 8 → Task 16. Abschnitt 9 → Task 1, 2, 4. Abschnitt 10 (Randfälle) → Tests in Task 3, 5, 7, 8, 10, 13, 14, 15. Abschnitt 11 → in jeder Aufgabe. Abschnitt 12 (Nicht-Umfang) → keine Aufgabe, richtig so.

**DOM-Umgebung:** Geprüft — `vite.config.ts` setzt `test: { environment: 'node' }`, ein `document` gibt es in den Tests heute nicht. Task 12 installiert `jsdom` und stellt die DOM-Testdateien einzeln über `// @vitest-environment jsdom` um; Task 13, 14 und 16 übernehmen dieselbe Zeile. Die Domain-Tests bleiben unter `node`.

**Signaturen quer geprüft:** `applySelection`/`branchTotals` (Task 7) werden in Task 8, 9, 11, 13, 14 mit derselben Form verwendet. `metricValue` (Task 5) ersetzt `heightValue` vollständig — Task 8 entfernt die alte Funktion samt Aufrufern. `showHoverLabel` wechselt in Task 16 von `string` auf `string | readonly string[]`; der bestehende Aufrufer für die unrecherchierten Marker (`viewLayers.ts`) bleibt gültig, weil die Zeichenketten-Form erhalten bleibt. `companyContent` bekommt in Task 15 ein zweites Argument; einziger Aufrufer ist `showCompanyPanel` in derselben Datei.
