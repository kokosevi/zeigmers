"""Spaltenauflösung über Muster statt fester Namen.

Die STATENT-Variablennamen tragen einen Präfix, der je Jahrgang wechselt
(`B23EMPT` gegenüber `B08EMPT`). Aufgelöst wird deshalb über Muster; der
Präfix muss über alle Rollen identisch sein.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from . import config

_SINGLE_ROLES = ("reli", "e_koord", "n_koord", "emp_total")


@dataclass(frozen=True)
class ResolvedColumns:
    prefix: str
    reli: str
    e_koord: str
    n_koord: str
    emp_total: str
    emp_div: dict[int, str]

    @property
    def division_numbers(self) -> list[int]:
        return sorted(self.emp_div)

    def to_dict(self) -> dict:
        return {
            "prefix": self.prefix,
            "reli": self.reli,
            "e_koord": self.e_koord,
            "n_koord": self.n_koord,
            "emp_total": self.emp_total,
            "emp_div": {str(k): v for k, v in sorted(self.emp_div.items())},
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ResolvedColumns":
        return cls(
            prefix=data["prefix"],
            reli=data["reli"],
            e_koord=data["e_koord"],
            n_koord=data["n_koord"],
            emp_total=data["emp_total"],
            emp_div={int(k): v for k, v in data["emp_div"].items()},
        )


def resolve(available: Iterable[str]) -> ResolvedColumns:
    names = [str(c).strip() for c in available]
    found: dict[str, str] = {}
    prefixes: set[str] = set()

    for role in _SINGLE_ROLES:
        pattern = re.compile(config.COLUMN_PATTERNS[role])
        hits = [n for n in names if pattern.fullmatch(n)]
        if not hits:
            raise LookupError(
                f"Rolle {role!r} (Muster {pattern.pattern}) trifft keine Spalte. "
                f"Vorhandene Spalten: {names[:40]}"
            )
        if len(hits) > 1:
            raise ValueError(f"Rolle {role!r} ist mehrdeutig: {hits}")
        found[role] = hits[0]
        match = pattern.fullmatch(hits[0])
        if match and "nn" in (match.groupdict() or {}):
            prefixes.add(match.group("nn"))

    div_pattern = re.compile(config.COLUMN_PATTERNS["emp_div"])
    emp_div: dict[int, str] = {}
    for name in names:
        match = div_pattern.fullmatch(name)
        if not match:
            continue
        prefixes.add(match.group("nn"))
        division = int(match.group("div"))
        if division in emp_div:
            raise ValueError(f"Abteilung {division} mehrfach: {emp_div[division]}, {name}")
        emp_div[division] = name

    if not emp_div:
        raise LookupError(
            f"Keine Abteilungsspalten gefunden (Muster {div_pattern.pattern})"
        )
    if len(prefixes) != 1:
        raise ValueError(f"Spaltenpräfix ist uneinheitlich: {sorted(prefixes)}")

    return ResolvedColumns(prefix=prefixes.pop(), emp_div=emp_div, **found)


def _path(year: int) -> Path:
    return config.COLUMNS_DIR / f"statent_{year}.json"


def save(resolved: ResolvedColumns, year: int) -> Path:
    path = _path(year)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(resolved.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return path


def load(year: int) -> ResolvedColumns:
    return ResolvedColumns.from_dict(json.loads(_path(year).read_text(encoding="utf-8")))
