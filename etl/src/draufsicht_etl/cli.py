"""Kommandozeile. Jedes Subkommando ist ein eigener ETL-Schritt."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

COMMANDS: dict[str, str] = {
    "inspect-statent": "Rohdaten laden und Spaltenbericht ausgeben",
    "boundaries": "Kantons- und Gemeindegrenzen aufbereiten",
    "noga": "NOGA-Tabelle prüfen und TypeScript erzeugen",
    "statent": "Hektardaten aufbereiten und Artefakte schreiben",
    "companies": "Ansicht A: CSV validieren, geokodieren, Artefakt schreiben",
    "sanity-map": "2D-Kontrollkarte als PNG erzeugen",
    "all": "Alle Schritte in Reihenfolge ausführen",
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="draufsicht-etl")
    parser.add_argument(
        "--force", action="store_true", help="Downloads erneut laden, Cache ignorieren"
    )
    sub = parser.add_subparsers(dest="command", required=True)
    for name, help_text in COMMANDS.items():
        sub.add_parser(name, help=help_text)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(f"[draufsicht-etl] {args.command} — noch nicht implementiert")
    return 0


def run() -> None:
    sys.exit(main())
