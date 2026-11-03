import { describe, it, expect } from 'vitest';
import { computeFailureSignature } from '../src/lib/parser/fingerprinter.js';

describe('Failure Fingerprinter & Normalizer (Cloud Moat)', () => {
  it('should generate identical SHA-256 hash despite different line numbers or memory addresses', () => {
    const log1 = `AssertionError: at auth.ts:142:18 [pointer 0x7ffd98ab12] duration 4500ms uuid 123e4567-e89b-12d3-a456-426614174000`;
    const log2 = `AssertionError: at auth.ts:199:25 [pointer 0x55ff11cc33] duration 2100ms uuid 987fcdeb-51a2-43d7-9012-3456789abcde`;

    const sig1 = computeFailureSignature('unit-tests', 'run tests', 'auth.spec.ts', log1);
    const sig2 = computeFailureSignature('unit-tests', 'run tests', 'auth.spec.ts', log2);

    expect(sig1.signatureHash).toBe(sig2.signatureHash);
    expect(sig1.normalizedTemplate).toBe(sig2.normalizedTemplate);
  });

  it('should produce 64-character hex SHA-256 strings', () => {
    const sig = computeFailureSignature('job', 'step', 'test', 'Error: connection timed out');
    expect(sig.signatureHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
