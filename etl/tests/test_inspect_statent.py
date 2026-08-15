import io
import zipfile

import pandas as pd

from zeigmers_etl import inspect_statent


def _zip_with(tmp_path, files: dict[str, bytes]):
    path = tmp_path / "geodaten.zip"
    with zipfile.ZipFile(path, "w") as zf:
        for name, payload in files.items():
            zf.writestr(name, payload)
    return path


def test_find_hectare_csv_picks_largest_csv(tmp_path):
    path = _zip_with(
        tmp_path,
        {
            "doc/liesmich.txt": b"x" * 5000,
            "klein.csv": b"a,b\n1,2\n",
            "unterordner/gross.csv": b"a,b\n" + b"1,2\n" * 500,
        },
    )
    assert inspect_statent.find_hectare_csv(path) == "unterordner/gross.csv"


def test_find_hectare_csv_raises_when_absent(tmp_path):
    path = _zip_with(tmp_path, {"nur.txt": b"x"})
    try:
        inspect_statent.find_hectare_csv(path)
    except LookupError as exc:
        assert "nur.txt" in str(exc)
    else:
        raise AssertionError("LookupError erwartet")


def test_profile_columns_reports_ranges_and_nulls():
    frame = pd.DataFrame(
        {
            "E_KOORD": [2600000, 2600100, 2600200],
            "B2301EMP": [4.0, None, 12.0],
            "GMDE": [4001, 4001, 4002],
        }
    )
    profile = {c["name"]: c for c in inspect_statent.profile_columns(frame)}

    assert profile["E_KOORD"]["min"] == 2600000
    assert profile["E_KOORD"]["max"] == 2600200
    assert profile["E_KOORD"]["nulls"] == 0
    assert profile["B2301EMP"]["nulls"] == 1
    assert profile["B2301EMP"]["min"] == 4.0
    assert profile["GMDE"]["distinct"] == 2


def test_profile_columns_handles_all_null_column():
    frame = pd.DataFrame({"leer": [None, None]})
    entry = inspect_statent.profile_columns(frame)[0]
    assert entry["nulls"] == 2
    assert entry["min"] is None and entry["max"] is None
