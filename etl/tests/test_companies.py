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
