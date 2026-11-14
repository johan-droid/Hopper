# Hopper: Free-Tier Capabilities & Cost Governance

*Verification Date: 2026-11-07*  
*Role: Vercel Deployment & AI Systems Engineer*

---

## 1. Free-Tier Resource Inventory

| Service | Plan / Tier | Verified Capabilities & Quotas | Boundaries & Constraints |
|---|---|---|---|
| **Vercel** | Hobby (Free) | • Free edge/web hosting<br>• Node.js Serverless Functions (up to 60s max execution)<br>• 1024 MB function RAM<br>• Custom domains & automatic TLS | • Non-commercial personal evaluation use only<br>• Vercel Queues are non-standard on Hobby; PostgreSQL outbox acts as the durable queue |
| **Supabase** | Free Tier | • 500 MB PostgreSQL database<br>• 50,000 Monthly Active Users (Auth)<br>• Row Level Security (RLS)<br>• 5 GB egress/month | • Projects pause after 7 days of inactivity (can be unpaused via dashboard)<br>• Connection limits managed via connection pooling |
| **GitHub** | Free Developer | • Unlimited public repo GitHub Actions<br>• 2,000 private repo Actions minutes/month<br>• GitHub OAuth & GitHub Apps (zero cost)<br>• Webhook ingress | • Rate limit: 5,000 requests/hour for authenticated API tokens |
| **Groq Cloud** | Free Developer Tier | • High-speed LPU inference across open-weights models (GPT-OSS, Qwen, Minimax)<br>• Official OpenAI-compatible endpoint (`api.groq.com`)<br>• Zero-cost API token usage within free rate limits | • Rate limit: 30 requests/minute on standard free tier; circuit breaker handles 429 failover |
| **NVIDIA NIM** | API Catalog (Free Eval) | • Evaluation endpoints across leading models (Nemotron 3, Llama 3.3, Qwen)<br>• Official OpenAI-compatible endpoint (`integrate.api.nvidia.com`) | • Evaluation-tier capacity under NVIDIA Developer Program terms (not guaranteed SLA); failover behind Groq |
| **React Bits** | Open-Source | • Free UI components and animations (MIT License) | • No Pro registry, paid agent kits, or license-key dependencies |

---

## 2. Cost Control Guarantees

1. **Zero Paid Dependencies**: Direct Anthropic/OpenAI API keys are completely optional and disabled by default.
2. **Zero Involuntary Billing**: Stripe checkout in development returns demo tiers; no automatic credit card charging or plan upgrade is forced on developers.
3. **Fail-Closed Budgeting**: In `backend/src/lib/billing/quota-guard.ts` and `ai-budget-controller.ts`, admission caps and nominal reservations strictly prevent unbounded spend.

---

## 3. Deployment Pre-Flight Checklist

Before deploying Hopper live to Vercel and Supabase:

- [ ] Create a GitHub OAuth App with:
  - Homepage URL: `https://<your-vercel-domain>.vercel.app`
  - Authorization callback URL: `https://<your-vercel-domain>.vercel.app/login/callback`
- [ ] In Vercel Project Settings, configure:
  - `GITHUB_CLIENT_ID`
  - `GITHUB_CLIENT_SECRET`
  - `JWT_SECRET` (at least 32 characters)
  - `DATABASE_URL` (Supabase connection pooler URL: transaction mode, port 6543)
  - `GITHUB_APP_WEBHOOK_SECRET`
  - `GITHUB_APP_ID`
  - `GITHUB_APP_PRIVATE_KEY`
- [ ] In Supabase SQL Editor:
  - Run `backend/supabase/migrations/0001_initial_schema.sql` through `0010_durable_queue_and_coordination.sql`.

