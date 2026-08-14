import pytest

from draufsicht_etl import plausibility


def test_widen_leaves_bounds_unchanged_for_a_canton_without_an_exception():
    lower, upper, applied = plausibility.widen("ZH", 100.0, 200.0)
    assert (lower, upper) == (100.0, 200.0)
    assert applied == []


def test_widen_moves_only_the_upper_bound_for_jura():
    # Moutiers Kantonswechsel treibt JUs Hektarsumme nach oben (die Hektaren
    # sind bei uns bereits Jura, die BFS-Referenz zählt sie noch bei Bern) —
    # die Ausnahme muss deshalb ausschliesslich die obere Grenze weiten.
    lower, upper, applied = plausibility.widen("JU", 47_848.0, 54_911.0)
    assert lower == 47_848.0, "JU-Ausnahme darf die untere Grenze nicht anfassen"
    assert upper == pytest.approx(54_911.0 + 3_893.0)
    assert len(applied) == 1
    assert applied[0].canton == "JU"
    assert applied[0].direction == "upper"
    assert applied[0].amount == 3_893


def test_widen_moves_only_the_lower_bound_for_basel_stadt():
    # Basel-Stadts Fehlbetrag zieht die Hektarsumme nach unten (Dreispitz-
    # Beschäftigte, die geometrisch in Münchenstein/BL landen) — die Ausnahme
    # muss deshalb ausschliesslich die untere Grenze weiten (senken).
    lower, upper, applied = plausibility.widen("BS", 199_245.0, 201_269.0)
    assert lower == pytest.approx(199_245.0 - 3_931.0)
    assert upper == 201_269.0, "BS-Ausnahme darf die obere Grenze nicht anfassen"
    assert len(applied) == 1
    assert applied[0].canton == "BS"
    assert applied[0].direction == "lower"
    assert applied[0].amount == 3_931


def test_every_exception_names_a_cause_and_a_source():
    # Eine Ausnahme ohne Begründung/Beleg wäre genau die verdeckte Toleranz,
    # die diese Tabelle explizit nicht sein soll.
    for exception in plausibility.EXCEPTIONS:
        assert exception.cause.strip(), exception
        assert exception.source.strip(), exception
        assert exception.direction in ("upper", "lower"), exception
        assert exception.amount > 0, exception


def test_exceptions_apply_to_exactly_one_canton_each():
    # Kein Kanton hat mehr als eine Ausnahme (würde die "genau ein Betrag,
    # genau eine Grenze"-Eigenschaft pro Eintrag verwässern, wenn zwei
    # Einträge unbemerkt dieselbe Grenze desselben Kantons träfen).
    codes = [e.canton for e in plausibility.EXCEPTIONS]
    assert len(codes) == len(set(codes)), codes


# --- Der Guard selbst bleibt hart: ein Verstoss ÜBER die (ggf. geweitete)
# Grenze hinaus muss weiterhin scheitern, auch für Kantone mit Ausnahme. ---


def _passes_window(total: float, reference: float, noloc: float, overstatement_max: float, code: str) -> bool:
    """Spiegelt die Prüfung in `cli.py`s Kanton-Schleife: Basisfenster aus
    Referenz/NOLOC/Aufrundung, dann `plausibility.widen()`, dann Vergleich."""
    base_lower = reference - noloc
    base_upper = reference + overstatement_max
    lower, upper, _ = plausibility.widen(code, base_lower, base_upper)
    return lower <= total <= upper


def test_jura_passes_exactly_at_its_documented_allowance():
    # Realistische Grössen aus dem ETL-Report: Referenz 48'533, NOLOC 685,
    # overstatementMax 6'378 (Fenster ohne Ausnahme: [47'848 .. 54'911]).
    # Mit Moutiers 3'893 dazu ist die tatsächliche Summe (56'370) knapp innen.
    assert _passes_window(56_370.0, 48_533.0, 685.0, 6_378.0, "JU")


def test_jura_still_fails_when_it_drifts_beyond_its_documented_allowance():
    # Genau der Fall, den die Aufgabenstellung explizit verlangt: 100
    # zusätzliche Beschäftigte über die dokumentierte Ausnahme hinaus dürfen
    # nicht plötzlich durchgehen — die Tabelle ist kein Freifahrtschein für
    # den ganzen Kanton, sondern ein exakt bezifferter Korrekturposten.
    upper_with_exception = 54_911.0 + 3_893.0
    just_over = upper_with_exception + 100.0
    assert not _passes_window(just_over, 48_533.0, 685.0, 6_378.0, "JU")


def test_basel_stadt_passes_exactly_at_its_documented_allowance():
    # Referenz 199'745, NOLOC 500 (Fenster ohne Ausnahme: [199'245 .. ...]).
    # Mit der Dreispitz-Ausnahme (3'931) ist die tatsächliche Summe (196'257)
    # knapp innerhalb der gesenkten unteren Grenze.
    assert _passes_window(196_257.0, 199_745.0, 500.0, 1_524.0, "BS")


def test_basel_stadt_still_fails_when_it_drifts_beyond_its_documented_allowance():
    lower_with_exception = 199_245.0 - 3_931.0
    just_under = lower_with_exception - 100.0
    assert not _passes_window(just_under, 199_745.0, 500.0, 1_524.0, "BS")


def test_a_canton_without_an_exception_gets_no_extra_headroom():
    # Aargau (keine Ausnahme) darf nicht plötzlich mehr Spielraum haben, nur
    # weil `widen()` jetzt aufgerufen wird — Regressionsschutz dafür, dass
    # die Ausnahmetabelle sich nicht versehentlich auf alle Kantone auswirkt.
    reference, noloc, overstatement_max = 363_288.0, 3_389.0, 30_327.0
    lower, upper = reference - noloc, reference + overstatement_max
    assert _passes_window(lower - 1, reference, noloc, overstatement_max, "AG") is False
    assert _passes_window(upper + 1, reference, noloc, overstatement_max, "AG") is False
    assert _passes_window(lower, reference, noloc, overstatement_max, "AG") is True
    assert _passes_window(upper, reference, noloc, overstatement_max, "AG") is True
