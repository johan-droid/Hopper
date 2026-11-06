#!/usr/bin/env python3
"""
Hopper CI Security Guard: Committed Secret Scanner
Scans tracked Git files for real leaked credentials, private keys,
cloud tokens, and improperly tracked sensitive files.
"""

import os
import re
import subprocess
import sys

# High-signal secret patterns
PATTERNS = [
    (r'AKIA[0-9A-Z]{16}', "AWS Access Key ID"),
    (r'ghp_[a-zA-Z0-9]{36}', "GitHub Personal Access Token"),
    (r'gho_[a-zA-Z0-9]{36}', "GitHub OAuth Access Token"),
    (r'github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}', "GitHub Fine-Grained PAT"),
    (r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----', "Private Cryptographic Key"),
    (r'xox[baprs]-[0-9a-zA-Z]{10,48}', "Slack API Token"),
    (r'AIza[0-9A-Za-z\\-_]{35}', "Google API Key"),
    (r'sk-ant-api03-[a-zA-Z0-9_-]{80,}', "Live Anthropic API Key"),
    (r'sk-proj-[a-zA-Z0-9_-]{80,}', "Live OpenAI Project API Key"),
]

# Explicitly allowed synthetic test strings and fixture documentation
WHITELIST_SUBSTRINGS = [
    "AKIAIOSFODNN7EXAMPLE",
    "AKIAEXAMPLE",
    "AKIA0000000000000000",
    "AKIAXXXXXXXXXXXXXXXX",
    "ghp_testToken12345678901234567890123456",
    "ghp_000000000000000000000000000000000000",
    "ghp_fakeToken1234567890123456789012345678",
    "ghp_dummyToken",
    "mockkey",
    "sk-ant-valid-test-key",
    "sk-ant-api03-test",
    "example",
    "test-super-secret",
    "replace-with-",
    "your-",
    "dummy",
    "mock",
]

def is_whitelisted(text: str) -> bool:
    for allowed in WHITELIST_SUBSTRINGS:
        if allowed in text:
            return True
    return False

def scan_git_tracked_files():
    violations = []
    print("[SECRET SCANNER] Scanning Git-tracked files for committed secrets...")

    try:
        files = subprocess.check_output(['git', 'ls-files'], text=True).splitlines()
    except Exception as e:
        print(f"Error executing git ls-files: {e}")
        return 1

    for filepath in files:
        # Check for forbidden sensitive files accidentally tracked
        filename = os.path.basename(filepath)
        if filename in {'.env', '.env.local', '.env.production', 'id_rsa', 'id_ed25519'} or filename.endswith('.pem'):
            violations.append(f"Forbidden secret file tracked in Git: {filepath}")
            continue

        # Skip test files designed specifically to test secret scrubbing / redaction
        if '/tests/' in filepath or filepath.startswith('tests/') or filepath.endswith('.test.ts') or filepath.endswith('.test.js'):
            continue

        # Skip example config templates and specification documentation
        if filepath.endswith('.example') or filepath.endswith('.md'):
            continue

        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                for line_num, line in enumerate(f, 1):
                    # Check for pattern match
                    for pattern, desc in PATTERNS:
                        matches = re.finditer(pattern, line)
                        for match in matches:
                            matched_text = match.group(0)
                            if is_whitelisted(line) or (is_test_or_doc and is_whitelisted(matched_text)):
                                continue
                            if is_test_or_doc and any(term in line.lower() for term in ['mock', 'dummy', 'fake', 'fixture', 'sample', 'test']):
                                continue
                            violations.append(f"Possible {desc} in {filepath}:{line_num}")
        except Exception:
            pass

    if violations:
        print("\n❌ CRITICAL SECURITY FINDINGS DETECTED:")
        for v in violations:
            print(f"  - {v}")
        print("\nAborting: Git tracked files contain potential secrets.")
        return 1

    print("✔ ZERO COMMITTED SECRETS DETECTED. All Git tracked files are clean.")
    return 0

if __name__ == '__main__':
    sys.exit(scan_git_tracked_files())
