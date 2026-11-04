import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateDeterministicEmbedding,
  generateEmbedding,
  computeCosineSimilarity,
  EMBEDDING_DIMENSION,
} from '../src/lib/ai/embeddings.js';

describe('Vector Embeddings & Semantic Search Engine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a 1536-dimensional unit vector deterministically', () => {
    const text = 'job:test|step:vitest|trace:AssertionError expected true to be false';
    const vec = generateDeterministicEmbedding(text);

    expect(vec.length).toBe(EMBEDDING_DIMENSION);
    expect(vec.length).toBe(1536);

    // Verify L2 unit norm: sum of squares ≈ 1.0
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 3);
  });

  it('produces identical embeddings for identical text (reproducibility)', () => {
    const text = 'Timeout of 30000ms exceeded in auth.spec.ts';
    const vec1 = generateDeterministicEmbedding(text);
    const vec2 = generateDeterministicEmbedding(text);

    expect(vec1).toEqual(vec2);
    expect(computeCosineSimilarity(vec1, vec2)).toBeCloseTo(1.0, 5);
  });

  it('produces distinct embeddings for different error patterns', () => {
    const vecJest = generateDeterministicEmbedding('FAIL jest: AssertionError in payment.spec.ts');
    const vecOom = generateDeterministicEmbedding('FATAL ERROR: JavaScript heap out of memory exit code 137');

    const similarity = computeCosineSimilarity(vecJest, vecOom);
    expect(similarity).toBeLessThan(0.9);
  });

  it('calculates cosine similarity correctly for orthogonal and inverse vectors', () => {
    const vecA = [1, 0, 0];
    const vecB = [0, 1, 0];
    const vecC = [-1, 0, 0];

    expect(computeCosineSimilarity(vecA, vecA)).toBeCloseTo(1.0, 5);
    expect(computeCosineSimilarity(vecA, vecB)).toBeCloseTo(0.0, 5);
    expect(computeCosineSimilarity(vecA, vecC)).toBeCloseTo(-1.0, 5);

    expect(() => computeCosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vector length mismatch');
  });

  it('generates embedding via live API mock response when OpenAI key is supplied', async () => {
    const fakeEmbedding = new Array(1536).fill(0.025);
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('openai.com/v1/embeddings')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ embedding: fakeEmbedding }],
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    try {
      // Temporarily override AI_PROVIDER to simulate live key
      const prevProvider = process.env.AI_PROVIDER;
      process.env.AI_PROVIDER = 'live';

      const embedding = await generateEmbedding('TypeError in user.ts', {
        apiKey: 'sk-proj-live-valid-key-for-test',
      });

      expect(embedding.length).toBe(1536);
      expect(embedding[0]).toBe(0.025);

      process.env.AI_PROVIDER = prevProvider;
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('falls back gracefully to deterministic embedding when OpenAI API fails', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      };
    });

    try {
      const prevProvider = process.env.AI_PROVIDER;
      process.env.AI_PROVIDER = 'live';

      const embedding = await generateEmbedding('SyntaxError in app.ts', {
        apiKey: 'sk-proj-live-key',
      });

      expect(embedding.length).toBe(1536);

      process.env.AI_PROVIDER = prevProvider;
    } finally {
      global.fetch = originalFetch;
    }
  });
});
