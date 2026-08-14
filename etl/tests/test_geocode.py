import json

import pytest

from draufsicht_etl import geocode

RESPONSE = json.dumps(
    {"results": [{"attrs": {"lon": 8.0442, "lat": 47.3903, "label": "Aarau"}}]}
).encode()


def test_geocode_returns_lon_lat():
    lon, lat = geocode.geocode("Bahnhofstrasse 1 5000 Aarau", fetcher=lambda _: RESPONSE)
    assert (lon, lat) == (8.0442, 47.3903)


def test_geocode_raises_on_no_result():
    empty = json.dumps({"results": []}).encode()
    with pytest.raises(LookupError, match="kein Treffer"):
        geocode.geocode("Nirgendwo", fetcher=lambda _: empty)


def test_fill_missing_only_touches_empty_rows():
    rows = [
        {"geocode_query": "A", "lon": "8.0", "lat": "47.0"},
        {"geocode_query": "B", "lon": "", "lat": ""},
    ]
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return RESPONSE

    assert geocode.fill_missing(rows, fetcher=fake) == 1
    assert len(calls) == 1
    assert rows[0]["lon"] == "8.0"
    assert rows[1]["lon"] == "8.0442"


def test_fill_missing_survives_a_service_error_on_one_row():
    """Ein HTTP-Fehler für EINE Adresse darf den Lauf nicht abbrechen.

    Beobachtet am 14. August 2026: nach der Umstellung auf GLEIF-Sitze
    lieferte swisstopos SearchServer für eine der ~190 Adressen HTTP 400.
    `fill_missing` fing bis dahin nur `LookupError` ("kein Treffer") ab — der
    HTTPError schlug durch und verwarf die bereits geokodierten Zeilen des
    ganzen Laufs, weil erst am Ende persistiert wird. Ein Dienstfehler für
    eine Zeile ist derselbe Fall wie kein Treffer: die Zeile bleibt ohne
    Sitz, der Rest läuft weiter.
    """
    import urllib.error

    seen = []

    def fetcher(url: str) -> bytes:
        if "Kaputt" in url:
            raise urllib.error.HTTPError(url, 400, "Bad Request", {}, None)
        return RESPONSE

    rows = [
        {"geocode_query": "Kaputte Strasse 1, 9999 Kaputt", "lon": "", "lat": ""},
        {"geocode_query": "Bahnhofstrasse 1, 5000 Aarau", "lon": "", "lat": ""},
    ]
    filled = geocode.fill_missing(
        rows, fetcher=fetcher, delay=0, on_failure=lambda row, exc: seen.append(row)
    )

    assert filled == 1, "die zweite Zeile muss trotz des Fehlers geokodiert werden"
    assert len(seen) == 1 and seen[0] is rows[0]
    assert rows[1]["lon"] == "8.0442"


def test_fill_missing_falls_back_to_the_municipality_when_the_full_address_fails():
    """Scheitert die Hausadresse, wird der Ort probiert — und das vermerkt.

    GLEIF liefert Adresszeilen mit Zusätzen ("Caisse de pensions Swatch
    Group", "EPFL — Quartier de l'Innovation"), an denen swisstopos
    Gebäudesuche scheitert, obwohl Ort und PLZ zweifelsfrei sind. Ohne
    Rückfall verlören The Swatch Group und Logitech ihre Säule ganz. Der
    Rückfall ist ortsgenau, nicht hausgenau — deshalb muss er in der Zeile
    stehen und darf nicht wie eine exakte Adresse aussehen.
    """
    def fetcher(url: str) -> bytes:
        if "Zusatz" in url:
            raise LookupError("kein Treffer")
        return RESPONSE

    rows = [{"geocode_query": "Musterweg 3, Zusatz GmbH, 5000 Aarau",
             "street": "Musterweg 3, Zusatz GmbH", "zip": "5000", "city": "Aarau",
             "seat_basis": "hq", "lon": "", "lat": ""}]
    filled = geocode.fill_missing(rows, fetcher=fetcher, delay=0)

    assert filled == 1
    assert rows[0]["lon"] == "8.0442"
    assert rows[0]["seat_basis"] == "hq-ortsgenau", (
        "die geringere Genauigkeit muss in der Zeile sichtbar sein"
    )
