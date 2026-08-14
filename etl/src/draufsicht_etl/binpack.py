"""Binärformat: konkatenierte typisierte Arrays plus Metadaten-JSON.

deck.gl konsumiert die Arrays ohne Umkopieren als Binary Attributes. Deshalb
werden sie in absteigender Elementgrösse geschrieben und auf ihre natürliche
Ausrichtung aufgefüllt.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import config
from .aggregate import LevelData, top3
from .noga import NogaTable

_TYPE_NAMES = {
    np.dtype("float32"): "Float32",
    np.dtype("uint16"): "Uint16",
    np.dtype("uint8"): "Uint8",
}


def _collect(level: LevelData) -> dict[str, np.ndarray]:
    positions = np.empty(level.count * 2, dtype="float32")
    positions[0::2] = level.lon
    positions[1::2] = level.lat

    arrays: dict[str, np.ndarray] = {
        "positions": positions,
        "values": level.value.astype("float32"),
    }

    if level.name == "hektar":
        groups, values = top3(level.dist.astype("float64"))
        arrays["mixValue"] = values.reshape(-1)
        arrays["mixGroup"] = groups.reshape(-1)
    else:
        arrays["dist"] = level.dist.astype("float32").reshape(-1)

    # Auch die Gemeindestufe braucht den Verweis: Gemeinden ohne Beschäftigte
    # werden verworfen, Zeilenindex und Gemeindetabelle laufen sonst auseinander.
    if level.gemeinde_idx is not None:
        arrays["gemeindeIdx"] = level.gemeinde_idx.astype("uint16")

    arrays["noga"] = level.noga.astype("uint8")
    arrays["flags"] = level.flags.astype("uint8")
    return arrays


_ORDER = ("positions", "values", "dist", "mixValue", "gemeindeIdx", "mixGroup", "noga", "flags")


def write_level(
    level: LevelData,
    table: NogaTable,
    out_dir: Path,
    *,
    year: int,
    canton: str,
    extra: dict | None = None,
    entries_key: str = "gemeinden",
) -> tuple[Path, Path]:
    arrays = _collect(level)
    out_dir.mkdir(parents=True, exist_ok=True)

    blob = bytearray()
    spec: dict[str, dict] = {}
    for name in _ORDER:
        array = arrays.get(name)
        if array is None:
            continue
        alignment = array.dtype.itemsize
        padding = (-len(blob)) % alignment
        blob.extend(b"\x00" * padding)
        spec[name] = {
            "byteOffset": len(blob),
            "length": int(array.size),
            "type": _TYPE_NAMES[array.dtype],
        }
        blob.extend(array.tobytes())

    stem = f"{canton.lower()}_{level.name}"
    bin_path = out_dir / f"{stem}.bin"
    json_path = out_dir / f"{stem}.json"
    bin_path.write_bytes(bytes(blob))

    meta: dict = {
        "level": level.name,
        "year": year,
        "canton": canton,
        "count": level.count,
        "arrays": spec,
        "nogaGroups": [
            {"key": g.key, "label": g.label, "color": g.color} for g in table.groups
        ],
        "unknownColor": table.unknown_color,
        "unknownIndex": config.NOGA_UNKNOWN_INDEX,
    }
    if level.gemeinden is not None:
        meta[entries_key] = level.gemeinden
    if extra:
        meta.update(extra)

    json_path.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return bin_path, json_path


_NUMPY_TYPES = {"Float32": "float32", "Uint16": "uint16", "Uint8": "uint8"}


def read_level(bin_path: Path, json_path: Path) -> tuple[dict[str, np.ndarray], dict]:
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    blob = bin_path.read_bytes()
    arrays = {
        name: np.frombuffer(
            blob,
            dtype=_NUMPY_TYPES[s["type"]],
            count=s["length"],
            offset=s["byteOffset"],
        )
        for name, s in meta["arrays"].items()
    }
    return arrays, meta
