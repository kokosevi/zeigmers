"""Liegt jede Firma in der Gemeinde, die ihre Zeile nennt?

Der Geokodierungsdienst scheitert nie laut. Er liefert immer den
nächstbesten Treffer — auch dann, wenn die Anfrage Unsinn enthält. Drei
Fälle sind so unbemerkt auf der Karte gelandet:

- **EMS-CHEMIE**: GLEIF lieferte als Strasse den Text `na` plus den
  Firmennamen. Aus `"na, EMS-CHEMIE AG, 7013 Domat/Ems"` machte der Dienst
  einen Punkt in **Giornico TI** — 150 km vom Sitz entfernt, und nichts
  hat gewarnt.
- **Flughafen Zürich**: die Adresse `"Kloten, 8058 Zürich"` ergab einen
  Punkt bei **Willisau LU**, 80 km daneben.
- **Dottikon ES**: eine völlig plausibel aussehende Strassenadresse
  (`"Hembrunnstrasse 17, 5605 Dottikon"`) landete in der **Nachbargemeinde
  Villmergen**. Hier half kein Blick auf die Anfrage — nur der Vergleich
  mit der Gemeindegrenze.

Der letzte Fall ist der wichtigste: eine Adresse kann fehlerfrei aussehen
und trotzdem falsch geokodiert werden. Deshalb prüft dieser Schritt nicht
die Eingabe, sondern das **Ergebnis** — gegen die Gemeindegrenzen, die das
ETL ohnehin baut.

Namensvarianten sind der Normalfall, nicht die Ausnahme: eine Firma sitzt
in «Rotkreuz» (Gemeinde Risch), «Pfäffikon SZ» (Freienbach),
«Niederwangen b. Bern» (Köniz) oder «Schindellegi» (Feusisberg) — alles
Ortschaften innerhalb einer anders heissenden Gemeinde. Der Vergleich
prüft deshalb nicht auf Namensgleichheit, sondern auf **Entfernung**: ein
Punkt, der weiter als `MAX_DISTANCE_KM` vom Mittelpunkt der genannten
Ortschaft entfernt liegt, ist ein Fund. Das trifft Giornico und Willisau
und lässt Rotkreuz in Ruhe.
"""

from __future__ import annotations

import glob
import math
from pathlib import Path

from . import config

# Ab dieser Entfernung zwischen geokodiertem Punkt und der Gemeinde, in der
# er tatsächlich liegt, gilt eine Platzierung als verdächtig. Grosszügig
# gewählt: es geht um Treffer in der falschen Landesgegend (Giornico statt
# Domat/Ems), nicht um Meter. Die Schweiz misst rund 350 km in der Breite.
MAX_DISTANCE_KM = 12.0


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lon / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def municipality_lookup(pattern: str | None = None):
    """Alle 2'110 Gemeinden aus den gebauten Grenz-Artefakten, als
    GeoDataFrame mit Namen und Geometrie."""
    import geopandas as gpd
    import pandas as pd

    pattern = pattern or str(config.PUBLIC_DATA / "*_boundaries.geojson")
    paths = sorted(glob.glob(pattern))
    if not paths:
        raise FileNotFoundError(
            f"Keine Gemeindegrenzen unter {pattern} — erst `draufsicht-etl statent` laufen lassen"
        )
    frames = [gpd.read_file(p) for p in paths]
    merged = pd.concat(frames, ignore_index=True)
    return gpd.GeoDataFrame(merged, geometry="geometry", crs=frames[0].crs)


def check(rows: list[dict], municipalities=None) -> list[dict]:
    """Meldet Zeilen, deren Koordinaten nicht zur genannten Ortschaft passen.

    Rückgabe: je Fund ein Dict mit `six_symbol`, `name`, `city`, der
    Gemeinde, in der der Punkt tatsächlich liegt, und der Entfernung."""
    from shapely.geometry import Point

    municipalities = municipality_lookup() if municipalities is None else municipalities
    sindex = municipalities.sindex
    findings: list[dict] = []

    for row in rows:
        if not (row.get("lon", "").strip() and row.get("lat", "").strip()):
            continue
        lon, lat = float(row["lon"]), float(row["lat"])
        hits = list(sindex.query(Point(lon, lat), predicate="within"))

        if not hits:
            findings.append({
                "six_symbol": row.get("six_symbol", ""), "name": row.get("name", ""),
                "city": row.get("city", ""), "gemeinde": None, "distanz_km": None,
                "grund": "Punkt liegt in keiner Schweizer Gemeinde",
            })
            continue

        gemeinde = municipalities.iloc[hits[0]]
        centre = gemeinde.geometry.centroid
        distance = _haversine_km(lon, lat, centre.x, centre.y)
        # Der Punkt liegt IN dieser Gemeinde — die Entfernung zu ihrem
        # Mittelpunkt ist deshalb klein, ausser bei sehr grossen Gemeinden.
        # Verdächtig wird es erst, wenn der Ortsname der Zeile nirgends in
        # der Nähe liegt; das prüft `_city_is_plausible`.
        if not _city_is_plausible(row.get("city", ""), str(gemeinde["name"]),
                                  lon, lat, municipalities, sindex):
            findings.append({
                "six_symbol": row.get("six_symbol", ""), "name": row.get("name", ""),
                "city": row.get("city", ""), "gemeinde": str(gemeinde["name"]),
                "distanz_km": round(distance, 1),
                "grund": "Ortsname der Zeile passt zu keiner Gemeinde in der Nähe",
            })
    return findings


def _city_is_plausible(city: str, gemeinde: str, lon: float, lat: float,
                       municipalities, sindex) -> bool:
    """Passt der Ortsname der Zeile zur Gemeinde des Punktes — oder zu einer
    Nachbargemeinde?

    Ortschaft und Gemeinde heissen oft verschieden (Rotkreuz liegt in Risch,
    Pfäffikon SZ in Freienbach). Deshalb genügt es, wenn IRGENDEINE Gemeinde
    in Reichweite so heisst wie die Ortschaft der Zeile — oder wenn gar keine
    Gemeinde diesen Namen trägt, dann ist der Name eine Ortschaft und der
    Vergleich sagt nichts."""
    from shapely.geometry import Point

    needle = _normalise(city)
    if not needle:
        return True
    if needle in _normalise(gemeinde) or _normalise(gemeinde) in needle:
        return True

    # Nur ganze Wörter vergleichen. Ein Teilwort-Treffer erzeugt Unsinn:
    # die Gemeinde "Erlen" TG steckt in "Perlen" LU und läge 150 km entfernt,
    # was einen Fund meldete, wo keiner ist.
    needle_words = set(needle.split())
    names = municipalities["name"].map(_normalise)
    matching = municipalities[names.map(
        lambda n: bool(needle_words & set(n.split()))
    )]
    if matching.empty:
        # Kein Gemeindename passt: die Zeile nennt eine Ortschaft (Rotkreuz,
        # Schindellegi). Ohne Ortschaftsverzeichnis lässt sich hier nichts
        # widerlegen — kein Fund.
        return True

    # Entfernung über die Mittelpunkte, in Kilometern — `GeoSeries.distance`
    # auf Längen-/Breitengraden liefert Gradabstände und warnt zu Recht davor.
    point = Point(lon, lat)
    nearest = min(
        _haversine_km(lon, lat, geom.centroid.x, geom.centroid.y)
        for geom in matching.geometry
    )
    return nearest < MAX_DISTANCE_KM


def _normalise(value: str) -> str:
    text = (value or "").strip().lower()
    for old, new in (("ü", "u"), ("ö", "o"), ("ä", "a"), ("è", "e"), ("é", "e"),
                     ("à", "a"), ("'", ""), ("-", " "), (".", " "),
                     # Klammern um den Kantonszusatz: die Grenzdaten schreiben
                     # "Altdorf (UR)", die Firmenzeile "Altdorf UR".
                     ("(", " "), (")", " ")):
        text = text.replace(old, new)
    return " ".join(text.split())
