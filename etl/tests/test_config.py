from pathlib import Path

from zeigmers_etl import config


def test_canton_is_aargau():
    assert config.CANTON == {"code": "AG", "bfs_nr": 19, "name": "Aargau"}


def test_statent_year():
    assert config.STATENT_YEAR == 2023


def test_paths_are_absolute_and_under_repo_root():
    for p in (config.DATA_RAW, config.DATA_INTERIM, config.DATA_MANUAL, config.PUBLIC_DATA):
        assert isinstance(p, Path)
        assert p.is_absolute()
        assert config.ROOT in p.parents or p == config.ROOT


def test_public_data_points_at_repo_public_dir():
    assert config.PUBLIC_DATA == config.ROOT / "public" / "data"


def test_user_agent_is_identifiable():
    assert config.USER_AGENT.startswith("zeigmers-etl/")


def test_canton_codes_cover_all_26_official_bfs_numbers():
    assert set(config.CANTON_CODES) == set(range(1, 27))
    assert len(set(config.CANTON_CODES.values())) == 26, "Codes müssen eindeutig sein"
    assert config.CANTON_CODES[19] == "AG"
    assert all(len(code) == 2 for code in config.CANTON_CODES.values())


def test_startup_budget_is_smaller_than_the_canton_payload_budget():
    # Der Start lädt nur die nationale Übersicht (klein), ein Kantonswechsel
    # danach ein einzelnes Kanton-Paar (deutlich grösser, siehe config.py) —
    # ein invertiertes Verhältnis wäre ein Zeichen, dass eines der beiden
    # Budgets versehentlich vertauscht wurde.
    assert config.MAX_STARTUP_BYTES < config.MAX_CANTON_PAYLOAD_BYTES
