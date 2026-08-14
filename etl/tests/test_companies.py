import csv

import pytest

from draufsicht_etl import companies, noga


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
        core_products="Beispielprodukte", founding_year="1950",
        founding_year_source="https://example.test/history",
    )])


def test_validate_rejects_profit_without_report_url():
    with pytest.raises(ValueError, match="profit gesetzt, aber report_url"):
        companies.validate([_row(
            profit="45000000", profit_currency="CHF", profit_unit="1", report_url="",
            # revenue leer machen, damit nicht die revenue-Regel denselben Fehler meldet
            revenue="", revenue_currency="", revenue_type="", revenue_unit="",
            fiscal_year="", note="Umsatz nicht öffentlich",
        )])


def test_validate_rejects_profit_without_fiscal_year():
    with pytest.raises(ValueError, match="profit gesetzt, aber fiscal_year"):
        companies.validate([_row(
            profit="45000000", profit_currency="CHF", profit_unit="1",
            revenue="", revenue_currency="", revenue_type="", revenue_unit="",
            report_url="https://example.test/gb2024.pdf", fiscal_year="",
            note="Umsatz nicht öffentlich",
        )])


def test_validate_rejects_profit_without_profit_currency():
    with pytest.raises(ValueError, match="profit gesetzt, aber profit_currency"):
        companies.validate([_row(profit="45000000", profit_unit="1", profit_currency="")])


def test_validate_rejects_profit_without_profit_unit():
    # Dieselbe Begründung wie bei revenue_unit: ohne Pflicht liest build_artifact() ein
    # leeres profit_unit als Faktor 1 und verschiebt eine in Millionen gemeldete Zahl
    # unbemerkt um den Faktor 10**6.
    with pytest.raises(ValueError, match="profit gesetzt, aber profit_unit"):
        companies.validate([_row(profit="45000000", profit_currency="CHF", profit_unit="")])


def test_validate_allows_empty_profit_without_extra_provenance():
    # profit ist optional (nicht jede Firma weist einen Reingewinn öffentlich aus) —
    # anders als revenue erzwingt ein leeres profit keine note.
    companies.validate([_row(profit="")])


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
            core_products="Pharmazeutische Wirkstoffe im Auftrag",
            products_url="https://example.test/about",
            founding_year="1950", founding_year_source="https://example.test/history",
        )],
        table,
    )
    entry = artifact["companies"][0]
    assert entry["profit"] == 45_000_000
    assert entry["profitCurrency"] == "CHF"
    assert entry["coreProducts"] == "Pharmazeutische Wirkstoffe im Auftrag"
    assert entry["productsUrl"] == "https://example.test/about"
    assert entry["foundingYear"] == 1950


def test_build_artifact_handles_a_loss_as_a_negative_profit():
    table = noga.load_table()
    artifact = companies.build_artifact(
        [_row(profit="-3071000", profit_currency="EUR", profit_unit="1")],
        table,
    )
    assert artifact["companies"][0]["profit"] == -3_071_000


def test_build_artifact_marks_missing_profit_as_none():
    table = noga.load_table()
    artifact = companies.build_artifact([_row(profit="")], table)
    entry = artifact["companies"][0]
    assert entry["profit"] is None
    assert entry["profitCurrency"] is None
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
