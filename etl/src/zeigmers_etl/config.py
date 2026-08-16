"""Zentrale Konstanten.

Seit der Ausweitung auf die ganze Schweiz (Phase 1, 2026-08-14) baut das ETL
IMMER alle 26 Kantone und alle Gemeinden — `CANTON` steuert das nicht mehr.
`CANTON` bedeutet seither nur noch: welcher Kanton der Startkanton ist, den
`meta.canton` dem Frontend mitgibt (gelesen in `src/karte/basis.ts`s
`loadMeta()`; in Ansicht «Beschäftigte», `src/karte/beschaeftigte.ts`, als
Vorbelegung für den Panel-Titel verwendet, siehe `src/ui/panel.ts`). Auf der
Karte selbst hebt `meta.canton` seit der Nationalisierung (Phase 3) keinen
Kanton mehr hervor — Ansicht «Börsennotierte Firmen» markiert keinen Kanton
mehr, Ansicht «Beschäftigte» markiert stattdessen den zuletzt betretenen
(`src/layers/cantons.ts`, `activeBfsNr`). Und unter welchem Pfad die
Firmen-CSV liegt (`companies.csv_path()`): das hängt seit Phase 3 ebenfalls
nicht mehr an `CANTON` — sie ist eine einzige nationale Datei (siehe
`companies.csv_path()`-Dokumentation). Ein Wechsel des Startkantons ändert an
den ETL-Artefakten nichts mehr ausser `meta.json`s `canton`-Feld — siehe
README, Abschnitt "Kantonswechsel".
"""

from pathlib import Path

CANTON = {"code": "AG", "bfs_nr": 19, "name": "Aargau"}
STATENT_YEAR = 2023

# Amtliche BFS-Kantonsnummerierung (1-26) -> zweistelliger Kantonscode. Fix und
# stabil seit Jahrzehnten (zuletzt durch den Kanton Jura 1979 belegt) — anders
# als Gemeindenummern ändert sich diese Zuordnung nicht durch Fusionen.
# swissBOUNDARIES3D führt in `tlm_kantonsgebiet` kein eigenes Code-Feld (nur
# `icc`, das für alle 26 Kantone "CH" trägt), deshalb hier als Konstante statt
# aus der Geometrie abgeleitet.
CANTON_CODES: dict[int, str] = {
    1: "ZH", 2: "BE", 3: "LU", 4: "UR", 5: "SZ", 6: "OW", 7: "NW", 8: "GL",
    9: "ZG", 10: "FR", 11: "SO", 12: "BS", 13: "BL", 14: "SH", 15: "AR",
    16: "AI", 17: "SG", 18: "GR", 19: "AG", 20: "TG", 21: "TI", 22: "VD",
    23: "VS", 24: "NE", 25: "GE", 26: "JU",
}

# ROOT = Repo-Wurzel: config.py -> zeigmers_etl -> src -> etl -> ROOT
ROOT = Path(__file__).resolve().parents[3]

DATA_RAW = ROOT / "data" / "raw"
DATA_INTERIM = ROOT / "data" / "interim"
DATA_MANUAL = ROOT / "data" / "manual"
PUBLIC_DATA = ROOT / "public" / "data"
ETL_DIR = ROOT / "etl"

# Die +URL im User-Agent ist Kontaktadresse für fremde Server (BFS, SIX,
# GLEIF, swisstopo) — sie muss erreichbar sein und bei einer Umbenennung
# des Repositorys mitgezogen werden, sonst zeigt sie ins Leere.
USER_AGENT = "zeigmers-etl/0.1 (+https://github.com/kokosevi/zeigmers)"

STATENT_MODEL_BASE = (
    "https://www.bfs.admin.ch/content/bfs/de/home/dienstleistungen/geostat/"
    "geodaten-bundesstatistik/arbeitsstaetten-beschaeftigung/"
    "statistik-unternehmensstruktur-statent-ab-2011/jcr:content/root/main/"
    "section/container/tabs"
)
STATENT_GEODATA_TAB = "item_3/compiledlist"
STATENT_VARIABLES_TAB = "item_2/ws_composed_list"

SWISSBOUNDARIES_STAC = (
    "https://data.geo.admin.ch/api/stac/v0.9/collections/"
    "ch.swisstopo.swissboundaries3d/items"
)
GEOCODE_URL = "https://api3.geo.admin.ch/rest/services/api/SearchServer"
LINDAS_SPARQL = "https://ld.admin.ch/query"

# Natural Earth 10m «lakes» — die einzige nicht-amtliche Quelle dieser Karte,
# siehe `lakes.py` für den Grund.
NATURAL_EARTH_LAKES = (
    "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip"
)

SRC_LV95 = "EPSG:2056"
DST_WGS84 = "EPSG:4326"
HECTARE_SIZE_M = 100.0
HECTARE_CENTER_OFFSET_M = HECTARE_SIZE_M / 2.0

FLAG_AMBIGUOUS = 1
AMBIGUOUS_VALUE = 4
NOGA_UNKNOWN_INDEX = 255
UNKNOWN_COLOR_HEX = "#BFBFBF"

# Bis Phase 1 (ein Kanton) galt ein einziges Gesamtbudget für `public/data/`.
# Mit 26 Kantonen ist eine Gesamtsumme das falsche Mass: `public/data/` trägt
# jetzt 26 Gemeinde-/Grenzen-Paare, aber die Karte lädt zu keinem Zeitpunkt
# mehr als zwei davon (die Übersicht beim Start, ein Kanton nach Klick) — die
# Summe über alle 26 sagt nichts über die tatsächliche Netzlast. Ersetzt durch
# zwei Budgets, die tatsächlich etwas laden:
#
# - MAX_STARTUP_BYTES: was beim Kartenstart lädt, bevor irgendein Kanton
#   aufgeklappt ist — `meta.json`, `ch_kantone.{bin,json,geojson}`,
#   `companies.json`. Gemessen ~520 KB (siehe ETL-Report); 800 KB lässt Luft
#   für künftige Jahrgänge/mehr Firmen, ohne beliebig grosszügig zu sein.
# - MAX_CANTON_PAYLOAD_BYTES: das grösste einzelne Kantons-Paar
#   (`<code>_gemeinde.{bin,json}` + `<code>_boundaries.geojson`), geladen erst
#   beim Wechsel in diesen Kanton. Bern (338 Gemeinden, grösster Kanton) ist
#   der Erwartungswert für den Extremfall — gemessen ~1.3 MB; 2 MB Budget
#   entspricht dem alten Gesamtbudget, jetzt aber pro Kanton statt einmalig
#   über alle 26.
MAX_STARTUP_BYTES = 800 * 1024
MAX_CANTON_PAYLOAD_BYTES = 2 * 1024 * 1024

# Gemeindegrenzen werden extrudiert (Ansicht B, Change 2) — grobe Vereinfachung
# zeigt an den Seitenwänden sichtbare Facetten. 300 KB (Toleranz 8 %, ~38
# Stützpunkte/Gemeinde im Schnitt) war für eine flache 2D-Karte gewählt und
# reichte dafür; für Extrusion ist mehr Detail nötig. 30 % Toleranz ergibt
# ~124 Stützpunkte/Gemeinde bei rund 460 KB — beides deutlich unter dem
# 2-MB-Gesamtbudget, das noch reichlich Luft lässt.
#
# Ehrlich gesagt: dieser Wert ist nach Byte-Budget gewählt (er nutzt einen
# grossen Teil der verfügbaren Reserve aus), nicht aus einer gemessenen
# Abweichung zur Originalgeometrie oder einer Bildkontrolle der extrudierten
# Flächen — dafür fehlte beim Umsetzungsschritt ein Browser. Wenn die Wände
# im Rendering noch sichtbar facettiert (oder umgekehrt: unnötig fein)
# wirken, ist dies die eine Stelle, an der zu drehen ist.
MUNICIPALITY_SIMPLIFY_PERCENT = 30.0

# Radius der Eckenrundung (`boundaries.round_municipality_corners`), in Metern
# auf der LV95-Geometrie. Klein relativ zu den Gemeindeflächen (1–26 km²)
# gewählt: bei 100 m verliert die kleinste betroffene Gemeinde ~6 % Fläche,
# im Schnitt ~1 %, und alle vier Exklaven-Gemeinden (Baden, Würenlos,
# Olsberg, Zurzach) behalten ihre Teile (siehe `_round_polygon`-Fallback für
# Teile, die schmaler als der Radius sind). Nur für Gemeinden, nicht Kantone.
MUNICIPALITY_ROUND_RADIUS_M = 100.0

# 600 KB (vor der Eckenrundung) -> 900 KB: die gerundete Geometrie braucht
# mehr Stützpunkte (jede Ecke wird durch einen kleinen Bogen ersetzt statt
# eines einzelnen Punkts). Gemessen bei `MUNICIPALITY_ROUND_RADIUS_M=100`:
# ~778 KB nach Simplify+Rundung — 900 KB lässt für künftige Jahrgänge noch
# Luft, ohne das 2-MB-Gesamtbudget (`MAX_PUBLIC_DATA_BYTES`) zu gefährden
# (aktuell ~1.05 MB über alle Artefakte, siehe ETL-Report).
MAX_BOUNDARIES_BYTES = 900 * 1024

# `MAX_BOUNDARIES_BYTES` (900 KB) ist auf Aargau (196 Gemeinden) kalibriert und
# bleibt `write_geojson()`s Standardwert — u.a. weil `test_boundaries.py` ihn
# gegen die echten AG-Daten prüft und AG dadurch unverändert bleibt (siehe
# ETL-Report, Abschnitt "Aargau byte-identisch"). Für den bevölkerungsreichsten
# Kanton reicht er nicht: Bern (334 Gemeinden nach Objektart-Filter, siehe
# `boundaries._MUNICIPALITY_OBJEKTART`) liegt bei dergleichen 30-%-Toleranz bei
# rund 1.4 MB — mehr Gemeinden bei ähnlicher Grenzlänge pro Gemeinde ergeben
# proportional mehr Stützpunkte. `cli.py` übergibt für den Pro-Kanton-Lauf
# deshalb dieses grössere Budget statt des AG-Standardwerts; `write_geojson()`s
# bestehende Rückfallschleife (Toleranz, halbe, viertel Toleranz) greift
# unverändert — bei Bern erst auf der dritten, gröbsten Stufe (7.5 %,
# gemessen ~1.41 MB). Das ist ein sichtbarer, aber offengelegter
# Qualitätsunterschied zu Aargau (siehe README) und bleibt weit unter dem
# 2-MB-Kanton-Paket-Budget (`MAX_CANTON_PAYLOAD_BYTES`).
MAX_MUNICIPALITY_BOUNDARIES_BYTES_PER_CANTON = 1_700_000

# Kantone bleiben flach (nur Basiskarten-Orientierung, keine Extrusion) — eine
# gröbere Vereinfachung fällt dort nicht als Facette auf. 7 % Toleranz ergibt
# ~14 100 Stützpunkte über alle 26 Kantone bei rund 260 KB.
CANTON_SIMPLIFY_PERCENT = 7.0
MAX_CANTONS_BYTES = 350 * 1024

COLUMN_PATTERNS = {
    "reli": r"^RELI$",
    "e_koord": r"^E_KOORD$",
    "n_koord": r"^N_KOORD$",
    "emp_total": r"^B(?P<nn>\d{2})EMPT$",
    "emp_div": r"^B(?P<nn>\d{2})(?P<div>\d{2})EMP$",
}
COLUMNS_DIR = ETL_DIR / "columns"

# Amtliche Gemeinde-Aggregation im selben ZIP, als unabhaengige Kontrollzahl.
STATENT_GMDE_MEMBER_PATTERN = r"STATENT_GMDE_\d{4}\.csv$"
# Bundesweite Datensaetze ohne belastbare Hektarlage, im selben ZIP.
STATENT_NOLOC_MEMBER_PATTERN = r"STATENT_NOLOC_\d{4}\.csv$"
