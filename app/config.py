"""Central runtime settings (single source for limits and data vintage)."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    root: Path = Path(__file__).resolve().parents[1]
    max_rows: int = 1000
    fit_concurrency: int = 2
    data_vintage: str = "2026-11-05"

    @property
    def warehouse(self) -> Path:
        return self.root / "data" / "warehouse"

    @property
    def models(self) -> Path:
        return self.root / "data" / "models"


settings = Settings()
