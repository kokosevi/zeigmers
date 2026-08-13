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
