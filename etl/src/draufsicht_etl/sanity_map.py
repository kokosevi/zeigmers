"""2D-Choroplethenkarte als Kontrolle, bevor irgendetwas in 3D gerendert wird."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from .aggregate import LevelData  # noqa: E402


def render(level: LevelData, municipalities: gpd.GeoDataFrame, out: Path) -> Path:
    assert level.gemeinde_idx is not None and level.gemeinden is not None
    lookup = {
        level.gemeinden[idx]["bfsNr"]: float(value)
        for idx, value in zip(level.gemeinde_idx, level.value, strict=True)
    }
    frame = municipalities.copy()
    frame["beschaeftigte"] = frame["bfs_nr"].map(lookup).fillna(0.0)

    fig, ax = plt.subplots(figsize=(10, 8), dpi=110)
    frame.plot(
        column="beschaeftigte",
        cmap="viridis",
        scheme=None,
        legend=True,
        edgecolor="white",
        linewidth=0.3,
        ax=ax,
        legend_kwds={"label": "Beschäftigte je Gemeinde", "shrink": 0.6},
    )
    ax.set_axis_off()
    ax.set_title(
        f"Kontrollkarte: {len(frame)} Gemeinden, "
        f"{frame['beschaeftigte'].sum():,.0f} Beschäftigte total"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)
    return out
