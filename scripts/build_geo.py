"""Build data/geo/geo_key_map.csv from the committed GeoJSON + dim_geolocation.

Validates the Phase-0 contract: every mapped region has exactly one polygon
feature and vice versa. Run:  python scripts/build_geo.py
"""
import json
import sys
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
GEOJSON = ROOT / "data" / "geo" / "ph_regions.geojson"
WAREHOUSE = ROOT / "data" / "warehouse"
OUT = ROOT / "data" / "geo" / "geo_key_map.csv"

SHORT = {
    "Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)": "BARMM",
    "Cordillera Administrative Region (CAR)": "CAR",
    "MIMAROPA Region": "MIMAROPA",
    "National Capital Region (NCR)": "NCR",
    "Negros Island Region (NIR)": "NIR",
    "Region I (Ilocos Region)": "Region I",
    "Region II (Cagayan Valley)": "Region II",
    "Region III (Central Luzon)": "Region III",
    "Region IV-A (CALABARZON)": "Region IV-A",
    "Region V (Bicol Region)": "Region V",
    "Region VI (Western Visayas)": "Region VI",
    "Region VII (Central Visayas)": "Region VII",
    "Region VIII (Eastern Visayas)": "Region VIII",
    "Region IX (Zamboanga Peninsula)": "Region IX",
    "Region X (Northern Mindanao)": "Region X",
    "Region XI (Davao Region)": "Region XI",
    "Region XII (SOCCSKSARGEN)": "Region XII",
    "Region XIII (Caraga)": "Region XIII",
}


def main() -> None:
    gj = json.loads(GEOJSON.read_text(encoding="utf-8"))
    features = gj["features"]
    geo_ids = [f["properties"]["geolocation"] for f in features]

    con = duckdb.connect()
    wh = con.execute(
        "SELECT geolocation FROM read_parquet(?) WHERE geo_type = 'region' ORDER BY 1",
        [str(WAREHOUSE / "dim_geolocation.parquet")],
    ).df()["geolocation"].tolist()

    missing = sorted(set(wh) - set(geo_ids))
    extra = sorted(set(geo_ids) - set(wh))
    if missing or extra:
        print("crosswalk mismatch")
        print("  in warehouse, no polygon:", missing)
        print("  polygon, no warehouse row:", extra)
        sys.exit(1)

    rows = [
        {
            "geo_id": region,
            "psgc_code": "",  # PSGC codes are not committed in the warehouse; left blank
            "short_code": SHORT.get(region, region),
            "display_name": region,
            "has_polygon": True,
            "map_group": "region",
        }
        for region in sorted(geo_ids)
    ]
    df = pd.DataFrame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False)

    n_features = len(geo_ids)
    n_unique = len(set(geo_ids))
    assert n_features == n_unique, "duplicate polygon features"
    print(f"ok: {len(df)} mapped regions, one polygon each; wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
