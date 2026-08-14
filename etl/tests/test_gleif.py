"""GLEIF: ISIN -> Rechtstraeger.

Warum diese Quelle den Namensabgleich ersetzt, steht in `gleif.py`s
Moduldokumentation. Hier stehen die Faelle, an denen sich das entscheidet.
"""

import json

import pytest

from draufsicht_etl import gleif


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path, monkeypatch):
    """Jeder Test bekommt ein eigenes Cache-Verzeichnis.

    Ohne das schreibt `resolve()` seine Antworten in das echte
    `data/raw/gleif/` des Repos — beim ersten Lauf unbemerkt, danach mit zwei
    Folgen: die Testdaten liegen im Arbeitsverzeichnis, und ein anderer Test
    (`test_sync_national_csv`, dieselbe Beispiel-ISIN) zog seine Antwort aus
    diesem Cache statt aus seinem eigenen Fetcher — er war nur deshalb grün.
    """
    monkeypatch.setattr(gleif.config, "DATA_RAW", tmp_path)


def _record(name="Muster Holding AG", uid="CHE-123.456.789",
            legal_city="Zug", hq_city="Zug", hq_present=True, status="ACTIVE"):
    entity = {
        "legalName": {"name": name},
        "registeredAs": uid,
        "status": status,
        "legalAddress": {
            "addressLines": ["Musterstrasse 1"], "postalCode": "6300",
            "city": legal_city, "country": "CH",
        },
    }
    if hq_present:
        entity["headquartersAddress"] = {
            "addressLines": ["Hauptsitzweg 2"], "postalCode": "6340",
            "city": hq_city, "country": "CH",
        }
    return json.dumps({"data": [{"attributes": {"lei": "5493000LKVGOO9PELI61",
                                                "entity": entity}}]}).encode()


def test_resolve_reads_name_uid_and_both_addresses():
    rec = gleif.resolve("CH0000000001", fetcher=lambda _: _record())
    assert rec["name"] == "Muster Holding AG"
    assert rec["uid"] == "CHE-123.456.789"
    assert rec["lei"] == "5493000LKVGOO9PELI61"
    assert rec["legal"]["city"] == "Zug"
    assert rec["hq"]["city"] == "Zug"


def test_resolve_returns_none_when_gleif_knows_no_such_isin():
    empty = json.dumps({"data": []}).encode()
    assert gleif.resolve("CH0000000002", fetcher=lambda _: empty) is None


def test_seat_prefers_the_operating_headquarters():
    # Auftrag des Nutzers (14. August 2026): "Zeige die Saeule wo der
    # operative Hauptsitz liegt." Logitech ist in Hautemorges eingetragen,
    # sitzt aber in Lausanne — die Saeule gehoert nach Lausanne.
    rec = gleif.resolve("CH0000000003",
                        fetcher=lambda _: _record(legal_city="Hautemorges",
                                                  hq_city="Lausanne"))
    seat = gleif.seat(rec)
    assert seat["city"] == "Lausanne"
    assert seat["basis"] == "hq"


def test_seat_falls_back_to_the_legal_address_when_no_headquarters_is_given():
    rec = gleif.resolve("CH0000000004",
                        fetcher=lambda _: _record(hq_present=False))
    seat = gleif.seat(rec)
    assert seat["city"] == "Zug"
    assert seat["basis"] == "legal"


def test_seat_falls_back_when_the_headquarters_entry_has_no_city():
    # Ein vorhandenes, aber leeres Feld ist kein Hauptsitz — sonst landete
    # die Saeule bei einer Firma ohne Ortsangabe im Nichts.
    payload = json.loads(_record().decode())
    payload["data"][0]["attributes"]["entity"]["headquartersAddress"]["city"] = ""
    rec = gleif.resolve("CH0000000005",
                        fetcher=lambda _: json.dumps(payload).encode())
    assert gleif.seat(rec)["basis"] == "legal"


def test_resolve_caches_so_a_second_build_makes_no_request(tmp_path, monkeypatch):
    monkeypatch.setattr(gleif.config, "DATA_RAW", tmp_path)
    calls = []

    def fetcher(url):
        calls.append(url)
        return _record()

    first = gleif.resolve("CH0000000006", fetcher=fetcher)
    second = gleif.resolve("CH0000000006", fetcher=fetcher)
    assert first == second
    assert len(calls) == 1, "zweiter Aufruf muss aus dem Cache kommen"


def test_resolve_rejects_a_non_swiss_seat():
    # Eine CH-ISIN sagt nichts ueber das Domizil. Ein auslaendischer Sitz
    # gehoert nicht auf eine Schweizer Karte platziert, sondern gemeldet.
    payload = json.loads(_record().decode())
    for key in ("legalAddress", "headquartersAddress"):
        payload["data"][0]["attributes"]["entity"][key]["country"] = "DE"
    rec = gleif.resolve("CH0000000007",
                        fetcher=lambda _: json.dumps(payload).encode())
    with pytest.raises(ValueError, match="DE"):
        gleif.seat(rec)
