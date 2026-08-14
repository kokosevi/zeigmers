"""Jahresmittelkurse der SNB — die Faelle, an denen die Hoehe kippt."""

import pytest

from draufsicht_etl import fx

# Zwei Monate M0 und zwei Monate M1 desselben Jahres: die M1-Zeilen duerfen
# NICHT in den Durchschnitt geraten (siehe Moduldokumentation).
SAMPLE = "\n".join([
    '"CubeId";"devkum"',
    '"Date";"D0";"D1";"Value"',
    '"2025-01";"M0";"USD1";"0.90"',
    '"2025-01";"M1";"USD1";"0.10"',
    '"2025-02";"M0";"USD1";"0.80"',
    '"2025-02";"M1";"USD1";"0.10"',
    '"2025-03";"M0";"USD1";"0.85"',
    '"2025-01";"M0";"EUR1";"0.95"',
    '"1914-01";"M0";"USD1";""',
])


def test_parse_takes_monthly_averages_and_ignores_month_end_series():
    monthly = fx.parse(SAMPLE)
    assert monthly[("USD", 2025)] == [0.90, 0.80, 0.85], (
        "M1 (Monatsendkurs) gehoert nicht in den Jahresdurchschnitt"
    )


def test_parse_skips_rows_without_a_value():
    monthly = fx.parse(SAMPLE)
    assert all(v for values in monthly.values() for v in values)


def test_rate_averages_the_months_of_the_year():
    monthly = fx.parse(SAMPLE)
    result = fx.rate("USD", 2025, monthly)
    assert result["rate"] == pytest.approx(0.85)
    assert result["months"] == 3


def test_rate_reports_how_many_months_it_averaged():
    # Ein laufendes Geschaeftsjahr hat weniger als zwoelf Monatswerte. Das
    # Ergebnis bleibt brauchbar, aber die Karte muss es offenlegen koennen,
    # statt es wie ein volles Jahr aussehen zu lassen.
    monthly = {("USD", 2026): [0.79, 0.78, 0.80]}
    assert fx.rate("USD", 2026, monthly)["months"] == 3


def test_rate_for_chf_is_one_without_consulting_the_table():
    assert fx.rate("CHF", 2025, {})["rate"] == 1.0


def test_rate_refuses_a_year_with_too_few_months():
    with pytest.raises(LookupError, match="2027"):
        fx.rate("USD", 2027, {("USD", 2027): [0.79]})


def test_rate_refuses_an_unknown_currency_instead_of_guessing():
    # Eine neue Berichtswaehrung braucht eine belegte SNB-Reihe. Ein
    # geschaetzter Kurs waere genau die Sorte plausibler Zahl, die diese
    # Karte nirgends zeigen soll.
    with pytest.raises(KeyError, match="GBP"):
        fx.rate("GBP", 2025, {})
