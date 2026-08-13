"""Geokodierung über die swisstopo-Suche, Ergebnis wird im CSV persistiert."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from collections.abc import Callable

from . import config

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


def fill_missing(rows: list[dict], fetcher: Fetcher | None = None) -> int:
    """Geokodiert nur Zeilen ohne Koordinaten — der Build bleibt reproduzierbar."""
    filled = 0
    for row in rows:
        if row.get("lon") and row.get("lat"):
            continue
        query = row.get("geocode_query") or " ".join(
            filter(None, [row.get("street"), row.get("zip"), row.get("city")])
        )
        lon, lat = geocode(query, fetcher)
        row["lon"] = _format_coord(lon)
        row["lat"] = _format_coord(lat)
        row["geocode_query"] = query
        filled += 1
    return filled
