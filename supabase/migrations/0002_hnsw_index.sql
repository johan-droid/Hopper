-- ==============================================================================
-- HOPPER HNSW VECTOR INDEX
-- Approximate nearest-neighbour search for cross-run failure clustering.
-- Run outside a transaction: CREATE INDEX CONCURRENTLY cannot be wrapped in one.
-- ==============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_failure_signatures_embedding_hnsw
ON failure_signatures USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
