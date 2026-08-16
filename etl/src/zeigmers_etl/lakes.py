"""Seeflächen für die Basiskarte — aus zwei Quellen kombiniert, weil keine
allein die Silhouette der Schweiz erkennbar macht. Nur eine der beiden ist
nicht-amtlich (siehe letzter Absatz) — swissBOUNDARIES3D ist swisstopo,
also amtlich; eine frühere Fassung dieses Docstrings nannte fälschlich
beide "nicht-amtlich" (Abschluss-Review, Finding I9).

swissBOUNDARIES3D, das dieses ETL ohnehin lädt, führt in `tlm_hoheitsgebiet`
nur elf Seeflächen als eigene Zeilen (Objektart "Kantonsgebiet"): Zürichsee,
Bodensee (je Kanton geteilt: TG/SG), Neuenburger- und Bielersee (je Kanton
geteilt: BE/NE), Thuner-, Brienzersee und Greifensee — plus eine Zeile ohne
Seefläche ("Staatswald Galm", ein Wald, siehe `_SWISSBOUNDARIES_OBJEKTART`).
Genfersee, Vierwaldstättersee, Lago Maggiore, Zugersee und Walensee stecken
dort in den Gemeindeflächen und liessen sich nicht herauslösen, ohne die
Gemeindegeometrie selbst zu zerschneiden.

Natural Earth 10m "lakes" führt umgekehrt nur die international bekannten
Seen — im Schweizer Fenster sind das Genfersee, Bodensee und ein drittes
Feature, das die Quelle "Lago di Como" nennt, in Wahrheit aber Lago Maggiore
ist (Fehlbeschriftung, siehe `_NATURAL_EARTH_NAME_CORRECTIONS`). Eine Karte
der Schweiz ohne Genfersee ist keine; deshalb kombiniert dieses Modul beide
Quellen: Natural Earth für Genfersee/Bodensee/Lago Maggiore, swissBOUNDARIES3D
für den Rest. Bodensee liefern beide — dort hat Natural Earth Vorrang (siehe
`build()`), swissBOUNDARIES3D nur den Schweizer Uferstreifen zweigeteilt.

**Bleibt trotzdem unvollständig:** Vierwaldstättersee, Zugersee, Walensee und
Lago di Lugano sind in keiner der beiden Quellen als eigene Fläche enthalten
und fehlen deshalb auf der Karte. Lago Maggiore dagegen ist mit seinem
Schweizer Teil enthalten (siehe oben) — eine frühere Fassung dieses Docstrings
zählte ihn fälschlich zu den fehlenden Seen.

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
import pandas as pd

from . import boundaries, config

# Vereinfachungstoleranz in Grad (rund 110 m). Die Seen sind Orientierung auf
# Landeszoom, keine Vermessung — feinere Umrisse kosten Startbytes, die das
# Budget (siehe `config.MAX_STARTUP_BYTES`) für die Firmendaten braucht.
SIMPLIFY_DEGREES = 0.001

# Obergrenze für das Artefakt. Der Start-Payload liegt bei rund 591 KB von
# 800 KB; die Seen dürfen den Rest nicht aufbrauchen.
MAX_ARTIFACT_BYTES = 60 * 1024

# Layer-Nadel für `tlm_hoheitsgebiet`, unabhängig von `boundaries.py`s eigener
# (privater) Nadelliste gehalten: lakes.py greift bewusst nicht auf private
# Interna eines anderen Moduls zu, siehe `_extract_gpkg` unten.
_HOHEITSGEBIET_LAYER_NEEDLES = ["hoheitsgebiet"]

# Diese Objektart führt die elf Seeflächen, aber nicht nur sie: siehe
# Moduldocstring für die eine zusätzliche Zeile derselben Objektart ohne
# Seefläche ("Staatswald Galm", ein Wald, `see_flaeche == 0`) — deshalb der
# `see_flaeche > 0`-Filter unten in `_read_swissboundaries_lakes`, nicht ein
# blosser Objektart-Filter allein.
_SWISSBOUNDARIES_OBJEKTART = "Kantonsgebiet"

# Manche Seen sind je Kanton in zwei Zeilen geteilt, der Name trägt dann das
# Kantonskürzel ("Bielersee (BE)"). Das Kürzel gehört nicht auf die Karte —
# nach dem Entfernen dissolved `_read_swissboundaries_lakes` die Teile zu
# einer Fläche.
_CANTON_SUFFIX_PATTERN = r"\s*\([A-Z]{2}\)$"

# Natural Earth beschriftet ein Feature falsch: Das einzige Polygon namens
# "Lago di Como" hat die Ausdehnung 8.49–8.85° O / 45.72–46.17° N (nachgemessen
# gegen ne_10m_lakes.zip, Stand 16. August 2026) — das ist Lago Maggiore bei
# Locarno, nicht der Comer See (der liegt bei 9.05–9.40° O). Ein Feature
# namens "Lago Maggiore" existiert im Datensatz nicht. Ohne diese Korrektur
# stünde der falsche Name auf der Karte; die Zuordnung ist an der Geometrie
# geprüft, nicht am Namen der Quelle vertraut.
_NATURAL_EARTH_NAME_CORRECTIONS = {"Lago di Como": "Lago Maggiore"}


def _extract_gpkg(gpkg_zip: Path) -> Path:
    """Entpackt das GeoPackage aus dem swissBOUNDARIES3D-ZIP in dieselbe
    Zielablage wie `boundaries._extract` (dort privat, deshalb hier absichtlich
    dupliziert statt importiert) — ein `zeigmers-etl lakes`-Lauf ruft vorher
    `boundaries.build_cantons()` mit demselben ZIP auf; ohne denselben
    Ablagepfad und dieselbe Cache-Prüfung würde die 74-MB-Datei ein zweites
    Mal ausgepackt."""
    target = config.DATA_INTERIM / "swissboundaries"
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(gpkg_zip) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".gpkg")]
        if not names:
            raise LookupError(f"Kein .gpkg in {gpkg_zip}; enthalten: {zf.namelist()[:20]}")
        name = names[0]
        dest = target / name
        if not dest.exists():
            zf.extract(name, target)
        return dest


def _read_natural_earth(ne_zip: Path) -> gpd.GeoDataFrame:
    """Lädt die Natural-Earth-Seen roh und reduziert auf `name`/`geometry` in
    WGS84 — liefert Genfersee, Bodensee und (unter dem korrigierten Namen,
    siehe `_NATURAL_EARTH_NAME_CORRECTIONS`) Lago Maggiore (siehe
    Moduldocstring), aber keinen der Schweizer Binnenseen."""
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(ne_zip) as zf:
            zf.extractall(tmp)
        shp = next(Path(tmp).rglob("*.shp"))
        gdf = gpd.read_file(shp)

    gdf = gdf.to_crs(config.DST_WGS84)
    name_col = next((c for c in gdf.columns if c.lower() == "name"), None)
    name = gdf[name_col] if name_col is not None else pd.Series([None] * len(gdf))
    name = name.replace(_NATURAL_EARTH_NAME_CORRECTIONS)
    return gpd.GeoDataFrame(
        {"name": name.reset_index(drop=True), "geometry": gdf.geometry.reset_index(drop=True)},
        crs=config.DST_WGS84,
    )


def _read_swissboundaries_lakes(gpkg_zip: Path) -> gpd.GeoDataFrame:
    """Seeflächen aus `tlm_hoheitsgebiet`, die swissBOUNDARIES3D als eigene
    Kantonsgebiet-Zeile führt. `see_flaeche > 0` ist kein optionaler
    Zierfilter: dieselbe Objektart führt auch "Staatswald Galm" mit
    `see_flaeche = 0` — ohne diesen Filter läge ein Waldstück als See auf der
    Karte (siehe Moduldocstring)."""
    gpkg = _extract_gpkg(gpkg_zip)
    layer = boundaries.find_layer(gpkg, _HOHEITSGEBIET_LAYER_NEEDLES)
    gdf = gpd.read_file(gpkg, layer=layer)

    gdf = gdf[
        (gdf["objektart"] == _SWISSBOUNDARIES_OBJEKTART) & (gdf["see_flaeche"] > 0)
    ].copy()
    gdf["geometry"] = gdf.geometry.force_2d()
    gdf = gdf.set_crs(config.SRC_LV95, allow_override=True)
    gdf["name"] = gdf["name"].str.replace(_CANTON_SUFFIX_PATTERN, "", regex=True)

    dissolved = gdf[["name", "geometry"]].dissolve(by="name", as_index=False)
    return dissolved.to_crs(config.DST_WGS84)


def build(
    ne_zip: Path, swissboundaries_zip: Path, cantons: gpd.GeoDataFrame, out_path: Path
) -> dict:
    """Kombiniert Natural-Earth- und swissBOUNDARIES3D-Seen, behält die, die
    die Schweiz berühren, schneidet sie auf das Landesgebiet zu und schreibt
    sie als GeoJSON."""
    ne = _read_natural_earth(ne_zip)
    sb = _read_swissboundaries_lakes(swissboundaries_zip)

    # Bodensee liefern beide Quellen: Natural Earth den ganzen See (wird unten
    # ohnehin auf die Schweiz zugeschnitten), swissBOUNDARIES3D nur den
    # Schweizer Uferstreifen in zwei Kantonsteilen. Beides zu zeichnen ergäbe
    # zwei einander überlappende Polygone für denselben See — wo Natural Earth
    # den Namen schon liefert, hat es Vorrang, die swissBOUNDARIES3D-Zeile
    # entfällt.
    #
    # Fragil, bewusst in Kauf genommen: Der Vergleich ist ein reiner
    # Namensabgleich (getrimmt, kleingeschrieben) — er setzt voraus, dass
    # derselbe See in beiden Quellen exakt gleich geschrieben ist. Heute
    # trifft das nur auf "Bodensee" zu (in beiden Quellen identisch). Würde
    # eine künftige Ausgabe einer Quelle denselben See anders schreiben (z. B.
    # "Lake Constance" statt "Bodensee"), erkennt dieser Abgleich das nicht —
    # der See erschiene dann fälschlich zweimal, überlappend, ohne Fehler oder
    # Warnung. Eine geometrische Dedup (Überlappungsfläche statt Name) wäre
    # robuster, ist hier aber bewusst nicht gebaut: der einzige heutige
    # Überschneidungsfall ist bekannt und geprüft (siehe Testfall
    # `test_dedupliziert_see_der_in_beiden_quellen_vorkommt`).
    ne_names = {str(n).strip().lower() for n in ne["name"] if pd.notna(n)}
    sb = sb[~sb["name"].str.strip().str.lower().isin(ne_names)]

    lakes_gdf = gpd.GeoDataFrame(
        pd.concat([ne, sb], ignore_index=True), geometry="geometry", crs=config.DST_WGS84
    )

    land = cantons.to_crs(config.DST_WGS84).union_all()

    clipped = lakes_gdf[lakes_gdf.intersects(land)].copy()
    clipped["geometry"] = clipped.geometry.intersection(land)
    clipped = clipped[~clipped.geometry.is_empty]
    clipped["geometry"] = clipped.geometry.simplify(SIMPLIFY_DEGREES)
    clipped = clipped[~clipped.geometry.is_empty]

    # Natural Earth lässt den Namen bei einzelnen Polygonen leer (z. B. ein
    # unbenanntes Teilbecken des Bodensees) — als float NaN, nicht als String.
    # `NaN` ist kein gültiges JSON-Token; ungeprüft durchgereicht würde das
    # Artefakt am künftigen Kartenlayer mit "Unexpected token N" scheitern.
    features = [
        {
            "type": "Feature",
            "properties": {
                "name": row["name"] if pd.notna(row["name"]) else None
            },
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
