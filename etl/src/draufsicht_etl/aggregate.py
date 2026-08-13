"""Aggregation auf Kanton, Gemeinde und Hektare.

Grundregel aus Spec 6.4: die Höhe kommt immer aus `emp_total`. Die
Abteilungsspalten liefern ausschliesslich die Mischung und werden dafür auf
`emp_total` normiert. Sie werden niemals zu einem Total aufsummiert.
"""

from __future__ import annotations

from dataclasses import dataclass

import geopandas as gpd
import numpy as np
from shapely.geometry.base import BaseGeometry

from . import config
from .noga import NogaTable
from .statent import CellTable, lv95_to_wgs84


@dataclass
class LevelData:
    name: str
    lon: np.ndarray
    lat: np.ndarray
    value: np.ndarray
    noga: np.ndarray
    flags: np.ndarray
    dist: np.ndarray
    gemeinde_idx: np.ndarray | None = None
    gemeinden: list[dict] | None = None

    @property
    def count(self) -> int:
        return int(self.value.shape[0])


def group_raw(cells: CellTable, table: NogaTable) -> np.ndarray:
    """Rohe Abteilungswerte je Gruppe aufsummiert — nur für die Mischung."""
    raw = np.zeros((cells.count, table.group_count), dtype="float64")
    for col, division in enumerate(cells.divisions):
        raw[:, table.group_index(division)] += cells.div_emp[:, col]
    return raw


def normalise_dist(raw: np.ndarray, totals: np.ndarray) -> np.ndarray:
    """Skaliert die Gruppenanteile so, dass ihre Summe `totals` ergibt."""
    row_sum = raw.sum(axis=1)
    scale = np.divide(
        totals, row_sum, out=np.zeros_like(totals, dtype="float64"), where=row_sum > 0
    )
    return raw * scale[:, None]


def dominant_group(dist: np.ndarray) -> np.ndarray:
    """Index der grössten Gruppe; 255, wenn leer oder kein eindeutiges Maximum."""
    result = np.full(dist.shape[0], config.NOGA_UNKNOWN_INDEX, dtype="uint8")
    if dist.size == 0:
        return result
    maxima = dist.max(axis=1)
    tied = (dist == maxima[:, None]).sum(axis=1)
    unique = (maxima > 0) & (tied == 1)
    result[unique] = np.argmax(dist[unique], axis=1).astype("uint8")
    return result


def top3(dist: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Die drei grössten Gruppen je Zeile, absteigend. Leerplätze werden 255/0."""
    n = dist.shape[0]
    groups = np.full((n, 3), config.NOGA_UNKNOWN_INDEX, dtype="uint8")
    values = np.zeros((n, 3), dtype="uint16")
    if n == 0:
        return groups, values

    order = np.argsort(-dist, axis=1, kind="stable")[:, :3]
    picked = np.take_along_axis(dist, order, axis=1)
    present = picked > 0
    groups[present] = order.astype("uint8")[present]
    values[present] = np.clip(np.rint(picked[present]), 0, 65535).astype("uint16")
    return groups, values


def _municipality_lookup(municipalities: gpd.GeoDataFrame) -> tuple[dict[int, int], list[dict]]:
    entries = [
        {"bfsNr": int(row.bfs_nr), "name": str(row.name)}
        for row in municipalities.sort_values("bfs_nr").itertuples()
    ]
    return {e["bfsNr"]: i for i, e in enumerate(entries)}, entries


def build_hectare(
    cells: CellTable, table: NogaTable, municipalities: gpd.GeoDataFrame
) -> LevelData:
    dist = normalise_dist(group_raw(cells, table), cells.emp_total).astype("float32")
    flags = np.where(
        cells.emp_total == config.AMBIGUOUS_VALUE, config.FLAG_AMBIGUOUS, 0
    ).astype("uint8")

    index, entries = _municipality_lookup(municipalities)
    unknown = sorted(set(cells.gmde.tolist()) - set(index))
    if unknown:
        raise ValueError(
            f"Hektaren verweisen auf unbekannte Gemeindenummern: {unknown}. "
            "Jahrgang von STATENT und swissBOUNDARIES3D prüfen."
        )

    gemeinde_idx = np.array([index[g] for g in cells.gmde], dtype="uint16")

    # Mehrdeutige Hektaren je Gemeinde, direkt im `gemeinden`-Eintrag
    # mitgeliefert: ohne das müsste das Frontend entweder die kantonsweite
    # Zahl zeigen (für eine einzelne, oft viel kleinere Gemeinde irreführend)
    # oder alle 17'940 Hektarzellen im Browser danach durchsuchen. Beide
    # Aggregationsstufen (`hektar`, `gemeinde`) teilen sich dasselbe
    # `entries`-Objekt (siehe build_municipality), der Wert steht also in
    # beiden Artefakten.
    ambiguous = np.zeros(len(entries), dtype="int64")
    np.add.at(ambiguous, gemeinde_idx, (flags & config.FLAG_AMBIGUOUS) > 0)
    for entry, count in zip(entries, ambiguous.tolist(), strict=True):
        entry["ambiguousCells"] = int(count)

    return LevelData(
        name="hektar",
        lon=cells.lon,
        lat=cells.lat,
        value=cells.emp_total,
        noga=dominant_group(dist),
        flags=flags,
        dist=dist,
        gemeinde_idx=gemeinde_idx,
        gemeinden=entries,
    )


def build_municipality(
    hectare: LevelData, municipalities: gpd.GeoDataFrame
) -> LevelData:
    assert hectare.gemeinde_idx is not None and hectare.gemeinden is not None
    entries = hectare.gemeinden
    n = len(entries)

    value = np.zeros(n, dtype="float64")
    np.add.at(value, hectare.gemeinde_idx, hectare.value)

    dist = np.zeros((n, hectare.dist.shape[1]), dtype="float64")
    np.add.at(dist, hectare.gemeinde_idx, hectare.dist.astype("float64"))

    ordered = municipalities.set_index("bfs_nr").loc[[e["bfsNr"] for e in entries]]
    points = ordered.geometry.representative_point()
    lon, lat = lv95_to_wgs84(points.x.to_numpy("float64"), points.y.to_numpy("float64"))

    keep = value > 0
    return LevelData(
        name="gemeinde",
        lon=lon[keep],
        lat=lat[keep],
        value=value[keep],
        noga=dominant_group(dist[keep]),
        flags=np.zeros(int(keep.sum()), dtype="uint8"),
        dist=dist[keep].astype("float32"),
        gemeinde_idx=np.flatnonzero(keep).astype("uint16"),
        gemeinden=entries,
    )


def build_canton(hectare: LevelData, canton_lv95: BaseGeometry) -> LevelData:
    point = canton_lv95.representative_point()
    lon, lat = lv95_to_wgs84(np.array([point.x]), np.array([point.y]))
    dist = hectare.dist.astype("float64").sum(axis=0, keepdims=True)

    return LevelData(
        name="kanton",
        lon=lon,
        lat=lat,
        value=np.array([hectare.value.sum()], dtype="float64"),
        noga=dominant_group(dist),
        flags=np.zeros(1, dtype="uint8"),
        dist=dist.astype("float32"),
    )


def stats(level: LevelData, *, source: LevelData | None = None) -> dict:
    """Kennzahlen. `ambiguousCells` zählt immer die Hektaren, auch auf höheren Stufen."""
    basis = source if source is not None else level
    ambiguous = int(((basis.flags & config.FLAG_AMBIGUOUS) > 0).sum())
    values = level.value
    return {
        "min": float(values.min()) if values.size else 0.0,
        "max": float(values.max()) if values.size else 0.0,
        "sum": float(values.sum()),
        "p99": float(np.percentile(values, 99)) if values.size else 0.0,
        "ambiguousCells": ambiguous,
        "overstatementMax": 3 * ambiguous,
    }
