import csv
import json
import urllib.parse

import pytest

from zeigmers_etl import companies, noga


def _row(**overrides):
    row = {c: "" for c in companies.CSV_COLUMNS}
    row.update(
        {
            "uid": "CHE-100.000.001",
            "name": "Beispiel AG",
            "six_symbol": "BSP",
            "isin": "CH0000000001",
            "street": "Bahnhofstrasse 1",
            "zip": "5000",
            "city": "Aarau",
            "lon": "8.0442",
            "lat": "47.3903",
            "geocode_query": "Bahnhofstrasse 1 5000 Aarau",
            "noga_group": "industrie",
            "revenue": "1250000000",
            "revenue_currency": "CHF",
            "revenue_type": "net_sales",
            "revenue_unit": "1",
            "employees": "3400",
            "fiscal_year": "2024",
            "report_url": "https://example.test/gb2024.pdf",
            "researched": "yes",
        }
    )
    row.update(overrides)
    return row


def test_validate_accepts_a_complete_row():
    companies.validate([_row()])


def test_validate_rejects_revenue_without_report_url():
    with pytest.raises(ValueError, match="report_url"):
        companies.validate([_row(report_url="")])


def test_validate_rejects_revenue_without_fiscal_year():
    with pytest.raises(ValueError, match="fiscal_year"):
        companies.validate([_row(fiscal_year="")])


def test_validate_rejects_revenue_without_currency():
    with pytest.raises(ValueError, match="revenue_currency"):
        companies.validate([_row(revenue_currency="")])


def test_validate_rejects_revenue_without_revenue_type():
    with pytest.raises(ValueError, match="revenue_type"):
        companies.validate([_row(revenue_type="")])


def test_validate_rejects_revenue_without_revenue_unit():
    # Ohne diese Pflicht liest build_artifact() ein leeres revenue_unit als
    # Faktor 1 (`float(row.get("revenue_unit") or 1)`) und verschiebt eine in
    # Millionen gemeldete Zahl unbemerkt um den Faktor 10**6 — siehe I4 im
    # Abschluss-Review.
    with pytest.raises(ValueError, match="revenue_unit"):
        companies.validate([_row(revenue_unit="")])


def test_validate_rejects_unknown_revenue_type():
    with pytest.raises(ValueError, match="unbekannt"):
        companies.validate([_row(revenue_type="ebitda")])


def test_validate_allows_empty_revenue_with_a_note():
    companies.validate([_row(revenue="", revenue_currency="", fiscal_year="",
                             report_url="", note="Umsatz nicht öffentlich")])


def test_validate_requires_a_note_when_revenue_is_empty():
    with pytest.raises(ValueError, match="note"):
        companies.validate([_row(revenue="", revenue_currency="", fiscal_year="",
                                 report_url="", note="")])


def test_validate_rejects_missing_coordinates():
    with pytest.raises(ValueError, match="lon"):
        companies.validate([_row(lon="")])


def test_validate_rejects_unknown_noga_group():
    with pytest.raises(ValueError, match="unbekannt"):
        companies.validate([_row(noga_group="raumfahrt")])


def test_validate_reports_every_violation_at_once():
    with pytest.raises(ValueError) as info:
        companies.validate([_row(report_url="", lon="")])
    message = str(info.value)
    assert "report_url" in message and "lon" in message


def test_validate_rejects_duplicate_uid():
    with pytest.raises(ValueError, match="doppelt"):
        companies.validate([_row(), _row(name="Andere AG")])


def test_build_artifact_carries_source_urls():
    table = noga.load_table()
    artifact = companies.build_artifact([_row()], table)
    entry = artifact["companies"][0]
    assert entry["reportUrl"] == "https://example.test/gb2024.pdf"
    assert entry["fiscalYear"] == 2024
    assert entry["revenue"] == 1_250_000_000
    assert entry["nogaGroupIndex"] == next(
        i for i, g in enumerate(table.groups) if g.key == "industrie"
    )
    assert entry["revenueType"] == "net_sales"


def test_build_artifact_marks_rows_without_revenue():
    table = noga.load_table()
    artifact = companies.build_artifact(
        [_row(revenue="", revenue_currency="", fiscal_year="", report_url="",
              note="Umsatz nicht öffentlich")],
        table,
    )
    assert artifact["companies"][0]["revenue"] is None
    assert artifact["companies"][0]["placeholder"] is True


def test_validate_accepts_a_complete_row_with_profit_and_founding_year():
    companies.validate([_row(
        profit="45000000", profit_currency="CHF", profit_unit="1",
        consolidation_basis="total_group",
        core_products="Beispielprodukte", founding_year="1950",
        founding_year_source="https://example.test/history",
    )])


def test_validate_rejects_profit_without_report_url():
    with pytest.raises(ValueError, match="profit gesetzt, aber report_url"):
        companies.validate([_row(
            profit="45000000", profit_currency="CHF", profit_unit="1", report_url="",
            consolidation_basis="total_group",
            # revenue leer machen, damit nicht die revenue-Regel denselben Fehler meldet
            revenue="", revenue_currency="", revenue_type="", revenue_unit="",
            fiscal_year="", note="Umsatz nicht öffentlich",
        )])


def test_validate_rejects_profit_without_fiscal_year():
    with pytest.raises(ValueError, match="profit gesetzt, aber fiscal_year"):
        companies.validate([_row(
            profit="45000000", profit_currency="CHF", profit_unit="1",
            consolidation_basis="total_group",
            revenue="", revenue_currency="", revenue_type="", revenue_unit="",
            report_url="https://example.test/gb2024.pdf", fiscal_year="",
            note="Umsatz nicht öffentlich",
        )])


def test_validate_rejects_profit_without_profit_currency():
    with pytest.raises(ValueError, match="profit gesetzt, aber profit_currency"):
        companies.validate([_row(
            profit="45000000", profit_unit="1", profit_currency="",
            consolidation_basis="total_group",
        )])


def test_validate_rejects_profit_without_profit_unit():
    # Dieselbe Begründung wie bei revenue_unit: ohne Pflicht liest build_artifact() ein
    # leeres profit_unit als Faktor 1 und verschiebt eine in Millionen gemeldete Zahl
    # unbemerkt um den Faktor 10**6.
    with pytest.raises(ValueError, match="profit gesetzt, aber profit_unit"):
        companies.validate([_row(
            profit="45000000", profit_currency="CHF", profit_unit="",
            consolidation_basis="total_group",
        )])


def test_validate_rejects_profit_without_consolidation_basis():
    # Genau die Lücke, durch die Montana Aerospace beim Sourcing-Review durchrutschte:
    # revenue auf continuing operations, profit auf total group — nichts prüfte, dass
    # beide Zahlen dieselbe Konzernabgrenzung meinen (siehe CONSOLIDATION_BASES-
    # Kommentar in companies.py).
    with pytest.raises(ValueError, match="profit gesetzt, aber consolidation_basis"):
        companies.validate([_row(
            profit="45000000", profit_currency="CHF", profit_unit="1",
            consolidation_basis="",
        )])


def test_validate_rejects_unknown_consolidation_basis():
    with pytest.raises(ValueError, match="unbekannt"):
        companies.validate([_row(
            profit="45000000", profit_currency="CHF", profit_unit="1",
            consolidation_basis="segment_only",
        )])


def test_validate_allows_empty_profit_without_extra_provenance():
    # profit ist optional (nicht jede Firma weist einen Reingewinn öffentlich aus) —
    # anders als revenue erzwingt ein leeres profit keine note oder consolidation_basis.
    companies.validate([_row(profit="", consolidation_basis="")])


def test_validate_rejects_founding_year_without_source():
    with pytest.raises(ValueError, match="founding_year gesetzt, aber founding_year_source"):
        companies.validate([_row(founding_year="1950", founding_year_source="")])


def test_validate_allows_empty_founding_year():
    companies.validate([_row(founding_year="", founding_year_source="")])


def test_build_artifact_carries_profit_products_and_founding_year():
    table = noga.load_table()
    artifact = companies.build_artifact(
        [_row(
            profit="45000000", profit_currency="CHF", profit_unit="1",
            consolidation_basis="total_group",
            core_products="Pharmazeutische Wirkstoffe im Auftrag",
            products_url="https://example.test/about",
            founding_year="1950", founding_year_source="https://example.test/history",
        )],
        table,
    )
    entry = artifact["companies"][0]
    assert entry["profit"] == 45_000_000
    assert entry["profitCurrency"] == "CHF"
    assert entry["consolidationBasis"] == "total_group"
    assert entry["coreProducts"] == "Pharmazeutische Wirkstoffe im Auftrag"
    assert entry["productsUrl"] == "https://example.test/about"
    assert entry["foundingYear"] == 1950


def test_build_artifact_handles_a_loss_as_a_negative_profit():
    table = noga.load_table()
    artifact = companies.build_artifact(
        [_row(
            profit="-3071000", profit_currency="EUR", profit_unit="1",
            consolidation_basis="total_group",
        )],
        table,
    )
    assert artifact["companies"][0]["profit"] == -3_071_000


def test_build_artifact_marks_missing_profit_as_none():
    table = noga.load_table()
    artifact = companies.build_artifact([_row(profit="", consolidation_basis="")], table)
    entry = artifact["companies"][0]
    assert entry["profit"] is None
    assert entry["profitCurrency"] is None
    assert entry["consolidationBasis"] is None
    assert entry["coreProducts"] is None
    assert entry["foundingYear"] is None


def test_load_csv_roundtrip(tmp_path):
    path = tmp_path / "c.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=companies.CSV_COLUMNS)
        writer.writeheader()
        writer.writerow(_row())
    rows = companies.load_csv(path)
    assert rows[0]["name"] == "Beispiel AG"


def test_load_csv_rejects_unexpected_header(tmp_path):
    path = tmp_path / "c.csv"
    path.write_text("uid,name\nX,Y\n", encoding="utf-8")
    with pytest.raises(ValueError, match="Spalten"):
        companies.load_csv(path)


# --- Phase 3: drei Zustände (researched=yes+Zahlen / yes+leer / no) --------


def _unresearched_row(**overrides):
    row = {c: "" for c in companies.CSV_COLUMNS}
    row.update({
        "uid": "404575", "name": "Beispiel Unbekannt AG", "six_symbol": "BSPX",
        "isin": "CH0000000099", "street": "Teststrasse 1", "zip": "8000",
        "city": "Zürich", "lon": "8.54", "lat": "47.37",
        "geocode_query": "Teststrasse 1 8000 Zürich",
        "researched": "no",
    })
    row.update(overrides)
    return row


def test_validate_accepts_an_unresearched_row_with_only_identity_and_seat():
    companies.validate([_unresearched_row()])


def test_validate_rejects_unknown_researched_value():
    with pytest.raises(ValueError, match="researched"):
        companies.validate([_row(researched="vielleicht")])


def test_validate_rejects_researched_no_row_carrying_a_figure():
    # Der Kernpunkt von Zustand 3: eine unrecherchierte Zeile darf unter
    # keinen Umständen eine Kennzahl tragen, auch nicht mit vollständiger
    # Quellenangabe — die Herkunftspflicht (report_url etc.) allein hätte das
    # nicht verhindert.
    with pytest.raises(ValueError, match="researched=no, aber revenue gesetzt"):
        companies.validate([_unresearched_row(
            revenue="100", revenue_currency="CHF", revenue_type="net_sales",
            revenue_unit="1", report_url="https://example.test", fiscal_year="2024",
        )])


def test_validate_rejects_researched_yes_without_noga_group():
    with pytest.raises(ValueError, match="researched=yes, aber noga_group fehlt"):
        companies.validate([_row(noga_group="")])


def test_validate_allows_unresearched_row_without_any_seat():
    # Ein SIX-Titel ohne eindeutigen Zefix-Treffer (siehe `match_company_seat`)
    # bleibt ohne Adresse und ohne Koordinaten — kein Fehler, nur kein Marker
    # (siehe `build_artifact`).
    companies.validate([_unresearched_row(
        street="", zip="", city="", lon="", lat="", geocode_query="",
    )])


def test_validate_lets_an_unresearched_row_keep_a_seat_without_coordinates():
    # Bis zum 14. August 2026 war das ein Fehler — mit der Folge, dass der
    # Geokodierungs-Schritt eine gescheiterte Adresse löschen MUSSTE, um die
    # Datei gültig zu halten. Damit vernichtete ein Dienstfehler echte
    # GLEIF-Daten (The Swatch Group, Logitech: Adresszeilen mit Zusatz), und
    # ein späterer Lauf hatte nichts mehr zum Wiederholen. Die Zeile bleibt
    # ohne Marker, aber die Adresse bleibt stehen.
    companies.validate([_unresearched_row(lon="", lat="")])


def test_validate_still_requires_coordinates_for_a_researched_seat():
    # Für die von Hand geprüften Zeilen gilt die Pflicht unverändert: dort
    # ist der Sitz Teil des Profils, nicht ein maschineller Nebenbefund.
    with pytest.raises(ValueError, match="lon"):
        companies.validate([_row(lon="", lat="")])


def test_validate_rejects_missing_isin():
    with pytest.raises(ValueError, match="isin fehlt"):
        companies.validate([_row(isin="")])


def test_validate_rejects_duplicate_isin():
    with pytest.raises(ValueError, match="isin .* doppelt"):
        companies.validate([_row(), _row(uid="CHE-999", name="Andere AG")])


def test_build_artifact_marks_researched_flag_per_entry():
    table = noga.load_table()
    artifact = companies.build_artifact([_row(), _unresearched_row()], table)
    by_name = {e["name"]: e for e in artifact["companies"]}
    assert by_name["Beispiel AG"]["researched"] is True
    assert by_name["Beispiel Unbekannt AG"]["researched"] is False


def test_build_artifact_skips_rows_without_coordinates():
    table = noga.load_table()
    artifact = companies.build_artifact(
        [_row(), _unresearched_row(street="", zip="", city="", lon="", lat="")], table,
    )
    assert artifact["stats"]["count"] == 1
    assert [e["name"] for e in artifact["companies"]] == ["Beispiel AG"]


def test_build_artifact_falls_back_to_unknown_noga_group_when_blank():
    table = noga.load_table()
    artifact = companies.build_artifact([_unresearched_row(noga_group="")], table)
    from zeigmers_etl import config
    assert artifact["companies"][0]["nogaGroupIndex"] == config.NOGA_UNKNOWN_INDEX


def test_build_artifact_counts_researched_separately_from_total_listed():
    table = noga.load_table()
    artifact = companies.build_artifact(
        [_row(), _unresearched_row()], table,
        six_meta={"totalListed": 224, "retrievedAt": "2026-08-14"},
    )
    assert artifact["stats"]["researched"] == 1
    assert artifact["stats"]["totalListed"] == 224
    assert artifact["stats"]["sixRetrievedDate"] == "2026-08-14"


def test_build_artifact_total_listed_defaults_to_row_count_without_six_meta():
    table = noga.load_table()
    artifact = companies.build_artifact([_row(), _unresearched_row()], table)
    assert artifact["stats"]["totalListed"] == 2
    assert artifact["stats"]["sixRetrievedDate"] is None


# --- Phase 3: Namensabgleich SIX <-> Zefix (rein, kein Netzwerk) -----------


def test_company_key_strips_share_class_suffix():
    assert companies.company_key("SIEGFRIED N") == "SIEGFRIED"
    assert companies.company_key("LINDT PS") == "LINDT"


def test_company_key_strips_second_line_marker():
    assert companies.company_key("ABB LTD N 2. LINIE") == "ABB LTD"
    assert companies.company_key("GEBERIT N") == companies.company_key("GEBERIT N 2. LINIE")


def test_canonicalize_strips_legal_form_words_from_both_sides_the_same_way():
    assert companies.canonicalize("Siegfried Holding AG") == "SIEGFRIED"
    assert companies.canonicalize("SIEGFRIED") == "SIEGFRIED"
    assert companies.canonicalize("Galderma Group AG") == \
        companies.canonicalize("GALDERMA GROUP")


def test_canonicalize_matches_swiss_german_umlaut_transliteration():
    # Regressionsfall aus dem ersten Sync-Lauf: SIX schreibt Umlaute als
    # ae/oe/ue ("JULIUS BAER"), nicht als blosses Entfernen des Diakritikums
    # ("JULIUS BAR") — reines NFKD-Combining-Mark-Strippen hätte "Julius Bär"
    # verfehlt.
    assert companies.canonicalize("Julius Bär Gruppe AG") == companies.canonicalize("JULIUS BAER")
    assert companies.canonicalize("Kühne + Nagel AG") == "KUEHNE + NAGEL"
    assert companies.canonicalize("Flughafen Zürich AG") == "FLUGHAFEN ZUERICH"


def test_canonicalize_no_longer_treats_international_as_a_stripped_legal_form():
    # Regressionsfall "ARYZTA"/"ADECCO": "International" strippen wie eine
    # Rechtsform ("AG") hätte "ARYZTA AG" und "ARYZTA International AG" zu
    # demselben exakten Kern gemacht — zwei verschiedene Rechtseinheiten
    # ununterscheidbar. "International" bezeichnet fast immer eine
    # Konzern-Schwester, keine Rechtsform (siehe GENERIC_SUBSIDIARY_WORDS).
    assert companies.canonicalize("Aryzta International AG") == "ARYZTA INTERNATIONAL"
    assert companies.canonicalize("Aryzta International AG") != companies.canonicalize("ARYZTA")


def test_canonicalize_still_strips_plain_diacritics_for_french_names():
    # SIX schreibt französische Akzente dagegen einfach ohne Diakritikum
    # ("GENEVE" für "Genève"), transliteriert sie nicht wie deutsche Umlaute.
    assert companies.canonicalize("Café Résidence SA") == "CAFE RESIDENCE"


def test_canonicalize_splits_st_written_without_a_following_space():
    # Regressionsfall: Zefix führt die echte Bank als "St.Galler
    # Kantonalbank AG" (kein Leerzeichen nach "St."), SIX schreibt sie als
    # "ST GALLER KB" (mit Leerzeichen) — ohne diese Auflösung verschmilzt
    # "St.Galler" zu einem einzigen Token ("STGALLER") und der Vergleich
    # schlägt fehl, obwohl es zweifelsfrei dieselbe Bank ist.
    assert companies.canonicalize("St.Galler Kantonalbank AG") == \
        companies.canonicalize("ST GALLER KB")


def test_canonicalize_does_not_split_sa_apart():
    # Regressionsfall der Regressionsfall-Behebung: eine naive "jeden Punkt
    # durch ein Leerzeichen ersetzen"-Regel hätte "S.A." in "S" + "A"
    # gespalten, statt es weiterhin als Rechtsform "SA" zu erkennen und zu
    # entfernen (Nestlé firmiert in Zefix als "Nestlé S.A.").
    assert companies.canonicalize("Nestlé S.A.") == "NESTLE"


def test_group_six_titles_collapses_share_classes_and_second_lines():
    titles = [
        {"shortName": "LINDT N", "isin": "CH1", "sixSymbol": "LISN", "productLine": "BC"},
        {"shortName": "LINDT PS", "isin": "CH2", "sixSymbol": "LISP", "productLine": "BC"},
        {"shortName": "LINDT N 2.LINIE", "isin": "CH3", "sixSymbol": "LISNE", "productLine": "DS"},
        {"shortName": "ZEHNDER N", "isin": "CH4", "sixSymbol": "ZEHN", "productLine": "DS"},
    ]
    groups = companies.group_six_titles(titles)
    keys = {g["key"] for g in groups}
    assert keys == {"LINDT", "ZEHNDER"}
    lindt = next(g for g in groups if g["key"] == "LINDT")
    assert len(lindt["titles"]) == 3
    assert lindt["primary"]["isin"] == "CH1"  # 1. Linie, alphabetisch erste


def test_match_company_seat_accepts_a_single_exact_candidate():
    candidates = [
        {"company": "https://register.ld.admin.ch/zefix/company/1", "name": "Siegfried Holding AG",
         "street": "Untere Brühlstrasse 4", "zip": "4800", "city": "Zofingen", "region": "AG"},
    ]
    outcome = companies.match_company_seat("SIEGFRIED", candidates)
    assert outcome["status"] == "matched"
    assert outcome["confidence"] == "exact"
    assert outcome["match"]["city"] == "Zofingen"


def test_match_company_seat_accepts_an_extended_candidate_with_one_extra_word():
    # SIX kürzt "Aevis Victoria SA" auf "AEVIS" — ein zusätzliches Wort in
    # der Zefix-Firmierung darf noch als Treffer zählen.
    candidates = [
        {"company": "https://register.ld.admin.ch/zefix/company/1", "name": "Aevis Victoria SA",
         "street": "Rue X", "zip": "1700", "city": "Fribourg", "region": "FR"},
    ]
    outcome = companies.match_company_seat("AEVIS", candidates)
    assert outcome["status"] == "matched"
    assert outcome["confidence"] == "extended"


def test_match_company_seat_does_not_guess_between_two_addresses():
    # Regressionsfall "MONTANA": ein exakter, aber falscher Treffer
    # ("Montana Holding AG", Solothurn) konkurriert mit dem tatsächlich
    # gesuchten Unternehmen ("Montana Aerospace AG", Reinach), das nur die
    # lockerere extended-Regel erfüllt (SIX liess "Aerospace" weg). Ein
    # früher Return bei der ersten Stufe mit genau einem Treffer hätte den
    # falschen Treffer stillschweigend ausgegeben — siehe Kommentar bei
    # `match_company_seat`.
    candidates = [
        {"company": "https://register.ld.admin.ch/zefix/company/1", "name": "Montana Holding AG",
         "street": "Steinbruggstrasse 39", "zip": "4500", "city": "Solothurn", "region": "SO"},
        {"company": "https://register.ld.admin.ch/zefix/company/2", "name": "Montana Aerospace AG",
         "street": "Alzbachstrasse 27", "zip": "5734", "city": "Reinach", "region": "AG"},
    ]
    outcome = companies.match_company_seat("MONTANA", candidates)
    assert outcome["status"] == "ambiguous"


def test_match_company_seat_accepts_an_address_majority_among_group_siblings():
    # Holding-/Betriebs-/Verwaltungsgesellschaft am selben Sitz — welche UID
    # genau die kotierte ist, bleibt unsicher, der Sitz selbst nicht.
    candidates = [
        {"company": "https://register.ld.admin.ch/zefix/company/1", "name": "Sika AG",
         "street": "Zugerstrasse 50", "zip": "6341", "city": "Baar", "region": "ZG"},
        {"company": "https://register.ld.admin.ch/zefix/company/2", "name": "Sika Finanz AG",
         "street": "Zugerstrasse 50", "zip": "6341", "city": "Baar", "region": "ZG"},
        {"company": "https://register.ld.admin.ch/zefix/company/3", "name": "Sika Schweiz AG",
         "street": "Vulkanstrasse 110", "zip": "8048", "city": "Zürich", "region": "ZH"},
    ]
    outcome = companies.match_company_seat("SIKA", candidates)
    assert outcome["status"] == "matched"
    assert outcome["confidence"] == "address_majority"
    assert outcome["match"]["city"] == "Baar"


def test_match_company_seat_reports_unmatched_without_guessing():
    outcome = companies.match_company_seat("NIRGENDS EXISTIEREND XYZ", [])
    assert outcome["status"] == "unmatched"


def test_match_company_seat_prefers_the_exact_match_over_a_generic_subsidiary():
    # Regressionsfall "ARYZTA": "Aryzta International AG" ist eine
    # Konzern-Schwester (generisches Zusatzwort "International"), keine
    # konkurrierende Firma — sie darf den exakten Treffer "ARYZTA AG" nicht
    # in die Mehrdeutigkeit ziehen, anders als ein echtes Identitätswort
    # (siehe nächster Test, Montana).
    candidates = [
        {"company": "https://register.ld.admin.ch/zefix/company/1", "name": "ARYZTA AG",
         "street": "Bahnhofstrasse 1", "zip": "8001", "city": "Zürich", "region": "ZH"},
        {"company": "https://register.ld.admin.ch/zefix/company/2", "name": "ARYZTA International AG",
         "street": "Andere Strasse 2", "zip": "6300", "city": "Zug", "region": "ZG"},
    ]
    outcome = companies.match_company_seat("ARYZTA", candidates)
    assert outcome["status"] == "matched"
    assert outcome["match"]["name"] == "ARYZTA AG"
    assert outcome["confidence"] == "exact"


def test_match_company_seat_still_refuses_to_guess_when_the_extra_word_is_not_generic():
    # Regressionsfall "MONTANA" bleibt ein Regressionsfall: "Aerospace" ist
    # kein generisches Konzern-Schwester-Wort, darf also den falschen
    # exakten Treffer nicht unbeanstandet gewinnen lassen.
    candidates = [
        {"company": "https://register.ld.admin.ch/zefix/company/1", "name": "Montana Holding AG",
         "street": "Steinbruggstrasse 39", "zip": "4500", "city": "Solothurn", "region": "SO"},
        {"company": "https://register.ld.admin.ch/zefix/company/2", "name": "Montana Aerospace AG",
         "street": "Alzbachstrasse 27", "zip": "5734", "city": "Reinach", "region": "AG"},
    ]
    outcome = companies.match_company_seat("MONTANA", candidates)
    assert outcome["status"] == "ambiguous"


# --- find_seat: mehrere Suchwörter, nicht nur das längste ------------------


def _lindas_bindings(entries: list[dict]) -> bytes:
    return json.dumps({"results": {"bindings": [
        {k: {"value": v} for k, v in e.items()} for e in entries
    ]}}).encode()


def test_find_seat_stops_at_the_first_token_that_matches():
    calls = []

    def fetcher(url: str) -> bytes:
        calls.append(url)
        return _lindas_bindings([{
            "company": "https://register.ld.admin.ch/zefix/company/1",
            "name": "Siegfried Holding AG", "street": "Untere Brühlstrasse 4",
            "zip": "4800", "city": "Zofingen", "region": "AG",
        }])

    outcome = companies.find_seat("SIEGFRIED", fetcher=fetcher)
    assert outcome["status"] == "matched"
    assert len(calls) == 1  # kein zweites Token nötig


def test_find_seat_falls_back_to_a_rarer_token_when_the_longest_is_too_generic():
    # Regressionsfall "SWISS PRIME SITE": das Token "SWISS" liefert exakt das
    # Limit an Treffern (zu generisch, gilt nicht als verlässlich), ohne die
    # gesuchte Firma zu enthalten — "PRIME" (kürzer, aber seltener) findet sie.
    swiss_flood = [
        {"company": f"https://register.ld.admin.ch/zefix/company/{i}",
         "name": f"Swiss Something {i} AG", "street": "X", "zip": "8000",
         "city": "Zürich", "region": "ZH"}
        for i in range(companies._SEAT_QUERY_LIMIT)
    ]
    prime_hit = [{
        "company": "https://register.ld.admin.ch/zefix/company/999",
        "name": "Swiss Prime Site AG", "street": "Poststrasse 4a",
        "zip": "6300", "city": "Zug", "region": "ZG",
    }]

    def fetcher(url: str) -> bytes:
        # `seat_candidates_from_lindas` baut das Suchwort in die Abfrage ein —
        # unterscheiden über den (bekannten) Fragment-Text im Query-String
        # (beide Token sind genau 5 Zeichen lang, bleiben also unverkürzt).
        if "SWISS" in url:
            return _lindas_bindings(swiss_flood)
        return _lindas_bindings(prime_hit)

    outcome = companies.find_seat("SWISS PRIME SITE", fetcher=fetcher)
    assert outcome["status"] == "matched"
    assert outcome["match"]["name"] == "Swiss Prime Site AG"


def test_find_seat_prefers_ambiguous_over_unmatched_across_tokens():
    def fetcher(url: str) -> bytes:
        if "AAAA" in url:  # längeres, erstes Token: mehrdeutig (zwei
            # exakt passende Kandidaten an unterschiedlichen Adressen)
            return _lindas_bindings([
                {"company": "https://register.ld.admin.ch/zefix/company/1",
                 "name": "AAAABBBB CCC AG", "street": "X", "zip": "1", "city": "A", "region": "AA"},
                {"company": "https://register.ld.admin.ch/zefix/company/2",
                 "name": "AAAABBBB CCC SA", "street": "Y", "zip": "2", "city": "B", "region": "BE"},
            ])
        return _lindas_bindings([])  # zweites (kürzeres) Token: gar nichts

    outcome = companies.find_seat("AAAABBBB CCC", fetcher=fetcher)
    assert outcome["status"] == "ambiguous"


def test_match_company_seat_does_not_let_the_generic_filter_crown_a_wrong_candidate():
    # Regressionsfall "WARTECK": die gesuchte "Warteck Invest AG" trägt mit
    # "Invest" ausgerechnet ein Wort aus GENERIC_SUBSIDIARY_WORDS, während
    # bei der fremden "Warteck Sport Holding AG" das "Holding" schon als
    # Rechtsform wegfällt und nur das nicht-generische "Sport" übrig bleibt.
    # Der Filter warf damit den RICHTIGEN Kandidaten weg und machte den
    # falschen dadurch zum eindeutigen Treffer. Der Filter darf nur greifen,
    # wenn ein exakter Treffer im Pool steht, den er von Konzern-Schwestern
    # freiräumen kann — ohne Anker gibt es nichts zu bevorzugen.
    candidates = [
        {"company": "https://register.ld.admin.ch/zefix/company/1", "name": "Warteck Invest AG",
         "street": "Grenzacherstrasse 79", "zip": "4058", "city": "Basel", "region": "BS"},
        {"company": "https://register.ld.admin.ch/zefix/company/2", "name": "Warteck Sport Holding AG",
         "street": "Burgfelderstrasse 1", "zip": "4053", "city": "Basel", "region": "BS"},
    ]
    outcome = companies.match_company_seat("WARTECK", candidates)
    assert outcome["status"] == "ambiguous", (
        "ohne exakten Treffer darf der Generik-Filter keinen Sieger küren"
    )


def test_find_seat_does_not_trust_a_match_from_a_truncated_candidate_list():
    # Regressionsfall "GEORG FISCHER": das Limit schneidet die Trefferliste
    # ab, der entscheidende Gegenkandidat kann jenseits des Schnitts liegen.
    # Ein Treffer aus einer abgeschnittenen Liste ist deshalb genauso wenig
    # verlässlich wie ein "unmatched" daraus — die Limit-Prüfung stand aber
    # HINTER dem frühen Return auf "matched" und griff für Treffer nie.
    flood = [
        {"company": f"https://register.ld.admin.ch/zefix/company/{i}",
         "name": f"Andere Firma {i} AG", "street": "X", "zip": "8000",
         "city": "Zürich", "region": "ZH"}
        for i in range(companies._SEAT_QUERY_LIMIT - 1)
    ] + [{
        "company": "https://register.ld.admin.ch/zefix/company/900",
        "name": "Georg Fischer Rohrleitungssysteme AG", "street": "Ebnatstrasse 111",
        "zip": "8200", "city": "Schaffhausen", "region": "SH",
    }]
    clean = [{
        "company": "https://register.ld.admin.ch/zefix/company/1",
        "name": "Georg Fischer AG", "street": "Amsler-Laffon-Strasse 9",
        "zip": "8200", "city": "Schaffhausen", "region": "SH",
    }]

    def fetcher(url: str) -> bytes:
        # Längstes Token "FISCHER" wird auf "FISCHE" gekürzt, "GEORG" bleibt.
        return _lindas_bindings(flood if "FISCHE" in url else clean)

    outcome = companies.find_seat("GEORG FISCHER", fetcher=fetcher)
    assert outcome["status"] == "matched"
    assert outcome["match"]["name"] == "Georg Fischer AG", (
        "der Treffer aus der abgeschnittenen Liste darf das seltenere, "
        "vollständig ausgewertete Suchwort nicht verdrängen"
    )


def test_find_seat_still_accepts_an_exact_match_from_a_truncated_list():
    # Gegenstück zum Test darüber: die Limit-Regel darf nicht pauschal jeden
    # Treffer verwerfen. "ZURICH INSURANCE" -> "Zurich Insurance Group AG" ist
    # ein exakter Namenstreffer (kanonisch identisch) und bleibt richtig, auch
    # wenn die Liste abgeschnitten ist — nur die Vergleichsstufen `extended`
    # und `address_majority` brauchen das vollständige Feld.
    flood = [
        {"company": f"https://register.ld.admin.ch/zefix/company/{i}",
         "name": f"Zurich Irgendwas {i} AG", "street": "X", "zip": "8000",
         "city": "Zürich", "region": "ZH"}
        for i in range(companies._SEAT_QUERY_LIMIT - 1)
    ] + [{
        "company": "https://register.ld.admin.ch/zefix/company/900",
        "name": "Zurich Insurance Group AG", "street": "Mythenquai 2",
        "zip": "8002", "city": "Zürich", "region": "ZH",
    }]

    outcome = companies.find_seat(
        "ZURICH INSURANCE", fetcher=lambda _: _lindas_bindings(flood)
    )
    assert outcome["status"] == "matched"
    assert outcome["confidence"] == "exact"
    assert outcome["match"]["name"] == "Zurich Insurance Group AG"


def test_find_seat_rejects_a_non_exact_match_from_a_truncated_list():
    # Belegter Gegenfall aus demselben Lauf: "SIG GROUP" traf in einer
    # abgeschnittenen Liste nur die Konzern-Schwester "SIG Services AG"
    # (`extended`, nicht exakt) — die kotierte "SIG Group AG" lag jenseits des
    # Schnitts. Ein Vergleichsurteil über ein unvollständiges Feld darf nicht
    # als gesicherter Sitz in die CSV.
    flood = [
        {"company": f"https://register.ld.admin.ch/zefix/company/{i}",
         "name": f"Andere Firma {i} AG", "street": "X", "zip": "8000",
         "city": "Zürich", "region": "ZH"}
        for i in range(companies._SEAT_QUERY_LIMIT - 1)
    ] + [{
        "company": "https://register.ld.admin.ch/zefix/company/900",
        "name": "SIG Services AG", "street": "Laufengasse 18",
        "zip": "8212", "city": "Neuhausen am Rheinfall", "region": "SH",
    }]

    outcome = companies.find_seat(
        "SIG GROUP", fetcher=lambda _: _lindas_bindings(flood)
    )
    assert outcome["status"] == "ambiguous", (
        "ein nicht-exakter Treffer aus abgeschnittener Liste ist kein Sitz"
    )


def test_seat_query_orders_before_limiting():
    # Ein LIMIT ohne ORDER BY lässt offen, welche 300 Treffer zurückkommen —
    # zwei identische Läufe können verschiedene Sitze in die CSV schreiben
    # (beobachtet an "SWISS PRIME SITE": einmal zugeordnet, einmal nicht,
    # ohne Codeänderung). Reproduzierbarkeit ist ein Abnahmekriterium des
    # Pilots, deshalb hier festgenagelt statt nur im Kommentar erwähnt.
    query = companies._SEAT_QUERY
    assert "ORDER BY" in query
    assert query.index("ORDER BY") < query.index("LIMIT")


def test_uid_from_company_uri():
    assert companies.uid_from_company_uri(
        "https://register.ld.admin.ch/zefix/company/177019"
    ) == "177019"
    assert companies.uid_from_company_uri("https://example.test/nope") is None


# --- Phase 3: SIX-Titelliste + Sync (Netzwerk gefaked über Fetcher) -------


def _six_page(short_names_isins, product_line, delayed="20260814T13:46:42.627"):
    return json.dumps({
        "delayedDateTime": delayed,
        "colNames": ["ShortName", "ISIN", "ValorSymbol", "ProductLine"],
        "rowData": [[name, isin, isin[-4:], product_line] for name, isin in short_names_isins],
    }).encode()


def test_fetch_six_titles_paginates_until_an_empty_page(monkeypatch):
    pages = {
        ("BC", 1): _six_page([("ABB LTD N", "CH0012221716")], "BC"),
        ("BC", 2): _six_page([], "BC"),
        ("DS", 1): _six_page([("SIEGFRIED N", "CH1429326825")], "DS"),
        ("DS", 2): _six_page([], "DS"),
    }

    def fake(url: str) -> bytes:
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        pl = qs["where"][0].removeprefix("ProductLine=")
        page = int(qs["page"][0])
        return pages[(pl, page)]

    result = companies.fetch_six_titles(fetcher=fake)
    assert result["retrievedAt"] == "2026-08-14"
    assert {t["isin"] for t in result["titles"]} == {"CH0012221716", "CH1429326825"}


def test_fetch_six_titles_raises_a_clear_error_when_unreachable():
    def fail(_url: str) -> bytes:
        raise OSError("network unreachable")

    with pytest.raises(ConnectionError, match="nicht erreichbar"):
        companies.fetch_six_titles(fetcher=fail)


def test_sync_national_csv_appends_only_new_titles_and_leaves_existing_rows_untouched(
    tmp_path, monkeypatch
):
    # GLEIFs Antwort-Cache liegt unter DATA_RAW; ohne Umleitung schriebe
    # dieser Test in das echte Datenverzeichnis des Repos.
    from zeigmers_etl import gleif as _gleif

    monkeypatch.setattr(_gleif.config, "DATA_RAW", tmp_path)
    path = tmp_path / "listed_companies.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=companies.CSV_COLUMNS)
        writer.writeheader()
        writer.writerow(_row())  # ISIN CH0000000001, bereits recherchiert

    six_pages = {
        ("BC", 1): _six_page([("BEISPIEL N", "CH0000000001"), ("NEUFIRMA N", "CH0000000002")], "BC"),
        ("BC", 2): _six_page([], "BC"),
        ("DS", 1): _six_page([], "DS"),
    }

    def six_fetcher(url: str) -> bytes:
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        pl = qs["where"][0].removeprefix("ProductLine=")
        page = int(qs["page"][0])
        return six_pages.get((pl, page), _six_page([], pl))

    def lindas_fetcher(_url: str) -> bytes:
        return json.dumps({"results": {"bindings": [
            {
                "company": {"value": "https://register.ld.admin.ch/zefix/company/42"},
                "name": {"value": "Neufirma Holding AG"},
                "street": {"value": "Teststrasse 9"},
                "zip": {"value": "9000"},
                "city": {"value": "St. Gallen"},
                "region": {"value": "SG"},
            },
        ]}}).encode()

    # Explizit ein GLEIF-Fetcher, der nichts kennt: dieser Test prüft den
    # LINDAS-Rückfall. Ohne ihn zöge `sync_national_csv` die Antwort aus dem
    # echten Cache oder — schlimmer — aus dem Netz, und der Test wäre von
    # beidem abhängig statt von seinen eigenen Fixtures.
    def gleif_fetcher(_url: str) -> bytes:
        return json.dumps({"data": []}).encode()

    report = companies.sync_national_csv(
        path, six_fetcher=six_fetcher, lindas_fetcher=lindas_fetcher,
        gleif_fetcher=gleif_fetcher,
    )

    assert report["alreadyKnown"] == 1
    assert report["added"] == 1
    assert len(report["matched"]) == 1

    rows = companies.load_csv(path)
    assert len(rows) == 2
    existing = next(r for r in rows if r["isin"] == "CH0000000001")
    assert existing["name"] == "Beispiel AG" and existing["revenue"] == "1250000000"
    new = next(r for r in rows if r["isin"] == "CH0000000002")
    assert new["researched"] == "no"
    assert new["name"] == "Neufirma Holding AG"
    assert new["city"] == "St. Gallen"
    assert new["revenue"] == ""


def test_build_artifact_converts_revenue_to_chf_for_the_bar_height():
    # Ohne Umrechnung vergleicht die Saeulenhoehe Betraege, die nicht
    # dasselbe messen: Nestle berichtet in CHF, Novartis in USD, Richemont in
    # EUR. Der berichtete Wert bleibt daneben stehen — umgerechnet laesst
    # sich vergleichen, im Original laesst sich nachpruefen.
    monthly = {("USD", 2025): [0.80] * 12}
    artifact = companies.build_artifact(
        [_row(revenue="1000", revenue_currency="USD", revenue_unit="1000000",
              fiscal_year="2025")],
        noga.load_table(), monthly_fx=monthly,
    )
    entry = artifact["companies"][0]
    assert entry["revenue"] == 1_000_000_000.0, "berichteter Betrag bleibt unangetastet"
    assert entry["currency"] == "USD"
    assert entry["revenueChf"] == pytest.approx(800_000_000.0)
    assert artifact["stats"]["revenueInChf"] is True
    assert artifact["stats"]["max"] == pytest.approx(800_000_000.0), (
        "der Massstab muss aus derselben Groesse stammen wie die Hoehen"
    )


def test_build_artifact_falls_back_to_reported_amounts_when_one_rate_is_missing():
    # Halb umgerechnet waere schlimmer als gar nicht: dann staenden zwei
    # Massstaebe nebeneinander, ohne dass man es sieht.
    monthly = {("USD", 2025): [0.80] * 12}
    artifact = companies.build_artifact(
        [_row(revenue="1000", revenue_currency="USD", revenue_unit="1000000",
              fiscal_year="2025"),
         _row(name="Zweite AG", uid="CHE-999.999.999", isin="CH9999999999",
              revenue="500", revenue_currency="GBP", revenue_unit="1000000",
              fiscal_year="2025")],
        noga.load_table(), monthly_fx=monthly,
    )
    assert artifact["stats"]["revenueInChf"] is False
    assert artifact["stats"]["max"] == pytest.approx(1_000_000_000.0)
    assert len(artifact["stats"]["fxMissing"]) == 1
    assert "GBP" in artifact["stats"]["fxMissing"][0]["error"]


def test_build_artifact_rechnet_gewinn_in_chf_um():
    monthly = {("USD", 2024): [0.9] * 12}
    table = noga.load_table()
    rows = [_row(profit="200000000", profit_currency="USD", profit_unit="1",
                 revenue_currency="USD", consolidation_basis="total_group",
                 fiscal_year="2024")]
    artifact = companies.build_artifact(rows, table, monthly_fx=monthly)
    entry = artifact["companies"][0]
    assert entry["profit"] == 200_000_000.0        # berichtet, unverändert
    assert entry["profitChf"] == pytest.approx(180_000_000.0)
    assert artifact["stats"]["profitInChf"] is True


def test_build_artifact_rechnet_auch_verluste_um():
    monthly = {("EUR", 2024): [0.95] * 12}
    table = noga.load_table()
    rows = [_row(profit="-40000000", profit_currency="EUR", profit_unit="1",
                 revenue_currency="EUR", consolidation_basis="total_group",
                 fiscal_year="2024")]
    entry = companies.build_artifact(rows, table, monthly_fx=monthly)["companies"][0]
    assert entry["profitChf"] == pytest.approx(-38_000_000.0)


def test_profit_in_chf_ist_falsch_wenn_eine_umrechnung_fehlt():
    """Alles oder nichts — wie bei revenueInChf. Halb umgerechnet stünden
    zwei Massstäbe nebeneinander, ohne dass man es sieht."""
    monthly = {("CHF", 2024): [1.0] * 12}
    table = noga.load_table()
    rows = [
        _row(name="A AG", uid="CHE-100.000.001", profit="1000", profit_currency="CHF",
             profit_unit="1", consolidation_basis="total_group", fiscal_year="2024"),
        _row(name="B AG", uid="CHE-100.000.002", lon="8.05", lat="47.40",
             profit="2000", profit_currency="JPY", profit_unit="1",
             consolidation_basis="total_group", fiscal_year="2024"),
    ]
    artifact = companies.build_artifact(rows, table, monthly_fx=monthly)
    assert artifact["stats"]["profitInChf"] is False
    assert any(m["currency"] == "JPY" for m in artifact["stats"]["fxMissing"])


# --- Recherche in die CSV uebernehmen -------------------------------------


def _research(**overrides):
    payload = {
        "noga_group": "industrie", "consolidation_basis": "total_group",
        "revenue": "1500.5", "revenue_currency": "EUR",
        "revenue_type": "net_sales", "revenue_unit": "1000000",
        "profit": "120.25", "profit_currency": "EUR", "profit_unit": "1000000",
        "core_products": "Beispielprodukte", "products_url": "https://example.test/p",
        "founding_year": "1900", "founding_year_source": "https://example.test/h",
        "employees": "4200", "fiscal_year": "2025",
        "report_url": "https://example.test/gb2025.pdf", "note": "",
    }
    payload.update(overrides)
    return payload


def test_merge_research_fills_an_unresearched_row_and_marks_it_researched():
    rows = [_row(six_symbol="NEU", researched="no", noga_group="", revenue="",
                 revenue_currency="", revenue_type="", revenue_unit="",
                 fiscal_year="", report_url="")]
    report = companies.merge_research(rows, {"NEU": _research()})

    assert report["merged"] == ["NEU"]
    assert rows[0]["researched"] == "yes"
    assert rows[0]["revenue"] == "1500.5"
    assert rows[0]["revenue_currency"] == "EUR"
    assert rows[0]["employees"] == "4200"


def test_merge_research_never_touches_a_row_without_a_research_file():
    # Die acht handrecherchierten Zeilen sind das Teuerste in diesem Repo.
    # Sie haben keine Recherchedatei — und `merge_research` laeuft nur ueber
    # die vorhandenen Dateien. Damit sind sie strukturell geschuetzt, nicht
    # durch eine Regel, die jemand spaeter lockern koennte.
    rows = [_row(six_symbol="HAND", researched="yes", revenue="999"),
            _row(six_symbol="NEU", researched="no", noga_group="", revenue="",
                 revenue_currency="", revenue_type="", revenue_unit="",
                 fiscal_year="", report_url="", uid="CHE-2", isin="CH0000000002")]
    companies.merge_research(rows, {"NEU": _research()})
    assert rows[0]["revenue"] == "999", "Zeile ohne Recherchedatei bleibt unberuehrt"


def test_merge_research_updates_a_row_whose_research_file_changed():
    # Eine Korrektur aus der Gegenpruefung (z.B. Swisscoms Gewinn: 1'270 war
    # das Konzernergebnis, 1'271 der Aktionaersanteil) landet in der
    # Recherchedatei. Wuerde `merge_research` bestehende Zeilen grundsaetzlich
    # auslassen, bliebe die Korrektur stillschweigend liegen und muesste von
    # Hand in die CSV nachgezogen werden — genau der Schritt, der vergessen
    # wird.
    rows = [_row(six_symbol="KORR", researched="yes", profit="1270",
                 profit_currency="CHF", profit_unit="1000000",
                 consolidation_basis="total_group")]
    report = companies.merge_research(rows, {"KORR": _research(profit="1271")})

    assert rows[0]["profit"] == "1271"
    assert report["updated"] == ["KORR"]
    assert report["merged"] == [], "kein Neuzugang, sondern eine Aktualisierung"


def test_merge_research_reports_nothing_when_a_row_already_matches_its_file():
    rows = [_row(six_symbol="GLEICH", researched="yes")]
    payload = {field: rows[0][field] for field in companies.RESEARCH_ONLY_FIELDS}
    report = companies.merge_research(rows, {"GLEICH": payload})
    assert report["merged"] == [] and report["updated"] == []


def test_merge_research_reports_a_symbol_that_matches_no_row():
    rows = [_row(six_symbol="DA")]
    report = companies.merge_research(rows, {"WEG": _research()})
    assert report["unknownSymbol"] == ["WEG"]


def test_merge_research_keeps_identity_and_seat_columns_untouched():
    # Die Recherche liefert Kennzahlen, nicht Identitaet: Sitz und UID kommen
    # aus GLEIF und sind bereits geprueft. Eine Rechercheantwort, die einen
    # Ort mitliefert, darf ihn nicht ueberschreiben.
    rows = [_row(six_symbol="NEU", researched="no", city="Aarau", uid="CHE-1")]
    companies.merge_research(rows, {"NEU": _research(city="Zug", uid="CHE-9")})
    assert rows[0]["city"] == "Aarau" and rows[0]["uid"] == "CHE-1"


def test_merge_research_rejects_a_payload_that_would_not_validate():
    # Ein Umsatz ohne Quelle ist genau das, was validate() verbietet. Der
    # Merge muss das VOR dem Schreiben bemerken, nicht der naechste Build.
    rows = [_row(six_symbol="NEU", researched="no")]
    with pytest.raises(ValueError, match="report_url"):
        companies.merge_research(rows, {"NEU": _research(report_url="")})


# --- Sitz-Ausnahmen von Hand ----------------------------------------------


def test_seat_override_replaces_a_stale_gleif_record():
    # Regressionsfall CNTL: GLEIF fuehrt fuer CH0024666528 weiterhin die
    # HOCHDORF Holding AG in Hochdorf. Tatsaechlich wurde die Gesellschaft
    # nach dem Verkauf des Milchgeschaefts zu HT5 AG und dann zu Centiel AG
    # umfirmiert und sitzt heute in Cadro. Die ISIN-Zuordnung von GLEIF ist
    # richtig, sein Name und seine Adresse sind veraltet.
    row = {c: "" for c in companies.CSV_COLUMNS}
    row.update({"six_symbol": "CNTL", "name": "HOCHDORF Holding AG",
                "city": "Hochdorf", "seat_basis": "hq"})
    override = {"CNTL": {"name": "Centiel AG", "uid": "CHE-102.468.656",
                         "street": "Via alla Stampa 15", "zip": "6965",
                         "city": "Cadro", "quelle": "centiel.com",
                         "grund": "GLEIF veraltet"}}

    applied = companies.apply_seat_overrides([row], override)

    assert applied == ["CNTL"]
    assert row["name"] == "Centiel AG"
    assert row["city"] == "Cadro"
    assert row["seat_basis"] == "manuell"
    assert row["geocode_query"] == "Via alla Stampa 15, 6965 Cadro"


def test_seat_override_clears_stale_coordinates_so_they_get_geocoded_again():
    # Ohne das behielte die Zeile die Koordinaten der ALTEN Adresse und die
    # Firma stuende weiterhin am falschen Ort — mit richtigem Namen daneben,
    # was schlimmer waere als vorher.
    row = {c: "" for c in companies.CSV_COLUMNS}
    row.update({"six_symbol": "CNTL", "city": "Hochdorf",
                "lon": "8.29", "lat": "47.17"})
    companies.apply_seat_overrides([row], {"CNTL": {"city": "Cadro"}})
    assert row["lon"] == "" and row["lat"] == ""


def test_seat_override_for_an_unknown_symbol_is_reported_not_ignored():
    with pytest.raises(ValueError, match="WEG"):
        companies.apply_seat_overrides([], {"WEG": {"city": "Nirgendwo"}})


def test_seat_override_is_a_no_op_when_the_row_already_matches():
    # Sonst leert jeder Lauf die Koordinaten der Ausnahmen neu und schickt
    # fuenf ueberfluessige Anfragen an einen fremden, kostenlos angebotenen
    # Geokodierungsdienst — und `companies-merge` meldete jedes Mal
    # "5 Ausnahmen angewendet", obwohl sich nichts geaendert hat.
    row = {c: "" for c in companies.CSV_COLUMNS}
    row.update({"six_symbol": "CNTL", "name": "Centiel AG", "uid": "CHE-102.468.656",
                "street": "Via alla Stampa 15", "zip": "6965", "city": "Cadro",
                "seat_basis": "manuell", "lon": "8.98", "lat": "46.05",
                "geocode_query": "Via alla Stampa 15, 6965 Cadro"})
    override = {"CNTL": {"name": "Centiel AG", "uid": "CHE-102.468.656",
                         "street": "Via alla Stampa 15", "zip": "6965", "city": "Cadro"}}

    applied = companies.apply_seat_overrides([row], override)

    assert applied == [], "unveraenderte Zeile darf nicht erneut angefasst werden"
    assert row["lon"] == "8.98", "Koordinaten bleiben erhalten"


def test_validate_rejects_a_non_integer_employee_count():
    # `build_artifact` liest die Spalte mit `int(...)`. Eine Bank, die
    # Vollzeitstellen mit Dezimalstelle ausweist ("1206.2"), brachte damit den
    # gesamten Artefaktbau zum Absturz — und zwar erst NACH dem Uebernehmen in
    # die CSV, obwohl `validate()` genau davor laufen soll. Beschaeftigte sind
    # Personen; eine gebrochene Zahl gehoert gerundet und in `note` erklaert.
    with pytest.raises(ValueError, match="employees"):
        companies.validate([_row(employees="1206.2")])


def test_validate_accepts_a_plain_integer_employee_count():
    companies.validate([_row(employees="1206")])


def test_validate_rejects_mismatched_units_between_revenue_and_profit():
    # Umsatz und Gewinn einer Zeile stammen aus derselben Rechnung — dann
    # stehen sie auch in derselben Einheit. Eine Zeile mit Umsatz in
    # Millionen und Gewinn in absoluten Franken waere um den Faktor 10**6
    # verschoben, und im Panel staende ein Gewinn, der den Umsatz
    # tausendfach uebersteigt, ohne dass irgendetwas warnt.
    with pytest.raises(ValueError, match="Einheit"):
        companies.validate([_row(
            revenue="1500", revenue_unit="1000000",
            profit="45000000", profit_unit="1", profit_currency="CHF",
            consolidation_basis="total_group",
        )])


def test_build_artifact_treats_a_reported_zero_revenue_as_a_placeholder_bar():
    """Ein ausgewiesener Umsatz von null ist wahr, aber unzeichenbar.

    Molecular Partners weist fuer 2025 einen Umsatz von CHF 0 aus (2024:
    5.0 Mio.) — klinisches Biotech ohne zugelassenes Produkt. Als echte
    Hoehe gerechnet ergaebe das eine Saeule von null Metern: die Firma
    verschwaende von der Karte, obwohl sie recherchiert ist und es sie gibt.
    Sie bekommt deshalb die Mindesthoehe der Platzhalter-Saeulen; das Panel
    zeigt weiterhin die echte Null.
    """
    artifact = companies.build_artifact(
        [_row(revenue="0", revenue_currency="CHF", revenue_type="net_sales",
              revenue_unit="1000000", note="kein Produktumsatz")],
        noga.load_table(),
    )
    entry = artifact["companies"][0]
    assert entry["revenue"] == 0.0, "die berichtete Null bleibt in den Daten"
    assert entry["placeholder"] is True, "aber sie traegt keine Hoehenaussage"


def test_build_artifact_separates_companies_that_share_exact_coordinates():
    """Zwei Saeulen am selben Punkt: die hoehere verdeckt die niedrigere ganz.

    Vier Adressen tragen je zwei kotierte Gesellschaften — Metall Zug und
    V-ZUG teilen sich die Industriestrasse 66 in Zug, AEVIS und Infracore
    die Rue Georges-Jordil 4 in Fribourg. Gezeichnet am identischen Punkt
    ist die kleinere Firma weder zu sehen noch anzuklicken: sie existiert
    auf der Karte, aber niemand findet sie.

    Sie werden deshalb auf einem kleinen Kreis um den echten Punkt verteilt.
    Der Versatz ist mit `POSITION_SPREAD_M` weit unterhalb der Aufloesung,
    in der die Karte etwas aussagt (Gemeinden), und steht als
    `positionAdjusted` in der Zeile — verschoben, aber nicht verschwiegen.
    """
    rows = [
        _row(six_symbol="A", uid="CHE-1", isin="CH0000000001",
             lon="8.5", lat="47.2", name="Erste AG"),
        _row(six_symbol="B", uid="CHE-2", isin="CH0000000002",
             lon="8.5", lat="47.2", name="Zweite AG"),
        _row(six_symbol="C", uid="CHE-3", isin="CH0000000003",
             lon="9.0", lat="46.0", name="Allein AG"),
    ]
    artifact = companies.build_artifact(rows, noga.load_table())
    by_name = {c["name"]: c for c in artifact["companies"]}

    assert (by_name["Erste AG"]["lon"], by_name["Erste AG"]["lat"]) != \
           (by_name["Zweite AG"]["lon"], by_name["Zweite AG"]["lat"])
    assert by_name["Erste AG"]["positionAdjusted"] == companies.POSITION_SPREAD_M
    assert by_name["Zweite AG"]["positionAdjusted"] == companies.POSITION_SPREAD_M
    assert by_name["Allein AG"]["positionAdjusted"] is None, (
        "eine Firma ohne Nachbarn behaelt ihre exakte Position"
    )
    assert by_name["Allein AG"]["lon"] == 9.0


def test_build_artifact_keeps_the_spread_small_enough_to_stay_in_the_municipality():
    # 150 m verschieben eine Firma nicht in eine andere Gemeinde; sie machen
    # sie nur sichtbar. Waere der Versatz gross, waere die Aussage der Karte
    # ("hier sitzt diese Firma") beschaedigt.
    assert companies.POSITION_SPREAD_M <= 200
