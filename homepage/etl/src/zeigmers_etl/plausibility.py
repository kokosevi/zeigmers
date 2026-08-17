"""Begründete, betragsscharfe Ausnahmen vom Plausibilitätsfenster (Spec 6.4/6.5).

Das Fenster prüft je Kanton `Referenz − NOLOC ≤ Summe ≤ Referenz +
3×ambiguousCells` (`aggregate.py`, `cli.py`) und bricht bei Verletzung hart
ab — eine scharfe Prüfung gegen Verschnitt- und Spaltenfehler, für alle 26
Kantone gleichermassen. Zwei Kantone verletzen dieses Fenster aus einem
Grund, der nicht Rundung oder NOLOC ist, aber einzeln benennbar und
betragsscharf belegt ist.

Diese Tabelle ist ausdrücklich KEINE Pro-Kanton-Toleranz — eine Toleranz
würde das Fenster für den betroffenen Kanton pauschal weiten und jede
künftige Abweichung dort mit verdecken, egal welcher Grösse. Jeder Eintrag
hier weitet stattdessen GENAU EINE Fenstergrenze um GENAU DEN belegten
Betrag: eine Gemeinde, deren gesamte Beschäftigung wegen eines konkreten,
benennbaren Ereignisses auf der falschen Seite der Kantonsgrenze steht. Ein
Kanton, der sein Fenster über diesen Betrag hinaus verlässt, bricht den Lauf
weiterhin hart ab (siehe `etl/tests/test_plausibility.py`, die genau das
prüft).

Wer diese Datei mit einem späteren STATENT-Jahrgang erneut ausführt, sollte
auf einen Blick sehen, ob ein Eintrag inzwischen überflüssig geworden ist
(siehe den Moutier-Kommentar unten) und ihn löschen können.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlausibilityException:
    canton: str  # zweistelliger Kantonscode
    direction: str  # "upper" oder "lower" — welche Fenstergrenze weitet sich
    amount: float  # Beschäftigte, exakt beziffert (siehe cause/source)
    cause: str
    source: str


EXCEPTIONS: tuple[PlausibilityException, ...] = (
    PlausibilityException(
        canton="JU",
        direction="upper",
        amount=3893,
        cause=(
            "Moutier (BFS-Nr. 6831 im swissBOUNDARIES3D-Jahrgang 2026-01) "
            "wechselte per 1. Januar 2026 vom Kanton Bern zum Kanton Jura "
            "(eidgenössisch genehmigter Staatsvertrag nach der Volks­"
            "abstimmung 2021). Unsere Gemeindegeometrie ist der 2026-"
            "Jahrgang und ordnet Moutiers Hektaren dem Kanton Jura zu; "
            "STATENT_GMDE_2023.csv ist der 2023-Jahrgang und führt Moutier "
            "weiterhin unter Bern (GDENR im Bernischen 3xx-9xx-Block, nicht "
            "im Jurassischen 67xx-68xx-Block) — zwei intakte, aber "
            "unterschiedliche Jahrgänge derselben Schweiz, kein Fehler in "
            "keinem der beiden. Zwei automatisierte Zuordnungen wurden "
            "geprüft und verworfen, bevor diese Ausnahme als einzige "
            "verbleibende Option feststand: Zuordnung über die aktuelle "
            "Geometrie scheitert, weil Moutier beim Kantonswechsel eine "
            "neue BFS-Nummer bekam (nicht dieselbe Nummer, nur umgehängt); "
            "Zuordnung über den historisierten Identifikator (`hist_nr`) "
            "scheitert ebenfalls — Moutiers 2026er `hist_nr` (16669) taucht "
            "im 2023er-File gar nicht auf, weil der Kantonswechsel eine neue "
            "historisierte Einheit erzeugt hat, keine Fortschreibung einer "
            "alten. Betrag = Moutiers eigene Hektarsumme in unserer Pipeline "
            "(`aggregate.build_municipality`, BFS 6831), nicht geschätzt. "
            "**Löschbar, sobald STATENT einen Jahrgang ≥ 2026 verwendet, der "
            "Moutier bereits unter Jura führt** — dann verschwindet die "
            "Diskrepanz von selbst."
        ),
        source=(
            "Kantonswechsel Moutier: eidgenössisch genehmigter Staatsvertrag "
            "Bern-Jura, wirksam 1.1.2026 (öffentlich bekanntes, amtlich "
            "bestätigtes Ereignis). Beleg in den Rohdaten selbst: BFS 6831 "
            "kommt in STATENT_GMDE_2023.csv (Spalte GDENR) kein einziges Mal "
            "vor; `hist_nr` 16669 (swissBOUNDARIES3D tlm_hoheitsgebiet, "
            "2026-01) hat keine Entsprechung im 2023-Jahrgang. Betrag "
            "reproduzierbar über `boundaries.build_all()[26]` + "
            "`aggregate.build_municipality()`, gefiltert auf BFS 6831."
        ),
    ),
    PlausibilityException(
        canton="BS",
        direction="lower",
        amount=3931,
        cause=(
            "Der gesamte Fehlbetrag von Basel-Stadt sitzt in einer einzigen "
            "Gemeinde, Basel selbst (BFS 2701: Hektarsumme 190'243 gegen "
            "amtliche Referenz 194'174, −3'931); Bettingen (+47) und Riehen "
            "(+396) liegen beide leicht ÜBER ihrer Referenz, wie praktisch "
            "jede andere Gemeinde in der Schweiz (der übliche Rundungs­"
            "effekt). Basel-Stadt ist mit 37 km² der kleinste Kanton und "
            "wird auf der Südseite fast vollständig von Basel-Landschaft "
            "umschlossen. Das Dreispitz-Areal — rund 50 ha, mehrere hundert "
            "Betriebe, Kernstück 'Wirtschaftspark Dreispitz' mit rund "
            "4'000 Arbeitsplätzen — liegt je zur Hälfte in der Gemeinde "
            "Basel und der Gemeinde Münchenstein (BL); die Kantonsgrenze "
            "verläuft laut offizieller Arealbeschreibung 'in einem spitzen "
            "Winkel... mitten durch das Areal'. Ein 300-m-Grenzring auf der "
            "Münchensteiner Seite von Basels Stadtgebiet fängt unabhängig "
            "3'942 Beschäftigte — praktisch deckungsgleich mit dem "
            "gemessenen Fehlbetrag (3'931) UND mit der extern belegten "
            "Grössenordnung des Dreispitz-Wirtschaftsparks (~4'000). "
            "Betrag = Basels eigener, gemessener Fehlbetrag (BFS 2701), "
            "NICHT die Ringschätzung — die Ringschätzung dient nur als "
            "unabhängige Bestätigung der Grössenordnung, nicht als Quelle "
            "des Betrags. **Weniger scharf belegt als Moutier**: kein "
            "einzelnes, datiertes Ereignis mit amtlicher Bestätigung,"
            " sondern ein diffuser Grenzeffekt um ein konkret benennbares "
            "Areal. Sollte sich diese Erklärung als unzureichend erweisen "
            "(z. B. weil ein künftiger Jahrgang den Fehlbetrag verschiebt "
            "oder vergrössert), ist dieser Eintrag der erste Kandidat für "
            "eine Revision — er bleibt exakt auf den heute gemessenen "
            "Betrag begrenzt, wächst nicht automatisch mit."
        ),
        source=(
            "'Dreispitz Basel und Münchenstein' (Wikipedia, abgerufen "
            "2026-08-14): 50 ha, 'liegt je zur Hälfte in den Gemeinden "
            "Basel und Münchenstein', Kantonsgrenze 'verläuft in einem "
            "spitzen Winkel von Nordosten nach Südwesten mitten durch das "
            "Areal'. dreispitz.ch, 'Wirtschaftspark' "
            "(dreispitz.ch/de/dreispitz/wirtschaftspark.html): "
            "'Wirtschaftspark Dreispitz... 380 Unternehmungen und "
            "4'000 Arbeitsplätzen'. Eigene Analyse: Hektarsumme je Gemeinde "
            "(`aggregate.build_municipality`, BFS 2701/2702/2703) und "
            "300-m-Grenzring-Verschnitt gegen `boundaries.build_all()[13]` "
            "(Basel-Landschaft, gruppiert nach Gemeinde) — Methodik und "
            "vollständige Zahlen im ETL-Report."
        ),
    ),
)


def widen(
    canton_code: str, lower: float, upper: float
) -> tuple[float, float, list[PlausibilityException]]:
    """Wendet alle dokumentierten Ausnahmen für `canton_code` auf `(lower,
    upper)` an. Jede Ausnahme verschiebt GENAU EINE Grenze um GENAU ihren
    `amount` — kein Kanton bekommt mehr Spielraum, als eine benannte,
    belegte Ursache tatsächlich rechtfertigt. Kantone ohne Eintrag bekommen
    unveränderte Grenzen zurück.

    Gibt zusätzlich die angewendeten Einträge zurück, damit der Aufrufer sie
    protokollieren kann (siehe `cli.py`).
    """
    applied = [e for e in EXCEPTIONS if e.canton == canton_code]
    for exception in applied:
        if exception.direction == "upper":
            upper += exception.amount
        elif exception.direction == "lower":
            lower -= exception.amount
        else:
            raise ValueError(f"Unbekannte direction {exception.direction!r} in {exception}")
    return lower, upper, applied
