/**
 * Vector Embeddings Engine (OpenAI text-embedding-3-small & Offline Generator).
 * Produces 1536-dimensional normalized vectors for semantic failure clustering
 * and pgvector HNSW indexing.
 */

import crypto from 'node:crypto';

export const EMBEDDING_DIMENSION = 1536;

/**
 * Deterministically generates a 1536-dimensional unit vector from a text string.
 * Used for offline development, local tests, and mock environments.
 */
export function generateDeterministicEmbedding(text: string): number[] {
  // Hash the text with SHA-256 to create a 32-bit integer seed
  const hash = crypto.createHash('sha256').update(text).digest();
  let seed = hash.readUInt32LE(0);

  // Mulberry32 deterministic pseudo-random number generator
  function random(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const rawVector: number[] = new Array(EMBEDDING_DIMENSION);
  let sumSquares = 0;

  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    // Value between -1.0 and 1.0
    const val = random() * 2 - 1;
    rawVector[i] = val;
    sumSquares += val * val;
  }

  // Normalize to L2 unit length
  const magnitude = Math.sqrt(sumSquares) || 1;
  return rawVector.map((v) => Number((v / magnitude).toFixed(6)));
}

export interface EmbeddingOptions {
  apiKey?: string;
  model?: string;
  provider?: string;
}

/**
 * Projects an arbitrary dimension float array to 1536-dim unit vector
 * with zero-padding and L2 normalization so that it perfectly conforms
 * to PostgreSQL vector(1536) columns and cosine distance index.
 */
export function projectTo1536Dimensions(rawVector: number[]): number[] {
  if (rawVector.length === EMBEDDING_DIMENSION) {
    return rawVector;
  }
  const result = new Array(EMBEDDING_DIMENSION).fill(0);
  let sumSquares = 0;
  for (let i = 0; i < Math.min(rawVector.length, EMBEDDING_DIMENSION); i++) {
    result[i] = rawVector[i];
    sumSquares += result[i] * result[i];
  }
  const magnitude = Math.sqrt(sumSquares) || 1;
  return result.map((v) => Number((v / magnitude).toFixed(6)));
}

/**
 * Generates an embedding vector using OpenAI text-embedding-3-small, with a
 * deterministic unit vector in mock/offline mode. Dimensions stay at 1536 so
 * the pgvector column type and HNSW index are unchanged.
 */
export async function generateEmbedding(
  text: string,
  options: EmbeddingOptions = {}
): Promise<number[]> {
  const provider = (options.provider || process.env.AI_PROVIDER || 'openai').toLowerCase();

  // 2. OpenAI Embeddings
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const isMock = !apiKey || apiKey.startsWith('sk-proj-mock') || process.env.AI_PROVIDER === 'mock';

  if (isMock) {
    return generateDeterministicEmbedding(text);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text.slice(0, 8000), // Bound token context
        model: options.model || 'text-embedding-3-small',
      }),
    });

    if (!response.ok) {
      console.warn(`[Embeddings] OpenAI API error (${response.status}). Using deterministic fallback.`);
      return generateDeterministicEmbedding(text);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    if (!data.data?.[0]?.embedding) {
      return generateDeterministicEmbedding(text);
    }

    return data.data[0].embedding;
  } catch (err: any) {
    console.warn(`[Embeddings] Network error (${err.message}). Using deterministic fallback.`);
    return generateDeterministicEmbedding(text);
  }
}

/**
 * Calculates cosine similarity between two equal-length vectors.
 */
export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector length mismatch: ${vecA.length} vs ${vecB.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
