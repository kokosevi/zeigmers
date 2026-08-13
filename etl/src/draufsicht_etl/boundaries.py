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

    # Der Layer enthält auch Enklaven ohne Schweizer Kanton (FL-Gemeinden,
    # Büsingen am Hochrhein, Campione d'Italia) mit leerer Kantonsnummer.
    # fillna(-1) verhindert den Absturz von astype(int) auf NaN und stellt
    # sicher, dass diese Zeilen nie auf einen echten Kanton (1-26) matchen.
    gdf = gdf[gdf[canton_col].fillna(-1).astype(int) == canton_bfs_nr].copy()
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
                "-simplify", "visvalingam", f"{percent}%", "keep-shapes",
                "-o", str(out), "precision=0.00001", "format=geojson",
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
