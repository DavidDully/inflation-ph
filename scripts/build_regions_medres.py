"""Rebuild ph_regions.geojson at higher resolution (medres) from
faeldon/philippines-json-maps, dissolved per PSA region.

Source: https://github.com/faeldon/philippines-json-maps (MIT), latest/geojson/
regions/medres/provdists-region-<PSGC>.0.01.json
"""
import json
import urllib.request
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "geo" / "raw_regions"
RAW.mkdir(parents=True, exist_ok=True)

BASE = ("https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/"
        "latest/geojson/regions/medres/provdists-region-{code}.0.01.json")

# PSGC region code -> warehouse geolocation label (18 mapped regions)
REGIONS = {
    "100000000": ("Region I (Ilocos Region)", "Region I"),
    "200000000": ("Region II (Cagayan Valley)", "Region II"),
    "300000000": ("Region III (Central Luzon)", "Region III"),
    "400000000": ("Region IV-A (CALABARZON)", "Region IV-A"),
    "500000000": ("Region V (Bicol Region)", "Region V"),
    "600000000": ("Region VI (Western Visayas)", "Region VI"),
    "700000000": ("Region VII (Central Visayas)", "Region VII"),
    "800000000": ("Region VIII (Eastern Visayas)", "Region VIII"),
    "900000000": ("Region IX (Zamboanga Peninsula)", "Region IX"),
    "1000000000": ("Region X (Northern Mindanao)", "Region X"),
    "1100000000": ("Region XI (Davao Region)", "Region XI"),
    "1200000000": ("Region XII (SOCCSKSARGEN)", "Region XII"),
    "1300000000": ("National Capital Region (NCR)", "NCR"),
    "1400000000": ("Cordillera Administrative Region (CAR)", "CAR"),
    "1600000000": ("Region XIII (Caraga)", "Region XIII"),
    "1700000000": ("MIMAROPA Region", "MIMAROPA"),
    "1800000000": ("Negros Island Region (NIR)", "NIR"),
    "1900000000": ("Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)", "BARMM"),
}


def fetch(code: str) -> dict:
    path = RAW / f"{code}.json"
    if not path.exists():
        with urllib.request.urlopen(BASE.format(code=code), timeout=60) as r:
            path.write_bytes(r.read())
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    feats = []
    for code, (name, short) in REGIONS.items():
        gj = fetch(code)
        geom = unary_union([shape(f["geometry"]) for f in gj["features"]])
        geom = geom.simplify(0.002, preserve_topology=True)
        feats.append({
            "type": "Feature",
            "properties": {"geolocation": name, "region_short": short, "psgc_code": code},
            "geometry": mapping(geom),
        })
    out = {"type": "FeatureCollection",
           "name": "ph_regions_medres",
           "features": feats}
    for target in [ROOT / "data" / "geo" / "ph_regions.geojson",
                   ROOT / "app" / "static" / "data" / "ph_regions.geojson"]:
        target.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
        print("wrote", target.relative_to(ROOT), f"{target.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
