"""Ansicht A: manuell gepflegtes CSV, maschinell erzwungene Quellenpflicht."""

from __future__ import annotations

import csv
import json
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path

from . import config
from .noga import NogaTable

CSV_COLUMNS = (
    "uid", "name", "six_symbol", "isin",
    "street", "zip", "city", "lon", "lat", "geocode_query",
    "noga_group",
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

# Unlike `revenue`, net profit attributable to shareholders (Reingewinn) is broadly
# comparable across an ordinary industrial company and a bank — both report a single,
# similarly-defined bottom line under Swiss GAAP FER/IFRS. `profit` therefore carries no
# `revenue_type`-style tag, only its own currency/unit (mirroring `revenue_currency`/
# `revenue_unit`) and the shared `report_url`/`fiscal_year` of the row.

Fetcher = Callable[[str], bytes]


def csv_path() -> Path:
    """Pfad zur Firmen-CSV des aktuell in `config.CANTON` gesetzten Kantons.

    Ein Kantonswechsel ändert nur `config.CANTON["code"]`; der Dateiname folgt
    automatisch. Diese Datei selbst bleibt aber Handarbeit (siehe `load_csv`),
    das ist der einzige Schritt, den ein Kantonswechsel nicht automatisieren kann.
    """
    return config.DATA_MANUAL / f"{config.CANTON['code'].lower()}_listed_companies.csv"


def load_csv(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(
            f"Firmen-CSV fehlt: {path}\n"
            f"Für einen Kantonswechsel ist das der einzige Schritt, der sich nicht "
            f"automatisch erzeugen lässt: Welche Unternehmen mit Sitz in "
            f"{config.CANTON['name']} ({config.CANTON['code']}) an der SIX kotiert "
            f"sind und was sie ausweisen, muss von Hand recherchiert und unter "
            f"diesem Pfad als CSV angelegt werden (Spalten wie in "
            f"data/manual/ag_listed_companies.csv, siehe README, Abschnitt "
            f"\"Kantonswechsel\")."
        )
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        actual = tuple(reader.fieldnames or ())
        if actual != CSV_COLUMNS:
            raise ValueError(
                f"Spalten weichen ab.\nErwartet: {CSV_COLUMNS}\nGefunden : {actual}"
            )
        return [dict(row) for row in reader]


def validate(rows: list[dict], table: NogaTable | None = None) -> None:
    from .noga import load_table

    table = table or load_table()
    valid_groups = {g.key for g in table.groups}
    problems: list[str] = []
    seen: dict[str, int] = {}

    for number, row in enumerate(rows, start=2):  # Zeile 1 ist der Kopf
        label = f"Zeile {number} ({row.get('name') or 'ohne Name'})"

        uid = row.get("uid", "").strip()
        if uid and uid in seen:
            problems.append(f"{label}: uid {uid} doppelt, schon in Zeile {seen[uid]}")
        elif uid:
            seen[uid] = number

        for field in ("lon", "lat"):
            if not row.get(field, "").strip():
                problems.append(f"{label}: {field} fehlt — zuerst geokodieren")

        group = row.get("noga_group", "").strip()
        if group not in valid_groups:
            problems.append(
                f"{label}: noga_group {group!r} unbekannt, erlaubt: {sorted(valid_groups)}"
            )

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
        elif not row.get("note", "").strip():
            problems.append(
                f"{label}: revenue leer, dann muss note erklären warum"
            )

        # `profit` (Reingewinn) trägt keinen `revenue_type`-Tag (siehe Kommentar bei
        # REVENUE_TYPES oben — im Gegensatz zu Umsatz ist die Kennzahl branchenübergreifend
        # vergleichbar), braucht aber dieselbe Herkunftspflicht wie `revenue`: jede Zahl muss
        # auf eine Quelle zurückführbar sein, sonst liesse sich ein Gewinn ebenso unbemerkt
        # falsch skalieren oder einer falschen Periode zuordnen wie ein Umsatz ohne
        # `revenue_unit` (siehe Kommentar bei `test_validate_rejects_revenue_without_revenue_unit`).
        if row.get("profit", "").strip():
            for field in ("report_url", "fiscal_year", "profit_currency", "profit_unit"):
                if not row.get(field, "").strip():
                    problems.append(
                        f"{label}: profit gesetzt, aber {field} fehlt — "
                        "jede Zahl muss auf eine Quelle zurückführbar sein"
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


def build_artifact(rows: list[dict], table: NogaTable) -> dict:
    index = {g.key: i for i, g in enumerate(table.groups)}
    entries = []
    for row in rows:
        revenue = row.get("revenue", "").strip()
        unit = float(row.get("revenue_unit") or 1)
        profit = row.get("profit", "").strip()
        profit_unit = float(row.get("profit_unit") or 1)
        entries.append(
            {
                "uid": row["uid"],
                "name": row["name"],
                "sixSymbol": row.get("six_symbol") or None,
                "lon": float(row["lon"]),
                "lat": float(row["lat"]),
                "nogaGroupIndex": index[row["noga_group"]],
                "revenue": float(revenue) * unit if revenue else None,
                "currency": row.get("revenue_currency") or None,
                "revenueType": row.get("revenue_type") or None,
                "profit": float(profit) * profit_unit if profit else None,
                "profitCurrency": row.get("profit_currency") or None,
                "coreProducts": row.get("core_products") or None,
                "productsUrl": row.get("products_url") or None,
                "foundingYear": int(row["founding_year"]) if row.get("founding_year") else None,
                "employees": int(row["employees"]) if row.get("employees") else None,
                "fiscalYear": int(row["fiscal_year"]) if row.get("fiscal_year") else None,
                "reportUrl": row.get("report_url") or None,
                "note": row.get("note") or None,
                "placeholder": not revenue,
                "city": row.get("city") or None,
            }
        )

    revenues = [e["revenue"] for e in entries if e["revenue"] is not None]
    return {
        "canton": config.CANTON["code"],
        "companies": entries,
        "stats": {
            "count": len(entries),
            "withRevenue": len(revenues),
            "max": max(revenues) if revenues else 0.0,
        },
    }


def _sparql(query: str, fetcher: Fetcher | None = None) -> dict:
    get = fetcher or (
        lambda url: urllib.request.urlopen(
            urllib.request.Request(
                url,
                headers={
                    "User-Agent": config.USER_AGENT,
                    "Accept": "application/sparql-results+json",
                },
            ),
            timeout=120,
        ).read()
    )
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
