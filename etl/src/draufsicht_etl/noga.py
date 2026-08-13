"""NOGA-2008-Zuordnung: Abteilung → Abschnitt → Gruppe → Farbe.

Einzige Quelle der Wahrheit ist `etl/noga_groups.json`. Das TypeScript-Pendant
wird daraus erzeugt, damit ETL und Frontend nie auseinanderlaufen können.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from . import config

DEFAULT_PATH = config.ETL_DIR / "noga_groups.json"


@dataclass(frozen=True)
class GroupDef:
    key: str
    label: str
    color: str


@dataclass(frozen=True)
class NogaTable:
    groups: list[GroupDef]
    division_to_group: dict[int, int]
    division_to_section: dict[int, str]
    unknown_color: str

    @property
    def group_count(self) -> int:
        return len(self.groups)

    def group_index(self, division: int) -> int:
        try:
            return self.division_to_group[division]
        except KeyError as exc:
            raise KeyError(
                f"NOGA-Abteilung {division} ist in noga_groups.json nicht abgedeckt"
            ) from exc


def _parse_range(spec: str) -> list[int]:
    if "-" in spec:
        start, end = spec.split("-", 1)
        return list(range(int(start), int(end) + 1))
    return [int(spec)]


def load_table(path: Path | None = None) -> NogaTable:
    raw = json.loads((path or DEFAULT_PATH).read_text(encoding="utf-8"))

    # noga_groups.json und config.UNKNOWN_COLOR_HEX sind zwei unabhängige Quellen
    # für dieselbe Farbe. Ohne diesen Abgleich könnten sie stillschweigend
    # auseinanderlaufen, wenn nur eine der beiden Stellen geändert wird.
    if raw["unknownColor"].lower() != config.UNKNOWN_COLOR_HEX.lower():
        raise ValueError(
            "unknownColor in noga_groups.json "
            f"({raw['unknownColor']}) weicht von config.UNKNOWN_COLOR_HEX "
            f"({config.UNKNOWN_COLOR_HEX}) ab"
        )

    division_to_section: dict[int, str] = {}
    for section, spec in raw["sections"].items():
        for division in _parse_range(spec):
            if division in division_to_section:
                raise ValueError(f"Abteilung {division} mehrfach zugeordnet")
            division_to_section[division] = section

    groups = [GroupDef(g["key"], g["label"], g["color"]) for g in raw["groups"]]

    section_to_group: dict[str, int] = {}
    for index, group in enumerate(raw["groups"]):
        for section in group["sections"]:
            if section in section_to_group:
                raise ValueError(f"Abschnitt {section} mehrfach zugeordnet")
            section_to_group[section] = index

    unmapped = set(division_to_section.values()) - set(section_to_group)
    if unmapped:
        raise ValueError(f"Abschnitte ohne Gruppe: {sorted(unmapped)}")

    division_to_group = {
        division: section_to_group[section]
        for division, section in division_to_section.items()
    }

    return NogaTable(
        groups=groups,
        division_to_group=division_to_group,
        division_to_section=division_to_section,
        unknown_color=raw["unknownColor"],
    )


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def generate_typescript(table: NogaTable, out: Path) -> None:
    lines = [
        "// ERZEUGT AUS etl/noga_groups.json — NICHT VON HAND ÄNDERN.",
        "// Neu erzeugen mit: uv run --project etl draufsicht-etl noga",
        "",
        "export interface NogaGroup {",
        "  readonly key: string",
        "  readonly label: string",
        "  readonly color: readonly [number, number, number]",
        "}",
        "",
        "export const NOGA_GROUPS: readonly NogaGroup[] = [",
    ]
    for group in table.groups:
        r, g, b = _hex_to_rgb(group.color)
        # json.dumps liefert gültige TS-Stringliterale mit korrektem Escaping.
        # Ein nachträgliches replace("'", '"') würde Apostrophe in Labels zerstören.
        key = json.dumps(group.key, ensure_ascii=False)
        label = json.dumps(group.label, ensure_ascii=False)
        lines.append(f"  {{ key: {key}, label: {label}, color: [{r}, {g}, {b}] }},")
    r, g, b = _hex_to_rgb(table.unknown_color)
    lines += [
        "]",
        "",
        f"export const UNKNOWN_COLOR: readonly [number, number, number] = [{r}, {g}, {b}]",
        f"export const NOGA_UNKNOWN_INDEX = {config.NOGA_UNKNOWN_INDEX}",
        "",
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
