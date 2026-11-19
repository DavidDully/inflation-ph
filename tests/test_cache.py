from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: F401  (app.main calls connect())
from app import db


def test_query_memo_hits_and_returns_copies():
    db.clear_cache()
    first = db.query("kpis", ["2026-10-01"])
    assert first.meta()["cache"] == "miss"
    first.rows.append({"junk": 1})
    if first.rows[:-1]:
        first.rows[0]["headline"] = "mutated"
    second = db.query("kpis", ["2026-10-01"])
    assert second.meta()["cache"] == "hit"
    assert {"junk": 1} not in second.rows
    assert all(r.get("headline") != "mutated" for r in second.rows)
