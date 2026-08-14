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


@pytest.fixture(scope="session")
def all_bounds_real():
    """Alle 26 Kantone auf einmal (Phase 1) — session-scoped, weil eine
    einzelne `build_all()`-Auswertung mehrere Sekunden braucht und mehrere
    Tests dieselbe Grundlage prüfen (AG-Gleichheit mit `build()`,
    Nummernbereich-Sauberkeit je Kanton)."""
    url = fetch.swissboundaries_gpkg_url()
    zip_path = fetch.download(url, config.DATA_RAW / "swissboundaries3d.gpkg.zip")
    return boundaries.build_all(zip_path)
