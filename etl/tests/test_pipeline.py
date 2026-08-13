import json

import pytest

from draufsicht_etl import binpack, config


pytestmark = pytest.mark.integration

# Seit 2026-08-13 wird nur noch die Gemeindestufe ausgeliefert (siehe README):
# View B zeigt ausschliesslich die 196 Gemeindebalken. Kanton- und Hektarstufe
# werden im ETL weiterhin berechnet (siehe cli.py, `_run_statent`), aber nicht
# mehr als eigenes Artefakt geschrieben — Tests, die `ag_kanton`/`ag_hektar`
# vom Datenträger lasen, sind darum entfallen oder auf `ag_gemeinde`
# umgestellt, dessen `stats` (Summe, `ambiguousCells`, `overstatementMax`)
# dank `aggregate.stats(municipality, source=hectare)` weiterhin kantonsweite
# Grössen sind, nicht auf die Gemeindestufe beschränkte.


@pytest.fixture(scope="module")
def gemeinde_artifact():
    if not (config.PUBLIC_DATA / "ag_gemeinde.bin").exists():
        pytest.skip("Artefakt fehlt, zuerst `draufsicht-etl all` laufen lassen: ag_gemeinde")
    return binpack.read_level(
        config.PUBLIC_DATA / "ag_gemeinde.bin", config.PUBLIC_DATA / "ag_gemeinde.json"
    )


def test_municipality_count_is_plausible(gemeinde_artifact):
    _, meta = gemeinde_artifact
    assert 180 <= meta["count"] <= 200, meta["count"]


def test_canton_total_is_within_the_plausible_window(gemeinde_artifact):
    """Kein geschätzter Toleranzwert, sondern ein Fenster aus den zwei bekannten,
    gegenläufigen Verzerrungen zwischen Hektarsumme und amtlicher Referenz.

    Referenz (363'288) und NOLOC-Anteil (3'389) sind Eigenschaften der
    eingefrorenen STATENT-2023-Rohdaten für Aargau (Task 5/10) und werden
    deshalb als Konstanten geführt statt aus dem Artefakt zurückgerechnet.
    `overstatementMax` dagegen kommt live aus dem Artefakt: das ist die
    einzige der drei Grössen, die von unserem eigenen Code abhängt (der
    Ambiguous-Flagging-Logik in `aggregate.stats`), und eine Regression dort
    soll diesen Test tatsächlich zum Kippen bringen können.

    Die Gesamtsumme wird aus `ag_gemeinde` gelesen, nicht aus einem eigenen
    `ag_kanton`-Artefakt (das seit 2026-08-13 nicht mehr geschrieben wird):
    `Σ Gemeinde = Kanton` gilt exakt (Aggregations-Invariante, siehe Spec
    6.5), und `stats.sum`/`stats.overstatementMax` werden im ETL ohnehin mit
    `source=hectare` berechnet, zählen also bereits kantonsweit.

    Untere Grenze: Referenz minus die Beschäftigten aus STATENT_NOLOC, die
    keine belastbare Hektarlage haben und deshalb nie in unserer Summe
    auftauchen. Obere Grenze: Referenz plus die maximal mögliche
    Überschätzung durch die BFS-Rundung <4 -> 4 auf Hektarebene (höchstens 3
    pro als mehrdeutig markierter Hektare, siehe Spec 6.4). Ausserhalb dieses
    Fensters kann die Abweichung nicht mehr Rundung sein — dann ist es ein
    Verschnitt- oder Spaltenfehler.
    """
    reference = 363_288
    noloc = 3_389
    _, meta = gemeinde_artifact
    total = meta["stats"]["sum"]
    overstatement_max = meta["stats"]["overstatementMax"]
    lower, upper = reference - noloc, reference + overstatement_max
    assert lower <= total <= upper, (
        f"Kantonssumme {total:,.0f} liegt ausserhalb des Plausibilitätsfensters "
        f"[{lower:,.0f} .. {upper:,.0f}] (Referenz {reference:,}, NOLOC {noloc:,}, "
        f"Aufrundung bis {overstatement_max:,})"
    )


def test_positions_are_inside_the_aargau_bounding_box(gemeinde_artifact):
    arrays, _ = gemeinde_artifact
    positions = arrays["positions"].reshape(-1, 2)
    assert 7.6 < positions[:, 0].min() and positions[:, 0].max() < 8.6
    assert 47.1 < positions[:, 1].min() and positions[:, 1].max() < 47.7


def test_total_artifact_size_within_budget():
    total = sum(p.stat().st_size for p in config.PUBLIC_DATA.glob("*") if p.is_file())
    assert total < config.MAX_PUBLIC_DATA_BYTES, f"{total / 1024:.0f} KB"


def test_meta_json_lists_only_shipped_levels():
    meta = json.loads((config.PUBLIC_DATA / "meta.json").read_text(encoding="utf-8"))
    assert meta["levels"] == ["gemeinde"]
    assert meta["canton"]["code"] == "AG"
