import json
import zipfile

import geopandas as gpd
import pytest
from shapely.geometry import MultiPolygon, Polygon

from draufsicht_etl import boundaries, config


def test_geojson_path_derives_from_configured_canton(monkeypatch):
    # Regressionstest fürs Critical Finding C1 des Abschluss-Reviews: der
    # Boundaries-Dateiname war zweimal in cli.py hartcodiert ("ag_..."), ein
    # Kantonswechsel hätte die Grenzen-Datei stillschweigend am falschen Namen
    # vorbeigeschrieben. `geojson_path()` ist jetzt die einzige Stelle, die den
    # Namen kennt; cli.py ruft nur noch sie auf.
    monkeypatch.setitem(config.CANTON, "code", "ZH")
    assert boundaries.geojson_path() == config.PUBLIC_DATA / "zh_boundaries.geojson"


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
    out = boundaries.write_geojson(boundaries_real.municipalities, tmp_path / "b.geojson")
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


def test_cantons_geojson_path_is_canton_independent(monkeypatch):
    # Anders als geojson_path() (Regressionstest oben, C1) muss dieser Pfad
    # NICHT von config.CANTON abhängen: die Basiskarte zeigt immer alle 26
    # Kantone. Ein Kantonswechsel darf den Dateinamen nicht verändern, sonst
    # bräuchte jeder Kantonswechsel eine neue Kopie derselben CH-weiten Datei.
    monkeypatch.setitem(config.CANTON, "code", "ZH")
    assert boundaries.cantons_geojson_path() == config.PUBLIC_DATA / "ch_kantone.geojson"
    monkeypatch.setitem(config.CANTON, "code", "AG")
    assert boundaries.cantons_geojson_path() == config.PUBLIC_DATA / "ch_kantone.geojson"


@pytest.mark.integration
def test_build_cantons_produces_26_cantons_including_aargau(cantons_real):
    assert len(cantons_real) == 26
    assert set(cantons_real["bfs_nr"]) == set(range(1, 27))
    assert config.CANTON["bfs_nr"] in set(cantons_real["bfs_nr"])
    assert cantons_real["name"].str.len().min() > 0
    aargau = cantons_real[cantons_real["bfs_nr"] == config.CANTON["bfs_nr"]]
    assert aargau["name"].iloc[0] == config.CANTON["name"]


@pytest.mark.integration
def test_write_geojson_cantons_is_wgs84_and_small(cantons_real, tmp_path):
    out = boundaries.write_geojson(
        cantons_real, tmp_path / "kantone.geojson",
        simplify_percent=config.CANTON_SIMPLIFY_PERCENT,
        max_bytes=config.MAX_CANTONS_BYTES,
    )
    size = out.stat().st_size
    assert size < config.MAX_CANTONS_BYTES, f"{size} Bytes"

    data = json.loads(out.read_text(encoding="utf-8"))
    assert len(data["features"]) == 26
    for feature in data["features"]:
        assert set(feature["properties"]) >= {"bfs_nr", "name"}


# --- round_municipality_corners (Task 1: leicht abgerundete Ecken) --------
#
# Koordinaten unten sind absichtlich in "Metern" grösser als die Testradien
# gewählt (Quadrate/Sechsecke mit ~100-1000 m Kantenlänge), damit `buffer()`
# dieselbe Grössenordnung wie die echten LV95-Koordinaten aus `build()` sieht
# — bei viel zu kleinen Testgeometrien (z.B. den 1x1-Dreiecken weiter oben,
# die nur bfs_nr/name prüfen) würde jede Rundung sofort den
# "zu-schmal"-Fallback treffen und nichts über die eigentliche Rundung sagen.


def test_round_municipality_corners_smooths_a_sharp_corner():
    # Quadrat mit einer weit auskragenden Spitze an einer Ecke — die Spitze
    # ist der schärfste Punkt und muss nach dem Runden verschwinden (das
    # Ergebnis darf die Originalkoordinate der Spitze nicht mehr enthalten).
    spike = Polygon([(0, 0), (1000, 0), (1000, 1000), (500, 1000), (500, 1300), (0, 1000)])
    gdf = gpd.GeoDataFrame({"bfs_nr": [1], "name": ["Spitzhausen"]}, geometry=[spike], crs="EPSG:2056")

    rounded = boundaries.round_municipality_corners(gdf, radius_m=50)
    result = rounded.geometry.iloc[0]

    assert result.is_valid
    assert result.geom_type == "Polygon"
    coords = list(result.exterior.coords)
    assert (500, 1300) not in coords, "Spitze sollte weggerundet sein"
    # Rundung fügt Bogenpunkte hinzu statt sie zu entfernen.
    assert len(coords) > len(list(spike.exterior.coords))
    # Fläche schrumpft durch die Rundung, aber nur leicht.
    assert 0.9 * spike.area < result.area < spike.area


def test_round_municipality_corners_keeps_a_too_small_polygon_unchanged():
    # Ein Polygon deutlich schmaler als der Rundungsradius (100x100m bei
    # radius_m=100) verschwindet beim ersten Erodieren vollständig — der
    # Fallback muss die Originalgeometrie unverändert zurückgeben, nicht eine
    # leere oder verstümmelte Fläche (siehe Exklaven-Anforderung).
    tiny = Polygon([(0, 0), (100, 0), (100, 100), (0, 100)])
    gdf = gpd.GeoDataFrame({"bfs_nr": [1], "name": ["Winzlingen"]}, geometry=[tiny], crs="EPSG:2056")

    rounded = boundaries.round_municipality_corners(gdf, radius_m=100)
    result = rounded.geometry.iloc[0]

    assert not result.is_empty
    assert result.equals_exact(tiny, tolerance=1e-9)


def test_round_municipality_corners_rounds_multipolygon_parts_independently():
    # Exklaven-Fall (Baden/Würenlos/Olsberg/Zurzach): ein grosser Hauptteil
    # und ein winziger Exklaven-Teil, kleiner als der Radius. Der grosse Teil
    # wird gerundet, der winzige bleibt unverändert erhalten statt zu
    # verschwinden — beide Teile müssen im Ergebnis-`MultiPolygon` überleben.
    main_part = Polygon([(0, 0), (1000, 0), (1000, 1000), (500, 1000), (500, 1300), (0, 1000)])
    exclave = Polygon([(5000, 5000), (5080, 5000), (5080, 5080), (5000, 5080)])
    multi = MultiPolygon([main_part, exclave])
    gdf = gpd.GeoDataFrame({"bfs_nr": [1], "name": ["Exklaventikon"]}, geometry=[multi], crs="EPSG:2056")

    rounded = boundaries.round_municipality_corners(gdf, radius_m=50)
    result = rounded.geometry.iloc[0]

    assert result.geom_type == "MultiPolygon"
    assert len(result.geoms) == 2
    assert all(part.is_valid and not part.is_empty for part in result.geoms)
    areas = sorted((part.area for part in result.geoms))
    # Der winzige Exklaven-Teil (6'400 m^2) bleibt praktisch unverändert...
    assert areas[0] == pytest.approx(exclave.area, rel=1e-6)
    # ...der grosse Teil verliert durch die Rundung sichtbar, aber wenig Fläche.
    assert 0.9 * main_part.area < areas[1] < main_part.area


@pytest.mark.integration
def test_round_municipality_corners_preserves_all_gemeinden_and_exclaves(boundaries_real):
    # Regressionstest gegen echte Daten (Task 1): keine Gemeinde darf durch
    # die Rundung verschwinden oder ungültig werden, und alle vier bekannten
    # Exklaven-Gemeinden müssen ihre Teilanzahl behalten.
    gdf = boundaries_real.municipalities
    rounded = boundaries.round_municipality_corners(gdf)

    assert len(rounded) == len(gdf)
    assert rounded.geometry.is_valid.all()
    assert not rounded.geometry.is_empty.any()

    for name in ("Baden", "Würenlos", "Olsberg", "Zurzach"):
        before = gdf.loc[gdf["name"] == name, "geometry"].iloc[0]
        after = rounded.loc[rounded["name"] == name, "geometry"].iloc[0]
        assert len(after.geoms) == len(before.geoms), name

    # Flächenverlust bleibt moderat — keine Gemeinde schrumpft dramatisch.
    before_area = gdf.geometry.area
    after_area = rounded.geometry.area
    pct_change = (after_area - before_area) / before_area * 100
    assert pct_change.min() > -10.0, pct_change.min()
    assert pct_change.max() < 1.0, pct_change.max()


@pytest.mark.integration
def test_write_geojson_of_rounded_municipalities_stays_within_budget(boundaries_real, tmp_path):
    # Die Rundung fügt Bogenpunkte hinzu (siehe `config.MAX_BOUNDARIES_BYTES`-
    # Kommentar) — dieser Test ist der direkte Wächter gegen eine stille
    # Budget-Überschreitung, falls ein künftiger Jahrgang mehr/komplexere
    # Gemeinden liefert.
    rounded = boundaries.round_municipality_corners(boundaries_real.municipalities)
    out = boundaries.write_geojson(rounded, tmp_path / "b.geojson")
    size = out.stat().st_size
    assert size < config.MAX_BOUNDARIES_BYTES, f"{size} Bytes"

    data = json.loads(out.read_text(encoding="utf-8"))
    assert len(data["features"]) == len(boundaries_real.municipalities)
