"""Aggregation auf Kanton, Gemeinde und Hektare.

Grundregel aus Spec 6.4: die Höhe kommt immer aus `emp_total`. Die
Abteilungsspalten liefern ausschliesslich die Mischung und werden dafür auf
`emp_total` normiert. Sie werden niemals zu einem Total aufsummiert.
"""

from __future__ import annotations

import math
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


def _clean_population(value: object) -> int:
    """Normalisiert `einwohnerzahl` zu einem sauberen `int` — nie zu einem
    erfundenen Wert oder einem `NaN`, das später in `ui/panel.ts` eine
    Division durch 0 oder eine NaN-Kennzahl ergäbe (Change 2: Beschäftigte je
    Einwohner). `boundaries.build()` normalisiert NaN bereits zu 0, das hier
    ist die zweite, unabhängige Verteidigungslinie für Aufrufer, die
    `municipalities` an `_municipality_lookup` vorbeischleusen (z. B. Tests
    ohne `einwohnerzahl`-Spalte)."""
    if value is None:
        return 0
    try:
        if math.isnan(value):  # type: ignore[arg-type]
            return 0
    except TypeError:
        pass
    return int(value)  # type: ignore[arg-type]


def _municipality_lookup(municipalities: gpd.GeoDataFrame) -> tuple[dict[int, int], list[dict]]:
    has_population = "einwohnerzahl" in municipalities.columns
    entries = [
        {
            "bfsNr": int(row.bfs_nr),
            "name": str(row.name),
            "einwohnerzahl": _clean_population(row.einwohnerzahl) if has_population else 0,
        }
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


def build_national_cantons(rows: list[tuple[dict, LevelData]]) -> LevelData:
    """Baut die nationale Übersichtsstufe `ch_kantone` (Phase 1: alle Schweiz)
    aus den 26 einzeln berechneten Kanton-`LevelData`-Objekten (`build_canton`,
    je Kanton eine Zeile mit `count == 1`) zusammen — eine Zeile je Kanton,
    dieselben Felder wie eine Gemeindezeile: Beschäftigte (`value`), dominante
    Branchengruppe (`noga`), volle Mischung (`dist`).

    `rows` ist eine Liste aus (Eintrag, Kanton-`LevelData`) — der Eintrag trägt
    `bfsNr`/`code`/`name`/`ambiguousCells`/`einwohnerzahl` (siehe Aufrufer in
    `cli.py`, wo `ambiguousCells`/`einwohnerzahl` bereits aus `stats(hectare)`
    dieses Kantons stammen). Sortiert nach `bfsNr`, wie `_municipality_lookup`
    es für Gemeinden tut — deterministisch und reproduzierbar über Läufe hinweg,
    unabhängig von der Reihenfolge, in der `cli.py` die Kantone verarbeitet.
    """
    ordered = sorted(rows, key=lambda pair: pair[0]["bfsNr"])
    entries = [entry for entry, _ in ordered]
    levels = [level for _, level in ordered]

    n = len(levels)
    lon = np.concatenate([lvl.lon for lvl in levels]) if n else np.array([])
    lat = np.concatenate([lvl.lat for lvl in levels]) if n else np.array([])
    value = np.concatenate([lvl.value for lvl in levels]) if n else np.array([])
    dist = (
        np.concatenate([lvl.dist for lvl in levels], axis=0).astype("float32")
        if n
        else np.zeros((0, 0), dtype="float32")
    )
    noga = dominant_group(dist.astype("float64"))

    return LevelData(
        name="kantone",
        lon=lon,
        lat=lat,
        value=value,
        noga=noga,
        flags=np.zeros(n, dtype="uint8"),
        dist=dist,
        gemeinde_idx=np.arange(n, dtype="uint16"),
        gemeinden=entries,
    )


def stats(level: LevelData, *, source: LevelData | None = None) -> dict:
    """Kennzahlen. `ambiguousCells` zählt immer die Hektaren, auch auf höheren Stufen."""
    basis = source if source is not None else level
    ambiguous = int(((basis.flags & config.FLAG_AMBIGUOUS) > 0).sum())
    values = level.value
    # Change 2 (Beschäftigte je Einwohner, kantonsweit): `level.gemeinden`
    # trägt immer die vollständige, ungefilterte 196-Gemeinden-Tabelle (auch
    # auf der Gemeindestufe, deren `value`-Array durch `keep = value > 0`
    # gefiltert sein kann, siehe `build_municipality`) — die Summe hier ist
    # deshalb unabhängig von Stufe/Filter dieselbe Kantonsbevölkerung.
    population = (
        sum(_clean_population(e.get("einwohnerzahl", 0)) for e in level.gemeinden)
        if level.gemeinden is not None
        else 0
    )
    return {
        "min": float(values.min()) if values.size else 0.0,
        "max": float(values.max()) if values.size else 0.0,
        "sum": float(values.sum()),
        "p99": float(np.percentile(values, 99)) if values.size else 0.0,
        "ambiguousCells": ambiguous,
        "overstatementMax": 3 * ambiguous,
        "population": population,
    }


def stats_from_entries(level: LevelData, entries: list[dict]) -> dict:
    """Wie `stats()`, aber für Ebenen ohne eigene Hektar-`flags` — die nationale
    `kantone`-Übersicht (Phase 1): jede Zeile ist ein ganzer Kanton, nicht eine
    Hektare, `level.flags` ist deshalb durchgehend 0 und taugt hier nicht als
    Mehrdeutigkeits-Basis. `entries` trägt statt dessen `ambiguousCells`/
    `einwohnerzahl` bereits vorberechnet je Kanton (`cli.py` befüllt sie aus
    `stats(hectare)` dieses Kantons) — hier nur noch aufsummiert.
    """
    values = level.value
    ambiguous = sum(int(e.get("ambiguousCells", 0)) for e in entries)
    population = sum(_clean_population(e.get("einwohnerzahl", 0)) for e in entries)
    return {
        "min": float(values.min()) if values.size else 0.0,
        "max": float(values.max()) if values.size else 0.0,
        "sum": float(values.sum()),
        "p99": float(np.percentile(values, 99)) if values.size else 0.0,
        "ambiguousCells": ambiguous,
        "overstatementMax": 3 * ambiguous,
        "population": population,
    }


def assert_sums_match(hectare: LevelData, municipality: LevelData, canton: LevelData) -> None:
    """Harter Guard für `Σ Hektar = Σ Gemeinde = Kanton` (Spec 6.5) — geprüft an den
    tatsächlich für den aktuellen Lauf berechneten `LevelData`-Objekten, nicht nur an
    handkodierten 1–3-Zeilen-Fixtures wie in `test_aggregate.py`. Bis 2026-08-13 deckte
    ein Integrationstest dieselbe Invariante am committeten `ag_hektar`/`ag_gemeinde`/
    `ag_kanton`-Artefakt ab; seit `ag_hektar`/`ag_kanton` nicht mehr geschrieben werden
    (siehe README), gibt es diese Artefakte nicht mehr — die Invariante selbst ist aber
    unverändert scharf, weil `hectare`/`municipality`/`canton` weiterhin aus derselben
    Quelle im Speicher stehen. Ein Regressionsfehler in `build_municipality`/
    `build_canton` (z. B. ein falsch gesetzter `keep`-Filter) fiele hier auf, statt nur
    stillschweigend eine falsche Gemeindesumme auszuliefern.
    """
    hectare_sum = float(hectare.value.sum())
    municipality_sum = float(municipality.value.sum())
    canton_sum = float(canton.value.sum())
    if not math.isclose(hectare_sum, municipality_sum, rel_tol=1e-6):
        raise ValueError(
            f"Σ Hektar ({hectare_sum:,.3f}) != Σ Gemeinde ({municipality_sum:,.3f}) — "
            "Aggregations-Invariante aus Spec 6.5 verletzt."
        )
    if not math.isclose(municipality_sum, canton_sum, rel_tol=1e-6):
        raise ValueError(
            f"Σ Gemeinde ({municipality_sum:,.3f}) != Kanton ({canton_sum:,.3f}) — "
            "Aggregations-Invariante aus Spec 6.5 verletzt."
        )


def assert_minimum_hectare_value_is_four(hectare: LevelData) -> None:
    """Harter Guard: die kleinste `emp_total` über alle Hektaren muss exakt
    `config.AMBIGUOUS_VALUE` (4) sein. Das ist der empirische Beleg der BFS-Regel
    „Werte < 4 werden auf 4 aufgerundet" (Spec 6.4) an den echten Aargauer Daten — ohne
    diesen Beleg wäre die Aufrundungsregel nur eine aus der Variablenliste zitierte
    Behauptung, keine geprüfte Tatsache. Bis 2026-08-13 deckte ein Integrationstest das
    committete `ag_hektar`-Artefakt ab; das Artefakt ist entfallen (siehe README), die
    Prüfung selbst bleibt hier am intern berechneten `hectare`-Objekt bestehen.
    """
    if hectare.value.size == 0:
        return
    minimum = float(hectare.value.min())
    if minimum != config.AMBIGUOUS_VALUE:
        raise ValueError(
            f"Kleinster Hektarwert ist {minimum:,.3f}, erwartet exakt "
            f"{config.AMBIGUOUS_VALUE} — Aufrundungsregel aus Spec 6.4 verletzt."
        )
