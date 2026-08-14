"""Sitz je kotiertem Titel über GLEIF — ISIN statt Namensabgleich.

Bis zum 14. August 2026 suchte `companies.find_seat()` den Sitz einer
kotierten Gesellschaft über einen Namensabgleich gegen das Zefix-Handels-
register: SIX liefert einen Kurznamen («LINDT N»), Zefix führt Firmennamen,
und dazwischen lag eine Kette aus Rechtsform-Entfernung, Umlaut-
Transliteration, Abkürzungsauflösung und Konfidenzstufen. Diese Kette hat
funktioniert — aber sie kann nicht unterscheiden, was ein Name nicht
hergibt: Mutter- von Tochtergesellschaft, und beide vom zufälligen
Namensvetter. Gegen GLEIF geprüft lagen **28 von 130 Platzierungen auf der
falschen Rechtseinheit, 14 davon in einer anderen Gemeinde**. Unter «LINDT»
stand «Lindt Dessous-Moden GmbH» in Solothurn statt der Chocoladefabriken
Lindt & Sprüngli AG in Kilchberg; unter «ROCHE» die «Roche Sapac AG»;
unter «SCHINDLER» die «Schindler Aufzüge AG» statt der Schindler Holding AG.

GLEIF (Global Legal Entity Identifier Foundation) veröffentlicht genau die
Verbindung, die dem Namensabgleich fehlte: **ISIN → Rechtsträger**. Die ISIN
steht in der SIX-Titelliste, ist eindeutig und wird nicht interpretiert.
Der Datensatz liefert zusätzlich `registeredAs` — die Schweizer UID im
selben CHE-Format, das die acht handrecherchierten Zeilen schon tragen.

**Keine der beiden Quellen genügt allein.** GLEIF kann einer Umbenennung
nachhinken: für die ISIN CH0024666528 nennt SIX «Centiel N», GLEIF noch
«HOCHDORF Holding AG» (ein Börsenmantel nach Übernahme). Deshalb bleibt der
Firmenname aus der Recherche (Geschäftsbericht) die letzte Instanz, und der
`companies-sync` meldet Abweichungen zwischen SIX und GLEIF, statt sie
stillschweigend aufzulösen.

Für die ~10 Titel ohne GLEIF-Eintrag bleibt `companies.find_seat()` als
Rückfall bestehen — mit allen dort dokumentierten Vorsichtsmassnahmen.
"""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path

from . import config

Fetcher = Callable[[str], bytes]

ENDPOINT = "https://api.gleif.org/api/v1/lei-records"

# Zwischen zwei Abfragen — 202 Titel in Folge gegen einen fremden, kostenlos
# angebotenen Dienst; dieselbe Rücksicht wie in `geocode.py`.
REQUEST_DELAY_S = 0.35


def cache_dir() -> Path:
    return config.DATA_RAW / "gleif"


def _get(url: str, attempts: int = 3) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return urllib.request.urlopen(
                urllib.request.Request(
                    url,
                    headers={"User-Agent": config.USER_AGENT,
                             "Accept": "application/vnd.api+json"},
                ),
                timeout=60,
            ).read()
        except Exception as exc:  # noqa: BLE001 — wie companies._lindas_get
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2 * (attempt + 1))
    assert last_error is not None
    raise last_error


def _address(raw: dict | None) -> dict:
    raw = raw or {}
    return {
        "street": ", ".join(line for line in raw.get("addressLines", []) if line),
        "zip": raw.get("postalCode") or "",
        "city": raw.get("city") or "",
        "country": raw.get("country") or "",
    }


def resolve(isin: str, fetcher: Fetcher | None = None) -> dict | None:
    """Rechtsträger zu einer ISIN, oder `None`, wenn GLEIF die ISIN nicht
    kennt. Das Ergebnis wird unter `data/raw/gleif/<isin>.json` abgelegt:
    ein zweiter Build stellt keine einzige Anfrage mehr und liefert dasselbe
    Ergebnis — dieselbe Reproduzierbarkeits-Anforderung, an der der
    Namensabgleich zunächst gescheitert war (`LIMIT` ohne `ORDER BY`, siehe
    README «Reproduzierbarkeit»).

    Ein `None` wird mitgecacht (als `null`), sonst würde jeder Build die
    ~10 nicht auffindbaren Titel erneut abfragen."""
    path = cache_dir() / f"{isin}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    url = f"{ENDPOINT}?filter%5Bisin%5D={urllib.parse.quote(isin)}"
    payload = json.loads((fetcher or _get)(url).decode("utf-8"))
    data = payload.get("data") or []

    record: dict | None
    if not data:
        record = None
    else:
        attributes = data[0]["attributes"]
        entity = attributes["entity"]
        record = {
            "lei": attributes.get("lei") or "",
            "name": entity["legalName"]["name"],
            "uid": entity.get("registeredAs") or "",
            "status": entity.get("status") or "",
            "legal": _address(entity.get("legalAddress")),
            "hq": _address(entity.get("headquartersAddress")),
        }

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    return record


def seat(record: dict) -> dict:
    """Die Adresse, an der die Säule steht — **operativer Hauptsitz**, mit
    dem Rechtssitz als Rückfall.

    Ausdrücklicher Auftrag des Nutzers (14. August 2026): «Zeige die Säule wo
    der operative Hauptsitz liegt.» Bei 11 der 192 Gesellschaften fallen die
    beiden auseinander, und zwar dort, wo es sichtbar wird: Logitech ist in
    Hautemorges eingetragen (ein Dorf mit einigen hundert Einwohnern) und
    arbeitet in Lausanne; SGS ist in Genf eingetragen und führt den Konzern
    aus Baar; die Sandoz Group ist in Basel eingetragen und sitzt in
    Rotkreuz. Für eine Wirtschaftskarte ist der Ort, an dem gearbeitet wird,
    die ehrlichere Aussage als der Ort, an dem die Statuten liegen.

    `basis` hält im CSV fest, welche der beiden Adressen benutzt wurde — die
    Wahl bleibt damit nachvollziehbar und umkehrbar, ohne neu abzufragen."""
    hq = record.get("hq") or {}
    legal = record.get("legal") or {}
    chosen, basis = (hq, "hq") if hq.get("city") else (legal, "legal")

    country = chosen.get("country") or ""
    if country and country != "CH":
        # Eine CH-ISIN sagt, über welche Nummernstelle ein Titel begeben
        # wurde, nicht wo die Gesellschaft sitzt. Ein ausländischer Sitz
        # gehört gemeldet, nicht auf eine Schweizer Karte gezwungen.
        raise ValueError(
            f"Sitz ausserhalb der Schweiz ({country}): {record.get('name')!r} — "
            f"gehört nicht auf die Karte, sondern in den Bericht"
        )

    return {"street": chosen.get("street", ""), "zip": chosen.get("zip", ""),
            "city": chosen.get("city", ""), "basis": basis}
