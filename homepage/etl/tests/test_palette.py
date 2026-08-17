"""Regressionstest: Die Palette bleibt auch bei simulierter Farbenblindheit
unterscheidbar. Simuliert Protanopie und Deuteranopie nach Machado et al.
(2009), Schweregrad 1.0, und verlangt einen Mindestabstand von 50.0 zwischen
allen Paaren — inklusive des reservierten Grau für "nicht bestimmbar".
"""

from __future__ import annotations

import numpy as np
import pytest

from zeigmers_etl import noga

PROT = np.array([
    [ 0.152286,  1.052583, -0.204868],
    [ 0.114503,  0.786281,  0.099216],
    [-0.003882, -0.048116,  1.051998],
])
DEUT = np.array([
    [ 0.367322,  0.860646, -0.227968],
    [ 0.280085,  0.672501,  0.047413],
    [-0.011820,  0.042940,  0.968881],
])

MIN_DISTANCE = 50.0


def _hex_to_srgb01(value: str) -> np.ndarray:
    return np.array([int(value[i : i + 2], 16) for i in (1, 3, 5)], dtype=float) / 255.0


def _srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(c: np.ndarray) -> np.ndarray:
    # Vor der Potenz auf [0, 1] clippen: die Simulationsmatrizen erzeugen leicht
    # negative Werte, und (-x) ** (1/2.4) liefert NaN, das Vergleiche stillschweigend
    # sinnlos macht (RuntimeWarning: invalid value encountered in power).
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def _simulate(hex_color: str, matrix: np.ndarray | None) -> np.ndarray:
    linear = _srgb_to_linear(_hex_to_srgb01(hex_color))
    if matrix is not None:
        linear = linear @ matrix.T
    return _linear_to_srgb(linear) * 255.0


def _palette() -> dict[str, str]:
    table = noga.load_table()
    colors = {group.key: group.color for group in table.groups}
    colors["unbekannt"] = table.unknown_color
    return colors


@pytest.mark.parametrize(
    "label,matrix",
    [("Normalsicht", None), ("Protanopie", PROT), ("Deuteranopie", DEUT)],
)
def test_palette_stays_distinguishable(label, matrix):
    colors = _palette()
    names = list(colors)
    simulated = {name: _simulate(colors[name], matrix) for name in names}

    min_distance = None
    min_pair = None
    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            distance = float(np.linalg.norm(simulated[a] - simulated[b]))
            if min_distance is None or distance < min_distance:
                min_distance, min_pair = distance, (a, b)

    assert min_distance >= MIN_DISTANCE, (
        f"{label}: engstes Paar {min_pair} liegt bei {min_distance:.1f}, "
        f"unter der geforderten Mindestdistanz {MIN_DISTANCE}"
    )
