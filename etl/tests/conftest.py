import pytest

from draufsicht_etl import boundaries, config, fetch


def pytest_configure(config):
    # Lokaler Parametername folgt der pytest-Hookspec (pytest_configure(config)).
    # pluggy prüft Hookimpl-Parameternamen gegen die Hookspec; ein anderer Name
    # (z.B. config_) lässt die Registrierung mit PluginValidationError scheitern.
    config.addinivalue_line(
        "markers", "integration: benötigt Netzzugang und echte Rohdaten"
    )


@pytest.fixture(scope="session")
def boundaries_real():
    url = fetch.swissboundaries_gpkg_url()
    zip_path = fetch.download(url, config.DATA_RAW / "swissboundaries3d.gpkg.zip")
    return boundaries.build(zip_path, config.CANTON["bfs_nr"])


@pytest.fixture(scope="session")
def cantons_real():
    url = fetch.swissboundaries_gpkg_url()
    zip_path = fetch.download(url, config.DATA_RAW / "swissboundaries3d.gpkg.zip")
    return boundaries.build_cantons(zip_path)
