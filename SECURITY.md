# Security Policy & Vulnerability Disclosure

## 1. Security Philosophy & Architectural Guarantees

Hopper is built on zero-trust principles for developer tool security:
1. **Passive-Only Execution:** Hopper never executes arbitrary code, never mounts user repository disks, and never commits mutations to user repositories.
2. **PostgreSQL Kernel-Level Isolation:** All data access is mediated by PostgreSQL Row Level Security (`FORCE ROW LEVEL SECURITY`) through an unprivileged runtime role (`hopper_app`).
3. **Secret Scrubbing:** Raw CI logs are scrubbed for API keys, AWS credentials, GitHub tokens, and private keys prior to persistence or LLM synthesis.
4. **Hard Financial Ceilings:** The AI budget controller enforces a strict $500.00 USD monthly hard cap with pre-flight reservation locks to eliminate financial denial-of-wallet vectors.

---

## 2. Supported Versions

| Version / Branch | Supported | Security Patches |
|---|---|---|
| `main` (Release Candidate) | :white_check_mark: | Immediate priority |
| `< 1.0.0` (Pre-release) | :x: | Unsupported |

---

## 3. Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a potential vulnerability in Hopper (e.g., cross-tenant data access, secret scrubber bypass, authentication flaw, or IDOR):

1. **GitHub Private Vulnerability Reporting:**
   Use GitHub's built-in private reporting feature:
   Navigate to the repository > **Security** tab > **Advisories** > **Report a vulnerability**.

2. **Email Security Contact:**
   Send an encrypted or detailed report to: `security@hopper.dev` (or the repository owner `@johan-droid` on GitHub).

### What to Include
- Detailed description of the vulnerability.
- Proof-of-concept steps or copy-pasteable cURL / script commands.
- Affected components (e.g. Ingress, RLS policy, Edge gateway).
- Potential impact assessment.

### Response SLA
- **Initial Acknowledgment:** Within 24 hours.
- **Triage & Reproduction:** Within 48 hours.
- **Patch Deployment & Advisory Release:** Within 7 calendar days.
