import pytest

from draufsicht_etl import columns

GOOD = [
    "RELI", "E_KOORD", "N_KOORD", "ERHJAHR",
    "B23T", "B23S1", "B23EMPT", "B23VZAT",
    "B2301EMP", "B2302EMP", "B2310EMP", "B2347EMP",
    "B2301AS", "B2301VZA", "B2301KB1",
]


def test_resolve_finds_all_roles():
    r = columns.resolve(GOOD)
    assert r.prefix == "23"
    assert r.reli == "RELI"
    assert r.e_koord == "E_KOORD"
    assert r.n_koord == "N_KOORD"
    assert r.emp_total == "B23EMPT"


def test_resolve_collects_divisions_only_from_emp_columns():
    r = columns.resolve(GOOD)
    assert r.division_numbers == [1, 2, 10, 47]
    assert r.emp_div[10] == "B2310EMP"


def test_resolve_ignores_as_vza_and_kb_columns():
    r = columns.resolve(GOOD)
    assert all(name.endswith("EMP") for name in r.emp_div.values())


def test_resolve_works_with_a_different_year_prefix():
    swapped = [c.replace("B23", "B08") for c in GOOD]
    r = columns.resolve(swapped)
    assert r.prefix == "08"
    assert r.emp_total == "B08EMPT"


def test_resolve_raises_on_missing_role():
    with pytest.raises(LookupError, match="emp_total"):
        columns.resolve([c for c in GOOD if c != "B23EMPT"])


def test_resolve_raises_on_mixed_prefixes():
    # Abteilung 55 kommt in GOOD nicht vor, sonst schlägt die Dublettenprüfung
    # zuerst zu und der Präfixtest würde gar nicht erreicht.
    with pytest.raises(ValueError, match="uneinheitlich"):
        columns.resolve([*GOOD, "B2455EMP"])


def test_resolve_raises_on_duplicate_division():
    with pytest.raises(ValueError, match="mehrfach"):
        columns.resolve([*GOOD, "B2310EMP", "B2310EMP "])


def test_resolve_raises_on_ambiguous_role():
    with pytest.raises(ValueError, match="mehrdeutig"):
        columns.resolve([*GOOD, "B23EMPT "])  # führt zu zwei Treffern nach strip


def test_resolve_raises_without_divisions():
    minimal = ["RELI", "E_KOORD", "N_KOORD", "B23EMPT"]
    with pytest.raises(LookupError, match="Abteilungsspalten"):
        columns.resolve(minimal)


def test_roundtrip_dict():
    r = columns.resolve(GOOD)
    assert columns.ResolvedColumns.from_dict(r.to_dict()) == r


def test_save_and_load(tmp_path, monkeypatch):
    from draufsicht_etl import config

    monkeypatch.setattr(config, "COLUMNS_DIR", tmp_path)
    r = columns.resolve(GOOD)
    path = columns.save(r, 2023)
    assert path.exists()
    assert columns.load(2023) == r
