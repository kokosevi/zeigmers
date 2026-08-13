from pathlib import Path

from draufsicht_etl import config


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
    assert config.USER_AGENT.startswith("draufsicht-etl/")
