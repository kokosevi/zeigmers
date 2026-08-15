import hashlib
import json
import subprocess

import pytest

from zeigmers_etl import binpack, config


pytestmark = pytest.mark.integration

# Seit Phase 1 (2026-08-14, alle 26 Kantone) schreibt das ETL 26 Gemeinde-/
# Grenzen-Paare (`<code>_gemeinde.{bin,json}` + `<code>_boundaries.geojson`)
# plus eine nationale Übersicht (`ch_kantone.{bin,json,geojson}`) statt eines
# einzigen `ag_*`-Tripels. `ag_gemeinde.{bin,json}`/`ag_boundaries.geojson`
# bleiben trotzdem committet und müssen byte-identisch mit dem Stand vor
# dieser Ausweitung sein (siehe ETL-Report) — die stärkste verfügbare Prüfung,
# dass die Generalisierung den Aargau-Sonderfall nicht verändert hat.


@pytest.fixture(scope="module")
def meta():
    path = config.PUBLIC_DATA / "meta.json"
    if not path.exists():
        pytest.skip("meta.json fehlt, zuerst `zeigmers-etl all` laufen lassen")
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def gemeinde_artifact():
    if not (config.PUBLIC_DATA / "ag_gemeinde.bin").exists():
        pytest.skip("Artefakt fehlt, zuerst `zeigmers-etl all` laufen lassen: ag_gemeinde")
    return binpack.read_level(
        config.PUBLIC_DATA / "ag_gemeinde.bin", config.PUBLIC_DATA / "ag_gemeinde.json"
    )


@pytest.fixture(scope="module")
def kantone_artifact():
    if not (config.PUBLIC_DATA / "ch_kantone.bin").exists():
        pytest.skip("Artefakt fehlt, zuerst `zeigmers-etl all` laufen lassen: ch_kantone")
    return binpack.read_level(
        config.PUBLIC_DATA / "ch_kantone.bin", config.PUBLIC_DATA / "ch_kantone.json"
    )


# --- Aargau bleibt unverändert (die stärkste Prüfung der Generalisierung) ----


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


def test_aargau_artifacts_are_byte_identical_to_the_committed_baseline():
    """Die stärkste verfügbare Prüfung, dass die Ausweitung auf 26 Kantone
    (Phase 1) den Aargau-Sonderfall nicht verändert hat: ein `git show
    HEAD:...`-Vergleich der drei Aargau-Artefakte gegen den zuletzt
    committeten Stand. Läuft nur innerhalb eines Git-Worktrees (übersprungen,
    falls `git` fehlschlägt, z.B. in einem Tarball-Checkout ohne `.git`).
    """
    names = ["ag_gemeinde.bin", "ag_gemeinde.json", "ag_boundaries.geojson"]
    for name in names:
        path = config.PUBLIC_DATA / name
        if not path.exists():
            pytest.skip(f"Artefakt fehlt: {name}")

    for name in names:
        path = config.PUBLIC_DATA / name
        rel = path.relative_to(config.ROOT).as_posix()
        result = subprocess.run(
            ["git", "show", f"HEAD:{rel}"],
            cwd=config.ROOT, capture_output=True, check=False,
        )
        if result.returncode != 0:
            pytest.skip(f"Kein committeter Stand für {rel} auffindbar (git show fehlgeschlagen)")
        committed_hash = hashlib.sha256(result.stdout).hexdigest()
        current_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        assert committed_hash == current_hash, (
            f"{name} weicht vom committeten Stand ab — die Ausweitung auf 26 "
            "Kantone darf den Aargau-Sonderfall nicht verändern (siehe ETL-Report)."
        )


# --- Nationale Übersicht `ch_kantone` (Phase 1) ------------------------------


def test_cantons_geojson_is_shipped_and_within_its_own_budget():
    # ch_kantone.geojson (Change 3, ersetzt die swisstopo-Vektorkacheln) ist
    # kantonsunabhängig und wird deshalb hier separat geprüft, nicht über
    # gemeinde_artifact/meta.json (die kennen nur die STATENT-Stufen).
    path = config.PUBLIC_DATA / "ch_kantone.geojson"
    if not path.exists():
        pytest.skip("ch_kantone.geojson fehlt, zuerst `zeigmers-etl all` laufen lassen")
    assert path.stat().st_size < config.MAX_CANTONS_BYTES
    data = json.loads(path.read_text(encoding="utf-8"))
    assert len(data["features"]) == 26
    bfs_numbers = {f["properties"]["bfs_nr"] for f in data["features"]}
    assert config.CANTON["bfs_nr"] in bfs_numbers


def test_ch_kantone_bin_json_carries_one_row_per_canton(kantone_artifact):
    arrays, meta = kantone_artifact
    assert meta["count"] == 26
    assert meta["canton"] == "CH"
    assert len(meta["kantone"]) == 26
    assert "gemeinden" not in meta, "Kantonszeilen heissen 'kantone', nicht 'gemeinden'"
    assert arrays["values"].shape[0] == 26
    # Volle Verteilung wie eine Gemeindezeile, nicht Top-3 wie eine Hektarzeile.
    assert "dist" in arrays
    assert "mixGroup" not in arrays


def test_ch_kantone_entries_carry_the_fields_a_municipality_row_carries(kantone_artifact):
    _, meta = kantone_artifact
    entry = next(e for e in meta["kantone"] if e["code"] == "AG")
    assert entry["bfsNr"] == 19
    assert entry["name"] == "Aargau"
    assert "ambiguousCells" in entry
    assert "einwohnerzahl" in entry
    assert entry["einwohnerzahl"] > 500_000  # Aargau hat deutlich mehr als 500k Einwohner


def test_ch_kantone_rows_are_sorted_by_bfs_nr(kantone_artifact):
    _, meta = kantone_artifact
    bfs_numbers = [e["bfsNr"] for e in meta["kantone"]]
    assert bfs_numbers == sorted(bfs_numbers)
    assert bfs_numbers == list(range(1, 27))


def test_ch_kantone_sum_is_the_national_total(kantone_artifact):
    arrays, meta = kantone_artifact
    assert float(arrays["values"].sum()) == pytest.approx(meta["stats"]["sum"], rel=1e-6)
    # Schweizweite Beschäftigung liegt klar über jedem Einzelkanton — ein
    # grober Plausibilitätsanker, kein exaktes Fenster wie bei Aargau.
    assert 5_000_000 < meta["stats"]["sum"] < 7_000_000


# --- meta.json als Index über alle 26 Kantone (Phase 1) ----------------------


def test_meta_json_stays_backwards_compatible_for_the_frontend(meta):
    # `src/data/loader.ts`s `Meta`-Interface und `src/main.ts` lesen nur
    # `meta.canton.{code,bfs_nr,name}`, `meta.year`, `meta.levels` — diese
    # Felder müssen exakt in dieser Form bestehen bleiben, ohne dass `src/`
    # angefasst werden muss (siehe Aufgabenstellung).
    assert meta["canton"] == {"code": "AG", "bfs_nr": 19, "name": "Aargau"}
    assert meta["year"] == config.STATENT_YEAR
    assert "gemeinde" in meta["levels"]


def test_meta_json_lists_all_26_cantons_as_an_index(meta):
    cantons = meta["cantons"]
    assert len(cantons) == 26
    codes = {c["code"] for c in cantons}
    assert codes == set(config.CANTON_CODES.values())
    for c in cantons:
        assert set(c) >= {"code", "bfsNr", "name", "gemeindeCount", "employment"}
    total_municipalities = sum(c["gemeindeCount"] for c in cantons)
    assert total_municipalities == 2110, total_municipalities
    ag = next(c for c in cantons if c["code"] == "AG")
    assert ag["gemeindeCount"] == 196
    assert ag["bfsNr"] == 19


def test_meta_json_cantons_are_sorted_by_bfs_nr(meta):
    bfs_numbers = [c["bfsNr"] for c in meta["cantons"]]
    assert bfs_numbers == list(range(1, 27))


# --- Alle 26 Kantone: Artefakte vorhanden, Grössen unter den Pro-Kanton-Budgets


def test_every_canton_has_a_gemeinde_and_boundaries_artifact(meta):
    for c in meta["cantons"]:
        code = c["code"].lower()
        for name in (f"{code}_gemeinde.bin", f"{code}_gemeinde.json", f"{code}_boundaries.geojson"):
            path = config.PUBLIC_DATA / name
            assert path.exists(), f"{name} fehlt"
            assert path.stat().st_size > 0, f"{name} ist leer"


def test_every_canton_gemeinde_count_matches_its_own_artifact(meta):
    for c in meta["cantons"]:
        code = c["code"].lower()
        _, level_meta = binpack.read_level(
            config.PUBLIC_DATA / f"{code}_gemeinde.bin",
            config.PUBLIC_DATA / f"{code}_gemeinde.json",
        )
        assert level_meta["count"] == c["gemeindeCount"], c["code"]


# --- Zwei Budgets statt eines Gesamtbudgets (siehe config.py) ---------------


def test_startup_payload_is_within_its_budget():
    # Was die Karte beim Start lädt, bevor irgendein Kanton aufgeklappt ist —
    # nicht die Summe über alle 26 Kantons-Pakete (die lädt nie jemand auf
    # einmal, siehe config.py-Kommentar zu MAX_STARTUP_BYTES).
    names = ("meta.json", "ch_kantone.bin", "ch_kantone.json",
              "ch_kantone.geojson", "companies.json")
    paths = [config.PUBLIC_DATA / n for n in names]
    if not all(p.exists() for p in paths):
        pytest.skip("Start-Artefakte fehlen, zuerst `zeigmers-etl all` laufen lassen")
    total = sum(p.stat().st_size for p in paths)
    assert total < config.MAX_STARTUP_BYTES, f"{total / 1024:.0f} KB"


def test_largest_canton_payload_is_within_its_budget(meta):
    # Bern (334 Gemeinden nach Objektart-Filter, siehe ETL-Report) ist der
    # gemessene Extremfall.
    worst_code, worst_size = None, 0
    for c in meta["cantons"]:
        code = c["code"].lower()
        parts = [
            config.PUBLIC_DATA / f"{code}_gemeinde.bin",
            config.PUBLIC_DATA / f"{code}_gemeinde.json",
            config.PUBLIC_DATA / f"{code}_boundaries.geojson",
        ]
        size = sum(p.stat().st_size for p in parts)
        if size > worst_size:
            worst_code, worst_size = c["code"], size

    assert worst_code == "BE", f"Erwartet Bern als grössten Kanton, gemessen: {worst_code}"
    assert worst_size < config.MAX_CANTON_PAYLOAD_BYTES, (
        f"{worst_code}: {worst_size / 1024:.0f} KB"
    )
