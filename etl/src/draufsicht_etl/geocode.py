"""Geokodierung über die swisstopo-Suche, Ergebnis wird im CSV persistiert."""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from collections.abc import Callable

from . import config

# Zwischen zwei Geokodierungs-Anfragen, wenn `fill_missing()` mehrere Zeilen
# nachträgt (z.B. nach `companies-sync`, das bis zu ~190 neue Adressen ohne
# Koordinaten anlegen kann) — ein rücksichtsvoller Client hämmert nicht ohne
# Pause auf einen fremden, kostenlosen Dienst ein. 0 in Tests (siehe
# `fill_missing`s `delay`-Parameter).
DEFAULT_GEOCODE_DELAY_S = 0.2

Fetcher = Callable[[str], bytes]


def _http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def geocode(query: str, fetcher: Fetcher | None = None) -> tuple[float, float]:
    get = fetcher or _http_get
    params = urllib.parse.urlencode(
        {"searchText": query, "type": "locations", "sr": "4326", "limit": "1"}
    )
    payload = json.loads(get(f"{config.GEOCODE_URL}?{params}"))
    results = payload.get("results") or []
    if not results:
        raise LookupError(f"Geokodierung: kein Treffer für {query!r}")
    attrs = results[0]["attrs"]
    return float(attrs["lon"]), float(attrs["lat"])


def _format_coord(value: float) -> str:
    """6 Nachkommastellen, aber ohne Endnullen — `f"{v:.6f}"` allein liefert
    z.B. "8.044200" statt "8.0442" und macht den Wert unnötig unhandlich."""
    text = f"{value:.6f}".rstrip("0")
    return text + "0" if text.endswith(".") else text


def fill_missing(
    rows: list[dict],
    fetcher: Fetcher | None = None,
    delay: float = DEFAULT_GEOCODE_DELAY_S,
    on_failure: Callable[[dict, LookupError], None] | None = None,
) -> int:
    """Geokodiert nur Zeilen ohne Koordinaten — der Build bleibt reproduzierbar.

    Zeilen ohne jede Adresse (weder `geocode_query` noch street/zip/city —
    z.B. ein SIX-Titel, für den `companies-sync` keinen eindeutigen
    Zefix-Sitz fand) werden übersprungen statt mit einer leeren Suchanfrage
    an den Geokodierungsdienst geschickt: eine leere Anfrage kann nicht
    sinnvoll beantwortet werden, und ein Fehlschlag hier soll den ganzen
    Build nicht wegen eines Titels abbrechen, der ohnehin unplatziert bleibt
    (siehe `companies.build_artifact`, das Zeilen ohne Koordinaten überspringt).

    Ein `LookupError` (kein Treffer) für EINE Zeile bricht seit Phase 3 nicht
    mehr den gesamten Aufruf ab — bei bis zu ~120 nachzutragenden Adressen in
    einem Lauf (`companies-sync`-Nachlauf) würde ein einzelner Fehlschlag
    sonst die bereits erfolgreich geokodierten Zeilen davor verwerfen (nichts
    wird zwischendurch persistiert, siehe `cli.py`). Beobachteter Praxisfall:
    Swisscoms Zefix-Adresse trägt die postalische PLZ 3050 Bern (ein reines
    Postfach-/Sammel-PLZ), swisstopos Gebäudeadressverzeichnis kennt das
    Gebäude nur unter der geografischen PLZ 3048 Worblaufen — derselbe
    Query mit einem Komma zwischen Strasse und PLZ/Ort findet ihn trotzdem
    (fuzzy match), ohne Komma nicht; behoben in `companies.py`s
    `geocode_query`-Aufbau, aber ein Beleg, dass eine korrekte, offiziell
    gemeldete Adresse trotzdem an EINEM Dienst scheitern kann, ohne dass das
    ein Fehler im übrigen Datensatz ist. `on_failure` (optional) bekommt
    Zeile und Fehler, damit der Aufrufer den Fehlschlag melden und/oder die
    Adresse der Zeile zurücksetzen kann (siehe `cli.py`s `companies`-Schritt).
    """
    filled = 0
    for row in rows:
        if row.get("lon") and row.get("lat"):
            continue
        query = row.get("geocode_query") or " ".join(
            filter(None, [row.get("street"), row.get("zip"), row.get("city")])
        )
        if not query:
            continue
        try:
            lon, lat = geocode(query, fetcher)
        except LookupError as exc:
            if on_failure:
                on_failure(row, exc)
            continue
        row["lon"] = _format_coord(lon)
        row["lat"] = _format_coord(lat)
        row["geocode_query"] = query
        filled += 1
        if delay:
            time.sleep(delay)
    return filled
