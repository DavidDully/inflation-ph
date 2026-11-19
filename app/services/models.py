"""Persisted model artifacts, read once and cached."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "data" / "models"
GEO = ROOT / "data" / "geo"


def _read(name: str) -> pd.DataFrame:
    path = MODELS / name
    return pd.read_parquet(path) if path.exists() else pd.DataFrame()


METRICS = json.loads((MODELS / "metrics.json").read_text()) if (MODELS / "metrics.json").exists() else {}
ROC = _read("roc_curve.parquet")
PR = _read("pr_curve.parquet")
CLF = _read("clf_test.parquet")
SHAP = _read("shap_values.parquet")
FEATURES = _read("feature_importance.parquet")
PCA = _read("pca_regions.parquet")
FORECAST = _read("forecast_national.parquet")
BACKTEST = _read("backtest.parquet")

WEIGHTS = pd.read_csv(ROOT / "data" / "cpi_weights_2018base_clean.csv")
GEOJSON_TEXT = (GEO / "ph_regions.geojson").read_text(encoding="utf-8")
GEO_KEY = pd.read_csv(GEO / "geo_key_map.csv")


def local_shap(region: str, date: str) -> list[dict]:
    """Stored per-row SHAP contributions for one region-month (≤ 12 features)."""
    if SHAP.empty:
        return []
    df = SHAP[(SHAP["geolocation"] == region) &
              (pd.to_datetime(SHAP["date"]) == pd.Timestamp(date))]
    if df.empty:
        return []
    df = df.sort_values("shap_value", key=lambda s: s.abs(), ascending=False)
    return [{"feature": r.feature, "value": float(r.feature_value),
             "contribution": float(r.shap_value)} for r in df.itertuples()]


def classifier_metrics(threshold: float) -> dict:
    if CLF.empty:
        return {}
    pred = (CLF["proba"] >= threshold).astype(int)
    tp = int(((pred == 1) & (CLF["y_true"] == 1)).sum())
    fp = int(((pred == 1) & (CLF["y_true"] == 0)).sum())
    fn = int(((pred == 0) & (CLF["y_true"] == 1)).sum())
    tn = int(((pred == 0) & (CLF["y_true"] == 0)).sum())
    return {
        "threshold": threshold,
        "precision": tp / (tp + fp) if tp + fp else 0.0,
        "recall": tp / (tp + fn) if tp + fn else 0.0,
        "specificity": tn / (tn + fp) if tn + fp else 0.0,
        "accuracy": (tp + tn) / len(CLF),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn, "n": len(CLF),
    }
