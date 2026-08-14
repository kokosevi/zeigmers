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
_CANTON_LAYER_NEEDLES = ["kantonsgebiet"]
_BFS_FIELD_NEEDLES = ["bfs_nummer", "bfs_nr", "gemeindenummer"]
_NAME_FIELD_NEEDLES = ["name", "gemeindename"]
_CANTON_FIELD_NEEDLES = ["kantonsnummer", "kanton_nr", "kantonsnr"]


@dataclass
class Boundaries:
    canton_lv95: BaseGeometry
    municipalities: gpd.GeoDataFrame


def geojson_path() -> Path:
    """Pfad zum Gemeindegrenzen-Artefakt des aktuell konfigurierten Kantons.

    Spiegelt `companies.csv_path()`: der Dateiname folgt `config.CANTON['code']`,
    ein Kantonswechsel braucht hier keine Codeänderung.
    """
    return config.PUBLIC_DATA / f"{config.CANTON['code'].lower()}_boundaries.geojson"


def cantons_geojson_path() -> Path:
    """Pfad zum gesamtschweizerischen Kantonsgrenzen-Artefakt.

    Anders als `geojson_path()` hängt dieser Name NICHT von `config.CANTON` ab:
    die selbstgezeichnete Basiskarte (Change 3) zeigt immer alle 26 Kantone,
    nicht nur den konfigurierten — ein Kantonswechsel ändert an dieser Datei
    nichts, nur daran, welcher der 26 hervorgehoben wird (siehe `meta.json`,
    gelesen im Frontend).
    """
    return config.PUBLIC_DATA / "ch_kantone.geojson"


def _extract(gpkg_zip: Path) -> Path:
    target = config.DATA_INTERIM / "swissboundaries"
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(gpkg_zip) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".gpkg")]
        if not names:
            raise LookupError(f"Kein .gpkg in {gpkg_zip}; enthalten: {zf.namelist()[:20]}")
        name = names[0]
        dest = target / name
        # Municipality- und Cantons-Aufbereitung (build()/build_cantons()) extrahieren
        # beide aus demselben Zip; ohne diese Prüfung würde das ~74-MB-GeoPackage bei
        # jedem `draufsicht-etl all`-Lauf zweimal ausgepackt.
        if not dest.exists():
            zf.extract(name, target)
        return dest


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

    # Der Layer enthält auch Enklaven ohne Schweizer Kanton (FL-Gemeinden,
    # Büsingen am Hochrhein, Campione d'Italia) mit leerer Kantonsnummer.
    # Diese Zeilen werden verworfen statt sie mit einem Sentinel-Wert still
    # zu übergehen; der Verlust wird gezählt und gemeldet, damit ein künftiger
    # Jahrgang, der versehentlich echte Aargauer Gemeinden ausdünnt, auffällt.
    rows_before = len(gdf)
    gdf = gdf.dropna(subset=[canton_col])
    dropped = rows_before - len(gdf)
    if dropped:
        print(
            f"[boundaries] {dropped} Zeilen ohne Kantonsnummer verworfen "
            "(Ausland: FL, Büsingen, Campione)"
        )

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


def build_cantons(gpkg_zip: Path) -> gpd.GeoDataFrame:
    """Alle 26 Kantone aus `tlm_kantonsgebiet`, für die selbstgezeichnete
    Basiskarte (Change 3, ersetzt die bisherigen swisstopo-Vektorkacheln).

    Anders als `build()` gibt es hier keinen Kantonsfilter — die Basiskarte
    zeigt die ganze Schweiz, unabhängig vom konfigurierten Kanton. Der Layer
    führt jeden Kanton laut swisstopo bereits als eine Zeile (26 Features,
    keine Exklaven-Aufsplittung wie bei den Gemeinden); dissolved wird trotzdem
    nach `bfs_nr`/`name`, damit ein künftiger Jahrgang mit Exklaven denselben
    Code trifft wie `build()` es für Gemeinden tut.
    """
    gpkg = _extract(gpkg_zip)
    layer = find_layer(gpkg, _CANTON_LAYER_NEEDLES)
    gdf = gpd.read_file(gpkg, layer=layer)

    bfs_col = _find_column(list(gdf.columns), _CANTON_FIELD_NEEDLES)
    name_col = _find_column(list(gdf.columns), _NAME_FIELD_NEEDLES)

    gdf["geometry"] = gdf.geometry.force_2d()
    gdf = gdf.set_crs(config.SRC_LV95, allow_override=True)

    cantons = (
        gdf[[bfs_col, name_col, "geometry"]]
        .rename(columns={bfs_col: "bfs_nr", name_col: "name"})
        .dissolve(by=["bfs_nr", "name"], as_index=False)
        .astype({"bfs_nr": "int32"})
        .sort_values("bfs_nr")
        .reset_index(drop=True)
    )
    if len(cantons) != 26:
        raise ValueError(
            f"tlm_kantonsgebiet liefert {len(cantons)} Kantone nach Dissolve, "
            "erwartet 26 — Layer oder Feldauflösung prüfen."
        )
    return cantons


def write_geojson(
    gdf: gpd.GeoDataFrame,
    out: Path,
    *,
    simplify_percent: float = config.MUNICIPALITY_SIMPLIFY_PERCENT,
    max_bytes: int = config.MAX_BOUNDARIES_BYTES,
) -> Path:
    """Schreibt `gdf` (Spalten `bfs_nr`, `name`, `geometry` in LV95) als
    vereinfachtes WGS84-GeoJSON. Generisch über Gemeinde- und Kantonsstufe:
    beide brauchen nur diese drei Spalten und denselben Vereinfachungsschritt,
    nur Zieltoleranz und Byte-Budget unterscheiden sich (siehe `config.py`,
    `MUNICIPALITY_SIMPLIFY_PERCENT`/`CANTON_SIMPLIFY_PERCENT`).

    Vereinfacht wird mit mapshaper, nicht mit shapely: mapshaper baut zuerst
    Topologie auf und hält gemeinsame Kanten zusammen. Shapely vereinfacht jede
    Fläche einzeln und reisst dabei Lücken zwischen Nachbarn.
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = config.DATA_INTERIM / f"{out.stem}_wgs84.geojson"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_crs(config.DST_WGS84).to_file(tmp, driver="GeoJSON")

    for percent in (simplify_percent, simplify_percent / 2, simplify_percent / 4):
        subprocess.run(
            [
                "npx", "--no-install", "mapshaper", str(tmp),
                "-simplify", "visvalingam", f"{percent}%", "keep-shapes",
                "-o", str(out), "precision=0.00001", "format=geojson",
            ],
            check=True,
            cwd=config.ROOT,
        )
        if out.stat().st_size <= max_bytes:
            break
    else:
        raise ValueError(
            f"{out.name} bleibt über {max_bytes} Bytes "
            f"({out.stat().st_size}) — Toleranz weiter senken"
        )

    data = json.loads(out.read_text(encoding="utf-8"))
    for feature in data["features"]:
        props = feature["properties"]
        feature["properties"] = {"bfs_nr": int(props["bfs_nr"]), "name": props["name"]}
    out.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return out
