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
