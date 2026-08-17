"""Downloads mit inhaltsgeprüftem Cache und Auflösung der BFS-Asset-IDs."""

from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from collections.abc import Callable
from pathlib import Path

from . import config

Fetcher = Callable[[str], bytes]

_MANIFEST_NAME = "manifest.json"


def _http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def manifest_path(directory: Path | None = None) -> Path:
    return (directory or config.DATA_RAW) / _MANIFEST_NAME


def _load_manifest(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def download(
    url: str, dest: Path, *, force: bool = False, fetcher: Fetcher | None = None
) -> Path:
    """Lädt `url` nach `dest`, sofern nicht bereits identisch vorhanden."""
    get = fetcher or _http_get
    dest.parent.mkdir(parents=True, exist_ok=True)
    mpath = manifest_path(dest.parent)
    manifest = _load_manifest(mpath)

    entry = manifest.get(url)
    if entry and dest.exists() and not force:
        if hashlib.sha256(dest.read_bytes()).hexdigest() == entry["sha256"]:
            return dest

    payload = get(url)
    dest.write_bytes(payload)
    manifest[url] = {
        "sha256": hashlib.sha256(payload).hexdigest(),
        "bytes": len(payload),
        "path": dest.name,
    }
    mpath.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return dest


def _asset_list(model_url: str, get: Fetcher) -> list[dict]:
    model = json.loads(get(model_url))
    for key in ("compiledListAsJson", "assetListAsJson"):
        raw = model.get(key)
        if raw:
            return json.loads(raw).get("list", [])
    raise LookupError(
        f"Keine Asset-Liste in {model_url}; vorhandene Schlüssel: {sorted(model)}"
    )


def resolve_asset_url(
    model_url: str, title_pattern: str, fetcher: Fetcher | None = None
) -> str:
    """Sucht in der AEM-Modell-Antwort den Eintrag, dessen Titel `title_pattern` trifft."""
    get = fetcher or _http_get
    entries = _asset_list(model_url, get)
    pattern = re.compile(title_pattern)
    hits = [e for e in entries if pattern.search(e.get("title", ""))]

    if not hits:
        titles = "\n  ".join(e.get("title", "") for e in entries)
        raise LookupError(
            f"Kein Asset passt auf {title_pattern!r}. Vorhanden:\n  {titles}"
        )
    if len(hits) > 1:
        titles = ", ".join(e.get("title", "") for e in hits)
        raise LookupError(f"Muster {title_pattern!r} ist mehrdeutig: {titles}")

    return hits[0]["url"].rstrip("/") + "/master"


def statent_geodata_url(year: int, fetcher: Fetcher | None = None) -> str:
    return resolve_asset_url(
        f"{config.STATENT_MODEL_BASE}/{config.STATENT_GEODATA_TAB}.model.json",
        rf"Geodaten\s+{year}\b",
        fetcher,
    )


def statent_variables_url(fetcher: Fetcher | None = None) -> str:
    return resolve_asset_url(
        f"{config.STATENT_MODEL_BASE}/{config.STATENT_VARIABLES_TAB}.model.json",
        r"Variablenliste",
        fetcher,
    )


def swissboundaries_gpkg_url(fetcher: Fetcher | None = None) -> str:
    """Jüngstes STAC-Item, GeoPackage-Asset in LV95."""
    get = fetcher or _http_get
    url: str | None = f"{config.SWISSBOUNDARIES_STAC}?limit=100"
    features: list[dict] = []
    while url:
        page = json.loads(get(url))
        features.extend(page.get("features", []))
        nxt = [link["href"] for link in page.get("links", []) if link.get("rel") == "next"]
        url = nxt[0] if nxt else None

    if not features:
        raise LookupError("STAC lieferte keine swissBOUNDARIES3D-Items")

    newest = max(features, key=lambda f: f["id"])
    for name, asset in newest["assets"].items():
        if name.endswith(".gpkg.zip"):
            return asset["href"]

    raise LookupError(
        f"Item {newest['id']} hat kein .gpkg.zip-Asset; vorhanden: {sorted(newest['assets'])}"
    )
