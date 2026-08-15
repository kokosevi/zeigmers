"""Liegt jede Firma in der Gemeinde, die ihre Zeile nennt?"""

import geopandas as gpd
import pytest
from shapely.geometry import Polygon

from zeigmers_etl import placement


def _gemeinden():
    """Zwei Quadrate, weit auseinander — Domat/Ems und Giornico als Karikatur."""
    return gpd.GeoDataFrame(
        {"name": ["Domat/Ems", "Giornico"]},
        geometry=[
            Polygon([(9.4, 46.8), (9.5, 46.8), (9.5, 46.9), (9.4, 46.9)]),
            Polygon([(8.8, 46.3), (8.9, 46.3), (8.9, 46.4), (8.8, 46.4)]),
        ],
        crs="EPSG:4326",
    )


def _row(**overrides):
    row = {"six_symbol": "TEST", "name": "Test AG", "city": "Domat/Ems",
           "lon": "9.45", "lat": "46.85"}
    row.update(overrides)
    return row


def test_check_accepts_a_company_inside_the_municipality_it_names():
    assert placement.check([_row()], _gemeinden()) == []


def test_check_finds_a_company_geocoded_into_the_wrong_region():
    # Der reale Fall: EMS-CHEMIEs Adresse enthielt als Strasse den Text "na",
    # und der Geokodierungsdienst lieferte dafuer einen Punkt in Giornico TI —
    # 150 km vom Sitz entfernt, ohne jede Warnung. Der Dienst scheitert nie
    # laut; er liefert immer den naechstbesten Treffer.
    funde = placement.check([_row(lon="8.85", lat="46.35")], _gemeinden())
    assert len(funde) == 1
    assert funde[0]["gemeinde"] == "Giornico"
    assert funde[0]["city"] == "Domat/Ems"


def test_check_reports_a_point_outside_every_municipality():
    funde = placement.check([_row(lon="2.0", lat="48.0")], _gemeinden())
    assert len(funde) == 1
    assert "keiner Schweizer Gemeinde" in funde[0]["grund"]


def test_check_ignores_rows_without_coordinates():
    assert placement.check([_row(lon="", lat="")], _gemeinden()) == []


def test_check_accepts_a_locality_inside_a_differently_named_municipality():
    # Der Normalfall, nicht die Ausnahme: eine Firma sitzt in "Rotkreuz",
    # die Gemeinde heisst Risch. Traegt KEINE Gemeinde den Ortsnamen, laesst
    # sich hier nichts widerlegen — kein Fund.
    funde = placement.check([_row(city="Rotkreuz")], _gemeinden())
    assert funde == []


def test_normalise_strips_the_canton_suffix_in_brackets():
    # Die Grenzdaten schreiben "Altdorf (UR)", die Firmenzeile "Altdorf UR".
    assert placement._normalise("Altdorf (UR)") == placement._normalise("Altdorf UR")


def test_city_match_uses_whole_words_only():
    # "Erlen" (TG) steckt als Teilwort in "Perlen" (LU) und laege 150 km
    # entfernt — ein Teilwort-Treffer meldete hier einen Fund, wo keiner ist.
    gemeinden = gpd.GeoDataFrame(
        {"name": ["Root", "Erlen"]},
        geometry=[
            Polygon([(8.2, 47.1), (8.3, 47.1), (8.3, 47.2), (8.2, 47.2)]),
            Polygon([(9.2, 47.5), (9.3, 47.5), (9.3, 47.6), (9.2, 47.6)]),
        ],
        crs="EPSG:4326",
    )
    funde = placement.check([_row(city="Perlen", lon="8.25", lat="47.15")], gemeinden)
    assert funde == []
