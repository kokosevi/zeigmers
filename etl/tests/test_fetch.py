import hashlib
import json

import pytest

from draufsicht_etl import fetch


def test_download_writes_file_and_manifest(tmp_path):
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return b"hallo"

    dest = tmp_path / "raw" / "a.bin"
    out = fetch.download("https://example.test/a", dest, fetcher=fake)

    assert out == dest
    assert dest.read_bytes() == b"hallo"
    assert calls == ["https://example.test/a"]

    manifest = json.loads((dest.parent / "manifest.json").read_text())
    entry = manifest["https://example.test/a"]
    assert entry["sha256"] == hashlib.sha256(b"hallo").hexdigest()
    assert entry["sha256"] == (
        "d3751d33f9cd5049c4af2b462735457e4d3baf130bcbb87f389e349fbaeb20b9"
    )
    assert entry["bytes"] == 5
    assert entry["path"] == "a.bin"


def test_download_uses_cache_on_second_call(tmp_path):
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return b"hallo"

    dest = tmp_path / "raw" / "a.bin"
    fetch.download("https://example.test/a", dest, fetcher=fake)
    fetch.download("https://example.test/a", dest, fetcher=fake)

    assert len(calls) == 1, "zweiter Aufruf muss aus dem Cache bedient werden"


def test_download_force_refetches(tmp_path):
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return b"hallo"

    dest = tmp_path / "raw" / "a.bin"
    fetch.download("https://example.test/a", dest, fetcher=fake)
    fetch.download("https://example.test/a", dest, fetcher=fake, force=True)

    assert len(calls) == 2


def test_download_refetches_when_file_missing_despite_manifest(tmp_path):
    calls = []

    def fake(url: str) -> bytes:
        calls.append(url)
        return b"hallo"

    dest = tmp_path / "raw" / "a.bin"
    fetch.download("https://example.test/a", dest, fetcher=fake)
    dest.unlink()
    fetch.download("https://example.test/a", dest, fetcher=fake)

    assert len(calls) == 2


MODEL_JSON = json.dumps(
    {
        "compiledListAsJson": json.dumps(
            {
                "list": [
                    {
                        "title": "STATENT …: Geodaten 2023",
                        "url": "https://dam.test/assets/111",
                    },
                    {
                        "title": "STATENT …: Geodaten 2022",
                        "url": "https://dam.test/assets/222",
                    },
                ]
            }
        )
    }
).encode()


def test_resolve_asset_url_appends_master():
    url = fetch.resolve_asset_url(
        "https://model.test/x.model.json",
        r"Geodaten\s+2023",
        fetcher=lambda _: MODEL_JSON,
    )
    assert url == "https://dam.test/assets/111/master"


def test_resolve_asset_url_raises_on_no_match():
    with pytest.raises(LookupError, match="1999") as excinfo:
        fetch.resolve_asset_url(
            "https://model.test/x.model.json",
            r"Geodaten\s+1999",
            fetcher=lambda _: MODEL_JSON,
        )
    assert "Geodaten 2023" in str(excinfo.value), (
        "Fehlermeldung muss auch die verfuegbaren Titel auflisten"
    )


def test_resolve_asset_url_raises_on_ambiguous_match():
    with pytest.raises(LookupError, match="mehrdeutig"):
        fetch.resolve_asset_url(
            "https://model.test/x.model.json",
            r"Geodaten",
            fetcher=lambda _: MODEL_JSON,
        )


STAC_JSON = json.dumps(
    {
        "features": [
            {
                "id": "swissboundaries3d_2024-01",
                "assets": {
                    "a_2056.gpkg.zip": {"href": "https://geo.test/2024.gpkg.zip"},
                    "a_2056.shp.zip": {"href": "https://geo.test/2024.shp.zip"},
                },
            },
            {
                "id": "swissboundaries3d_2025-01",
                "assets": {
                    "b_2056.gpkg.zip": {"href": "https://geo.test/2025.gpkg.zip"}
                },
            },
        ],
        "links": [],
    }
).encode()


def test_swissboundaries_picks_newest_gpkg():
    url = fetch.swissboundaries_gpkg_url(fetcher=lambda _: STAC_JSON)
    assert url == "https://geo.test/2025.gpkg.zip"
