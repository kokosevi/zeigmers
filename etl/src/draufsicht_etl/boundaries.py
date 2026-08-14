"""Kantons- und Gemeindegrenzen aus swissBOUNDARIES3D."""

from __future__ import annotations

import json
import subprocess
import zipfile
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import pyogrio
from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

from . import config

# swissBOUNDARIES3D benennt Layer und Felder je Jahrgang leicht unterschiedlich.
# Deshalb wird gesucht statt angenommen.
_MUNICIPALITY_LAYER_NEEDLES = ["hoheitsgebiet", "gemeinde"]
_CANTON_LAYER_NEEDLES = ["kantonsgebiet"]
_BFS_FIELD_NEEDLES = ["bfs_nummer", "bfs_nr", "gemeindenummer"]
_NAME_FIELD_NEEDLES = ["name", "gemeindename"]
_CANTON_FIELD_NEEDLES = ["kantonsnummer", "kanton_nr", "kantonsnr"]
_OBJEKTART_FIELD_NEEDLES = ["objektart"]
# `tlm_hoheitsgebiet` führt neben den 2'110 echten Gemeinden (Objektart
# "Gemeindegebiet") auch Seeflächen ohne Gemeindezugehörigkeit ("Kantonsgebiet",
# 11 Zeilen: Greifensee, Zürichsee, Thuner-/Brienzersee, Bieler-/Neuenburgersee
# je Kanton, Bodensee je Kanton) und geteilte Gebiete zweier Tessiner Gemeinden
# ohne eigene Zuordnung ("Kommunanz", 2 Zeilen). Ungefiltert würden diese 13
# Zeilen als zusätzliche "Gemeinden" mitgezählt — mit im Schnitt sehr hohen
# `bfs_nummer`-Werten (9000er-Block), die `statent.canton_reference()`s
# Nummernbereich (min..max je Kanton) für genau die Kantone sprengen, die eine
# solche Seefläche führen (ZH, BE, SG, TG, NE): der abgeleitete Bereich reicht
# dann bis in den 9000er-Block und erfasst dabei jede STATENT_GMDE-Zeile jedes
# anderen Kantons mit. Aargau ist unbetroffen (keine Seefläche in `tlm_hoheits-
# gebiet` mit `kantonsnummer=19`), deshalb ändert dieser Filter nichts an den
# committeten AG-Artefakten — siehe ETL-Report für die vollständige Prüfung
# aller 26 Kantone.
_MUNICIPALITY_OBJEKTART = "Gemeindegebiet"
# Change 2 (2026-08-14): `einwohnerzahl` trägt laut swissBOUNDARIES3D-
# Objektkatalog (Attribut EINWOHNERZAHL, TLM_HOHEITSGEBIET) die Einwohnerzahl
# der Gemeinde, Stand 31.12.2024 laut den Nachführungsinformationen der
# Ausgabe 2026 — ein anderes Jahr als die STATENT-Beschäftigten (2023). Siehe
# `aggregate._municipality_lookup` bzw. `ui/panel.ts` für die Weiterverarbeitung
# und den Jahreshinweis.
_POPULATION_FIELD_NEEDLES = ["einwohnerzahl"]


@dataclass
class Boundaries:
    canton_lv95: BaseGeometry
    municipalities: gpd.GeoDataFrame


def geojson_path(code: str | None = None) -> Path:
    """Pfad zum Gemeindegrenzen-Artefakt eines Kantons — `code` ist der
    zweistellige Kantonscode (z.B. "BE"). Ohne Argument der aktuell in
    `config.CANTON` konfigurierte Kanton (Rückwärtskompatibilität für Aufrufer,
    die "den" Kanton meinen, z.B. ältere Tests/Skripte).

    Seit der Ausweitung auf alle 26 Kantone (Phase 1) baut das ETL diese Datei
    für jeden Kanton, nicht mehr nur für `config.CANTON` — `cli.py` ruft diese
    Funktion deshalb in einer Schleife mit jedem Kantonscode auf.
    """
    resolved = code if code is not None else config.CANTON["code"]
    return config.PUBLIC_DATA / f"{resolved.lower()}_boundaries.geojson"


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


def _load_municipalities_raw(gpkg_zip: Path) -> gpd.GeoDataFrame:
    """Liest `tlm_hoheitsgebiet` einmal, undissolved, mit einer zusätzlichen
    `canton_bfs_nr`-Spalte — die gemeinsame Grundlage für `build()` (ein
    Kanton) und `build_all()` (alle 26). Ein Aufruf, eine GeoPackage-Lesung,
    egal wie viele Kantone am Ende gebraucht werden.
    """
    gpkg = _extract(gpkg_zip)
    layer = find_layer(gpkg, _MUNICIPALITY_LAYER_NEEDLES)
    gdf = gpd.read_file(gpkg, layer=layer)

    canton_col = _find_column(list(gdf.columns), _CANTON_FIELD_NEEDLES)
    bfs_col = _find_column(list(gdf.columns), _BFS_FIELD_NEEDLES)
    name_col = _find_column(list(gdf.columns), _NAME_FIELD_NEEDLES)
    population_col = _find_column(list(gdf.columns), _POPULATION_FIELD_NEEDLES)
    objektart_col = _find_column(list(gdf.columns), _OBJEKTART_FIELD_NEEDLES)

    # Nur echte Gemeinden (siehe `_MUNICIPALITY_OBJEKTART`-Kommentar oben) —
    # vor dem Kantonsfilter, damit weder `build()` noch `build_all()` je eine
    # Seefläche oder ein Kommunanz-Gebiet als Gemeinde zählen.
    gdf = gdf[gdf[objektart_col] == _MUNICIPALITY_OBJEKTART].copy()

    # Der Layer enthält auch Enklaven ohne Schweizer Kanton (FL-Gemeinden,
    # Büsingen am Hochrhein, Campione d'Italia) mit leerer Kantonsnummer.
    # Diese Zeilen werden verworfen statt sie mit einem Sentinel-Wert still
    # zu übergehen; der Verlust wird gezählt und gemeldet, damit ein künftiger
    # Jahrgang, der versehentlich echte Gemeinden ausdünnt, auffällt.
    rows_before = len(gdf)
    gdf = gdf.dropna(subset=[canton_col])
    dropped = rows_before - len(gdf)
    if dropped:
        print(
            f"[boundaries] {dropped} Zeilen ohne Kantonsnummer verworfen "
            "(Ausland: FL, Büsingen, Campione)"
        )

    # 3D-Geometrien auf 2D reduzieren; die Höhe stört jeden weiteren Schritt.
    gdf["geometry"] = gdf.geometry.force_2d()
    gdf = gdf.set_crs(config.SRC_LV95, allow_override=True)

    return (
        gdf[[bfs_col, name_col, population_col, canton_col, "geometry"]]
        .rename(
            columns={
                bfs_col: "bfs_nr",
                name_col: "name",
                population_col: "einwohnerzahl",
                canton_col: "canton_bfs_nr",
            }
        )
        # Laut Objektkatalog führen Exklaven-Teilpolygone keinen Wert für
        # EINWOHNERZAHL (siehe swissBOUNDARIES3D-Produktinformation, Abschnitt
        # 2.3) — NaN wird hier zu 0 normalisiert, bevor `dissolve()` mehrere
        # Zeilen desselben `bfs_nr` zu einer zusammenführt (aggfunc "first"
        # unten würde ein NaN sonst unverändert durchreichen).
        .assign(
            einwohnerzahl=lambda d: d["einwohnerzahl"].fillna(0),
            canton_bfs_nr=lambda d: d["canton_bfs_nr"].astype(int),
        )
        .reset_index(drop=True)
    )


def _dissolve_municipalities(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Fasst Exklaven-Teilpolygone (mehrere Zeilen mit gleichem `bfs_nr`) zu
    einer Zeile zusammen und bringt sie in eine deterministische Ordnung —
    gemeinsamer letzter Schritt für `build()` und `build_all()`."""
    return (
        gdf.dissolve(by=["bfs_nr", "name"], as_index=False)
        .astype({"bfs_nr": "int32", "einwohnerzahl": "int64"})
        .sort_values("bfs_nr")
        .reset_index(drop=True)
    )


def build(gpkg_zip: Path, canton_bfs_nr: int) -> Boundaries:
    raw = _load_municipalities_raw(gpkg_zip)
    gdf = raw[raw["canton_bfs_nr"] == canton_bfs_nr].drop(columns=["canton_bfs_nr"])
    if gdf.empty:
        raise ValueError(
            f"Kanton {canton_bfs_nr} liefert keine Gemeinden aus tlm_hoheitsgebiet"
        )

    municipalities = _dissolve_municipalities(gdf)
    canton = municipalities.geometry.union_all()
    return Boundaries(canton_lv95=canton, municipalities=municipalities)


def build_all(gpkg_zip: Path) -> dict[int, Boundaries]:
    """Wie `build()`, aber für alle Kantone auf einmal — eine GeoPackage-
    Lesung statt 26 (siehe `_load_municipalities_raw`). Schlüssel ist die
    Kantons-BFS-Nummer (1-26), Werte wie bei `build()`: die dissolvten
    Gemeinden dieses Kantons plus die Union ihrer Flächen.

    Für den bereits konfigurierten Kanton (`config.CANTON`) liefert dieser Pfad
    exakt dieselben `municipalities`-Zeilen wie `build(gpkg_zip, bfs_nr)` — der
    Kantonsfilter kommt in beiden Fällen aus derselben `_load_municipalities_raw`,
    Dissolve/Sortierung sind identisch, nur der Zeitpunkt des Filterns
    unterscheidet sich (vor vs. nach dem gemeinsamen Dissolve macht keinen
    Unterschied: `dissolve(by=["bfs_nr","name"])` gruppiert ohnehin nur
    innerhalb desselben `bfs_nr`, unbeeinflusst davon, welche anderen Kantone
    im Frame stehen).
    """
    raw = _load_municipalities_raw(gpkg_zip)
    result: dict[int, Boundaries] = {}
    for canton_bfs_nr, group in raw.groupby("canton_bfs_nr"):
        municipalities = _dissolve_municipalities(group.drop(columns=["canton_bfs_nr"]))
        result[int(canton_bfs_nr)] = Boundaries(
            canton_lv95=municipalities.geometry.union_all(),
            municipalities=municipalities,
        )
    return result


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


def _round_polygon(poly: Polygon, radius_m: float) -> Polygon:
    """Rundet die Ecken eines einzelnen `Polygon` morphologisch: erodieren,
    doppelt dilatieren, erodieren (`join_style=1` = rund) — die Standard-
    Konstruktion, die sowohl konvexe als auch konkave Ecken abrundet.

    Fällt auf die unveränderte Eingabe zurück, sobald das Ergebnis nicht mehr
    vertrauenswürdig ist: leer (die Fläche war schmaler als `radius_m` und
    verschwindet beim ersten Erodieren vollständig — siehe Exklaven-Test unten),
    ungültig, kein einzelnes `Polygon` mehr (Erosion kann eine Fläche in mehrere
    Teile spalten), oder mehr als die Hälfte ihrer Fläche verloren. Diese
    Rückfallschwelle ist bewusst grosszügig (normale Rundung verliert bei
    `radius_m=100` höchstens ~6 %, siehe ETL-Report) — sie fängt nur wirklich
    fragile Formen ab, nicht die erwartete Rundung selbst.
    """
    shrunk = poly.buffer(-radius_m, join_style=1, quad_segs=8)
    if shrunk.is_empty:
        return poly
    grown = shrunk.buffer(2 * radius_m, join_style=1, quad_segs=8)
    result = grown.buffer(-radius_m, join_style=1, quad_segs=8)
    if (
        result.is_empty
        or not result.is_valid
        or result.geom_type != "Polygon"
        or result.area < poly.area * 0.5
    ):
        return poly
    return result


def _round_geometry(geom: BaseGeometry, radius_m: float) -> BaseGeometry:
    """Wendet `_round_polygon` auf jedes Teilpolygon an — bei `MultiPolygon`
    (Exklaven: Baden, Würenlos, Olsberg, Zurzach) einzeln je Teil, damit ein
    kleiner Exklaven-Teil, der für sich zu schmal fürs Runden ist, seinen
    eigenen Fallback bekommt statt die ganze Gemeinde unrund zu lassen."""
    if isinstance(geom, Polygon):
        return _round_polygon(geom, radius_m)
    if isinstance(geom, MultiPolygon):
        return MultiPolygon([_round_polygon(part, radius_m) for part in geom.geoms])
    return geom


def round_municipality_corners(
    gdf: gpd.GeoDataFrame, radius_m: float = config.MUNICIPALITY_ROUND_RADIUS_M
) -> gpd.GeoDataFrame:
    """Rundet die Gemeindeecken ab (visuelle Vorgabe: leicht abgerundete Kanten
    wie im Referenzbild), auf der metrischen LV95-Geometrie aus `build()` —
    **vor** `write_geojson()`/der Reprojektion nach WGS84, damit `radius_m`
    tatsächlich Meter bedeutet.

    Nur für Gemeinden aufgerufen (`cli.py`), nicht für Kantone: die Kantonsfläche
    ist als durchgehende Platte gedacht, aus der die Gemeinden wachsen
    (`layers/cantons.ts`) — das widerspricht dem Effekt unabhängiger Rundung
    unten.

    **Bewusster Kompromiss:** `build()` liefert Gemeinden mit exakt geteilten
    Nachbargrenzen (aus `dissolve()`); jedes Polygon hier für sich zu runden
    öffnet an praktisch jeder gemeinsamen Ecke einen schmalen Spalt (bei
    `radius_m=100` im Schnitt ~1 % Flächenverlust je Gemeinde, siehe
    ETL-Report) — die Gemeinden lesen sich danach als einzelne Platten mit
    dunklen Fugen dazwischen statt als nahtlose Fläche. Das passt zum
    Referenzbild (dort lesen sich auch die Länder als separate Blöcke), ist
    aber ein sichtbarer Charakterwechsel, kein Nebeneffekt. Vereinzelt
    (getestet: 101 von ~380 gemeinsamen Ecken bei `radius_m=100`) übersteht
    die konkave Rundung eines Nachbarn die konvexe Rundung des anderen
    minimal — die gemessene Überlappung bleibt aber im Bereich weniger m²
    (max. 9 m² je Fall), weit unter jeder sichtbaren Grössenordnung.
    """
    out = gdf.copy()
    out["geometry"] = gdf.geometry.apply(lambda geom: _round_geometry(geom, radius_m))
    return out


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
