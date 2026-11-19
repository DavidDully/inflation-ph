-- PCA scores are precomputed offline in models/train_models.py and served from
-- data/models/pca_regions.parquet (18 regions × PC1/PC2/volatility).
-- This preview documents the derivation; no SQL is executed for this panel.

-- SELECT geolocation,
--        pc1, pc2, mean_inflation, latest_inflation, volatility
-- FROM read_parquet('data/models/pca_regions.parquet')
-- ORDER BY pc1;
