"""Hektardaten: Zentrumsversatz, Reprojektion, räumlicher Kantonsfilter.

Zur Datenschutzregel siehe Spec 6.4: das BFS rundet alle Werte < 4 auf 4 auf.
Deshalb ist `emp_total` die einzige zulässige Quelle für die Balkenhöhe; die
Abteilungsspalten werden hier lediglich mitgeführt und in `aggregate.py`
ausschliesslich zur Bestimmung der Mischung verwendet.
"""

from __future__ import annotations

from dataclasses import dataclass

import geopandas as gpd
import numpy as np
import pandas as pd
from pyproj import Transformer

from . import config
from .columns import ResolvedColumns

_TRANSFORMER = Transformer.from_crs(config.SRC_LV95, config.DST_WGS84, always_xy=True)


@dataclass
class CellTable:
    reli: np.ndarray
    lon: np.ndarray
    lat: np.ndarray
    gmde: np.ndarray
    emp_total: np.ndarray
    div_emp: np.ndarray
    divisions: list[int]

    @property
    def count(self) -> int:
        return int(self.reli.shape[0])


def to_center_lv95(e: np.ndarray, n: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """E_KOORD/N_KOORD bezeichnen die Südwest-Ecke der Hektare."""
    offset = config.HECTARE_CENTER_OFFSET_M
    return e + offset, n + offset


def lv95_to_wgs84(e: np.ndarray, n: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lon, lat = _TRANSFORMER.transform(e, n)
    return np.asarray(lon, dtype="float64"), np.asarray(lat, dtype="float64")


def load_cells(
    frame: pd.DataFrame, resolved: ResolvedColumns, municipalities: gpd.GeoDataFrame
) -> CellTable:
    emp_total = pd.to_numeric(frame[resolved.emp_total], errors="coerce").fillna(0.0)
    frame = frame.loc[emp_total > 0].copy()
    emp_total = emp_total.loc[frame.index]

    e_sw = pd.to_numeric(frame[resolved.e_koord], errors="raise").to_numpy("float64")
    n_sw = pd.to_numeric(frame[resolved.n_koord], errors="raise").to_numpy("float64")
    e_c, n_c = to_center_lv95(e_sw, n_sw)

    # Ein Verschnitt, zwei Ergebnisse: Kantonsfilter und Gemeindenummer.
    # Ausdrücklich keine Bounding-Box. Die Gemeindenummer steht nicht in den
    # Hektardaten (Task 5), sie entsteht hier.
    points = gpd.GeoDataFrame(
        {"_i": np.arange(len(frame))},
        geometry=gpd.points_from_xy(e_c, n_c),
        crs=config.SRC_LV95,
    )
    joined = gpd.sjoin(
        points, municipalities[["bfs_nr", "geometry"]], predicate="within", how="inner"
    )
    # Eine Hektare kann zwei Gemeinden berühren, wenn ihr Zentrum exakt auf der
    # Grenze liegt. Deterministisch die kleinere Nummer nehmen, statt zu würfeln.
    joined = joined.sort_values(["_i", "bfs_nr"]).drop_duplicates("_i", keep="first")

    inside = joined["_i"].to_numpy()
    gmde = joined["bfs_nr"].to_numpy("int32")
    order = np.argsort(inside)
    inside, gmde = inside[order], gmde[order]

    if inside.size == 0:
        raise ValueError(
            "Der Verschnitt liefert keine Hektare innerhalb der Kantonsfläche — "
            "prüfen, ob Gemeindegeometrie und Hektardaten dasselbe CRS haben"
        )

    divisions = resolved.division_numbers
    div_emp = np.empty((inside.size, len(divisions)), dtype="float64")
    for col, division in enumerate(divisions):
        values = pd.to_numeric(frame[resolved.emp_div[division]], errors="coerce")
        div_emp[:, col] = values.fillna(0.0).to_numpy("float64")[inside]

    lon, lat = lv95_to_wgs84(e_c[inside], n_c[inside])

    return CellTable(
        reli=frame[resolved.reli].to_numpy("int64")[inside],
        lon=lon,
        lat=lat,
        gmde=gmde,
        emp_total=emp_total.to_numpy("float64")[inside],
        div_emp=div_emp,
        divisions=divisions,
    )
