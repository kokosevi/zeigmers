"""Ansicht A: manuell gepflegtes CSV, maschinell erzwungene Quellenpflicht.

Phase 3 (2026-08-14): die Ansicht wird national. Bis dahin listete diese CSV
ausschliesslich die acht SIX-kotierten Firmen mit Sitz in Aargau, vollständig
von Hand recherchiert (Umsatz, Gewinn, Kerngeschäft, Gründungsjahr — je mit
Quelle). Diesen Standard auf alle 224 an der SIX kotierten Titel auszuweiten
ist nicht leistbar; stattdessen trägt jede Zeile jetzt ein explizites Feld
`researched`, das drei Zustände auseinanderhält, die zuvor nur zwei waren:

1. recherchiert, Zahlen vorhanden (`researched=yes`, `revenue` gesetzt) — die
   ursprünglichen acht.
2. recherchiert, Zahlen nicht öffentlich verfügbar (`researched=yes`,
   `revenue` leer, `note` erklärt warum) — der bisherige „placeholder"-Pfad.
3. noch nicht recherchiert (`researched=no`) — neu. Eine solche Zeile trägt
   ausschliesslich Identität und Sitz (aus SIX + Zefix/LINDAS, siehe
   `sync_national_csv`), keine einzige Kennzahl — `validate()` erzwingt das
   (`RESEARCH_ONLY_FIELDS` unten), nicht nur die Herkunftspflicht pro Feld.

Zustand 2 und 3 sehen für ein Skript, das nur `revenue is None` prüft,
identisch aus — für eine Leserin sind sie es nicht: „wir haben nachgesehen
und nichts gefunden" ist eine andere Aussage als „wir haben noch nicht
nachgesehen". Das Frontend (`src/layers/visible.ts`) zeichnet sie deshalb
unterschiedlich: Zustand 1/2 als Säule (Zustand 2 auf einer festen
Mindesthöhe, wie zuvor), Zustand 3 als flachen, neutralen Marker ohne jede
Höhenaussage.
"""

from __future__ import annotations

import csv
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path

from . import config
from .noga import NogaTable

CSV_COLUMNS = (
    "uid", "name", "six_symbol", "isin", "lei",
    "street", "zip", "city", "lon", "lat", "geocode_query", "seat_basis",
    "noga_group",
    "org_form",
    "consolidation_basis",
    "revenue", "revenue_currency", "revenue_type", "revenue_unit",
    "profit", "profit_currency", "profit_unit",
    "core_products", "products_url",
    "founding_year", "founding_year_source",
    "employees", "fiscal_year", "report_url", "note",
    "researched",
)

RESEARCHED_VALUES = {"yes", "no"}

# Felder, die eine researched=no-Zeile unter keinen Umständen tragen darf —
# nicht nur "wenn revenue gesetzt ist, dann auch report_url" (das gilt
# weiterhin, siehe validate() unten), sondern grundsätzlich keine einzige
# dieser Angaben. Ohne diese Sperre könnte eine unrecherchierte Zeile eine
# Kennzahl OHNE jede Prüfung tragen, solange nur die (dann ja gar nicht
# geforderten) Begleitfelder fehlen — genau die Lücke, die Zustand 2 und 3
# sonst nicht wirklich auseinanderhält.
RESEARCH_ONLY_FIELDS = (
    "noga_group", "consolidation_basis",
    "revenue", "revenue_currency", "revenue_type", "revenue_unit",
    "profit", "profit_currency", "profit_unit",
    "core_products", "products_url",
    "founding_year", "founding_year_source",
    "employees", "fiscal_year", "report_url", "note",
)

# `revenue` mixes quantities that are not comparable as bar heights without this tag:
# ordinary net sales vs. a bank's operating income (no true "Umsatz" equivalent exists
# for banks). Closed set for now; Task 16 draws non-net_sales bars distinctly.
REVENUE_TYPES = {"net_sales", "operating_income"}

# Unlike `revenue`, net profit attributable to shareholders (Reingewinn) is defensibly
# comparable across an ordinary industrial company and a bank — both report a single
# post-tax bottom line under Swiss GAAP FER/IFRS. `profit` therefore carries no
# `revenue_type`-style tag, only its own currency/unit (mirroring `revenue_currency`/
# `revenue_unit`) and the shared `report_url`/`fiscal_year` of the row. "Comparable" is
# not "identical", though: a bank's Konzerngewinn can still run through bank-specific,
# discretionary items — e.g. Hypothekarbank Lenzburg's "Veränderungen von Reserven für
# allgemeine Bankrisiken", a Swiss-banking-law smoothing reserve sitting directly in the
# waterfall to Konzerngewinn — that an industrial company's income statement has no
# equivalent of. That caveat is named in the row's own `note`, not asserted away here.
#
# `consolidation_basis` closes a hole `revenue_type` doesn't cover: nothing before this
# constrained `revenue` and `profit` in the same row to the same corporate scope, and a
# row (Montana Aerospace, discovered in sourcing review) pairs continuing-operations
# revenue with a total-group profit that includes a divested segment — two different
# companies, arithmetically, wearing one row. `fiscal_year` being a single shared column
# already rules out a *year* mismatch structurally; `consolidation_basis` does the same
# job for *scope*. Required whenever `profit` is set (not merely when `note` happens to
# mention a divestment — free text is not something `validate()` can rely on) because
# that's exactly the situation where two figures might silently disagree on what they're
# both measuring.
CONSOLIDATION_BASES = {"total_group", "continuing_operations"}

# Die Rechtsform-Dimension der Karte. Heute trägt jede Zeile denselben Wert —
# die Quelle ist die SIX-Titelliste, und die kennt nur Kotierte. Das Feld
# existiert trotzdem schon: die Karte filtert danach, und eine später
# ergänzte Genossenschaft (Migros, Coop) oder eine grosse nicht kotierte
# Firma (Bertschi AG) soll eine Zeile mehr sein, kein Sonderfall im Ladepfad.
# Geschlossenes Set wie REVENUE_TYPES — ein Tippfehler wäre sonst eine
# lautlose vierte Organisationsform, die als eigener Knopf erschiene.
ORG_FORMS = {"boersenkotiert"}

Fetcher = Callable[[str], bytes]


def csv_path() -> Path:
    """Pfad zur (seit Phase 3 nationalen) Firmen-CSV — ein einziges File für
    alle 26 Kantone, nicht mehr `<code>_listed_companies.csv`. Ein
    Kantonswechsel (`config.CANTON`) berührt diesen Pfad seither nicht mehr;
    neue Zeilen kommen über `sync_national_csv()` hinzu (CLI: `companies-sync`),
    nicht über eine neue Datei je Kanton."""
    return config.DATA_MANUAL / "listed_companies.csv"


def load_csv(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(
            f"Firmen-CSV fehlt: {path}\n"
            f"Diese Datei ist seit Phase 3 national und wird nicht mehr von Hand "
            f"neu angelegt: `zeigmers-etl companies-sync` erzeugt sie aus der "
            f"aktuellen SIX-Titelliste (Sitz je Titel über Zefix/LINDAS, wo "
            f"eindeutig auffindbar). Danach ist inhaltliche Recherche (Umsatz, "
            f"Gewinn, Kerngeschäft je Firma, siehe README) weiterhin Handarbeit."
        )
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        actual = tuple(reader.fieldnames or ())
        if actual != CSV_COLUMNS:
            raise ValueError(
                f"Spalten weichen ab.\nErwartet: {CSV_COLUMNS}\nGefunden : {actual}"
            )
        return [dict(row) for row in reader]


def write_csv(path: Path, rows: list[dict]) -> None:
    """Schreibt die Firmen-CSV mit `CSV_COLUMNS` als Kopf — die eine Stelle,
    die das Format kennt. Drei Aufrufer schreiben dieselbe Datei
    (`sync_national_csv`, der Geokodierungs-Nachtrag und `companies-retry`
    in `cli.py`); eine abweichende Spaltenreihenfolge in einem davon würde
    `load_csv()`s Kopfprüfung beim nächsten Lauf auslösen."""
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def validate(rows: list[dict], table: NogaTable | None = None) -> None:
    from .noga import load_table

    table = table or load_table()
    valid_groups = {g.key for g in table.groups}
    problems: list[str] = []
    seen: dict[str, int] = {}
    seen_isin: dict[str, int] = {}

    for number, row in enumerate(rows, start=2):  # Zeile 1 ist der Kopf
        label = f"Zeile {number} ({row.get('name') or 'ohne Name'})"

        uid = row.get("uid", "").strip()
        if uid and uid in seen:
            problems.append(f"{label}: uid {uid} doppelt, schon in Zeile {seen[uid]}")
        elif uid:
            seen[uid] = number

        isin = row.get("isin", "").strip()
        if not isin:
            problems.append(f"{label}: isin fehlt — jeder SIX-Titel hat eine")
        elif isin in seen_isin:
            problems.append(f"{label}: isin {isin} doppelt, schon in Zeile {seen_isin[isin]}")
        else:
            seen_isin[isin] = number

        researched = row.get("researched", "").strip()
        if researched not in RESEARCHED_VALUES:
            problems.append(
                f"{label}: researched {researched!r} unbekannt, "
                f"erlaubt: {sorted(RESEARCHED_VALUES)}"
            )

        # Koordinaten sind nur dann Pflicht, wenn überhaupt ein Sitz bekannt
        # ist (`city` gesetzt) — ein Titel, der sich weder über Zefix/LINDAS
        # noch von Hand einem Sitz zuordnen liess, bleibt absichtlich ohne
        # Koordinaten (siehe `sync_national_csv`) und damit ohne Marker,
        # statt an einer erfundenen Position zu erscheinen.
        #
        # Ausnahme für `researched=no`: dort darf ein Sitz ohne Koordinaten
        # stehen. Vorher erzwang die Regel, dass der Geokodierungs-Schritt
        # eine gescheiterte Adresse LÖSCHT, um gültig zu bleiben — und
        # vernichtete damit echte GLEIF-Daten wegen eines Dienstfehlers, so
        # dass ein späterer, besserer Versuch nichts mehr zum Wiederholen
        # hatte (beobachtet an The Swatch Group und Logitech, deren
        # Adresszeilen einen Zusatz tragen). Die Zeile bleibt ohne Marker
        # (`build_artifact` überspringt sie), die Adresse bleibt erhalten.
        # Für recherchierte Zeilen gilt die Pflicht unverändert: dort ist der
        # Sitz Teil des von Hand geprüften Profils.
        if row.get("city", "").strip() and researched == "yes":
            for field in ("lon", "lat"):
                if not row.get(field, "").strip():
                    problems.append(f"{label}: {field} fehlt — zuerst geokodieren")

        # `build_artifact` liest diese Spalten mit `int(...)`. Ohne Prüfung
        # hier stürzt der Artefaktbau ab — und zwar erst, nachdem der Wert
        # schon in der CSV steht, obwohl `validate()` genau davor läuft.
        # Beobachtet an einer Kantonalbank, die Vollzeitstellen mit
        # Dezimalstelle ausweist ("1206.2"): Beschäftigte sind Personen, eine
        # gebrochene Zahl gehört gerundet und in `note` erklärt.
        for field in ("employees", "founding_year", "fiscal_year"):
            value = row.get(field, "").strip()
            if value and not value.lstrip("-").isdigit():
                problems.append(
                    f"{label}: {field} {value!r} ist keine ganze Zahl — "
                    f"gerundeter Wert eintragen und die Rundung in note erklären"
                )

        # Umsatz und Gewinn einer Zeile stammen aus derselben Rechnung — dann
        # stehen sie auch in derselben Einheit. Wären sie es nicht, stünde im
        # Panel ein Gewinn, der den Umsatz tausendfach übersteigt, ohne dass
        # irgendetwas warnt. Die Recherche liefert beide Schreibweisen
        # (Millionen und absolute Franken), je nachdem wie der Bericht es
        # darstellt — das ist zulässig, aber nicht gemischt in einer Zeile.
        revenue_unit = row.get("revenue_unit", "").strip()
        profit_unit = row.get("profit_unit", "").strip()
        if (row.get("revenue", "").strip() and row.get("profit", "").strip()
                and revenue_unit and profit_unit and revenue_unit != profit_unit):
            problems.append(
                f"{label}: Einheit für Umsatz ({revenue_unit}) und Gewinn "
                f"({profit_unit}) verschieden — beide kommen aus derselben "
                f"Rechnung und gehören in dieselbe Einheit"
            )

        group = row.get("noga_group", "").strip()
        if group and group not in valid_groups:
            problems.append(
                f"{label}: noga_group {group!r} unbekannt, erlaubt: {sorted(valid_groups)}"
            )
        elif not group and researched == "yes":
            problems.append(f"{label}: researched=yes, aber noga_group fehlt")

        revenue_type = row.get("revenue_type", "").strip()
        if revenue_type and revenue_type not in REVENUE_TYPES:
            problems.append(
                f"{label}: revenue_type {revenue_type!r} unbekannt, "
                f"erlaubt: {sorted(REVENUE_TYPES)}"
            )

        if row.get("revenue", "").strip():
            for field in (
                "report_url", "fiscal_year", "revenue_currency", "revenue_type",
                "revenue_unit",
            ):
                if not row.get(field, "").strip():
                    problems.append(
                        f"{label}: revenue gesetzt, aber {field} fehlt — "
                        "jede Zahl muss auf eine Quelle zurückführbar sein"
                    )
        elif researched == "yes" and not row.get("note", "").strip():
            # Nur für recherchierte Zeilen: eine unrecherchierte Zeile hat per
            # Definition (siehe RESEARCH_ONLY_FIELDS-Check unten) kein revenue
            # und braucht dafür keine zeilenindividuelle Begründung — der
            # Grund ("noch nicht recherchiert") ist bereits `researched`
            # selbst.
            problems.append(
                f"{label}: revenue leer, dann muss note erklären warum"
            )

        if researched == "no":
            for field in RESEARCH_ONLY_FIELDS:
                if row.get(field, "").strip():
                    problems.append(
                        f"{label}: researched=no, aber {field} gesetzt — eine "
                        "unrecherchierte Zeile darf keine Kennzahl tragen"
                    )

        # `profit` (Reingewinn) trägt keinen `revenue_type`-Tag (siehe Kommentar bei
        # REVENUE_TYPES oben — im Gegensatz zu Umsatz ist die Kennzahl branchenübergreifend
        # vergleichbar), braucht aber dieselbe Herkunftspflicht wie `revenue`: jede Zahl muss
        # auf eine Quelle zurückführbar sein, sonst liesse sich ein Gewinn ebenso unbemerkt
        # falsch skalieren oder einer falschen Periode zuordnen wie ein Umsatz ohne
        # `revenue_unit` (siehe Kommentar bei `test_validate_rejects_revenue_without_revenue_unit`).
        if row.get("profit", "").strip():
            for field in (
                "report_url", "fiscal_year", "profit_currency", "profit_unit",
                "consolidation_basis",
            ):
                if not row.get(field, "").strip():
                    problems.append(
                        f"{label}: profit gesetzt, aber {field} fehlt — "
                        "jede Zahl muss auf eine Quelle zurückführbar sein"
                    )

        # Geschlossenes Set, unabhängig davon, ob profit gesetzt ist (siehe
        # Kommentar bei CONSOLIDATION_BASES) — ein Tippfehler oder ein Wert
        # ausserhalb des vereinbarten Sets wäre sonst so wenig prüfbar wie gar
        # keine Angabe.
        basis = row.get("consolidation_basis", "").strip()
        if basis and basis not in CONSOLIDATION_BASES:
            problems.append(
                f"{label}: consolidation_basis {basis!r} unbekannt, "
                f"erlaubt: {sorted(CONSOLIDATION_BASES)}"
            )

        # Ausserhalb jeder researched-Bedingung, anders als noga_group & Co.:
        # die Rechtsform ist keine Rechercheleistung, sondern steht schon
        # fest, sobald die Zeile entsteht (siehe Kommentar bei ORG_FORMS) —
        # auch eine researched=no-Zeile muss sie tragen.
        org_form = row.get("org_form", "").strip()
        if not org_form:
            problems.append(f"{label}: org_form fehlt — erlaubt: {sorted(ORG_FORMS)}")
        elif org_form not in ORG_FORMS:
            problems.append(
                f"{label}: org_form={org_form!r} unbekannt — erlaubt: {sorted(ORG_FORMS)}"
            )

        # `founding_year` stammt entweder aus eigenen Unternehmensunterlagen oder aus dem
        # Zefix-Eintrag (siehe README, "Was revenue bedeutet" — derselbe Grundsatz gilt für
        # jede Zahl in dieser CSV) — ohne eine Quell-URL wäre die Jahreszahl nicht anders zu
        # unterscheiden von einer erfundenen.
        if row.get("founding_year", "").strip() and not row.get("founding_year_source", "").strip():
            problems.append(
                f"{label}: founding_year gesetzt, aber founding_year_source fehlt — "
                "jede Zahl muss auf eine Quelle zurückführbar sein"
            )

    if problems:
        raise ValueError("CSV-Validierung fehlgeschlagen:\n  " + "\n  ".join(problems))


def seat_overrides_path() -> Path:
    return config.DATA_MANUAL / "seat_overrides.json"


def load_seat_overrides(path: Path | None = None) -> dict[str, dict]:
    path = path or seat_overrides_path()
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    # Schlüssel mit führendem `_` sind Erläuterungen für die Leserin der
    # Datei, keine SIX-Symbole — die Begründung gehört neben die Ausnahme,
    # nicht in eine getrennte Dokumentation, die veraltet.
    return {key: value for key, value in raw.items() if not key.startswith("_")}


def apply_seat_overrides(rows: list[dict], overrides: dict[str, dict]) -> list[str]:
    """Von Hand belegte Sitze, die eine automatische Quelle nicht liefern kann.

    Eine **begrenzte Ausnahmetabelle**, dasselbe Muster wie
    `plausibility.py`: keine Heuristik, die still greift, sondern eine kurze
    Liste namentlich genannter Fälle, jeder mit Quelle und Grund in der
    Datei. Zwei Sorten kommen vor:

    - **GLEIF ist veraltet.** Für CH0024666528 führt GLEIF weiterhin die
      HOCHDORF Holding AG in Hochdorf. Tatsächlich wurde die Gesellschaft
      nach dem Verkauf des Milchgeschäfts zu HT5 AG und dann zu Centiel AG
      umfirmiert und sitzt heute in Cadro. Die ISIN-Zuordnung von GLEIF
      stimmt, Name und Adresse nicht.
    - **GLEIF kennt die ISIN gar nicht** (fünf Titel mit stark verkürzten
      SIX-Handelsnamen, die auch der Namensabgleich nicht auflöst).

    Die Koordinaten werden geleert, damit `geocode.fill_missing()` sie neu
    bestimmt — sonst behielte die Zeile die Koordinaten der alten Adresse und
    die Firma stünde weiterhin am falschen Ort, jetzt mit richtigem Namen
    daneben, was schlimmer wäre als vorher.

    Ein Symbol ohne passende Zeile ist ein Fehler, kein Achselzucken: es
    heisst, die Tabelle beschreibt einen Titel, den es in der SIX-Liste nicht
    (mehr) gibt — dann gehört sie nachgeführt, nicht stillschweigend
    übergangen."""
    by_symbol = {row.get("six_symbol", "").strip(): row for row in rows}
    unknown = sorted(set(overrides) - set(by_symbol))
    if unknown:
        raise ValueError(
            f"Sitz-Ausnahme für unbekannte(s) SIX-Symbol(e): {', '.join(unknown)} — "
            f"steht in {seat_overrides_path().name}, aber in keiner CSV-Zeile"
        )

    applied: list[str] = []
    for symbol, override in sorted(overrides.items()):
        row = by_symbol[symbol]
        # Nichts tun, wenn die Zeile die Ausnahme bereits trägt. Ohne diese
        # Prüfung leert jeder Lauf die Koordinaten neu und schickt für jede
        # Ausnahme eine überflüssige Anfrage an einen fremden, kostenlos
        # angebotenen Geokodierungsdienst — und der Bericht meldete jedes Mal
        # Änderungen, die keine waren.
        if all(
            not override.get(field) or row.get(field, "") == str(override[field]).strip()
            for field in ("name", "uid", "lei", "street", "zip", "city")
        ):
            continue
        for field in ("name", "uid", "lei", "street", "zip", "city"):
            if override.get(field):
                row[field] = str(override[field]).strip()
        street, zip_code, city = row["street"], row["zip"], row["city"]
        row["geocode_query"] = (
            f"{street}, {zip_code} {city}" if street else f"{zip_code} {city}".strip()
        )
        row["seat_basis"] = "manuell"
        row["lon"] = row["lat"] = ""
        applied.append(symbol)
    return applied


# Versatz für Gesellschaften, die sich eine Adresse teilen — siehe
# `_spread_shared_positions`. 150 m liegen weit unterhalb der Auflösung, in
# der diese Karte etwas aussagt (Gemeinden), und weit über dem, was zwei
# Säulen zum Auseinanderrücken brauchen.
POSITION_SPREAD_M = 150


def _spread_shared_positions(entries: list[dict]) -> None:
    """Verteilt Firmen, die auf denselben Koordinaten sitzen, auf einen
    kleinen Kreis um diesen Punkt.

    Vier Adressen tragen je zwei kotierte Gesellschaften: Metall Zug und
    V-ZUG teilen sich die Industriestrasse 66 in Zug, AEVIS und Infracore
    die Rue Georges-Jordil 4 in Fribourg, Swiss Prime Site und Fundamenta
    eine Adresse in Zug, Edisun und C Capital eine in Zürich. Am identischen
    Punkt gezeichnet verdeckt die höhere Säule die niedrigere vollständig —
    die kleinere Firma existiert auf der Karte, ist aber weder zu sehen noch
    anzuklicken. Das ist schlechter als ein kleiner Versatz.

    Der Versatz steht als `positionAdjusted` (in Metern) in der Zeile, damit
    das Panel es sagen kann: verschoben, aber nicht verschwiegen. Die
    Reihenfolge ist die der CSV, also über Läufe hinweg stabil."""
    import math
    from collections import defaultdict

    by_position: dict[tuple, list[dict]] = defaultdict(list)
    for entry in entries:
        by_position[(round(entry["lon"], 6), round(entry["lat"], 6))].append(entry)

    for (lon, lat), group in by_position.items():
        if len(group) < 2:
            continue
        # Meter -> Grad: Breite konstant, Länge mit dem Kosinus der Breite.
        d_lat = POSITION_SPREAD_M / 111_320
        d_lon = POSITION_SPREAD_M / (111_320 * math.cos(math.radians(lat)))
        for index, entry in enumerate(group):
            angle = 2 * math.pi * index / len(group)
            entry["lon"] = lon + d_lon * math.cos(angle)
            entry["lat"] = lat + d_lat * math.sin(angle)
            entry["positionAdjusted"] = POSITION_SPREAD_M


def research_dir() -> Path:
    """Ein JSON je recherchierter Gesellschaft, benannt nach ihrem
    SIX-Symbol. Diese Dateien gehören ins Repo: sie sind der Nachweis, aus
    dem jede Zahl der Karte stammt — mit Quelle, Zeilenbezeichnung im
    Bericht und dem, was beim Gegenlesen geprüft wurde (`_verification`).
    Die CSV trägt danach nur noch das Ergebnis."""
    return config.DATA_MANUAL / "research"


def load_research(directory: Path | None = None) -> dict[str, dict]:
    directory = directory or research_dir()
    if not directory.exists():
        return {}
    return {
        path.stem: json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(directory.glob("*.json"))
    }


def merge_research(rows: list[dict], research: dict[str, dict],
                   table: NogaTable | None = None) -> dict:
    """Trägt recherchierte Kennzahlen in die CSV-Zeilen ein, nach SIX-Symbol.

    Drei Zusicherungen, jede an einer Erfahrung dieses Projekts:

    - **Zeilen ohne Recherchedatei werden nie angefasst.** Die acht von Hand
      geprüften Zeilen haben keine — und diese Funktion läuft nur über die
      vorhandenen Dateien. Sie sind damit strukturell geschützt, nicht durch
      eine Regel, die jemand später lockern könnte.
    - **Zeilen MIT Recherchedatei werden mit ihr synchron gehalten.** Eine
      Korrektur aus der Gegenprüfung (Swisscoms Gewinn: 1'270 war das
      Konzernergebnis, 1'271 der Aktionärsanteil) landet in der Datei und von
      dort in die CSV. Ohne das bliebe jede Korrektur liegen und müsste von
      Hand nachgezogen werden — genau der Schritt, der vergessen wird. Der
      Bericht trennt `merged` (neu) von `updated` (geändert), damit eine
      Änderung an einer bestehenden Zeile nie unbemerkt passiert.
    - **Identität und Sitz kommen nicht aus der Recherche.** Name, UID, LEI
      und Adresse stammen aus GLEIF und sind geprüft (siehe `gleif.py`).
      Eine Rechercheantwort, die einen Ort mitliefert, wird an dieser Stelle
      ignoriert, statt eine geprüfte Angabe durch eine ungeprüfte zu
      ersetzen.
    - **Ungültiges wird gar nicht erst geschrieben.** `validate()` läuft über
      das Ergebnis, bevor der Aufrufer speichert — ein Umsatz ohne Quelle
      fällt hier auf, nicht erst im nächsten Build.

    Mutiert `rows` in place (wie `geocode.fill_missing`); der Aufrufer
    persistiert selbst."""
    by_symbol = {row.get("six_symbol", "").strip(): row for row in rows}
    report: dict = {"merged": [], "updated": [], "unknownSymbol": []}

    for symbol, payload in sorted(research.items()):
        row = by_symbol.get(symbol)
        if row is None:
            report["unknownSymbol"].append(symbol)
            continue

        was_researched = row.get("researched", "").strip() == "yes"
        before = {field: row.get(field, "") for field in RESEARCH_ONLY_FIELDS}
        for field in RESEARCH_ONLY_FIELDS:
            value = payload.get(field)
            row[field] = "" if value is None else str(value).strip()
        row["researched"] = "yes"

        changed = any(before[field] != row[field] for field in RESEARCH_ONLY_FIELDS)
        if not was_researched:
            report["merged"].append(symbol)
        elif changed:
            report["updated"].append(symbol)

    validate(rows, table)
    return report


def build_artifact(rows: list[dict], table: NogaTable, six_meta: dict | None = None,
                   monthly_fx: dict | None = None) -> dict:
    """`six_meta` (optional): `{"totalListed": int, "retrievedAt": str | None}`
    aus `fetch_six_titles()` — die Grundlage der Abdeckungsangabe ("8 von 224
    kotierten Gesellschaften recherchiert"). Ohne `six_meta` (z.B. in Tests)
    fällt `totalListed` auf `len(rows)` zurück, `retrievedAt` bleibt `None`.

    `monthly_fx` (optional): SNB-Monatsdurchschnitte aus `fx.parse()`. Damit
    bekommt jede Firma zusätzlich `revenueChf` — die Grösse, aus der die
    Säulenhöhe entsteht. `revenue`/`currency` bleiben die berichteten Werte
    für das Panel: umgerechnet lässt sich vergleichen, im Original lässt sich
    nachprüfen. Ohne `monthly_fx` bleibt `revenueChf` `None` und die Karte
    fällt auf den Originalbetrag zurück (Verhalten wie vor dem 14. August
    2026, als nur acht Aargauer Firmen darauf standen).
    """
    from . import fx as fx_module

    index = {g.key: i for i, g in enumerate(table.groups)}
    entries = []
    researched_count = 0
    fx_used: dict[str, dict] = {}
    fx_missing: list[dict] = []
    for row in rows:
        researched = row.get("researched", "").strip() == "yes"
        if researched:
            researched_count += 1
        # Ohne Sitz (Zefix/LINDAS fand keinen eindeutigen Treffer, siehe
        # `sync_national_csv`) gibt es keine Koordinaten und damit keinen
        # Marker — lieber ein fehlender Punkt als ein erfundener.
        if not (row.get("lon", "").strip() and row.get("lat", "").strip()):
            continue

        revenue = row.get("revenue", "").strip()
        unit = float(row.get("revenue_unit") or 1)
        profit = row.get("profit", "").strip()
        profit_unit = float(row.get("profit_unit") or 1)
        group = row.get("noga_group", "").strip()

        # Umrechnung in CHF für die Säulenhöhe. Schlägt sie fehl (Währung
        # ohne SNB-Reihe, Geschäftsjahr ausserhalb der Daten), bleibt
        # `revenueChf` leer und der Fall wird gemeldet — nie mit einem
        # geschätzten Kurs überbrückt.
        revenue_chf = None
        currency = (row.get("revenue_currency") or "").strip()
        fiscal_year = row.get("fiscal_year", "").strip()
        if revenue and monthly_fx is not None and currency and fiscal_year:
            try:
                converted = fx_module.rate(currency, int(fiscal_year), monthly_fx)
            except (KeyError, LookupError) as exc:
                fx_missing.append({"name": row["name"], "currency": currency,
                                   "fiscalYear": fiscal_year, "error": str(exc)})
            else:
                revenue_chf = float(revenue) * unit * converted["rate"]
                fx_used[f"{currency}/{fiscal_year}"] = converted

        # Dieselbe Umrechnung wie beim Umsatz, aus demselben Grund: als
        # Säulenhöhe verglichen misst ein EUR-Gewinn neben einem CHF-Gewinn
        # nicht dasselbe. Vorzeichen bleibt erhalten — ein Verlust wird
        # umgerechnet, nicht unterschlagen.
        profit_chf = None
        profit_currency = (row.get("profit_currency") or "").strip()
        if profit and monthly_fx is not None and profit_currency and fiscal_year:
            try:
                converted = fx_module.rate(profit_currency, int(fiscal_year), monthly_fx)
            except (KeyError, LookupError) as exc:
                fx_missing.append({"name": row["name"], "currency": profit_currency,
                                   "fiscalYear": fiscal_year, "error": str(exc)})
            else:
                profit_chf = float(profit) * profit_unit * converted["rate"]
                fx_used[f"{profit_currency}/{fiscal_year}"] = converted

        entries.append(
            {
                "uid": row["uid"] or None,
                "name": row["name"],
                "sixSymbol": row.get("six_symbol") or None,
                "lon": float(row["lon"]),
                "lat": float(row["lat"]),
                "nogaGroupIndex": index[group] if group in index else config.NOGA_UNKNOWN_INDEX,
                "orgForm": row.get("org_form") or None,
                "revenue": float(revenue) * unit if revenue else None,
                "revenueChf": revenue_chf,
                "currency": row.get("revenue_currency") or None,
                "revenueType": row.get("revenue_type") or None,
                "profit": float(profit) * profit_unit if profit else None,
                "profitChf": profit_chf,
                "profitCurrency": row.get("profit_currency") or None,
                "consolidationBasis": row.get("consolidation_basis") or None,
                "coreProducts": row.get("core_products") or None,
                "productsUrl": row.get("products_url") or None,
                "foundingYear": int(row["founding_year"]) if row.get("founding_year") else None,
                "employees": int(row["employees"]) if row.get("employees") else None,
                "fiscalYear": int(row["fiscal_year"]) if row.get("fiscal_year") else None,
                "reportUrl": row.get("report_url") or None,
                "note": row.get("note") or None,
                # Auch ein ausgewiesener Umsatz von NULL trägt keine
                # Höhenaussage: als echte Höhe gerechnet ergäbe er eine
                # Säule von null Metern, und die Firma verschwände von der
                # Karte, obwohl sie recherchiert ist und es sie gibt
                # (Molecular Partners, 2025: CHF 0, Vorjahr 5.0 Mio. — ein
                # klinisches Biotech ohne zugelassenes Produkt). Die echte
                # Null bleibt in `revenue` und damit im Panel stehen.
                # Diese Invariante ist keine ETL-Interna: `domain/metric.ts`
                # liefert für die Kennzahl «Umsatz» genau dann `null`, wenn
                # `placeholder` gesetzt ist — sonst zeichnete die Karte für
                # eine echte Null eine Säule auf Mindesthöhe und färbte sie
                # zugleich als «keine Zahl gefunden».
                "placeholder": not revenue or float(revenue) == 0,
                "researched": researched,
                "city": row.get("city") or None,
                "positionAdjusted": None,
            }
        )

    _spread_shared_positions(entries)

    revenues = [e["revenue"] for e in entries if e["revenue"] is not None]
    # Höhenmassstab über die umgerechneten Beträge, sonst über die
    # berichteten: `max` und die einzelnen Höhen müssen aus DERSELBEN Grösse
    # stammen. Ein Maximum in CHF neben Höhen in Berichtswährung wäre genau
    # der Fehler, der bei den Detailstufen von Ansicht B schon einmal
    # auftrat (jede Stufe auf ihr eigenes Maximum normiert, siehe README).
    revenues_chf = [e["revenueChf"] for e in entries if e.get("revenueChf") is not None]
    height_values = revenues_chf if len(revenues_chf) == len(revenues) else revenues
    profits = [e["profit"] for e in entries if e["profit"] is not None]
    profits_chf = [e["profitChf"] for e in entries if e.get("profitChf") is not None]
    six_meta = six_meta or {}
    return {
        "companies": entries,
        "stats": {
            "count": len(entries),
            "withRevenue": len(revenues),
            "max": max(height_values) if height_values else 0.0,
            # `true`, sobald JEDE Säule aus einem umgerechneten Betrag
            # entsteht. Bleibt eine einzige Umrechnung offen, fällt die
            # ganze Ansicht auf die Berichtswährungen zurück — halb
            # umgerechnet wäre schlimmer als gar nicht, weil dann zwei
            # Massstäbe nebeneinander stünden, ohne dass man es sieht.
            "revenueInChf": bool(revenues) and len(revenues_chf) == len(revenues),
            "profitInChf": bool(profits) and len(profits_chf) == len(profits),
            "fxRates": fx_used,
            "fxMissing": fx_missing,
            "researched": researched_count,
            # Nicht hartkodiert wie ORG_FORMS: das sind die tatsächlich im
            # Artefakt vorkommenden Werte, nicht das erlaubte Set — die
            # Karte baut ihre Filterknöpfe daraus, nicht aus dem Schema.
            "orgForms": sorted({e["orgForm"] for e in entries if e["orgForm"]}),
            "totalListed": six_meta.get("totalListed", len(rows)),
            "sixRetrievedDate": six_meta.get("retrievedAt"),
        },
    }


def _lindas_get(url: str, attempts: int = 3) -> bytes:
    """Default-Fetcher für LINDAS-Abfragen, mit Wiederholung bei transienten
    Netzwerkfehlern. `sync_national_csv` stellt bis zu ~190 solcher Anfragen
    in Folge — ein einzelner Timeout mitten in der Liste soll nicht die
    bereits gefundenen Sitze der vorherigen ~150 Firmen verwerfen (siehe
    Phase-3-Bericht: genau das ist beim ersten Lauf ohne Wiederholung
    passiert)."""
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return urllib.request.urlopen(
                urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": config.USER_AGENT,
                        "Accept": "application/sparql-results+json",
                    },
                ),
                timeout=60,
            ).read()
        except Exception as exc:  # noqa: BLE001 — bewusst breit, siehe Docstring
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2 * (attempt + 1))
    assert last_error is not None
    raise last_error


def _sparql(query: str, fetcher: Fetcher | None = None) -> dict:
    get = fetcher or _lindas_get
    return json.loads(get(f"{config.LINDAS_SPARQL}?{urllib.parse.urlencode({'query': query})}"))


def candidates_from_lindas(canton_code: str, fetcher: Fetcher | None = None) -> list[dict]:
    """Firmen mit Sitz im Kanton aus dem Zefix-Graphen.

    Die Prädikate werden in Task 15 Step 1 ermittelt und hier eingesetzt. Die
    Abfrage wird beim ersten Lauf gegen den Endpunkt geprüft; liefert sie null
    Zeilen, ist das ein Fehler und kein leeres Ergebnis.
    """
    query = _CANDIDATE_QUERY.replace("{{CANTON}}", canton_code)
    payload = _sparql(query, fetcher)
    bindings = payload.get("results", {}).get("bindings", [])
    if not bindings:
        raise LookupError(
            "LINDAS lieferte keine Firmen — Abfrage gegen die in Step 1 "
            "ermittelten Prädikate prüfen"
        )
    return [
        {key: binding[key]["value"] for key in binding}
        for binding in bindings
    ]


# In Task 15 Step 1 gegen den echten Graphen verifiziert (siehe
# task-15-report.md). Der Ausgangspunkt aus dem Brief war nicht lauffähig:
# schema:identifier zeigt auf einen PropertyValue-Knoten (drei pro Firma: UID,
# CHID, EHRAID), nicht auf einen Literal. `?uid` hätte also den falschen Knoten
# gebunden und DISTINCT hätte pro Firma bis zu drei Zeilen geliefert. Der Filter
# auf "/UID/" in der Knoten-URI wählt gezielt den UID-Identifier aus, dessen
# schema:value der eigentliche UID-String ist.
_CANDIDATE_QUERY = """
PREFIX schema: <http://schema.org/>
SELECT DISTINCT ?uid ?name ?municipality WHERE {
  GRAPH <https://lindas.admin.ch/foj/zefix> {
    ?company a schema:Organization ;
             schema:legalName ?name ;
             schema:address ?addr ;
             schema:identifier ?ident .
    ?addr schema:addressRegion "{{CANTON}}" ;
          schema:addressLocality ?municipality .
    ?ident schema:value ?uid .
    FILTER(CONTAINS(STR(?ident), "/UID/"))
  }
}
"""


# ---------------------------------------------------------------------------
# Phase 3: nationale Kandidatenliste — SIX-Titel live abfragen, auf Zefix-
# Sitze abbilden, `listed_companies.csv` um noch fehlende Titel ergänzen.
# ---------------------------------------------------------------------------

SIX_ENDPOINT = "https://www.six-group.com/fqs/ref.json"

# `ProductLine=EQ` liefert HTTP 200 mit `totalRows: 0` — kein Fehler, aber
# auch keine Daten (siehe data/manual/six_issuers_ag.md). Aktien laufen
# stattdessen unter zwei Codes: BC (SMI Blue Chip) und DS (übrige inländische
# Aktien). `pageSize` wird vom Endpunkt ignoriert; Paginierung läuft über
# `page=N`, eine leere `rowData`-Seite beendet sie.
SIX_PRODUCT_LINES = ("BC", "DS")

SHARE_CLASS_SUFFIX = {"N", "I", "PS", "BN", "ANR"}

# Rechtsform-/Sammelwörter, die iterativ vom Ende eines Namens entfernt
# werden, bevor zwei Namen verglichen werden (siehe `canonicalize`) — damit
# "Siegfried Holding AG" (Zefix) und "SIEGFRIED" (SIX-Kurzname ohne
# Rechtsform) auf denselben Kern reduzieren, ohne dass für jede denkbare
# Rechtsform ein Sonderfall nötig wäre.
LEGAL_FORM_STOP = {
    "AG", "SA", "GMBH", "SARL", "LTD", "LIMITED", "INC", "PLC", "NV", "SPA",
    "SE", "HOLDING", "HLDG", "HLD", "GROUP", "GRUPPE", "GR",
    "COOP", "GENOSSENSCHAFT", "COMPANY", "CO", "CIE",
}

# Wörter, die eine Konzern-SCHWESTER beschreiben (nicht die Rechtsform selbst
# wie oben) — anders als "Holding"/"Group" (fast immer die tatsächlich
# kotierte Konzernspitze) bezeichnet "X International AG"/"X Services AG"
# in der Schweizer Praxis fast immer eine eigenständige, andere
# Rechtseinheit als "X AG" — deshalb NICHT in LEGAL_FORM_STOP (das würde
# beide beim ersten Vergleich ununterscheidbar machen, siehe Regressionsfall
# "ARYZTA": "ARYZTA AG" und "ARYZTA International AG" wären sonst beide
# exakte Treffer für denselben Schlüssel gewesen, ohne Möglichkeit, die
# richtige zu bevorzugen). Stattdessen ein zweiter Filter in
# `match_company_seat`, NUR wenn der rohe Vergleich mehrdeutig bleibt: ein
# extended-Kandidat, dessen einziges zusätzliches Wort hier steht, gilt als
# Konzern-Schwester und wird zugunsten eines exakten Treffers verworfen —
# aber nur, wenn dadurch GENAU EIN Kandidat übrig bleibt oder eine
# Adress-Mehrheit entsteht, nie geraten.
GENERIC_SUBSIDIARY_WORDS = {
    "INTERNATIONAL", "INT", "SCHWEIZ", "SWITZERLAND", "SUISSE", "SVIZZERA",
    "SERVICES", "MANAGEMENT", "SOLUTIONS", "CONSULTING", "VERWALTUNGS",
    "VERWALTUNG", "BETEILIGUNGS", "BETEILIGUNG", "FINANZ", "FINANCE",
    "VERTRIEBS", "VERTRIEB", "PRODUKTIONS", "PRODUKTION", "INVEST",
    "INVESTMENTS", "TRADING", "GLOBAL", "WORLDWIDE", "EUROPE",
    # Vorsorge-/Personalfürsorge-/Kultur-Vehikel eines Konzerns: rechtlich
    # eigenständig, aber so gut wie nie die kotierte Gesellschaft selbst —
    # anders als "International"/"Services" (die zumindest denkbar die
    # kotierte Einheit sein könnten) so gut wie ausgeschlossen. Regressions-
    # fälle: "VZ Sammelstiftung" (statt "VZ Holding AG") und "St. Galler
    # Kantonalbank Kulturstiftung" (statt "St.Galler Kantonalbank AG") wurden
    # beide zunächst fälschlich bevorzugt bzw. erzeugten Mehrdeutigkeit.
    "STIFTUNG", "KULTURSTIFTUNG", "SAMMELSTIFTUNG", "PERSONALVORSORGESTIFTUNG",
    "VORSORGESTIFTUNG", "PENSIONSKASSE", "VORSORGEEINRICHTUNG", "PERSONALVORSORGE",
    "UNTERSTUETZUNGSFONDS", "WOHLFAHRTSFONDS", "FONDATION",
}

_SECOND_LINE_RE = re.compile(r"2[.,]?\s*LINIE", re.IGNORECASE)
_PUNCT_RE = re.compile(r"[.,]")
_UID_FROM_URI_RE = re.compile(r"/company/(\d+)$")

# Zefix schreibt "St." (Sankt) manchmal ohne Leerzeichen vor dem nächsten
# Wort ("St.Galler Kantonalbank AG") — würde der Punkt wie sonst einfach
# entfernt (_PUNCT_RE), verschmölze das zu einem einzigen Token "STGALLER",
# das mit keinem SIX-Token ("ST", "GALLER" getrennt) mehr übereinstimmt.
# Regressionsfall: genau das liess die echte "St.Galler Kantonalbank AG"
# durchfallen, während eine zufällig korrekt geschriebene "St. Galler
# Kantonalbank Kulturstiftung" (eine Stiftung, nicht die Bank) den Vergleich
# fälschlich bestand. Bewusst NUR für "St." (nicht generell jeden Punkt
# durch ein Leerzeichen ersetzt): eine generelle Regel hätte "S.A." zu "S A"
# statt zur erkannten Rechtsform "SA" gemacht und wäre selbst ein Regression
# gewesen (siehe Test `test_tokens_does_not_split_sa_apart`).
_ST_ABBREVIATION_RE = re.compile(r"\bSt\.(?=[A-Za-z])")

# SIX-Kurznamen sind reines ASCII und transliterieren deutsche Umlaute nach
# Schweizer/deutscher Konvention (ä→ae, ö→oe, ü→ue) statt sie einfach zu
# entfernen — "Julius Bär" wird "JULIUS BAER", nicht "JULIUS BAR"; "Kühne"
# wird "KUEHNE", nicht "KUHNE"; "Zürich" wird "ZUERICH", nicht "ZURICH".
# Reines NFKD-Diakritika-Entfernen (wie unten für z.B. "Genève" -> "GENEVE")
# hätte diese drei bekannten Fälle beim ersten `companies-sync`-Lauf
# verfehlt (Julius Bär, Kühne+Nagel, Flughafen Zürich, Züblin Immobilien —
# alle vier tatsächlich in Zefix vorhanden, aber zunächst als "unmatched"
# markiert). Das Mapping wird auf JEDEN Namen angewendet, bevor er
# tokenisiert wird — auf einem bereits-ASCII-Namen (jeder SIX-Kurzname) ist
# es ein No-op, auf einem Zefix-`legalName` mit Umlaut macht es die beiden
# Seiten vergleichbar.
_UMLAUT_TRANSLATION = str.maketrans({
    "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue",
})


def _expand_umlauts(s: str) -> str:
    return s.translate(_UMLAUT_TRANSLATION)


def _strip_diacritics(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


# Kantonalbanken: SIX schreibt sie als "<Kanton> KB" (Deutschschweiz, z.B.
# "GLARNER KB") oder "BC <Kanton>" (Romandie, z.B. "BC GENEVE") — beides
# Abkürzungen, die im Zefix-`legalName` ("Glarner Kantonalbank AG", "Banque
# Cantonale de Genève") nicht wörtlich vorkommen. Ohne diese Auflösung wären
# alle neun an der SIX kotierten Kantonalbanken unmatched geblieben, obwohl
# jede von ihnen unzweifelhaft in Zefix registriert ist — anders als bei den
# echten Fällen von "kein Zefix-Treffer" (siehe Bericht) ist das eine
# bekannte, geschlossene Abkürzungsliste, kein Rateversuch. Whole-Token-Ersatz
# (nicht Teilstring), angewendet auf beide Seiten des Vergleichs gleich.
_TOKEN_EXPANSIONS: dict[str, list[str]] = {
    "KB": ["KANTONALBANK"],
    "BC": ["BANQUE", "CANTONALE"],
    # SIX kürzt "International" im Kurznamen selbst zu "INT" ab (z.B.
    # "KUEHNE+NAGEL INT") — Zefix schreibt es meist aus ("Kühne + Nagel
    # International AG"). Ohne diese Auflösung ist "INT" (Kurzname) ein
    # anderer String als "INTERNATIONAL" (Zefix) und der Teilmengen-
    # Vergleich schlägt fehl, obwohl SIX' eigener Kurzname bereits
    # eindeutig signalisiert, dass die "International"-Einheit gemeint ist
    # — anders als bei "ARYZTA" (kein "INT" im SIX-Kurznamen), wo genau
    # diese Unterscheidung die Konzern-Schwester korrekt ausschliessen soll
    # (siehe GENERIC_SUBSIDIARY_WORDS/LEGAL_FORM_STOP-Kommentar oben).
    "INT": ["INTERNATIONAL"],
}


def _tokens(name: str) -> list[str]:
    name = _SECOND_LINE_RE.sub("", name)
    name = _ST_ABBREVIATION_RE.sub("St. ", name)
    name = _PUNCT_RE.sub("", name)
    name = _expand_umlauts(name)
    # "+" wird IMMER isoliert (Leerzeichen davor/danach erzwungen), bevor
    # auf Whitespace gesplittet wird — Regressionsfall "KUEHNE+NAGEL":
    # SIX schreibt Firmenverbindungen ohne Leerzeichen ("HUBER+SUHNER",
    # "LANDIS+GYR"), Zefix mal so ("Huber+Suhner AG"), mal mit Leerzeichen
    # ("Kühne + Nagel International AG") — ohne diese Normalisierung
    # tokenisieren beide Schreibweisen unterschiedlich (ein zusammen-
    # geschriebenes "KUEHNE+NAGEL" vs. drei getrennte "KUEHNE"/"+"/"NAGEL")
    # und der Teilmengen-Vergleich in `match_company_seat` schlägt fehl,
    # obwohl es dieselbe, tatsächlich existierende Schweizer Firma ist.
    name = name.replace("+", " + ")
    tokens = [_strip_diacritics(w).upper() for w in name.split() if w]
    out: list[str] = []
    for t in tokens:
        out.extend(_TOKEN_EXPANSIONS.get(t, [t]))
    return out


def company_key(short_name: str) -> str:
    """Gruppierungsschlüssel: SIX-Kurzname ohne 2.-Linie-Marker und ohne die
    Gattungs-Endung (N/I/PS/...). Mehrere SIX-Titel derselben Gesellschaft
    (Namen-/Partizipationsschein-Aktie, 2. Handelslinie) fallen so auf
    denselben Schlüssel und werden zu einem Kandidaten zusammengefasst —
    sonst erschiene dieselbe Firma mehrfach als Marker."""
    words = _tokens(short_name)
    if words and words[-1] in SHARE_CLASS_SUFFIX:
        words = words[:-1]
    return " ".join(words)


def canonicalize(name: str) -> str:
    """Vergleichbarer Kern eines Namens: Gattungs-Endung UND Rechtsform-/
    Sammelwörter iterativ vom Ende entfernt. Auf SIX-Kurznamen und
    Zefix-`legalName` gleichermassen angewendet macht das die beiden
    vergleichbar, ohne SIX' Abkürzungskonventionen im Detail nachzubilden."""
    words = _tokens(name)
    if words and words[-1] in SHARE_CLASS_SUFFIX:
        words = words[:-1]
    while len(words) > 1 and words[-1] in LEGAL_FORM_STOP:
        words = words[:-1]
    return " ".join(words)


def significant_search_tokens(key: str) -> list[str]:
    """Token eines `company_key` für die LINDAS-Suche — kurze (< 3 Zeichen)
    oder generische Wörter (Rechtsform, "Group" etc.) taugen als Suchbegriff
    schlecht (zu viele Treffer), fallen aber nicht aus dem Vergleich selbst
    heraus (`canonicalize`/`match_company_seat` sehen sie weiterhin).

    Anders als in einer früheren Fassung KEIN Rückfall auf einen kurzen oder
    generischen Token, wenn nichts Brauchbares übrig bleibt — Regressionsfall
    "VZ HOLDING": beide Wörter fallen durch (`VZ` zu kurz, `HOLDING`
    Rechtsform), der frühere Rückfall suchte trotzdem nach dem 2-Zeichen-Wort
    `VZ` und traf per Adress-Mehrheit zufällig auf "VZ Sammelstiftung" (eine
    Vorsorgeeinrichtung, nicht die tatsächlich gesuchte "VZ Holding AG") —
    ein falscher, aber selbstsicher gemeldeter Treffer. `find_seat()` gibt für
    eine leere Rückgabe hier direkt "unmatched" zurück, ohne zu suchen.

    Tokenisiert über `_tokens()` (dieselbe Normalisierung wie `canonicalize`),
    NICHT über ein rohes `key.split()` — Regressionsfall "KUEHNE+NAGEL INT":
    ein roher Split liess "KUEHNE+NAGEL" als EIN Suchwort mit eingebettetem
    "+" stehen, das gegen Zefix' "Kühne + Nagel" (mit Leerzeichen um das "+")
    nicht traf, und "INT" blieb unaufgelöst statt zu "INTERNATIONAL" zu
    werden. `_tokens()` löst beides auf, bevor überhaupt gesucht wird."""
    return [w for w in _tokens(key) if len(w) >= 3 and w not in LEGAL_FORM_STOP]


def uid_from_company_uri(uri: str) -> str | None:
    m = _UID_FROM_URI_RE.search(uri)
    return m.group(1) if m else None


def _clean_street(street: str) -> str:
    """Zefix' `schema:streetAddress` trägt bei c/o-Adressen zwei Zeilen,
    getrennt durch ein eingebettetes Zeilenumbruchzeichen ("c/o Warteck
    Invest AG\\nMünchensteinerstrasse 117") — die eigentliche Strasse ist
    die LETZTE Zeile. Ungereinigt bricht sowohl `geocode_query` (der
    Zeilenumbruch machte die swisstopo-Suche mit HTTP 400 scheitern, kein
    Treffer) als auch die CSV-Spalte `street` selbst (die dann ihrerseits
    einen Zeilenumbruch trägt) daran. Firmen ohne c/o-Präfix (die meisten)
    bleiben unverändert — `splitlines()` liefert dann eine einzige Zeile."""
    lines = [line.strip() for line in street.splitlines() if line.strip()]
    return lines[-1] if lines else street


def group_six_titles(titles: list[dict]) -> list[dict]:
    """Fasst SIX-Titel (`fetch_six_titles()["titles"]`) nach `company_key`
    zusammen. Der "primäre" Titel je Gruppe (dessen ISIN/Symbol die Zeile
    repräsentiert) ist die alphabetisch erste 1.-Linie-Notierung, sonst die
    alphabetisch erste überhaupt — deterministisch über Läufe hinweg."""
    groups: dict[str, list[dict]] = {}
    for t in titles:
        groups.setdefault(company_key(t["shortName"]), []).append(t)

    result = []
    for key in sorted(groups):
        group_titles = groups[key]
        primary = sorted(
            group_titles,
            key=lambda t: (bool(_SECOND_LINE_RE.search(t["shortName"])), t["shortName"]),
        )[0]
        result.append({"key": key, "titles": group_titles, "primary": primary})
    return result


def match_company_seat(key: str, candidates: list[dict]) -> dict:
    """Entscheidet, ob `candidates` (LINDAS-Treffer für ein Suchwort aus
    `key`) genau eine Gesellschaft eindeutig identifizieren.

    Ergebnis ist eine von drei Stufen — bewusst konservativ, siehe
    `sync_national_csv`s Auftrag ("report every title you could not match
    rather than guessing"):

    - `matched`: genau EIN Kandidat kommt in Frage — entweder weil sein
      kanonischer Name exakt dem Schlüssel entspricht (`confidence=exact`),
      weil er ihn um höchstens ein zusätzliches Wort erweitert
      (`confidence=extended`, z.B. Zefix "Aevis Victoria SA" für SIX
      "AEVIS"), oder weil mehrere Rechtseinheiten (Holding, Betriebs-,
      Verwaltungsgesellschaft) an DERSELBEN Adresse übereinstimmen
      (`confidence=address_majority` — welche UID genau die kotierte ist,
      bleibt dabei unsicher, der Sitz selbst nicht).
    - `ambiguous`: mehr als eine Adresse kommt ernsthaft in Frage (kein
      eindeutiger Mehrheitssitz) — wird NICHT geraten.
    - `unmatched`: kein Kandidat erfüllt auch nur die lockere Erweiterungs-
      regel.

    Wichtig: exact- und extended-Kandidaten werden in einem gemeinsamen Pool
    entschieden, nicht stufenweise mit frühem Return bei der ersten Stufe,
    die einen einzelnen Treffer hat. Ein früher Return wäre blind gegen einen
    konkurrierenden Treffer der anderen Stufe — beobachtet bei "MONTANA":
    "Montana Holding AG" (Solothurn) ist ein exakter, aber falscher Treffer;
    die gesuchte "Montana Aerospace AG" (Reinach AG) liegt nur im
    extended-Pool, weil SIX "Aerospace" im Kurznamen wegliess. Ein früher
    Return auf der exact-Stufe hätte den falschen Treffer als sicher
    ausgegeben."""
    canon_key = canonicalize(key)
    key_tokens = set(canon_key.split())

    exact: list[dict] = []
    extended: list[dict] = []
    seen_uris: set[str] = set()
    for c in candidates:
        if c["company"] in seen_uris:
            continue
        seen_uris.add(c["company"])
        canon_cand = canonicalize(c["name"])
        cand_tokens = canon_cand.split()
        if canon_cand == canon_key:
            exact.append(c)
        elif key_tokens and key_tokens.issubset(set(cand_tokens)) and \
                len(cand_tokens) - len(key_tokens) <= 1:
            extended.append(c)

    pool = {c["company"]: (c, "exact") for c in exact}
    for c in extended:
        pool.setdefault(c["company"], (c, "extended"))

    resolved = _resolve_pool(pool)
    if resolved is not None:
        return resolved

    # Zweiter Versuch: extended-Kandidaten herausfiltern, deren einziges
    # zusätzliches Wort ein generisches Konzernstruktur-Wort ist
    # (`GENERIC_SUBSIDIARY_WORDS`) — "Adecco International AG" neben
    # "Adecco Group AG" ist keine eigenständige, konkurrierende Firma,
    # sondern eine Konzern-Schwester mit demselben Kern. Ohne diesen zweiten
    # Versuch blieben exakte Treffer wie Adecco, Alcon, Aryzta und Ascom
    # mehrdeutig, obwohl der exakte Kandidat der einzig plausible ist.
    # Bewusst NICHT als generelle Regel im ersten Versuch: ein "echtes"
    # zusätzliches Wort (z.B. "Aerospace" bei "Montana Aerospace AG") darf
    # eine konkurrierende exakte Zufallstreffer-Firma ("Montana Holding AG")
    # weiterhin zur Mehrdeutigkeit zwingen statt sie zu bevorzugen — dieser
    # zweite Versuch greift nur, wenn die zusätzlichen Wörter erkennbar
    # strukturell (nicht identitätsstiftend) sind.
    def _is_purely_generic_extension(entry: tuple[dict, str]) -> bool:
        c, confidence = entry
        if confidence == "exact":
            return False
        extra = _extra_words(canon_key, c)
        return bool(extra) and extra <= GENERIC_SUBSIDIARY_WORDS

    # Behält exakte Treffer immer; verwirft aus dem extended-Pool NUR
    # Kandidaten, deren zusätzliche(s) Wort(e) ausschliesslich generisch
    # sind (Konzern-Schwester, siehe GENERIC_SUBSIDIARY_WORDS oben) — ein
    # Kandidat mit einem echten Identitätswort (z.B. "Aerospace") bleibt im
    # Pool und kann weiterhin zu Recht Mehrdeutigkeit erzwingen.
    # NUR mit einem exakten Treffer als Anker. Der Filter kann einen
    # Kandidaten bevorzugen, aber nicht beurteilen, WELCHER der richtige ist —
    # er kennt nur "generisches Zusatzwort" als Ausschlussgrund. Ohne exakten
    # Treffer entscheidet er damit zwischen lauter gleichrangigen Kandidaten
    # allein danach, wessen Zusatzwort zufällig auf der Liste steht.
    # Regressionsfall "WARTECK": die gesuchte "Warteck Invest AG" trägt mit
    # "Invest" ein Wort aus GENERIC_SUBSIDIARY_WORDS, bei der fremden
    # "Warteck Sport Holding AG" fällt "Holding" schon als Rechtsform weg und
    # das verbleibende "Sport" gilt als identitätsstiftend — der Filter warf
    # den richtigen Kandidaten weg und machte den falschen zum eindeutigen
    # Treffer. Mit Anker bleibt die Absicht ("Konzern-Schwester neben dem
    # exakten Treffer") erhalten, ohne Anker gibt es nichts zu bevorzugen.
    has_exact = any(confidence == "exact" for _, confidence in pool.values())
    refined = {
        uri: entry for uri, entry in pool.items()
        if not _is_purely_generic_extension(entry)
    } if has_exact else pool
    if len(refined) < len(pool):
        resolved = _resolve_pool(refined)
        if resolved is not None:
            resolved.setdefault("confidence_note", "generic_subsidiary_filtered")
            return resolved

    entries = [c for c, _ in pool.values()]
    if entries:
        return {"status": "ambiguous", "candidates": entries}
    return {"status": "unmatched", "candidates": candidates[:5]}


def _extra_words(canon_key: str, candidate: dict) -> set[str]:
    cand_tokens = set(canonicalize(candidate["name"]).split())
    return cand_tokens - set(canon_key.split())


def _resolve_pool(pool: dict[str, tuple[dict, str]]) -> dict | None:
    """Gemeinsame Entscheidung für einen Kandidaten-Pool: genau ein
    Kandidat, oder eine eindeutige Adress-Mehrheit. `None`, wenn beides
    nicht zutrifft (Aufrufer entscheidet dann selbst über ambiguous/
    unmatched) — siehe `match_company_seat` für die beiden Aufrufstellen
    (roher Pool, dann ein gefilterter zweiter Versuch)."""
    if len(pool) == 1:
        (c, confidence), = pool.values()
        return {"status": "matched", "confidence": confidence, "match": c}
    if len(pool) > 1:
        entries = [c for c, _ in pool.values()]
        by_address: dict[tuple, list[dict]] = {}
        for c in entries:
            by_address.setdefault((c["street"], c["zip"], c["city"]), []).append(c)
        sizes = sorted((len(v) for v in by_address.values()), reverse=True)
        winner = max(by_address.values(), key=len)
        # Mehrheitsadresse: mindestens zwei Kandidaten an derselben Adresse
        # UND eindeutig die grösste Gruppe (kein Gleichstand mit einer
        # zweiten Adresse) — Tochter-/Hilfsgesellschaften eines kotierten
        # Konzerns teilen fast immer die Sitzadresse; zufällige Namensvettern
        # (andere Städte) bleiben Einzelstimmen und ziehen keine Mehrheit.
        if len(winner) >= 2 and (len(sizes) == 1 or sizes[0] > sizes[1]):
            best = min(winner, key=lambda c: len(canonicalize(c["name"]).split()))
            return {"status": "matched", "confidence": "address_majority", "match": best}
    return None


def _six_retrieved_date(raw: str | None) -> str | None:
    """`delayedDateTime` aus der SIX-Antwort (z.B. "20260814T13:46:42.627")
    auf ein Datum verkürzt — die eigene Angabe des Endpunkts, nicht die
    lokale Systemuhr, damit die Karte dasselbe Datum zeigt, das SIX selbst
    als Stand der Daten ausweist."""
    if not raw or "T" not in raw:
        return raw
    date_part = raw.split("T", 1)[0]
    if len(date_part) == 8 and date_part.isdigit():
        return f"{date_part[0:4]}-{date_part[4:6]}-{date_part[6:8]}"
    return raw


def fetch_six_titles(fetcher: Fetcher | None = None) -> dict:
    """Alle an der SIX kotierten Aktientitel (ProductLine BC+DS), live
    abgefragt — nicht hartkodiert, damit die Zahl aktuell bleibt. Bricht mit
    einer klaren Meldung ab, wenn der Endpunkt nicht erreichbar ist oder eine
    unerwartete Form liefert: kein stiller Rückfall auf eine veraltete Zahl.

    Rückgabe: `{"retrievedAt": "2026-08-14" | None, "titles": [...]}`, je
    Titel `{"shortName", "isin", "sixSymbol", "productLine"}`.
    """
    get = fetcher or (
        lambda url: urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT}),
            timeout=60,
        ).read()
    )

    titles: list[dict] = []
    retrieved_raw: str | None = None
    seen_isins: set[str] = set()
    for product_line in SIX_PRODUCT_LINES:
        page = 1
        while True:
            params = urllib.parse.urlencode({
                "select": "ShortName,ISIN,ValorSymbol,ProductLine",
                "where": f"ProductLine={product_line}",
                "page": page,
            })
            url = f"{SIX_ENDPOINT}?{params}"
            try:
                payload = json.loads(get(url))
            except Exception as exc:
                raise ConnectionError(
                    f"SIX-Titelliste nicht erreichbar (ProductLine={product_line}, "
                    f"Seite {page}): {exc}. Ohne diese Liste ist die Gesamtzahl "
                    "kotierter Titel nicht aktuell zu ermitteln — kein Rückfall "
                    "auf eine veraltete Zahl."
                ) from exc
            if retrieved_raw is None:
                retrieved_raw = payload.get("delayedDateTime")
            col_names = payload.get("colNames") or []
            row_data = payload.get("rowData") or []
            if not row_data:
                break
            for r in row_data:
                entry = dict(zip(col_names, r))
                isin = entry.get("ISIN", "")
                if not isin or isin in seen_isins:
                    continue
                seen_isins.add(isin)
                titles.append({
                    "shortName": entry.get("ShortName", ""),
                    "isin": isin,
                    "sixSymbol": entry.get("ValorSymbol", ""),
                    "productLine": entry.get("ProductLine", product_line),
                })
            page += 1
            if page > 20:
                raise ConnectionError(
                    f"SIX-Titelliste (ProductLine={product_line}): über 20 Seiten "
                    "gelesen — wirkt nach einer Endlosschleife, abgebrochen."
                )
    if not titles:
        raise ConnectionError("SIX-Titelliste lieferte keinen einzigen Titel.")
    return {"retrievedAt": _six_retrieved_date(retrieved_raw), "titles": titles}


_SEAT_QUERY = """
PREFIX schema: <http://schema.org/>
SELECT DISTINCT ?company ?name ?street ?zip ?city ?region WHERE {{
  GRAPH <https://lindas.admin.ch/foj/zefix> {{
    ?company a schema:Organization ;
             schema:legalName ?name ;
             schema:address ?addr .
    FILTER(REGEX(?name, "{fragment}", "i"))
    ?addr schema:streetAddress ?street ;
          schema:postalCode ?zip ;
          schema:addressLocality ?city ;
          schema:addressRegion ?region .
  }}
}}
ORDER BY ?company
LIMIT 300
"""


def seat_candidates_from_lindas(token: str, fetcher: Fetcher | None = None) -> list[dict]:
    """LINDAS-Kandidaten für ein Suchwort — ein diakritik-toleranter,
    gross-/kleinschreibungsunabhängiger Teilstring-Regex (letztes Zeichen
    eines längeren Tokens abgeschnitten, damit z.B. "GENEV" sowohl "Genève"
    als auch "GENEVE" trifft), nicht Gleichheit. Die eigentliche Entscheidung
    trifft `match_company_seat()` danach im Python-Code, nicht die Abfrage.

    Die Abfrage ist auf 300 Treffer begrenzt (`_SEAT_QUERY`) — für ein
    generisches Suchwort wie "SWISS" reicht das nicht, und die gesuchte
    Firma kann ausserhalb der ersten 300 Treffer liegen. `find_seat()` fängt
    das ab, indem es bei Bedarf ein selteneres Token derselben Firma
    probiert, statt sich auf ein einziges zu verlassen.

    `ORDER BY ?company` vor dem `LIMIT` ist nicht Kosmetik, sondern die
    Bedingung dafür, dass der Build reproduzierbar ist: ein `LIMIT` ohne
    Sortierung lässt offen, WELCHE 300 der Treffer zurückkommen, und zwei
    identische Läufe können verschiedene Teilmengen erhalten — und damit
    verschiedene Sitze in die CSV schreiben. Genau das war zu beobachten:
    "SWISS PRIME SITE" wurde in einem Lauf zugeordnet und im nächsten nicht,
    ohne dass sich am Code etwas geändert hatte. Die Sortierung macht den
    Schnitt bestimmt (nicht vollständig — dagegen hilft nur das seltenere
    Token), also denselben Lauf wiederholbar.

    Regressionsfall "HUBER+SUHNER"/"LANDIS+GYR"/"KUEHNE+NAGEL": ein Token
    mit einem literalen "+" (SIX schreibt Firmenverbindungen so, ohne
    Leerzeichen, und Zefix ebenso — "Huber+Suhner AG") wurde ungeschützt in
    den REGEX-Ausdruck eingesetzt. "+" ist dort ein Quantor ("ein- oder
    mehrmals"), kein literales Zeichen — die Abfrage suchte faktisch nach
    "HUBE" gefolgt von einem-oder-mehr "R" gefolgt von "SUHNE", nicht nach
    der tatsächlichen Zeichenfolge, und lieferte deshalb null Treffer. Drei
    tatsächlich existierende, unzweifelhaft Schweizer Firmen erschienen so
    fälschlich als "unmatched" — nicht als Domizil im Ausland, sondern als
    Regex-Fehler. Behoben über eine Zeichenklasse (`[+]` statt einem
    Backslash-Escape): ein
    Backslash-Escape (`re.escape()`) scheiterte an der SPARQL-String-
    Syntax des Endpunkts (HTTP 400) — die Zeichenklasse braucht keinen
    Backslash und ist sowohl als Regex als auch als SPARQL-String-Literal
    unproblematisch."""
    fragment = token[:-1] if len(token) > 5 else token
    fragment = fragment.replace("+", "[+]")
    payload = _sparql(_SEAT_QUERY.format(fragment=fragment), fetcher)
    bindings = payload.get("results", {}).get("bindings", [])
    return [{k: v["value"] for k, v in b.items()} for b in bindings]


_SEAT_QUERY_LIMIT = 300


def find_seat(key: str, fetcher: Fetcher | None = None) -> dict:
    """Sucht den Sitz einer Firma über mehrere Suchwörter, nicht nur das
    längste. Reihenfolge: längstes Token zuerst (am ehesten distinktiv), bei
    Erfolg (`status == "matched"`) sofortiger Abbruch. Ein Token, dessen
    Trefferliste exakt das Limit erreicht (`_SEAT_QUERY_LIMIT`), gilt als zu
    generisch, um ihm zu vertrauen — es zählt nicht als abschliessendes
    "unmatched", das nächste Token wird trotzdem versucht (siehe
    "SWISS PRIME SITE": "SWISS" liefert 300 abgeschnittene Treffer ohne die
    gesuchte Firma, "PRIME" findet sie eindeutig innerhalb des Limits).

    Liefert die "beste" Stufe über alle probierten Token: `matched` >
    `ambiguous` > `unmatched` — ein Token, das immerhin auf mehrere
    plausible Kandidaten eingrenzt, ist informativer als eines, das gar
    nichts findet."""
    tokens = sorted(significant_search_tokens(key), key=len, reverse=True)
    best: dict | None = None
    rank = {"matched": 2, "ambiguous": 1, "unmatched": 0}
    for token in tokens:
        candidates = seat_candidates_from_lindas(token, fetcher)
        outcome = match_company_seat(key, candidates)
        if len(candidates) >= _SEAT_QUERY_LIMIT:
            # Zu generisches Suchwort — dieser Versuch zählt nicht als
            # verlässliches Ergebnis, aber als Rückfall aufheben, falls kein
            # anderes Token etwas Besseres liefert.
            #
            # Die Prüfung steht VOR dem frühen Return auf "matched": eine
            # abgeschnittene Liste macht auch einen Treffer unzuverlässig,
            # denn der entscheidende Gegenkandidat kann jenseits des Schnitts
            # liegen. Regressionsfall "GEORG FISCHER": "FISCHE" liefert 300
            # abgeschnittene Treffer, in denen die Tochter "Georg Fischer
            # Rohrleitungssysteme AG" als einziger Kandidat übrig blieb und
            # als sicherer Treffer zurückkam — die kotierte "Georg Fischer AG"
            # lag hinter dem Schnitt. Früher griff die Limit-Regel für Treffer
            # nie, obwohl der Docstring sie für sie mitmeinte.
            # Ausnahme: ein EXAKTER Treffer (kanonischer Name identisch mit
            # dem Schlüssel) trägt sich selbst. Was hinter dem Schnitt liegen
            # könnte, wäre ein zweiter, gleichnamiger Kandidat — selten. Die
            # abgeleiteten Stufen `extended` und `address_majority` sind
            # dagegen VERGLEICHSurteile ("der einzige Kandidat", "die grösste
            # Adressgruppe") und nur so gut wie das Feld, über das sie
            # vergleichen — die dürfen aus einer abgeschnittenen Liste nicht
            # gelten. Belegt an diesem Lauf: "ZURICH INSURANCE" ->
            # "Zurich Insurance Group AG" ist exakt und richtig, während
            # "SIG GROUP" -> "SIG Services AG" (Konzern-Schwester, nur
            # `extended`) falsch wäre — die Unterscheidung hält beide
            # auseinander, eine pauschale Regel keine von beiden.
            if outcome["status"] == "matched" and outcome.get("confidence") == "exact":
                return dict(outcome, truncated=True)
            if best is None:
                best = dict(outcome, truncated=True)
            continue
        if outcome["status"] == "matched":
            return outcome
        if best is None or rank[outcome["status"]] > rank[best["status"]]:
            best = outcome
    if best is not None and best.get("truncated") and best["status"] == "matched":
        # Letzter Ausweg, aber kein sicherer Treffer: kein anderes Suchwort
        # kam innerhalb des Limits durch, also bleibt nur ein Kandidat aus
        # einer nachweislich unvollständigen Liste. Als `ambiguous` melden
        # statt als `matched` — dann schreibt `sync_national_csv` keine
        # Adresse und der Titel erscheint im Bericht unter den ungeklärten,
        # statt als scheinbar gesicherter Sitz in der CSV zu landen.
        return {"status": "ambiguous", "candidates": [best["match"]], "truncated": True}
    return best if best is not None else {"status": "unmatched", "candidates": []}


def sync_national_csv(
    path: Path,
    *,
    six_fetcher: Fetcher | None = None,
    lindas_fetcher: Fetcher | None = None,
    gleif_fetcher: Fetcher | None = None,
    on_progress: Callable[[str], None] | None = None,
) -> dict:
    """Ergänzt `listed_companies.csv` um SIX-Titel, die noch keine Zeile
    haben — bestehende Zeilen (insbesondere die acht recherchierten) bleiben
    unangetastet, es wird ausschliesslich angehängt, nie überschrieben.

    Der Sitz kommt seit dem 14. August 2026 **zuerst aus GLEIF** (ISIN →
    Rechtsträger, siehe `gleif.py`), und nur für Titel ohne GLEIF-Eintrag
    aus dem Namensabgleich `find_seat()`. Der Grund steht in `gleif.py`s
    Moduldokumentation: der Namensabgleich lag bei 28 von 130 Firmen auf der
    falschen Rechtseinheit.

    Neue Zeilen: `researched=no`; wo ein Sitz bestimmt werden konnte, sind
    `uid`/`lei`/`name`/`street`/`zip`/`city`/`seat_basis` gesetzt
    (Koordinaten holt danach der reguläre `geocode.fill_missing()`-Schritt),
    sonst bleiben Adresse und Koordinaten leer — der Titel existiert dann nur
    als Zeile ohne Marker (siehe `build_artifact`), nicht als Rateposition.

    Gibt einen Bericht zurück (für CLI-Ausgabe und den Phase-Bericht):
    Zähler und Listen für matched/ambiguous/unmatched, dazu doppelt
    vergebene Sitzadressen unter den neu geschriebenen Zeilen (mehrere
    Gesellschaften am selben Sitz — kein Fehler, aber meldenswert), und
    `nameMismatch`: Titel, bei denen SIX-Kurzname und GLEIF-Firmenname
    erkennbar auseinanderfallen (Regressionsfall CH0024666528: SIX «Centiel
    N», GLEIF noch «HOCHDORF Holding AG») — gemeldet statt aufgelöst, weil
    keine der beiden Quellen hier für sich entscheiden kann."""
    from . import gleif as gleif_module
    six = fetch_six_titles(six_fetcher)
    existing = load_csv(path) if path.exists() else []
    known_isins = {r["isin"].strip() for r in existing if r.get("isin", "").strip()}

    groups = group_six_titles(six["titles"])
    new_rows: list[dict] = []
    report: dict = {
        "retrievedAt": six["retrievedAt"],
        "totalTitles": len(six["titles"]),
        "totalCompanies": len(groups),
        "alreadyKnown": 0,
        "matched": [], "ambiguous": [], "unmatched": [], "errors": [],
        "fromGleif": [], "fromLindas": [], "nameMismatch": [], "abroad": [],
    }

    for group in groups:
        primary = group["primary"]
        if primary["isin"] in known_isins:
            report["alreadyKnown"] += 1
            continue

        # Erster Versuch: GLEIF über die ISIN. Nur wenn GLEIF die ISIN nicht
        # kennt, greift der Namensabgleich als Rückfall — nie umgekehrt, und
        # nie beide vermischt: eine ISIN ist eindeutig, ein Kurzname nicht.
        gleif_record = None
        try:
            gleif_record = gleif_module.resolve(primary["isin"], gleif_fetcher)
        except Exception as exc:  # noqa: BLE001 — wie beim LINDAS-Zweig unten
            report["errors"].append({"key": group["key"], "error": f"GLEIF: {exc}"})
            if on_progress:
                on_progress(f"ERROR (GLEIF) {group['key']}: {exc}")
            continue

        if gleif_record is not None:
            try:
                place = gleif_module.seat(gleif_record)
            except ValueError as exc:
                report["abroad"].append({"key": group["key"], "isin": primary["isin"],
                                         "name": gleif_record["name"], "error": str(exc)})
                if on_progress:
                    on_progress(f"AUSLAND {group['key']}: {exc}")
                place = None

            if place is not None:
                row = {c: "" for c in CSV_COLUMNS}
                row.update({
                    "uid": gleif_record["uid"], "lei": gleif_record["lei"],
                    "name": gleif_record["name"], "six_symbol": primary["sixSymbol"],
                    "isin": primary["isin"], "researched": "no",
                    "street": place["street"], "zip": place["zip"],
                    "city": place["city"], "seat_basis": place["basis"],
                    "geocode_query": f"{place['street']}, {place['zip']} {place['city']}",
                    "org_form": "boersenkotiert",
                })
                new_rows.append(row)
                report["fromGleif"].append({
                    "key": group["key"], "isin": primary["isin"],
                    "name": gleif_record["name"], "city": place["city"],
                    "basis": place["basis"],
                })
                # SIX-Kurzname gegen GLEIF-Firmenname: fällt der Kern
                # auseinander, hinkt eine der beiden Quellen einer
                # Umbenennung nach. Melden, nicht auflösen.
                if not set(canonicalize(group["key"]).split()) & \
                        set(canonicalize(gleif_record["name"]).split()):
                    report["nameMismatch"].append({
                        "key": group["key"], "isin": primary["isin"],
                        "gleif": gleif_record["name"],
                    })
                    if on_progress:
                        on_progress(f"NAME? {group['key']} vs GLEIF {gleif_record['name']!r}")
                if on_progress:
                    on_progress(f"GLEIF ({place['basis']}) {group['key']} -> "
                                f"{gleif_record['name']} ({place['city']})")
                continue

        try:
            outcome = find_seat(group["key"], lindas_fetcher)
        except Exception as exc:  # noqa: BLE001 — siehe Docstring unten
            # Ein anhaltender Netzwerkfehler bei EINER Firma (nach den
            # Wiederholungen in `_lindas_get`) soll nicht die bereits
            # gefundenen Sitze aller vorherigen Firmen dieses Laufs
            # verwerfen. Die Zeile bleibt aus — ihre ISIN ist noch nicht in
            # `known_isins`, ein erneuter `companies-sync`-Lauf greift sie
            # wieder auf.
            report.setdefault("errors", []).append({"key": group["key"], "error": str(exc)})
            if on_progress:
                on_progress(f"ERROR {group['key']}: {exc}")
            continue

        row = {c: "" for c in CSV_COLUMNS}
        row["name"] = group["key"].title()
        row["six_symbol"] = primary["sixSymbol"]
        row["isin"] = primary["isin"]
        row["researched"] = "no"
        row["org_form"] = "boersenkotiert"

        if outcome["status"] == "matched":
            m = outcome["match"]
            row["uid"] = uid_from_company_uri(m["company"]) or ""
            row["name"] = m["name"]
            street = _clean_street(m["street"])
            row["street"] = street
            row["zip"] = m["zip"]
            row["city"] = m["city"]
            # Komma zwischen Strasse und PLZ/Ort: swisstopos SearchServer
            # findet damit auch Gebäude, deren Zefix-PLZ eine reine
            # Postfach-/Sammel-PLZ ist statt der geografischen (siehe
            # `geocode.fill_missing`, Kommentar zu Swisscom/"3050 Bern").
            row["geocode_query"] = f"{street}, {m['zip']} {m['city']}"
            # Rechtssitz aus dem Handelsregister — anders als bei GLEIF gibt
            # es hier keinen operativen Hauptsitz zur Auswahl, und die
            # Herkunft der Adresse steht in der Zeile, statt geraten werden
            # zu müssen.
            row["seat_basis"] = "zefix"
            report["matched"].append({
                "key": group["key"], "isin": primary["isin"], "name": m["name"],
                "city": m["city"], "confidence": outcome["confidence"],
            })
            report["fromLindas"].append({"key": group["key"], "name": m["name"]})
            if on_progress:
                on_progress(f"MATCHED ({outcome['confidence']}) {group['key']} -> "
                            f"{m['name']} ({m['city']})")
        elif outcome["status"] == "ambiguous":
            report["ambiguous"].append({
                "key": group["key"], "isin": primary["isin"],
                "candidates": [f"{c['name']} ({c['city']})" for c in outcome["candidates"]],
            })
            if on_progress:
                on_progress(f"AMBIGUOUS {group['key']}: "
                            f"{[c['name'] for c in outcome['candidates']]}")
        else:
            report["unmatched"].append({"key": group["key"], "isin": primary["isin"]})
            if on_progress:
                on_progress(f"UNMATCHED {group['key']}")

        new_rows.append(row)

    all_rows = existing + new_rows
    write_csv(path, all_rows)

    report["added"] = len(new_rows)

    # Geteilte Sitzadressen unter den NEUEN Zeilen — mehrere Gesellschaften
    # am selben Ort ist real (Fiduzniäradressen, Konzern-Geschwister) und
    # kein Fehler, aber meldenswert statt stillschweigend übernommen.
    by_address: dict[tuple, list[str]] = {}
    for row in new_rows:
        if row["street"] and row["city"]:
            by_address.setdefault((row["street"], row["zip"], row["city"]), []).append(row["name"])
    report["sharedAddresses"] = {
        f"{addr[0]}, {addr[1]} {addr[2]}": names
        for addr, names in by_address.items() if len(names) > 1
    }

    return report


def retry_unmatched_rows(
    rows: list[dict], lindas_fetcher: Fetcher | None = None,
    on_progress: Callable[[str], None] | None = None,
) -> dict:
    """Versucht `find_seat()` erneut für Zeilen, die `sync_national_csv()`
    bisher nicht platzieren konnte (`researched=no`, kein `city`) — für
    Nachbesserungen am Matcher (neues Token-Mapping, neue Umlaut-Regel),
    ohne die gesamte SIX-Liste erneut abzugleichen und dabei bereits
    gefundene Sitze unnötig ein zweites Mal abzufragen.

    Mutiert `rows` in place (wie `geocode.fill_missing`); der Aufrufer
    persistiert die CSV danach selbst. Der Name einer bislang unmatched
    Zeile ist `company_key(...).title()` (siehe `sync_national_csv`) — für
    die erneute Suche wird er mit `.upper()` in einen Schlüssel
    zurückverwandelt, ein verlustfreier Rundweg für reine ASCII-Grossnamen.
    """
    report: dict = {"matched": [], "still_unmatched": [], "ambiguous": [], "errors": []}
    for row in rows:
        if row.get("researched") != "no" or row.get("city"):
            continue
        key = row["name"].upper()
        try:
            outcome = find_seat(key, lindas_fetcher)
        except Exception as exc:  # noqa: BLE001 — wie in sync_national_csv
            report["errors"].append({"key": key, "error": str(exc)})
            if on_progress:
                on_progress(f"ERROR {key}: {exc}")
            continue
        if outcome["status"] == "matched":
            m = outcome["match"]
            row["uid"] = uid_from_company_uri(m["company"]) or ""
            row["name"] = m["name"]
            row["street"] = m["street"]
            row["zip"] = m["zip"]
            row["city"] = m["city"]
            row["geocode_query"] = f"{m['street']}, {m['zip']} {m['city']}"
            report["matched"].append({
                "key": key, "isin": row["isin"], "name": m["name"],
                "city": m["city"], "confidence": outcome["confidence"],
            })
            if on_progress:
                on_progress(f"MATCHED ({outcome['confidence']}) {key} -> {m['name']} ({m['city']})")
        elif outcome["status"] == "ambiguous":
            report["ambiguous"].append({"key": key, "isin": row["isin"]})
            if on_progress:
                on_progress(f"still AMBIGUOUS {key}")
        else:
            report["still_unmatched"].append({"key": key, "isin": row["isin"]})
            if on_progress:
                on_progress(f"still UNMATCHED {key}")
    return report
