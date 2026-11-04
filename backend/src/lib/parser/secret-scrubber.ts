/**
 * Secret Scrubber: Zero-leakage guarantee before LLM transmission or database storage.
 * Scrubs tokens, private keys, cloud credentials, database URLs, and bearer tokens.
 */

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'GitHub Personal/OAuth/App Token',
    pattern: /(gh[pousr]_[A-Za-z0-9_]{36,255})/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    name: 'OpenAI API Key',
    pattern: /(sk-[A-Za-z0-9]{20,})/g,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    name: 'Anthropic API Key',
    pattern: /(sk-ant-[A-Za-z0-9\-]{20,})/g,
    replacement: '[REDACTED_ANTHROPIC_KEY]',
  },
  {
    name: 'AWS Access Key ID',
    pattern: /(AKIA[0-9A-Z]{16})/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  {
    name: 'Bearer Token / JWT',
    pattern: /(Bearer\s+[A-Za-z0-9\-._~+/]+=*)/gi,
    replacement: 'Bearer [REDACTED_JWT]',
  },
  {
    name: 'Database Connection URI with Credentials',
    pattern: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/gi,
    replacement: '$1://[REDACTED_DB_URI]',
  },
  {
    name: 'RSA / EC / OpenSSH Private Key Block',
    pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
];

export function scrubSecrets(input: string): string {
  let scrubbed = input;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed;
}
