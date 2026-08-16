"""Seeflächen für die Basiskarte — aus Natural Earth, nicht aus einer
amtlichen Schweizer Quelle.

swissBOUNDARIES3D, das dieses ETL ohnehin lädt, führt in `tlm_hoheitsgebiet`
nur elf Seeflächen als eigene Zeilen (Objektart "Kantonsgebiet"): Zürichsee,
Bodensee, Neuenburger-, Bieler-, Thuner-, Brienzersee und Greifensee. Genfersee,
Vierwaldstättersee, Lago Maggiore, Zugersee und Walensee stecken dort in den
Gemeindeflächen und liessen sich nicht herauslösen, ohne die Gemeindegeometrie
selbst zu zerschneiden. Eine Karte der Schweiz ohne Genfersee ist keine.

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

# Vereinfachungstoleranz in Grad (rund 110 m). Die Seen sind Orientierung auf
# Landeszoom, keine Vermessung — feinere Umrisse kosten Startbytes, die das
# Budget (siehe `config.MAX_STARTUP_BYTES`) für die Firmendaten braucht.
SIMPLIFY_DEGREES = 0.001

# Obergrenze für das Artefakt. Der Start-Payload liegt bei rund 591 KB von
# 800 KB; die Seen dürfen den Rest nicht aufbrauchen.
MAX_ARTIFACT_BYTES = 60 * 1024


def build(ne_zip: Path, cantons: gpd.GeoDataFrame, out_path: Path) -> dict:
    """Lädt die Natural-Earth-Seen, behält die, die die Schweiz berühren,
    schneidet sie auf das Landesgebiet zu und schreibt sie als GeoJSON."""
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(ne_zip) as zf:
            zf.extractall(tmp)
        shp = next(Path(tmp).rglob("*.shp"))
        lakes_gdf = gpd.read_file(shp)

    lakes_gdf = lakes_gdf.to_crs("EPSG:4326")
    land = cantons.to_crs("EPSG:4326").union_all()

    clipped = lakes_gdf[lakes_gdf.intersects(land)].copy()
    clipped["geometry"] = clipped.geometry.intersection(land)
    clipped = clipped[~clipped.geometry.is_empty]
    clipped["geometry"] = clipped.geometry.simplify(SIMPLIFY_DEGREES)
    clipped = clipped[~clipped.geometry.is_empty]

    name_col = next((c for c in clipped.columns if c.lower() == "name"), None)
    # Natural Earth lässt den Namen bei einzelnen Polygonen leer (z. B. ein
    # unbenanntes Teilbecken des Bodensees) — als float NaN, nicht als String.
    # `NaN` ist kein gültiges JSON-Token; ungeprüft durchgereicht würde das
    # Artefakt am künftigen Kartenlayer mit "Unexpected token N" scheitern.
    features = [
        {
            "type": "Feature",
            "properties": {
                "name": (
                    row[name_col]
                    if name_col and pd.notna(row[name_col])
                    else None
                )
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
