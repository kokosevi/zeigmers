import json

import pytest

from draufsicht_etl import binpack, config


pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def artifacts():
    missing = [
        n for n in ("ag_kanton", "ag_gemeinde", "ag_hektar")
        if not (config.PUBLIC_DATA / f"{n}.bin").exists()
    ]
    if missing:
        pytest.skip(f"Artefakte fehlen, zuerst `draufsicht-etl all` laufen lassen: {missing}")
    return {
        name: binpack.read_level(
            config.PUBLIC_DATA / f"{name}.bin", config.PUBLIC_DATA / f"{name}.json"
        )
        for name in ("ag_kanton", "ag_gemeinde", "ag_hektar")
    }


def test_hectare_count_is_plausible_for_aargau(artifacts):
    _, meta = artifacts["ag_hektar"]
    assert 10_000 < meta["count"] < 60_000, meta["count"]


def test_municipality_count_is_plausible(artifacts):
    _, meta = artifacts["ag_gemeinde"]
    assert 180 <= meta["count"] <= 200, meta["count"]


def test_sums_match_across_levels(artifacts):
    sums = {name: meta["stats"]["sum"] for name, (_, meta) in artifacts.items()}
    assert sums["ag_hektar"] == pytest.approx(sums["ag_gemeinde"], rel=1e-6)
    assert sums["ag_gemeinde"] == pytest.approx(sums["ag_kanton"], rel=1e-6)


def test_canton_total_is_within_the_plausible_window(artifacts):
    """Kein geschätzter Toleranzwert, sondern ein Fenster aus den zwei bekannten,
    gegenläufigen Verzerrungen zwischen Hektarsumme und amtlicher Referenz.

    Referenz (363'288) und NOLOC-Anteil (3'389) sind Eigenschaften der
    eingefrorenen STATENT-2023-Rohdaten für Aargau (Task 5/10) und werden
    deshalb als Konstanten geführt statt aus dem Artefakt zurückgerechnet.
    `overstatementMax` dagegen kommt live aus dem Artefakt: das ist die
    einzige der drei Grössen, die von unserem eigenen Code abhängt (der
    Ambiguous-Flagging-Logik in `aggregate.stats`), und eine Regression dort
    soll diesen Test tatsächlich zum Kippen bringen können.

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
    _, meta = artifacts["ag_kanton"]
    total = meta["stats"]["sum"]
    overstatement_max = meta["stats"]["overstatementMax"]
    lower, upper = reference - noloc, reference + overstatement_max
    assert lower <= total <= upper, (
        f"Kantonssumme {total:,.0f} liegt ausserhalb des Plausibilitätsfensters "
        f"[{lower:,.0f} .. {upper:,.0f}] (Referenz {reference:,}, NOLOC {noloc:,}, "
        f"Aufrundung bis {overstatement_max:,})"
    )


def test_minimum_hectare_value_is_four(artifacts):
    arrays, _ = artifacts["ag_hektar"]
    assert arrays["values"].min() == 4.0, "Aufrundungsregel aus Spec 6.4 verletzt"


def test_positions_are_inside_the_aargau_bounding_box(artifacts):
    arrays, _ = artifacts["ag_hektar"]
    positions = arrays["positions"].reshape(-1, 2)
    assert 7.6 < positions[:, 0].min() and positions[:, 0].max() < 8.6
    assert 47.1 < positions[:, 1].min() and positions[:, 1].max() < 47.7


def test_total_artifact_size_within_budget():
    total = sum(p.stat().st_size for p in config.PUBLIC_DATA.glob("*") if p.is_file())
    assert total < config.MAX_PUBLIC_DATA_BYTES, f"{total / 1024:.0f} KB"


def test_meta_json_lists_all_levels():
    meta = json.loads((config.PUBLIC_DATA / "meta.json").read_text(encoding="utf-8"))
    assert meta["levels"] == ["kanton", "gemeinde", "hektar"]
    assert meta["canton"]["code"] == "AG"
