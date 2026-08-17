"""Inspektionsbericht. Legt offen, was in den Rohdaten steht — transformiert nichts."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

import pandas as pd

from . import config


def find_hectare_csv(zip_path: Path) -> str:
    with zipfile.ZipFile(zip_path) as zf:
        csvs = [i for i in zf.infolist() if i.filename.lower().endswith(".csv")]
        if not csvs:
            names = [i.filename for i in zf.infolist()]
            raise LookupError(f"Kein CSV in {zip_path.name}; enthalten: {names}")
        return max(csvs, key=lambda i: i.file_size).filename


def read_hectare_csv(zip_path: Path, member: str, nrows: int | None = None) -> pd.DataFrame:
    """STATENT-CSV ist semikolongetrennt und latin-1-kodiert."""
    with zipfile.ZipFile(zip_path) as zf, zf.open(member) as handle:
        return pd.read_csv(handle, sep=";", encoding="latin-1", nrows=nrows, low_memory=False)


def _scalar(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    return value.item() if hasattr(value, "item") else value


def profile_columns(frame: pd.DataFrame) -> list[dict]:
    profile = []
    for name in frame.columns:
        series = frame[name]
        numeric = pd.to_numeric(series, errors="coerce")
        profile.append(
            {
                "name": str(name),
                "dtype": str(series.dtype),
                "min": _scalar(numeric.min()),
                "max": _scalar(numeric.max()),
                "nulls": int(series.isna().sum()),
                "distinct": int(series.nunique(dropna=True)),
            }
        )
    return profile


def run(zip_path: Path, out: Path) -> dict:
    with zipfile.ZipFile(zip_path) as zf:
        members = [
            {"name": i.filename, "bytes": i.file_size} for i in sorted(
                zf.infolist(), key=lambda i: -i.file_size
            )
        ]

    member = find_hectare_csv(zip_path)
    frame = read_hectare_csv(zip_path, member)

    report = {
        "zip": zip_path.name,
        "members": members,
        "hectareCsv": member,
        "rows": int(len(frame)),
        "columnCount": int(len(frame.columns)),
        "columns": profile_columns(frame),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report
