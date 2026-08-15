import json

import numpy as np
import pytest

from zeigmers_etl import aggregate, binpack, config, noga


@pytest.fixture(scope="module")
def table():
    return noga.load_table()


def _level(name="hektar", n=3, with_gemeinde=True):
    g = 11
    rng = np.random.default_rng(0)
    dist = rng.random((n, g)).astype("float32") * 10
    return aggregate.LevelData(
        name=name,
        lon=np.linspace(8.0, 8.2, n),
        lat=np.linspace(47.3, 47.5, n),
        value=np.array([4.0, 17.0, 250.0][:n], dtype="float64"),
        noga=np.array([0, 3, config.NOGA_UNKNOWN_INDEX][:n], dtype="uint8"),
        flags=np.array([1, 0, 0][:n], dtype="uint8"),
        dist=dist,
        gemeinde_idx=np.arange(n, dtype="uint16") if with_gemeinde else None,
        gemeinden=[{"bfsNr": 4000 + i, "name": f"Ort{i}"} for i in range(n)]
        if with_gemeinde
        else None,
    )


def test_write_creates_both_files(tmp_path, table):
    bin_path, json_path = binpack.write_level(
        _level(), table, tmp_path, year=2023, canton="AG"
    )
    assert bin_path.name == "ag_hektar.bin"
    assert json_path.name == "ag_hektar.json"
    assert bin_path.exists() and json_path.exists()


def test_roundtrip_preserves_arrays(tmp_path, table):
    level = _level()
    bin_path, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="AG"
    )
    arrays, meta = binpack.read_level(bin_path, json_path)

    assert meta["count"] == level.count
    np.testing.assert_allclose(
        arrays["positions"].reshape(-1, 2)[:, 0], level.lon, rtol=1e-6
    )
    np.testing.assert_allclose(arrays["values"], level.value, rtol=1e-6)
    np.testing.assert_array_equal(arrays["noga"], level.noga)
    np.testing.assert_array_equal(arrays["flags"], level.flags)
    np.testing.assert_array_equal(arrays["gemeindeIdx"], level.gemeinde_idx)


def test_hectare_stores_top3_not_full_distribution(tmp_path, table):
    bin_path, json_path = binpack.write_level(
        _level(), table, tmp_path, year=2023, canton="AG"
    )
    arrays, meta = binpack.read_level(bin_path, json_path)
    assert "mixGroup" in arrays and "mixValue" in arrays
    assert "dist" not in arrays
    assert arrays["mixGroup"].reshape(-1, 3).shape == (3, 3)


def test_municipality_stores_full_distribution(tmp_path, table):
    level = _level(name="gemeinde")
    bin_path, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="AG"
    )
    arrays, meta = binpack.read_level(bin_path, json_path)
    assert "dist" in arrays
    assert "mixGroup" not in arrays
    assert arrays["dist"].reshape(level.count, -1).shape == (3, table.group_count)


def test_municipality_also_stores_the_gemeinde_index(tmp_path, table):
    """Ohne diesen Verweis kann das Frontend einer Gemeindezeile keinen Namen
    zuordnen, sobald Gemeinden ohne Beschäftigte verworfen wurden."""
    level = _level(name="gemeinde")
    bin_path, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="AG"
    )
    arrays, _ = binpack.read_level(bin_path, json_path)
    np.testing.assert_array_equal(arrays["gemeindeIdx"], level.gemeinde_idx)


def test_metadata_carries_groups_year_and_stats(tmp_path, table):
    level = _level()
    _, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="AG",
        extra={"stats": aggregate.stats(level)},
    )
    meta = json.loads(json_path.read_text(encoding="utf-8"))

    assert meta["year"] == 2023
    assert meta["canton"] == "AG"
    assert meta["level"] == "hektar"
    assert [g["key"] for g in meta["nogaGroups"]] == [g.key for g in table.groups]
    assert meta["stats"]["ambiguousCells"] == 1
    assert meta["stats"]["overstatementMax"] == 3


def test_float32_arrays_are_four_byte_aligned(tmp_path, table):
    _, json_path = binpack.write_level(
        _level(), table, tmp_path, year=2023, canton="AG"
    )
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    for name, spec in meta["arrays"].items():
        if spec["type"] == "Float32":
            assert spec["byteOffset"] % 4 == 0, name
        if spec["type"] == "Uint16":
            assert spec["byteOffset"] % 2 == 0, name


def test_gemeinden_table_only_on_hectare_and_municipality(tmp_path, table):
    level = _level(name="kanton", n=1, with_gemeinde=False)
    _, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="AG"
    )
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    assert "gemeinden" not in meta


# --- Phase 1 (alle 26 Kantone): entries_key für die nationale Kantonsstufe ----


def test_entries_key_controls_the_json_field_name(tmp_path, table):
    # Die nationale `ch_kantone`-Übersicht (Change: Phase 1) trägt Kantone,
    # keine Gemeinden — `entries_key="kantone"` schreibt die Einträge unter
    # diesem Namen statt unter "gemeinden", ohne `_collect()`/`_ORDER` oder
    # das Array-Layout selbst zu berühren.
    level = _level(name="kantone", n=2)
    bin_path, json_path = binpack.write_level(
        level, table, tmp_path, year=2023, canton="CH", entries_key="kantone",
    )
    assert bin_path.name == "ch_kantone.bin"
    assert json_path.name == "ch_kantone.json"
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    assert "gemeinden" not in meta
    assert meta["kantone"] == level.gemeinden


def test_entries_key_defaults_to_gemeinden(tmp_path, table):
    level = _level(name="gemeinde")
    _, json_path = binpack.write_level(level, table, tmp_path, year=2023, canton="AG")
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    assert meta["gemeinden"] == level.gemeinden
