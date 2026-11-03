import { describe, it, expect } from 'vitest';
import { scrubSecrets } from '../src/lib/parser/secret-scrubber.js';

describe('Secret Scrubber (Zero-Leakage Assurance)', () => {
  it('should scrub GitHub personal access tokens', () => {
    const raw = 'Failed to clone with token: ghp_1234567890abcdefghijklmnopqrstuvwxyzAB';
    const scrubbed = scrubSecrets(raw);
    expect(scrubbed).not.toContain('ghp_1234567890');
    expect(scrubbed).toContain('[REDACTED_GITHUB_TOKEN]');
  });

  it('should scrub OpenAI and Anthropic API keys', () => {
    const raw = 'OpenAI: sk-abcdefghijklmnopqrstuvwxyz1234 Anthropic: sk-ant-api03-abcdefghijklmnop';
    const scrubbed = scrubSecrets(raw);
    expect(scrubbed).not.toContain('sk-abcdef');
    expect(scrubbed).not.toContain('sk-ant-api03');
    expect(scrubbed).toContain('[REDACTED_API_KEY]');
    expect(scrubbed).toContain('[REDACTED_ANTHROPIC_KEY]');
  });

  it('should scrub AWS keys and Bearer JWTs', () => {
    const raw = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE and auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-zheader';
    const scrubbed = scrubSecrets(raw);
    expect(scrubbed).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(scrubbed).not.toContain('eyJhbGciOiJI');
    expect(scrubbed).toContain('[REDACTED_AWS_KEY]');
    expect(scrubbed).toContain('Bearer [REDACTED_JWT]');
  });

  it('should scrub database connection URIs with embedded passwords', () => {
    const raw = 'Connecting to postgresql://admin:SuperSecret123@db.supabase.co:5432/mydb';
    const scrubbed = scrubSecrets(raw);
    expect(scrubbed).not.toContain('SuperSecret123');
    expect(scrubbed).toContain('postgresql://[REDACTED_DB_URI]');
  });

  it('should scrub RSA private key blocks', () => {
    const raw = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0mockdata1234567890abcdef
-----END RSA PRIVATE KEY-----`;
    const scrubbed = scrubSecrets(raw);
    expect(scrubbed).not.toContain('mockdata1234567890');
    expect(scrubbed).toContain('[REDACTED_PRIVATE_KEY]');
  });
});
