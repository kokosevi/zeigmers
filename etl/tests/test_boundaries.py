import json
import zipfile

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


def test_build_drops_rows_without_kantonsnummer(tmp_path, capsys):
    # swissBOUNDARIES3D fuehrt auch Gebiete ohne Schweizer Kanton (FL-Gemeinden,
    # Buesingen, Campione) mit leerer Kantonsnummer. build() muss diese Zeilen
    # verwerfen statt an ihnen abzustuerzen, und den Verlust melden.
    gpkg_path = tmp_path / "boundaries.gpkg"
    gpd.GeoDataFrame(
        {
            "bfs_nummer": [4001, 7001],
            "name": ["Aarau", "Vaduz"],
            "kantonsnummer": [19.0, float("nan")],
            "geometry": [
                Polygon([(0, 0), (1, 0), (1, 1)]),
                Polygon([(10, 10), (11, 10), (11, 11)]),
            ],
        },
        crs="EPSG:2056",
    ).to_file(gpkg_path, layer="tlm_hoheitsgebiet", driver="GPKG")

    zip_path = tmp_path / "boundaries.gpkg.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(gpkg_path, arcname=gpkg_path.name)

    b = boundaries.build(zip_path, 19)

    assert list(b.municipalities["bfs_nr"]) == [4001]
    assert list(b.municipalities["name"]) == ["Aarau"]
    assert "1 Zeilen ohne Kantonsnummer verworfen" in capsys.readouterr().out


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
