"""Kommandozeile. Jedes Subkommando ist ein eigener ETL-Schritt."""

from __future__ import annotations

import argparse
import json
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


def _run_statent(force: bool) -> dict:
    import json as _json

    from . import (aggregate, binpack, boundaries, columns, fetch,
                   inspect_statent, noga, statent)

    table = noga.load_table()
    noga.generate_typescript(table, config.ROOT / "src" / "domain" / "noga.generated.ts")

    zip_path = fetch.download(
        fetch.swissboundaries_gpkg_url(),
        config.DATA_RAW / "swissboundaries3d.gpkg.zip",
        force=force,
    )
    bounds = boundaries.build(zip_path, config.CANTON["bfs_nr"])
    boundaries.write_geojson(bounds, config.PUBLIC_DATA / "ag_boundaries.geojson")

    statent_zip = fetch.download(
        fetch.statent_geodata_url(config.STATENT_YEAR),
        config.DATA_RAW / f"statent_{config.STATENT_YEAR}.zip",
        force=force,
    )
    member = inspect_statent.find_hectare_csv(statent_zip)
    frame = inspect_statent.read_hectare_csv(statent_zip, member)

    resolved = columns.resolve(frame.columns)
    columns.save(resolved, config.STATENT_YEAR)

    cells = statent.load_cells(frame, resolved, bounds.municipalities)
    hectare = aggregate.build_hectare(cells, table, bounds.municipalities)
    municipality = aggregate.build_municipality(hectare, bounds.municipalities)
    canton = aggregate.build_canton(hectare, bounds.canton_lv95)

    for level in (canton, municipality, hectare):
        binpack.write_level(
            level, table, config.PUBLIC_DATA,
            year=config.STATENT_YEAR, canton=config.CANTON["code"],
            extra={"stats": aggregate.stats(level, source=hectare)},
        )

    meta = {
        "canton": config.CANTON,
        "year": config.STATENT_YEAR,
        "levels": ["kanton", "gemeinde", "hektar"],
        "counts": {
            "kanton": canton.count,
            "gemeinde": municipality.count,
            "hektar": hectare.count,
        },
        "source": "Bundesamt für Statistik (BFS), STATENT",
        "hectareCsv": member,
    }
    (config.PUBLIC_DATA / "meta.json").write_text(
        _json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"[statent] Hektaren  : {hectare.count:,}")
    print(f"[statent] Gemeinden : {municipality.count}")
    print(f"[statent] Total     : {canton.value[0]:,.0f} Beschäftigte")
    s = aggregate.stats(hectare)
    print(f"[statent] Mehrdeutig: {s['ambiguousCells']:,} Hektaren "
          f"(Überschätzung bis {s['overstatementMax']:,})")

    # Statt einer geschätzten Toleranz ein Plausibilitätsfenster aus den zwei
    # bekannten, gegenläufigen Verzerrungen: die Aufrundung <4 -> 4 treibt die
    # Hektarsumme höchstens um `overstatementMax` nach oben, die NOLOC-Datensätze
    # (keine Hektarlage, deshalb nie in `hectare` enthalten) fehlen unten.
    reference = statent.canton_reference(statent_zip, resolved, bounds.municipalities)
    noloc = statent.noloc_employees(statent_zip, resolved, bounds.municipalities)
    total = canton.value[0]
    lower = reference - noloc
    upper = reference + s["overstatementMax"]
    deviation = (total - reference) / reference

    print(f"[statent] BFS-Referenz : {reference:,.0f} Beschäftigte "
          f"(amtliche Gemeinde-Aggregation)")
    print(f"[statent] Plausibel    : {lower:,.0f} .. {upper:,.0f} "
          f"(Ist {total:,.0f}, {deviation:+.2%})")
    print(f"[statent] davon Aufrundung bis +{s['overstatementMax']:,}, "
          f"NOLOC fehlend -{noloc:,.0f}")

    if not (lower <= total <= upper):
        side = "unterhalb der unteren" if total < lower else "oberhalb der oberen"
        raise ValueError(
            f"Kantonssumme {total:,.0f} liegt {side} Grenze des Plausibilitätsfensters "
            f"[{lower:,.0f} .. {upper:,.0f}] (BFS-Referenz {reference:,.0f}, "
            f"NOLOC-Anteil {noloc:,.0f}, Aufrundung bis {s['overstatementMax']:,}). "
            "Das deutet auf einen Verschnitt- oder Spaltenfehler hin, nicht auf Rundung."
        )

    return {"hectare": hectare, "municipality": municipality, "canton": canton,
            "bounds": bounds, "reference": reference, "noloc": noloc,
            "plausible": (lower, upper)}


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

    if args.command in ("statent", "all"):
        result = _run_statent(args.force)
        if args.command == "statent":
            return 0

        # `all` läuft weiter: Firmen (Task 15), Kontrollkarte, Budgetprüfung.
        # Kein vorzeitiges `return` — sonst wird companies.json nie geschrieben.
        from . import sanity_map

        out = sanity_map.render(
            result["municipality"], result["bounds"].municipalities,
            config.DATA_INTERIM / "sanity_gemeinde.png",
        )
        print(f"[sanity-map] {out}")

    if args.command in ("companies", "all"):
        import csv as _csv

        from . import companies, geocode, noga

        path = config.DATA_MANUAL / "ag_listed_companies.csv"
        rows = companies.load_csv(path)
        filled = geocode.fill_missing(rows)
        if filled:
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = _csv.DictWriter(handle, fieldnames=companies.CSV_COLUMNS)
                writer.writeheader()
                writer.writerows(rows)
            print(f"[companies] {filled} Zeilen neu geokodiert und persistiert")

        companies.validate(rows)
        artifact = companies.build_artifact(rows, noga.load_table())
        out = config.PUBLIC_DATA / "companies.json"
        out.write_text(json.dumps(artifact, ensure_ascii=False), encoding="utf-8")
        print(f"[companies] {artifact['stats']['count']} Firmen, "
              f"{artifact['stats']['withRevenue']} mit Umsatz -> {out}")
        if args.command == "companies":
            return 0

    if args.command == "all":
        total = sum(
            p.stat().st_size for p in config.PUBLIC_DATA.glob("*") if p.is_file()
        )
        print(f"[all] public/data: {total / 1024:.0f} KB "
              f"(Budget {config.MAX_PUBLIC_DATA_BYTES / 1024:.0f} KB)")
        if total > config.MAX_PUBLIC_DATA_BYTES:
            print("[all] FEHLER: Grössenbudget überschritten")
            return 1
        return 0

    print(f"[draufsicht-etl] {args.command} — noch nicht implementiert")
    return 0


def run() -> None:
    sys.exit(main())
