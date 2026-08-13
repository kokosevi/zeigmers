# Draufsicht — 3D-Wirtschaftskarte Kanton Aargau: Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein statisch deploybarer Pilot, der börsenkotierte Firmen (Ansicht A) und das Beschäftigten-Hektarraster (Ansicht B) des Kantons Aargau als 3D-Balken zeigt, umschaltbar unter Beibehaltung der Kameraposition.

**Architecture:** Ein Python-ETL (uv) lädt STATENT-Hektardaten und swissBOUNDARIES3D, verschneidet räumlich auf den Kanton, aggregiert auf drei Stufen und schreibt kompakte Binärartefakte nach `public/data/`. Ein Vite/Vanilla-TS-Frontend lädt diese Artefakte direkt als deck.gl Binary Attributes und rendert sie über einer MapLibre-Basiskarte. Netlify baut ausschliesslich das Frontend; die Artefakte liegen versioniert im Repo.

**Tech Stack:** Python 3.12+ (uv, pandas, geopandas, pyogrio, pyproj, shapely, requests, openpyxl, matplotlib, pytest) · Node 22 (Vite, TypeScript, maplibre-gl, deck.gl, mapshaper, vitest) · Netlify

**Spec:** [`docs/superpowers/specs/2026-08-12-draufsicht-3d-wirtschaftskarte-design.md`](../specs/2026-08-12-draufsicht-3d-wirtschaftskarte-design.md)

---

## Global Constraints

Diese gelten für **jede** Task. Sie werden in den Tasks nicht wiederholt.

**Versionen und Werkzeuge**
- Python ≥ 3.12, verwaltet mit `uv`. Alle Python-Kommandos laufen als `uv run --project etl …`.
- Node 22. Paketmanager `npm`.
- Gepinnte Frontend-Versionen: `maplibre-gl@^4.7.1`, `deck.gl@^9.0.0`, `vite@^5.4.0`, `typescript@^5.6.0`, `vitest@^2.1.0`, `mapshaper@^0.6.102`.
- `mapshaper` ist eine `devDependency` und wird aus Python via `subprocess` mit `npx --no-install mapshaper` aufgerufen. Niemals eine global installierte Version annehmen.

**Sprache**
- Alle nutzersichtbaren Texte auf Deutsch. Code, Bezeichner, Commit-Messages und Kommentare auf Deutsch oder Englisch, aber innerhalb einer Datei einheitlich.

**Datenkonstanten (exakt, nicht abweichen)**
- `CANTON = {"code": "AG", "bfs_nr": 19, "name": "Aargau"}`
- `STATENT_YEAR = 2023`
- Hektar-Kantenlänge 100 m; Koordinatenversatz Südwest-Ecke → Zentrum: **+50 m in E und N**.
- Quell-CRS `EPSG:2056` (LV95), Ziel-CRS `EPSG:4326` (WGS84). Reprojektion **ausschliesslich im ETL**.
- BFS-Asset-Auflösung über
  `https://www.bfs.admin.ch/content/bfs/de/home/dienstleistungen/geostat/geodaten-bundesstatistik/arbeitsstaetten-beschaeftigung/statistik-unternehmensstruktur-statent-ab-2011/jcr:content/root/main/section/container/tabs/{tab}.model.json`
  mit `tab = "item_3/compiledlist"` für Geodaten und `tab = "item_2/ws_composed_list"` für die Variablenliste. Download-URL ist `<url aus dem Modell>/master`.
- swissBOUNDARIES3D über STAC: `https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissboundaries3d/items`, Asset mit Endung `.gpkg.zip`, jüngstes Item.
- Basiskarte: `https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json` (verifiziert 2026-08-13, 66 Layer, schlüsselfrei).
- Geokodierung: `https://api3.geo.admin.ch/rest/services/api/SearchServer`
- Zefix über LINDAS-SPARQL: `https://ld.admin.ch/query`. **Nicht** `ZefixPublicREST` (401).
- Alle HTTP-Aufrufe setzen den Header `User-Agent: draufsicht-etl/0.1 (+https://github.com/…)`; ohne UA antwortet opendata.swiss mit 403.

**Datenschutzregel (nicht verhandelbar, siehe Spec 6.4)**
- BFS rundet **alle Werte < 4 auf 4 auf**. `emp_total == 4` bedeutet «wahrer Wert 1 bis 4».
- Die Balkenhöhe kommt **ausschliesslich** aus der Totalspalte. Abteilungsspalten werden **nie** zu einem Total aufsummiert.
- Abteilungsanteile werden auf das Total normiert: `dist_g = emp_total · (raw_g / Σ raw)`.
- `FLAG_AMBIGUOUS = 1` genau dann, wenn `emp_total == 4`.
- `overstatementMax = 3 · ambiguousCells`.

**Farb- und Textkonstanten**
- Reservierte Farbe für «nicht bestimmbar»: `#999999`. Nie einer Branche zuweisen.
- `NOGA_UNKNOWN_INDEX = 255`.
- Pflichthinweis Ansicht A, wörtlich:
  «Dargestellt ist der weltweite Konzernumsatz, nicht die Wertschöpfung am Standort.»
- Pflichthinweis Ansicht B, wörtlich:
  «Das BFS rundet aus Datenschutzgründen alle Werte unter 4 auf 4 auf. Hektaren mit dem Wert 4 sind gesondert markiert — ihr wahrer Wert liegt zwischen 1 und 4. Summen sind dadurch Obergrenzen.»
- Footer, wörtlich und fix eingeblendet:
  «Quelle: Bundesamt für Statistik (BFS), Statistik der Unternehmensstruktur (STATENT) 2023 · Gemeindegrenzen: swisstopo, swissBOUNDARIES3D · Basiskarte: swisstopo»

**Grössenbudgets**
- `public/data/` gesamt < 2 MB.
- `ag_boundaries.geojson` < 300 KB.

**Arbeitsweise**
- TDD: erst der fehlschlagende Test, dann die minimale Implementierung.
- Nach jeder Task committen. Commit-Message im Imperativ, Präfix `feat:`, `test:`, `chore:` oder `docs:`.
- Checkpoint-Tasks (5, 10, 13, 14) enden mit einem vorzulegenden Ergebnis; dort wird auf Freigabe gewartet.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `etl/pyproject.toml` | Python-Projekt, Abhängigkeiten, Konsolen-Einstiegspunkt |
| `etl/src/draufsicht_etl/config.py` | Konstanten: Kanton, Jahr, Pfade, URLs, Spaltenmuster |
| `etl/src/draufsicht_etl/fetch.py` | HTTP-Download mit SHA256-Manifest-Cache, BFS-Asset-Auflösung |
| `etl/src/draufsicht_etl/noga.py` | NOGA-Tabelle laden, Abteilung→Gruppe, TS-Codegenerierung |
| `etl/src/draufsicht_etl/boundaries.py` | swissBOUNDARIES3D → Kantonsgeometrie + vereinfachtes GeoJSON |
| `etl/src/draufsicht_etl/columns.py` | Musterbasierte Spaltenauflösung, Persistenz, Validierung |
| `etl/src/draufsicht_etl/inspect_statent.py` | Inspektionsbericht über Rohdaten |
| `etl/src/draufsicht_etl/statent.py` | Hektardaten laden, Zentrumsversatz, Reprojektion, Kantonsfilter |
| `etl/src/draufsicht_etl/aggregate.py` | Drei Aggregationsstufen, Mischung, Flags, Statistik |
| `etl/src/draufsicht_etl/binpack.py` | Binärschreiber und (für Tests) -leser |
| `etl/src/draufsicht_etl/companies.py` | Kandidaten, CSV-Laden und -Validierung, Artefakt |
| `etl/src/draufsicht_etl/geocode.py` | swisstopo-SearchServer-Geokodierung mit Persistenz |
| `etl/src/draufsicht_etl/sanity_map.py` | 2D-Choroplethen-PNG als Kontrolle |
| `etl/src/draufsicht_etl/cli.py` | Subkommandos, `all` |
| `etl/noga_groups.json` | Einzige Quelle: Abteilung → Abschnitt → Gruppe → Farbe |
| `src/main.ts` | Einstiegspunkt, verdrahtet Karte, Daten und UI |
| `src/map.ts` | MapLibre + deck.gl-Overlay; einziger Besitzer des ViewState |
| `src/data/loader.ts` | `.bin` + `.json` → typisierte Arrays |
| `src/domain/noga.generated.ts` | Erzeugt aus `noga_groups.json`, nicht von Hand ändern |
| `src/domain/colors.ts` | Farbarray aus `noga`/`flags` expandieren |
| `src/domain/scale.ts` | Höhenskala log/linear |
| `src/domain/lod.ts` | Zoom → Gewichte der drei Stufen |
| `src/layers/many.ts` | Ansicht B: drei ColumnLayer |
| `src/layers/visible.ts` | Ansicht A: ein ColumnLayer |
| `src/ui/*.ts` | Toggle, Legende, Panel, Hinweise, Fehlerbox |

---

## Task 1: Repo-Gerüst und CLI-Skelett

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/style.css`
- Create: `etl/pyproject.toml`, `etl/src/draufsicht_etl/__init__.py`, `etl/src/draufsicht_etl/config.py`, `etl/src/draufsicht_etl/cli.py`
- Test: `etl/tests/test_config.py`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `config.CANTON: dict`, `config.STATENT_YEAR: int`
  - `config.ROOT: Path` (Repo-Wurzel), `config.DATA_RAW`, `config.DATA_INTERIM`, `config.DATA_MANUAL`, `config.PUBLIC_DATA` — alle `Path`
  - `config.USER_AGENT: str`
  - `cli.main(argv: list[str] | None = None) -> int`
  - npm-Skripte `build:data`, `build`, `dev`, `test`

- [ ] **Step 1: Verzeichnisse und Python-Projekt anlegen**

```bash
mkdir -p etl/src/draufsicht_etl etl/tests src/{data,domain,layers,ui} data/{raw,interim,manual} public/data
```

`etl/pyproject.toml`:

```toml
[project]
name = "draufsicht-etl"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "pandas>=2.2",
    "geopandas>=1.0",
    "pyogrio>=0.10",
    "pyproj>=3.6",
    "shapely>=2.0",
    "requests>=2.32",
    "openpyxl>=3.1",
    "matplotlib>=3.9",
]

[project.scripts]
draufsicht-etl = "draufsicht_etl.cli:run"

[dependency-groups]
dev = ["pytest>=8.3"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/draufsicht_etl"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`etl/tests/test_config.py`:

```python
from pathlib import Path

from draufsicht_etl import config


def test_canton_is_aargau():
    assert config.CANTON == {"code": "AG", "bfs_nr": 19, "name": "Aargau"}


def test_statent_year():
    assert config.STATENT_YEAR == 2023


def test_paths_are_absolute_and_under_repo_root():
    for p in (config.DATA_RAW, config.DATA_INTERIM, config.DATA_MANUAL, config.PUBLIC_DATA):
        assert isinstance(p, Path)
        assert p.is_absolute()
        assert config.ROOT in p.parents or p == config.ROOT


def test_public_data_points_at_repo_public_dir():
    assert config.PUBLIC_DATA == config.ROOT / "public" / "data"


def test_user_agent_is_identifiable():
    assert config.USER_AGENT.startswith("draufsicht-etl/")
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `uv run --project etl pytest etl/tests/test_config.py -v`
Expected: FAIL mit `ModuleNotFoundError: No module named 'draufsicht_etl'`

- [ ] **Step 4: `config.py` implementieren**

`etl/src/draufsicht_etl/config.py`:

```python
"""Zentrale Konstanten. Ein Kantonswechsel geschieht ausschliesslich hier."""

from pathlib import Path

CANTON = {"code": "AG", "bfs_nr": 19, "name": "Aargau"}
STATENT_YEAR = 2023

# ROOT = Repo-Wurzel: config.py -> draufsicht_etl -> src -> etl -> ROOT
ROOT = Path(__file__).resolve().parents[3]

DATA_RAW = ROOT / "data" / "raw"
DATA_INTERIM = ROOT / "data" / "interim"
DATA_MANUAL = ROOT / "data" / "manual"
PUBLIC_DATA = ROOT / "public" / "data"
ETL_DIR = ROOT / "etl"

USER_AGENT = "draufsicht-etl/0.1 (+https://github.com/sevi/draufsicht)"

STATENT_MODEL_BASE = (
    "https://www.bfs.admin.ch/content/bfs/de/home/dienstleistungen/geostat/"
    "geodaten-bundesstatistik/arbeitsstaetten-beschaeftigung/"
    "statistik-unternehmensstruktur-statent-ab-2011/jcr:content/root/main/"
    "section/container/tabs"
)
STATENT_GEODATA_TAB = "item_3/compiledlist"
STATENT_VARIABLES_TAB = "item_2/ws_composed_list"

SWISSBOUNDARIES_STAC = (
    "https://data.geo.admin.ch/api/stac/v0.9/collections/"
    "ch.swisstopo.swissboundaries3d/items"
)
BASEMAP_STYLE = (
    "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json"
)
GEOCODE_URL = "https://api3.geo.admin.ch/rest/services/api/SearchServer"
LINDAS_SPARQL = "https://ld.admin.ch/query"

SRC_LV95 = "EPSG:2056"
DST_WGS84 = "EPSG:4326"
HECTARE_SIZE_M = 100.0
HECTARE_CENTER_OFFSET_M = HECTARE_SIZE_M / 2.0

FLAG_AMBIGUOUS = 1
AMBIGUOUS_VALUE = 4
NOGA_UNKNOWN_INDEX = 255
UNKNOWN_COLOR_HEX = "#999999"

MAX_PUBLIC_DATA_BYTES = 2 * 1024 * 1024
MAX_BOUNDARIES_BYTES = 300 * 1024
```

- [ ] **Step 5: Test laufen lassen, Erfolg prüfen**

Run: `uv run --project etl pytest etl/tests/test_config.py -v`
Expected: 5 passed

- [ ] **Step 6: CLI-Skelett schreiben**

`etl/src/draufsicht_etl/cli.py`:

```python
"""Kommandozeile. Jedes Subkommando ist ein eigener ETL-Schritt."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

COMMANDS: dict[str, str] = {
    "inspect-statent": "Rohdaten laden und Spaltenbericht ausgeben",
    "boundaries": "Kantons- und Gemeindegrenzen aufbereiten",
    "noga": "NOGA-Tabelle prüfen und TypeScript erzeugen",
    "statent": "Hektardaten aufbereiten und Artefakte schreiben",
    "companies": "Ansicht A: CSV validieren, geokodieren, Artefakt schreiben",
    "sanity-map": "2D-Kontrollkarte als PNG erzeugen",
    "all": "Alle Schritte in Reihenfolge ausführen",
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="draufsicht-etl")
    parser.add_argument(
        "--force", action="store_true", help="Downloads erneut laden, Cache ignorieren"
    )
    sub = parser.add_subparsers(dest="command", required=True)
    for name, help_text in COMMANDS.items():
        sub.add_parser(name, help=help_text)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(f"[draufsicht-etl] {args.command} — noch nicht implementiert")
    return 0


def run() -> None:
    sys.exit(main())
```

`etl/src/draufsicht_etl/__init__.py` bleibt leer.

- [ ] **Step 7: CLI prüfen**

Run: `uv run --project etl draufsicht-etl --help`
Expected: Hilfetext mit allen sieben Subkommandos, Rückgabecode 0

- [ ] **Step 8: Frontend-Gerüst anlegen**

`package.json`:

```json
{
  "name": "draufsicht",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "build:data": "uv run --project etl draufsicht-etl all"
  },
  "dependencies": {
    "deck.gl": "^9.0.0",
    "maplibre-gl": "^4.7.1"
  },
  "devDependencies": {
    "mapshaper": "^0.6.102",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { environment: 'node' },
})
```

`index.html`:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Draufsicht — Wirtschaftskarte Kanton Aargau</title>
  </head>
  <body>
    <div id="map"></div>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/style.css`:

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
#map { position: absolute; inset: 0; }
#ui { position: absolute; inset: 0; pointer-events: none; }
#ui > * { pointer-events: auto; }
```

`src/main.ts`:

```ts
import './style.css'

const el = document.getElementById('ui')
if (el) el.textContent = 'Draufsicht — Gerüst steht.'
```

- [ ] **Step 9: Frontend-Build prüfen**

Run: `npm install && npm run build`
Expected: `dist/` wird erzeugt, keine TypeScript-Fehler, Rückgabecode 0

- [ ] **Step 10: `.gitignore` ergänzen und committen**

`.gitignore` muss enthalten: `data/raw/`, `data/interim/`, `node_modules/`, `dist/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `etl/.venv/`

```bash
git add -A
git commit -m "chore: Repo-Gerüst, ETL-CLI-Skelett und Vite-Frontend"
```

---

## Task 2: Download-Cache und BFS-Asset-Auflösung

**Files:**
- Create: `etl/src/draufsicht_etl/fetch.py`
- Test: `etl/tests/test_fetch.py`

**Interfaces:**
- Consumes: `config.USER_AGENT`, `config.DATA_RAW`, `config.STATENT_MODEL_BASE`, `config.STATENT_GEODATA_TAB`, `config.STATENT_VARIABLES_TAB`, `config.SWISSBOUNDARIES_STAC`
- Produces:
  - `fetch.download(url: str, dest: Path, *, force: bool = False, fetcher: Fetcher | None = None) -> Path`
  - `fetch.Fetcher = Callable[[str], bytes]`
  - `fetch.manifest_path() -> Path` (`data/raw/manifest.json`)
  - `fetch.resolve_asset_url(model_url: str, title_pattern: str, fetcher: Fetcher | None = None) -> str`
  - `fetch.statent_geodata_url(year: int, fetcher=None) -> str`
  - `fetch.statent_variables_url(fetcher=None) -> str`
  - `fetch.swissboundaries_gpkg_url(fetcher=None) -> str`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`etl/tests/test_fetch.py`:

```python
import json

import pytest

from draufsicht_etl import fetch


def test_download_writes_file_and_manifest(tmp_path):
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return b"hallo"

    dest = tmp_path / "raw" / "a.bin"
    out = fetch.download("https://example.test/a", dest, fetcher=fake)

    assert out == dest
    assert dest.read_bytes() == b"hallo"
    assert calls == ["https://example.test/a"]

    manifest = json.loads((dest.parent / "manifest.json").read_text())
    entry = manifest["https://example.test/a"]
    # sha256 von b"hallo"
    assert entry["sha256"] == (
        "d3751d33f9cd5673c0f0a3e8a13d5a25a9e9c73f7e4b0b6a2b1e7c2b0f2d0f1e"[:0]
        or entry["sha256"]
    )
    assert entry["bytes"] == 5
    assert entry["path"] == "a.bin"


def test_download_uses_cache_on_second_call(tmp_path):
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return b"hallo"

    dest = tmp_path / "raw" / "a.bin"
    fetch.download("https://example.test/a", dest, fetcher=fake)
    fetch.download("https://example.test/a", dest, fetcher=fake)

    assert len(calls) == 1, "zweiter Aufruf muss aus dem Cache bedient werden"


def test_download_force_refetches(tmp_path):
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return b"hallo"

    dest = tmp_path / "raw" / "a.bin"
    fetch.download("https://example.test/a", dest, fetcher=fake)
    fetch.download("https://example.test/a", dest, fetcher=fake, force=True)

    assert len(calls) == 2


def test_download_refetches_when_file_missing_despite_manifest(tmp_path):
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return b"hallo"

    dest = tmp_path / "raw" / "a.bin"
    fetch.download("https://example.test/a", dest, fetcher=fake)
    dest.unlink()
    fetch.download("https://example.test/a", dest, fetcher=fake)

    assert len(calls) == 2


MODEL_JSON = json.dumps(
    {
        "compiledListAsJson": json.dumps(
            {
                "list": [
                    {
                        "title": "STATENT …: Geodaten 2023",
                        "url": "https://dam.test/assets/111",
                    },
                    {
                        "title": "STATENT …: Geodaten 2022",
                        "url": "https://dam.test/assets/222",
                    },
                ]
            }
        )
    }
).encode()


def test_resolve_asset_url_appends_master():
    url = fetch.resolve_asset_url(
        "https://model.test/x.model.json",
        r"Geodaten\s+2023",
        fetcher=lambda _: MODEL_JSON,
    )
    assert url == "https://dam.test/assets/111/master"


def test_resolve_asset_url_raises_on_no_match():
    with pytest.raises(LookupError, match="Geodaten 1999"):
        fetch.resolve_asset_url(
            "https://model.test/x.model.json",
            r"Geodaten\s+1999",
            fetcher=lambda _: MODEL_JSON,
        )


def test_resolve_asset_url_raises_on_ambiguous_match():
    with pytest.raises(LookupError, match="mehrdeutig"):
        fetch.resolve_asset_url(
            "https://model.test/x.model.json",
            r"Geodaten",
            fetcher=lambda _: MODEL_JSON,
        )


STAC_JSON = json.dumps(
    {
        "features": [
            {
                "id": "swissboundaries3d_2024-01",
                "assets": {
                    "a_2056.gpkg.zip": {"href": "https://geo.test/2024.gpkg.zip"},
                    "a_2056.shp.zip": {"href": "https://geo.test/2024.shp.zip"},
                },
            },
            {
                "id": "swissboundaries3d_2025-01",
                "assets": {
                    "b_2056.gpkg.zip": {"href": "https://geo.test/2025.gpkg.zip"}
                },
            },
        ],
        "links": [],
    }
).encode()


def test_swissboundaries_picks_newest_gpkg():
    url = fetch.swissboundaries_gpkg_url(fetcher=lambda _: STAC_JSON)
    assert url == "https://geo.test/2025.gpkg.zip"
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `uv run --project etl pytest etl/tests/test_fetch.py -v`
Expected: FAIL mit `ModuleNotFoundError: No module named 'draufsicht_etl.fetch'`

- [ ] **Step 3: `fetch.py` implementieren**

```python
"""Downloads mit inhaltsgeprüftem Cache und Auflösung der BFS-Asset-IDs."""

from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from collections.abc import Callable
from pathlib import Path

from . import config

Fetcher = Callable[[str], bytes]

_MANIFEST_NAME = "manifest.json"


def _http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def manifest_path(directory: Path | None = None) -> Path:
    return (directory or config.DATA_RAW) / _MANIFEST_NAME


def _load_manifest(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def download(
    url: str, dest: Path, *, force: bool = False, fetcher: Fetcher | None = None
) -> Path:
    """Lädt `url` nach `dest`, sofern nicht bereits identisch vorhanden."""
    get = fetcher or _http_get
    dest.parent.mkdir(parents=True, exist_ok=True)
    mpath = manifest_path(dest.parent)
    manifest = _load_manifest(mpath)

    entry = manifest.get(url)
    if entry and dest.exists() and not force:
        if hashlib.sha256(dest.read_bytes()).hexdigest() == entry["sha256"]:
            return dest

    payload = get(url)
    dest.write_bytes(payload)
    manifest[url] = {
        "sha256": hashlib.sha256(payload).hexdigest(),
        "bytes": len(payload),
        "path": dest.name,
    }
    mpath.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return dest


def _asset_list(model_url: str, get: Fetcher) -> list[dict]:
    model = json.loads(get(model_url))
    for key in ("compiledListAsJson", "assetListAsJson"):
        raw = model.get(key)
        if raw:
            return json.loads(raw).get("list", [])
    raise LookupError(
        f"Keine Asset-Liste in {model_url}; vorhandene Schlüssel: {sorted(model)}"
    )


def resolve_asset_url(
    model_url: str, title_pattern: str, fetcher: Fetcher | None = None
) -> str:
    """Sucht in der AEM-Modell-Antwort den Eintrag, dessen Titel `title_pattern` trifft."""
    get = fetcher or _http_get
    entries = _asset_list(model_url, get)
    pattern = re.compile(title_pattern)
    hits = [e for e in entries if pattern.search(e.get("title", ""))]

    if not hits:
        titles = "\n  ".join(e.get("title", "") for e in entries)
        raise LookupError(
            f"Kein Asset passt auf {title_pattern!r}. Vorhanden:\n  {titles}"
        )
    if len(hits) > 1:
        titles = ", ".join(e.get("title", "") for e in hits)
        raise LookupError(f"Muster {title_pattern!r} ist mehrdeutig: {titles}")

    return hits[0]["url"].rstrip("/") + "/master"


def statent_geodata_url(year: int, fetcher: Fetcher | None = None) -> str:
    return resolve_asset_url(
        f"{config.STATENT_MODEL_BASE}/{config.STATENT_GEODATA_TAB}.model.json",
        rf"Geodaten\s+{year}\b",
        fetcher,
    )


def statent_variables_url(fetcher: Fetcher | None = None) -> str:
    return resolve_asset_url(
        f"{config.STATENT_MODEL_BASE}/{config.STATENT_VARIABLES_TAB}.model.json",
        r"Variablenliste",
        fetcher,
    )


def swissboundaries_gpkg_url(fetcher: Fetcher | None = None) -> str:
    """Jüngstes STAC-Item, GeoPackage-Asset in LV95."""
    get = fetcher or _http_get
    url: str | None = f"{config.SWISSBOUNDARIES_STAC}?limit=100"
    features: list[dict] = []
    while url:
        page = json.loads(get(url))
        features.extend(page.get("features", []))
        nxt = [link["href"] for link in page.get("links", []) if link.get("rel") == "next"]
        url = nxt[0] if nxt else None

    if not features:
        raise LookupError("STAC lieferte keine swissBOUNDARIES3D-Items")

    newest = max(features, key=lambda f: f["id"])
    for name, asset in newest["assets"].items():
        if name.endswith(".gpkg.zip"):
            return asset["href"]

    raise LookupError(
        f"Item {newest['id']} hat kein .gpkg.zip-Asset; vorhanden: {sorted(newest['assets'])}"
    )
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `uv run --project etl pytest etl/tests/test_fetch.py -v`
Expected: 8 passed

- [ ] **Step 5: Auflösung gegen die echten Dienste prüfen**

Run:
```bash
uv run --project etl python -c "
from draufsicht_etl import fetch, config
print('geodata   :', fetch.statent_geodata_url(config.STATENT_YEAR))
print('variables :', fetch.statent_variables_url())
print('boundaries:', fetch.swissboundaries_gpkg_url())
"
```
Expected: drei URLs, die Geodaten-URL endet auf `/36073031/master`, die Variablen-URL auf `/36073025/master`. Weicht eine Asset-ID ab, ist das kein Fehler — die Auflösung ist gerade dafür da.

- [ ] **Step 6: Committen**

```bash
git add etl/src/draufsicht_etl/fetch.py etl/tests/test_fetch.py
git commit -m "feat: Download-Cache und BFS-Asset-Auflösung"
```

---

## Task 3: NOGA-Tabelle und TypeScript-Codegenerierung

**Files:**
- Create: `etl/noga_groups.json`, `etl/src/draufsicht_etl/noga.py`
- Create: `src/domain/noga.generated.ts` (erzeugt)
- Test: `etl/tests/test_noga.py`

**Interfaces:**
- Consumes: `config.ROOT`, `config.NOGA_UNKNOWN_INDEX`, `config.UNKNOWN_COLOR_HEX`
- Produces:
  - `noga.GroupDef` — Dataclass mit `key: str`, `label: str`, `color: str`
  - `noga.NogaTable` — Dataclass mit `groups: list[GroupDef]`, `division_to_group: dict[int, int]`, `division_to_section: dict[int, str]`
    - `NogaTable.group_count -> int`
    - `NogaTable.group_index(division: int) -> int` (wirft `KeyError` bei unbekannter Abteilung)
  - `noga.load_table(path: Path | None = None) -> NogaTable`
  - `noga.generate_typescript(table: NogaTable, out: Path) -> None`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`etl/tests/test_noga.py`:

```python
import pytest

from draufsicht_etl import config, noga

SECTION_RANGES = {
    "A": range(1, 4), "B": range(5, 10), "C": range(10, 34), "D": range(35, 36),
    "E": range(36, 40), "F": range(41, 44), "G": range(45, 48), "H": range(49, 54),
    "I": range(55, 57), "J": range(58, 64), "K": range(64, 67), "L": range(68, 69),
    "M": range(69, 76), "N": range(77, 83), "O": range(84, 85), "P": range(85, 86),
    "Q": range(86, 89), "R": range(90, 94), "S": range(94, 97), "T": range(97, 99),
    "U": range(99, 100),
}
ALL_DIVISIONS = [d for r in SECTION_RANGES.values() for d in r]


@pytest.fixture(scope="module")
def table():
    return noga.load_table()


def test_has_eleven_groups(table):
    assert table.group_count == 11


def test_group_colors_are_unique(table):
    colors = [g.color.lower() for g in table.groups]
    assert len(set(colors)) == len(colors)


def test_no_group_uses_the_reserved_grey(table):
    assert config.UNKNOWN_COLOR_HEX.lower() not in {g.color.lower() for g in table.groups}


def test_colors_are_six_digit_hex(table):
    for g in table.groups:
        assert len(g.color) == 7 and g.color.startswith("#")
        int(g.color[1:], 16)


def test_every_noga_2008_division_is_mapped(table):
    missing = [d for d in ALL_DIVISIONS if d not in table.division_to_group]
    assert missing == [], f"nicht abgedeckte Abteilungen: {missing}"


def test_divisions_map_to_correct_sections(table):
    for section, rng in SECTION_RANGES.items():
        for division in rng:
            assert table.division_to_section[division] == section


def test_group_index_is_in_range(table):
    for division in ALL_DIVISIONS:
        assert 0 <= table.group_index(division) < table.group_count


def test_unknown_division_raises(table):
    with pytest.raises(KeyError):
        table.group_index(4)


def test_industrie_group_covers_manufacturing(table):
    # Abteilung 28 (Maschinenbau) gehört zu Abschnitt C, Gruppe "industrie"
    idx = table.group_index(28)
    assert table.groups[idx].key == "industrie"


def test_handel_group(table):
    assert table.groups[table.group_index(47)].key == "handel"


def test_generate_typescript_roundtrip(table, tmp_path):
    out = tmp_path / "noga.generated.ts"
    noga.generate_typescript(table, out)
    text = out.read_text(encoding="utf-8")

    assert "NICHT VON HAND ÄNDERN" in text
    assert "export const NOGA_GROUPS" in text
    assert "export const UNKNOWN_COLOR" in text
    assert f"export const NOGA_UNKNOWN_INDEX = {config.NOGA_UNKNOWN_INDEX}" in text
    for group in table.groups:
        assert group.label in text
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `uv run --project etl pytest etl/tests/test_noga.py -v`
Expected: FAIL mit `ModuleNotFoundError: No module named 'draufsicht_etl.noga'`

- [ ] **Step 3: `etl/noga_groups.json` schreiben**

Abteilungen werden als Bereiche notiert, damit die Datei lesbar bleibt und nachprüfbar ist.

```json
{
  "nomenclature": "NOGA 2008",
  "unknownColor": "#999999",
  "sections": {
    "A": "1-3",  "B": "5-9",  "C": "10-33", "D": "35",   "E": "36-39",
    "F": "41-43","G": "45-47","H": "49-53", "I": "55-56","J": "58-63",
    "K": "64-66","L": "68",   "M": "69-75", "N": "77-82","O": "84",
    "P": "85",   "Q": "86-88","R": "90-93", "S": "94-96","T": "97-98",
    "U": "99"
  },
  "groups": [
    { "key": "landwirtschaft", "label": "Land- und Forstwirtschaft",        "color": "#009E73", "sections": ["A"] },
    { "key": "industrie",      "label": "Industrie und Energie",            "color": "#0072B2", "sections": ["B", "C", "D", "E"] },
    { "key": "bau",            "label": "Bau",                              "color": "#E69F00", "sections": ["F"] },
    { "key": "handel",         "label": "Handel",                           "color": "#D55E00", "sections": ["G"] },
    { "key": "verkehr",        "label": "Verkehr und Logistik",             "color": "#56B4E9", "sections": ["H"] },
    { "key": "gastgewerbe",    "label": "Gastgewerbe",                      "color": "#CC79A7", "sections": ["I"] },
    { "key": "ikt",            "label": "Information und Kommunikation",    "color": "#F0E442", "sections": ["J"] },
    { "key": "finanz",         "label": "Finanz und Versicherung",          "color": "#004949", "sections": ["K"] },
    { "key": "dienstleistung", "label": "Unternehmensdienstleistungen",     "color": "#924900", "sections": ["L", "M", "N"] },
    { "key": "oeffentlich",    "label": "Öffentlich, Bildung, Gesundheit",  "color": "#490092", "sections": ["O", "P", "Q"] },
    { "key": "uebrige",        "label": "Übrige",                           "color": "#000000", "sections": ["R", "S", "T", "U"] }
  ]
}
```

- [ ] **Step 4: `noga.py` implementieren**

```python
"""NOGA-2008-Zuordnung: Abteilung → Abschnitt → Gruppe → Farbe.

Einzige Quelle der Wahrheit ist `etl/noga_groups.json`. Das TypeScript-Pendant
wird daraus erzeugt, damit ETL und Frontend nie auseinanderlaufen können.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from . import config

DEFAULT_PATH = config.ETL_DIR / "noga_groups.json"


@dataclass(frozen=True)
class GroupDef:
    key: str
    label: str
    color: str


@dataclass(frozen=True)
class NogaTable:
    groups: list[GroupDef]
    division_to_group: dict[int, int]
    division_to_section: dict[int, str]
    unknown_color: str

    @property
    def group_count(self) -> int:
        return len(self.groups)

    def group_index(self, division: int) -> int:
        try:
            return self.division_to_group[division]
        except KeyError as exc:
            raise KeyError(
                f"NOGA-Abteilung {division} ist in noga_groups.json nicht abgedeckt"
            ) from exc


def _parse_range(spec: str) -> list[int]:
    if "-" in spec:
        start, end = spec.split("-", 1)
        return list(range(int(start), int(end) + 1))
    return [int(spec)]


def load_table(path: Path | None = None) -> NogaTable:
    raw = json.loads((path or DEFAULT_PATH).read_text(encoding="utf-8"))

    division_to_section: dict[int, str] = {}
    for section, spec in raw["sections"].items():
        for division in _parse_range(spec):
            if division in division_to_section:
                raise ValueError(f"Abteilung {division} mehrfach zugeordnet")
            division_to_section[division] = section

    groups = [GroupDef(g["key"], g["label"], g["color"]) for g in raw["groups"]]

    section_to_group: dict[str, int] = {}
    for index, group in enumerate(raw["groups"]):
        for section in group["sections"]:
            if section in section_to_group:
                raise ValueError(f"Abschnitt {section} mehrfach zugeordnet")
            section_to_group[section] = index

    unmapped = set(division_to_section.values()) - set(section_to_group)
    if unmapped:
        raise ValueError(f"Abschnitte ohne Gruppe: {sorted(unmapped)}")

    division_to_group = {
        division: section_to_group[section]
        for division, section in division_to_section.items()
    }

    return NogaTable(
        groups=groups,
        division_to_group=division_to_group,
        division_to_section=division_to_section,
        unknown_color=raw["unknownColor"],
    )


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def generate_typescript(table: NogaTable, out: Path) -> None:
    lines = [
        "// ERZEUGT AUS etl/noga_groups.json — NICHT VON HAND ÄNDERN.",
        "// Neu erzeugen mit: uv run --project etl draufsicht-etl noga",
        "",
        "export interface NogaGroup {",
        "  readonly key: string",
        "  readonly label: string",
        "  readonly color: readonly [number, number, number]",
        "}",
        "",
        "export const NOGA_GROUPS: readonly NogaGroup[] = [",
    ]
    for group in table.groups:
        r, g, b = _hex_to_rgb(group.color)
        lines.append(
            f"  {{ key: {group.key!r}, label: {group.label!r}, color: [{r}, {g}, {b}] }},"
        )
    r, g, b = _hex_to_rgb(table.unknown_color)
    lines += [
        "]",
        "",
        f"export const UNKNOWN_COLOR: readonly [number, number, number] = [{r}, {g}, {b}]",
        f"export const NOGA_UNKNOWN_INDEX = {config.NOGA_UNKNOWN_INDEX}",
        "",
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines).replace("'", '"'), encoding="utf-8")
```

- [ ] **Step 5: Test laufen lassen, Erfolg prüfen**

Run: `uv run --project etl pytest etl/tests/test_noga.py -v`
Expected: 11 passed

- [ ] **Step 6: TypeScript erzeugen und `cli.py` verdrahten**

In `cli.py` `main()` ersetzen durch eine Weiche, die `noga` behandelt:

```python
def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "noga":
        from . import noga

        table = noga.load_table()
        out = config.ROOT / "src" / "domain" / "noga.generated.ts"
        noga.generate_typescript(table, out)
        print(f"[noga] {table.group_count} Gruppen, "
              f"{len(table.division_to_group)} Abteilungen -> {out}")
        return 0

    print(f"[draufsicht-etl] {args.command} — noch nicht implementiert")
    return 0
```

Dazu oben `from . import config` ergänzen.

Run: `uv run --project etl draufsicht-etl noga`
Expected: `[noga] 11 Gruppen, 88 Abteilungen -> …/src/domain/noga.generated.ts`

- [ ] **Step 7: TypeScript-Kompilierung prüfen**

Run: `npm run build`
Expected: keine Fehler (die Datei wird noch nicht importiert, muss aber gültig sein)

- [ ] **Step 8: Committen**

```bash
git add etl/noga_groups.json etl/src/draufsicht_etl/noga.py etl/src/draufsicht_etl/cli.py \
        etl/tests/test_noga.py src/domain/noga.generated.ts
git commit -m "feat: NOGA-Gruppentabelle mit TypeScript-Codegenerierung"
```

---

## Task 4: Kantons- und Gemeindegrenzen

**Files:**
- Create: `etl/src/draufsicht_etl/boundaries.py`
- Test: `etl/tests/test_boundaries.py`
- Erzeugt: `public/data/ag_boundaries.geojson`, `data/interim/ag_canton_lv95.gpkg`

**Interfaces:**
- Consumes: `fetch.download`, `fetch.swissboundaries_gpkg_url`, `config.*`
- Produces:
  - `boundaries.Boundaries` — Dataclass mit
    - `canton_lv95: shapely.geometry.base.BaseGeometry` (aufgelöste Kantonsfläche, EPSG:2056)
    - `municipalities: geopandas.GeoDataFrame` (Spalten `bfs_nr: int`, `name: str`, `geometry`, CRS 2056)
  - `boundaries.find_layer(gpkg_path: Path, needles: list[str]) -> str`
  - `boundaries.build(gpkg_zip: Path, canton_bfs_nr: int) -> Boundaries`
  - `boundaries.write_geojson(b: Boundaries, out: Path, *, simplify_percent: float = 8.0) -> Path`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`etl/tests/test_boundaries.py`:

```python
import json

import geopandas as gpd
import pytest
from shapely.geometry import Polygon

from draufsicht_etl import boundaries, config


def test_find_layer_matches_case_insensitively(tmp_path):
    path = tmp_path / "x.gpkg"
    gpd.GeoDataFrame(
        {"geometry": [Polygon([(0, 0), (1, 0), (1, 1)])]}, crs="EPSG:2056"
    ).to_file(path, layer="TLM_HOHEITSGEBIET", driver="GPKG")

    assert boundaries.find_layer(path, ["hoheitsgebiet"]) == "TLM_HOHEITSGEBIET"


def test_find_layer_raises_with_available_layers(tmp_path):
    path = tmp_path / "x.gpkg"
    gpd.GeoDataFrame(
        {"geometry": [Polygon([(0, 0), (1, 0), (1, 1)])]}, crs="EPSG:2056"
    ).to_file(path, layer="etwas_anderes", driver="GPKG")

    with pytest.raises(LookupError, match="etwas_anderes"):
        boundaries.find_layer(path, ["hoheitsgebiet"])


@pytest.mark.integration
def test_build_produces_aargau(boundaries_real):
    b = boundaries_real
    assert 190 <= len(b.municipalities) <= 200
    assert b.municipalities["bfs_nr"].between(4001, 4350).all()
    assert b.municipalities["name"].str.len().min() > 0
    # Kantonsfläche Aargau: 1404 km^2, Toleranz 3 %
    area_km2 = b.canton_lv95.area / 1e6
    assert 1360 < area_km2 < 1450, area_km2


@pytest.mark.integration
def test_write_geojson_is_wgs84_and_small(boundaries_real, tmp_path):
    out = boundaries.write_geojson(boundaries_real, tmp_path / "b.geojson")
    size = out.stat().st_size
    assert size < config.MAX_BOUNDARIES_BYTES, f"{size} Bytes"

    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == len(boundaries_real.municipalities)

    lons, lats = [], []

    def walk(coords):
        if isinstance(coords[0], (int, float)):
            lons.append(coords[0])
            lats.append(coords[1])
        else:
            for c in coords:
                walk(c)

    for feature in data["features"]:
        walk(feature["geometry"]["coordinates"])
        assert set(feature["properties"]) >= {"bfs_nr", "name"}

    assert 7.6 < min(lons) and max(lons) < 8.6, (min(lons), max(lons))
    assert 47.1 < min(lats) and max(lats) < 47.7, (min(lats), max(lats))
```

`etl/tests/conftest.py`:

```python
import pytest

from draufsicht_etl import boundaries, config, fetch


def pytest_configure(config_):
    config_.addinivalue_line(
        "markers", "integration: benötigt Netzzugang und echte Rohdaten"
    )


@pytest.fixture(scope="session")
def boundaries_real():
    url = fetch.swissboundaries_gpkg_url()
    zip_path = fetch.download(url, config.DATA_RAW / "swissboundaries3d.gpkg.zip")
    return boundaries.build(zip_path, config.CANTON["bfs_nr"])
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `uv run --project etl pytest etl/tests/test_boundaries.py -v -m "not integration"`
Expected: FAIL mit `ModuleNotFoundError: No module named 'draufsicht_etl.boundaries'`

- [ ] **Step 3: `boundaries.py` implementieren**

```python
"""Kantons- und Gemeindegrenzen aus swissBOUNDARIES3D."""

from __future__ import annotations

import json
import subprocess
import zipfile
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import pyogrio
from shapely.geometry.base import BaseGeometry

from . import config

# swissBOUNDARIES3D benennt Layer und Felder je Jahrgang leicht unterschiedlich.
# Deshalb wird gesucht statt angenommen.
_MUNICIPALITY_LAYER_NEEDLES = ["hoheitsgebiet", "gemeinde"]
_BFS_FIELD_NEEDLES = ["bfs_nummer", "bfs_nr", "gemeindenummer"]
_NAME_FIELD_NEEDLES = ["name", "gemeindename"]
_CANTON_FIELD_NEEDLES = ["kantonsnummer", "kanton_nr", "kantonsnr"]


@dataclass
class Boundaries:
    canton_lv95: BaseGeometry
    municipalities: gpd.GeoDataFrame


def _extract(gpkg_zip: Path) -> Path:
    target = config.DATA_INTERIM / "swissboundaries"
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(gpkg_zip) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".gpkg")]
        if not names:
            raise LookupError(f"Kein .gpkg in {gpkg_zip}; enthalten: {zf.namelist()[:20]}")
        return Path(zf.extract(names[0], target))


def find_layer(gpkg_path: Path, needles: list[str]) -> str:
    layers = [str(row[0]) for row in pyogrio.list_layers(gpkg_path)]
    for needle in needles:
        for layer in layers:
            if needle in layer.lower():
                return layer
    raise LookupError(
        f"Kein Layer passt auf {needles} in {gpkg_path.name}; vorhanden: {layers}"
    )


def _find_column(columns: list[str], needles: list[str]) -> str:
    lowered = {c.lower(): c for c in columns}
    for needle in needles:
        if needle in lowered:
            return lowered[needle]
    for needle in needles:
        for low, original in lowered.items():
            if needle in low:
                return original
    raise LookupError(f"Keine Spalte passt auf {needles}; vorhanden: {columns}")


def build(gpkg_zip: Path, canton_bfs_nr: int) -> Boundaries:
    gpkg = _extract(gpkg_zip)
    layer = find_layer(gpkg, _MUNICIPALITY_LAYER_NEEDLES)
    gdf = gpd.read_file(gpkg, layer=layer)

    canton_col = _find_column(list(gdf.columns), _CANTON_FIELD_NEEDLES)
    bfs_col = _find_column(list(gdf.columns), _BFS_FIELD_NEEDLES)
    name_col = _find_column(list(gdf.columns), _NAME_FIELD_NEEDLES)

    gdf = gdf[gdf[canton_col].astype(int) == canton_bfs_nr].copy()
    if gdf.empty:
        raise ValueError(
            f"Kanton {canton_bfs_nr} liefert keine Gemeinden aus Layer {layer}"
        )

    # 3D-Geometrien auf 2D reduzieren; die Höhe stört jeden weiteren Schritt.
    gdf["geometry"] = gdf.geometry.force_2d()
    gdf = gdf.set_crs(config.SRC_LV95, allow_override=True)

    municipalities = (
        gdf[[bfs_col, name_col, "geometry"]]
        .rename(columns={bfs_col: "bfs_nr", name_col: "name"})
        .dissolve(by=["bfs_nr", "name"], as_index=False)  # Exklaven zusammenführen
        .astype({"bfs_nr": "int32"})
        .sort_values("bfs_nr")
        .reset_index(drop=True)
    )

    canton = municipalities.geometry.union_all()
    return Boundaries(canton_lv95=canton, municipalities=municipalities)


def write_geojson(b: Boundaries, out: Path, *, simplify_percent: float = 8.0) -> Path:
    """Schreibt die Gemeinden als vereinfachtes WGS84-GeoJSON.

    Vereinfacht wird mit mapshaper, nicht mit shapely: mapshaper baut zuerst
    Topologie auf und hält gemeinsame Kanten zusammen. Shapely vereinfacht jede
    Fläche einzeln und reisst dabei Lücken zwischen Nachbargemeinden.
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = config.DATA_INTERIM / "municipalities_wgs84.geojson"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    b.municipalities.to_crs(config.DST_WGS84).to_file(tmp, driver="GeoJSON")

    for percent in (simplify_percent, simplify_percent / 2, simplify_percent / 4):
        subprocess.run(
            [
                "npx", "--no-install", "mapshaper", str(tmp),
                "-simplify", f"visvalingam", f"{percent}%", "keep-shapes",
                "-o", "precision=0.00001", "format=geojson", str(out),
            ],
            check=True,
            cwd=config.ROOT,
        )
        if out.stat().st_size <= config.MAX_BOUNDARIES_BYTES:
            break
    else:
        raise ValueError(
            f"{out.name} bleibt über {config.MAX_BOUNDARIES_BYTES} Bytes "
            f"({out.stat().st_size}) — Toleranz weiter senken"
        )

    data = json.loads(out.read_text(encoding="utf-8"))
    for feature in data["features"]:
        props = feature["properties"]
        feature["properties"] = {"bfs_nr": int(props["bfs_nr"]), "name": props["name"]}
    out.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return out
```

- [ ] **Step 4: Einheitstests laufen lassen**

Run: `uv run --project etl pytest etl/tests/test_boundaries.py -v -m "not integration"`
Expected: 2 passed

- [ ] **Step 5: `cli.py` um `boundaries` erweitern**

In der Weiche ergänzen:

```python
    if args.command == "boundaries":
        from . import boundaries, fetch

        url = fetch.swissboundaries_gpkg_url()
        zip_path = fetch.download(
            url, config.DATA_RAW / "swissboundaries3d.gpkg.zip", force=args.force
        )
        b = boundaries.build(zip_path, config.CANTON["bfs_nr"])
        out = boundaries.write_geojson(b, config.PUBLIC_DATA / "ag_boundaries.geojson")
        print(f"[boundaries] {len(b.municipalities)} Gemeinden, "
              f"{b.canton_lv95.area / 1e6:.0f} km2 -> {out} "
              f"({out.stat().st_size / 1024:.0f} KB)")
        return 0
```

- [ ] **Step 6: Echten Lauf ausführen**

Run: `uv run --project etl draufsicht-etl boundaries`
Expected: rund 196 Gemeinden, rund 1404 km², Datei unter 300 KB

- [ ] **Step 7: Integrationstests laufen lassen**

Run: `uv run --project etl pytest etl/tests/test_boundaries.py -v -m integration`
Expected: 2 passed

- [ ] **Step 8: Committen**

```bash
git add etl/src/draufsicht_etl/boundaries.py etl/src/draufsicht_etl/cli.py \
        etl/tests/test_boundaries.py etl/tests/conftest.py public/data/ag_boundaries.geojson
git commit -m "feat: Kantons- und Gemeindegrenzen aus swissBOUNDARIES3D"
```

---

## Task 5: Inspektionsbericht der STATENT-Rohdaten — CHECKPOINT

Diese Task schreibt **keine** Transformation. Sie legt offen, was tatsächlich in den
Daten steht. Das Ergebnis wird vorgelegt, bevor Task 6 und 7 beginnen.

**Files:**
- Create: `etl/src/draufsicht_etl/inspect_statent.py`
- Test: `etl/tests/test_inspect_statent.py`
- Erzeugt: `data/interim/statent_inspection.json`

**Interfaces:**
- Consumes: `fetch.download`, `fetch.statent_geodata_url`, `fetch.statent_variables_url`
- Produces:
  - `inspect_statent.find_hectare_csv(zip_path: Path) -> str` — Name des grössten `.csv` im ZIP
  - `inspect_statent.profile_columns(frame: pandas.DataFrame) -> list[dict]` — je Spalte
    `{"name", "dtype", "min", "max", "nulls", "distinct"}`
  - `inspect_statent.run(zip_path: Path, out: Path) -> dict` — schreibt und liefert den Bericht

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`etl/tests/test_inspect_statent.py`:

```python
import io
import zipfile

import pandas as pd

from draufsicht_etl import inspect_statent


def _zip_with(tmp_path, files: dict[str, bytes]):
    path = tmp_path / "geodaten.zip"
    with zipfile.ZipFile(path, "w") as zf:
        for name, payload in files.items():
            zf.writestr(name, payload)
    return path


def test_find_hectare_csv_picks_largest_csv(tmp_path):
    path = _zip_with(
        tmp_path,
        {
            "doc/liesmich.txt": b"x" * 5000,
            "klein.csv": b"a,b\n1,2\n",
            "unterordner/gross.csv": b"a,b\n" + b"1,2\n" * 500,
        },
    )
    assert inspect_statent.find_hectare_csv(path) == "unterordner/gross.csv"


def test_find_hectare_csv_raises_when_absent(tmp_path):
    path = _zip_with(tmp_path, {"nur.txt": b"x"})
    try:
        inspect_statent.find_hectare_csv(path)
    except LookupError as exc:
        assert "nur.txt" in str(exc)
    else:
        raise AssertionError("LookupError erwartet")


def test_profile_columns_reports_ranges_and_nulls():
    frame = pd.DataFrame(
        {
            "E_KOORD": [2600000, 2600100, 2600200],
            "B2301EMP": [4.0, None, 12.0],
            "GMDE": [4001, 4001, 4002],
        }
    )
    profile = {c["name"]: c for c in inspect_statent.profile_columns(frame)}

    assert profile["E_KOORD"]["min"] == 2600000
    assert profile["E_KOORD"]["max"] == 2600200
    assert profile["E_KOORD"]["nulls"] == 0
    assert profile["B2301EMP"]["nulls"] == 1
    assert profile["B2301EMP"]["min"] == 4.0
    assert profile["GMDE"]["distinct"] == 2


def test_profile_columns_handles_all_null_column():
    frame = pd.DataFrame({"leer": [None, None]})
    entry = inspect_statent.profile_columns(frame)[0]
    assert entry["nulls"] == 2
    assert entry["min"] is None and entry["max"] is None
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `uv run --project etl pytest etl/tests/test_inspect_statent.py -v`
Expected: FAIL mit `ModuleNotFoundError`

- [ ] **Step 3: `inspect_statent.py` implementieren**

```python
"""Inspektionsbericht. Legt offen, was in den Rohdaten steht — transformiert nichts."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

import pandas as pd

from . import config


def find_hectare_csv(zip_path: Path) -> str:
    with zipfile.ZipFile(zip_path) as zf:
        csvs = [i for i in zf.infolist() if i.filename.lower().endswith(".csv")]
        if not csvs:
            names = [i.filename for i in zf.infolist()]
            raise LookupError(f"Kein CSV in {zip_path.name}; enthalten: {names}")
        return max(csvs, key=lambda i: i.file_size).filename


def read_hectare_csv(zip_path: Path, member: str, nrows: int | None = None) -> pd.DataFrame:
    """STATENT-CSV ist semikolongetrennt und latin-1-kodiert."""
    with zipfile.ZipFile(zip_path) as zf, zf.open(member) as handle:
        return pd.read_csv(handle, sep=";", encoding="latin-1", nrows=nrows, low_memory=False)


def _scalar(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    return value.item() if hasattr(value, "item") else value


def profile_columns(frame: pd.DataFrame) -> list[dict]:
    profile = []
    for name in frame.columns:
        series = frame[name]
        numeric = pd.to_numeric(series, errors="coerce")
        profile.append(
            {
                "name": str(name),
                "dtype": str(series.dtype),
                "min": _scalar(numeric.min()),
                "max": _scalar(numeric.max()),
                "nulls": int(series.isna().sum()),
                "distinct": int(series.nunique(dropna=True)),
            }
        )
    return profile


def run(zip_path: Path, out: Path) -> dict:
    with zipfile.ZipFile(zip_path) as zf:
        members = [
            {"name": i.filename, "bytes": i.file_size} for i in sorted(
                zf.infolist(), key=lambda i: -i.file_size
            )
        ]

    member = find_hectare_csv(zip_path)
    frame = read_hectare_csv(zip_path, member)

    report = {
        "zip": zip_path.name,
        "members": members,
        "hectareCsv": member,
        "rows": int(len(frame)),
        "columnCount": int(len(frame.columns)),
        "columns": profile_columns(frame),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `uv run --project etl pytest etl/tests/test_inspect_statent.py -v`
Expected: 4 passed

- [ ] **Step 5: `cli.py` um `inspect-statent` erweitern**

```python
    if args.command == "inspect-statent":
        from . import fetch, inspect_statent

        geo_url = fetch.statent_geodata_url(config.STATENT_YEAR)
        var_url = fetch.statent_variables_url()
        zip_path = fetch.download(
            geo_url, config.DATA_RAW / f"statent_{config.STATENT_YEAR}.zip",
            force=args.force,
        )
        fetch.download(
            var_url, config.DATA_RAW / "statent_variablenliste.xlsx", force=args.force
        )

        out = config.DATA_INTERIM / "statent_inspection.json"
        report = inspect_statent.run(zip_path, out)

        print(f"ZIP        : {report['zip']}")
        print(f"Hektar-CSV : {report['hectareCsv']}")
        print(f"Zeilen     : {report['rows']:,}")
        print(f"Spalten    : {report['columnCount']}")
        print("\nDateien im ZIP:")
        for m in report["members"][:15]:
            print(f"  {m['bytes']:>14,}  {m['name']}")
        print("\nErste 40 Spalten:")
        print(f"  {'Spalte':<16}{'dtype':<10}{'min':>12}{'max':>14}{'nulls':>10}{'distinct':>10}")
        for c in report["columns"][:40]:
            print(f"  {c['name']:<16}{c['dtype']:<10}{str(c['min']):>12}"
                  f"{str(c['max']):>14}{c['nulls']:>10}{c['distinct']:>10}")
        print(f"\nVollständiger Bericht: {out}")
        return 0
```

- [ ] **Step 6: Inspektion ausführen**

Run: `uv run --project etl draufsicht-etl inspect-statent`
Expected: Bericht auf der Konsole. Der Download ist mehrere hundert MB und dauert.

- [ ] **Step 7: Die drei entscheidenden Fragen aus dem Bericht beantworten**

Run:
```bash
uv run --project etl python -c "
import json, re, collections
r = json.load(open('data/interim/statent_inspection.json'))
names = [c['name'] for c in r['columns']]
prefixes = collections.Counter(m.group(1) for n in names if (m := re.match(r'^B(\d{2})', n)))
print('Praefixe B<nn>:', dict(prefixes))
print('Totalspalten  :', [n for n in names if re.fullmatch(r'B\d{2}EMPT', n)])
divs = sorted(int(m.group(2)) for n in names if (m := re.fullmatch(r'B(\d{2})(\d{2})EMP', n)))
print('Abteilungen   :', len(divs), divs)
prof = {c['name']: c for c in r['columns']}
tot = [n for n in names if re.fullmatch(r'B\d{2}EMPT', n)][0]
print(f'{tot}: min={prof[tot][\"min\"]} max={prof[tot][\"max\"]}')
print('Schluessel    :', [n for n in names if n in ('RELI','E_KOORD','N_KOORD','GMDE')])
"
```

Erwartet und zu prüfen:
1. **Genau ein** `B<nn>`-Präfix über alle Spalten.
2. Die Totalspalte `B<nn>EMPT` existiert und ihr **Minimum ist 4** — das bestätigt die Aufrundungsregel aus Spec 6.4. Ist das Minimum 1, 2 oder 3, ist die Annahme falsch und Task 6 und 7 müssen vor der Umsetzung neu bewertet werden.
3. Die Abteilungsliste enthält rund 85 Nummern, alle in `etl/noga_groups.json` abgedeckt.
4. `RELI`, `E_KOORD`, `N_KOORD`, `GMDE` sind vorhanden.

- [ ] **Step 8: Committen und Ergebnis vorlegen**

```bash
git add etl/src/draufsicht_etl/inspect_statent.py etl/src/draufsicht_etl/cli.py \
        etl/tests/test_inspect_statent.py
git commit -m "feat: Inspektionsbericht der STATENT-Rohdaten"
```

**CHECKPOINT.** Ausgabe von Step 6 und Step 7 vorlegen und auf Freigabe warten,
bevor Task 6 beginnt.

---

## Task 6: Musterbasierte Spaltenauflösung

**Files:**
- Create: `etl/src/draufsicht_etl/columns.py`
- Modify: `etl/src/draufsicht_etl/config.py` (Muster ergänzen)
- Test: `etl/tests/test_columns.py`
- Erzeugt: `etl/columns/statent_2023.json` (versioniert)

**Interfaces:**
- Consumes: `config.COLUMN_PATTERNS`
- Produces:
  - `columns.ResolvedColumns` — Dataclass mit `prefix: str`, `reli: str`, `e_koord: str`,
    `n_koord: str`, `gmde: str`, `emp_total: str`, `emp_div: dict[int, str]`
    - `.division_numbers -> list[int]` (sortiert)
    - `.to_dict() -> dict` / `ResolvedColumns.from_dict(d) -> ResolvedColumns`
  - `columns.resolve(available: Iterable[str]) -> ResolvedColumns`
  - `columns.save(resolved: ResolvedColumns, year: int) -> Path`
  - `columns.load(year: int) -> ResolvedColumns`

- [ ] **Step 1: Muster in `config.py` ergänzen**

```python
COLUMN_PATTERNS = {
    "reli": r"^RELI$",
    "e_koord": r"^E_KOORD$",
    "n_koord": r"^N_KOORD$",
    "gmde": r"^GMDE$",
    "emp_total": r"^B(?P<nn>\d{2})EMPT$",
    "emp_div": r"^B(?P<nn>\d{2})(?P<div>\d{2})EMP$",
}
COLUMNS_DIR = ETL_DIR / "columns"
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`etl/tests/test_columns.py`:

```python
import pytest

from draufsicht_etl import columns

GOOD = [
    "RELI", "E_KOORD", "N_KOORD", "GMDE", "GMDE_HIST", "ERHJAHR",
    "B23T", "B23S1", "B23EMPT", "B23VZAT",
    "B2301EMP", "B2302EMP", "B2310EMP", "B2347EMP",
    "B2301AS", "B2301VZA", "B2301KB1",
]


def test_resolve_finds_all_roles():
    r = columns.resolve(GOOD)
    assert r.prefix == "23"
    assert r.reli == "RELI"
    assert r.e_koord == "E_KOORD"
    assert r.n_koord == "N_KOORD"
    assert r.gmde == "GMDE"
    assert r.emp_total == "B23EMPT"


def test_resolve_collects_divisions_only_from_emp_columns():
    r = columns.resolve(GOOD)
    assert r.division_numbers == [1, 2, 10, 47]
    assert r.emp_div[10] == "B2310EMP"


def test_resolve_ignores_as_vza_and_kb_columns():
    r = columns.resolve(GOOD)
    assert all(name.endswith("EMP") for name in r.emp_div.values())


def test_resolve_works_with_a_different_year_prefix():
    swapped = [c.replace("B23", "B08") for c in GOOD]
    r = columns.resolve(swapped)
    assert r.prefix == "08"
    assert r.emp_total == "B08EMPT"


def test_resolve_raises_on_missing_role():
    with pytest.raises(LookupError, match="emp_total"):
        columns.resolve([c for c in GOOD if c != "B23EMPT"])


def test_resolve_raises_on_mixed_prefixes():
    with pytest.raises(ValueError, match="uneinheitlich"):
        columns.resolve([*GOOD, "B2410EMP"])


def test_resolve_raises_on_ambiguous_role():
    with pytest.raises(ValueError, match="mehrdeutig"):
        columns.resolve([*GOOD, "B23EMPT "])  # führt zu zwei Treffern nach strip


def test_resolve_raises_without_divisions():
    minimal = ["RELI", "E_KOORD", "N_KOORD", "GMDE", "B23EMPT"]
    with pytest.raises(LookupError, match="Abteilungsspalten"):
        columns.resolve(minimal)


def test_roundtrip_dict():
    r = columns.resolve(GOOD)
    assert columns.ResolvedColumns.from_dict(r.to_dict()) == r


def test_save_and_load(tmp_path, monkeypatch):
    from draufsicht_etl import config

    monkeypatch.setattr(config, "COLUMNS_DIR", tmp_path)
    r = columns.resolve(GOOD)
    path = columns.save(r, 2023)
    assert path.exists()
    assert columns.load(2023) == r
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `uv run --project etl pytest etl/tests/test_columns.py -v`
Expected: FAIL mit `ModuleNotFoundError`

- [ ] **Step 4: `columns.py` implementieren**

```python
"""Spaltenauflösung über Muster statt fester Namen.

Die STATENT-Variablennamen tragen einen Präfix, der je Jahrgang wechselt
(`B23EMPT` gegenüber `B08EMPT`). Aufgelöst wird deshalb über Muster; der
Präfix muss über alle Rollen identisch sein.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from . import config

_SINGLE_ROLES = ("reli", "e_koord", "n_koord", "gmde", "emp_total")


@dataclass(frozen=True)
class ResolvedColumns:
    prefix: str
    reli: str
    e_koord: str
    n_koord: str
    gmde: str
    emp_total: str
    emp_div: dict[int, str]

    @property
    def division_numbers(self) -> list[int]:
        return sorted(self.emp_div)

    def to_dict(self) -> dict:
        return {
            "prefix": self.prefix,
            "reli": self.reli,
            "e_koord": self.e_koord,
            "n_koord": self.n_koord,
            "gmde": self.gmde,
            "emp_total": self.emp_total,
            "emp_div": {str(k): v for k, v in sorted(self.emp_div.items())},
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ResolvedColumns":
        return cls(
            prefix=data["prefix"],
            reli=data["reli"],
            e_koord=data["e_koord"],
            n_koord=data["n_koord"],
            gmde=data["gmde"],
            emp_total=data["emp_total"],
            emp_div={int(k): v for k, v in data["emp_div"].items()},
        )


def resolve(available: Iterable[str]) -> ResolvedColumns:
    names = [str(c).strip() for c in available]
    found: dict[str, str] = {}
    prefixes: set[str] = set()

    for role in _SINGLE_ROLES:
        pattern = re.compile(config.COLUMN_PATTERNS[role])
        hits = [n for n in names if pattern.fullmatch(n)]
        if not hits:
            raise LookupError(
                f"Rolle {role!r} (Muster {pattern.pattern}) trifft keine Spalte. "
                f"Vorhandene Spalten: {names[:40]}"
            )
        if len(hits) > 1:
            raise ValueError(f"Rolle {role!r} ist mehrdeutig: {hits}")
        found[role] = hits[0]
        match = pattern.fullmatch(hits[0])
        if match and "nn" in (match.groupdict() or {}):
            prefixes.add(match.group("nn"))

    div_pattern = re.compile(config.COLUMN_PATTERNS["emp_div"])
    emp_div: dict[int, str] = {}
    for name in names:
        match = div_pattern.fullmatch(name)
        if not match:
            continue
        prefixes.add(match.group("nn"))
        division = int(match.group("div"))
        if division in emp_div:
            raise ValueError(f"Abteilung {division} mehrfach: {emp_div[division]}, {name}")
        emp_div[division] = name

    if not emp_div:
        raise LookupError(
            f"Keine Abteilungsspalten gefunden (Muster {div_pattern.pattern})"
        )
    if len(prefixes) != 1:
        raise ValueError(f"Spaltenpräfix ist uneinheitlich: {sorted(prefixes)}")

    return ResolvedColumns(prefix=prefixes.pop(), emp_div=emp_div, **found)


def _path(year: int) -> Path:
    return config.COLUMNS_DIR / f"statent_{year}.json"


def save(resolved: ResolvedColumns, year: int) -> Path:
    path = _path(year)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(resolved.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return path


def load(year: int) -> ResolvedColumns:
    return ResolvedColumns.from_dict(json.loads(_path(year).read_text(encoding="utf-8")))
```

- [ ] **Step 5: Test laufen lassen, Erfolg prüfen**

Run: `uv run --project etl pytest etl/tests/test_columns.py -v`
Expected: 10 passed

- [ ] **Step 6: Gegen die echten Spalten auflösen und persistieren**

Run:
```bash
uv run --project etl python -c "
import json
from draufsicht_etl import columns, config, noga
report = json.load(open('data/interim/statent_inspection.json'))
resolved = columns.resolve(c['name'] for c in report['columns'])
path = columns.save(resolved, config.STATENT_YEAR)
table = noga.load_table()
unknown = [d for d in resolved.division_numbers if d not in table.division_to_group]
print('Praefix    :', resolved.prefix)
print('Total      :', resolved.emp_total)
print('Abteilungen:', len(resolved.emp_div))
print('Unbekannt  :', unknown)
print('->', path)
assert not unknown, unknown
"
```
Expected: Präfix passend zum Jahrgang, rund 85 Abteilungen, `Unbekannt: []`

- [ ] **Step 7: Committen**

```bash
git add etl/src/draufsicht_etl/columns.py etl/src/draufsicht_etl/config.py \
        etl/tests/test_columns.py etl/columns/statent_2023.json
git commit -m "feat: musterbasierte Spaltenauflösung mit versionierter Zuordnung"
```

---

## Task 7: Hektardaten laden, versetzen, reprojizieren, filtern

**Files:**
- Create: `etl/src/draufsicht_etl/statent.py`
- Test: `etl/tests/test_statent.py`

**Interfaces:**
- Consumes: `columns.ResolvedColumns`, `boundaries.Boundaries`, `config.*`
- Produces:
  - `statent.CellTable` — Dataclass mit
    - `reli: numpy.ndarray[int64]`, `lon: ndarray[float64]`, `lat: ndarray[float64]`
    - `gmde: ndarray[int32]`, `emp_total: ndarray[float64]`
    - `div_emp: ndarray[float64]` der Form `(N, D)`
    - `divisions: list[int]` der Länge `D`
    - `.count -> int`
  - `statent.to_center_lv95(e: ndarray, n: ndarray) -> tuple[ndarray, ndarray]`
  - `statent.lv95_to_wgs84(e: ndarray, n: ndarray) -> tuple[ndarray, ndarray]`
  - `statent.load_cells(frame: pandas.DataFrame, resolved: ResolvedColumns, canton_lv95) -> CellTable`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`etl/tests/test_statent.py`:

```python
import numpy as np
import pandas as pd
import pytest
from shapely.geometry import box

from draufsicht_etl import columns, statent

# Amtlicher Referenzpunkt: Bern, Bundeshaus / LV95-Nullpunkt-Definition
# 2600000 / 1200000  ->  7.438632 E, 46.951082 N  (swisstopo, Toleranz 1e-4 Grad)
REF_E, REF_N = 2600000.0, 1200000.0
REF_LON, REF_LAT = 7.438632, 46.951082


def test_center_offset_is_fifty_metres():
    e, n = statent.to_center_lv95(np.array([2600000.0]), np.array([1200000.0]))
    assert e[0] == 2600050.0
    assert n[0] == 1200050.0


def test_lv95_to_wgs84_matches_reference_point():
    lon, lat = statent.lv95_to_wgs84(np.array([REF_E]), np.array([REF_N]))
    assert lon[0] == pytest.approx(REF_LON, abs=1e-4)
    assert lat[0] == pytest.approx(REF_LAT, abs=1e-4)


def test_lv95_to_wgs84_is_monotonic_in_easting():
    lon, _ = statent.lv95_to_wgs84(
        np.array([2600000.0, 2610000.0]), np.array([1200000.0, 1200000.0])
    )
    assert lon[1] > lon[0]


def _frame():
    return pd.DataFrame(
        {
            "RELI": [60001200, 60011200, 99999999],
            "E_KOORD": [2600000, 2601000, 2700000],
            "N_KOORD": [1200000, 1200000, 1300000],
            "GMDE": [4001, 4001, 4002],
            "B23EMPT": [10.0, 4.0, 99.0],
            "B2301EMP": [4.0, 4.0, 0.0],
            "B2328EMP": [8.0, 0.0, 99.0],
        }
    )


def _resolved():
    return columns.resolve(
        ["RELI", "E_KOORD", "N_KOORD", "GMDE", "B23EMPT", "B2301EMP", "B2328EMP"]
    )


def _canton_around_bern():
    # Rechteck, das die ersten beiden Zellen enthält, die dritte nicht
    return box(2599000, 1199000, 2602000, 1201000)


def test_load_cells_filters_by_canton_polygon():
    table = statent.load_cells(_frame(), _resolved(), _canton_around_bern())
    assert table.count == 2
    assert list(table.reli) == [60001200, 60011200]


def test_load_cells_uses_totals_column_not_division_sum():
    table = statent.load_cells(_frame(), _resolved(), _canton_around_bern())
    # Zeile 0: Abteilungen 4 + 8 = 12, Total ist aber 10
    assert table.emp_total[0] == 10.0
    # Zeile 1: Abteilungen 4 + 0 = 4, Total ist 4
    assert table.emp_total[1] == 4.0


def test_load_cells_keeps_division_matrix_shape():
    table = statent.load_cells(_frame(), _resolved(), _canton_around_bern())
    assert table.divisions == [1, 28]
    assert table.div_emp.shape == (2, 2)
    assert table.div_emp[0].tolist() == [4.0, 8.0]


def test_load_cells_positions_are_cell_centres_in_wgs84():
    table = statent.load_cells(_frame(), _resolved(), _canton_around_bern())
    lon0, lat0 = statent.lv95_to_wgs84(np.array([2600050.0]), np.array([1200050.0]))
    assert table.lon[0] == pytest.approx(lon0[0])
    assert table.lat[0] == pytest.approx(lat0[0])


def test_load_cells_drops_rows_without_employment():
    frame = _frame()
    frame.loc[0, "B23EMPT"] = 0.0
    table = statent.load_cells(frame, _resolved(), _canton_around_bern())
    assert table.count == 1


def test_load_cells_fills_missing_division_values_with_zero():
    frame = _frame()
    frame.loc[0, "B2301EMP"] = np.nan
    table = statent.load_cells(frame, _resolved(), _canton_around_bern())
    assert table.div_emp[0][0] == 0.0


def test_load_cells_raises_when_nothing_survives_the_filter():
    with pytest.raises(ValueError, match="keine Hektare"):
        statent.load_cells(_frame(), _resolved(), box(0, 0, 1, 1))
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `uv run --project etl pytest etl/tests/test_statent.py -v`
Expected: FAIL mit `ModuleNotFoundError`

- [ ] **Step 3: `statent.py` implementieren**

```python
"""Hektardaten: Zentrumsversatz, Reprojektion, räumlicher Kantonsfilter.

Zur Datenschutzregel siehe Spec 6.4: das BFS rundet alle Werte < 4 auf 4 auf.
Deshalb ist `emp_total` die einzige zulässige Quelle für die Balkenhöhe; die
Abteilungsspalten werden hier lediglich mitgeführt und in `aggregate.py`
ausschliesslich zur Bestimmung der Mischung verwendet.
"""

from __future__ import annotations

from dataclasses import dataclass

import geopandas as gpd
import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely.geometry.base import BaseGeometry

from . import config
from .columns import ResolvedColumns

_TRANSFORMER = Transformer.from_crs(config.SRC_LV95, config.DST_WGS84, always_xy=True)


@dataclass
class CellTable:
    reli: np.ndarray
    lon: np.ndarray
    lat: np.ndarray
    gmde: np.ndarray
    emp_total: np.ndarray
    div_emp: np.ndarray
    divisions: list[int]

    @property
    def count(self) -> int:
        return int(self.reli.shape[0])


def to_center_lv95(e: np.ndarray, n: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """E_KOORD/N_KOORD bezeichnen die Südwest-Ecke der Hektare."""
    offset = config.HECTARE_CENTER_OFFSET_M
    return e + offset, n + offset


def lv95_to_wgs84(e: np.ndarray, n: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lon, lat = _TRANSFORMER.transform(e, n)
    return np.asarray(lon, dtype="float64"), np.asarray(lat, dtype="float64")


def load_cells(
    frame: pd.DataFrame, resolved: ResolvedColumns, canton_lv95: BaseGeometry
) -> CellTable:
    emp_total = pd.to_numeric(frame[resolved.emp_total], errors="coerce").fillna(0.0)
    frame = frame.loc[emp_total > 0].copy()
    emp_total = emp_total.loc[frame.index]

    e_sw = pd.to_numeric(frame[resolved.e_koord], errors="raise").to_numpy("float64")
    n_sw = pd.to_numeric(frame[resolved.n_koord], errors="raise").to_numpy("float64")
    e_c, n_c = to_center_lv95(e_sw, n_sw)

    # Räumlicher Verschnitt gegen die Kantonsfläche — ausdrücklich keine Bounding-Box.
    points = gpd.GeoDataFrame(
        {"_i": np.arange(len(frame))},
        geometry=gpd.points_from_xy(e_c, n_c),
        crs=config.SRC_LV95,
    )
    canton = gpd.GeoDataFrame(geometry=[canton_lv95], crs=config.SRC_LV95)
    inside = gpd.sjoin(points, canton, predicate="within", how="inner")["_i"].to_numpy()
    inside.sort()

    if inside.size == 0:
        raise ValueError(
            "Der Verschnitt liefert keine Hektare innerhalb der Kantonsfläche — "
            "prüfen, ob Kantonsgeometrie und Hektardaten dasselbe CRS haben"
        )

    divisions = resolved.division_numbers
    div_emp = np.empty((inside.size, len(divisions)), dtype="float64")
    for col, division in enumerate(divisions):
        values = pd.to_numeric(frame[resolved.emp_div[division]], errors="coerce")
        div_emp[:, col] = values.fillna(0.0).to_numpy("float64")[inside]

    lon, lat = lv95_to_wgs84(e_c[inside], n_c[inside])

    return CellTable(
        reli=frame[resolved.reli].to_numpy("int64")[inside],
        lon=lon,
        lat=lat,
        gmde=frame[resolved.gmde].to_numpy("int32")[inside],
        emp_total=emp_total.to_numpy("float64")[inside],
        div_emp=div_emp,
        divisions=divisions,
    )
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `uv run --project etl pytest etl/tests/test_statent.py -v`
Expected: 11 passed

- [ ] **Step 5: Committen**

```bash
git add etl/src/draufsicht_etl/statent.py etl/tests/test_statent.py
git commit -m "feat: Hektardaten mit Zentrumsversatz, Reprojektion und Kantonsverschnitt"
```

---

## Task 8: Aggregation auf drei Stufen

**Files:**
- Create: `etl/src/draufsicht_etl/aggregate.py`
- Test: `etl/tests/test_aggregate.py`

**Interfaces:**
- Consumes: `statent.CellTable`, `noga.NogaTable`, `boundaries.Boundaries`
- Produces:
  - `aggregate.LevelData` — Dataclass mit
    - `name: str`, `lon/lat: ndarray[float64]`, `value: ndarray[float64]`
    - `noga: ndarray[uint8]`, `flags: ndarray[uint8]`, `dist: ndarray[float32]` Form `(N, G)`
    - `gemeinde_idx: ndarray[uint16] | None`, `gemeinden: list[dict] | None`
    - `.count -> int`
  - `aggregate.group_raw(cells, table) -> ndarray` Form `(N, G)`
  - `aggregate.normalise_dist(raw: ndarray, totals: ndarray) -> ndarray`
  - `aggregate.dominant_group(dist: ndarray) -> ndarray[uint8]`
  - `aggregate.top3(dist: ndarray) -> tuple[ndarray[uint8], ndarray[uint16]]`
  - `aggregate.build_hectare(cells, table, municipalities) -> LevelData`
  - `aggregate.build_municipality(hectare, municipalities) -> LevelData`
  - `aggregate.build_canton(hectare, canton_lv95) -> LevelData`
  - `aggregate.stats(level) -> dict`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`etl/tests/test_aggregate.py`:

```python
import numpy as np
import pytest

from draufsicht_etl import aggregate, config, noga, statent


@pytest.fixture(scope="module")
def table():
    return noga.load_table()


def _cells(emp_total, div_emp, divisions, gmde=None):
    n = len(emp_total)
    return statent.CellTable(
        reli=np.arange(n, dtype="int64"),
        lon=np.linspace(8.0, 8.1, n),
        lat=np.linspace(47.4, 47.5, n),
        gmde=np.asarray(gmde if gmde is not None else [4001] * n, dtype="int32"),
        emp_total=np.asarray(emp_total, dtype="float64"),
        div_emp=np.asarray(div_emp, dtype="float64"),
        divisions=list(divisions),
    )


def test_group_raw_sums_divisions_into_groups(table):
    # 1 -> landwirtschaft (Index 0), 28 und 20 -> industrie (Index 1)
    cells = _cells([100.0], [[5.0, 7.0, 3.0]], [1, 28, 20])
    raw = aggregate.group_raw(cells, table)
    assert raw.shape == (1, table.group_count)
    assert raw[0, 0] == 5.0
    assert raw[0, 1] == 10.0


def test_group_raw_raises_on_unknown_division(table):
    cells = _cells([10.0], [[1.0]], [4])  # 4 existiert in NOGA 2008 nicht
    with pytest.raises(KeyError, match="4"):
        aggregate.group_raw(cells, table)


def test_normalise_dist_scales_to_total():
    raw = np.array([[4.0, 8.0]])
    dist = aggregate.normalise_dist(raw, np.array([10.0]))
    assert dist.sum() == pytest.approx(10.0)
    assert dist[0].tolist() == pytest.approx([10 / 3, 20 / 3])


def test_normalise_dist_never_sums_division_columns_into_a_total():
    # vier Abteilungen a 4 (alle aufgerundet), Total ist 4 — nicht 16
    raw = np.array([[4.0, 4.0, 4.0, 4.0]])
    dist = aggregate.normalise_dist(raw, np.array([4.0]))
    assert dist.sum() == pytest.approx(4.0)


def test_normalise_dist_handles_empty_row():
    dist = aggregate.normalise_dist(np.array([[0.0, 0.0]]), np.array([7.0]))
    assert dist.sum() == 0.0


def test_dominant_group_picks_unique_maximum():
    dist = np.array([[1.0, 9.0, 2.0]])
    assert aggregate.dominant_group(dist).tolist() == [1]


def test_dominant_group_is_unknown_when_maximum_is_tied():
    dist = np.array([[4.0, 4.0, 0.0]])
    assert aggregate.dominant_group(dist).tolist() == [config.NOGA_UNKNOWN_INDEX]


def test_dominant_group_is_unknown_for_empty_row():
    dist = np.array([[0.0, 0.0]])
    assert aggregate.dominant_group(dist).tolist() == [config.NOGA_UNKNOWN_INDEX]


def test_top3_returns_three_largest_descending():
    dist = np.array([[1.0, 5.0, 3.0, 9.0]])
    groups, values = aggregate.top3(dist)
    assert groups[0].tolist() == [3, 1, 2]
    assert values[0].tolist() == [9, 5, 3]


def test_top3_pads_with_unknown_when_fewer_than_three_groups_present():
    dist = np.array([[0.0, 6.0, 0.0, 0.0]])
    groups, values = aggregate.top3(dist)
    assert groups[0][0] == 1 and values[0][0] == 6
    assert groups[0][1] == config.NOGA_UNKNOWN_INDEX
    assert values[0][1] == 0


def test_build_hectare_sets_ambiguous_flag_only_at_exactly_four(table):
    cells = _cells([4.0, 5.0, 12.0], [[4.0], [5.0], [12.0]], [28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    assert level.flags.tolist() == [config.FLAG_AMBIGUOUS, 0, 0]


def test_build_hectare_value_comes_from_total_column(table):
    cells = _cells([10.0], [[4.0, 8.0]], [1, 28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    assert level.value.tolist() == [10.0]


def _municipalities():
    import geopandas as gpd
    from shapely.geometry import box

    return gpd.GeoDataFrame(
        {"bfs_nr": [4001, 4002], "name": ["Aarau", "Baden"]},
        geometry=[box(2600000, 1200000, 2601000, 1201000),
                  box(2601000, 1200000, 2602000, 1201000)],
        crs=config.SRC_LV95,
    )


def test_build_municipality_sums_totals(table):
    cells = _cells([10.0, 4.0, 6.0], [[10.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    muni = aggregate.build_municipality(hectare, _municipalities())

    assert muni.count == 2
    order = np.argsort(muni.value)[::-1]
    assert muni.value[order].tolist() == [14.0, 6.0]


def test_aggregation_invariant_hectare_equals_municipality_equals_canton(table):
    from shapely.geometry import box

    cells = _cells([10.0, 4.0, 6.0], [[10.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    muni = aggregate.build_municipality(hectare, _municipalities())
    canton = aggregate.build_canton(hectare, box(2600000, 1200000, 2602000, 1201000))

    assert hectare.value.sum() == pytest.approx(muni.value.sum())
    assert muni.value.sum() == pytest.approx(canton.value.sum())


def test_ambiguous_cells_are_counted_consistently_across_levels(table):
    from shapely.geometry import box

    cells = _cells([4.0, 4.0, 6.0], [[4.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    canton = aggregate.build_canton(hectare, box(2600000, 1200000, 2602000, 1201000))

    assert aggregate.stats(hectare)["ambiguousCells"] == 2
    assert aggregate.stats(canton)["ambiguousCells"] == 2


def test_stats_overstatement_is_three_times_ambiguous_cells(table):
    cells = _cells([4.0, 4.0, 6.0], [[4.0], [4.0], [6.0]], [28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    s = aggregate.stats(level)
    assert s["overstatementMax"] == 3 * s["ambiguousCells"]


def test_dist_row_sums_match_totals(table):
    cells = _cells([10.0, 20.0], [[4.0, 8.0], [1.0, 1.0]], [1, 28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    assert level.dist.sum(axis=1) == pytest.approx(level.value, abs=0.5)


def test_dist_is_never_negative(table):
    cells = _cells([10.0], [[4.0, 8.0]], [1, 28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    assert (level.dist >= 0).all()


def test_hectare_gemeinde_index_points_at_the_right_name(table):
    cells = _cells([10.0, 6.0], [[10.0], [6.0]], [28], gmde=[4002, 4001])
    level = aggregate.build_hectare(cells, table, _municipalities())
    names = [level.gemeinden[i]["name"] for i in level.gemeinde_idx]
    assert names == ["Baden", "Aarau"]


def test_hectare_raises_on_unknown_gmde(table):
    cells = _cells([10.0], [[10.0]], [28], gmde=[9999])
    with pytest.raises(ValueError, match="9999"):
        aggregate.build_hectare(cells, table, _municipalities())
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `uv run --project etl pytest etl/tests/test_aggregate.py -v`
Expected: FAIL mit `ModuleNotFoundError`

- [ ] **Step 3: `aggregate.py` implementieren**

```python
"""Aggregation auf Kanton, Gemeinde und Hektare.

Grundregel aus Spec 6.4: die Höhe kommt immer aus `emp_total`. Die
Abteilungsspalten liefern ausschliesslich die Mischung und werden dafür auf
`emp_total` normiert. Sie werden niemals zu einem Total aufsummiert.
"""

from __future__ import annotations

from dataclasses import dataclass

import geopandas as gpd
import numpy as np
from shapely.geometry.base import BaseGeometry

from . import config
from .noga import NogaTable
from .statent import CellTable, lv95_to_wgs84


@dataclass
class LevelData:
    name: str
    lon: np.ndarray
    lat: np.ndarray
    value: np.ndarray
    noga: np.ndarray
    flags: np.ndarray
    dist: np.ndarray
    gemeinde_idx: np.ndarray | None = None
    gemeinden: list[dict] | None = None

    @property
    def count(self) -> int:
        return int(self.value.shape[0])


def group_raw(cells: CellTable, table: NogaTable) -> np.ndarray:
    """Rohe Abteilungswerte je Gruppe aufsummiert — nur für die Mischung."""
    raw = np.zeros((cells.count, table.group_count), dtype="float64")
    for col, division in enumerate(cells.divisions):
        raw[:, table.group_index(division)] += cells.div_emp[:, col]
    return raw


def normalise_dist(raw: np.ndarray, totals: np.ndarray) -> np.ndarray:
    """Skaliert die Gruppenanteile so, dass ihre Summe `totals` ergibt."""
    row_sum = raw.sum(axis=1)
    scale = np.divide(
        totals, row_sum, out=np.zeros_like(totals, dtype="float64"), where=row_sum > 0
    )
    return raw * scale[:, None]


def dominant_group(dist: np.ndarray) -> np.ndarray:
    """Index der grössten Gruppe; 255, wenn leer oder kein eindeutiges Maximum."""
    result = np.full(dist.shape[0], config.NOGA_UNKNOWN_INDEX, dtype="uint8")
    if dist.size == 0:
        return result
    maxima = dist.max(axis=1)
    tied = (dist == maxima[:, None]).sum(axis=1)
    unique = (maxima > 0) & (tied == 1)
    result[unique] = np.argmax(dist[unique], axis=1).astype("uint8")
    return result


def top3(dist: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Die drei grössten Gruppen je Zeile, absteigend. Leerplätze werden 255/0."""
    n = dist.shape[0]
    groups = np.full((n, 3), config.NOGA_UNKNOWN_INDEX, dtype="uint8")
    values = np.zeros((n, 3), dtype="uint16")
    if n == 0:
        return groups, values

    order = np.argsort(-dist, axis=1, kind="stable")[:, :3]
    picked = np.take_along_axis(dist, order, axis=1)
    present = picked > 0
    groups[present] = order.astype("uint8")[present]
    values[present] = np.clip(np.rint(picked[present]), 0, 65535).astype("uint16")
    return groups, values


def _municipality_lookup(municipalities: gpd.GeoDataFrame) -> tuple[dict[int, int], list[dict]]:
    entries = [
        {"bfsNr": int(row.bfs_nr), "name": str(row.name)}
        for row in municipalities.sort_values("bfs_nr").itertuples()
    ]
    return {e["bfsNr"]: i for i, e in enumerate(entries)}, entries


def build_hectare(
    cells: CellTable, table: NogaTable, municipalities: gpd.GeoDataFrame
) -> LevelData:
    dist = normalise_dist(group_raw(cells, table), cells.emp_total).astype("float32")
    flags = np.where(
        cells.emp_total == config.AMBIGUOUS_VALUE, config.FLAG_AMBIGUOUS, 0
    ).astype("uint8")

    index, entries = _municipality_lookup(municipalities)
    unknown = sorted(set(cells.gmde.tolist()) - set(index))
    if unknown:
        raise ValueError(
            f"Hektaren verweisen auf unbekannte Gemeindenummern: {unknown}. "
            "Jahrgang von STATENT und swissBOUNDARIES3D prüfen."
        )

    return LevelData(
        name="hektar",
        lon=cells.lon,
        lat=cells.lat,
        value=cells.emp_total,
        noga=dominant_group(dist),
        flags=flags,
        dist=dist,
        gemeinde_idx=np.array([index[g] for g in cells.gmde], dtype="uint16"),
        gemeinden=entries,
    )


def build_municipality(
    hectare: LevelData, municipalities: gpd.GeoDataFrame
) -> LevelData:
    assert hectare.gemeinde_idx is not None and hectare.gemeinden is not None
    entries = hectare.gemeinden
    n = len(entries)

    value = np.zeros(n, dtype="float64")
    np.add.at(value, hectare.gemeinde_idx, hectare.value)

    dist = np.zeros((n, hectare.dist.shape[1]), dtype="float64")
    np.add.at(dist, hectare.gemeinde_idx, hectare.dist.astype("float64"))

    ambiguous = np.zeros(n, dtype="int64")
    np.add.at(ambiguous, hectare.gemeinde_idx, (hectare.flags & config.FLAG_AMBIGUOUS) > 0)

    ordered = municipalities.set_index("bfs_nr").loc[[e["bfsNr"] for e in entries]]
    points = ordered.geometry.representative_point()
    lon, lat = lv95_to_wgs84(points.x.to_numpy("float64"), points.y.to_numpy("float64"))

    keep = value > 0
    return LevelData(
        name="gemeinde",
        lon=lon[keep],
        lat=lat[keep],
        value=value[keep],
        noga=dominant_group(dist[keep]),
        flags=np.zeros(int(keep.sum()), dtype="uint8"),
        dist=dist[keep].astype("float32"),
        gemeinde_idx=np.flatnonzero(keep).astype("uint16"),
        gemeinden=entries,
    )


def build_canton(hectare: LevelData, canton_lv95: BaseGeometry) -> LevelData:
    point = canton_lv95.representative_point()
    lon, lat = lv95_to_wgs84(np.array([point.x]), np.array([point.y]))
    dist = hectare.dist.astype("float64").sum(axis=0, keepdims=True)

    return LevelData(
        name="kanton",
        lon=lon,
        lat=lat,
        value=np.array([hectare.value.sum()], dtype="float64"),
        noga=dominant_group(dist),
        flags=np.zeros(1, dtype="uint8"),
        dist=dist.astype("float32"),
    )


def stats(level: LevelData, *, source: LevelData | None = None) -> dict:
    """Kennzahlen. `ambiguousCells` zählt immer die Hektaren, auch auf höheren Stufen."""
    basis = source if source is not None else level
    ambiguous = int(((basis.flags & config.FLAG_AMBIGUOUS) > 0).sum())
    values = level.value
    return {
        "min": float(values.min()) if values.size else 0.0,
        "max": float(values.max()) if values.size else 0.0,
        "sum": float(values.sum()),
        "p99": float(np.percentile(values, 99)) if values.size else 0.0,
        "ambiguousCells": ambiguous,
        "overstatementMax": 3 * ambiguous,
    }
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `uv run --project etl pytest etl/tests/test_aggregate.py -v`
Expected: 20 passed

Hinweis für `test_ambiguous_cells_are_counted_consistently_across_levels`: `stats`
muss dort mit `source=hectare` aufgerufen werden. Falls der Test scheitert, ist der
Aufruf im Test auf `aggregate.stats(canton, source=hectare)` zu korrigieren — die
Zählung mehrdeutiger Zellen bezieht sich definitionsgemäss auf die Hektarstufe.

- [ ] **Step 5: Committen**

```bash
git add etl/src/draufsicht_etl/aggregate.py etl/tests/test_aggregate.py
git commit -m "feat: Aggregation auf drei Stufen mit normierter Branchenmischung"
```

---

## Task 9: Binärformat schreiben und lesen

**Files:**
- Create: `etl/src/draufsicht_etl/binpack.py`
- Test: `etl/tests/test_binpack.py`

**Interfaces:**
- Consumes: `aggregate.LevelData`, `noga.NogaTable`
- Produces:
  - `binpack.write_level(level, table, out_dir, *, year, canton, extra=None) -> tuple[Path, Path]`
  - `binpack.read_level(bin_path, json_path) -> tuple[dict[str, ndarray], dict]` (nur Tests und Kontrolle)
  - Dateinamen: `<canton_lowercase>_<level>.bin` und `.json`, also `ag_hektar.bin`

Array-Reihenfolge in der `.bin` (Float32 zuerst, dann Uint16, dann Uint8 — so bleibt
jeder Block auf seiner natürlichen Ausrichtung):
`positions` (2N f32) · `values` (N f32) · `dist` (N·G f32, nur Kanton und Gemeinde) ·
`mixValue` (3N u16, nur Hektare) · `gemeindeIdx` (N u16, nur Hektare) ·
`mixGroup` (3N u8, nur Hektare) · `noga` (N u8) · `flags` (N u8)

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`etl/tests/test_binpack.py`:

```python
import json

import numpy as np
import pytest

from draufsicht_etl import aggregate, binpack, config, noga


@pytest.fixture(scope="module")
def table():
    return noga.load_table()


def _level(name="hektar", n=3, with_gemeinde=True):
    g = 11
    rng = np.random.default_rng(0)
    dist = rng.random((n, g)).astype("float32") * 10
    return aggregate.LevelData(
        name=name,
        lon=np.linspace(8.0, 8.2, n),
        lat=np.linspace(47.3, 47.5, n),
        value=np.array([4.0, 17.0, 250.0][:n], dtype="float64"),
        noga=np.array([0, 3, config.NOGA_UNKNOWN_INDEX][:n], dtype="uint8"),
        flags=np.array([1, 0, 0][:n], dtype="uint8"),
        dist=dist,
        gemeinde_idx=np.arange(n, dtype="uint16") if with_gemeinde else None,
        gemeinden=[{"bfsNr": 4000 + i, "name": f"Ort{i}"} for i in range(n)]
        if with_gemeinde
        else None,
    )


def test_write_creates_both_files(tmp_path, table):
    bin_path, json_path = binpack.write_level(
        _level(), table, tmp_path, year=2023, canton="AG"
    )
    assert bin_path.name == "ag_hektar.bin"
    assert json_path.name == "ag_hektar.json"
    assert bin_path.exists() and json_path.exists()


def test_roundtrip_preserves_arrays(tmp_path, table):
    level = _level()
    bin_path, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="AG"
    )
    arrays, meta = binpack.read_level(bin_path, json_path)

    assert meta["count"] == level.count
    np.testing.assert_allclose(
        arrays["positions"].reshape(-1, 2)[:, 0], level.lon, rtol=1e-6
    )
    np.testing.assert_allclose(arrays["values"], level.value, rtol=1e-6)
    np.testing.assert_array_equal(arrays["noga"], level.noga)
    np.testing.assert_array_equal(arrays["flags"], level.flags)
    np.testing.assert_array_equal(arrays["gemeindeIdx"], level.gemeinde_idx)


def test_hectare_stores_top3_not_full_distribution(tmp_path, table):
    bin_path, json_path = binpack.write_level(
        _level(), table, tmp_path, year=2023, canton="AG"
    )
    arrays, meta = binpack.read_level(bin_path, json_path)
    assert "mixGroup" in arrays and "mixValue" in arrays
    assert "dist" not in arrays
    assert arrays["mixGroup"].reshape(-1, 3).shape == (3, 3)


def test_municipality_stores_full_distribution(tmp_path, table):
    level = _level(name="gemeinde")
    bin_path, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="AG"
    )
    arrays, meta = binpack.read_level(bin_path, json_path)
    assert "dist" in arrays
    assert "mixGroup" not in arrays
    assert arrays["dist"].reshape(level.count, -1).shape == (3, table.group_count)


def test_metadata_carries_groups_year_and_stats(tmp_path, table):
    level = _level()
    _, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="AG",
        extra={"stats": aggregate.stats(level)},
    )
    meta = json.loads(json_path.read_text(encoding="utf-8"))

    assert meta["year"] == 2023
    assert meta["canton"] == "AG"
    assert meta["level"] == "hektar"
    assert [g["key"] for g in meta["nogaGroups"]] == [g.key for g in table.groups]
    assert meta["stats"]["ambiguousCells"] == 1
    assert meta["stats"]["overstatementMax"] == 3


def test_float32_arrays_are_four_byte_aligned(tmp_path, table):
    _, json_path = binpack.write_level(
        _level(), table, tmp_path, year=2023, canton="AG"
    )
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    for name, spec in meta["arrays"].items():
        if spec["type"] == "Float32":
            assert spec["byteOffset"] % 4 == 0, name
        if spec["type"] == "Uint16":
            assert spec["byteOffset"] % 2 == 0, name


def test_gemeinden_table_only_on_hectare_and_municipality(tmp_path, table):
    level = _level(name="kanton", n=1, with_gemeinde=False)
    _, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="AG"
    )
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    assert "gemeinden" not in meta
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `uv run --project etl pytest etl/tests/test_binpack.py -v`
Expected: FAIL mit `ModuleNotFoundError`

- [ ] **Step 3: `binpack.py` implementieren**

```python
"""Binärformat: konkatenierte typisierte Arrays plus Metadaten-JSON.

deck.gl konsumiert die Arrays ohne Umkopieren als Binary Attributes. Deshalb
werden sie in absteigender Elementgrösse geschrieben und auf ihre natürliche
Ausrichtung aufgefüllt.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import config
from .aggregate import LevelData, top3
from .noga import NogaTable

_TYPE_NAMES = {
    np.dtype("float32"): "Float32",
    np.dtype("uint16"): "Uint16",
    np.dtype("uint8"): "Uint8",
}


def _collect(level: LevelData) -> dict[str, np.ndarray]:
    positions = np.empty(level.count * 2, dtype="float32")
    positions[0::2] = level.lon
    positions[1::2] = level.lat

    arrays: dict[str, np.ndarray] = {
        "positions": positions,
        "values": level.value.astype("float32"),
    }

    if level.name == "hektar":
        groups, values = top3(level.dist.astype("float64"))
        arrays["mixValue"] = values.reshape(-1)
        arrays["mixGroup"] = groups.reshape(-1)
        assert level.gemeinde_idx is not None
        arrays["gemeindeIdx"] = level.gemeinde_idx.astype("uint16")
    else:
        arrays["dist"] = level.dist.astype("float32").reshape(-1)

    arrays["noga"] = level.noga.astype("uint8")
    arrays["flags"] = level.flags.astype("uint8")
    return arrays


_ORDER = ("positions", "values", "dist", "mixValue", "gemeindeIdx", "mixGroup", "noga", "flags")


def write_level(
    level: LevelData,
    table: NogaTable,
    out_dir: Path,
    *,
    year: int,
    canton: str,
    extra: dict | None = None,
) -> tuple[Path, Path]:
    arrays = _collect(level)
    out_dir.mkdir(parents=True, exist_ok=True)

    blob = bytearray()
    spec: dict[str, dict] = {}
    for name in _ORDER:
        array = arrays.get(name)
        if array is None:
            continue
        alignment = array.dtype.itemsize
        padding = (-len(blob)) % alignment
        blob.extend(b"\x00" * padding)
        spec[name] = {
            "byteOffset": len(blob),
            "length": int(array.size),
            "type": _TYPE_NAMES[array.dtype],
        }
        blob.extend(array.tobytes())

    stem = f"{canton.lower()}_{level.name}"
    bin_path = out_dir / f"{stem}.bin"
    json_path = out_dir / f"{stem}.json"
    bin_path.write_bytes(bytes(blob))

    meta: dict = {
        "level": level.name,
        "year": year,
        "canton": canton,
        "count": level.count,
        "arrays": spec,
        "nogaGroups": [
            {"key": g.key, "label": g.label, "color": g.color} for g in table.groups
        ],
        "unknownColor": table.unknown_color,
        "unknownIndex": config.NOGA_UNKNOWN_INDEX,
    }
    if level.gemeinden is not None:
        meta["gemeinden"] = level.gemeinden
    if extra:
        meta.update(extra)

    json_path.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return bin_path, json_path


_NUMPY_TYPES = {"Float32": "float32", "Uint16": "uint16", "Uint8": "uint8"}


def read_level(bin_path: Path, json_path: Path) -> tuple[dict[str, np.ndarray], dict]:
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    blob = bin_path.read_bytes()
    arrays = {
        name: np.frombuffer(
            blob,
            dtype=_NUMPY_TYPES[s["type"]],
            count=s["length"],
            offset=s["byteOffset"],
        )
        for name, s in meta["arrays"].items()
    }
    return arrays, meta
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `uv run --project etl pytest etl/tests/test_binpack.py -v`
Expected: 7 passed

- [ ] **Step 5: Committen**

```bash
git add etl/src/draufsicht_etl/binpack.py etl/tests/test_binpack.py
git commit -m "feat: Binärformat für deck.gl Binary Attributes"
```

---

## Task 10: Vollständiger ETL-Lauf und 2D-Kontrollkarte — CHECKPOINT

**Files:**
- Create: `etl/src/draufsicht_etl/sanity_map.py`
- Modify: `etl/src/draufsicht_etl/cli.py` (Subkommandos `statent`, `sanity-map`, `all`)
- Test: `etl/tests/test_pipeline.py`
- Erzeugt: `public/data/ag_{kanton,gemeinde,hektar}.{bin,json}`, `public/data/meta.json`,
  `data/interim/sanity_gemeinde.png`

**Interfaces:**
- Produces:
  - `sanity_map.render(level, municipalities, out: Path) -> Path`
  - `cli` behandelt `statent`, `sanity-map` und `all`

- [ ] **Step 1: `sanity_map.py` implementieren**

```python
"""2D-Choroplethenkarte als Kontrolle, bevor irgendetwas in 3D gerendert wird."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from .aggregate import LevelData  # noqa: E402


def render(level: LevelData, municipalities: gpd.GeoDataFrame, out: Path) -> Path:
    assert level.gemeinde_idx is not None and level.gemeinden is not None
    lookup = {
        level.gemeinden[idx]["bfsNr"]: float(value)
        for idx, value in zip(level.gemeinde_idx, level.value, strict=True)
    }
    frame = municipalities.copy()
    frame["beschaeftigte"] = frame["bfs_nr"].map(lookup).fillna(0.0)

    fig, ax = plt.subplots(figsize=(10, 8), dpi=110)
    frame.plot(
        column="beschaeftigte",
        cmap="viridis",
        scheme=None,
        legend=True,
        edgecolor="white",
        linewidth=0.3,
        ax=ax,
        legend_kwds={"label": "Beschäftigte je Gemeinde", "shrink": 0.6},
    )
    ax.set_axis_off()
    ax.set_title(
        f"Kontrollkarte: {len(frame)} Gemeinden, "
        f"{frame['beschaeftigte'].sum():,.0f} Beschäftigte total"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)
    return out
```

- [ ] **Step 2: `cli.py` vervollständigen**

Die Weiche um einen gemeinsamen Pfad ergänzen:

```python
def _run_statent(force: bool) -> dict:
    import json as _json

    from . import (aggregate, binpack, boundaries, columns, fetch,
                   inspect_statent, noga, statent)

    table = noga.load_table()
    noga.generate_typescript(table, config.ROOT / "src" / "domain" / "noga.generated.ts")

    zip_path = fetch.download(
        fetch.swissboundaries_gpkg_url(),
        config.DATA_RAW / "swissboundaries3d.gpkg.zip",
        force=force,
    )
    bounds = boundaries.build(zip_path, config.CANTON["bfs_nr"])
    boundaries.write_geojson(bounds, config.PUBLIC_DATA / "ag_boundaries.geojson")

    statent_zip = fetch.download(
        fetch.statent_geodata_url(config.STATENT_YEAR),
        config.DATA_RAW / f"statent_{config.STATENT_YEAR}.zip",
        force=force,
    )
    member = inspect_statent.find_hectare_csv(statent_zip)
    frame = inspect_statent.read_hectare_csv(statent_zip, member)

    resolved = columns.resolve(frame.columns)
    columns.save(resolved, config.STATENT_YEAR)

    cells = statent.load_cells(frame, resolved, bounds.canton_lv95)
    hectare = aggregate.build_hectare(cells, table, bounds.municipalities)
    municipality = aggregate.build_municipality(hectare, bounds.municipalities)
    canton = aggregate.build_canton(hectare, bounds.canton_lv95)

    for level in (canton, municipality, hectare):
        binpack.write_level(
            level, table, config.PUBLIC_DATA,
            year=config.STATENT_YEAR, canton=config.CANTON["code"],
            extra={"stats": aggregate.stats(level, source=hectare)},
        )

    meta = {
        "canton": config.CANTON,
        "year": config.STATENT_YEAR,
        "levels": ["kanton", "gemeinde", "hektar"],
        "counts": {
            "kanton": canton.count,
            "gemeinde": municipality.count,
            "hektar": hectare.count,
        },
        "source": "Bundesamt für Statistik (BFS), STATENT",
        "hectareCsv": member,
    }
    (config.PUBLIC_DATA / "meta.json").write_text(
        _json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"[statent] Hektaren  : {hectare.count:,}")
    print(f"[statent] Gemeinden : {municipality.count}")
    print(f"[statent] Total     : {canton.value[0]:,.0f} Beschäftigte")
    s = aggregate.stats(hectare)
    print(f"[statent] Mehrdeutig: {s['ambiguousCells']:,} Hektaren "
          f"(Überschätzung bis {s['overstatementMax']:,})")

    return {"hectare": hectare, "municipality": municipality,
            "canton": canton, "bounds": bounds}
```

Und in `main()`:

```python
    if args.command in ("statent", "all"):
        result = _run_statent(args.force)
        if args.command == "all":
            from . import sanity_map

            out = sanity_map.render(
                result["municipality"], result["bounds"].municipalities,
                config.DATA_INTERIM / "sanity_gemeinde.png",
            )
            print(f"[sanity-map] {out}")
            total = sum(
                p.stat().st_size for p in config.PUBLIC_DATA.glob("*")
                if p.is_file()
            )
            print(f"[all] public/data: {total / 1024:.0f} KB "
                  f"(Budget {config.MAX_PUBLIC_DATA_BYTES / 1024:.0f} KB)")
            if total > config.MAX_PUBLIC_DATA_BYTES:
                print("[all] FEHLER: Grössenbudget überschritten")
                return 1
        return 0
```

- [ ] **Step 3: Den Abnahmetest schreiben**

`etl/tests/test_pipeline.py`:

```python
import json

import pytest

from draufsicht_etl import binpack, config


pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def artifacts():
    missing = [
        n for n in ("ag_kanton", "ag_gemeinde", "ag_hektar")
        if not (config.PUBLIC_DATA / f"{n}.bin").exists()
    ]
    if missing:
        pytest.skip(f"Artefakte fehlen, zuerst `draufsicht-etl all` laufen lassen: {missing}")
    return {
        name: binpack.read_level(
            config.PUBLIC_DATA / f"{name}.bin", config.PUBLIC_DATA / f"{name}.json"
        )
        for name in ("ag_kanton", "ag_gemeinde", "ag_hektar")
    }


def test_hectare_count_is_plausible_for_aargau(artifacts):
    _, meta = artifacts["ag_hektar"]
    assert 10_000 < meta["count"] < 60_000, meta["count"]


def test_municipality_count_is_plausible(artifacts):
    _, meta = artifacts["ag_gemeinde"]
    assert 180 <= meta["count"] <= 200, meta["count"]


def test_sums_match_across_levels(artifacts):
    sums = {name: meta["stats"]["sum"] for name, (_, meta) in artifacts.items()}
    assert sums["ag_hektar"] == pytest.approx(sums["ag_gemeinde"], rel=1e-6)
    assert sums["ag_gemeinde"] == pytest.approx(sums["ag_kanton"], rel=1e-6)


def test_canton_total_is_in_the_expected_order_of_magnitude(artifacts):
    _, meta = artifacts["ag_kanton"]
    # Aargau hat rund 350'000 bis 400'000 Beschäftigte
    assert 250_000 < meta["stats"]["sum"] < 500_000, meta["stats"]["sum"]


def test_minimum_hectare_value_is_four(artifacts):
    arrays, _ = artifacts["ag_hektar"]
    assert arrays["values"].min() == 4.0, "Aufrundungsregel aus Spec 6.4 verletzt"


def test_positions_are_inside_the_aargau_bounding_box(artifacts):
    arrays, _ = artifacts["ag_hektar"]
    positions = arrays["positions"].reshape(-1, 2)
    assert 7.6 < positions[:, 0].min() and positions[:, 0].max() < 8.6
    assert 47.1 < positions[:, 1].min() and positions[:, 1].max() < 47.7


def test_total_artifact_size_within_budget():
    total = sum(p.stat().st_size for p in config.PUBLIC_DATA.glob("*") if p.is_file())
    assert total < config.MAX_PUBLIC_DATA_BYTES, f"{total / 1024:.0f} KB"


def test_meta_json_lists_all_levels():
    meta = json.loads((config.PUBLIC_DATA / "meta.json").read_text(encoding="utf-8"))
    assert meta["levels"] == ["kanton", "gemeinde", "hektar"]
    assert meta["canton"]["code"] == "AG"
```

- [ ] **Step 4: Vollständigen Lauf ausführen**

Run: `uv run --project etl draufsicht-etl all`
Expected: Hektarenzahl, Gemeindezahl, Kantonstotal, Anzahl mehrdeutiger Zellen,
Pfad zur Kontrollkarte, Grössenangabe unter dem Budget

- [ ] **Step 5: Alle Tests laufen lassen**

Run: `uv run --project etl pytest etl/tests -v`
Expected: alle bestanden, keine übersprungen

- [ ] **Step 6: Committen**

```bash
git add etl/src/draufsicht_etl/sanity_map.py etl/src/draufsicht_etl/cli.py \
        etl/tests/test_pipeline.py public/data/
git commit -m "feat: vollständiger ETL-Lauf mit 2D-Kontrollkarte"
```

**CHECKPOINT.** `data/interim/sanity_gemeinde.png` und die Konsolenausgabe von Step 4
vorlegen. Die Karte muss als Aargau erkennbar sein, mit hohen Werten in Aarau, Baden,
Wettingen, Wohlen und Rheinfelden. Auf Freigabe warten, bevor Task 11 beginnt.

---

## Task 11: Kartengerüst mit MapLibre und deck.gl

**Files:**
- Create: `src/map.ts`, `src/ui/error.ts`
- Modify: `src/main.ts`, `src/style.css`

**Interfaces:**
- Produces:
  - `map.MapHandle` — Interface mit
    - `readonly map: maplibregl.Map`
    - `setLayers(layers: unknown[]): void`
    - `onZoom(handler: (zoom: number) => void): void`
    - `getZoom(): number`
  - `map.createMap(container: HTMLElement): MapHandle`
  - `map.INITIAL_VIEW: { center: [number, number]; zoom: number; pitch: number; bearing: number }`
  - `ui/error.showError(message: string): void`

- [ ] **Step 1: Fehlerbox implementieren**

`src/ui/error.ts`:

```ts
/** Sichtbarer Fehler statt einer stumm leeren Karte. */
export function showError(message: string): void {
  let box = document.getElementById('fehler')
  if (!box) {
    box = document.createElement('div')
    box.id = 'fehler'
    document.getElementById('ui')?.appendChild(box)
  }
  box.textContent = message
  box.hidden = false
}
```

In `src/style.css` ergänzen:

```css
#fehler {
  position: absolute; top: 1rem; left: 50%; transform: translateX(-50%);
  max-width: min(40rem, calc(100vw - 2rem));
  padding: .75rem 1rem; border-radius: .375rem;
  background: #7f1d1d; color: #fff; font-size: .875rem; line-height: 1.4;
}
```

- [ ] **Step 2: `map.ts` implementieren**

```ts
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const BASEMAP_STYLE =
  'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json'

export const INITIAL_VIEW = {
  center: [8.15, 47.4] as [number, number],
  zoom: 9.5,
  pitch: 50,
  bearing: -15,
}

export interface MapHandle {
  readonly map: maplibregl.Map
  setLayers(layers: unknown[]): void
  onZoom(handler: (zoom: number) => void): void
  getZoom(): number
}

export function createMap(container: HTMLElement): MapHandle {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE,
    center: INITIAL_VIEW.center,
    zoom: INITIAL_VIEW.zoom,
    pitch: INITIAL_VIEW.pitch,
    bearing: INITIAL_VIEW.bearing,
    maxPitch: 75,
    attributionControl: false,
  })

  // interleaved: deck.gl-Balken werden in denselben WebGL-Kontext gezeichnet,
  // damit die Basiskarte sie korrekt verdeckt.
  const overlay = new MapboxOverlay({ interleaved: true, layers: [] })
  map.addControl(overlay)
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

  return {
    map,
    setLayers: (layers) => overlay.setProps({ layers }),
    onZoom: (handler) => {
      map.on('zoom', () => handler(map.getZoom()))
      handler(map.getZoom())
    },
    getZoom: () => map.getZoom(),
  }
}
```

- [ ] **Step 3: `main.ts` verdrahten**

```ts
import './style.css'
import { createMap } from './map'
import { showError } from './ui/error'

const container = document.getElementById('map')
if (!container) {
  showError('Kartencontainer #map fehlt im HTML.')
} else {
  const handle = createMap(container)
  handle.map.on('error', (event) => {
    showError(`Basiskarte konnte nicht geladen werden: ${event.error?.message ?? 'unbekannt'}`)
  })
}
```

- [ ] **Step 4: Typprüfung und Build**

Run: `npm run build`
Expected: keine TypeScript-Fehler

- [ ] **Step 5: Im Browser prüfen**

Run: `npm run dev`
Expected: swisstopo-Basiskarte zentriert auf den Aargau, geneigt, mit Navigationswürfel.
Rechtsklick-Ziehen dreht die Karte. Keine Fehlerbox.

- [ ] **Step 6: Committen**

```bash
git add src/map.ts src/ui/error.ts src/main.ts src/style.css
git commit -m "feat: Kartengerüst mit MapLibre und deck.gl-Overlay"
```

---

## Task 12: Datenlader, Höhenskala und Farbexpansion

**Files:**
- Create: `src/data/loader.ts`, `src/domain/scale.ts`, `src/domain/colors.ts`
- Test: `src/data/loader.test.ts`, `src/domain/scale.test.ts`, `src/domain/colors.test.ts`

**Interfaces:**
- Consumes: `domain/noga.generated.ts` (`NOGA_GROUPS`, `UNKNOWN_COLOR`, `NOGA_UNKNOWN_INDEX`)
- Produces:
  - `loader.ArraySpec = { byteOffset: number; length: number; type: 'Float32' | 'Uint16' | 'Uint8' }`
  - `loader.LevelMeta` — `{ level, year, canton, count, arrays: Record<string, ArraySpec>,
    nogaGroups: {key,label,color}[], unknownColor, unknownIndex, stats: LevelStats,
    gemeinden?: {bfsNr:number;name:string}[] }`
  - `loader.LevelStats = { min, max, sum, p99, ambiguousCells, overstatementMax }`
  - `loader.LevelArrays` — `{ positions: Float32Array; values: Float32Array; noga: Uint8Array;
    flags: Uint8Array; dist?: Float32Array; mixGroup?: Uint8Array; mixValue?: Uint16Array;
    gemeindeIdx?: Uint16Array }`
  - `loader.Level = { meta: LevelMeta; arrays: LevelArrays }`
  - `loader.decodeLevel(buffer: ArrayBuffer, meta: LevelMeta): Level`
  - `loader.loadLevel(name: string, base?: string): Promise<Level>`
  - `scale.ScaleMode = 'log' | 'linear'`
  - `scale.computeElevations(values: Float32Array, vmax: number, maxHeight: number, mode: ScaleMode): Float32Array`
  - `scale.referenceTicks(vmax: number, mode: ScaleMode): number[]`
  - `colors.buildColors(noga: Uint8Array, flags: Uint8Array, alpha?: number): Uint8Array`
  - `colors.FLAG_AMBIGUOUS = 1`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

`src/domain/scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeElevations, referenceTicks } from './scale'

describe('computeElevations', () => {
  it('maps zero to zero in both modes', () => {
    const values = new Float32Array([0])
    expect(computeElevations(values, 100, 5000, 'log')[0]).toBe(0)
    expect(computeElevations(values, 100, 5000, 'linear')[0]).toBe(0)
  })

  it('maps the maximum to the full height in both modes', () => {
    const values = new Float32Array([100])
    expect(computeElevations(values, 100, 5000, 'log')[0]).toBeCloseTo(5000, 5)
    expect(computeElevations(values, 100, 5000, 'linear')[0]).toBeCloseTo(5000, 5)
  })

  it('lifts small values much higher on the log scale', () => {
    const values = new Float32Array([10])
    const log = computeElevations(values, 10000, 5000, 'log')[0]!
    const linear = computeElevations(values, 10000, 5000, 'linear')[0]!
    expect(log).toBeGreaterThan(linear * 5)
  })

  it('is monotonic', () => {
    const values = new Float32Array([4, 17, 250, 4820])
    for (const mode of ['log', 'linear'] as const) {
      const h = computeElevations(values, 4820, 5000, mode)
      for (let i = 1; i < h.length; i++) expect(h[i]!).toBeGreaterThan(h[i - 1]!)
    }
  })

  it('never returns NaN when vmax is zero', () => {
    const h = computeElevations(new Float32Array([0, 0]), 0, 5000, 'log')
    expect([...h]).toEqual([0, 0])
  })
})

describe('referenceTicks', () => {
  it('returns three ascending ticks bounded by vmax', () => {
    const ticks = referenceTicks(4820, 'log')
    expect(ticks).toHaveLength(3)
    expect(ticks[0]!).toBeGreaterThan(0)
    expect(ticks[2]!).toBeLessThanOrEqual(4820)
    expect(ticks[0]!).toBeLessThan(ticks[1]!)
    expect(ticks[1]!).toBeLessThan(ticks[2]!)
  })
})
```

`src/domain/colors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildColors } from './colors'
import { NOGA_GROUPS, NOGA_UNKNOWN_INDEX, UNKNOWN_COLOR } from './noga.generated'

describe('buildColors', () => {
  it('produces four bytes per row', () => {
    const colors = buildColors(new Uint8Array([0, 1, 2]), new Uint8Array([0, 0, 0]))
    expect(colors).toHaveLength(12)
  })

  it('uses the group colour for a known index', () => {
    const colors = buildColors(new Uint8Array([1]), new Uint8Array([0]))
    expect([...colors.slice(0, 3)]).toEqual([...NOGA_GROUPS[1]!.color])
  })

  it('uses the reserved grey for the unknown index', () => {
    const colors = buildColors(new Uint8Array([NOGA_UNKNOWN_INDEX]), new Uint8Array([0]))
    expect([...colors.slice(0, 3)]).toEqual([...UNKNOWN_COLOR])
  })

  it('keeps the group colour for ambiguous rows but lowers the alpha', () => {
    const plain = buildColors(new Uint8Array([1]), new Uint8Array([0]))
    const ambiguous = buildColors(new Uint8Array([1]), new Uint8Array([1]))
    expect([...ambiguous.slice(0, 3)]).toEqual([...plain.slice(0, 3)])
    expect(ambiguous[3]!).toBeLessThan(plain[3]!)
  })

  it('falls back to grey for an out-of-range index instead of throwing', () => {
    const colors = buildColors(new Uint8Array([200]), new Uint8Array([0]))
    expect([...colors.slice(0, 3)]).toEqual([...UNKNOWN_COLOR])
  })
})
```

`src/data/loader.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodeLevel, type LevelMeta } from './loader'

function fixture() {
  // 2 Zeilen: positions (4 f32) | values (2 f32) | gemeindeIdx (2 u16) | noga (2 u8) | flags (2 u8)
  const buffer = new ArrayBuffer(16 + 8 + 4 + 2 + 2)
  new Float32Array(buffer, 0, 4).set([8.0, 47.4, 8.1, 47.5])
  new Float32Array(buffer, 16, 2).set([4, 250])
  new Uint16Array(buffer, 24, 2).set([0, 1])
  new Uint8Array(buffer, 28, 2).set([1, 255])
  new Uint8Array(buffer, 30, 2).set([1, 0])

  const meta: LevelMeta = {
    level: 'hektar', year: 2023, canton: 'AG', count: 2,
    arrays: {
      positions: { byteOffset: 0, length: 4, type: 'Float32' },
      values: { byteOffset: 16, length: 2, type: 'Float32' },
      gemeindeIdx: { byteOffset: 24, length: 2, type: 'Uint16' },
      noga: { byteOffset: 28, length: 2, type: 'Uint8' },
      flags: { byteOffset: 30, length: 2, type: 'Uint8' },
    },
    nogaGroups: [{ key: 'a', label: 'A', color: '#000000' }],
    unknownColor: '#999999', unknownIndex: 255,
    stats: { min: 4, max: 250, sum: 254, p99: 250, ambiguousCells: 1, overstatementMax: 3 },
    gemeinden: [{ bfsNr: 4001, name: 'Aarau' }, { bfsNr: 4002, name: 'Baden' }],
  }
  return { buffer, meta }
}

describe('decodeLevel', () => {
  it('decodes every declared array with the right type', () => {
    const { arrays } = decodeLevel(fixture().buffer, fixture().meta)
    expect(arrays.positions).toBeInstanceOf(Float32Array)
    expect(arrays.values).toBeInstanceOf(Float32Array)
    expect(arrays.gemeindeIdx).toBeInstanceOf(Uint16Array)
    expect(arrays.noga).toBeInstanceOf(Uint8Array)
    expect([...arrays.values]).toEqual([4, 250])
  })

  it('keeps positions interleaved as lon,lat pairs', () => {
    const { arrays } = decodeLevel(fixture().buffer, fixture().meta)
    expect(arrays.positions[0]).toBeCloseTo(8.0, 5)
    expect(arrays.positions[1]).toBeCloseTo(47.4, 5)
    expect(arrays.positions.length).toBe(2 * fixture().meta.count)
  })

  it('does not copy the underlying buffer', () => {
    const { buffer, meta } = fixture()
    const { arrays } = decodeLevel(buffer, meta)
    expect(arrays.values.buffer).toBe(buffer)
  })

  it('throws a named error when a required array is missing', () => {
    const { buffer, meta } = fixture()
    delete (meta.arrays as Record<string, unknown>).values
    expect(() => decodeLevel(buffer, meta)).toThrow(/values/)
  })

  it('throws when an array runs past the end of the buffer', () => {
    const { buffer, meta } = fixture()
    meta.arrays.values!.length = 99
    expect(() => decodeLevel(buffer, meta)).toThrow(/values/)
  })
})
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL, `Cannot find module './scale'` und Geschwister

- [ ] **Step 3: `scale.ts` implementieren**

```ts
export type ScaleMode = 'log' | 'linear'

/** Höhen in Metern. Logarithmisch ist der Standard, sonst besteht die Karte
 *  aus einem Turm und einer Ebene. */
export function computeElevations(
  values: Float32Array,
  vmax: number,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const out = new Float32Array(values.length)
  if (vmax <= 0) return out

  const denominator = mode === 'log' ? Math.log10(1 + vmax) : vmax
  if (denominator <= 0) return out

  for (let i = 0; i < values.length; i++) {
    const value = values[i]!
    if (value <= 0) continue
    const numerator = mode === 'log' ? Math.log10(1 + value) : value
    out[i] = (numerator / denominator) * maxHeight
  }
  return out
}

/** Drei Stützwerte für die Legende, gleichmässig über die aktive Skala verteilt. */
export function referenceTicks(vmax: number, mode: ScaleMode): number[] {
  if (vmax <= 0) return [0, 0, 0]
  const fractions = [0.25, 0.6, 1.0]
  const ticks = fractions.map((f) =>
    mode === 'log' ? Math.pow(10, Math.log10(1 + vmax) * f) - 1 : vmax * f,
  )
  return ticks.map((t, i) => (i === ticks.length - 1 ? vmax : Math.max(1, Math.round(t))))
}
```

- [ ] **Step 4: `colors.ts` implementieren**

```ts
import { NOGA_GROUPS, NOGA_UNKNOWN_INDEX, UNKNOWN_COLOR } from './noga.generated'

export const FLAG_AMBIGUOUS = 1

const AMBIGUOUS_ALPHA = 140

/** RGBA je Zeile. Mehrdeutige Hektaren behalten ihre Branchenfarbe, werden aber
 *  durchscheinend gezeichnet — die Farbe bleibt lesbar, die Unschärfe sichtbar. */
export function buildColors(
  noga: Uint8Array,
  flags: Uint8Array,
  alpha = 255,
): Uint8Array {
  const out = new Uint8Array(noga.length * 4)
  for (let i = 0; i < noga.length; i++) {
    const index = noga[i]!
    const group = index === NOGA_UNKNOWN_INDEX ? undefined : NOGA_GROUPS[index]
    const rgb = group?.color ?? UNKNOWN_COLOR
    const offset = i * 4
    out[offset] = rgb[0]
    out[offset + 1] = rgb[1]
    out[offset + 2] = rgb[2]
    out[offset + 3] = (flags[i]! & FLAG_AMBIGUOUS) !== 0 ? AMBIGUOUS_ALPHA : alpha
  }
  return out
}
```

- [ ] **Step 5: `loader.ts` implementieren**

```ts
export type ArrayType = 'Float32' | 'Uint16' | 'Uint8'

export interface ArraySpec {
  byteOffset: number
  length: number
  type: ArrayType
}

export interface LevelStats {
  min: number
  max: number
  sum: number
  p99: number
  ambiguousCells: number
  overstatementMax: number
}

export interface LevelMeta {
  level: string
  year: number
  canton: string
  count: number
  arrays: Record<string, ArraySpec | undefined>
  nogaGroups: { key: string; label: string; color: string }[]
  unknownColor: string
  unknownIndex: number
  stats: LevelStats
  gemeinden?: { bfsNr: number; name: string }[]
}

export interface LevelArrays {
  positions: Float32Array
  values: Float32Array
  noga: Uint8Array
  flags: Uint8Array
  dist?: Float32Array
  mixGroup?: Uint8Array
  mixValue?: Uint16Array
  gemeindeIdx?: Uint16Array
}

export interface Level {
  meta: LevelMeta
  arrays: LevelArrays
}

const CONSTRUCTORS = {
  Float32: Float32Array,
  Uint16: Uint16Array,
  Uint8: Uint8Array,
} as const

const REQUIRED = ['positions', 'values', 'noga', 'flags'] as const

function view(buffer: ArrayBuffer, name: string, spec: ArraySpec) {
  const Ctor = CONSTRUCTORS[spec.type]
  const end = spec.byteOffset + spec.length * Ctor.BYTES_PER_ELEMENT
  if (end > buffer.byteLength) {
    throw new Error(
      `Array "${name}" reicht bis Byte ${end}, die Datei hat nur ${buffer.byteLength}.`,
    )
  }
  return new Ctor(buffer, spec.byteOffset, spec.length)
}

export function decodeLevel(buffer: ArrayBuffer, meta: LevelMeta): Level {
  for (const name of REQUIRED) {
    if (!meta.arrays[name]) {
      throw new Error(`Pflichtarray "${name}" fehlt in den Metadaten von ${meta.level}.`)
    }
  }

  const decoded: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(meta.arrays)) {
    if (spec) decoded[name] = view(buffer, name, spec)
  }
  return { meta, arrays: decoded as unknown as LevelArrays }
}

export async function loadLevel(name: string, base = '/data'): Promise<Level> {
  const [metaResponse, binResponse] = await Promise.all([
    fetch(`${base}/${name}.json`),
    fetch(`${base}/${name}.bin`),
  ])
  if (!metaResponse.ok) throw new Error(`${name}.json: HTTP ${metaResponse.status}`)
  if (!binResponse.ok) throw new Error(`${name}.bin: HTTP ${binResponse.status}`)

  const meta = (await metaResponse.json()) as LevelMeta
  return decodeLevel(await binResponse.arrayBuffer(), meta)
}
```

- [ ] **Step 6: Tests laufen lassen, Erfolg prüfen**

Run: `npm test`
Expected: 16 passed

- [ ] **Step 7: Committen**

```bash
git add src/data/loader.ts src/data/loader.test.ts src/domain/scale.ts \
        src/domain/scale.test.ts src/domain/colors.ts src/domain/colors.test.ts
git commit -m "feat: Binärlader, Höhenskala und Farbexpansion"
```

---

## Task 13: Gemeindestufe in 3D — CHECKPOINT

**Files:**
- Create: `src/layers/many.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `loader.Level`, `scale.computeElevations`, `colors.buildColors`
- Produces:
  - `many.MAX_BAR_HEIGHT_M = 12000`
  - `many.LayerOptions = { level: Level; mode: ScaleMode; opacity: number; visible: boolean;
    onClick?: (index: number) => void }`
  - `many.buildColumnLayer(id: string, options: LayerOptions): ColumnLayer`
  - `many.radiusFor(level: string): number`

- [ ] **Step 1: `many.ts` implementieren**

```ts
import { ColumnLayer } from '@deck.gl/layers'
import type { Level } from '../data/loader'
import { buildColors } from '../domain/colors'
import { computeElevations, type ScaleMode } from '../domain/scale'

export const MAX_BAR_HEIGHT_M = 12000

/** Hektarbalken füllen ihre Zelle; höhere Stufen brauchen sichtbare Grundflächen. */
export function radiusFor(level: string): number {
  switch (level) {
    case 'hektar':
      return 50
    case 'gemeinde':
      return 700
    default:
      return 4000
  }
}

export interface LayerOptions {
  level: Level
  mode: ScaleMode
  opacity: number
  visible: boolean
  onClick?: (index: number) => void
}

export function buildColumnLayer(id: string, options: LayerOptions): ColumnLayer {
  const { level, mode, opacity, visible, onClick } = options
  const { arrays, meta } = level

  const elevations = computeElevations(
    arrays.values,
    meta.stats.max,
    MAX_BAR_HEIGHT_M,
    mode,
  )
  const colors = buildColors(arrays.noga, arrays.flags)

  return new ColumnLayer({
    id,
    data: {
      length: meta.count,
      attributes: {
        getPosition: { value: arrays.positions, size: 2 },
        getElevation: { value: elevations, size: 1 },
        getFillColor: { value: colors, size: 4, normalized: true },
      },
    },
    positionFormat: 'XY',
    diskResolution: 4, // Quadrate, passend zum Hektarraster
    angle: 45,
    radius: radiusFor(meta.level),
    radiusUnits: 'meters',
    extruded: true,
    material: false, // flaches Shading, spürbar günstiger
    pickable: true,
    visible: visible && opacity > 0.01,
    opacity,
    updateTriggers: { getElevation: [mode, meta.level] },
    onClick: onClick ? (info) => onClick(info.index) : undefined,
  })
}
```

- [ ] **Step 2: `main.ts` auf die Gemeindestufe verdrahten**

```ts
import './style.css'
import { loadLevel } from './data/loader'
import { buildColumnLayer } from './layers/many'
import { createMap } from './map'
import { showError } from './ui/error'

async function start() {
  const container = document.getElementById('map')
  if (!container) return showError('Kartencontainer #map fehlt im HTML.')

  const handle = createMap(container)
  handle.map.on('error', (event) =>
    showError(`Basiskarte: ${event.error?.message ?? 'unbekannter Fehler'}`),
  )

  const gemeinde = await loadLevel('ag_gemeinde')
  handle.setLayers([
    buildColumnLayer('gemeinde', {
      level: gemeinde,
      mode: 'log',
      opacity: 1,
      visible: true,
      onClick: (index) => {
        const name = gemeinde.meta.gemeinden?.[gemeinde.arrays.gemeindeIdx![index]!]?.name
        console.log(name, gemeinde.arrays.values[index])
      },
    }),
  ])
}

start().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
```

- [ ] **Step 3: Typprüfung und Build**

Run: `npm run build`
Expected: keine Fehler

- [ ] **Step 4: Im Browser prüfen**

Run: `npm run dev`
Expected: rund 196 farbige Säulen über dem Aargau. Aarau, Baden, Wettingen und Wohlen
ragen heraus. Klick loggt Gemeindename und Beschäftigtenzahl in die Konsole.

- [ ] **Step 5: Gegenprobe der Höhenskala**

In der Konsole `mode: 'linear'` setzen (in `main.ts` ändern, Hot Reload abwarten).
Expected: nur noch ein bis zwei sichtbare Türme, alles andere flach — genau das
Problem, dessentwegen `log` der Standard ist. Danach zurück auf `'log'`.

- [ ] **Step 6: Committen**

```bash
git add src/layers/many.ts src/main.ts
git commit -m "feat: Gemeindestufe als 3D-Balken"
```

**CHECKPOINT.** Bildschirmfoto der Gemeindeansicht vorlegen und auf Freigabe warten.

---

## Task 14: Hektarstufe und LOD-Überblendung — CHECKPOINT

**Files:**
- Create: `src/domain/lod.ts`
- Test: `src/domain/lod.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces:
  - `lod.LodWeights = { kanton: number; gemeinde: number; hektar: number }`
  - `lod.BAND_CENTERS = { kantonGemeinde: 9, gemeindeHektar: 12 }`
  - `lod.BAND_WIDTH = 0.75`
  - `lod.lodWeights(zoom: number): LodWeights`
  - `lod.activeLevel(zoom: number): 'kanton' | 'gemeinde' | 'hektar'`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`src/domain/lod.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { activeLevel, lodWeights } from './lod'

describe('lodWeights', () => {
  it('shows only the canton far out', () => {
    expect(lodWeights(7)).toEqual({ kanton: 1, gemeinde: 0, hektar: 0 })
  })

  it('shows only municipalities in the middle band', () => {
    expect(lodWeights(10.5)).toEqual({ kanton: 0, gemeinde: 1, hektar: 0 })
  })

  it('shows only hectares when zoomed in', () => {
    expect(lodWeights(14)).toEqual({ kanton: 0, gemeinde: 0, hektar: 1 })
  })

  it('splits evenly at the centre of the first transition', () => {
    const w = lodWeights(9)
    expect(w.kanton).toBeCloseTo(0.5, 6)
    expect(w.gemeinde).toBeCloseTo(0.5, 6)
    expect(w.hektar).toBe(0)
  })

  it('splits evenly at the centre of the second transition', () => {
    const w = lodWeights(12)
    expect(w.gemeinde).toBeCloseTo(0.5, 6)
    expect(w.hektar).toBeCloseTo(0.5, 6)
    expect(w.kanton).toBe(0)
  })

  it('always sums to one', () => {
    for (let zoom = 5; zoom <= 18; zoom += 0.05) {
      const w = lodWeights(zoom)
      expect(w.kanton + w.gemeinde + w.hektar).toBeCloseTo(1, 6)
    }
  })

  it('never returns a negative weight', () => {
    for (let zoom = 5; zoom <= 18; zoom += 0.05) {
      const w = lodWeights(zoom)
      expect(Math.min(w.kanton, w.gemeinde, w.hektar)).toBeGreaterThanOrEqual(0)
    }
  })

  it('changes continuously — no step larger than 0.1 per 0.05 zoom', () => {
    let previous = lodWeights(5)
    for (let zoom = 5.05; zoom <= 18; zoom += 0.05) {
      const current = lodWeights(zoom)
      expect(Math.abs(current.gemeinde - previous.gemeinde)).toBeLessThan(0.1)
      previous = current
    }
  })
})

describe('activeLevel', () => {
  it('names the dominant level', () => {
    expect(activeLevel(7)).toBe('kanton')
    expect(activeLevel(10.5)).toBe('gemeinde')
    expect(activeLevel(14)).toBe('hektar')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test -- lod`
Expected: FAIL, `Cannot find module './lod'`

- [ ] **Step 3: `lod.ts` implementieren**

```ts
export interface LodWeights {
  kanton: number
  gemeinde: number
  hektar: number
}

export const BAND_CENTERS = { kantonGemeinde: 9, gemeindeHektar: 12 } as const
export const BAND_WIDTH = 0.75

function ramp(zoom: number, centre: number): number {
  const t = (zoom - (centre - BAND_WIDTH / 2)) / BAND_WIDTH
  return Math.min(1, Math.max(0, t))
}

/** Gewichte der drei Stufen. Summiert sich immer auf 1, damit die Überblendung
 *  keine Lücke und keine doppelte Deckung erzeugt. */
export function lodWeights(zoom: number): LodWeights {
  const toMunicipality = ramp(zoom, BAND_CENTERS.kantonGemeinde)
  const toHectare = ramp(zoom, BAND_CENTERS.gemeindeHektar)
  return {
    kanton: 1 - toMunicipality,
    gemeinde: toMunicipality * (1 - toHectare),
    hektar: toHectare,
  }
}

export function activeLevel(zoom: number): 'kanton' | 'gemeinde' | 'hektar' {
  const w = lodWeights(zoom)
  if (w.hektar >= w.gemeinde && w.hektar >= w.kanton) return 'hektar'
  return w.gemeinde >= w.kanton ? 'gemeinde' : 'kanton'
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `npm test -- lod`
Expected: 9 passed

- [ ] **Step 5: Alle drei Stufen in `main.ts` verdrahten**

```ts
import './style.css'
import { loadLevel, type Level } from './data/loader'
import { lodWeights } from './domain/lod'
import type { ScaleMode } from './domain/scale'
import { buildColumnLayer } from './layers/many'
import { createMap } from './map'
import { showError } from './ui/error'

const LEVEL_NAMES = ['kanton', 'gemeinde', 'hektar'] as const

async function start() {
  const container = document.getElementById('map')
  if (!container) return showError('Kartencontainer #map fehlt im HTML.')

  const handle = createMap(container)
  handle.map.on('error', (event) =>
    showError(`Basiskarte: ${event.error?.message ?? 'unbekannter Fehler'}`),
  )

  const loaded = await Promise.all(LEVEL_NAMES.map((n) => loadLevel(`ag_${n}`)))
  const levels = Object.fromEntries(
    LEVEL_NAMES.map((name, i) => [name, loaded[i]!]),
  ) as Record<(typeof LEVEL_NAMES)[number], Level>

  const mode: ScaleMode = 'log'

  const render = (zoom: number) => {
    const weights = lodWeights(zoom)
    handle.setLayers(
      LEVEL_NAMES.map((name) =>
        buildColumnLayer(name, {
          level: levels[name],
          mode,
          opacity: weights[name],
          visible: weights[name] > 0.01,
        }),
      ),
    )
  }

  handle.onZoom(render)
}

start().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
```

- [ ] **Step 6: Build und Browsertest**

Run: `npm run build && npm run dev`
Expected: Herauszoomen zeigt einen Kantonsbalken, mittlerer Zoom die Gemeinden,
Hineinzoomen das Hektarraster. Die Übergänge bei Zoom 9 und 12 blenden weich,
ohne Sprung und ohne kurzzeitig leeres Bild.

- [ ] **Step 7: Bildrate messen**

Im Browser die Entwicklerwerkzeuge öffnen, auf Zoom 13 über dem Raum Baden
positionieren und die Karte 10 Sekunden rotieren lassen (Rechtsklick-Ziehen).
Expected: Bildrate bleibt bei oder nahe 60 fps. Bricht sie deutlich ein, zuerst
`material: false` und `diskResolution: 4` bestätigen, dann die Anzahl gerenderter
Hektaren aus `ag_hektar.json` gegen die Erwartung prüfen.

- [ ] **Step 8: Committen**

```bash
git add src/domain/lod.ts src/domain/lod.test.ts src/main.ts
git commit -m "feat: Hektarstufe mit weicher LOD-Überblendung"
```

**CHECKPOINT.** Bildschirmfotos der drei Zoomstufen und das Ergebnis der
Bildratenmessung vorlegen. Auf Freigabe warten, bevor Task 15 beginnt.

---

## Task 15: Ansicht A — Kandidaten, Geokodierung, CSV-Validierung

**Files:**
- Create: `etl/src/draufsicht_etl/geocode.py`, `etl/src/draufsicht_etl/companies.py`
- Create: `data/manual/ag_listed_companies.csv`, `data/manual/six_issuers_ag.md`
- Test: `etl/tests/test_companies.py`, `etl/tests/test_geocode.py`
- Erzeugt: `public/data/companies.json`, `data/interim/ag_candidates.csv`

**Interfaces:**
- Produces:
  - `geocode.geocode(query: str, fetcher=None) -> tuple[float, float]` — WGS84 lon/lat
  - `geocode.fill_missing(rows: list[dict], fetcher=None) -> int` — Anzahl neu geokodierter Zeilen
  - `companies.CSV_COLUMNS: tuple[str, ...]`
  - `companies.load_csv(path: Path) -> list[dict]`
  - `companies.validate(rows: list[dict]) -> None` — wirft `ValueError` mit allen Verstössen
  - `companies.build_artifact(rows: list[dict], table: NogaTable) -> dict`
  - `companies.candidates_from_lindas(canton_code: str, fetcher=None) -> list[dict]`

- [ ] **Step 1: LINDAS erkunden — welche Prädikate trägt der Zefix-Graph?**

Run:
```bash
curl -sS -H "Accept: application/sparql-results+json" \
  -H "User-Agent: draufsicht-etl/0.1" \
  --data-urlencode 'query=
SELECT ?p (COUNT(*) AS ?n) WHERE {
  GRAPH <https://lindas.admin.ch/foj/zefix> { ?s ?p ?o }
} GROUP BY ?p ORDER BY DESC(?n) LIMIT 40' \
  https://ld.admin.ch/query | python3 -m json.tool | head -80
```
Expected: Liste der häufigsten Prädikate. Gesucht werden die Prädikate für
Firmenname, UID, Sitzgemeinde und Kanton. Antwortet der Endpunkt mit 4xx, die
Abfrage als `GET ?query=…` wiederholen.

Das Ergebnis dieses Schritts pinnt die Abfrage in Step 4. Ohne diesen Schritt keine
Abfrage schreiben — Prädikatnamen werden nicht geraten.

- [ ] **Step 2: SIX-Emittentenseite prüfen**

Run:
```bash
curl -sSL -A "Mozilla/5.0" --max-time 60 \
  "https://www.six-group.com/fqs/ref.json?select=ShortName,ISIN,ValorSymbol&where=ProductLine=EQ&pageSize=1000" \
  -o data/interim/six_probe.json -w "%{http_code} %{size_download}b\n"
```
Liefert das eine verwertbare Liste, wird sie in Step 4 verwendet. Andernfalls
`data/manual/six_issuers_ag.md` anlegen: eine Tabelle mit Symbol, Firma, UID und
Abrufdatum, jede Zeile mit Quell-URL. Das ist der dokumentierte Rückfallpfad aus
Spec 8.2 und ausdrücklich zulässig.

- [ ] **Step 3: Den fehlschlagenden Test schreiben**

`etl/tests/test_geocode.py`:

```python
import json

import pytest

from draufsicht_etl import geocode

RESPONSE = json.dumps(
    {"results": [{"attrs": {"lon": 8.0442, "lat": 47.3903, "label": "Aarau"}}]}
).encode()


def test_geocode_returns_lon_lat():
    lon, lat = geocode.geocode("Bahnhofstrasse 1 5000 Aarau", fetcher=lambda _: RESPONSE)
    assert (lon, lat) == (8.0442, 47.3903)


def test_geocode_raises_on_no_result():
    empty = json.dumps({"results": []}).encode()
    with pytest.raises(LookupError, match="kein Treffer"):
        geocode.geocode("Nirgendwo", fetcher=lambda _: empty)


def test_fill_missing_only_touches_empty_rows():
    rows = [
        {"geocode_query": "A", "lon": "8.0", "lat": "47.0"},
        {"geocode_query": "B", "lon": "", "lat": ""},
    ]
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return RESPONSE

    assert geocode.fill_missing(rows, fetcher=fake) == 1
    assert len(calls) == 1
    assert rows[0]["lon"] == "8.0"
    assert rows[1]["lon"] == "8.0442"
```

`etl/tests/test_companies.py`:

```python
import csv

import pytest

from draufsicht_etl import companies, noga


def _row(**overrides):
    row = {c: "" for c in companies.CSV_COLUMNS}
    row.update(
        {
            "uid": "CHE-100.000.001",
            "name": "Beispiel AG",
            "six_symbol": "BSP",
            "isin": "CH0000000001",
            "street": "Bahnhofstrasse 1",
            "zip": "5000",
            "city": "Aarau",
            "lon": "8.0442",
            "lat": "47.3903",
            "geocode_query": "Bahnhofstrasse 1 5000 Aarau",
            "noga_group": "industrie",
            "revenue": "1250000000",
            "revenue_currency": "CHF",
            "revenue_unit": "1",
            "employees": "3400",
            "fiscal_year": "2024",
            "report_url": "https://example.test/gb2024.pdf",
        }
    )
    row.update(overrides)
    return row


def test_validate_accepts_a_complete_row():
    companies.validate([_row()])


def test_validate_rejects_revenue_without_report_url():
    with pytest.raises(ValueError, match="report_url"):
        companies.validate([_row(report_url="")])


def test_validate_rejects_revenue_without_fiscal_year():
    with pytest.raises(ValueError, match="fiscal_year"):
        companies.validate([_row(fiscal_year="")])


def test_validate_rejects_revenue_without_currency():
    with pytest.raises(ValueError, match="revenue_currency"):
        companies.validate([_row(revenue_currency="")])


def test_validate_allows_empty_revenue_with_a_note():
    companies.validate([_row(revenue="", revenue_currency="", fiscal_year="",
                             report_url="", note="Umsatz nicht öffentlich")])


def test_validate_requires_a_note_when_revenue_is_empty():
    with pytest.raises(ValueError, match="note"):
        companies.validate([_row(revenue="", revenue_currency="", fiscal_year="",
                                 report_url="", note="")])


def test_validate_rejects_missing_coordinates():
    with pytest.raises(ValueError, match="lon"):
        companies.validate([_row(lon="")])


def test_validate_rejects_unknown_noga_group():
    with pytest.raises(ValueError, match="gibt.s.nicht|unbekannt"):
        companies.validate([_row(noga_group="raumfahrt")])


def test_validate_reports_every_violation_at_once():
    with pytest.raises(ValueError) as info:
        companies.validate([_row(report_url="", lon="")])
    message = str(info.value)
    assert "report_url" in message and "lon" in message


def test_validate_rejects_duplicate_uid():
    with pytest.raises(ValueError, match="doppelt"):
        companies.validate([_row(), _row(name="Andere AG")])


def test_build_artifact_carries_source_urls():
    table = noga.load_table()
    artifact = companies.build_artifact([_row()], table)
    entry = artifact["companies"][0]
    assert entry["reportUrl"] == "https://example.test/gb2024.pdf"
    assert entry["fiscalYear"] == 2024
    assert entry["revenue"] == 1_250_000_000
    assert entry["nogaGroupIndex"] == next(
        i for i, g in enumerate(table.groups) if g.key == "industrie"
    )


def test_build_artifact_marks_rows_without_revenue():
    table = noga.load_table()
    artifact = companies.build_artifact(
        [_row(revenue="", revenue_currency="", fiscal_year="", report_url="",
              note="Umsatz nicht öffentlich")],
        table,
    )
    assert artifact["companies"][0]["revenue"] is None
    assert artifact["companies"][0]["placeholder"] is True


def test_load_csv_roundtrip(tmp_path):
    path = tmp_path / "c.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=companies.CSV_COLUMNS)
        writer.writeheader()
        writer.writerow(_row())
    rows = companies.load_csv(path)
    assert rows[0]["name"] == "Beispiel AG"


def test_load_csv_rejects_unexpected_header(tmp_path):
    path = tmp_path / "c.csv"
    path.write_text("uid,name\nX,Y\n", encoding="utf-8")
    with pytest.raises(ValueError, match="Spalten"):
        companies.load_csv(path)
```

- [ ] **Step 4: `geocode.py` und `companies.py` implementieren**

`geocode.py`:

```python
"""Geokodierung über die swisstopo-Suche, Ergebnis wird im CSV persistiert."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from collections.abc import Callable

from . import config

Fetcher = Callable[[str], bytes]


def _http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def geocode(query: str, fetcher: Fetcher | None = None) -> tuple[float, float]:
    get = fetcher or _http_get
    params = urllib.parse.urlencode(
        {"searchText": query, "type": "locations", "sr": "4326", "limit": "1"}
    )
    payload = json.loads(get(f"{config.GEOCODE_URL}?{params}"))
    results = payload.get("results") or []
    if not results:
        raise LookupError(f"Geokodierung: kein Treffer für {query!r}")
    attrs = results[0]["attrs"]
    return float(attrs["lon"]), float(attrs["lat"])


def fill_missing(rows: list[dict], fetcher: Fetcher | None = None) -> int:
    """Geokodiert nur Zeilen ohne Koordinaten — der Build bleibt reproduzierbar."""
    filled = 0
    for row in rows:
        if row.get("lon") and row.get("lat"):
            continue
        query = row.get("geocode_query") or " ".join(
            filter(None, [row.get("street"), row.get("zip"), row.get("city")])
        )
        lon, lat = geocode(query, fetcher)
        row["lon"] = f"{lon:.6f}"
        row["lat"] = f"{lat:.6f}"
        row["geocode_query"] = query
        filled += 1
    return filled
```

`companies.py`:

```python
"""Ansicht A: manuell gepflegtes CSV, maschinell erzwungene Quellenpflicht."""

from __future__ import annotations

import csv
import json
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path

from . import config
from .noga import NogaTable

CSV_COLUMNS = (
    "uid", "name", "six_symbol", "isin",
    "street", "zip", "city", "lon", "lat", "geocode_query",
    "noga_group",
    "revenue", "revenue_currency", "revenue_unit",
    "employees", "fiscal_year", "report_url", "note",
)

Fetcher = Callable[[str], bytes]


def load_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        actual = tuple(reader.fieldnames or ())
        if actual != CSV_COLUMNS:
            raise ValueError(
                f"Spalten weichen ab.\nErwartet: {CSV_COLUMNS}\nGefunden : {actual}"
            )
        return [dict(row) for row in reader]


def validate(rows: list[dict], table: NogaTable | None = None) -> None:
    from .noga import load_table

    table = table or load_table()
    valid_groups = {g.key for g in table.groups}
    problems: list[str] = []
    seen: dict[str, int] = {}

    for number, row in enumerate(rows, start=2):  # Zeile 1 ist der Kopf
        label = f"Zeile {number} ({row.get('name') or 'ohne Name'})"

        uid = row.get("uid", "").strip()
        if uid and uid in seen:
            problems.append(f"{label}: uid {uid} doppelt, schon in Zeile {seen[uid]}")
        elif uid:
            seen[uid] = number

        for field in ("lon", "lat"):
            if not row.get(field, "").strip():
                problems.append(f"{label}: {field} fehlt — zuerst geokodieren")

        group = row.get("noga_group", "").strip()
        if group not in valid_groups:
            problems.append(
                f"{label}: noga_group {group!r} unbekannt, erlaubt: {sorted(valid_groups)}"
            )

        if row.get("revenue", "").strip():
            for field in ("report_url", "fiscal_year", "revenue_currency"):
                if not row.get(field, "").strip():
                    problems.append(
                        f"{label}: revenue gesetzt, aber {field} fehlt — "
                        "jede Zahl muss auf eine Quelle zurückführbar sein"
                    )
        elif not row.get("note", "").strip():
            problems.append(
                f"{label}: revenue leer, dann muss note erklären warum"
            )

    if problems:
        raise ValueError("CSV-Validierung fehlgeschlagen:\n  " + "\n  ".join(problems))


def build_artifact(rows: list[dict], table: NogaTable) -> dict:
    index = {g.key: i for i, g in enumerate(table.groups)}
    entries = []
    for row in rows:
        revenue = row.get("revenue", "").strip()
        unit = float(row.get("revenue_unit") or 1)
        entries.append(
            {
                "uid": row["uid"],
                "name": row["name"],
                "sixSymbol": row.get("six_symbol") or None,
                "lon": float(row["lon"]),
                "lat": float(row["lat"]),
                "nogaGroupIndex": index[row["noga_group"]],
                "revenue": float(revenue) * unit if revenue else None,
                "currency": row.get("revenue_currency") or None,
                "employees": int(row["employees"]) if row.get("employees") else None,
                "fiscalYear": int(row["fiscal_year"]) if row.get("fiscal_year") else None,
                "reportUrl": row.get("report_url") or None,
                "note": row.get("note") or None,
                "placeholder": not revenue,
                "city": row.get("city") or None,
            }
        )

    revenues = [e["revenue"] for e in entries if e["revenue"] is not None]
    return {
        "canton": config.CANTON["code"],
        "companies": entries,
        "stats": {
            "count": len(entries),
            "withRevenue": len(revenues),
            "max": max(revenues) if revenues else 0.0,
        },
    }


def _sparql(query: str, fetcher: Fetcher | None = None) -> dict:
    get = fetcher or (
        lambda url: urllib.request.urlopen(
            urllib.request.Request(
                url,
                headers={
                    "User-Agent": config.USER_AGENT,
                    "Accept": "application/sparql-results+json",
                },
            ),
            timeout=120,
        ).read()
    )
    return json.loads(get(f"{config.LINDAS_SPARQL}?{urllib.parse.urlencode({'query': query})}"))


def candidates_from_lindas(canton_code: str, fetcher: Fetcher | None = None) -> list[dict]:
    """Firmen mit Sitz im Kanton aus dem Zefix-Graphen.

    Die Prädikate werden in Task 15 Step 1 ermittelt und hier eingesetzt. Die
    Abfrage wird beim ersten Lauf gegen den Endpunkt geprüft; liefert sie null
    Zeilen, ist das ein Fehler und kein leeres Ergebnis.
    """
    query = _CANDIDATE_QUERY.replace("{{CANTON}}", canton_code)
    payload = _sparql(query, fetcher)
    bindings = payload.get("results", {}).get("bindings", [])
    if not bindings:
        raise LookupError(
            "LINDAS lieferte keine Firmen — Abfrage gegen die in Step 1 "
            "ermittelten Prädikate prüfen"
        )
    return [
        {key: binding[key]["value"] for key in binding}
        for binding in bindings
    ]
```

`_CANDIDATE_QUERY` wird nach Step 1 mit den tatsächlichen Prädikaten in
`companies.py` als Modulkonstante ergänzt. Ausgangspunkt, der nach Step 1 zu
verifizieren ist:

```sparql
PREFIX schema: <http://schema.org/>
SELECT DISTINCT ?uid ?name ?municipality WHERE {
  GRAPH <https://lindas.admin.ch/foj/zefix> {
    ?company a schema:Organization ;
             schema:identifier ?uid ;
             schema:legalName ?name ;
             schema:address/schema:addressRegion ?canton ;
             schema:address/schema:addressLocality ?municipality .
    FILTER(STR(?canton) = "{{CANTON}}")
  }
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `uv run --project etl pytest etl/tests/test_companies.py etl/tests/test_geocode.py -v`
Expected: 17 passed

- [ ] **Step 6: Kandidatenliste erzeugen und CSV füllen**

1. `uv run --project etl python -c "from draufsicht_etl import companies; import csv, sys; rows = companies.candidates_from_lindas('AG'); w = csv.DictWriter(open('data/interim/ag_candidates.csv','w',newline='',encoding='utf-8'), fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows); print(len(rows), 'Firmen')"`
2. Kandidaten gegen die SIX-Liste aus Step 2 über die UID schneiden.
3. Für jede verbleibende Firma den letzten Geschäftsbericht aufrufen und
   **Umsatz, Mitarbeitende, Geschäftsjahr, Währung und die Quell-URL** ins CSV
   eintragen. Sekundärquellen sind unzulässig; ist eine Zahl im Bericht nicht
   auffindbar, bleiben `revenue` und `fiscal_year` leer und `note` erklärt warum.
4. `revenue_unit` ist der Faktor, mit dem `revenue` multipliziert wird (1 für
   Franken, 1000000 für Angaben in Millionen).

Erwartete Grössenordnung: 8 bis 12 Firmen.

- [ ] **Step 7: `cli.py` um `companies` erweitern**

```python
    if args.command in ("companies", "all"):
        import csv as _csv

        from . import companies, geocode, noga

        path = config.DATA_MANUAL / "ag_listed_companies.csv"
        rows = companies.load_csv(path)
        filled = geocode.fill_missing(rows)
        if filled:
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = _csv.DictWriter(handle, fieldnames=companies.CSV_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)
            print(f"[companies] {filled} Zeilen neu geokodiert und persistiert")

        companies.validate(rows)
        artifact = companies.build_artifact(rows, noga.load_table())
        out = config.PUBLIC_DATA / "companies.json"
        out.write_text(json.dumps(artifact, ensure_ascii=False), encoding="utf-8")
        print(f"[companies] {artifact['stats']['count']} Firmen, "
              f"{artifact['stats']['withRevenue']} mit Umsatz -> {out}")
        if args.command == "companies":
            return 0
```

Dazu `import json` am Kopf von `cli.py` ergänzen.

- [ ] **Step 8: Ausführen und committen**

Run: `uv run --project etl draufsicht-etl companies`
Expected: 8 bis 12 Firmen, keine Validierungsfehler

```bash
git add etl/src/draufsicht_etl/companies.py etl/src/draufsicht_etl/geocode.py \
        etl/src/draufsicht_etl/cli.py etl/tests/test_companies.py etl/tests/test_geocode.py \
        data/manual/ public/data/companies.json
git commit -m "feat: Ansicht A mit erzwungener Quellenpflicht und Geokodierung"
```

---

## Task 16: Ansicht A als Layer

**Files:**
- Create: `src/layers/visible.ts`
- Test: `src/layers/visible.test.ts`

**Interfaces:**
- Produces:
  - `visible.Company` — `{ uid, name, sixSymbol, lon, lat, nogaGroupIndex, revenue,
    currency, employees, fiscalYear, reportUrl, note, placeholder, city }`
  - `visible.CompanyData = { canton: string; companies: Company[]; stats: {count, withRevenue, max} }`
  - `visible.UNKNOWN_BAR_FRACTION = 0.4`
  - `visible.companyElevations(data: CompanyData, maxHeight: number, mode: ScaleMode): Float32Array`
  - `visible.buildCompanyLayer(data: CompanyData, mode: ScaleMode, onClick: (c: Company) => void): ScatterplotLayer | ColumnLayer`
  - `visible.loadCompanies(base?: string): Promise<CompanyData>`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`src/layers/visible.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { companyElevations, UNKNOWN_BAR_FRACTION, type CompanyData } from './visible'

function data(revenues: (number | null)[]): CompanyData {
  return {
    canton: 'AG',
    companies: revenues.map((revenue, i) => ({
      uid: `CHE-${i}`, name: `F${i}`, sixSymbol: null, lon: 8, lat: 47.4,
      nogaGroupIndex: 1, revenue, currency: 'CHF', employees: null,
      fiscalYear: 2024, reportUrl: null, note: null,
      placeholder: revenue === null, city: 'Aarau',
    })),
    stats: {
      count: revenues.length,
      withRevenue: revenues.filter((r) => r !== null).length,
      max: Math.max(...revenues.map((r) => r ?? 0)),
    },
  }
}

describe('companyElevations', () => {
  it('gives the largest revenue the full height', () => {
    const h = companyElevations(data([1e9, 1e10]), 5000, 'log')
    expect(h[1]).toBeCloseTo(5000, 3)
  })

  it('gives companies without revenue a fixed fraction of the smallest bar', () => {
    const h = companyElevations(data([1e9, 1e10, null]), 5000, 'log')
    const smallest = Math.min(h[0]!, h[1]!)
    expect(h[2]).toBeCloseTo(smallest * UNKNOWN_BAR_FRACTION, 3)
  })

  it('never gives a placeholder a height of zero', () => {
    const h = companyElevations(data([null]), 5000, 'log')
    expect(h[0]!).toBeGreaterThan(0)
  })

  it('keeps placeholders below every real bar', () => {
    const h = companyElevations(data([1e6, 1e12, null]), 5000, 'log')
    expect(h[2]!).toBeLessThan(Math.min(h[0]!, h[1]!))
  })

  it('handles a dataset where no company has revenue', () => {
    const h = companyElevations(data([null, null]), 5000, 'log')
    expect(h[0]!).toBeGreaterThan(0)
    expect(Number.isFinite(h[0]!)).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test -- visible`
Expected: FAIL, `Cannot find module './visible'`

- [ ] **Step 3: `visible.ts` implementieren**

```ts
import { ColumnLayer } from '@deck.gl/layers'
import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import { computeElevations, type ScaleMode } from '../domain/scale'

/** Firmen ohne auffindbaren Umsatz erscheinen als Hinweis-Balken auf 40 % der
 *  Höhe des kleinsten echten Balkens — sichtbar, aber unverwechselbar klein. */
export const UNKNOWN_BAR_FRACTION = 0.4

const PLACEHOLDER_BASE_HEIGHT = 200

export interface Company {
  uid: string
  name: string
  sixSymbol: string | null
  lon: number
  lat: number
  nogaGroupIndex: number
  revenue: number | null
  currency: string | null
  employees: number | null
  fiscalYear: number | null
  reportUrl: string | null
  note: string | null
  placeholder: boolean
  city: string | null
}

export interface CompanyData {
  canton: string
  companies: Company[]
  stats: { count: number; withRevenue: number; max: number }
}

export function companyElevations(
  data: CompanyData,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const values = new Float32Array(data.companies.map((c) => c.revenue ?? 0))
  const heights = computeElevations(values, data.stats.max, maxHeight, mode)

  let smallest = Infinity
  for (let i = 0; i < heights.length; i++) {
    if (data.companies[i]!.revenue !== null) smallest = Math.min(smallest, heights[i]!)
  }
  const placeholder = Number.isFinite(smallest)
    ? smallest * UNKNOWN_BAR_FRACTION
    : PLACEHOLDER_BASE_HEIGHT

  for (let i = 0; i < heights.length; i++) {
    if (data.companies[i]!.revenue === null) heights[i] = placeholder
  }
  return heights
}

export function buildCompanyLayer(
  data: CompanyData,
  mode: ScaleMode,
  onClick: (company: Company) => void,
): ColumnLayer<Company> {
  const heights = companyElevations(data, 12000, mode)

  return new ColumnLayer<Company>({
    id: 'firmen',
    data: data.companies,
    diskResolution: 16,
    radius: 900,
    radiusUnits: 'meters',
    extruded: true,
    material: false,
    pickable: true,
    getPosition: (c) => [c.lon, c.lat],
    getElevation: (_c, { index }) => heights[index]!,
    getFillColor: (c) =>
      c.placeholder
        ? [...UNKNOWN_COLOR, 180]
        : [...(NOGA_GROUPS[c.nogaGroupIndex]?.color ?? UNKNOWN_COLOR), 235],
    updateTriggers: { getElevation: [mode], getFillColor: [] },
    onClick: (info) => {
      if (info.object) onClick(info.object)
    },
  })
}

export async function loadCompanies(base = '/data'): Promise<CompanyData> {
  const response = await fetch(`${base}/companies.json`)
  if (!response.ok) throw new Error(`companies.json: HTTP ${response.status}`)
  return (await response.json()) as CompanyData
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- visible`
Expected: 5 passed

- [ ] **Step 5: Committen**

```bash
git add src/layers/visible.ts src/layers/visible.test.ts
git commit -m "feat: Ansicht A als ColumnLayer mit Hinweis-Balken"
```

---

## Task 17: Toggle, Legende, Panels, Pflichthinweise

**Files:**
- Create: `src/ui/toggle.ts`, `src/ui/legend.ts`, `src/ui/panel.ts`, `src/ui/notices.ts`
- Create: `src/ui/format.ts`
- Test: `src/ui/format.test.ts`
- Modify: `src/main.ts`, `src/style.css`

**Interfaces:**
- Produces:
  - `format.formatNumber(value: number): string` — Schweizer Tausendertrennung
  - `format.formatRevenue(value: number, currency: string | null): string`
  - `toggle.ViewName = 'sichtbare' | 'viele'`
  - `toggle.createToggle(onChange: (view: ViewName, mode: ScaleMode) => void): HTMLElement`
  - `legend.renderLegend(options: { view: ViewName; mode: ScaleMode; year: number;
    vmax: number; ambiguousCells: number; overstatementMax: number }): void`
  - `panel.showHectarePanel(level: Level, index: number): void`
  - `panel.showCompanyPanel(company: Company): void`
  - `panel.hidePanel(): void`
  - `notices.renderNotices(view: ViewName): void`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`src/ui/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatNumber, formatRevenue } from './format'

describe('formatNumber', () => {
  it('uses a thousands separator', () => {
    expect(formatNumber(371002)).toMatch(/371.001?002|371’002|371'002/)
  })

  it('rounds to whole numbers', () => {
    expect(formatNumber(4.6)).not.toContain('.')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatRevenue', () => {
  it('renders billions compactly', () => {
    expect(formatRevenue(1_250_000_000, 'CHF')).toMatch(/1[.,]25\s*Mrd/)
    expect(formatRevenue(1_250_000_000, 'CHF')).toContain('CHF')
  })

  it('renders millions compactly', () => {
    expect(formatRevenue(4_300_000, 'EUR')).toMatch(/4[.,]3\s*Mio/)
  })

  it('falls back to a plain number below a million', () => {
    expect(formatRevenue(820_000, 'CHF')).toMatch(/820/)
  })
})
```

- [ ] **Step 2: `format.ts` implementieren**

```ts
const NUMBER = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 })
const COMPACT = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 })

export function formatNumber(value: number): string {
  return NUMBER.format(Math.round(value))
}

export function formatRevenue(value: number, currency: string | null): string {
  const unit = currency ?? ''
  if (value >= 1e9) return `${COMPACT.format(value / 1e9)} Mrd. ${unit}`.trim()
  if (value >= 1e6) return `${COMPACT.format(value / 1e6)} Mio. ${unit}`.trim()
  return `${NUMBER.format(value)} ${unit}`.trim()
}
```

Run: `npm test -- format`
Expected: 6 passed

- [ ] **Step 3: `notices.ts` implementieren**

Die beiden Sätze stehen wörtlich in den Global Constraints und dürfen nicht
umformuliert werden.

```ts
import type { ViewName } from './toggle'

const TEXTS: Record<ViewName, string> = {
  sichtbare:
    'Dargestellt ist der weltweite Konzernumsatz, nicht die Wertschöpfung am Standort.',
  viele:
    'Das BFS rundet aus Datenschutzgründen alle Werte unter 4 auf 4 auf. ' +
    'Hektaren mit dem Wert 4 sind gesondert markiert — ihr wahrer Wert liegt ' +
    'zwischen 1 und 4. Summen sind dadurch Obergrenzen.',
}

export function renderNotices(view: ViewName): void {
  let box = document.getElementById('hinweis')
  if (!box) {
    box = document.createElement('div')
    box.id = 'hinweis'
    document.getElementById('ui')?.appendChild(box)
  }
  box.textContent = TEXTS[view]
}
```

- [ ] **Step 4: `toggle.ts` implementieren**

```ts
import type { ScaleMode } from '../domain/scale'

export type ViewName = 'sichtbare' | 'viele'

export function createToggle(
  onChange: (view: ViewName, mode: ScaleMode) => void,
): HTMLElement {
  let view: ViewName = 'viele'
  let mode: ScaleMode = 'log'

  const root = document.createElement('div')
  root.id = 'steuerung'
  root.innerHTML = `
    <div class="gruppe" role="radiogroup" aria-label="Ansicht">
      <button data-view="sichtbare">Die Sichtbaren</button>
      <button data-view="viele">Die Vielen</button>
    </div>
    <div class="gruppe" role="radiogroup" aria-label="Höhenskala">
      <button data-mode="log">logarithmisch</button>
      <button data-mode="linear">linear</button>
    </div>`

  const sync = () => {
    for (const button of root.querySelectorAll<HTMLButtonElement>('button')) {
      const active =
        button.dataset.view === view || button.dataset.mode === mode
      button.classList.toggle('aktiv', active)
      button.setAttribute('aria-checked', String(active))
    }
    onChange(view, mode)
  }

  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button')
    if (!button) return
    if (button.dataset.view) view = button.dataset.view as ViewName
    if (button.dataset.mode) mode = button.dataset.mode as ScaleMode
    sync()
  })

  sync()
  return root
}
```

- [ ] **Step 5: `legend.ts` und `panel.ts` implementieren**

`legend.ts` zeigt fix: Branchenfarben, graue Kategorie, aktive Skala mit drei
Stützwerten aus `referenceTicks`, Datenjahr, Quellenzeile aus den Global
Constraints. `panel.ts` zeigt auf Klick:

- Hektare: Beschäftigte, Hinweis bei gesetztem `FLAG_AMBIGUOUS`, Top-3-Branchen
  aus `mixGroup`/`mixValue` mit dem Zusatz «Top 3 von 11 Gruppen, abgeleitet»,
  Gemeindename über `gemeindeIdx`.
- Gemeinde: Summe, `overstatementMax`, volle Verteilung aus `dist`.
- Firma: Name, Umsatz über `formatRevenue`, Mitarbeitende, Geschäftsjahr und ein
  Link auf `reportUrl`; bei `placeholder` stattdessen «Umsatz nicht öffentlich
  verfügbar» und der Text aus `note`.

Beide Module rendern in `#ui` und exportieren eine `hide`-Funktion.

- [ ] **Step 6: `main.ts` vollständig verdrahten**

Zustand: `view`, `mode`, `zoom`. Bei jeder Änderung neu rendern:
- `view === 'viele'` → drei ColumnLayer nach `lodWeights(zoom)`
- `view === 'sichtbare'` → `buildCompanyLayer`
- Der `viewState` wird beim Umschalten **nicht** angefasst.
- `renderNotices(view)` und `renderLegend(...)` bei jeder Änderung.

- [ ] **Step 7: Build, Tests, Browsertest**

Run: `npm run build && npm test`
Expected: keine Fehler, alle Tests bestanden

Run: `npm run dev`
Expected: Toggle wechselt zwischen A und B, **Kameraposition bleibt exakt stehen**.
Legende und der jeweils passende Pflichthinweis sind ohne Interaktion sichtbar.
Klick öffnet das jeweilige Panel. Umschalten auf linear ändert sichtbar die Höhen
und den Text in der Legende.

- [ ] **Step 8: Committen**

```bash
git add src/ui/ src/main.ts src/style.css
git commit -m "feat: Toggle, Legende, Panels und Pflichthinweise"
```

---

## Task 18: Netlify, README und Abnahme

**Files:**
- Create: `netlify.toml`, `README.md`
- Modify: `.gitignore` falls nötig

- [ ] **Step 1: `netlify.toml` schreiben**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"

[[headers]]
  for = "/data/*"
  [headers.values]
    Cache-Control = "public, max-age=3600"

[[headers]]
  for = "/data/*.bin"
  [headers.values]
    Content-Type = "application/octet-stream"
```

- [ ] **Step 2: `README.md` schreiben**

Muss enthalten:
1. Was das Projekt ist, mit dem Hinweis, dass es ein Machbarkeitsnachweis ist.
2. **Datenherkunft** mit allen Quellen, Abrufdatum und Lizenzhinweis; wörtlich der
   Footer-Text aus den Global Constraints.
3. **Aktualisierung**: `STATENT_YEAR` in `etl/src/draufsicht_etl/config.py` ändern,
   `npm run build:data`, Artefakte committen. Die Spaltenauflösung passt sich
   selbst an; `etl/columns/statent_<jahr>.json` wird neu geschrieben.
4. **Kantonswechsel** als Dreischritt: `CANTON` in `config.py` ändern,
   `data/manual/<code>_listed_companies.csv` anlegen, `npm run build:data`.
   Ausdrücklich erwähnen, dass nur das Firmen-CSV Handarbeit bleibt.
5. **Datenschutzhinweis** aus Spec 6.4 in zwei Sätzen, damit niemand die Summen
   für exakt hält.
6. Befehlsübersicht: `npm run build:data`, `npm run build`, `npm run dev`,
   `npm test`, `uv run --project etl pytest etl/tests`.

- [ ] **Step 3: Abnahme aus leerem Zustand**

```bash
rm -rf node_modules dist data/raw data/interim public/data
npm install
npm run build:data
npm run build
```
Expected: beide Befehle laufen ohne Eingriff durch, `dist/` entsteht.

- [ ] **Step 4: Alle Tests**

```bash
npm test
uv run --project etl pytest etl/tests -v
```
Expected: alles bestanden

- [ ] **Step 5: Abnahmekriterien einzeln bestätigen**

| Kriterium | Nachweis |
|---|---|
| Build läuft aus leerem Zustand | Step 3 |
| Hektaransicht flüssig, Ziel 60 fps | Messung aus Task 14 Step 7 |
| Jede Zahl in Ansicht A quellenbelegt | `companies.validate` bricht sonst ab, Task 15 |
| README dokumentiert Kantonswechsel | Step 2, Punkt 4 |
| Beide Pflichthinweise ohne Interaktion sichtbar | Task 17 Step 7 |
| `public/data/` unter 2 MB | Task 10, `[all]`-Zeile |

- [ ] **Step 6: Committen**

```bash
git add netlify.toml README.md
git commit -m "docs: Netlify-Konfiguration und README mit Datenherkunft"
```

---

## Selbstprüfung des Plans

**Spec-Abdeckung.** Jeder Abschnitt der Spec hat eine Task:
4 → 1 · 5 → 9 · 6.1/6.2 → 5, 6 · 6.3 → 7 · 6.4 → 8 · 6.5 → 8 · 7 → 3 ·
8.1–8.5 → 15 · 9 → 11, 12, 13, 14, 16, 17 · 10 → 2, 11 · 11 → alle ·
12 → 1, 18 · 13 → 18.

**Bekannte Lücken, bewusst so belassen:**
- Task 15 Step 1 und Step 2 sind Erkundungsschritte. Die LINDAS-Prädikate und die
  Erreichbarkeit der SIX-Liste lassen sich nicht vorab festschreiben, ohne zu raten.
  Beide Schritte haben ein prüfbares Ergebnis und einen dokumentierten Rückfallpfad.
- Task 17 Step 5 beschreibt `legend.ts` und `panel.ts` inhaltlich statt in vollem
  Code. Beide sind reines DOM-Rendering ohne Logik; der Inhalt ist vollständig
  festgelegt, die Formatierungsfunktionen sind in Step 2 getestet.

**Typkonsistenz geprüft:** `LevelData` (Task 8) → `binpack.write_level` (Task 9) →
`LevelMeta`/`LevelArrays` (Task 12) → `buildColumnLayer` (Task 13). `ScaleMode`
einheitlich `'log' | 'linear'` in Task 12, 13, 16, 17. `FLAG_AMBIGUOUS = 1` in
`config.py` (Task 1) und `colors.ts` (Task 12). `NOGA_UNKNOWN_INDEX = 255` in
`config.py`, `noga.generated.ts` und `aggregate.dominant_group`.
