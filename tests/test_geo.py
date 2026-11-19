"""Crosswalk contract: warehouse regions ↔ polygon features, one-to-one."""
import json
import sys
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / "data" / "geo" / "ph_regions.geojson"
WH = ROOT / "data" / "warehouse" / "dim_geolocation.parquet"
MAP = ROOT / "data" / "geo" / "geo_key_map.csv"


def main() -> None:
    features = json.loads(GEO.read_text(encoding="utf-8"))["features"]
    ids = [f["properties"]["geolocation"] for f in features]
    assert len(ids) == len(set(ids)), "duplicate polygon features"

    con = duckdb.connect()
    wh = con.execute(
        "SELECT geolocation FROM read_parquet(?) WHERE geo_type='region'", [str(WH)]
    ).df()["geolocation"].tolist()

    assert set(ids) == set(wh), (set(ids) ^ set(wh))
    cross = pd.read_csv(MAP)
    assert set(cross["geo_id"]) == set(ids)
    assert cross["has_polygon"].all()
    assert len(cross) == 18
    print("ok: 18 regions, one polygon each, crosswalk complete")


if __name__ == "__main__":
    main()
