"""Währungsumrechnung für die Säulenhöhe — Jahresmittelkurse der SNB.

Ansicht A vergleicht Geld über die Höhe der Säulen. Solange nur acht
Aargauer Firmen darauf standen, war der Währungsmix eine Fussnote. National
steht Nestlé (CHF 89'490 Mio.) neben Novartis (USD 54'532 Mio.) und
Richemont (EUR) — dann vergleicht die Höhe Beträge, die nicht dasselbe
messen. Ein USD-Betrag, als wäre er CHF gezeichnet, überzeichnet die Firma
2025 um rund ein Fünftel.

Deshalb: **die Höhe rechnet in CHF, das Panel zeigt die berichtete Zahl in
ihrer Originalwährung.** Beides ist wahr, und keines ersetzt das andere —
umgerechnet lässt sich vergleichen, im Original lässt sich nachprüfen.

Kurs ist der **Jahresmittelkurs** der Schweizerischen Nationalbank
(Datenwürfel `devkum`, Reihe `M0` = Monatsdurchschnitt), gemittelt über die
Monate des Geschäftsjahres. Ein Jahresmittel passt zu einer Erfolgsrechnung,
die über das Jahr entsteht — anders als ein Stichtagskurs, der einen Tag
überbetont. Die Reihe `M1` (Monatsendkurs) steht im selben Datensatz und
sieht fast gleich aus; beide zusammen zu mitteln ergäbe eine Grösse, die es
nicht gibt (aufgefallen, weil ein Jahr dann 24 statt 12 Werte hatte).

Ein Geschäftsjahr, dessen Endjahr im Kalender noch nicht voll ist, bekommt
ein **rollendes** Fenster: die letzten zwölf verfügbaren Monatsdurchschnitte
statt der wenigen des angebrochenen Jahres. Logitechs Geschäftsjahr 2025/26
lief von April 2025 bis März 2026; `fiscal_year` trägt nur das Endjahr 2026,
von dem beim Bauen erst sieben Monate vorlagen. Über diese sieben zu mitteln
hiesse, einen Kurs zu verwenden, der den Zeitraum gar nicht abdeckt — hier
0.79 statt der rund 0.81, die das Geschäftsjahr trafen, also 2.5 % zu wenig.
`window` hält fest, welches der beiden Fenster benutzt wurde
(`kalenderjahr` oder `rollend`), `months` wie viele Monate darin lagen.

Das bleibt eine Näherung: exakt wäre das Fenster April bis März, und dafür
müsste die CSV den Monat des Geschäftsjahresendes führen, den heute niemand
recherchiert. Ein volles Jahr am aktuellen Rand ist näher an jedem
abweichenden Geschäftsjahr als ein Rumpfjahr — und bleibt eine belegte
Grösse statt eines geschätzten Kurses.
"""

from __future__ import annotations

import collections
from pathlib import Path

from . import config

SNB_URL = "https://data.snb.ch/api/cube/devkum/data/csv/en"

# Reihe der Monatsdurchschnitte im SNB-Würfel. `M1` wäre der Monatsendkurs —
# siehe Moduldokumentation, warum die beiden nicht vermischt werden dürfen.
SNB_SERIES_MONTHLY_AVERAGE = "M0"

# SNB notiert je Einheit Fremdwährung, aber nicht immer je EINER: "USD1"
# heisst 1 USD, "JPY100" hiesse 100 JPY. Wir brauchen bisher nur die drei
# Berichtswährungen der kotierten Schweizer Gesellschaften.
SERIES = {"EUR": ("EUR1", 1), "USD": ("USD1", 1)}

# Unter so wenigen Monaten ist ein "Jahresmittel" keine sinnvolle Aussage
# mehr — dann lieber abbrechen als eine Zahl ausgeben, die nach Jahr aussieht.
MIN_MONTHS = 3


def cache_path() -> Path:
    return config.DATA_RAW / "snb_devkum.csv"


def parse(text: str) -> dict[tuple[str, int], list[float]]:
    """Monatsdurchschnitte je (Währung, Jahr) aus dem SNB-CSV.

    Format: `"Date";"D0";"D1";"Value"` mit `D0` als Reihe (M0/M1) und `D1`
    als Währungsreihe. Leere Werte (SNB führt Reihen bis 1914, lange vor
    ihrem Beginn) werden übersprungen."""
    by_key: dict[tuple[str, int], list[float]] = collections.defaultdict(list)
    wanted = {code: currency for currency, (code, _) in SERIES.items()}
    for line in text.splitlines():
        parts = [part.strip('"') for part in line.split(";")]
        if len(parts) != 4 or "-" not in parts[0]:
            continue
        date, series, code, value = parts
        if series != SNB_SERIES_MONTHLY_AVERAGE or code not in wanted or not value:
            continue
        year = int(date.split("-")[0])
        by_key[(wanted[code], year)].append(float(value))
    return dict(by_key)


def rate(currency: str, year: int, monthly: dict[tuple[str, int], list[float]]) -> dict:
    """CHF je Einheit `currency` im Geschäftsjahr `year`.

    Gibt `{"rate": …, "months": …}` zurück — `months` ist die Zahl der
    Monatsdurchschnitte, über die gemittelt wurde. Für ein abgeschlossenes
    Jahr ist das 12; für das laufende weniger, und dann gehört es
    ausgewiesen statt verschwiegen."""
    if currency == "CHF":
        return {"rate": 1.0, "months": 12, "window": "kalenderjahr"}

    if currency not in SERIES:
        raise KeyError(
            f"Keine SNB-Reihe für {currency!r} hinterlegt — bekannt: "
            f"{sorted(SERIES) + ['CHF']}. Eine neue Berichtswährung braucht "
            f"einen Eintrag in SERIES, keinen geschätzten Kurs."
        )

    values = list(monthly.get((currency, year)) or [])
    window = "kalenderjahr"

    # Angebrochenes Kalenderjahr: mit den Monaten des Vorjahres auf zwölf
    # auffüllen, von hinten. Ein Geschäftsjahr, das nicht am 31. Dezember
    # endet, liegt ohnehin quer zum Kalenderjahr — Logitechs 2025/26 lief von
    # April 2025 bis März 2026, und `fiscal_year` trägt nur das Endjahr 2026,
    # von dem beim Bauen erst sieben Monate vorlagen. Über diese sieben zu
    # mitteln hiesse, einen Kurs zu verwenden, der den Zeitraum des
    # Geschäftsjahres gar nicht abdeckt. Ein volles Jahr, das am aktuellen
    # Rand endet, ist näher an jedem abweichenden Geschäftsjahr — und bleibt
    # eine belegte Grösse, kein geschätzter Kurs.
    if 0 < len(values) < 12:
        previous = list(monthly.get((currency, year - 1)) or [])
        if previous:
            values = previous[-(12 - len(values)):] + values
            window = "rollend"

    if len(values) < MIN_MONTHS:
        raise LookupError(
            f"SNB-Jahresmittel {currency}/{year} nicht bestimmbar "
            f"({len(values)} Monatswerte, mindestens {MIN_MONTHS} nötig)"
        )

    _, per_units = SERIES[currency]
    return {"rate": sum(values) / len(values) / per_units,
            "months": len(values), "window": window}
