"""DuckDB access with a strict pre-aggregation guard.

Every SQL panel lives in app/sql/<panel_id>.sql and is executed with bound
parameters. Responses are capped at 999 rows (compliance 2.5).
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field, replace
from pathlib import Path
from threading import Lock

import duckdb

from app.config import settings

ROOT = Path(__file__).resolve().parents[1]
SQL_DIR = Path(__file__).parent / "sql"
WAREHOUSE = ROOT / "data" / "warehouse"

MAX_ROWS = settings.max_rows
DATA_VINTAGE = settings.data_vintage

VIEWS = {
    "fact_cpi": "fact_cpi/*/*.parquet",
    "fact_inflation": "fact_inflation/*/*.parquet",
    "fact_core": "fact_core/*/*.parquet",
    "fact_cpi_history": "fact_cpi_history.parquet",
    "dim_date": "dim_date.parquet",
    "dim_geolocation": "dim_geolocation.parquet",
    "dim_commodity": "dim_commodity.parquet",
    "feat_region_month": "feat_region_month.parquet",
}

_con: duckdb.DuckDBPyConnection | None = None
_lock = Lock()
# shortcut: memo never expires, assumes the parquet warehouse is static while the app runs; call clear_cache() after a data refresh.
_cache: dict[tuple, "QueryResult"] = {}
_CACHE_MAX = 512  # params come from query strings, so bound the memo


def clear_cache() -> None:
    with _lock:
        _cache.clear()


class AggregationLimitError(RuntimeError):
    def __init__(self, panel_id: str, n: int):
        super().__init__(f"panel {panel_id} returned {n} rows (limit {MAX_ROWS})")
        self.panel_id = panel_id
        self.n = n


@dataclass
class QueryResult:
    rows: list[dict]
    sql: str
    params: dict
    row_count: int
    elapsed_ms: int
    panel_id: str
    notes: list[str] = field(default_factory=list)
    cache: str = "miss"

    def meta(self, cache: str | None = None) -> dict:
        return {
            "panel_id": self.panel_id,
            "row_count": self.row_count,
            "elapsed_ms": self.elapsed_ms,
            "cache": cache or self.cache,
            "data_vintage": DATA_VINTAGE,
            "sql_ref": f"/api/sql/{self.panel_id}",
            "params": self.params,
            "notes": self.notes,
        }


def connect() -> duckdb.DuckDBPyConnection:
    global _con
    with _lock:
        if _con is None:
            con = duckdb.connect()
            con.execute("SET threads = 4")
            for name, rel in VIEWS.items():
                path = (WAREHOUSE / rel).as_posix()
                con.execute(
                    f"CREATE OR REPLACE VIEW {name} AS SELECT * FROM read_parquet('{path}')"
                )
            _con = con
    return _con


def sql_text(panel_id: str) -> str:
    path = SQL_DIR / f"{panel_id}.sql"
    if not path.exists():
        raise KeyError(panel_id)
    return path.read_text(encoding="utf-8")


def _json_safe(value):
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def _copy(res: QueryResult, cache: str) -> QueryResult:
    # callers mutate rows (e.g. /kpis), so never hand out the cached dicts
    return replace(res, rows=[dict(r) for r in res.rows], notes=list(res.notes), cache=cache)


def query(panel_id: str, params: list | None = None, *, max_rows: int = MAX_ROWS) -> QueryResult:
    key = (panel_id, tuple(params or []), max_rows)
    hit = _cache.get(key)
    if hit is not None:
        return _copy(hit, "hit")
    res = _run(panel_id, params, max_rows)
    with _lock:
        if len(_cache) >= _CACHE_MAX:
            _cache.clear()
        _cache[key] = res
    return _copy(res, "miss")


def _run(panel_id: str, params: list | None, max_rows: int) -> QueryResult:
    sql = sql_text(panel_id)
    con = connect()
    cursor = con.cursor()
    try:
        t0 = time.perf_counter()
        rel = cursor.execute(sql, params or [])
        cols = [d[0] for d in rel.description]
        rows = [dict(zip(cols, (_json_safe(v) for v in r))) for r in rel.fetchall()]
        elapsed = int((time.perf_counter() - t0) * 1000)
    finally:
        cursor.close()
    if len(rows) >= max_rows:
        raise AggregationLimitError(panel_id, len(rows))
    return QueryResult(rows=rows, sql=sql, params={"args": params or []},
                       row_count=len(rows), elapsed_ms=elapsed, panel_id=panel_id)
