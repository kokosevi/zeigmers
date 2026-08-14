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
    "companies-sync": "Ansicht A: neue SIX-Titel gegen Zefix/LINDAS abgleichen, CSV ergänzen",
    "companies-retry": "Ansicht A: nur die bisher sitzlosen Zeilen erneut abgleichen",
    "sanity-map": "2D-Kontrollkarte als PNG erzeugen",
    "all": "Alle Schritte in Reihenfolge ausführen",
}


def _write_municipality_geojson(rounded_municipalities, code: str):
    """Schreibt `<code>_boundaries.geojson` — erst mit `write_geojson()`s
    Aargau-kalibriertem Standardbudget (`config.MAX_BOUNDARIES_BYTES`,
    900 KB), das seine bestehende Rückfallschleife (Toleranz, halbe, viertel
    Toleranz) unverändert durchläuft. Nur wenn das für einen bevölkerungs-
    reichen Kanton (Bern) nicht reicht, ein zweiter Versuch mit dem grösseren
    `MAX_MUNICIPALITY_BOUNDARIES_BYTES_PER_CANTON`-Budget.

    Absichtlich ZWEI Aufrufe statt einmalig das grössere Budget zu übergeben:
    ein einzelner Aufruf mit dem grösseren Budget hätte für JEDEN Kanton schon
    beim ersten (feinsten) Simplify-Versuch durchgewunken, sobald der unter dem
    grösseren Budget lag — auch für Kantone, die unter dem ursprünglichen
    900-KB-Budget eigentlich noch eine gröbere, kleinere Stufe erreicht hätten.
    Für Aargau wäre das sogar noch schwerwiegender: die erste (30 %-)Stufe
    liegt für AG bei ~1.04 MB, über dem alten Budget — erst der Rückfall auf
    15 % ergibt die committeten 778 KB. Mit einem einzigen, grösseren Budget
    hätte AG die 30-%-Stufe behalten und wäre nicht mehr byte-identisch zum
    committeten Artefakt gewesen (siehe ETL-Report).
    """
    from . import boundaries

    try:
        return boundaries.write_geojson(rounded_municipalities, boundaries.geojson_path(code))
    except ValueError:
        return boundaries.write_geojson(
            rounded_municipalities, boundaries.geojson_path(code),
            max_bytes=config.MAX_MUNICIPALITY_BOUNDARIES_BYTES_PER_CANTON,
        )


def _run_statent(force: bool) -> dict:
    import json as _json

    from . import (aggregate, binpack, boundaries, columns, fetch,
                   inspect_statent, noga, plausibility, statent)

    table = noga.load_table()
    noga.generate_typescript(table, config.ROOT / "src" / "domain" / "noga.generated.ts")

    zip_path = fetch.download(
        fetch.swissboundaries_gpkg_url(),
        config.DATA_RAW / "swissboundaries3d.gpkg.zip",
        force=force,
    )

    # Alle 26 Kantone auf einmal (Phase 1, 2026-08-14: Ausweitung von einem
    # Kanton auf die ganze Schweiz) — eine GeoPackage-Lesung statt 26, siehe
    # `boundaries.build_all()`. Für den in `config.CANTON` konfigurierten
    # Kanton liefert dieser Pfad exakt dieselben Gemeinden wie zuvor
    # `boundaries.build(zip_path, config.CANTON["bfs_nr"])`.
    all_bounds = boundaries.build_all(zip_path)

    # Alle 26 Kantone, für die selbstgezeichnete Basiskarte (Change 3) — ersetzt
    # die bisherigen swisstopo-Vektorkacheln, siehe README/Spec Abschnitt 9/10.
    # Kantonsunabhängig (siehe `cantons_geojson_path()`), deshalb hier statt im
    # Pro-Kanton-Loop geschrieben.
    cantons_gdf = boundaries.build_cantons(zip_path)
    cantons_out = boundaries.write_geojson(
        cantons_gdf, boundaries.cantons_geojson_path(),
        simplify_percent=config.CANTON_SIMPLIFY_PERCENT,
        max_bytes=config.MAX_CANTONS_BYTES,
    )
    print(f"[boundaries] {len(cantons_gdf)} Kantone -> {cantons_out} "
          f"({cantons_out.stat().st_size / 1024:.0f} KB)")

    canton_names = {
        int(row.bfs_nr): str(row.name) for row in cantons_gdf.itertuples()
    }

    # `config.CANTON_CODES` ist eine feste, von Hand gepflegte Konstante
    # (siehe config.py) — hier gegen die tatsächliche Geometrie geprüft, statt
    # stillschweigend anzunehmen, dass sie noch zu jedem Jahrgang passt.
    from_geometry = set(all_bounds)
    from_cantons_layer = {int(n) for n in cantons_gdf["bfs_nr"]}
    if from_geometry != from_cantons_layer:
        raise ValueError(
            "Kantonsmenge aus Gemeinde- und Kantonsgrenzen weicht ab: "
            f"{from_geometry ^ from_cantons_layer}"
        )
    missing_codes = sorted(from_geometry - set(config.CANTON_CODES))
    if missing_codes:
        raise ValueError(
            f"Kein Kantonscode in config.CANTON_CODES für BFS-Nummern {missing_codes}"
        )

    statent_zip = fetch.download(
        fetch.statent_geodata_url(config.STATENT_YEAR),
        config.DATA_RAW / f"statent_{config.STATENT_YEAR}.zip",
        force=force,
    )
    member = inspect_statent.find_hectare_csv(statent_zip)
    frame = inspect_statent.read_hectare_csv(statent_zip, member)

    resolved = columns.resolve(frame.columns)
    columns.save(resolved, config.STATENT_YEAR)

    canton_index: list[dict] = []
    overview_rows: list[tuple[dict, aggregate.LevelData]] = []
    opening_canton: dict | None = None  # config.CANTON — für sanity-map/Rückgabewert

    # Sortiert nach BFS-Nummer: deterministisch über Läufe hinweg (Python-
    # `dict`-Iteration folgt der Einfügereihenfolge aus `build_all()`s
    # `groupby`, die selbst von pandas' interner Hash-Reihenfolge abhängen
    # könnte — `sorted()` hier macht die Lauf-Reihenfolge unabhängig davon).
    for canton_bfs_nr in sorted(all_bounds):
        bounds = all_bounds[canton_bfs_nr]
        code = config.CANTON_CODES[canton_bfs_nr]
        name = canton_names[canton_bfs_nr]

        # Eckenrundung nur für Gemeinden, auf der LV95-Geometrie vor der
        # Reprojektion nach WGS84 (siehe `round_municipality_corners`) —
        # Kantone bleiben unverändert, sie sind die durchgehende Basisplatte.
        rounded_municipalities = boundaries.round_municipality_corners(bounds.municipalities)
        boundaries_out = _write_municipality_geojson(rounded_municipalities, code)

        cells = statent.load_cells(frame, resolved, bounds.municipalities)
        hectare = aggregate.build_hectare(cells, table, bounds.municipalities)
        municipality = aggregate.build_municipality(hectare, bounds.municipalities)
        canton_level = aggregate.build_canton(hectare, bounds.canton_lv95)

        # Harte Guards gegen die tatsächlich heruntergeladenen Daten, nicht nur gegen
        # 1-3-Zeilen-Fixtures in test_aggregate.py: Aggregations-Invariante (Spec 6.5)
        # und der empirische Beleg der BFS-Aufrundungsregel (Spec 6.4) — jetzt je
        # Kanton geprüft, nicht nur einmal national, jeder Fehler nennt den Kanton.
        try:
            aggregate.assert_sums_match(hectare, municipality, canton_level)
            aggregate.assert_minimum_hectare_value_is_four(hectare)
        except ValueError as exc:
            raise ValueError(f"[{code}] {exc}") from exc

        # Nur noch die Gemeindestufe wird je Kanton ausgeliefert (Entscheid vom
        # 2026-08-13, siehe README): View B zeigt ausschliesslich Gemeindebalken.
        # Die Hektarstufe wird weiterhin berechnet — die Gemeindeaggregation UND
        # die Mehrdeutigkeits-Zählung je Gemeinde hängen direkt an ihr — nur der
        # `binpack.write_level`-Aufruf dafür entfällt.
        stats_municipality = aggregate.stats(municipality, source=hectare)
        binpack.write_level(
            municipality, table, config.PUBLIC_DATA,
            year=config.STATENT_YEAR, canton=code,
            extra={"stats": stats_municipality},
        )

        # Plausibilitätsfenster (Spec 6.4/6.5) je Kanton gegen seine eigene
        # BFS-Referenz und seinen eigenen NOLOC-Anteil — nicht nur einmal
        # national. `canton_reference()`/`noloc_employees()` leiten den
        # Gemeindenummern-Bereich aus `bounds.municipalities["bfs_nr"]` dieses
        # Kantons her; siehe ETL-Report für die Prüfung, dass dieser Bereich
        # für alle 26 Kantone sauber ist (kein Nachbarkanton im Bereich).
        reference = statent.canton_reference(statent_zip, resolved, bounds.municipalities)
        noloc = statent.noloc_employees(statent_zip, resolved, bounds.municipalities)
        total = canton_level.value[0]
        s = aggregate.stats(hectare)
        base_lower = reference - noloc
        base_upper = reference + s["overstatementMax"]
        # Zwei Kantone verletzen dieses Fenster aus einem Grund, der nicht
        # Rundung/NOLOC ist, aber einzeln benennbar und betragsscharf belegt
        # ist (Moutiers Kantonswechsel 2026 für Jura, das Dreispitz-Areal für
        # Basel-Stadt) — siehe `plausibility.py` für Begründung und Quellen.
        # `widen()` verschiebt GENAU EINE Grenze um GENAU den belegten
        # Betrag; ein Kanton ohne Eintrag bekommt unveränderte Grenzen. Der
        # Guard selbst bleibt hart: ein Verstoss über die (ggf. geweiteten)
        # Grenzen hinaus bricht den Lauf ab, für jeden Kanton gleichermassen.
        lower, upper, exceptions = plausibility.widen(code, base_lower, base_upper)
        deviation = (total - reference) / reference if reference else 0.0

        exceptions_note = ""
        if exceptions:
            parts = ", ".join(f"{e.direction}+{e.amount:,.0f}" for e in exceptions)
            exceptions_note = f"  [Ausnahme: {parts}]"
        print(
            f"[statent] {code:>2} {name:<24} Gemeinden {municipality.count:3d}  "
            f"Beschäftigte {total:>9,.0f}  Referenz {reference:>9,.0f} ({deviation:+.2%})  "
            f"Plausibel [{lower:,.0f} .. {upper:,.0f}]{exceptions_note}  "
            f"Grenzen -> {boundaries_out.name} ({boundaries_out.stat().st_size / 1024:.0f} KB)"
        )

        if not (lower <= total <= upper):
            side = "unterhalb der unteren" if total < lower else "oberhalb der oberen"
            exceptions_text = (
                f", inkl. dokumentierter Ausnahme(n) {exceptions_note.strip()}"
                if exceptions else ""
            )
            raise ValueError(
                f"[{code}] Kantonssumme {total:,.0f} liegt {side} Grenze des "
                f"Plausibilitätsfensters [{lower:,.0f} .. {upper:,.0f}]{exceptions_text} "
                f"(BFS-Referenz {reference:,.0f}, NOLOC-Anteil {noloc:,.0f}, "
                f"Aufrundung bis {s['overstatementMax']:,}). Das deutet auf einen "
                "Verschnitt- oder Spaltenfehler hin, nicht auf Rundung — oder auf "
                "eine bisher unbekannte, noch nicht in plausibility.py dokumentierte "
                "Ursache."
            )

        canton_index.append({
            "code": code, "bfsNr": canton_bfs_nr, "name": name,
            "gemeindeCount": municipality.count, "employment": total,
        })
        overview_rows.append((
            {
                "bfsNr": canton_bfs_nr, "code": code, "name": name,
                "ambiguousCells": s["ambiguousCells"], "einwohnerzahl": s["population"],
            },
            canton_level,
        ))

        if canton_bfs_nr == config.CANTON["bfs_nr"]:
            opening_canton = {
                "hectare": hectare, "municipality": municipality, "canton": canton_level,
                "bounds": bounds, "reference": reference, "noloc": noloc,
                "plausible": (lower, upper),
            }

    if opening_canton is None:
        raise ValueError(
            f"Konfigurierter Kanton {config.CANTON} kommt in den Gemeindegrenzen nicht vor."
        )

    # Nationale Übersichtsstufe `ch_kantone`: eine Zeile je Kanton, dieselben
    # Felder wie eine Gemeindezeile (Beschäftigte, dominante Branchengruppe,
    # volle Mischung, Mehrdeutigkeit, Einwohnerzahl) — für die künftige
    # Kantons-Übersicht der Karte (Phase 2), hier nur produziert, nicht
    # konsumiert (siehe Aufgabenstellung: "This phase produces data only").
    national = aggregate.build_national_cantons(overview_rows)
    national_stats = aggregate.stats_from_entries(national, [e for e, _ in overview_rows])
    binpack.write_level(
        national, table, config.PUBLIC_DATA,
        year=config.STATENT_YEAR, canton="CH",
        extra={"stats": national_stats},
        entries_key="kantone",
    )
    print(f"[statent] National  : {national.count} Kantone, "
          f"{national_stats['sum']:,.0f} Beschäftigte, "
          f"{national_stats['population']:,.0f} Einwohner")

    meta = {
        "canton": config.CANTON,
        "year": config.STATENT_YEAR,
        "levels": ["gemeinde", "kantone"],
        "source": "Bundesamt für Statistik (BFS), STATENT",
        "hectareCsv": member,
        "cantons": sorted(canton_index, key=lambda c: c["bfsNr"]),
    }
    (config.PUBLIC_DATA / "meta.json").write_text(
        _json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    result = dict(opening_canton)
    result["national"] = national
    result["cantons_gdf"] = cantons_gdf
    return result


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

        # Alle 26 Kantone (Phase 1) — nicht mehr nur `config.CANTON`, siehe
        # `boundaries.build_all()`.
        all_bounds = boundaries.build_all(zip_path)
        total_municipalities = 0
        for canton_bfs_nr in sorted(all_bounds):
            b = all_bounds[canton_bfs_nr]
            code = config.CANTON_CODES[canton_bfs_nr]
            rounded_municipalities = boundaries.round_municipality_corners(b.municipalities)
            out = _write_municipality_geojson(rounded_municipalities, code)
            total_municipalities += len(b.municipalities)
            print(f"[boundaries] {code} {len(b.municipalities):3d} Gemeinden, "
                  f"{b.canton_lv95.area / 1e6:.0f} km2 -> {out} "
                  f"({out.stat().st_size / 1024:.0f} KB)")
        print(f"[boundaries] Total: {total_municipalities} Gemeinden in "
              f"{len(all_bounds)} Kantonen")

        cantons = boundaries.build_cantons(zip_path)
        cantons_out = boundaries.write_geojson(
            cantons, boundaries.cantons_geojson_path(),
            simplify_percent=config.CANTON_SIMPLIFY_PERCENT,
            max_bytes=config.MAX_CANTONS_BYTES,
        )
        print(f"[boundaries] {len(cantons)} Kantone -> {cantons_out} "
              f"({cantons_out.stat().st_size / 1024:.0f} KB)")
        return 0

    if args.command in ("statent", "all", "sanity-map"):
        result = _run_statent(args.force)
        if args.command == "statent":
            return 0

        # `all` und `sanity-map` laufen weiter, bis hierhin identisch: die
        # Kontrollkarte braucht die Gemeindestufe aus `_run_statent`. Kein
        # vorzeitiges `return` bei `all` — sonst wird companies.json nie
        # geschrieben.
        from . import sanity_map

        out = sanity_map.render(
            result["municipality"], result["bounds"].municipalities,
            config.DATA_INTERIM / "sanity_gemeinde.png",
        )
        print(f"[sanity-map] {out}")
        if args.command == "sanity-map":
            return 0

    if args.command in ("companies", "all"):
        from . import companies, fetch, geocode, noga

        path = companies.csv_path()
        rows = companies.load_csv(path)

        # Ein Fehlschlag für EINE Adresse (siehe `geocode.fill_missing`,
        # Kommentar zum Swisscom/"3050 Bern"-Fall) darf weder den ganzen
        # Build abbrechen noch stillschweigend eine Zeile mit bekannter,
        # aber nicht platzierbarer Adresse als „lon fehlt" durchfallen
        # lassen — die Zeile behält ihre Identität, verliert aber Sitz und
        # Koordinaten und wird damit zu einer Zeile ohne Marker (wie ein
        # Titel ohne Zefix-Treffer), statt den Build zu blockieren.
        geocode_failures: list[tuple[dict, LookupError]] = []
        filled = geocode.fill_missing(
            rows, on_failure=lambda row, exc: geocode_failures.append((row, exc))
        )
        for row, exc in geocode_failures:
            # Adresse NICHT löschen: sie kommt aus GLEIF und ist echt, nur
            # der Geokodierungsdienst kam damit nicht zurecht. Ein späterer
            # Lauf (besserer Rückfall, behobener Dienst) kann sie erneut
            # versuchen — die frühere Löschung nahm ihm die Grundlage.
            # Die Zeile bleibt bis dahin ohne Marker.
            print(f"[companies] Geokodierung fehlgeschlagen für {row['name']!r} "
                  f"({row.get('geocode_query')!r}): {exc} — Zeile behält die "
                  f"Adresse, bleibt aber ohne Marker.")
        if filled or geocode_failures:
            companies.write_csv(path, rows)
            print(f"[companies] {filled} Zeilen neu geokodiert und persistiert"
                  + (f", {len(geocode_failures)} ohne Treffer zurückgesetzt"
                     if geocode_failures else ""))

        companies.validate(rows)

        # Live abgefragt statt hartkodiert (Phase 3, Auftrag: "the number
        # must be current and reproducible, and it must carry its retrieval
        # date"): scheitert der Endpunkt, bricht der Build hart ab (siehe
        # `fetch_six_titles`) statt still auf eine veraltete Zahl
        # zurückzufallen.
        six = companies.fetch_six_titles()
        # `totalListed` ist die Zahl, die SIX selbst als kotierte Titel
        # ausweist (Auftrag: „8 von 224 kotierten Gesellschaften recherchiert"
        # — 224 war das gemessene Ergebnis am 2026-08-14) — bewusst die rohe
        # Titelzahl, nicht `len(rows)`/die Zahl nach Zusammenfassung von
        # Namen-/PS-Aktie und 2. Handelslinie (`group_six_titles`, 202 am
        # selben Stichtag): `len(rows)` wäre ausserdem nur so lange richtig,
        # wie die CSV exakt den aktuellen SIX-Stand widerspiegelt — bei einer
        # neuen Kotierung seit dem letzten `companies-sync`-Lauf liefe die
        # Karte sonst mit einer stillschweigend veralteten Zahl weiter.
        six_meta = {"totalListed": len(six["titles"]), "retrievedAt": six["retrievedAt"]}

        # Jahresmittelkurse der SNB für die Säulenhöhe (siehe `fx.py`): ohne
        # sie vergliche die Höhe CHF, EUR und USD, als wären sie dasselbe.
        # Der Datensatz wird wie alle Rohdaten gecacht — ein zweiter Build
        # lädt nichts nach und rechnet mit denselben Kursen.
        from . import fx

        fx_path = fx.cache_path()
        fx_path.parent.mkdir(parents=True, exist_ok=True)
        if args.force or not fx_path.exists():
            fetch.download(fx.SNB_URL, fx_path, force=args.force)
        monthly_fx = fx.parse(fx_path.read_text(encoding="utf-8-sig"))

        artifact = companies.build_artifact(
            rows, noga.load_table(), six_meta=six_meta, monthly_fx=monthly_fx,
        )
        stats = artifact["stats"]
        if stats["fxMissing"]:
            print(f"[companies] {len(stats['fxMissing'])} Umrechnung(en) offen — "
                  f"Höhen bleiben in Berichtswährung:")
            for miss in stats["fxMissing"]:
                print(f"    {miss['name']}: {miss['error']}")
        elif stats["revenueInChf"]:
            rates = ", ".join(
                f"{key} {value['rate']:.4f}"
                + ("" if value["months"] == 12 else f" ({value['months']} Mt.)")
                for key, value in sorted(stats["fxRates"].items())
            )
            print(f"[companies] Höhen in CHF, SNB-Jahresmittel: {rates or 'nur CHF'}")
        out = config.PUBLIC_DATA / "companies.json"
        out.write_text(json.dumps(artifact, ensure_ascii=False), encoding="utf-8")
        print(f"[companies] {artifact['stats']['count']} Firmen platziert "
              f"({artifact['stats']['researched']} recherchiert von "
              f"{artifact['stats']['totalListed']} kotierten Titeln, "
              f"SIX-Stand {artifact['stats']['sixRetrievedDate']}), "
              f"{artifact['stats']['withRevenue']} mit Umsatz -> {out}")
        if args.command == "companies":
            return 0

    if args.command == "companies-sync":
        from . import companies

        path = companies.csv_path()
        report = companies.sync_national_csv(path, on_progress=print)
        print(
            f"[companies-sync] SIX-Stand {report['retrievedAt']}: "
            f"{report['totalTitles']} Titel, {report['totalCompanies']} Gesellschaften "
            f"(nach Zusammenfassung von Namen-/PS-Aktie und 2. Handelslinie); "
            f"{report['alreadyKnown']} bereits bekannt, {report['added']} neu angelegt "
            f"({len(report['matched'])} Sitz gefunden, {len(report['ambiguous'])} mehrdeutig, "
            f"{len(report['unmatched'])} kein Treffer, {len(report['errors'])} Netzwerkfehler "
            f"nach Wiederholung — erneuter Lauf greift diese wieder auf) -> {path}"
        )
        if report["sharedAddresses"]:
            print(f"[companies-sync] {len(report['sharedAddresses'])} Sitzadresse(n) "
                  "mit mehr als einer neuen Gesellschaft:")
            for addr, names in report["sharedAddresses"].items():
                print(f"    {addr}: {', '.join(names)}")
        return 0

    if args.command == "companies-retry":
        # Zweiter Anlauf NUR für die Zeilen ohne Sitz — gedacht für den Fall,
        # dass am Matcher etwas verbessert wurde (neue Abkürzungsauflösung,
        # neue Umlaut-Regel) und man nicht alle 202 Gesellschaften erneut
        # abfragen will (~15 Minuten gegenüber ~3). Ohne Codeänderung ist der
        # Lauf seit `ORDER BY ?company` in `_SEAT_QUERY` folgenlos: dieselbe
        # Abfrage liefert dieselbe Trefferliste, also dasselbe Ergebnis. Genau
        # das ist beabsichtigt — vorher konnte ein blosser Wiederholungslauf
        # zufällig einen anderen Ausschnitt erwischen und einen Sitz
        # „finden", der sich beim nächsten Mal wieder verflüchtigt hätte.
        from . import companies

        path = companies.csv_path()
        rows = companies.load_csv(path)
        report = companies.retry_unmatched_rows(rows, on_progress=print)
        companies.write_csv(path, rows)
        print(
            f"[companies-retry] {len(report['matched'])} Sitz nachgetragen, "
            f"{len(report['ambiguous'])} weiterhin mehrdeutig, "
            f"{len(report['still_unmatched'])} weiterhin ohne Treffer, "
            f"{len(report['errors'])} Netzwerkfehler -> {path}"
        )
        return 0

    if args.command == "all":
        # Zwei Budgets statt eines Gesamtbudgets (siehe config.py): die Karte
        # lädt beim Start nur die nationale Übersicht, danach je nur noch ein
        # einzelnes Kanton-Paar — die Summe über alle 26 Kantone sagt nichts
        # über die tatsächliche Netzlast.
        startup_names = (
            "meta.json", "ch_kantone.bin", "ch_kantone.json",
            "ch_kantone.geojson", "companies.json",
        )
        startup_total = sum(
            (config.PUBLIC_DATA / name).stat().st_size
            for name in startup_names if (config.PUBLIC_DATA / name).exists()
        )
        print(f"[all] Start-Payload: {startup_total / 1024:.0f} KB "
              f"(Budget {config.MAX_STARTUP_BYTES / 1024:.0f} KB)")

        canton_payloads: dict[str, int] = {}
        for code in config.CANTON_CODES.values():
            parts = [
                config.PUBLIC_DATA / f"{code.lower()}_gemeinde.bin",
                config.PUBLIC_DATA / f"{code.lower()}_gemeinde.json",
                config.PUBLIC_DATA / f"{code.lower()}_boundaries.geojson",
            ]
            if all(p.exists() for p in parts):
                canton_payloads[code] = sum(p.stat().st_size for p in parts)

        failed = startup_total > config.MAX_STARTUP_BYTES
        if failed:
            print("[all] FEHLER: Start-Payload-Budget überschritten")

        if canton_payloads:
            worst_code, worst_size = max(canton_payloads.items(), key=lambda kv: kv[1])
            print(f"[all] Grösstes Kanton-Paket: {worst_code} {worst_size / 1024:.0f} KB "
                  f"(Budget {config.MAX_CANTON_PAYLOAD_BYTES / 1024:.0f} KB, "
                  f"{len(canton_payloads)} Kantone geschrieben)")
            if worst_size > config.MAX_CANTON_PAYLOAD_BYTES:
                print("[all] FEHLER: Kanton-Paket-Budget überschritten")
                failed = True

        return 1 if failed else 0

    print(f"[draufsicht-etl] {args.command} — noch nicht implementiert")
    return 0


def run() -> None:
    sys.exit(main())


# `python -m draufsicht_etl.cli …` lief ohne diesen Block stillschweigend
# durch: das Modul wurde importiert, `main()` nie aufgerufen, Exit-Code 0 —
# ein Aufruf, der Erfolg meldet und nichts getan hat. Das offizielle
# Kommando ist zwar das Konsolenskript `draufsicht-etl` (siehe README und
# `package.json`s `build:data`), aber `-m` ist der naheliegende Griff, wenn
# das Skript nicht im PATH liegt, und darf dann nicht ins Leere laufen.
if __name__ == "__main__":
    run()
