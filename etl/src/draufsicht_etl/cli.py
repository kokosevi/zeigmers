"""Kommandozeile. Jedes Subkommando ist ein eigener ETL-Schritt."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from . import config

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

    if args.command == "inspect-statent":
        from . import fetch, inspect_statent

        geo_url = fetch.statent_geodata_url(config.STATENT_YEAR)
        var_url = fetch.statent_variables_url()
        zip_path = fetch.download(
            geo_url, config.DATA_RAW / f"statent_{config.STATENT_YEAR}.zip",
            force=args.force,
        )
        fetch.download(
            var_url, config.DATA_RAW / "statent_variablenliste.xlsx", force=args.force
        )

        out = config.DATA_INTERIM / "statent_inspection.json"
        report = inspect_statent.run(zip_path, out)

        print(f"ZIP        : {report['zip']}")
        print(f"Hektar-CSV : {report['hectareCsv']}")
        print(f"Zeilen     : {report['rows']:,}")
        print(f"Spalten    : {report['columnCount']}")
        print("\nDateien im ZIP:")
        for m in report["members"][:15]:
            print(f"  {m['bytes']:>14,}  {m['name']}")
        print("\nErste 40 Spalten:")
        print(f"  {'Spalte':<16}{'dtype':<10}{'min':>12}{'max':>14}{'nulls':>10}{'distinct':>10}")
        for c in report["columns"][:40]:
            print(f"  {c['name']:<16}{c['dtype']:<10}{str(c['min']):>12}"
                  f"{str(c['max']):>14}{c['nulls']:>10}{c['distinct']:>10}")
        print(f"\nVollständiger Bericht: {out}")
        return 0

    if args.command == "noga":
        from . import noga

        table = noga.load_table()
        out = config.ROOT / "src" / "domain" / "noga.generated.ts"
        noga.generate_typescript(table, out)
        print(f"[noga] {table.group_count} Gruppen, "
              f"{len(table.division_to_group)} Abteilungen -> {out}")
        return 0

    if args.command == "boundaries":
        from . import boundaries, fetch

        url = fetch.swissboundaries_gpkg_url()
        zip_path = fetch.download(
            url, config.DATA_RAW / "swissboundaries3d.gpkg.zip", force=args.force
        )
        b = boundaries.build(zip_path, config.CANTON["bfs_nr"])
        out = boundaries.write_geojson(b, config.PUBLIC_DATA / "ag_boundaries.geojson")
        print(f"[boundaries] {len(b.municipalities)} Gemeinden, "
              f"{b.canton_lv95.area / 1e6:.0f} km2 -> {out} "
              f"({out.stat().st_size / 1024:.0f} KB)")
        return 0

    print(f"[draufsicht-etl] {args.command} — noch nicht implementiert")
    return 0


def run() -> None:
    sys.exit(main())
