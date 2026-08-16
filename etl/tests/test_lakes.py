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


def _swissboundaries_lakes_zip(tmp_path, gpkg_name, rows):
    """Baut ein Mini-GeoPackage im swissBOUNDARIES3D-Format (Layer
    `tlm_hoheitsgebiet`, Felder `objektart`/`name`/`see_flaeche`) als ZIP.
    `rows` sind (name, objektart, see_flaeche, geometry)-Tupel in WGS84 —
    bequemer zu schreiben als LV95-Meter — und werden hier wie beim echten
    Datensatz nach LV95 umgerechnet.

    `gpkg_name` muss je Testfall eindeutig sein: `lakes._extract_gpkg` cached
    das entpackte .gpkg unter seinem Dateinamen in `data/interim/
    swissboundaries/` (Grund: das echte GeoPackage ist 74 MB, einmal Auspacken
    pro Testlauf reicht) — zwei Tests mit demselben Namen würden sich sonst
    ungewollt eine Fixture teilen (dasselbe Muster wie in `test_boundaries.py`).
    """
    names, objektarten, see_flaechen, geoms = zip(*rows)
    gdf = gpd.GeoDataFrame(
        {
            "name": list(names),
            "objektart": list(objektarten),
            "see_flaeche": list(see_flaechen),
        },
        geometry=list(geoms),
        crs="EPSG:4326",
    ).to_crs("EPSG:2056")
    gpkg_path = tmp_path / f"{gpkg_name}.gpkg"
    gdf.to_file(gpkg_path, layer="tlm_hoheitsgebiet", driver="GPKG")
    zip_path = tmp_path / f"{gpkg_name}.gpkg.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(gpkg_path, arcname=gpkg_path.name)
    return zip_path


def _keine_swissboundaries_seen(tmp_path, gpkg_name):
    """Leere zweite Quelle für Tests, die nur Natural Earth prüfen wollen:
    eine Zeile mit einer Objektart, die der Seefilter garantiert verwirft —
    ein GeoPackage ganz ohne Zeilen lässt sich mit GDAL nicht zuverlässig
    anlegen."""
    fern = box(2.0, 48.0, 2.2, 48.2)
    return _swissboundaries_lakes_zip(
        tmp_path, gpkg_name, [("Nichts", "Gemeindegebiet", 0.0, fern)]
    )


def _switzerland():
    return gpd.GeoDataFrame(geometry=[box(6.0, 45.8, 10.5, 47.8)], crs="EPSG:4326")


def test_behaelt_nur_seen_die_die_schweiz_beruehren(tmp_path):
    drin = Polygon([(8.5, 47.2), (8.7, 47.2), (8.7, 47.3), (8.5, 47.3)])
    draussen = Polygon([(2.0, 48.0), (2.2, 48.0), (2.2, 48.2), (2.0, 48.2)])
    zpath = _ne_zip(tmp_path, [drin, draussen], ["Zürichsee", "Lac Fremd"])
    sb_zip = _keine_swissboundaries_seen(tmp_path, "sb_beruehren")
    out = tmp_path / "lakes.geojson"
    report = lakes.build(zpath, sb_zip, _switzerland(), out)
    assert report["count"] == 1
    data = json.loads(out.read_text(encoding="utf-8"))
    assert [f["properties"]["name"] for f in data["features"]] == ["Zürichsee"]


def test_schneidet_auf_das_landesgebiet_zu(tmp_path):
    """Der Bodensee ragt weit nach Deutschland — was ausserhalb liegt, gehört
    nicht auf eine Karte der Schweiz."""
    grenzsee = Polygon([(9.0, 47.5), (9.6, 47.5), (9.6, 48.4), (9.0, 48.4)])
    zpath = _ne_zip(tmp_path, [grenzsee], ["Bodensee"])
    sb_zip = _keine_swissboundaries_seen(tmp_path, "sb_zuschnitt")
    out = tmp_path / "lakes.geojson"
    lakes.build(zpath, sb_zip, _switzerland(), out)
    data = json.loads(out.read_text(encoding="utf-8"))
    ymax = max(c[1] for f in data["features"]
               for ring in f["geometry"]["coordinates"] for c in ring)
    assert ymax <= 47.8 + 1e-6


def test_artefakt_bleibt_im_budget(tmp_path):
    see = Polygon([(8.5, 47.2), (8.7, 47.2), (8.7, 47.3), (8.5, 47.3)])
    zpath = _ne_zip(tmp_path, [see], ["Zürichsee"])
    sb_zip = _keine_swissboundaries_seen(tmp_path, "sb_budget")
    out = tmp_path / "lakes.geojson"
    report = lakes.build(zpath, sb_zip, _switzerland(), out)
    assert report["bytes"] == out.stat().st_size
    assert report["bytes"] < lakes.MAX_ARTIFACT_BYTES


def test_seen_ohne_namen_werden_zu_null_nicht_zu_nan(tmp_path):
    """Fund am echten Datensatz: Natural Earth lässt bei einem
    Bodensee-Teilpolygon den Namen leer, geopandas liest das als float `NaN`.
    `NaN` ist kein gültiges JSON-Token — ungeprüft durchgereicht scheitert das
    Artefakt am künftigen Kartenlayer mit einem JSON-Parse-Fehler
    ("Unexpected token N"), nicht erst beim Betrachten."""
    see = Polygon([(8.5, 47.2), (8.7, 47.2), (8.7, 47.3), (8.5, 47.3)])
    zpath = _ne_zip(tmp_path, [see], [None])
    sb_zip = _keine_swissboundaries_seen(tmp_path, "sb_nan")
    out = tmp_path / "lakes.geojson"
    lakes.build(zpath, sb_zip, _switzerland(), out)
    text = out.read_text(encoding="utf-8")

    def _kein_nan_erlaubt(token):
        raise ValueError(f"ungueltiges JSON-Konstrukt im Artefakt: {token}")

    # `parse_constant` fängt genau das ab, was Pythons Standard-Decoder sonst
    # stillschweigend als Erweiterung durchlässt (`NaN`, `Infinity`) — ein
    # Browser-`JSON.parse` ist da strenger, ein blosses `json.loads(text)`
    # würde die Regression nicht bemerken.
    data = json.loads(text, parse_constant=_kein_nan_erlaubt)
    assert data["features"][0]["properties"]["name"] is None


def test_ergaenzt_seen_aus_swissboundaries3d(tmp_path):
    """swissBOUNDARIES3D liefert Seen, die Natural Earth bei 10-m-Auflösung
    nicht führt (siehe Moduldocstring) — hier stellvertretend der Zürichsee.
    Der Kantonssuffix im Quellnamen ("Zürichsee (ZH)") gehört nicht auf die
    Karte."""
    fern = Polygon([(2.0, 48.0), (2.2, 48.0), (2.2, 48.2), (2.0, 48.2)])
    ne_zip = _ne_zip(tmp_path, [fern], ["Lac Fremd"])
    zuerichsee = Polygon([(8.5, 47.2), (8.7, 47.2), (8.7, 47.3), (8.5, 47.3)])
    sb_zip = _swissboundaries_lakes_zip(
        tmp_path, "sb_zuerichsee",
        [("Zürichsee (ZH)", "Kantonsgebiet", 5584.0, zuerichsee)],
    )
    out = tmp_path / "lakes.geojson"
    report = lakes.build(ne_zip, sb_zip, _switzerland(), out)
    assert report["count"] == 1
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["features"][0]["properties"]["name"] == "Zürichsee"


def test_ignoriert_kantonsgebiet_ohne_seeflaeche(tmp_path):
    """Dieselbe Objektart "Kantonsgebiet" führt in swissBOUNDARIES3D auch
    Flächen ohne See (z. B. "Staatswald Galm", ein Wald, `see_flaeche = 0`) —
    ohne den Flächenfilter läge ein Waldstück als See auf der Karte."""
    fern = Polygon([(2.0, 48.0), (2.2, 48.0), (2.2, 48.2), (2.0, 48.2)])
    ne_zip = _ne_zip(tmp_path, [fern], ["Lac Fremd"])
    wald = Polygon([(8.5, 47.2), (8.7, 47.2), (8.7, 47.3), (8.5, 47.3)])
    sb_zip = _swissboundaries_lakes_zip(
        tmp_path, "sb_wald",
        [("Staatswald Galm", "Kantonsgebiet", 0.0, wald)],
    )
    out = tmp_path / "lakes.geojson"
    report = lakes.build(ne_zip, sb_zip, _switzerland(), out)
    assert report["count"] == 0


def test_korrigiert_falsch_beschriftetes_lago_di_como_zu_lago_maggiore(tmp_path):
    """Fund vom Task-Review: Natural Earth führt genau ein Feature namens
    "Lago di Como" — seine Ausdehnung (8.49–8.85° O / 45.72–46.17° N) liegt
    aber bei Locarno, nicht beim Comer See (9.05–9.40° O). Ein Feature namens
    "Lago Maggiore" existiert im Datensatz nicht; die Quelle beschriftet die
    Fläche schlicht falsch. `lakes.py` korrigiert das explizit (siehe
    `_NATURAL_EARTH_NAME_CORRECTIONS`), dieser Test hält die Korrektur fest."""
    see = Polygon([(8.5, 46.0), (8.7, 46.0), (8.7, 46.1), (8.5, 46.1)])
    ne_zip = _ne_zip(tmp_path, [see], ["Lago di Como"])
    sb_zip = _keine_swissboundaries_seen(tmp_path, "sb_maggiore")
    out = tmp_path / "lakes.geojson"
    lakes.build(ne_zip, sb_zip, _switzerland(), out)
    data = json.loads(out.read_text(encoding="utf-8"))
    assert [f["properties"]["name"] for f in data["features"]] == ["Lago Maggiore"]


def test_dedupliziert_see_der_in_beiden_quellen_vorkommt(tmp_path):
    """Der Bodensee kommt aus beiden Quellen — er darf nur einmal auf der
    Karte landen, nicht als zwei einander überlappende Polygone."""
    bodensee_ne = Polygon([(9.0, 47.5), (9.4, 47.5), (9.4, 47.7), (9.0, 47.7)])
    ne_zip = _ne_zip(tmp_path, [bodensee_ne], ["Bodensee"])
    bodensee_sb = Polygon([(9.0, 47.55), (9.2, 47.55), (9.2, 47.65), (9.0, 47.65)])
    sb_zip = _swissboundaries_lakes_zip(
        tmp_path, "sb_bodensee",
        [("Bodensee (TG)", "Kantonsgebiet", 13080.0, bodensee_sb)],
    )
    out = tmp_path / "lakes.geojson"
    report = lakes.build(ne_zip, sb_zip, _switzerland(), out)
    assert report["count"] == 1
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["features"][0]["properties"]["name"] == "Bodensee"
