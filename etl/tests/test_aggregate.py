import numpy as np
import pytest

from draufsicht_etl import aggregate, config, noga, statent


@pytest.fixture(scope="module")
def table():
    return noga.load_table()


def _cells(emp_total, div_emp, divisions, gmde=None):
    n = len(emp_total)
    return statent.CellTable(
        reli=np.arange(n, dtype="int64"),
        lon=np.linspace(8.0, 8.1, n),
        lat=np.linspace(47.4, 47.5, n),
        gmde=np.asarray(gmde if gmde is not None else [4001] * n, dtype="int32"),
        emp_total=np.asarray(emp_total, dtype="float64"),
        div_emp=np.asarray(div_emp, dtype="float64"),
        divisions=list(divisions),
    )


def test_group_raw_sums_divisions_into_groups(table):
    # 1 -> landwirtschaft (Index 0), 28 und 20 -> industrie (Index 1)
    cells = _cells([100.0], [[5.0, 7.0, 3.0]], [1, 28, 20])
    raw = aggregate.group_raw(cells, table)
    assert raw.shape == (1, table.group_count)
    assert raw[0, 0] == 5.0
    assert raw[0, 1] == 10.0


def test_group_raw_raises_on_unknown_division(table):
    cells = _cells([10.0], [[1.0]], [4])  # 4 existiert in NOGA 2008 nicht
    with pytest.raises(KeyError, match="4"):
        aggregate.group_raw(cells, table)


def test_normalise_dist_scales_to_total():
    raw = np.array([[4.0, 8.0]])
    dist = aggregate.normalise_dist(raw, np.array([10.0]))
    assert dist.sum() == pytest.approx(10.0)
    assert dist[0].tolist() == pytest.approx([10 / 3, 20 / 3])


def test_normalise_dist_never_sums_division_columns_into_a_total():
    # vier Abteilungen a 4 (alle aufgerundet), Total ist 4 — nicht 16
    raw = np.array([[4.0, 4.0, 4.0, 4.0]])
    dist = aggregate.normalise_dist(raw, np.array([4.0]))
    assert dist.sum() == pytest.approx(4.0)


def test_normalise_dist_handles_empty_row():
    dist = aggregate.normalise_dist(np.array([[0.0, 0.0]]), np.array([7.0]))
    assert dist.sum() == 0.0


def test_dominant_group_picks_unique_maximum():
    dist = np.array([[1.0, 9.0, 2.0]])
    assert aggregate.dominant_group(dist).tolist() == [1]


def test_dominant_group_is_unknown_when_maximum_is_tied():
    dist = np.array([[4.0, 4.0, 0.0]])
    assert aggregate.dominant_group(dist).tolist() == [config.NOGA_UNKNOWN_INDEX]


def test_dominant_group_is_unknown_for_empty_row():
    dist = np.array([[0.0, 0.0]])
    assert aggregate.dominant_group(dist).tolist() == [config.NOGA_UNKNOWN_INDEX]


def test_top3_returns_three_largest_descending():
    dist = np.array([[1.0, 5.0, 3.0, 9.0]])
    groups, values = aggregate.top3(dist)
    assert groups[0].tolist() == [3, 1, 2]
    assert values[0].tolist() == [9, 5, 3]


def test_top3_pads_with_unknown_when_fewer_than_three_groups_present():
    dist = np.array([[0.0, 6.0, 0.0, 0.0]])
    groups, values = aggregate.top3(dist)
    assert groups[0][0] == 1 and values[0][0] == 6
    assert groups[0][1] == config.NOGA_UNKNOWN_INDEX
    assert values[0][1] == 0


def test_build_hectare_sets_ambiguous_flag_only_at_exactly_four(table):
    cells = _cells([4.0, 5.0, 12.0], [[4.0], [5.0], [12.0]], [28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    assert level.flags.tolist() == [config.FLAG_AMBIGUOUS, 0, 0]


def test_build_hectare_value_comes_from_total_column(table):
    cells = _cells([10.0], [[4.0, 8.0]], [1, 28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    assert level.value.tolist() == [10.0]


def _municipalities():
    import geopandas as gpd
    from shapely.geometry import box

    return gpd.GeoDataFrame(
        {"bfs_nr": [4001, 4002], "name": ["Aarau", "Baden"]},
        geometry=[box(2600000, 1200000, 2601000, 1201000),
                  box(2601000, 1200000, 2602000, 1201000)],
        crs=config.SRC_LV95,
    )


def _municipalities_with_population(einwohnerzahl=(22710, 23853)):
    import geopandas as gpd
    from shapely.geometry import box

    return gpd.GeoDataFrame(
        {"bfs_nr": [4001, 4002], "name": ["Aarau", "Baden"], "einwohnerzahl": list(einwohnerzahl)},
        geometry=[box(2600000, 1200000, 2601000, 1201000),
                  box(2601000, 1200000, 2602000, 1201000)],
        crs=config.SRC_LV95,
    )


# --- Change 2: Beschäftigte je Einwohner — einwohnerzahl in `gemeinden` und
# `stats()["population"]` ------------------------------------------------


def test_hectare_entries_carry_einwohnerzahl_when_present(table):
    cells = _cells([10.0, 6.0], [[10.0], [6.0]], [28], gmde=[4001, 4002])
    level = aggregate.build_hectare(cells, table, _municipalities_with_population())
    by_bfs = {e["bfsNr"]: e["einwohnerzahl"] for e in level.gemeinden}
    assert by_bfs == {4001: 22710, 4002: 23853}


def test_hectare_entries_default_einwohnerzahl_to_zero_when_column_missing(table):
    # Ältere/synthetische `municipalities`-Tabellen ohne `einwohnerzahl`-Spalte
    # (wie `_municipalities()` oben) dürfen nicht crashen — 0 statt Absturz.
    cells = _cells([10.0, 6.0], [[10.0], [6.0]], [28], gmde=[4001, 4002])
    level = aggregate.build_hectare(cells, table, _municipalities())
    assert all(e["einwohnerzahl"] == 0 for e in level.gemeinden)


def test_hectare_entries_normalise_nan_population_to_zero(table):
    # swissBOUNDARIES3D führt laut Objektkatalog keinen Wert für
    # Exklaven-Teilpolygone — muss zu 0 werden, nie zu NaN durchgereicht.
    cells = _cells([10.0], [[10.0]], [28], gmde=[4001])
    munis = _municipalities_with_population((float("nan"), 23853))
    level = aggregate.build_hectare(cells, table, munis)
    assert level.gemeinden[0]["einwohnerzahl"] == 0


def test_stats_sums_population_across_all_gemeinden(table):
    # Die Summe zaehlt immer die volle 196(hier: 2)-Gemeinden-Tabelle, nicht
    # nur die im aktuellen `value`-Array ueberlebenden Zeilen (siehe
    # `build_municipality`s `keep`-Filter) — sonst waere die Kantonssumme von
    # der zufaelligen Reihenfolge/Filterung der Aufrufstufe abhaengig.
    cells = _cells([10.0, 6.0], [[10.0], [6.0]], [28], gmde=[4001, 4002])
    munis = _municipalities_with_population()
    hectare = aggregate.build_hectare(cells, table, munis)
    municipality = aggregate.build_municipality(hectare, munis)

    assert aggregate.stats(hectare)["population"] == 22710 + 23853
    assert aggregate.stats(municipality, source=hectare)["population"] == 22710 + 23853


def test_stats_population_is_zero_when_gemeinden_is_absent(table):
    # Kantonsstufe (`build_canton`) traegt kein `gemeinden` — `stats()` darf
    # daran nicht scheitern.
    cells = _cells([10.0], [[10.0]], [28])
    munis = _municipalities_with_population()
    hectare = aggregate.build_hectare(cells, table, munis)
    from shapely.geometry import box

    canton = aggregate.build_canton(hectare, box(2600000, 1200000, 2602000, 1201000))
    assert canton.gemeinden is None
    assert aggregate.stats(canton)["population"] == 0


def test_build_municipality_sums_totals(table):
    cells = _cells([10.0, 4.0, 6.0], [[10.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    muni = aggregate.build_municipality(hectare, _municipalities())

    assert muni.count == 2
    order = np.argsort(muni.value)[::-1]
    assert muni.value[order].tolist() == [14.0, 6.0]


def test_aggregation_invariant_hectare_equals_municipality_equals_canton(table):
    from shapely.geometry import box

    cells = _cells([10.0, 4.0, 6.0], [[10.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    muni = aggregate.build_municipality(hectare, _municipalities())
    canton = aggregate.build_canton(hectare, box(2600000, 1200000, 2602000, 1201000))

    assert hectare.value.sum() == pytest.approx(muni.value.sum())
    assert muni.value.sum() == pytest.approx(canton.value.sum())


def test_ambiguous_cells_are_counted_consistently_across_levels(table):
    from shapely.geometry import box

    cells = _cells([4.0, 4.0, 6.0], [[4.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    canton = aggregate.build_canton(hectare, box(2600000, 1200000, 2602000, 1201000))

    # Mehrdeutigkeit ist definitionsgemäss eine Eigenschaft der Hektarzellen.
    # Höhere Stufen zählen sie deshalb über `source`, nicht über eigene Flags.
    assert aggregate.stats(hectare)["ambiguousCells"] == 2
    assert aggregate.stats(canton, source=hectare)["ambiguousCells"] == 2
    assert aggregate.stats(canton)["ambiguousCells"] == 0


def test_hectare_entries_carry_the_ambiguous_count_per_gemeinde(table):
    # Zwei mehrdeutige Hektaren in Aarau (4001), eine echte in Baden (4002) —
    # ohne diesen Eintrag müsste das Frontend entweder die kantonsweite Zahl
    # zeigen oder alle Hektarzellen selbst durchzählen (siehe Abschluss-
    # Review, deferred finding zu aggregate.py:133-134).
    cells = _cells([4.0, 4.0, 6.0], [[4.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    by_bfs = {e["bfsNr"]: e["ambiguousCells"] for e in hectare.gemeinden}
    assert by_bfs == {4001: 2, 4002: 0}


def test_municipality_entries_share_the_same_ambiguous_count(table):
    # `build_municipality` mutiert `entries` nicht erneut — beide Stufen
    # teilen sich dasselbe von `build_hectare` befüllte Objekt.
    cells = _cells([4.0, 4.0, 6.0], [[4.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    muni = aggregate.build_municipality(hectare, _municipalities())
    assert muni.gemeinden is hectare.gemeinden


def test_stats_overstatement_is_three_times_ambiguous_cells(table):
    cells = _cells([4.0, 4.0, 6.0], [[4.0], [4.0], [6.0]], [28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    s = aggregate.stats(level)
    assert s["overstatementMax"] == 3 * s["ambiguousCells"]


def test_dist_row_sums_match_totals(table):
    cells = _cells([10.0, 20.0], [[4.0, 8.0], [1.0, 1.0]], [1, 28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    assert level.dist.sum(axis=1) == pytest.approx(level.value, abs=0.5)


def test_dist_is_never_negative(table):
    cells = _cells([10.0], [[4.0, 8.0]], [1, 28])
    level = aggregate.build_hectare(cells, table, _municipalities())
    assert (level.dist >= 0).all()


def test_hectare_gemeinde_index_points_at_the_right_name(table):
    cells = _cells([10.0, 6.0], [[10.0], [6.0]], [28], gmde=[4002, 4001])
    level = aggregate.build_hectare(cells, table, _municipalities())
    names = [level.gemeinden[i]["name"] for i in level.gemeinde_idx]
    assert names == ["Baden", "Aarau"]


def test_hectare_raises_on_unknown_gmde(table):
    cells = _cells([10.0], [[10.0]], [28], gmde=[9999])
    with pytest.raises(ValueError, match="9999"):
        aggregate.build_hectare(cells, table, _municipalities())


# Guards gegen die tatsächlich heruntergeladenen Daten (cli.py, `_run_statent`), nicht
# nur gegen die Aggregationsfunktionen selbst — siehe deren Docstrings. Diese Tests
# prüfen die Guard-Logik an synthetischen Objekten (schnell, kein Download nötig); dass
# die Invariante an den echten Aargauer Daten hält, prüft der Guard selbst bei jedem
# `draufsicht-etl statent`/`all`-Lauf.


def _canton_box():
    from shapely.geometry import box

    return box(2600000, 1200000, 2602000, 1201000)


def test_assert_sums_match_passes_for_consistent_levels(table):
    cells = _cells([10.0, 4.0, 6.0], [[10.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    municipality = aggregate.build_municipality(hectare, _municipalities())
    canton = aggregate.build_canton(hectare, _canton_box())
    aggregate.assert_sums_match(hectare, municipality, canton)  # nicht wirft


def test_assert_sums_match_raises_when_municipality_sum_diverges(table):
    cells = _cells([10.0, 4.0, 6.0], [[10.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    municipality = aggregate.build_municipality(hectare, _municipalities())
    canton = aggregate.build_canton(hectare, _canton_box())
    municipality.value[0] += 1000.0  # simuliert einen Regressionsfehler
    with pytest.raises(ValueError, match="Σ Hektar"):
        aggregate.assert_sums_match(hectare, municipality, canton)


def test_assert_sums_match_raises_when_canton_sum_diverges(table):
    cells = _cells([10.0, 4.0, 6.0], [[10.0], [4.0], [6.0]], [28],
                   gmde=[4001, 4001, 4002])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    municipality = aggregate.build_municipality(hectare, _municipalities())
    canton = aggregate.build_canton(hectare, _canton_box())
    canton.value[0] += 1000.0
    with pytest.raises(ValueError, match="Kanton"):
        aggregate.assert_sums_match(hectare, municipality, canton)


def test_assert_minimum_hectare_value_is_four_passes_when_a_cell_is_ambiguous(table):
    cells = _cells([4.0, 10.0, 12.0], [[4.0], [10.0], [12.0]], [28])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    aggregate.assert_minimum_hectare_value_is_four(hectare)  # wirft nicht


def test_assert_minimum_hectare_value_is_four_raises_when_no_cell_is_ambiguous(table):
    cells = _cells([5.0, 10.0, 12.0], [[5.0], [10.0], [12.0]], [28])
    hectare = aggregate.build_hectare(cells, table, _municipalities())
    with pytest.raises(ValueError, match="4"):
        aggregate.assert_minimum_hectare_value_is_four(hectare)


def test_assert_minimum_hectare_value_is_four_tolerates_empty_input(table):
    empty = aggregate.LevelData(
        name="hektar",
        lon=np.array([], dtype="float64"),
        lat=np.array([], dtype="float64"),
        value=np.array([], dtype="float64"),
        noga=np.array([], dtype="uint8"),
        flags=np.array([], dtype="uint8"),
        dist=np.zeros((0, table.group_count), dtype="float32"),
    )
    aggregate.assert_minimum_hectare_value_is_four(empty)  # wirft nicht
