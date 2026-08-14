"""Zentrale Konstanten. Ein Kantonswechsel geschieht ausschliesslich hier."""

from pathlib import Path

CANTON = {"code": "AG", "bfs_nr": 19, "name": "Aargau"}
STATENT_YEAR = 2023

# ROOT = Repo-Wurzel: config.py -> draufsicht_etl -> src -> etl -> ROOT
ROOT = Path(__file__).resolve().parents[3]

DATA_RAW = ROOT / "data" / "raw"
DATA_INTERIM = ROOT / "data" / "interim"
DATA_MANUAL = ROOT / "data" / "manual"
PUBLIC_DATA = ROOT / "public" / "data"
ETL_DIR = ROOT / "etl"

USER_AGENT = "draufsicht-etl/0.1 (+https://github.com/sevi/draufsicht)"

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

SRC_LV95 = "EPSG:2056"
DST_WGS84 = "EPSG:4326"
HECTARE_SIZE_M = 100.0
HECTARE_CENTER_OFFSET_M = HECTARE_SIZE_M / 2.0

FLAG_AMBIGUOUS = 1
AMBIGUOUS_VALUE = 4
NOGA_UNKNOWN_INDEX = 255
UNKNOWN_COLOR_HEX = "#BFBFBF"

MAX_PUBLIC_DATA_BYTES = 2 * 1024 * 1024

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
MAX_BOUNDARIES_BYTES = 600 * 1024

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
