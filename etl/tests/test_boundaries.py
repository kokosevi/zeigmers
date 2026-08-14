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
    #
    # Seit Phase 1 (alle 26 Kantone) baut das ETL diese Datei für jeden
    # Kanton, nicht mehr nur für `config.CANTON` — `geojson_path(code)` nimmt
    # den Code deshalb explizit entgegen; ohne Argument bleibt der
    # konfigurierte Kanton der Standard (Rückwärtskompatibilität).
    monkeypatch.setitem(config.CANTON, "code", "ZH")
    assert boundaries.geojson_path() == config.PUBLIC_DATA / "zh_boundaries.geojson"
    assert boundaries.geojson_path("BE") == config.PUBLIC_DATA / "be_boundaries.geojson"
    # Der explizite Code sticht die Konfiguration, egal was `config.CANTON` sagt.
    assert boundaries.geojson_path("GE") == config.PUBLIC_DATA / "ge_boundaries.geojson"


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
            "einwohnerzahl": [22710, 40000],
            "objektart": ["Gemeindegebiet", "Gemeindegebiet"],
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
    assert list(b.municipalities["einwohnerzahl"]) == [22710]
    assert "1 Zeilen ohne Kantonsnummer verworfen" in capsys.readouterr().out


def test_build_normalises_a_missing_einwohnerzahl_to_zero(tmp_path):
    # Change 2 (Beschäftigte je Einwohner): der Objektkatalog garantiert
    # EINWOHNERZAHL nicht für jede Zeile (Exklaven-Teilpolygone führen laut
    # Produktinformation keinen Wert). build() darf daran nicht scheitern und
    # darf auch keinen NaN durchreichen, der später in `aggregate.py`/
    # `ui/panel.ts` eine Division-durch-0 oder eine NaN-Kennzahl ergäbe.
    #
    # Eigener Dateiname (nicht "boundaries.gpkg" wie oben): `boundaries._extract`
    # cached das entpackte .gpkg unter seinem Namen in `data/interim/
    # swissboundaries/` — real, nicht pro Test isoliert. Ein wiederverwendeter
    # Name würde hier den Inhalt des vorigen Tests laden statt den eigenen.
    gpkg_path = tmp_path / "boundaries_nan_population.gpkg"
    gpd.GeoDataFrame(
        {
            "bfs_nummer": [4001],
            "name": ["Ohnebevölkerung"],
            "kantonsnummer": [19.0],
            "einwohnerzahl": [float("nan")],
            "objektart": ["Gemeindegebiet"],
            "geometry": [Polygon([(0, 0), (1, 0), (1, 1)])],
        },
        crs="EPSG:2056",
    ).to_file(gpkg_path, layer="tlm_hoheitsgebiet", driver="GPKG")

    zip_path = tmp_path / "boundaries_nan_population.gpkg.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(gpkg_path, arcname=gpkg_path.name)

    b = boundaries.build(zip_path, 19)

    assert list(b.municipalities["einwohnerzahl"]) == [0]


def _multi_canton_gpkg(tmp_path, extra_rows=None):
    """Zwei Kantone (19=Aargau, 1 Gemeinde; 1=Zürich, 1 Gemeinde) plus optional
    zusätzliche Zeilen (z.B. eine Seefläche) — Grundlage für die
    `build_all()`-Tests unten."""
    rows = {
        "bfs_nummer": [4001, 261],
        "name": ["Aarau", "Zürich"],
        "kantonsnummer": [19.0, 1.0],
        "einwohnerzahl": [22710, 434008],
        "objektart": ["Gemeindegebiet", "Gemeindegebiet"],
        "geometry": [
            Polygon([(0, 0), (1, 0), (1, 1)]),
            Polygon([(100, 100), (101, 100), (101, 101)]),
        ],
    }
    if extra_rows:
        for key, values in extra_rows.items():
            rows[key] = rows[key] + values

    gpkg_path = tmp_path / "multi_canton.gpkg"
    gpd.GeoDataFrame(rows, crs="EPSG:2056").to_file(
        gpkg_path, layer="tlm_hoheitsgebiet", driver="GPKG"
    )
    zip_path = tmp_path / "multi_canton.gpkg.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(gpkg_path, arcname=gpkg_path.name)
    return zip_path


def test_build_all_splits_municipalities_by_canton(tmp_path):
    zip_path = _multi_canton_gpkg(tmp_path)
    result = boundaries.build_all(zip_path)

    assert set(result) == {19, 1}
    assert list(result[19].municipalities["bfs_nr"]) == [4001]
    assert list(result[1].municipalities["bfs_nr"]) == [261]


def test_build_all_excludes_lake_and_kommunanz_pseudo_units(tmp_path):
    # Regressionstest für den Fund im ETL-Report: `tlm_hoheitsgebiet` führt
    # neben echten Gemeinden auch Seeflächen ("Kantonsgebiet", z.B.
    # "Zürichsee") und geteilte Gebiete ("Kommunanz") mit sehr hohen
    # `bfs_nummer`-Werten. Ungefiltert sprengen die den von
    # `statent.canton_reference()` aus `bfs_nr` min/max abgeleiteten
    # Nummernbereich für genau die Kantone, die eine solche Zeile führen.
    zip_path = _multi_canton_gpkg(
        tmp_path,
        extra_rows={
            "bfs_nummer": [9051, 5391],
            "name": ["Zürichsee (ZH)", "Comunanza Cadenazzo/Monteceneri"],
            "kantonsnummer": [1.0, 21.0],
            "einwohnerzahl": [0, 0],
            "objektart": ["Kantonsgebiet", "Kommunanz"],
            "geometry": [
                Polygon([(200, 200), (201, 200), (201, 201)]),
                Polygon([(300, 300), (301, 300), (301, 301)]),
            ],
        },
    )
    result = boundaries.build_all(zip_path)

    assert set(result) == {19, 1}, "Kanton 21 (Tessin) hat hier nur eine Kommunanz-Zeile"
    assert list(result[1].municipalities["bfs_nr"]) == [261], (
        "Zürichsee (bfs_nr 9051, Kantonsgebiet) darf nicht als Gemeinde erscheinen"
    )


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


@pytest.mark.integration
def test_build_all_matches_build_for_aargau(boundaries_real, all_bounds_real):
    # Die stärkste verfügbare Prüfung, dass die Generalisierung auf 26 Kantone
    # den Aargau-Sonderfall nicht verändert hat: `build_all()`s Aargau-Eintrag
    # muss geometrisch und tabellarisch mit dem eigenständigen `build()`-Aufruf
    # übereinstimmen, den `boundaries_real` verwendet.
    via_build_all = all_bounds_real[config.CANTON["bfs_nr"]]
    assert list(via_build_all.municipalities["bfs_nr"]) == list(
        boundaries_real.municipalities["bfs_nr"]
    )
    assert list(via_build_all.municipalities["name"]) == list(
        boundaries_real.municipalities["name"]
    )
    assert list(via_build_all.municipalities["einwohnerzahl"]) == list(
        boundaries_real.municipalities["einwohnerzahl"]
    )
    assert via_build_all.municipalities.geometry.geom_equals_exact(
        boundaries_real.municipalities.geometry, tolerance=0
    ).all()
    assert via_build_all.canton_lv95.equals_exact(boundaries_real.canton_lv95, tolerance=0)


@pytest.mark.integration
def test_build_all_covers_all_26_cantons_with_no_foreign_municipality_numbers(all_bounds_real):
    # Verifiziert, statt anzunehmen (siehe ETL-Report): `statent.canton_reference()`
    # leitet den Gemeindenummern-Bereich eines Kantons aus `min`/`max` seiner
    # eigenen `bfs_nr`-Werte her (statt einer Mitgliedschaftsmenge, wegen
    # Fusionen zwischen STATENT- und Geometriejahrgang — siehe Docstring dort).
    # Das setzt voraus, dass dieser Bereich keine fremde Gemeinde einschliesst.
    # Genau das brach vor der Korrektur für ZH/BE/SG/TG/NE: `tlm_hoheitsgebiet`
    # führt für diese Kantone je eine Seefläche mit `bfs_nummer` im 9000er-Block
    # (Objektart "Kantonsgebiet", z.B. Zürichsee), die den abgeleiteten Bereich
    # bis dorthin aufspannte und dabei praktisch jeden anderen Kanton mit
    # einschloss — behoben durch den `objektart == "Gemeindegebiet"`-Filter in
    # `_load_municipalities_raw()`.
    assert set(all_bounds_real) == set(range(1, 27))

    all_bfs_nr = {
        int(bfs_nr): canton_bfs_nr
        for canton_bfs_nr, b in all_bounds_real.items()
        for bfs_nr in b.municipalities["bfs_nr"]
    }

    offenders = []
    for canton_bfs_nr, b in all_bounds_real.items():
        own = set(b.municipalities["bfs_nr"].astype(int))
        low, high = min(own), max(own)
        foreign = {
            bfs_nr: owner
            for bfs_nr, owner in all_bfs_nr.items()
            if low <= bfs_nr <= high and owner != canton_bfs_nr
        }
        if foreign:
            offenders.append((canton_bfs_nr, low, high, foreign))

    assert not offenders, offenders


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
