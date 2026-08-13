import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
from shapely.geometry import box

from draufsicht_etl import columns, statent

# Amtlicher Referenzpunkt: Bern, Bundeshaus / LV95-Nullpunkt-Definition
# 2600000 / 1200000  ->  7.438632 E, 46.951082 N  (swisstopo, Toleranz 1e-4 Grad)
REF_E, REF_N = 2600000.0, 1200000.0
REF_LON, REF_LAT = 7.438632, 46.951082


def test_center_offset_is_fifty_metres():
    e, n = statent.to_center_lv95(np.array([2600000.0]), np.array([1200000.0]))
    assert e[0] == 2600050.0
    assert n[0] == 1200050.0


def test_lv95_to_wgs84_matches_reference_point():
    lon, lat = statent.lv95_to_wgs84(np.array([REF_E]), np.array([REF_N]))
    assert lon[0] == pytest.approx(REF_LON, abs=1e-4)
    assert lat[0] == pytest.approx(REF_LAT, abs=1e-4)


def test_lv95_to_wgs84_is_monotonic_in_easting():
    lon, _ = statent.lv95_to_wgs84(
        np.array([2600000.0, 2610000.0]), np.array([1200000.0, 1200000.0])
    )
    assert lon[1] > lon[0]


def _frame():
    return pd.DataFrame(
        {
            "RELI": [60001200, 60011200, 99999999],
            "E_KOORD": [2600000, 2601000, 2700000],
            "N_KOORD": [1200000, 1200000, 1300000],
            "B23EMPT": [10.0, 4.0, 99.0],
            "B2301EMP": [4.0, 4.0, 0.0],
            "B2328EMP": [8.0, 0.0, 99.0],
        }
    )


def _resolved():
    return columns.resolve(
        ["RELI", "E_KOORD", "N_KOORD", "B23EMPT", "B2301EMP", "B2328EMP"]
    )


def _municipalities():
    """Zwei benachbarte Gemeinden. Zelle 1 liegt in der ersten, Zelle 2 in der
    zweiten, Zelle 3 in keiner von beiden und faellt damit aus dem Kanton."""
    return gpd.GeoDataFrame(
        {"bfs_nr": [4001, 4002], "name": ["Eins", "Zwei"]},
        geometry=[
            box(2599000, 1199000, 2600500, 1201000),
            box(2600500, 1199000, 2602000, 1201000),
        ],
        crs="EPSG:2056",
    )


def test_load_cells_filters_by_municipality_polygons():
    table = statent.load_cells(_frame(), _resolved(), _municipalities())
    assert table.count == 2
    assert list(table.reli) == [60001200, 60011200]


def test_load_cells_derives_gemeindenummer_from_the_spatial_join():
    """Die Hektardaten fuehren keine Gemeindespalte (Task 5) - sie entsteht hier."""
    table = statent.load_cells(_frame(), _resolved(), _municipalities())
    assert list(table.gmde) == [4001, 4002]


def test_load_cells_is_deterministic_when_a_centre_sits_on_a_border():
    import geopandas as gpd_
    from shapely.geometry import box as box_

    overlapping = gpd_.GeoDataFrame(
        {"bfs_nr": [4002, 4001], "name": ["Zwei", "Eins"]},
        geometry=[box_(2599000, 1199000, 2602000, 1201000)] * 2,
        crs="EPSG:2056",
    )
    first = statent.load_cells(_frame(), _resolved(), overlapping)
    second = statent.load_cells(_frame(), _resolved(), overlapping)
    assert list(first.gmde) == list(second.gmde)
    assert set(first.gmde) == {4001}, "bei Gleichstand gewinnt die kleinere Nummer"
    assert first.count == 2, "keine Zeilendopplung durch den Mehrfachtreffer"


def test_load_cells_uses_totals_column_not_division_sum():
    table = statent.load_cells(_frame(), _resolved(), _municipalities())
    # Zeile 0: Abteilungen 4 + 8 = 12, Total ist aber 10
    assert table.emp_total[0] == 10.0
    # Zeile 1: Abteilungen 4 + 0 = 4, Total ist 4
    assert table.emp_total[1] == 4.0


def test_load_cells_keeps_division_matrix_shape():
    table = statent.load_cells(_frame(), _resolved(), _municipalities())
    assert table.divisions == [1, 28]
    assert table.div_emp.shape == (2, 2)
    assert table.div_emp[0].tolist() == [4.0, 8.0]


def test_load_cells_positions_are_cell_centres_in_wgs84():
    table = statent.load_cells(_frame(), _resolved(), _municipalities())
    lon0, lat0 = statent.lv95_to_wgs84(np.array([2600050.0]), np.array([1200050.0]))
    assert table.lon[0] == pytest.approx(lon0[0])
    assert table.lat[0] == pytest.approx(lat0[0])


def test_load_cells_drops_rows_without_employment():
    frame = _frame()
    frame.loc[0, "B23EMPT"] = 0.0
    table = statent.load_cells(frame, _resolved(), _municipalities())
    assert table.count == 1


def test_load_cells_fills_missing_division_values_with_zero():
    frame = _frame()
    frame.loc[0, "B2301EMP"] = np.nan
    table = statent.load_cells(frame, _resolved(), _municipalities())
    assert table.div_emp[0][0] == 0.0


def test_load_cells_keeps_all_arrays_aligned_across_rows():
    """Kein Einzeltest im Brief prueft reli/gmde/emp_total/lon/lat/div_emp
    gemeinsam ueber mehrere Zeilen. Die Gemeinden ueberlappen vollstaendig
    (wie im Grenzfall-Test), was den dedup-Pfad fuer alle drei Zeilen
    erzwingt; ein Vertauschen der Zeilen beim Sortieren/Deduplizieren wuerde
    hier sofort auffallen, weil jede Zeile eindeutige Werte in jeder Spalte
    traegt."""
    frame = pd.DataFrame(
        {
            "RELI": [71001, 71002, 71003],
            "E_KOORD": [2599500.0, 2600500.0, 2601500.0],
            "N_KOORD": [1199500.0, 1199800.0, 1200200.0],
            "B23EMPT": [6.0, 11.0, 8.0],
            "B2301EMP": [1.0, 4.0, 2.0],
            "B2328EMP": [5.0, 7.0, 6.0],
        }
    )
    overlapping = gpd.GeoDataFrame(
        {"bfs_nr": [4002, 4001], "name": ["Zwei", "Eins"]},
        geometry=[box(2599000, 1199000, 2602000, 1201000)] * 2,
        crs="EPSG:2056",
    )

    table = statent.load_cells(frame, _resolved(), overlapping)

    assert table.count == 3
    assert list(table.reli) == [71001, 71002, 71003]
    assert list(table.gmde) == [4001, 4001, 4001]
    assert table.emp_total.tolist() == [6.0, 11.0, 8.0]
    assert table.div_emp.tolist() == [[1.0, 5.0], [4.0, 7.0], [2.0, 6.0]]

    expected_lon, expected_lat = statent.lv95_to_wgs84(
        np.array([2599550.0, 2600550.0, 2601550.0]),
        np.array([1199550.0, 1199850.0, 1200250.0]),
    )
    assert table.lon.tolist() == pytest.approx(expected_lon.tolist())
    assert table.lat.tolist() == pytest.approx(expected_lat.tolist())


def test_load_cells_raises_when_nothing_survives_the_filter():
    # `load_cells` erwartet seit der Signaturaenderung Gemeindepolygone als
    # GeoDataFrame, nicht mehr eine einzelne Kantonsflaeche (siehe Kopf der
    # Aufgabenbeschreibung). Die Box liegt fernab jeder Testzelle.
    no_match = gpd.GeoDataFrame(
        {"bfs_nr": [9999], "name": ["Nirgendwo"]},
        geometry=[box(0, 0, 1, 1)],
        crs="EPSG:2056",
    )
    with pytest.raises(ValueError, match="keine Hektare"):
        statent.load_cells(_frame(), _resolved(), no_match)
